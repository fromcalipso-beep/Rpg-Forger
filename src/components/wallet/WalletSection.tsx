import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Coins,
  Edit3,
  History,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  adjustCurrencyAmount,
  applyBatchWalletChanges,
  computeWalletTotals,
  consolidateCurrencyChange,
} from '../../engine/walletEngine';
import { Character, CurrencyDef } from '../../types/rpg';
import { createId } from '../../utils/id';
import { ImageSlot } from '../shared/ImageSlot';

interface WalletSectionProps {
  character: Character;
  onUpdateCharacter: (next: Character) => void;
  onConfirmDelete: (title: string, message: string, action: () => void) => void;
  onNotify?: (kind: 'success' | 'error' | 'info', text: string) => void;
  compact?: boolean;
  isEditMode?: boolean;
}

const CURRENCY_COLORS = [
  '#D19A38',
  '#94A3B8',
  '#B45309',
  '#8A67C2',
  '#38BDF8',
  '#34A876',
  '#C94040',
  '#EC4899',
];

export const WalletSection: React.FC<WalletSectionProps> = ({
  character,
  onUpdateCharacter,
  onConfirmDelete,
  onNotify,
  compact = false,
  isEditMode = true,
}) => {
  const currencies = useMemo(
    () => [...(character.wallet?.currencies || [])].sort((a, b) => a.order - b.order),
    [character.wallet?.currencies]
  );

  const totals = useMemo(() => computeWalletTotals(character), [character]);

  // Quick vs Batch addition state
  const [addMode, setAddMode] = useState<'quick' | 'batch'>('quick');
  const [quickCurrencyId, setQuickCurrencyId] = useState<string>('');
  const [quickAmount, setQuickAmount] = useState<string>('');
  const [batchAmounts, setBatchAmounts] = useState<Record<string, string>>({});
  const [txReason, setTxReason] = useState<string>('');

  // History & currency editor modal
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<CurrencyDef | null>(null);
  const [isNewCurrency, setIsNewCurrency] = useState(false);

  const effectiveQuickCurrencyId =
    currencies.find((c) => c.id === quickCurrencyId)?.id || currencies[0]?.id || '';

  const convertibleCount = currencies.filter((c) => c.exchangeRate > 0).length;

  const updateWallet = (patch: Partial<Character['wallet']>) => {
    onUpdateCharacter({
      ...character,
      updatedAt: Date.now(),
      wallet: {
        ...character.wallet,
        ...patch,
      },
    });
  };

  const handleQuickAdjust = (currencyId: string, delta: number, reason?: string) => {
    const res = adjustCurrencyAmount(character, currencyId, delta, reason);
    if (!res.success) {
      onNotify?.('error', res.error || 'Não foi possível ajustar o saldo.');
      return;
    }
    onUpdateCharacter(res.character);
  };

  const handleQuickFormApply = (sign: 1 | -1) => {
    if (!effectiveQuickCurrencyId) return;
    const raw = Number(quickAmount.replace(',', '.'));
    if (!raw || Number.isNaN(raw) || raw <= 0) {
      onNotify?.('error', 'Informe um valor positivo para adicionar ou subtrair.');
      return;
    }
    const res = applyBatchWalletChanges(
      character,
      [{ currencyId: effectiveQuickCurrencyId, delta: sign * raw }],
      {
        preventNegative: sign < 0,
        reason: txReason.trim() || undefined,
      }
    );
    if (!res.success) {
      onNotify?.('error', res.error || 'Saldo insuficiente.');
      return;
    }
    onUpdateCharacter(res.character);
    const curr = currencies.find((c) => c.id === effectiveQuickCurrencyId);
    onNotify?.(
      'success',
      `${sign > 0 ? '+' : '-'}${raw} ${curr?.symbol || ''} ${sign > 0 ? 'somado à' : 'subtraído da'} carteira.`
    );
    setQuickAmount('');
    setTxReason('');
  };

  const handleBatchApply = (sign: 1 | -1) => {
    const deltas = currencies
      .map((c) => {
        const val = Number((batchAmounts[c.id] || '').replace(',', '.'));
        if (!val || Number.isNaN(val) || val <= 0) return null;
        return { currencyId: c.id, delta: sign * val };
      })
      .filter((d): d is { currencyId: string; delta: number } => d !== null);

    if (deltas.length === 0) {
      onNotify?.('error', 'Preencha ao menos uma moeda com valor maior que zero.');
      return;
    }

    const res = applyBatchWalletChanges(character, deltas, {
      preventNegative: sign < 0,
      reason: txReason.trim() || (sign > 0 ? 'Adição em lote' : 'Pagamento em lote'),
    });

    if (!res.success) {
      onNotify?.('error', res.error || 'Saldo insuficiente para completar a operação.');
      return;
    }

    onUpdateCharacter(res.character);
    setBatchAmounts({});
    setTxReason('');
    onNotify?.(
      'success',
      sign > 0
        ? 'Moedas somadas automaticamente à carteira.'
        : 'Valores descontados da carteira.'
    );
  };

  const handleConsolidateChange = () => {
    const next = consolidateCurrencyChange(character);
    if (next === character) {
      onNotify?.('info', 'Nenhum troco acumulado para converter no momento.');
      return;
    }
    onUpdateCharacter(next);
    onNotify?.('success', 'Troco convertido automaticamente para moedas maiores.');
  };

  const handleAddStandardCurrencies = () => {
    const standard: CurrencyDef[] = [
      { id: createId('cur'), name: 'Moedas de Ouro', symbol: 'MO', amount: 0, exchangeRate: 1, color: '#D19A38', order: 0 },
      { id: createId('cur'), name: 'Moedas de Prata', symbol: 'MP', amount: 0, exchangeRate: 0.1, color: '#94A3B8', order: 1 },
      { id: createId('cur'), name: 'Moedas de Cobre', symbol: 'MC', amount: 0, exchangeRate: 0.01, color: '#B45309', order: 2 },
      { id: createId('cur'), name: 'Moedas Especiais', symbol: 'ME', amount: 0, exchangeRate: 0, color: '#8A67C2', order: 3 },
    ];
    updateWallet({
      currencies: standard,
      baseCurrencyId: standard[0].id,
    });
    onNotify?.('success', 'Moedas iniciais adicionadas. Você pode renomear ou ajustar qualquer taxa.');
  };

  const handleSaveCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCurrency || !editingCurrency.name.trim() || !editingCurrency.symbol.trim()) return;

    const normalized: CurrencyDef = {
      ...editingCurrency,
      name: editingCurrency.name.trim(),
      symbol: editingCurrency.symbol.trim(),
      amount: Math.max(0, Number(editingCurrency.amount) || 0),
      exchangeRate: Math.max(0, Number(editingCurrency.exchangeRate) || 0),
    };

    const nextCurrencies = isNewCurrency
      ? [...currencies, normalized]
      : currencies.map((c) => (c.id === normalized.id ? normalized : c));

    const nextBaseId =
      character.wallet.baseCurrencyId &&
      nextCurrencies.some((c) => c.id === character.wallet.baseCurrencyId && c.exchangeRate > 0)
        ? character.wallet.baseCurrencyId
        : nextCurrencies.find((c) => c.exchangeRate > 0)?.id;

    updateWallet({
      currencies: nextCurrencies,
      baseCurrencyId: nextBaseId,
    });
    setEditingCurrency(null);
    onNotify?.(
      'success',
      isNewCurrency
        ? `Moeda "${normalized.name}" adicionada.`
        : `Moeda "${normalized.name}" atualizada.`
    );
  };

  return (
    <section
      key="wallet"
      id="coin-purse-section"
      data-testid="coin-purse-section"
      aria-labelledby="wallet-section-heading"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[var(--accent-strong)] shrink-0" aria-hidden="true" />
            <h2
              id="wallet-section-heading"
              className="scroll-mt-16 font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              Bolsa de Moedas
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {currencies.length} tipo(s) de dinheiro · Fotos opcionais, adição automática e conversão por sistema
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {convertibleCount >= 2 && (
            <button
              type="button"
              onClick={handleConsolidateChange}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Consolidar Troco
            </button>
          )}
          {isEditMode && (
            <button
              type="button"
              onClick={() => {
                setIsNewCurrency(true);
                setEditingCurrency({
                  id: createId('cur'),
                  name: '',
                  symbol: '',
                  amount: 0,
                  exchangeRate: currencies.length === 0 ? 1 : 0,
                  color: CURRENCY_COLORS[currencies.length % CURRENCY_COLORS.length],
                  order: currencies.length,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Nova Moeda
            </button>
          )}
        </div>
      </div>

      {currencies.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            Nenhum tipo de dinheiro configurado ainda. Crie moedas personalizadas para o seu RPG ou carregue um conjunto inicial editável.
          </p>
          <button
            type="button"
            onClick={handleAddStandardCurrencies}
            className="px-3.5 py-2 min-h-[42px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] shrink-0 hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-color)' }}
          >
            Carregar Moedas Iniciais
          </button>
        </div>
      ) : (
        <>
          {/* Consolidated Wealth & Conversion Bar */}
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {totals.hasConvertibleCurrencies && totals.baseCurrency && (
                  <>
                    <div>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        Carteira Consolidada
                      </span>
                      <span className="font-mono-num text-base font-bold text-[var(--text-primary)]">
                        {totals.walletUnifiedTotal} {totals.baseCurrency.symbol}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        Itens no Inventário
                      </span>
                      <span className="font-mono-num text-sm font-semibold text-[var(--text-secondary)]">
                        {totals.inventoryUnifiedTotal} {totals.baseCurrency.symbol}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        Patrimônio Total
                      </span>
                      <span className="font-mono-num text-base font-bold text-[var(--accent-strong)]">
                        {totals.combinedUnifiedTotal} {totals.baseCurrency.symbol}
                      </span>
                    </div>
                  </>
                )}

                {totals.independentCurrencies.length > 0 && (
                  <div>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      Moedas Independentes
                    </span>
                    <span className="font-mono-num text-sm font-semibold text-[var(--text-primary)]">
                      {totals.independentCurrencies
                        .map((c) => `${c.amount} ${c.symbol}`)
                        .join(' · ')}
                    </span>
                  </div>
                )}
              </div>

              {isEditMode && (
                <button
                  type="button"
                  onClick={() => setShowConfig((v) => !v)}
                  aria-expanded={showConfig}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Regras de Conversão
                  {showConfig ? (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>

            {isEditMode && showConfig && (
              <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={character.wallet.enableConversion}
                    onChange={(e) => updateWallet({ enableConversion: e.target.checked })}
                  />
                  Calcular soma consolidada entre moedas conversíveis
                </label>

                {convertibleCount > 0 && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="wallet-base-currency"
                      className="text-[var(--text-muted)]"
                    >
                      Moeda base:
                    </label>
                    <select
                      id="wallet-base-currency"
                      value={totals.baseCurrency?.id || ''}
                      onChange={(e) => updateWallet({ baseCurrencyId: e.target.value })}
                      className="px-2.5 py-1.5 min-h-[36px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      {currencies
                        .filter((c) => c.exchangeRate > 0)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.symbol})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <label className="flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={character.wallet.autoConvertOverflow}
                    onChange={(e) => updateWallet({ autoConvertOverflow: e.target.checked })}
                  />
                  Consolidar troco automaticamente ao adicionar
                </label>
              </div>
            )}
          </div>

          {/* Currency Cards Grid */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 ${compact ? 'gap-3' : 'gap-3.5'}`}>
            {currencies.map((curr) => {
              const isBase = totals.baseCurrency?.id === curr.id;
              const rateRatio =
                curr.exchangeRate > 0 && totals.baseCurrency && totals.baseCurrency.exchangeRate > 0
                  ? Number((curr.exchangeRate / totals.baseCurrency.exchangeRate).toFixed(4))
                  : 0;

              return (
                <div
                  key={curr.id}
                  data-testid={`coin-card-${curr.symbol}`}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ImageSlot
                        imageId={curr.imageId}
                        alt={curr.name}
                        variant="coin"
                        shape="circle"
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: curr.color }}
                            aria-hidden="true"
                          />
                          <span className="font-mono-num text-xs font-semibold text-[var(--text-muted)]">
                            {curr.symbol}
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm text-[var(--text-primary)] truncate mt-0.5">
                          {curr.name}
                        </h3>
                      </div>
                    </div>

                    {isEditMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewCurrency(false);
                          setEditingCurrency({ ...curr });
                        }}
                        aria-label={`Editar moeda ${curr.name}`}
                        className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div>
                    <p className="font-mono-num text-2xl font-bold text-[var(--text-primary)]">
                      {curr.amount}{' '}
                      <span className="text-xs font-semibold text-[var(--text-muted)]">
                        {curr.symbol}
                      </span>
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono-num">
                      {curr.exchangeRate <= 0
                        ? 'Moeda independente'
                        : isBase
                          ? 'Moeda base'
                          : totals.baseCurrency
                            ? `1 ${curr.symbol} = ${rateRatio} ${totals.baseCurrency.symbol}`
                            : `Taxa ${curr.exchangeRate}`}
                    </p>
                  </div>

                  {/* Quick Stepper + Direct Input */}
                  <div className="flex items-center gap-1 pt-1">
                    {[-10, -1].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        aria-label={`${delta} ${curr.symbol}`}
                        onClick={() => handleQuickAdjust(curr.id, delta)}
                        className="px-1.5 py-1.5 min-h-[38px] min-w-[34px] shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        {delta}
                      </button>
                    ))}

                    <input
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`Saldo de ${curr.name}`}
                      value={curr.amount}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isNaN(val) || val < 0) return;
                        updateWallet({
                          currencies: currencies.map((item) =>
                            item.id === curr.id ? { ...item, amount: val } : item
                          ),
                        });
                      }}
                      className="flex-1 min-w-[2.5rem] w-full text-center py-1.5 min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs font-semibold text-[var(--text-primary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />

                    {[1, 10].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        aria-label={`+${delta} ${curr.symbol}`}
                        onClick={() => handleQuickAdjust(curr.id, delta)}
                        className="px-1.5 py-1.5 min-h-[38px] min-w-[34px] shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        +{delta}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Automatic Addition & Batch Loot Panel */}
          <div className="p-3.5 sm:p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Adição & Saque Automático
              </p>
              <div className="flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => setAddMode('quick')}
                  className={`px-2.5 py-1 min-h-[32px] rounded-md text-xs font-semibold transition-colors ${
                    addMode === 'quick'
                      ? 'text-[var(--accent-contrast)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                  style={addMode === 'quick' ? { backgroundColor: 'var(--accent-color)' } : undefined}
                >
                  Rápida (1 Moeda)
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode('batch')}
                  className={`px-2.5 py-1 min-h-[32px] rounded-md text-xs font-semibold transition-colors ${
                    addMode === 'batch'
                      ? 'text-[var(--accent-contrast)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                  style={addMode === 'batch' ? { backgroundColor: 'var(--accent-color)' } : undefined}
                >
                  Lote (Várias Moedas)
                </button>
              </div>
            </div>

            {addMode === 'quick' ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <select
                  aria-label="Selecionar moeda para adição automática"
                  value={effectiveQuickCurrencyId}
                  onChange={(e) => setQuickCurrencyId(e.target.value)}
                  className="sm:col-span-4 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)]"
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min={0}
                  step="any"
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  placeholder="Valor (ex.: 25)"
                  aria-label="Valor para somar ou subtrair"
                  className="sm:col-span-2 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-sm text-[var(--text-primary)]"
                />

                <input
                  type="text"
                  value={txReason}
                  onChange={(e) => setTxReason(e.target.value)}
                  placeholder="Motivo opcional (ex.: Recompensa)"
                  aria-label="Motivo da movimentação"
                  className="sm:col-span-3 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                />

                <div className="sm:col-span-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickFormApply(1)}
                    className="flex-1 px-3 py-2 min-h-[42px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] whitespace-nowrap hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent-color)' }}
                  >
                    Somar (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickFormApply(-1)}
                    className="flex-1 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] whitespace-nowrap"
                  >
                    Subtrair (-)
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {currencies.map((c) => (
                    <div key={c.id}>
                      <label
                        htmlFor={`batch-${c.id}`}
                        className="block text-[11px] font-medium text-[var(--text-muted)] mb-1 truncate"
                      >
                        {c.name} ({c.symbol})
                      </label>
                      <input
                        id={`batch-${c.id}`}
                        type="number"
                        min={0}
                        step="any"
                        placeholder="0"
                        value={batchAmounts[c.id] || ''}
                        onChange={(e) =>
                          setBatchAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-num text-sm text-[var(--text-primary)]"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={txReason}
                    onChange={(e) => setTxReason(e.target.value)}
                    placeholder="Motivo opcional (ex.: Espólio do Baú)"
                    aria-label="Motivo do lote"
                    className="flex-1 px-3 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleBatchApply(1)}
                    className="px-4 py-2 min-h-[42px] rounded-xl text-xs font-semibold text-[var(--accent-contrast)] whitespace-nowrap hover:opacity-90"
                    style={{ backgroundColor: 'var(--accent-color)' }}
                  >
                    Somar Tudo à Carteira
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchApply(-1)}
                    className="px-4 py-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] whitespace-nowrap"
                  >
                    Descontar Lote
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Collapsible Transaction History */}
          {character.wallet.history.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] pt-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-expanded={showHistory}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] py-1"
                >
                  <History className="w-3.5 h-3.5" aria-hidden="true" />
                  Histórico da Carteira ({character.wallet.history.length})
                  {showHistory ? (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>

                {showHistory && isEditMode && (
                  <button
                    type="button"
                    onClick={() => updateWallet({ history: [] })}
                    className="text-xs text-[var(--text-muted)] hover:text-red-500"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {showHistory && (
                <ul className="mt-2 space-y-1 max-h-44 overflow-y-auto text-xs">
                  {character.wallet.history.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-2 py-1 text-[var(--text-secondary)] border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <span className="truncate">{entry.summary}</span>
                      <span className="font-mono-num text-[11px] text-[var(--text-muted)] shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {/* Create / Edit Currency Modal */}
      {editingCurrency && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="currency-modal-title"
        >
          <form
            onSubmit={handleSaveCurrency}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 shadow-2xl"
          >
            <h3
              id="currency-modal-title"
              className="font-display text-lg font-semibold text-[var(--text-primary)]"
            >
              {isNewCurrency ? 'Novo Tipo de Moeda' : `Editar Moeda: ${editingCurrency.name}`}
            </h3>

            {/* Optional Coin Photo with Crop/Adjust */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
              <ImageSlot
                imageId={editingCurrency.imageId}
                alt={editingCurrency.name || 'Moeda'}
                variant="coin"
                shape="circle"
                size="md"
                editable
                onImageChange={(id) =>
                  setEditingCurrency({ ...editingCurrency, imageId: id })
                }
              />
              <div className="text-xs text-[var(--text-muted)] space-y-1">
                <p className="font-semibold text-[var(--text-primary)]">
                  Foto da Moeda (Opcional)
                </p>
                <p>
                  Envie uma imagem da moeda ou ficha do seu sistema e ajuste o recorte circular.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label
                  htmlFor="cur-name"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Nome da Moeda
                </label>
                <input
                  id="cur-name"
                  type="text"
                  required
                  value={editingCurrency.name}
                  onChange={(e) =>
                    setEditingCurrency({ ...editingCurrency, name: e.target.value })
                  }
                  placeholder="Ex.: Créditos, Ienes, Platina"
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label
                  htmlFor="cur-symbol"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Sigla
                </label>
                <input
                  id="cur-symbol"
                  type="text"
                  required
                  value={editingCurrency.symbol}
                  onChange={(e) =>
                    setEditingCurrency({ ...editingCurrency, symbol: e.target.value })
                  }
                  placeholder="MO / CR"
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="cur-amount"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Saldo Atual
                </label>
                <input
                  id="cur-amount"
                  type="number"
                  min={0}
                  step="any"
                  value={editingCurrency.amount}
                  onChange={(e) =>
                    setEditingCurrency({
                      ...editingCurrency,
                      amount: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label
                  htmlFor="cur-rate"
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1"
                >
                  Taxa de Conversão
                </label>
                <input
                  id="cur-rate"
                  type="number"
                  min={0}
                  step="any"
                  value={editingCurrency.exchangeRate}
                  onChange={(e) =>
                    setEditingCurrency({
                      ...editingCurrency,
                      exchangeRate: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono-num text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Use <span className="font-mono-num font-semibold">1</span> para a moeda base, frações ou múltiplos para conversão automática (ex.: <span className="font-mono-num">0.1</span> se 10 unidades valem 1 base; <span className="font-mono-num">10</span> se 1 vale 10 bases), ou <span className="font-mono-num font-semibold">0</span> para moeda independente sem conversão.
            </p>

            <div>
              <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                Cor de Identificação
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {CURRENCY_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Selecionar cor ${hex}`}
                    onClick={() => setEditingCurrency({ ...editingCurrency, color: hex })}
                    className={`w-8 h-8 rounded-lg border-2 transition-transform ${
                      editingCurrency.color === hex
                        ? 'border-[var(--text-primary)] scale-110 ring-2 ring-[var(--accent-color)]'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {!isNewCurrency ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = editingCurrency;
                    setEditingCurrency(null);
                    onConfirmDelete(
                      'Excluir Moeda',
                      `Deseja remover a moeda "${target.name}" (${target.symbol}) da carteira?`,
                      () =>
                        updateWallet({
                          currencies: currencies.filter((c) => c.id !== target.id),
                        })
                    );
                  }}
                  className="px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10"
                >
                  Excluir
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCurrency(null)}
                  className="px-4 py-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-[var(--accent-contrast)] hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  Salvar
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
