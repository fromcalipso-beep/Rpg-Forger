import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<{
  state: ConfirmState;
  onClose: () => void;
}> = ({ state, onClose }) => {
  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-xl shrink-0 ${
              state.destructive
                ? 'bg-red-500/15 text-red-500'
                : 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
            }`}
          >
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-modal-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              {state.title}
            </h2>
            <p className="mt-1.5 text-sm text-[var(--text-muted)] leading-relaxed">
              {state.message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-medium border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
            className={`px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold transition-all ${
              state.destructive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'text-[var(--accent-contrast)] hover:opacity-90'
            }`}
            style={!state.destructive ? { backgroundColor: 'var(--accent-color)' } : undefined}
          >
            {state.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export interface ToastMessage {
  id: string;
  kind: 'success' | 'error' | 'info';
  text: string;
}

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-14 lg:top-auto lg:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-xs sm:max-w-sm w-[calc(100%-2rem)] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon =
          t.kind === 'success'
            ? CheckCircle2
            : t.kind === 'error'
              ? AlertTriangle
              : Info;
        const tone =
          t.kind === 'success'
            ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-100'
            : t.kind === 'error'
              ? 'border-red-500/40 bg-red-950/95 text-red-100'
              : 'border-[var(--toast-info-border)] bg-[var(--toast-info-bg)] text-[var(--toast-info-text)]';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border shadow-lg backdrop-blur-md ${tone}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs sm:text-sm flex-1 leading-snug">{t.text}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Fechar notificação"
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
