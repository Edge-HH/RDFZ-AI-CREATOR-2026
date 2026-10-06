import dialogue from "../data/dialogue.json";
import decisions from "../data/decisions.json";
import routes from "../data/routes.json";
import endings from "../data/endings.json";
import type {
  Decision,
  DialogueNode,
  EndingId,
  EndingResult,
  RouteNode,
} from "./types";
// JSON is the sole source of mission content. Resolve references once, outside rendering.
export const DECISIONS = decisions as unknown as Decision[];
export const ROUTES = routes as RouteNode[];
export const NODES = dialogue.map((node) => ({
  ...node,
  choices: node.choices.map((id) => {
    const decision = DECISIONS.find((item) => item.id === id);
    if (!decision) throw new Error(`Missing decision ${id} in ${node.id}`);
    return decision;
  }),
})) as DialogueNode[];
export const ENDINGS = Object.fromEntries(
  endings.map((ending) => [ending.id, ending]),
) as Record<EndingId, EndingResult>;
export const getNode = (id: string) => NODES.find((node) => node.id === id);
export const getDecision = (id: string) =>
  DECISIONS.find((decision) => decision.id === id);
