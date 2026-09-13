import * as THREE from "three"
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export class Ship
{
    constructor(scene, info)
    {
        this.scene = scene
        this.hue = info.hue
        this.shipId = info.id
    }

    async spawn()
    {
        const loader = new GLTFLoader()
        this.glb = await loader.loadAsync("../../../assets/Fly.glb")
        this.mesh = this.glb.scene
        this.mesh.scale.set(4,4,4)
        this.scene.add(this.mesh)
        
    }

    updatePosition(x,y)
    {
        this.mesh.position.x = x
        this.mesh.position.z = -y
    }

    updateRotation(angle)
    {
        console.log(angle, -angle)
        this.mesh.rotation.y = -angle + Math.PI*2
    }

}