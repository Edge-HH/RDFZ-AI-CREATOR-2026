import type { LocationId } from '../world/terrain';

export type ResourceKey = 'energy' | 'life' | 'supplies' | 'trust';
export type CrewId = 'lin' | 'su';
export type EvidenceId = 'orbit' | 'sample' | 'archive';
export type Act = 1 | 2 | 3;
export type NodeKind = 'investigation' | 'communication' | 'relationship' | 'logistics' | 'quiet' | 'crisis' | 'final';
export type StoryLocation = 'earth-city' | 'station' | 'core' | 'psr' | 'ridge' | 'relay';
export type Risk = 'none' | 'low' | 'mid' | 'high';
export type UndercityStatus = 'locked' | 'available' | 'building' | 'online';
export type Governance = 'human' | 'luna' | null;

export type ResourceEffects = Partial<Record<ResourceKey, number>>;

export interface Effects extends ResourceEffects {
  evidence?: EvidenceId;
  autonomy?: number;
  lin?: number;
  su?: number;
  earthSupport?: number;
  stationControl?: number;
  lunaAuthority?: number;
  flags?: string[];
}

export interface Requirement {
  resource?: { key: ResourceKey; min: number };
  evidence?: EvidenceId;
  relation?: { who: CrewId; min: number };
  flag?: string;
  act?: Act;
}

export interface ResponseChoice {
  id: string;
  label: string;
  desc: string;
  effects: Effects;
  requires?: Requirement[];
  lunaTone?: string;
}

export interface NodeChoice {
  id: string;
  label: string;
  desc: string;
  effects: Effects;
  responses: ResponseChoice[];
  requires?: Requirement[];
  risk?: Risk;
  evidence?: EvidenceId;
  lunaLine?: string;
}

export interface StoryNode {
  id: string;
  act: Act;
  kind: NodeKind;
  title: string;
  location: StoryLocation;
  intro: string;
  prompt: string;
  risk: Risk;
  calm?: boolean;
  keyEvidence?: EvidenceId;
  choices: NodeChoice[];
}

export interface LunaAdvice {
  choiceId: string;
  confidence: number;
  basis: string[];
  accuracy: number;
  sacrifice: string;
  line: string;
}

export type Phase = 'node' | 'response' | 'transition' | 'ended';

export interface LogEntry {
  node: number;
  act: Act;
  kind: 'node' | 'choice' | 'response' | 'luna' | 'evidence' | 'communication' | 'relationship' | 'warning' | 'success' | 'ending';
  text: string;
  effects?: Effects;
}

export interface PendingNodeResult {
  nodeTitle: string;
  choiceTitle: string;
  responseTitle: string;
  effects: Effects;
  lines: string[];
}

export interface GameState {
  seed: number;
  rng: number;
  phase: Phase;
  act: Act;
  nodeCount: number;
  targetNodes: number;
  currentNodeId: string;
  chosenChoiceId: string | null;
  resources: Record<ResourceKey, number>;
  evidence: EvidenceId[];
  relations: Record<CrewId, number>;
  earthSupport: number;
  stationControl: number;
  lunaAuthority: number;
  autonomy: number;
  crisisCount: number;
  usedNodeIds: string[];
  usedCrisisIds: string[];
  flags: string[];
  lunaHits: number;
  lunaTotal: number;
  pendingResult: PendingNodeResult | null;
  log: LogEntry[];
  replay: Action[];
  ending: EndingResult | null;
}

export interface Metrics {
  evidence: number;
  stability: number;
  trust: number;
  autonomy: number;
  earthSupport: number;
}

export type EndingId = 'cooperative' | 'luna' | 'retreat' | 'terminated';

export interface EndingResult {
  id: EndingId;
  metrics: Metrics;
  unmet: string[];
}

export type Action =
  | { t: 'main'; choiceId: string }
  | { t: 'response'; choiceId: string }
  | { t: 'continue' }
  | { t: 'inquire' };

/** Used by the UI to focus the existing Three.js lunar scene. */
export function sceneLocation(location: StoryLocation): LocationId | null {
  if (location === 'earth-city') return null;
  return location;
}
