import React, { useRef, useState } from 'react';
import {
  Archive,
  Check,
  Download,
  Edit3,
  Palette,
  Plus,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { DataTransferMode } from '../../engine/exportEngine';
import {
  createBlankTemplate,
  createTemplateFromCharacter,
} from '../../engine/templateEngine';
import {
  DEFAULT_CUSTOM_DARK_PALETTE,
  DEFAULT_CUSTOM_LIGHT_PALETTE,
  normalizeCustomPalette,
  normalizeThemeMode,
  paletteFromThemeMode,
  THEME_DEFINITIONS,
  THEME_LIST,
} from '../../engine/themeEngine';
import {
  exportCharacterAsJson,
  exportFullBackupZip,
  exportTemplateAsJson,
  restoreFullBackupZip,
} from '../../storage/database';
import {
  AppLanguage,
  AppSettings,
  Character,
  CustomThemePalette,
  SheetTemplate,
  ThemeMode,
} from '../../types/rpg';

interface SettingsTemplatesViewProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  activeCharacter: Character | null;
  templates: SheetTemplate[];
  onSaveTemplate: (tpl: SheetTemplate) => void;
  onDeleteTemplate: (id: string, name: string) => void;
  onCreateCharacterFromTemplate: (name: string, templateId: string) => void;
  onImportFileWithMode: (file: File, mode: DataTransferMode) => Promise<void>;
  onFullRestoreComplete: () => Promise<void>;
  onNotify: (kind: 'success' | 'error' | 'info', text: string) => void;
}

const MONOCHROME_ACCENT_PRESETS = [
  { label: 'Branco Puro', hex: '#FAFAFA' },
  { label: 'Preto Ônix', hex: '#18181B' },
  { label: 'Grafite', hex: '#3F3F46' },
  { label: 'Prata Clara', hex: '#D4D4D8' },
];

export const SettingsTemplatesView: React.FC<SettingsTemplatesViewProps> = ({
  settings,
  onUpdateSettings,
  activeCharacter,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onCreateCharacterFromTemplate,
  onImportFileWithMode,
  onFullRestoreComplete,
  onNotify,
}) => {
  const [newTplName, setNewTplName] = useState('');
  const [newCharNameFromTpl, setNewCharNameFromTpl] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<SheetTemplate | null>(null);
  const [busyBackup, setBusyBackup] = useState(false);
  const [importDataMode, setImportDataMode] = useState<DataTransferMode>('with_data');

  const backupInputRef = useRef<HTMLInputElement>(null);
  const charImportRef = useRef<HTMLInputElement>(null);
  const unifiedImportRef = useRef<HTMLInputElement>(null);

  const activeThemeId = normalizeThemeMode(settings.theme);
  const activeThemeDef = THEME_DEFINITIONS[activeThemeId];
  const customPalette = normalizeCustomPalette(
    settings.customTheme,
    DEFAULT_CUSTOM_DARK_PALETTE
  );

  const handleSelectTheme = (themeId: ThemeMode) => {
    const def = THEME_DEFINITIONS[themeId];
    if (themeId === 'custom') {
      const seedPalette =
        activeThemeId === 'custom'
          ? customPalette
          : paletteFromThemeMode(activeThemeId);
      onUpdateSettings({
        ...settings,
        theme: 'custom',
        customTheme: seedPalette,
        accentColor: seedPalette.accent,
      });
      onNotify('success', 'Modo de cores personalizadas ativado.');
      return;
    }

    onUpdateSettings({
      ...settings,
      theme: themeId,
      accentColor: def.defaultAccent,
    });
    onNotify('success', `Tema "${def.name}" ativado.`);
  };

  const handleCustomColorChange = (key: keyof CustomThemePalette, hex: string) => {
    const nextPalette: CustomThemePalette = {
      ...customPalette,
      [key]: hex.toUpperCase(),
    };
    onUpdateSettings({
      ...settings,
      theme: 'custom',
      customTheme: nextPalette,
      accentColor: key === 'accent' ? nextPalette.accent : settings.accentColor,
    });
  };

  const handleCreateBlankTemplate = () => {
    const name = newTplName.trim() || 'Sistema Próprio em Branco';
    const tpl = createBlankTemplate(name);
    onSaveTemplate(tpl);
    setNewTplName('');
    onNotify('success', `Modelo em branco "${tpl.name}" criado.`);
  };

  const handleSaveAsTemplate = () => {
    if (!activeCharacter) return;
    const name =
      newTplName.trim() || `Modelo: ${activeCharacter.identity.name}`;
    const tpl = createTemplateFromCharacter(activeCharacter, name);
    onSaveTemplate(tpl);
    setNewTplName('');
    onNotify('success', `Estrutura atual salva como modelo "${tpl.name}".`);
  };

  const handleExportZip = async (includeData: boolean) => {
    setBusyBackup(true);
    try {
      await exportFullBackupZip({ includeData });
      onNotify(
        'success',
        includeData
          ? 'Backup completo com dados (.zip) exportado.'
          : 'Pacote sem dados — modelos e tema (.zip) exportado.'
      );
    } catch {
      onNotify('error', 'Erro ao gerar arquivo de backup.');
    } finally {
      setBusyBackup(false);
    }
  };

  const handleRestoreZip = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: DataTransferMode = 'with_data'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyBackup(true);
    try {
      const res = await restoreFullBackupZip(file, { mode });
      if (!res.success) {
        onNotify('error', res.error || 'Erro ao restaurar backup.');
        return;
      }
      await onFullRestoreComplete();
      onNotify(
        'success',
        res.stats?.mode === 'without_data'
          ? `Estrutura importada sem dados: ${res.stats?.templates || 0} modelo(s) e tema aplicados.`
          : `Backup restaurado: ${res.stats?.characters || 0} ficha(s), ${res.stats?.templates || 0} modelo(s) e ${res.stats?.images || 0} imagem(ns).`
      );
    } finally {
      setBusyBackup(false);
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {/* Appearance & 3-Theme Selector */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
            Modelos, Backup & Aparência
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Escolha o tema visual completo da aplicação, personalize realces, reutilize estruturas e gerencie backups offline
          </p>
        </div>

        {/* 3 Full Visual Themes */}
        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--accent-strong)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Tema Visual da Aplicação
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" role="radiogroup" aria-label="Selecionar tema visual">
            {THEME_LIST.map((themeDef) => {
              const selected = activeThemeId === themeDef.id;
              const previewColors =
                themeDef.id === 'custom' ? customPalette : themeDef.preview;
              return (
                <button
                  key={themeDef.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`theme-option-${themeDef.id}`}
                  onClick={() => handleSelectTheme(themeDef.id)}
                  className={`text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    selected
                      ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-color)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {/* Mini Palette Preview */}
                  <div
                    className="w-full h-16 rounded-xl border p-2 flex flex-col justify-between"
                    style={{
                      backgroundColor: previewColors.canvas,
                      borderColor: previewColors.border,
                    }}
                    aria-hidden="true"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: previewColors.surface }}
                        />
                        <span
                          className="w-10 h-2 rounded-full"
                          style={{ backgroundColor: previewColors.text, opacity: 0.75 }}
                        />
                      </div>
                      <span
                        className="w-5 h-2.5 rounded-full"
                        style={{ backgroundColor: previewColors.accent }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="flex-1 h-4 rounded-md border"
                        style={{
                          backgroundColor: previewColors.surface,
                          borderColor: previewColors.border,
                        }}
                      />
                      <div
                        className="w-10 h-4 rounded-md"
                        style={{ backgroundColor: previewColors.elevated }}
                      />
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {themeDef.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug">
                        {themeDef.subtitle}
                      </p>
                    </div>
                    {selected && (
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[var(--accent-contrast)]"
                        style={{ backgroundColor: 'var(--accent-color)' }}
                        aria-hidden="true"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Full Custom Color Pattern Configurator */}
          {activeThemeId === 'custom' && (
            <div
              data-testid="custom-theme-editor"
              className="p-4 rounded-2xl border border-[var(--accent-border)] bg-[var(--bg-elevated)] space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Personalização Completa de Padrões de Cores
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Ajuste cada cor livremente — o contraste claro/escuro e realces são recalculados automaticamente.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        theme: 'custom',
                        customTheme: { ...DEFAULT_CUSTOM_LIGHT_PALETTE },
                        accentColor: DEFAULT_CUSTOM_LIGHT_PALETTE.accent,
                      })
                    }
                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    Base Clara (P&amp;B)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        theme: 'custom',
                        customTheme: { ...DEFAULT_CUSTOM_DARK_PALETTE },
                        accentColor: DEFAULT_CUSTOM_DARK_PALETTE.accent,
                      })
                    }
                    className="px-3 py-1.5 min-h-[36px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    Base Escura (P&amp;B)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {(
                  [
                    ['canvas', 'Fundo'],
                    ['sidebar', 'Menu / Barra'],
                    ['surface', 'Cartões'],
                    ['elevated', 'Blocos'],
                    ['border', 'Bordas'],
                    ['text', 'Texto'],
                    ['accent', 'Destaque'],
                  ] as const
                ).map(([tokenKey, label]) => (
                  <label
                    key={tokenKey}
                    className="flex flex-col gap-1.5 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] cursor-pointer"
                  >
                    <span className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        data-testid={`custom-color-${tokenKey}`}
                        value={customPalette[tokenKey]}
                        onChange={(e) => handleCustomColorChange(tokenKey, e.target.value)}
                        className="w-8 h-8 rounded-lg border border-[var(--border-strong)] cursor-pointer bg-transparent shrink-0"
                      />
                      <span className="font-mono-num text-[11px] text-[var(--text-primary)] truncate">
                        {customPalette[tokenKey]}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-[var(--border-subtle)]">
          {/* Display Density & Language */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Exibição & Idioma
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="density-select"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Densidade
                </label>
                <select
                  id="density-select"
                  value={settings.density}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      density: e.target.value as AppSettings['density'],
                    })
                  }
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="comfortable">Confortável</option>
                  <option value="compact">Compacta</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="lang-select"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Idioma da Interface
                </label>
                <select
                  id="lang-select"
                  value={settings.language}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      language: e.target.value as AppLanguage,
                    })
                  }
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (Preview)</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.editMode}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, editMode: e.target.checked })
                }
              />
              Modo de Edição (exibir controles avançados de edição e criação)
            </label>

            <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={settings.decorativeEffects}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, decorativeEffects: e.target.checked })
                }
              />
              Ativar ornamentos sutis na ficha
            </label>
          </div>

          {/* Primary Accent Color */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Ajuste Fino da Cor de Destaque
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (activeThemeId === 'custom') {
                    handleCustomColorChange('accent', activeThemeDef.defaultAccent);
                  } else {
                    onUpdateSettings({ ...settings, accentColor: activeThemeDef.defaultAccent });
                  }
                }}
                className="text-xs font-semibold text-[var(--accent-strong)] hover:underline"
              >
                Restaurar padrão do tema
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MONOCHROME_ACCENT_PRESETS.map((preset) => {
                const selected = settings.accentColor.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => {
                      if (activeThemeId === 'custom') {
                        handleCustomColorChange('accent', preset.hex);
                      } else {
                        onUpdateSettings({ ...settings, accentColor: preset.hex });
                      }
                    }}
                    className={`flex items-center gap-2 p-2.5 min-h-[44px] rounded-xl border text-left text-xs font-medium transition-colors ${
                      selected
                        ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-md border border-[var(--border-strong)] shrink-0"
                      style={{ backgroundColor: preset.hex }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <label
                htmlFor="custom-accent-picker"
                className="text-xs text-[var(--text-muted)]"
              >
                Cor personalizada:
              </label>
              <input
                id="custom-accent-picker"
                type="color"
                value={settings.accentColor}
                onChange={(e) => {
                  if (activeThemeId === 'custom') {
                    handleCustomColorChange('accent', e.target.value);
                  } else {
                    onUpdateSettings({ ...settings, accentColor: e.target.value });
                  }
                }}
                className="w-10 h-9 rounded-lg border border-[var(--border-strong)] cursor-pointer bg-transparent"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Reusable Character Sheet Templates */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Modelos Reutilizáveis de Ficha
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Editar um modelo não sobrescreve personagens já existentes. Você pode criar modelos em branco ou a partir da ficha atual.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newTplName}
            onChange={(e) => setNewTplName(e.target.value)}
            placeholder="Nome do novo modelo..."
            aria-label="Nome do novo modelo"
            className="flex-1 px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
          />
          <button
            type="button"
            onClick={handleCreateBlankTemplate}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Modelo em Branco
          </button>
          <button
            type="button"
            disabled={!activeCharacter}
            onClick={handleSaveAsTemplate}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] disabled:opacity-45 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-color)' }}
          >
            Salvar Ficha Atual como Modelo
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-col justify-between gap-3"
            >
              <div>
                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                  {tpl.name}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {tpl.description}
                </p>
                <p className="text-xs text-[var(--text-secondary)] font-mono-num mt-2">
                  {tpl.attributes.length} atributo(s) · {tpl.resources.length} recurso(s) ·{' '}
                  {tpl.walletCurrencies?.length || 0} moeda(s) · {tpl.equipmentSlots.length} espaço(s)
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Nome do personagem..."
                    aria-label={`Nome do personagem para criar com ${tpl.name}`}
                    value={newCharNameFromTpl}
                    onChange={(e) => setNewCharNameFromTpl(e.target.value)}
                    className="w-36 px-2.5 py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const charName = newCharNameFromTpl.trim() || `Herói (${tpl.name})`;
                      onCreateCharacterFromTemplate(charName, tpl.id);
                      setNewCharNameFromTpl('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold text-[var(--accent-contrast)]"
                    style={{ backgroundColor: 'var(--accent-color)' }}
                  >
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    Criar Ficha
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Editar modelo ${tpl.name}`}
                    onClick={() => setEditingTemplate({ ...tpl })}
                    className="p-2 min-h-[38px] min-w-[38px] rounded-lg border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  {templates.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Excluir modelo ${tpl.name}`}
                      onClick={() => onDeleteTemplate(tpl.id, tpl.name)}
                      className="p-2 min-h-[38px] min-w-[38px] rounded-lg border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Offline Backup, Export & Import (With or Without Data) */}
      <section
        data-testid="export-import-section"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-5"
      >
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Exportação &amp; Importação (Com ou Sem Dados)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Exporte arquivos completos com todos os valores, itens e imagens, ou apenas a estrutura limpa sem dados pessoais. Ao importar, escolha manter ou limpar os dados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Export WITH Data */}
          <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Exportar Com Dados
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Inclui atributos preenchidos, inventário, moedas, anotações e imagens.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="export-json-with-data"
                disabled={!activeCharacter}
                onClick={() => {
                  if (!activeCharacter) return;
                  exportCharacterAsJson(activeCharacter, { includeData: true });
                  onNotify(
                    'success',
                    `Ficha "${activeCharacter.identity.name}" exportada com dados (.json).`
                  );
                }}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Ficha (.json)
              </button>

              <button
                type="button"
                data-testid="export-zip-with-data"
                disabled={busyBackup}
                onClick={() => handleExportZip(true)}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                <Archive className="w-4 h-4" aria-hidden="true" />
                {busyBackup ? 'Gerando...' : 'Backup Completo (.zip)'}
              </button>
            </div>
          </div>

          {/* Export WITHOUT Data (Structure Only) */}
          <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Exportar Sem Dados (Somente Estrutura)
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Exporta uma ficha limpa zerada ou modelos/tema sem personagens ou notas.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="export-json-without-data"
                disabled={!activeCharacter && templates.length === 0}
                onClick={() => {
                  if (activeCharacter) {
                    exportCharacterAsJson(activeCharacter, { includeData: false });
                    onNotify(
                      'success',
                      `Estrutura de "${activeCharacter.identity.name}" exportada sem dados (.json).`
                    );
                  } else if (templates[0]) {
                    exportTemplateAsJson(templates[0]);
                    onNotify('success', `Estrutura "${templates[0].name}" exportada sem dados (.json).`);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Estrutura Limpa (.json)
              </button>

              <button
                type="button"
                data-testid="export-zip-without-data"
                disabled={busyBackup}
                onClick={() => handleExportZip(false)}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                <Archive className="w-4 h-4" aria-hidden="true" />
                {busyBackup ? 'Gerando...' : 'Modelos & Tema (.zip)'}
              </button>
            </div>
          </div>
        </div>

        {/* Import WITH or WITHOUT Data */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Importar Arquivo (.json ou .zip)
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Escolha se deseja carregar os dados salvos no arquivo ou importar somente a estrutura em branco.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              className="inline-flex rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1"
              role="radiogroup"
              aria-label="Modo de importação de arquivos"
            >
              <button
                type="button"
                role="radio"
                data-testid="import-mode-with-data"
                aria-checked={importDataMode === 'with_data'}
                onClick={() => setImportDataMode('with_data')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  importDataMode === 'with_data'
                    ? 'text-[var(--accent-contrast)] font-semibold'
                    : 'text-[var(--text-secondary)]'
                }`}
                style={importDataMode === 'with_data' ? { backgroundColor: 'var(--accent-color)' } : undefined}
              >
                Com Dados
              </button>
              <button
                type="button"
                role="radio"
                data-testid="import-mode-without-data"
                aria-checked={importDataMode === 'without_data'}
                onClick={() => setImportDataMode('without_data')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  importDataMode === 'without_data'
                    ? 'text-[var(--accent-contrast)] font-semibold'
                    : 'text-[var(--text-secondary)]'
                }`}
                style={importDataMode === 'without_data' ? { backgroundColor: 'var(--accent-color)' } : undefined}
              >
                Sem Dados
              </button>
            </div>

            <input
              ref={unifiedImportRef}
              type="file"
              accept="application/json,.json,.zip,application/zip"
              className="sr-only"
              aria-label="Importar arquivo JSON ou ZIP"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusyBackup(true);
                try {
                  if (file.name.toLowerCase().endsWith('.zip')) {
                    await handleRestoreZip(e, importDataMode);
                  } else {
                    await onImportFileWithMode(file, importDataMode);
                  }
                } finally {
                  setBusyBackup(false);
                  if (unifiedImportRef.current) unifiedImportRef.current.value = '';
                }
              }}
            />

            <input
              ref={charImportRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Importar ficha JSON"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  await onImportFileWithMode(file, importDataMode);
                  if (charImportRef.current) charImportRef.current.value = '';
                }
              }}
            />
            <input
              ref={backupInputRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              aria-label="Restaurar backup completo ZIP"
              onChange={(e) => handleRestoreZip(e, importDataMode)}
            />

            <button
              type="button"
              data-testid="import-file-btn"
              disabled={busyBackup}
              onClick={() => unifiedImportRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] disabled:opacity-50 whitespace-nowrap"
              style={{ backgroundColor: 'var(--accent-color)' }}
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              {busyBackup ? 'Importando...' : 'Importar Arquivo'}
            </button>
          </div>
        </div>
      </section>

      {/* Android & Capacitor Build Information */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[var(--accent-strong)]" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Projeto Android (Capacitor)
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
          Este aplicativo está configurado com Capacitor (<span className="font-mono-num">com.rpgcharactermanager.app</span>) para funcionamento totalmente offline em Android, com persistência local em IndexedDB e arquivos de imagem nativos via Capacitor Filesystem.
        </p>
        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] font-mono-num text-xs text-[var(--text-secondary)] space-y-1">
          <p>npm run build</p>
          <p>npx cap sync android</p>
          <p>npx cap open android  # ou: cd android &amp;&amp; ./gradlew assembleDebug</p>
        </div>
      </section>

      {/* Edit Template Modal */}
      {editingTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tpl-modal-title"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingTemplate.name.trim()) return;
              onSaveTemplate(editingTemplate);
              setEditingTemplate(null);
              onNotify('success', `Modelo "${editingTemplate.name}" atualizado.`);
            }}
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="tpl-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              Editar Modelo
            </h3>
            <div>
              <label
                htmlFor="tpl-name"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Nome do Modelo
              </label>
              <input
                id="tpl-name"
                type="text"
                required
                value={editingTemplate.name}
                onChange={(e) =>
                  setEditingTemplate({ ...editingTemplate, name: e.target.value })
                }
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="tpl-desc"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Descrição
              </label>
              <textarea
                id="tpl-desc"
                rows={3}
                value={editingTemplate.description}
                onChange={(e) =>
                  setEditingTemplate({ ...editingTemplate, description: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)]"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Salvar Modelo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
