import * as THREE from 'three';
import type { SceneCue } from '../../core/content';
import type { MissionState } from '../../core/types';
import { latLonToVec, planetTexture } from '../assets';
import type { Shot } from '../director';
import { dotTexture, HOLO_RED, HOLO_WHITE, HoloArc, holoLabel } from '../holo';
import { mulberry } from '../noise';
import { marsTexture, starField } from '../textures';
import { detailPatch } from './globe';
import { atmosphere, disposeTree, glow, makeMats, useEnv, type SceneCtx, type SceneModule } from './common';

const PR = 240; // 火星半径（场景单位，只显示局部弧面）

// 等离子鞘套：菲涅尔辉光 + 流动噪声，粉橙色
function plasmaMat(fade = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 1 }, uFade: { value: fade } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform float uTime; uniform float uHeat; uniform float uFade; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float fres = pow(1.0 - abs(dot(vN, vV)), 1.6);
        float flow = n(vP * 1.6 + vec3(uTime * 6.0, 0.0, 0.0)) * 0.6 + n(vP * 4.0 + vec3(uTime * 11.0, 0.0, 0.0)) * 0.4;
        vec3 hot = mix(vec3(1.0, 0.36, 0.14), vec3(1.0, 0.7, 0.45), flow);
        vec3 col = mix(hot, vec3(0.95, 0.4, 0.75), smoothstep(0.6, 1.0, fres) * 0.5);
        float along = clamp((vP.y + 4.5) / 9.0, 0.0, 1.0);
        float tail = mix(1.0, pow(1.0 - along, 2.2), uFade);
        float edge = mix(0.03 + pow(fres, 1.5) * 0.95, fres * fres, uFade);
        gl_FragColor = vec4(col * (1.0 + (1.0 - along) * uFade * 0.8), edge * (0.4 + flow * 0.6) * tail * uHeat);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// 进入舱（着陆器包在气动外壳里）：防热罩朝 -y（局部），即运动方向
export function buildCapsule(m: ReturnType<typeof makeMats>): THREE.Group {
  const g = new THREE.Group();
  // 70° 球锥：鼻锥小圆弧 + 锥面，边缘略向后收
  const prof = [new THREE.Vector2(0, -0.55), new THREE.Vector2(0.45, -0.5), new THREE.Vector2(0.9, -0.38), new THREE.Vector2(2.3, 0.08), new THREE.Vector2(2.45, 0.2), new THREE.Vector2(2.35, 0.3), new THREE.Vector2(0, 0.3)];
  const shield = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshStandardMaterial({ color: '#3b2a20', roughness: 0.85, metalness: 0.1 }));
  shield.position.y = -0.2;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 2.35, 2.2, 48, 1), m.foil);
  back.position.y = 1.0;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 0.5, 32), m.white);
  cap.position.y = 2.35;
  g.add(shield, back, cap);
  return g;
}

// ---------------- 进入、下降与着陆：远处的火星弧面 + 进入舱 ----------------
export class EdlScene implements SceneModule {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 6000);
  exposure = 1.05;
  private capsule = new THREE.Group();
  private vehicle: THREE.Group;
  private cruiseStage: THREE.Group;
  private plasma: THREE.Group;
  private plasmaMats: THREE.ShaderMaterial[] = [];
  private sparks: THREE.Points;
  private sparkSeed: Float32Array;
  private corridor: THREE.Group;
  private entryLabel: THREE.Sprite;
  private phase: 'approach' | 'entry' = 'approach';
  private t0 = 0;
  private dir = new THREE.Vector3(1, -0.22, 0).normalize(); // 运动方向

  constructor(ctx: SceneCtx) {
    const m = makeMats(ctx.tier);
    useEnv(ctx, this.scene, 'space', 0.7);
    const marsMat = new THREE.MeshStandardMaterial({ map: planetTexture('mars', ctx.tier, () => marsTexture(512).map), roughness: 0.97 });
    detailPatch(marsMat);
    const mars = new THREE.Mesh(new THREE.SphereGeometry(PR, 160, 120), marsMat);
    const planet = new THREE.Group();
    planet.add(mars, atmosphere(PR * 1.02, '#e8a57a', 5, 1.0, new THREE.Vector3(-0.3, 1, 0.3)), atmosphere(PR * 1.006, '#ffd2b0', 2, 0.25));
    planet.position.set(0, -PR - 95, -60);
    // 把乌托邦平原（25°N, 110°E）转到进入舱前下方
    const site = latLonToVec(25, 110, 1);
    const ahead = new THREE.Vector3(70, -95, -60).sub(planet.position).normalize();
    planet.quaternion.setFromUnitVectors(site, ahead);
    this.vehicle = buildCapsule(m);
    // 运动方向朝 dir：把局部 -y（防热罩）对准 dir
    this.vehicle.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.dir);
    this.capsule.add(this.vehicle);
    // 巡航级：分离后缓慢后退的环形太阳能级
    this.cruiseStage = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 40, 1, true), m.panel);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.08, 40), new THREE.MeshStandardMaterial({ color: '#1b2a55', roughness: 0.3, metalness: 0.6 }));
    deck.position.y = 0.25;
    this.cruiseStage.add(ring, deck);
    this.cruiseStage.quaternion.copy(this.vehicle.quaternion);
    this.capsule.add(this.cruiseStage);
    // 等离子鞘套：前方的冲击层 + 向后收拢的尾流
    this.plasma = new THREE.Group();
    const front = new THREE.Mesh(new THREE.SphereGeometry(3.1, 48, 16, 0, Math.PI * 2, Math.PI - 0.95, 0.95), plasmaMat());
    front.position.y = 1.2;
    const wake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.7, 9, 48, 8, true), plasmaMat(1));
    wake.position.y = 5.2;
    this.plasma.add(front, wake);
    this.plasmaMats = [front.material as THREE.ShaderMaterial, wake.material as THREE.ShaderMaterial];
    this.plasma.quaternion.copy(this.vehicle.quaternion);
    this.capsule.add(this.plasma);
    // 火花：从防热罩边缘向后飞散
    const N = ctx.tier === 'low' ? 200 : 600;
    const pos = new Float32Array(N * 3);
    this.sparkSeed = new Float32Array(N * 3);
    const r = mulberry(9);
    for (let i = 0; i < N; i++) this.sparkSeed.set([r(), r() * Math.PI * 2, 0.5 + r()], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTexture(), color: '#ffa860', size: 0.12, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparks.frustumCulled = false;
    // 全息：进入走廊（两条边界弧）与进入点标签
    this.corridor = new THREE.Group();
    for (const dz of [-2.5, 2.5]) {
      const pts = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(i * 14, -i * i * 1.3, dz + i * 0.4));
      this.corridor.add(new HoloArc(pts, { color: HOLO_WHITE, opacity: 0.45, dash: 1.2, gap: 0.8, speed: 2 }).obj);
    }
    const center = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(i * 14, -i * i * 1.3, i * 0.4));
    this.corridor.add(new HoloArc(center, { color: HOLO_RED, opacity: 0.7, dash: 0.6, gap: 0.6, speed: 3 }).obj);
    this.entryLabel = holoLabel('ENTRY INTERFACE', '进入界面 · 高度 125 km', HOLO_RED, 0.042);
    this.entryLabel.position.set(14, -1, 0);
    this.corridor.add(this.entryLabel);
    const sun = new THREE.DirectionalLight('#ffe9d0', 2.1);
    sun.position.set(-30, 40, 30);
    const sunGlow = glow('rgba(255,236,210,1)', 120);
    sunGlow.position.set(-700, 500, 600);
    this.scene.add(planet, this.capsule, this.sparks, this.corridor, sun, sunGlow, new THREE.AmbientLight('#402018', 0.35), starField(ctx.tier === 'low' ? 1500 : 3500, 2500));
  }

  shots(): Shot[] {
    return [
      { from: [5, 6, 19], to: [2, 4.5, 15], look: [0, -2, 0], fov: 42, dur: 18 },
      { from: [6, 3, 17], to: [4, 2.4, 14], look: [0, 0, 0], fov: 46, dur: 16, shake: 0.03 },
      { from: [7, -3.5, 7], to: [6, -2.5, 6], look: [0, 0, 0], fov: 46, dur: 14, shake: 0.03 },
    ];
  }

  onShot(_cue: SceneCue, index: number, _beat: string | undefined, now: number): void {
    this.phase = index === 0 ? 'approach' : 'entry';
    this.t0 = now;
  }

  apply(_s: MissionState | null): void {}

  tick(_dt: number, t: number): void {
    const entry = this.phase === 'entry';
    const tt = t - this.t0;
    // 巡航级分离：简报段落里缓慢退开
    this.cruiseStage.visible = !entry;
    if (!entry) this.cruiseStage.position.copy(this.dir).multiplyScalar(-Math.min(9, 3 + tt * 0.3));
    const heat = entry ? Math.min(1, tt / 2) : 0;
    this.plasma.visible = heat > 0;
    for (const m of this.plasmaMats) { m.uniforms.uTime.value = t; m.uniforms.uHeat.value = heat * (0.85 + Math.random() * 0.15); }
    this.corridor.visible = !entry;
    this.sparks.visible = entry;
    if (entry) {
      const p = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
      const back = this.dir.clone().negate();
      const side1 = new THREE.Vector3(0, 0, 1), side2 = back.clone().cross(side1).normalize();
      for (let i = 0; i < p.count; i++) {
        const [ph, ang, sp] = this.sparkSeed.subarray(i * 3, i * 3 + 3);
        const k = (ph + t * 0.9 * sp) % 1;
        const rad = 2.4 + k * 2.5;
        const v = back.clone().multiplyScalar(-0.5 + k * 16).addScaledVector(side1, Math.cos(ang) * rad).addScaledVector(side2, Math.sin(ang) * rad);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      p.needsUpdate = true;
    }
    this.capsule.rotation.x = Math.sin(t * 1.3) * (entry ? 0.03 : 0.01);
    this.capsule.rotation.z = Math.sin(t * 0.9) * (entry ? 0.025 : 0.01);
  }

  dispose(): void { disposeTree(this.scene); }
}
