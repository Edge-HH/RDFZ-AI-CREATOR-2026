import { act, availableChoices, availableResponses, currentAdvice, currentNode, newGame } from '../src/engine/engine';
import type { Action, GameState } from '../src/engine/types';

export type Policy = (state: GameState) => Action;

export const followLuna: Policy = (state) => {
  if (state.phase === 'node') return { t: 'main', choiceId: currentAdvice(state).choiceId };
  if (state.phase === 'response') return { t: 'response', choiceId: availableResponses(state)[0]?.id ?? currentNode(state).choices[0].responses[0].id };
  return { t: 'continue' };
};

export const humanFirst: Policy = (state) => {
  if (state.phase === 'node') return { t: 'main', choiceId: availableChoices(state)[0].id };
  if (state.phase === 'response') return { t: 'response', choiceId: availableResponses(state)[availableResponses(state).length - 1]?.id ?? currentNode(state).choices[0].responses[0].id };
  return { t: 'continue' };
};

export const riskyHuman: Policy = (state) => {
  if (state.phase === 'node') {
    const choices = availableChoices(state);
    return { t: 'main', choiceId: choices[choices.length - 1].id };
  }
  if (state.phase === 'response') {
    const responses = availableResponses(state);
    return { t: 'response', choiceId: responses[responses.length - 1]?.id ?? currentNode(state).choices[0].responses[0].id };
  }
  return { t: 'continue' };
};

export function play(seed: number, policy: Policy, max = 40): GameState {
  let state = newGame(seed);
  for (let i = 0; i < max && state.phase !== 'ended'; i++) state = act(state, policy(state));
  return state;
}
