import * as THREE from 'three';

// 550 式全息标注：加色混合的白色发丝线、红色强调、轻微闪烁与扫描带
export const HOLO_WHITE = '#e6e8ea';
export const HOLO_RED = '#ff3b30';

const shared = { uTime: { value: 0 }, uFlicker: { value: 1 } };

export function tickHolo(t: number): void { shared.uTime.value = t; }
export function setHoloFlicker(on: boolean): void { shared.uFlicker.value = on ? 1 : 0; }

const VERT = `
attribute float lineDistance;
varying float vDist;
varying float vFade;
uniform float uFar;
void main() {
  vDist = lineDistance;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFade = 1.0 - smoothstep(uFar * 0.6, uFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uFlicker;
uniform float uDash;
uniform float uGap;
uniform float uSpeed;
varying float vDist;
varying float vFade;
void main() {
  if (uDash > 0.0 && mod(vDist - uTime * uSpeed, uDash + uGap) > uDash) discard;
  float flick = 1.0 - uFlicker * (0.12 * step(0.93, fract(sin(floor(uTime * 24.0)) * 43758.5)) + 0.06 * sin(uTime * 7.0));
  float band = 1.0 + uFlicker * 0.35 * smoothstep(0.92, 1.0, fract(gl_FragCoord.y / 240.0 - uTime * 0.35));
  gl_FragColor = vec4(uColor * band, uOpacity * flick * vFade);
}`;

export interface HoloOpts { color?: string; opacity?: number; dash?: number; gap?: number; speed?: number; far?: number }

export function holoMat(o: HoloOpts = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime, uFlicker: shared.uFlicker,
      uColor: { value: new THREE.Color(o.color ?? HOLO_WHITE) },
      uOpacity: { value: o.opacity ?? 0.7 },
      uDash: { value: o.dash ?? 0 }, uGap: { value: o.gap ?? 0 }, uSpeed: { value: o.speed ?? 0 },
      uFar: { value: o.far ?? 1e6 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function setHoloColor(obj: THREE.Object3D, color: string): void {
  obj.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (m?.uniforms?.uColor) m.uniforms.uColor.value.set(color);
  });
}

function line(points: THREE.Vector3[], o: HoloOpts, segments = false): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const l = segments ? new THREE.LineSegments(g, holoMat(o)) : new THREE.Line(g, holoMat(o));
  l.computeLineDistances();
  l.frustumCulled = false;
  return l;
}

// 带刻度的圆环（位于 XZ 平面）
export function holoRing(r: number, o: HoloOpts & { ticks?: number; tickLen?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const pts = Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r); });
  g.add(line(pts, o));
  if (o.ticks) {
    const len = o.tickLen ?? r * 0.04;
    const tp: THREE.Vector3[] = [];
    for (let i = 0; i < o.ticks; i++) {
      const a = (i / o.ticks) * Math.PI * 2;
      const l = i % 4 === 0 ? len * 2 : len;
      tp.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * (r + l), 0, Math.sin(a) * (r + l)));
    }
    g.add(line(tp, { ...o, dash: 0, opacity: (o.opacity ?? 0.7) * 0.8 }, true));
  }
  return g;
}

// 轨迹弧：可带一个沿线移动的光点
export class HoloArc {
  readonly obj = new THREE.Group();
  private curve: THREE.CatmullRomCurve3;
  private dot: THREE.Sprite | null = null;
  private lineObj: THREE.Line;
  constructor(points: THREE.Vector3[], o: HoloOpts & { dot?: number } = {}) {
    this.curve = new THREE.CatmullRomCurve3(points);
    this.lineObj = line(this.curve.getPoints(160), o);
    this.obj.add(this.lineObj);
    if (o.dot) {
      this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: o.color ?? HOLO_WHITE, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      this.dot.scale.setScalar(o.dot);
      this.obj.add(this.dot);
    }
  }
  setPoints(points: THREE.Vector3[]): void {
    this.curve = new THREE.CatmullRomCurve3(points);
    this.lineObj.geometry.setFromPoints(this.curve.getPoints(160));
    this.lineObj.computeLineDistances();
  }
  setProgress(p: number): void { this.dot?.position.copy(this.curve.getPointAt(Math.max(0, Math.min(1, p)))); }
  pointAt(p: number): THREE.Vector3 { return this.curve.getPointAt(Math.max(0, Math.min(1, p))); }
}

// 网格平面（XZ）
export function holoGrid(w: number, d: number, div: number, o: HoloOpts = {}): THREE.LineSegments {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= div; i++) {
    const x = -w / 2 + (w * i) / div, z = -d / 2 + (d * i) / div;
    pts.push(new THREE.Vector3(x, 0, -d / 2), new THREE.Vector3(x, 0, d / 2), new THREE.Vector3(-w / 2, 0, z), new THREE.Vector3(w / 2, 0, z));
  }
  return line(pts, o, true) as THREE.LineSegments;
}

// 经纬网球壳
export function holoGraticule(r: number, o: HoloOpts = {}): THREE.Group {
  const g = new THREE.Group();
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = Math.sin(THREE.MathUtils.degToRad(lat)) * r, rr = Math.cos(THREE.MathUtils.degToRad(lat)) * r;
    const ring = holoRing(rr, o);
    ring.position.y = y;
    g.add(ring);
  }
  for (let lon = 0; lon < 180; lon += 30) {
    const ring = holoRing(r, o);
    ring.rotation.set(Math.PI / 2, 0, THREE.MathUtils.degToRad(lon));
    g.add(ring);
  }
  return g;
}

// 旋转扫描扇面（XZ 平面）
export function holoSweep(r: number, color = HOLO_WHITE, angle = 0.5): THREE.Mesh {
  const geo = new THREE.CircleGeometry(r, 48, 0, angle);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAngle: { value: angle } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAngle; varying vec3 vP; void main(){ float a = atan(-vP.z, vP.x); float k = clamp(a / uAngle, 0.0, 1.0); gl_FragColor = vec4(uColor, pow(k, 4.0) * 0.1); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

let dotTex: THREE.Texture | null = null;
export function dotTexture(): THREE.Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

// 文字标签：屏幕尺寸恒定的精灵，锚点在左下角，带一小段引线
export function holoLabel(title: string, sub = '', color = HOLO_WHITE, height = 0.05): THREE.Sprite {
  const W = 512, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(4, H - 4); ctx.lineTo(40, H - 40); ctx.lineTo(W - 8, H - 40); ctx.stroke();
  ctx.fillRect(40, H - 46, 6, 12);
  ctx.globalAlpha = 1;
  ctx.font = '600 34px ui-monospace, Consolas, monospace';
  ctx.fillText(title, 52, H - 54);
  if (sub) {
    ctx.globalAlpha = 0.75;
    ctx.font = '26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(sub, 52, H - 12);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.center.set(0, 0);
  s.scale.set(height * (W / H), height, 1);
  s.renderOrder = 10;
  return s;
}

// 角标框：跟随物体、世界尺寸
export function holoBracket(size: number, color = HOLO_RED): THREE.Sprite {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  const L = 34, m = 4;
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [S - m, m, -1, 1], [m, S - m, 1, -1], [S - m, S - m, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke();
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  s.renderOrder = 10;
  return s;
}
