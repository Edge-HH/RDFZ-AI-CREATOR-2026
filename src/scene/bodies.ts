import * as THREE from 'three';

/**
 * 天体的程序化外观：地球（着色器生成大陆、海洋、云层、夜景灯光与大气辉光）、
 * 月球表面纹理（月海 + 撞击坑），以及通用的光晕贴图。全部在运行时生成，不依赖外部图片。
 */

// ---------------------------------------------------------------- 噪声（GLSL）
const NOISE_GLSL = /* glsl */ `
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                 mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                 mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
`;

export interface EarthApi {
  group: THREE.Group;
  setSun(dir: THREE.Vector3): void;
  update(t: number): void;
}

export function makeEarth(radius: number): EarthApi {
  const group = new THREE.Group();
  const uniforms = {
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    time: { value: 0 },
  };

  const surface = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vObj;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vObj = normalize(position);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPosW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform float time;
      varying vec3 vObj;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      ${NOISE_GLSL}
      void main() {
        vec3 p = vObj;
        float lat = p.y;
        // 大陆：低频噪声 + 扭曲，形成不规则海岸线
        vec3 warp = vec3(fbm(p * 1.6 + 3.0), fbm(p * 1.6 + 7.0), fbm(p * 1.6 + 11.0));
        float c = fbm(p * 1.9 + warp * 1.2);
        float land = smoothstep(0.515, 0.535, c);
        float coast = smoothstep(0.47, 0.515, c) * (1.0 - land);
        // 地表颜色：赤道雨林、副热带沙漠、高纬冻原
        float aridBand = exp(-pow((abs(lat) - 0.38) / 0.14, 2.0));
        float arid = clamp(aridBand * 1.3 + (fbm(p * 5.0) - 0.5) * 1.4, 0.0, 1.0);
        vec3 forest = vec3(0.09, 0.22, 0.08);
        vec3 desert = vec3(0.62, 0.50, 0.32);
        vec3 tundra = vec3(0.42, 0.40, 0.33);
        vec3 landCol = mix(forest, desert, arid);
        landCol = mix(landCol, tundra, smoothstep(0.55, 0.72, abs(lat)));
        landCol *= 0.85 + fbm(p * 14.0) * 0.35;
        vec3 ocean = mix(vec3(0.01, 0.05, 0.16), vec3(0.03, 0.22, 0.36), coast);
        vec3 col = mix(ocean, landCol, land);
        // 极地冰盖
        float ice = smoothstep(0.80, 0.86, abs(lat) + (fbm(p * 6.0) - 0.5) * 0.12);
        col = mix(col, vec3(0.92, 0.95, 0.98), ice);
        // 云层：随时间缓慢漂移的涡旋
        vec3 q = p * 3.2 + vec3(time * 0.012, 0.0, time * 0.008);
        float cl = fbm(q + fbm(q * 1.5) * 1.6);
        float clouds = smoothstep(0.52, 0.72, cl) * 0.9;
        clouds *= 1.0 - 0.5 * exp(-pow((abs(lat) - 0.3) / 0.12, 2.0));

        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vPosW);
        float ndl = dot(N, sunDir);
        float day = smoothstep(-0.12, 0.25, ndl);
        float diff = max(ndl, 0.0);
        vec3 lit = col * (0.06 + diff * 1.25);
        // 海面高光
        vec3 H = normalize(sunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 60.0) * (1.0 - land) * (1.0 - ice) * (1.0 - clouds);
        lit += vec3(1.0, 0.92, 0.8) * spec * 0.9;
        // 云
        lit = mix(lit, vec3(1.0) * (0.08 + diff * 1.15), clouds);
        // 夜面城市灯光
        float cities = smoothstep(0.62, 0.78, fbm(p * 22.0)) * land * (1.0 - ice) * (1.0 - clouds * 0.8);
        vec3 night = vec3(1.0, 0.72, 0.35) * cities * 0.9;
        vec3 outCol = lit * day + night * (1.0 - day) + lit * (1.0 - day) * 0.15;
        // 晨昏线附近的暖色
        outCol += vec3(0.35, 0.12, 0.02) * exp(-pow(ndl / 0.08, 2.0)) * 0.25;
        // 大气边缘
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        outCol += vec3(0.30, 0.55, 1.0) * fres * (0.15 + day * 0.9);
        gl_FragColor = vec4(outCol, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), surface);
  // 地轴倾角约 23.4°
  globe.rotation.z = (23.4 * Math.PI) / 180;
  group.add(globe);

  // 独立云层：让地球在远景里仍保持清晰的球体层次，并以极慢速度漂移。
  const cloudUniforms = {
    time: uniforms.time,
    sunDir: uniforms.sunDir,
  };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.012, 72, 48),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vObj;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vObj = normalize(position);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
          vPosW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform vec3 sunDir;
        varying vec3 vObj;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        ${NOISE_GLSL}
        void main() {
          vec3 q = vObj * 3.7 + vec3(time * 0.009, 0.0, -time * 0.006);
          float density = smoothstep(0.54, 0.69, fbm(q + fbm(q * 1.4) * 1.5));
          vec3 N = normalize(vNormalW);
          vec3 V = normalize(cameraPosition - vPosW);
          float day = smoothstep(-0.08, 0.25, dot(N, sunDir));
          float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
          float alpha = density * (0.07 + day * 0.32) + rim * 0.06;
          gl_FragColor = vec4(vec3(0.92, 0.96, 1.0), clamp(alpha, 0.0, 0.46));
        }`,
    }),
  );
  group.add(clouds);

  // 大气辉光（背面渲染、叠加混合）
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 64, 48),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
          vPosW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vec3 N = normalize(vNormalW);
          vec3 V = normalize(cameraPosition - vPosW);
          // 背面：外缘处 dot(N,V)≈0，越靠近行星边缘越负（行星边缘处约 −0.33）
          float rim = pow(clamp(-dot(N, V) / 0.33, 0.0, 1.0), 2.0);
          float day = smoothstep(-0.3, 0.35, dot(N, sunDir));
          float a = rim * (0.08 + day * 0.9);
          gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * a, a);
        }`,
    }),
  );
  group.add(atmo);

  return {
    group,
    setSun(dir) {
      uniforms.sunDir.value.copy(dir).normalize();
    },
    update(t) {
      uniforms.time.value = t;
      globe.rotation.y = t * 0.01;
      clouds.rotation.y = t * 0.013;
    },
  };
}

// ---------------------------------------------------------------- 月球纹理（Canvas）
function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const fx = s(x - ix);
  const fy = s(y - iy);
  const fz = s(z - iz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
    l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz,
  );
}

function fbm3(x: number, y: number, z: number, oct: number): number {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise3(x, y, z);
    x = x * 2.07 + 3.1;
    y = y * 2.07 + 1.7;
    z = z * 2.07 + 5.3;
    a *= 0.5;
  }
  return s;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface MoonCrater {
  center: THREE.Vector3;
  angularRadius: number;
  depth: number;
  rim: number;
}

/**
 * 生成带有真实轮廓起伏的月球球体。
 *
 * 纹理只能改变颜色和法线，远景仍会得到一个过于光滑的球。本函数把少量
 * 大型撞击坑和多层噪声写入顶点位置，让月球在全景镜头中也能读出地貌层次。
 * 南极局部地形所在的极区保留为平滑球面，避免球体穿过基地地形裙边。
 */
export function makeMoonGeometry(radius: number): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(radius, 256, 192);
  const position = geometry.getAttribute('position');
  const local = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const craters: MoonCrater[] = [
    { center: new THREE.Vector3(0.34, 0.54, 0.77).normalize(), angularRadius: 0.082, depth: 25, rim: 8 },
    { center: new THREE.Vector3(-0.62, 0.38, 0.69).normalize(), angularRadius: 0.055, depth: 18, rim: 6 },
    { center: new THREE.Vector3(0.72, -0.2, 0.66).normalize(), angularRadius: 0.045, depth: 15, rim: 5 },
    { center: new THREE.Vector3(-0.25, -0.76, 0.59).normalize(), angularRadius: 0.036, depth: 12, rim: 4 },
    { center: new THREE.Vector3(0.04, 0.88, -0.46).normalize(), angularRadius: 0.03, depth: 10, rim: 3.5 },
    { center: new THREE.Vector3(-0.86, -0.18, -0.47).normalize(), angularRadius: 0.026, depth: 8, rim: 3 },
  ];

  for (let i = 0; i < position.count; i++) {
    local.fromBufferAttribute(position, i).normalize();
    // moon.rotation.x = PI / 2：把局部顶点换算到世界方向，识别月面基地所在极区。
    worldNormal.set(local.x, -local.z, local.y);
    const polarBlend = 1 - smoothstep(0.68, 0.86, worldNormal.y);
    let relief = (fbm3(local.x * 3.8 + 4, local.y * 3.8 - 2, local.z * 3.8 + 7, 4) - 0.48) * 18;
    for (const crater of craters) {
      const angularDistance = Math.acos(Math.max(-1, Math.min(1, local.dot(crater.center))));
      const bowl = smoothstep(crater.angularRadius, crater.angularRadius * 0.18, angularDistance);
      const rimDistance = (angularDistance - crater.angularRadius * 0.88) / (crater.angularRadius * 0.16);
      relief += -crater.depth * bowl + crater.rim * Math.exp(-(rimDistance * rimDistance));
    }
    local.multiplyScalar(1 + (relief * polarBlend) / radius);
    position.setXYZ(i, local.x * radius, local.y * radius, local.z * radius);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function makeMoonTexture(): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // 底色：月海（暗色玄武岩）+ 高地（亮色斜长岩），按球面坐标采样噪声避免接缝
  const w = 512;
  const h = 256;
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat);
    const sy = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w) * Math.PI * 2;
      const x = Math.cos(lon) * cl;
      const z = Math.sin(lon) * cl;
      const n = fbm3(x * 4 + 10, sy * 4 + 10, z * 4 + 10, 4);
      const mare = fbm3(x * 1.3 + 20, sy * 1.3 + 20, z * 1.3 + 20, 3);
      const m = Math.max(0, Math.min(1, (mare - 0.5) / 0.12));
      const v = 0.6 + (n - 0.5) * 0.22 - m * m * 0.2;
      const k = (j * w + i) * 4;
      img.data[k] = Math.round(v * 236);
      img.data[k + 1] = Math.round(v * 232);
      img.data[k + 2] = Math.round(v * 224);
      img.data[k + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, W, H);

  // 月海：用较宽、低对比的色块形成真实月面常见的深色玄武岩区域。
  // 颜色贴图只负责材质色，坑的主要深度由 makeMoonGeometry 提供，避免缩略图出现“泡泡纹”。
  let seed = 99;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 22; i++) {
    const cx = rnd() * W;
    const cy = H * (0.16 + rnd() * 0.68);
    const rx = 48 + rnd() * 150;
    const ry = rx * (0.55 + rnd() * 0.35);
    for (const off of [0, -W, W]) {
      ctx.save();
      ctx.translate(cx + off, cy);
      const g = ctx.createRadialGradient(0, 0, rx * 0.12, 0, 0, rx);
      g.addColorStop(0, 'rgba(38,37,35,0.11)');
      g.addColorStop(0.72, 'rgba(44,43,41,0.07)');
      g.addColorStop(1, 'rgba(44,43,41,0)');
      ctx.scale(1, ry / rx);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 撞击坑：暗色坑底 + 极弱的亮色坑缘，保留层次但不画成一圈圈白边。
  const crater = (cx: number, cy: number, r: number) => {
    const lat = (0.5 - cy / H) * Math.PI;
    const sx = 1 / Math.max(0.15, Math.cos(lat));
    for (const off of [0, -W, W]) {
      const x = cx + off;
      if (x + r * sx < 0 || x - r * sx > W) continue;
      ctx.save();
      ctx.translate(x, cy);
      ctx.scale(sx, 1);
      const g = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(38,37,35,0.17)');
      g.addColorStop(0.62, 'rgba(38,37,35,0.09)');
      g.addColorStop(0.84, 'rgba(235,232,223,0.07)');
      g.addColorStop(1, 'rgba(235,232,223,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
  for (let i = 0; i < 900; i++) {
    const r = 1.5 + Math.pow(rnd(), 3.5) * 44;
    const y = Math.acos(1 - 2 * rnd()) / Math.PI;
    crater(rnd() * W, y * H, r);
  }
  // 少数年轻撞击坑的辐射纹
  for (let i = 0; i < 5; i++) {
    const cx = rnd() * W;
    const cy = H * (0.25 + rnd() * 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2;
      const len = 40 + rnd() * 160;
      ctx.strokeStyle = 'rgba(255,250,235,0.05)';
      ctx.lineWidth = 2 + rnd() * 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len * 0.6);
      ctx.stroke();
    }
    ctx.restore();
    crater(cx, cy, 10 + rnd() * 8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
