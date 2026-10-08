import * as THREE from 'three';

// 程序化环境贴图（PMREM 预过滤），让金属、隔热毯、玻璃有可信的反射
export type EnvKind = 'space' | 'mars';

function paint(kind: EnvKind): HTMLCanvasElement {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  if (kind === 'space') {
    ctx.fillStyle = '#020306';
    ctx.fillRect(0, 0, W, H);
    // 太阳方向亮斑（左上）与对侧行星微弱反光
    const sun = ctx.createRadialGradient(W * 0.18, H * 0.38, 0, W * 0.18, H * 0.38, 40);
    sun.addColorStop(0, 'rgba(255,248,235,1)');
    sun.addColorStop(0.15, 'rgba(255,230,200,0.6)');
    sun.addColorStop(1, 'rgba(255,200,150,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    const planet = ctx.createRadialGradient(W * 0.7, H * 0.75, 0, W * 0.7, H * 0.75, 60);
    planet.addColorStop(0, 'rgba(150,80,50,0.35)');
    planet.addColorStop(1, 'rgba(150,80,50,0)');
    ctx.fillStyle = planet;
    ctx.fillRect(0, 0, W, H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#8a6a52');
    sky.addColorStop(0.48, '#d9b48c');
    sky.addColorStop(0.52, '#7a4a30');
    sky.addColorStop(1, '#3a2016');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(W * 0.3, H * 0.3, 0, W * 0.3, H * 0.3, 30);
    sun.addColorStop(0, 'rgba(255,245,230,1)');
    sun.addColorStop(0.3, 'rgba(190,210,240,0.5)');
    sun.addColorStop(1, 'rgba(190,210,240,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
  }
  return c;
}

const cache = new WeakMap<THREE.WebGLRenderer, Partial<Record<EnvKind, THREE.Texture>>>();

export function envMap(renderer: THREE.WebGLRenderer, kind: EnvKind): THREE.Texture {
  let entry = cache.get(renderer);
  if (!entry) { entry = {}; cache.set(renderer, entry); }
  if (entry[kind]) return entry[kind]!;
  const tex = new THREE.CanvasTexture(paint(kind));
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const out = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  entry[kind] = out;
  return out;
}
