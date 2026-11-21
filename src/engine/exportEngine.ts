import {
  AppSettings,
  Character,
  FullBackupPayload,
  JournalNote,
  SheetTemplate,
} from '../types/rpg';
import { createId, deepClone } from '../utils/id';
import {
  createCharacterFromTemplate,
  CURRENT_SCHEMA_VERSION,
  migrateAndValidateCharacter,
} from './templateEngine';

export type DataTransferMode = 'with_data' | 'without_data';

/**
 * Strips all campaign/personal data (stats, XP, balances, items, notes, combat history, images)
 * from a character sheet while preserving its full structural schema (attributes, skills,
 * resources, wallet currencies, slots, categories, modules, and custom fields).
 */
export function stripCharacterDataForStructureExport(character: Character): Character {
  const clean = deepClone(character);
  const now = Date.now();

  clean.id = createId('char');
  clean.createdAt = now;
  clean.updatedAt = now;

  clean.identity = {
    ...clean.identity,
    name: '',
    portraitImageId: undefined,
    defaultPortraitUrl: undefined,
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
    customFields: (clean.identity.customFields || []).map((f) => ({
      ...f,
      value: '',
    })),
  };

  clean.attributes = (clean.attributes || []).map((attr) => ({
    ...attr,
    baseValue: 0,
    permanentBonus: 0,
    tempBonus: 0,
    customSources: [],
  }));

  clean.skills = (clean.skills || []).map((skill) => ({
    ...skill,
    baseValue: 0,
    bonus: 0,
    notes: '',
  }));

  clean.knowledge = [];

  clean.resources = (clean.resources || []).map((res) => ({
    ...res,
    current: 0,
    max: 0,
    tempBonus: 0,
    imageId: undefined,
  }));

  clean.wallet = {
    ...clean.wallet,
    currencies: (clean.wallet?.currencies || []).map((cur) => ({
      ...cur,
      amount: 0,
      imageId: undefined,
    })),
    history: [],
  };

  clean.inventory = [];
  clean.equipmentSlots = (clean.equipmentSlots || []).map((slot) => ({
    ...slot,
    equippedItems: [],
  }));

  clean.abilityCategories = (clean.abilityCategories || []).map((cat) => ({
    ...cat,
    imageId: undefined,
  }));
  clean.abilities = [];

  clean.combat = {
    ...clean.combat,
    round: 1,
    turn: 1,
    history: [],
    undoStack: [],
    pendingConfirmations: [],
    warnings: [],
  };

  clean.notes = [];

  return clean;
}

/**
 * Strips personal/campaign data from a SheetTemplate when exporting structure-only files.
 */
export function stripTemplateDataForStructureExport(template: SheetTemplate): SheetTemplate {
  const clean = deepClone(template);
  clean.updatedAt = Date.now();
  clean.defaultIdentityLabels = {
    ...clean.defaultIdentityLabels,
    customFields: (clean.defaultIdentityLabels?.customFields || []).map((f) => ({
      ...f,
      value: '',
    })),
  };
  clean.knowledge = [];
  clean.walletCurrencies = (clean.walletCurrencies || []).map((cur) => ({
    ...cur,
    amount: 0,
    imageId: undefined,
  }));
  clean.equipmentSlots = (clean.equipmentSlots || []).map((slot) => ({
    ...slot,
    equippedItems: [],
  }));
  clean.abilityCategories = (clean.abilityCategories || []).map((cat) => ({
    ...cat,
    imageId: undefined,
  }));
  clean.resources = (clean.resources || []).map((r) => ({
    ...r,
    imageId: undefined,
  }));
  return clean;
}

/**
 * Prepares a backup payload either with all campaign/character/image data
 * or without data (theme/settings + clean reusable templates only).
 */
export function prepareBackupPayload(
  input: {
    settings: AppSettings;
    characters: Character[];
    templates: SheetTemplate[];
    generalNotes: JournalNote[];
    imageManifest: FullBackupPayload['imageManifest'];
  },
  includeData: boolean
): FullBackupPayload {
  if (includeData) {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: Date.now(),
      appName: 'RPG Character Manager',
      exportMode: 'with_data',
      settings: deepClone(input.settings),
      characters: deepClone(input.characters),
      templates: deepClone(input.templates),
      generalNotes: deepClone(input.generalNotes),
      imageManifest: deepClone(input.imageManifest),
    };
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    appName: 'RPG Character Manager',
    exportMode: 'without_data',
    settings: {
      ...deepClone(input.settings),
      activeCharacterId: null,
    },
    characters: [],
    templates: (input.templates || []).map(stripTemplateDataForStructureExport),
    generalNotes: [],
    imageManifest: {},
  };
}

function isLikelySheetTemplate(raw: Record<string, unknown>): boolean {
  return (
    !raw.identity &&
    Array.isArray(raw.attributes) &&
    Array.isArray(raw.equipmentSlots) &&
    typeof raw.name === 'string'
  );
}

export type ParsedJsonImportResult =
  | {
      valid: true;
      kind: 'character';
      character: Character;
    }
  | {
      valid: true;
      kind: 'template';
      template: SheetTemplate;
      blankCharacter: Character;
    }
  | {
      valid: false;
      error: string;
    };

/**
 * Parses an imported JSON file (character sheet with/without data, or template JSON)
 * honoring the user's chosen DataTransferMode ('with_data' | 'without_data').
 */
export function parseImportedSheetOrTemplateJson(
  jsonText: string,
  mode: DataTransferMode = 'with_data'
): ParsedJsonImportResult {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Arquivo JSON inválido: objeto esperado.' };
    }

    // Template JSON structure (no identity block)
    if (isLikelySheetTemplate(parsed)) {
      const rawTpl = parsed as unknown as SheetTemplate;
      const cleanTpl =
        mode === 'without_data'
          ? stripTemplateDataForStructureExport(rawTpl)
          : deepClone(rawTpl);
      const tplWithId: SheetTemplate = {
        ...cleanTpl,
        id: createId('tpl'),
        updatedAt: Date.now(),
      };
      const blankChar = createCharacterFromTemplate(tplWithId, tplWithId.name || 'Nova Ficha');
      return {
        valid: true,
        kind: 'template',
        template: tplWithId,
        blankCharacter:
          mode === 'without_data'
            ? {
                ...stripCharacterDataForStructureExport(blankChar),
                identity: {
                  ...stripCharacterDataForStructureExport(blankChar).identity,
                  name: tplWithId.name || 'Ficha em Branco',
                },
              }
            : blankChar,
      };
    }

    // Character JSON (populated or structure-only)
    const validated = migrateAndValidateCharacter(parsed);
    if (!validated.valid || !validated.character) {
      return {
        valid: false,
        error: validated.error || 'Estrutura de ficha inválida.',
      };
    }

    if (mode === 'without_data') {
      const stripped = stripCharacterDataForStructureExport(validated.character);
      stripped.identity.name =
        validated.character.identity.name.trim()
          ? `${validated.character.identity.name.trim()} (Estrutura)`
          : 'Ficha em Branco';
      return {
        valid: true,
        kind: 'character',
        character: stripped,
      };
    }

    const imported: Character = {
      ...validated.character,
      id: createId('char'),
      identity: {
        ...validated.character.identity,
        name: validated.character.identity.name.trim() || 'Ficha Importada',
      },
      updatedAt: Date.now(),
    };
    return {
      valid: true,
      kind: 'character',
      character: imported,
    };
  } catch {
    return { valid: false, error: 'Não foi possível interpretar o arquivo JSON.' };
  }
}
