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
    exp: 10, color: 0x2d5016, radius: 20, sound: 400, hp: 1, sellPrice: 5
  },
  stone: {
    name: '돌', category: 'resource',
    exp: 15, color: 0x808080, radius: 18, sound: 250, hp: 1, sellPrice: 8
  },
  rabbit: {
    name: '토끼', category: 'passive_animal',
    exp: 20, color: 0xffa500, radius: 15, sound: 700, hp: 1, sellPrice: 12
  },
  wolf: {
    name: '늑대', category: 'hostile_monster',
    exp: 40, hp: 30, damage: 10, speed: 80, sellPrice: 25, sound: 150,
    renderType: 'sprite', // 도형(circle) 대신 실제 이미지 스프라이트로 렌더링
    spriteIdleKey: 'wolf_idle', spriteIdleFrames: 8,
    spriteRunKey: 'wolf_run', spriteRunFrames: 3,
    spriteScale: 2.5, // 원본 32px -> 화면에 80px 정도로 표시 (다른 캐릭터들과 크기감 통일)
    facingOffsetDeg: 240  // 원본 그림이 대각선 왼쪽 위를 바라보고 있어서, 이동 방향에 맞춰 회전시키기 위한 보정값
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
export const SHOP_ITEMS = [
  { id: 'potion_small', name: '작은 포션', price: 20, category: 'consumable', effectType: 'heal', effectValue: 30, icon: null },
  { id: 'potion_large', name: '큰 포션', price: 50, category: 'consumable', effectType: 'heal', effectValue: 100, icon: null },
  { id: 'item_pickaxe', name: '낡은 곡괭이', price: 30, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 3, icon: 'item_pickaxe.png' },
  { id: 'item_gadget', name: '수상한 부품', price: 25, category: 'equipment', slot: 'weapon', effectType: 'speed', effectValue: 5, icon: 'item_gadget.png' },
  { id: 'item_wrench', name: '만능 렌치', price: 50, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 5, icon: 'item_wrench.png' },
  { id: 'item_signpost', name: '이정표', price: 40, category: 'equipment', slot: 'weapon', effectType: 'maxHp', effectValue: 20, icon: 'item_signpost.png' },
  { id: 'item_stopsign', name: '경고 표지판', price: 60, category: 'equipment', slot: 'weapon', effectType: 'maxHp', effectValue: 30, icon: 'item_stopsign.png' },
  { id: 'item_crosssign', name: '교차로 표지판', price: 70, category: 'equipment', slot: 'weapon', effectType: 'speed', effectValue: 15, icon: 'item_crosssign.png' },
  { id: 'item_streetlamp', name: '가로등 부품', price: 90, category: 'equipment', slot: 'weapon', effectType: 'attack', effectValue: 8, icon: 'item_streetlamp.png' }
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
  }
};