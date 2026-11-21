import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Edit3,
  Files,
  Flame,
  History,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Share2,
  SkipForward,
  Square,
  Sword,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  DEFAULT_ABILITY_COPY_CONFIG,
  activateAbility,
  adjustAbilityCounters,
  advanceRound,
  advanceTurn,
  deactivateAbility,
  duplicateAbilityAsCopy,
  formatAbilityCopyText,
  normalizeAbilityCopyConfig,
  resetCombat,
  resolvePendingConfirmation,
  undoLastTurn,
} from '../../engine/combatEngine';
import { computeAllAttributes, computeResourceEffective } from '../../engine/attributes';
import { getEquippedWeaponsWithDamage, resolveDamageExpression } from '../../engine/damageEngine';
import { DEFAULT_TIMING_RULES } from '../../engine/templateEngine';
import {
  Ability,
  AbilityCategory,
  AbilityCopyConfig,
  AbilityType,
  Character,
  InsufficientResourceRule,
  TurnPhase,
} from '../../types/rpg';
import { createId } from '../../utils/id';
import { ImageSlot } from '../shared/ImageSlot';

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below when iframe blocks navigator.clipboard
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'fixed opacity-0 pointer-events-none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

interface AbilitiesCombatViewProps {
  character: Character;
  onUpdateCharacter: (next: Character) => void;
  onConfirmDelete: (title: string, message: string, action: () => void) => void;
  onNotify: (kind: 'success' | 'error' | 'info', text: string) => void;
  isEditMode?: boolean;
}

const ABILITY_TYPE_LABELS: Record<AbilityType, string> = {
  instant: 'Instantânea',
  fixed_duration: 'Ativa (Duração Fixa)',
  toggleable: 'Alternável (Ligar/Desligar)',
  sustained: 'Sustentada (Custo Recorrente)',
  passive: 'Passiva (Sempre Ativa)',
  unlimited: 'Duração Ilimitada até Desativar',
};

const CATEGORY_COLORS = [
  '#C89B3C',
  '#5B8DEF',
  '#34A876',
  '#C94040',
  '#8A67C2',
  '#9E9789',
  '#0EA5E9',
];

export const AbilitiesCombatView: React.FC<AbilitiesCombatViewProps> = ({
  character,
  onUpdateCharacter,
  onConfirmDelete,
  onNotify,
  isEditMode = true,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [showCategoriesPanel, setShowCategoriesPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [editingCategory, setEditingCategory] = useState<AbilityCategory | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);

  const [editingAbility, setEditingAbility] = useState<Ability | null>(null);
  const [isNewAbility, setIsNewAbility] = useState(false);

  const [sharingAbilityState, setSharingAbilityState] = useState<{
    ability: Ability;
    config: AbilityCopyConfig;
  } | null>(null);

  const resourceMap = useMemo(
    () => new Map(character.resources.map((r) => [r.id, r])),
    [character.resources]
  );

  const categoryMap = useMemo(
    () => new Map(character.abilityCategories.map((c) => [c.id, c])),
    [character.abilityCategories]
  );

  const activeAbilities = useMemo(
    () => character.abilities.filter((a) => a.isActive && a.abilityType !== 'passive'),
    [character.abilities]
  );

  const cooldownAbilities = useMemo(
    () => character.abilities.filter((a) => a.remainingCooldown > 0),
    [character.abilities]
  );

  const attrBreakdowns = useMemo(
    () => computeAllAttributes(character),
    [character]
  );

  const equippedWeapons = useMemo(
    () => getEquippedWeaponsWithDamage(character, attrBreakdowns),
    [character, attrBreakdowns]
  );

  const editingPreviewDamage = useMemo(() => {
    if (!editingAbility) return null;
    return resolveDamageExpression(
      character,
      editingAbility.damageText,
      editingAbility.damageAttributeIds || [],
      attrBreakdowns
    );
  }, [character, editingAbility, attrBreakdowns]);

  const editingCopyPreview = useMemo(() => {
    if (!editingAbility) return '';
    return formatAbilityCopyText(character, editingAbility);
  }, [character, editingAbility]);

  const sharingPreviewText = useMemo(() => {
    if (!sharingAbilityState) return '';
    return formatAbilityCopyText(
      character,
      sharingAbilityState.ability,
      sharingAbilityState.config
    );
  }, [character, sharingAbilityState]);

  const filteredAbilities = useMemo(() => {
    if (selectedCategoryId === 'all') return character.abilities;
    return character.abilities.filter((a) => a.categoryId === selectedCategoryId);
  }, [character.abilities, selectedCategoryId]);

  const handleActivate = (abilityId: string) => {
    const res = activateAbility(character, abilityId);
    if (!res.success) {
      onNotify('error', res.error || 'Não foi possível ativar a habilidade.');
      return;
    }
    onUpdateCharacter(res.character);
    const ab = res.character.abilities.find((a) => a.id === abilityId);
    onNotify('success', `Habilidade "${ab?.name || ''}" ativada.`);
  };

  const handleDeactivate = (abilityId: string) => {
    const ab = character.abilities.find((a) => a.id === abilityId);
    onUpdateCharacter(deactivateAbility(character, abilityId, 'manual'));
    onNotify('info', `Habilidade "${ab?.name || ''}" desativada.`);
  };

  const handleNextTurn = () => {
    const next = advanceTurn(character);
    onUpdateCharacter(next);
    if (next.combat.warnings.length > 0) {
      onNotify('info', next.combat.warnings[0]);
    }
  };

  const handleNextRound = () => {
    const next = advanceRound(character);
    onUpdateCharacter(next);
    if (next.combat.warnings.length > 0) {
      onNotify('info', next.combat.warnings[0]);
    }
  };

  const handleUndoTurn = () => {
    if (character.combat.undoStack.length === 0) return;
    onUpdateCharacter(undoLastTurn(character));
    onNotify('info', 'Avanço de turno desfeito com sucesso.');
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editingCategory.name.trim()) return;
    const nextCats = isNewCategory
      ? [...character.abilityCategories, editingCategory]
      : character.abilityCategories.map((c) =>
          c.id === editingCategory.id ? editingCategory : c
        );
    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      abilityCategories: nextCats,
    });
    setEditingCategory(null);
  };

  const openCreateAbility = () => {
    setIsNewAbility(true);
    setEditingAbility({
      id: createId('ab'),
      name: '',
      categoryId: character.abilityCategories[0]?.id || '',
      subcategory: '',
      level: 1,
      description: '',
      abilityType: 'instant',
      requirements: '',
      initialCosts: character.resources[0]
        ? [{ resourceId: character.resources[0].id, amount: 5 }]
        : [],
      recurringCosts: [],
      durationTurns: 0,
      cooldownTurns: 0,
      cooldownStartCondition: 'on_deactivate',
      effectsText: '',
      damageText: '',
      damageAttributeIds: [],
      turnDiceText: '',
      copyConfig: { ...DEFAULT_ABILITY_COPY_CONFIG },
      attributeModifiers: [],
      resourceModifiers: [],
      customFields: [],
      isActive: false,
      remainingDuration: 0,
      remainingCooldown: 0,
      timingRules: { ...DEFAULT_TIMING_RULES },
      insufficientResourceRule: character.combat.defaultInsufficientResourceRule,
    });
  };

  const handleSaveAbility = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAbility || !editingAbility.name.trim()) return;
    const normalized: Ability = {
      ...editingAbility,
      copyConfig: normalizeAbilityCopyConfig(editingAbility.copyConfig),
      isActive: editingAbility.abilityType === 'passive' ? true : editingAbility.isActive,
      level: Math.max(0, Math.trunc(Number(editingAbility.level) || 0)),
      durationTurns: Math.max(0, editingAbility.durationTurns),
      cooldownTurns: Math.max(0, editingAbility.cooldownTurns),
    };
    const nextAbilities = isNewAbility
      ? [...character.abilities, normalized]
      : character.abilities.map((a) => (a.id === normalized.id ? normalized : a));
    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      abilities: nextAbilities,
    });
    setEditingAbility(null);
    onNotify('success', `Habilidade "${normalized.name}" salva.`);
  };

  const handleCopyAbility = async (
    ability: Ability,
    configOverride?: AbilityCopyConfig
  ) => {
    const text = formatAbilityCopyText(character, ability, configOverride);
    const copied = await copyTextToClipboard(text);
    if (copied) {
      onNotify('success', `Habilidade "${ability.name || 'Habilidade'}" copiada!`);
    } else {
      setSharingAbilityState({
        ability,
        config: normalizeAbilityCopyConfig(configOverride ?? ability.copyConfig),
      });
      onNotify('info', 'Use o painel de compartilhamento para copiar o texto.');
    }
  };

  const handleOpenShareModal = (ability: Ability) => {
    setSharingAbilityState({
      ability,
      config: normalizeAbilityCopyConfig(ability.copyConfig),
    });
  };

  const handleNativeShare = async () => {
    if (!sharingAbilityState) return;
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      await handleCopyAbility(sharingAbilityState.ability, sharingAbilityState.config);
      return;
    }
    try {
      await navigator.share({
        title: sharingAbilityState.ability.name || 'Habilidade',
        text: sharingPreviewText,
      });
      onNotify('success', 'Habilidade compartilhada!');
    } catch {
      // User cancelled native share sheet or unsupported in iframe
    }
  };

  const handleDuplicateAbility = (ability: Ability) => {
    const copy = duplicateAbilityAsCopy(ability);
    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      abilities: [...character.abilities, copy],
    });
    onNotify('success', `Cópia "${copy.name}" criada nas habilidades!`);
  };

  const handleSaveAsCopyFromModal = () => {
    if (!editingAbility || !editingAbility.name.trim()) return;
    const copy = duplicateAbilityAsCopy(editingAbility, {
      copyConfig: normalizeAbilityCopyConfig(editingAbility.copyConfig),
      level: Math.max(0, Math.trunc(Number(editingAbility.level) || 0)),
      durationTurns: Math.max(0, editingAbility.durationTurns),
      cooldownTurns: Math.max(0, editingAbility.cooldownTurns),
    });
    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      abilities: [...character.abilities, copy],
    });
    setEditingAbility(null);
    onNotify('success', `Nova cópia "${copy.name}" adicionada!`);
  };

  const formatCostList = (costs: Ability['initialCosts']) => {
    if (!costs || costs.length === 0) return 'Sem custo';
    return costs
      .filter((c) => c.amount > 0)
      .map((c) => `${c.amount} ${resourceMap.get(c.resourceId)?.name || 'Recurso'}`)
      .join(', ');
  };

  return (
    <div className="space-y-5">
      {/* Combat Turn & Resource Control Deck */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label
                htmlFor="combat-round-input"
                className="block text-xs text-[var(--text-muted)] mb-0.5"
              >
                Rodada Atual
              </label>
              <input
                id="combat-round-input"
                data-testid="combat-round"
                type="number"
                min={1}
                value={character.combat.round}
                onChange={(e) =>
                  onUpdateCharacter({
                    ...character,
                    updatedAt: Date.now(),
                    combat: {
                      ...character.combat,
                      round: Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                    },
                  })
                }
                className="w-20 px-2.5 py-1 min-h-[38px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xl font-bold text-[var(--text-primary)] text-center"
              />
            </div>
            <div className="h-9 w-px bg-[var(--border-subtle)]" />
            <div>
              <label
                htmlFor="combat-turn-input"
                className="block text-xs text-[var(--text-muted)] mb-0.5"
              >
                Turno Atual
              </label>
              <input
                id="combat-turn-input"
                data-testid="combat-turn"
                type="number"
                min={1}
                value={character.combat.turn}
                onChange={(e) =>
                  onUpdateCharacter({
                    ...character,
                    updatedAt: Date.now(),
                    combat: {
                      ...character.combat,
                      turn: Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                    },
                  })
                }
                className="w-20 px-2.5 py-1 min-h-[38px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xl font-bold text-[var(--text-primary)] text-center"
              />
            </div>
            <div className="h-9 w-px bg-[var(--border-subtle)] hidden sm:block" />
            <div className="text-xs text-[var(--text-muted)]">
              <span>Ativas: </span>
              <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                {activeAbilities.length}
              </span>
              <span className="mx-1.5">·</span>
              <span>Em recarga: </span>
              <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                {cooldownAbilities.length}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNextTurn}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--accent-color)' }}
            >
              <SkipForward className="w-4 h-4" aria-hidden="true" />
              Próximo Turno
            </button>

            <button
              type="button"
              onClick={handleNextRound}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs sm:text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              Próxima Rodada
            </button>

            <button
              type="button"
              disabled={character.combat.undoStack.length === 0}
              onClick={handleUndoTurn}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs sm:text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              <Undo2 className="w-4 h-4" aria-hidden="true" />
              Desfazer Turno
            </button>

            <button
              type="button"
              onClick={() =>
                onConfirmDelete(
                  'Reiniciar Combate',
                  'Deseja reiniciar os contadores de rodada/turno e limpar durações e recargas sem apagar dados do personagem?',
                  () => onUpdateCharacter(resetCombat(character))
                )
              }
              aria-label="Reiniciar combate"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Reiniciar
            </button>
          </div>
        </div>

        {/* Live Resource Strip in Combat */}
        {character.resources.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
            {character.resources.map((res) => {
              const eff = computeResourceEffective(character, res);
              return (
                <div
                  key={res.id}
                  className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-[var(--text-secondary)] truncate">
                      {res.name}
                    </span>
                    <span className="font-mono-num font-bold text-[var(--text-primary)]">
                      {res.current}/{eff.effectiveMax}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-track)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${eff.percentage}%`, backgroundColor: res.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Equipped Weapons Live Damage Strip */}
        {equippedWeapons.length > 0 && (
          <div
            data-testid="combat-equipped-weapons"
            className="pt-3 border-t border-[var(--border-subtle)] space-y-2"
          >
            <h2 className="text-xs font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
              <Sword className="w-3.5 h-3.5 text-[var(--accent-strong)]" aria-hidden="true" />
              Armas Equipadas (Dano com Atributos Atuais)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {equippedWeapons.map(({ item, damage }) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {item.name}
                    </p>
                    {damage.usedStats.length > 0 && (
                      <p className="text-[11px] text-[var(--text-muted)] font-mono-num truncate">
                        Usa: {damage.usedStats.map((s) => `${s.name} (${s.value})`).join(' + ')}
                      </p>
                    )}
                  </div>
                  <span
                    data-testid={`combat-weapon-damage-${item.id}`}
                    className="font-mono-num text-sm font-bold text-[var(--accent-strong)] shrink-0"
                  >
                    {damage.resolvedText}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Confirmations for Insufficient Recurring Resources */}
        {character.combat.pendingConfirmations.length > 0 && (
          <div className="p-3.5 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              Confirmação Manual de Manutenção Pendente
            </div>
            {character.combat.pendingConfirmations.map((conf) => (
              <div
                key={conf.abilityId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <span className="text-[var(--text-primary)]">
                  "{conf.abilityName}" sem recursos suficientes ({conf.missingResources.join(', ')}).
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCharacter(resolvePendingConfirmation(character, conf.abilityId, true))
                    }
                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-[var(--accent-border)] text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--bg-hover)]"
                  >
                    Manter Ativa
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCharacter(
                        resolvePendingConfirmation(character, conf.abilityId, false)
                      )
                    }
                    className="px-3 py-1.5 min-h-[36px] rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                  >
                    Desativar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active & Cooldown Tracking Panels */}
        {(activeAbilities.length > 0 || cooldownAbilities.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            {/* Active Abilities */}
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2">
              <h2 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                Habilidades Ativas ({activeAbilities.length})
              </h2>
              {activeAbilities.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Nenhuma habilidade ativa no momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeAbilities.map((ab) => (
                    <div
                      key={ab.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {ab.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] font-mono-num">
                          {ab.durationTurns > 0
                            ? `Duração: ${ab.remainingDuration}t`
                            : 'Ilimitada'}
                          {ab.recurringCosts.length > 0
                            ? ` · Manut.: ${formatCostList(ab.recurringCosts)}`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {ab.durationTurns > 0 && (
                          <>
                            <button
                              type="button"
                              aria-label={`Diminuir duração de ${ab.name}`}
                              onClick={() =>
                                onUpdateCharacter(adjustAbilityCounters(character, ab.id, -1, 0))
                              }
                              className="p-1.5 min-h-[32px] min-w-[32px] rounded border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                            >
                              <Minus className="w-3 h-3" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Aumentar duração de ${ab.name}`}
                              onClick={() =>
                                onUpdateCharacter(adjustAbilityCounters(character, ab.id, 1, 0))
                              }
                              className="p-1.5 min-h-[32px] min-w-[32px] rounded border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                            >
                              <Plus className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeactivate(ab.id)}
                          className="px-2.5 py-1.5 min-h-[32px] rounded-lg bg-red-500/15 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/25"
                        >
                          Desativar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cooldowns */}
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2">
              <h2 className="text-xs font-semibold text-[var(--accent-strong)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                Em Recarga ({cooldownAbilities.length})
              </h2>
              {cooldownAbilities.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Nenhuma habilidade em recarga.
                </p>
              ) : (
                <div className="space-y-2">
                  {cooldownAbilities.map((ab) => (
                    <div
                      key={ab.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {ab.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] font-mono-num">
                          Recarga restante: {ab.remainingCooldown} turno(s)
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`Reduzir recarga de ${ab.name}`}
                          onClick={() =>
                            onUpdateCharacter(adjustAbilityCounters(character, ab.id, 0, -1))
                          }
                          className="p-1.5 min-h-[32px] min-w-[32px] rounded border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          <Minus className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Aumentar recarga de ${ab.name}`}
                          onClick={() =>
                            onUpdateCharacter(adjustAbilityCounters(character, ab.id, 0, 1))
                          }
                          className="p-1.5 min-h-[32px] min-w-[32px] rounded border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          <Plus className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Abilities Toolbar & Category Filter */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Grimório de Habilidades
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {character.abilities.length} habilidade(s) cadastrada(s)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              <History className="w-4 h-4" aria-hidden="true" />
              Histórico ({character.combat.history.length})
            </button>
            {isEditMode && (
              <>
                <button
                  type="button"
                  onClick={() => setShowCategoriesPanel((v) => !v)}
                  className="px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  Categorias
                </button>
                <button
                  type="button"
                  data-testid="add-ability-btn"
                  onClick={openCreateAbility}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Nova Habilidade
                </button>
              </>
            )}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3 py-2 min-h-[38px] rounded-xl text-xs font-medium border transition-colors ${
              selectedCategoryId === 'all'
                ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            Todas ({character.abilities.length})
          </button>
          {character.abilityCategories.map((cat) => {
            const count = character.abilities.filter((a) => a.categoryId === cat.id).length;
            const active = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-medium border transition-colors ${
                  active
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: cat.color }}
                  aria-hidden="true"
                />
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Manage Categories Drawer */}
        {isEditMode && showCategoriesPanel && (
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Gerenciar Categorias de Habilidades
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsNewCategory(true);
                  setEditingCategory({
                    id: createId('cat'),
                    name: '',
                    color: CATEGORY_COLORS[character.abilityCategories.length % CATEGORY_COLORS.length],
                    icon: 'sparkles',
                    description: '',
                    order: character.abilityCategories.length,
                  });
                }}
                className="text-xs font-semibold text-[var(--accent-strong)] hover:underline"
              >
                + Nova Categoria
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {character.abilityCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {cat.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Editar categoria ${cat.name}`}
                      onClick={() => {
                        setIsNewCategory(false);
                        setEditingCategory({ ...cat });
                      }}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir categoria ${cat.name}`}
                      onClick={() =>
                        onConfirmDelete(
                          'Excluir Categoria',
                          `Deseja excluir a categoria "${cat.name}"?`,
                          () =>
                            onUpdateCharacter({
                              ...character,
                              abilityCategories: character.abilityCategories.filter(
                                (c) => c.id !== cat.id
                              ),
                            })
                        )
                      }
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Combat Action History */}
        {showHistory && (
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2 max-h-60 overflow-y-auto">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Histórico de Ações em Combate
            </h3>
            {character.combat.history.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Nenhuma ação registrada ainda neste combate.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {character.combat.history.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-baseline gap-2 text-[var(--text-secondary)]"
                  >
                    <span className="font-mono-num text-[11px] text-[var(--text-muted)] shrink-0">
                      [R{log.round}·T{log.turn}]
                    </span>
                    <span>{log.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* Editable Abilities Grid (Clean, no hardcoded role sections) */}
        {filteredAbilities.length === 0 ? (
          <p className="text-xs sm:text-sm text-[var(--text-muted)] py-3">
            Nenhuma habilidade registrada nesta categoria ainda.
            {isEditMode ? ' Clique em "Nova Habilidade" para criar.' : ''}
          </p>
        ) : (
          <div
            data-testid="abilities-grid"
            className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1"
          >
            {filteredAbilities.map((ab) => {
              const cat = categoryMap.get(ab.categoryId);
              const isPassive = ab.abilityType === 'passive';
              const onCooldown = ab.remainingCooldown > 0;
              const resolvedDamage = resolveDamageExpression(
                character,
                ab.damageText,
                ab.damageAttributeIds || [],
                attrBreakdowns
              );
              const resolvedTurnDice = resolveDamageExpression(
                character,
                ab.turnDiceText || '',
                [],
                attrBreakdowns
              );

              return (
                <article
                  key={ab.id}
                  data-testid={`ability-card-${ab.id}`}
                  className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-colors ${
                    ab.isActive && !isPassive
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ImageSlot
                      imageId={ab.imageId}
                      fallbackUrl={ab.defaultImageUrl}
                      alt={ab.name}
                      variant="ability"
                      size="md"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-base text-[var(--text-primary)]">
                            {ab.name}
                          </h3>
                          <p className="text-xs text-[var(--text-muted)]">
                            {[
                              cat?.name || 'Geral',
                              ab.subcategory || '',
                              ABILITY_TYPE_LABELS[ab.abilityType],
                              ab.level > 0 ? `Nível ${ab.level}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>

                        {ab.isActive && !isPassive && (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                            Ativa
                          </span>
                        )}
                        {onCooldown && (
                          <span className="font-mono-num text-xs font-semibold text-[var(--accent-strong)] shrink-0">
                            Recarga: {ab.remainingCooldown}t
                          </span>
                        )}
                      </div>

                      {ab.description && (
                        <p className="mt-2 text-xs text-[var(--text-secondary)]">
                          {ab.description}
                        </p>
                      )}

                      {ab.requirements && (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          <span className="font-medium">Pré-requisitos: </span>
                          {ab.requirements}
                        </p>
                      )}

                      <div className="mt-2 space-y-1 text-xs text-[var(--text-primary)]">
                        {ab.initialCosts.length > 0 && (
                          <p>
                            <span className="text-[var(--text-muted)]">Custo inicial: </span>
                            <span className="font-mono-num font-medium">
                              {formatCostList(ab.initialCosts)}
                            </span>
                          </p>
                        )}
                        {ab.abilityType === 'sustained' && ab.recurringCosts.length > 0 && (
                          <p>
                            <span className="text-[var(--text-muted)]">Manutenção/turno: </span>
                            <span className="font-mono-num font-medium">
                              {formatCostList(ab.recurringCosts)}
                            </span>
                          </p>
                        )}
                        {(ab.durationTurns > 0 || ab.cooldownTurns > 0) && (
                          <p className="font-mono-num text-[var(--text-muted)]">
                            {ab.durationTurns > 0 ? `Duração: ${ab.durationTurns}t` : ''}
                            {ab.durationTurns > 0 && ab.cooldownTurns > 0 ? ' · ' : ''}
                            {ab.cooldownTurns > 0 ? `Recarga: ${ab.cooldownTurns}t` : ''}
                          </p>
                        )}
                        {resolvedTurnDice.hasDamage && (
                          <div className="space-y-0.5">
                            <p
                              data-testid={`ability-turndice-${ab.id}`}
                              className="font-medium text-[var(--accent-strong)]"
                            >
                              Dado por turno:{' '}
                              <span className="font-mono-num">{resolvedTurnDice.resolvedText}</span>
                            </p>
                            {resolvedTurnDice.usedStats.length > 0 && (
                              <p className="text-[11px] text-[var(--text-muted)] font-mono-num">
                                Atributos no turno:{' '}
                                {resolvedTurnDice.usedStats
                                  .map((s) => `${s.name} (${s.value})`)
                                  .join(' + ')}
                              </p>
                            )}
                          </div>
                        )}
                        {resolvedDamage.hasDamage && (
                          <div className="space-y-0.5">
                            <p
                              data-testid={`ability-damage-${ab.id}`}
                              className="font-semibold text-[var(--accent-strong)]"
                            >
                              Dano:{' '}
                              <span className="font-mono-num">{resolvedDamage.resolvedText}</span>
                            </p>
                            {resolvedDamage.usedStats.length > 0 && (
                              <p className="text-[11px] text-[var(--text-muted)] font-mono-num">
                                Atributos no dano:{' '}
                                {resolvedDamage.usedStats
                                  .map((s) => `${s.name} (${s.value})`)
                                  .join(' + ')}
                              </p>
                            )}
                          </div>
                        )}
                        {ab.effectsText && (
                          <p className="text-[var(--text-secondary)]">
                            <span className="text-[var(--text-muted)] font-medium">Efeito: </span>
                            {ab.effectsText}
                          </p>
                        )}
                        {(ab.customFields || []).length > 0 && (
                          <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                            {(ab.customFields || []).map((cf) => (
                              <span key={cf.id}>
                                <strong className="text-[var(--text-muted)]">{cf.label}:</strong>{' '}
                                {cf.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-[var(--border-subtle)]">
                    <div className="shrink-0">
                      {isPassive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)]">
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          Fixa (Sempre Ativa)
                        </span>
                      ) : ab.isActive ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(ab.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                        >
                          <Square className="w-3.5 h-3.5" aria-hidden="true" />
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={onCooldown}
                          onClick={() => handleActivate(ab.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] disabled:opacity-40 transition-opacity hover:opacity-90"
                          style={{ backgroundColor: 'var(--accent-color)' }}
                        >
                          <Play className="w-3.5 h-3.5" aria-hidden="true" />
                          {onCooldown ? `Em Recarga (${ab.remainingCooldown}t)` : 'Ativar'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-testid={`copy-ability-${ab.id}`}
                        onClick={() => handleCopyAbility(ab)}
                        aria-label={`Copiar habilidade ${ab.name}`}
                        title="Copiar habilidade"
                        className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        data-testid={`share-ability-${ab.id}`}
                        onClick={() => handleOpenShareModal(ab)}
                        aria-label={`Compartilhar habilidade ${ab.name}`}
                        title="Compartilhar habilidade"
                        className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>

                      {isEditMode && (
                        <>
                          <button
                            type="button"
                            data-testid={`duplicate-ability-${ab.id}`}
                            onClick={() => handleDuplicateAbility(ab)}
                            aria-label={`Duplicar habilidade ${ab.name}`}
                            title="Criar cópia editável da habilidade"
                            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                          >
                            <Files className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            data-testid={`edit-ability-${ab.id}`}
                            onClick={() => {
                              setIsNewAbility(false);
                              setEditingAbility({
                                ...ab,
                                copyConfig: normalizeAbilityCopyConfig(ab.copyConfig),
                                damageAttributeIds: [...(ab.damageAttributeIds || [])],
                                initialCosts: [...ab.initialCosts],
                                recurringCosts: [...ab.recurringCosts],
                                attributeModifiers: [...ab.attributeModifiers],
                                resourceModifiers: [...(ab.resourceModifiers || [])],
                                customFields: [...(ab.customFields || [])],
                                timingRules: { ...ab.timingRules },
                              });
                            }}
                            aria-label={`Editar habilidade ${ab.name}`}
                            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-ability-${ab.id}`}
                            onClick={() =>
                              onConfirmDelete(
                                'Excluir Habilidade',
                                `Deseja excluir "${ab.name}"?`,
                                () =>
                                  onUpdateCharacter({
                                    ...character,
                                    updatedAt: Date.now(),
                                    abilities: character.abilities.filter((x) => x.id !== ab.id),
                                  })
                              )
                            }
                            aria-label={`Excluir habilidade ${ab.name}`}
                            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Category Modal */}
      {editingCategory && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-modal-title"
        >
          <form
            onSubmit={handleSaveCategory}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="cat-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewCategory ? 'Nova Categoria de Habilidade' : `Editar: ${editingCategory.name}`}
            </h3>
            <div>
              <label
                htmlFor="abcat-name"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Nome da Categoria
              </label>
              <input
                id="abcat-name"
                type="text"
                required
                value={editingCategory.name}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, name: e.target.value })
                }
                placeholder="Ex.: Rituais, Transformações, Técnicas"
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                Cor da Categoria
              </span>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Selecionar cor ${hex}`}
                    onClick={() => setEditingCategory({ ...editingCategory, color: hex })}
                    className={`w-8 h-8 rounded-lg border-2 ${
                      editingCategory.color === hex
                        ? 'border-[var(--text-primary)] ring-2 ring-[var(--accent-color)]'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Ability Create/Edit Modal */}
      {editingAbility && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ab-modal-title"
        >
          <form
            onSubmit={handleSaveAbility}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="ab-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewAbility ? 'Nova Habilidade' : `Editar Habilidade: ${editingAbility.name}`}
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <ImageSlot
                imageId={editingAbility.imageId}
                fallbackUrl={editingAbility.defaultImageUrl}
                alt={editingAbility.name || 'Habilidade'}
                variant="ability"
                size="md"
                editable
                onImageChange={(id) => setEditingAbility({ ...editingAbility, imageId: id })}
              />

              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="ab-name"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Nome da Habilidade
                  </label>
                  <input
                    id="ab-name"
                    type="text"
                    required
                    value={editingAbility.name}
                    onChange={(e) =>
                      setEditingAbility({ ...editingAbility, name: e.target.value })
                    }
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ab-cat"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Categoria
                  </label>
                  <select
                    id="ab-cat"
                    value={editingAbility.categoryId}
                    onChange={(e) =>
                      setEditingAbility({ ...editingAbility, categoryId: e.target.value })
                    }
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  >
                    <option value="">Geral (Sem Categoria)</option>
                    {character.abilityCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="ab-subcat"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Subcategoria / Escola
                  </label>
                  <input
                    id="ab-subcat"
                    type="text"
                    value={editingAbility.subcategory || ''}
                    onChange={(e) =>
                      setEditingAbility({ ...editingAbility, subcategory: e.target.value })
                    }
                    placeholder="Opcional"
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ab-type"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Tipo de Comportamento
                  </label>
                  <select
                    id="ab-type"
                    value={editingAbility.abilityType}
                    onChange={(e) =>
                      setEditingAbility({
                        ...editingAbility,
                        abilityType: e.target.value as AbilityType,
                      })
                    }
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  >
                    {Object.entries(ABILITY_TYPE_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="ab-level"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Nível da Habilidade
                  </label>
                  <input
                    id="ab-level"
                    type="number"
                    min={0}
                    value={editingAbility.level}
                    onChange={(e) =>
                      setEditingAbility({
                        ...editingAbility,
                        level: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                      })
                    }
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="ab-req"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Pré-requisitos
                  </label>
                  <input
                    id="ab-req"
                    type="text"
                    value={editingAbility.requirements || ''}
                    onChange={(e) =>
                      setEditingAbility({ ...editingAbility, requirements: e.target.value })
                    }
                    placeholder="Opcional (ex.: Nível 3, Sabedoria 14)"
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="ab-dur"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Duração (turnos)
                </label>
                <input
                  id="ab-dur"
                  type="number"
                  min={0}
                  value={editingAbility.durationTurns}
                  onChange={(e) =>
                    setEditingAbility({
                      ...editingAbility,
                      durationTurns: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ab-cd"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Recarga (turnos)
                </label>
                <input
                  id="ab-cd"
                  type="number"
                  min={0}
                  value={editingAbility.cooldownTurns}
                  onChange={(e) =>
                    setEditingAbility({
                      ...editingAbility,
                      cooldownTurns: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ab-cdstart"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Início da Recarga
                </label>
                <select
                  id="ab-cdstart"
                  value={editingAbility.cooldownStartCondition}
                  onChange={(e) =>
                    setEditingAbility({
                      ...editingAbility,
                      cooldownStartCondition: e.target.value as 'on_activate' | 'on_deactivate',
                    })
                  }
                  className="w-full px-2.5 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="on_deactivate">Ao desativar / encerrar</option>
                  <option value="on_activate">Ao ativar</option>
                </select>
              </div>
            </div>

            {/* Initial & Recurring Costs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
              {/* Initial Costs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Custos Iniciais (Ativação)
                  </span>
                  <button
                    type="button"
                    disabled={character.resources.length === 0}
                    onClick={() => {
                      const r = character.resources[0];
                      if (!r) return;
                      setEditingAbility({
                        ...editingAbility,
                        initialCosts: [
                          ...editingAbility.initialCosts,
                          { resourceId: r.id, amount: 5 },
                        ],
                      });
                    }}
                    className="text-xs font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-40"
                  >
                    + Custo
                  </button>
                </div>
                {editingAbility.initialCosts.map((cost, idx) => (
                  <div key={`init_${idx}`} className="flex items-center gap-1.5">
                    <select
                      value={cost.resourceId}
                      aria-label="Recurso do custo inicial"
                      onChange={(e) =>
                        setEditingAbility({
                          ...editingAbility,
                          initialCosts: editingAbility.initialCosts.map((c, i) =>
                            i === idx ? { ...c, resourceId: e.target.value } : c
                          ),
                        })
                      }
                      className="flex-1 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      {character.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      aria-label="Quantidade do custo inicial"
                      value={cost.amount}
                      onChange={(e) =>
                        setEditingAbility({
                          ...editingAbility,
                          initialCosts: editingAbility.initialCosts.map((c, i) =>
                            i === idx ? { ...c, amount: Math.max(0, Number(e.target.value) || 0) } : c
                          ),
                        })
                      }
                      className="w-16 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      aria-label="Remover custo inicial"
                      onClick={() =>
                        setEditingAbility({
                          ...editingAbility,
                          initialCosts: editingAbility.initialCosts.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Recurring Costs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Custos Recorrentes (Sustentada)
                  </span>
                  <button
                    type="button"
                    disabled={character.resources.length === 0}
                    onClick={() => {
                      const r = character.resources[0];
                      if (!r) return;
                      setEditingAbility({
                        ...editingAbility,
                        recurringCosts: [
                          ...editingAbility.recurringCosts,
                          { resourceId: r.id, amount: 2 },
                        ],
                      });
                    }}
                    className="text-xs font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-40"
                  >
                    + Manutenção
                  </button>
                </div>
                {editingAbility.recurringCosts.map((cost, idx) => (
                  <div key={`rec_${idx}`} className="flex items-center gap-1.5">
                    <select
                      value={cost.resourceId}
                      aria-label="Recurso do custo recorrente"
                      onChange={(e) =>
                        setEditingAbility({
                          ...editingAbility,
                          recurringCosts: editingAbility.recurringCosts.map((c, i) =>
                            i === idx ? { ...c, resourceId: e.target.value } : c
                          ),
                        })
                      }
                      className="flex-1 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      {character.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      aria-label="Quantidade do custo recorrente"
                      value={cost.amount}
                      onChange={(e) =>
                        setEditingAbility({
                          ...editingAbility,
                          recurringCosts: editingAbility.recurringCosts.map((c, i) =>
                            i === idx ? { ...c, amount: Math.max(0, Number(e.target.value) || 0) } : c
                          ),
                        })
                      }
                      className="w-16 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      aria-label="Remover custo recorrente"
                      onClick={() =>
                        setEditingAbility({
                          ...editingAbility,
                          recurringCosts: editingAbility.recurringCosts.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Timing & Insufficient Resource Rules */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="ab-t-rec"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Custo Recorrente em
                </label>
                <select
                  id="ab-t-rec"
                  value={editingAbility.timingRules.processRecurringAt}
                  onChange={(e) =>
                    setEditingAbility({
                      ...editingAbility,
                      timingRules: {
                        ...editingAbility.timingRules,
                        processRecurringAt: e.target.value as TurnPhase,
                      },
                    })
                  }
                  className="w-full px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="turn_start">Início do turno</option>
                  <option value="turn_end">Fim do turno</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="ab-t-dur"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Duração reduz em
                </label>
                <select
                  id="ab-t-dur"
                  value={editingAbility.timingRules.processDurationAt}
                  onChange={(e) =>
                    setEditingAbility({
                      ...editingAbility,
                      timingRules: {
                        ...editingAbility.timingRules,
                        processDurationAt: e.target.value as TurnPhase,
                      },
                    })
                  }
                  className="w-full px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="turn_end">Fim do turno</option>
                  <option value="turn_start">Início do turno</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="ab-t-cd"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Recarga reduz em
                </label>
                <select
                  id="ab-t-cd"
                  value={editingAbility.timingRules.processCooldownAt}
                  onChange={(e) =>
                    setEditingAbility({
                      ...editingAbility,
                      timingRules: {
                        ...editingAbility.timingRules,
                        processCooldownAt: e.target.value as TurnPhase,
                      },
                    })
                  }
                  className="w-full px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="turn_end">Fim do turno</option>
                  <option value="turn_start">Início do turno</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="ab-insuff"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Se faltar recurso
                </label>
                <select
                  id="ab-insuff"
                  value={editingAbility.insufficientResourceRule}
                  onChange={(e) =>
                    setEditingAbility({
                      ...editingAbility,
                      insufficientResourceRule: e.target.value as InsufficientResourceRule,
                    })
                  }
                  className="w-full px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="auto_deactivate">Desativar automaticamente</option>
                  <option value="keep_and_warn">Manter ativa e avisar</option>
                  <option value="manual_confirm">Confirmar manualmente</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="ab-damage"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Dano Base / Fórmula (Dados + Fixo + Atributos)
                  </label>
                  <input
                    id="ab-damage"
                    data-testid="ability-damage-input"
                    type="text"
                    value={editingAbility.damageText}
                    onChange={(e) =>
                      setEditingAbility({ ...editingAbility, damageText: e.target.value })
                    }
                    placeholder="Ex.: 3d5 + 60 + Carisma + Vontade"
                    className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ab-turndice"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Dado / Dano por Turno (Opcional)
                  </label>
                  <input
                    id="ab-turndice"
                    type="text"
                    value={editingAbility.turnDiceText || ''}
                    onChange={(e) =>
                      setEditingAbility({ ...editingAbility, turnDiceText: e.target.value })
                    }
                    placeholder="Ex.: 1d6 + Sabedoria fogo por turno"
                    className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>

              {character.attributes.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-[var(--text-muted)]">
                    Atributos somados no dano (usa automaticamente o valor atual):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {character.attributes.map((attr) => {
                      const selected = (editingAbility.damageAttributeIds || []).includes(attr.id);
                      const currentVal = attrBreakdowns[attr.id]?.totalValue ?? attr.baseValue;
                      return (
                        <button
                          key={attr.id}
                          type="button"
                          data-testid={`ability-dmg-attr-${attr.id}`}
                          onClick={() => {
                            const curr = editingAbility.damageAttributeIds || [];
                            const next = selected
                              ? curr.filter((id) => id !== attr.id)
                              : [...curr, attr.id];
                            setEditingAbility({ ...editingAbility, damageAttributeIds: next });
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                            selected
                              ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold'
                              : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          {attr.name} ({currentVal})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {editingPreviewDamage?.hasDamage && (
                <div
                  data-testid="ability-damage-preview"
                  className="px-3 py-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <span className="text-[var(--text-secondary)]">
                    Dano atual calculado com os atributos atuais:
                  </span>
                  <span className="font-mono-num text-sm font-bold text-[var(--accent-strong)]">
                    {editingPreviewDamage.resolvedText}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ab-desc"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Descrição
                </label>
                <textarea
                  id="ab-desc"
                  data-testid="ability-desc-input"
                  rows={2}
                  value={editingAbility.description}
                  onChange={(e) =>
                    setEditingAbility({ ...editingAbility, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ab-effects"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Efeitos
                </label>
                <textarea
                  id="ab-effects"
                  data-testid="ability-effects-input"
                  rows={2}
                  value={editingAbility.effectsText}
                  onChange={(e) =>
                    setEditingAbility({ ...editingAbility, effectsText: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Copy / Share Specification in Edit Mode (Description, Effect, Damage) */}
            <div
              data-testid="ability-copy-spec-section"
              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                    Especificação da Cópia / Compartilhamento
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Defina quais campos (Descrição, Efeito e Dano) devem compor a cópia ao copiar ou compartilhar.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="copy-editing-ability-btn"
                  onClick={() => handleCopyAbility(editingAbility)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Copiar Texto
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    {
                      key: 'includeDescription' as const,
                      label: 'Incluir Descrição',
                      testId: 'copy-spec-desc',
                    },
                    {
                      key: 'includeEffect' as const,
                      label: 'Incluir Efeito',
                      testId: 'copy-spec-effect',
                    },
                    {
                      key: 'includeDamage' as const,
                      label: 'Incluir Dano',
                      testId: 'copy-spec-damage',
                    },
                  ] as const
                ).map((item) => {
                  const cfg = normalizeAbilityCopyConfig(editingAbility.copyConfig);
                  const checked = cfg[item.key];
                  return (
                    <label
                      key={item.key}
                      className="flex items-center gap-2 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        data-testid={item.testId}
                        checked={checked}
                        onChange={(e) =>
                          setEditingAbility({
                            ...editingAbility,
                            copyConfig: {
                              ...cfg,
                              [item.key]: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-[var(--accent-color)] rounded"
                      />
                      <span>{item.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="space-y-1">
                <span className="block text-[11px] font-medium text-[var(--text-muted)]">
                  Prévia da Cópia:
                </span>
                <pre
                  data-testid="ability-copy-preview"
                  className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-sans"
                >
                  {editingCopyPreview}
                </pre>
              </div>
            </div>

            {/* Temporary Attribute Modifiers */}
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Modificadores Temporários de Atributo (enquanto ativa)
                </span>
                <button
                  type="button"
                  disabled={character.attributes.length === 0}
                  onClick={() => {
                    const attr = character.attributes[0];
                    if (!attr) return;
                    setEditingAbility({
                      ...editingAbility,
                      attributeModifiers: [
                        ...editingAbility.attributeModifiers,
                        { attributeId: attr.id, attributeName: attr.name, value: 2 },
                      ],
                    });
                  }}
                  className="text-xs font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-40"
                >
                  + Modificador
                </button>
              </div>
              {editingAbility.attributeModifiers.map((mod, idx) => (
                <div key={`abmod_${idx}`} className="flex items-center gap-2">
                  <select
                    value={mod.attributeId}
                    aria-label="Atributo modificado"
                    onChange={(e) => {
                      const attr = character.attributes.find((a) => a.id === e.target.value);
                      setEditingAbility({
                        ...editingAbility,
                        attributeModifiers: editingAbility.attributeModifiers.map((m, i) =>
                          i === idx
                            ? { ...m, attributeId: e.target.value, attributeName: attr?.name }
                            : m
                        ),
                      });
                    }}
                    className="flex-1 px-2.5 py-2 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                  >
                    {character.attributes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.shortName})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    aria-label="Valor do modificador"
                    value={mod.value}
                    onChange={(e) =>
                      setEditingAbility({
                        ...editingAbility,
                        attributeModifiers: editingAbility.attributeModifiers.map((m, i) =>
                          i === idx ? { ...m, value: Number(e.target.value) || 0 } : m
                        ),
                      })
                    }
                    className="w-20 px-2.5 py-2 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    aria-label="Remover modificador"
                    onClick={() =>
                      setEditingAbility({
                        ...editingAbility,
                        attributeModifiers: editingAbility.attributeModifiers.filter(
                          (_, i) => i !== idx
                        ),
                      })
                    }
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>

            {/* Resource Max Modifiers & Custom Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Bônus em Máx. de Recurso
                  </span>
                  <button
                    type="button"
                    disabled={character.resources.length === 0}
                    onClick={() => {
                      const r = character.resources[0];
                      if (!r) return;
                      setEditingAbility({
                        ...editingAbility,
                        resourceModifiers: [
                          ...(editingAbility.resourceModifiers || []),
                          { resourceId: r.id, resourceName: r.name, maxBonus: 5 },
                        ],
                      });
                    }}
                    className="text-xs font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-40"
                  >
                    + Bônus
                  </button>
                </div>
                {(editingAbility.resourceModifiers || []).map((rm, idx) => (
                  <div key={`rmod_${idx}`} className="flex items-center gap-1.5">
                    <select
                      value={rm.resourceId}
                      aria-label="Recurso modificado"
                      onChange={(e) => {
                        const res = character.resources.find((r) => r.id === e.target.value);
                        setEditingAbility({
                          ...editingAbility,
                          resourceModifiers: (editingAbility.resourceModifiers || []).map((x, i) =>
                            i === idx
                              ? { ...x, resourceId: e.target.value, resourceName: res?.name }
                              : x
                          ),
                        });
                      }}
                      className="flex-1 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      {character.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      aria-label="Bônus máximo do recurso"
                      value={rm.maxBonus}
                      onChange={(e) =>
                        setEditingAbility({
                          ...editingAbility,
                          resourceModifiers: (editingAbility.resourceModifiers || []).map((x, i) =>
                            i === idx ? { ...x, maxBonus: Number(e.target.value) || 0 } : x
                          ),
                        })
                      }
                      className="w-16 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      aria-label="Remover bônus de recurso"
                      onClick={() =>
                        setEditingAbility({
                          ...editingAbility,
                          resourceModifiers: (editingAbility.resourceModifiers || []).filter(
                            (_, i) => i !== idx
                          ),
                        })
                      }
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Campos Personalizados
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingAbility({
                        ...editingAbility,
                        customFields: [
                          ...(editingAbility.customFields || []),
                          { id: createId('fld'), label: '', value: '' },
                        ],
                      })
                    }
                    className="text-xs font-semibold text-[var(--accent-strong)] hover:underline"
                  >
                    + Campo
                  </button>
                </div>
                {(editingAbility.customFields || []).map((cf) => (
                  <div key={cf.id} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={cf.label}
                      placeholder="Rótulo"
                      aria-label="Rótulo do campo personalizado"
                      onChange={(e) =>
                        setEditingAbility({
                          ...editingAbility,
                          customFields: (editingAbility.customFields || []).map((f) =>
                            f.id === cf.id ? { ...f, label: e.target.value } : f
                          ),
                        })
                      }
                      className="w-1/2 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      value={cf.value}
                      placeholder="Valor"
                      aria-label="Valor do campo personalizado"
                      onChange={(e) =>
                        setEditingAbility({
                          ...editingAbility,
                          customFields: (editingAbility.customFields || []).map((f) =>
                            f.id === cf.id ? { ...f, value: e.target.value } : f
                          ),
                        })
                      }
                      className="w-1/2 px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      aria-label="Remover campo personalizado"
                      onClick={() =>
                        setEditingAbility({
                          ...editingAbility,
                          customFields: (editingAbility.customFields || []).filter(
                            (f) => f.id !== cf.id
                          ),
                        })
                      }
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingAbility(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="save-ability-as-copy-btn"
                disabled={!editingAbility.name.trim()}
                onClick={handleSaveAsCopyFromModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                <Files className="w-4 h-4" aria-hidden="true" />
                Salvar como Cópia
              </button>
              <button
                type="submit"
                data-testid="save-ability-btn"
                className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Salvar Habilidade
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Share / Copy Ability Modal */}
      {sharingAbilityState && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-ab-modal-title"
          data-testid="ability-share-modal"
        >
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="share-ab-modal-title"
                  className="font-display text-lg font-semibold text-[var(--text-primary)]"
                >
                  Copiar / Compartilhar Habilidade
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {sharingAbilityState.ability.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar janela de compartilhamento"
                onClick={() => setSharingAbilityState(null)}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    key: 'includeDescription' as const,
                    label: 'Descrição',
                    testId: 'share-toggle-desc',
                  },
                  {
                    key: 'includeEffect' as const,
                    label: 'Efeito',
                    testId: 'share-toggle-effect',
                  },
                  {
                    key: 'includeDamage' as const,
                    label: 'Dano',
                    testId: 'share-toggle-damage',
                  },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)] cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    data-testid={item.testId}
                    checked={sharingAbilityState.config[item.key]}
                    onChange={(e) =>
                      setSharingAbilityState({
                        ...sharingAbilityState,
                        config: {
                          ...sharingAbilityState.config,
                          [item.key]: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-[var(--accent-color)] rounded"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label
                htmlFor="share-preview-text"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Texto Formatado para Cópia
              </label>
              <textarea
                id="share-preview-text"
                data-testid="share-preview-textarea"
                readOnly
                rows={6}
                value={sharingPreviewText}
                className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs sm:text-sm text-[var(--text-primary)] font-sans"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSharingAbilityState(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Fechar
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  type="button"
                  data-testid="share-modal-native-btn"
                  onClick={handleNativeShare}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                  Compartilhar
                </button>
              )}
              <button
                type="button"
                data-testid="share-modal-copy-btn"
                onClick={() =>
                  handleCopyAbility(sharingAbilityState.ability, sharingAbilityState.config)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                <Copy className="w-4 h-4" aria-hidden="true" />
                Copiar Texto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
