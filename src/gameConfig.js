// 화폐를 골드/실버/구리로 세분화해서 표시하는 헬퍼 함수
// 내부적으로는 여전히 하나의 숫자(구리 단위)로만 계산하고, 화면에 보여줄 때만 이 함수로 쪼갬
// 1골드 = 100실버 = 10000구리
export function formatCurrency(totalCopper) {
  const gold = Math.floor(totalCopper / 10000);
  const silver = Math.floor((totalCopper % 10000) / 100);
  const copper = totalCopper % 100;

  const parts = [];
  if (gold > 0) parts.push(`${gold}G`);
  if (gold > 0 || silver > 0) parts.push(`${silver}S`);
  parts.push(`${copper}C`); // 구리는 항상 표시 (0이어도 "0C"로 나와서 단위가 뭔지 헷갈리지 않게)
  return parts.join(' ');
}

// 전투 직업 목록이에요. 게임 시작 전에 하나를 골라서 시작 스탯이 달라지게 돼요.
// attackPower/maxHp/moveSpeed는 기본값(공격력10, 체력100, 속도200) 대신 쓸 값들이에요.
// nightAttackBonus/companionBonusMultiplier는 있는 직업만 적용되는 특별한 보너스예요
// (없는 직업은 그냥 undefined라서, 코드에서 없으면 무시하도록 처리할 거예요)
// 이제 직업은 attackPower/maxHp/moveSpeed를 직접 주지 않고, 근본 스탯(근력/활력/민첩/지능/감각)을
// 얼마씩 갖고 시작하는지로 정의해요. 실제 공격력/체력 같은 값은 GameScene의
// recalculateDerivedStats()가 이 근본 스탯을 보고 매번 계산해서 만들어줘요.
export const CLASS_TYPES = {
  warrior: {
    name: '전사', icon: '⚔️',
    description: '높은 체력과 공격력을 가진 근접 전투 전문가',
    primaryStats: { str: 10, vit: 10, agi: 2, int: 1, sen: 2 },
    startingHp: 140 // 시작 시 체력을 꽉 채워줄 기준값 (근본 스탯으로 계산된 maxHp와 같아야 자연스러움)
  },
  archer: {
    name: '궁수', icon: '🏹',
    description: '빠른 몸놀림으로 치고 빠지는 원거리 전문가',
    primaryStats: { str: 5, vit: 5, agi: 9, int: 2, sen: 4 },
    attackType: 'ranged' // 기본 공격이 근접이 아니라 원거리로 나감 (없으면 기본값 melee)
  },
  mage: {
    name: '마법사', icon: '🔮',
    description: '압도적인 공격력이지만 체력이 약함',
    primaryStats: { str: 2, vit: 3, agi: 3, int: 14, sen: 3 },
    attackType: 'ranged'
  },
  priest: {
    name: '성직자', icon: '🕊️',
    description: '공격력은 낮지만 생존력이 좋은 서포터',
    primaryStats: { str: 2, vit: 10, agi: 3, int: 7, sen: 3 }
  },
  rogue: {
    name: '도적', icon: '🗡️',
    description: '밤이 되면 더욱 위협적으로 변하는 그림자',
    primaryStats: { str: 4, vit: 4, agi: 11, int: 2, sen: 4 },
    nightAttackBonus: 6 // 밤에는 공격력이 추가로 이만큼 더 붙음
  },
  summoner: {
    name: '소환사', icon: '👻',
    description: '동료와 함께 싸울 때 진가를 발휘함',
    primaryStats: { str: 3, vit: 6, agi: 3, int: 10, sen: 3 },
    companionBonusMultiplier: 1.6 // 동료의 전투 보너스 데미지가 이 배율만큼 커짐
  }
};

// 직업별 스킬 목록이에요. 아직 스킬이 없는 직업은 빈 배열([])로 자리만 잡아뒀어요
// (나중에 하나씩 채워나가면 됨). 각 스킬은 레벨업할 때마다 effectType 스탯이
// effectPerLevel만큼 늘어나요. 이 구조는 나중에 장비의 부가 옵션이 스탯을 더해줄 때도
// 그대로 재사용할 수 있게, equipment의 effectType과 같은 이름 체계를 씀
// 각 스킬의 unlockCondition으로 해금 조건을 정의해요.
// { type: 'always' } - 처음부터 배울 수 있음
// { type: 'level', value: N } - 캐릭터 레벨이 N 이상이어야 함
// { type: 'kills', value: N } - 몬스터를 총 N마리 이상 처치해야 함 (전투 중 자연스럽게 해금됨)
export const CLASS_SKILLS = {
  warrior: [
    {
      id: 'warrior_slash_mastery', name: '베기 숙련', maxLevel: 5,
      effectType: 'attack', effectPerLevel: 2,
      unlockCondition: { type: 'always' },
      description: '레벨당 공격력 +2'
    },
    {
      id: 'warrior_toughness', name: '불굴의 의지', maxLevel: 5,
      effectType: 'maxHp', effectPerLevel: 15,
      unlockCondition: { type: 'always' },
      description: '레벨당 최대체력 +15'
    },
    {
      id: 'warrior_iron_wall', name: '철벽 방어', maxLevel: 5,
      effectType: 'defense', effectPerLevel: 2,
      unlockCondition: { type: 'level', value: 3 },
      description: '레벨당 방어력 +2'
    },
    {
      id: 'warrior_berserk', name: '광전사의 분노', maxLevel: 5,
      effectType: 'attack', effectPerLevel: 3,
      unlockCondition: { type: 'kills', value: 15 },
      description: '레벨당 공격력 +3 (몬스터 15마리 처치 시 해금)'
    },
    {
      id: 'warrior_critical_moment', name: '결정의 순간', maxLevel: 5,
      effectType: 'critChance', effectPerLevel: 1.5,
      unlockCondition: { type: 'level', value: 7 },
      description: '레벨당 치명타 확률 +1.5%'
    }
  ],
  archer: [],
  mage: [],
  priest: [],
  rogue: [],
  summoner: []
};


// 게임 전체 설정값 모음 (나중에 옵션 화면에서 조정 가능하게 분리해둠)
export const GAME_CONFIG = {
  treeCount: 3,
  stoneCount: 2,
  rabbitCount: 3,
  wolfCount: 4,
  wolfRespawnMin: 5000, // 늑대 리스폰 최소 시간(ms)
  wolfRespawnMax: 10000, // 늑대 리스폰 최대 시간(ms)
  dayLengthSeconds: 300 // 게임 속 하루(24시간)가 현실 300초(5분) 동안 흐름 - 테스트하기 좋게 짧게 잡음
};

// 자원/동물/몬스터 등 게임 안의 모든 상호작용 오브젝트 정의
// category에 따라 게임 로직이 자동으로 다르게 행동함 (resource / passive_animal / hostile_monster)
export const ENTITY_TYPES = {
  tree: {
    name: '나무', category: 'resource',
    exp: 10, color: 0x2d5016, radius: 20, sound: 400, hp: 1
  },
  stone: {
    name: '돌', category: 'resource',
    exp: 15, color: 0x808080, radius: 18, sound: 250, hp: 1
  },
  rabbit: {
    name: '토끼', category: 'passive_animal',
    exp: 20, color: 0xffa500, radius: 15, sound: 700, hp: 1
  },
  wolf: {
    name: '늑대', category: 'hostile_monster',
    exp: 40, hp: 30, damage: 10, speed: 80, sound: 150,
    renderType: 'sprite',
    spriteIdleKey: 'wolf_idle', spriteIdleFrames: 8,
    spriteRunKey: 'wolf_run', spriteRunFrames: 3,
    spriteScale: 2.5,
    facingOffsetDeg: 240
  }
};

// NPC 정보 (이름, 스프라이트 키, 대사) - 캐릭터 스프라이트 도입 후 color 대신 spriteKey 사용
// 새 NPC를 늘리려면 여기에 항목만 추가하고, GameScene의 npcPositions 배열에 위치만 추가하면 됨
export const NPC_DATA = {
  villager1: {
    name: '마을 주민',
    spriteKey: 'npc_villager1',
    hasShop: true, // 이 NPC만 상점을 열 수 있음 (기존 단일 NPC 시절의 상점 기능을 그대로 유지)
    dialogues: [
      '안녕하세요! 오늘 날씨가 좋네요.',
      '이 근처에 나무와 돌이 많으니 채집해보세요.',
      '늑대를 조심하세요, 꽤 사나워요!'
    ]
  },
  villager2: {
    name: '수다쟁이 이웃',
    spriteKey: 'npc_villager2',
    hasShop: false, // 상점 없이 대화만 가능
    dialogues: [
      '요즘 마을에 새로운 사람들이 늘고 있어요.',
      '저기 저 집 보이시죠? 제법 아늑하답니다.'
    ]
  },
  villager3: {
    name: '떠돌이 여행자',
    spriteKey: 'npc_villager3',
    hasShop: false, // 상점 없이 대화만 가능
    dialogues: [
      '이곳저곳 돌아다니는 걸 좋아해요.',
      '토끼는 순하지만 늑대는 정말 조심해야 해요.'
    ]
  },
  // 주점 안에서만 등장하는 길드 담당자예요. 실외 NPC들과 달리 npcPositions 배열에는
  // 안 들어가고, GameScene의 toggleHouse()에서 주점에 들어갈 때만 직접 만들어져요.
  // 이름: 리나 (19세) - 처음 온 용병/여행자를 살갑게 챙겨주는 주점 언니 컨셉.
  // 다정하고 장난기 섞인 말투로 격려해주는 성격
  rina: {
    name: '리나',
    spriteKey: 'npc_villager2', // 밖에 있는 상인(villager1)과는 다른 얼굴로 구분되게 함
    hasShop: false,
    dialogues: [
      '어서 와~ 처음 보는 얼굴이네? 여기 앉아서 편하게 쉬어.',
      '무리하지 마. 다치면 꼭 나한테 와서 말해, 알았지?',
      '저기 게시판 확인해봤어? 너 정도면 금방 늘 거야, 내가 보장할게.',
      '밤엔 늑대들이 사나워지니까 조심하고. 걱정돼서 그래.',
      '여기 있는 동안은 집이라고 생각하고 편하게 있어.'
    ]
  }
};

// 상점에서 구매 가능한 아이템 목록
// category: 'consumable'(즉시 사용/소모) 또는 'equipment'(장착/해제, 장착 중일 때만 효과 적용)
// equipment는 slot(장착 부위)을 가짐 - 지금은 weapon 하나뿐이지만 나중에 방어구 등으로 확장 가능
// 내구도 시스템은 추후 추가 예정 (지금은 장착/해제 기반까지만 구현)
// 장비 슬롯 목록이에요. UI에서 "이 슬롯엔 이 이름표를 붙여서 보여줘"라고 할 때 씀
// (하드코딩으로 "장착 무기" 한 줄만 있던 걸, 이 데이터를 순회하며 모든 슬롯을 자동으로 보여주는 방식으로 바꿀 거예요)
export const EQUIPMENT_SLOTS = [
  { id: 'head', label: '머리', icon: '🪖' },
  { id: 'body', label: '몸통', icon: '👕' },
  { id: 'pants', label: '바지', icon: '👖' },
  { id: 'gloves', label: '장갑', icon: '🧤' },
  { id: 'shoes', label: '신발', icon: '👟' },
  { id: 'weapon', label: '무기', icon: '🗡' },
  { id: 'shield', label: '방패', icon: '🛡' },
  { id: 'ring', label: '반지', icon: '💍' },
  { id: 'necklace', label: '목걸이', icon: '📿' }
];

// 상점/시장에서 거래 가능한 모든 아이템 목록
// basePrice는 재고가 기준치(10)일 때의 가격. 실제 거래 가격은 GameScene의
// getMarketPrice()가 재고량에 따라 매번 다시 계산함 (사면 비싸지고, 팔면 싸짐)
// category: 'consumable'(사용/소모), 'equipment'(장착/해제), 'resource'/'monster'(채집물, 사용 불가·거래만 가능)
export const SHOP_ITEMS = [
  { id: 'potion_small', name: '작은 포션', basePrice: 20, category: 'consumable', effectType: 'heal', effectValue: 30, icon: null },
  { id: 'potion_large', name: '큰 포션', basePrice: 50, category: 'consumable', effectType: 'heal', effectValue: 100, icon: null },
  // maxDurability: 이 장비가 부서지기 전까지 몬스터를 몇 번 때릴 수 있는지를 뜻해요
  { id: 'item_pickaxe', name: '낡은 곡괭이', basePrice: 30, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 3, icon: 'item_pickaxe.png', maxDurability: 30 },
  { id: 'item_gadget', name: '수상한 부품', basePrice: 25, category: 'equipment', slot: 'weapon', effectType: 'speed', effectValue: 5, icon: 'item_gadget.png', maxDurability: 25 },
  { id: 'item_wrench', name: '만능 렌치', basePrice: 50, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 5, icon: 'item_wrench.png', maxDurability: 40 },
  { id: 'item_signpost', name: '이정표', basePrice: 40, category: 'equipment', slot: 'weapon', effectType: 'maxHp', effectValue: 20, icon: 'item_signpost.png', maxDurability: 35 },
  { id: 'item_stopsign', name: '경고 표지판', basePrice: 60, category: 'equipment', slot: 'weapon', effectType: 'maxHp', effectValue: 30, icon: 'item_stopsign.png', maxDurability: 45 },
  { id: 'item_crosssign', name: '교차로 표지판', basePrice: 70, category: 'equipment', slot: 'weapon', effectType: 'speed', effectValue: 15, icon: 'item_crosssign.png', maxDurability: 50 },
  { id: 'item_streetlamp', name: '가로등 부품', basePrice: 90, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 8, icon: 'item_streetlamp.png', maxDurability: 60 },

  // 머리
  { id: 'head_leather_cap', name: '가죽 모자', basePrice: 25, category: 'equipment', slot: 'head', effectType: 'maxHp', effectValue: 15, icon: null, maxDurability: 25 },
  { id: 'head_steel_helm', name: '강철 투구', basePrice: 55, category: 'equipment', slot: 'head', effectType: 'defense', effectValue: 3, icon: null, maxDurability: 45 },
  // 몸통
  { id: 'body_cloth_robe', name: '천 갑옷', basePrice: 30, category: 'equipment', slot: 'body', effectType: 'maxHp', effectValue: 25, icon: null, maxDurability: 30 },
  { id: 'body_chain_mail', name: '사슬 갑옷', basePrice: 65, category: 'equipment', slot: 'body', effectType: 'defense', effectValue: 5, icon: null, maxDurability: 50 },
  // 바지
  { id: 'pants_leather', name: '가죽 바지', basePrice: 22, category: 'equipment', slot: 'pants', effectType: 'speed', effectValue: 8, icon: null, maxDurability: 25 },
  { id: 'pants_steel_greaves', name: '강철 각반', basePrice: 50, category: 'equipment', slot: 'pants', effectType: 'defense', effectValue: 3, icon: null, maxDurability: 40 },
  // 장갑
  { id: 'gloves_leather', name: '가죽 장갑', basePrice: 20, category: 'equipment', slot: 'gloves', effectType: 'attack', effectValue: 3, icon: null, maxDurability: 25 },
  { id: 'gloves_gauntlet', name: '강철 건틀릿', basePrice: 45, category: 'equipment', slot: 'gloves', effectType: 'defense', effectValue: 2, icon: null, maxDurability: 35 },
  // 신발
  { id: 'shoes_leather', name: '가죽 신발', basePrice: 20, category: 'equipment', slot: 'shoes', effectType: 'speed', effectValue: 10, icon: null, maxDurability: 25 },
  { id: 'shoes_steel_boots', name: '강철 부츠', basePrice: 45, category: 'equipment', slot: 'shoes', effectType: 'defense', effectValue: 2, icon: null, maxDurability: 35 },
  // 방패
  { id: 'shield_wood', name: '나무 방패', basePrice: 30, category: 'equipment', slot: 'shield', effectType: 'defense', effectValue: 4, icon: null, maxDurability: 30 },
  { id: 'shield_steel', name: '강철 방패', basePrice: 70, category: 'equipment', slot: 'shield', effectType: 'defense', effectValue: 8, icon: null, maxDurability: 55 },
  // 반지
  { id: 'ring_agility', name: '민첩의 반지', basePrice: 60, category: 'equipment', slot: 'ring', effectType: 'critChance', effectValue: 3, icon: null, maxDurability: 999 },
  { id: 'ring_power', name: '힘의 반지', basePrice: 60, category: 'equipment', slot: 'ring', effectType: 'attack', effectValue: 5, icon: null, maxDurability: 999 },
  // 목걸이
    { id: 'necklace_vitality', name: '활력의 목걸이', basePrice: 65, category: 'equipment', slot: 'necklace', effectType: 'maxHp', effectValue: 30, icon: null, maxDurability: 999 },
  { id: 'necklace_swift', name: '신속의 목걸이', basePrice: 65, category: 'equipment', slot: 'necklace', effectType: 'speed', effectValue: 12, icon: null, maxDurability: 999 },

  // 사냥터 보스 전용 레어 장비 - rareOnly:true는 상점에서 안 팔고 오직 사냥터 보스만 드랍한다는 표시예요
  { id: 'rare_worn_charm', name: '낡은 부적', basePrice: 150, category: 'equipment', slot: 'necklace', effectType: 'attack', effectValue: 8, rareOnly: true, icon: null, maxDurability: 999 },
  { id: 'rare_iron_blade', name: '고철 대검', basePrice: 300, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 15, rareOnly: true, icon: null, maxDurability: 60 },
  { id: 'rare_swift_boots', name: '질풍의 장화', basePrice: 350, category: 'equipment', slot: 'shoes', effectType: 'speed', effectValue: 20, rareOnly: true, icon: null, maxDurability: 45 },
  { id: 'rare_guardian_shield', name: '수호자의 방패', basePrice: 450, category: 'equipment', slot: 'shield', effectType: 'defense', effectValue: 12, rareOnly: true, icon: null, maxDurability: 60 },
  { id: 'rare_hunters_ring', name: '사냥꾼의 반지', basePrice: 550, category: 'equipment', slot: 'ring', effectType: 'critChance', effectValue: 8, rareOnly: true, icon: null, maxDurability: 999 },
    { id: 'rare_ancient_amulet', name: '고대의 부적', basePrice: 700, category: 'equipment', slot: 'necklace', effectType: 'maxHp', effectValue: 50, rareOnly: true, icon: null, maxDurability: 999 },

  // 던전 최상위 등급(S/SS/SSS) 전용 레어 장비 - 사냥터보다 훨씬 강력함
  { id: 'dungeon_rare_s', name: '천상의 검', basePrice: 900, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 25, rareOnly: true, icon: null, maxDurability: 80 },
  { id: 'dungeon_rare_ss', name: '용의 비늘 갑옷', basePrice: 1200, category: 'equipment', slot: 'body', effectType: 'defense', effectValue: 20, rareOnly: true, icon: null, maxDurability: 90 },
  { id: 'dungeon_rare_sss', name: '신화의 반지', basePrice: 1800, category: 'equipment', slot: 'ring', effectType: 'critChance', effectValue: 15, rareOnly: true, icon: null, maxDurability: 999 },
  { id: 'tree', name: '나무', basePrice: 5, category: 'resource', icon: null },
  { id: 'stone', name: '돌', basePrice: 8, category: 'resource', icon: null },
  { id: 'rabbit', name: '토끼 고기', basePrice: 12, category: 'monster', icon: null },
  { id: 'wolf', name: '늑대 가죽', basePrice: 25, category: 'monster', icon: null },

  // 씨앗 아이템들 - category가 'seed'라서, 상점에서는 다른 아이템처럼 그냥 사고팔 수 있지만
  // 사용(useItem)이나 장착(equipItem) 대상은 아니고, 오직 "밭에 심기(plantSeed)"에만 쓰임
  // cropType은 이 씨앗을 심으면 어떤 CROP_TYPES 항목으로 자라는지 연결해주는 값
  { id: 'wheat_seed', name: '밀 씨앗', basePrice: 15, category: 'seed', cropType: 'wheat', icon: null },
  { id: 'carrot_seed', name: '당근 씨앗', basePrice: 25, category: 'seed', cropType: 'carrot', icon: null },
  { id: 'tomato_seed', name: '토마토 씨앗', basePrice: 40, category: 'seed', cropType: 'tomato', icon: null },

  // 수확한 농작물들 - category가 'crop'. 씨앗과 마찬가지로 상점에서 팔 수 있는 대상이지만
  // 씨앗과는 반대로 "심는" 게 아니라 그냥 상인에게 팔아서 돈을 버는 용도임
  { id: 'wheat', name: '밀', basePrice: 8, category: 'crop', icon: null },
  { id: 'carrot', name: '당근', basePrice: 15, category: 'crop', icon: null },
  { id: 'tomato', name: '토마토', basePrice: 25, category: 'crop', icon: null },

  // 주점 전용 음식들이에요. category는 포션이랑 똑같이 'consumable'이라
  // 사용(useItem) 로직을 그대로 재사용할 수 있어요 (먹으면 HP 회복).
  // tavernOnly: true는 "일반 상인(villager1)한테는 안 팔고, 주점에서만 살 수 있다"는 표시예요.
  // App.js에서 상인 상점 목록을 만들 때 이 값이 true인 아이템은 걸러내고 안 보여줄 거예요.
  // unlimitedStock: true는 "재고 개념 없이 항상 살 수 있다"는 뜻이에요. 주점이 매번
  // 새로 만들어주는 음식이라는 설정이라, 다른 아이템처럼 재고가 바닥날 필요가 없어서 추가함
  { id: 'food_bread', name: '빵', basePrice: 15, category: 'consumable', effectType: 'heal', effectValue: 25, tavernOnly: true, unlimitedStock: true, icon: null },
  { id: 'food_stew', name: '스튜', basePrice: 35, category: 'consumable', effectType: 'heal', effectValue: 60, tavernOnly: true, unlimitedStock: true, icon: null }
];



// 작물 종류 정의 - 씨앗을 심으면 이 데이터를 기준으로 자라남
// growMinutes: 심은 뒤 다 자라기까지 걸리는 "게임 속" 시간(분). 실제 걸리는 현실 시간이 아니라
// 게임 안의 시계(하루=1440분) 기준이라, 게임 시간이 빨리 흐르면 그만큼 빨리 자람
// yieldMin/yieldMax: 수확할 때 몇 개가 나올지 범위 (그 사이 숫자 중 무작위로 하나 정해짐)
export const CROP_TYPES = {
  wheat: { name: '밀', growMinutes: 240, yieldMin: 2, yieldMax: 4, color: 0xd4c05a },
  carrot: { name: '당근', growMinutes: 480, yieldMin: 1, yieldMax: 3, color: 0xff8c3c },
  tomato: { name: '토마토', growMinutes: 720, yieldMin: 2, yieldMax: 3, color: 0xe0483c }
};

// 밭 구역 위치 목록 - 각자 다른 가격을 가짐 (비싼 밭이 딱히 더 좋은 건 아니고, 지금은 위치만 다름)
// 나중에 새 밭을 늘리고 싶으면 이 배열에 항목만 추가하면 됨 (집/NPC와 동일한 패턴)
export const FARM_PLOTS = [
  { id: 'farm1', x: 550, y: 580, price: 200 },
  { id: 'farm2', x: 350, y: 250, price: 350 },
  { id: 'farm3', x: 750, y: 400, price: 500 }
];

// 용병 등급 목록이에요. order는 등급의 순서를 숫자로 나타낸 거예요 (낮을수록 초급).
// 이 숫자로 "지금 등급이 이 퀘스트를 받을 수 있는 등급보다 높은지 낮은지"를 비교해요.
// examFee는 이 등급으로 "승급 시험을 볼 때" 내야 하는 시험비예요 (구리 단위, formatCurrency로 표시됨)
export const RANK_TIERS = [
  { id: 'bronze', name: '초급 용병', order: 0, requiredLevel: 1, requiredQuests: 0, examFee: 0 },
  { id: 'silver', name: '중급 용병', order: 1, requiredLevel: 3, requiredQuests: 3, examFee: 10000 },
  { id: 'gold', name: '고급 용병', order: 2, requiredLevel: 6, requiredQuests: 8, examFee: 30000 },
  { id: 'platinum', name: '특급 용병', order: 3, requiredLevel: 10, requiredQuests: 15, examFee: 80000 }
];


// 퀘스트 목록이에요. targetId는 "무슨 아이템을 몇 개 모아야 하는지"를 가리키는데,
// 이 값은 SHOP_ITEMS나 ENTITY_TYPES에 있는 id를 그대로 재사용해요
// (새로 만든 개념이 아니라, 이미 인벤토리에 쌓이는 아이템들을 그대로 활용하는 거예요)
// rewardGold는 formatCurrency가 쪼개서 보여줄 "구리 단위" 숫자예요 (다른 아이템 가격들과 같은 단위)
// minRank는 이 퀘스트를 받을 수 있는 최소 등급이에요 (RANK_TIERS의 id 중 하나)
export const QUEST_TEMPLATES = [
  { id: 'quest_wood', name: '땔감 모으기', targetId: 'tree', targetCount: 5, rewardGold: 80, rewardExp: 20, minRank: 'bronze', description: '나무 5개를 모아오세요' },
  { id: 'quest_stone', name: '석재 조달', targetId: 'stone', targetCount: 5, rewardGold: 100, rewardExp: 25, minRank: 'bronze', description: '돌 5개를 모아오세요' },
  { id: 'quest_wolf', name: '늑대 퇴치', targetId: 'wolf', targetCount: 3, rewardGold: 200, rewardExp: 60, minRank: 'bronze', description: '늑대 가죽 3개를 모아오세요 (늑대를 처치하면 얻어요)' },
  { id: 'quest_rabbit', name: '토끼 사냥', targetId: 'rabbit', targetCount: 4, rewardGold: 120, rewardExp: 35, minRank: 'bronze', description: '토끼 고기 4개를 모아오세요' },
  { id: 'quest_carrot', name: '농부의 부탁', targetId: 'carrot', targetCount: 3, rewardGold: 90, rewardExp: 30, minRank: 'bronze', description: '당근 3개를 재배해서 가져오세요' },
  { id: 'quest_wolf_pack', name: '늑대 무리 소탕', targetId: 'wolf', targetCount: 8, rewardGold: 400, rewardExp: 120, minRank: 'silver', description: '늑대 가죽 8개를 모아오세요 (숙련자용 의뢰)' },
  { id: 'quest_grand_hunt', name: '대규모 늑대 토벌', targetId: 'wolf', targetCount: 15, rewardGold: 900, rewardExp: 250, minRank: 'gold', description: '늑대 가죽 15개를 모아오세요 (전문가용 의뢰)' }
];

// 고용 가능한 동료 목록이에요. hireCost는 다른 가격들처럼 "구리 단위" 숫자고,
// attackBonus는 전투 중 동료가 근처에 있을 때 몬스터에게 추가로 주는 데미지예요.
export const COMPANION_TYPES = {
  traveler: {
    name: '떠돌이 동료',
    spriteKey: 'npc_villager3', // 실외의 떠돌이 여행자와 같은 그림을 임시로 재사용 (나중에 전용 그림으로 교체 예정)
    hireCost: 5000, // 0G 50S 0C
    attackBonus: 4,
    maxHp: 80, // 동료의 최대 체력 - 이만큼 맞으면 기절함
    description: '함께 몬스터를 상대해주는 든든한 동료예요'
  }
};

// 직업별 액티브 스킬이에요. 지금은 직업당 1개씩만 있고, 전부 Q키로 발동해요
// (E/R키는 나중에 스킬이 더 늘어나면 쓸 자리로 비워둠).
// cooldownMs는 기본 쿨타임(밀리초)이고, 실제로는 재사용 대기시간 감소(지능 스탯)만큼 짧아져요.
export const CLASS_ACTIVE_SKILLS = {
  warrior: {
    id: 'active_warrior_charge', name: '돌진 베기', key: 'Q', cooldownMs: 6000,
    range: 200, damageMultiplier: 2.5,
    description: '가장 가까운 몬스터에게 돌진해 강력한 일격을 가해요 (공격력 x2.5)'
  },
  archer: {
    id: 'active_archer_pierce', name: '관통 사격', key: 'Q', cooldownMs: 5000,
    range: 300, damageMultiplier: 2.0,
    description: '먼 거리의 몬스터에게 강한 사격을 명중시켜요 (공격력 x2.0)'
  },
  mage: {
    id: 'active_mage_fireball', name: '파이어볼', key: 'Q', cooldownMs: 8000,
    range: 250, aoeRadius: 80, damageMultiplier: 3.0, useMagicPower: true,
    description: '마력을 담은 화염구로 주변 몬스터 전부에게 피해를 줘요'
  },
  priest: {
    id: 'active_priest_heal', name: '치유의 빛', key: 'Q', cooldownMs: 10000,
    healAmount: 40, useMagicPower: true,
    description: '스스로에게 즉시 체력을 회복시켜요 (고정 회복량 + 마력)'
  },
  rogue: {
    id: 'active_rogue_shadowstrike', name: '그림자 일격', key: 'Q', cooldownMs: 7000,
    range: 200, damageMultiplier: 1.8,
    description: '가장 가까운 몬스터에게 반드시 치명타가 적중하는 일격을 가해요'
  },
  summoner: {
    id: 'active_summoner_empower', name: '소환수 강화', key: 'Q', cooldownMs: 12000,
    buffDurationMs: 8000, buffMultiplier: 2.0,
    description: '8초간 동료의 전투 보너스 데미지를 크게 증폭시켜요'
  }
};

// 사냥터 등급 정의예요. order는 등급 비교용 숫자(낮을수록 약함), color는 게이트 색깔,
// monsterMultiplier는 이 등급에서 나오는 몬스터의 체력/공격력/속도를 몇 배로 강화할지,
// bossHpMultiplier는 거기에 추가로 보스에게만 곱해지는 배율이에요.
export const HUNTING_GROUND_RANKS = {
  F: { name: 'F등급', order: 0, color: 0x9e9e9e, monsterMultiplier: 1.0, bossHpMultiplier: 3, rareDropChance: 15, rareItemId: 'rare_worn_charm' },
  E: { name: 'E등급', order: 1, color: 0x4caf50, monsterMultiplier: 1.3, bossHpMultiplier: 3, rareDropChance: 20, rareItemId: 'rare_iron_blade' },
  D: { name: 'D등급', order: 2, color: 0x2196f3, monsterMultiplier: 1.6, bossHpMultiplier: 3, rareDropChance: 25, rareItemId: 'rare_swift_boots' },
  C: { name: 'C등급', order: 3, color: 0x9c27b0, monsterMultiplier: 2.0, bossHpMultiplier: 3, rareDropChance: 30, rareItemId: 'rare_guardian_shield' },
  B: { name: 'B등급', order: 4, color: 0xff9800, monsterMultiplier: 2.5, bossHpMultiplier: 3, rareDropChance: 35, rareItemId: 'rare_hunters_ring' },
  A: { name: 'A등급', order: 5, color: 0xf44336, monsterMultiplier: 3.2, bossHpMultiplier: 3, rareDropChance: 45, rareItemId: 'rare_ancient_amulet' }
};

// 사냥터 게이트 배치 목록이에요. 집/밭과 같은 패턴(위치 배열)이라, 나중에 등급을
// 늘리고 싶으면 여기에 항목만 추가하면 돼요.
export const HUNTING_GROUNDS = [
  { id: 'gate_f', x: 230, y: 220, rank: 'F' },
  { id: 'gate_c', x: 680, y: 300, rank: 'C' },
  { id: 'gate_a', x: 450, y: 500, rank: 'A' }
];

// 던전 등급 정의예요. 사냥터(HUNTING_GROUND_RANKS)랑 같은 모양(shape)의 데이터라
// 몬스터 생성 함수(createHuntMonster)를 그대로 같이 쓸 수 있어요. 다만 던전은 같은
// 글자 등급이어도 사냥터보다 더 세게(예: F끼리 비교해도 던전이 더 강함) 잡아뒀고,
// S/SS/SSS라는 사냥터에 없는 최상위 등급이 추가로 있어요.
export const DUNGEON_RANKS = {
  F: { name: 'F등급 던전', order: 0, color: 0x757575, monsterMultiplier: 1.3, bossHpMultiplier: 3, rareDropChance: 20, rareItemId: 'rare_worn_charm' },
  E: { name: 'E등급 던전', order: 1, color: 0x009688, monsterMultiplier: 1.6, bossHpMultiplier: 3, rareDropChance: 25, rareItemId: 'rare_iron_blade' },
  D: { name: 'D등급 던전', order: 2, color: 0x3f51b5, monsterMultiplier: 2.0, bossHpMultiplier: 3, rareDropChance: 30, rareItemId: 'rare_swift_boots' },
  C: { name: 'C등급 던전', order: 3, color: 0x673ab7, monsterMultiplier: 2.5, bossHpMultiplier: 3, rareDropChance: 35, rareItemId: 'rare_guardian_shield' },
  B: { name: 'B등급 던전', order: 4, color: 0xe91e63, monsterMultiplier: 3.2, bossHpMultiplier: 3, rareDropChance: 40, rareItemId: 'rare_hunters_ring' },
  A: { name: 'A등급 던전', order: 5, color: 0xd32f2f, monsterMultiplier: 4.0, bossHpMultiplier: 3, rareDropChance: 45, rareItemId: 'rare_ancient_amulet' },
  S: { name: 'S등급 던전', order: 6, color: 0xffd700, monsterMultiplier: 5.0, bossHpMultiplier: 4, rareDropChance: 40, rareItemId: 'dungeon_rare_s' },
  SS: { name: 'SS등급 던전', order: 7, color: 0x00e5ff, monsterMultiplier: 6.5, bossHpMultiplier: 4, rareDropChance: 35, rareItemId: 'dungeon_rare_ss' },
  SSS: { name: 'SSS등급 던전', order: 8, color: 0xff00ff, monsterMultiplier: 8.0, bossHpMultiplier: 5, rareDropChance: 30, rareItemId: 'dungeon_rare_sss' }
};

// 던전 입구 배치 목록이에요. 처음엔 3개(F/S/SSS)만 배치하고, 나머지 등급은
// 나중에 이 배열에 항목만 추가하면 됨 (사냥터와 동일한 확장 패턴)
export const DUNGEONS = [
  { id: 'dungeon_f', x: 100, y: 350, rank: 'F' },
  { id: 'dungeon_s', x: 750, y: 150, rank: 'S' },
  { id: 'dungeon_sss', x: 400, y: 570, rank: 'SSS' }
];

// 건물(집) 종류 정의 - floorTile(바닥 이미지 키)과 furniture(가구 스프라이트 목록)로
// 집마다 다른 조합을 줄 수 있음. 새 집을 늘리려면 여기에 항목만 추가하고
// GameScene의 housePositions 배열에 위치만 추가하면 됨
export const BUILDING_TYPES = {
  myHouse: {
    name: '내 집',
    color: 0x8b5a2b,       // 실외에서 보이는 건물 색
    width: 100,
    height: 80,
    floorTile: 'floor_wood', // 실내 바닥에 반복해서 채울 타일 이미지
    furniture: [
      { spriteKey: 'furn_couch', x: 400, y: 200, scale: 4 }
    ]
  },
  house2: {
    name: '이웃집',
    color: 0x6b7a8b,
    width: 100,
    height: 80,
    floorTile: 'floor_gray',
    furniture: [
      { spriteKey: 'furn_dresser1', x: 400, y: 200, scale: 4 }
    ]
  },
  house3: {
    name: '여행자의 집',
    color: 0x8b5a2b,
    width: 100,
    height: 80,
    floorTile: 'floor_wood',
    furniture: [
      { spriteKey: 'furn_dresser2', x: 400, y: 200, scale: 4 }
    ]
  },
  house4: {
    name: '창고',
    color: 0x6b7a8b,
    width: 100,
    height: 80,
    floorTile: 'floor_gray',
    furniture: [
      { spriteKey: 'furn_shelf_green', x: 400, y: 200, scale: 4 }
    ]
  },
  tavern: {
    name: '주점',
    color: 0x6b3a1a, // 실외에서 보이는 건물 색 (진한 나무색)
    width: 120,
    height: 90,
    floorTile: 'floor_wood',
    // isTavern: true는 이 건물에 들어갔을 때 일반 집이 아니라 "주점 메뉴"를 열어야 한다는 표시예요.
    // GameScene의 toggleHouse()에서 이 값을 확인해서 다르게 동작하게 만들 거예요.
    isTavern: true,
    furniture: [
      { spriteKey: 'furn_couch', x: 350, y: 200, scale: 4 },
      { spriteKey: 'furn_dresser1', x: 450, y: 200, scale: 4 }
    ]
  }
};