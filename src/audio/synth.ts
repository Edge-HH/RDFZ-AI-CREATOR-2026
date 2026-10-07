// WebAudio 程序合成音效与环境音：零素材、零版权风险
import type { Settings } from '../ui/store';

let ctx: AudioContext | null = null;
let ambience: { stop: () => void; kind: string } | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slide?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBuffer(a: AudioContext, seconds: number): AudioBuffer {
  const buf = a.createBuffer(1, a.sampleRate * seconds, a.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // 棕噪声
    d[i] = last * 3.5;
  }
  return buf;
}

export type Sfx = 'blip' | 'alert' | 'select' | 'confirm' | 'uplink' | 'downlink' | 'chapter';

export function sfx(kind: Sfx, settings: Settings): void {
  if (!settings.sfx) return;
  switch (kind) {
    case 'blip': tone(1320, 0.05, 'sine', 0.03); break;
    case 'select': tone(660, 0.06, 'triangle', 0.05); break;
    case 'confirm': tone(520, 0.09, 'triangle', 0.06); tone(780, 0.12, 'triangle', 0.05, 0.08); break;
    case 'alert': tone(880, 0.18, 'square', 0.04); tone(660, 0.18, 'square', 0.04, 0.2); break;
    case 'uplink': tone(400, 0.5, 'sine', 0.05, 0, 1600); break;
    case 'downlink': tone(1600, 0.5, 'sine', 0.05, 0, 500); break;
    case 'chapter': tone(196, 1.6, 'sine', 0.06); tone(294, 1.6, 'sine', 0.04, 0.15); tone(392, 1.8, 'sine', 0.03, 0.3); break;
  }
}

// 环境音：控制室低频嗡鸣 / 舱内风扇 / 火星风
export function setAmbience(kind: 'control' | 'cabin' | 'wind' | 'storm' | 'none', settings: Settings): void {
  if (!settings.sfx) kind = 'none';
  if (ambience?.kind === kind) return;
  ambience?.stop();
  ambience = null;
  if (kind === 'none') return;
  const a = audio();
  if (!a) return;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, 4);
  src.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = { control: 180, cabin: 420, wind: 600, storm: 900 }[kind];
  const g = a.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime({ control: 0.05, cabin: 0.06, wind: 0.07, storm: 0.12 }[kind], a.currentTime + 1.5);
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
  let lfo: OscillatorNode | null = null;
  if (kind === 'wind' || kind === 'storm') {
    lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = kind === 'storm' ? 0.3 : 0.08;
    lg.gain.value = kind === 'storm' ? 400 : 250;
    lfo.connect(lg).connect(filter.frequency);
    lfo.start();
  }
  ambience = {
    kind,
    stop: () => {
      const t = a.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.8);
      src.stop(t + 0.9);
      lfo?.stop(t + 0.9);
    },
  };
}
