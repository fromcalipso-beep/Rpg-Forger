import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Edit3,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Character, KnowledgeEntry, KnowledgeKind } from '../../types/rpg';
import { createId } from '../../utils/id';
import { ImageSlot } from '../shared/ImageSlot';

interface KnowledgeSectionProps {
  character: Character;
  onUpdateCharacter: (next: Character) => void;
  onConfirmDelete: (title: string, message: string, action: () => void) => void;
  onNotify?: (kind: 'success' | 'error' | 'info', text: string) => void;
  isEditMode?: boolean;
}

const KIND_OPTIONS: Array<{ value: KnowledgeKind; label: string }> = [
  { value: 'book', label: 'Livro / Tomo' },
  { value: 'shell', label: 'Concha / Relíquia' },
  { value: 'lore', label: 'Saber & História' },
  { value: 'language', label: 'Idioma / Escrita' },
  { value: 'recipe', label: 'Receita & Ofício' },
  { value: 'study', label: 'Estudo / Pesquisa' },
  { value: 'other', label: 'Outro Saber' },
];

const KIND_LABEL_MAP: Record<string, string> = {
  book: 'Livro',
  shell: 'Concha',
  lore: 'Saber & História',
  language: 'Idioma',
  recipe: 'Receita & Ofício',
  study: 'Estudo',
  other: 'Outro',
};

export const KnowledgeSection: React.FC<KnowledgeSectionProps> = ({
  character,
  onUpdateCharacter,
  onConfirmDelete,
  onNotify,
  isEditMode = true,
}) => {
  const entries = character.knowledge || [];
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [isNew, setIsNew] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (kindFilter !== 'all' && entry.kind !== kindFilter) return false;
      if (q) {
        const hay = `${entry.title} ${entry.source || ''} ${entry.summary} ${entry.details} ${entry.progress}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, kindFilter, search]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !editingEntry.title.trim()) return;

    const cleaned: KnowledgeEntry = {
      ...editingEntry,
      title: editingEntry.title.trim(),
      source: editingEntry.source?.trim() || '',
      summary: editingEntry.summary.trim(),
      details: editingEntry.details.trim(),
      progress: editingEntry.progress.trim() || 'Aprendido',
      learnedAt: editingEntry.learnedAt?.trim() || '',
    };

    const nextKnowledge = isNew
      ? [cleaned, ...entries]
      : entries.map((k) => (k.id === cleaned.id ? cleaned : k));

    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      knowledge: nextKnowledge,
    });
    setEditingEntry(null);
    onNotify?.(
      'success',
      isNew
        ? `"${cleaned.title}" adicionado aos Livros & Conhecimentos.`
        : `"${cleaned.title}" atualizado.`
    );
  };

  return (
    <section
      key="knowledge"
      id="knowledge-section"
      data-testid="knowledge-section"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[var(--accent-strong)] shrink-0" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Livros & Conchas
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Livros lidos, conchas, idiomas, receitas e saberes registrados separadamente das perícias e habilidades
          </p>
        </div>

        {isEditMode && (
          <button
            type="button"
            onClick={() => {
              setIsNew(true);
              setEditingEntry({
                id: createId('knw'),
                title: '',
                kind: 'book',
                source: '',
                summary: '',
                details: '',
                progress: 'Lido por completo',
                learnedAt: '',
                createdAt: Date.now(),
              });
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Novo Livro / Concha
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setKindFilter('all')}
              className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                kindFilter === 'all'
                  ? 'text-[var(--accent-contrast)] font-semibold shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={kindFilter === 'all' ? { backgroundColor: 'var(--accent-color)' } : undefined}
            >
              Todos ({entries.length})
            </button>
            {KIND_OPTIONS.map((opt) => {
              const count = entries.filter((e) => e.kind === opt.value).length;
              if (count === 0) return null;
              const active = kindFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setKindFilter(opt.value)}
                  className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-[var(--accent-contrast)] font-semibold shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  style={active ? { backgroundColor: 'var(--accent-color)' } : undefined}
                >
                  {KIND_LABEL_MAP[opt.value] || opt.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative sm:w-56">
            <Search
              className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar livro, concha ou saber..."
              aria-label="Buscar livros, conchas e conhecimentos"
              className="w-full pl-8 pr-3 py-2 min-h-[38px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-3">
          {entries.length === 0
            ? 'Nenhum livro, concha ou conhecimento registrado ainda. Ative o Modo Edição para cadastrar registros fora das perícias.'
            : 'Nenhum registro corresponde ao filtro atual.'}
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {filtered.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const kindLabel = KIND_LABEL_MAP[entry.kind] || entry.kind;
            const metaParts = [
              kindLabel,
              entry.source,
              entry.progress,
              entry.learnedAt,
            ].filter(Boolean);

            return (
              <article key={entry.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {entry.imageId && (
                      <ImageSlot
                        imageId={entry.imageId}
                        alt={entry.title}
                        variant="note"
                        size="sm"
                      />
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                        {entry.title}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {metaParts.join(' · ')}
                      </p>
                      {entry.summary && (
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                          {entry.summary}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {entry.details && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        aria-expanded={isExpanded}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] whitespace-nowrap"
                      >
                        {isExpanded ? 'Recolher' : 'Ler Mais'}
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}

                    {isEditMode && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsNew(false);
                            setEditingEntry({ ...entry });
                          }}
                          aria-label={`Editar conhecimento ${entry.title}`}
                          className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onConfirmDelete(
                              'Excluir Conhecimento',
                              `Deseja remover "${entry.title}" da lista de livros e conhecimentos?`,
                              () =>
                                onUpdateCharacter({
                                  ...character,
                                  updatedAt: Date.now(),
                                  knowledge: entries.filter((k) => k.id !== entry.id),
                                })
                            )
                          }
                          aria-label={`Excluir conhecimento ${entry.title}`}
                          className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isExpanded && entry.details && (
                  <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {entry.details}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Knowledge Modal */}
      {editingEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="knowledge-modal-title"
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="knowledge-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNew ? 'Novo Livro, Concha ou Conhecimento' : `Editar: ${editingEntry.title}`}
            </h3>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              <ImageSlot
                imageId={editingEntry.imageId}
                alt={editingEntry.title || 'Capa'}
                variant="note"
                size="md"
                editable
                onImageChange={(id) => setEditingEntry({ ...editingEntry, imageId: id })}
              />

              <div className="flex-1 w-full space-y-3">
                <div>
                  <label
                    htmlFor="knw-title"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                  >
                    Título do Livro / Saber
                  </label>
                  <input
                    id="knw-title"
                    type="text"
                    required
                    value={editingEntry.title}
                    onChange={(e) => setEditingEntry({ ...editingEntry, title: e.target.value })}
                    placeholder="Ex.: Bestiário das Montanhas, Antigo Élfico..."
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="knw-kind"
                      className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                    >
                      Tipo
                    </label>
                    <select
                      id="knw-kind"
                      value={editingEntry.kind}
                      onChange={(e) => setEditingEntry({ ...editingEntry, kind: e.target.value })}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    >
                      {KIND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="knw-progress"
                      className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                    >
                      Estágio / Domínio
                    </label>
                    <input
                      id="knw-progress"
                      type="text"
                      value={editingEntry.progress}
                      onChange={(e) =>
                        setEditingEntry({ ...editingEntry, progress: e.target.value })
                      }
                      placeholder="Ex.: Lido, Cap. 3/5, Fluente"
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="knw-source"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Origem / Autor / Mestre (Opcional)
                </label>
                <input
                  id="knw-source"
                  type="text"
                  value={editingEntry.source || ''}
                  onChange={(e) => setEditingEntry({ ...editingEntry, source: e.target.value })}
                  placeholder="Ex.: Biblioteca Real, Mestre Kael"
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="knw-when"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Sessão / Momento (Opcional)
                </label>
                <input
                  id="knw-when"
                  type="text"
                  value={editingEntry.learnedAt || ''}
                  onChange={(e) => setEditingEntry({ ...editingEntry, learnedAt: e.target.value })}
                  placeholder="Ex.: Sessão 4"
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="knw-summary"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Resumo do que foi aprendido
              </label>
              <input
                id="knw-summary"
                type="text"
                value={editingEntry.summary}
                onChange={(e) => setEditingEntry({ ...editingEntry, summary: e.target.value })}
                placeholder="Breve síntese de 1 linha..."
                className="w-full px-3 py-2.5 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label
                htmlFor="knw-details"
                className="block text-xs font-medium text-[var(--text-muted)] mb-1"
              >
                Conteúdo Detalhado & Segredos Anotados
              </label>
              <textarea
                id="knw-details"
                rows={4}
                value={editingEntry.details}
                onChange={(e) => setEditingEntry({ ...editingEntry, details: e.target.value })}
                placeholder="Trechos importantes, fórmulas, traduções, mapas ou fatos descobertos..."
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Salvar Conhecimento
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
