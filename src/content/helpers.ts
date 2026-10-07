import type { Line, Speaker } from '../core/content';
import { rates } from '../core/rates';
import type { CrewId, MissionState } from '../core/types';

export const L = (speaker: Speaker, text: string, extra: Partial<Line> = {}): Line => ({ speaker, text, ...extra });

export const sciMult = (s: MissionState) => rates(s).scienceMult;
export const isActive = (s: MissionState, id: CrewId) => {
  const c = s.crew.find((x) => x.id === id);
  return !!c && (c.status === 'ok' || c.status === 'injured');
};
export const crew = (s: MissionState, id: CrewId) => s.crew.find((c) => c.id === id)!;
export const fmtMin = (m: number) => {
  const mm = Math.floor(m);
  const ss = Math.round((m - mm) * 60);
  return `${mm} 分 ${String(ss).padStart(2, '0')} 秒`;
};
export const pct = (v: number) => `${Math.round(v * 100)}%`;
