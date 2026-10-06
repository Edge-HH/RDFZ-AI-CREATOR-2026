export type Phase =
  | "briefing"
  | "conversation"
  | "tactical"
  | "execution"
  | "feedback"
  | "ending";
export type ResourceKey =
  | "time"
  | "energy"
  | "supplies"
  | "safety"
  | "engineStability"
  | "trust"
  | "progress";
export type CrewId = "lin" | "pei" | "shen" | "a-ruan" | "zhou";
export interface CrewMember {
  id: CrewId;
  name: string;
  role: string;
  health: number;
  fatigue: number;
  available: boolean;
}
export type ResourceState = Record<ResourceKey, number>;
export interface Effect {
  key:
    | ResourceKey
    | "crewHealth"
    | "crewFatigue"
    | "crewAvailable"
    | "flag"
    | "commsConfidence";
  amount?: number;
  value?: boolean | number | string;
  target?: CrewId;
  reason?: string;
  flag?: string;
}
export interface Decision {
  id: string;
  sceneId: string;
  label: string;
  intent: string;
  requires?: string[];
  preview: string;
  effects: Effect[];
  next: string;
  eventId?: string;
}
export interface DialogueLine {
  speaker: string;
  text: string;
  requires?: string[];
}
export interface DialogueNode {
  id: string;
  act: number;
  title: string;
  speaker: string;
  role?: string;
  channel: string;
  text: string;
  choices: Decision[];
  lines?: DialogueLine[];
  goal: string;
  conflict: string;
  disaster: string;
  staging: string;
}
export interface Allocation {
  supportEnergy: number;
  specialist: CrewId;
}
export interface DecisionRecord {
  id: string;
  sceneId: string;
  label: string;
  effects: Effect[];
  committedAt: number;
  next: string;
  eventId?: string;
  allocation: Allocation;
  before: ResourceState;
  after: ResourceState;
  response: string;
  speaker: string;
}
export interface RouteNode {
  id: string;
  label: string;
  x: number;
  z: number;
  distance: number;
  slope: number;
  temperature: number;
  wind: number;
  terrainRisk: number;
  commsConfidence: number;
  description: string;
}
export interface ViewportModel {
  selectedNode?: string;
  routes: RouteNode[];
  vehiclePosition: { x: number; z: number };
  riskZones: string[];
  metrics: Record<string, number>;
  action?: string;
}
export type EndingId =
  | "steady-migration"
  | "scarred-continuation"
  | "cold-start-success"
  | "silent-lamp";
export interface EndingResult {
  id: EndingId;
  title: string;
  summary: string;
  tone: string;
  requirements?: string[];
}
export interface GameState {
  phase: Phase;
  sceneId: string;
  seed: number;
  resources: ResourceState;
  crew: Record<CrewId, CrewMember>;
  flags: Record<string, boolean>;
  decisions: DecisionRecord[];
  pendingDecision?: Decision;
  selectedRoute?: string;
  allocation: Allocation;
  paused: boolean;
  eventLog: string[];
  commsConfidence: number;
  endingId?: EndingId;
}
export type GameAction =
  | { type: "DIALOGUE_ADVANCE"; sceneId?: string; nextScene?: string }
  | { type: "MAP_SELECT"; nodeId: string }
  | { type: "DECISION_PREVIEW"; decision: Decision }
  | { type: "DECISION_CONFIRM"; decision: Decision }
  | { type: "ALLOCATE"; allocation: Partial<Allocation> }
  | { type: "EXECUTION_COMPLETE" }
  | { type: "PAUSE"; paused?: boolean }
  | { type: "RETRY"; seed?: number }
  | { type: "VIEW_RESET" }
  | { type: "ABORT" };
export interface DecisionCheck {
  allowed: boolean;
  missing: string[];
}
