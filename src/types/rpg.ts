export type AppLanguage = 'pt-BR' | 'en-US';
export type ThemeMode = 'light' | 'dark' | 'custom';
export type DisplayDensity = 'comfortable' | 'compact';
export type CardLayoutMode = 'grid' | 'list';

export interface CustomThemePalette {
  canvas: string;
  sidebar: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  accent: string;
}

export interface AppSettings {
  language: AppLanguage;
  theme: ThemeMode;
  accentColor: string;
  customTheme: CustomThemePalette;
  editMode: boolean;
  density: DisplayDensity;
  cardLayout: CardLayoutMode;
  decorativeEffects: boolean;
  activeCharacterId: string | null;
}

export interface ImageRecord {
  id: string;
  dataUrl: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  createdAt: number;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
  category?: string;
}

export interface InfoSectionConfig {
  id: string;
  title: string;
  fields: string[]; // field keys or custom field IDs
}

export interface ModuleFlags {
  attributes: boolean;
  skills: boolean;
  knowledge: boolean;
  resources: boolean;
  wallet: boolean;
  inventory: boolean;
  equipment: boolean;
  abilities: boolean;
  combat: boolean;
  notes: boolean;
  progression: boolean;
}

export interface ModifierSource {
  id: string;
  label: string;
  value: number;
}

export interface AttributeDef {
  id: string;
  name: string;
  shortName: string;
  category: string;
  baseValue: number;
  permanentBonus: number;
  tempBonus: number;
  customSources: ModifierSource[];
  description?: string;
  order: number;
}

export interface SkillDef {
  id: string;
  name: string;
  category: string;
  linkedAttributeId?: string;
  baseValue: number;
  proficiencyLabel: string;
  bonus: number;
  notes?: string;
}

export type KnowledgeKind = 'book' | 'shell' | 'lore' | 'language' | 'recipe' | 'study' | 'other';

export interface KnowledgeEntry {
  id: string;
  title: string;
  kind: KnowledgeKind | string;
  source?: string;
  summary: string;
  details: string;
  progress: string;
  learnedAt?: string;
  imageId?: string;
  createdAt: number;
}

export interface ResourceDef {
  id: string;
  name: string;
  current: number;
  max: number;
  min: number;
  tempBonus: number;
  color: string;
  icon: string;
  imageId?: string;
  allowNegative?: boolean;
  order: number;
}

export interface ItemModifier {
  attributeId: string;
  attributeName?: string;
  value: number;
}

export interface ResourceModifier {
  resourceId: string;
  resourceName?: string;
  maxBonus: number;
}

export interface CurrencyDef {
  id: string;
  name: string;
  symbol: string;
  amount: number;
  exchangeRate: number; // Value of 1 unit relative to base (e.g. 1, 0.1, 0.01). 0 = independent (no conversion).
  color: string;
  imageId?: string;
  order: number;
}

export interface WalletLogEntry {
  id: string;
  timestamp: number;
  summary: string;
}

export interface WalletState {
  currencies: CurrencyDef[];
  enableConversion: boolean;
  baseCurrencyId?: string;
  autoConvertOverflow: boolean;
  history: WalletLogEntry[];
}

export type ItemRarity = 'comum' | 'incomum' | 'raro' | 'epico' | 'lendario' | 'unico';

export interface InventoryItem {
  id: string;
  name: string;
  imageId?: string;
  defaultImageUrl?: string;
  description: string;
  category: string;
  subcategory: string;
  storageLocation: string;
  quantity: number;
  weight: number;
  monetaryValue: number;
  currencyUnit: string;
  rarity: ItemRarity | string;
  equippable: boolean;
  compatibleSlotTypes: string[];
  twoHanded: boolean;
  requiredSlotsCount: number;
  attributeModifiers: ItemModifier[];
  resourceModifiers: ResourceModifier[];
  effectsText: string;
  damageText?: string;
  damageAttributeIds?: string[];
  notes: string;
  customFields: CustomField[];
}

export type BodyRegion =
  | 'head'
  | 'face'
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'back'
  | 'leftArm'
  | 'rightArm'
  | 'leftHand'
  | 'rightHand'
  | 'gloves'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'rings'
  | 'earrings'
  | 'amulets'
  | 'custom';

export interface EquippedSlotEntry {
  itemId: string;
  linkedGroupId?: string; // connects multi-slot items like two-handed weapons
}

export interface EquipmentSlot {
  id: string;
  name: string;
  slotType: string;
  region: BodyRegion;
  capacity: number;
  equippedItems: EquippedSlotEntry[];
  order: number;
}

export interface AbilityCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  imageId?: string;
  description?: string;
  order: number;
}

export type AbilityType =
  | 'instant'
  | 'fixed_duration'
  | 'toggleable'
  | 'sustained'
  | 'passive'
  | 'unlimited';

export type CooldownStartCondition = 'on_activate' | 'on_deactivate';
export type TurnPhase = 'turn_start' | 'turn_end';
export type InsufficientResourceRule =
  | 'auto_deactivate'
  | 'keep_and_warn'
  | 'manual_confirm';

export interface ResourceCost {
  resourceId: string;
  amount: number;
}

export interface AbilityTimingRules {
  processRecurringAt: TurnPhase;
  processDurationAt: TurnPhase;
  processCooldownAt: TurnPhase;
}

export type AbilityRole = 'damage' | 'turn_dice' | 'immediate' | 'fixed' | 'effect';

export interface AbilityCopyConfig {
  includeDescription: boolean;
  includeEffect: boolean;
  includeDamage: boolean;
}

export interface Ability {
  id: string;
  name: string;
  imageId?: string;
  defaultImageUrl?: string;
  categoryId: string;
  abilityRole?: AbilityRole;
  subcategory: string;
  level: number;
  description: string;
  abilityType: AbilityType;
  requirements: string;
  initialCosts: ResourceCost[];
  recurringCosts: ResourceCost[];
  durationTurns: number;
  cooldownTurns: number;
  cooldownStartCondition: CooldownStartCondition;
  effectsText: string;
  damageText: string;
  damageAttributeIds?: string[];
  turnDiceText?: string;
  copyConfig?: AbilityCopyConfig;
  attributeModifiers: ItemModifier[];
  resourceModifiers: ResourceModifier[];
  customFields: CustomField[];
  isActive: boolean;
  remainingDuration: number;
  remainingCooldown: number;
  timingRules: AbilityTimingRules;
  insufficientResourceRule: InsufficientResourceRule;
}

export interface CombatLogEntry {
  id: string;
  round: number;
  turn: number;
  timestamp: number;
  type: 'activate' | 'deactivate' | 'turn' | 'round' | 'warning' | 'resource' | 'undo' | 'reset';
  message: string;
}

export interface PendingAbilityConfirmation {
  abilityId: string;
  abilityName: string;
  missingResources: string[];
}

export interface CombatSnapshot {
  id: string;
  round: number;
  turn: number;
  resources: ResourceDef[];
  abilities: Ability[];
  history: CombatLogEntry[];
}

export interface CombatState {
  round: number;
  turn: number;
  defaultTimingRules: AbilityTimingRules;
  defaultInsufficientResourceRule: InsufficientResourceRule;
  history: CombatLogEntry[];
  undoStack: CombatSnapshot[];
  pendingConfirmations: PendingAbilityConfirmation[];
  warnings: string[];
}

export type NoteCategory = 'missao' | 'npc' | 'local' | 'sessao' | 'pessoal' | 'geral';

export interface JournalNote {
  id: string;
  title: string;
  folder: string;
  category: NoteCategory | string;
  content: string;
  imageIds: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterIdentity {
  name: string;
  portraitImageId?: string;
  defaultPortraitUrl?: string;
  race: string;
  subrace: string;
  characterClass: string;
  subclass: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  profession: string;
  title: string;
  affiliation: string;
  background: string;
  biography: string;
  level: number;
  currentXp: number;
  nextLevelXp: number;
  levelLabel: string;
  xpLabel: string;
  customFields: CustomField[];
  hiddenFields: string[];
  sectionOrder: string[];
}

export interface Character {
  schemaVersion: number;
  id: string;
  templateId?: string;
  createdAt: number;
  updatedAt: number;
  identity: CharacterIdentity;
  enabledModules: ModuleFlags;
  attributes: AttributeDef[];
  skills: SkillDef[];
  knowledge: KnowledgeEntry[];
  resources: ResourceDef[];
  wallet: WalletState;
  inventory: InventoryItem[];
  storageLocations: string[];
  itemCategories: string[];
  carryCapacity: {
    enabled: boolean;
    maxWeight: number;
    linkedAttributeId?: string;
    multiplier: number;
  };
  equipmentSlots: EquipmentSlot[];
  abilityCategories: AbilityCategory[];
  abilities: Ability[];
  combat: CombatState;
  notes: JournalNote[];
  noteFolders: string[];
}

export interface SheetTemplate {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  isBlank: boolean;
  createdAt: number;
  updatedAt: number;
  enabledModules: ModuleFlags;
  defaultIdentityLabels: {
    levelLabel: string;
    xpLabel: string;
    customFields: CustomField[];
  };
  attributes: AttributeDef[];
  skills: SkillDef[];
  knowledge?: KnowledgeEntry[];
  resources: ResourceDef[];
  walletCurrencies: CurrencyDef[];
  walletEnableConversion: boolean;
  itemCategories: string[];
  storageLocations: string[];
  equipmentSlots: EquipmentSlot[];
  abilityCategories: AbilityCategory[];
  combatDefaults: {
    defaultTimingRules: AbilityTimingRules;
    defaultInsufficientResourceRule: InsufficientResourceRule;
  };
}

export interface FullBackupPayload {
  schemaVersion: number;
  exportedAt: number;
  appName: string;
  exportMode?: 'with_data' | 'without_data';
  settings: AppSettings;
  characters: Character[];
  templates: SheetTemplate[];
  generalNotes: JournalNote[];
  imageManifest: Record<string, { mimeType: string; fileName: string }>;
}
