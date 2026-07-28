// 게임 전체 설정값 모음 (나중에 옵션 화면에서 조정 가능하게 분리해둠)
export const GAME_CONFIG = {
  treeCount: 3,
  stoneCount: 2,
  rabbitCount: 3,
  wolfCount: 4,
  wolfRespawnMin: 5000, // 늑대 리스폰 최소 시간(ms)
  wolfRespawnMax: 10000 // 늑대 리스폰 최대 시간(ms)
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
    exp: 40, color: 0x4a0000, radius: 18, sound: 150, hp: 30,
    damage: 10, speed: 80, sellPrice: 25
  }
};

// NPC 정보 (이름, 색상, 대사) - 나중에 NPC가 늘어나면 여기에 추가만 하면 됨
export const NPC_DATA = {
  villager: {
    name: '마을 주민',
    color: 0x4444ff,
    dialogues: [
      '안녕하세요! 오늘 날씨가 좋네요.',
      '이 근처에 나무와 돌이 많으니 채집해보세요.',
      '늑대를 조심하세요, 꽤 사나워요!'
    ]
  }
};

// 상점에서 구매 가능한 아이템 목록
export const SHOP_ITEMS = [
  { id: 'potion_small', name: '작은 포션', price: 20, heal: 30 },
  { id: 'potion_large', name: '큰 포션', price: 50, heal: 100 }
];

// 건물(집) 종류 정의 - 나중에 상점 건물, 동료 집 등을 여기에 추가하면 됨
export const BUILDING_TYPES = {
  myHouse: {
    name: '내 집',
    color: 0x8b5a2b,   // 실외에서 보이는 건물 색
    width: 100,
    height: 80,
    interiorColor: '#3a2a1a', // 실내 배경색
    furniture: [
      { type: 'bed', x: 400, y: 200, width: 120, height: 60, color: 0x5a3a2a }
    ]
  }
};