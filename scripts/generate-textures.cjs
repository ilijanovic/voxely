/**
 * Generates a pre-built HD texture pack (64x64) – organic, detailed, atmospheric.
 * Run: npm run textures  or  node scripts/generate-textures.cjs
 */

const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')
const { PNG } = require('pngjs')

const SIZE = 64
const OUT_DIR = path.join(__dirname, '..', 'public', 'textures')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function setPixel(png, x, y, r, g, b, a = 255) {
  const idx = (png.width * y + x) << 2
  png.data[idx] = Math.max(0, Math.min(255, r))
  png.data[idx + 1] = Math.max(0, Math.min(255, g))
  png.data[idx + 2] = Math.max(0, Math.min(255, b))
  png.data[idx + 3] = Math.max(0, Math.min(255, a))
}

function noise(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453
  return n - Math.floor(n)
}

function hash(x, y, seed) {
  const h = (x * 73856093) ^ (y * 19349663) ^ seed
  return ((h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
}

function smoothNoise(x, y, seed) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const a = noise(ix, iy, seed)
  const b = noise(ix + 1, iy, seed)
  const c = noise(ix, iy + 1, seed)
  const d = noise(ix + 1, iy + 1, seed)
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

function fbm(x, y, seed, octaves = 4) {
  let v = 0,
    f = 1,
    a = 1,
    sum = 0
  for (let i = 0; i < octaves; i++) {
    v += a * smoothNoise(x * f, y * f, seed + i * 10)
    sum += a
    f *= 2
    a *= 0.5
  }
  return v / sum
}

function mix(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

async function writePng(png, filename) {
  ensureDir(OUT_DIR)
  const outPath = path.join(OUT_DIR, filename)
  await pipeline(png.pack(), fs.createWriteStream(outPath))
  console.log('Written:', outPath)
}

// ---- Grass top: lush green, variation, subtle darker spots ----
function createGrassTop() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const baseR = 0x5a,
    baseG = 0x9c,
    baseB = 0x38
  const darkR = 0x48,
    darkG = 0x82,
    darkB = 0x2e
  const scale = 0.15
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x * scale, y * scale, 1)
      const m = fbm(x * scale * 2 + 5, y * scale * 2, 2)
      const v = (noise(x, y, 3) - 0.5) * 22
      const t = n * 0.6 + m * 0.4
      const r = mix(baseR, darkR, t) + v
      const g = mix(baseG, darkG, t) + v
      const b = mix(baseB, darkB, t) + v
      setPixel(png, x, y, r, g, b)
    }
  }
  return png
}

// ---- Grass side: grass band + organic dirt transition ----
function createGrassSide() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const grassR = 0x5a,
    grassG = 0x9c,
    grassB = 0x38
  const dirtR = 0x72,
    dirtG = 0x52,
    dirtB = 0x3a
  const band = SIZE * 0.12
  const scale = 0.12
  for (let y = 0; y < SIZE; y++) {
    const edge = y + (noise(y, 0, 4) - 0.5) * 4
    const isGrass = edge < band
    for (let x = 0; x < SIZE; x++) {
      const n = (noise(x, y, 5) - 0.5) * 20
      if (isGrass) {
        setPixel(png, x, y, grassR + n, grassG + n, grassB + n)
      } else {
        const d = (noise(x * scale, y * scale, 6) - 0.5) * 25
        setPixel(png, x, y, dirtR + d, dirtG + d, dirtB + d)
      }
    }
  }
  return png
}

// ---- Dirt: reddish-brown forest floor, leaves, mulch, small stones ----
function createDirt() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const seed = 12345
  const colors = [
    [0x6d, 0x4c, 0x3e],
    [0x7f, 0x58, 0x46],
    [0x5c, 0x3a, 0x2e],
    [0x8a, 0x62, 0x48],
    [0x72, 0x4a, 0x38],
    [0x7a, 0x7a, 0x7a],
    [0x5c, 0x5c, 0x5c],
    [0x4a, 0x5c, 0x38],
    [0x55, 0x48, 0x32],
  ]
  const scale = 0.2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = hash(x, y, seed)
      const u = hash(x + 7, y + 13, seed)
      const v = fbm(x * scale, y * scale, seed) * 0.3 + (noise(x, y, seed + 1) - 0.5) * 0.4
      let c
      if (t < 0.45) c = colors[u < 0.5 ? 0 : 1]
      else if (t < 0.68) c = colors[2 + (u > 0.33 ? (u > 0.66 ? 2 : 1) : 0)]
      else if (t < 0.82) c = colors[u < 0.5 ? 6 : 7]
      else c = colors[u < 0.5 ? 7 : 8]
      const bump = (Math.floor((v + 0.5) * 12) % 3) - 1
      setPixel(png, x, y, c[0] + bump * 4, c[1] + bump * 4, c[2] + bump * 4)
    }
  }
  return png
}

// ---- Stone: varied grays, cracks, slight moss/weathered ----
function createStone() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const scale = 0.18
  const crackScale = 0.4
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x * scale, y * scale, 20)
      const crack = fbm(x * crackScale, y * crackScale, 21)
      const moss = crack > 0.52 && crack < 0.58 ? 1 : 0
      const base = 0x68 + (n - 0.5) * 48
      const r = Math.max(0x40, Math.min(0x90, base + (noise(x, y, 22) - 0.5) * 18))
      const g = Math.max(0x3e, Math.min(0x88, base - 2 + (noise(x, y, 23) - 0.5) * 16))
      const b = Math.max(0x38, Math.min(0x82, base - 6 + (noise(x, y, 24) - 0.5) * 14))
      const mr = moss ? Math.min(255, r + 12) : r
      const mg = moss ? Math.min(255, g + 18) : g
      const mb = moss ? Math.min(255, b + 8) : b
      setPixel(png, x, y, mr, mg, mb)
    }
  }
  return png
}

// ---- Sand: warm, fine variation ----
function createSand() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const baseR = 0xc8,
    baseG = 0xb4,
    baseB = 0x88
  const scale = 0.15
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x * scale, y * scale, 30)
      const v = (noise(x, y, 31) - 0.5) * 28
      const r = baseR + (n - 0.5) * 24 + v
      const g = baseG + (n - 0.5) * 20 + v
      const b = baseB + (n - 0.5) * 18 + v
      setPixel(png, x, y, r, g, b)
    }
  }
  return png
}

// ---- Snow: cold white, soft blue-gray shadows ----
function createSnow() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const baseR = 0xee,
    baseG = 0xf2,
    baseB = 0xfc
  const shadowR = 0xd8,
    shadowG = 0xde,
    shadowB = 0xec
  const scale = 0.12
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x * scale, y * scale, 40)
      const v = (noise(x, y, 41) - 0.5) * 14
      const t = n * 0.5 + (noise(x * 2, y * 2, 42) - 0.5) * 0.3
      const r = mix(baseR, shadowR, t) + v
      const g = mix(baseG, shadowG, t) + v
      const b = mix(baseB, shadowB, t) + v
      setPixel(png, x, y, r, g, b)
    }
  }
  return png
}

// ---- Wood (bark): vertical grooves, rough, natural ----
function createWood() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const barkR = 0x58,
    barkG = 0x3c,
    barkB = 0x32
  const grooveR = 0x42,
    grooveG = 0x2c,
    grooveB = 0x24
  const scale = 0.08
  const grooveFreq = (2 * Math.PI * 4) / SIZE
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const groove = smoothNoise(x * grooveFreq * 20, y * 0.5, 50) * 0.5 + 0.5
      const n = fbm(x * scale, y * scale, 51)
      const v = (noise(x, y, 52) - 0.5) * 24
      const t = groove * 0.6 + n * 0.4
      const r = mix(barkR, grooveR, t) + v
      const g = mix(barkG, grooveG, t) + v
      const b = mix(barkB, grooveB, t) + v
      setPixel(png, x, y, r, g, b)
    }
  }
  return png
}

// ---- Wood top: growth rings + grain ----
function createWoodTop() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const centerX = SIZE / 2 - 0.5,
    centerZ = SIZE / 2 - 0.5
  const ringR = 0x42,
    ringG = 0x2c,
    ringB = 0x24
  const innerR = 0x58,
    innerG = 0x3c,
    innerB = 0x32
  const scale = 0.1
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - centerX,
        dy = y - centerZ
      const dist = Math.sqrt(dx * dx + dy * dy)
      const n = fbm(x * scale, y * scale, 60)
      const v = (noise(x, y, 61) - 0.5) * 20
      const ring = Math.sin(dist * 0.45) * 0.5 + 0.5
      const isRing = ring > 0.5 || (dist < 6 && ring > 0.35)
      const r = (isRing ? ringR : innerR) + v + (n - 0.5) * 12
      const g = (isRing ? ringG : innerG) + v + (n - 0.5) * 10
      const b = (isRing ? ringB : innerB) + v + (n - 0.5) * 10
      setPixel(png, x, y, r, g, b)
    }
  }
  return png
}

// ---- Leaves: green with depth, darker shading, subtle veins ----
function createLeaves() {
  const png = new PNG({ width: SIZE, height: SIZE })
  const baseR = 0x32,
    baseG = 0x82,
    baseB = 0x38
  const darkR = 0x24,
    darkG = 0x5c,
    darkB = 0x28
  const scale = 0.2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = fbm(x * scale, y * scale, 70)
      const m = fbm(x * scale * 1.7 + 3, y * scale * 1.7, 71)
      const holeNoise = noise(x * 2.1, y * 2.1, 72)
      const edgeNoise = noise(x, y, 73)
      const v = (noise(x, y, 74) - 0.5) * 26
      const t = n * 0.55 + m * 0.45
      const r = mix(baseR, darkR, t) + v
      const g = mix(baseG, darkG, t) + v
      const b = mix(baseB, darkB, t) + v
      const isEdge = x < 3 || x >= SIZE - 3 || y < 3 || y >= SIZE - 3
      const transparent = holeNoise > 0.68 || (isEdge && edgeNoise > 0.48)
      setPixel(png, x, y, r, g, b, transparent ? 0 : 255)
    }
  }
  return png
}

;(async function main() {
  ensureDir(OUT_DIR)

  await Promise.all([
    writePng(createGrassTop(), 'grass_top.png'),
    writePng(createGrassSide(), 'grass_side.png'),
    writePng(createDirt(), 'dirt.png'),
    writePng(createStone(), 'stone.png'),
    writePng(createSand(), 'sand.png'),
    writePng(createSnow(), 'snow.png'),
    writePng(createWood(), 'wood.png'),
    writePng(createWoodTop(), 'wood_top.png'),
    writePng(createLeaves(), 'leaves.png'),
  ])

  console.log('Done. Texture pack (' + SIZE + 'x' + SIZE + ') in public/textures/')
})()
