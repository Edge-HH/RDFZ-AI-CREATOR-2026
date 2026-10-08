import './ui/styles/tokens.css';
import './ui/styles/shell.css';
import './ui/styles/dialogue.css';
import './ui/styles/panels.css';
import './ui/styles/responsive.css';
import { App } from './ui/app';
import { createStage } from './render/stage';
import { loadSettings } from './ui/store';

const root = document.getElementById('app')!;
const sceneEl = document.createElement('div');
sceneEl.id = 'scene';
root.append(sceneEl);

const stage = createStage(sceneEl, loadSettings().quality);
const app = new App(root, stage);
app.showTitle();
