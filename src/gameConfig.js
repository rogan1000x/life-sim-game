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
  }
};

// 상점에서 구매 가능한 아이템 목록
// category: 'consumable'(즉시 사용/소모) 또는 'equipment'(장착/해제, 장착 중일 때만 효과 적용)
// equipment는 slot(장착 부위)을 가짐 - 지금은 weapon 하나뿐이지만 나중에 방어구 등으로 확장 가능
// 내구도 시스템은 추후 추가 예정 (지금은 장착/해제 기반까지만 구현)
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

  // 주점 전용 음식 - tavernOnly:true는 일반 상인(villager1) 상점에는 안 뜨고, 주점 메뉴에서만 보이게 하는 표시예요
  { id: 'food_bread', name: '빵', basePrice: 15, category: 'consumable', effectType: 'heal', effectValue: 25, tavernOnly: true, icon: null },
  { id: 'food_stew', name: '스튜', basePrice: 35, category: 'consumable', effectType: 'heal', effectValue: 60, tavernOnly: true, icon: null }
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
    color: 0x6b3a1a,
    width: 120,
    height: 90,
    floorTile: 'floor_wood',
    isTavern: true, // 이 값이 있으면 GameScene의 toggleHouse()가 일반 집이 아니라 주점 메뉴를 열어줌
    furniture: [
      { spriteKey: 'furn_couch', x: 350, y: 200, scale: 4 },
      { spriteKey: 'furn_dresser1', x: 450, y: 200, scale: 4 }
    ]
  }
};