import { Character } from '../types/rpg';
import { createId } from '../utils/id';
import { computeAllAttributes } from './attributes';
import { rollRandomInt } from './randomEngine';

export type D20RollMode = 'normal' | 'advantage' | 'disadvantage';
export type D20CriticalKind = 'none' | 'nat20' | 'nat1';
export type D20InputSource = 'roll' | 'manual';

export interface D20ModifierPreset {
  id: string;
  label: string;
  shortLabel: string;
  value: number;
  kind: 'attribute' | 'skill';
}

export interface D20RollEntry {
  id: string;
  timestamp: number;
  mode: D20RollMode;
  inputSource: D20InputSource;
  dice: number[];
  chosenDie: number;
  discardedDie?: number;
  modifier: number;
  modifierLabel?: string;
  total: number;
  critical: D20CriticalKind;
  note?: string;
}

/**
 * Normalizes and clamps any die face input cleanly into the integer range [1, 20].
 */
export function clampD20Face(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(20, Math.round(value)));
}

/**
 * Detects natural 20 critical hit and natural 1 critical fumble on the chosen d20 face.
 */
export function detectD20Critical(chosenDie: number): D20CriticalKind {
  if (chosenDie === 20) return 'nat20';
  if (chosenDie === 1) return 'nat1';
  return 'none';
}

/**
 * Rolls 1d20 (normal) or 2d20 (advantage / disadvantage) and computes modifier + total.
 */
export function rollD20Mode(
  mode: D20RollMode,
  modifier: number,
  options?: {
    modifierLabel?: string;
    note?: string;
    rng?: () => number;
    id?: string;
    timestamp?: number;
  }
): D20RollEntry {
  const rng = options?.rng || Math.random;
  const safeMod = Number.isFinite(modifier) ? Math.trunc(modifier) : 0;

  let dice: number[];
  let chosenDie: number;
  let discardedDie: number | undefined;

  if (mode === 'normal') {
    const d1 = rollRandomInt(1, 20, rng);
    dice = [d1];
    chosenDie = d1;
  } else {
    const d1 = rollRandomInt(1, 20, rng);
    const d2 = rollRandomInt(1, 20, rng);
    dice = [d1, d2];
    if (mode === 'advantage') {
      chosenDie = Math.max(d1, d2);
      discardedDie = Math.min(d1, d2);
    } else {
      chosenDie = Math.min(d1, d2);
      discardedDie = Math.max(d1, d2);
    }
  }

  return {
    id: options?.id || createId('d20'),
    timestamp: options?.timestamp ?? Date.now(),
    mode,
    inputSource: 'roll',
    dice,
    chosenDie,
    discardedDie,
    modifier: safeMod,
    modifierLabel: options?.modifierLabel?.trim() || undefined,
    total: chosenDie + safeMod,
    critical: detectD20Critical(chosenDie),
    note: options?.note?.trim() || undefined,
  };
}

/**
 * Creates a manual d20 die entry from an explicit face value (1..20) and modifier.
 */
export function createManualD20Entry(
  faceValue: number,
  modifier: number,
  options?: {
    modifierLabel?: string;
    note?: string;
    id?: string;
    timestamp?: number;
  }
): D20RollEntry {
  const chosenDie = clampD20Face(faceValue);
  const safeMod = Number.isFinite(modifier) ? Math.trunc(modifier) : 0;

  return {
    id: options?.id || createId('d20'),
    timestamp: options?.timestamp ?? Date.now(),
    mode: 'normal',
    inputSource: 'manual',
    dice: [chosenDie],
    chosenDie,
    modifier: safeMod,
    modifierLabel: options?.modifierLabel?.trim() || undefined,
    total: chosenDie + safeMod,
    critical: detectD20Critical(chosenDie),
    note: options?.note?.trim() || undefined,
  };
}

/**
 * Extracts active character attributes and skills as quick modifier presets for the d20 menu.
 */
export function getCharacterD20Modifiers(character: Character | null): D20ModifierPreset[] {
  if (!character) return [];
  const breakdowns = computeAllAttributes(character);
  const presets: D20ModifierPreset[] = [];

  const sortedAttrs = [...character.attributes].sort((a, b) => a.order - b.order);
  for (const attr of sortedAttrs) {
    const val = breakdowns[attr.id]?.totalValue ?? attr.baseValue;
    presets.push({
      id: `attr_${attr.id}`,
      label: attr.name,
      shortLabel: attr.shortName || attr.name.slice(0, 3).toUpperCase(),
      value: val,
      kind: 'attribute',
    });
  }

  for (const skill of character.skills) {
    const linkedVal = skill.linkedAttributeId
      ? breakdowns[skill.linkedAttributeId]?.totalValue ?? 0
      : 0;
    const total = skill.baseValue + skill.bonus + linkedVal;
    presets.push({
      id: `skill_${skill.id}`,
      label: skill.name,
      shortLabel: skill.name,
      value: total,
      kind: 'skill',
    });
  }

  return presets;
}

/**
 * Formats a concise human-readable summary of a d20 roll or manual die entry.
 */
export function formatD20Summary(entry: D20RollEntry): string {
  const diePart =
    entry.mode === 'advantage'
      ? `2d20↑ [${entry.dice.join(', ')}] → ${entry.chosenDie}`
      : entry.mode === 'disadvantage'
        ? `2d20↓ [${entry.dice.join(', ')}] → ${entry.chosenDie}`
        : `d20 (${entry.chosenDie})`;

  const modPart =
    entry.modifier === 0
      ? ''
      : ` ${entry.modifier > 0 ? `+${entry.modifier}` : `${entry.modifier}`}${
          entry.modifierLabel ? ` [${entry.modifierLabel}]` : ''
        }`;

  const critPart =
    entry.critical === 'nat20'
      ? ' · Crítico!'
      : entry.critical === 'nat1'
        ? ' · Falha Crítica'
        : '';

  const notePart = entry.note ? `${entry.note}: ` : '';
  return `${notePart}${diePart}${modPart} = ${entry.total}${critPart}`;
}
