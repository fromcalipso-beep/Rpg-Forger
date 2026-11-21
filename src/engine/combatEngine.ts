import {
  Ability,
  AbilityCopyConfig,
  AbilityRole,
  Character,
  CombatLogEntry,
  CombatSnapshot,
  ResourceCost,
  ResourceDef,
  TurnPhase,
} from '../types/rpg';
import { createId, deepClone } from '../utils/id';
import { resolveDamageExpression } from './damageEngine';

const VALID_ABILITY_ROLES: AbilityRole[] = ['damage', 'turn_dice', 'immediate', 'fixed', 'effect'];

/**
 * Resolves which specialized skill section an ability belongs to,
 * honoring explicit `abilityRole` or inferring from existing fields for backward compatibility.
 */
export function resolveAbilityRole(ability: Ability): AbilityRole {
  if (ability.abilityRole && VALID_ABILITY_ROLES.includes(ability.abilityRole)) {
    return ability.abilityRole;
  }
  if (ability.abilityType === 'passive') return 'fixed';
  if (ability.durationTurns > 0 && (ability.turnDiceText?.trim() || ability.damageText?.trim())) {
    return 'turn_dice';
  }
  if (ability.damageText?.trim() && ability.abilityType === 'instant') return 'damage';
  if (ability.abilityType === 'instant') return 'immediate';
  if (ability.durationTurns > 0) return 'turn_dice';
  return 'effect';
}

export interface ActivationResult {
  success: boolean;
  character: Character;
  error?: string;
}

const MAX_UNDO_HISTORY = 30;
const MAX_COMBAT_LOG = 120;

function appendLog(
  history: CombatLogEntry[],
  round: number,
  turn: number,
  type: CombatLogEntry['type'],
  message: string
): CombatLogEntry[] {
  const entry: CombatLogEntry = {
    id: createId('log'),
    round,
    turn,
    timestamp: Date.now(),
    type,
    message,
  };
  return [entry, ...history].slice(0, MAX_COMBAT_LOG);
}

/**
 * Checks whether all resource costs can be paid atomically without going below permitted minimum.
 */
export function checkResourceCosts(
  resources: ResourceDef[],
  costs: ResourceCost[]
): { sufficient: boolean; missingLabels: string[] } {
  const aggregated = new Map<string, number>();
  for (const cost of costs) {
    if (cost.amount <= 0) continue;
    aggregated.set(cost.resourceId, (aggregated.get(cost.resourceId) || 0) + cost.amount);
  }

  const missingLabels: string[] = [];
  for (const [resourceId, totalRequired] of aggregated.entries()) {
    const res = resources.find((r) => r.id === resourceId);
    if (!res) {
      missingLabels.push(`Recurso desconhecido (${totalRequired})`);
      continue;
    }
    if (!res.allowNegative && res.current - totalRequired < res.min) {
      missingLabels.push(`${res.name} (precisa ${totalRequired}, atual ${res.current})`);
    }
  }

  return {
    sufficient: missingLabels.length === 0,
    missingLabels,
  };
}

/**
 * Deducts multiple resource costs atomically; if any resource fails validation, returns null.
 */
function applyResourceCostsAtomically(
  resources: ResourceDef[],
  costs: ResourceCost[],
  forceAllowInsufficient = false
): ResourceDef[] | null {
  if (!forceAllowInsufficient) {
    const check = checkResourceCosts(resources, costs);
    if (!check.sufficient) return null;
  }

  const aggregated = new Map<string, number>();
  for (const cost of costs) {
    if (cost.amount <= 0) continue;
    aggregated.set(cost.resourceId, (aggregated.get(cost.resourceId) || 0) + cost.amount);
  }

  return resources.map((res) => {
    const deduction = aggregated.get(res.id) || 0;
    if (deduction === 0) return res;
    const rawNext = res.current - deduction;
    const nextVal = res.allowNegative ? rawNext : Math.max(res.min, rawNext);
    return { ...res, current: nextVal };
  });
}

function formatCostSummary(resources: ResourceDef[], costs: ResourceCost[]): string {
  const parts: string[] = [];
  for (const cost of costs) {
    if (cost.amount <= 0) continue;
    const res = resources.find((r) => r.id === cost.resourceId);
    parts.push(`${cost.amount} ${res ? res.name : 'Recurso'}`);
  }
  return parts.join(', ');
}

/**
 * Activates an ability atomically:
 * 1. Validates type, active state, cooldown, and requirements.
 * 2. Checks all initial resource costs.
 * 3. Deducts all costs in one consistent operation.
 * 4. Sets active state, duration, and cooldown (if configured on_activate).
 */
export function activateAbility(character: Character, abilityId: string): ActivationResult {
  const ability = character.abilities.find((a) => a.id === abilityId);
  if (!ability) {
    return { success: false, character, error: 'Habilidade não encontrada.' };
  }

  if (ability.abilityType === 'passive') {
    return {
      success: false,
      character,
      error: 'Habilidades passivas estão sempre ativas automaticamente.',
    };
  }

  if (ability.isActive) {
    return {
      success: false,
      character,
      error: `"${ability.name}" já está ativa.`,
    };
  }

  if (ability.remainingCooldown > 0) {
    return {
      success: false,
      character,
      error: `"${ability.name}" está em recarga (${ability.remainingCooldown} turno(s) restante(s)).`,
    };
  }

  const check = checkResourceCosts(character.resources, ability.initialCosts);
  if (!check.sufficient) {
    return {
      success: false,
      character,
      error: `Recursos insuficientes para "${ability.name}": ${check.missingLabels.join(', ')}.`,
    };
  }

  const nextResources = applyResourceCostsAtomically(character.resources, ability.initialCosts);
  if (!nextResources) {
    return {
      success: false,
      character,
      error: `Não foi possível deduzir os recursos de "${ability.name}".`,
    };
  }

  const isInstant = ability.abilityType === 'instant';
  const hasFixedDuration =
    ability.abilityType === 'fixed_duration' ||
    (ability.abilityType === 'sustained' && ability.durationTurns > 0);

  const nextDuration = isInstant
    ? 0
    : hasFixedDuration
      ? Math.max(0, ability.durationTurns)
      : 0;

  const startCooldownNow =
    isInstant || ability.cooldownStartCondition === 'on_activate';

  const nextCooldown =
    startCooldownNow && ability.cooldownTurns > 0 ? ability.cooldownTurns : ability.remainingCooldown;

  const updatedAbilities = character.abilities.map((a) =>
    a.id === abilityId
      ? {
          ...a,
          isActive: !isInstant,
          remainingDuration: nextDuration,
          remainingCooldown: nextCooldown,
        }
      : a
  );

  const costSummary = formatCostSummary(character.resources, ability.initialCosts);
  const logMsg = costSummary
    ? `Ativou "${ability.name}" (custo: ${costSummary}).`
    : `Ativou "${ability.name}".`;

  return {
    success: true,
    character: {
      ...character,
      updatedAt: Date.now(),
      resources: nextResources,
      abilities: updatedAbilities,
      combat: {
        ...character.combat,
        history: appendLog(
          character.combat.history,
          character.combat.round,
          character.combat.turn,
          'activate',
          logMsg
        ),
      },
    },
  };
}

/**
 * Deactivates an active ability manually or automatically.
 * Stops recurring costs, clears remaining duration, removes temporary modifiers,
 * and starts cooldown if configured to begin on deactivation.
 */
export function deactivateAbility(
  character: Character,
  abilityId: string,
  reason?: string
): Character {
  const ability = character.abilities.find((a) => a.id === abilityId);
  if (!ability || !ability.isActive) return character;

  const shouldStartCooldown =
    ability.cooldownStartCondition === 'on_deactivate' && ability.cooldownTurns > 0;

  const nextCooldown = shouldStartCooldown
    ? Math.max(ability.remainingCooldown, ability.cooldownTurns)
    : ability.remainingCooldown;

  const updatedAbilities = character.abilities.map((a) =>
    a.id === abilityId
      ? {
          ...a,
          isActive: false,
          remainingDuration: 0,
          remainingCooldown: nextCooldown,
        }
      : a
  );

  const suffix = reason ? ` (${reason})` : '';
  const msg = shouldStartCooldown
    ? `Desativou "${ability.name}"${suffix}. Recarga iniciada: ${nextCooldown} turno(s).`
    : `Desativou "${ability.name}"${suffix}.`;

  return {
    ...character,
    updatedAt: Date.now(),
    abilities: updatedAbilities,
    combat: {
      ...character.combat,
      pendingConfirmations: character.combat.pendingConfirmations.filter(
        (p) => p.abilityId !== abilityId
      ),
      history: appendLog(
        character.combat.history,
        character.combat.round,
        character.combat.turn,
        'deactivate',
        msg
      ),
    },
  };
}

function createSnapshot(character: Character): CombatSnapshot {
  return {
    id: createId('snap'),
    round: character.combat.round,
    turn: character.combat.turn,
    resources: deepClone(character.resources),
    abilities: deepClone(character.abilities),
    history: deepClone(character.combat.history),
  };
}

/**
 * Processes turn-based rules for a single turn phase ('turn_end' of outgoing turn or 'turn_start' of incoming turn)
 * inside one atomic turn transition, ensuring:
 * - No duplicate recurring cost deductions
 * - Cooldowns are reduced at most ONCE per turn event
 * - Durations and cooldowns never drop below 0
 * - Simultaneous active abilities are handled consistently
 */
function processPhaseForTurn(
  state: {
    resources: ResourceDef[];
    abilities: Ability[];
    history: CombatLogEntry[];
    warnings: string[];
    pendingConfirmations: Character['combat']['pendingConfirmations'];
  },
  phase: TurnPhase,
  round: number,
  turn: number,
  reducedCooldownIds: Set<string>,
  cooldownStartedIds: Set<string>,
  processedDurationIds: Set<string>,
  processedRecurringIds: Set<string>
) {
  const nextAbilities: Ability[] = [];
  let nextResources = state.resources;
  let nextHistory = state.history;
  const nextWarnings = [...state.warnings];
  const nextConfirmations = [...state.pendingConfirmations];

  for (const ability of state.abilities) {
    let current = { ...ability };

    // 1. Reduce cooldown (strictly once per turn transition, and not if just started in this transition)
    if (
      current.remainingCooldown > 0 &&
      !reducedCooldownIds.has(current.id) &&
      !cooldownStartedIds.has(current.id) &&
      current.timingRules.processCooldownAt === phase &&
      (!current.isActive || current.cooldownStartCondition === 'on_activate')
    ) {
      reducedCooldownIds.add(current.id);
      current.remainingCooldown = Math.max(0, current.remainingCooldown - 1);
      if (current.remainingCooldown === 0) {
        nextHistory = appendLog(
          nextHistory,
          round,
          turn,
          'turn',
          `Recarga de "${current.name}" concluída.`
        );
      }
    }

    // 2. Process active abilities (sustained recurring costs & fixed duration)
    if (current.isActive) {
      // 2a. Recurring costs
      if (
        current.abilityType === 'sustained' &&
        current.recurringCosts.length > 0 &&
        !processedRecurringIds.has(current.id) &&
        current.timingRules.processRecurringAt === phase
      ) {
        processedRecurringIds.add(current.id);
        const check = checkResourceCosts(nextResources, current.recurringCosts);

        if (check.sufficient) {
          const deducted = applyResourceCostsAtomically(nextResources, current.recurringCosts);
          if (deducted) {
            nextResources = deducted;
            const summary = formatCostSummary(nextResources, current.recurringCosts);
            nextHistory = appendLog(
              nextHistory,
              round,
              turn,
              'resource',
              `Manutenção de "${current.name}": -${summary}.`
            );
          }
        } else {
          // Insufficient resource behavior
          const rule = current.insufficientResourceRule;
          if (rule === 'auto_deactivate') {
            current.isActive = false;
            current.remainingDuration = 0;
            if (current.cooldownStartCondition === 'on_deactivate' && current.cooldownTurns > 0) {
              current.remainingCooldown = Math.max(current.remainingCooldown, current.cooldownTurns);
              cooldownStartedIds.add(current.id);
            }
            const warnMsg = `"${current.name}" foi desativada automaticamente por recursos insuficientes (${check.missingLabels.join(', ')}).`;
            nextWarnings.push(warnMsg);
            nextHistory = appendLog(nextHistory, round, turn, 'warning', warnMsg);
            nextAbilities.push(current);
            continue;
          } else if (rule === 'keep_and_warn') {
            const warnMsg = `Aviso: recursos insuficientes para manter "${current.name}" (${check.missingLabels.join(', ')}).`;
            nextWarnings.push(warnMsg);
            nextHistory = appendLog(nextHistory, round, turn, 'warning', warnMsg);
          } else if (rule === 'manual_confirm') {
            const warnMsg = `Confirmação necessária para manter "${current.name}": ${check.missingLabels.join(', ')}.`;
            nextWarnings.push(warnMsg);
            nextHistory = appendLog(nextHistory, round, turn, 'warning', warnMsg);
            if (!nextConfirmations.some((c) => c.abilityId === current.id)) {
              nextConfirmations.push({
                abilityId: current.id,
                abilityName: current.name,
                missingResources: check.missingLabels,
              });
            }
          }
        }
      }

      // 2b. Duration countdown
      const tracksDuration =
        current.abilityType === 'fixed_duration' ||
        (current.abilityType === 'sustained' && current.durationTurns > 0);

      if (
        current.isActive &&
        tracksDuration &&
        current.remainingDuration > 0 &&
        !processedDurationIds.has(current.id) &&
        current.timingRules.processDurationAt === phase
      ) {
        processedDurationIds.add(current.id);
        current.remainingDuration = Math.max(0, current.remainingDuration - 1);

        if (current.remainingDuration === 0) {
          current.isActive = false;
          if (current.cooldownStartCondition === 'on_deactivate' && current.cooldownTurns > 0) {
            current.remainingCooldown = Math.max(current.remainingCooldown, current.cooldownTurns);
            cooldownStartedIds.add(current.id);
          }
          nextHistory = appendLog(
            nextHistory,
            round,
            turn,
            'deactivate',
            `Duração de "${current.name}" encerrada automaticamente.`
          );
        }
      }
    }

    nextAbilities.push(current);
  }

  return {
    resources: nextResources,
    abilities: nextAbilities,
    history: nextHistory,
    warnings: nextWarnings,
    pendingConfirmations: nextConfirmations,
  };
}

/**
 * Advances combat by 1 turn (or advances round as well if requested),
 * capturing an immutable snapshot first so Undo restores everything accurately.
 */
export function advanceTurn(character: Character, incrementRound = false): Character {
  const snapshot = createSnapshot(character);

  const nextTurn = incrementRound ? 1 : character.combat.turn + 1;
  const nextRound = incrementRound ? character.combat.round + 1 : character.combat.round;

  const reducedCooldownIds = new Set<string>();
  const cooldownStartedIds = new Set<string>();
  const processedDurationIds = new Set<string>();
  const processedRecurringIds = new Set<string>();

  // Process turn_end of outgoing turn, then turn_start of incoming turn
  let phaseState = {
    resources: deepClone(character.resources),
    abilities: deepClone(character.abilities),
    history: deepClone(character.combat.history),
    warnings: [] as string[],
    pendingConfirmations: [...character.combat.pendingConfirmations],
  };

  phaseState = processPhaseForTurn(
    phaseState,
    'turn_end',
    character.combat.round,
    character.combat.turn,
    reducedCooldownIds,
    cooldownStartedIds,
    processedDurationIds,
    processedRecurringIds
  );

  phaseState = processPhaseForTurn(
    phaseState,
    'turn_start',
    nextRound,
    nextTurn,
    reducedCooldownIds,
    cooldownStartedIds,
    processedDurationIds,
    processedRecurringIds
  );

  const logMessage = incrementRound
    ? `Avançou para a Rodada ${nextRound}, Turno ${nextTurn}.`
    : `Avançou para o Turno ${nextTurn} (Rodada ${nextRound}).`;

  const finalHistory = appendLog(
    phaseState.history,
    nextRound,
    nextTurn,
    incrementRound ? 'round' : 'turn',
    logMessage
  );

  return {
    ...character,
    updatedAt: Date.now(),
    resources: phaseState.resources,
    abilities: phaseState.abilities,
    combat: {
      ...character.combat,
      round: nextRound,
      turn: nextTurn,
      history: finalHistory,
      warnings: phaseState.warnings,
      pendingConfirmations: phaseState.pendingConfirmations,
      undoStack: [snapshot, ...character.combat.undoStack].slice(0, MAX_UNDO_HISTORY),
    },
  };
}

export function advanceRound(character: Character): Character {
  return advanceTurn(character, true);
}

/**
 * Restores the exact combat state before the previous turn advancement.
 */
export function undoLastTurn(character: Character): Character {
  if (character.combat.undoStack.length === 0) return character;
  const [latest, ...rest] = character.combat.undoStack;

  const restoredHistory = appendLog(
    latest.history,
    latest.round,
    latest.turn,
    'undo',
    `Desfez avanço de turno (retornou para Rodada ${latest.round}, Turno ${latest.turn}).`
  );

  return {
    ...character,
    updatedAt: Date.now(),
    resources: deepClone(latest.resources),
    abilities: deepClone(latest.abilities),
    combat: {
      ...character.combat,
      round: latest.round,
      turn: latest.turn,
      history: restoredHistory,
      warnings: [],
      pendingConfirmations: [],
      undoStack: rest,
    },
  };
}

export function resetCombat(character: Character): Character {
  const snapshot = createSnapshot(character);
  const resetAbilities = character.abilities.map((a) => ({
    ...a,
    isActive: false,
    remainingDuration: 0,
    remainingCooldown: 0,
  }));

  return {
    ...character,
    updatedAt: Date.now(),
    abilities: resetAbilities,
    combat: {
      ...character.combat,
      round: 1,
      turn: 1,
      warnings: [],
      pendingConfirmations: [],
      undoStack: [snapshot, ...character.combat.undoStack].slice(0, MAX_UNDO_HISTORY),
      history: appendLog(
        character.combat.history,
        1,
        1,
        'reset',
        'Contadores de combate, durações e recargas reiniciados.'
      ),
    },
  };
}

export function adjustAbilityCounters(
  character: Character,
  abilityId: string,
  durationDelta: number,
  cooldownDelta: number
): Character {
  return {
    ...character,
    updatedAt: Date.now(),
    abilities: character.abilities.map((a) => {
      if (a.id !== abilityId) return a;
      return {
        ...a,
        remainingDuration: Math.max(0, a.remainingDuration + durationDelta),
        remainingCooldown: Math.max(0, a.remainingCooldown + cooldownDelta),
      };
    }),
  };
}

export function resolvePendingConfirmation(
  character: Character,
  abilityId: string,
  keepActive: boolean
): Character {
  const remaining = character.combat.pendingConfirmations.filter(
    (c) => c.abilityId !== abilityId
  );
  const baseChar: Character = {
    ...character,
    combat: {
      ...character.combat,
      pendingConfirmations: remaining,
    },
  };

  if (!keepActive) {
    return deactivateAbility(baseChar, abilityId, 'confirmação manual');
  }

  return {
    ...baseChar,
    updatedAt: Date.now(),
    combat: {
      ...baseChar.combat,
      history: appendLog(
        baseChar.combat.history,
        baseChar.combat.round,
        baseChar.combat.turn,
        'warning',
        `Habilidade mantida ativa manualmente mesmo com recursos insuficientes.`
      ),
    },
  };
}

export const DEFAULT_ABILITY_COPY_CONFIG: AbilityCopyConfig = {
  includeDescription: true,
  includeEffect: true,
  includeDamage: true,
};

export function normalizeAbilityCopyConfig(
  config?: Partial<AbilityCopyConfig>
): AbilityCopyConfig {
  return {
    includeDescription: config?.includeDescription ?? true,
    includeEffect: config?.includeEffect ?? true,
    includeDamage: config?.includeDamage ?? true,
  };
}

/**
 * Formats an ability as clean shareable/copyable text respecting copyConfig
 * (description, effect, and live stat-resolved damage).
 */
export function formatAbilityCopyText(
  character: Character,
  ability: Ability,
  configOverride?: Partial<AbilityCopyConfig>
): string {
  const cfg = normalizeAbilityCopyConfig({
    ...(ability.copyConfig || {}),
    ...(configOverride || {}),
  });

  const title = ability.name.trim() || 'Habilidade';
  const header = ability.level > 0 ? `${title} (Nível ${ability.level})` : title;
  const lines: string[] = [header];

  if (cfg.includeDescription) {
    const desc = (ability.description || '').trim();
    if (desc) {
      lines.push(`Descrição: ${desc}`);
    }
  }

  if (cfg.includeEffect) {
    const effect = (ability.effectsText || '').trim();
    if (effect) {
      lines.push(`Efeito: ${effect}`);
    }
  }

  if (cfg.includeDamage) {
    const resolvedDamage = resolveDamageExpression(
      character,
      ability.damageText || '',
      ability.damageAttributeIds || []
    );
    if (resolvedDamage.hasDamage) {
      lines.push(`Dano: ${resolvedDamage.resolvedText}`);
    }
    const resolvedTurnDice = resolveDamageExpression(
      character,
      ability.turnDiceText || '',
      []
    );
    if (resolvedTurnDice.hasDamage) {
      lines.push(`Dado por Turno: ${resolvedTurnDice.resolvedText}`);
    }
  }

  return lines.join('\n');
}

/**
 * Creates a clean independent duplicate of an ability as an editable copy,
 * preserving description, effect, damage, and copy specification.
 */
export function duplicateAbilityAsCopy(
  ability: Ability,
  override?: Partial<Ability>
): Ability {
  const cloned = deepClone({
    ...ability,
    ...(override || {}),
  });
  const baseName = (cloned.name || 'Habilidade').trim();
  const copyName = baseName.endsWith('(Cópia)') ? baseName : `${baseName} (Cópia)`;

  return {
    ...cloned,
    id: createId('ab'),
    name: copyName,
    copyConfig: normalizeAbilityCopyConfig(cloned.copyConfig),
    damageAttributeIds: [...(cloned.damageAttributeIds || [])],
    initialCosts: deepClone(cloned.initialCosts || []),
    recurringCosts: deepClone(cloned.recurringCosts || []),
    attributeModifiers: deepClone(cloned.attributeModifiers || []),
    resourceModifiers: deepClone(cloned.resourceModifiers || []),
    customFields: deepClone(cloned.customFields || []),
    timingRules: { ...cloned.timingRules },
    isActive: cloned.abilityType === 'passive',
    remainingDuration: 0,
    remainingCooldown: 0,
  };
}

