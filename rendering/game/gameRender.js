import * as THREE from "three"
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { ParsingManager } from "../../network/Parsing Manager/parsingManager"
import { Player } from "./playerManager/playerManager"

import { Ship } from "./gameplayRendering/shipManager"
let parsingManager = new ParsingManager()
let players = []

//three
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({canvas : document.querySelector("#canvasGame")})
renderer.setSize(window.innerWidth, window.innerHeight)

let playerShipId
// const orbitControl = new OrbitControls(camera, renderer.domElement)
const ambientLight = new THREE.AmbientLight(0xfffffff)
scene.add(ambientLight)
const grid = new THREE.GridHelper(800,200)
scene.add(grid)

camera.position.y = 20
camera.rotation.x = - Math.PI/2

window.addEventListener("resize", () =>
{
    renderer.setSize(window.innerWidth, window.innerHeight)

    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
})

function render()
{
    window.requestAnimationFrame(render)
    renderer.render(scene, camera)
    // orbitControl.update()
}



export function initGameRenderer()
{
    render()
}

export function onServerMessage(message)
{
    const array = Array.from(new Uint8Array(message.data))
    if(array[0] === 0)
    {
        const shipData = parsingManager.parsePlayer0(message.data)
        if(shipData.shipId !== playerShipId)
        {
            console.log(shipData)
        }
        playerStatus(shipData)
    }
    if(array[0] === 67)
    {
        playerShipId = array[1]
    }
}

async function playerStatus(data)
{
    let newPlayer = true
    let player
    for(const aPlayer of players)
    {
        if(aPlayer.shipId === data.shipId)
        {
            player = aPlayer
            newPlayer = false
        }
    }
    if(newPlayer)
    {
        const ship = new Ship(scene, 
            {
                shipId : data.shipId,
                hue : data.hue
            }
        )
        await ship.spawn()
        if(data.shipId === playerShipId)
        {
            ship.mesh.add(camera)
        }
        player = new Player(data.shipId, ship)
        players.push(player)
    }
    else
    {
        player.ship.updatePosition(data.x, data.y)
        player.ship.updateRotation(data.angle)
    }
}