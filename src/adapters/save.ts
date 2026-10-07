import { getNode, getDecision } from "../core/catalog";
import type { GameState } from "../core/types";
import { dialogueLines } from "../core/rules";
const KEY = "gray-ring-ignition:v1";
export function saveMission(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, state }));
  } catch {
    /* Disabled storage does not block a mission. */
  }
}
export function loadMission(): GameState | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (
      ![1, 2].includes(saved?.version) ||
      !saved.state?.resources ||
      !Array.isArray(saved.state.decisions)
    )
      return;
    const s = saved.state as GameState;
    if (
      !s.allocation ||
      !s.crew?.lin ||
      ![
        "briefing",
        "conversation",
        "tactical",
        "execution",
        "feedback",
        "ending",
      ].includes(s.phase)
    )
      return;
    if (s.phase !== "ending" && !getNode(s.sceneId)) return;
    const lastLine = Math.max(0, dialogueLines(s).length - 1);
    // Old saves displayed all lines at once. Preserve pending choices and migrate
    // read progress without throwing away the player's resource decisions.
    s.dialogueCursor = Number.isInteger(s.dialogueCursor)
      ? Math.max(0, Math.min(lastLine, s.dialogueCursor))
      : s.phase === "conversation" || s.phase === "briefing"
        ? 0
        : lastLine;
    if (
      !Object.values(s.resources).every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    )
      return;
    if (
      !s.eventLog?.every((line) => typeof line === "string") ||
      !s.flags ||
      !["lin", "pei", "shen", "a-ruan", "zhou"].every((id) => id in s.crew)
    )
      return;
    if (s.pendingDecision) {
      const canonical = getDecision(s.pendingDecision.id);
      if (!canonical || canonical.sceneId !== s.sceneId) return;
      s.pendingDecision = canonical;
    } else if (s.phase === "execution") return;
    return s;
  } catch {
    return;
  }
}
export function clearMission(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* No persistence available. */
  }
}
