import React, { useMemo, useRef, useState } from 'react';
import {
  Bold,
  BookOpen,
  Edit3,
  FolderPlus,
  Heading2,
  ImagePlus,
  Italic,
  List,
  Pin,
  Plus,
  Quote,
  Search,
  Trash2,
} from 'lucide-react';
import { saveImageDataUrl } from '../../storage/database';
import { Character, JournalNote } from '../../types/rpg';
import { createId } from '../../utils/id';
import { ImageCropModal } from '../shared/ImageCropModal';
import { ImageSlot } from '../shared/ImageSlot';

interface JournalViewProps {
  character: Character;
  generalNotes: JournalNote[];
  onUpdateCharacter: (next: Character) => void;
  onSaveGeneralNote: (note: JournalNote) => void;
  onDeleteGeneralNote: (noteId: string) => void;
  onConfirmDelete: (title: string, message: string, action: () => void) => void;
  onNotify: (kind: 'success' | 'error' | 'info', text: string) => void;
  isEditMode?: boolean;
}

const NOTE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'geral', label: 'Geral' },
  { value: 'missao', label: 'Missão' },
  { value: 'npc', label: 'NPC' },
  { value: 'local', label: 'Local' },
  { value: 'sessao', label: 'Resumo de Sessão' },
  { value: 'pessoal', label: 'Nota Pessoal' },
];

function renderRichText(content: string): React.ReactNode {
  const lines = content.split('\n');
  return lines.map((line, idx) => {
    const formatInline = (txt: string) => {
      const parts = txt.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
      return parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={pIdx}>{part.slice(1, -1)}</em>;
        }
        return <React.Fragment key={pIdx}>{part}</React.Fragment>;
      });
    };

    if (line.startsWith('## ')) {
      return (
        <h4
          key={idx}
          className="font-display text-base font-semibold text-[var(--text-primary)] mt-2 mb-1"
        >
          {formatInline(line.slice(3))}
        </h4>
      );
    }
    if (line.startsWith('- ')) {
      return (
        <li key={idx} className="ml-4 list-disc text-sm text-[var(--text-secondary)]">
          {formatInline(line.slice(2))}
        </li>
      );
    }
    if (line.startsWith('> ')) {
      return (
        <blockquote
          key={idx}
          className="pl-3 py-1 my-1 border border-[var(--border-subtle)] rounded-lg italic text-sm text-[var(--text-muted)]"
        >
          {formatInline(line.slice(2))}
        </blockquote>
      );
    }
    if (!line.trim()) {
      return <div key={idx} className="h-2" />;
    }
    return (
      <p key={idx} className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {formatInline(line)}
      </p>
    );
  });
}

export const JournalView: React.FC<JournalViewProps> = ({
  character,
  generalNotes,
  onUpdateCharacter,
  onSaveGeneralNote,
  onDeleteGeneralNote,
  onConfirmDelete,
  onNotify,
  isEditMode = true,
}) => {
  const [scope, setScope] = useState<'character' | 'general'>('character');
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [newFolderName, setNewFolderName] = useState('');

  const [editingNote, setEditingNote] = useState<JournalNote | null>(null);
  const [isNewNote, setIsNewNote] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [noteCropSource, setNoteCropSource] = useState<{ src: string; fileName: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const activeNotesList = scope === 'character' ? character.notes : generalNotes;

  const folders = useMemo(() => {
    const base = new Set<string>(character.noteFolders || ['Geral', 'Missões', 'NPCs', 'Locais']);
    for (const n of activeNotesList) {
      if (n.folder) base.add(n.folder);
    }
    return Array.from(base);
  }, [character.noteFolders, activeNotesList]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...activeNotesList]
      .filter((n) => {
        if (folderFilter !== 'all' && n.folder !== folderFilter) return false;
        if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
        if (q) {
          const hay = `${n.title} ${n.content} ${n.folder}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [activeNotesList, folderFilter, categoryFilter, search]);

  const insertFormatting = (prefix: string, suffix = '') => {
    if (!editingNote) return;
    const el = textareaRef.current;
    if (!el) {
      setEditingNote({ ...editingNote, content: editingNote.content + prefix + suffix });
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = editingNote.content.slice(start, end);
    const replacement = `${prefix}${selected || 'texto'}${suffix}`;
    const nextContent =
      editingNote.content.slice(0, start) + replacement + editingNote.content.slice(end);
    setEditingNote({ ...editingNote, content: nextContent });
  };

  const handleAttachImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingNote) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl) {
        setNoteCropSource({ src: dataUrl, fileName: file.name || 'anexo.png' });
      }
      if (imageInputRef.current) imageInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmNoteCrop = async (croppedDataUrl: string, fileName: string) => {
    if (!editingNote) return;
    const saved = await saveImageDataUrl(croppedDataUrl, fileName, 'image/png');
    setEditingNote({
      ...editingNote,
      imageIds: [...editingNote.imageIds, saved.id],
    });
    setNoteCropSource(null);
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote || !editingNote.title.trim()) return;
    const updated: JournalNote = {
      ...editingNote,
      updatedAt: Date.now(),
    };

    if (scope === 'character') {
      const nextNotes = isNewNote
        ? [updated, ...character.notes]
        : character.notes.map((n) => (n.id === updated.id ? updated : n));
      onUpdateCharacter({
        ...character,
        updatedAt: Date.now(),
        notes: nextNotes,
      });
    } else {
      onSaveGeneralNote(updated);
    }

    setEditingNote(null);
    onNotify('success', `Nota "${updated.title}" salva.`);
  };

  const togglePin = (note: JournalNote) => {
    const toggled = { ...note, pinned: !note.pinned, updatedAt: Date.now() };
    if (scope === 'character') {
      onUpdateCharacter({
        ...character,
        notes: character.notes.map((n) => (n.id === note.id ? toggled : n)),
      });
    } else {
      onSaveGeneralNote(toggled);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Diário & Anotações
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Registre missões, NPCs, locais, sessões e notas pessoais com imagens
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsNewNote(true);
              setPreviewMode(false);
              setEditingNote({
                id: createId('note'),
                title: '',
                folder: folderFilter !== 'all' ? folderFilter : folders[0] || 'Geral',
                category: categoryFilter !== 'all' ? categoryFilter : 'geral',
                content: '',
                imageIds: [],
                pinned: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-color)' }}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Nova Nota
          </button>
        </div>

        {/* Scope Switch + Folder Creation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] self-start">
            <button
              type="button"
              onClick={() => setScope('character')}
              className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                scope === 'character'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              Notas de {character.identity.name} ({character.notes.length})
            </button>
            <button
              type="button"
              onClick={() => setScope('general')}
              className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                scope === 'general'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              Notas Gerais da Mesa ({generalNotes.length})
            </button>
          </div>

          {isEditMode && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nova pasta..."
                aria-label="Nome da nova pasta de notas"
                className="px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-xs text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={() => {
                  const v = newFolderName.trim();
                  if (!v || folders.includes(v)) return;
                  onUpdateCharacter({
                    ...character,
                    noteFolders: [...folders, v],
                  });
                  setNewFolderName('');
                }}
                className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                Pasta
              </button>
            </div>
          )}
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="relative">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no diário..."
              aria-label="Buscar anotações"
              className="w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
            />
          </div>

          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            aria-label="Filtrar por pasta"
            className="px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
          >
            <option value="all">Todas as Pastas</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por tipo de registro"
            className="px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
          >
            <option value="all">Todos os Tipos</option>
            {NOTE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center">
          <BookOpen className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" aria-hidden="true" />
          <p className="text-sm text-[var(--text-muted)]">
            Nenhuma anotação encontrada. Crie seu primeiro registro de campanha.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredNotes.map((note) => {
            const catLabel =
              NOTE_CATEGORIES.find((c) => c.value === note.category)?.label || note.category;
            return (
              <article
                key={note.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                        {note.title}
                      </h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        {[
                          note.folder,
                          catLabel,
                          new Date(note.updatedAt).toLocaleDateString('pt-BR'),
                          note.pinned ? 'Fixada' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => togglePin(note)}
                      aria-label={note.pinned ? `Desafixar ${note.title}` : `Fixar ${note.title}`}
                      className={`p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border ${
                        note.pinned
                          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="pt-1 space-y-1">{renderRichText(note.content)}</div>

                  {note.imageIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {note.imageIds.map((imgId) => (
                        <ImageSlot
                          key={imgId}
                          imageId={imgId}
                          alt={`Anexo de ${note.title}`}
                          variant="note"
                          size="md"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {isEditMode && (
                  <div className="flex items-center justify-end gap-1.5 pt-2.5 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewNote(false);
                        setPreviewMode(false);
                        setEditingNote({ ...note, imageIds: [...note.imageIds] });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmDelete(
                          'Excluir Nota',
                          `Deseja excluir a anotação "${note.title}"?`,
                          () => {
                            if (scope === 'character') {
                              onUpdateCharacter({
                                ...character,
                                updatedAt: Date.now(),
                                notes: character.notes.filter((n) => n.id !== note.id),
                              });
                            } else {
                              onDeleteGeneralNote(note.id);
                            }
                          }
                        )
                      }
                      aria-label={`Excluir nota ${note.title}`}
                      className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-[var(--border-strong)] text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Note Create/Edit Modal */}
      {editingNote && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-modal-title"
        >
          <form
            onSubmit={handleSaveNote}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="note-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewNote ? 'Nova Anotação' : `Editar Nota: ${editingNote.title}`}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label
                  htmlFor="note-title"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Título
                </label>
                <input
                  id="note-title"
                  type="text"
                  required
                  value={editingNote.title}
                  onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label
                  htmlFor="note-folder"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Pasta
                </label>
                <select
                  id="note-folder"
                  value={editingNote.folder}
                  onChange={(e) => setEditingNote({ ...editingNote, folder: e.target.value })}
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                >
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="note-cat"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Tipo de Registro
                </label>
                <select
                  id="note-cat"
                  value={editingNote.category}
                  onChange={(e) => setEditingNote({ ...editingNote, category: e.target.value })}
                  className="w-full px-3 py-2.5 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                >
                  {NOTE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] pb-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingNote.pinned}
                    onChange={(e) => setEditingNote({ ...editingNote, pinned: e.target.checked })}
                  />
                  Fixar no topo
                </label>
              </div>
            </div>

            {/* Rich Text Toolbar */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Negrito"
                    onClick={() => insertFormatting('**', '**')}
                    className="p-2 min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  >
                    <Bold className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Itálico"
                    onClick={() => insertFormatting('*', '*')}
                    className="p-2 min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  >
                    <Italic className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Título"
                    onClick={() => insertFormatting('\n## ', '')}
                    className="p-2 min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  >
                    <Heading2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Lista"
                    onClick={() => insertFormatting('\n- ', '')}
                    className="p-2 min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  >
                    <List className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Citação"
                    onClick={() => insertFormatting('\n> ', '')}
                    className="p-2 min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  >
                    <Quote className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewMode((v) => !v)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                >
                  {previewMode ? 'Editar Texto' : 'Pré-visualizar'}
                </button>
              </div>

              {previewMode ? (
                <div className="min-h-[160px] p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-1">
                  {renderRichText(editingNote.content || 'Sem conteúdo.')}
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  rows={7}
                  value={editingNote.content}
                  onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                  placeholder="Escreva suas anotações da sessão, pistas, história ou detalhes de NPCs..."
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              )}
            </div>

            {/* Image Attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  Imagens Anexadas ({editingNote.imageIds.length})
                </span>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Anexar imagem na nota"
                  onChange={handleAttachImage}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-xl border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                  Anexar Imagem
                </button>
              </div>

              {editingNote.imageIds.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {editingNote.imageIds.map((imgId) => (
                    <div key={imgId} className="flex flex-col items-center gap-1">
                      <ImageSlot
                        imageId={imgId}
                        alt="Anexo da nota"
                        variant="note"
                        size="md"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditingNote({
                            ...editingNote,
                            imageIds: editingNote.imageIds.filter((id) => id !== imgId),
                          })
                        }
                        className="text-[11px] text-red-500 hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                style={{ backgroundColor: 'var(--accent-color)' }}
              >
                Salvar Nota
              </button>
            </div>
          </form>
        </div>
      )}

      <ImageCropModal
        open={Boolean(noteCropSource)}
        imageSrc={noteCropSource?.src || ''}
        fileName={noteCropSource?.fileName}
        shape="square"
        title="Ajustar e Recortar Anexo"
        onCancel={() => setNoteCropSource(null)}
        onConfirmCrop={handleConfirmNoteCrop}
      />
    </div>
  );
};
