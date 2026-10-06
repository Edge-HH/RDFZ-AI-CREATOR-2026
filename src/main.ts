import './styles.css';
import './hud.css';
import { createScene, type SceneApi } from './scene/scene';
import { App } from './ui/app';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

let scene: SceneApi | null = null;
const host = document.getElementById('scene')!;
if (webglAvailable()) {
  scene = createScene(host, document.getElementById('labels')!);
} else {
  host.innerHTML = '<p style="padding:24px;color:#8b95ab">当前浏览器不支持 WebGL，三维场景已关闭；游戏规则与决策功能仍可完整使用。</p>';
}

new App(scene);
