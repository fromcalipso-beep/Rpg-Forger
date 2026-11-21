import { AttributeDef, Character, ResourceDef } from '../types/rpg';

export interface AttributeBreakdown {
  attributeId: string;
  baseValue: number;
  permanentBonus: number;
  tempBonus: number;
  equipmentBonus: number;
  abilityBonus: number;
  customSourcesBonus: number;
  totalValue: number;
  sources: Array<{ label: string; value: number; kind: 'equipment' | 'ability' | 'permanent' | 'temp' | 'custom' }>;
}

export interface ResourceEffectiveState {
  resourceId: string;
  baseMax: number;
  equipmentMaxBonus: number;
  abilityMaxBonus: number;
  tempBonus: number;
  effectiveMax: number;
  current: number;
  min: number;
  percentage: number;
}

/**
 * Computes equipped unique inventory items currently linked across all equipment slots.
 * Prevents double-counting two-handed or multi-slot items by deduplicating by itemId.
 */
export function getUniqueEquippedItems(character: Character) {
  const seenItemIds = new Set<string>();
  const itemMap = new Map(character.inventory.map((it) => [it.id, it]));
  const equipped = [];

  for (const slot of character.equipmentSlots) {
    for (const entry of slot.equippedItems) {
      if (seenItemIds.has(entry.itemId)) continue;
      const item = itemMap.get(entry.itemId);
      if (item) {
        seenItemIds.add(entry.itemId);
        equipped.push(item);
      }
    }
  }
  return equipped;
}

/**
 * Calculates full attribute breakdown without mutating baseValue.
 */
export function computeAttributeBreakdown(
  character: Character,
  attribute: AttributeDef
): AttributeBreakdown {
  const equippedItems = getUniqueEquippedItems(character);
  const sources: AttributeBreakdown['sources'] = [];

  let equipmentBonus = 0;
  for (const item of equippedItems) {
    for (const mod of item.attributeModifiers) {
      if (mod.attributeId === attribute.id && mod.value !== 0) {
        equipmentBonus += mod.value;
        sources.push({ label: item.name, value: mod.value, kind: 'equipment' });
      }
    }
  }

  let abilityBonus = 0;
  for (const ability of character.abilities) {
    const applies = ability.abilityType === 'passive' || ability.isActive;
    if (!applies) continue;
    for (const mod of ability.attributeModifiers) {
      if (mod.attributeId === attribute.id && mod.value !== 0) {
        abilityBonus += mod.value;
        sources.push({ label: ability.name, value: mod.value, kind: 'ability' });
      }
    }
  }

  let customSourcesBonus = 0;
  for (const src of attribute.customSources) {
    if (src.value !== 0) {
      customSourcesBonus += src.value;
      sources.push({ label: src.label, value: src.value, kind: 'custom' });
    }
  }

  if (attribute.permanentBonus !== 0) {
    sources.push({ label: 'Bônus permanente', value: attribute.permanentBonus, kind: 'permanent' });
  }
  if (attribute.tempBonus !== 0) {
    sources.push({ label: 'Bônus temporário', value: attribute.tempBonus, kind: 'temp' });
  }

  const totalValue =
    attribute.baseValue +
    attribute.permanentBonus +
    attribute.tempBonus +
    equipmentBonus +
    abilityBonus +
    customSourcesBonus;

  return {
    attributeId: attribute.id,
    baseValue: attribute.baseValue,
    permanentBonus: attribute.permanentBonus,
    tempBonus: attribute.tempBonus,
    equipmentBonus,
    abilityBonus,
    customSourcesBonus,
    totalValue,
    sources,
  };
}

export function computeAllAttributes(character: Character): Record<string, AttributeBreakdown> {
  const result: Record<string, AttributeBreakdown> = {};
  for (const attr of character.attributes) {
    result[attr.id] = computeAttributeBreakdown(character, attr);
  }
  return result;
}

export function computeResourceEffective(
  character: Character,
  resource: ResourceDef
): ResourceEffectiveState {
  const equippedItems = getUniqueEquippedItems(character);
  let equipmentMaxBonus = 0;
  for (const item of equippedItems) {
    for (const mod of item.resourceModifiers) {
      if (mod.resourceId === resource.id) {
        equipmentMaxBonus += mod.maxBonus;
      }
    }
  }

  let abilityMaxBonus = 0;
  for (const ability of character.abilities) {
    if (ability.abilityType === 'passive' || ability.isActive) {
      for (const mod of ability.resourceModifiers) {
        if (mod.resourceId === resource.id) {
          abilityMaxBonus += mod.maxBonus;
        }
      }
    }
  }

  const effectiveMax = Math.max(
    resource.min,
    resource.max + equipmentMaxBonus + abilityMaxBonus + resource.tempBonus
  );

  const range = Math.max(1, effectiveMax - resource.min);
  const clamped = Math.max(resource.min, Math.min(effectiveMax, resource.current));
  const percentage = Math.round(((clamped - resource.min) / range) * 100);

  return {
    resourceId: resource.id,
    baseMax: resource.max,
    equipmentMaxBonus,
    abilityMaxBonus,
    tempBonus: resource.tempBonus,
    effectiveMax,
    current: resource.current,
    min: resource.min,
    percentage: Math.max(0, Math.min(100, percentage)),
  };
}

export function adjustResourceValue(
  character: Character,
  resourceId: string,
  delta: number
): Character {
  const target = character.resources.find((r) => r.id === resourceId);
  if (!target) return character;

  const eff = computeResourceEffective(character, target);
  let nextVal = target.current + delta;
  if (!target.allowNegative) {
    nextVal = Math.max(target.min, nextVal);
  }
  nextVal = Math.min(eff.effectiveMax, nextVal);

  return {
    ...character,
    updatedAt: Date.now(),
    resources: character.resources.map((r) =>
      r.id === resourceId ? { ...r, current: nextVal } : r
    ),
  };
}

export function computeTotalInventoryWeight(character: Character): number {
  return Number(
    character.inventory
      .reduce((sum, item) => sum + Math.max(0, item.weight) * Math.max(0, item.quantity), 0)
      .toFixed(2)
  );
}

export function computeEffectiveCarryCapacity(character: Character): number {
  const { carryCapacity } = character;
  if (!carryCapacity.enabled) return 0;
  if (carryCapacity.linkedAttributeId) {
    const attr = character.attributes.find((a) => a.id === carryCapacity.linkedAttributeId);
    if (attr) {
      const breakdown = computeAttributeBreakdown(character, attr);
      return Number((breakdown.totalValue * (carryCapacity.multiplier || 1)).toFixed(2));
    }
  }
  return carryCapacity.maxWeight;
}
