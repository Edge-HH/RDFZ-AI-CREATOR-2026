// 轻量 3D 梯度噪声 + fBm：用于程序化行星贴图与地形
function hash(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1440662683 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 梯度（Perlin 式）噪声：12 个立方体边方向，避免值噪声的块状痕迹
const G = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
function grad(ix: number, iy: number, iz: number, seed: number, x: number, y: number, z: number): number {
  const g = G[hash(ix, iy, iz, seed) % 12];
  return g[0] * x + g[1] * y + g[2] * z;
}

// 返回 [0,1]
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const n = lerp(
    lerp(lerp(grad(xi, yi, zi, seed, xf, yf, zf), grad(xi + 1, yi, zi, seed, xf - 1, yf, zf), u),
      lerp(grad(xi, yi + 1, zi, seed, xf, yf - 1, zf), grad(xi + 1, yi + 1, zi, seed, xf - 1, yf - 1, zf), u), v),
    lerp(lerp(grad(xi, yi, zi + 1, seed, xf, yf, zf - 1), grad(xi + 1, yi, zi + 1, seed, xf - 1, yf, zf - 1), u),
      lerp(grad(xi, yi + 1, zi + 1, seed, xf, yf - 1, zf - 1), grad(xi + 1, yi + 1, zi + 1, seed, xf - 1, yf - 1, zf - 1), u), v),
    w,
  );
  return Math.max(0, Math.min(1, n * 0.5 + 0.5));
}

export function fbm3(x: number, y: number, z: number, octaves = 5, seed = 0): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function ridged3(x: number, y: number, z: number, octaves = 4, seed = 0): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise3(x * freq, y * freq, z * freq, seed + i * 31) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
