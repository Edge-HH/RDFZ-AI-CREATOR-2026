import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { SceneCue } from '../core/content';
import type { MissionState, SiteId } from '../core/types';
import type { Settings } from '../ui/store';
import { applySafeArea, Director } from './director';
import { setHoloFlicker, tickHolo } from './holo';
import { sceneKind, type SceneKind, type SceneModule, type Tier } from './scenes/common';
import { EarthScene } from './scenes/earth';
import { EdlScene } from './scenes/edl';
import { MarsGlobeScene } from './scenes/globe';
import { OrbitScene } from './scenes/orbit';
import { ShipScene } from './scenes/ship';
import { SurfaceScene } from './scenes/surface';

export interface Stage {
  setScene(cue: SceneCue, s: MissionState | null, beat?: string): void;
  update(s: MissionState): void;
  previewSite(id: SiteId): void;
  setQuality(q: Settings['quality']): void;
  readonly tier: Tier | 'off';
}

// 胶片颗粒 + 暗角 + 传感器击中（太阳粒子事件时随机亮点）
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amount: { value: 0.05 }, hits: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float amount; uniform float hits; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)) + time) * 43758.5453); }
    float h2(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float g = (rand(vUv) - 0.5) * amount; float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
      vec3 col = (c.rgb + g) * mix(0.72, 1.0, v);
      if (hits > 0.0) { vec2 cell = floor(gl_FragCoord.xy / 2.0); float f = floor(time * 24.0);
        float n = h2(cell + f * 17.0); col += vec3(1.0, 0.95, 0.9) * step(1.0 - 0.0009 * hits, n) * 1.5; }
      gl_FragColor = vec4(col, c.a); }`,
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
  private cache = new Map<SceneKind, SceneModule>();
  private current: SceneModule | null = null;
  private cue: SceneCue = 'control';
  private beat: string | undefined;
  private step = 0; // 当前提示下已经过的段落数
  private state: MissionState | null = null;
  private director = new Director();
  private timer = new THREE.Timer();
  private fpsSamples: number[] = [];
  private auto: boolean;
  private resizeObs: ResizeObserver;
  private switchTimer = 0;

  constructor(private container: HTMLElement, quality: Settings['quality']) {
    this.auto = quality === 'auto';
    this.tier = quality === 'auto' ? (isMobile() ? 'low' : 'medium') : (quality as Tier);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.tier !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // 合成器多次绘制，按整帧统计
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
    setHoloFlicker(this.tier !== 'low');
    this.composer = null;
    this.grain = null;
    if (this.tier !== 'low') {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), this.tier === 'high' ? 0.6 : 0.45, 0.55, 0.86));
      this.grain = new ShaderPass(GrainShader);
      this.composer.addPass(this.grain);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  private size(): [number, number] {
    return [this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight];
  }

  private resize(): void {
    const [w, h] = this.size();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    if (this.current) applySafeArea(this.current.camera, w, h);
  }

  private build(kind: SceneKind): SceneModule {
    const ctx = { tier: this.tier, renderer: this.renderer };
    switch (kind) {
      case 'globe': return new MarsGlobeScene(ctx);
      case 'orbit': return new OrbitScene(ctx);
      case 'earth': return new EarthScene(ctx);
      case 'ship': return new ShipScene(ctx);
      case 'edl': return new EdlScene(ctx);
      default: return new SurfaceScene(ctx);
    }
  }

  private startShot(index: number, cut: boolean): void {
    const mod = this.current;
    if (!mod) return;
    const now = this.timer.getElapsed();
    this.director.play(mod.shots(this.cue), index, now, mod.camera, cut);
    mod.onShot?.(this.cue, this.director.shotIndex, this.beat, now);
  }

  // beat：剧情段落 id。同一提示下段落变化时推进到下一个机位
  setScene(cue: SceneCue, s: MissionState | null, beat?: string): void {
    const prevCue = this.cue, prevBeat = this.beat;
    this.cue = cue;
    this.state = s;
    const kind = sceneKind(cue);
    let mod = this.cache.get(kind);
    if (!mod) { mod = this.build(kind); this.cache.set(kind, mod); }
    mod.apply(s, cue);
    const cueChanged = cue !== prevCue;
    // 段落计数决定机位序号。提示变化时清零：章节开场那次调用不带段落，紧接着的第一个段落不应推进机位
    let stepped = false;
    if (cueChanged) { this.beat = beat; this.step = 0; }
    else if (beat !== undefined) {
      if (prevBeat !== undefined && beat !== prevBeat) { this.step++; stepped = true; }
      this.beat = beat;
    }
    if (mod !== this.current) {
      // 换场景类型：淡出后直接切机位（配合界面的“信号重建”转场）
      const canvas = this.renderer.domElement;
      canvas.style.opacity = '0';
      clearTimeout(this.switchTimer);
      const next = mod;
      this.switchTimer = window.setTimeout(() => {
        this.current = next;
        this.renderer.toneMappingExposure = next.exposure;
        if (this.renderPass) { this.renderPass.scene = next.scene; this.renderPass.camera = next.camera; }
        this.resize();
        this.startShot(this.step, true); // 淡出期间若已进入下一段落，直接用最新的机位序号
        canvas.style.opacity = '1';
      }, this.current ? 300 : 0);
      return;
    }
    if (cueChanged || stepped) this.startShot(this.step, false);
  }

  update(s: MissionState): void {
    this.state = s;
    this.current?.apply(s, this.cue);
  }

  previewSite(id: SiteId): void {
    if (this.current !== this.cache.get('globe')) this.setScene('control', this.state);
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
    this.setScene(this.cue, this.state, this.beat);
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    const t = this.timer.getElapsed();
    if (!this.current) return;
    tickHolo(t);
    this.current.tick(dt, t);
    this.director.update(this.current.camera, t);
    if (this.grain) { this.grain.uniforms.time.value = t; this.grain.uniforms.hits.value = this.current.fx?.sensorHits ?? 0; }
    this.renderer.info.reset();
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

  // 截图检查用：当前场景的面数与绘制调用
  get info(): { triangles: number; calls: number } {
    return { triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls };
  }
}

export function createStage(container: HTMLElement, quality: Settings['quality']): Stage {
  if (quality === 'off' || !webglAvailable()) {
    return new FallbackStage(container);
  }
  try {
    const stage = new ThreeStage(container, quality);
    (window as unknown as { __stage?: ThreeStage }).__stage = stage;
    return stage;
  } catch {
    return new FallbackStage(container);
  }
}
