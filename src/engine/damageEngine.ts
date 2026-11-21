import { AttributeDef, Character, InventoryItem } from '../types/rpg';
import { AttributeBreakdown, computeAllAttributes, getUniqueEquippedItems } from './attributes';

export interface ResolvedDamageStat {
  attributeId: string;
  name: string;
  shortName: string;
  value: number;
}

export interface ResolvedDamageResult {
  hasDamage: boolean;
  rawFormula: string;
  resolvedText: string;
  diceParts: string[];
  flatBase: number;
  statsTotal: number;
  flatTotal: number;
  usedStats: ResolvedDamageStat[];
  minTotal: number | null;
  maxTotal: number | null;
}

export interface EquippedWeaponDamageEntry {
  item: InventoryItem;
  damage: ResolvedDamageResult;
}

function normalizeLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[\p{L}\p{N}_]/u.test(ch);
}

interface AttrMatchCandidate {
  normalizedKey: string;
  attr: AttributeDef;
}

type FormulaToken =
  | { kind: 'dice'; sign: 1 | -1; count: number; sides: number; raw: string }
  | { kind: 'num'; value: number }
  | { kind: 'stat'; attr: AttributeDef; value: number }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' }
  | { kind: 'text'; text: string };

function buildAttributeCandidates(attributes: AttributeDef[]): AttrMatchCandidate[] {
  const candidates: AttrMatchCandidate[] = [];
  for (const attr of attributes) {
    const normName = normalizeLookup(attr.name);
    if (normName) {
      candidates.push({ normalizedKey: normName, attr });
    }
    const normShort = normalizeLookup(attr.shortName);
    if (normShort && normShort !== normName) {
      candidates.push({ normalizedKey: normShort, attr });
    }
  }
  // Longest first so multi-word or longer names match before short abbreviations
  candidates.sort((a, b) => b.normalizedKey.length - a.normalizedKey.length);
  return candidates;
}

/**
 * Safe recursive-descent arithmetic parser for numeric/stat expressions (+, -, *, /, parentheses).
 */
function evaluateArithmeticTokens(
  tokens: Array<{ kind: 'num'; value: number } | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' }>
): number | null {
  if (tokens.length === 0) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;

    while (pos < tokens.length) {
      const next = peek();
      if (next?.kind === 'op' && (next.op === '+' || next.op === '-')) {
        consume();
        const right = parseTerm();
        if (right === null) return null;
        left = next.op === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;

    while (pos < tokens.length) {
      const next = peek();
      if (next?.kind === 'op' && (next.op === '*' || next.op === '/')) {
        consume();
        const right = parseFactor();
        if (right === null) return null;
        if (next.op === '/') {
          if (right === 0) return null;
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parseFactor(): number | null {
    const next = peek();
    if (!next) return null;

    if (next.kind === 'op' && (next.op === '+' || next.op === '-')) {
      consume();
      const val = parseFactor();
      if (val === null) return null;
      return next.op === '-' ? -val : val;
    }

    if (next.kind === 'op' && next.op === '(') {
      consume();
      const inner = parseExpression();
      if (inner === null) return null;
      const closing = peek();
      if (closing?.kind === 'op' && closing.op === ')') {
        consume();
      }
      return inner;
    }

    if (next.kind === 'num') {
      consume();
      return next.value;
    }

    return null;
  }

  const result = parseExpression();
  if (result === null || !Number.isFinite(result) || pos !== tokens.length) {
    return null;
  }
  return Math.round(result * 100) / 100;
}

/**
 * Extracts raw damage formula from an inventory item, supporting legacy customFields ('Dano Base', 'Dano').
 */
export function getItemDamageFormula(item: InventoryItem): string {
  if (item.damageText && item.damageText.trim()) {
    return item.damageText.trim();
  }
  const legacyField = (item.customFields || []).find((cf) =>
    /^dano(\s+base|\s+atual)?$/i.test(cf.label.trim())
  );
  return legacyField?.value?.trim() || '';
}

/**
 * Resolves a damage expression (e.g. "3d5 + 60 + Carisma + Vontade" or "2d8 + FOR cortante")
 * plus any explicitly selected scaling attribute IDs using the character's current effective attribute totals.
 */
export function resolveDamageExpression(
  character: Character,
  formulaText: string,
  selectedAttributeIds: string[] = [],
  precomputedAttributes?: Record<string, AttributeBreakdown>
): ResolvedDamageResult {
  const rawFormula = (formulaText || '').trim();
  const attrBreakdowns = precomputedAttributes ?? computeAllAttributes(character);
  const attrById = new Map(character.attributes.map((a) => [a.id, a]));
  const candidates = buildAttributeCandidates(character.attributes);

  const tokens: FormulaToken[] = [];
  const referencedAttrIds = new Set<string>();
  const usedStatsMap = new Map<string, ResolvedDamageStat>();

  const recordStat = (attr: AttributeDef, value: number) => {
    if (!usedStatsMap.has(attr.id)) {
      usedStatsMap.set(attr.id, {
        attributeId: attr.id,
        name: attr.name,
        shortName: attr.shortName,
        value,
      });
    }
  };

  let idx = 0;
  const len = rawFormula.length;

  while (idx < len) {
    const ch = rawFormula[idx];
    if (/\s/.test(ch)) {
      idx += 1;
      continue;
    }

    // 1. Operators / Parentheses
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push({ kind: 'op', op: ch });
      idx += 1;
      continue;
    }

    // 2. Dice notation (e.g. 3d5, 2d8, 1D20)
    const slice = rawFormula.slice(idx);
    const diceMatch = /^(\d+)\s*[dD]\s*(\d+)(?![\p{L}\p{N}_])/u.exec(slice);
    if (diceMatch && !isWordChar(rawFormula[idx - 1])) {
      const count = Math.max(1, Number(diceMatch[1]));
      const sides = Math.max(1, Number(diceMatch[2]));
      tokens.push({
        kind: 'dice',
        sign: 1,
        count,
        sides,
        raw: `${count}d${sides}`,
      });
      idx += diceMatch[0].length;
      continue;
    }

    // 3. Plain number (integer or decimal)
    const numMatch = /^(\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_])/u.exec(slice);
    if (numMatch && !isWordChar(rawFormula[idx - 1])) {
      const numVal = Number(numMatch[1].replace(',', '.'));
      if (!Number.isNaN(numVal)) {
        tokens.push({ kind: 'num', value: numVal });
        idx += numMatch[0].length;
        continue;
      }
    }

    // 4. Attribute name or shortName (Unicode + accent-insensitive, word-boundary safe)
    if (!isWordChar(rawFormula[idx - 1])) {
      const normSlice = normalizeLookup(slice);
      let matchedCandidate: { cand: AttrMatchCandidate; rawAdvance: number } | null = null;

      for (const cand of candidates) {
        if (!normSlice.startsWith(cand.normalizedKey)) continue;

        // Walk original slice until normalized length equals cand.normalizedKey.length
        let endOffset = 0;
        let accumulated = '';
        while (endOffset < slice.length && accumulated.length < cand.normalizedKey.length) {
          accumulated = normalizeLookup(slice.slice(0, endOffset + 1));
          endOffset += 1;
        }
        // Include any trailing combining marks on the last character
        while (
          endOffset < slice.length &&
          /[\u0300-\u036f]/.test(slice[endOffset])
        ) {
          endOffset += 1;
        }

        const charAfter = slice[endOffset];
        if (!isWordChar(charAfter)) {
          matchedCandidate = { cand, rawAdvance: endOffset };
          break;
        }
      }

      if (matchedCandidate) {
        const attr = matchedCandidate.cand.attr;
        const val = attrBreakdowns[attr.id]?.totalValue ?? attr.baseValue;
        referencedAttrIds.add(attr.id);
        recordStat(attr, val);
        tokens.push({ kind: 'stat', attr, value: val });
        idx += matchedCandidate.rawAdvance;
        continue;
      }
    }

    // 5. Fallback descriptive word (e.g., "cortante", "fogo", "por", "turno")
    const wordMatch = /^[^\s+\-*/()]+/.exec(slice);
    if (wordMatch) {
      tokens.push({ kind: 'text', text: wordMatch[0] });
      idx += wordMatch[0].length;
      continue;
    }

    idx += 1;
  }

  // Extract dice terms (tracking sign if preceded by '-' / '+'), numeric/stat arithmetic terms, and text words
  const diceTokens: Array<{ sign: 1 | -1; count: number; sides: number; raw: string }> = [];
  const textTokens: string[] = [];

  // Build arithmetic expression stream without dice or text words
  const arithNumbersOnly: Array<
    { kind: 'num'; value: number } | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' }
  > = [];
  const arithStatsZero: Array<
    { kind: 'num'; value: number } | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' }
  > = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.kind === 'dice') {
      // Check if an operator immediately preceded this dice token in arith arrays
      let sign: 1 | -1 = 1;
      const lastArith = arithNumbersOnly[arithNumbersOnly.length - 1];
      if (lastArith?.kind === 'op' && (lastArith.op === '+' || lastArith.op === '-')) {
        sign = lastArith.op === '-' ? -1 : 1;
        arithNumbersOnly.pop();
        arithStatsZero.pop();
      }
      diceTokens.push({ sign, count: tok.count, sides: tok.sides, raw: tok.raw });
      continue;
    }

    if (tok.kind === 'text') {
      // Drop any dangling unary operator before a descriptive word (e.g., "2d8 + cortante")
      const lastArith = arithNumbersOnly[arithNumbersOnly.length - 1];
      if (lastArith?.kind === 'op' && (lastArith.op === '+' || lastArith.op === '-')) {
        arithNumbersOnly.pop();
        arithStatsZero.pop();
      }
      textTokens.push(tok.text);
      continue;
    }

    if (tok.kind === 'num') {
      arithNumbersOnly.push({ kind: 'num', value: tok.value });
      arithStatsZero.push({ kind: 'num', value: tok.value });
      continue;
    }

    if (tok.kind === 'stat') {
      arithNumbersOnly.push({ kind: 'num', value: tok.value });
      arithStatsZero.push({ kind: 'num', value: 0 });
      continue;
    }

    if (tok.kind === 'op') {
      // Avoid leading '+' at the start of an arithmetic stream (e.g., right after 3d5)
      if (tok.op === '+' && arithNumbersOnly.length === 0) {
        continue;
      }
      arithNumbersOnly.push(tok);
      arithStatsZero.push(tok);
    }
  }

  // Strip any trailing dangling binary operators before evaluating
  while (arithNumbersOnly.length > 0) {
    const tail = arithNumbersOnly[arithNumbersOnly.length - 1];
    if (tail.kind === 'op' && tail.op !== ')') {
      arithNumbersOnly.pop();
      arithStatsZero.pop();
    } else {
      break;
    }
  }

  const hasExplicitArithmetic = arithNumbersOnly.some((t) => t.kind === 'num');
  const evaluatedWithStats = hasExplicitArithmetic
    ? evaluateArithmeticTokens(arithNumbersOnly)
    : 0;
  const evaluatedFlatOnly = hasExplicitArithmetic
    ? evaluateArithmeticTokens(arithStatsZero)
    : 0;

  let flatBase = evaluatedFlatOnly ?? 0;
  let flatWithFormulaStats = evaluatedWithStats ?? 0;

  // Fallback if complex parentheses/operators prevented full arithmetic parse
  if (evaluatedWithStats === null && hasExplicitArithmetic) {
    let sign: 1 | -1 = 1;
    let sumAll = 0;
    let sumNums = 0;
    for (const tok of tokens) {
      if (tok.kind === 'op' && tok.op === '-') sign = -1;
      else if (tok.kind === 'op' && tok.op === '+') sign = 1;
      else if (tok.kind === 'num') {
        sumAll += sign * tok.value;
        sumNums += sign * tok.value;
        sign = 1;
      } else if (tok.kind === 'stat') {
        sumAll += sign * tok.value;
        sign = 1;
      }
    }
    flatBase = sumNums;
    flatWithFormulaStats = sumAll;
  }

  // Append selectedAttributeIds that weren't already referenced inside rawFormula
  let extraSelectedStatsTotal = 0;
  for (const attrId of selectedAttributeIds) {
    if (referencedAttrIds.has(attrId)) continue;
    const attr = attrById.get(attrId);
    if (!attr) continue;
    const val = attrBreakdowns[attr.id]?.totalValue ?? attr.baseValue;
    referencedAttrIds.add(attr.id);
    recordStat(attr, val);
    extraSelectedStatsTotal += val;
  }

  const flatTotal = Math.round((flatWithFormulaStats + extraSelectedStatsTotal) * 100) / 100;
  const statsTotal = Math.round((flatTotal - flatBase) * 100) / 100;
  const usedStats = Array.from(usedStatsMap.values());

  const diceParts = diceTokens.map((d, index) =>
    d.sign < 0 ? `- ${d.raw}` : index === 0 ? d.raw : `+ ${d.raw}`
  );

  const hasNumericOrStatComponent = hasExplicitArithmetic || usedStats.length > 0;
  const hasDamage = diceTokens.length > 0 || hasNumericOrStatComponent || textTokens.length > 0;

  if (!hasDamage) {
    return {
      hasDamage: false,
      rawFormula,
      resolvedText: '',
      diceParts: [],
      flatBase: 0,
      statsTotal: 0,
      flatTotal: 0,
      usedStats: [],
      minTotal: null,
      maxTotal: null,
    };
  }

  // Format clean resolved string, e.g. "3d5 + 86" or "2d8 + 17 cortante" or "26"
  const parts: string[] = [];
  if (diceParts.length > 0) {
    parts.push(diceParts.join(' '));
  }

  if (diceTokens.length > 0) {
    if (flatTotal > 0) {
      parts.push(`+ ${flatTotal}`);
    } else if (flatTotal < 0) {
      parts.push(`- ${Math.abs(flatTotal)}`);
    } else if (usedStats.length > 0 && flatTotal === 0) {
      parts.push('+ 0');
    }
  } else if (hasNumericOrStatComponent) {
    parts.push(`${flatTotal}`);
  }

  if (textTokens.length > 0) {
    parts.push(textTokens.join(' '));
  }

  const resolvedText = parts.join(' ').trim();

  let minTotal: number | null = null;
  let maxTotal: number | null = null;
  if (diceTokens.length > 0 || hasNumericOrStatComponent) {
    const diceMin = diceTokens.reduce((sum, d) => sum + d.sign * d.count, 0);
    const diceMax = diceTokens.reduce((sum, d) => sum + d.sign * d.count * d.sides, 0);
    minTotal = Math.round((Math.min(diceMin, diceMax) + flatTotal) * 100) / 100;
    maxTotal = Math.round((Math.max(diceMin, diceMax) + flatTotal) * 100) / 100;
  }

  return {
    hasDamage: true,
    rawFormula,
    resolvedText,
    diceParts: diceTokens.map((d) => d.raw),
    flatBase,
    statsTotal,
    flatTotal,
    usedStats,
    minTotal,
    maxTotal,
  };
}

/**
 * Resolves damage for an inventory item / weapon using the character's current attributes.
 */
export function resolveItemDamage(
  character: Character,
  item: InventoryItem,
  precomputedAttributes?: Record<string, AttributeBreakdown>
): ResolvedDamageResult {
  const formula = getItemDamageFormula(item);
  return resolveDamageExpression(
    character,
    formula,
    item.damageAttributeIds || [],
    precomputedAttributes
  );
}

/**
 * Returns all currently equipped unique items/weapons that have a damage formula or stat scaling.
 */
export function getEquippedWeaponsWithDamage(
  character: Character,
  precomputedAttributes?: Record<string, AttributeBreakdown>
): EquippedWeaponDamageEntry[] {
  const attrs = precomputedAttributes ?? computeAllAttributes(character);
  const equipped = getUniqueEquippedItems(character);
  const entries: EquippedWeaponDamageEntry[] = [];

  for (const item of equipped) {
    const damage = resolveItemDamage(character, item, attrs);
    if (damage.hasDamage) {
      entries.push({ item, damage });
    }
  }
  return entries;
}
