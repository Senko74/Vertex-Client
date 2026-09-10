import * as THREE from "three"

export class Stars
{
    constructor(scene, number)
    {
        this.scene = scene
        this.number = number
    }

    async spawn()
    {
        const loader = new THREE.TextureLoader()
        const texture = await loader.loadAsync("../assets/T_Stars2.png")
        this.verticles = []
        for(let i = 0; i < this.number; i++)
        {
            const x = THREE.MathUtils.randFloatSpread(100)
            const y = THREE.MathUtils.randFloatSpread(100)
            const z = THREE.MathUtils.randFloatSpread(100)
            this.verticles.push(x,y,z)
        }
        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.verticles, 3))
        this.material = new THREE.PointsMaterial(
            {
                color: 0xffffff,
                size: 0.4,
                sizeAttenuation: true,
                map : texture
            }
        )
        this.points = new THREE.Points(this.geometry, this.material)
        this.scene.add(this.points)
    }
}