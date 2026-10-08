import * as THREE from 'three';
import type { SceneCue } from '../../core/content';
import type { MissionState } from '../../core/types';
import type { Shot } from '../director';
import { envMap, type EnvKind } from '../env';
import { glowSprite, noiseNormal, panelTexture } from '../textures';

export type Tier = 'high' | 'medium' | 'low';
export type SceneKind = 'globe' | 'orbit' | 'earth' | 'ship' | 'edl' | 'surface';

export interface SceneModule {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  exposure: number;
  shots(cue: SceneCue): Shot[];
  apply(s: MissionState | null, cue: SceneCue): void;
  tick(dt: number, t: number): void; // 只更新场景内容，相机由导演控制
  onShot?(cue: SceneCue, index: number, beat: string | undefined, now: number): void; // 切到新机位时调用，用于启动演出时间轴（now 为渲染时钟）
  fx?: { sensorHits?: number };
  dispose(): void;
}

export interface SceneCtx {
  tier: Tier;
  renderer: THREE.WebGLRenderer;
}

export function sceneKind(cue: SceneCue): SceneKind {
  switch (cue) {
    case 'control': return 'globe';
    case 'orbit': case 'conjunction': return 'orbit';
    case 'launch': case 'home': return 'earth';
    case 'cruise': case 'spe': return 'ship';
    case 'edl': return 'edl';
    default: return 'surface';
  }
}

export const disposeTree = (o: THREE.Object3D) => o.traverse((c) => {
  const m = c as THREE.Mesh;
  m.geometry?.dispose?.();
  const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
  for (const mat of mats) {
    for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
    mat.dispose();
  }
});

export function useEnv(ctx: SceneCtx, scene: THREE.Scene, kind: EnvKind, intensity = 1): void {
  if (ctx.tier === 'low') return;
  scene.environment = envMap(ctx.renderer, kind);
  scene.environmentIntensity = intensity;
}

export const texSize = (tier: Tier) => (tier === 'high' ? 1024 : tier === 'medium' ? 768 : 512);

// 大气边缘：菲涅尔辉光，可选向光面增强（与星球共用父节点、同心）
export function atmosphere(radius: number, color: string, power = 3, intensity = 1.2, sunDir?: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) }, power: { value: power }, intensity: { value: intensity },
      sunDir: { value: (sunDir ?? new THREE.Vector3(0, 0, 0)).clone().normalize() }, useSun: { value: sunDir ? 1 : 0 },
    },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vWN; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vWN = normalize(mat3(modelMatrix)*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 color; uniform float power; uniform float intensity; uniform vec3 sunDir; uniform float useSun;
      varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), power);
        float lit = mix(1.0, smoothstep(-0.25, 0.4, dot(vWN, sunDir)), useSun);
        gl_FragColor = vec4(color*intensity, f*lit); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), mat);
}

export function glow(color: string, scale: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(scale);
  return s;
}

// 统一材质库：航天器与基地共用，保证风格一致
export interface Mats {
  white: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  foil: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  windowWarm: THREE.MeshStandardMaterial;
  nozzle: THREE.MeshStandardMaterial;
}

export function makeMats(tier: Tier): Mats {
  const crumple = tier === 'low' ? null : noiseNormal(256, 3, 2.4, 11);
  if (crumple) crumple.repeat.set(3, 3);
  const pt = panelTexture(4);
  return {
    white: new THREE.MeshStandardMaterial({ color: '#e8eaed', roughness: 0.55, metalness: 0.08 }),
    panel: new THREE.MeshStandardMaterial({ map: pt, color: '#ffffff', roughness: 0.6, metalness: 0.05 }),
    foil: new THREE.MeshStandardMaterial({ color: '#c99a3a', roughness: 0.42, metalness: 1, envMapIntensity: 0.6, normalMap: crumple ?? undefined, normalScale: new THREE.Vector2(0.9, 0.9) }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.7, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.38, metalness: 0.85 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9, metalness: 0 }),
    windowWarm: new THREE.MeshStandardMaterial({ color: '#201810', emissive: '#ffb46a', emissiveIntensity: 1.6, roughness: 0.2 }),
    nozzle: new THREE.MeshStandardMaterial({ color: '#3a3330', roughness: 0.5, metalness: 0.9, side: THREE.DoubleSide }),
  };
}

// 闪烁航行灯
export function navLight(color: string, size = 0.6): THREE.Sprite {
  return glow(color.startsWith('rgba') ? color : `rgba(${parseInt(color.slice(1, 3), 16)},${parseInt(color.slice(3, 5), 16)},${parseInt(color.slice(5, 7), 16)},1)`, size);
}

// 镜头光晕（程序化光晕贴图）
export function sunFlare(intensityScale = 1): THREE.Object3D {
  const g = new THREE.Group();
  const core = glow('rgba(255,250,240,1)', 6 * intensityScale);
  const halo = glow('rgba(255,210,160,0.6)', 26 * intensityScale);
  g.add(halo, core);
  return g;
}
