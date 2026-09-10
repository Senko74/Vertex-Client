import * as THREE from "three"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Stars } from "./stars"

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({canvas : document.querySelector("#canvas")})
renderer.setSize(window.innerWidth, window.innerHeight)

camera.position.set(0,3,1)
camera.rotation.x = - Math.PI/2

const light = new THREE.PointLight(0xffffff, 5)
light.position.set(0,3,-1)
scene.add(light)

window.addEventListener("resize", () =>
{
    renderer.setSize(window.innerWidth, window.innerHeight)
})

let meshs = []
let shipMesh
let stars

export async function init()
{
    const loader = new GLTFLoader()
    const glb = await loader.loadAsync("../assets/Fly.glb")
    shipMesh = glb.scene
    shipMesh.rotation.y = -Math.PI/2
    shipMesh.scale.set(0.8, 0.8, 0.8)
    shipMesh.position.z = -0.3
    scene.add(shipMesh)
    for(const mesh of shipMesh.children)
    {
        mesh.material = new THREE.MeshLambertMaterial(
        {
            color : 0xff0000
        })
        meshs.push(mesh)
    }
    render()
    buildBackground()

}

function buildBackground()
{
    stars = new Stars(scene, 1000)
    stars.spawn()
    light.lookAt(shipMesh.position)
}

const clock = new THREE.Clock()
function render()
{
    window.requestAnimationFrame(render)
    renderer.render(scene, camera)
    const delta = clock.getDelta()
    const rotationSpeed = 0.6 //Seconds
    // shipMesh.rotation.x += rotationSpeed*delta
    
}

export function changeChipColor(hue)
{

    for(const mesh of meshs)
    {
        if(mesh.material)
        {
            mesh.material.color.setHSL(hue/360, 1, 0.5)
        }
    
    }
 
}
