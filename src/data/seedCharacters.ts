import { Character, JournalNote, SheetTemplate } from '../types/rpg';
import {
  createBlankTemplate,
  createCharacterFromTemplate,
  createUniversalFantasyTemplate,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_MODULES,
  DEFAULT_TIMING_RULES,
} from '../engine/templateEngine';
import { createId } from '../utils/id';

export function buildSeedData(): {
  templates: SheetTemplate[];
  characters: Character[];
  generalNotes: JournalNote[];
} {
  const fantasyTpl = createUniversalFantasyTemplate();

  const sciFiTpl: SheetTemplate = {
    ...createBlankTemplate('Crônicas Estelares (Ficção / Livre)'),
    id: 'tpl_scifi_custom',
    isBlank: false,
    description: 'Exemplo alternativo com atributos cibernéticos, Energia, Escudo e Sobrecarga.',
    defaultIdentityLabels: {
      levelLabel: 'Patente',
      xpLabel: 'Créditos de Mérito',
      customFields: [
        { id: createId('fld'), label: 'Nave / Unidade', value: '' },
        { id: createId('fld'), label: 'Implante Principal', value: '' },
      ],
    },
    attributes: [
      { id: 'sc_ref', name: 'Reflexos', shortName: 'REF', category: 'Combate', baseValue: 8, permanentBonus: 0, tempBonus: 0, customSources: [], order: 0 },
      { id: 'sc_tec', name: 'Tecnologia', shortName: 'TEC', category: 'Sistemas', baseValue: 12, permanentBonus: 0, tempBonus: 0, customSources: [], order: 1 },
      { id: 'sc_cor', name: 'Corpo', shortName: 'COR', category: 'Físicos', baseValue: 9, permanentBonus: 0, tempBonus: 0, customSources: [], order: 2 },
      { id: 'sc_von', name: 'Frieza', shortName: 'FRI', category: 'Mentais', baseValue: 10, permanentBonus: 0, tempBonus: 0, customSources: [], order: 3 },
    ],
    resources: [
      { id: 'sc_hp', name: 'Integridade', current: 40, max: 40, min: 0, tempBonus: 0, color: '#C94040', icon: 'heart', order: 0 },
      { id: 'sc_en', name: 'Energia do Reator', current: 30, max: 30, min: 0, tempBonus: 0, color: '#38BDF8', icon: 'zap', order: 1 },
      { id: 'sc_sh', name: 'Escudo Defletor', current: 15, max: 15, min: 0, tempBonus: 0, color: '#34A876', icon: 'shield', order: 2 },
    ],
    walletCurrencies: [
      { id: 'sc_cur_cr', name: 'Créditos Galácticos', symbol: 'CR', amount: 0, exchangeRate: 1, color: '#38BDF8', order: 0 },
    ],
    walletEnableConversion: true,
    itemCategories: ['Armamento', 'Implantes', 'Blindagem', 'Ferramentas', 'Suprimentos'],
    storageLocations: ['Colete Tático', 'Compartimento', 'Arsenal da Nave'],
    equipmentSlots: [
      { id: 'sc_slot_head', name: 'Visor Tático', slotType: 'head', region: 'head', capacity: 1, equippedItems: [], order: 0 },
      { id: 'sc_slot_chest', name: 'Traje Balístico', slotType: 'chest', region: 'chest', capacity: 1, equippedItems: [], order: 1 },
      { id: 'sc_slot_rhand', name: 'Mão Direita', slotType: 'hand', region: 'rightHand', capacity: 1, equippedItems: [], order: 2 },
      { id: 'sc_slot_lhand', name: 'Mão Esquerda', slotType: 'hand', region: 'leftHand', capacity: 1, equippedItems: [], order: 3 },
      { id: 'sc_slot_imp', name: 'Conexão Neural', slotType: 'custom', region: 'custom', capacity: 3, equippedItems: [], order: 4 },
    ],
    abilityCategories: [
      { id: 'sc_cat_hack', name: 'Protocolos de Invasão', color: '#38BDF8', icon: 'cpu', order: 0 },
      { id: 'sc_cat_comb', name: 'Manobras Táticas', color: '#C89B3C', icon: 'crosshair', order: 1 },
    ],
  };

  return {
    templates: [fantasyTpl, sciFiTpl],
    characters: [],
    generalNotes: [],
  };
}

/**
 * Deterministic RPG character fixtures used exclusively by automated engine unit tests.
 */
export function buildSeedCharacterFixtures(): {
  templates: SheetTemplate[];
  characters: Character[];
  generalNotes: JournalNote[];
} {
  const { templates } = buildSeedData();
  const fantasyTpl = templates[0];

  // Character 1: Kaelen Voss
  const kaelen = createCharacterFromTemplate(fantasyTpl, 'Kaelen Voss');
  kaelen.id = 'char_kaelen_voss';
  kaelen.identity = {
    ...kaelen.identity,
    name: 'Kaelen Voss',
    defaultPortraitUrl: '/src/assets/images/portrait_warrior_1794780444243.jpg',
    race: 'Humano',
    subrace: 'Terras do Norte',
    characterClass: 'Lâmina Juramentada',
    subclass: 'Guardião da Vigília',
    age: '38 anos',
    gender: 'Masculino',
    height: '1,84 m',
    weight: '86 kg',
    profession: 'Mercenário Veterano',
    title: 'Portador da Vigília de Ferro',
    affiliation: 'Companhia da Brasa Cinzenta',
    background: 'Sobrevivente do Cerco de Valdris',
    biography:
      'Antigo capitão da guarda fronteiriça que jurou proteger as estradas antigas contra incursões do Abismo. Prefere lâminas pesadas e posturas defensivas sustentadas.',
    level: 5,
    currentXp: 640,
    nextLevelXp: 1000,
    customFields: [
      { id: createId('fld'), label: 'Juramento', value: 'Não recuar diante da névoa' },
      { id: createId('fld'), label: 'Idiomas', value: 'Comum, Baixo Valdriano' },
    ],
  };

  // Adjust Kaelen attributes
  const kFor = kaelen.attributes.find((a) => a.shortName === 'FOR');
  const kDes = kaelen.attributes.find((a) => a.shortName === 'DES');
  const kCon = kaelen.attributes.find((a) => a.shortName === 'CON');
  const kVit = kaelen.attributes.find((a) => a.shortName === 'VIT');
  const kSab = kaelen.attributes.find((a) => a.shortName === 'SAB');
  if (kFor) kFor.baseValue = 15;
  if (kDes) kDes.baseValue = 12;
  if (kCon) kCon.baseValue = 14;
  if (kVit) kVit.baseValue = 14;
  if (kSab) kSab.baseValue = 11;

  const kHp = kaelen.resources.find((r) => r.name === 'Vida');
  const kMp = kaelen.resources.find((r) => r.name === 'Mana');
  const kVig = kaelen.resources.find((r) => r.name === 'Vigor');
  const kSan = kaelen.resources.find((r) => r.name === 'Sanidade');
  if (kHp) { kHp.max = 75; kHp.current = 68; }
  if (kMp) { kMp.max = 35; kMp.current = 35; }
  if (kVig) { kVig.max = 30; kVig.current = 26; }
  if (kSan) { kSan.max = 25; kSan.current = 22; }

  // Seed multi-currency wallet balances for Kaelen Voss
  const kMo = kaelen.wallet.currencies.find((c) => c.symbol === 'MO');
  const kMpCur = kaelen.wallet.currencies.find((c) => c.symbol === 'MP');
  const kMc = kaelen.wallet.currencies.find((c) => c.symbol === 'MC');
  const kFa = kaelen.wallet.currencies.find((c) => c.symbol === 'FA');
  if (kMo) kMo.amount = 42;
  if (kMpCur) kMpCur.amount = 18;
  if (kMc) kMc.amount = 65;
  if (kFa) kFa.amount = 3;

  const swordId = 'item_espada_runica';
  const armorId = 'item_couraca_ferro';
  const ringId = 'item_anel_vigilia';
  const cloakId = 'item_capa_cinzenta';
  const potionId = 'item_tonico_carmesim';

  kaelen.inventory = [
    {
      id: swordId,
      name: 'Montante de Aço Rúnico',
      defaultImageUrl: '/src/assets/images/item_runeblade_1794780444321.jpg',
      description: 'Espada longa de duas mãos forjada em ferro negro com guarda de latão.',
      category: 'Armas',
      subcategory: 'Espadas Longas',
      storageLocation: 'Mochila',
      quantity: 1,
      weight: 3.4,
      monetaryValue: 240,
      currencyUnit: 'MO',
      rarity: 'raro',
      equippable: true,
      compatibleSlotTypes: ['hand'],
      twoHanded: true,
      requiredSlotsCount: 2,
      attributeModifiers: kFor ? [{ attributeId: kFor.id, attributeName: kFor.name, value: 2 }] : [],
      resourceModifiers: [],
      effectsText: '+2 em Força enquanto empunhada com ambas as mãos.',
      damageText: '2d6 + FOR',
      damageAttributeIds: kFor ? [kFor.id] : [],
      notes: 'Afiação mantida com óleo de pedra.',
      customFields: [],
    },
    {
      id: armorId,
      name: 'Couraça de Ferro Batido',
      description: 'Peitoral marcado por antigas batalhas, reforçado com rebites de bronze.',
      category: 'Armaduras',
      subcategory: 'Peitorais',
      storageLocation: 'Mochila',
      quantity: 1,
      weight: 8.5,
      monetaryValue: 180,
      currencyUnit: 'mo',
      rarity: 'incomum',
      equippable: true,
      compatibleSlotTypes: ['chest'],
      twoHanded: false,
      requiredSlotsCount: 1,
      attributeModifiers: kCon ? [{ attributeId: kCon.id, attributeName: kCon.name, value: 2 }] : [],
      resourceModifiers: kHp ? [{ resourceId: kHp.id, resourceName: kHp.name, maxBonus: 10 }] : [],
      effectsText: '+2 Constituição e +10 Vida Máxima.',
      notes: '',
      customFields: [],
    },
    {
      id: ringId,
      name: 'Anel da Vigília Antiga',
      description: 'Sinete de prata oxidada com gravação solar.',
      category: 'Acessórios',
      subcategory: 'Anéis',
      storageLocation: 'Mochila',
      quantity: 1,
      weight: 0.1,
      monetaryValue: 95,
      currencyUnit: 'mo',
      rarity: 'raro',
      equippable: true,
      compatibleSlotTypes: ['ring'],
      twoHanded: false,
      requiredSlotsCount: 1,
      attributeModifiers: kSab ? [{ attributeId: kSab.id, attributeName: kSab.name, value: 1 }] : [],
      resourceModifiers: [],
      effectsText: '+1 Sabedoria enquanto equipado.',
      notes: '',
      customFields: [],
    },
    {
      id: cloakId,
      name: 'Manto de Lã Cinzenta',
      description: 'Protege contra chuva e vento cortante nas montanhas.',
      category: 'Armaduras',
      subcategory: 'Capas',
      storageLocation: 'Mochila',
      quantity: 1,
      weight: 1.2,
      monetaryValue: 25,
      currencyUnit: 'mo',
      rarity: 'comum',
      equippable: true,
      compatibleSlotTypes: ['back'],
      twoHanded: false,
      requiredSlotsCount: 1,
      attributeModifiers: [],
      resourceModifiers: [],
      effectsText: 'Resistência térmica em clima frio.',
      notes: '',
      customFields: [],
    },
    {
      id: potionId,
      name: 'Tônico Carmesim',
      description: 'Extrato alquímico concentrado que acelera a cicatrização.',
      category: 'Consumíveis',
      subcategory: 'Poções',
      storageLocation: 'Bolsa de Poções',
      quantity: 4,
      weight: 0.3,
      monetaryValue: 35,
      currencyUnit: 'mo',
      rarity: 'incomum',
      equippable: false,
      compatibleSlotTypes: [],
      twoHanded: false,
      requiredSlotsCount: 1,
      attributeModifiers: [],
      resourceModifiers: [],
      effectsText: 'Restaura 15 pontos de Vida ao consumir.',
      notes: '',
      customFields: [],
    },
  ];

  // Link initial equipment on Kaelen
  const slotRightHand = kaelen.equipmentSlots.find((s) => s.region === 'rightHand');
  const slotLeftHand = kaelen.equipmentSlots.find((s) => s.region === 'leftHand');
  const slotChest = kaelen.equipmentSlots.find((s) => s.region === 'chest');
  const slotRings = kaelen.equipmentSlots.find((s) => s.region === 'rings');
  const slotBack = kaelen.equipmentSlots.find((s) => s.region === 'back');

  if (slotRightHand && slotLeftHand) {
    slotRightHand.equippedItems.push({ itemId: swordId, linkedGroupId: 'grp_seed_sword' });
    slotLeftHand.equippedItems.push({ itemId: swordId, linkedGroupId: 'grp_seed_sword' });
  }
  if (slotChest) slotChest.equippedItems.push({ itemId: armorId });
  if (slotRings) slotRings.equippedItems.push({ itemId: ringId });
  if (slotBack) slotBack.equippedItems.push({ itemId: cloakId });

  const catAtiva = kaelen.abilityCategories[0]?.id || 'cat_1';
  const catMagia = kaelen.abilityCategories[1]?.id || 'cat_2';
  const catPostura = kaelen.abilityCategories[2]?.id || 'cat_3';
  const catPassiva = kaelen.abilityCategories[3]?.id || 'cat_4';

  kaelen.abilities = [
    {
      id: 'ab_aura_ferro',
      name: 'Postura da Muralha Ardente',
      defaultImageUrl: '/src/assets/images/crest_grimoire_1794780445477.jpg',
      categoryId: catPostura,
      abilityRole: 'effect',
      subcategory: 'Defesa Sustentada',
      level: 2,
      description: 'Canaliza energia arcana para endurecer a armadura e ampliar a força física a cada turno.',
      abilityType: 'sustained',
      requirements: 'Armadura equipada',
      initialCosts: kMp && kVig ? [{ resourceId: kMp.id, amount: 8 }, { resourceId: kVig.id, amount: 4 }] : [],
      recurringCosts: kMp ? [{ resourceId: kMp.id, amount: 3 }] : [],
      durationTurns: 4,
      cooldownTurns: 3,
      cooldownStartCondition: 'on_deactivate',
      effectsText: '+3 Constituição e +2 Força durante a postura.',
      damageText: '',
      turnDiceText: '',
      attributeModifiers: [
        ...(kCon ? [{ attributeId: kCon.id, attributeName: kCon.name, value: 3 }] : []),
        ...(kFor ? [{ attributeId: kFor.id, attributeName: kFor.name, value: 2 }] : []),
      ],
      resourceModifiers: [],
      customFields: [],
      isActive: false,
      remainingDuration: 0,
      remainingCooldown: 0,
      timingRules: { ...DEFAULT_TIMING_RULES },
      insufficientResourceRule: 'auto_deactivate',
    },
    {
      id: 'ab_golpe_cleave',
      name: 'Corte Transversal',
      categoryId: catAtiva,
      abilityRole: 'damage',
      subcategory: 'Ataque Direto',
      level: 1,
      description: 'Golpe amplo com espada de duas mãos que atinge múltiplos inimigos à frente.',
      abilityType: 'instant',
      requirements: 'Arma pesada',
      initialCosts: kVig ? [{ resourceId: kVig.id, amount: 6 }] : [],
      recurringCosts: [],
      durationTurns: 0,
      cooldownTurns: 2,
      cooldownStartCondition: 'on_activate',
      effectsText: 'Ataque em arco de 180 graus.',
      damageText: '2d8 + FOR cortante',
      damageAttributeIds: kFor ? [kFor.id] : [],
      turnDiceText: '',
      attributeModifiers: [],
      resourceModifiers: [],
      customFields: [],
      isActive: false,
      remainingDuration: 0,
      remainingCooldown: 0,
      timingRules: { ...DEFAULT_TIMING_RULES },
      insufficientResourceRule: 'auto_deactivate',
    },
    {
      id: 'ab_selo_chama',
      name: 'Selo da Lâmina Ígnea',
      categoryId: catMagia,
      abilityRole: 'turn_dice',
      subcategory: 'Dano Contínuo por Turno',
      level: 3,
      description: 'Imbui a arma com brasas antigas causando dano contínuo ao longo dos turnos.',
      abilityType: 'fixed_duration',
      requirements: 'Mão livre ou catalisador',
      initialCosts: kMp ? [{ resourceId: kMp.id, amount: 10 }] : [],
      recurringCosts: [],
      durationTurns: 3,
      cooldownTurns: 4,
      cooldownStartCondition: 'on_deactivate',
      effectsText: 'Brasas ativas na lâmina enquanto durar o selo.',
      damageText: '1d6 fogo inicial',
      turnDiceText: '1d6 fogo por turno',
      attributeModifiers: kFor ? [{ attributeId: kFor.id, attributeName: kFor.name, value: 1 }] : [],
      resourceModifiers: [],
      customFields: [],
      isActive: false,
      remainingDuration: 0,
      remainingCooldown: 0,
      timingRules: { ...DEFAULT_TIMING_RULES },
      insufficientResourceRule: 'auto_deactivate',
    },
    {
      id: 'ab_folego_imediato',
      name: 'Passo de Retomada',
      categoryId: catAtiva,
      abilityRole: 'immediate',
      subcategory: 'Uso Imediato',
      level: 1,
      description: 'Impulso imediato para reposicionar-se e recuperar o fôlego em combate.',
      abilityType: 'instant',
      requirements: '',
      initialCosts: kVig ? [{ resourceId: kVig.id, amount: 3 }] : [],
      recurringCosts: [],
      durationTurns: 0,
      cooldownTurns: 1,
      cooldownStartCondition: 'on_activate',
      effectsText: 'Deslocamento rápido sem provocar reações.',
      damageText: '',
      turnDiceText: '',
      attributeModifiers: [],
      resourceModifiers: [],
      customFields: [],
      isActive: false,
      remainingDuration: 0,
      remainingCooldown: 0,
      timingRules: { ...DEFAULT_TIMING_RULES },
      insufficientResourceRule: 'auto_deactivate',
    },
    {
      id: 'ab_vigilia_eterna',
      name: 'Sangue Veterano',
      categoryId: catPassiva,
      abilityRole: 'fixed',
      subcategory: 'Passiva Fixa',
      level: 1,
      description: 'Anos de campanha fortalecem permanentemente a resistência a efeitos mentais.',
      abilityType: 'passive',
      requirements: '',
      initialCosts: [],
      recurringCosts: [],
      durationTurns: 0,
      cooldownTurns: 0,
      cooldownStartCondition: 'on_activate',
      effectsText: '+1 Vitalidade permanente em combate.',
      damageText: '',
      turnDiceText: '',
      attributeModifiers: kVit ? [{ attributeId: kVit.id, attributeName: kVit.name, value: 1 }] : [],
      resourceModifiers: [],
      customFields: [],
      isActive: true,
      remainingDuration: 0,
      remainingCooldown: 0,
      timingRules: { ...DEFAULT_TIMING_RULES },
      insufficientResourceRule: 'auto_deactivate',
    },
  ];

  kaelen.notes = [
    {
      id: 'note_1',
      title: 'Contrato em Cinzas de Valdris',
      folder: 'Missões',
      category: 'missao',
      content:
        '## Objetivo Principal\nInvestigar o desaparecimento da caravana de suprimentos na **Passagem do Corvo**.\n\n- Falar com o ferreiro Torvald ao amanhecer\n- Verificar marcas rúnicas na ponte oeste',
      imageIds: [],
      pinned: true,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 3600000,
    },
    {
      id: 'note_2',
      title: 'Irmã Isolde — Arquivista',
      folder: 'NPCs',
      category: 'npc',
      content:
        'Guardiã dos tomos selados no monastério de pedra. Conhece a origem da assinatura gravada na guarda da Montante.',
      imageIds: [],
      pinned: false,
      createdAt: Date.now() - 172800000,
      updatedAt: Date.now() - 7200000,
    },
  ];

  kaelen.knowledge = [
    {
      id: 'knw_valdris_chronicles',
      title: 'Crônicas do Cerco de Valdris',
      kind: 'book',
      source: 'Arquivos da Vigília de Ferro',
      summary: 'Registro histórico das táticas de cerco e rotas subterrâneas sob a muralha oeste.',
      details: 'Detalha três passagens de suprimentos seladas sob o quartel antigo e o código de sinos da guarda fronteiriça.',
      progress: 'Lido por completo',
      learnedAt: 'Antes da campanha',
      createdAt: Date.now() - 250000000,
    },
    {
      id: 'knw_baixo_valdriano',
      title: 'Dialeto Baixo Valdriano',
      kind: 'language',
      source: 'Convivência na fronteira',
      summary: 'Leitura e compreensão oral das inscrições rurais e marcos de estrada do norte.',
      details: 'Permite decifrar avisos antigos esculpidos em pontes e marcos de pedra sem necessidade de intérprete.',
      progress: 'Fluente',
      learnedAt: 'Juventude nas estradas',
      createdAt: Date.now() - 200000000,
    },
    {
      id: 'knw_oleo_pedra',
      title: 'Preparo de Óleo de Afiar Rúnico',
      kind: 'recipe',
      source: 'Ferreiro Torvald',
      summary: 'Mistura de óleo mineral, carvão fino e cinza de zimbro para preservar aço rúnico.',
      details: 'Evita oxidação sob chuva contínua nas montanhas e mantém o fio da lâmina estável durante marchas longas.',
      progress: 'Memorizado',
      learnedAt: 'Sessão 2',
      createdAt: Date.now() - 90000000,
    },
    {
      id: 'knw_concha_mare',
      title: 'Concha Ecoante da Maré Baixa',
      kind: 'shell',
      source: 'Costa de Pedra Alta',
      summary: 'Concha espiralada que preserva cânticos e coordenadas antigas de navegação.',
      details: 'Quando aproximada do ouvido na maré baixa, reproduz um aviso gravado pelos antigos faroleiros da costa norte.',
      progress: 'Sintonizada',
      learnedAt: 'Sessão 1',
      createdAt: Date.now() - 75000000,
    },
  ];

  // Character 2: Aldric Thorne (Arcanista — demonstrates custom attributes/resources)
  const aldric = createCharacterFromTemplate(fantasyTpl, 'Aldric Thorne');
  aldric.id = 'char_aldric_thorne';
  aldric.identity = {
    ...aldric.identity,
    name: 'Aldric Thorne',
    defaultPortraitUrl: '/src/assets/images/portrait_arcanist_1794780444826.jpg',
    race: 'Meio-Elfo',
    characterClass: 'Cartógrafo Arcano',
    subclass: 'Ordem do Astrolábio',
    age: '44 anos',
    title: 'Mestre de Selos',
    affiliation: 'Observatório de Bruma',
    level: 6,
    currentXp: 410,
    nextLevelXp: 1200,
  };
  aldric.resources = [
    { id: 'ald_hp', name: 'Vida', current: 42, max: 42, min: 0, tempBonus: 0, color: '#C94040', icon: 'heart', order: 0 },
    { id: 'ald_et', name: 'Éter Estelar', current: 60, max: 60, min: 0, tempBonus: 0, color: '#4B7FD6', icon: 'droplet', order: 1 },
    { id: 'ald_fc', name: 'Foco Mental', current: 18, max: 20, min: 0, tempBonus: 0, color: '#34A876', icon: 'eye', order: 2 },
  ];
  aldric.wallet = {
    currencies: [
      { id: 'ald_mo', name: 'Coroas de Ouro', symbol: 'CO', amount: 115, exchangeRate: 1, color: '#D19A38', order: 0 },
      { id: 'ald_mp', name: 'Dracmas de Prata', symbol: 'DP', amount: 40, exchangeRate: 0.1, color: '#94A3B8', order: 1 },
      { id: 'ald_ca', name: 'Cristais Astrais', symbol: 'CA', amount: 7, exchangeRate: 0, color: '#38BDF8', order: 2 },
    ],
    enableConversion: true,
    baseCurrencyId: 'ald_mo',
    autoConvertOverflow: false,
    history: [],
  };
  aldric.notes = [
    {
      id: 'note_ald_1',
      title: 'Anotações do Astrolábio',
      folder: 'Geral',
      category: 'pessoal',
      content: 'Conjunção prevista para a próxima lua minguante. Recalibrar os selos de proteção.',
      imageIds: [],
      pinned: true,
      createdAt: Date.now() - 500000,
      updatedAt: Date.now() - 500000,
    },
  ];
  aldric.knowledge = [
    {
      id: 'knw_ald_1',
      title: 'Tratado dos Selos Astrais (Vol. II)',
      kind: 'book',
      source: 'Observatório de Bruma',
      summary: 'Compêndio de geometria estelar e calibração de círculos de contenção.',
      details: 'Contém tabelas de conjunções lunares e ângulos seguros para ancoragem de energia etérea.',
      progress: 'Capítulo 4 / 6',
      learnedAt: 'Em estudo',
      createdAt: Date.now() - 400000,
    },
  ];

  // Ensure schemaVersion and defaults
  const characters: Character[] = [
    {
      ...kaelen,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabledModules: { ...DEFAULT_MODULES },
    },
    {
      ...aldric,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabledModules: { ...DEFAULT_MODULES },
    },
  ];

  const generalNotes: JournalNote[] = [
    {
      id: 'gnote_1',
      title: 'Diário de Campanha — Crônicas da Fronteira',
      folder: 'Campanha',
      category: 'sessao',
      content:
        'Anotações compartilhadas da mesa: o grupo partiu de Pedra Alta rumo às ruínas submersas.',
      imageIds: [],
      pinned: true,
      createdAt: Date.now() - 300000,
      updatedAt: Date.now() - 300000,
    },
  ];

  return {
    templates,
    characters,
    generalNotes,
  };
}
