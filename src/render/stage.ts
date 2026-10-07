import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { SceneCue } from '../core/content';
import type { MissionState, SiteId } from '../core/types';
import type { Settings } from '../ui/store';
import { EarthScene, EdlScene, MarsGlobeScene, OrbitScene, sceneKind, ShipScene, SurfaceScene, type SceneModule, type Tier } from './scenes';

export interface Stage {
  setScene(cue: SceneCue, s: MissionState | null): void;
  update(s: MissionState): void;
  previewSite(id: SiteId): void;
  setQuality(q: Settings['quality']): void;
  readonly tier: Tier | 'off';
}

// 胶片颗粒 + 暗角
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float amount; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float g = (rand(vUv) - 0.5) * amount; float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
      gl_FragColor = vec4((c.rgb + g) * mix(0.72, 1.0, v), c.a); }`,
};

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const isMobile = () => matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

class FallbackStage implements Stage {
  readonly tier = 'off' as const;
  constructor(container: HTMLElement, private onRestore?: (q: Settings['quality']) => void) {
    container.replaceChildren(Object.assign(document.createElement('div'), { className: 'scene-fallback' }));
  }
  setScene(): void {}
  update(): void {}
  previewSite(): void {}
  setQuality(q: Settings['quality']): void { if (q !== 'off') this.onRestore?.(q); }
}

class ThreeStage implements Stage {
  tier: Tier;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private grain: ShaderPass | null = null;
  private renderPass: RenderPass | null = null;
  private cache = new Map<string, SceneModule>();
  private current: SceneModule | null = null;
  private cue: SceneCue = 'control';
  private state: MissionState | null = null;
  private timer = new THREE.Timer();
  private fpsSamples: number[] = [];
  private auto: boolean;
  private resizeObs: ResizeObserver;

  constructor(private container: HTMLElement, quality: Settings['quality']) {
    this.auto = quality === 'auto';
    this.tier = quality === 'auto' ? (isMobile() ? 'low' : 'medium') : (quality as Tier);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.tier !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.transition = 'opacity 0.35s ease';
    container.replaceChildren(this.renderer.domElement, Object.assign(document.createElement('div'), { className: 'scene-vignette' }));
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.applyTier();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private applyTier(): void {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(this.tier === 'high' ? Math.min(2, dpr) : this.tier === 'medium' ? Math.min(1.25, dpr) : Math.min(0.85, dpr));
    this.renderer.shadowMap.enabled = this.tier === 'high';
    this.composer = null;
    if (this.tier !== 'low') {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), this.tier === 'high' ? 0.7 : 0.5, 0.6, 0.82));
      this.grain = new ShaderPass(GrainShader);
      this.composer.addPass(this.grain);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const hgt = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, hgt, false);
    this.composer?.setSize(w, hgt);
    if (this.current) { this.current.camera.aspect = w / hgt; this.current.camera.updateProjectionMatrix(); }
  }

  private build(kind: string): SceneModule {
    switch (kind) {
      case 'globe': return new MarsGlobeScene(this.tier);
      case 'orbit': return new OrbitScene(this.tier);
      case 'earth': return new EarthScene(this.tier);
      case 'ship': return new ShipScene(this.tier);
      case 'edl': return new EdlScene(this.tier);
      default: return new SurfaceScene(this.tier);
    }
  }

  setScene(cue: SceneCue, s: MissionState | null): void {
    this.cue = cue;
    this.state = s;
    const kind = sceneKind(cue);
    let mod = this.cache.get(kind);
    const switching = mod !== this.current || !mod;
    if (!mod) { mod = this.build(kind); this.cache.set(kind, mod); }
    mod.apply(s, cue);
    if (!switching) return;
    const canvas = this.renderer.domElement;
    canvas.style.opacity = '0';
    setTimeout(() => {
      this.current = mod!;
      this.renderer.toneMappingExposure = mod!.exposure;
      if (this.renderPass) { this.renderPass.scene = mod!.scene; this.renderPass.camera = mod!.camera; }
      this.resize();
      canvas.style.opacity = '1';
    }, this.current ? 300 : 0);
  }

  update(s: MissionState): void {
    this.state = s;
    this.current?.apply(s, this.cue);
  }

  previewSite(id: SiteId): void {
    const globe = this.cache.get('globe') as MarsGlobeScene | undefined;
    if (this.current !== globe) this.setScene('control', this.state);
    (this.cache.get('globe') as MarsGlobeScene).focus(id);
  }

  setQuality(q: Settings['quality']): void {
    this.auto = q === 'auto';
    const next: Tier = q === 'auto' ? (isMobile() ? 'low' : 'medium') : q === 'off' ? 'low' : q;
    if (q === 'off') { this.container.style.visibility = 'hidden'; this.renderer.setAnimationLoop(null); return; }
    this.container.style.visibility = 'visible';
    this.renderer.setAnimationLoop(() => this.frame());
    if (next === this.tier) return;
    this.tier = next;
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
    this.current = null;
    this.applyTier();
    this.setScene(this.cue, this.state);
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    const t = this.timer.getElapsed();
    if (!this.current) return;
    this.current.tick(dt, t);
    if (this.grain) this.grain.uniforms.time.value = t;
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.current.scene, this.current.camera);
    this.measure(dt);
  }

  // 自动画质：前 4 秒平均帧率过低则降档
  private measure(dt: number): void {
    if (!this.auto || this.fpsSamples.length > 240) return;
    this.fpsSamples.push(1 / Math.max(dt, 1e-3));
    if (this.fpsSamples.length === 240) {
      const avg = this.fpsSamples.slice(60).reduce((a, b) => a + b, 0) / 180;
      if (avg < 30 && this.tier !== 'low') { this.auto = false; this.setQuality('low'); this.auto = true; }
      else if (avg > 57 && this.tier === 'medium' && !isMobile()) { this.auto = false; this.setQuality('high'); this.auto = true; }
    }
  }
}

export function createStage(container: HTMLElement, quality: Settings['quality']): Stage {
  if (quality === 'off' || !webglAvailable()) {
    return new FallbackStage(container);
  }
  try {
    return new ThreeStage(container, quality);
  } catch {
    return new FallbackStage(container);
  }
}
