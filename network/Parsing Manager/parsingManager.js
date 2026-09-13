
export class ParsingManager
{
    constructor()
    {

    }


    /* Type `111` — Asteroid status
    offset 0:  uint8   type = 111
    offset 1:  uint8   size / model_size
    offset 2:  uint16  id
    offset 4:  uint32  tick            
    offset 8:  float32 x
    offset 12: float32 y
    offset 16: float32 vx
    offset 20: float32 vy*/


    parseAsteroids111(bytes)
    {
        const view = new DataView(bytes)
        const data = 
        {
            packageType : view.getUint8(0),
            size : view.getUint8(1),
            id : view.getUint16(2),
            x : view.getFloat32(8),
            y : view.getFloat32(12)
        }
    }

    /*
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
| 48 | uint32 | `score` | Player score. | */

    parsePlayer0(bytes)
    {
        const view = new DataView(bytes)
        const data = 
        {
            shipId : view.getUint8(1),
            hue : view.getUint8(3),
            x : view.getFloat32(16, true),
            y : view.getFloat32(20, true),
            angle : view.getFloat32(32, true)
        }
        return data
    }
}