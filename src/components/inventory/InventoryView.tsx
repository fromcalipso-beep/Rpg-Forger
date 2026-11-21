import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRightLeft,
  Backpack,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  Edit3,
  LayoutGrid,
  LayoutList,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import {
  computeAllAttributes,
  computeEffectiveCarryCapacity,
  computeTotalInventoryWeight,
} from '../../engine/attributes';
import {
  getItemDamageFormula,
  resolveDamageExpression,
  resolveItemDamage,
} from '../../engine/damageEngine';
import {
  deleteInventoryItem,
  duplicateInventoryItem,
  equipItemToSlot,
  getEquippedSlotNamesForItem,
  isItemEquipped,
  isSlotCompatibleWithItem,
  splitItemStack,
  stackCompatibleItems,
  unequipItemFromAllSlots,
} from '../../engine/inventoryEngine';
import {
  addInventoryItemValueToWallet,
} from '../../engine/walletEngine';
import { Character, InventoryItem } from '../../types/rpg';
import { createId } from '../../utils/id';
import { ImageSlot } from '../shared/ImageSlot';
import { WalletSection } from '../wallet/WalletSection';

interface InventoryViewProps {
  character: Character;
  onUpdateCharacter: (next: Character) => void;
  onConfirmDelete: (title: string, message: string, action: () => void) => void;
  onNotify: (kind: 'success' | 'error' | 'info', text: string) => void;
  isEditMode?: boolean;
}

const RARITY_LABELS: Record<string, string> = {
  comum: 'Comum',
  incomum: 'Incomum',
  raro: 'Raro',
  epico: 'Épico',
  lendario: 'Lendário',
  unico: 'Único',
};

const SLOT_TYPE_OPTIONS = [
  { value: 'head', label: 'Cabeça / Elmo' },
  { value: 'face', label: 'Rosto / Visor' },
  { value: 'neck', label: 'Colar' },
  { value: 'shoulders', label: 'Ombros' },
  { value: 'chest', label: 'Torso / Armadura' },
  { value: 'back', label: 'Capa / Costas' },
  { value: 'arm', label: 'Braço' },
  { value: 'hand', label: 'Mão / Arma' },
  { value: 'gloves', label: 'Luvas' },
  { value: 'waist', label: 'Cintura' },
  { value: 'legs', label: 'Pernas' },
  { value: 'feet', label: 'Botas / Pés' },
  { value: 'ring', label: 'Anel' },
  { value: 'earring', label: 'Brinco' },
  { value: 'amulet', label: 'Amuleto' },
  { value: 'custom', label: 'Personalizado' },
  { value: 'any', label: 'Qualquer Espaço' },
];

const RARITY_SLOT_BORDER: Record<string, string> = {
  comum: 'border-[var(--border-strong)] bg-[var(--bg-elevated)]',
  incomum: 'border-emerald-500/60 bg-emerald-500/10',
  raro: 'border-sky-500/70 bg-sky-500/10',
  epico: 'border-violet-500/75 bg-violet-500/10',
  lendario: 'border-amber-500/80 bg-amber-500/10',
  unico: 'border-red-500/80 bg-red-500/10',
};

const RARITY_CARD_ACCENT: Record<string, { border: string; bar: string; text: string }> = {
  comum: {
    border: 'border-[var(--border-strong)]',
    bar: 'bg-[var(--accent-color)]',
    text: 'text-[var(--text-muted)]',
  },
  incomum: {
    border: 'border-emerald-500/70',
    bar: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  raro: {
    border: 'border-sky-500/75',
    bar: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
  },
  epico: {
    border: 'border-violet-500/80',
    bar: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
  },
  lendario: {
    border: 'border-amber-500/85',
    bar: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
  },
  unico: {
    border: 'border-red-500/85',
    bar: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
  },
};

type SortKey = 'name' | 'category' | 'rarity' | 'weight' | 'quantity';

export const InventoryView: React.FC<InventoryViewProps> = ({
  character,
  onUpdateCharacter,
  onConfirmDelete,
  onNotify,
  isEditMode = true,
}) => {
  const [backpackOpen, setBackpackOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedItemId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedItemId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItemId]);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [showManagers, setShowManagers] = useState(false);

  const [splitTarget, setSplitTarget] = useState<InventoryItem | null>(null);
  const [splitQty, setSplitQty] = useState(1);

  const attrBreakdowns = useMemo(() => computeAllAttributes(character), [character]);
  const totalWeight = useMemo(() => computeTotalInventoryWeight(character), [character]);
  const maxWeight = useMemo(() => computeEffectiveCarryCapacity(character), [character]);
  const weightPercent =
    character.carryCapacity.enabled && maxWeight > 0
      ? Math.min(100, Math.round((totalWeight / maxWeight) * 100))
      : 0;
  const isOverencumbered = character.carryCapacity.enabled && maxWeight > 0 && totalWeight > maxWeight;

  const editingItemDamagePreview = useMemo(() => {
    if (!editingItem) return null;
    return resolveDamageExpression(
      character,
      editingItem.damageText || '',
      editingItem.damageAttributeIds || [],
      attrBreakdowns
    );
  }, [character, editingItem, attrBreakdowns]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = character.inventory.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (locationFilter !== 'all' && item.storageLocation !== locationFilter) return false;
      if (q) {
        const hay = `${item.name} ${item.description} ${item.category} ${item.subcategory} ${item.effectsText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const rarityOrder = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'unico'];
    return [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'pt-BR');
      if (sortKey === 'category') return a.category.localeCompare(b.category, 'pt-BR');
      if (sortKey === 'weight') return b.weight * b.quantity - a.weight * a.quantity;
      if (sortKey === 'quantity') return b.quantity - a.quantity;
      if (sortKey === 'rarity') {
        return rarityOrder.indexOf(b.rarity) - rarityOrder.indexOf(a.rarity);
      }
      return 0;
    });
  }, [character.inventory, search, categoryFilter, locationFilter, sortKey]);

  const openNewItemModal = () => {
    setIsNewItem(true);
    setEditingItem({
      id: createId('item'),
      name: '',
      description: '',
      category: character.itemCategories[0] || 'Geral',
      subcategory: '',
      storageLocation: character.storageLocations[0] || 'Mochila',
      quantity: 1,
      weight: 0.5,
      monetaryValue: 0,
      currencyUnit: character.wallet?.currencies?.[0]?.symbol || 'MO',
      rarity: 'comum',
      equippable: false,
      compatibleSlotTypes: ['hand'],
      twoHanded: false,
      requiredSlotsCount: 1,
      attributeModifiers: [],
      resourceModifiers: [],
      effectsText: '',
      damageText: '',
      damageAttributeIds: [],
      notes: '',
      customFields: [],
    });
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name.trim()) return;

    const cleaned: InventoryItem = {
      ...editingItem,
      requiredSlotsCount: editingItem.twoHanded ? Math.max(2, editingItem.requiredSlotsCount) : 1,
    };

    const nextInv = isNewItem
      ? [...character.inventory, cleaned]
      : character.inventory.map((it) => (it.id === cleaned.id ? cleaned : it));

    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      inventory: nextInv,
    });
    setEditingItem(null);
    onNotify('success', isNewItem ? `Item "${cleaned.name}" adicionado ao inventário.` : `Item "${cleaned.name}" atualizado.`);
  };

  const handleQuickEquipToggle = (item: InventoryItem) => {
    if (isItemEquipped(character, item.id)) {
      onUpdateCharacter(unequipItemFromAllSlots(character, item.id));
      onNotify('info', `"${item.name}" desequipado.`);
      return;
    }

    const compatibleSlot = character.equipmentSlots.find(
      (s) => isSlotCompatibleWithItem(s, item) && s.equippedItems.length < s.capacity
    );
    if (!compatibleSlot) {
      onNotify('error', `Nenhum espaço disponível compatível com "${item.name}".`);
      return;
    }

    const res = equipItemToSlot(character, item.id, compatibleSlot.id);
    if (!res.success) {
      onNotify('error', res.error || 'Não foi possível equipar o item.');
      return;
    }
    onUpdateCharacter(res.character);
    onNotify('success', `"${item.name}" equipado em ${compatibleSlot.name}.`);
  };

  const selectedItem = selectedItemId
    ? character.inventory.find((i) => i.id === selectedItemId) || null
    : null;
  const gameGridTotalSlots = Math.max(24, Math.ceil(filteredItems.length / 8) * 8);
  const emptySlotCount = Math.max(0, gameGridTotalSlots - filteredItems.length);

  const renderItemActionButtons = (item: InventoryItem) => {
    const equipped = isItemEquipped(character, item.id);
    const compatibleMatch = character.inventory.find(
      (other) =>
        other.id !== item.id &&
        other.name.toLowerCase() === item.name.toLowerCase() &&
        !isItemEquipped(character, item.id)
    );

    return (
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[var(--border-subtle)]">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.equippable && (
            <button
              type="button"
              onClick={() => handleQuickEquipToggle(item)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                equipped
                  ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'text-[var(--accent-contrast)] hover:opacity-90'
              }`}
              style={!equipped ? { backgroundColor: 'var(--accent-color)' } : undefined}
            >
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              {equipped ? 'Desequipar' : 'Equipar'}
            </button>
          )}

          {item.monetaryValue > 0 && character.enabledModules.wallet && (
            <button
              type="button"
              onClick={() => {
                const res = addInventoryItemValueToWallet(character, item.id, 1);
                if (!res.success) {
                  onNotify('error', res.error || 'Não foi possível somar à bolsa de moedas.');
                  return;
                }
                onUpdateCharacter(res.character);
                onNotify(
                  'success',
                  `+${item.monetaryValue} ${item.currencyUnit || ''} somado à Bolsa de Moedas.`
                );
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
            >
              <Coins className="w-3.5 h-3.5" aria-hidden="true" />
              + Bolsa
            </button>
          )}

          {item.quantity > 1 && (
            <button
              type="button"
              onClick={() => {
                setSplitTarget(item);
                setSplitQty(Math.floor(item.quantity / 2) || 1);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              <Split className="w-3.5 h-3.5" aria-hidden="true" />
              Dividir
            </button>
          )}

          {compatibleMatch && (
            <button
              type="button"
              onClick={() => {
                onUpdateCharacter(
                  stackCompatibleItems(character, item.id, compatibleMatch.id)
                );
                onNotify('success', `Pilhas de "${item.name}" combinadas.`);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              Empilhar
            </button>
          )}

          {character.storageLocations.length > 1 && (
            <div className="inline-flex items-center gap-1">
              <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--text-muted)] ml-1" aria-hidden="true" />
              <select
                aria-label={`Transferir ${item.name} para`}
                value={item.storageLocation}
                onChange={(e) =>
                  onUpdateCharacter({
                    ...character,
                    updatedAt: Date.now(),
                    inventory: character.inventory.map((it) =>
                      it.id === item.id
                        ? { ...it, storageLocation: e.target.value }
                        : it
                    ),
                  })
                }
                className="px-2 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)]"
              >
                {character.storageLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {isEditMode && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsNewItem(false);
                setEditingItem({
                  ...item,
                  damageText: getItemDamageFormula(item),
                  damageAttributeIds: [...(item.damageAttributeIds || [])],
                  attributeModifiers: [...item.attributeModifiers],
                  resourceModifiers: [...item.resourceModifiers],
                  customFields: [...item.customFields],
                });
              }}
              aria-label={`Editar item ${item.name}`}
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateCharacter(duplicateInventoryItem(character, item.id));
                onNotify('info', `"${item.name}" duplicado.`);
              }}
              aria-label={`Duplicar item ${item.name}`}
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() =>
                onConfirmDelete(
                  'Excluir Item',
                  `Deseja remover "${item.name}" da mochila?`,
                  () => {
                    if (selectedItemId === item.id) setSelectedItemId(null);
                    onUpdateCharacter(deleteInventoryItem(character, item.id));
                  }
                )
              }
              aria-label={`Excluir item ${item.name}`}
              className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Dedicated Backpack Section (Separated from Body Equipment) */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Backpack className="w-5 h-5 text-[var(--accent-strong)] shrink-0" aria-hidden="true" />
              <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                Mochila
              </h1>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {character.inventory.length} item(ns) guardados · Peso total:{' '}
              <span className="font-mono-num font-semibold">{totalWeight} kg</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {backpackOpen && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium ${
                    viewMode === 'grid'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                  Grade de Jogo
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium ${
                    viewMode === 'list'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" aria-hidden="true" />
                  Lista
                </button>
              </div>
            )}

            {backpackOpen && isEditMode && (
              <>
                <button
                  type="button"
                  onClick={() => setShowManagers((v) => !v)}
                  className="px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Categorias & Locais
                </button>
                <button
                  type="button"
                  onClick={openNewItemModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Adicionar Item
                </button>
              </>
            )}

            <button
              type="button"
              data-testid={backpackOpen ? 'toggle-backpack-close-btn' : 'toggle-backpack-open-btn'}
              aria-expanded={backpackOpen}
              onClick={() => setBackpackOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] whitespace-nowrap"
            >
              <Backpack className="w-4 h-4" aria-hidden="true" />
              {backpackOpen ? 'Recolher Mochila' : 'Abrir Mochila'}
              {backpackOpen ? (
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Capacity Bar */}
        {(character.carryCapacity.enabled || (backpackOpen && isEditMode)) && (
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {backpackOpen && isEditMode ? (
                <label className="flex items-center gap-2 font-medium text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={character.carryCapacity.enabled}
                    onChange={(e) =>
                      onUpdateCharacter({
                        ...character,
                        updatedAt: Date.now(),
                        carryCapacity: {
                          ...character.carryCapacity,
                          enabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Monitorar Capacidade de Carga
                </label>
              ) : (
                <span className="font-medium text-[var(--text-secondary)]">
                  Capacidade de Carga
                </span>
              )}
              {character.carryCapacity.enabled && (
                <span
                  className={`font-mono-num font-semibold ${
                    isOverencumbered ? 'text-red-500' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {totalWeight} / {maxWeight} kg ({weightPercent}%)
                  {isOverencumbered ? ' · Sobrecarga' : ''}
                </span>
              )}
            </div>
            {character.carryCapacity.enabled && (
              <div className="h-2.5 w-full rounded-full bg-[var(--bg-track)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${weightPercent}%`,
                    backgroundColor: isOverencumbered ? '#EF4444' : 'var(--accent-color)',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Collapsed Summary State */}
        {!backpackOpen && (
          <div
            data-testid="backpack-closed-summary"
            className="p-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Mochila Recolhida ({character.inventory.length} itens guardados)
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              Clique em "Abrir Mochila" para visualizar e abrir os cartões dos itens
            </span>
          </div>
        )}

        {/* Opened Game-Style Backpack Grid */}
        {backpackOpen && (
          <div data-testid="game-backpack-panel" className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            {isEditMode && showManagers && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-3 border-b border-[var(--border-subtle)]">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    Categorias de Itens
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Nova categoria..."
                      className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = newCategoryName.trim();
                        if (!v || character.itemCategories.includes(v)) return;
                        onUpdateCharacter({
                          ...character,
                          itemCategories: [...character.itemCategories, v],
                        });
                        setNewCategoryName('');
                      }}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {character.itemCategories.join(' · ')}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    Locais de Armazenamento
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newLocationName}
                      onChange={(e) => setNewLocationName(e.target.value)}
                      placeholder="Ex.: Baú da Guilda"
                      className="flex-1 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = newLocationName.trim();
                        if (!v || character.storageLocations.includes(v)) return;
                        onUpdateCharacter({
                          ...character,
                          storageLocations: [...character.storageLocations, v],
                        });
                        setNewLocationName('');
                      }}
                      className="px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {character.storageLocations.join(' · ')}
                  </p>
                </div>
              </div>
            )}

            {/* Full-Width Game-Style Backpack */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--text-muted)]">
                  Mostrando {filteredItems.length} de {character.inventory.length} item(ns) · Toque em qualquer item para abrir seu cartão detalhado
                </p>
              </div>

                {/* Container Tabs (Mochila, Cinturão, Bolsa de Poções, Todos) */}
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setLocationFilter('all')}
                    className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                      locationFilter === 'all'
                        ? 'text-[var(--accent-contrast)] font-semibold shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    style={locationFilter === 'all' ? { backgroundColor: 'var(--accent-color)' } : undefined}
                  >
                    Todos ({character.inventory.length})
                  </button>
                  {character.storageLocations.map((loc) => {
                    const count = character.inventory.filter((i) => i.storageLocation === loc).length;
                    const active = locationFilter === loc;
                    return (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => setLocationFilter(loc)}
                        className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                          active
                            ? 'text-[var(--accent-contrast)] font-semibold shadow-sm'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                        style={active ? { backgroundColor: 'var(--accent-color)' } : undefined}
                      >
                        {loc} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Search, Category & Sort Toolbar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <Search
                      className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar item..."
                      aria-label="Buscar item no inventário"
                      className="w-full pl-8 pr-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filtrar por categoria"
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="all">Todas as Categorias</option>
                    {character.itemCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    aria-label="Ordenar inventário"
                    className="px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="name">Ordenar: Nome</option>
                    <option value="category">Ordenar: Categoria</option>
                    <option value="rarity">Ordenar: Raridade</option>
                    <option value="weight">Ordenar: Peso Total</option>
                    <option value="quantity">Ordenar: Quantidade</option>
                  </select>
                </div>

                {/* Game-Style Backpack Grid OR Detailed List */}
                {viewMode === 'grid' ? (
                  <div
                    data-testid="game-backpack-grid"
                    className="p-3 sm:p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2.5"
                  >
                    {filteredItems.map((item) => {
                      const equipped = isItemEquipped(character, item.id);
                      const isSelected = selectedItem?.id === item.id;
                      const slotStyle =
                        RARITY_SLOT_BORDER[item.rarity] || RARITY_SLOT_BORDER.comum;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`backpack-slot-${item.id}`}
                          onClick={() =>
                            setSelectedItemId((prev) => (prev === item.id ? null : item.id))
                          }
                          aria-label={`${item.name}, quantidade ${item.quantity}${equipped ? ', equipado' : ''}`}
                          aria-pressed={isSelected}
                          className={`relative aspect-square rounded-xl border-2 p-1.5 flex flex-col items-center justify-center transition-all hover:scale-[1.03] ${slotStyle} ${
                            isSelected
                              ? 'ring-2 ring-[var(--accent-color)] ring-offset-1 ring-offset-[var(--bg-elevated)]'
                              : ''
                          }`}
                        >
                          <div className="pointer-events-none flex items-center justify-center">
                            <ImageSlot
                              imageId={item.imageId}
                              fallbackUrl={item.defaultImageUrl}
                              alt={item.name}
                              variant="item"
                              size="sm"
                            />
                          </div>
                          <span className="mt-1 w-full text-[10px] font-medium text-[var(--text-primary)] truncate text-center leading-none">
                            {item.name}
                          </span>

                          {equipped && (
                            <span
                              title="Equipado"
                              className="absolute top-1 left-1 w-4 h-4 rounded bg-emerald-600 text-white font-mono-num text-[9px] font-bold flex items-center justify-center shadow"
                            >
                              E
                            </span>
                          )}

                          {item.quantity > 1 && (
                            <span className="absolute top-1 right-1 px-1 rounded bg-black/75 text-white font-mono-num text-[10px] font-bold leading-tight">
                              x{item.quantity}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {Array.from({ length: emptySlotCount }).map((_, idx) => (
                      <div
                        key={`empty-slot-${idx}`}
                        aria-hidden="true"
                        className="aspect-square rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-track)]/60 flex items-center justify-center"
                      >
                        <span className="w-2 h-2 rounded-full bg-[var(--border-subtle)] opacity-50" />
                      </div>
                    ))}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-8 text-center">
                    <p className="text-sm text-[var(--text-muted)]">
                      Nenhum item encontrado com os filtros atuais.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredItems.map((item) => {
                      const equipped = isItemEquipped(character, item.id);
                      const equippedSlots = getEquippedSlotNamesForItem(character, item.id);
                      const resolvedDamage = resolveItemDamage(character, item, attrBreakdowns);

                      return (
                        <article
                          key={item.id}
                          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 flex flex-col justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedItemId(item.id)}
                            className="flex items-start gap-3 text-left w-full rounded-lg hover:opacity-90 transition-opacity"
                          >
                            <ImageSlot
                              imageId={item.imageId}
                              fallbackUrl={item.defaultImageUrl}
                              alt={item.name}
                              variant="item"
                              size="md"
                            />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-semibold text-base text-[var(--text-primary)] truncate">
                                  {item.name}
                                </h3>
                                <span className="font-mono-num text-sm font-bold text-[var(--text-primary)] shrink-0">
                                  x{item.quantity}
                                </span>
                              </div>

                              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                                {[
                                  item.category,
                                  item.subcategory,
                                  RARITY_LABELS[item.rarity] || item.rarity,
                                  item.storageLocation,
                                  `${(item.weight * item.quantity).toFixed(1)} kg`,
                                  item.monetaryValue > 0 ? `${item.monetaryValue} ${item.currencyUnit}` : '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>

                              {equipped && (
                                <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  Equipado em: {equippedSlots.join(', ')}
                                </p>
                              )}

                              {resolvedDamage.hasDamage && (
                                <p className="mt-1 text-xs font-semibold text-[var(--accent-strong)] font-mono-num">
                                  Dano: {resolvedDamage.resolvedText}
                                </p>
                              )}

                              {item.description && (
                                <p className="mt-1.5 text-xs text-[var(--text-secondary)] line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </button>

                          {renderItemActionButtons(item)}
                        </article>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        )}
      </section>

      {/* Selected Item RPG Card Modal (Opens when an item is selected, with clear Close button) */}
      {selectedItem && (() => {
        const cardStyle = RARITY_CARD_ACCENT[selectedItem.rarity] || RARITY_CARD_ACCENT.comum;
        const equipped = isItemEquipped(character, selectedItem.id);
        const equippedSlots = getEquippedSlotNamesForItem(character, selectedItem.id);
        const selectedDamage = resolveItemDamage(character, selectedItem, attrBreakdowns);
        const visibleCustomFields = selectedItem.customFields.filter(
          (cf) => !(selectedDamage.hasDamage && /^dano(\s+base|\s+atual)?$/i.test(cf.label.trim()))
        );

        return createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="selected-item-card-title"
            onClick={() => setSelectedItemId(null)}
          >
            <article
              data-testid="backpack-item-card"
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border-2 ${cardStyle.border} bg-[var(--bg-surface)] shadow-2xl flex flex-col`}
            >
              {/* Top Rarity Color Accent Strip */}
              <div className={`h-1.5 w-full shrink-0 ${cardStyle.bar}`} />

              {/* Card Header with Rarity Kicker & Prominent Close Button */}
              <div className="px-5 pt-4 pb-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-[var(--text-muted)] truncate">
                  <span className={cardStyle.text}>
                    {RARITY_LABELS[selectedItem.rarity] || selectedItem.rarity}
                  </span>
                  {' · '}
                  {[selectedItem.category, selectedItem.subcategory].filter(Boolean).join(' · ')}
                </p>

                <button
                  type="button"
                  data-testid="close-item-card-btn"
                  aria-label="Fechar cartão do item"
                  onClick={() => setSelectedItemId(null)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  Fechar
                </button>
              </div>

              {/* Card Body: Artwork, Title & Stats */}
              <div className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                  <div className="shrink-0">
                    <ImageSlot
                      imageId={selectedItem.imageId}
                      fallbackUrl={selectedItem.defaultImageUrl}
                      alt={selectedItem.name}
                      variant="item"
                      size="lg"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <h2
                      id="selected-item-card-title"
                      className="font-display text-xl font-bold text-[var(--text-primary)] leading-tight"
                    >
                      {selectedItem.name}
                    </h2>

                    {equipped && (
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Equipado em: {equippedSlots.join(', ')}
                      </p>
                    )}

                    {selectedItem.description && (
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        {selectedItem.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Numeric Attributes Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <span className="block text-[11px] text-[var(--text-muted)]">Quantidade</span>
                    <span className="font-mono-num text-sm font-bold text-[var(--text-primary)]">
                      x{selectedItem.quantity}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <span className="block text-[11px] text-[var(--text-muted)]">Peso Total</span>
                    <span className="font-mono-num text-sm font-bold text-[var(--text-primary)]">
                      {(selectedItem.weight * selectedItem.quantity).toFixed(1)} kg
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <span className="block text-[11px] text-[var(--text-muted)]">Valor</span>
                    <span className="font-mono-num text-sm font-bold text-[var(--text-primary)]">
                      {selectedItem.monetaryValue > 0
                        ? `${selectedItem.monetaryValue} ${selectedItem.currencyUnit}`
                        : '—'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <span className="block text-[11px] text-[var(--text-muted)]">Local</span>
                    <span className="block text-xs font-semibold text-[var(--text-primary)] truncate mt-0.5">
                      {selectedItem.storageLocation}
                    </span>
                  </div>
                </div>

                {/* Live Resolved Weapon / Item Damage Banner */}
                {selectedDamage.hasDamage && (
                  <div
                    data-testid="selected-item-damage"
                    className="p-3 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="block text-[11px] font-medium text-[var(--text-muted)]">
                        Dano Atual (com atributos)
                      </span>
                      <span className="font-mono-num text-base font-bold text-[var(--accent-strong)]">
                        {selectedDamage.resolvedText}
                      </span>
                    </div>
                    {selectedDamage.usedStats.length > 0 && (
                      <div className="text-right text-[11px] text-[var(--text-secondary)] font-mono-num">
                        Usa: {selectedDamage.usedStats.map((s) => `${s.name} (${s.value})`).join(' + ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Effects, Modifiers & Notes */}
                {(selectedItem.effectsText ||
                  selectedItem.attributeModifiers.length > 0 ||
                  selectedItem.resourceModifiers.length > 0 ||
                  visibleCustomFields.length > 0 ||
                  selectedItem.notes) && (
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2 text-xs">
                    {selectedItem.effectsText && (
                      <div>
                        <span className="font-semibold text-[var(--text-muted)]">Efeitos: </span>
                        <span className="font-medium text-[var(--accent-strong)]">
                          {selectedItem.effectsText}
                        </span>
                      </div>
                    )}
                    {selectedItem.attributeModifiers.length > 0 && (
                      <div>
                        <span className="font-semibold text-[var(--text-muted)]">Bônus de Atributo: </span>
                        <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                          {selectedItem.attributeModifiers
                            .map(
                              (m) =>
                                `${m.value > 0 ? `+${m.value}` : m.value} ${m.attributeName || 'Atributo'}`
                            )
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                    {selectedItem.resourceModifiers.length > 0 && (
                      <div>
                        <span className="font-semibold text-[var(--text-muted)]">Bônus de Recurso: </span>
                        <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                          {selectedItem.resourceModifiers
                            .map(
                              (m) =>
                                `${m.maxBonus > 0 ? `+${m.maxBonus}` : m.maxBonus} ${m.resourceName || 'Recurso'} Máx.`
                            )
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                    {visibleCustomFields.map((cf) => (
                      <div key={cf.id}>
                        <span className="font-semibold text-[var(--text-muted)]">{cf.label}: </span>
                        <span className="text-[var(--text-primary)]">{cf.value}</span>
                      </div>
                    ))}
                    {selectedItem.notes && (
                      <div className="text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-muted)]">Notas: </span>
                        {selectedItem.notes}
                      </div>
                    )}
                  </div>
                )}

                {/* Card Actions */}
                {renderItemActionButtons(selectedItem)}
              </div>
            </article>
          </div>,
          document.body
        );
      })()}

      {/* Coin Purse Section (Directly Accessible in Backpack/Inventory View) */}
      {character.enabledModules.wallet && (
        <WalletSection
          character={character}
          onUpdateCharacter={onUpdateCharacter}
          onConfirmDelete={onConfirmDelete}
          onNotify={onNotify}
          isEditMode={isEditMode}
        />
      )}

      {/* Split Stack Modal */}
      {splitTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="split-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl">
            <h3
              id="split-modal-title"
              className="font-display text-base font-semibold text-[var(--text-primary)]"
            >
              Dividir Pilha: {splitTarget.name}
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Quantidade atual: {splitTarget.quantity}. Escolha quantas unidades separar:
            </p>
            <input
              type="number"
              min={1}
              max={splitTarget.quantity - 1}
              value={splitQty}
              onChange={(e) => setSplitQty(Number(e.target.value) || 1)}
              className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSplitTarget(null)}
                className="px-4 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateCharacter(splitItemStack(character, splitTarget.id, splitQty));
                  setSplitTarget(null);
                }}
                className="px-4 py-2 min-h-[42px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-modal-title"
        >
          <form
            onSubmit={handleSaveItem}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="item-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewItem ? 'Novo Item no Inventário' : `Editar Item: ${editingItem.name}`}
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <ImageSlot
                imageId={editingItem.imageId}
                fallbackUrl={editingItem.defaultImageUrl}
                alt={editingItem.name || 'Item'}
                variant="item"
                size="md"
                editable
                onImageChange={(id) => setEditingItem({ ...editingItem, imageId: id })}
              />

              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="item-name"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Nome do Item
                  </label>
                  <input
                    id="item-name"
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="item-cat"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Categoria
                  </label>
                  <select
                    id="item-cat"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  >
                    {character.itemCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="item-subcat"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Subcategoria
                  </label>
                  <input
                    id="item-subcat"
                    type="text"
                    value={editingItem.subcategory}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, subcategory: e.target.value })
                    }
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <div>
                <label
                  htmlFor="item-qty"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Quantidade
                </label>
                <input
                  id="item-qty"
                  type="number"
                  min={1}
                  value={editingItem.quantity}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, quantity: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="item-weight"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Peso Unit. (kg)
                </label>
                <input
                  id="item-weight"
                  type="number"
                  step="0.1"
                  min={0}
                  value={editingItem.weight}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, weight: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="item-val"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Valor Monetário
                </label>
                <input
                  id="item-val"
                  type="number"
                  min={0}
                  step="any"
                  value={editingItem.monetaryValue}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      monetaryValue: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="item-currency"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Moeda
                </label>
                <input
                  id="item-currency"
                  type="text"
                  list="wallet-currency-units"
                  value={editingItem.currencyUnit}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      currencyUnit: e.target.value,
                    })
                  }
                  placeholder="MO, MP, CR..."
                  className="w-full px-2.5 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xs text-[var(--text-primary)]"
                />
                <datalist id="wallet-currency-units">
                  {(character.wallet?.currencies || []).map((c) => (
                    <option key={c.id} value={c.symbol}>
                      {c.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  htmlFor="item-rarity"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Raridade
                </label>
                <select
                  id="item-rarity"
                  value={editingItem.rarity}
                  onChange={(e) => setEditingItem({ ...editingItem, rarity: e.target.value })}
                  className="w-full px-2.5 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  {Object.entries(RARITY_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="item-loc"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Local
                </label>
                <select
                  id="item-loc"
                  value={editingItem.storageLocation}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, storageLocation: e.target.value })
                  }
                  className="w-full px-2.5 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  {character.storageLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="item-desc"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Descrição
                </label>
                <textarea
                  id="item-desc"
                  rows={2}
                  value={editingItem.description}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="item-effects"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Efeitos & Notas
                </label>
                <textarea
                  id="item-effects"
                  rows={2}
                  value={editingItem.effectsText}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, effectsText: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Weapon / Item Damage Formula & Scaling Attributes */}
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2.5">
              <div>
                <label
                  htmlFor="item-damage"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Dano da Arma / Item (Dados + Fixo + Atributos)
                </label>
                <input
                  id="item-damage"
                  data-testid="item-damage-input"
                  type="text"
                  value={editingItem.damageText || ''}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, damageText: e.target.value })
                  }
                  placeholder="Ex.: 2d6 + FOR ou 3d5 + 60 + Carisma + Vontade"
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)]"
                />
              </div>

              {character.attributes.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-xs text-[var(--text-muted)]">
                    Atributos somados no dano desta arma/item:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {character.attributes.map((attr) => {
                      const active = (editingItem.damageAttributeIds || []).includes(attr.id);
                      const currentVal = attrBreakdowns[attr.id]?.totalValue ?? attr.baseValue;
                      return (
                        <button
                          key={attr.id}
                          type="button"
                          onClick={() => {
                            const curr = editingItem.damageAttributeIds || [];
                            const next = active
                              ? curr.filter((id) => id !== attr.id)
                              : [...curr, attr.id];
                            setEditingItem({ ...editingItem, damageAttributeIds: next });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            active
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

              {editingItemDamagePreview?.hasDamage && (
                <div className="px-3 py-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)]">Dano atual calculado:</span>
                  <span className="font-mono-num text-sm font-bold text-[var(--accent-strong)]">
                    {editingItemDamagePreview.resolvedText}
                  </span>
                </div>
              )}
            </div>

            {/* Equipment Compatibility & Modifiers */}
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.equippable}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, equippable: e.target.checked })
                    }
                  />
                  Item Equipável
                </label>

                {editingItem.equippable && (
                  <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingItem.twoHanded}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          twoHanded: e.target.checked,
                          requiredSlotsCount: e.target.checked ? 2 : 1,
                        })
                      }
                    />
                    Item de Duas Mãos / Múltiplos Espaços
                  </label>
                )}
              </div>

              {editingItem.equippable && (
                <div className="space-y-2">
                  <span className="block text-xs text-[var(--text-muted)]">
                    Tipos de Espaço Compatíveis:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SLOT_TYPE_OPTIONS.map((opt) => {
                      const active = editingItem.compatibleSlotTypes.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? editingItem.compatibleSlotTypes.filter((v) => v !== opt.value)
                              : [...editingItem.compatibleSlotTypes, opt.value];
                            setEditingItem({ ...editingItem, compatibleSlotTypes: next });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            active
                              ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold'
                              : 'border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Attribute Modifiers */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    Modificadores de Atributos ao Equipar
                  </span>
                  <button
                    type="button"
                    disabled={character.attributes.length === 0}
                    onClick={() => {
                      const firstAttr = character.attributes[0];
                      if (!firstAttr) return;
                      setEditingItem({
                        ...editingItem,
                        attributeModifiers: [
                          ...editingItem.attributeModifiers,
                          { attributeId: firstAttr.id, attributeName: firstAttr.name, value: 1 },
                        ],
                      });
                    }}
                    className="text-xs font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-40"
                  >
                    + Modificador de Atributo
                  </button>
                </div>

                {editingItem.attributeModifiers.map((mod, idx) => (
                  <div key={`${mod.attributeId}_${idx}`} className="flex items-center gap-2">
                    <select
                      value={mod.attributeId}
                      aria-label="Atributo modificado"
                      onChange={(e) => {
                        const attr = character.attributes.find((a) => a.id === e.target.value);
                        setEditingItem({
                          ...editingItem,
                          attributeModifiers: editingItem.attributeModifiers.map((m, i) =>
                            i === idx
                              ? { ...m, attributeId: e.target.value, attributeName: attr?.name }
                              : m
                          ),
                        });
                      }}
                      className="flex-1 px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
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
                        setEditingItem({
                          ...editingItem,
                          attributeModifiers: editingItem.attributeModifiers.map((m, i) =>
                            i === idx ? { ...m, value: Number(e.target.value) || 0 } : m
                          ),
                        })
                      }
                      className="w-20 px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs text-[var(--text-primary)]"
                    />
                    <button
                      type="button"
                      aria-label="Remover modificador"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          attributeModifiers: editingItem.attributeModifiers.filter(
                            (_, i) => i !== idx
                          ),
                        })
                      }
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Salvar Item
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
