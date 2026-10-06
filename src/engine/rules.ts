import type { Effects, ResourceKey } from './types';

export const RULES = {
  minNodes: 4,
  maxNodes: 6,
  start: { energy: 72, life: 78, supplies: 68, trust: 60 },
  clamp: { energy: [0, 100], life: [0, 100], supplies: [0, 100], trust: [0, 100] },
  upkeep: { energy: -4, life: -2, supplies: -2 } as Effects,
  crisisThreshold: 35,
  firstSafeNodes: 2,
  ending: { evidence: 3, stability: 42, trust: 42, autonomy: 50, earthSupport: 45 },
  station: { supply: { supplies: 14, energy: -5 } as Effects, control: 2 },
  resourceLabels: { energy: '能源', life: '生命支持', supplies: '物资', trust: '信任' } as Record<ResourceKey, string>,
} as const;

export const RESOURCE_KEYS: ResourceKey[] = ['energy', 'life', 'supplies', 'trust'];

export const RESOURCE_COLORS: Record<ResourceKey, string> = {
  energy: '#ffd27a',
  life: '#6be3a4',
  supplies: '#7fd8ff',
  trust: '#cdbdff',
};
