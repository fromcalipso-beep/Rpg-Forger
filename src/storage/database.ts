import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import JSZip from 'jszip';
import { buildSeedData } from '../data/seedCharacters';
import {
  DataTransferMode,
  parseImportedSheetOrTemplateJson,
  prepareBackupPayload,
  stripCharacterDataForStructureExport,
  stripTemplateDataForStructureExport,
} from '../engine/exportEngine';
import { CURRENT_SCHEMA_VERSION, migrateAndValidateCharacter } from '../engine/templateEngine';
import {
  DEFAULT_CUSTOM_DARK_PALETTE,
  normalizeCustomPalette,
  normalizeThemeMode,
  THEME_DEFINITIONS,
} from '../engine/themeEngine';
import {
  AppSettings,
  Character,
  FullBackupPayload,
  ImageRecord,
  JournalNote,
  SheetTemplate,
} from '../types/rpg';
import { createId } from '../utils/id';

const DB_NAME = 'rpg_character_manager_db';
const DB_VERSION = 1;

const STORES = {
  CHARACTERS: 'characters',
  TEMPLATES: 'templates',
  GENERAL_NOTES: 'generalNotes',
  IMAGES: 'images',
  META: 'meta',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'pt-BR',
  theme: 'dark',
  accentColor: THEME_DEFINITIONS.dark.defaultAccent,
  customTheme: { ...DEFAULT_CUSTOM_DARK_PALETTE },
  editMode: true,
  density: 'comfortable',
  cardLayout: 'grid',
  decorativeEffects: true,
  activeCharacterId: null,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.CHARACTERS)) {
        db.createObjectStore(STORES.CHARACTERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.TEMPLATES)) {
        db.createObjectStore(STORES.TEMPLATES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.GENERAL_NOTES)) {
        db.createObjectStore(STORES.GENERAL_NOTES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.IMAGES)) {
        db.createObjectStore(STORES.IMAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []) as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbClear(storeName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function initializeDatabase(): Promise<{
  settings: AppSettings;
  characters: Character[];
  templates: SheetTemplate[];
  generalNotes: JournalNote[];
}> {
  const seededFlag = await idbGet<{ key: string; value: boolean }>(STORES.META, 'seeded');

  if (!seededFlag?.value) {
    const seed = buildSeedData();
    for (const tpl of seed.templates) {
      await idbPut(STORES.TEMPLATES, tpl);
    }
    for (const char of seed.characters) {
      await idbPut(STORES.CHARACTERS, char);
    }
    for (const note of seed.generalNotes) {
      await idbPut(STORES.GENERAL_NOTES, note);
    }
    const initialSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      activeCharacterId: seed.characters[0]?.id || null,
    };
    await idbPut(STORES.META, { key: 'settings', value: initialSettings });
    await idbPut(STORES.META, { key: 'schemaVersion', value: CURRENT_SCHEMA_VERSION });
    await idbPut(STORES.META, { key: 'seeded', value: true });
    await idbPut(STORES.META, { key: 'cleared_sample_fichas_v1', value: true });

    return {
      settings: initialSettings,
      characters: seed.characters,
      templates: seed.templates,
      generalNotes: seed.generalNotes,
    };
  }

  const clearedFlag = await idbGet<{ key: string; value: boolean }>(
    STORES.META,
    'cleared_sample_fichas_v1'
  );
  if (!clearedFlag?.value) {
    await Promise.all([
      idbDelete(STORES.CHARACTERS, 'char_kaelen_voss'),
      idbDelete(STORES.CHARACTERS, 'char_aldric_thorne'),
      idbDelete(STORES.GENERAL_NOTES, 'gnote_1'),
    ]);
    await idbPut(STORES.META, { key: 'cleared_sample_fichas_v1', value: true });
  }

  const [settingsRec, characters, templates, generalNotes] = await Promise.all([
    idbGet<{ key: string; value: AppSettings }>(STORES.META, 'settings'),
    idbGetAll<Character>(STORES.CHARACTERS),
    idbGetAll<SheetTemplate>(STORES.TEMPLATES),
    idbGetAll<JournalNote>(STORES.GENERAL_NOTES),
  ]);

  // Run schema migrations safely on loaded characters
  const migratedCharacters = characters.map((c) => {
    const res = migrateAndValidateCharacter(c);
    return res.valid && res.character ? res.character : c;
  });

  const rawTheme = settingsRec?.value?.theme;
  const resolvedTheme = normalizeThemeMode(rawTheme);
  const customTheme = normalizeCustomPalette(
    settingsRec?.value?.customTheme,
    DEFAULT_CUSTOM_DARK_PALETTE
  );
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(settingsRec?.value || {}),
    theme: resolvedTheme,
    customTheme,
    editMode:
      typeof settingsRec?.value?.editMode === 'boolean'
        ? settingsRec.value.editMode
        : true,
    accentColor:
      resolvedTheme === 'custom'
        ? customTheme.accent
        : rawTheme && rawTheme !== resolvedTheme
          ? THEME_DEFINITIONS[resolvedTheme].defaultAccent
          : settingsRec?.value?.accentColor || THEME_DEFINITIONS[resolvedTheme].defaultAccent,
  };

  if (
    !settings.activeCharacterId ||
    !migratedCharacters.some((c) => c.id === settings.activeCharacterId)
  ) {
    settings.activeCharacterId = migratedCharacters[0]?.id || null;
  }

  return {
    settings,
    characters: migratedCharacters.sort((a, b) => b.updatedAt - a.updatedAt),
    templates,
    generalNotes: generalNotes.sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await idbPut(STORES.META, { key: 'settings', value: settings });
}

export async function saveCharacter(character: Character): Promise<void> {
  await idbPut(STORES.CHARACTERS, {
    ...character,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: Date.now(),
  });
}

export async function deleteCharacterRecord(characterId: string): Promise<void> {
  await idbDelete(STORES.CHARACTERS, characterId);
}

export async function clearAllCharactersRecord(): Promise<void> {
  await idbClear(STORES.CHARACTERS);
}

export async function saveTemplate(template: SheetTemplate): Promise<void> {
  await idbPut(STORES.TEMPLATES, {
    ...template,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: Date.now(),
  });
}

export async function deleteTemplateRecord(templateId: string): Promise<void> {
  await idbDelete(STORES.TEMPLATES, templateId);
}

export async function saveGeneralNote(note: JournalNote): Promise<void> {
  await idbPut(STORES.GENERAL_NOTES, {
    ...note,
    updatedAt: Date.now(),
  });
}

export async function deleteGeneralNoteRecord(noteId: string): Promise<void> {
  await idbDelete(STORES.GENERAL_NOTES, noteId);
}

// --- Local Image Management (separated from JSON records) ---

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function persistNativeImageIfAndroid(record: ImageRecord): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const base64 = record.dataUrl.split(',')[1] || '';
    await Filesystem.mkdir({
      path: 'rpg_images',
      directory: Directory.Data,
      recursive: true,
    });
    await Filesystem.writeFile({
      path: `rpg_images/${record.id}`,
      data: base64,
      directory: Directory.Data,
    });
  } catch (err) {
    console.warn('Capacitor Filesystem image write skipped:', err);
  }
}

export async function saveImageFile(file: File): Promise<ImageRecord> {
  const dataUrl = await readFileAsDataUrl(file);
  const record: ImageRecord = {
    id: createId('img'),
    dataUrl,
    mimeType: file.type || 'image/png',
    fileName: file.name || 'imagem.png',
    sizeBytes: file.size,
    createdAt: Date.now(),
  };

  await idbPut(STORES.IMAGES, record);
  await persistNativeImageIfAndroid(record);
  return record;
}

export async function saveImageDataUrl(
  dataUrl: string,
  fileName = 'imagem_recortada.png',
  mimeType = 'image/png'
): Promise<ImageRecord> {
  const record: ImageRecord = {
    id: createId('img'),
    dataUrl,
    mimeType,
    fileName,
    sizeBytes: dataUrl.length,
    createdAt: Date.now(),
  };

  await idbPut(STORES.IMAGES, record);
  await persistNativeImageIfAndroid(record);
  return record;
}

export async function getImageRecord(imageId: string): Promise<ImageRecord | undefined> {
  const rec = await idbGet<ImageRecord>(STORES.IMAGES, imageId);
  if (rec) return rec;

  if (Capacitor.isNativePlatform()) {
    try {
      const file = await Filesystem.readFile({
        path: `rpg_images/${imageId}`,
        directory: Directory.Data,
      });
      if (typeof file.data === 'string') {
        return {
          id: imageId,
          dataUrl: `data:image/png;base64,${file.data}`,
          mimeType: 'image/png',
          fileName: `${imageId}.png`,
          sizeBytes: file.data.length,
          createdAt: Date.now(),
        };
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function deleteImageRecord(imageId: string): Promise<void> {
  await idbDelete(STORES.IMAGES, imageId);
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({
        path: `rpg_images/${imageId}`,
        directory: Directory.Data,
      });
    } catch {
      // ignore missing native file
    }
  }
}

// --- Export & Import (JSON & Full ZIP Backup with images) ---

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCharacterAsJson(
  character: Character,
  options: { includeData?: boolean } = {}
): string {
  const includeData = options.includeData ?? true;
  const payload = includeData
    ? character
    : stripCharacterDataForStructureExport(character);
  const safeName = (character.identity.name || 'personagem')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const suffix = includeData ? 'ficha' : 'estrutura_sem_dados';
  triggerDownload(blob, `${safeName}_${suffix}.json`);
  return json;
}

export function exportTemplateAsJson(template: SheetTemplate): string {
  const clean = stripTemplateDataForStructureExport(template);
  const safeName = (template.name || 'modelo')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');
  const json = JSON.stringify(clean, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, `${safeName}_estrutura_sem_dados.json`);
  return json;
}

export async function importCharacterFromJsonText(
  jsonText: string,
  mode: DataTransferMode = 'with_data'
): Promise<{
  valid: boolean;
  character?: Character;
  template?: SheetTemplate;
  error?: string;
}> {
  const parsed = parseImportedSheetOrTemplateJson(jsonText, mode);
  if (!parsed.valid) {
    return { valid: false, error: parsed.error };
  }
  if (parsed.kind === 'template') {
    await saveTemplate(parsed.template);
    await saveCharacter(parsed.blankCharacter);
    return {
      valid: true,
      character: parsed.blankCharacter,
      template: parsed.template,
    };
  }
  await saveCharacter(parsed.character);
  return { valid: true, character: parsed.character };
}

export async function exportFullBackupZip(
  options: { includeData?: boolean } = {}
): Promise<void> {
  const includeData = options.includeData ?? true;
  const [settingsRec, characters, templates, generalNotes, images] = await Promise.all([
    idbGet<{ key: string; value: AppSettings }>(STORES.META, 'settings'),
    idbGetAll<Character>(STORES.CHARACTERS),
    idbGetAll<SheetTemplate>(STORES.TEMPLATES),
    idbGetAll<JournalNote>(STORES.GENERAL_NOTES),
    idbGetAll<ImageRecord>(STORES.IMAGES),
  ]);

  const zip = new JSZip();
  const imageManifest: FullBackupPayload['imageManifest'] = {};

  if (includeData) {
    const imagesFolder = zip.folder('images');
    for (const img of images) {
      imageManifest[img.id] = { mimeType: img.mimeType, fileName: img.fileName };
      const base64 = img.dataUrl.split(',')[1];
      if (base64 && imagesFolder) {
        imagesFolder.file(img.id, base64, { base64: true });
      }
    }
  }

  const payload = prepareBackupPayload(
    {
      settings: settingsRec?.value || DEFAULT_SETTINGS,
      characters,
      templates,
      generalNotes,
      imageManifest,
    },
    includeData
  );

  zip.file('backup.json', JSON.stringify(payload, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = includeData
    ? `rpg_character_manager_backup_${dateStamp}.zip`
    : `rpg_character_manager_estrutura_sem_dados_${dateStamp}.zip`;
  triggerDownload(blob, filename);
}

export async function restoreFullBackupZip(
  file: File,
  options: { mode?: DataTransferMode } = {}
): Promise<{
  success: boolean;
  error?: string;
  stats?: {
    characters: number;
    templates: number;
    images: number;
    mode: DataTransferMode;
  };
}> {
  try {
    const zip = await JSZip.loadAsync(file);
    const backupFile = zip.file('backup.json');
    if (!backupFile) {
      return { success: false, error: 'Arquivo de backup inválido: backup.json não encontrado.' };
    }

    const rawText = await backupFile.async('string');
    const payload = JSON.parse(rawText) as Partial<FullBackupPayload>;

    if (!Array.isArray(payload.characters)) {
      return { success: false, error: 'Backup inválido: lista de personagens ausente.' };
    }

    const effectiveMode: DataTransferMode =
      options.mode === 'without_data' || payload.exportMode === 'without_data'
        ? 'without_data'
        : 'with_data';

    const restoredTheme = normalizeThemeMode(payload.settings?.theme);
    const restoredCustom = normalizeCustomPalette(
      payload.settings?.customTheme,
      DEFAULT_CUSTOM_DARK_PALETTE
    );

    if (effectiveMode === 'without_data') {
      const existingChars = await idbGetAll<Character>(STORES.CHARACTERS);
      const cleanTemplates = (payload.templates || []).map((t) => ({
        ...stripTemplateDataForStructureExport(t),
        id: createId('tpl'),
      }));
      for (const t of cleanTemplates) {
        await idbPut(STORES.TEMPLATES, t);
      }

      const nextSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...(payload.settings || {}),
        theme: restoredTheme,
        customTheme: restoredCustom,
        editMode: Boolean(payload.settings?.editMode),
        accentColor:
          restoredTheme === 'custom'
            ? restoredCustom.accent
            : payload.settings?.theme && payload.settings.theme !== restoredTheme
              ? THEME_DEFINITIONS[restoredTheme].defaultAccent
              : payload.settings?.accentColor || THEME_DEFINITIONS[restoredTheme].defaultAccent,
        activeCharacterId: existingChars[0]?.id || null,
      };
      await saveSettings(nextSettings);
      await idbPut(STORES.META, { key: 'seeded', value: true });

      return {
        success: true,
        stats: {
          characters: 0,
          templates: cleanTemplates.length,
          images: 0,
          mode: 'without_data',
        },
      };
    }

    const validatedChars: Character[] = [];
    for (const c of payload.characters) {
      const res = migrateAndValidateCharacter(c);
      if (res.valid && res.character) {
        validatedChars.push(res.character);
      }
    }

    await Promise.all([
      idbClear(STORES.CHARACTERS),
      idbClear(STORES.TEMPLATES),
      idbClear(STORES.GENERAL_NOTES),
      idbClear(STORES.IMAGES),
    ]);

    for (const c of validatedChars) {
      await idbPut(STORES.CHARACTERS, c);
    }
    for (const t of payload.templates || []) {
      await idbPut(STORES.TEMPLATES, t);
    }
    for (const n of payload.generalNotes || []) {
      await idbPut(STORES.GENERAL_NOTES, n);
    }

    let restoredImages = 0;
    const manifest = payload.imageManifest || {};
    for (const [imgId, meta] of Object.entries(manifest)) {
      const imgEntry = zip.file(`images/${imgId}`);
      if (!imgEntry) continue;
      const base64 = await imgEntry.async('base64');
      const record: ImageRecord = {
        id: imgId,
        dataUrl: `data:${meta.mimeType || 'image/png'};base64,${base64}`,
        mimeType: meta.mimeType || 'image/png',
        fileName: meta.fileName || `${imgId}.png`,
        sizeBytes: base64.length,
        createdAt: Date.now(),
      };
      await idbPut(STORES.IMAGES, record);
      await persistNativeImageIfAndroid(record);
      restoredImages++;
    }

    const nextSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...(payload.settings || {}),
      theme: restoredTheme,
      customTheme: restoredCustom,
      editMode: Boolean(payload.settings?.editMode),
      accentColor:
        restoredTheme === 'custom'
          ? restoredCustom.accent
          : payload.settings?.theme && payload.settings.theme !== restoredTheme
            ? THEME_DEFINITIONS[restoredTheme].defaultAccent
            : payload.settings?.accentColor || THEME_DEFINITIONS[restoredTheme].defaultAccent,
      activeCharacterId: validatedChars[0]?.id || null,
    };
    await saveSettings(nextSettings);
    await idbPut(STORES.META, { key: 'seeded', value: true });

    return {
      success: true,
      stats: {
        characters: validatedChars.length,
        templates: (payload.templates || []).length,
        images: restoredImages,
        mode: 'with_data',
      },
    };
  } catch {
    return {
      success: false,
      error: 'Falha ao restaurar o arquivo ZIP de backup. Verifique se o arquivo está íntegro.',
    };
  }
}
