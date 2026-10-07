import * as THREE from 'three';
import { fbm3, mulberry, ridged3 } from './noise';

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// 等距圆柱投影：按球面方向采样 3D 噪声，避免接缝
function equirect(width: number, fn: (x: number, y: number, z: number, lat: number) => RGB, bumpFn?: (x: number, y: number, z: number) => number) {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const bump = bumpFn ? document.createElement('canvas') : null;
  const bctx = bump?.getContext('2d');
  const bimg = bump ? (bump.width = width, bump.height = height, bctx!.createImageData(width, height)) : null;
  for (let j = 0; j < height; j++) {
    const lat = (0.5 - j / height) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < width; i++) {
      const lon = (i / width) * Math.PI * 2;
      const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      const c = fn(x, y, z, lat);
      const k = (j * width + i) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
      if (bimg) { const b = bumpFn!(x, y, z) * 255; bimg.data[k] = b; bimg.data[k + 1] = b; bimg.data[k + 2] = b; bimg.data[k + 3] = 255; }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (bimg) bctx!.putImageData(bimg, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const btex = bump ? new THREE.CanvasTexture(bump) : null;
  return { map: tex, bump: btex };
}

export function marsTexture(width: number) {
  const dark: RGB = [74, 36, 22], mid: RGB = [166, 78, 40], bright: RGB = [214, 132, 86], dust: RGB = [226, 160, 112], ice: RGB = [238, 232, 226];
  return equirect(width, (x, y, z, lat) => {
    const albedo = fbm3(x * 1.6 + 3, y * 1.6, z * 1.6, 4, 7); // 大尺度明暗区（类似大瑟提斯）
    const detail = fbm3(x * 9, y * 9, z * 9, 5, 3);
    const crater = ridged3(x * 14, y * 14, z * 14, 3, 11);
    let c = mix(dark, mid, smooth(0.32, 0.55, albedo));
    c = mix(c, bright, smooth(0.5, 0.75, albedo + detail * 0.25));
    c = mix(c, dust, smooth(0.62, 0.9, detail) * 0.4);
    const k = 0.82 + crater * 0.3;
    c = [c[0] * k, c[1] * k, c[2] * k];
    const pole = smooth(1.28, 1.42, Math.abs(lat) + (detail - 0.5) * 0.15);
    c = mix(c, ice, pole);
    return [Math.min(255, c[0]), Math.min(255, c[1]), Math.min(255, c[2])];
  }, (x, y, z) => 0.5 * fbm3(x * 9, y * 9, z * 9, 5, 3) + 0.5 * ridged3(x * 14, y * 14, z * 14, 3, 11));
}

export function earthTexture(width: number) {
  const deep: RGB = [10, 34, 78], shallow: RGB = [24, 78, 128], land: RGB = [62, 98, 46], desert: RGB = [176, 150, 98], ice: RGB = [240, 244, 248];
  return equirect(width, (x, y, z, lat) => {
    const n = fbm3(x * 2.2 + 11, y * 2.2, z * 2.2, 6, 21);
    const dry = fbm3(x * 4, y * 4, z * 4, 3, 5);
    let c: RGB;
    if (n < 0.5) c = mix(deep, shallow, smooth(0.38, 0.5, n));
    else c = mix(land, desert, smooth(0.45, 0.7, dry) * (1 - Math.abs(lat) / 1.6));
    c = mix(c, ice, smooth(1.2, 1.35, Math.abs(lat)));
    return c;
  });
}

export function cloudTexture(width: number) {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  for (let j = 0; j < height; j++) {
    const lat = (0.5 - j / height) * Math.PI;
    for (let i = 0; i < width; i++) {
      const lon = (i / width) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      const n = fbm3(x * 3 + 5, y * 6, z * 3, 5, 41);
      const a = smooth(0.52, 0.72, n) * 255;
      const k = (j * width + i) * 4;
      img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255; img.data[k + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 地面细节贴图（可平铺）
export function groundTexture(size: number, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const r = mulberry(seed);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      // 用圆环坐标让噪声可平铺
      const a = (i / size) * Math.PI * 2, b = (j / size) * Math.PI * 2;
      const n = fbm3(Math.cos(a) * 2, Math.sin(a) * 2 + Math.cos(b) * 2, Math.sin(b) * 2, 5, 9);
      const g = 0.86 + n * 0.28 + (r() - 0.5) * 0.03;
      const k = (j * size + i) * 4;
      img.data[k] = Math.min(255, 180 * g); img.data[k + 1] = Math.min(255, 96 * g); img.data[k + 2] = Math.min(255, 60 * g); img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function starField(count: number, radius: number, seed = 3): THREE.Points {
  const r = mulberry(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([radius * s * Math.cos(th), radius * u, radius * s * Math.sin(th)], i * 3);
    const t = r();
    const b = 0.55 + r() * 0.45;
    col.set(t < 0.15 ? [b, b * 0.85, b * 0.7] : t > 0.85 ? [b * 0.8, b * 0.9, b] : [b, b, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  return new THREE.Points(g, m);
}

export function glowSprite(color: string, size = 128): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.5)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
