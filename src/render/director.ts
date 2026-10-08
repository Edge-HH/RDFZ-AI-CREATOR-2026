import * as THREE from 'three';

export type Vec3 = [number, number, number];

// 一个机位：相机从 from 运动到 to，注视 look（可为函数，用于跟踪运动物体）
export interface Shot {
  from: Vec3;
  to: Vec3;
  look: Vec3 | (() => THREE.Vector3);
  lookTo?: Vec3;
  fov?: number;
  dur?: number;
  ease?: 'inOut' | 'out' | 'linear';
  shake?: number;
}

const EASE = {
  inOut: (t: number) => t * t * (3 - 2 * t),
  out: (t: number) => 1 - (1 - t) ** 3,
  linear: (t: number) => t,
};
const BLEND = 1.2; // 同一场景内换机位的过渡时长（秒）

// 竖屏视野补偿：画面越窄，垂直视场越大，避免主体被左右裁掉
let fovScale = 1;
const effFov = (fov: number) => (fovScale === 1 ? fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * fovScale)));

const v = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

// 镜头导演：按段落推进机位、缓动过渡、并把注视点放进界面之外的安全区
export class Director {
  private shots: Shot[] = [];
  private index = 0;
  private start = 0;
  private blendFrom: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  private look = new THREE.Vector3();
  private tmpPos = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();

  get shotIndex(): number { return this.index; }

  // cut=true 直接切换（换场景类型时）；否则从当前位姿缓动过去
  play(shots: Shot[], index: number, now: number, camera: THREE.PerspectiveCamera, cut: boolean): void {
    this.blendFrom = cut || !this.shots.length ? null : { pos: camera.position.clone(), look: this.look.clone(), fov: camera.fov };
    this.shots = shots;
    this.index = shots.length ? index % shots.length : 0;
    this.start = now;
  }

  private pose(shot: Shot, tt: number, pos: THREE.Vector3, look: THREE.Vector3): void {
    const dur = shot.dur ?? 14;
    const k = EASE[shot.ease ?? 'inOut'](Math.min(1, tt / dur));
    pos.copy(v(shot.from)).lerp(v(shot.to), k);
    // 运动结束后保持极小幅度的漂移，画面不至于完全静止
    const drift = Math.max(0, tt - dur);
    pos.x += Math.sin(drift * 0.21) * 0.004 * pos.length();
    pos.y += Math.sin(drift * 0.17 + 1) * 0.003 * pos.length();
    if (typeof shot.look === 'function') look.copy(shot.look());
    else {
      look.copy(v(shot.look));
      if (shot.lookTo) look.lerp(v(shot.lookTo), k);
    }
  }

  update(camera: THREE.PerspectiveCamera, now: number): void {
    const shot = this.shots[this.index];
    if (!shot) return;
    const tt = now - this.start;
    this.pose(shot, tt, this.tmpPos, this.tmpLook);
    let fov = effFov(shot.fov ?? 40);
    if (this.blendFrom) {
      const b = EASE.inOut(Math.min(1, tt / BLEND));
      this.tmpPos.lerpVectors(this.blendFrom.pos, this.tmpPos, b);
      this.tmpLook.lerpVectors(this.blendFrom.look, this.tmpLook, b);
      fov = this.blendFrom.fov + (fov - this.blendFrom.fov) * b;
      if (b >= 1) this.blendFrom = null;
    }
    if (shot.shake) {
      const s = shot.shake;
      this.tmpPos.x += (Math.sin(now * 37) + Math.sin(now * 53)) * s;
      this.tmpPos.y += (Math.sin(now * 41) + Math.sin(now * 61)) * s;
    }
    camera.position.copy(this.tmpPos);
    this.look.copy(this.tmpLook);
    camera.lookAt(this.look);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
}

// 安全区：让投影中心（注视点）落在对话框与选项面板之外
export function applySafeArea(camera: THREE.PerspectiveCamera, w: number, h: number): void {
  const desktop = w >= 900;
  const cx = (desktop ? 0.42 : 0.5) * w;
  const cy = (desktop ? 0.4 : 0.3) * h;
  camera.aspect = w / h;
  fovScale = Math.min(2.1, Math.max(1, 1.15 / camera.aspect));
  camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
  camera.updateProjectionMatrix();
}
