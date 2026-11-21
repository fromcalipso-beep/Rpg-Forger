import React, { useRef, useState } from 'react';
import { Compass, Copy, Download, Plus, Trash2, Upload, UserCheck, X } from 'lucide-react';
import { DataTransferMode } from '../../engine/exportEngine';
import { Character } from '../../types/rpg';
import { exportCharacterAsJson } from '../../storage/database';
import { ImageSlot } from '../shared/ImageSlot';

interface CharacterManagerModalProps {
  open: boolean;
  onClose: () => void;
  characters: Character[];
  activeCharacterId: string | null;
  onSelectCharacter: (id: string) => void;
  onCreatePersonalizedCharacter: (name: string) => void;
  onDuplicateCharacter: (id: string) => void;
  onDeleteCharacter: (id: string, name: string) => void;
  onClearAllCharacters?: () => void;
  onOpenStartPage?: () => void;
  onImportCharacterJson: (file: File, mode?: DataTransferMode) => void;
}

export const CharacterManagerModal: React.FC<CharacterManagerModalProps> = ({
  open,
  onClose,
  characters,
  activeCharacterId,
  onSelectCharacter,
  onCreatePersonalizedCharacter,
  onDuplicateCharacter,
  onDeleteCharacter,
  onClearAllCharacters,
  onOpenStartPage,
  onImportCharacterJson,
}) => {
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [importMode, setImportMode] = useState<DataTransferMode>('with_data');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('Informe o nome do personagem.');
      return;
    }
    setNameError('');
    onCreatePersonalizedCharacter(trimmed);
    setNewName('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="char-manager-title"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2
              id="char-manager-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              Gerenciar Personagens
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Crie fichas personalizadas, importe arquivos ou alterne personagens independentes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar gerenciador de personagens"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Create New Character Form */}
          <form
            onSubmit={handleCreate}
            className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Nova Ficha (Personalizada ou Importada)
              </h3>
              {onOpenStartPage && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenStartPage();
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-strong)] hover:opacity-90"
                >
                  <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                  Personalizar Atributos & d20 3D
                </button>
              )}
            </div>
            <div>
              <label
                htmlFor="new-char-name"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Nome do Personagem
              </label>
              <input
                id="new-char-name"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (nameError) setNameError('');
                }}
                placeholder="Ex.: Thoren Escudo de Pedra"
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm text-[var(--text-primary)]"
              />
              {nameError && (
                <p className="mt-1 text-xs text-red-500">{nameError}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Importar ficha JSON"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onImportCharacterJson(file, importMode);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  Importar JSON ({importMode === 'with_data' ? 'Com dados' : 'Sem dados'})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setImportMode((m) => (m === 'with_data' ? 'without_data' : 'with_data'))
                  }
                  className="px-2.5 py-2 min-h-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Alternar
                </button>
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Criar Ficha Personalizada
              </button>
            </div>
          </form>

          {/* Character Roster */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Fichas Salvas ({characters.length})
              </h3>
              <div className="flex items-center gap-2">
                {onOpenStartPage && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenStartPage();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                    Tela Inicial (d20)
                  </button>
                )}
                {characters.length > 0 && onClearAllCharacters && (
                  <button
                    type="button"
                    data-testid="clear-all-characters-btn"
                    onClick={onClearAllCharacters}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border border-red-500/40 text-xs font-medium text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Limpar Fichas
                  </button>
                )}
              </div>
            </div>

            {characters.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-4 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] text-center">
                Nenhuma ficha salva no momento. Crie um novo personagem acima ou importe um arquivo JSON.
              </p>
            ) : (
              characters.map((char) => {
                const isActive = char.id === activeCharacterId;
                const subtitleParts = [
                  char.identity.characterClass || 'Sem classe',
                  char.identity.race || 'Sem raça',
                  `${char.identity.levelLabel || 'Nível'} ${char.identity.level}`,
                ];

                return (
                  <div
                    key={char.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border transition-colors ${
                      isActive
                        ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ImageSlot
                        imageId={char.identity.portraitImageId}
                        fallbackUrl={char.identity.defaultPortraitUrl}
                        alt={char.identity.name}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                            {char.identity.name}
                          </span>
                          {isActive && (
                            <span className="text-xs font-medium text-[var(--accent-strong)]">
                              · Ativo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {subtitleParts.join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectCharacter(char.id);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)]"
                          style={{ backgroundColor: 'var(--accent-color)' }}
                        >
                          <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          Abrir Ficha
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => exportCharacterAsJson(char)}
                        aria-label={`Exportar JSON de ${char.identity.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        Exportar
                      </button>

                      <button
                        type="button"
                        onClick={() => onDuplicateCharacter(char.id)}
                        aria-label={`Duplicar ${char.identity.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        Duplicar
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteCharacter(char.id, char.identity.name)}
                        aria-label={`Excluir ${char.identity.name}`}
                        className="inline-flex items-center justify-center p-2 min-h-[40px] min-w-[40px] rounded-xl border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
