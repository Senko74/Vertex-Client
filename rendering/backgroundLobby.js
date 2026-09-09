import * as THREE from "three"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({canvas : document.querySelector("#canvas")})
renderer.setSize(window.innerWidth, window.innerHeight)

camera.position.set(0,3,1)
camera.rotation.x = - Math.PI/2

const light = new THREE.PointLight(0xffffff, 5)
light.position.y = 2
scene.add(light)

window.addEventListener("resize", () =>
{
    renderer.setSize(window.innerWidth, window.innerHeight)
})

let meshs = []
let mesh

export async function init()
{
    const loader = new GLTFLoader()
    const glb = await loader.loadAsync("../assets/Fly.glb")
    mesh = glb.scene
    mesh.rotation.y = -Math.PI/2
    mesh.scale.set(0.8, 0.8, 0.8)
    mesh.position.z = -0.3
    scene.add(mesh)
    for(mesh of mesh.children)
    {
        mesh.material = new THREE.MeshLambertMaterial(
        {
            color : 0xff0000
        })
        meshs.push(mesh)
                    console.log(mesh)
    }

    render()
}

function render()
{
    window.requestAnimationFrame(render)
    renderer.render(scene, camera)
}

export function changeChipColor(hue)
{

    for(mesh of meshs)
    {
        if(mesh.material)
        {
            mesh.material.color.setHSL(hue/360, 1, 0.5)
        }
    
    }
 
}
