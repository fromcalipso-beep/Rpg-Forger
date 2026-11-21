import {
  AbilityCategory,
  AbilityTimingRules,
  Character,
  EquipmentSlot,
  ModuleFlags,
  SheetTemplate,
} from '../types/rpg';
import { createId, deepClone } from '../utils/id';

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_TIMING_RULES: AbilityTimingRules = {
  processRecurringAt: 'turn_start',
  processDurationAt: 'turn_end',
  processCooldownAt: 'turn_end',
};

export const DEFAULT_MODULES: ModuleFlags = {
  attributes: true,
  skills: true,
  knowledge: true,
  resources: true,
  wallet: true,
  inventory: true,
  equipment: true,
  abilities: true,
  combat: true,
  notes: true,
  progression: true,
};

export function createDefaultEquipmentSlots(): EquipmentSlot[] {
  const defs: Array<{ name: string; slotType: string; region: EquipmentSlot['region']; capacity: number }> = [
    { name: 'Elmo / Cabeça', slotType: 'head', region: 'head', capacity: 1 },
    { name: 'Rosto / Visor', slotType: 'face', region: 'face', capacity: 1 },
    { name: 'Colar', slotType: 'neck', region: 'neck', capacity: 1 },
    { name: 'Ombros', slotType: 'shoulders', region: 'shoulders', capacity: 1 },
    { name: 'Armadura / Torso', slotType: 'chest', region: 'chest', capacity: 1 },
    { name: 'Capa / Costas', slotType: 'back', region: 'back', capacity: 1 },
    { name: 'Braço Esquerdo', slotType: 'arm', region: 'leftArm', capacity: 1 },
    { name: 'Braço Direito', slotType: 'arm', region: 'rightArm', capacity: 1 },
    { name: 'Mão Esquerda', slotType: 'hand', region: 'leftHand', capacity: 1 },
    { name: 'Mão Direita', slotType: 'hand', region: 'rightHand', capacity: 1 },
    { name: 'Luvas', slotType: 'gloves', region: 'gloves', capacity: 1 },
    { name: 'Cintura', slotType: 'waist', region: 'waist', capacity: 1 },
    { name: 'Pernas', slotType: 'legs', region: 'legs', capacity: 1 },
    { name: 'Botas / Pés', slotType: 'feet', region: 'feet', capacity: 1 },
    { name: 'Anéis', slotType: 'ring', region: 'rings', capacity: 8 },
    { name: 'Brincos', slotType: 'earring', region: 'earrings', capacity: 2 },
    { name: 'Amuletos', slotType: 'amulet', region: 'amulets', capacity: 2 },
  ];

  return defs.map((d, idx) => ({
    id: createId('slot'),
    name: d.name,
    slotType: d.slotType,
    region: d.region,
    capacity: d.capacity,
    equippedItems: [],
    order: idx,
  }));
}

export function createBlankTemplate(name = 'Modelo em Branco'): SheetTemplate {
  const now = Date.now();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: createId('tpl'),
    name,
    description: 'Estrutura completamente limpa, sem regras ou atributos predefinidos.',
    isBlank: true,
    createdAt: now,
    updatedAt: now,
    enabledModules: { ...DEFAULT_MODULES },
    defaultIdentityLabels: {
      levelLabel: 'Nível',
      xpLabel: 'Experiência',
      customFields: [],
    },
    attributes: [],
    skills: [],
    knowledge: [],
    resources: [],
    walletCurrencies: [],
    walletEnableConversion: true,
    itemCategories: ['Geral'],
    storageLocations: ['Mochila'],
    equipmentSlots: [],
    abilityCategories: [],
    combatDefaults: {
      defaultTimingRules: { ...DEFAULT_TIMING_RULES },
      defaultInsufficientResourceRule: 'auto_deactivate',
    },
  };
}

export function createUniversalFantasyTemplate(): SheetTemplate {
  const now = Date.now();
  const attrFor = createId('attr');
  const attrDes = createId('attr');
  const attrCon = createId('attr');
  const attrInt = createId('attr');
  const attrSab = createId('attr');
  const attrCar = createId('attr');
  const attrVit = createId('attr');
  const attrFort = createId('attr');

  const catAtiva: AbilityCategory = {
    id: createId('cat'),
    name: 'Habilidades Ativas',
    color: '#C89B3C',
    icon: 'zap',
    description: 'Técnicas e manobras ativadas em combate.',
    order: 0,
  };
  const catMagia: AbilityCategory = {
    id: createId('cat'),
    name: 'Magias & Rituais',
    color: '#5B8DEF',
    icon: 'flame',
    description: 'Conjurações arcanas ou divinas.',
    order: 1,
  };
  const catPostura: AbilityCategory = {
    id: createId('cat'),
    name: 'Posturas & Sustentadas',
    color: '#34A876',
    icon: 'shield',
    description: 'Efeitos contínuos com custo recorrente ou alternância.',
    order: 2,
  };
  const catPassiva: AbilityCategory = {
    id: createId('cat'),
    name: 'Habilidades Passivas',
    color: '#9E9789',
    icon: 'star',
    description: 'Traços permanentes de raça, classe ou treinamento.',
    order: 3,
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'tpl_universal_dark_fantasy',
    name: 'Fantasia Sombria Universal',
    description: 'Modelo inicial flexível com atributos clássicos, recursos vitais, slots corporais completos e categorias de combate.',
    isBlank: false,
    createdAt: now,
    updatedAt: now,
    enabledModules: { ...DEFAULT_MODULES },
    defaultIdentityLabels: {
      levelLabel: 'Nível',
      xpLabel: 'Experiência',
      customFields: [
        { id: createId('fld'), label: 'Alinhamento / Índole', value: '' },
        { id: createId('fld'), label: 'Idiomas', value: '' },
      ],
    },
    attributes: [
      { id: attrFor, name: 'Força', shortName: 'FOR', category: 'Físicos', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 0 },
      { id: attrDes, name: 'Destreza', shortName: 'DES', category: 'Físicos', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 1 },
      { id: attrCon, name: 'Constituição', shortName: 'CON', category: 'Físicos', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 2 },
      { id: attrVit, name: 'Vitalidade', shortName: 'VIT', category: 'Físicos', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 3 },
      { id: attrInt, name: 'Inteligência', shortName: 'INT', category: 'Mentais', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 4 },
      { id: attrSab, name: 'Sabedoria', shortName: 'SAB', category: 'Mentais', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 5 },
      { id: attrCar, name: 'Carisma', shortName: 'CAR', category: 'Sociais', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 6 },
      { id: attrFort, name: 'Fortitude', shortName: 'FORT', category: 'Defensivos', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 7 },
    ],
    skills: [
      { id: createId('sk'), name: 'Esgrima', category: 'Combate', linkedAttributeId: attrFor, baseValue: 2, proficiencyLabel: 'Treinado', bonus: 0 },
      { id: createId('sk'), name: 'Furtividade', category: 'Exploração', linkedAttributeId: attrDes, baseValue: 1, proficiencyLabel: 'Básico', bonus: 0 },
      { id: createId('sk'), name: 'Ocultismo', category: 'Conhecimento', linkedAttributeId: attrInt, baseValue: 1, proficiencyLabel: 'Básico', bonus: 0 },
      { id: createId('sk'), name: 'Percepção', category: 'Sentidos', linkedAttributeId: attrSab, baseValue: 2, proficiencyLabel: 'Treinado', bonus: 0 },
    ],
    knowledge: [],
    resources: [
      { id: createId('res'), name: 'Vida', current: 50, max: 50, min: 0, tempBonus: 0, color: '#C94040', icon: 'heart', order: 0 },
      { id: createId('res'), name: 'Mana', current: 30, max: 30, min: 0, tempBonus: 0, color: '#4B7FD6', icon: 'droplet', order: 1 },
      { id: createId('res'), name: 'Vigor', current: 20, max: 20, min: 0, tempBonus: 0, color: '#D19A38', icon: 'zap', order: 2 },
      { id: createId('res'), name: 'Sanidade', current: 25, max: 25, min: 0, tempBonus: 0, color: '#8A67C2', icon: 'eye', order: 3 },
    ],
    walletCurrencies: [
      { id: createId('cur'), name: 'Moedas de Ouro', symbol: 'MO', amount: 0, exchangeRate: 1, color: '#D19A38', order: 0 },
      { id: createId('cur'), name: 'Moedas de Prata', symbol: 'MP', amount: 0, exchangeRate: 0.1, color: '#94A3B8', order: 1 },
      { id: createId('cur'), name: 'Moedas de Cobre', symbol: 'MC', amount: 0, exchangeRate: 0.01, color: '#B45309', order: 2 },
      { id: createId('cur'), name: 'Fragmentos Arcanos', symbol: 'FA', amount: 0, exchangeRate: 0, color: '#8A67C2', order: 3 },
    ],
    walletEnableConversion: true,
    itemCategories: ['Armas', 'Armaduras', 'Acessórios', 'Consumíveis', 'Equipamento', 'Tesouros', 'Documentos'],
    storageLocations: ['Mochila', 'Cinturão', 'Bolsa de Poções', 'Acampamento'],
    equipmentSlots: createDefaultEquipmentSlots(),
    abilityCategories: [catAtiva, catMagia, catPostura, catPassiva],
    combatDefaults: {
      defaultTimingRules: { ...DEFAULT_TIMING_RULES },
      defaultInsufficientResourceRule: 'auto_deactivate',
    },
  };
}

export function createCharacterFromTemplate(
  template: SheetTemplate,
  name: string
): Character {
  const now = Date.now();
  const cloned = deepClone(template);

  // Re-map attribute IDs and resource IDs so each character is completely independent
  const attrIdMap = new Map<string, string>();
  const attributes = cloned.attributes.map((a) => {
    const newId = createId('attr');
    attrIdMap.set(a.id, newId);
    return { ...a, id: newId };
  });

  const skills = cloned.skills.map((s) => ({
    ...s,
    id: createId('sk'),
    linkedAttributeId: s.linkedAttributeId ? attrIdMap.get(s.linkedAttributeId) : undefined,
  }));

  const resources = cloned.resources.map((r) => ({
    ...r,
    id: createId('res'),
  }));

  const walletCurrencies = (cloned.walletCurrencies || []).map((c) => ({
    ...c,
    id: createId('cur'),
  }));

  const equipmentSlots = cloned.equipmentSlots.map((slot) => ({
    ...slot,
    id: createId('slot'),
    equippedItems: [],
  }));

  const abilityCategories = cloned.abilityCategories.map((cat) => ({
    ...cat,
    id: createId('cat'),
  }));

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: createId('char'),
    templateId: template.id,
    createdAt: now,
    updatedAt: now,
    identity: {
      name: name.trim() || 'Novo Personagem',
      race: '',
      subrace: '',
      characterClass: '',
      subclass: '',
      age: '',
      gender: '',
      height: '',
      weight: '',
      profession: '',
      title: '',
      affiliation: '',
      background: '',
      biography: '',
      level: 1,
      currentXp: 0,
      nextLevelXp: 100,
      levelLabel: cloned.defaultIdentityLabels.levelLabel || 'Nível',
      xpLabel: cloned.defaultIdentityLabels.xpLabel || 'Experiência',
      customFields: cloned.defaultIdentityLabels.customFields.map((f) => ({
        ...f,
        id: createId('fld'),
      })),
      hiddenFields: [],
      sectionOrder: ['identity', 'progression', 'resources', 'wallet', 'attributes', 'skills', 'knowledge'],
    },
    enabledModules: { ...cloned.enabledModules },
    attributes,
    skills,
    knowledge: (cloned.knowledge || []).map((k) => ({ ...k, id: createId('knw') })),
    resources,
    wallet: {
      currencies: walletCurrencies,
      enableConversion: cloned.walletEnableConversion ?? true,
      baseCurrencyId: walletCurrencies.find((c) => c.exchangeRate === 1)?.id || walletCurrencies[0]?.id,
      autoConvertOverflow: false,
      history: [],
    },
    inventory: [],
    storageLocations: cloned.storageLocations.length > 0 ? cloned.storageLocations : ['Mochila'],
    itemCategories: cloned.itemCategories.length > 0 ? cloned.itemCategories : ['Geral'],
    carryCapacity: {
      enabled: true,
      maxWeight: 50,
      linkedAttributeId: attributes[0]?.id,
      multiplier: 5,
    },
    equipmentSlots,
    abilityCategories,
    abilities: [],
    combat: {
      round: 1,
      turn: 1,
      defaultTimingRules: { ...cloned.combatDefaults.defaultTimingRules },
      defaultInsufficientResourceRule: cloned.combatDefaults.defaultInsufficientResourceRule,
      history: [],
      undoStack: [],
      pendingConfirmations: [],
      warnings: [],
    },
    notes: [],
    noteFolders: ['Geral', 'Missões', 'NPCs', 'Locais', 'Sessões'],
  };
}

export interface PersonalizedAttributeDraft {
  name: string;
  shortName: string;
  baseValue: number;
  category?: string;
}

export interface PersonalizedResourceDraft {
  name: string;
  max: number;
  color?: string;
}

export interface PersonalizedSheetInput {
  name: string;
  characterClass?: string;
  race?: string;
  title?: string;
  level?: number;
  portraitImageId?: string;
  includeStandardBodySlots?: boolean;
  enabledModules?: Partial<ModuleFlags>;
  attributes?: PersonalizedAttributeDraft[];
  resources?: PersonalizedResourceDraft[];
  rolledD20?: number | null;
  applyD20Bonus?: boolean;
}

/**
 * Builds a clean, system-agnostic personalized initial character sheet defined by the player
 * without relying on pre-built Fantasy or Sci-Fi preset templates.
 */
export function createPersonalizedCharacter(input: PersonalizedSheetInput): Character {
  const blankTpl = createBlankTemplate('Ficha Personalizada');
  if (input.includeStandardBodySlots) {
    blankTpl.equipmentSlots = createDefaultEquipmentSlots();
  }
  if (input.enabledModules) {
    blankTpl.enabledModules = {
      ...DEFAULT_MODULES,
      ...input.enabledModules,
    };
  }

  const char = createCharacterFromTemplate(blankTpl, input.name);
  char.templateId = 'custom_personalized';
  char.identity = {
    ...char.identity,
    name: input.name.trim() || 'Novo Personagem',
    characterClass: (input.characterClass || '').trim(),
    race: (input.race || '').trim(),
    title: (input.title || '').trim(),
    level: Math.max(1, Math.trunc(input.level || 1)),
    portraitImageId: input.portraitImageId,
  };

  const d20Bonus =
    input.applyD20Bonus && input.rolledD20 != null
      ? Math.max(1, Math.round(input.rolledD20 / 4))
      : 0;

  char.attributes = (input.attributes || [])
    .filter((a) => a.name.trim().length > 0)
    .map((a, idx) => {
      const cleanName = a.name.trim();
      const short =
        (a.shortName || '').trim().toUpperCase() ||
        cleanName.slice(0, 3).toUpperCase();
      const base = Math.trunc(Number(a.baseValue) || 0) + (idx === 0 ? d20Bonus : 0);
      return {
        id: createId('attr'),
        name: cleanName,
        shortName: short,
        category: (a.category || '').trim() || 'Geral',
        baseValue: base,
        permanentBonus: 0,
        tempBonus: 0,
        customSources: [],
        order: idx,
      };
    });

  const paletteCycle = ['#C94040', '#4B7FD6', '#D19A38', '#34A876', '#8A67C2'];
  char.resources = (input.resources || [])
    .filter((r) => r.name.trim().length > 0)
    .map((r, idx) => {
      const maxVal = Math.max(0, Math.trunc(Number(r.max) || 0));
      return {
        id: createId('res'),
        name: r.name.trim(),
        current: maxVal,
        max: maxVal,
        min: 0,
        tempBonus: 0,
        color: r.color || paletteCycle[idx % paletteCycle.length],
        icon: 'heart',
        order: idx,
      };
    });

  char.carryCapacity.linkedAttributeId = char.attributes[0]?.id;
  return char;
}

export function createTemplateFromCharacter(
  character: Character,
  templateName: string,
  description = ''
): SheetTemplate {
  const now = Date.now();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: createId('tpl'),
    name: templateName.trim() || `Modelo: ${character.identity.name}`,
    description: description || `Baseado na estrutura de ficha de ${character.identity.name}.`,
    isBlank: false,
    createdAt: now,
    updatedAt: now,
    enabledModules: { ...character.enabledModules },
    defaultIdentityLabels: {
      levelLabel: character.identity.levelLabel,
      xpLabel: character.identity.xpLabel,
      customFields: character.identity.customFields.map((f) => ({ ...f, value: '' })),
    },
    attributes: deepClone(character.attributes).map((a) => ({ ...a, tempBonus: 0 })),
    skills: deepClone(character.skills),
    knowledge: deepClone(character.knowledge || []),
    resources: deepClone(character.resources).map((r) => ({ ...r, current: r.max, tempBonus: 0 })),
    walletCurrencies: deepClone(character.wallet?.currencies || []).map((c) => ({ ...c, amount: 0 })),
    walletEnableConversion: character.wallet?.enableConversion ?? true,
    itemCategories: [...character.itemCategories],
    storageLocations: [...character.storageLocations],
    equipmentSlots: deepClone(character.equipmentSlots).map((s) => ({ ...s, equippedItems: [] })),
    abilityCategories: deepClone(character.abilityCategories),
    combatDefaults: {
      defaultTimingRules: { ...character.combat.defaultTimingRules },
      defaultInsufficientResourceRule: character.combat.defaultInsufficientResourceRule,
    },
  };
}

/**
 * Validates and migrates an imported character JSON object so older/partial exports load cleanly.
 */
export function migrateAndValidateCharacter(raw: unknown): {
  valid: boolean;
  character?: Character;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Arquivo JSON inválido: objeto esperado.' };
  }
  const obj = raw as Partial<Character>;
  if (!obj.identity || typeof obj.identity.name !== 'string') {
    return { valid: false, error: 'Ficha inválida: campo "identity.name" ausente.' };
  }

  const fallback = createCharacterFromTemplate(createBlankTemplate(), obj.identity.name);
  const rawOrder = Array.isArray(obj.identity.sectionOrder)
    ? obj.identity.sectionOrder
    : fallback.identity.sectionOrder;
  const withWalletOrder = rawOrder.includes('wallet')
    ? rawOrder
    : [...rawOrder.slice(0, 3), 'wallet', ...rawOrder.slice(3)];
  const migratedOrder = withWalletOrder.includes('knowledge')
    ? withWalletOrder
    : [...withWalletOrder, 'knowledge'];

  const migrated: Character = {
    ...fallback,
    ...obj,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: typeof obj.id === 'string' && obj.id ? obj.id : createId('char'),
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
    updatedAt: Date.now(),
    identity: {
      ...fallback.identity,
      ...obj.identity,
      customFields: Array.isArray(obj.identity.customFields) ? obj.identity.customFields : [],
      hiddenFields: Array.isArray(obj.identity.hiddenFields) ? obj.identity.hiddenFields : [],
      sectionOrder: migratedOrder,
    },
    enabledModules: { ...DEFAULT_MODULES, ...(obj.enabledModules || {}) },
    attributes: Array.isArray(obj.attributes) ? obj.attributes : [],
    skills: Array.isArray(obj.skills) ? obj.skills : [],
    knowledge: Array.isArray(obj.knowledge) ? obj.knowledge : [],
    resources: Array.isArray(obj.resources) ? obj.resources : [],
    wallet: obj.wallet
      ? {
          currencies: Array.isArray(obj.wallet.currencies) ? obj.wallet.currencies : [],
          enableConversion: obj.wallet.enableConversion ?? true,
          baseCurrencyId: obj.wallet.baseCurrencyId,
          autoConvertOverflow: Boolean(obj.wallet.autoConvertOverflow),
          history: Array.isArray(obj.wallet.history) ? obj.wallet.history : [],
        }
      : fallback.wallet,
    inventory: Array.isArray(obj.inventory)
      ? obj.inventory.map((item) => {
          const customFields = Array.isArray(item.customFields) ? item.customFields : [];
          const legacyDamage = customFields.find((cf) =>
            /^dano(\s+base|\s+atual)?$/i.test((cf.label || '').trim())
          );
          const damageText =
            typeof item.damageText === 'string' && item.damageText.trim()
              ? item.damageText
              : legacyDamage?.value || '';
          return {
            ...item,
            damageText,
            damageAttributeIds: Array.isArray(item.damageAttributeIds)
              ? item.damageAttributeIds
              : [],
            customFields,
          };
        })
      : [],
    storageLocations: Array.isArray(obj.storageLocations) ? obj.storageLocations : ['Mochila'],
    itemCategories: Array.isArray(obj.itemCategories) ? obj.itemCategories : ['Geral'],
    carryCapacity: obj.carryCapacity || fallback.carryCapacity,
    equipmentSlots: Array.isArray(obj.equipmentSlots) ? obj.equipmentSlots : [],
    abilityCategories: Array.isArray(obj.abilityCategories) ? obj.abilityCategories : [],
    abilities: Array.isArray(obj.abilities)
      ? obj.abilities.map((ab) => ({
          ...ab,
          damageAttributeIds: Array.isArray(ab.damageAttributeIds) ? ab.damageAttributeIds : [],
          copyConfig: ab.copyConfig
            ? {
                includeDescription: ab.copyConfig.includeDescription ?? true,
                includeEffect: ab.copyConfig.includeEffect ?? true,
                includeDamage: ab.copyConfig.includeDamage ?? true,
              }
            : undefined,
        }))
      : [],
    combat: {
      ...fallback.combat,
      ...(obj.combat || {}),
      history: Array.isArray(obj.combat?.history) ? obj.combat.history : [],
      undoStack: Array.isArray(obj.combat?.undoStack) ? obj.combat.undoStack : [],
      pendingConfirmations: Array.isArray(obj.combat?.pendingConfirmations)
        ? obj.combat.pendingConfirmations
        : [],
      warnings: Array.isArray(obj.combat?.warnings) ? obj.combat.warnings : [],
    },
    notes: Array.isArray(obj.notes) ? obj.notes : [],
    noteFolders: Array.isArray(obj.noteFolders) ? obj.noteFolders : fallback.noteFolders,
  };

  return { valid: true, character: migrated };
}
