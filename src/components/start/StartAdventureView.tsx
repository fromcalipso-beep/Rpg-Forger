import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Dices,
  Plus,
  RotateCcw,
  ScrollText,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { DataTransferMode } from '../../engine/exportEngine';
import { rollRandomInt } from '../../engine/randomEngine';
import {
  DEFAULT_MODULES,
  PersonalizedAttributeDraft,
  PersonalizedResourceDraft,
  PersonalizedSheetInput,
} from '../../engine/templateEngine';
import { computeThemeRuntime, normalizeThemeMode } from '../../engine/themeEngine';
import { saveImageDataUrl } from '../../storage/database';
import { AppSettings, ModuleFlags, SheetTemplate } from '../../types/rpg';
import { ImageCropModal } from '../shared/ImageCropModal';
import { D20RollPhase, D20ThreeCanvas } from './D20ThreeCanvas';

export type StartCreateCharacterPayload = PersonalizedSheetInput;

interface StartAdventureViewProps {
  settings: AppSettings;
  templates: SheetTemplate[];
  existingCharactersCount: number;
  onCreateCharacterFromStart: (payload: StartCreateCharacterPayload) => void;
  onCreateFromImportedTemplate?: (name: string, templateId: string) => void;
  onImportFile: (file: File, mode: DataTransferMode) => Promise<void>;
  onReturnToWorkspace?: () => void;
}

type InitialModelOrigin = 'personalized' | 'imported';

const MODULE_LABELS: Array<[keyof ModuleFlags, string]> = [
  ['attributes', 'Atributos'],
  ['resources', 'Recursos Vitais'],
  ['skills', 'Perícias'],
  ['knowledge', 'Livros & Conchas'],
  ['wallet', 'Bolsa de Moedas'],
  ['inventory', 'Mochila'],
  ['equipment', 'Equipamento Corporal'],
  ['abilities', 'Habilidades & Combate'],
  ['notes', 'Diário & Notas'],
];

export const StartAdventureView: React.FC<StartAdventureViewProps> = ({
  settings,
  templates,
  existingCharactersCount,
  onCreateCharacterFromStart,
  onCreateFromImportedTemplate,
  onImportFile,
  onReturnToWorkspace,
}) => {
  const [rollPhase, setRollPhase] = useState<D20RollPhase>('idle');
  const [rollTrigger, setRollTrigger] = useState<number>(0);
  const [rolledFace, setRolledFace] = useState<number | null>(null);
  const [showCreator, setShowCreator] = useState<boolean>(false);

  // Model selection: strictly Personalized vs Imported
  const [modelOrigin, setModelOrigin] = useState<InitialModelOrigin>('personalized');

  // Character Sheet Creation form state
  const [name, setName] = useState('');
  const [characterClass, setCharacterClass] = useState('');
  const [race, setRace] = useState('');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<number>(1);
  const [applyD20Bonus, setApplyD20Bonus] = useState<boolean>(true);
  const [nameError, setNameError] = useState('');

  // Personalized custom structure builder state
  const [includeStandardBodySlots, setIncludeStandardBodySlots] = useState<boolean>(true);
  const [enabledModules, setEnabledModules] = useState<ModuleFlags>({ ...DEFAULT_MODULES });
  const [customAttrs, setCustomAttrs] = useState<PersonalizedAttributeDraft[]>([]);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrShort, setNewAttrShort] = useState('');
  const [newAttrVal, setNewAttrVal] = useState<number>(10);

  const [customResources, setCustomResources] = useState<PersonalizedResourceDraft[]>([]);
  const [newResName, setNewResName] = useState('');
  const [newResMax, setNewResMax] = useState<number>(20);

  // Portrait upload & crop
  const [portraitImageId, setPortraitImageId] = useState<string | undefined>(undefined);
  const [portraitPreviewUrl, setPortraitPreviewUrl] = useState<string | undefined>(undefined);
  const [cropSrc, setCropSrc] = useState<string>('');
  const [cropFileName, setCropFileName] = useState<string>('retrato.png');
  const [cropOpen, setCropOpen] = useState<boolean>(false);

  // Import file with/without data
  const [importMode, setImportMode] = useState<DataTransferMode>('with_data');
  const [busyImport, setBusyImport] = useState(false);

  const portraitInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const resolvedTheme = normalizeThemeMode(settings.theme);
  const themeRuntime = useMemo(
    () =>
      computeThemeRuntime(resolvedTheme, settings.accentColor, settings.customTheme),
    [resolvedTheme, settings.accentColor, settings.customTheme]
  );

  const canvasBgHex =
    resolvedTheme === 'custom'
      ? settings.customTheme.canvas
      : themeRuntime.metaThemeColor;
  const surfaceHex =
    resolvedTheme === 'custom'
      ? settings.customTheme.surface
      : themeRuntime.isDark
        ? '#121215'
        : '#FFFFFF';
  const textHex =
    resolvedTheme === 'custom'
      ? settings.customTheme.text
      : themeRuntime.isDark
        ? '#FAFAFA'
        : '#09090B';
  const accentHex = themeRuntime.cssVariables['--accent-color'] || settings.accentColor;

  // User-imported or custom-saved templates (excluding built-in presets)
  const importedOrCustomTemplates = useMemo(
    () =>
      templates.filter(
        (t) =>
          t.id !== 'tpl_universal_dark_fantasy' &&
          t.id !== 'tpl_scifi_custom'
      ),
    [templates]
  );

  const handleRollD20 = () => {
    if (rollPhase === 'rolling') return;
    const nextFace = rollRandomInt(1, 20);
    setRolledFace(nextFace);
    setRollPhase('rolling');
    setRollTrigger((n) => n + 1);
  };

  const handleRollSettled = (face: number) => {
    setRolledFace(face);
    setRollPhase('landed');
    setShowCreator(true);
  };

  const handlePortraitSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(String(reader.result || ''));
      setCropFileName(file.name || 'retrato.png');
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    if (portraitInputRef.current) portraitInputRef.current.value = '';
  };

  const handleConfirmPortraitCrop = async (dataUrl: string, fileName: string) => {
    const rec = await saveImageDataUrl(dataUrl, fileName, 'image/png');
    setPortraitImageId(rec.id);
    setPortraitPreviewUrl(dataUrl);
    setCropOpen(false);
  };

  const handleAddCustomAttribute = () => {
    const clean = newAttrName.trim();
    if (!clean) return;
    const short =
      newAttrShort.trim().toUpperCase() || clean.slice(0, 3).toUpperCase();
    setCustomAttrs((prev) => [
      ...prev,
      { name: clean, shortName: short, baseValue: Number(newAttrVal) || 0 },
    ]);
    setNewAttrName('');
    setNewAttrShort('');
    setNewAttrVal(10);
  };

  const handleAddCustomResource = () => {
    const clean = newResName.trim();
    if (!clean) return;
    setCustomResources((prev) => [
      ...prev,
      { name: clean, max: Math.max(0, Number(newResMax) || 0) },
    ]);
    setNewResName('');
    setNewResMax(20);
  };

  const handleSubmitCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Informe o nome do personagem para criar a ficha.');
      return;
    }
    setNameError('');
    onCreateCharacterFromStart({
      name: trimmed,
      characterClass: characterClass.trim(),
      race: race.trim(),
      title: title.trim(),
      level: Math.max(1, Math.trunc(level || 1)),
      portraitImageId,
      includeStandardBodySlots,
      enabledModules,
      attributes: customAttrs,
      resources: customResources,
      rolledD20: rolledFace,
      applyD20Bonus: Boolean(rolledFace !== null && applyD20Bonus),
    });
  };

  const d20BonusAmount = rolledFace ? Math.max(1, Math.round(rolledFace / 4)) : 0;

  return (
    <div
      data-testid="start-adventure-page"
      className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]"
    >
      {/* Clean Minimal Top Bar */}
      <header className="px-3 sm:px-8 py-3.5 sm:py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex items-center justify-between gap-2 sm:gap-4">
        <span className="font-display text-sm sm:text-lg font-bold tracking-tight text-[var(--text-primary)] truncate min-w-0">
          RPG Character Manager
        </span>

        {existingCharactersCount > 0 && onReturnToWorkspace && (
          <button
            type="button"
            onClick={onReturnToWorkspace}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sm:hidden">Fichas ({existingCharactersCount})</span>
            <span className="hidden sm:inline">Voltar às Fichas ({existingCharactersCount})</span>
          </button>
        )}
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* Hero Prompt + 3D D20 Stage */}
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-8 space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h1
              data-testid="start-hero-heading"
              className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[var(--text-primary)]"
              style={{ textWrap: 'balance' }}
            >
              Shall we begin the adventure?
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-muted)]">
              {rollPhase === 'idle'
                ? 'Clique no dado d20 em 3D abaixo para rolar seu número inicial e abrir a criação da ficha.'
                : rollPhase === 'rolling'
                  ? 'O dado d20 está rolando na mesa...'
                  : `O d20 caiu em ${rolledFace}. Crie sua ficha personalizada ou importe um arquivo abaixo para começar.`}
            </p>
          </div>

          {/* 3D d20 Stage */}
          <div className="relative w-full max-w-xl mx-auto h-[300px] sm:h-[360px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] overflow-hidden">
            <D20ThreeCanvas
              rollTrigger={rollTrigger}
              targetFace={rolledFace}
              phase={rollPhase}
              surfaceHex={surfaceHex}
              textHex={textHex}
              accentHex={accentHex}
              canvasBgHex={canvasBgHex}
              isDark={themeRuntime.isDark}
              onDieClick={handleRollD20}
              onRollSettled={handleRollSettled}
            />
          </div>

          {/* Primary Roll CTA & Rolled Result Readout */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                data-testid="start-roll-d20-btn"
                disabled={rollPhase === 'rolling'}
                onClick={handleRollD20}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 min-h-[48px] rounded-xl text-sm sm:text-base font-semibold text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-60 transition-opacity whitespace-nowrap"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                {rollPhase === 'landed' ? (
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Dices className="w-4 h-4" aria-hidden="true" />
                )}
                {rollPhase === 'rolling'
                  ? 'Rolando d20...'
                  : rollPhase === 'landed'
                    ? 'Rolar d20 Novamente'
                    : 'Rolar d20'}
              </button>

              {rollPhase === 'landed' && rolledFace !== null && (
                <div
                  data-testid="start-rolled-result"
                  aria-live="polite"
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[48px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-primary)]"
                >
                  <span className="text-[var(--text-muted)]">Resultado:</span>
                  <span className="font-mono-num text-xl font-bold">{rolledFace}</span>
                  {rolledFace === 20 && (
                    <span className="text-xs font-medium text-[var(--accent-strong)]">
                      · Crítico Natural
                    </span>
                  )}
                  {rolledFace === 1 && (
                    <span className="text-xs font-medium text-red-500">
                      · 1 Natural
                    </span>
                  )}
                </div>
              )}
            </div>

            {!showCreator && (
              <button
                type="button"
                data-testid="skip-to-creator-btn"
                onClick={() => setShowCreator(true)}
                className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] underline underline-offset-4 py-1"
              >
                Ou ir direto para ficha personalizada / importada
              </button>
            )}
          </div>
        </section>

        {/* Character Sheet Creation Section (Personalized or Imported ONLY) */}
        {showCreator && (
          <section
            data-testid="start-character-creator"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-8 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-[var(--accent-strong)]" aria-hidden="true" />
                  <h2 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                    Criar Ficha Inicial
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                  Escolha entre montar uma ficha personalizada do zero ou importar um arquivo existente (.json / .zip).
                </p>
              </div>

              {rolledFace !== null && (
                <div className="px-3.5 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap self-start sm:self-auto">
                  d20 sorteado: <span className="font-mono-num font-bold text-[var(--text-primary)]">{rolledFace}</span>
                </div>
              )}
            </div>

            {/* Strictly 2 Initial Sheet Model Modes: Personalizada vs Importada */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="radiogroup"
              aria-label="Modelo da ficha inicial"
            >
              <button
                type="button"
                role="radio"
                data-testid="start-model-custom"
                aria-checked={modelOrigin === 'personalized'}
                onClick={() => setModelOrigin('personalized')}
                className={`text-left p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                  modelOrigin === 'personalized'
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-color)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
                }`}
              >
                <Sliders className="w-5 h-5 text-[var(--accent-strong)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Ficha Personalizada
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Estrutura limpa e livre de sistema fixo — defina atributos, recursos e módulos como preferir.
                  </p>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                data-testid="start-model-imported"
                aria-checked={modelOrigin === 'imported'}
                onClick={() => setModelOrigin('imported')}
                className={`text-left p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                  modelOrigin === 'imported'
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-color)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
                }`}
              >
                <Upload className="w-5 h-5 text-[var(--accent-strong)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Ficha ou Modelo Importado
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Carregue um arquivo .json ou backup .zip mantendo todos os dados ou apenas a estrutura vazia.
                  </p>
                </div>
              </button>
            </div>

            {modelOrigin === 'imported' ? (
              <div
                data-testid="start-imported-panel"
                className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Importar Arquivo (.json ou .zip)
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      Selecione se deseja importar com todos os valores e imagens ou somente a estrutura em branco.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div
                      className="inline-flex rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-1"
                      role="radiogroup"
                      aria-label="Modo de importação"
                    >
                      <button
                        type="button"
                        role="radio"
                        data-testid="start-import-with-data"
                        aria-checked={importMode === 'with_data'}
                        onClick={() => setImportMode('with_data')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          importMode === 'with_data'
                            ? 'text-[var(--accent-contrast)] font-semibold'
                            : 'text-[var(--text-secondary)]'
                        }`}
                        style={importMode === 'with_data' ? { backgroundColor: 'var(--accent-color)' } : undefined}
                      >
                        Com dados
                      </button>
                      <button
                        type="button"
                        role="radio"
                        data-testid="start-import-without-data"
                        aria-checked={importMode === 'without_data'}
                        onClick={() => setImportMode('without_data')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          importMode === 'without_data'
                            ? 'text-[var(--accent-contrast)] font-semibold'
                            : 'text-[var(--text-secondary)]'
                        }`}
                        style={importMode === 'without_data' ? { backgroundColor: 'var(--accent-color)' } : undefined}
                      >
                        Sem dados
                      </button>
                    </div>

                    <input
                      ref={importInputRef}
                      type="file"
                      accept="application/json,.json,.zip,application/zip"
                      className="sr-only"
                      aria-label="Importar arquivo JSON ou ZIP"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBusyImport(true);
                        try {
                          await onImportFile(file, importMode);
                        } finally {
                          setBusyImport(false);
                          if (importInputRef.current) importInputRef.current.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      data-testid="start-import-file-btn"
                      disabled={busyImport}
                      onClick={() => importInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                      style={{ backgroundColor: 'var(--accent-color)' }}
                    >
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      {busyImport ? 'Importando...' : 'Escolher Arquivo (.json / .zip)'}
                    </button>
                  </div>
                </div>

                {importedOrCustomTemplates.length > 0 && onCreateFromImportedTemplate && (
                  <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Modelos Personalizados / Importados Salvos
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {importedOrCustomTemplates.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {tpl.name}
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)] font-mono-num">
                              {tpl.attributes.length} atrib. · {tpl.resources.length} rec.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onCreateFromImportedTemplate(
                                name.trim() || tpl.name,
                                tpl.id
                              )
                            }
                            className="px-3 py-1.5 min-h-[36px] rounded-lg border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] shrink-0"
                          >
                            Usar Modelo
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmitCharacter} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-start">
                  {/* Portrait Upload & Crop Box */}
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="w-40 h-40 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] overflow-hidden flex items-center justify-center">
                      {portraitPreviewUrl ? (
                        <img
                          src={portraitPreviewUrl}
                          alt="Retrato do novo personagem"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-4 space-y-1 text-[var(--text-muted)]">
                          <Camera className="w-7 h-7 mx-auto opacity-70" aria-hidden="true" />
                          <span className="text-xs block">Retrato (Opcional)</span>
                        </div>
                      )}
                    </div>
                    <input
                      ref={portraitInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      aria-label="Selecionar retrato do personagem"
                      onChange={handlePortraitSelected}
                    />
                    <button
                      type="button"
                      onClick={() => portraitInputRef.current?.click()}
                      className="w-40 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    >
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      {portraitPreviewUrl ? 'Trocar Retrato' : 'Enviar Retrato'}
                    </button>
                  </div>

                  {/* Sheet Identity Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="start-char-name"
                        className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                      >
                        Nome do Personagem *
                      </label>
                      <input
                        id="start-char-name"
                        data-testid="start-char-name"
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (nameError) setNameError('');
                        }}
                        placeholder="Ex.: Kaelen Voss, Lyra Tempestade..."
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                      />
                      {nameError && (
                        <p className="mt-1 text-xs text-red-500">{nameError}</p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="start-char-class"
                        className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                      >
                        Classe / Arquétipo
                      </label>
                      <input
                        id="start-char-class"
                        type="text"
                        value={characterClass}
                        onChange={(e) => setCharacterClass(e.target.value)}
                        placeholder="Ex.: Livre, Guerreiro, Hacker..."
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="start-char-race"
                        className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                      >
                        Raça / Linhagem
                      </label>
                      <input
                        id="start-char-race"
                        type="text"
                        value={race}
                        onChange={(e) => setRace(e.target.value)}
                        placeholder="Opcional"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="start-char-title"
                        className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                      >
                        Título ou Origem
                      </label>
                      <input
                        id="start-char-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Opcional"
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="start-char-level"
                        className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                      >
                        Nível Inicial
                      </label>
                      <input
                        id="start-char-level"
                        type="number"
                        min={1}
                        value={level}
                        onChange={(e) => setLevel(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Personalized Initial Attributes & Resources Builders */}
                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Personalização da Ficha (Opcional — também editável depois)
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      Adicione atributos e barras iniciais do seu próprio sistema ou comece totalmente em branco.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Custom Attributes */}
                    <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        Atributos Iniciais ({customAttrs.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <input
                          type="text"
                          value={newAttrName}
                          onChange={(e) => setNewAttrName(e.target.value)}
                          placeholder="Nome (ex.: Força, Mente)"
                          aria-label="Nome do atributo inicial"
                          className="flex-1 min-w-[130px] px-2.5 py-2 min-h-[40px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                        />
                        <input
                          type="text"
                          value={newAttrShort}
                          onChange={(e) => setNewAttrShort(e.target.value)}
                          placeholder="Sigla"
                          aria-label="Sigla do atributo inicial"
                          className="w-16 px-2.5 py-2 min-h-[40px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs uppercase text-[var(--text-primary)]"
                        />
                        <input
                          type="number"
                          value={newAttrVal}
                          onChange={(e) => setNewAttrVal(Number(e.target.value) || 0)}
                          aria-label="Valor inicial do atributo"
                          className="w-16 px-2.5 py-2 min-h-[40px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xs text-[var(--text-primary)]"
                        />
                        <button
                          type="button"
                          data-testid="start-add-attr-btn"
                          onClick={handleAddCustomAttribute}
                          className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Adicionar
                        </button>
                      </div>

                      {customAttrs.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {customAttrs.map((a, idx) => (
                            <div
                              key={`${a.shortName}_${idx}`}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs"
                            >
                              <span className="truncate text-[var(--text-primary)]">
                                <span className="font-mono-num font-bold mr-1.5">{a.shortName}</span>
                                {a.name}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                                  {a.baseValue}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Remover atributo ${a.name}`}
                                  onClick={() =>
                                    setCustomAttrs((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Custom Resources */}
                    <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5">
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        Recursos Vitais Iniciais ({customResources.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <input
                          type="text"
                          value={newResName}
                          onChange={(e) => setNewResName(e.target.value)}
                          placeholder="Nome (ex.: Vida, Mana, Energia)"
                          aria-label="Nome do recurso inicial"
                          className="flex-1 min-w-[140px] px-2.5 py-2 min-h-[40px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                        />
                        <input
                          type="number"
                          min={0}
                          value={newResMax}
                          onChange={(e) => setNewResMax(Math.max(0, Number(e.target.value) || 0))}
                          aria-label="Máximo inicial do recurso"
                          className="w-20 px-2.5 py-2 min-h-[40px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-xs text-[var(--text-primary)]"
                        />
                        <button
                          type="button"
                          data-testid="start-add-res-btn"
                          onClick={handleAddCustomResource}
                          className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Adicionar
                        </button>
                      </div>

                      {customResources.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {customResources.map((r, idx) => (
                            <div
                              key={`${r.name}_${idx}`}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs"
                            >
                              <span className="truncate text-[var(--text-primary)]">{r.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                                  {r.max}/{r.max}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Remover recurso ${r.name}`}
                                  onClick={() =>
                                    setCustomResources((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body Slots + Enabled Modules Checkboxes */}
                  <div className="space-y-2.5 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeStandardBodySlots}
                        onChange={(e) => setIncludeStandardBodySlots(e.target.checked)}
                      />
                      Incluir espaços corporais anatômicos padrão (Cabeça, Mãos, Torso, Pés, Acessórios...)
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {MODULE_LABELS.map(([key, label]) => (
                        <label
                          key={key}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={enabledModules[key]}
                            onChange={(e) =>
                              setEnabledModules((prev) => ({
                                ...prev,
                                [key]: e.target.checked,
                              }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {rolledFace !== null && customAttrs.length > 0 && (
                    <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyD20Bonus}
                        onChange={(e) => setApplyD20Bonus(e.target.checked)}
                      />
                      <Sparkles className="w-4 h-4 text-[var(--accent-strong)] shrink-0" aria-hidden="true" />
                      <span>
                        Aplicar bônus inicial do d20 (<span className="font-mono-num font-bold">+{d20BonusAmount}</span> em{' '}
                        {customAttrs[0].name})
                      </span>
                    </label>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="submit"
                    data-testid="start-create-submit"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90 whitespace-nowrap"
                    style={{ backgroundColor: 'var(--accent-color)' }}
                  >
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    Criar Ficha Personalizada e Começar
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </main>

      <ImageCropModal
        open={cropOpen}
        imageSrc={cropSrc}
        fileName={cropFileName}
        shape="square"
        title="Ajustar Retrato do Personagem"
        onCancel={() => setCropOpen(false)}
        onConfirmCrop={handleConfirmPortraitCrop}
      />
    </div>
  );
};
