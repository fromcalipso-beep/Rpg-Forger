import { Character } from '../types/rpg';
import { adjustResourceValue } from './attributes';

export interface RandomDeltaResult {
  character: Character;
  rolled: number;
  delta: number;
}

/**
 * Generates a uniform random integer in [min, max] inclusive.
 * Automatically swaps bounds if min > max and clamps finite integers.
 */
export function rollRandomInt(
  min: number,
  max: number,
  rng: () => number = Math.random
): number {
  const safeMin = Number.isFinite(min) ? Math.floor(min) : 1;
  const safeMax = Number.isFinite(max) ? Math.floor(max) : safeMin;
  const low = Math.min(safeMin, safeMax);
  const high = Math.max(safeMin, safeMax);
  if (low === high) return low;
  const r = Math.min(0.999999999999, Math.max(0, rng()));
  return low + Math.floor(r * (high - low + 1));
}

/**
 * Adds or subtracts a randomly generated amount of XP, clamping currentXp at >= 0.
 */
export function applyRandomXpDelta(
  character: Character,
  min: number,
  max: number,
  sign: 1 | -1,
  rng: () => number = Math.random
): RandomDeltaResult {
  const rolled = Math.max(0, rollRandomInt(min, max, rng));
  const delta = sign * rolled;
  const nextXp = Math.max(0, (character.identity.currentXp || 0) + delta);

  return {
    rolled,
    delta,
    character: {
      ...character,
      updatedAt: Date.now(),
      identity: {
        ...character.identity,
        currentXp: nextXp,
      },
    },
  };
}

/**
 * Adds or subtracts a randomly generated amount to a character resource bar,
 * respecting the resource's min/max and allowNegative rules.
 */
export function applyRandomResourceDelta(
  character: Character,
  resourceId: string,
  min: number,
  max: number,
  sign: 1 | -1,
  rng: () => number = Math.random
): RandomDeltaResult {
  const rolled = Math.max(0, rollRandomInt(min, max, rng));
  const delta = sign * rolled;
  return {
    rolled,
    delta,
    character: adjustResourceValue(character, resourceId, delta),
  };
}

/**
 * Adds or subtracts an exact player-defined integer amount of XP, clamping at >= 0.
 */
export function applyPlayerXpDelta(
  character: Character,
  amount: number,
  sign: 1 | -1
): RandomDeltaResult {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(Math.abs(amount))) : 0;
  const delta = sign * safeAmount;
  const nextXp = Math.max(0, (character.identity.currentXp || 0) + delta);

  return {
    rolled: safeAmount,
    delta,
    character: {
      ...character,
      updatedAt: Date.now(),
      identity: {
        ...character.identity,
        currentXp: nextXp,
      },
    },
  };
}

/**
 * Adds or subtracts an exact player-defined integer amount to a resource bar,
 * respecting the resource's min/max and allowNegative rules.
 */
export function applyPlayerResourceDelta(
  character: Character,
  resourceId: string,
  amount: number,
  sign: 1 | -1
): RandomDeltaResult {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(Math.abs(amount))) : 0;
  const delta = sign * safeAmount;
  return {
    rolled: safeAmount,
    delta,
    character: adjustResourceValue(character, resourceId, delta),
  };
}

