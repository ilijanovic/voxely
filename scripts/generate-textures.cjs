/**
 * Generates 16x16 Minecraft-style voxel textures as PNG.
 * Run: node scripts/generate-textures.cjs
 */

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const SIZE = 16;
const OUT_DIR = path.join(__dirname, "..", "public", "textures");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function setPixel(png, x, y, r, g, b, a = 255) {
  const idx = (png.width * y + x) << 2;
  png.data[idx] = Math.max(0, Math.min(255, r));
  png.data[idx + 1] = Math.max(0, Math.min(255, g));
  png.data[idx + 2] = Math.max(0, Math.min(255, b));
  png.data[idx + 3] = Math.max(0, Math.min(255, a));
}

function noise(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function writePng(png, filename) {
  ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, filename);
  png.pack().pipe(fs.createWriteStream(outPath));
  console.log("Written:", outPath);
}

function createGrassTop() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const baseR = 0x7c,
    baseG = 0xba,
    baseB = 0x3d;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 1);
      const varR = (n - 0.5) * 24;
      const varG = (noise(x, y, 2) - 0.5) * 20;
      const varB = (noise(x, y, 3) - 0.5) * 16;
      setPixel(png, x, y, baseR + varR, baseG + varG, baseB + varB);
    }
  }
  return png;
}

function createGrassSide() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const grassR = 0x7c,
    grassG = 0xba,
    grassB = 0x3d;
  const dirtR = 0x8b,
    dirtG = 0x69,
    dirtB = 0x14;
  const grassRows = 4;
  for (let y = 0; y < SIZE; y++) {
    const isGrass = y < grassRows;
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 4);
      const v = (n - 0.5) * 18;
      if (isGrass) {
        setPixel(png, x, y, grassR + v, grassG + v, grassB + v);
      } else {
        setPixel(png, x, y, dirtR + v, dirtG + v, dirtB + v);
      }
    }
  }
  return png;
}

function createDirt() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const baseR = 0x8b,
    baseG = 0x69,
    baseB = 0x14;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 5);
      const v = (n - 0.5) * 28;
      setPixel(png, x, y, baseR + v, baseG + v, baseB + v);
    }
  }
  return png;
}

function createStone() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const baseR = 0x7a,
    baseG = 0x7a,
    baseB = 0x7a;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 6);
      const v = (n - 0.5) * 22;
      setPixel(png, x, y, baseR + v, baseG + v, baseB + v);
    }
  }
  return png;
}

function createSand() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const baseR = 0xc2,
    baseG = 0xb2,
    baseB = 0x8a;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 7);
      const v = (n - 0.5) * 24;
      setPixel(png, x, y, baseR + v, baseG + v, baseB + v);
    }
  }
  return png;
}

function createSnow() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const baseR = 0xf0,
    baseG = 0xf5,
    baseB = 0xfc;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 8);
      const v = (n - 0.5) * 18;
      setPixel(png, x, y, baseR + v, baseG + v, baseB + v);
    }
  }
  return png;
}

function createWood() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const barkR = 0x5d,
    barkG = 0x40,
    barkB = 0x37;
  const ringR = 0x45,
    ringG = 0x2e,
    ringB = 0x27;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 9);
      const v = (n - 0.5) * 22;
      const isRing = (y + Math.floor(noise(x, y, 10) * 3)) % 4 === 0;
      const r = isRing ? ringR + v : barkR + v;
      const g = isRing ? ringG + v : barkG + v;
      const b = isRing ? ringB + v : barkB + v;
      setPixel(png, x, y, r, g, b);
    }
  }
  return png;
}

function createWoodTop() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const centerX = SIZE / 2 - 0.5,
    centerZ = SIZE / 2 - 0.5;
  const ringR = 0x45,
    ringG = 0x2e,
    ringB = 0x27;
  const innerR = 0x5d,
    innerG = 0x40,
    innerB = 0x37;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - centerX,
        dy = y - centerZ;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const n = noise(x, y, 11);
      const v = (n - 0.5) * 20;
      const isRing = Math.abs(dist - 4) < 1.2 || Math.abs(dist - 7) < 1;
      const r = (isRing ? ringR : innerR) + v;
      const g = (isRing ? ringG : innerG) + v;
      const b = (isRing ? ringB : innerB) + v;
      setPixel(png, x, y, r, g, b);
    }
  }
  return png;
}

function createLeaves() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const baseR = 0x2e,
    baseG = 0x7d,
    baseB = 0x32;
  const darkR = 0x22,
    darkG = 0x62,
    darkB = 0x28;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise(x, y, 12);
      const m = noise(x * 2, y * 2, 13);
      const holeNoise = noise(x * 3, y * 3, 14);
      const edgeNoise = noise(x, y, 15);
      const v = (n - 0.5) * 28;
      const isDark = m > 0.55;
      const r = (isDark ? darkR : baseR) + v;
      const g = (isDark ? darkG : baseG) + v;
      const b = (isDark ? darkB : baseB) + v;
      const isEdge = x < 2 || x >= SIZE - 2 || y < 2 || y >= SIZE - 2;
      const transparent = holeNoise > 0.72 || (isEdge && edgeNoise > 0.5);
      setPixel(png, x, y, r, g, b, transparent ? 0 : 255);
    }
  }
  return png;
}

ensureDir(OUT_DIR);

const grassTop = createGrassTop();
grassTop.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "grass_top.png")));

const grassSide = createGrassSide();
grassSide
  .pack()
  .pipe(fs.createWriteStream(path.join(OUT_DIR, "grass_side.png")));

const dirt = createDirt();
dirt.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "dirt.png")));

const stone = createStone();
stone.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "stone.png")));

const sand = createSand();
sand.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "sand.png")));

const snow = createSnow();
snow.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "snow.png")));

const wood = createWood();
wood.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "wood.png")));

const woodTop = createWoodTop();
woodTop.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "wood_top.png")));

const leaves = createLeaves();
leaves.pack().pipe(fs.createWriteStream(path.join(OUT_DIR, "leaves.png")));

console.log("Done. Textures in public/textures/");
