import { Character, CurrencyDef, WalletLogEntry } from '../types/rpg';
import { createId } from '../utils/id';

const MAX_WALLET_LOG = 40;

export interface WalletTotalsSummary {
  baseCurrency: CurrencyDef | null;
  walletUnifiedTotal: number;
  inventoryUnifiedTotal: number;
  combinedUnifiedTotal: number;
  hasConvertibleCurrencies: boolean;
  independentCurrencies: CurrencyDef[];
  inventoryTotalsByCurrency: Array<{
    unit: string;
    matchedCurrency?: CurrencyDef;
    totalValue: number;
  }>;
}

export interface BatchDelta {
  currencyId: string;
  delta: number;
}

export interface WalletOperationResult {
  success: boolean;
  character: Character;
  error?: string;
}

function appendWalletLog(history: WalletLogEntry[], summary: string): WalletLogEntry[] {
  const entry: WalletLogEntry = {
    id: createId('wlog'),
    timestamp: Date.now(),
    summary,
  };
  return [entry, ...history].slice(0, MAX_WALLET_LOG);
}

/**
 * Matches an item's currencyUnit string against the character's defined wallet currencies.
 */
export function findCurrencyByUnit(
  currencies: CurrencyDef[],
  unit: string
): CurrencyDef | undefined {
  const norm = unit.trim().toLowerCase();
  if (!norm) return undefined;
  return currencies.find(
    (c) => c.symbol.trim().toLowerCase() === norm || c.name.trim().toLowerCase() === norm
  );
}

/**
 * Normalizes convertible currencies from lowest denomination to highest denomination
 * using integer ratios derived from exchangeRate.
 */
export function consolidateCurrencyChange(character: Character): Character {
  const currencies = [...character.wallet.currencies];
  const convertible = currencies
    .filter((c) => c.exchangeRate > 0)
    .sort((a, b) => a.exchangeRate - b.exchangeRate); // lowest value first

  if (convertible.length < 2) return character;

  const amountMap = new Map<string, number>(
    currencies.map((c) => [c.id, Math.max(0, c.amount)])
  );

  let changed = false;
  for (let i = 0; i < convertible.length - 1; i++) {
    const lower = convertible[i];
    const higher = convertible[i + 1];
    const ratio = higher.exchangeRate / lower.exchangeRate;
    if (ratio <= 1 || !Number.isFinite(ratio)) continue;

    // Handle near-integer floating ratios cleanly (e.g. 0.1 / 0.01 = 10)
    const cleanRatio = Math.round(ratio * 10000) / 10000;
    const currentLower = amountMap.get(lower.id) || 0;
    if (currentLower >= cleanRatio) {
      const carry = Math.floor(currentLower / cleanRatio);
      if (carry >= 1) {
        changed = true;
        const remainder = Number((currentLower - carry * cleanRatio).toFixed(4));
        amountMap.set(lower.id, remainder);
        amountMap.set(higher.id, Number(((amountMap.get(higher.id) || 0) + carry).toFixed(4)));
      }
    }
  }

  if (!changed) return character;

  const nextCurrencies = currencies.map((c) => ({
    ...c,
    amount: amountMap.has(c.id) ? amountMap.get(c.id)! : c.amount,
  }));

  return {
    ...character,
    updatedAt: Date.now(),
    wallet: {
      ...character.wallet,
      currencies: nextCurrencies,
      history: appendWalletLog(character.wallet.history, 'Troco consolidado automaticamente.'),
    },
  };
}

/**
 * Applies one or more currency additions/subtractions atomically with automatic summation.
 */
export function applyBatchWalletChanges(
  character: Character,
  deltas: BatchDelta[],
  options?: { preventNegative?: boolean; reason?: string }
): WalletOperationResult {
  const preventNegative = options?.preventNegative ?? true;
  const aggregated = new Map<string, number>();

  for (const d of deltas) {
    if (!d.delta || Number.isNaN(d.delta)) continue;
    aggregated.set(d.currencyId, (aggregated.get(d.currencyId) || 0) + d.delta);
  }

  if (aggregated.size === 0) {
    return { success: false, character, error: 'Informe um valor diferente de zero.' };
  }

  // Validate before mutating
  if (preventNegative) {
    for (const [cid, delta] of aggregated.entries()) {
      const curr = character.wallet.currencies.find((c) => c.id === cid);
      if (!curr) continue;
      if (curr.amount + delta < 0) {
        return {
          success: false,
          character,
          error: `Saldo insuficiente de ${curr.name} (${curr.symbol}). Atual: ${curr.amount}.`,
        };
      }
    }
  }

  const logParts: string[] = [];
  const nextCurrencies = character.wallet.currencies.map((c) => {
    const delta = aggregated.get(c.id);
    if (!delta) return c;
    const nextAmount = Math.max(0, Number((c.amount + delta).toFixed(4)));
    logParts.push(`${delta > 0 ? `+${delta}` : delta} ${c.symbol}`);
    return { ...c, amount: nextAmount };
  });

  const summaryPrefix = options?.reason ? `${options.reason}: ` : '';
  let nextChar: Character = {
    ...character,
    updatedAt: Date.now(),
    wallet: {
      ...character.wallet,
      currencies: nextCurrencies,
      history: appendWalletLog(
        character.wallet.history,
        `${summaryPrefix}${logParts.join(', ')}`
      ),
    },
  };

  if (character.wallet.autoConvertOverflow) {
    nextChar = consolidateCurrencyChange(nextChar);
  }

  return { success: true, character: nextChar };
}

export function adjustCurrencyAmount(
  character: Character,
  currencyId: string,
  delta: number,
  reason?: string
): WalletOperationResult {
  return applyBatchWalletChanges(character, [{ currencyId, delta }], {
    preventNegative: delta < 0,
    reason,
  });
}

/**
 * Automatically computes per-currency totals, consolidated base total,
 * inventory monetary value totals, and combined wealth.
 */
export function computeWalletTotals(character: Character): WalletTotalsSummary {
  const currencies = [...character.wallet.currencies].sort((a, b) => a.order - b.order);
  const convertible = currencies.filter((c) => c.exchangeRate > 0);
  const independentCurrencies = currencies.filter((c) => c.exchangeRate <= 0);

  const baseCurrency =
    currencies.find((c) => c.id === character.wallet.baseCurrencyId && c.exchangeRate > 0) ||
    convertible.find((c) => c.exchangeRate === 1) ||
    convertible[0] ||
    null;

  let walletUnifiedTotal = 0;
  if (character.wallet.enableConversion && baseCurrency && baseCurrency.exchangeRate > 0) {
    for (const c of convertible) {
      walletUnifiedTotal += (c.amount * c.exchangeRate) / baseCurrency.exchangeRate;
    }
  }

  // Group inventory item monetary values by unit
  const invUnitTotals = new Map<string, number>();
  for (const item of character.inventory) {
    if (item.monetaryValue <= 0 || item.quantity <= 0) continue;
    const unit = (item.currencyUnit || baseCurrency?.symbol || 'MO').trim();
    invUnitTotals.set(unit, (invUnitTotals.get(unit) || 0) + item.monetaryValue * item.quantity);
  }

  let inventoryUnifiedTotal = 0;
  const inventoryTotalsByCurrency: WalletTotalsSummary['inventoryTotalsByCurrency'] = [];

  for (const [unit, totalValue] of invUnitTotals.entries()) {
    const matched = findCurrencyByUnit(currencies, unit);
    inventoryTotalsByCurrency.push({
      unit,
      matchedCurrency: matched,
      totalValue: Number(totalValue.toFixed(2)),
    });
    if (
      character.wallet.enableConversion &&
      baseCurrency &&
      matched &&
      matched.exchangeRate > 0
    ) {
      inventoryUnifiedTotal += (totalValue * matched.exchangeRate) / baseCurrency.exchangeRate;
    }
  }

  walletUnifiedTotal = Number(walletUnifiedTotal.toFixed(2));
  inventoryUnifiedTotal = Number(inventoryUnifiedTotal.toFixed(2));

  return {
    baseCurrency,
    walletUnifiedTotal,
    inventoryUnifiedTotal,
    combinedUnifiedTotal: Number((walletUnifiedTotal + inventoryUnifiedTotal).toFixed(2)),
    hasConvertibleCurrencies: character.wallet.enableConversion && convertible.length > 0 && baseCurrency !== null,
    independentCurrencies,
    inventoryTotalsByCurrency,
  };
}

/**
 * Adds an inventory item's monetary value automatically into the matching currency in the wallet.
 */
export function addInventoryItemValueToWallet(
  character: Character,
  itemId: string,
  units = 1
): WalletOperationResult {
  const item = character.inventory.find((i) => i.id === itemId);
  if (!item) {
    return { success: false, character, error: 'Item não encontrado.' };
  }
  if (item.monetaryValue <= 0) {
    return { success: false, character, error: 'Este item não possui valor monetário definido.' };
  }
  const targetCurrency =
    findCurrencyByUnit(character.wallet.currencies, item.currencyUnit) ||
    character.wallet.currencies[0];

  if (!targetCurrency) {
    return {
      success: false,
      character,
      error: 'Nenhuma moeda configurada na carteira para receber o valor.',
    };
  }

  const amountToAdd = Number((item.monetaryValue * Math.max(1, units)).toFixed(2));
  return adjustCurrencyAmount(
    character,
    targetCurrency.id,
    amountToAdd,
    `Item: ${item.name}`
  );
}
