import { BodyRegion, Character, EquipmentSlot, InventoryItem } from '../types/rpg';
import { createId, deepClone } from '../utils/id';

export interface BodyPartMeta {
  region: BodyRegion;
  shortLabel: string;
  group: 'left' | 'right' | 'accessories' | 'custom';
  order: number;
  pinX: number;
  pinY: number;
}

export const BODY_PART_LAYOUT: Record<BodyRegion, BodyPartMeta> = {
  head: { region: 'head', shortLabel: 'Cabeça', group: 'left', order: 0, pinX: 50, pinY: 7 },
  shoulders: { region: 'shoulders', shortLabel: 'Ombros', group: 'left', order: 1, pinX: 33, pinY: 24.5 },
  chest: { region: 'chest', shortLabel: 'Torso', group: 'left', order: 2, pinX: 50, pinY: 31 },
  rightArm: { region: 'rightArm', shortLabel: 'Braço D.', group: 'left', order: 3, pinX: 26, pinY: 37.5 },
  rightHand: { region: 'rightHand', shortLabel: 'Mão D.', group: 'left', order: 4, pinX: 19, pinY: 54 },
  legs: { region: 'legs', shortLabel: 'Pernas', group: 'left', order: 5, pinX: 41, pinY: 68 },

  back: { region: 'back', shortLabel: 'Costas / Capa', group: 'right', order: 0, pinX: 67, pinY: 24.5 },
  gloves: { region: 'gloves', shortLabel: 'Luvas', group: 'right', order: 1, pinX: 23, pinY: 44.5 },
  leftArm: { region: 'leftArm', shortLabel: 'Braço E.', group: 'right', order: 2, pinX: 74, pinY: 37.5 },
  leftHand: { region: 'leftHand', shortLabel: 'Mão E.', group: 'right', order: 3, pinX: 80.5, pinY: 52.5 },
  waist: { region: 'waist', shortLabel: 'Cintura', group: 'right', order: 4, pinX: 50, pinY: 48.5 },
  feet: { region: 'feet', shortLabel: 'Pés / Botas', group: 'right', order: 5, pinX: 59, pinY: 90 },

  face: { region: 'face', shortLabel: 'Rosto', group: 'accessories', order: 0, pinX: 50, pinY: 14 },
  earrings: { region: 'earrings', shortLabel: 'Brincos', group: 'accessories', order: 1, pinX: 61, pinY: 12.5 },
  neck: { region: 'neck', shortLabel: 'Colar', group: 'accessories', order: 2, pinX: 50, pinY: 20.5 },
  amulets: { region: 'amulets', shortLabel: 'Amuletos', group: 'accessories', order: 3, pinX: 50, pinY: 39.5 },
  rings: { region: 'rings', shortLabel: 'Anéis', group: 'accessories', order: 4, pinX: 86.5, pinY: 58.5 },

  custom: { region: 'custom', shortLabel: 'Personalizado', group: 'custom', order: 99, pinX: 50, pinY: 50 },
};

export interface OrganizedBodySlots {
  leftFlank: EquipmentSlot[];
  rightFlank: EquipmentSlot[];
  accessories: EquipmentSlot[];
  customSlots: EquipmentSlot[];
}

export function organizeEquipmentSlotsForBody(slots: EquipmentSlot[]): OrganizedBodySlots {
  const leftFlank: EquipmentSlot[] = [];
  const rightFlank: EquipmentSlot[] = [];
  const accessories: EquipmentSlot[] = [];
  const customSlots: EquipmentSlot[] = [];
  const seenPrimaryRegions = new Set<BodyRegion>();

  const sorted = [...slots].sort((a, b) => a.order - b.order);

  for (const slot of sorted) {
    const meta = BODY_PART_LAYOUT[slot.region] || BODY_PART_LAYOUT.custom;
    if (meta.group === 'custom' || seenPrimaryRegions.has(slot.region)) {
      customSlots.push(slot);
      continue;
    }
    seenPrimaryRegions.add(slot.region);
    if (meta.group === 'left') leftFlank.push(slot);
    else if (meta.group === 'right') rightFlank.push(slot);
    else accessories.push(slot);
  }

  leftFlank.sort((a, b) => BODY_PART_LAYOUT[a.region].order - BODY_PART_LAYOUT[b.region].order);
  rightFlank.sort((a, b) => BODY_PART_LAYOUT[a.region].order - BODY_PART_LAYOUT[b.region].order);
  accessories.sort((a, b) => BODY_PART_LAYOUT[a.region].order - BODY_PART_LAYOUT[b.region].order);

  return { leftFlank, rightFlank, accessories, customSlots };
}

export interface EquipResult {
  success: boolean;
  character: Character;
  error?: string;
}

export function isItemEquipped(character: Character, itemId: string): boolean {
  return character.equipmentSlots.some((slot) =>
    slot.equippedItems.some((entry) => entry.itemId === itemId)
  );
}

export function getEquippedSlotNamesForItem(character: Character, itemId: string): string[] {
  return character.equipmentSlots
    .filter((slot) => slot.equippedItems.some((entry) => entry.itemId === itemId))
    .map((slot) => slot.name);
}

export function isSlotCompatibleWithItem(slot: EquipmentSlot, item: InventoryItem): boolean {
  if (!item.equippable) return false;
  if (item.compatibleSlotTypes.length === 0) return true;
  if (item.compatibleSlotTypes.includes('any')) return true;
  return item.compatibleSlotTypes.includes(slot.slotType) || item.compatibleSlotTypes.includes(slot.region);
}

export function unequipItemFromAllSlots(character: Character, itemId: string): Character {
  return {
    ...character,
    updatedAt: Date.now(),
    equipmentSlots: character.equipmentSlots.map((slot) => ({
      ...slot,
      equippedItems: slot.equippedItems.filter((entry) => entry.itemId !== itemId),
    })),
  };
}

export function unequipSlotEntry(
  character: Character,
  slotId: string,
  itemId: string
): Character {
  const slot = character.equipmentSlots.find((s) => s.id === slotId);
  if (!slot) return character;
  const entry = slot.equippedItems.find((e) => e.itemId === itemId);
  if (!entry) return character;

  if (entry.linkedGroupId) {
    const groupId = entry.linkedGroupId;
    return {
      ...character,
      updatedAt: Date.now(),
      equipmentSlots: character.equipmentSlots.map((s) => ({
        ...s,
        equippedItems: s.equippedItems.filter((e) => e.linkedGroupId !== groupId),
      })),
    };
  }

  return {
    ...character,
    updatedAt: Date.now(),
    equipmentSlots: character.equipmentSlots.map((s) =>
      s.id === slotId
        ? { ...s, equippedItems: s.equippedItems.filter((e) => e.itemId !== itemId) }
        : s
    ),
  };
}

/**
 * Equips an inventory item into a target slot (and additional compatible slots if two-handed / multi-slot).
 * Links to the original inventory item ID without creating duplicate inventory records.
 */
export function equipItemToSlot(
  character: Character,
  itemId: string,
  primarySlotId: string,
  additionalSlotIds: string[] = []
): EquipResult {
  const item = character.inventory.find((i) => i.id === itemId);
  if (!item) {
    return { success: false, character, error: 'Item não encontrado no inventário.' };
  }
  if (!item.equippable) {
    return { success: false, character, error: 'Este item não está marcado como equipável.' };
  }

  const primarySlot = character.equipmentSlots.find((s) => s.id === primarySlotId);
  if (!primarySlot) {
    return { success: false, character, error: 'Espaço de equipamento não encontrado.' };
  }

  if (!isSlotCompatibleWithItem(primarySlot, item)) {
    return {
      success: false,
      character,
      error: `O item "${item.name}" não é compatível com o espaço "${primarySlot.name}".`,
    };
  }

  // First remove existing links for this same item so we can cleanly re-equip
  const cleanedCharacter = unequipItemFromAllSlots(character, itemId);
  const requiredCount = item.twoHanded ? Math.max(2, item.requiredSlotsCount || 2) : Math.max(1, item.requiredSlotsCount || 1);

  const selectedSlotIds = [primarySlotId, ...additionalSlotIds.filter((id) => id !== primarySlotId)];

  // Auto-select compatible secondary slots if item requires > 1 slot and user didn't specify enough
  if (selectedSlotIds.length < requiredCount) {
    const candidates = cleanedCharacter.equipmentSlots.filter(
      (s) =>
        !selectedSlotIds.includes(s.id) &&
        isSlotCompatibleWithItem(s, item) &&
        s.equippedItems.length < s.capacity
    );
    for (const candidate of candidates) {
      if (selectedSlotIds.length >= requiredCount) break;
      selectedSlotIds.push(candidate.id);
    }
  }

  if (selectedSlotIds.length < requiredCount) {
    return {
      success: false,
      character,
      error: `"${item.name}" exige ${requiredCount} espaços compatíveis disponíveis.`,
    };
  }

  // Validate capacity and compatibility on all selected slots
  for (const sid of selectedSlotIds) {
    const slot = cleanedCharacter.equipmentSlots.find((s) => s.id === sid);
    if (!slot) {
      return { success: false, character, error: 'Espaço de equipamento inválido.' };
    }
    if (!isSlotCompatibleWithItem(slot, item)) {
      return {
        success: false,
        character,
        error: `Espaço "${slot.name}" incompatível com "${item.name}".`,
      };
    }
    if (slot.equippedItems.length >= slot.capacity) {
      return {
        success: false,
        character,
        error: `O espaço "${slot.name}" atingiu a capacidade máxima (${slot.capacity}). Desequipe um item primeiro.`,
      };
    }
  }

  const linkedGroupId = selectedSlotIds.length > 1 ? createId('grp') : undefined;

  const updatedSlots = cleanedCharacter.equipmentSlots.map((slot) => {
    if (!selectedSlotIds.includes(slot.id)) return slot;
    return {
      ...slot,
      equippedItems: [...slot.equippedItems, { itemId: item.id, linkedGroupId }],
    };
  });

  return {
    success: true,
    character: {
      ...cleanedCharacter,
      updatedAt: Date.now(),
      equipmentSlots: updatedSlots,
    },
  };
}

export function stackCompatibleItems(character: Character, sourceId: string, targetId: string): Character {
  if (sourceId === targetId) return character;
  const source = character.inventory.find((i) => i.id === sourceId);
  const target = character.inventory.find((i) => i.id === targetId);
  if (!source || !target) return character;
  if (isItemEquipped(character, sourceId)) return character;

  const updatedInventory = character.inventory
    .filter((i) => i.id !== sourceId)
    .map((i) =>
      i.id === targetId ? { ...i, quantity: i.quantity + source.quantity } : i
    );

  return {
    ...character,
    updatedAt: Date.now(),
    inventory: updatedInventory,
  };
}

export function splitItemStack(character: Character, itemId: string, splitQuantity: number): Character {
  const item = character.inventory.find((i) => i.id === itemId);
  if (!item || item.quantity <= 1) return character;
  const qty = Math.floor(splitQuantity);
  if (qty <= 0 || qty >= item.quantity) return character;

  const cloned = deepClone(item);
  cloned.id = createId('item');
  cloned.quantity = qty;

  return {
    ...character,
    updatedAt: Date.now(),
    inventory: character.inventory.flatMap((i) =>
      i.id === itemId ? [{ ...i, quantity: i.quantity - qty }, cloned] : [i]
    ),
  };
}

export function duplicateInventoryItem(character: Character, itemId: string): Character {
  const item = character.inventory.find((i) => i.id === itemId);
  if (!item) return character;

  const copy = deepClone(item);
  copy.id = createId('item');
  copy.name = `${item.name} (Cópia)`;

  return {
    ...character,
    updatedAt: Date.now(),
    inventory: [...character.inventory, copy],
  };
}

export function deleteInventoryItem(character: Character, itemId: string): Character {
  const unequipped = unequipItemFromAllSlots(character, itemId);
  return {
    ...unequipped,
    updatedAt: Date.now(),
    inventory: unequipped.inventory.filter((i) => i.id !== itemId),
  };
}
