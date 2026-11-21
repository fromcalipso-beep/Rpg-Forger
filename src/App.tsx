import React, { useCallback, useEffect, useState } from 'react';
import {
  Backpack,
  BookMarked,
  BookOpen,
  Check,
  Compass,
  Flame,
  Pencil,
  Plus,
  ScrollText,
  Settings,
  Shield,
  Upload,
  Users,
} from 'lucide-react';
import { CharacterManagerModal } from './components/characters/CharacterManagerModal';
import { AbilitiesCombatView } from './components/combat/AbilitiesCombatView';
import { EquipmentView } from './components/equipment/EquipmentView';
import { InventoryView } from './components/inventory/InventoryView';
import { JournalView } from './components/notes/JournalView';
import { SettingsTemplatesView } from './components/settings/SettingsTemplatesView';
import {
  ConfirmModal,
  ConfirmState,
  ToastContainer,
  ToastMessage,
} from './components/shared/ConfirmModal';
import { ImageSlot } from './components/shared/ImageSlot';
import { CharacterSheetView } from './components/sheet/CharacterSheetView';
import { KnowledgeSection } from './components/sheet/KnowledgeSection';
import {
  StartAdventureView,
  StartCreateCharacterPayload,
} from './components/start/StartAdventureView';
import { DataTransferMode } from './engine/exportEngine';
import {
  createBlankTemplate,
  createCharacterFromTemplate,
  createPersonalizedCharacter,
} from './engine/templateEngine';
import {
  computeThemeRuntime,
  normalizeThemeMode,
} from './engine/themeEngine';
import {
  clearAllCharactersRecord,
  DEFAULT_SETTINGS,
  deleteCharacterRecord,
  deleteGeneralNoteRecord,
  deleteTemplateRecord,
  importCharacterFromJsonText,
  initializeDatabase,
  restoreFullBackupZip,
  saveCharacter,
  saveGeneralNote,
  saveSettings,
  saveTemplate,
} from './storage/database';
import {
  AppSettings,
  Character,
  JournalNote,
  SheetTemplate,
} from './types/rpg';
import { createId, deepClone } from './utils/id';

type AppTab = 'sheet' | 'inventory' | 'equipment' | 'combat' | 'knowledge' | 'notes' | 'settings';

const NAV_ITEMS: Array<{
  id: AppTab;
  label: string;
  mobileLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'sheet', label: 'Ficha Geral', mobileLabel: 'Ficha', icon: ScrollText },
  { id: 'inventory', label: 'Mochila', mobileLabel: 'Mochila', icon: Backpack },
  { id: 'equipment', label: 'Equipamento Corporal', mobileLabel: 'Corpo', icon: Shield },
  { id: 'combat', label: 'Habilidades & Combate', mobileLabel: 'Combate', icon: Flame },
  { id: 'knowledge', label: 'Livros & Conchas', mobileLabel: 'Livros', icon: BookMarked },
  { id: 'notes', label: 'Diário & Notas', mobileLabel: 'Diário', icon: BookOpen },
  { id: 'settings', label: 'Modelos & Ajustes', mobileLabel: 'Ajustes', icon: Settings },
];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('sheet');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [templates, setTemplates] = useState<SheetTemplate[]>([]);
  const [generalNotes, setGeneralNotes] = useState<JournalNote[]>([]);
  const [charModalOpen, setCharModalOpen] = useState(false);
  const [showStartPage, setShowStartPage] = useState(false);
  const [quickCharName, setQuickCharName] = useState('');
  const [quickImportMode, setQuickImportMode] = useState<DataTransferMode>('with_data');
  const quickImportRef = React.useRef<HTMLInputElement>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const notify = useCallback((kind: ToastMessage['kind'], text: string) => {
    const id = createId('toast');
    setToasts((prev) => [...prev.slice(-1), { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const loadFromDatabase = useCallback(async (isInitial = false) => {
    const data = await initializeDatabase();
    setSettings(data.settings);
    setCharacters(data.characters);
    setTemplates(data.templates);
    setGeneralNotes(data.generalNotes);
    if (isInitial) {
      const params =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : null;
      const autostart = params?.get('autostart') === '1';
      setShowStartPage(!autostart && data.characters.length === 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFromDatabase(true);
  }, [loadFromDatabase]);

  // Sync theme, custom color pattern, and primary accent color to documentElement
  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme = normalizeThemeMode(settings.theme);
    const runtime = computeThemeRuntime(
      resolvedTheme,
      settings.accentColor,
      settings.customTheme
    );

    const dynamicVarKeys = [
      '--bg-canvas',
      '--bg-sidebar',
      '--bg-header',
      '--bg-surface',
      '--bg-elevated',
      '--bg-hover',
      '--bg-track',
      '--border-subtle',
      '--border-strong',
      '--text-primary',
      '--text-secondary',
      '--text-muted',
      '--accent-color',
      '--accent-strong',
      '--accent-contrast',
      '--accent-soft',
      '--accent-border',
      '--silhouette-fill',
      '--toast-info-bg',
      '--toast-info-border',
      '--toast-info-text',
    ];
    for (const key of dynamicVarKeys) {
      root.style.removeProperty(key);
    }

    root.setAttribute('data-theme', resolvedTheme);
    root.classList.toggle('dark', runtime.isDark);
    root.style.colorScheme = runtime.isDark ? 'dark' : 'light';

    for (const [key, value] of Object.entries(runtime.cssVariables)) {
      root.style.setProperty(key, value);
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', runtime.metaThemeColor);
    }
  }, [settings.theme, settings.accentColor, settings.customTheme]);

  const activeCharacter =
    characters.find((c) => c.id === settings.activeCharacterId) || characters[0] || null;

  const handleUpdateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleUpdateCharacter = useCallback((next: Character) => {
    setCharacters((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    saveCharacter(next);
  }, []);

  const handleSelectCharacter = useCallback(
    (id: string) => {
      handleUpdateSettings({ ...settings, activeCharacterId: id });
    },
    [settings, handleUpdateSettings]
  );

  const handleCreateCharacter = useCallback(
    (name: string, templateId: string) => {
      const tpl =
        templates.find((t) => t.id === templateId) ||
        templates[0] ||
        createBlankTemplate('Modelo Padrão');
      const created = createCharacterFromTemplate(tpl, name);
      setCharacters((prev) => [created, ...prev]);
      saveCharacter(created);
      handleUpdateSettings({ ...settings, activeCharacterId: created.id });
      setShowStartPage(false);
      setActiveTab('sheet');
      notify('success', `Personagem "${created.identity.name}" criado.`);
    },
    [templates, settings, handleUpdateSettings, notify]
  );

  const handleCreatePersonalizedQuick = useCallback(
    (name: string) => {
      const created = createPersonalizedCharacter({
        name,
        includeStandardBodySlots: true,
      });
      setCharacters((prev) => [created, ...prev]);
      saveCharacter(created);
      handleUpdateSettings({ ...settings, activeCharacterId: created.id });
      setShowStartPage(false);
      setActiveTab('sheet');
      notify('success', `Ficha personalizada "${created.identity.name}" criada.`);
    },
    [settings, handleUpdateSettings, notify]
  );

  const handleCreateCharacterFromStart = useCallback(
    (payload: StartCreateCharacterPayload) => {
      const created = createPersonalizedCharacter(payload);
      setCharacters((prev) => [created, ...prev]);
      saveCharacter(created);
      handleUpdateSettings({ ...settings, activeCharacterId: created.id });
      setShowStartPage(false);
      setActiveTab('sheet');
      notify(
        'success',
        payload.rolledD20
          ? `Aventura iniciada com "${created.identity.name}" (d20: ${payload.rolledD20}).`
          : `Ficha personalizada "${created.identity.name}" criada.`
      );
    },
    [settings, handleUpdateSettings, notify]
  );

  const handleDuplicateCharacter = useCallback(
    (id: string) => {
      const source = characters.find((c) => c.id === id);
      if (!source) return;
      const copy = deepClone(source);
      copy.id = createId('char');
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      copy.identity.name = `${source.identity.name} (Cópia)`;
      setCharacters((prev) => [copy, ...prev]);
      saveCharacter(copy);
      handleUpdateSettings({ ...settings, activeCharacterId: copy.id });
      notify('info', `Ficha duplicada para "${copy.identity.name}".`);
    },
    [characters, settings, handleUpdateSettings, notify]
  );

  const openConfirmDelete = useCallback(
    (title: string, message: string, onConfirm: () => void) => {
      setConfirmState({
        open: true,
        title,
        message,
        confirmLabel: 'Excluir',
        destructive: true,
        onConfirm,
      });
    },
    []
  );

  const handleDeleteCharacter = useCallback(
    (id: string, name: string) => {
      openConfirmDelete(
        'Excluir Personagem',
        `Tem certeza que deseja excluir permanentemente a ficha de "${name}"? Esta ação não pode ser desfeita.`,
        () => {
          const remaining = characters.filter((c) => c.id !== id);
          setCharacters(remaining);
          deleteCharacterRecord(id);
          if (settings.activeCharacterId === id) {
            handleUpdateSettings({
              ...settings,
              activeCharacterId: remaining[0]?.id || null,
            });
          }
          notify('info', `Personagem "${name}" excluído.`);
        }
      );
    },
    [characters, settings, handleUpdateSettings, openConfirmDelete, notify]
  );

  const handleClearAllCharacters = useCallback(() => {
    openConfirmDelete(
      'Limpar Todas as Fichas',
      'Deseja remover todas as fichas de personagem salvas localmente? Modelos reutilizáveis serão mantidos.',
      () => {
        setCharacters([]);
        clearAllCharactersRecord();
        handleUpdateSettings({ ...settings, activeCharacterId: null });
        setCharModalOpen(false);
        setShowStartPage(true);
        notify('info', 'Todas as fichas foram removidas.');
      }
    );
  }, [settings, handleUpdateSettings, openConfirmDelete, notify]);

  const handleImportCharacterJson = useCallback(
    async (file: File, mode: DataTransferMode = 'with_data') => {
      const text = await file.text();
      const res = await importCharacterFromJsonText(text, mode);
      if (!res.valid || !res.character) {
        notify('error', res.error || 'Não foi possível importar o arquivo JSON.');
        return;
      }
      if (res.template) {
        setTemplates((prev) => [res.template!, ...prev]);
      }
      setCharacters((prev) => [res.character!, ...prev]);
      handleUpdateSettings({ ...settings, activeCharacterId: res.character.id });
      setShowStartPage(false);
      setActiveTab('sheet');
      notify(
        'success',
        mode === 'without_data'
          ? `Estrutura "${res.character.identity.name}" importada sem dados.`
          : `Personagem "${res.character.identity.name}" importado com sucesso.`
      );
    },
    [settings, handleUpdateSettings, notify]
  );

  const handleImportFileWithMode = useCallback(
    async (file: File, mode: DataTransferMode) => {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const res = await restoreFullBackupZip(file, { mode });
        if (!res.success) {
          notify('error', res.error || 'Erro ao importar arquivo ZIP.');
          return;
        }
        await loadFromDatabase(false);
        if (res.stats?.mode !== 'without_data' && (res.stats?.characters || 0) > 0) {
          setShowStartPage(false);
          setActiveTab('sheet');
        }
        notify(
          'success',
          res.stats?.mode === 'without_data'
            ? `Estrutura importada sem dados: ${res.stats?.templates || 0} modelo(s) e tema aplicados.`
            : `Backup restaurado: ${res.stats?.characters || 0} ficha(s), ${res.stats?.templates || 0} modelo(s).`
        );
        return;
      }
      await handleImportCharacterJson(file, mode);
    },
    [handleImportCharacterJson, loadFromDatabase, notify]
  );

  const handleSaveTemplate = useCallback((tpl: SheetTemplate) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === tpl.id);
      return exists ? prev.map((t) => (t.id === tpl.id ? tpl : t)) : [tpl, ...prev];
    });
    saveTemplate(tpl);
  }, []);

  const handleDeleteTemplate = useCallback(
    (id: string, name: string) => {
      openConfirmDelete(
        'Excluir Modelo',
        `Deseja excluir o modelo "${name}"? Personagens já criados com ele não serão afetados.`,
        () => {
          setTemplates((prev) => prev.filter((t) => t.id !== id));
          deleteTemplateRecord(id);
          notify('info', `Modelo "${name}" excluído.`);
        }
      );
    },
    [openConfirmDelete, notify]
  );

  const handleSaveGeneralNote = useCallback((note: JournalNote) => {
    setGeneralNotes((prev) => {
      const exists = prev.some((n) => n.id === note.id);
      return exists ? prev.map((n) => (n.id === note.id ? note : n)) : [note, ...prev];
    });
    saveGeneralNote(note);
  }, []);

  const handleDeleteGeneralNote = useCallback((noteId: string) => {
    setGeneralNotes((prev) => prev.filter((n) => n.id !== noteId));
    deleteGeneralNoteRecord(noteId);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <div className="text-center space-y-2">
          <p className="font-display text-xl font-semibold">RPG Character Manager</p>
          <p className="text-xs text-[var(--text-muted)]">
            Carregando grimório e fichas locais...
          </p>
        </div>
      </div>
    );
  }

  if (showStartPage) {
    return (
      <>
        <StartAdventureView
          settings={settings}
          templates={templates}
          existingCharactersCount={characters.length}
          onCreateCharacterFromStart={handleCreateCharacterFromStart}
          onCreateFromImportedTemplate={handleCreateCharacter}
          onImportFile={handleImportFileWithMode}
          onReturnToWorkspace={
            characters.length > 0 ? () => setShowStartPage(false) : undefined
          }
        />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];
  const mobileBottomTabs = NAV_ITEMS.filter((n) => n.id !== 'settings');

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-68 lg:shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-[var(--border-subtle)]">
          <span className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)] block whitespace-nowrap">
            RPG Character Manager
          </span>
        </div>

        {/* Active Character Card + D20 Quick Trigger in Sidebar */}
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-2.5">
          {activeCharacter ? (
            <button
              type="button"
              onClick={() => setCharModalOpen(true)}
              aria-label={`Trocar ou gerenciar personagem ativo: ${activeCharacter.identity.name}`}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--accent-border)] transition-colors text-left"
            >
              <ImageSlot
                imageId={activeCharacter.identity.portraitImageId}
                fallbackUrl={activeCharacter.identity.defaultPortraitUrl}
                alt={activeCharacter.identity.name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {activeCharacter.identity.name}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {[
                    activeCharacter.identity.characterClass,
                    `${activeCharacter.identity.levelLabel || 'Nível'} ${activeCharacter.identity.level}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCharModalOpen(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:border-[var(--accent-border)] transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Criar Nova Ficha
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  Nenhuma ficha ativa
                </p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowStartPage(true)}
            className="w-full flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Compass className="w-4 h-4 shrink-0" aria-hidden="true" />
            Nova Aventura (d20 3D)
          </button>
        </div>

        {/* Desktop Nav Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-[var(--accent-contrast)] font-semibold shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
                style={isActive ? { backgroundColor: 'var(--accent-color)' } : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Sticky Top Bar (Desktop & Mobile) */}
        <header className="sticky top-0 z-30 h-12 lg:h-14 px-4 sm:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-header)] backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="lg:hidden font-display text-sm font-bold text-[var(--text-primary)] truncate">
              {activeCharacter ? activeCharacter.identity.name : 'RPG Manager'}
            </span>
            <span className="hidden lg:inline text-sm font-semibold text-[var(--text-secondary)] whitespace-nowrap">
              {activeCharacter
                ? `${activeCharacter.identity.name} / ${activeNavMeta.label}`
                : `Sem Ficha Ativa / ${activeNavMeta.label}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

            <button
              type="button"
              data-testid="edit-mode-toggle"
              aria-pressed={settings.editMode}
              onClick={() => {
                const nextEdit = !settings.editMode;
                handleUpdateSettings({ ...settings, editMode: nextEdit });
                notify(
                  'info',
                  nextEdit
                    ? 'Modo de Edição ativado: controles de criação e ajustes visíveis.'
                    : 'Modo Campanha ativado: interface limpa para jogar.'
                );
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[38px] lg:min-h-[40px] rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                settings.editMode
                  ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                  : 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {settings.editMode ? (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {settings.editMode ? 'Editando Ficha' : 'Modo Edição'}
              </span>
              <span className="sm:hidden">
                {settings.editMode ? 'Editando' : 'Editar'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              aria-label="Modelos e Ajustes"
              className={`lg:hidden p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border transition-colors ${
                activeTab === 'settings'
                  ? 'border-[var(--accent-border)] text-[var(--accent-strong)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setCharModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[38px] lg:min-h-[40px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] whitespace-nowrap shrink-0"
              style={{ backgroundColor: 'var(--accent-color)' }}
            >
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Personagens ({characters.length})</span>
              <span className="sm:hidden">({characters.length})</span>
            </button>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 pb-20 lg:pb-10">
          {!activeCharacter && activeTab !== 'settings' && (
            <section
              data-testid="empty-roster-state"
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-8 max-w-2xl mx-auto space-y-5"
            >
              <div className="space-y-1.5">
                <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                  Ficha Inicial: Personalizada ou Importada
                </h1>
                <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
                  Crie uma ficha personalizada do zero (ou configure atributos e barras na tela inicial com o d20 3D) ou importe um arquivo .json / .zip com ou sem dados.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const nameToUse = quickCharName.trim() || 'Novo Personagem';
                  handleCreatePersonalizedQuick(nameToUse);
                  setQuickCharName('');
                }}
                className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-4"
              >
                <div>
                  <label
                    htmlFor="quick-char-name"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Nome do Personagem
                  </label>
                  <input
                    id="quick-char-name"
                    data-testid="quick-char-name"
                    type="text"
                    value={quickCharName}
                    onChange={(e) => setQuickCharName(e.target.value)}
                    placeholder="Ex.: Lyra Tempestade"
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    data-testid="quick-create-char-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent-color)' }}
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Criar Ficha Personalizada
                  </button>

                  <input
                    ref={quickImportRef}
                    type="file"
                    accept="application/json,.json,.zip,application/zip"
                    className="sr-only"
                    aria-label="Importar ficha ou backup"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleImportFileWithMode(file, quickImportMode);
                        if (quickImportRef.current) quickImportRef.current.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => quickImportRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs sm:text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    Importar ({quickImportMode === 'with_data' ? 'Com dados' : 'Sem dados'})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setQuickImportMode((m) =>
                        m === 'with_data' ? 'without_data' : 'with_data'
                      )
                    }
                    className="px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    Alternar modo
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowStartPage(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-xs sm:text-sm font-semibold text-[var(--accent-strong)] hover:opacity-90"
                  >
                    <Compass className="w-4 h-4" aria-hidden="true" />
                    Personalizar Modelo & d20 3D
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeCharacter && activeTab === 'sheet' && (
            <CharacterSheetView
              character={activeCharacter}
              onUpdateCharacter={handleUpdateCharacter}
              onConfirmDelete={openConfirmDelete}
              onNotify={notify}
              compact={settings.density === 'compact'}
              isEditMode={settings.editMode}
            />
          )}

          {activeCharacter && activeTab === 'inventory' && (
            <InventoryView
              character={activeCharacter}
              onUpdateCharacter={handleUpdateCharacter}
              onConfirmDelete={openConfirmDelete}
              onNotify={notify}
              isEditMode={settings.editMode}
            />
          )}

          {activeCharacter && activeTab === 'equipment' && (
            <EquipmentView
              character={activeCharacter}
              onUpdateCharacter={handleUpdateCharacter}
              onConfirmDelete={openConfirmDelete}
              onNotify={notify}
              isEditMode={settings.editMode}
            />
          )}

          {activeCharacter && activeTab === 'combat' && (
            <AbilitiesCombatView
              character={activeCharacter}
              onUpdateCharacter={handleUpdateCharacter}
              onConfirmDelete={openConfirmDelete}
              onNotify={notify}
              isEditMode={settings.editMode}
            />
          )}

          {activeCharacter && activeTab === 'knowledge' && (
            <KnowledgeSection
              character={activeCharacter}
              onUpdateCharacter={handleUpdateCharacter}
              onConfirmDelete={openConfirmDelete}
              onNotify={notify}
              isEditMode={settings.editMode}
            />
          )}

          {activeCharacter && activeTab === 'notes' && (
            <JournalView
              character={activeCharacter}
              generalNotes={generalNotes}
              onUpdateCharacter={handleUpdateCharacter}
              onSaveGeneralNote={handleSaveGeneralNote}
              onDeleteGeneralNote={handleDeleteGeneralNote}
              onConfirmDelete={openConfirmDelete}
              onNotify={notify}
              isEditMode={settings.editMode}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTemplatesView
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              activeCharacter={activeCharacter}
              templates={templates}
              onSaveTemplate={handleSaveTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onCreateCharacterFromTemplate={handleCreateCharacter}
              onImportFileWithMode={handleImportFileWithMode}
              onFullRestoreComplete={() => loadFromDatabase(false)}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (56px + safe area <= 15% mobile height cap) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-sidebar)]/95 backdrop-blur-md pb-safe"
        aria-label="Navegação inferior"
      >
        <div className="grid grid-cols-6 h-14">
          {mobileBottomTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                  isActive
                    ? 'text-[var(--accent-strong)] font-semibold'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] leading-none whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Notifications */}
      <CharacterManagerModal
        open={charModalOpen}
        onClose={() => setCharModalOpen(false)}
        characters={characters}
        activeCharacterId={activeCharacter?.id || null}
        onSelectCharacter={handleSelectCharacter}
        onCreatePersonalizedCharacter={handleCreatePersonalizedQuick}
        onDuplicateCharacter={handleDuplicateCharacter}
        onDeleteCharacter={handleDeleteCharacter}
        onClearAllCharacters={handleClearAllCharacters}
        onOpenStartPage={() => setShowStartPage(true)}
        onImportCharacterJson={handleImportCharacterJson}
      />

      <ConfirmModal
        state={confirmState}
        onClose={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
