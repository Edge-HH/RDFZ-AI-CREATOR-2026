import * as THREE from 'three';
import type { SceneCue } from '../core/content';
import { ARRIVAL_DAY, CONJUNCTION_START, crewPos, DEPARTURE_DAY, earthPos, marsPos, TRANSFER_DAYS } from '../core/orbit';
import type { MissionState, SiteId } from '../core/types';
import { siteById, SITES } from '../content/sites';
import { fbm3, mulberry, ridged3 } from './noise';
import { cloudTexture, earthTexture, glowSprite, groundTexture, marsTexture, starField } from './textures';

export type Tier = 'high' | 'medium' | 'low';

export interface SceneModule {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  exposure: number;
  apply(s: MissionState | null, cue: SceneCue): void;
  tick(dt: number, t: number): void;
  dispose(): void;
}

const disposeTree = (o: THREE.Object3D) => o.traverse((c) => {
  const m = c as THREE.Mesh;
  m.geometry?.dispose?.();
  const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
  for (const mat of mats) {
    for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
    mat.dispose();
  }
});

function atmosphere(radius: number, color: string, power = 3, intensity = 1.2): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, power: { value: power }, intensity: { value: intensity } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 color; uniform float power; uniform float intensity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), power); gl_FragColor = vec4(color*intensity, f); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
}

const latLonToVec = (latDeg: number, lonDeg: number, r: number) => {
  const lat = THREE.MathUtils.degToRad(latDeg), lon = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon));
};

function texSize(tier: Tier) {
  return tier === 'high' ? 1024 : tier === 'medium' ? 768 : 512;
}

// ---------------- 火星全球（标题、飞控大厅、选址） ----------------
export class MarsGlobeScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
  exposure = 1.05;
  private globe: THREE.Group = new THREE.Group();
  private markers = new Map<SiteId, THREE.Object3D>();
  private targetRot: number | null = null;
  private targetTilt = 0.25;

  constructor(tier: Tier) {
    const { map, bump } = marsTexture(texSize(tier));
    const mars = new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), new THREE.MeshStandardMaterial({ map, bumpMap: bump ?? undefined, bumpScale: 0.6, roughness: 0.95, metalness: 0 }));
    this.globe.add(mars, atmosphere(10.35, '#ff9d66', 3.2, 0.9));
    for (const s of SITES) {
      const lon = Number(s.coord.split(' ')[1].replace('°E', ''));
      const pos = latLonToVec(s.latDeg, lon, 10.05);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 8), new THREE.MeshBasicMaterial({ color: '#6fd3ff' }));
      dot.position.copy(pos);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 32), new THREE.MeshBasicMaterial({ color: '#6fd3ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      const g = new THREE.Group();
      g.add(dot, ring);
      g.visible = false;
      this.markers.set(s.id, g);
      this.globe.add(g);
    }
    this.globe.rotation.x = 0.25;
    this.scene.add(this.globe, starField(tier === 'low' ? 1500 : 4000, 900));
    const sun = new THREE.DirectionalLight('#fff4e6', 2.6);
    sun.position.set(-30, 12, 20);
    this.scene.add(sun, new THREE.AmbientLight('#402018', 0.35));
    this.camera.position.set(0, 0, 42);
  }

  apply(s: MissionState | null): void {
    for (const [id, m] of this.markers) m.visible = !s || !s.site || s.site === id;
    if (s?.site) this.focus(s.site);
  }

  focus(id: SiteId): void {
    const site = siteById(id)!;
    const lon = Number(site.coord.split(' ')[1].replace('°E', ''));
    this.targetRot = -THREE.MathUtils.degToRad(lon) + Math.PI / 2;
    this.targetTilt = THREE.MathUtils.degToRad(site.latDeg) * 0.8;
    for (const [mid, m] of this.markers) m.visible = true, (m.children[1] as THREE.Mesh).scale.setScalar(mid === id ? 1.8 : 1);
  }

  tick(dt: number, t: number): void {
    if (this.targetRot === null) this.globe.rotation.y += dt * 0.05;
    else {
      let d = this.targetRot - this.globe.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.globe.rotation.y += d * Math.min(1, dt * 1.5);
      this.globe.rotation.x += (this.targetTilt - this.globe.rotation.x) * Math.min(1, dt * 1.5);
    }
    for (const m of this.markers.values()) (m.children[1] as THREE.Mesh).rotation.z = t;
    this.camera.position.x = Math.sin(t * 0.05) * 2;
    this.camera.lookAt(0, 0, 0);
  }

  dispose(): void { disposeTree(this.scene); }
}

// ---------------- 太阳系轨道（窗口、日凌） ----------------
const AU = 12;
export class OrbitScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 3000);
  exposure = 1.1;
  private earth: THREE.Mesh;
  private mars: THREE.Mesh;
  private ship: THREE.Sprite;
  private link: THREE.Line;
  private cue: SceneCue = 'orbit';
  private day = 0;
  private demo = false;
  private trail: THREE.Line;

  constructor(tier: Tier) {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.4, 48, 24), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,190,110,1)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(14);
    this.scene.add(sun, glow, new THREE.PointLight('#fff1dc', 600, 0, 1.6), new THREE.AmbientLight('#223', 0.6));
    const ring = (r: number, color: string) => {
      const pts = Array.from({ length: 257 }, (_, i) => new THREE.Vector3(Math.cos((i / 256) * Math.PI * 2) * r, 0, -Math.sin((i / 256) * Math.PI * 2) * r));
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }));
    };
    this.scene.add(ring(AU, '#4f8dff'), ring(AU * 1.524, '#ff8a3d'));
    const size = texSize(tier) / 2;
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16), new THREE.MeshStandardMaterial({ map: earthTexture(size).map, roughness: 0.8 }));
    this.mars = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), new THREE.MeshStandardMaterial({ map: marsTexture(size).map, roughness: 0.95 }));
    this.earth.add(atmosphere(0.62, '#7fb6ff', 2.5, 1));
    this.ship = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(111,211,255,1)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ship.scale.setScalar(1.4);
    // 转移轨道
    const tPts: THREE.Vector3[] = [];
    for (let d = 0; d <= TRANSFER_DAYS; d += 2) { const p = crewPos(d); tPts.push(new THREE.Vector3(p.x * AU, 0, -p.y * AU)); }
    this.trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tPts), new THREE.LineDashedMaterial({ color: '#6fd3ff', dashSize: 0.5, gapSize: 0.35 }));
    this.trail.computeLineDistances();
    this.link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#6fd3ff', transparent: true, opacity: 0.7 }));
    this.scene.add(this.earth, this.mars, this.ship, this.trail, this.link, starField(tier === 'low' ? 1200 : 3000, 1500));
    this.camera.position.set(0, 34, 22);
    this.camera.lookAt(0, 0, 0);
  }

  apply(s: MissionState | null, cue: SceneCue): void {
    this.cue = cue;
    this.day = s?.day ?? 0;
    this.demo = !s || s.day < 0;
    if (cue === 'conjunction') this.day = CONJUNCTION_START + 7;
    this.trail.visible = this.demo || (s ? s.day < ARRIVAL_DAY + 5 : true);
  }

  private place(day: number) {
    const e = earthPos(day), m = marsPos(day), c = crewPos(Math.max(0, day));
    this.earth.position.set(e.x * AU, 0, -e.y * AU);
    this.mars.position.set(m.x * AU, 0, -m.y * AU);
    this.ship.position.set(c.x * AU, 0.3, -c.y * AU);
    this.ship.visible = day >= 0 && day < DEPARTURE_DAY + TRANSFER_DAYS;
    const target = day >= 0 ? this.ship.position : this.mars.position;
    (this.link.geometry as THREE.BufferGeometry).setFromPoints([this.earth.position, target]);
    const mat = this.link.material as THREE.LineBasicMaterial;
    mat.color.set(this.cue === 'conjunction' ? '#ff5f56' : '#6fd3ff');
  }

  tick(dt: number, t: number): void {
    const day = this.demo ? ((t * 22) % (TRANSFER_DAYS + 60)) - 30 : this.day;
    this.place(day);
    this.earth.rotation.y += dt * 0.6;
    this.mars.rotation.y += dt * 0.5;
    const a = t * 0.03;
    this.camera.position.set(Math.sin(a) * 24, 30, Math.cos(a) * 24);
    this.camera.lookAt(0, 0, 0);
  }

  dispose(): void { disposeTree(this.scene); }
}

// ---------------- 地球（发射、回家） ----------------
export class EarthScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
  exposure = 1.0;
  private globe = new THREE.Group();
  private clouds: THREE.Mesh;
  private streak: THREE.Sprite;
  private cue: SceneCue = 'launch';

  constructor(tier: Tier) {
    const size = texSize(tier);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), new THREE.MeshStandardMaterial({ map: earthTexture(size).map, roughness: 0.7, metalness: 0.05 }));
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(10.12, 96, 64), new THREE.MeshStandardMaterial({ map: cloudTexture(size / 2), transparent: true, depthWrite: false }));
    this.globe.add(earth, this.clouds, atmosphere(10.5, '#69a8ff', 2.6, 1.4));
    this.globe.rotation.z = 0.4;
    this.streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,200,140,1)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.streak.scale.setScalar(1.2);
    const sun = new THREE.DirectionalLight('#ffffff', 2.4);
    sun.position.set(-25, 8, 18);
    this.scene.add(this.globe, this.streak, sun, new THREE.AmbientLight('#0a1530', 0.5), starField(tier === 'low' ? 1500 : 4000, 900));
    this.camera.position.set(0, 2, 36);
  }

  apply(_s: MissionState | null, cue: SceneCue): void { this.cue = cue; }

  tick(dt: number, t: number): void {
    this.globe.rotation.y += dt * 0.03;
    this.clouds.rotation.y += dt * 0.01;
    const p = (t * 0.12) % 1;
    if (this.cue === 'launch') this.streak.position.set(-3 + p * 18, 6 + p * p * 16, 8 + p * 6);
    else this.streak.position.set(14 - p * 10, 14 - p * 9, 6);
    (this.streak.material as THREE.SpriteMaterial).opacity = Math.sin(p * Math.PI);
    this.camera.lookAt(0, 0, 0);
  }

  dispose(): void { disposeTree(this.scene); }
}

// ---------------- 飞船巡航（含太阳粒子事件） ----------------
export class ShipScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 3000);
  exposure = 1.0;
  private ship = new THREE.Group();
  private wall: THREE.Object3D;
  private particles: THREE.Points;
  private alarm: THREE.PointLight;
  private spe = false;

  constructor(tier: Tier) {
    const metal = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.6, roughness: 0.35 });
    const foil = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.9, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2f38', metalness: 0.4, roughness: 0.6 });
    const panel = new THREE.MeshStandardMaterial({ color: '#1b2c5a', metalness: 0.3, roughness: 0.25, emissive: '#06102a' });
    const hab = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 32), metal);
    hab.rotation.z = Math.PI / 2;
    const node = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), metal);
    node.position.x = 4.2;
    const lander = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.2, 32), foil);
    lander.rotation.z = -Math.PI / 2;
    lander.position.x = 7;
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.9, 3, 24), dark);
    engine.rotation.z = Math.PI / 2;
    engine.position.x = -5;
    const truss = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 22), dark);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 8.5), panel);
    wingL.position.z = 6.5;
    const wingR = wingL.clone();
    wingR.position.z = -6.5;
    this.wall = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.35, 16, 48), new THREE.MeshStandardMaterial({ color: '#7fb6ff', metalness: 0.2, roughness: 0.2, transparent: true, opacity: 0.85 }));
    this.wall.rotation.y = Math.PI / 2;
    this.wall.position.x = -1;
    this.ship.add(hab, node, lander, engine, truss, wingL, wingR, this.wall);
    this.ship.rotation.set(0.2, 0.6, 0.05);
    const sun = new THREE.DirectionalLight('#fff3e0', 3);
    sun.position.set(-40, 15, 10);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,220,170,1)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    sunGlow.position.set(-400, 150, 100);
    sunGlow.scale.setScalar(120);
    this.alarm = new THREE.PointLight('#ff3b2f', 0, 40);
    this.alarm.position.set(0, 4, 4);
    const n = tier === 'low' ? 600 : 2000;
    const pos = new Float32Array(n * 3);
    const r = mulberry(5);
    for (let i = 0; i < n; i++) pos.set([-200 + r() * 260, (r() - 0.5) * 60, (r() - 0.5) * 60], i * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ff9b7a', size: 0.35, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.particles.visible = false;
    this.scene.add(this.ship, sun, sunGlow, this.alarm, this.particles, new THREE.AmbientLight('#203050', 0.4), starField(tier === 'low' ? 1500 : 4000, 1200));
    this.camera.position.set(6, 5, 20);
  }

  apply(s: MissionState | null, cue: SceneCue): void {
    this.spe = cue === 'spe';
    this.particles.visible = this.spe;
    this.wall.visible = !!s?.loadout.includes('water_wall');
  }

  tick(dt: number, t: number): void {
    this.ship.rotation.y += dt * 0.02;
    this.ship.position.y = Math.sin(t * 0.4) * 0.3;
    if (this.spe) {
      const p = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i) + dt * 90;
        if (x > 60) x -= 260;
        p.setX(i, x);
      }
      p.needsUpdate = true;
      this.alarm.intensity = (Math.sin(t * 6) > 0 ? 1 : 0) * 60;
      this.camera.position.x = 6 + Math.sin(t * 37) * 0.05;
    } else this.alarm.intensity = 0;
    const a = t * 0.04;
    this.camera.position.set(Math.sin(a) * 18 + 4, 5, Math.cos(a) * 18);
    this.camera.lookAt(0, 0, 0);
  }

  dispose(): void { disposeTree(this.scene); }
}

// ---------------- 进入、下降与着陆 ----------------
export class EdlScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  exposure = 1.1;
  private capsule = new THREE.Group();
  private plasma: THREE.Mesh;
  private chute: THREE.Mesh;
  private sky: THREE.Mesh;
  private sparks: THREE.Points;

  constructor(tier: Tier) {
    const shell = new THREE.Mesh(new THREE.ConeGeometry(2, 2.4, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    shell.position.y = 1.2;
    const shield = new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 16, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), new THREE.MeshStandardMaterial({ color: '#4a2b1a', roughness: 0.9, emissive: '#ff5a1a', emissiveIntensity: 1.6 }));
    shield.position.y = 1.85;
    this.plasma = new THREE.Mesh(new THREE.ConeGeometry(3.4, 9, 48, 1, true), new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    this.plasma.position.y = 4.4;
    this.chute = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.8, side: THREE.DoubleSide, emissive: '#331a10' }));
    this.chute.position.y = 14;
    this.chute.visible = false;
    this.capsule.add(shell, shield, this.plasma, this.chute);
    // 天空：从太空黑到火星大气的橙色
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { k: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float k; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 space = vec3(0.01,0.01,0.02); vec3 haze = mix(vec3(0.85,0.52,0.32), vec3(0.62,0.38,0.24), clamp(h*0.5+0.5,0.0,1.0)); vec3 limb = mix(vec3(0.75,0.35,0.18), space, smoothstep(-0.2,0.6,h)); gl_FragColor = vec4(mix(limb, haze, k), 1.0); }',
    }));
    const n = tier === 'low' ? 300 : 900;
    const pos = new Float32Array(n * 3);
    const r = mulberry(9);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 8, r() * 60, (r() - 0.5) * 8], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffb070', size: 0.25, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const light = new THREE.DirectionalLight('#ffe0c0', 2);
    light.position.set(10, 20, 10);
    this.scene.add(this.sky, this.capsule, this.sparks, light, new THREE.AmbientLight('#552211', 0.6));
    this.camera.position.set(10, -6, 18);
  }

  apply(): void {}

  tick(dt: number, t: number): void {
    const phase = (t % 24) / 24; // 24 秒循环：黑障 → 开伞 → 动力下降
    const hot = phase < 0.5;
    this.plasma.visible = hot;
    (this.plasma.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.random() * 0.2;
    this.plasma.scale.set(1, 1 + Math.sin(t * 20) * 0.04, 1);
    this.chute.visible = phase > 0.5 && phase < 0.85;
    this.sparks.visible = hot;
    (this.sky.material as THREE.ShaderMaterial).uniforms.k.value = Math.min(1, phase * 1.6);
    const p = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 40; if (y > 60) y = 0; p.setY(i, y); }
    p.needsUpdate = true;
    this.capsule.rotation.x = Math.sin(t * 1.3) * 0.06;
    this.capsule.rotation.z = Math.sin(t * 0.9) * 0.05;
    this.camera.position.x = 9 + (hot ? Math.sin(t * 50) * 0.08 : 0);
    this.camera.lookAt(0, 2, 0);
  }

  dispose(): void { disposeTree(this.scene); }
}

// 笨笨：营地的四足搬运机器人（致敬《流浪地球》）。机头朝 +x，返回身体与四个髋关节
function benbenModel(): { body: THREE.Group; hips: THREE.Group[] } {
  const shell = new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.55, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.7, metalness: 0.3 });
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.2), shell);
  torso.position.y = 1.6;
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1), dark); // 背上的货箱
  cargo.position.y = 2.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8), shell);
  head.position.set(1.3, 1.8, 0);
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: '#7fd1ff' }));
  lamp.position.set(1.56, 1.85, 0);
  lamp.rotation.y = Math.PI / 2;
  body.add(torso, cargo, head, lamp);
  const hips = [[0.8, 0.6], [0.8, -0.6], [-0.8, 0.6], [-0.8, -0.6]].map(([x, z]) => {
    const hip = new THREE.Group();
    hip.position.set(x, 1.4, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 1.4, 8), dark);
    leg.position.y = -0.7;
    hip.add(leg);
    body.add(hip);
    return hip;
  });
  return { body, hips };
}

// ---------------- 火星地表基地 ----------------
export class SurfaceScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);
  exposure = 1.0;
  private terrain: THREE.Mesh | null = null;
  private base = new THREE.Group();
  private skyMat: THREE.ShaderMaterial;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private dust: THREE.Points;
  private mav = new THREE.Group();
  private flame: THREE.Mesh;
  private siteId: SiteId | null = null;
  private loadoutKey = '';
  private cue: SceneCue = 'surface';
  private tau = 0.5;
  private fog = new THREE.FogExp2('#c08a5e', 0.0012);
  private heightAt: (x: number, z: number) => number = () => 0;
  private benben: { body: THREE.Group; hips: THREE.Group[] } | null = null;

  constructor(private tier: Tier) {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6).normalize() }, tau: { value: 0.5 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sunDir; uniform float tau; varying vec3 vD;
        void main(){
          float h = clamp(vD.y, -0.1, 1.0);
          vec3 zenith = vec3(0.55,0.38,0.27); vec3 horizon = vec3(0.86,0.66,0.47);
          vec3 c = mix(horizon, zenith, pow(max(h,0.0), 0.6));
          float sd = max(dot(vD, sunDir), 0.0);
          c += vec3(0.55,0.7,0.95) * pow(sd, 18.0) * 0.6;   // 火星蓝色日晕
          c += vec3(1.0,0.95,0.85) * pow(sd, 900.0) * 2.0;
          float storm = clamp((tau - 0.5) / 8.5, 0.0, 1.0);
          c = mix(c, vec3(0.42,0.22,0.12), storm * 0.85);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), this.skyMat));
    this.sun = new THREE.DirectionalLight('#fff0dc', 2.4);
    this.sun.position.set(320, 190, -380);
    if (tier === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const c = this.sun.shadow.camera as THREE.OrthographicCamera;
      c.left = -110; c.right = 110; c.top = 110; c.bottom = -110; c.near = 10; c.far = 1500;
      this.sun.shadow.bias = -0.0005;
    }
    this.hemi = new THREE.HemisphereLight('#e3b48a', '#5a2c18', 0.9);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = this.fog;

    const n = tier === 'low' ? 800 : 3000;
    const pos = new Float32Array(n * 3);
    const r = mulberry(13);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 400, r() * 60, (r() - 0.5) * 400], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: '#d9a070', size: 0.6, transparent: true, opacity: 0.5, depthWrite: false }));
    this.scene.add(this.dust);

    // 上升器
    const white = new THREE.MeshStandardMaterial({ color: '#e8e8e8', metalness: 0.3, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 16, 32), white);
    body.position.y = 8;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 32), white);
    nose.position.y = 18.5;
    const legs = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 8), new THREE.MeshStandardMaterial({ color: '#555' }));
      leg.position.set(Math.cos((i * Math.PI) / 2) * 3, 2, Math.sin((i * Math.PI) / 2) * 3);
      leg.rotation.z = Math.cos((i * Math.PI) / 2) * 0.35;
      leg.rotation.x = -Math.sin((i * Math.PI) / 2) * 0.35;
      legs.add(leg);
    }
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(1.8, 10, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flame.rotation.x = Math.PI;
    this.flame.position.y = -5;
    this.flame.visible = false;
    this.mav.add(body, nose, legs, this.flame);
    this.mav.position.set(38, 0, -30);
    this.scene.add(this.base, this.mav);
    this.camera.position.set(-40, 14, 46);
  }

  private buildTerrain(siteId: SiteId) {
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); (this.terrain.material as THREE.Material).dispose(); }
    const site = siteById(siteId)!;
    const size = 900;
    const seg = this.tier === 'high' ? 256 : this.tier === 'medium' ? 160 : 96;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const prof = site.profile;
    const mid = prof[Math.floor(prof.length / 2)];
    const vertical = 70; // 每 km 对应的场景单位（夸大地形）
    const rough = siteId === 'jezero' ? 1.6 : siteId === 'arcadia' ? 0.7 : 0.6;
    const r = mulberry(siteId.length * 97);
    const craters = Array.from({ length: 26 }, () => ({ x: (r() - 0.5) * size, z: (r() - 0.5) * size, rad: 6 + r() * 40 }));
    this.heightAt = (x, z) => {
      const u = (x / size + 0.5) * (prof.length - 1);
      const i = Math.max(0, Math.min(prof.length - 2, Math.floor(u)));
      const f = u - i;
      const s = f * f * (3 - 2 * f);
      let hgt = ((prof[i] * (1 - s) + prof[i + 1] * s) - mid) * vertical;
      hgt += (fbm3(x * 0.01, 0, z * 0.01, 5, 2) - 0.5) * 14 * rough;
      hgt += (ridged3(x * 0.03, 1, z * 0.03, 3, 4) - 0.3) * 3 * rough;
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.rad;
        if (d < 1.4) hgt += d < 1 ? -(1 - d * d) * c.rad * 0.18 : (1.4 - d) * c.rad * 0.1;
      }
      const flat = Math.min(1, Math.hypot(x, z) / 70);
      return hgt * flat * flat;
    };
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const lo = new THREE.Color('#5c3320'), hi = new THREE.Color('#b27a52'), icey = new THREE.Color('#d8c4b4');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      const n = fbm3(x * 0.02, 5, z * 0.02, 4, 8);
      const c = lo.clone().lerp(hi, Math.min(1, Math.max(0, n * 1.3 - 0.1)));
      if (siteId === 'arcadia') c.lerp(icey, Math.max(0, n - 0.6) * 0.8);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tex = groundTexture(this.tier === 'low' ? 128 : 256, 3);
    tex.repeat.set(16, 16);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.97, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = this.tier === 'high';
    this.scene.add(this.terrain);
    this.mav.position.y = this.heightAt(38, -30);
    this.buildScenery(siteId);
  }

  private scenery = new THREE.Group();

  // 岩石与远山：提供尺度感与纵深
  private buildScenery(siteId: SiteId) {
    disposeTree(this.scenery);
    this.scenery.clear();
    const r = mulberry(siteId.length * 131 + 7);
    const count = this.tier === 'high' ? 700 : this.tier === 'medium' ? 420 : 200;
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#4a2c1e', roughness: 0.95, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const density = siteId === 'jezero' ? 1.6 : siteId === 'arcadia' ? 0.6 : 1;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const ang = r() * Math.PI * 2, dist = 28 + Math.pow(r(), 0.7) * 380;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      if (r() > density * 0.75) continue;
      const s = (0.25 + Math.pow(r(), 3) * 2.6) * (siteId === 'jezero' ? 1.3 : 1);
      p.set(x, this.heightAt(x, z) + s * 0.25, z);
      q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3));
      sc.set(s * (0.8 + r() * 0.6), s * (0.45 + r() * 0.4), s * (0.8 + r() * 0.6));
      rocks.setMatrixAt(n++, m.compose(p, q, sc));
    }
    rocks.count = n;
    rocks.castShadow = this.tier === 'high';
    rocks.receiveShadow = this.tier === 'high';
    this.scenery.add(rocks);
    // 远山：被雾气淡化的低矮台地
    const hillMat = new THREE.MeshStandardMaterial({ color: '#8a5634', roughness: 1, flatShading: true });
    const hills = siteId === 'jezero' ? 18 : 10;
    for (let i = 0; i < hills; i++) {
      const ang = (i / hills) * Math.PI * 2 + r() * 0.4;
      const dist = 520 + r() * 260;
      const w = 90 + r() * 160;
      const hgt = (siteId === 'jezero' ? 55 : 22) + r() * 30;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
      hill.scale.set(w, hgt, w * (0.5 + r() * 0.6));
      hill.position.set(Math.cos(ang) * dist, -6, Math.sin(ang) * dist);
      hill.rotation.y = r() * Math.PI;
      this.scenery.add(hill);
    }
    this.scene.add(this.scenery);
  }

  private buildBase(s: MissionState) {
    disposeTree(this.base);
    this.base.clear();
    this.benben = null;
    const white = new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.6, metalness: 0.15 });
    const solar = new THREE.MeshStandardMaterial({ color: '#1d2f5e', roughness: 0.3, metalness: 0.5, emissive: '#050b1c' });
    const add = (m: THREE.Object3D, x: number, z: number, lift = 0) => {
      m.position.set(x, this.heightAt(x, z) + lift, z);
      m.traverse((c) => { (c as THREE.Mesh).castShadow = this.tier === 'high'; });
      this.base.add(m);
      return m;
    };
    const landing = this.cue === 'landing';
    if (landing) {
      const lander = new THREE.Group();
      const foil = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.85, roughness: 0.35 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 3.2, 8), foil);
      body.position.y = 3.6;
      const cabin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 3.4, 16), white);
      cabin.position.y = 6.8;
      lander.add(body, cabin);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5, 8), new THREE.MeshStandardMaterial({ color: '#6b6f76', metalness: 0.6 }));
        leg.position.set(Math.cos(a) * 3.8, 1.8, Math.sin(a) * 3.8);
        leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 12), new THREE.MeshStandardMaterial({ color: '#6b6f76' }));
        pad.position.set(Math.cos(a) * 4.9, 0.1, Math.sin(a) * 4.9);
        lander.add(leg, pad);
      }
      add(lander, 0, 0);
      return;
    }
    // 居住舱（两个卧式圆柱 + 连接节点）
    const hab = new THREE.Group();
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 12, 32), white);
    c1.rotation.z = Math.PI / 2;
    c1.position.y = 3.4;
    hab.add(c1);
    if (s.loadout.includes('regolith') && !landing) {
      const berm = new THREE.Mesh(new THREE.SphereGeometry(7.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9a5634', roughness: 1 }));
      berm.scale.set(1.2, 0.7, 0.9);
      hab.add(berm);
    }
    add(hab, 0, 0);
    this.benben = benbenModel();
    add(this.benben.body, -4, -11);
    if (!landing) {
      const hab2 = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 10, 32), white);
      hab2.rotation.x = Math.PI / 2;
      add(hab2, 0, 12, 3.2);
    }
    const solarKW = s.loadout.filter((m) => m.startsWith('solar')).length;
    const rows = solarKW ? 3 + solarKW * 2 : 1;
    for (let i = 0; i < rows; i++) {
      const p = new THREE.Group();
      const panelMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 4), solar);
      panelMesh.rotation.x = -0.5;
      panelMesh.position.y = 1.6;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 8), white);
      post.position.y = 0.8;
      p.add(panelMesh, post);
      add(p, -26 + (i % 4) * 11, -18 - Math.floor(i / 4) * 7);
    }
    if (s.loadout.includes('fission')) {
      const reactor = new THREE.Group();
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 4, 16), new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.7, roughness: 0.35 }));
      core.position.y = 2;
      reactor.add(core);
      for (let i = 0; i < 6; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.5, 3), new THREE.MeshStandardMaterial({ color: '#3a3f46', metalness: 0.5 }));
        fin.position.set(Math.cos((i / 6) * Math.PI * 2) * 2.4, 3, Math.sin((i / 6) * Math.PI * 2) * 2.4);
        fin.rotation.y = -(i / 6) * Math.PI * 2;
        reactor.add(fin);
      }
      add(reactor, 60, 40);
    }
    if (s.loadout.includes('greenhouse') && !landing) {
      const gh = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#bfe6c8', transparent: true, opacity: 0.55, roughness: 0.1, emissive: '#2f6b3a', emissiveIntensity: 0.4 }));
      add(gh, 16, 4);
    }
    if (s.loadout.includes('rover') && !landing) {
      const rover = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 3.2), white);
      b.position.y = 2;
      rover.add(b);
      for (const [x, z] of [[-2, 1.8], [2, 1.8], [-2, -1.8], [2, -1.8]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 16), new THREE.MeshStandardMaterial({ color: '#222' }));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.8, z);
        rover.add(w);
      }
      add(rover, -14, 18).rotation.y = 0.6;
    }
    if (s.loadout.includes('ice_drill') && !landing) {
      const rig = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.4, 9, 6), new THREE.MeshStandardMaterial({ color: '#ff9b3d', metalness: 0.4, roughness: 0.5 }));
      add(rig, 24, -16, 4.5);
    }
    if (s.crew.some((c) => c.status === 'lost' || c.status === 'stayed')) {
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 8), white);
      pole.position.y = 2;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshStandardMaterial({ color: '#d62a1e', side: THREE.DoubleSide }));
      cloth.position.set(0.9, 3.4, 0);
      flag.add(pole, cloth);
      add(flag, -8, 8);
    }
  }

  apply(s: MissionState | null, cue: SceneCue): void {
    this.cue = cue;
    const site = (s?.site ?? 'utopia') as SiteId;
    if (site !== this.siteId) { this.siteId = site; this.buildTerrain(site); this.loadoutKey = ''; }
    if (s) {
      const key = `${cue === 'landing'}|${s.loadout.join(',')}|${s.crew.map((c) => c.status).join(',')}`;
      if (key !== this.loadoutKey) { this.loadoutKey = key; this.buildBase(s); }
    }
    this.tau = cue === 'storm' ? 9 : s?.dustTau ?? 0.5;
    this.flame.visible = cue === 'ascent';
  }

  tick(dt: number, t: number): void {
    const storm = Math.min(1, Math.max(0, (this.tau - 0.5) / 8.5));
    this.skyMat.uniforms.tau.value = this.tau;
    this.fog.density = 0.0012 + storm * 0.012;
    this.fog.color.set(storm > 0.3 ? '#6e3a1f' : '#c08a5e');
    this.sun.intensity = 2.4 * (1 - storm * 0.85);
    this.hemi.intensity = 0.9 * (1 - storm * 0.5);
    const p = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const wind = 4 + storm * 60;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i) + dt * wind; if (x > 200) x -= 400; p.setX(i, x); }
    p.needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.25 + storm * 0.6;
    if (this.benben) {
      // 在居住舱与太阳能板之间来回巡检，走到两端时原地掉头
      const x = -4 + 14 * Math.sin(t * 0.07);
      const v = Math.cos(t * 0.07);
      const { body, hips } = this.benben;
      body.position.set(x, this.heightAt(x, -11), -11);
      body.rotation.y = (1 - Math.max(-1, Math.min(1, v * 4))) * (Math.PI / 2);
      hips.forEach((hip, i) => { hip.rotation.z = Math.sin(t * 6 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45 * Math.abs(v); });
    }
    if (this.cue === 'ascent') {
      const k = (t % 16) / 16;
      this.mav.position.y = this.heightAt(38, -30) + Math.max(0, k - 0.15) ** 2 * 400;
      (this.flame.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.random() * 0.35;
      this.camera.position.set(-10, 20 + this.mav.position.y * 0.3, 70);
      this.camera.lookAt(this.mav.position.x, this.mav.position.y + 10, this.mav.position.z);
      return;
    }
    this.mav.position.y = this.heightAt(38, -30);
    const a = t * 0.02 + 0.6;
    const R = this.cue === 'landing' ? 34 : 82;
    const cx = Math.sin(a) * R, cz = Math.cos(a) * R;
    const lift = this.cue === 'landing' ? 6 : 24;
    this.camera.position.set(cx, Math.max(this.heightAt(cx, cz) + 4, lift + Math.sin(t * 0.1) * 2), cz);
    this.camera.lookAt(0, this.cue === 'landing' ? 5 : 2, 0);
  }

  dispose(): void { disposeTree(this.scene); }
}

export function sceneKind(cue: SceneCue): 'globe' | 'orbit' | 'earth' | 'ship' | 'edl' | 'surface' {
  switch (cue) {
    case 'control': return 'globe';
    case 'orbit': case 'conjunction': return 'orbit';
    case 'launch': case 'home': return 'earth';
    case 'cruise': case 'spe': return 'ship';
    case 'edl': return 'edl';
    default: return 'surface';
  }
}
