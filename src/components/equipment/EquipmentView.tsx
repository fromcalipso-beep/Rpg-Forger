import React, { useMemo, useState } from 'react';
import {
  Edit3,
  LayoutList,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  BODY_PART_LAYOUT,
  equipItemToSlot,
  isItemEquipped,
  isSlotCompatibleWithItem,
  organizeEquipmentSlotsForBody,
  unequipSlotEntry,
} from '../../engine/inventoryEngine';
import { computeAllAttributes } from '../../engine/attributes';
import { resolveItemDamage } from '../../engine/damageEngine';
import { BodyRegion, Character, EquipmentSlot } from '../../types/rpg';
import { createId } from '../../utils/id';
import { ImageSlot } from '../shared/ImageSlot';

interface EquipmentViewProps {
  character: Character;
  onUpdateCharacter: (next: Character) => void;
  onConfirmDelete: (title: string, message: string, action: () => void) => void;
  onNotify: (kind: 'success' | 'error' | 'info', text: string) => void;
  isEditMode?: boolean;
  embedded?: boolean;
}

const REGION_OPTIONS: Array<{ value: BodyRegion; label: string }> = [
  { value: 'head', label: 'Cabeça / Elmo' },
  { value: 'face', label: 'Rosto / Visor' },
  { value: 'earrings', label: 'Brincos' },
  { value: 'neck', label: 'Colar / Pescoço' },
  { value: 'shoulders', label: 'Ombros' },
  { value: 'back', label: 'Costas / Capa' },
  { value: 'chest', label: 'Torso / Armadura' },
  { value: 'amulets', label: 'Amuletos' },
  { value: 'rightArm', label: 'Braço Direito' },
  { value: 'leftArm', label: 'Braço Esquerdo' },
  { value: 'gloves', label: 'Luvas / Pulsos' },
  { value: 'rightHand', label: 'Mão Direita' },
  { value: 'leftHand', label: 'Mão Esquerda' },
  { value: 'rings', label: 'Anéis' },
  { value: 'waist', label: 'Cintura' },
  { value: 'legs', label: 'Pernas' },
  { value: 'feet', label: 'Pés / Botas' },
  { value: 'custom', label: 'Espaço Personalizado' },
];

export const EquipmentView: React.FC<EquipmentViewProps> = ({
  character,
  onUpdateCharacter,
  onConfirmDelete,
  onNotify,
  isEditMode = true,
  embedded = false,
}) => {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(
    character.equipmentSlots[0]?.id || null
  );
  const [hoveredRegion, setHoveredRegion] = useState<BodyRegion | null>(null);
  const [mobileViewMode, setMobileViewMode] = useState<'silhouette' | 'list'>('silhouette');
  const [editingSlot, setEditingSlot] = useState<EquipmentSlot | null>(null);
  const [isNewSlot, setIsNewSlot] = useState(false);

  const attrBreakdowns = useMemo(() => computeAllAttributes(character), [character]);

  const itemMap = useMemo(
    () => new Map(character.inventory.map((i) => [i.id, i])),
    [character.inventory]
  );

  const selectedSlot =
    character.equipmentSlots.find((s) => s.id === selectedSlotId) ||
    character.equipmentSlots[0] ||
    null;

  const organizedSlots = useMemo(
    () => organizeEquipmentSlotsForBody(character.equipmentSlots),
    [character.equipmentSlots]
  );

  const primarySlotByRegion = useMemo(() => {
    const map = new Map<BodyRegion, EquipmentSlot>();
    for (const slot of [...character.equipmentSlots].sort((a, b) => a.order - b.order)) {
      if (!map.has(slot.region)) {
        map.set(slot.region, slot);
      }
    }
    return map;
  }, [character.equipmentSlots]);

  const compatibleInventory = useMemo(() => {
    if (!selectedSlot) return [];
    return character.inventory.filter((item) => isSlotCompatibleWithItem(selectedSlot, item));
  }, [character.inventory, selectedSlot]);

  const totalEquippedCount = useMemo(
    () => character.equipmentSlots.reduce((sum, s) => sum + s.equippedItems.length, 0),
    [character.equipmentSlots]
  );

  const handleEquip = (itemId: string, slotId: string) => {
    const res = equipItemToSlot(character, itemId, slotId);
    if (!res.success) {
      onNotify('error', res.error || 'Erro ao equipar item.');
      return;
    }
    onUpdateCharacter(res.character);
    const item = itemMap.get(itemId);
    onNotify('success', `"${item?.name || 'Item'}" equipado com sucesso.`);
  };

  const handleUnequip = (slotId: string, itemId: string) => {
    const item = itemMap.get(itemId);
    onUpdateCharacter(unequipSlotEntry(character, slotId, itemId));
    onNotify('info', `"${item?.name || 'Item'}" desequipado.`);
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlot || !editingSlot.name.trim()) return;

    const normalized: EquipmentSlot = {
      ...editingSlot,
      capacity: Math.max(1, editingSlot.capacity),
      slotType: editingSlot.slotType.trim() || 'custom',
    };

    const nextSlots = isNewSlot
      ? [...character.equipmentSlots, normalized]
      : character.equipmentSlots.map((s) => (s.id === normalized.id ? normalized : s));

    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      equipmentSlots: nextSlots,
    });
    setSelectedSlotId(normalized.id);
    setEditingSlot(null);
  };

  const getRegionHighlightProps = (region: BodyRegion) => {
    const slot = primarySlotByRegion.get(region);
    const isSelected = selectedSlot?.region === region || hoveredRegion === region;
    const isEquipped = (slot?.equippedItems.length || 0) > 0;

    if (isSelected) {
      return {
        fill: 'var(--accent-color)',
        fillOpacity: 0.34,
        stroke: 'var(--accent-strong)',
        strokeWidth: 1.8,
      };
    }
    if (isEquipped) {
      return {
        fill: '#10B981',
        fillOpacity: 0.24,
        stroke: '#34D399',
        strokeWidth: 1.4,
      };
    }
    return {
      fill: 'currentColor',
      fillOpacity: 0.08,
      stroke: 'currentColor',
      strokeOpacity: 0.28,
      strokeWidth: 1,
    };
  };

  const renderBodySlotCard = (slot: EquipmentSlot) => {
    const isSelected = selectedSlot?.id === slot.id;
    const firstItem = slot.equippedItems[0] ? itemMap.get(slot.equippedItems[0].itemId) : null;
    const equippedNames = slot.equippedItems
      .map((e) => itemMap.get(e.itemId)?.name)
      .filter(Boolean);
    const hasEquipped = slot.equippedItems.length > 0;
    const meta = BODY_PART_LAYOUT[slot.region] || BODY_PART_LAYOUT.custom;

    return (
      <button
        key={slot.id}
        type="button"
        data-testid={`body-slot-${slot.region}`}
        onClick={() => setSelectedSlotId(slot.id)}
        onMouseEnter={() => setHoveredRegion(slot.region)}
        onMouseLeave={() => setHoveredRegion(null)}
        aria-pressed={isSelected}
        aria-label={`${slot.name}: ${equippedNames.length > 0 ? equippedNames.join(', ') : 'Vazio'} (${slot.equippedItems.length} de ${slot.capacity})`}
        className={`w-full text-left p-2.5 min-h-[54px] rounded-xl border transition-all flex items-center gap-2.5 ${
          isSelected
            ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] shadow-sm'
            : hasEquipped
              ? 'border-emerald-500/45 bg-emerald-500/5 hover:border-emerald-500/70'
              : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
        }`}
      >
        {firstItem ? (
          <div className="shrink-0 pointer-events-none">
            <ImageSlot
              imageId={firstItem.imageId}
              fallbackUrl={firstItem.defaultImageUrl}
              alt={firstItem.name}
              variant="item"
              size="sm"
            />
          </div>
        ) : (
          <div
            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
              isSelected
                ? 'border-[var(--accent-border)] text-[var(--accent-strong)] bg-[var(--bg-surface)]'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--bg-track)]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
              {meta.region === 'custom' ? slot.name : meta.shortLabel}
            </span>
            <span className="font-mono-num text-[10px] text-[var(--text-muted)] shrink-0">
              {slot.equippedItems.length}/{slot.capacity}
            </span>
          </div>
          <p
            className={`text-[11px] truncate mt-0.5 ${
              hasEquipped
                ? 'font-medium text-emerald-600 dark:text-emerald-400'
                : 'text-[var(--text-muted)]'
            }`}
          >
            {equippedNames.length > 0 ? equippedNames.join(', ') : 'Vazio'}
          </p>
        </div>
      </button>
    );
  };

  const renderHumanBodySvg = () => (
    <div
      data-testid="human-body-diagram"
      className="relative w-full max-w-[260px] sm:max-w-[280px] mx-auto aspect-[280/440] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-track)] overflow-hidden select-none"
    >
      <svg
        viewBox="0 0 280 440"
        className="w-full h-full text-[var(--silhouette-fill)]"
        aria-hidden="true"
      >
        {/* Subtle anatomical proportion lines */}
        <line x1="140" y1="12" x2="140" y2="428" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" opacity="0.35" />
        <line x1="24" y1="106" x2="256" y2="106" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.22" />
        <line x1="40" y1="214" x2="240" y2="214" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.22" />
        <line x1="60" y1="312" x2="220" y2="312" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.22" />

        {/* Base Sculpted Human Figure Silhouette */}
        <g fill="currentColor" opacity="0.88">
          {/* Cranium & Jawline */}
          <path d="M140 16 C155 16, 165 27, 165 44 C165 56, 159 68, 151 74 C147 77, 133 77, 129 74 C121 68, 115 56, 115 44 C115 27, 125 16, 140 16 Z" />
          {/* Ears */}
          <ellipse cx="113" cy="48" rx="3.5" ry="6.5" />
          <ellipse cx="167" cy="48" rx="3.5" ry="6.5" />
          {/* Neck & Trapezius */}
          <path d="M128 73 L152 73 L156 91 L176 98 L104 98 L124 91 Z" />
          {/* Torso (Chest, Ribs, Waist, Hips) */}
          <path d="M96 98 C108 94, 172 94, 184 98 L192 114 L180 156 L174 196 L180 224 C178 236, 102 236, 100 224 L106 196 L100 156 L88 114 Z" />
          {/* Right Arm (viewer left: shoulder -> bicep -> forearm -> hand) */}
          <path d="M96 98 C82 99, 73 108, 70 122 L58 172 L46 218 L39 240 C37 248, 43 255, 50 256 C56 257, 62 251, 63 243 L68 220 L82 178 L94 128 Z" />
          {/* Left Arm (viewer right: shoulder -> bicep -> forearm -> hand) */}
          <path d="M184 98 C198 99, 207 108, 210 122 L222 172 L234 218 L241 240 C243 248, 237 255, 230 256 C224 257, 218 251, 217 243 L212 220 L198 178 L186 128 Z" />
          {/* Right Leg (viewer left: thigh -> knee -> calf -> foot) */}
          <path d="M102 224 L138 224 L135 292 L131 334 L126 388 L128 408 C128 416, 100 417, 98 408 C97 401, 104 396, 107 388 L104 334 L100 290 Z" />
          {/* Left Leg (viewer right: thigh -> knee -> calf -> foot) */}
          <path d="M142 224 L178 224 L180 290 L176 334 L173 388 C176 396, 183 401, 182 408 C180 417, 152 416, 152 408 L154 388 L149 334 L145 292 Z" />
        </g>

        {/* Subtle anatomical chest & abdominal contour lines */}
        <path
          d="M112 126 Q126 135 140 129 Q154 135 168 126 M140 132 L140 198 M116 198 Q140 205 164 198"
          fill="none"
          stroke="var(--bg-track)"
          strokeWidth="1.5"
          opacity="0.45"
        />

        {/* Interactive Equippable Anatomical Zones (click targets mirrored by buttons) */}
        {/* Back / Cloak silhouette behind shoulders */}
        <path
          d="M98 98 C118 92, 162 92, 182 98 L194 126 C188 128, 178 122, 174 112 L106 112 C102 122, 92 128, 86 126 Z"
          {...getRegionHighlightProps('back')}
        />
        {/* Head / Helm */}
        <path
          d="M113 42 C113 21, 125 13, 140 13 C155 13, 167 21, 167 42 C158 36, 122 36, 113 42 Z"
          {...getRegionHighlightProps('head')}
        />
        {/* Face / Visor */}
        <rect x="120" y="42" width="40" height="22" rx="8" {...getRegionHighlightProps('face')} />
        {/* Earrings */}
        <circle cx="169" cy="52" r="5" {...getRegionHighlightProps('earrings')} />
        {/* Neck / Collar */}
        <path d="M123 76 Q140 94 157 76 L154 88 Q140 103 126 88 Z" {...getRegionHighlightProps('neck')} />
        {/* Shoulders / Pauldrons */}
        <path
          d="M72 118 C74 98, 94 92, 108 98 L100 120 Z M208 118 C206 98, 186 92, 172 98 L180 120 Z"
          {...getRegionHighlightProps('shoulders')}
        />
        {/* Chest / Armor */}
        <path
          d="M108 104 Q140 112 172 104 L177 148 Q172 186 162 192 Q140 198 118 192 Q108 186 103 148 Z"
          {...getRegionHighlightProps('chest')}
        />
        {/* Amulets */}
        <polygon points="140,154 150,168 140,183 130,168" {...getRegionHighlightProps('amulets')} />
        {/* Right Arm (viewer left) */}
        <path d="M68 128 L88 134 L78 182 L58 176 Z" {...getRegionHighlightProps('rightArm')} />
        {/* Left Arm (viewer right) */}
        <path d="M212 128 L192 134 L202 182 L222 176 Z" {...getRegionHighlightProps('leftArm')} />
        {/* Gloves / Wrist Gauntlets */}
        <path d="M55 184 L75 189 L68 216 L48 210 Z" {...getRegionHighlightProps('gloves')} />
        {/* Right Hand */}
        <ellipse cx="52" cy="238" rx="12" ry="15" {...getRegionHighlightProps('rightHand')} />
        {/* Left Hand */}
        <ellipse cx="228" cy="238" rx="12" ry="15" {...getRegionHighlightProps('leftHand')} />
        {/* Rings */}
        <circle cx="241" cy="256" r="6" {...getRegionHighlightProps('rings')} />
        {/* Waist / Belt */}
        <path d="M101 196 Q140 206 179 196 L181 220 Q140 230 99 220 Z" {...getRegionHighlightProps('waist')} />
        {/* Legs / Greaves */}
        <path
          d="M102 232 L138 232 L130 356 L104 356 Z M142 232 L178 232 L176 356 L150 356 Z"
          {...getRegionHighlightProps('legs')}
        />
        {/* Feet / Boots */}
        <path
          d="M104 366 L128 366 L130 412 L96 412 Z M152 366 L176 366 L184 412 L150 412 Z"
          {...getRegionHighlightProps('feet')}
        />
      </svg>

      {/* Interactive Anatomical Socket Pins (zero text overlap) */}
      {(Object.keys(BODY_PART_LAYOUT) as BodyRegion[])
        .filter((r) => r !== 'custom')
        .map((region) => {
          const slot = primarySlotByRegion.get(region);
          if (!slot) return null;
          const meta = BODY_PART_LAYOUT[region];
          const count = slot.equippedItems.length;
          const isSelected = selectedSlot?.id === slot.id;

          return (
            <button
              key={slot.id}
              type="button"
              data-testid={`body-pin-${region}`}
              onClick={() => setSelectedSlotId(slot.id)}
              onMouseEnter={() => setHoveredRegion(region)}
              onMouseLeave={() => setHoveredRegion(null)}
              title={`${slot.name}${count > 0 ? ` (${count}/${slot.capacity})` : ''}`}
              aria-label={`Selecionar ${slot.name} (${count} de ${slot.capacity} equipado)`}
              style={{
                left: `${meta.pinX}%`,
                top: `${meta.pinY}%`,
                ...(isSelected ? { backgroundColor: 'var(--accent-color)' } : undefined),
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform shadow-sm ${
                isSelected
                  ? 'border-white text-[var(--accent-contrast)] scale-125 z-20 ring-2 ring-[var(--accent-color)]/50'
                  : count > 0
                    ? 'border-emerald-400 bg-emerald-600 text-white z-10 hover:scale-110'
                    : 'border-[var(--border-strong)] bg-[var(--bg-surface)]/95 text-[var(--text-primary)] hover:border-[var(--accent-border)] hover:scale-110'
              }`}
            >
              <span
                className={`rounded-full ${
                  isSelected
                    ? 'w-2 h-2 bg-current'
                    : count > 0
                      ? 'w-2 h-2 bg-white'
                      : 'w-1.5 h-1.5 bg-[var(--text-muted)]'
                }`}
              />
            </button>
          );
        })}
    </div>
  );

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {/* Header */}
      {!embedded && (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--accent-strong)] shrink-0" aria-hidden="true" />
              <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                Equipamento Corporal
              </h1>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {totalEquippedCount} item(ns) equipado(s) em {character.equipmentSlots.length} parte(s) do corpo · Toque em uma região do corpo ou em um espaço lateral para equipar
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex lg:hidden items-center gap-1 p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setMobileViewMode('silhouette')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-medium ${
                  mobileViewMode === 'silhouette'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Corpo
              </button>
              <button
                type="button"
                onClick={() => setMobileViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-medium ${
                  mobileViewMode === 'list'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" aria-hidden="true" />
                Lista
              </button>
            </div>

            {isEditMode && (
              <button
                type="button"
                onClick={() => {
                  setIsNewSlot(true);
                  setEditingSlot({
                    id: createId('slot'),
                    name: '',
                    slotType: 'custom',
                    region: 'custom',
                    capacity: 1,
                    equippedItems: [],
                    order: character.equipmentSlots.length,
                  });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Novo Espaço
              </button>
            )}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left/Center Paperdoll: Flanking Equippable Body Parts + Anatomical Human Figure */}
        <section
          className={`lg:col-span-7 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4 ${
            mobileViewMode === 'list' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Mapa Corporal & Partes Equipáveis
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Selecione uma parte no corpo humano ou nos encaixes laterais
              </p>
            </div>
            {selectedSlot && (
              <span className="text-xs font-medium text-[var(--accent-strong)]">
                Selecionado: {selectedSlot.name}
              </span>
            )}
          </div>

          {/* 3-Column Symmetrical Paperdoll on md+ / Clean Stacked on Mobile */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Left Flank Slots (Desktop & Tablet) */}
            <div className="hidden md:flex md:col-span-4 flex-col gap-2">
              {organizedSlots.leftFlank.map((slot) => renderBodySlotCard(slot))}
            </div>

            {/* Center Human Body Silhouette */}
            <div className="md:col-span-4 flex items-center justify-center">
              {renderHumanBodySvg()}
            </div>

            {/* Right Flank Slots (Desktop & Tablet) */}
            <div className="hidden md:flex md:col-span-4 flex-col gap-2">
              {organizedSlots.rightFlank.map((slot) => renderBodySlotCard(slot))}
            </div>

            {/* Mobile 2-Column Body Parts Grid directly under the Human Figure */}
            <div className="grid grid-cols-2 gap-2 md:hidden">
              {organizedSlots.leftFlank.map((slot) => renderBodySlotCard(slot))}
              {organizedSlots.rightFlank.map((slot) => renderBodySlotCard(slot))}
            </div>
          </div>

          {/* Head/Neck/Jewelry Strip */}
          {organizedSlots.accessories.length > 0 && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                Rosto, Pescoço & Adornos
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {organizedSlots.accessories.map((slot) => renderBodySlotCard(slot))}
              </div>
            </div>
          )}

          {/* Custom or Extra Slots */}
          {organizedSlots.customSlots.length > 0 && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                Espaços Adicionais & Personalizados
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {organizedSlots.customSlots.map((slot) => renderBodySlotCard(slot))}
              </div>
            </div>
          )}
        </section>

        {/* Right Panel: Selected Body Part Inspector + Mobile Full List */}
        <section className="lg:col-span-5 space-y-5">
          {selectedSlot ? (
            <div
              data-testid="equipment-slot-inspector"
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                    {selectedSlot.name}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Tipo: {selectedSlot.slotType} · Ocupação:{' '}
                    <span className="font-mono-num font-semibold">
                      {selectedSlot.equippedItems.length} / {selectedSlot.capacity}
                    </span>
                  </p>
                </div>

                {isEditMode && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewSlot(false);
                        setEditingSlot({ ...selectedSlot });
                      }}
                      aria-label={`Editar espaço ${selectedSlot.name}`}
                      className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      Configurar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmDelete(
                          'Excluir Espaço',
                          `Deseja excluir o espaço "${selectedSlot.name}"?`,
                          () => {
                            onUpdateCharacter({
                              ...character,
                              updatedAt: Date.now(),
                              equipmentSlots: character.equipmentSlots.filter(
                                (s) => s.id !== selectedSlot.id
                              ),
                            });
                            setSelectedSlotId(null);
                          }
                        )
                      }
                      aria-label={`Excluir espaço ${selectedSlot.name}`}
                      className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {/* Currently Equipped in this Slot */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[var(--text-muted)]">
                  Equipado neste Espaço
                </h3>
                {selectedSlot.equippedItems.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-2">
                    Nenhum item equipado aqui no momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedSlot.equippedItems.map((entry, idx) => {
                      const item = itemMap.get(entry.itemId);
                      if (!item) return null;
                      const resolvedDamage = resolveItemDamage(character, item, attrBreakdowns);
                      return (
                        <div
                          key={`${entry.itemId}_${idx}`}
                          className="flex items-start justify-between gap-3 p-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <ImageSlot
                              imageId={item.imageId}
                              fallbackUrl={item.defaultImageUrl}
                              alt={item.name}
                              variant="item"
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-[var(--text-primary)]">
                                {item.name}
                                {item.twoHanded ? ' (Duas mãos)' : ''}
                              </p>
                              {resolvedDamage.hasDamage && (
                                <p
                                  data-testid={`equipped-item-damage-${item.id}`}
                                  className="text-xs font-semibold text-[var(--accent-strong)] font-mono-num mt-0.5"
                                >
                                  Dano: {resolvedDamage.resolvedText}
                                  {resolvedDamage.usedStats.length > 0
                                    ? ` (${resolvedDamage.usedStats
                                        .map((s) => `${s.name}: ${s.value}`)
                                        .join(', ')})`
                                    : ''}
                                </p>
                              )}
                              {item.description && (
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                  {item.description}
                                </p>
                              )}
                              {item.attributeModifiers.length > 0 && (
                                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                                  {item.attributeModifiers
                                    .map(
                                      (m) =>
                                        `${m.value > 0 ? `+${m.value}` : m.value} ${m.attributeName || 'Atributo'}`
                                    )
                                    .join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnequip(selectedSlot.id, item.id)}
                            className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] shrink-0"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                            Desequipar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Compatible Items from Backpack */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <h3 className="text-xs font-semibold text-[var(--text-muted)]">
                  Itens Compatíveis da Mochila ({compatibleInventory.length})
                </h3>
                {compatibleInventory.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] py-1">
                    Nenhum item compatível disponível na Mochila. Marque itens como equipáveis na Mochila para vinculá-los aqui.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {compatibleInventory.map((item) => {
                      const alreadyEquippedHere = selectedSlot.equippedItems.some(
                        (e) => e.itemId === item.id
                      );
                      const equippedElsewhere =
                        !alreadyEquippedHere && isItemEquipped(character, item.id);
                      const resolvedDamage = resolveItemDamage(character, item, attrBreakdowns);

                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ImageSlot
                              imageId={item.imageId}
                              fallbackUrl={item.defaultImageUrl}
                              alt={item.name}
                              variant="item"
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-[var(--text-muted)] truncate">
                                {resolvedDamage.hasDamage
                                  ? `Dano: ${resolvedDamage.resolvedText}`
                                  : item.effectsText || item.category}
                                {equippedElsewhere ? ' · Equipado em outro espaço' : ''}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={alreadyEquippedHere}
                            onClick={() => handleEquip(item.id, selectedSlot.id)}
                            className="px-3 py-2 min-h-[38px] rounded-lg text-xs font-semibold text-[var(--accent-contrast)] disabled:opacity-40 shrink-0"
                            style={{ backgroundColor: 'var(--accent-color)' }}
                          >
                            {alreadyEquippedHere ? 'Equipado' : 'Equipar'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                Nenhum espaço de equipamento configurado. Ative o Modo Edição para criar espaços corporais.
              </p>
            </div>
          )}

          {/* Mobile Accessible List View */}
          <div
            className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 ${
              mobileViewMode === 'list' ? 'block lg:hidden' : 'hidden'
            }`}
          >
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Todos os Espaços ({character.equipmentSlots.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {character.equipmentSlots.map((slot) => renderBodySlotCard(slot))}
            </div>
          </div>
        </section>
      </div>

      {/* Create/Edit Equipment Slot Modal */}
      {editingSlot && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slot-modal-title"
        >
          <form
            onSubmit={handleSaveSlot}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="slot-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewSlot ? 'Novo Espaço de Equipamento' : `Configurar: ${editingSlot.name}`}
            </h3>

            <div>
              <label
                htmlFor="slot-name"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Nome do Espaço
              </label>
              <input
                id="slot-name"
                type="text"
                required
                value={editingSlot.name}
                onChange={(e) => setEditingSlot({ ...editingSlot, name: e.target.value })}
                placeholder="Ex.: Relíquia de Cintura, Anéis, Implante"
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label
                htmlFor="slot-region"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Parte do Corpo
              </label>
              <select
                id="slot-region"
                value={editingSlot.region}
                onChange={(e) =>
                  setEditingSlot({ ...editingSlot, region: e.target.value as BodyRegion })
                }
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              >
                {REGION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="slot-type"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Tipo de Compatibilidade
                </label>
                <input
                  id="slot-type"
                  type="text"
                  value={editingSlot.slotType}
                  onChange={(e) => setEditingSlot({ ...editingSlot, slotType: e.target.value })}
                  placeholder="hand, ring, chest, custom..."
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="slot-cap"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Capacidade Máxima
                </label>
                <input
                  id="slot-cap"
                  type="number"
                  min={1}
                  max={20}
                  value={editingSlot.capacity}
                  onChange={(e) =>
                    setEditingSlot({
                      ...editingSlot,
                      capacity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSlot(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Salvar Espaço
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
