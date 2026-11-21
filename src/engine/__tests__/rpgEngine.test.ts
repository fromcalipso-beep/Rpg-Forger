import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateAbility,
  adjustAbilityCounters,
  advanceRound,
  advanceTurn,
  deactivateAbility,
  duplicateAbilityAsCopy,
  formatAbilityCopyText,
  resetCombat,
  resolveAbilityRole,
  resolvePendingConfirmation,
  undoLastTurn,
} from '../combatEngine';
import {
  computeAllAttributes,
  computeResourceEffective,
  computeTotalInventoryWeight,
} from '../attributes';
import {
  BODY_PART_LAYOUT,
  equipItemToSlot,
  organizeEquipmentSlotsForBody,
  splitItemStack,
  stackCompatibleItems,
  unequipSlotEntry,
} from '../inventoryEngine';
import {
  createBlankTemplate,
  createCharacterFromTemplate,
  createPersonalizedCharacter,
  createTemplateFromCharacter,
  createUniversalFantasyTemplate,
  migrateAndValidateCharacter,
} from '../templateEngine';
import {
  addInventoryItemValueToWallet,
  applyBatchWalletChanges,
  computeWalletTotals,
  consolidateCurrencyChange,
} from '../walletEngine';
import { buildSeedCharacterFixtures, buildSeedData } from '../../data/seedCharacters';
import {
  THEME_LIST,
  computeThemeRuntime,
  getContrastTextColor,
  normalizeThemeMode,
} from '../themeEngine';
import {
  parseImportedSheetOrTemplateJson,
  prepareBackupPayload,
  stripCharacterDataForStructureExport,
  stripTemplateDataForStructureExport,
} from '../exportEngine';
import { computeCroppedSourceRect } from '../imageCropEngine';
import {
  applyPlayerResourceDelta,
  applyPlayerXpDelta,
  applyRandomResourceDelta,
  applyRandomXpDelta,
  rollRandomInt,
} from '../randomEngine';
import {
  getEquippedWeaponsWithDamage,
  getItemDamageFormula,
  resolveDamageExpression,
  resolveItemDamage,
} from '../damageEngine';
import {
  clampD20Face,
  createManualD20Entry,
  detectD20Critical,
  formatD20Summary,
  getCharacterD20Modifiers,
  rollD20Mode,
} from '../d20Engine';

function getKaelen() {
  return buildSeedCharacterFixtures().characters[0];
}

test('Theme engine restricts presets to Light B&W, Dark B&W, and Custom with legacy migration and contrast ink', () => {
  assert.deepEqual(
    THEME_LIST.map((t) => t.id),
    ['light', 'dark', 'custom']
  );

  assert.equal(normalizeThemeMode('light'), 'light');
  assert.equal(normalizeThemeMode('dark'), 'dark');
  assert.equal(normalizeThemeMode('custom'), 'custom');
  // Legacy theme IDs map cleanly to monochrome light/dark
  assert.equal(normalizeThemeMode('white_gold'), 'light');
  assert.equal(normalizeThemeMode('black_red'), 'dark');
  assert.equal(normalizeThemeMode('blue'), 'dark');
  assert.equal(normalizeThemeMode('unknown_theme'), 'dark');
  assert.equal(normalizeThemeMode(undefined), 'dark');

  // Monochrome high-contrast polarity
  assert.equal(getContrastTextColor('#FAFAFA'), '#0B1018');
  assert.equal(getContrastTextColor('#18181B'), '#FFFFFF');
  assert.equal(getContrastTextColor('#C59326'), '#0B1018');
  assert.equal(getContrastTextColor('#DC2626'), '#FFFFFF');

  // Custom light background pattern automatically marks isDark=false and preserves all variables
  const lightCustom = computeThemeRuntime('custom', '#059669', {
    canvas: '#F5F7FA',
    sidebar: '#FFFFFF',
    surface: '#FFFFFF',
    elevated: '#EAEEF5',
    border: '#CBD5E1',
    text: '#111827',
    accent: '#059669',
  });
  assert.equal(lightCustom.isDark, false);
  assert.equal(lightCustom.cssVariables['--bg-canvas'], '#F5F7FA');
  assert.equal(lightCustom.cssVariables['--accent-color'], '#059669');
  assert.equal(lightCustom.cssVariables['--accent-contrast'], '#0B1018');
});

test('Image crop math clamps zoom/pan offsets cleanly and produces square crop bounds', () => {
  const centered = computeCroppedSourceRect({
    naturalWidth: 1600,
    naturalHeight: 900,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    aspectRatio: 1,
  });
  assert.equal(centered.sw, 900);
  assert.equal(centered.sh, 900);
  assert.equal(centered.sx, 350);
  assert.equal(centered.sy, 0);

  const zoomedAndPanned = computeCroppedSourceRect({
    naturalWidth: 1000,
    naturalHeight: 1000,
    zoom: 2,
    offsetX: -1,
    offsetY: 1,
    aspectRatio: 1,
  });
  assert.equal(zoomedAndPanned.sw, 500);
  assert.equal(zoomedAndPanned.sh, 500);
  assert.equal(zoomedAndPanned.sx, 500);
  assert.equal(zoomedAndPanned.sy, 0);
});

test('Currency coin photo imageId is preserved across character template creation and migration', () => {
  const char = getKaelen();
  char.wallet.currencies[0].imageId = 'img_gold_coin_test';
  const tpl = createTemplateFromCharacter(char, 'Com Foto de Moeda');
  assert.equal(tpl.walletCurrencies[0].imageId, 'img_gold_coin_test');
  const nextChar = createCharacterFromTemplate(tpl, 'Herói Novo');
  assert.equal(nextChar.wallet.currencies[0].imageId, 'img_gold_coin_test');
  const migrated = migrateAndValidateCharacter(char);
  assert.equal(migrated.valid, true);
  assert.equal(migrated.character?.wallet.currencies[0].imageId, 'img_gold_coin_test');
});

test('Attribute calculation preserves base value and sums equipment + active ability modifiers', () => {
  const char = getKaelen();
  const forAttr = char.attributes.find((a) => a.shortName === 'FOR')!;
  const initialBase = forAttr.baseValue;

  // Initially sword (+2 FOR) is equipped across two hand slots (must NOT double count!)
  let breakdown = computeAllAttributes(char)[forAttr.id];
  assert.equal(breakdown.baseValue, initialBase);
  assert.equal(breakdown.equipmentBonus, 2);
  assert.equal(breakdown.totalValue, initialBase + 2);

  // Activate sustained ability (+2 FOR, +3 CON)
  const res = activateAbility(char, 'ab_aura_ferro');
  assert.equal(res.success, true);
  breakdown = computeAllAttributes(res.character)[forAttr.id];
  assert.equal(breakdown.baseValue, initialBase); // Base unchanged!
  assert.equal(breakdown.abilityBonus, 2);
  assert.equal(breakdown.totalValue, initialBase + 4);
});

test('Multi-resource atomic activation fails cleanly without partial deduction if one resource is insufficient', () => {
  const char = getKaelen();
  const vigor = char.resources.find((r) => r.name === 'Vigor')!;
  const mana = char.resources.find((r) => r.name === 'Mana')!;
  vigor.current = 2; // Aura de Ferro needs 8 Mana + 4 Vigor
  const manaBefore = mana.current;

  const res = activateAbility(char, 'ab_aura_ferro');
  assert.equal(res.success, false);
  // Neither Mana nor Vigor should be deducted
  assert.equal(res.character.resources.find((r) => r.id === mana.id)!.current, manaBefore);
  assert.equal(res.character.resources.find((r) => r.id === vigor.id)!.current, 2);
  assert.equal(res.character.abilities.find((a) => a.id === 'ab_aura_ferro')!.isActive, false);
});

test('Sustained ability deducts initial + recurring costs, expires duration, starts cooldown, and respects turn undo', () => {
  let char = getKaelen();
  const manaId = char.resources.find((r) => r.name === 'Mana')!.id;
  const vigorId = char.resources.find((r) => r.name === 'Vigor')!.id;

  const startMana = char.resources.find((r) => r.id === manaId)!.current; // 35
  const startVigor = char.resources.find((r) => r.id === vigorId)!.current; // 26

  // Activate ab_aura_ferro (initial: 8 Mana, 4 Vigor; recurring: 3 Mana/turn; duration: 4; cooldown: 3 on_deactivate)
  const act = activateAbility(char, 'ab_aura_ferro');
  assert.equal(act.success, true);
  char = act.character;

  assert.equal(char.resources.find((r) => r.id === manaId)!.current, startMana - 8); // 27
  assert.equal(char.resources.find((r) => r.id === vigorId)!.current, startVigor - 4); // 22
  assert.equal(char.abilities.find((a) => a.id === 'ab_aura_ferro')!.remainingDuration, 4);

  // Turn 1 -> 2: recurring at turn_start (-3 Mana -> 24), duration at turn_end (4 -> 3)
  char = advanceTurn(char);
  assert.equal(char.combat.turn, 2);
  assert.equal(char.resources.find((r) => r.id === manaId)!.current, startMana - 11); // 24
  assert.equal(char.abilities.find((a) => a.id === 'ab_aura_ferro')!.remainingDuration, 3);

  // Undo last turn must restore exact Mana (27), duration (4), and turn (1)
  const undone = undoLastTurn(char);
  assert.equal(undone.combat.turn, 1);
  assert.equal(undone.resources.find((r) => r.id === manaId)!.current, startMana - 8); // 27
  assert.equal(undone.abilities.find((a) => a.id === 'ab_aura_ferro')!.remainingDuration, 4);
  char = undone;

  // Advance 4 turns until duration hits 0 and cooldown starts (3 turns)
  for (let i = 0; i < 4; i++) {
    char = advanceTurn(char);
  }
  const abAfter = char.abilities.find((a) => a.id === 'ab_aura_ferro')!;
  assert.equal(abAfter.isActive, false);
  assert.equal(abAfter.remainingDuration, 0);
  assert.equal(abAfter.remainingCooldown, 3);

  // Cannot reactivate while on cooldown
  const blocked = activateAbility(char, 'ab_aura_ferro');
  assert.equal(blocked.success, false);

  // Advance 3 turns: cooldown reduces strictly 1 per turn, never below 0
  char = advanceTurn(char);
  assert.equal(char.abilities.find((a) => a.id === 'ab_aura_ferro')!.remainingCooldown, 2);
  char = advanceTurn(char);
  assert.equal(char.abilities.find((a) => a.id === 'ab_aura_ferro')!.remainingCooldown, 1);
  char = advanceTurn(char);
  assert.equal(char.abilities.find((a) => a.id === 'ab_aura_ferro')!.remainingCooldown, 0);
});

test('Manual deactivation starts cooldown on_deactivate and removes modifiers', () => {
  let char = getKaelen();
  const conAttr = char.attributes.find((a) => a.shortName === 'CON')!;
  const baseWithArmor = computeAllAttributes(char)[conAttr.id].totalValue;

  char = activateAbility(char, 'ab_aura_ferro').character;
  assert.equal(computeAllAttributes(char)[conAttr.id].totalValue, baseWithArmor + 3);

  char = deactivateAbility(char, 'ab_aura_ferro', 'manual');
  const ab = char.abilities.find((a) => a.id === 'ab_aura_ferro')!;
  assert.equal(ab.isActive, false);
  assert.equal(ab.remainingCooldown, 3);
  assert.equal(computeAllAttributes(char)[conAttr.id].totalValue, baseWithArmor);
});

test('Insufficient recurring resource rules (auto_deactivate vs manual_confirm)', () => {
  let char = getKaelen();
  const manaId = char.resources.find((r) => r.name === 'Mana')!.id;

  // Set Mana so initial cost (8) succeeds leaving 1 Mana (< 3 recurring)
  char = {
    ...char,
    resources: char.resources.map((r) => (r.id === manaId ? { ...r, current: 9 } : r)),
  };
  char = activateAbility(char, 'ab_aura_ferro').character;
  assert.equal(char.resources.find((r) => r.id === manaId)!.current, 1);

  // Rule 1: auto_deactivate
  const afterAuto = advanceTurn(char);
  assert.equal(afterAuto.abilities.find((a) => a.id === 'ab_aura_ferro')!.isActive, false);
  assert.equal(afterAuto.resources.find((r) => r.id === manaId)!.current, 1); // never below min

  // Rule 2: manual_confirm
  const charManual = {
    ...char,
    abilities: char.abilities.map((a) =>
      a.id === 'ab_aura_ferro' ? { ...a, insufficientResourceRule: 'manual_confirm' as const } : a
    ),
  };
  const afterManual = advanceTurn(charManual);
  assert.equal(afterManual.combat.pendingConfirmations.length, 1);
  const resolved = resolvePendingConfirmation(afterManual, 'ab_aura_ferro', false);
  assert.equal(resolved.abilities.find((a) => a.id === 'ab_aura_ferro')!.isActive, false);
  assert.equal(resolved.combat.pendingConfirmations.length, 0);
});

test('Combat round progression, manual counter adjustment, and combat reset', () => {
  let char = getKaelen();
  char = activateAbility(char, 'ab_golpe_cleave').character; // instant, 2 turns cooldown
  assert.equal(char.abilities.find((a) => a.id === 'ab_golpe_cleave')!.remainingCooldown, 2);

  char = advanceRound(char);
  assert.equal(char.combat.round, 2);
  assert.equal(char.combat.turn, 1);
  assert.equal(char.abilities.find((a) => a.id === 'ab_golpe_cleave')!.remainingCooldown, 1);

  char = adjustAbilityCounters(char, 'ab_golpe_cleave', 0, -5);
  assert.equal(char.abilities.find((a) => a.id === 'ab_golpe_cleave')!.remainingCooldown, 0);

  char = resetCombat(char);
  assert.equal(char.combat.round, 1);
  assert.equal(char.combat.turn, 1);
});

test('Equipment two-handed multi-slot linking, unequipping, inventory stack/split, and weight math', () => {
  let char = getKaelen();
  const initialWeight = computeTotalInventoryWeight(char);
  assert.ok(initialWeight > 0);

  // Unequipping two-handed sword from one hand slot must free BOTH hands
  const rightHand = char.equipmentSlots.find((s) => s.region === 'rightHand')!;
  const leftHand = char.equipmentSlots.find((s) => s.region === 'leftHand')!;
  char = unequipSlotEntry(char, rightHand.id, 'item_espada_runica');
  assert.equal(char.equipmentSlots.find((s) => s.id === rightHand.id)!.equippedItems.length, 0);
  assert.equal(char.equipmentSlots.find((s) => s.id === leftHand.id)!.equippedItems.length, 0);

  // Re-equipping two-handed sword occupies both hand slots cleanly
  const equipRes = equipItemToSlot(char, 'item_espada_runica', rightHand.id);
  assert.equal(equipRes.success, true);
  char = equipRes.character;
  assert.equal(char.equipmentSlots.find((s) => s.id === rightHand.id)!.equippedItems.length, 1);
  assert.equal(char.equipmentSlots.find((s) => s.id === leftHand.id)!.equippedItems.length, 1);

  // Split potion stack (4 -> 3 + 1) and stack back
  char = splitItemStack(char, 'item_tonico_carmesim', 1);
  const potions = char.inventory.filter((i) => i.name === 'Tônico Carmesim');
  assert.equal(potions.length, 2);
  char = stackCompatibleItems(char, potions[1].id, potions[0].id);
  assert.equal(char.inventory.filter((i) => i.name === 'Tônico Carmesim').length, 1);
  assert.equal(char.inventory.find((i) => i.name === 'Tônico Carmesim')!.quantity, 4);
});

test('Blank template creates completely clean system-agnostic sheet and migration validates imports', () => {
  const blank = createBlankTemplate('Sistema Próprio');
  const char = createCharacterFromTemplate(blank, 'Viajante Sem Sistema');
  assert.equal(char.attributes.length, 0);
  assert.equal(char.resources.length, 0);
  assert.equal(char.equipmentSlots.length, 0);

  const universal = createUniversalFantasyTemplate();
  const uChar = createCharacterFromTemplate(universal, 'Teste Universal');
  assert.equal(uChar.attributes.length, 8);

  const migrated = migrateAndValidateCharacter({ identity: { name: 'Importado Antigo' } });
  assert.equal(migrated.valid, true);
  assert.equal(migrated.character?.identity.name, 'Importado Antigo');
  assert.ok(migrated.character?.wallet);
  assert.equal(migrated.character?.identity.sectionOrder.includes('wallet'), true);
});

test('Multi-currency wallet supports automatic batch addition, negative protection, and history logging', () => {
  let char = getKaelen();
  const mo = char.wallet.currencies.find((c) => c.symbol === 'MO')!;
  const mp = char.wallet.currencies.find((c) => c.symbol === 'MP')!;
  const fa = char.wallet.currencies.find((c) => c.symbol === 'FA')!;

  const moBefore = mo.amount; // 42
  const mpBefore = mp.amount; // 18
  const faBefore = fa.amount; // 3

  // Batch add across multiple currency types (convertible + independent)
  const addRes = applyBatchWalletChanges(
    char,
    [
      { currencyId: mo.id, delta: 8 },
      { currencyId: mp.id, delta: 12 },
      { currencyId: fa.id, delta: 2 },
    ],
    { reason: 'Saque do Dragão' }
  );
  assert.equal(addRes.success, true);
  char = addRes.character;

  assert.equal(char.wallet.currencies.find((c) => c.id === mo.id)!.amount, moBefore + 8);
  assert.equal(char.wallet.currencies.find((c) => c.id === mp.id)!.amount, mpBefore + 12);
  assert.equal(char.wallet.currencies.find((c) => c.id === fa.id)!.amount, faBefore + 2);
  assert.ok(char.wallet.history[0].summary.includes('Saque do Dragão'));

  // Negative balance protection must fail atomically without partial deduction
  const failRes = applyBatchWalletChanges(
    char,
    [
      { currencyId: mo.id, delta: -10 },
      { currencyId: fa.id, delta: -999 },
    ],
    { preventNegative: true }
  );
  assert.equal(failRes.success, false);
  assert.equal(failRes.character.wallet.currencies.find((c) => c.id === mo.id)!.amount, moBefore + 8);
});

test('Wallet calculates consolidated wealth, change consolidation, and adds inventory item value automatically', () => {
  let char = getKaelen();
  const mo = char.wallet.currencies.find((c) => c.symbol === 'MO')!;
  const mp = char.wallet.currencies.find((c) => c.symbol === 'MP')!;
  const mc = char.wallet.currencies.find((c) => c.symbol === 'MC')!;

  // Initial Kaelen: 42 MO + 18 MP (1.8) + 65 MC (0.65) = 44.45 MO; 3 FA independent
  const totals = computeWalletTotals(char);
  assert.equal(totals.hasConvertibleCurrencies, true);
  assert.equal(totals.walletUnifiedTotal, 44.45);
  assert.equal(totals.independentCurrencies.length, 1);
  assert.equal(totals.independentCurrencies[0].symbol, 'FA');
  assert.ok(totals.inventoryUnifiedTotal > 0);
  assert.equal(
    totals.combinedUnifiedTotal,
    Number((totals.walletUnifiedTotal + totals.inventoryUnifiedTotal).toFixed(2))
  );

  // Consolidate change: set 255 MC and 14 MP -> 255 MC = 25 MP + 5 MC -> 39 MP = 3 MO + 9 MP
  char = {
    ...char,
    wallet: {
      ...char.wallet,
      currencies: char.wallet.currencies.map((c) => {
        if (c.id === mo.id) return { ...c, amount: 10 };
        if (c.id === mp.id) return { ...c, amount: 14 };
        if (c.id === mc.id) return { ...c, amount: 255 };
        return c;
      }),
    },
  };
  const consolidated = consolidateCurrencyChange(char);
  assert.equal(consolidated.wallet.currencies.find((c) => c.id === mc.id)!.amount, 5);
  assert.equal(consolidated.wallet.currencies.find((c) => c.id === mp.id)!.amount, 9);
  assert.equal(consolidated.wallet.currencies.find((c) => c.id === mo.id)!.amount, 13);

  // Add inventory item monetary value directly into matching wallet currency
  const swordAdded = addInventoryItemValueToWallet(consolidated, 'item_espada_runica', 1);
  assert.equal(swordAdded.success, true);
  // Sword is 240 MO -> 13 + 240 = 253 MO
  assert.equal(
    swordAdded.character.wallet.currencies.find((c) => c.id === mo.id)!.amount,
    253
  );
});

test('Random engine rolls inclusive bounds, handles swapped ranges, and applies random XP and resource deltas cleanly', () => {
  // Boundary checks with deterministic RNG (0 -> min, 0.9999 -> max)
  assert.equal(rollRandomInt(5, 15, () => 0), 5);
  assert.equal(rollRandomInt(5, 15, () => 0.9999), 15);
  // Swapped bounds should normalize cleanly
  assert.equal(rollRandomInt(20, 10, () => 0), 10);
  assert.equal(rollRandomInt(20, 10, () => 0.9999), 20);
  // Equal bounds
  assert.equal(rollRandomInt(7, 7, () => 0.5), 7);

  let char = getKaelen();
  const initialXp = char.identity.currentXp;
  const xpAdd = applyRandomXpDelta(char, 10, 20, 1, () => 0.5);
  // 10..20 inclusive -> 11 values; floor(0.5 * 11) = 5 -> 10 + 5 = 15
  assert.equal(xpAdd.rolled, 15);
  assert.equal(xpAdd.delta, 15);
  assert.equal(xpAdd.character.identity.currentXp, initialXp + 15);

  // Subtracting more than currentXp clamps cleanly at 0
  const xpSub = applyRandomXpDelta(xpAdd.character, 100000, 100000, -1, () => 0);
  assert.equal(xpSub.rolled, 100000);
  assert.equal(xpSub.delta, -100000);
  assert.equal(xpSub.character.identity.currentXp, 0);

  // Resource random add/subtract clamps to [min, max]
  const hp = char.resources.find((r) => r.name === 'Vida')!;
  const hpBefore = hp.current;
  const hpSub = applyRandomResourceDelta(char, hp.id, 4, 8, -1, () => 0.5);
  // 4..8 inclusive -> 5 values; floor(0.5 * 5) = 2 -> 4 + 2 = 6
  assert.equal(hpSub.rolled, 6);
  assert.equal(hpSub.delta, -6);
  assert.equal(hpSub.character.resources.find((r) => r.id === hp.id)!.current, hpBefore - 6);

  // Adding beyond max clamps at effectiveMax (base max + equipment/ability max bonuses)
  const effectiveHpMax = computeResourceEffective(hpSub.character, hp).effectiveMax;
  const hpHeal = applyRandomResourceDelta(hpSub.character, hp.id, 200, 200, 1, () => 0);
  assert.equal(hpHeal.character.resources.find((r) => r.id === hp.id)!.current, effectiveHpMax);
});

test('Character knowledge entries and section order are preserved across seed, template creation, and migration', () => {
  const char = getKaelen();
  assert.ok(char.knowledge.length >= 3);
  assert.equal(char.identity.sectionOrder.includes('knowledge'), true);

  const tpl = createTemplateFromCharacter(char, 'Modelo com Grimório');
  assert.equal(tpl.enabledModules.knowledge, true);
  assert.equal(tpl.knowledge?.length, char.knowledge.length);

  const created = createCharacterFromTemplate(tpl, 'Aprendiz Arcano');
  assert.equal(created.knowledge.length, char.knowledge.length);
  assert.equal(created.knowledge[0].title, char.knowledge[0].title);
  assert.equal(created.identity.sectionOrder.includes('knowledge'), true);

  // Legacy character without knowledge field should migrate with empty array and sectionOrder containing 'knowledge'
  const migrated = migrateAndValidateCharacter({
    identity: { name: 'Veterano Legado', sectionOrder: ['attributes', 'resources'] },
  });
  assert.equal(migrated.valid, true);
  assert.deepEqual(migrated.character?.knowledge, []);
  assert.equal(migrated.character?.identity.sectionOrder.includes('knowledge'), true);
});

test('Player-defined XP and resource deltas apply exact user amounts and clamp bounds safely', () => {
  let char = getKaelen();
  const startXp = char.identity.currentXp;
  const xpPlus = applyPlayerXpDelta(char, 125, 1);
  assert.equal(xpPlus.delta, 125);
  assert.equal(xpPlus.character.identity.currentXp, startXp + 125);

  const xpMinus = applyPlayerXpDelta(xpPlus.character, 999999, -1);
  assert.equal(xpMinus.character.identity.currentXp, 0);

  const hp = char.resources.find((r) => r.name === 'Vida')!;
  const hpBefore = hp.current;
  const hpHit = applyPlayerResourceDelta(char, hp.id, 17, -1);
  assert.equal(hpHit.delta, -17);
  assert.equal(hpHit.character.resources.find((r) => r.id === hp.id)!.current, hpBefore - 17);

  const hpHeal = applyPlayerResourceDelta(hpHit.character, hp.id, 12, 1);
  assert.equal(hpHeal.delta, 12);
  assert.equal(hpHeal.character.resources.find((r) => r.id === hp.id)!.current, hpBefore - 5);
});

test('Abilities resolve into all 5 specialized skill sections and seed includes books and shells', () => {
  const char = getKaelen();
  const roles = new Set(char.abilities.map((a) => resolveAbilityRole(a)));
  assert.equal(roles.has('damage'), true);
  assert.equal(roles.has('turn_dice'), true);
  assert.equal(roles.has('immediate'), true);
  assert.equal(roles.has('fixed'), true);
  assert.equal(roles.has('effect'), true);

  // Backward-compatible inference when abilityRole is omitted
  const legacyPassive = { ...char.abilities[0], abilityRole: undefined, abilityType: 'passive' as const };
  assert.equal(resolveAbilityRole(legacyPassive), 'fixed');

  const legacyTurnDice = {
    ...char.abilities[0],
    abilityRole: undefined,
    abilityType: 'fixed_duration' as const,
    durationTurns: 2,
    damageText: '1d6',
  };
  assert.equal(resolveAbilityRole(legacyTurnDice), 'turn_dice');

  const legacyImmediate = {
    ...char.abilities[0],
    abilityRole: undefined,
    abilityType: 'instant' as const,
    damageText: '',
    turnDiceText: '',
  };
  assert.equal(resolveAbilityRole(legacyImmediate), 'immediate');

  // Knowledge includes both book and shell entries
  assert.equal(char.knowledge.some((k) => k.kind === 'book'), true);
  assert.equal(char.knowledge.some((k) => k.kind === 'shell'), true);
});

test('Human body equipment organizer distributes standard regions cleanly across flanks and preserves custom slots', () => {
  const char = getKaelen();
  const extraCustomSlot = {
    id: 'slot_relic_extra',
    name: 'Relíquia Dorsal',
    slotType: 'custom',
    region: 'custom' as const,
    capacity: 1,
    equippedItems: [],
    order: 99,
  };
  const organized = organizeEquipmentSlotsForBody([...char.equipmentSlots, extraCustomSlot]);

  assert.equal(organized.leftFlank.length, 6);
  assert.equal(organized.rightFlank.length, 6);
  assert.equal(organized.accessories.length, 5);
  assert.equal(organized.customSlots.length, 1);
  assert.equal(organized.customSlots[0].id, 'slot_relic_extra');

  // Verify no two anatomical pins share identical overlapping coordinates on the body figure
  const pins = Object.values(BODY_PART_LAYOUT).filter((p) => p.region !== 'custom');
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const dx = pins[i].pinX - pins[j].pinX;
      const dy = pins[i].pinY - pins[j].pinY;
      const dist = Math.hypot(dx, dy);
      assert.ok(dist >= 5, `Pins ${pins[i].region} and ${pins[j].region} too close (${dist})`);
    }
  }
});

test('Dynamic damage engine replaces skill and weapon stat references with live effective attribute totals', () => {
  const char = getKaelen();
  // Set Carisma = 14 and add Vontade = 12 dynamically (system-agnostic)
  const existingCarisma = char.attributes.find((a) => a.name === 'Carisma');
  if (existingCarisma) {
    existingCarisma.baseValue = 14;
  } else {
    char.attributes.push({
      id: 'attr_carisma',
      name: 'Carisma',
      shortName: 'CAR',
      baseValue: 14,
      permanentBonus: 0,
      tempBonus: 0,
      category: 'Social',
      order: 9,
      customSources: [],
    });
  }
  char.attributes.push({
    id: 'attr_vontade',
    name: 'Vontade',
    shortName: 'VON',
    baseValue: 12,
    permanentBonus: 0,
    tempBonus: 0,
    category: 'Mental',
    order: 10,
    customSources: [],
  });
  const carismaId = (existingCarisma || char.attributes.find((a) => a.name === 'Carisma'))!.id;

  // Example from user: 3d5 + 60 + Carisma + Vontade -> 3d5 + 86
  const res = resolveDamageExpression(char, '3d5 + 60 + Carisma + Vontade');
  assert.equal(res.hasDamage, true);
  assert.equal(res.resolvedText, '3d5 + 86');
  assert.equal(res.flatBase, 60);
  assert.equal(res.statsTotal, 26);
  assert.equal(res.flatTotal, 86);
  assert.equal(res.minTotal, 3 + 86);
  assert.equal(res.maxTotal, 15 + 86);
  assert.equal(res.usedStats.length, 2);

  // Selected damageAttributeIds must not double-count attributes already named in formula
  const noDoubleCount = resolveDamageExpression(char, '3d5 + 60 + Carisma', [
    carismaId,
    'attr_vontade',
  ]);
  assert.equal(noDoubleCount.resolvedText, '3d5 + 86');
  assert.equal(noDoubleCount.statsTotal, 26);

  // Stat-only & arithmetic expressions
  assert.equal(resolveDamageExpression(char, 'Carisma + Vontade').resolvedText, '26');
  assert.equal(
    resolveDamageExpression(char, '2d6 + 2 * FOR - 4').resolvedText,
    '2d6 + 30' // FOR is 17 (15 base + 2 sword): 2*17 - 4 = 30
  );

  // Word-boundary and accent safety ("fogo" must NOT match "FOR", "sabedoria" accentless matches Sabedoria=12 [11+1 ring])
  assert.equal(
    resolveDamageExpression(char, '1d6 + sabedoria fogo').resolvedText,
    '1d6 + 12 fogo'
  );

  // Live reactive update: sword equipped (+2 FOR -> 17), then Postura activated (+2 FOR -> 19), then sword unequipped (-2 -> 17)
  const sword = char.inventory.find((i) => i.id === 'item_espada_runica')!;
  const cleave = char.abilities.find((a) => a.id === 'ab_golpe_cleave')!;

  assert.equal(resolveItemDamage(char, sword).resolvedText, '2d6 + 17');
  assert.equal(
    resolveDamageExpression(char, cleave.damageText, cleave.damageAttributeIds).resolvedText,
    '2d8 + 17 cortante'
  );

  const buffed = activateAbility(char, 'ab_aura_ferro').character;
  assert.equal(resolveItemDamage(buffed, sword).resolvedText, '2d6 + 19');
  assert.equal(
    resolveDamageExpression(buffed, cleave.damageText, cleave.damageAttributeIds).resolvedText,
    '2d8 + 19 cortante'
  );

  const equippedList = getEquippedWeaponsWithDamage(buffed);
  assert.equal(equippedList.length, 1);
  assert.equal(equippedList[0].damage.resolvedText, '2d6 + 19');

  const rightHand = buffed.equipmentSlots.find((s) => s.region === 'rightHand')!;
  const unequippedChar = unequipSlotEntry(buffed, rightHand.id, sword.id);
  // Unequipping sword removes its +2 FOR -> 17 (15 base + 2 posture)
  assert.equal(resolveItemDamage(unequippedChar, sword).resolvedText, '2d6 + 17');

  // Legacy item with 'Dano Base' customField migrates cleanly into damageText
  const legacyMigrated = migrateAndValidateCharacter({
    identity: { name: 'Espadachim Legado' },
    inventory: [
      {
        id: 'legacy_blade',
        name: 'Espada Antiga',
        customFields: [{ id: 'cf1', label: 'Dano Base', value: '1d10 + DES' }],
      },
    ],
  });
  assert.equal(legacyMigrated.valid, true);
  const migratedBlade = legacyMigrated.character!.inventory[0];
  assert.equal(getItemDamageFormula(migratedBlade), '1d10 + DES');
});

test('Initial seed clears existing sample tokens/fichas while preserving templates, and d20 engine handles rolls, manual inputs, modifiers, and criticals', () => {
  const initialSeed = buildSeedData();
  assert.equal(initialSeed.characters.length, 0);
  assert.equal(initialSeed.generalNotes.length, 0);
  assert.ok(initialSeed.templates.length >= 2);

  // Face clamping and critical detection
  assert.equal(clampD20Face(0), 1);
  assert.equal(clampD20Face(25), 20);
  assert.equal(clampD20Face(13.6), 14);
  assert.equal(detectD20Critical(20), 'nat20');
  assert.equal(detectD20Critical(1), 'nat1');
  assert.equal(detectD20Critical(15), 'none');

  // Normal roll with deterministic RNG
  const normalNat20 = rollD20Mode('normal', 4, {
    modifierLabel: 'FOR',
    rng: () => 0.9999,
  });
  assert.equal(normalNat20.chosenDie, 20);
  assert.equal(normalNat20.total, 24);
  assert.equal(normalNat20.critical, 'nat20');
  assert.ok(formatD20Summary(normalNat20).includes('Crítico'));

  // Advantage picks highest of two d20 rolls
  let advIdx = 0;
  const advSeq = [0.0, 0.75]; // 1 and 16
  const advRoll = rollD20Mode('advantage', 3, {
    rng: () => advSeq[advIdx++],
  });
  assert.deepEqual(advRoll.dice, [1, 16]);
  assert.equal(advRoll.chosenDie, 16);
  assert.equal(advRoll.discardedDie, 1);
  assert.equal(advRoll.total, 19);

  // Disadvantage picks lowest of two d20 rolls (nat 1 fumble)
  let disIdx = 0;
  const disSeq = [0.9, 0.0]; // 19 and 1
  const disRoll = rollD20Mode('disadvantage', -1, {
    rng: () => disSeq[disIdx++],
  });
  assert.deepEqual(disRoll.dice, [19, 1]);
  assert.equal(disRoll.chosenDie, 1);
  assert.equal(disRoll.discardedDie, 19);
  assert.equal(disRoll.total, 0);
  assert.equal(disRoll.critical, 'nat1');

  // Manual d20 face input
  const manual = createManualD20Entry(14, 5, {
    modifierLabel: 'Percepção',
    note: 'Armadilha',
  });
  assert.equal(manual.inputSource, 'manual');
  assert.equal(manual.chosenDie, 14);
  assert.equal(manual.total, 19);
  assert.ok(formatD20Summary(manual).includes('Armadilha: d20 (14) +5 [Percepção] = 19'));

  // Character modifier presets include live attribute + skill totals
  const kaelen = getKaelen();
  const presets = getCharacterD20Modifiers(kaelen);
  assert.ok(presets.some((p) => p.shortLabel === 'FOR' && p.value === 17));
  assert.ok(presets.some((p) => p.label === 'Esgrima' && p.value === 19));
  assert.deepEqual(getCharacterD20Modifiers(null), []);
});

test('Export & import engine cleanly handles with_data vs without_data structure-only files and backups', () => {
  const kaelen = getKaelen();
  assert.ok(kaelen.inventory.length > 0);
  assert.ok(kaelen.abilities.length > 0);
  assert.ok(kaelen.attributes.length > 0);

  // Stripping character data preserves structure (attributes/skills/slots/currencies) while clearing personal values
  const stripped = stripCharacterDataForStructureExport(kaelen);
  assert.equal(stripped.identity.name, '');
  assert.equal(stripped.identity.level, 1);
  assert.equal(stripped.identity.currentXp, 0);
  assert.equal(stripped.attributes.length, kaelen.attributes.length);
  assert.ok(stripped.attributes.every((a) => a.baseValue === 0 && a.permanentBonus === 0));
  assert.equal(stripped.skills.length, kaelen.skills.length);
  assert.ok(stripped.skills.every((s) => s.baseValue === 0 && s.bonus === 0));
  assert.equal(stripped.inventory.length, 0);
  assert.equal(stripped.abilities.length, 0);
  assert.equal(stripped.knowledge.length, 0);
  assert.equal(stripped.notes.length, 0);
  assert.equal(stripped.wallet.currencies.length, kaelen.wallet.currencies.length);
  assert.ok(stripped.wallet.currencies.every((c) => c.amount === 0 && c.imageId === undefined));
  assert.equal(stripped.equipmentSlots.length, kaelen.equipmentSlots.length);
  assert.ok(stripped.equipmentSlots.every((s) => s.equippedItems.length === 0));

  // Template strip removes embedded knowledge, coin images, and custom field defaults while preserving slots/attributes
  const tpl = createTemplateFromCharacter(kaelen, 'Modelo Teste');
  const strippedTpl = stripTemplateDataForStructureExport(tpl);
  assert.equal(strippedTpl.knowledge?.length, 0);
  assert.equal(strippedTpl.attributes.length, tpl.attributes.length);

  // Full backup payload with data vs without data
  const seed = buildSeedData();
  const sampleSettings = {
    language: 'pt-BR' as const,
    theme: 'dark' as const,
    accentColor: '#FAFAFA',
    customTheme: {
      canvas: '#09090B',
      sidebar: '#0E0E11',
      surface: '#121215',
      elevated: '#1B1B1F',
      border: '#27272A',
      text: '#FAFAFA',
      accent: '#FAFAFA',
    },
    editMode: true,
    density: 'comfortable' as const,
    cardLayout: 'grid' as const,
    decorativeEffects: true,
    activeCharacterId: kaelen.id,
  };
  const sampleManifest = { img_1: { mimeType: 'image/png', fileName: 'img_1.png' } };
  const fullWith = prepareBackupPayload(
    {
      settings: sampleSettings,
      characters: [kaelen],
      templates: seed.templates,
      generalNotes: [],
      imageManifest: sampleManifest,
    },
    true
  );
  assert.equal(fullWith.exportMode, 'with_data');
  assert.equal(fullWith.characters.length, 1);
  assert.ok(Object.keys(fullWith.imageManifest).length === 1);

  const fullWithout = prepareBackupPayload(
    {
      settings: sampleSettings,
      characters: [kaelen],
      templates: seed.templates,
      generalNotes: [],
      imageManifest: sampleManifest,
    },
    false
  );
  assert.equal(fullWithout.exportMode, 'without_data');
  assert.equal(fullWithout.characters.length, 0);
  assert.deepEqual(fullWithout.imageManifest, {});
  assert.equal(fullWithout.templates.length, seed.templates.length);

  // Parsing character JSON in both modes
  const serializedChar = JSON.stringify(kaelen);
  const parsedWith = parseImportedSheetOrTemplateJson(serializedChar, 'with_data');
  assert.equal(parsedWith.valid, true);
  if (parsedWith.valid && parsedWith.kind === 'character') {
    assert.equal(parsedWith.character.identity.name, kaelen.identity.name);
    assert.ok(parsedWith.character.inventory.length > 0);
  }

  const parsedWithout = parseImportedSheetOrTemplateJson(serializedChar, 'without_data');
  assert.equal(parsedWithout.valid, true);
  if (parsedWithout.valid && parsedWithout.kind === 'character') {
    assert.ok(parsedWithout.character.identity.name.includes('(Estrutura)'));
    assert.equal(parsedWithout.character.inventory.length, 0);
    assert.equal(parsedWithout.character.attributes.length, kaelen.attributes.length);
  }

  // Parsing template JSON cleanly detects template vs character
  const parsedTpl = parseImportedSheetOrTemplateJson(JSON.stringify(tpl), 'without_data');
  assert.equal(parsedTpl.valid, true);
  assert.equal(parsedTpl.kind, 'template');
});

test('Personalized initial character builder avoids preset systems, supports custom attributes/resources, d20 bonus, body slots, and module flags', () => {
  // 1. Minimal blank personalized character
  const blankCustom = createPersonalizedCharacter({
    name: 'Andarilho Livre',
    includeStandardBodySlots: false,
    rolledD20: 20,
    applyD20Bonus: true, // Safely ignored when no attributes exist
  });
  assert.equal(blankCustom.templateId, 'custom_personalized');
  assert.equal(blankCustom.identity.name, 'Andarilho Livre');
  assert.equal(blankCustom.attributes.length, 0);
  assert.equal(blankCustom.resources.length, 0);
  assert.equal(blankCustom.equipmentSlots.length, 0);

  // 2. Fully customized initial character with custom attributes, resources, body slots, and d20 bonus
  const tailored = createPersonalizedCharacter({
    name: 'Lyra Cronista',
    characterClass: 'Tecnomante',
    race: 'Sintético',
    title: 'Vigia do Abismo',
    level: 3,
    includeStandardBodySlots: true,
    enabledModules: { knowledge: false, wallet: true },
    attributes: [
      { name: 'Destreza', shortName: 'DES', baseValue: 14 },
      { name: 'Mente', shortName: '', baseValue: 16 },
    ],
    resources: [
      { name: 'Energia', max: 35 },
      { name: 'Foco', max: 20 },
    ],
    rolledD20: 16,
    applyD20Bonus: true,
  });

  assert.equal(tailored.templateId, 'custom_personalized');
  assert.equal(tailored.identity.level, 3);
  assert.equal(tailored.identity.characterClass, 'Tecnomante');
  assert.equal(tailored.enabledModules.knowledge, false);
  assert.equal(tailored.enabledModules.wallet, true);
  assert.ok(tailored.equipmentSlots.length >= 12);

  // d20 = 16 -> round(16/4) = +4 applied only to first custom attribute
  assert.equal(tailored.attributes.length, 2);
  assert.equal(tailored.attributes[0].shortName, 'DES');
  assert.equal(tailored.attributes[0].baseValue, 18);
  assert.equal(tailored.attributes[1].shortName, 'MEN');
  assert.equal(tailored.attributes[1].baseValue, 16);

  assert.equal(tailored.resources.length, 2);
  assert.equal(tailored.resources[0].name, 'Energia');
  assert.equal(tailored.resources[0].current, 35);
  assert.equal(tailored.resources[0].max, 35);
  assert.equal(tailored.carryCapacity.linkedAttributeId, tailored.attributes[0].id);
});

test('Ability copy/share formatting respects description, effect, and live stat-resolved damage specification, and duplication creates an independent editable copy', () => {
  const char = getKaelen();
  const cleave = char.abilities.find((a) => a.id === 'ab_golpe_cleave')!;

  // Default copyConfig includes description, effect, and stat-resolved damage (FOR = 17 with sword)
  const fullCopy = formatAbilityCopyText(char, cleave);
  assert.ok(fullCopy.includes(cleave.name));
  assert.ok(fullCopy.includes(`Descrição: ${cleave.description}`));
  assert.ok(fullCopy.includes(`Efeito: ${cleave.effectsText}`));
  assert.ok(fullCopy.includes('Dano: 2d8 + 17 cortante'));

  // Edit-mode copy specification excluding description, keeping effect and damage
  const noDescAbility = {
    ...cleave,
    copyConfig: {
      includeDescription: false,
      includeEffect: true,
      includeDamage: true,
    },
  };
  const effectAndDamageOnly = formatAbilityCopyText(char, noDescAbility);
  assert.equal(effectAndDamageOnly.includes('Descrição:'), false);
  assert.ok(effectAndDamageOnly.includes('Efeito:'));
  assert.ok(effectAndDamageOnly.includes('Dano: 2d8 + 17 cortante'));

  // Config override excluding effect and damage
  const descOnly = formatAbilityCopyText(char, noDescAbility, {
    includeDescription: true,
    includeEffect: false,
    includeDamage: false,
  });
  assert.ok(descOnly.includes('Descrição:'));
  assert.equal(descOnly.includes('Efeito:'), false);
  assert.equal(descOnly.includes('Dano:'), false);

  // Duplicating creates an independent editable copy preserving description, effect, damage, and copyConfig
  const activeOriginal = {
    ...noDescAbility,
    isActive: true,
    remainingDuration: 3,
    remainingCooldown: 2,
  };
  const copied = duplicateAbilityAsCopy(activeOriginal);
  assert.notEqual(copied.id, activeOriginal.id);
  assert.equal(copied.name, `${activeOriginal.name} (Cópia)`);
  assert.equal(copied.description, activeOriginal.description);
  assert.equal(copied.effectsText, activeOriginal.effectsText);
  assert.equal(copied.damageText, activeOriginal.damageText);
  assert.deepEqual(copied.copyConfig, activeOriginal.copyConfig);
  assert.equal(copied.isActive, false);
  assert.equal(copied.remainingDuration, 0);
  assert.equal(copied.remainingCooldown, 0);

  // Migration preserves copyConfig
  const migrated = migrateAndValidateCharacter({
    identity: { name: 'Teste Cópia' },
    abilities: [noDescAbility],
  });
  assert.equal(migrated.valid, true);
  assert.deepEqual(migrated.character?.abilities[0].copyConfig, {
    includeDescription: false,
    includeEffect: true,
    includeDamage: true,
  });
});





