const DEFAULT_SOURCE = "./sbCode.html"

class SeededRandom
{
    constructor(seed)
    {
        this.seed = seed == null ? Math.random() : seed
        if(this.seed < 1)
        {
            this.seed *= 1 << 30
        }
        this.a = 13971
        this.b = 12345
        this.size = 1 << 30
        this.mask = this.size - 1
        this.inverse = 1 / this.size
        this.advance()
        this.advance()
        this.advance()
    }

    next()
    {
        this.seed = this.seed * this.a + this.b & this.mask
        return this.seed * this.inverse
    }

    integer(max)
    {
        return Math.floor(this.next() * max)
    }

    advance()
    {
        this.seed = this.seed * this.a + this.b & this.mask
    }
}

class ValueNoise
{
    constructor(seed, table)
    {
        this.table = table.concat(table)
        this.mask = 1023
        this.normalize = 1 / 1023
        this.xOffset = seed & this.mask
        this.yOffset = seed >> 10 & this.mask
        this.zOffset = seed >> 20 & this.mask
        this.rotationCos = Math.cos(0.3)
        this.rotationSin = Math.sin(0.3)
    }

    smooth(first, second, amount)
    {
        const curve = (-2 * amount + 3) * amount * amount
        return first * (1 - curve) + second * curve
    }

    noise2d(x, y)
    {
        const floorX = Math.floor(x)
        const floorY = Math.floor(y)
        const fractionX = x - floorX
        const fractionY = y - floorY
        const wrappedX = floorX & this.mask
        const wrappedY = floorY & this.mask
        const topLeft = this.table[this.xOffset + this.table[wrappedX + this.table[wrappedY + this.yOffset]]]
        const topRight = this.table[this.xOffset + this.table[wrappedX + 1 + this.table[wrappedY + this.yOffset]]]
        const bottomLeft = this.table[this.xOffset + this.table[wrappedX + this.table[wrappedY + 1 + this.yOffset]]]
        const bottomRight = this.table[this.xOffset + this.table[wrappedX + 1 + this.table[wrappedY + 1 + this.yOffset]]]
        return this.smooth(
            this.smooth(topLeft, topRight, fractionX),
            this.smooth(bottomLeft, bottomRight, fractionX),
            fractionY
        ) * this.normalize
    }

    fractal2d(x, y, octaves = 5, persistence = 0.5, frequency = 1.9)
    {
        let value = 0
        let amplitude = 1
        let amplitudeTotal = 0
        for(let octave = 1; octave <= octaves; octave++)
        {
            value += this.noise2d(x, y) * amplitude
            amplitudeTotal += amplitude
            amplitude *= persistence
            const rotatedX = frequency * (x * this.rotationCos + y * this.rotationSin)
            const rotatedY = frequency * (y * this.rotationCos - x * this.rotationSin)
            x = rotatedX
            y = rotatedY
        }
        return value / amplitudeTotal
    }

    periodic2d(x, y, period, octaves = 5, persistence = 0.5, frequency = 1.9)
    {
        const cellX = Math.floor(x / period)
        const cellY = Math.floor(y / period)
        const fractionX = x / period - cellX
        const fractionY = y / period - cellY
        const topLeft = this.fractal2d(fractionX * period, fractionY * period, octaves, persistence, frequency)
        const topRight = this.fractal2d(fractionX * period + period, fractionY * period, octaves, persistence, frequency)
        const bottomLeft = this.fractal2d(fractionX * period, fractionY * period + period, octaves, persistence, frequency)
        const bottomRight = this.fractal2d(fractionX * period + period, fractionY * period + period, octaves, persistence, frequency)
        return this.smooth(
            this.smooth(topLeft, topRight, 1 - fractionX),
            this.smooth(bottomLeft, bottomRight, 1 - fractionX),
            1 - fractionY
        )
    }
}

function extractPermutation(source)
{
    const match = source.match(/this\.table = \[([\s\S]*?)\]/)
    if(!match)
    {
        throw new Error("La table de permutation Starblast est introuvable")
    }
    const table = match[1].split(",").map(Number)
    if(table.length !== 1024 || table.some(Number.isNaN))
    {
        throw new Error("La table de permutation Starblast est invalide")
    }
    return table
}

async function loadPermutation(sourcePath = DEFAULT_SOURCE)
{
    const response = await fetch(sourcePath)
    if(!response.ok)
    {
        throw new Error(`Impossible de charger ${sourcePath}: ${response.status}`)
    }
    return extractPermutation(await response.text())
}

export async function generateAsteroids(seed, mapSize, options = {})
{
    if(!Number.isFinite(seed) || !Number.isInteger(mapSize) || mapSize <= 0)
    {
        throw new TypeError("seed doit être un nombre et mapSize un entier positif")
    }

    const table = options.table || await loadPermutation(options.sourcePath)
    const random = new SeededRandom(seed)
    const size = mapSize
    const worldCells = 2 * size
    const coordinateA = 1e5 * random.next()
    const coordinateB = 1e5 * random.next()
    random.next()
    random.next()
    const noiseSize = 1 + random.integer(8)
    random.next()
    random.next()
    const frequency = (2 + 8 * random.next()) / (2 * size)
    const secondFrequency = (2 + 8 * random.next()) / (2 * size)
    const densityPower = 5
    const densityNoiseWeight = 0.5
    const sizeVariation = 0.5
    const noise = new ValueNoise(random.next(), table)
    const asteroids = []
    const densityModifier = options.densityModifier || (() => 1)
    const multiplier = 13971
    const increment = 12345
    const modulusMask = (1 << 30) - 1
    const inverseModulus = 1 / (1 << 30)

    for(let cellX = 0; cellX < worldCells; cellX++)
    {
        for(let cellY = 0; cellY < worldCells; cellY++)
        {
            const x = cellX - size
            const y = cellY - size
            let localRandom = x * coordinateA + y * coordinateB
            localRandom = multiplier * localRandom + increment & modulusMask
            localRandom = multiplier * localRandom + increment & modulusMask
            localRandom = multiplier * localRandom + increment & modulusMask
            const distance = Math.sqrt((x * x + y * y) / (size * size))
            const radialDensity = distance > 1 ? 0.5 : 0.5 * Math.pow(distance, densityPower)
            let density = radialDensity * densityNoiseWeight
                + (1 - densityNoiseWeight) * (noise.periodic2d((x + size) * frequency, (y + size) * secondFrequency, noiseSize, 3) - 0.5)
            density = Math.max(4 / worldCells, density)
            density *= densityModifier(2 * x / worldCells, 2 * y / worldCells)

            localRandom = multiplier * localRandom + increment & modulusMask
            if(localRandom * inverseModulus < density)
            {
                localRandom = multiplier * localRandom + increment & modulusMask
                const asteroidSize = (0.1 + sizeVariation * localRandom * inverseModulus)
                localRandom = multiplier * localRandom + increment & modulusMask
                const positionX = localRandom * inverseModulus
                localRandom = multiplier * localRandom + increment & modulusMask
                const positionY = localRandom * inverseModulus
                asteroids.push({
                    x: x + asteroidSize + warp(positionX) * (1 - 2 * asteroidSize),
                    y: y + asteroidSize + warp(positionY) * (1 - 2 * asteroidSize),
                    size: asteroidSize
                })
            }
        }
    }
    return asteroids
}

function warp(value)
{
    return value > 0.5
        ? 0.5 * Math.pow(2 * (value - 0.5), 0.1) + 0.5
        : 0.5 - 0.5 * Math.pow(2 * (0.5 - value), 0.1)
}

export { extractPermutation, loadPermutation }
