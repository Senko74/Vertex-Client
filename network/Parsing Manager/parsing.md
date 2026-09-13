# Starblast.io Client — Networking Protocol Analysis

This document analyzes every network path used by the client in `src/js/`: lobby/server-discovery HTTP calls,
the game WebSocket's JSON control messages, and the game WebSocket's **binary packet protocol** (the bulk of
real-time gameplay traffic). All binary packets are read with a `DataView` in **little-endian** (`true` passed
as the third arg to every `get*` call) unless noted otherwise.

Source of truth: `src/js/network/*.js`, `src/js/core/ShipStatus.js`, `src/js/game/entities/*.js`.

---

## 1. Connection lifecycle

1. **Server discovery** — `ServerList` (public matchmaking) or `PrivateServerFinder` (private/modding servers)
   issues `GET https://starblast.io/simstatus.json` (plain HTTP, JSON body: array of server descriptors with
   `address`, `location`, `systems[]`, `usage.cpu`, `modding`, etc.). No auth.
2. **Region ping** — `ServerRegion.ping()` opens a throwaway `RoomEntry` WebSocket to a candidate server, sends
   the **text** message `"ping"` on `onopen`, and measures RTT until it receives the **text** message `"pong"`.
   This connection is only used for latency measurement, then discarded.
3. **Server selection** — `ServerRegion.findBestServer()` picks a server via the current game mode's own logic
   (`mode.findBestServer`) or a weighted-random pick across open systems matching mode/mod/time constraints, and
   is deterministic-hash-based (`serverHash`) as a fallback tiebreaker so all clients converge on the same empty
   server.
4. **Real connection** — `WSS.create(address)` opens `ws://localhost:3000/?target=<encodeURIComponent(address)>`.
   All real traffic is proxied through a local Node reverse proxy on port 3000 (comment in `WSS.js`: game servers
   only accept handshakes from the original site origin, so the proxy rewrites the `Origin`/target to bypass that
   check).
5. **Handshake** — on `socket.onopen`, the client immediately sends a JSON `MSG_CREATE_OBJECT` message (see §2)
   describing the desired mode/ship/player. The server replies with `welcome` (JSON), and later `entered` once a
   ship is actually spawned.
6. **Keepalive** — client sends the raw text `"ping"` periodically (driven by `LobbyController.ping()`, called
   from the game loop); the server replies with raw text `"pong"`. Used to compute `game.ping` (smoothed RTT) and,
   opportunistically, to validate ping using the `sendStatus` masked-status echo (`statusPingCheck`).
7. **Teardown** — `socket.onclose` → `onConnectionLost()`. If the client had already been `accepted` into a game,
   this triggers `game.onConnectionLost()`; otherwise `game.refused()` (handshake never completed).

All gameplay traffic after the handshake is one WebSocket, multiplexing:
- **Text frames** — JSON `{name, data}` envelopes, plus the two bare strings `"ping"`/`"pong"`.
- **Binary frames** — dense binary packets, first byte = packet **type** id (see §4). May arrive as a `Blob`
  (browser) or `ArrayBuffer`/typed-array-like object with `.arrayBuffer()` (worker/other), both are normalized to
  an `ArrayBuffer` before dispatch (`LobbyController.onBinaryMessage`).

---

## 2. JSON messages (client → server)

All sent via `this.socket.send(JSON.stringify({ name, data }))` on the game socket. `name` is a string; two of
them are obfuscated identifiers on the server side, defined as constants in `data/GameConfig.js`:

| Constant | Wire value |
|---|---|
| `MSG_CREATE_OBJECT` | `"ojct:4"` |
| `MSG_SET_TYPE` | `"afhy!rru"` |
| `MSG_UNKNOWN` | `"1gjk3"` |
| `MSG_SELECT_SHIP` | `"UF10l"` |

| `name` sent | Trigger / method | `data` payload |
|---|---|---|
| `MSG_CREATE_OBJECT` (`"ojct:4"`) | socket `onopen` — join request | `{ mode, mod_id, spectate, spectate_ship, player_name, hue, preferred, bonus, ecp_key, steamid, ecp_custom, create, client_ship_id, client_tr }` — full join descriptor. `ecp_key`/`ecp_custom` are the player's cosmetics/verification key (or `null` if running as the Steam app, which sends `steamid` instead). `client_ship_id`/`client_tr` = client-remembered ship selection + throttle ratio. |
| `"enter"` | `LobbyController.enter(opts)` — request to actually spawn a ship in the arena | `opts` (caller-supplied) plus forced `spectate: game.mode.spectate` |
| `"respawn"` | `LobbyController.respawn(callback)` | *(none)* |
| `"say"` | `LobbyController.say(text)` — chat | raw text string |
| `"get_name"` | `LobbyController.requestPlayerName(id)` — resolve a ship id's player name | `{ id }` |
| `"ship_type"` | `LobbyController.pushType(type)` | `type` (ship type code) |
| `"upgrade_spec"` | `LobbyController.upgradeSpec(spec)` | `spec` |
| `MSG_SELECT_SHIP` (`"UF10l"`) | `LobbyController.selectShip(ship)` | `ship` |
| `"buy_life"` | `LobbyController.buyLife()` | *(none)* |
| `"modemsg"` | `LobbyController.sendModeMessage(msg)` — generic game-mode-specific message channel | `msg` (mode-defined shape) |
| `"start_transfer"` | `LobbyController.startTransfer()` | *(none)* |
| `"end_transfer"` | `LobbyController.endTransfer()` | *(none)* |
| `MSG_SET_TYPE` (`"afhy!rru"`) | `LobbyController.buyWeapon(type)` | `{ type }` |
| `"remove_weapon"` | `LobbyController.removeWeapon(index)` | `{ index }` |
| `MSG_UNKNOWN` (`"1gjk3"`) | `LobbyController.activateWeapon(index, type)` — activate/toggle a mounted weapon | `{ index, type }` |
| `"toggle_healing"` | `LobbyController.toggleHealing()` | *(none)* |

**Non-JSON text**: `"ping"` (raw string, keepalive/RTT probe, see §1).

**Non-JSON binary**: the player's live control state is sent as a **plain number coerced to a string** via
`this.socket.send(status)` in `LobbyController.sendStatus(status)` (called from `GameInput.tick()`), *not* wrapped
in JSON and *not* a binary ArrayBuffer. `status` (called `flags` at the call site) is a bitfield built as:

```
flags = ((controls.angle + 360) % 360)      // base: aim angle in degrees, 0-359
      + (up             ? 4096   : 0)        // thrust forward
      + (alive           ? 8192   : 0)        // ship considered alive/active
      + (glide           ? 16384  : 0)        // gliding (drift/no-turn-assist) toggle
      + (strafe_left     ? 32768  : 0)
      + (strafe_right    ? 65536  : 0)
      + (release_crystal ? 131072 : 0)        // drop-crystal action
```

`sendStatus` also keeps a `last_status_sent = status & 20991` mask for its own ping-measurement trick
(`statusPingCheck`, correlated against the `up`/`gliding` bits echoed back in packet type 0 below).

---

## 3. JSON messages (server → client)

Dispatched in `LobbyController.socket.onmessage`: any text frame that isn't `"pong"` is `JSON.parse`d; if it has
a `name` field it's routed by a `switch`:

| `name` | Handler | `data` shape / meaning |
|---|---|---|
| `welcome` | `startMode(msg.data)` | Full game/room bootstrap: `version` (rejects + forces reload if server > client `GameConfig.VERSION`), `mode` (`{id, ...options}`, passed to `game.setMode`/`mode.setOptions`), `seed` (world RNG seed — also re-derives `system_hue = 120 + rng.nextInt(240)` client-side via `SeededRandom`), `size` (world size). Sets `this.accepted = true` and `this.join_time = Date.now()`. |
| `cannot_join` | `cannotJoin()` → `game.cannotJoin()` | *(none inspected)* — server refused the join request (e.g. room full/closed). |
| `entered` | `entered(msg.data)` | `{ shipid, ... }` — assigns `game.player.status.id = data.shipid`, then `game.entered(data)` to actually materialize the player's ship. |
| `player_name` | `onPlayerName(msg)` | `{ id, player_name, ... }` — resolves a previously-requested (`get_name`) ship id to a display name via `game.names.set`. |
| `ecp_verified` | `ECPVerified(msg)` | `{ key, valid, custom }` — server-side verification result for the player's ECP (cosmetics/progression) key; on success applies `custom.finish` to the player's ship model. |
| `modemsg` | `modeMsg(msg)` → `game.mode.messageReceived(msg.data)` | Mode-defined — generic game-mode message channel (paired with client's `"modemsg"` send). |
| `error` | `error(msg)` | `{ id, data }` — `id === 'SteamAppOwnerShip'` is special-cased (ends the game, shows an ownership error); otherwise `data` is an i18n key/string shown via `lobby.showError`. |

**Non-JSON text**: `"pong"` (raw string reply to the client's `"ping"` keepalive).

---

## 4. Binary packets (server → client)

All binary frames go through `LobbyController.onBinaryMessage(buf)`. Byte 0 of every packet is a `Uint8` **type**
id, switched on to route to a handler. All multi-byte numeric fields are **little-endian** (`DataView.get*(offset, true)`).
Coordinates (`x`, `y`, `vx`, `vy`) are world-space floats in game units; angles are radians unless stated as degrees.

### Packet framing note — type 255 (batch/multiplex wrapper)

Type `255` is not gameplay data — it's a **container** that packs several other binary packets into one frame to
save WebSocket overhead:

```
offset 0:            uint8   type = 255
offset 1..N:          repeated: [ uint8 packetLen, packetLen bytes of a normal packet (recursively dispatched) ]
```
Loop: read `len = getUint8(offset)`, copy the next `len` bytes into a fresh `ArrayBuffer`, recursively call
`onBinaryMessage` on it, advance `offset` by `1 + len`, repeat until the frame is exhausted.

---

### Type `0` — Ship status update (per-ship physics/state snapshot)

The single highest-frequency packet — one of these is sent for the local player and for every visible ship,
every tick they update. Total packet length: **46 bytes** (header + `ShipStatus.read` body).

Routing: `handlePlayerStatus(buf)` in `LobbyController.js` reads the *outer* header, decides if this is the local
player (fast path with respawn/kill/ping bookkeeping) or another ship (`GameState.handleShipStatus` → `addShip`
on first sight, else `updateEntity`); the *inner* 46-byte struct is parsed by `ShipStatus.read(buf)`
(`src/js/core/ShipStatus.js`).

| Offset | Type | Field | Notes |
|---|---|---|---|
| 0 | uint8 | packet type | `0` |
| 1 | uint8 | `shipId` | Ship this snapshot belongs to. |
| 2 | uint8 | `flags` (movement/state bitfield) | See bit table below. |
| 3 | uint8 | `hue256` | Hull hue, 0-255 → `hue = floor(360 * hue256 / 256)` degrees. |
| 4 | uint32 | `serverTick` | Also used by `LobbyController` to call `state.syncServerTime(serverTick)` (clock sync) *before* the entity update. Same value is re-read at offset 8 as `lastTick` inside `ShipStatus.read`. |
| 8 | uint32 | `lastTick` | Tick this snapshot was generated (used for interpolation/replay — `ShipStatus.lastTick`). |
| 12 | uint16 | `angle` | Raw aim-angle value (degrees, matches the client's `sendStatus` encoding — not normalized in `read`). |
| 14 | uint16 | `typeFlags` (ship-type/state bitfield) | See bit table below. |
| 16 | float32 | `x` | World X position. |
| 20 | float32 | `y` | World Y position. |
| 24 | float32 | `vx` | Velocity X *(was named `team` pre-rename — confirmed a float velocity, not a team index)*. |
| 28 | float32 | `vy` | Velocity Y *(was named `teamHue`)*. |
| 32 | float32 | `r` | Ship body rotation (radians). |
| 36 | float32 | `angularVelocity` | Rotation rate. |
| 40 | uint8 | `stun` | Stun/disable timer. |
| 41 | uint8 | `rank` | Leaderboard rank (100 = unranked default). |
| 42 | uint16 | `shield` | Current shield points. |
| 44 | uint16 | `generator` | Current generator/energy points. |
| 46 | uint16 | `crystals` | Carried crystal count. |
| 48 | uint32 | `score` | Player score. |
| 52 | uint32 | `levels` | Packed upgrade-level bitfield (compared against `ShipInstance` levels cache to know when to re-derive stats). |

**`flags` byte (offset 2) bit layout:**

| Bit(s) | Mask | Field |
|---|---|---|
| 0 | `1` | `alive` |
| 1 | `2` | `up` (thrusting forward) |
| 2-4 | `7 << 2` (`flags >> 2 & 7`) | `lives` (life count, 0-7) |
| 5 | `32` | `strafe_left` |
| 6 | `64` | `strafe_right` |

**`typeFlags` uint16 (offset 14) bit layout:**

| Bit(s) | Mask | Field |
|---|---|---|
| 0-9 | `0x3FF` (`1023`) | `type` (ship type code) |
| 10 | `0x400` (`1024`) | `healing` |
| 11 | `0x800` (`2048`) | `dash` |
| 12 | `0x1000` (`4096`) | `hasECP` |
| 13 | `0x2000` (`8192`) | `guided` (e.g. mine-guided remote ship) |
| 14 | `0x4000` (`16384`) | `glide` |
| 15 | `0x8000` (`32768`) | `invulnerable` |

Server-authority replay: if the packet's tick is older than the client's current tick but recent (<30 ticks
stale), `GameState.updateEntity` re-simulates the entity forward tick-by-tick (`entity.update()`) after applying
the snapshot, to hide latency. If the packet is from the *future* relative to client tick, it's buffered as
`status.pendingData` and applied later via `checkPendingUpdate`.

`LobbyController.statusPingCheck` cross-checks this packet's `flags`/`typeFlags` bits (`up`, `gliding` re-derived
from offset-12/14 uint16 reads) against the last `sendStatus` mask to opportunistically measure ping without a
dedicated `ping` round-trip.

---

### Type `71` — Survival mode start

```
offset 0: uint8  type = 71
offset 1: uint32 survivalStart   (tick number when survival mode began)
```
Sets `state.survivalStart` and `state.survival = true`.

---

### Type `100` — Laser volley spawn

Variable length: header (8 bytes) + `N × 32` bytes, one 32-byte record per laser fired in this volley.
Routed to `GameState.laser(buf)`.

```
offset 0:  uint8  type = 100
offset 1:  uint8  shipId          (0 = special/asteroid-owned, see below)
offset 2:  uint16 ownerField      — if shipId === player.status.id: reinterpreted as the shooter's
                                     current `generator` value (uint16) and applied to the local player's
                                     status. If shipId === 0: reinterpreted as a uint16 "owner" tag (e.g. hue
                                     source) instead of a ship id.
offset 4:  uint32 spawnTick
offset 8+: N records of 32 bytes each (count = (byteLength - 8) / 32) — see LaserProjectile struct below
```

**Per-laser record (32 bytes, `LaserProjectile` constructor, relative offsets from record start):**

| Rel. offset | Type | Field |
|---|---|---|
| +0 | float32 | `x` |
| +4 | float32 | `y` |
| +8 | float32 | `z` (height/altitude for rendering) |
| +12 | float32 | `vx` |
| +16 | float32 | `vy` |
| +20 | float32 | `speed` |
| +24 | uint16 | `id` (laser id, used to correlate later hit/expire packets) |
| +26 | float32 | `angle` |
| +30 | uint8 | `type` (weapon/laser visual type, clamped 0-6; `6` = shield-bump laser) |
| +31 | uint8 | `damage` |

`duration` is derived client-side from `speed` (not transmitted): `speed < 100 ? 120 : round(-2*ln(1-63/speed)*60)` ticks.

---

### Type `101` — Laser hit (ship)

```
offset 0:  uint8   type = 101
offset 2:  uint16  laserIndex   (id, correlates to a live LaserProjectile — offset 1 is unused/padding)
offset 4:  float32 x
offset 8:  float32 y
offset 12: uint8   shipId       (ship that was hit)
```
Looks up the laser via `state.getLaser(laserIndex, x, y)` (consumes/kills it), then resolves damage/shield
outcome. If `laser.type === 6` it's a shield-bump (visual/sound only, no damage applied); otherwise compares
`shield` vs `damage` to decide shield-flash vs. explosion.

### Type `103` — Laser hit (asteroid/generic terrain — no ship id)

```
offset 0:  uint8   type = 103
offset 2:  uint16  laserIndex
offset 4:  float32 x
offset 8:  float32 y
```
Same laser lookup as 101, but always explodes with `scale = sqrt(damage/10)` — no shield logic (target isn't a
ship).

### Type `102` — Area/"big" explosion (no laser correlation)

```
offset 0: uint8   type = 102
offset 1: uint8   scaleByte      (scale = scaleByte / 60)
offset 2: float32 x
offset 6: float32 y
```
Used for large blasts (e.g. station destruction shockwaves) that aren't tied to a specific laser id.

---

### Type `110` — Map tile bonus / respawn scheduling

```
offset 0:  uint8  type = 110
offset 2:  int8   gridX
offset 3:  int8   gridY
offset 4:  uint32 respawnTick
offset 8:  uint8  shipId
offset 9:  uint8  bonusAmount
offset 10: uint32 score
```
Ties to `ShipParticles.mapTile` node grid (mining/resource nodes). If `shipId` is the local player, applies
`score` and shows a floating bonus number; always explodes/shakes camera at the node and schedules the node's
`respawn` tick.

### Type `111` — Asteroid status (create/update)

Routed to `GameState.asteroidStatus(buf)` → `MobileAsteroid`. Packet layout consumed by `MobileAsteroid` ctor/`read`:

```
offset 0:  uint8   type = 111
offset 1:  uint8   size / model_size
offset 2:  uint16  id
offset 4:  uint32  tick            (for out-of-order/pending-update handling)
offset 8:  float32 x
offset 12: float32 y
offset 16: float32 vx
offset 20: float32 vy
```
First sighting of an `id` constructs a new `MobileAsteroid`; subsequent packets update the existing one
(`receiveUpdate`), with the same future/past-tick reconciliation pattern as ship status.

### Type `112` — Asteroid explosion/removal

```
offset 0: uint8  type = 112
offset 2: uint16 asteroidId
```

---

### Type `120` — Crystal spawn (batch)

Variable length: header (5 bytes) + `N × 19` bytes.

```
offset 0: uint8  type = 120
offset 1: uint32 spawnTick
offset 5..: repeated 19-byte records:
  +0:  uint8   crystalType
  +1:  uint16  expId              (crystal/entity id)
  +3:  float32 x
  +7:  float32 y
  +11: float32 vx
  +15: float32 vy
```

### Type `121` — Crystal eaten

```
offset 0: uint8  type = 121
offset 1: uint8  shipId
offset 2: uint16 expId
```

---

### Type `130` — Station module shield hit

```
offset 0:  uint8   type = 130
offset 2:  uint16  laserIndex
offset 4:  float32 x
offset 8:  float32 y
offset 12: uint8   stationIndex
offset 13: uint8   moduleIndex
offset 14: uint8   shieldHit      (≠0 → this hit landed on the module's shield rather than its hull)
offset 15: uint16  shieldCurrent  (current shield value, for the transient hit-flash shield-bar HUD only)
offset 17: uint16  shieldMax      (max shield value for the same transient HUD — not persisted on the module)
```
`shieldCurrent`/`shieldMax` feed `StationModel.setModuleShield` → `ShieldBar.set(shield, capacity)`, a one-shot
floating indicator; the module's actual persistent shield state comes from packet `205` (below).

### Type `141` — Crystal pickup bonus popup

```
offset 0: uint8   type = 141
offset 1: uint8   crystalCount
offset 2: float32 x
offset 6: float32 y
```

### Type `147` — Team gem contribution

```
offset 0: uint8  type = 147
offset 1: uint8  shipId
offset 2: uint32 gems
```

### Type `155` — Station module destroyed

```
offset 0: uint8   type = 155
offset 1: uint8   stationIndex
offset 2: uint8   moduleIndex
offset 3: float32 x
offset 7: float32 y
```

---

### Type `150` — Ship destroyed / kill feed

```
offset 0:  uint8   type = 150
offset 1:  uint8   shipId          (victim)
offset 2:  uint8   killerId
offset 4:  uint32  bonusPoints     (only meaningful/read when the local player is the killer)
offset 8:  uint32  scoreAndFlag    — bit 31 (0x80000000) = "revenge kill" flag;
                                      low 31 bits (0x7FFFFFFF) = killer's new score
offset 12: uint8   rank            (only read when victim === local player)
```
If the victim is the local player: reads `killerId`@2 and `rank`@12, calls `killed(killerId, rank)`. Otherwise:
reads `killerId`@2 and `bonusPoints`@4; if the *local player* is the killer, also reads the packed
`scoreAndFlag`@8 (masks out the revenge-kill bit for the score, checks the bit separately for the bonus-message
timeout).

---

### Type `175` — Weapon loadout / ammo update

Variable length: header (5 bytes) + `3` bytes per equipped weapon slot. Routed to `Weapons.read(view)`.

```
offset 0: uint8  type = 175
offset 1: uint32 credits          (currency available to buy weapons)
offset 5..: repeated 3-byte records, one per weapon slot, until end of buffer:
  +0: uint8  code     (weapon type code)
  +1: uint8  ammo
  +2: uint8  delay    (ticks until `next_shot`, converted client-side to `state.tick + delay`)
```

---

### Type `180` — Pod counts / pod target

```
offset 0: uint16 shipId          — NOTE: this is a uint16 here (unlike most other packets' uint8 shipId)
offset 3: uint8  miningCount
offset 4: uint8  attackCount
offset 5: uint8  defenceCount
offset 6: uint16 targetId
offset 8: uint8  targetType       (0 = ship, 1 = alien)
```
Resolves `targetId`/`targetType` to an actual entity (`shipsById`/local player/`findAlien`) and stores it as
`pods.target`; sets the three pod-category counts on the corresponding ship's `pods`.

### Type `181` — Pod-fired projectile hit (no owning ship)

```
offset 0:  uint8   type = 181
offset 2:  uint16  laserIndex
offset 4:  float32 x
offset 8:  float32 y
offset 12: float32 extra          (extra explosion parameter, e.g. blast radius scale)
offset 16: uint8   podType        (42 = shield-type pod effect → sound-only, no explosion)
```

### Type `182` — Pod destroyed

```
offset 0:  uint8   type = 182
offset 2:  uint16  laserIndex
offset 4:  float32 x
offset 8:  float32 y
offset 12: uint16  shipId          (owning ship)
offset 14: uint8   podType
offset 15: uint8   podIndex
offset 16: float32 extra
```

### Type `184` — Collectible (non-crystal pickup, e.g. gift/pumpkin) spawn

```
offset 0:  uint8   type = 184
offset 1:  uint8   collectibleType
offset 2:  uint32  spawnTick
offset 6:  uint16  collectibleId
offset 8:  float32 x
offset 12: float32 y
offset 16: float32 vx
offset 20: float32 vy
```

### Type `183` — Collectible eaten

```
offset 0: uint8  type = 183
offset 1: uint8  shipId
offset 2: uint16 collectibleId
```

### Type `185` — Projectile status (rockets/mines create + update)

Routed to `GameState.projectileStatus(buf)`. First 6 bytes are a shared header; the rest is consumed by
`Rocket`/`Mine`'s own `read`, which differs slightly per class:

```
offset 0: uint8  type = 185
offset 1: uint8  typeid    — 10/11/12 = rocket variants → Rocket; 20/21 = mine variants → Mine
offset 2: uint16 id
offset 4: uint16 shipid    (owner)
offset 6: uint32 tick      (re-read by both Rocket.read/Mine.read at the same offset for reconciliation)
```

**`Rocket.read` body (from offset 10):**

| Offset | Type | Field |
|---|---|---|
| 10 | float32 | `x` |
| 14 | float32 | `y` |
| 18 | float32 | `vx` |
| 22 | float32 | `vy` |
| 26 | float32 | `r` |
| 30 | float32 | `target_r` |
| 34 | uint8 | `hue256` → `hue = floor(360*hue256/256)` |

**`Mine.read` body (from offset 10) — shorter, no rotation fields:**

| Offset | Type | Field |
|---|---|---|
| 10 | float32 | `x` |
| 14 | float32 | `y` |
| 18 | float32 | `vx` |
| 22 | float32 | `vy` |
| 26 | uint8 | `hue256` → `hue = floor(360*hue256/256)` |

### Type `186` — Projectile hit (generic explosion, no owner ship)

```
offset 0:  uint8   type = 186
offset 2:  uint16  laserIndex
offset 4:  float32 x
offset 8:  float32 y
```

### Type `187` — Projectile explosion/removal

```
offset 0: uint8  type = 187
offset 1: uint8  projType
offset 2: uint16 projId
```

### Type `190` — Direct damage/explosion event (station shockwave-style, no laser correlation)

```
offset 0:  uint8   type = 190
offset 1:  uint16  damage
offset 3:  float32 x
offset 7:  float32 y
offset 11: float32 angle
```

---

### Type `200` / `201` — Ship radar dots + scoreboard update

`201` is identical to `200` except it additionally flags survival mode as active (`state.survival = (type === 201)`)
and, on first occurrence, latches `state.survivalStart = state.tick`. Both feed the radar dot overlay
(`RadarWidget`/`RadarDots.update`) and the active game mode's scoreboard (`mode.updateScore`).

```
offset 0: uint8  type = 200 | 201
offset 1: uint8  shipCount
offset 2..: shipCount × 8-byte records:
  +0: uint8  shipId
  +1: int8   nx           — normalized radar X, actual = nx / 128
  +2: int8   ny           — normalized radar Y, actual = ny / 128
  +3: uint8  flags        — bit0 (mask 1) = alive; bits 5-7 (`(flags >> 5) & 7`) = shipLevel - 1
  +4: uint32 scoreModel    — low 24 bits (`0xFFFFFF &`) = score; top 8 bits (`>> 24`) = shipModel - 1
```
`LobbyController` itself also tallies `alive_ships` by summing bit0 of the `flags` byte (offset `2+8i+3`) across
all entries, used to detect a survival-mode "last ship standing" game-over.

The same buffer is then handed to `game.mode.updateScore(buf)`, which every mode delegates to its scoreboard
component (`ScorePanel`/`DMScorePanel`/`TeamBoard`/`BattleScoreboard`/`InvasionScoreboard`/`ModdingScoreboard`).
Each scoreboard just stores the raw `DataView` and re-parses the identical header+8-byte-stride layout above at
draw time (with a per-mode cap on rows rendered — 10/8/6/etc — for layout reasons only, not a protocol
difference). `TeamMode`'s `TeamBoard` additionally filters entries by matching `shipId` against locally-cached
per-player team membership (`nameData.friendly`) rather than any team field in the packet itself — team
membership for the scoreboard is **not** encoded in this packet.

If the active mode defines `updateRadar` (currently only `BattleRoyaleMode`, see packet `207`), `RadarDots.update`
skips rendering per-ship dots from this packet's list entirely and relies on packet `207` instead — but the score
parsing (`mode.updateScore`) still runs unconditionally.

### Type `205` — Team station module/state update (Team mode only)

Only `TeamMode.updateStations` implements this handler; it is Team-mode-specific. The body is a sequential,
variable-length walk (no fixed record size) — one block per team, in the client's local `teams` order (team
count/order is not itself encoded in the packet):

```
offset 0: uint8 type = 205
offset 1 (running offset), repeated once per team:
  +0: uint8   open            (team.open = raw > 0)
  +1: uint8   level           (station.setLevel(level))
  +2..+5: uint32 crystals     (station.crystals)
  +6: (1 byte skipped, not read — no crystals_max field on the wire; the client computes crystals_max
       locally from `options.crystal_capacity[level]`)
  +7.., repeated once per module in station.modules:
      uint8 raw   — 0 = module dead (`setAlive(false)`); 1-255 = alive, shield fraction = (raw-1)/254
                     (`setAlive(true)`, `setShield((raw-1)/254)`)
```

### Type `206` — Wave countdown (Invasion) / radar object list (all other modes)

Dispatch: if `game.mode.updateWave` exists (Invasion only), that's called; otherwise the base
`Mode.updateRadarObjects` runs (forwards to `RadarDots.updateAsteroidsAliens`).

**`InvasionMode.updateWave`:**
```
offset 0: uint8  type = 206
offset 1: uint8  wave
offset 2: uint32 wave_start_time   (tick)
offset 6: uint16 rockCount         (asteroid count)
offset 8: uint16 aliens            (alien count)
```
After setting those fields it forwards the *same buffer* to `RadarDots.updateAsteroidsAliens`, which reads the
count fields again at the same offsets and then a variable list starting at offset 10:

**Common asteroid/alien radar blip list (used by both Invasion via the forward-call, and every other mode via
`Mode.updateRadarObjects`):**
```
offset 6:  uint16 asteroidCount
offset 8:  uint16 alienCount
offset 10..: (asteroidCount + alienCount) × 5-byte records — first `asteroidCount` are asteroids, then
             `alienCount` are aliens, same struct for both:
  +0: uint16 id
  +2: uint8  size
  +3: int8   nx     — normalized radar X, actual = nx / 128
  +4: int8   ny     — normalized radar Y, actual = ny / 128
```

### Type `207` — Ship list for radar (Battle Royale only)

Only `BattleRoyaleMode.updateRadar` implements this; forwards straight to `RadarDots.updateShips`.
```
offset 0: uint8  type = 207
offset 1..: variable list, 3 bytes per ship, until end of buffer:
  +0: uint8 shipId
  +1: int8  nx     — normalized radar X, actual = nx / 128
  +2: int8  ny     — normalized radar Y, actual = ny / 128
```
When this handler exists for the active mode, packet `200`/`201`'s per-ship dot list is not used for rendering
dots (only for the scoreboard) — Battle Royale renders radar dots exclusively from `207`.

### Type `210` — Map tile bulk respawn schedule

```
offset 0: uint8  type = 210
offset 1: uint32 baseTick
offset 5..: (byteLength - 5) / 3 records, 3 bytes each:
  +0: int8  gx
  +1: int8  gy
  +2: uint8 respawnDelta      — actual respawnTick = baseTick + respawnDelta
```

### Type `220` — Alien status (create/update)

Routed to `GameState.alienStatus(buf)` → `Alien`. `read`/`receiveData` consume:

```
offset 0:  uint8   type = 220
offset 1:  uint8   code            (alien species/type code; only read in the ctor, not in read())
offset 2:  uint16  id
offset 4:  uint8   shield          (also re-read inside `read()` at offset 4)
offset 5:  uint8   level           (only read in the ctor)
offset 6:  uint32  tick            (used for pending/past-tick reconciliation, like ship status)
offset 10: float32 x
offset 14: float32 y
offset 18: float32 vx
offset 22: float32 vy
offset 26: float32 r
offset 30: float32 angularVelocity
offset 34: float32 target_r
offset 38: uint8   extra            — meaning depends on alien type:
                                       if `type.alive === 2`: bit0 = `dashing`; if value > 1, bits 1-7
                                       (`254 & value`) encode hue: `hue = 360 * (254 & value) / 256`
                                       else: nonzero = `fancy` (cosmetic pulse effect flag)
```

### Type `221` — Alien laser hit

```
offset 0:  uint8   type = 221
offset 2:  uint16  laserIndex
offset 4:  float32 x
offset 8:  float32 y
```

### Type `222` — Alien killed

```
offset 0: uint8  type = 222
offset 2: uint16 alienId
offset 4: uint16 killerId
offset 6: uint16 score
```

---

### Type `240` — Chat message

Variable length: header (2 bytes) + raw ASCII/Latin1 bytes (one byte per character, no length prefix — runs to
end of packet).

```
offset 0: uint8  type = 240
offset 1: uint8  senderId
offset 2..: chat text, one byte per char via String.fromCharCode (NOT UTF-8 decoded — Latin1/ASCII only)
```

### Type `250` — Player count update (server list panel / lobby stats)

```
offset 0: uint8  type = 250
offset 1: uint8  system_players    (players in this specific game/system)
offset 2: uint32 total_players     (players across the whole region/cluster)
```

### Type `255` — Batched packet container

See framing note at the top of §4.

---

## 5. Packet type quick-reference table

| Type | Name | Header size | Body | Handler |
|---|---|---|---|---|
| 0 | Ship status | 2 | fixed 44 (total 46) | `handlePlayerStatus` / `ShipStatus.read` |
| 71 | Survival start | 1 | fixed 4 | inline |
| 100 | Laser volley | 8 | N×32 | `GameState.laser` / `LaserProjectile` |
| 101 | Laser hit (ship) | 1 | fixed 12 | inline |
| 102 | Big explosion | 1 | fixed 9 | inline |
| 103 | Laser hit (terrain) | 1 | fixed 11 | inline |
| 110 | Map tile bonus | 2 | fixed 12 | inline |
| 111 | Asteroid status | 1 | fixed 23 | `GameState.asteroidStatus` / `MobileAsteroid` |
| 112 | Asteroid explosion | 2 | fixed 2 | `GameState.asteroidExplosion` |
| 120 | Crystal spawn (batch) | 5 | N×19 | inline |
| 121 | Crystal eaten | 1 | fixed 4 | inline |
| 130 | Station shield hit | 2 | fixed 17 | inline |
| 141 | Crystal bonus popup | 1 | fixed 9 | inline |
| 147 | Team gem contribution | 1 | fixed 5 | inline |
| 150 | Ship killed | 1 | fixed 12 (branch-dependent) | `killed` |
| 155 | Station module destroyed | 1 | fixed 10 | inline |
| 175 | Weapon loadout | 5 | 3×N | `Weapons.read` |
| 180 | Pod counts/target | 0 | fixed 9 | inline |
| 181 | Pod hit (no ship) | 2 | fixed 15 | inline |
| 182 | Pod destroyed | 2 | fixed 18 | inline |
| 183 | Collectible eaten | 1 | fixed 3 | inline |
| 184 | Collectible spawn | 1 | fixed 23 | inline |
| 185 | Projectile status | 1 | fixed ~24-28 | `GameState.projectileStatus` / `Rocket`/`Mine` |
| 186 | Projectile hit | 2 | fixed 8 | inline |
| 187 | Projectile explosion | 1 | fixed 3 | inline |
| 190 | Direct damage event | 1 | fixed 14 | inline |
| 200/201 | Radar dots + score | 1 | N×8 | `RadarDots.update` / `Mode.updateScore` |
| 205 | Team stations update | 1 | variable | `TeamMode.updateStations` |
| 206 | Wave/radar objects | 1 | fixed 9 + M×5 | `InvasionMode.updateWave` / `Mode.updateRadarObjects` |
| 207 | Radar ships (BR) | 1 | N×3 | `BattleRoyaleMode.updateRadar` |
| 210 | Bulk respawn schedule | 4 | N×3 | inline |
| 220 | Alien status | 1 | fixed 37 | `GameState.alienStatus` / `Alien` |
| 221 | Alien laser hit | 2 | fixed 8 | inline |
| 222 | Alien killed | 2 | fixed 6 | inline |
| 240 | Chat message | 1 | variable (1 byte/char) | inline |
| 250 | Player counts | 1 | fixed 5 | inline |
| 255 | Batch container | 1 | variable (recursive) | inline |

---

## 6. Notes / open questions for future verification

- All "inline" handlers live directly inside `LobbyController.onBinaryMessage`'s switch (`src/js/network/LobbyController.js`);
  none have been extracted to their own methods yet.
- Packet `175`'s `next_shot_time` array in `Weapons` (`[0,0,...,0]`, 13 entries) is initialized but appears
  unused by `read()` itself — worth checking other Weapons methods (fire cooldown checks) if the array's role
  needs documenting.
- Team membership for the scoreboard (`200`/`201`) and for `TeamBoard`'s filtering is **client-cached**
  (`nameData.friendly`, populated via the JSON `player_name` message), not carried in the binary packet itself —
  confirmed by reading `TeamBoard.draw`, but worth double-checking if a team-id byte is later found to be part of
  the 8-byte per-ship record that isn't yet accounted for (currently all 8 bytes are accounted for: id, nx, ny,
  flags, 4-byte score/model).
- This document reflects the **rewritten** client in `src/js/`. Per project convention (see `CLAUDE.md` /
  `rename-progress.md`), all identifiers here are the renamed, readable names; original minified names are noted
  in `// was:` comments in source where a rename occurred (e.g. `ShipStatus.vx`/`vy` were `team`/`teamHue`).