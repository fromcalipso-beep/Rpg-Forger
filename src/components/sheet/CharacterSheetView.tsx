import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  adjustResourceValue,
  computeAllAttributes,
  computeResourceEffective,
} from '../../engine/attributes';
import {
  applyPlayerResourceDelta,
  applyPlayerXpDelta,
} from '../../engine/randomEngine';
import {
  AttributeDef,
  Character,
  CharacterIdentity,
  ResourceDef,
  SkillDef,
} from '../../types/rpg';
import { createId } from '../../utils/id';
import { ImageSlot } from '../shared/ImageSlot';
import { KnowledgeSection } from './KnowledgeSection';

interface CharacterSheetViewProps {
  character: Character;
  onUpdateCharacter: (next: Character) => void;
  onConfirmDelete: (title: string, message: string, action: () => void) => void;
  onNotify?: (kind: 'success' | 'error' | 'info', text: string) => void;
  compact?: boolean;
  isEditMode?: boolean;
}

const IDENTITY_FIELD_META: Array<{ key: keyof CharacterIdentity; label: string }> = [
  { key: 'race', label: 'Raça' },
  { key: 'subrace', label: 'Sub-raça' },
  { key: 'characterClass', label: 'Classe' },
  { key: 'subclass', label: 'Subclasse' },
  { key: 'profession', label: 'Profissão' },
  { key: 'title', label: 'Título' },
  { key: 'affiliation', label: 'Afiliação' },
  { key: 'background', label: 'Antecedente' },
  { key: 'age', label: 'Idade' },
  { key: 'gender', label: 'Gênero' },
  { key: 'height', label: 'Altura' },
  { key: 'weight', label: 'Peso' },
];

const RESOURCE_COLORS = [
  '#C94040',
  '#4B7FD6',
  '#D19A38',
  '#34A876',
  '#8A67C2',
  '#D97706',
  '#0EA5E9',
  '#EC4899',
];

export const CharacterSheetView: React.FC<CharacterSheetViewProps> = ({
  character,
  onUpdateCharacter,
  onConfirmDelete,
  onNotify,
  compact = false,
  isEditMode = true,
}) => {
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [showSectionOrganizer, setShowSectionOrganizer] = useState(false);

  // Resource modal state
  const [editingResource, setEditingResource] = useState<ResourceDef | null>(null);
  const [isNewResource, setIsNewResource] = useState(false);

  // Attribute modal state
  const [editingAttr, setEditingAttr] = useState<AttributeDef | null>(null);
  const [isNewAttr, setIsNewAttr] = useState(false);
  const [expandedAttrId, setExpandedAttrId] = useState<string | null>(null);

  // Skill modal state
  const [editingSkill, setEditingSkill] = useState<SkillDef | null>(null);
  const [isNewSkill, setIsNewSkill] = useState(false);

  // Custom identity field input
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  // Player-defined XP & Resource adjustment controls
  const [xpCustomAmount, setXpCustomAmount] = useState<number>(50);
  const [resCustomAmounts, setResCustomAmounts] = useState<Record<string, number>>({});

  const attrBreakdowns = useMemo(() => computeAllAttributes(character), [character]);

  const updateIdentity = (patch: Partial<CharacterIdentity>) => {
    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      identity: { ...character.identity, ...patch },
    });
  };

  const toggleFieldHidden = (fieldKey: string) => {
    const hidden = character.identity.hiddenFields || [];
    const next = hidden.includes(fieldKey)
      ? hidden.filter((k) => k !== fieldKey)
      : [...hidden, fieldKey];
    updateIdentity({ hiddenFields: next });
  };

  const moveSection = (sectionId: string, dir: -1 | 1) => {
    const rawOrder = (
      character.identity.sectionOrder || [
        'identity',
        'progression',
        'resources',
        'attributes',
        'skills',
        'knowledge',
      ]
    ).filter((s) => s !== 'wallet');
    const order = rawOrder.includes('knowledge') ? rawOrder : [...rawOrder, 'knowledge'];
    const idx = order.indexOf(sectionId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= order.length) return;
    [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
    updateIdentity({ sectionOrder: order });
  };

  const handleResourceSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResource || !editingResource.name.trim()) return;
    const nextResources = isNewResource
      ? [...character.resources, editingResource]
      : character.resources.map((r) => (r.id === editingResource.id ? editingResource : r));

    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      resources: nextResources,
    });
    setEditingResource(null);
  };

  const handleAttributeSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttr || !editingAttr.name.trim()) return;
    const normalized: AttributeDef = {
      ...editingAttr,
      shortName: editingAttr.shortName.trim() || editingAttr.name.slice(0, 3).toUpperCase(),
      category: editingAttr.category.trim() || 'Geral',
    };
    const nextAttrs = isNewAttr
      ? [...character.attributes, normalized]
      : character.attributes.map((a) => (a.id === normalized.id ? normalized : a));

    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      attributes: nextAttrs,
    });
    setEditingAttr(null);
  };

  const handleSkillSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSkill || !editingSkill.name.trim()) return;
    const nextSkills = isNewSkill
      ? [...character.skills, editingSkill]
      : character.skills.map((s) => (s.id === editingSkill.id ? editingSkill : s));

    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      skills: nextSkills,
    });
    setEditingSkill(null);
  };

  const xpPercent =
    character.identity.nextLevelXp > 0
      ? Math.min(100, Math.round((character.identity.currentXp / character.identity.nextLevelXp) * 100))
      : 0;

  const groupedAttributes = useMemo(() => {
    const map = new Map<string, AttributeDef[]>();
    const sorted = [...character.attributes].sort((a, b) => a.order - b.order);
    for (const attr of sorted) {
      const cat = attr.category || 'Geral';
      const list = map.get(cat) || [];
      list.push(attr);
      map.set(cat, list);
    }
    return Array.from(map.entries());
  }, [character.attributes]);

  const rawSectionOrder = (
    character.identity.sectionOrder || [
      'identity',
      'progression',
      'resources',
      'attributes',
      'skills',
      'knowledge',
    ]
  ).filter((s) => s !== 'wallet');
  const sectionOrder = rawSectionOrder.includes('knowledge')
    ? rawSectionOrder
    : [...rawSectionOrder, 'knowledge'];

  const renderSection = (sectionKey: string) => {
    if (sectionKey === 'identity') {
      const visibleFields = IDENTITY_FIELD_META.filter(
        (f) => !character.identity.hiddenFields.includes(f.key)
      );

      return (
        <section
          key="identity"
          data-testid="identity-section"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6"
        >
          {isEditMode && (
            <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
              <button
                type="button"
                onClick={() => setShowSectionOrganizer((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Settings2 className="w-4 h-4" aria-hidden="true" />
                Organizar Ficha
              </button>
              <button
                type="button"
                onClick={() => setEditingIdentity((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                <Edit3 className="w-4 h-4" aria-hidden="true" />
                {editingIdentity ? 'Concluir Edição' : 'Editar Dados'}
              </button>
            </div>
          )}

          {/* 4x4 Banner Portrait with Name Below */}
          <div className="flex flex-col items-center text-center gap-4">
            <ImageSlot
              imageId={character.identity.portraitImageId}
              fallbackUrl={character.identity.defaultPortraitUrl}
              alt={character.identity.name}
              variant="portrait"
              size="banner"
              editable={isEditMode && editingIdentity}
              onImageChange={(id) => updateIdentity({ portraitImageId: id })}
            />
            <div className="min-w-0 max-w-2xl">
              <h1
                data-testid="character-banner-name"
                className="font-display text-2xl sm:text-3xl lg:text-4xl font-semibold text-[var(--text-primary)] tracking-tight text-balance"
              >
                {character.identity.name}
              </h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {[
                  character.identity.characterClass,
                  character.identity.subclass,
                  character.identity.race,
                  character.identity.title,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Personalize os dados deste personagem'}
              </p>
              {character.identity.affiliation && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Afiliação: {character.identity.affiliation}
                </p>
              )}
            </div>
          </div>

          {isEditMode && showSectionOrganizer && (
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Ordem das Seções & Módulos Opcionais
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sectionOrder.map((sec, idx) => {
                  const labelMap: Record<string, string> = {
                    identity: 'Identidade',
                    progression: 'Progressão',
                    resources: 'Recursos',
                    wallet: 'Carteira & Moedas',
                    attributes: 'Atributos',
                    skills: 'Perícias & Estatísticas',
                    knowledge: 'Livros & Conhecimentos',
                  };
                  return (
                    <div
                      key={sec}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                    >
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {labelMap[sec] || sec}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveSection(sec, -1)}
                          aria-label={`Mover ${labelMap[sec]} para cima`}
                          className="p-1 rounded text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === sectionOrder.length - 1}
                          onClick={() => moveSection(sec, 1)}
                          aria-label={`Mover ${labelMap[sec]} para baixo`}
                          className="p-1 rounded text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {(
                  [
                    ['progression', 'Progressão'],
                    ['resources', 'Recursos'],
                    ['wallet', 'Bolsa de Moedas (Mochila)'],
                    ['attributes', 'Atributos'],
                    ['skills', 'Perícias'],
                    ['knowledge', 'Livros & Conhecimentos'],
                  ] as const
                ).map(([modKey, modLabel]) => {
                  const active = character.enabledModules[modKey];
                  return (
                    <button
                      key={modKey}
                      type="button"
                      onClick={() =>
                        onUpdateCharacter({
                          ...character,
                          updatedAt: Date.now(),
                          enabledModules: {
                            ...character.enabledModules,
                            [modKey]: !active,
                          },
                        })
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-medium border transition-colors ${
                        active
                          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                          : 'border-[var(--border-strong)] text-[var(--text-muted)]'
                      }`}
                    >
                      {active ? (
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {modLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isEditMode && editingIdentity ? (
            <div className="mt-5 pt-5 border-t border-[var(--border-subtle)] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="char-edit-name"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Nome do Personagem
                  </label>
                  <input
                    id="char-edit-name"
                    type="text"
                    value={character.identity.name}
                    onChange={(e) => updateIdentity({ name: e.target.value })}
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="char-edit-level-label"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Rótulo do Nível
                  </label>
                  <input
                    id="char-edit-level-label"
                    type="text"
                    value={character.identity.levelLabel || 'Nível'}
                    onChange={(e) => updateIdentity({ levelLabel: e.target.value })}
                    placeholder="Ex.: Nível, Círculo, Tier"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="char-edit-xp-label"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Rótulo da Experiência
                  </label>
                  <input
                    id="char-edit-xp-label"
                    type="text"
                    value={character.identity.xpLabel || 'Experiência'}
                    onChange={(e) => updateIdentity({ xpLabel: e.target.value })}
                    placeholder="Ex.: Experiência, XP, Pontos"
                    className="w-full px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {IDENTITY_FIELD_META.map((field) => {
                  const isHidden = character.identity.hiddenFields.includes(field.key);
                  return (
                    <div key={field.key} className={isHidden ? 'opacity-50' : ''}>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor={`id-field-${field.key}`}
                          className="text-xs font-medium text-[var(--text-muted)]"
                        >
                          {field.label}
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleFieldHidden(field.key)}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {isHidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                      </div>
                      <input
                        id={`id-field-${field.key}`}
                        type="text"
                        value={String(character.identity[field.key] || '')}
                        onChange={(e) =>
                          updateIdentity({ [field.key]: e.target.value } as Partial<CharacterIdentity>)
                        }
                        className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <label
                  htmlFor="id-field-bio"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Biografia & História
                </label>
                <textarea
                  id="id-field-bio"
                  rows={3}
                  value={character.identity.biography}
                  onChange={(e) => updateIdentity({ biography: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>

              {/* Custom Identity Fields */}
              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Campos Personalizados de Identidade
                </p>
                {character.identity.customFields.map((cf) => (
                  <div key={cf.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cf.label}
                      aria-label="Nome do campo personalizado"
                      onChange={(e) =>
                        updateIdentity({
                          customFields: character.identity.customFields.map((f) =>
                            f.id === cf.id ? { ...f, label: e.target.value } : f
                          ),
                        })
                      }
                      className="w-1/3 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      value={cf.value}
                      aria-label={`Valor de ${cf.label}`}
                      onChange={(e) =>
                        updateIdentity({
                          customFields: character.identity.customFields.map((f) =>
                            f.id === cf.id ? { ...f, value: e.target.value } : f
                          ),
                        })
                      }
                      className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateIdentity({
                          customFields: character.identity.customFields.filter(
                            (f) => f.id !== cf.id
                          ),
                        })
                      }
                      aria-label={`Remover campo ${cf.label}`}
                      className="p-2 min-h-[40px] min-w-[40px] rounded-xl border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="text"
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    placeholder="Nome do novo campo (ex.: Signo)"
                    className="sm:w-1/3 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                  />
                  <input
                    type="text"
                    value={newFieldValue}
                    onChange={(e) => setNewFieldValue(e.target.value)}
                    placeholder="Valor"
                    className="flex-1 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newFieldLabel.trim()) return;
                      updateIdentity({
                        customFields: [
                          ...character.identity.customFields,
                          {
                            id: createId('fld'),
                            label: newFieldLabel.trim(),
                            value: newFieldValue.trim(),
                          },
                        ],
                      });
                      setNewFieldLabel('');
                      setNewFieldValue('');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Adicionar Campo
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5">
                {visibleFields.map((field) => {
                  const val = String(character.identity[field.key] || '');
                  if (!val) return null;
                  return (
                    <div key={field.key}>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {field.label}
                      </span>
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {val}
                      </span>
                    </div>
                  );
                })}
                {character.identity.customFields.map((cf) => (
                  <div key={cf.id}>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {cf.label}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {cf.value || '—'}
                    </span>
                  </div>
                ))}
              </div>
              {character.identity.biography && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {character.identity.biography}
                </p>
              )}
            </div>
          )}
        </section>
      );
    }

    if (sectionKey === 'progression') {
      if (!character.enabledModules.progression) return null;
      const xpLabelText = character.identity.xpLabel || 'Experiência';
      const handleXpPlayerDelta = (sign: 1 | -1) => {
        const res = applyPlayerXpDelta(character, xpCustomAmount, sign);
        onUpdateCharacter(res.character);
        const signed = res.delta >= 0 ? `+${res.delta}` : `${res.delta}`;
        onNotify?.('info', `${xpLabelText}: ${signed}`);
      };

      return (
        <section
          key="progression"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <label
                  htmlFor="level-input"
                  className="block text-xs text-[var(--text-muted)]"
                >
                  {character.identity.levelLabel || 'Nível'}
                </label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    type="button"
                    aria-label="Diminuir nível"
                    onClick={() =>
                      updateIdentity({ level: Math.max(0, character.identity.level - 1) })
                    }
                    className="p-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <input
                    id="level-input"
                    data-testid="level-input"
                    type="number"
                    min={0}
                    aria-label={`Valor atual de ${character.identity.levelLabel || 'Nível'}`}
                    value={character.identity.level}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      if (Number.isNaN(parsed)) return;
                      updateIdentity({ level: Math.max(0, Math.floor(parsed)) });
                    }}
                    className="w-16 px-2 py-1 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xl font-bold text-[var(--text-primary)] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    aria-label="Aumentar nível"
                    onClick={() => updateIdentity({ level: character.identity.level + 1 })}
                    className="p-1.5 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="h-10 w-px bg-[var(--border-subtle)]" />

              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
                  <span>{xpLabelText}</span>
                  <span className="font-mono-num" data-testid="xp-summary-text">
                    {character.identity.currentXp} / {character.identity.nextLevelXp} ({xpPercent}%)
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[var(--bg-track)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${xpPercent}%`,
                      backgroundColor: 'var(--accent-color)',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="xp-input">
                Experiência atual
              </label>
              <input
                id="xp-input"
                type="number"
                value={character.identity.currentXp}
                onChange={(e) =>
                  updateIdentity({ currentXp: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-24 px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
              />
              <span className="text-xs text-[var(--text-muted)]">/</span>
              <label className="sr-only" htmlFor="next-xp-input">
                Experiência para próximo nível
              </label>
              <input
                id="next-xp-input"
                type="number"
                value={character.identity.nextLevelXp}
                onChange={(e) =>
                  updateIdentity({ nextLevelXp: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-24 px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
              />
            </div>
          </div>

          {/* Player-Defined Add / Subtract XP Value */}
          <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="xp-custom-amount"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              Somar ou subtrair valor em {xpLabelText}:
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="xp-custom-amount"
                data-testid="xp-custom-amount"
                type="number"
                min={0}
                value={xpCustomAmount}
                onChange={(e) => setXpCustomAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 px-2 py-1 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xs text-center text-[var(--text-primary)]"
              />
              <button
                type="button"
                data-testid="xp-player-sub"
                aria-label={`Subtrair valor definido em ${xpLabelText}`}
                onClick={() => handleXpPlayerDelta(-1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] whitespace-nowrap"
              >
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                Subtrair
              </button>
              <button
                type="button"
                data-testid="xp-player-add"
                aria-label={`Somar valor definido em ${xpLabelText}`}
                onClick={() => handleXpPlayerDelta(1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold text-[var(--accent-contrast)] hover:opacity-90 whitespace-nowrap"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Somar
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (sectionKey === 'resources') {
      if (!character.enabledModules.resources) return null;
      return (
        <section
          key="resources"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                Recursos Vitais
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Ajustes imediatos e integração automática com habilidades e equipamentos
              </p>
            </div>
            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  setIsNewResource(true);
                  setEditingResource({
                    id: createId('res'),
                    name: '',
                    current: 20,
                    max: 20,
                    min: 0,
                    tempBonus: 0,
                    color: RESOURCE_COLORS[character.resources.length % RESOURCE_COLORS.length],
                    icon: 'zap',
                    order: character.resources.length,
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Novo Recurso
              </button>
            )}
          </div>

          {character.resources.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4">
              Nenhum recurso configurado neste modelo. Clique em "Novo Recurso" para adicionar Vida, Mana, Vigor, Qi ou qualquer barra personalizada.
            </p>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 ${compact ? 'gap-3' : 'gap-4'}`}>
              {character.resources.map((res) => {
                const eff = computeResourceEffective(character, res);
                const hasBonus = eff.equipmentMaxBonus + eff.abilityMaxBonus + eff.tempBonus !== 0;
                const customAmount = resCustomAmounts[res.id] ?? 5;

                const handleResPlayerDelta = (sign: 1 | -1) => {
                  const outcome = applyPlayerResourceDelta(character, res.id, customAmount, sign);
                  onUpdateCharacter(outcome.character);
                  const signed = outcome.delta >= 0 ? `+${outcome.delta}` : `${outcome.delta}`;
                  onNotify?.('info', `${res.name}: ${signed}`);
                };

                return (
                  <div
                    key={res.id}
                    data-testid={`resource-card-${res.id}`}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: res.color }}
                          aria-hidden="true"
                        />
                        <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {res.name}
                        </span>
                        {hasBonus && (
                          <span className="text-xs text-[var(--text-muted)] font-mono-num">
                            (Base {res.max})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          data-testid={`res-value-display-${res.id}`}
                          className="font-mono-num text-sm font-bold text-[var(--text-primary)]"
                        >
                          {res.current} / {eff.effectiveMax}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] font-mono-num ml-1">
                          ({eff.percentage}%)
                        </span>
                        {isEditMode && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsNewResource(false);
                              setEditingResource({ ...res });
                            }}
                            aria-label={`Editar recurso ${res.name}`}
                            className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="h-3 w-full rounded-full bg-[var(--bg-track)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{
                          width: `${eff.percentage}%`,
                          backgroundColor: res.color,
                        }}
                      />
                    </div>

                    {/* Direct Current Value + Player-Defined Add/Subtract Value */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={`res-current-${res.id}`}
                          className="text-xs text-[var(--text-muted)]"
                        >
                          Atual:
                        </label>
                        <input
                          id={`res-current-${res.id}`}
                          type="number"
                          aria-label={`Valor atual de ${res.name}`}
                          value={res.current}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isNaN(val)) return;
                            const delta = val - res.current;
                            onUpdateCharacter(adjustResourceValue(character, res.id, delta));
                          }}
                          className="w-20 text-center py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs font-semibold text-[var(--text-primary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={`res-custom-val-${res.id}`}
                          className="text-xs text-[var(--text-muted)]"
                        >
                          Valor:
                        </label>
                        <button
                          type="button"
                          data-testid={`res-player-sub-${res.id}`}
                          aria-label={`Subtrair valor definido em ${res.name}`}
                          onClick={() => handleResPlayerDelta(-1)}
                          className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <input
                          id={`res-custom-val-${res.id}`}
                          data-testid={`res-custom-amount-${res.id}`}
                          type="number"
                          min={0}
                          aria-label={`Quantidade definida pelo jogador para ${res.name}`}
                          value={customAmount}
                          onChange={(e) =>
                            setResCustomAmounts((prev) => ({
                              ...prev,
                              [res.id]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="w-16 text-center py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs font-semibold text-[var(--text-primary)]"
                        />
                        <button
                          type="button"
                          data-testid={`res-player-add-${res.id}`}
                          aria-label={`Somar valor definido em ${res.name}`}
                          onClick={() => handleResPlayerDelta(1)}
                          className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)] hover:opacity-90"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      );
    }

    if (sectionKey === 'wallet') {
      return null;
    }

    if (sectionKey === 'attributes') {
      if (!character.enabledModules.attributes) return null;
      return (
        <section
          key="attributes"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                Atributos & Modificadores
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Valores base preservados · bônus de equipamentos e habilidades aplicados automaticamente
              </p>
            </div>
            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  setIsNewAttr(true);
                  setEditingAttr({
                    id: createId('attr'),
                    name: '',
                    shortName: '',
                    category: 'Gerais',
                    baseValue: 10,
                    permanentBonus: 0,
                    tempBonus: 0,
                    customSources: [],
                    order: character.attributes.length,
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Novo Atributo
              </button>
            )}
          </div>

          {groupedAttributes.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4">
              Nenhum atributo definido. Crie atributos ilimitados adaptados ao seu sistema de RPG.
            </p>
          ) : (
            <div className="space-y-5">
              {groupedAttributes.map(([category, attrs]) => (
                <div key={category} className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-[var(--text-muted)]">
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {attrs.map((attr) => {
                      const bd = attrBreakdowns[attr.id];
                      const modTotal = bd.totalValue - bd.baseValue;
                      const isExpanded = expandedAttrId === attr.id;

                      return (
                        <div
                          key={attr.id}
                          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 flex flex-col justify-between"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-xs font-mono-num text-[var(--text-muted)]">
                                {attr.shortName}
                              </span>
                              <h4 className="font-semibold text-sm text-[var(--text-primary)] truncate">
                                {attr.name}
                              </h4>
                            </div>

                            {isEditMode && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsNewAttr(false);
                                    setEditingAttr({ ...attr, customSources: [...attr.customSources] });
                                  }}
                                  aria-label={`Editar atributo ${attr.name}`}
                                  className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                                >
                                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-baseline justify-between">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono-num text-2xl font-bold text-[var(--text-primary)]">
                                {bd.totalValue}
                              </span>
                              {modTotal !== 0 && (
                                <span
                                  className={`font-mono-num text-xs font-semibold ${
                                    modTotal > 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-red-500'
                                  }`}
                                >
                                  ({modTotal > 0 ? `+${modTotal}` : modTotal})
                                </span>
                              )}
                            </div>

                            <span className="font-mono-num text-xs text-[var(--text-muted)]">
                              Base {bd.baseValue}
                            </span>
                          </div>

                          {bd.sources.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)]">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAttrId(isExpanded ? null : attr.id)
                                }
                                aria-expanded={isExpanded}
                                className="w-full flex items-center justify-between text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              >
                                <span>{bd.sources.length} modificador(es) ativo(s)</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                              </button>
                              {isExpanded && (
                                <ul className="mt-2 space-y-1 text-xs">
                                  {bd.sources.map((src, i) => (
                                    <li
                                      key={`${src.label}_${i}`}
                                      className="flex items-center justify-between text-[var(--text-secondary)]"
                                    >
                                      <span className="truncate pr-2">{src.label}</span>
                                      <span className="font-mono-num font-semibold shrink-0">
                                        {src.value > 0 ? `+${src.value}` : src.value}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    if (sectionKey === 'skills') {
      if (!character.enabledModules.skills) return null;
      return (
        <section
          key="skills"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                Perícias, Estatísticas & Proficiências
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Configure perícias vinculadas a atributos ou valores independentes
              </p>
            </div>
            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  setIsNewSkill(true);
                  setEditingSkill({
                    id: createId('sk'),
                    name: '',
                    category: 'Geral',
                    linkedAttributeId: character.attributes[0]?.id,
                    baseValue: 0,
                    proficiencyLabel: 'Treinado',
                    bonus: 0,
                    notes: '',
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Nova Perícia
              </button>
            )}
          </div>

          {character.skills.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4">
              Nenhuma perícia ou estatística registrada.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {character.skills.map((skill) => {
                const linkedAttr = character.attributes.find(
                  (a) => a.id === skill.linkedAttributeId
                );
                const attrBonus = linkedAttr ? attrBreakdowns[linkedAttr.id]?.totalValue || 0 : 0;
                const total = skill.baseValue + skill.bonus + (linkedAttr ? attrBonus : 0);

                return (
                  <div
                    key={skill.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--text-primary)]">
                          {skill.name}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          · {skill.category} · {skill.proficiencyLabel}
                          {linkedAttr ? ` · ${linkedAttr.shortName}` : ''}
                        </span>
                      </div>
                      {skill.notes && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {skill.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono-num text-base font-bold text-[var(--text-primary)]">
                        {total >= 0 ? `+${total}` : total}
                      </span>
                      {isEditMode && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsNewSkill(false);
                              setEditingSkill({ ...skill });
                            }}
                            aria-label={`Editar perícia ${skill.name}`}
                            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onConfirmDelete(
                                'Excluir Perícia',
                                `Deseja remover a perícia "${skill.name}"?`,
                                () =>
                                  onUpdateCharacter({
                                    ...character,
                                    updatedAt: Date.now(),
                                    skills: character.skills.filter((s) => s.id !== skill.id),
                                  })
                              )
                            }
                            aria-label={`Excluir perícia ${skill.name}`}
                            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      );
    }

    if (sectionKey === 'knowledge') {
      if (!character.enabledModules.knowledge) return null;
      return (
        <KnowledgeSection
          key="knowledge"
          character={character}
          onUpdateCharacter={onUpdateCharacter}
          onConfirmDelete={onConfirmDelete}
          onNotify={onNotify}
          isEditMode={isEditMode}
        />
      );
    }

    return null;
  };

  return (
    <div className="space-y-5">
      {sectionOrder.map((sec) => renderSection(sec))}

      {/* Edit/Create Resource Modal */}
      {editingResource && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="res-modal-title"
        >
          <form
            onSubmit={handleResourceSave}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="res-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewResource ? 'Criar Recurso' : `Editar: ${editingResource.name}`}
            </h3>

            <div>
              <label
                htmlFor="res-name"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Nome do Recurso
              </label>
              <input
                id="res-name"
                type="text"
                required
                value={editingResource.name}
                onChange={(e) =>
                  setEditingResource({ ...editingResource, name: e.target.value })
                }
                placeholder="Ex.: Qi, Sangue, Energia, Sanidade"
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="res-curr"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Atual
                </label>
                <input
                  id="res-curr"
                  type="number"
                  value={editingResource.current}
                  onChange={(e) =>
                    setEditingResource({
                      ...editingResource,
                      current: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="res-max"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Máximo Base
                </label>
                <input
                  id="res-max"
                  type="number"
                  value={editingResource.max}
                  onChange={(e) =>
                    setEditingResource({
                      ...editingResource,
                      max: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="res-min"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Mínimo
                </label>
                <input
                  id="res-min"
                  type="number"
                  value={editingResource.min}
                  onChange={(e) =>
                    setEditingResource({
                      ...editingResource,
                      min: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="res-temp"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Bônus Temporário Máx.
                </label>
                <input
                  id="res-temp"
                  type="number"
                  value={editingResource.tempBonus}
                  onChange={(e) =>
                    setEditingResource({
                      ...editingResource,
                      tempBonus: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                Cor da Barra
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {RESOURCE_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Selecionar cor ${hex}`}
                    onClick={() => setEditingResource({ ...editingResource, color: hex })}
                    className={`w-8 h-8 rounded-lg border-2 transition-transform ${
                      editingResource.color === hex
                        ? 'border-[var(--text-primary)] scale-110 ring-2 ring-[var(--accent-color)]'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(editingResource.allowNegative)}
                onChange={(e) =>
                  setEditingResource({ ...editingResource, allowNegative: e.target.checked })
                }
                className="rounded border-[var(--border-strong)]"
              />
              Permitir valores abaixo do mínimo em deduções
            </label>

            <div className="flex items-center justify-between pt-2">
              {!isNewResource ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = editingResource;
                    setEditingResource(null);
                    onConfirmDelete(
                      'Excluir Recurso',
                      `Deseja excluir o recurso "${target.name}"?`,
                      () =>
                        onUpdateCharacter({
                          ...character,
                          updatedAt: Date.now(),
                          resources: character.resources.filter((r) => r.id !== target.id),
                        })
                    );
                  }}
                  className="px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10"
                >
                  Excluir
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingResource(null)}
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
            </div>
          </form>
        </div>
      )}

      {/* Edit/Create Attribute Modal */}
      {editingAttr && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attr-modal-title"
        >
          <form
            onSubmit={handleAttributeSave}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="attr-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewAttr ? 'Criar Atributo' : `Editar Atributo: ${editingAttr.name}`}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="attr-name"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Nome
                </label>
                <input
                  id="attr-name"
                  type="text"
                  required
                  value={editingAttr.name}
                  onChange={(e) => setEditingAttr({ ...editingAttr, name: e.target.value })}
                  placeholder="Ex.: Força de Vontade"
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="attr-short"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Sigla
                </label>
                <input
                  id="attr-short"
                  type="text"
                  value={editingAttr.shortName}
                  onChange={(e) => setEditingAttr({ ...editingAttr, shortName: e.target.value })}
                  placeholder="FDV"
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label
                  htmlFor="attr-cat"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Categoria
                </label>
                <input
                  id="attr-cat"
                  type="text"
                  value={editingAttr.category}
                  onChange={(e) => setEditingAttr({ ...editingAttr, category: e.target.value })}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="attr-base"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Valor Base
                </label>
                <input
                  id="attr-base"
                  type="number"
                  value={editingAttr.baseValue}
                  onChange={(e) =>
                    setEditingAttr({ ...editingAttr, baseValue: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="attr-perm"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Bônus Perm.
                </label>
                <input
                  id="attr-perm"
                  type="number"
                  value={editingAttr.permanentBonus}
                  onChange={(e) =>
                    setEditingAttr({
                      ...editingAttr,
                      permanentBonus: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="attr-temp"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Bônus Temp.
                </label>
                <input
                  id="attr-temp"
                  type="number"
                  value={editingAttr.tempBonus}
                  onChange={(e) =>
                    setEditingAttr({ ...editingAttr, tempBonus: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Custom modifier sources */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Fontes Personalizadas de Modificador
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingAttr({
                      ...editingAttr,
                      customSources: [
                        ...editingAttr.customSources,
                        { id: createId('src'), label: 'Bênção / Origem', value: 1 },
                      ],
                    })
                  }
                  className="text-xs font-semibold text-[var(--accent-strong)] hover:underline"
                >
                  + Adicionar Fonte
                </button>
              </div>
              {editingAttr.customSources.map((src) => (
                <div key={src.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={src.label}
                    aria-label="Nome da fonte"
                    onChange={(e) =>
                      setEditingAttr({
                        ...editingAttr,
                        customSources: editingAttr.customSources.map((s) =>
                          s.id === src.id ? { ...s, label: e.target.value } : s
                        ),
                      })
                    }
                    className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                  />
                  <input
                    type="number"
                    value={src.value}
                    aria-label="Valor do modificador"
                    onChange={(e) =>
                      setEditingAttr({
                        ...editingAttr,
                        customSources: editingAttr.customSources.map((s) =>
                          s.id === src.id ? { ...s, value: Number(e.target.value) || 0 } : s
                        ),
                      })
                    }
                    className="w-20 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    aria-label={`Remover fonte ${src.label}`}
                    onClick={() =>
                      setEditingAttr({
                        ...editingAttr,
                        customSources: editingAttr.customSources.filter((s) => s.id !== src.id),
                      })
                    }
                    className="p-2 min-h-[40px] min-w-[40px] rounded-xl text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              {!isNewAttr ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = editingAttr;
                    setEditingAttr(null);
                    onConfirmDelete(
                      'Excluir Atributo',
                      `Deseja excluir o atributo "${target.name}"?`,
                      () =>
                        onUpdateCharacter({
                          ...character,
                          updatedAt: Date.now(),
                          attributes: character.attributes.filter((a) => a.id !== target.id),
                        })
                    );
                  }}
                  className="px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10"
                >
                  Excluir
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAttr(null)}
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
            </div>
          </form>
        </div>
      )}

      {/* Edit/Create Skill Modal */}
      {editingSkill && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skill-modal-title"
        >
          <form
            onSubmit={handleSkillSave}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="skill-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewSkill ? 'Nova Perícia / Estatística' : `Editar: ${editingSkill.name}`}
            </h3>

            <div>
              <label
                htmlFor="sk-name"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Nome
              </label>
              <input
                id="sk-name"
                type="text"
                required
                value={editingSkill.name}
                onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="sk-cat"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Categoria
                </label>
                <input
                  id="sk-cat"
                  type="text"
                  value={editingSkill.category}
                  onChange={(e) => setEditingSkill({ ...editingSkill, category: e.target.value })}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="sk-prof"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Proficiência
                </label>
                <input
                  id="sk-prof"
                  type="text"
                  value={editingSkill.proficiencyLabel}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, proficiencyLabel: e.target.value })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1">
                <label
                  htmlFor="sk-attr"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Atributo Vinculado
                </label>
                <select
                  id="sk-attr"
                  value={editingSkill.linkedAttributeId || ''}
                  onChange={(e) =>
                    setEditingSkill({
                      ...editingSkill,
                      linkedAttributeId: e.target.value || undefined,
                    })
                  }
                  className="w-full px-2.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="">Nenhum</option>
                  {character.attributes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.shortName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="sk-base"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Base
                </label>
                <input
                  id="sk-base"
                  type="number"
                  value={editingSkill.baseValue}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, baseValue: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="sk-bonus"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Bônus
                </label>
                <input
                  id="sk-bonus"
                  type="number"
                  value={editingSkill.bonus}
                  onChange={(e) =>
                    setEditingSkill({ ...editingSkill, bonus: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="sk-notes"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Observações
              </label>
              <input
                id="sk-notes"
                type="text"
                value={editingSkill.notes || ''}
                onChange={(e) => setEditingSkill({ ...editingSkill, notes: e.target.value })}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSkill(null)}
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
    </div>
  );
};
