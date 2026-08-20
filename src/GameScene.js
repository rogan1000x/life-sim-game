import Phaser from 'phaser';
import { GAME_CONFIG, ENTITY_TYPES, NPC_DATA, SHOP_ITEMS, BUILDING_TYPES, formatCurrency, CROP_TYPES, FARM_PLOTS, QUEST_TEMPLATES, COMPANION_TYPES, RANK_TIERS, CLASS_TYPES, CLASS_SKILLS } from './gameConfig';


// Phaser의 Scene 클래스를 상속받아 우리 게임 전용 Scene을 만듦
// React의 useEffect 안에 있던 모든 게임 로직이 이 클래스 하나로 정리됨
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene'); // Scene의 고유 이름

    // 게임 상태 변수들을 클래스의 속성(this.xxx)으로 관리
    this.level = 1;
    this.exp = 0;
    this.inventory = {};
    this.statPoints = 0;
    this.skillPoints = 0; // 레벨업할 때마다 statPoints와 별도로 받는 포인트 - 직업 스킬 강화에만 씀
    // 스킬별로 지금 몇 레벨인지 저장하는 곳이에요. 예: { warrior_slash_mastery: 3 }
    // 아직 안 배운 스킬은 이 객체에 아예 없는 상태(레벨 0과 같은 의미)예요
    this.skillLevels = {};
    // 직업(class)이에요. App.js에서 GameScene 인스턴스를 만든 직후에 이 값을 채워줘요.
    // (constructor 시점에는 아직 안 채워져 있을 수 있어서 일단 null로 시작)
        this.playerClass = null;

    // 근본 스탯 5종이에요. 다 0에서 시작하고, statPoints로 하나씩 투자해서 올려요.
    this.primaryStats = { str: 0, vit: 0, agi: 0, int: 0, sen: 0 };

    // 장비/스킬이 주는 "고정 보너스"만 따로 모아두는 곳이에요.
    this.bonusStats = { attack: 0, speed: 0, maxHp: 0 };

    this.attackPower = 10;
    this.maxHp = 100;
    this.moveSpeed = 200;
    this.hp = 100;
    this.defense = 0;       // 방어력 - 몬스터 데미지를 이만큼 깎아줌
    this.critChance = 0;    // 치명타 확률(%) - 민첩으로 오름
    this.critDamage = 150;  // 치명타 데미지 배율(%) - 150이면 1.5배
    this.magicPower = 0;    // 마력 - 지금은 쓰는 곳 없음, 나중에 액티브 스킬에서 사용 예정
    this.cooldownReduction = 0; // 재사용 대기시간 감소(%) - 지금은 쓰는 곳 없음
    this.precision = 0;     // 정밀도 - 공격 데미지의 최소 하한선을 끌어올림
    this.gold = 0;
    this.dialogueIndex = 0;
    this.lastDialogueNpc = null; // 직전에 대화한 NPC 종류 (NPC가 바뀌면 대사를 처음부터 다시 보여주기 위함)
    this.dialogueTimer = null;   // 대화창 자동 숨김 타이머 (연속으로 말 걸었을 때 이전 타이머를 취소하기 위해 저장)
    this.gameMinutes = 480;      // 게임 속 현재 시각 (분 단위, 480 = 08:00부터 시작)
    this.currentDay = 1;         // 게임 속 날짜
    this.nightIntensity = 0;     // 밤의 깊이 (0=낮, 0.6=한밤중) - 몬스터 강화 배율 계산에 사용
    this.equipped = { weapon: null }; // 슬롯별 장착 중인 아이템 id (지금은 weapon 슬롯만 존재)

    // 장비별 "지금 남아있는 내구도"를 저장하는 곳이에요.
    // 예: { item_pickaxe: 12 } 라면, 곡괭이가 지금 12번 더 때리면 부서진다는 뜻이에요.
    this.equipmentDurability = {};

    // 지금 수락해서 진행 중인 퀘스트들의 id 목록이에요.
    // 배열(리스트)이라서 여러 퀘스트를 동시에 진행할 수 있어요.
    // 예: ['quest_wood', 'quest_wolf'] 라면 두 퀘스트를 동시에 수락한 상태라는 뜻이에요.
    this.activeQuestIds = [];

    // 지금 용병 등급이에요. RANK_TIERS 배열 안의 id 중 하나('bronze', 'silver'...)를 저장해요.
    this.rank = 'bronze';
    // 지금까지 완료한 퀘스트의 총 개수예요. 승급 조건으로 쓰여요 (반복 완료해도 계속 누적됨)
    this.questsCompletedCount = 0;
    this.isDead = false;         // 사망 후 부활 대기 중인지 여부 (중복 사망 처리 방지용)
    this.marketStock = {};       // 아이템별 시장 재고 (기준치 10, 사면 감소/팔면 증가하며 가격에 영향을 줌)

    // 농사 시스템 관련 상태들이에요.
    // 자바스크립트에서 {}는 "빈 객체"를 뜻해요. 객체는 { 키: 값, 키2: 값2 } 형태로
    // 이름표(키)를 붙여서 데이터를 저장하는 상자라고 생각하면 돼요.

    // 어떤 밭(farm1, farm2...)을 내가 샀는지 기록하는 곳이에요.
    // 예: { farm1: true } 라면 farm1은 내가 산 밭이라는 뜻이고,
    // farm2가 이 객체 안에 아예 없으면 아직 안 산 밭이라는 뜻이에요.
    this.ownedPlots = {};

    // 각 밭에 지금 뭘 심어놨는지 기록하는 곳이에요.
    // 예: { farm1: { cropType: 'wheat', plantedAt: 1500 } }
    // cropType은 "무슨 작물인지", plantedAt은 "게임 속 몇 분째에 심었는지"를 저장해서
    // 나중에 "지금 게임 시간 - 심은 시간"으로 얼마나 자랐는지 계산할 때 씀
    this.plantedCrops = {};

    // 밭마다 화면에 그려진 실제 도형(사각형, 원)들을 기억해두는 곳이에요.
    // 이건 저장 데이터에는 안 들어가고, 오직 "지금 화면에 뭐가 그려져 있는지" 관리용이에요.
    this.farmPlots = {};

    // 아이템별 "가격 변화 기록"을 저장하는 곳이에요.
    // 예: this.priceHistory['potion_small'] = [20, 22, 22, 18, 15, ...] 이런 식으로
    // 시간이 지날 때마다 숫자가 하나씩 뒤에 추가되는 배열(리스트)이에요.
    // 이 배열을 나중에 그래프에 그대로 넘겨주면 꺾은선 그래프가 됨
    this.priceHistory = {};
    this.isKnockedBack = false;
    this.nearbyNpc = null;
    this.facingDirection = 'down'; // 캐릭터가 마지막으로 바라본 방향 (멈췄을 때도 그 방향을 보여주기 위해 기억)
    // 새 캐릭터 에셋은 방향당 프레임이 1장뿐이라(걷기 동작 없음), 이동 중/정지 중 구분 없이 이 프레임을 그대로 사용
    this.directionFrames = { left: 0, down: 1, up: 2, right: 3 };
    this.audioContext = null;
    // 집 꾸미기 시스템 관련 상태
    // 집 꾸미기 시스템 관련 상태
    this.isInsideHouse = false;   // 지금 집 안에 있는지 여부
    this.nearbyHouse = null;      // 근처에 있는 집 오브젝트 (여러 채 중 하나)
    this.currentHouse = null;     // 현재 들어와있는 집 (나갈 때 위치 복원용)
    this.furnitureObjects = [];   // 실내에 생성된 가구 오브젝트들 (전환마다 재사용)
    this.floorTileSprite = null;  // 실내 바닥 타일 오브젝트 (집마다 다른 바닥으로 교체됨)

    // 주점 안에 있는 길드 담당자 NPC를 가리키는 변수예요. 평소엔 null(없음)이고,
    // 주점에 들어갈 때만 실제 오브젝트가 채워져요. 이걸 따로 저장해두는 이유는
    // update()에서 "지금 이 NPC랑 얼마나 가까운지" 매 프레임 거리 계산을 해야 하기 때문이에요.
    this.receptionistNpc = null;

    // 지금 고용한 동료의 종류(id)예요. null이면 "동료 없음"이라는 뜻이에요.
    this.hiredCompanionId = null;
    // 실제로 화면에 그려진 동료 오브젝트예요. hiredCompanionId가 있어도, 아직
    // 화면에 안 만들어졌으면 이건 null일 수 있어요 (둘을 따로 관리하는 이유는
    // "고용했다는 기록"과 "지금 화면에 그려진 그림"이 서로 다른 타이밍에 필요하기 때문이에요 -
    // 예를 들어 저장 파일을 불러올 때는 기록은 있지만 그림은 아직 안 만들어진 상태예요)
    this.companionSprite = null;

    // React와 연결하기 위한 콜백 함수들 (App.js에서 설정해줌)
    this.onStatsUpdate = null; // 상태가 바뀔 때마다 React에 알리는 함수
    this.onDialogue = null;    // 대화창 표시 함수
    this.onShopToggle = null;  // 상점 열기/닫기 함수
    this.onLog = null;         // 몬스터 처치/아이템 획득/사망 등 이벤트를 알림창에 전달하는 함수
    this.onFarmMenuOpen = null; // 빈 밭에서 F키를 눌렀을 때, "씨앗 심기 메뉴"를 열어달라고 React에 요청하는 함수
    this.onTavernOpen = null;   // 주점에 들어가거나 나올 때, React 쪽 주점 메뉴를 열고/닫아달라고 요청하는 함수
    this.godMode = false;      // Admin 무적 모드 (App.js에서 값 변경)
  }

  preload() {
    // 캐릭터 4방향 스프라이트시트 (한 칸 16x16px, 방향당 1프레임 - 걷기 동작 없이 방향 전환만 함)
    this.load.spritesheet('player', 'assets/character/character_directions_v2.png', {
      frameWidth: 16,
      frameHeight: 16
    });

    // NPC 3명의 스프라이트시트도 플레이어와 동일한 형식(16x16, 4프레임)으로 로드
    this.load.spritesheet('npc_villager1', 'assets/npc/npc_villager1.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('npc_villager2', 'assets/npc/npc_villager2.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('npc_villager3', 'assets/npc/npc_villager3.png', { frameWidth: 16, frameHeight: 16 });

    // 집 내부 바닥 타일 (tileSprite로 반복 배치할 것이라 이미지 하나만 있으면 됨)
    this.load.image('floor_wood', 'assets/tiles/floor_wood.png');
    this.load.image('floor_gray', 'assets/tiles/floor_gray.png');

    // 집 내부 가구 이미지들
    this.load.image('furn_couch', 'assets/tiles/furn_couch.png');
    this.load.image('furn_dresser1', 'assets/tiles/furn_dresser1.png');
    this.load.image('furn_dresser2', 'assets/tiles/furn_dresser2.png');
    this.load.image('furn_shelf_green', 'assets/tiles/furn_shelf_green.png');

    // 이미지 기반 동물(늑대 등)의 스프라이트시트를 ENTITY_TYPES 데이터만 보고 자동으로 로드
    // 나중에 토끼 등 새 동물을 추가할 때도 ENTITY_TYPES에 renderType:'sprite' 항목만 추가하면
    // 이 코드 수정 없이 자동으로 로드됨
    Object.keys(ENTITY_TYPES).forEach(key => {
      const info = ENTITY_TYPES[key];
      if (info.renderType !== 'sprite') return;
      this.load.spritesheet(info.spriteIdleKey, `assets/animals/${info.spriteIdleKey}.png`, { frameWidth: 32, frameHeight: 32 });
      this.load.spritesheet(info.spriteRunKey, `assets/animals/${info.spriteRunKey}.png`, { frameWidth: 32, frameHeight: 32 });
    });
  }

  // Scene이 시작될 때 한 번 실행 - 게임 오브젝트들을 배치
  create() {
    this.physics.world.setBounds(-50, -50, 900, 700);

    // 저장된 데이터 불러오기
    // 시장 재고 초기값 설정 - 모든 거래 가능 아이템을 기준 재고(10)로 시작
    SHOP_ITEMS.forEach(item => {
      this.marketStock[item.id] = 10;
      this.priceHistory[item.id] = []; // 가격 기록도 빈 배열로 초기화 (아직 기록된 게 하나도 없는 상태)
    });

    // Phaser의 this.time.addEvent는 "일정 시간마다 함수를 반복 실행"해주는 타이머예요.
    // setInterval이랑 비슷한 역할인데, Phaser 안에서는 이걸 쓰는 게 더 안전해요
    // (씬이 꺼지거나 바뀔 때 Phaser가 알아서 같이 정리해주기 때문)
    // delay: 2000 은 2000ms = 2초마다 실행한다는 뜻이고, loop: true는 한 번만 하지 않고 계속 반복한다는 뜻이에요
    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => this.recordPriceHistory()
    });

    // 저장된 데이터 불러오기
    const savedData = localStorage.getItem('lifeSimSave');
    if (savedData) {
      const data = JSON.parse(savedData);
      this.level = data.level;
      this.exp = data.exp;
      this.hp = data.hp;
      this.maxHp = data.maxHp;
      this.statPoints = data.statPoints;
      this.attackPower = data.attackPower;
      this.moveSpeed = data.moveSpeed;
      this.gold = data.gold;
      this.inventory = data.inventory;
      // 예전 저장 파일에는 이 값이 없을 수 있어 undefined 체크 후 있을 때만 덮어씀
      if (data.gameMinutes !== undefined) this.gameMinutes = data.gameMinutes;
      if (data.currentDay !== undefined) this.currentDay = data.currentDay;
      if (data.equipped !== undefined) this.equipped = data.equipped;
      if (data.marketStock !== undefined) this.marketStock = { ...this.marketStock, ...data.marketStock };
      // 예전 저장 파일에는 농사 데이터가 아예 없을 수 있어서, 있을 때만 덮어씀
      if (data.ownedPlots !== undefined) this.ownedPlots = data.ownedPlots;
      if (data.plantedCrops !== undefined) this.plantedCrops = data.plantedCrops;
      if (data.equipmentDurability !== undefined) this.equipmentDurability = data.equipmentDurability;
      if (data.activeQuestIds !== undefined) this.activeQuestIds = data.activeQuestIds;
      if (data.hiredCompanionId !== undefined) this.hiredCompanionId = data.hiredCompanionId;
      if (data.rank !== undefined) this.rank = data.rank;
      if (data.questsCompletedCount !== undefined) this.questsCompletedCount = data.questsCompletedCount;
      // 저장된 직업이 있으면 그대로 이어받음. 없으면 null 상태 그대로 두고,
      // 이후 주점에서 chooseClass()를 호출할 때 비로소 정해짐
      if (data.playerClass !== undefined) this.playerClass = data.playerClass;
      if (data.skillPoints !== undefined) this.skillPoints = data.skillPoints;
      if (data.skillLevels !== undefined) this.skillLevels = data.skillLevels;
      if (data.primaryStats !== undefined) this.primaryStats = data.primaryStats;
      if (data.bonusStats !== undefined) this.bonusStats = data.bonusStats;
    }

    // 저장 데이터가 있든 없든, 마지막엔 항상 한 번 재계산해서 attackPower 등 최종 값을 맞춰둠
    // (hpText가 이 시점엔 아직 없을 수 있어서, recalculateDerivedStats 안에서
    // hpText 존재 여부를 확인하고 있으니 순서 걱정은 안 해도 돼요)
    this.recalculateDerivedStats();
    this.hp = this.maxHp; // 새 게임이든 불러오기든, 일단 이 시점엔 풀피로 시작(불러오기는 아래에서 실제 hp로 다시 덮어씀)
    if (savedData) {
      const data = JSON.parse(savedData);
      if (data.hp !== undefined) this.hp = data.hp; // 저장된 실제 체력값으로 복원
    }

    // 배경 격자무늬
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x3d6830, 0.5);
    for (let x = 0; x <= 800; x += 40) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, 600);
    }
    for (let y = 0; y <= 600; y += 40) {
      graphics.moveTo(0, y);
      graphics.lineTo(800, y);
    }
    graphics.strokePath();

    // 이미지 기반 동물의 대기/뛰기 애니메이션을 ENTITY_TYPES 데이터만 보고 자동 생성
    // 아래 엔티티 생성 루프보다 반드시 먼저 실행되어야 함 (생성 시점에 바로 애니메이션을 재생하기 때문)
    Object.keys(ENTITY_TYPES).forEach(key => {
      const info = ENTITY_TYPES[key];
      if (info.renderType !== 'sprite') return;

      this.anims.create({
        key: `${key}-idle`,
        frames: this.anims.generateFrameNumbers(info.spriteIdleKey, { start: 0, end: info.spriteIdleFrames - 1 }),
        frameRate: 6,
        repeat: -1
      });
      this.anims.create({
        key: `${key}-run`,
        frames: this.anims.generateFrameNumbers(info.spriteRunKey, { start: 0, end: info.spriteRunFrames - 1 }),
        frameRate: 10,
        repeat: -1
      });
    });

    // 자원(나무, 돌), 동물(토끼), 몬스터(늑대)를 하나의 그룹으로 통합 관리
    this.entities = this.add.group();

    const resourceSpawns = [
      { x: 150, y: 150, type: 'tree' },
      { x: 600, y: 200, type: 'tree' },
      { x: 300, y: 450, type: 'tree' },
      { x: 500, y: 400, type: 'stone' },
      { x: 200, y: 350, type: 'stone' }
    ];
    resourceSpawns.forEach(spawn => {
      this.entities.add(this.createEntity(spawn.x, spawn.y, spawn.type));
    });

    for (let i = 0; i < GAME_CONFIG.rabbitCount; i++) {
      const pos = this.getEdgeSpawnPosition();
      this.entities.add(this.createEntity(pos.x, pos.y, 'rabbit'));
    }

    for (let i = 0; i < GAME_CONFIG.wolfCount; i++) {
      const mx = Phaser.Math.Between(50, 750);
      const my = Phaser.Math.Between(50, 550);
      this.entities.add(this.createEntity(mx, my, 'wolf'));
    }

    // 캐릭터 생성 - 원본이 16px로 작으므로 setScale로 5배 키워서 기존 UI 스케일(80px)에 맞춤
    this.player = this.add.sprite(400, 300, 'player', this.directionFrames.down); // 시작 방향은 아래
    this.player.setScale(5);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    // 이 에셋은 방향당 프레임이 1장뿐이라 별도 애니메이션 정의 없이,
    // update()에서 방향이 바뀔 때마다 setFrame으로 직접 프레임을 전환함

    // 저장 파일에 고용된 동료 기록이 있었다면, 여기서 실제로 화면에 다시 그려줌
    // (player가 이 시점에 이미 만들어져 있어야 그 옆에 동료를 배치할 수 있어서 여기 위치에 둠)
    if (this.hiredCompanionId) {
      this.spawnCompanion(this.hiredCompanionId);
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.eKey = this.input.keyboard.addKey('E');
    this.hKey = this.input.keyboard.addKey('H'); // 집 입장/퇴장 키
    this.fKey = this.input.keyboard.addKey('F'); // 밭 구매/심기/수확에 사용하는 키

    this.physics.add.collider(this.player, this.entities);

    // 몬스터와 부딪혔을 때 데미지 처리
    this.physics.add.overlap(this.player, this.entities, (playerObj, entity) => {
      const info = ENTITY_TYPES[entity.entityType];
      if (info.category !== 'hostile_monster' || !entity.active) return;
      if (this.godMode) return; // Admin 무적 모드면 데미지 무시
      if (this.hp <= 0) return; // 이미 죽었으면 중복 데미지 방지

      // 밤에는 늑대의 공격력이 최대 1.5배까지 강해짐 (한밤중이 가장 위험)
      const nightMultiplier = this.getNightMonsterMultiplier();
      const rawDamage = Math.round(info.damage * nightMultiplier);
      // 방어력만큼 데미지를 깎아주되, Math.max(1, ...)로 최소 1은 항상 들어오게 함
      // (방어력이 아무리 높아도 완전 무적이 되지는 않게 하기 위함)
      const actualDamage = Math.max(1, rawDamage - this.defense);
      this.hp -= actualDamage;
      this.hp = Math.max(0, this.hp);
      this.hpText.setText('HP: ' + this.hp);
      this.playHitSound();

      // 이 공격으로 사망했다면, 어떤 몬스터에게 당했는지 알림으로 남김
      // 이 공격으로 사망했다면 사망 패널티 처리 (isDead로 중복 처리 방지)
      if (this.hp <= 0 && !this.isDead) {
        this.isDead = true;
        this.handleDeath(info.name);
      }

      this.player.setTint(0xff0000);
      this.time.delayedCall(150, () => this.player.clearTint());

      const knockbackAngle = Phaser.Math.Angle.Between(entity.x, entity.y, this.player.x, this.player.y);
      this.player.body.setVelocity(Math.cos(knockbackAngle) * 300, Math.sin(knockbackAngle) * 300);

      // 넉백 중에는 잠깐 이동 입력을 무시해서, 계속 밀려나는 현상을 방지
      this.isKnockedBack = true;
      setTimeout(() => {
        this.isKnockedBack = false;
      }, 200);

      this.syncStatsToReact();
    });

    // NPC 생성 - 집(houses)과 동일한 패턴: 위치 배열 + 통합 함수로 몇 명이든 쉽게 추가 가능
    this.npcs = this.add.group();
    const npcPositions = [
      { x: 400, y: 150, type: 'villager1' },
      { x: 250, y: 500, type: 'villager2' },
      { x: 600, y: 500, type: 'villager3' }
    ];
    npcPositions.forEach(pos => {
      this.npcs.add(this.createNpc(pos.x, pos.y, pos.type));
    });
    this.physics.add.collider(this.player, this.npcs);

    // 집들을 그룹으로 관리 - 여러 채를 배치해도 같은 로직으로 처리 가능
    this.houses = this.add.group();

    // 집 배치 목록 - 바닥/가구 조합이 다른 4채를 배치 (겹치지 않게 좌표 분산)
    const housePositions = [
      { x: 650, y: 450, type: 'myHouse' },
      { x: 700, y: 150, type: 'house2' },
      { x: 100, y: 500, type: 'house3' },
      { x: 50, y: 50, type: 'house4' }
    ];

    // 주점(tavern)도 이 배열에 항목만 추가하면 되고, createHouse()가 집이든 주점이든
    // 똑같은 방식으로 만들어줘요 (BUILDING_TYPES 데이터를 보고 알아서 다르게 그려짐)
    housePositions.push({ x: 780, y: 550, type: 'tavern' });

    // 주점(tavern)도 이 배열에 항목만 추가하면 되고, createHouse()가 집이든 주점이든
    // 똑같은 방식으로 만들어줘요 (BUILDING_TYPES 데이터를 보고 알아서 다르게 그려짐)
    housePositions.push({ x: 780, y: 550, type: 'tavern' });

    housePositions.forEach(pos => {
      this.houses.add(this.createHouse(pos.x, pos.y, pos.type));
    });

    // FARM_PLOTS 배열(gameConfig.js에 정의됨)에 있는 밭들을 하나씩 화면에 만들어요.
    // forEach는 배열 안의 항목을 하나씩 꺼내서 그때마다 괄호 안의 코드를 실행해주는 반복문이에요.
    FARM_PLOTS.forEach(plotConfig => {
      this.createFarmPlot(plotConfig);
    });

    // 밭은 시간이 지나면서 계속 자라니까, 5초마다 한 번씩 모든 밭의 그림을
    // 최신 상태(얼마나 자랐는지)로 다시 그려주는 타이머를 만들어요.
    // 매 프레임(1초에 60번)마다 다시 그리면 컴퓨터에 부담이 되니, 5초에 한 번이면 충분해요.
    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => {
        FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));
      }
    });
    this.hpText = this.add.text(20, 20, 'HP: ' + this.hp, {
      fontSize: '20px',
      color: '#ff4444'
    });

    // 지금 어느 건물에 들어와 있는지 화면 위에 보여주는 텍스트예요. 평소엔 빈 텍스트라 안 보이고,
    // 건물에 들어갈 때만 그 건물 이름으로 채워지고 setVisible(true)로 보이게 함
    this.buildingNameText = this.add.text(400, 20, '', {
      fontSize: '22px',
      color: '#ffd76a',
      backgroundColor: '#00000099',
      padding: { x: 12, y: 6 }
    });
    this.buildingNameText.setOrigin(0.5, 0); // 가로 중앙 정렬 (텍스트 자체 너비의 절반만큼 왼쪽으로 당김)
    this.buildingNameText.setScrollFactor(0);
    this.buildingNameText.setDepth(1000);
    this.buildingNameText.setVisible(false); // 처음엔 안 보이게 시작


    // 날짜/시간 표시 - 화면에 고정되어 카메라를 따라다니지 않도록 setScrollFactor(0) 적용
    this.timeText = this.add.text(600, 20, '', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 8, y: 4 }
    });
    this.timeText.setScrollFactor(0);
    this.timeText.setDepth(1000); // 밤 오버레이보다 위에 그려져서 글자가 항상 잘 보이도록

    // 밤을 표현하는 화면 전체 어두운 오버레이 - 매 프레임 투명도만 바꿔서 밤낮을 표현
    this.nightOverlay = this.add.rectangle(400, 300, 800, 600, 0x000033);
    this.nightOverlay.setScrollFactor(0);
    this.nightOverlay.setDepth(999); // 게임 오브젝트들보다는 위, 시간 텍스트보다는 아래
    this.nightOverlay.setAlpha(0);

    this.syncStatsToReact();
  }

  // 매 프레임(1초에 약 60번) 반복 실행되는 게임 로직
  // delta: 직전 프레임 이후 실제로 지난 시간(ms) - 시간 시스템 계산에 사용
  update(time, delta) {
    if (this.hp <= 0) return; // 죽었으면 모든 조작 무시

    this.updateGameClock(delta); // 실내/실외 상관없이 시간은 항상 흐르게 함

    // 실내에 있을 때는 실외 관련 로직(몬스터 추적, 채집, NPC 상호작용)을 전부 건너뜀
    if (this.isInsideHouse) {
      this.handleMovement(); // 실내에서도 이동은 가능해야 하니 별도 처리
      this.checkHouseExit();  // H키로 나가는 것만 체크
      this.handleReceptionistInteract(); // 길드 담당자와의 대화만 별도로 체크
      return;
    }

    this.handleMovement();
    this.updateCompanionFollow(); // 동료가 있으면 플레이어를 따라오게 함

    // 몬스터는 항상 플레이어를 추적
    this.entities.getChildren().forEach(entity => {
      if (!entity.active) return;
      const info = ENTITY_TYPES[entity.entityType];
      if (info.category === 'hostile_monster') {
        const nightMultiplier = this.getNightMonsterMultiplier();
        const angle = Phaser.Math.Angle.Between(entity.x, entity.y, this.player.x, this.player.y);
        entity.body.setVelocity(
          Math.cos(angle) * info.speed * nightMultiplier,
          Math.sin(angle) * info.speed * nightMultiplier
        );

        if (info.renderType === 'sprite') {
          // 이미지가 고정된 방향(대각선 위쪽)을 보고 그려져 있어서, 이동 방향에 맞게 회전시켜 향하게 함
          entity.setRotation(angle + Phaser.Math.DegToRad(info.facingOffsetDeg));
          entity.anims.play(`${entity.entityType}-run`, true); // true: 이미 재생 중이면 처음부터 다시 시작하지 않음

          // 이미지 스프라이트는 setTint로 밤에 붉게 표시 (도형과 달리 setTint 사용 가능)
          if (this.nightIntensity > 0.3) {
            entity.setTint(0xff6666);
          } else {
            entity.clearTint();
          }
        } else {
          // 도형(circle) 오브젝트는 setTint를 쓸 수 없어 setFillStyle로 색 자체를 바꿔야 함
          if (this.nightIntensity > 0.3) {
            entity.setFillStyle(0xff2222);
          } else {
            entity.setFillStyle(info.color);
          }
        }
      }
    });

    // 스페이스바: 근처 자원 채집 또는 몬스터 공격
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.entities.getChildren().forEach(entity => {
        if (!entity.active) return;

        const distance = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, entity.x, entity.y
        );
        if (distance >= 100) return; // 상호작용 가능 거리 밖이면 무시

        const info = ENTITY_TYPES[entity.entityType];

        if (info.category === 'resource' || info.category === 'passive_animal') {
          // 자원/순한 동물은 한 번에 채집됨
          // 채집 상태만 표시하고, 실제 숨김 처리는 refreshEntityVisual이 실내 여부까지 함께 판단
          entity.isHarvested = true;
          this.refreshEntityVisual(entity);

          this.addToInventory(entity.entityType);
          this.playSound(info.sound);
          this.gainExp(info.exp);
          this.addLog(`${info.name} 획득 (상인에게 팔 수 있어요)`, 'gain');

          // 채집할 때 낮은 확률(15%)로 씨앗도 하나 덤으로 얻게 해줘요.
          // Phaser.Math.Between(1, 100)은 1~100 사이의 정수를 무작위로 하나 뽑아주는 함수예요.
          // 그 값이 15 이하일 확률은 정확히 15%이기 때문에, 이 if문이 참이 될 확률도 15%가 됨
          if (Phaser.Math.Between(1, 100) <= 15) {
            const commonSeeds = ['wheat_seed', 'carrot_seed']; // 흔한 씨앗 중에서만 무작위로 하나 골라줌
            const randomIndex = Phaser.Math.Between(0, commonSeeds.length - 1);
            const bonusSeedId = commonSeeds[randomIndex];

            this.addToInventory(bonusSeedId);
            const seedInfo = SHOP_ITEMS.find(i => i.id === bonusSeedId);
            this.addLog(`덤으로 ${seedInfo.name}도 얻었어요!`, 'gain');
          }

          this.createParticleBurst(entity.x, entity.y, info.color);

          // 일정 시간 후 다시 나타남 (리젠)
          // 타이머 실행 시점에 실내에 있었더라도 refreshEntityVisual이 그 상태를 반영해줌
          setTimeout(() => {
            entity.isHarvested = false;
            this.refreshEntityVisual(entity);
          }, Phaser.Math.Between(5000, 15000));

        } else if (info.category === 'hostile_monster') {
          // 몬스터는 체력을 깎아야 처치됨
          // 직업이 도적이고 지금이 밤(nightIntensity > 0.3)이라면, CLASS_TYPES에 있는
          // nightAttackBonus만큼 공격력에 더 얹어줌. 다른 직업은 이 필드 자체가 없어서
          // (undefined) || 0 을 붙여 자동으로 0이 되게 처리함
          const myClassInfo = this.playerClass ? CLASS_TYPES[this.playerClass] : null;
          const isNightBonusActive = myClassInfo?.nightAttackBonus && this.nightIntensity > 0.3;
          const baseAttackPower = this.attackPower + (isNightBonusActive ? myClassInfo.nightAttackBonus : 0);

          // 정밀도/치명타를 반영해 최종 데미지를 계산함 (아래에 정의된 헬퍼 함수)
          const damageResult = this.calculateDamage(baseAttackPower);
          entity.hp -= damageResult.damage;
          if (damageResult.isCrit) {
            this.addLog('치명타!', 'kill');
          }

          this.playHitSound();
          this.reduceWeaponDurability(); // 때릴 때마다 지금 낀 무기의 내구도를 깎음
          this.createAttackSlashEffect(entity.x, entity.y); // 맞은 자리에 슬래시 이펙트 표시

          // 동료가 있고, 지금 공격 중인 몬스터 근처(150px 이내)에 있다면 같이 데미지를 줌
          if (this.companionSprite) {
            const companionInfo = COMPANION_TYPES[this.hiredCompanionId];
            const companionDistance = Phaser.Math.Distance.Between(
              this.companionSprite.x, this.companionSprite.y, entity.x, entity.y
            );
            if (companionDistance < 150) {
              // 직업이 소환사면 CLASS_TYPES의 companionBonusMultiplier만큼 동료 데미지를 곱해줌
              // 소환사가 아니면 이 필드가 없으니 그냥 1배(원래 그대로)로 처리됨
              const companionMultiplier = myClassInfo?.companionBonusMultiplier || 1;
              entity.hp -= companionInfo.attackBonus * companionMultiplier;
            }
          }

          if (entity.hp <= 0) {
            // 채집 자원과 동일한 방식으로 숨김 상태 관리 (실내 여부와 충돌 방지)
            entity.isHarvested = true;
            this.refreshEntityVisual(entity);

            this.addToInventory(entity.entityType);
            this.gainExp(info.exp);
            this.addLog(`${info.name} 처치! (+${info.exp} EXP, 상인에게 팔 수 있어요)`, 'kill');

            this.createParticleBurst(entity.x, entity.y, 0xff0000, 12);

            // 처치 후 랜덤 시간 뒤 새 위치에서 리스폰
            setTimeout(() => {
              entity.hp = entity.maxHp;
              entity.x = Phaser.Math.Between(50, 750);
              entity.y = Phaser.Math.Between(50, 550);
              entity.isHarvested = false;
              this.refreshEntityVisual(entity);
            }, Phaser.Math.Between(GAME_CONFIG.wolfRespawnMin, GAME_CONFIG.wolfRespawnMax));
          }
        }
      });
    }

    // NPC와의 거리를 매 프레임 확인
    this.nearbyNpc = null;
    this.npcs.getChildren().forEach(npc => {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
      // 캐릭터와 NPC 둘 다 80px 크기라, 충돌로 붙을 수 있는 최소 거리가 이미 80에 가까움
      // 여유를 두기 위해 기준을 100으로 올림 (집의 상호작용 거리와 동일하게 맞춤)
      if (distance < 100) {
        this.nearbyNpc = npc;
      }
    });

    // E키로 근처 NPC와 상호작용 - 대사를 보여주고, 상점을 가진 NPC라면 상점도 함께 엶
    if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.nearbyNpc) {
      const npcType = this.nearbyNpc.npcType;
      const info = NPC_DATA[npcType];

      // 이전과 다른 NPC와 대화를 시작했다면 대사를 처음부터 다시 보여줌
      if (this.lastDialogueNpc !== npcType) {
        this.dialogueIndex = 0;
        this.lastDialogueNpc = npcType;
      }

      if (this.onDialogue) {
        this.onDialogue(info.dialogues[this.dialogueIndex]);

        // 연속으로 말 걸었을 때 이전 대화창의 숨김 타이머가 늦게 실행되지 않도록 취소 후 재설정
        if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
        this.dialogueTimer = setTimeout(() => {
          if (this.onDialogue) this.onDialogue(null);
        }, 3000);
      }
      this.dialogueIndex = (this.dialogueIndex + 1) % info.dialogues.length;

      // 상점을 가진 NPC(villager1)일 때만 상점도 함께 엶
      if (info.hasShop && this.onShopToggle) {
        this.onShopToggle();
      }
    }

    // 여러 집 중, 지금 캐릭터와 가장 가까운 집을 찾음
    this.nearbyHouse = null;
    this.houses.getChildren().forEach(house => {
      const distance = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, house.x, house.y
      );
      if (distance < 100) {
        this.nearbyHouse = house;
      }
    });

    // H키로 집 안/밖 전환 (실내에 있을 때도 다시 눌러서 나갈 수 있음)
    if (Phaser.Input.Keyboard.JustDown(this.hKey) && (this.nearbyHouse || this.isInsideHouse)) {
      this.toggleHouse();
    }

    // 캐릭터와 가장 가까운 밭을 찾음 (집/NPC 찾을 때랑 똑같은 방식이에요)
    this.nearbyFarmPlot = null;
    FARM_PLOTS.forEach(plot => {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, plot.x, plot.y);
      if (distance < 80) {
        this.nearbyFarmPlot = plot;
      }
    });

    // F키를 눌렀고, 근처에 밭이 있다면 그 밭과 상호작용함
    // (구매/심기/수확 중 뭘 할지는 handleFarmInteract 안에서 밭 상태를 보고 알아서 결정함)
    if (Phaser.Input.Keyboard.JustDown(this.fKey) && this.nearbyFarmPlot) {
      this.handleFarmInteract(this.nearbyFarmPlot.id);
    }
  }

  // ===== 아래는 게임에서 재사용되는 헬퍼 함수들 =====

  // 브라우저의 Web Audio API를 이용해 사운드 재생 (외부 파일 없이 코드로 소리 생성)
  getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  // 배음(harmonics)을 겹쳐서 피아노 느낌의 자연스러운 소리를 만듦
  playSound(frequency, duration = 0.5) {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const harmonics = [1, 2, 3, 4];
    const gains = [0.3, 0.15, 0.08, 0.04];

    harmonics.forEach((harmonic, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency * harmonic;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(gains[i], now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      oscillator.start(now);
      oscillator.stop(now + duration);
    });
  }

  playLevelUpSound() {
    this.playSound(600, 0.15);
    setTimeout(() => this.playSound(900, 0.15), 150);
  }

  playHitSound() {
    // sawtooth 파형이 없어졌으므로, 낮은 음으로 대체 (피격음은 둔탁한 느낌이 필요해서 추후 별도 처리 가능)
    this.playSound(120, 0.2);
  }

  // 현재 게임 상태를 localStorage에 저장 (새로고침해도 유지되게)
  saveGame() {
    const saveData = {
      level: this.level, exp: this.exp, hp: this.hp, maxHp: this.maxHp,
      statPoints: this.statPoints, attackPower: this.attackPower,
      moveSpeed: this.moveSpeed, gold: this.gold, inventory: this.inventory,
      gameMinutes: this.gameMinutes, currentDay: this.currentDay, equipped: this.equipped,
      marketStock: this.marketStock,
      ownedPlots: this.ownedPlots, plantedCrops: this.plantedCrops,
      equipmentDurability: this.equipmentDurability,
      activeQuestIds: this.activeQuestIds,
      hiredCompanionId: this.hiredCompanionId,
      rank: this.rank, questsCompletedCount: this.questsCompletedCount,
      playerClass: this.playerClass,
      skillPoints: this.skillPoints, skillLevels: this.skillLevels,
      primaryStats: this.primaryStats, bonusStats: this.bonusStats
    };
    localStorage.setItem('lifeSimSave', JSON.stringify(saveData));
  }

  // 실외 오브젝트들을 숨기고 충돌도 확실히 제거
  // 정적 물리 바디(집, 자원)는 body.enable만으로는 충돌이 안 꺼지는 경우가 있어
  // 화면 밖 먼 곳으로 위치 자체를 이동시켜 물리적으로도 확실히 분리시킴
  setOutdoorObjectsActive(isActive) {
    // entities(자원/동물/몬스터)는 채집 대기 상태(isHarvested)도 함께 고려해야 하므로
    // refreshEntityVisual에 판단을 위임 (여기서 무조건 true로 덮어쓰면 리젠 안 된 자원이 부활해버림)
    this.entities.getChildren().forEach(entity => {
      this.refreshEntityVisual(entity);
    });

    // 집/NPC는 채집 개념이 없으므로 기존 방식대로 실내/실외 여부만으로 판단
    [this.houses, this.npcs].forEach(group => {
      group.getChildren().forEach(obj => {
        obj.setVisible(isActive);
        obj.setActive(isActive);
        obj.alpha = isActive ? 1 : 0;
        if (obj.body) obj.body.enable = isActive;
      });
    });
  }

  // 오브젝트가 화면에 보여야 하는지를 한 곳에서 판단
  // 실내에 있거나 채집/처치되어 리젠 대기 중이면 숨김 (두 조건을 한 함수로 합쳐 상태 충돌 방지)
  refreshEntityVisual(entity) {
    const shouldHide = this.isInsideHouse || entity.isHarvested;

    entity.setVisible(!shouldHide);
    entity.setActive(!shouldHide);
    entity.alpha = shouldHide ? 0 : 1;
    if (entity.body) entity.body.enable = !shouldHide;
  }

  toggleHouse() {
    if (!this.isInsideHouse) {
      // ===== 실내 진입 =====
      this.currentHouse = this.nearbyHouse;
      const info = BUILDING_TYPES[this.currentHouse.buildingType];

      this.isInsideHouse = true;
      // isInsideHouse를 true로 바꾼 "직후"에 호출해야, refreshFarmPlotVisual이
      // 실내 상태를 정확히 보고 즉시 숨겨줘요 (5초 타이머를 기다릴 필요 없이 바로 반영됨)
      FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));

      // 화면 위에 지금 들어온 건물의 이름을 표시함 (예: "주점", "내 집")
      this.buildingNameText.setText(info.name);
      this.buildingNameText.setVisible(true);

      // 동료는 건물 안까지 따라 들어오지 않는다는 설정이라, 실내에서는 숨겨둠
      // (destroy로 아예 없애지는 않고, 다시 나갈 때 그대로 보이게 하기 위해 setVisible만 사용)
      if (this.companionSprite) {
        this.companionSprite.setVisible(false);
        this.companionSprite.body.enable = false;
      }

      // 실외 오브젝트들을 각각 순회하며 확실히 숨기고 충돌도 비활성화
      this.setOutdoorObjectsActive(false);

      this.player.x = 400;
      this.player.y = 400;

      // 바닥 타일을 화면 전체 크기로 반복 배치 (tileSprite는 이미지 한 장으로도 넓은 영역을 채울 수 있음)
      // 이전에 들어왔던 집의 바닥이 남아있지 않도록 매번 새로 만들기 전에 제거
      if (this.floorTileSprite) this.floorTileSprite.destroy();
      this.floorTileSprite = this.add.tileSprite(400, 300, 800, 600, info.floorTile);
      this.floorTileSprite.setDepth(-1); // 캐릭터/가구보다 뒤쪽에 그려지도록

      this.furnitureObjects.forEach(f => f.destroy());
      this.furnitureObjects = [];

      info.furniture.forEach(item => {
        const furniture = this.add.sprite(item.x, item.y, item.spriteKey);
        furniture.setScale(item.scale || 4);
        this.physics.add.existing(furniture, true);
        this.physics.add.collider(this.player, furniture);
        this.furnitureObjects.push(furniture);
      });

      // 방금 들어온 건물이 주점이라면, 카운터와 길드 담당자 NPC를 추가로 만들어줌
      if (info.isTavern) {
        // 카운터 - 새 이미지 없이 사각형(rectangle)으로 만들어요. 밭을 만들 때랑 같은 방식이에요.
        const counter = this.add.rectangle(600, 150, 140, 30, 0x5a3a2a);
        counter.setStrokeStyle(2, 0x3a2416); // 테두리선 추가
        this.physics.add.existing(counter, true); // 정적 물리 바디 (플레이어가 통과 못 하게)
        this.physics.add.collider(this.player, counter);
        this.furnitureObjects.push(counter); // furnitureObjects에 넣어두면 나갈 때 자동으로 같이 정리됨

        // 길드 담당자(리나) - NPC_DATA['rina'].spriteKey를 참조해서 만들어요.
        // 이렇게 하드코딩 대신 데이터를 참조하면, 나중에 gameConfig.js에서 spriteKey만
        // 바꿔도(전용 그림을 구했을 때) 이 코드는 손댈 필요가 없어져요.
        // 프레임 번호 1은 "아래를 보는" 방향이에요 (앞서 만든 directionFrames와 같은 규칙)
        const receptionistInfo = NPC_DATA['rina'];
        const receptionist = this.add.sprite(600, 110, receptionistInfo.spriteKey, 1);
        receptionist.setScale(5); // 다른 NPC들과 동일한 배율
        receptionist.npcType = 'rina';
        this.physics.add.existing(receptionist, true);
        this.physics.add.collider(this.player, receptionist);
        this.furnitureObjects.push(receptionist);

        this.receptionistNpc = receptionist; // update()에서 거리 계산할 때 쓰려고 따로 저장해둠
      }

      // 방금 들어온 건물이 주점이라면, React 쪽에 "주점 메뉴 열어줘"라고 알려줌
      if (info.isTavern && this.onTavernOpen) {
        this.onTavernOpen(true);
      }

    } else {
      // ===== 실외 복귀 =====
      this.isInsideHouse = false;
      // 여기서도 마찬가지로 isInsideHouse를 false로 바꾼 직후에 호출해서 바로 다시 보이게 함
      FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));
      this.cameras.main.setBackgroundColor('#4a7c3c');

      // 건물에서 나왔으니 이름 표시도 숨김
      this.buildingNameText.setVisible(false);

      // 길드 담당자는 이미 위에서 furnitureObjects.forEach(f => f.destroy())로 화면에서는
      // 지워졌지만, this.receptionistNpc 변수 자체는 여전히 "죽은 오브젝트"를 가리키고 있어서
      // null로 비워줘야 update()에서 실수로 그 오브젝트를 계속 참조하는 걸 막을 수 있어요.
      this.receptionistNpc = null;

      // 동료를 다시 보이게 하고, 문 앞에서 갑자기 저 멀리 있지 않도록 플레이어 옆으로 위치를 옮겨줌
      if (this.companionSprite) {
        this.companionSprite.setVisible(true);
        this.companionSprite.body.enable = true;
        this.companionSprite.x = this.player.x - 60;
        this.companionSprite.y = this.player.y;
      }

      // 실내 바닥 타일 제거 (다음에 다른 집에 들어갔을 때 이전 바닥이 남지 않도록)
      if (this.floorTileSprite) {
        this.floorTileSprite.destroy();
        this.floorTileSprite = null;
      }

      // 실외 오브젝트들을 다시 보이게 하고 충돌도 복원
      this.setOutdoorObjectsActive(true);

      this.furnitureObjects.forEach(f => f.destroy());
      this.furnitureObjects = [];

      this.player.x = this.currentHouse.x;
      this.player.y = this.currentHouse.y + 80;

      // 어떤 건물에서 나오든 일단 주점 메뉴는 닫아달라고 요청함
      // (주점이 아니었어도 이미 닫혀있는 상태라 별문제 없음 - 그냥 안전하게 항상 호출)
      if (this.onTavernOpen) this.onTavernOpen(false);
    }
  }

  // 캐릭터 이동 처리 (실내/실외 공통으로 재사용)
  handleMovement() {
    let velocityX = 0;
    let velocityY = 0;
    let direction = this.facingDirection; // 입력이 없으면 이전 방향을 그대로 유지

    if (!this.isKnockedBack) {
      if (this.cursors.left.isDown) {
        velocityX = -this.moveSpeed;
        direction = 'left';
      } else if (this.cursors.right.isDown) {
        velocityX = this.moveSpeed;
        direction = 'right';
      }

      if (this.cursors.up.isDown) {
        velocityY = -this.moveSpeed;
        if (velocityX === 0) direction = 'up'; // 좌우 입력이 없을 때만 상하 방향 적용 (대각선 입력 시 좌우를 우선시함)
      } else if (this.cursors.down.isDown) {
        velocityY = this.moveSpeed;
        if (velocityX === 0) direction = 'down';
      }

      this.player.body.setVelocity(velocityX, velocityY);

      // 방향이 바뀌었을 때만 프레임을 전환 (매 프레임 setFrame 호출을 줄이기 위한 최소한의 조건)
      if (direction !== this.facingDirection) {
        this.player.setFrame(this.directionFrames[direction]);
      }
      this.facingDirection = direction; // 다음 프레임에도 같은 방향을 기억해두기 위해 저장
    }
  }

  // 실내에 있을 때 H키로 나가기만 체크 (다른 실외 로직은 실행 안 함)
  checkHouseExit() {
    if (Phaser.Input.Keyboard.JustDown(this.hKey)) {
      this.toggleHouse();
    }
  }

  // 실내에 있을 때, 근처에 길드 담당자가 있으면 E키로 대사를 볼 수 있게 해줘요.
  // 실외 NPC들의 대화 로직(update() 안에 있던 것)이랑 거의 똑같은 방식인데,
  // this.npcs 그룹 대신 this.receptionistNpc 하나만 확인한다는 점만 달라요.
  handleReceptionistInteract() {
    if (!this.receptionistNpc) return; // 지금 주점 안이 아니면(길드 담당자가 없으면) 할 게 없음

    const distance = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.receptionistNpc.x, this.receptionistNpc.y
    );
    if (distance >= 100) return; // 너무 멀면 상호작용 안 함

    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      const npcType = 'rina';
      const info = NPC_DATA[npcType];

      // 이전과 다른 NPC와 대화를 시작했다면 대사를 처음부터 다시 보여줌 (실외 NPC와 동일한 규칙)
      if (this.lastDialogueNpc !== npcType) {
        this.dialogueIndex = 0;
        this.lastDialogueNpc = npcType;
      }

      if (this.onDialogue) {
        this.onDialogue(info.dialogues[this.dialogueIndex]);

        if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
        this.dialogueTimer = setTimeout(() => {
          if (this.onDialogue) this.onDialogue(null);
        }, 3000);
      }
      this.dialogueIndex = (this.dialogueIndex + 1) % info.dialogues.length;
    }
  }

  // 동료를 화면에 실제로 만들어주는 함수예요. 고용할 때, 그리고 저장 파일을 불러올 때 둘 다 사용해요.
  spawnCompanion(companionId) {
    const info = COMPANION_TYPES[companionId];
    if (!info) return;

    // 플레이어 바로 왼쪽에서 시작하도록 배치함
    const spawnX = this.player.x - 60;
    const spawnY = this.player.y;

    // 프레임 번호 1 = "아래를 보는" 방향으로 시작 (플레이어/NPC와 같은 규칙)
    this.companionSprite = this.add.sprite(spawnX, spawnY, info.spriteKey, 1);
    this.companionSprite.setScale(5); // 다른 캐릭터들과 동일한 배율

    this.physics.add.existing(this.companionSprite); // 동적 물리 바디 (움직여야 하니 정적이 아님)
    this.companionSprite.body.setCollideWorldBounds(true);
  }

  // 매 프레임 호출돼서, 동료가 플레이어를 따라오게 만드는 함수예요.
  updateCompanionFollow() {
    if (!this.companionSprite) return; // 동료가 없으면 할 일이 없음

    const followDistance = 70; // 이 거리보다 가까우면 멈춤 (너무 붙어서 겹쳐 보이지 않게)
    const distance = Phaser.Math.Distance.Between(
      this.companionSprite.x, this.companionSprite.y, this.player.x, this.player.y
    );

    if (distance > followDistance) {
      const angle = Phaser.Math.Angle.Between(
        this.companionSprite.x, this.companionSprite.y, this.player.x, this.player.y
      );
      const speed = 180; // 플레이어 기본 이동속도(200)보다 살짝 느리게 해서 자연스럽게 뒤처지는 느낌을 줌

      this.companionSprite.body.setVelocity(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );

      // 이동 방향에 따라 동료도 플레이어와 같은 방식(directionFrames)으로 프레임을 바꿔줌
      // Math.abs()는 절댓값(부호를 뗀 값)을 구하는 함수예요. 가로/세로 중 어느 쪽으로 더 많이
      // 움직이는지를 비교해서, 더 큰 쪽을 기준으로 방향을 정함
      const dx = this.player.x - this.companionSprite.x;
      const dy = this.player.y - this.companionSprite.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.companionSprite.setFrame(dx > 0 ? this.directionFrames.right : this.directionFrames.left);
      } else {
        this.companionSprite.setFrame(dy > 0 ? this.directionFrames.down : this.directionFrames.up);
      }
    } else {
      this.companionSprite.body.setVelocity(0, 0); // 충분히 가까우면 멈춤
    }
  }

  // 주점에서 동료를 고용할 때 호출돼요.
  hireCompanion(companionId) {
    if (this.hiredCompanionId) {
      this.addLog('이미 동료가 있어요. 먼저 해고해주세요', 'info');
      return;
    }

    const info = COMPANION_TYPES[companionId];
    if (!info) return;

    if (this.gold < info.hireCost) {
      this.addLog('골드가 부족해서 고용할 수 없어요', 'death');
      return;
    }

    this.gold -= info.hireCost;
    this.hiredCompanionId = companionId;
    this.spawnCompanion(companionId);

    this.addLog(`${info.name}을(를) 고용했어요!`, 'gain');
    this.syncStatsToReact();
  }

  // 동료를 해고해요. 골드는 돌려받지 않아요.
  dismissCompanion() {
    if (!this.hiredCompanionId) return;

    const info = COMPANION_TYPES[this.hiredCompanionId];

    if (this.companionSprite) {
      this.companionSprite.destroy();
      this.companionSprite = null;
    }
    this.hiredCompanionId = null;

    this.addLog(`${info.name}과(와) 헤어졌어요`, 'info');
    this.syncStatsToReact();
  }

  // 게임 이벤트를 React 쪽 알림창에 전달 (처치/획득/사망 등). type에 따라 알림 색이 달라짐
  addLog(text, type = 'info') {
    if (this.onLog) this.onLog(text, type);
  }

  // 상태가 바뀔 때마다 React 쪽(App.js)에 최신 값을 전달 + 자동 저장
  syncStatsToReact() {
    if (this.onStatsUpdate) {
      this.onStatsUpdate({
        level: this.level,
        exp: this.exp,
        expNeeded: this.level * 100,
        hp: this.hp,
        maxHp: this.maxHp,
        statPoints: this.statPoints,
        attackPower: this.attackPower,
        moveSpeed: this.moveSpeed,
        gold: this.gold,
        inventory: { ...this.inventory },
        equipped: { ...this.equipped },
        marketPrices: SHOP_ITEMS.reduce((acc, item) => {
          acc[item.id] = this.getMarketPrice(item.id);
          return acc;
        }, {}),
        // priceHistory도 그대로 복사해서 넘겨줌 ({...} 이렇게 배열 안에 있는 걸 얕은 복사하는 것)
        // React는 "값이 실제로 바뀌었는지"를 새 객체인지 아닌지로 판단하기 때문에,
        // 원본을 그대로 넘기지 않고 항상 새로 복사해서 넘기는 습관이 중요해요
        priceHistory: { ...this.priceHistory },
        // marketStock도 새로 복사해서 넘겨줘야 App.js에서 "상인 재고 N개"를 화면에 보여줄 수 있어요
        marketStock: { ...this.marketStock },
        // 내구도도 새로 복사해서 넘겨줘야 App.js에서 "18/30" 같은 표시를 할 수 있어요
        equipmentDurability: { ...this.equipmentDurability },
        // [...배열] 은 배열을 새로 복사하는 문법이에요 ({...객체}랑 비슷한 원리예요)
        activeQuestIds: [...this.activeQuestIds],
        hiredCompanionId: this.hiredCompanionId,
        rank: this.rank,
        questsCompletedCount: this.questsCompletedCount,
        playerClass: this.playerClass,
        skillPoints: this.skillPoints,
        skillLevels: { ...this.skillLevels },
        primaryStats: { ...this.primaryStats },
        defense: this.defense,
        critChance: this.critChance,
        critDamage: this.critDamage,
        magicPower: this.magicPower,
        cooldownReduction: this.cooldownReduction,
        precision: this.precision
      });
    }
    this.saveGame();
  }

  // 경험치 획득 + 레벨업 처리 (레벨업 시 HP 풀회복, 스탯 포인트 지급)
  gainExp(amount) {
    this.exp += amount;
    const expNeeded = this.level * 100;

    if (this.exp >= expNeeded) {
      this.exp -= expNeeded;
      this.level++;
      this.hp = this.maxHp;
      this.statPoints++;
      this.skillPoints++; // 레벨업할 때마다 스킬 포인트도 1개씩 같이 지급함
      this.hpText.setText('HP: ' + this.hp);
      this.playLevelUpSound();
      this.createParticleBurst(this.player.x, this.player.y, 0xffff00, 16);
    }

    this.syncStatsToReact();
  }

  // 특정 위치에서 원형으로 퍼지는 파티클 이펙트 생성 (채집/레벨업/처치 시 사용)
  createParticleBurst(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const particle = this.add.circle(x, y, 4, color);

      const angle = (Math.PI * 2 * i) / count;
      const speed = Phaser.Math.Between(50, 100);
      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed;

      this.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        alpha: 0,
        duration: 400,
        onComplete: () => particle.destroy()
      });
    }
  }


  // 사망 패널티 처리: 경험치 일부 손실, 조건에 따라 레벨 다운 + 스탯 소폭 감소, 잠시 후 자동 부활
  handleDeath(killerName) {
    this.addLog(`${killerName}에게 당했습니다...`, 'death');

    // 현재 레벨의 필요 경험치 중 30%를 잃음
    const expNeeded = this.level * 100;
    this.exp -= Math.floor(expNeeded * 0.3);

    if (this.exp < 0 && this.level > 1) {
      // 경험치가 모자라면 레벨이 하나 내려가고, 그만큼 스탯도 소폭 감소함 (최소치 밑으로는 안 내려가게 방어)
      this.level--;
      this.exp = 0;
      this.attackPower = Math.max(10, this.attackPower - 2);
      this.moveSpeed = Math.max(200, this.moveSpeed - 5);
      this.maxHp = Math.max(100, this.maxHp - 10);
      this.addLog(`레벨이 ${this.level + 1} → ${this.level}로 떨어졌습니다`, 'death');
    } else if (this.exp < 0) {
      this.exp = 0; // 이미 1레벨이면 경험치만 0으로 유지
    }

    this.syncStatsToReact();

    // 2초 뒤 자동으로 부활 (Admin 패널 없이도 게임이 멈추지 않도록)
    this.time.delayedCall(2000, () => {
      this.hp = this.maxHp;
      this.player.x = 400;
      this.player.y = 300;
      this.isDead = false;
      this.hpText.setText('HP: ' + this.hp);
      this.addLog('다시 일어났습니다', 'gain');
      this.syncStatsToReact();
    });
  }

  // Admin 패널의 부활 버튼용 - HP를 최대치로 즉시 회복
  revivePlayer() {
    this.hp = this.maxHp;
    this.hpText.setText('HP: ' + this.hp);
    this.syncStatsToReact();
  }

  // Admin 패널의 초기화 버튼용 - 레벨/경험치/스탯포인트/직업을 전부 처음 상태로 되돌림.
  // 골드/인벤토리/장비/퀘스트 진행도/동료 등은 건드리지 않고, "성장 관련 수치"만 리셋함
  // (다른 직업으로 다시 테스트해보고 싶을 때 쓰기 좋아요)
  resetProgress() {
    this.level = 1;
    this.exp = 0;
    this.statPoints = 0;
    this.playerClass = null; // 직업도 다시 null로 되돌려서, 주점에서 다시 고를 수 있게 함

    // 근본 스탯 5종이에요. 다 0에서 시작하고, statPoints로 하나씩 투자해서 올려요.
    this.primaryStats = { str: 0, vit: 0, agi: 0, int: 0, sen: 0 };

    // 장비/스킬이 주는 "고정 보너스"만 따로 모아두는 곳이에요. 근본 스탯과 분리해서
    // 관리하는 이유는, 근본 스탯이 바뀔 때마다 최종 스탯을 처음부터 다시 계산해야
    // 하는데, 그때 장비/스킬 보너스까지 같이 더해줘야 하기 때문이에요.
    this.bonusStats = { attack: 0, speed: 0, maxHp: 0 };

    // 아래 값들은 전부 recalculateDerivedStats()가 계산해서 채워주는 "결과 값"이에요.
    // 처음엔 일단 기본값으로 시작하고, create()에서 한 번 재계산됨
    this.attackPower = 10;
    this.maxHp = 100;
    this.moveSpeed = 200;
    this.hp = 100;
    this.defense = 0;       // 방어력 - 몬스터 데미지를 이만큼 깎아줌
    this.critChance = 0;    // 치명타 확률(%) - 민첩으로 오름
    this.critDamage = 150;  // 치명타 데미지 배율(%) - 150이면 1.5배
    this.magicPower = 0;    // 마력 - 지금은 쓰는 곳 없음, 나중에 액티브 스킬에서 사용 예정
    this.cooldownReduction = 0; // 재사용 대기시간 감소(%) - 지금은 쓰는 곳 없음
    this.precision = 0;     // 정밀도 - 공격 데미지의 최소 하한선을 끌어올림

    if (this.hpText) this.hpText.setText('HP: ' + this.hp);

    this.addLog('레벨과 직업이 초기화되었어요', 'info');
    this.syncStatsToReact();
  }

  // 무기로 몬스터를 때릴 때마다 호출되는 함수예요. 내구도를 1 깎고, 0이 되면 장비가 부서져요.
  reduceWeaponDurability() {
    const itemId = this.equipped.weapon;
    if (!itemId) return; // 아무것도 안 낀 상태(맨손)면 닳을 게 없으니 그냥 종료

    if (this.equipmentDurability[itemId] === undefined) return;

    this.equipmentDurability[itemId]--; // 내구도를 1 깎음

    if (this.equipmentDurability[itemId] <= 0) {
      // ===== 장비가 부서지는 순간 =====
      const item = SHOP_ITEMS.find(i => i.id === itemId);

      this.applyEquipEffect(itemId, -1); // 그동안 받고 있던 효과를 제거
      this.equipped.weapon = null;        // 무기 슬롯을 다시 빈 상태로 만듦
      delete this.equipmentDurability[itemId]; // 내구도 기록도 지움

      if (this.inventory[itemId]) {
        this.inventory[itemId]--;
        if (this.inventory[itemId] <= 0) delete this.inventory[itemId];
      }

      this.addLog(`${item.name}이(가) 부서졌어요!`, 'death');
    }

    this.syncStatsToReact();
  }

  // 장비를 골드를 내고 수리해요. 수리비는 "많이 닳았을수록 비싸지는" 방식으로 계산해요.
  // 공식: 원가의 절반 x (닳은 비율). 예를 들어 원가 30G짜리 장비가 절반쯤 닳았으면 대략 7~8G 정도 나와요
  // (새로 사는 것보다 항상 싸게 만들어서, 수리하는 게 이득이 되도록 설계함)
  repairItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || item.category !== 'equipment') return;

    const currentDurability = this.equipmentDurability[itemId];

    // undefined면 "한 번도 착용한 적 없는 새 장비"라는 뜻이라 수리할 게 없음
    // maxDurability와 같거나 크면 이미 최대치라 수리할 필요가 없음
    if (currentDurability === undefined || currentDurability >= item.maxDurability) return;

    const missing = item.maxDurability - currentDurability; // 얼마나 닳았는지
    const cost = Math.max(1, Math.round(item.basePrice * 0.5 * (missing / item.maxDurability)));

    if (this.gold < cost) {
      this.addLog('골드가 부족해서 수리할 수 없어요', 'death');
      return;
    }

    this.gold -= cost;
    this.equipmentDurability[itemId] = item.maxDurability; // 내구도를 최대치로 완전히 채움

    this.addLog(`${item.name} 수리 완료! (-${formatCurrency(cost)})`, 'gain');
    this.syncStatsToReact();
  }

  // 주점에서 리나에게 처음 등록할 때 직업을 고르는 함수예요. 고른 즉시 그 직업의
  // 기본 스탯(공격력/체력/이동속도)으로 지금 스탯을 덮어써요.
  chooseClass(classId) {
    if (this.playerClass) return; // 이미 직업이 있으면 다시 고를 수 없게 막음 (재선택은 나중에 별도 기능으로 고려)

    const classInfo = CLASS_TYPES[classId];
    if (!classInfo) return;

    this.playerClass = classId;
    // {...classInfo.primaryStats}로 객체를 복사해서 저장 (원본 데이터를 직접 참조하면
    // 나중에 investStat으로 값을 바꿀 때 gameConfig.js의 원본 데이터까지 바뀌어버려요)
    this.primaryStats = { ...classInfo.primaryStats };

    this.recalculateDerivedStats();
    this.hp = this.maxHp; // 직업을 갓 고른 시점이니 체력을 새 최대치로 꽉 채움
    if (this.hpText) this.hpText.setText('HP: ' + this.hp);

    this.addLog(`${classInfo.name}(으)로 용병 등록을 마쳤어요!`, 'gain');
    this.syncStatsToReact();
  }

  // 근본 스탯 5개(str/vit/agi/int/sen)를 보고 실제 전투 스탯을 전부 다시 계산해요.
  // 근본 스탯이 바뀌거나(investStat), 장비/스킬 보너스가 바뀔 때마다(applyEquipEffect,
  // upgradeSkill) 이 함수를 다시 호출해서 최종 값을 맞춰요.
  recalculateDerivedStats() {
    const s = this.primaryStats;
    const oldMaxHp = this.maxHp;

    this.attackPower = 10 + s.str * 2 + this.bonusStats.attack;
    this.maxHp = 100 + s.vit * 8 + this.bonusStats.maxHp;
    this.moveSpeed = 200 + this.bonusStats.speed;
    this.defense = s.vit * 1;
    // Math.min(50, ...)처럼 상한을 걸어서, 치명타 확률이 100%를 넘어가는 극단적인
    // 상황을 방지함 (민첩을 아무리 많이 찍어도 50%가 한계)
    this.critChance = Math.min(50, s.agi * 0.5);
    this.critDamage = 150 + s.agi * 2; // 150 = 기본 1.5배, 민첩 1당 2%씩 늘어남
    this.magicPower = s.int * 1;
    this.cooldownReduction = Math.min(40, s.int * 0.5);
    this.precision = s.sen * 1;

    // 최대체력이 늘어난 만큼(delta) 지금 체력도 같이 늘려줌 (활력 투자 시 바로 체감되게)
    // 반대로 줄어드는 경우는 거의 없지만, 혹시 몰라 방어적으로 Math.min으로 한 번 더 묶어둠
    const delta = this.maxHp - oldMaxHp;
    if (delta > 0) this.hp += delta;
    this.hp = Math.min(this.hp, this.maxHp);

    if (this.hpText) this.hpText.setText('HP: ' + this.hp);
  }

  // 근본 스탯 하나에 스탯 포인트 1개를 투자해요. statType은 'str'/'vit'/'agi'/'int'/'sen' 중 하나예요.
  investStat(statType) {
    if (this.statPoints <= 0) return;
    if (!(statType in this.primaryStats)) return; // 잘못된 이름이 들어오면 무시

    this.statPoints--;
    this.primaryStats[statType]++;
    this.recalculateDerivedStats();

    this.syncStatsToReact();
  }

  // 스킬 포인트를 써서 스킬 레벨을 하나 올려요.
  upgradeSkill(skillId) {
    if (!this.playerClass) return; // 직업이 없으면 스킬도 없음
    if (this.skillPoints <= 0) {
      this.addLog('스킬 포인트가 부족해요', 'info');
      return;
    }

    // 내 직업의 스킬 목록에서 이 skillId를 실제로 찾아봄 (다른 직업 스킬을 억지로
    // 올리려는 시도를 막기 위한 안전장치이기도 함)
    const mySkills = CLASS_SKILLS[this.playerClass] || [];
    const skill = mySkills.find(s => s.id === skillId);
    if (!skill) return;

    const currentLevel = this.skillLevels[skillId] || 0; // 아직 기록이 없으면 0레벨로 취급
    if (currentLevel >= skill.maxLevel) {
      this.addLog('이미 최대 레벨이에요', 'info');
      return;
    }

    this.skillPoints--;
    this.skillLevels[skillId] = currentLevel + 1;

    // 스킬 효과도 이제 bonusStats에 누적하고 recalculateDerivedStats()로 반영함 (장비와 동일한 패턴)
    if (skill.effectType === 'attack') {
      this.bonusStats.attack += skill.effectPerLevel;
    } else if (skill.effectType === 'speed') {
      this.bonusStats.speed += skill.effectPerLevel;
    } else if (skill.effectType === 'maxHp') {
      this.bonusStats.maxHp += skill.effectPerLevel;
    }
    this.recalculateDerivedStats();

    this.addLog(`${skill.name} 레벨 ${this.skillLevels[skillId]}!`, 'gain');
    this.syncStatsToReact();
  }

  // 기본 공격이 몬스터에 맞았을 때 나오는 슬래시 이펙트예요. 처치 여부와 상관없이
  // "때릴 때마다" 나와서, 공격이 실제로 명중했다는 느낌을 즉각적으로 줘요.
  // (기존 createParticleBurst는 "처치했을 때"만 나오는 별개의 이펙트예요)
  createAttackSlashEffect(x, y) {
    // 짧은 직사각형을 하나 만들어서, 살짝 커졌다 사라지는 애니메이션을 줌 - 칼을 휘두른 잔상 느낌
    const slash = this.add.rectangle(x, y, 30, 4, 0xffffff);
    slash.setRotation(Phaser.Math.Between(0, 360) * (Math.PI / 180)); // 매번 랜덤한 각도로 표시해서 단조롭지 않게 함

    this.tweens.add({
      targets: slash,
      scaleX: 2,
      alpha: 0,
      duration: 150, // 아주 짧게(0.15초) 나왔다 사라지게 해서 공격 리듬을 안 늦춤
      onComplete: () => slash.destroy()
    });
  }


  // 주점에서 "쉬기" 버튼을 눌렀을 때 호출돼요. 지금은 무료로 체력을 완전히 회복시켜줘요.
  // (나중에 동료/등급 시스템이 생기면, 여기에 "숙박비" 같은 걸 추가할 수도 있어요)
  restAtTavern() {
    this.hp = this.maxHp;
    this.hpText.setText('HP: ' + this.hp);
    this.addLog('푹 쉬어서 체력을 모두 회복했어요', 'gain');
    this.syncStatsToReact();
  }

  // 퀘스트를 수락해요. includes()는 "배열 안에 이 값이 있는지" 확인해주는 함수예요.
  acceptQuest(questId) {
    if (this.activeQuestIds.includes(questId)) return; // 이미 수락한 퀘스트면 중복 수락 안 되게 막음

    const quest = QUEST_TEMPLATES.find(q => q.id === questId);
    if (!quest) return;

    // RANK_TIERS에서 "지금 내 등급"과 "퀘스트가 요구하는 등급"의 order(순서 숫자)를 각각 찾아서 비교해요.
    // find()는 조건에 맞는 첫 번째 항목을 찾아주는 함수예요.
    const myRankOrder = RANK_TIERS.find(r => r.id === this.rank).order;
    const requiredRankOrder = RANK_TIERS.find(r => r.id === quest.minRank).order;

    if (myRankOrder < requiredRankOrder) {
      this.addLog('등급이 부족해서 받을 수 없는 의뢰예요', 'info');
      return;
    }

    this.activeQuestIds.push(questId); // 배열 맨 뒤에 이 퀘스트 id를 추가함
    this.addLog(`퀘스트 수락: ${quest.name}`, 'info');
    this.syncStatsToReact();
  }

  // 퀘스트를 제출해요. 조건(targetCount개 보유)을 만족해야만 성공하고,
  // 성공하면 그 아이템들을 인벤토리에서 소모하고 골드+경험치 보상을 줘요.
  turnInQuest(questId) {
    if (!this.activeQuestIds.includes(questId)) return; // 수락도 안 한 퀘스트는 제출할 수 없음

    const quest = QUEST_TEMPLATES.find(q => q.id === questId);
    if (!quest) return;

    const haveCount = this.inventory[quest.targetId] || 0;
    if (haveCount < quest.targetCount) {
      this.addLog('아직 조건을 다 채우지 못했어요', 'info');
      return;
    }

    // 필요한 개수만큼 인벤토리에서 빼줘요
    this.inventory[quest.targetId] -= quest.targetCount;
    if (this.inventory[quest.targetId] <= 0) delete this.inventory[quest.targetId];

    this.gold += quest.rewardGold;

    // filter()는 배열에서 조건에 맞는 것만 남기고 새 배열을 만들어주는 함수예요.
    // "이 퀘스트 id와 다른 것들만 남겨라"라고 하면, 결과적으로 이 퀘스트만 배열에서 빠지게 돼요.
    this.activeQuestIds = this.activeQuestIds.filter(id => id !== questId);
    this.questsCompletedCount++; // 승급 조건으로 쓰이는 누적 완료 횟수를 하나 늘림

    this.addLog(`퀘스트 완료: ${quest.name} (+${formatCurrency(quest.rewardGold)})`, 'gain');
    this.gainExp(quest.rewardExp); // gainExp 안에서 syncStatsToReact도 같이 호출되니 따로 또 부를 필요 없음
  }

  // 리나에게 승급 시험을 봐요. 조건(레벨/완료 퀘스트 수)을 다 채우고 시험비를 내면 통과해요.
  takeExam() {
    const myRankOrder = RANK_TIERS.find(r => r.id === this.rank).order;

    // RANK_TIERS 배열에서 "지금 내 등급보다 order가 딱 1 높은" 등급을 찾아요.
    // 못 찾으면(이미 최고 등급이면) undefined가 나와요.
    const nextRank = RANK_TIERS.find(r => r.order === myRankOrder + 1);

    if (!nextRank) {
      this.addLog('이미 최고 등급이에요', 'info');
      return;
    }

    if (this.level < nextRank.requiredLevel) {
      this.addLog(`레벨이 부족해요 (필요: ${nextRank.requiredLevel})`, 'info');
      return;
    }
    if (this.questsCompletedCount < nextRank.requiredQuests) {
      this.addLog(`완료한 의뢰 수가 부족해요 (필요: ${nextRank.requiredQuests}회)`, 'info');
      return;
    }
    if (this.gold < nextRank.examFee) {
      this.addLog('시험비가 부족해요', 'death');
      return;
    }

    this.gold -= nextRank.examFee;
    this.rank = nextRank.id;

    this.addLog(`승급 시험 통과! ${nextRank.name}이(가) 되었어요`, 'gain');
    this.syncStatsToReact();
  }

  // 2초마다 호출되는 함수예요. 지금 이 순간의 모든 아이템 가격을 한 번씩 기록에 남겨요.
  // "기록에 남긴다"는 건, priceHistory 배열 맨 뒤에 지금 가격 숫자를 하나 추가(push)하는 거예요.
  recordPriceHistory() {
    const maxHistoryLength = 30; // 최근 30개 기록만 남기고 그 전 건 지워요 (안 그러면 배열이 계속 커져서 느려짐)

    SHOP_ITEMS.forEach(item => {
      const currentPrice = this.getMarketPrice(item.id);

      // push()는 배열 맨 뒤에 새 값을 추가하는 자바스크립트 기본 함수예요
      this.priceHistory[item.id].push(currentPrice);

      // 배열 길이가 30개를 넘으면, shift()로 맨 앞(가장 오래된) 기록을 하나 제거해요
      // 이렇게 하면 항상 "최근 30개"만 유지돼요
      if (this.priceHistory[item.id].length > maxHistoryLength) {
        this.priceHistory[item.id].shift();
      }
    });
  }

  // 재고(marketStock)를 기준치(10)와 비교해 현재 시세를 계산
  // 재고가 적을수록 비싸지고, 많을수록 싸짐. 배율을 0.4~2.5배로 제한해 가격이 너무 극단적으로 치닫지 않게 함
  getMarketPrice(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return 0;

    // 무제한 재고 아이템(주점 음식 등)은 재고에 따라 가격이 오르내릴 필요가 없어서,
    // 계산 없이 기준가(basePrice)를 그대로 돌려줌
    if (item.unlimitedStock) return item.basePrice;

    const baselineStock = 10;
    const stock = this.marketStock[itemId] ?? baselineStock;

    // 나눗셈에서 stock이 0이면 "0으로 나누기" 에러가 생기니까,
    // 계산할 때만 최소 1로 취급해요 (실제 재고 값 자체는 0 그대로 유지됨 - 표시/구매 제한용으로는 진짜 0을 씀)
    const multiplier = Math.min(2.5, Math.max(0.4, baselineStock / Math.max(stock, 1)));

    return Math.max(1, Math.round(item.basePrice * multiplier));
  }

  // 아이템 구매 - 낱개마다 가격을 다시 계산해서, 여러 개 살수록 뒤로 갈수록 비싸짐 (재고 감소 반영)
  // quantity를 넘기면 여러 개를 한 번에 구매 (Shift+클릭용).
  // 골드가 부족해지거나, 상인의 재고가 0이 되면 그 시점에서 멈추고 그때까지 산 만큼만 인정함
  buyItem(itemId, quantity = 1) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    let boughtCount = 0;
    let totalSpent = 0;

    // for문을 quantity번 돌면서, 한 번 돌 때마다 "한 개씩" 사는 걸 반복해요.
    // 이렇게 한 개씩 나눠서 처리하는 이유는, 살 때마다 가격이 조금씩 오르기 때문이에요
    // (한 번에 10개를 사도 다 같은 가격이 아니라, 1개 값 → 2개째 값 → 3개째 값... 이렇게 달라짐)
    for (let i = 0; i < quantity; i++) {
      // 무제한 재고 아이템이 아닐 때만 재고를 확인/차감함
      if (!item.unlimitedStock) {
        // ?? 10 은 "만약 marketStock[itemId]가 아직 없다면(undefined) 10을 기본값으로 쓴다"는 뜻이에요
        const currentStock = this.marketStock[itemId] ?? 10;

        // 상인 재고가 0이면 더 이상 팔 물건이 없다는 뜻이니, 반복을 여기서 멈춰요 (break)
        if (currentStock <= 0) break;
      }

      const price = this.getMarketPrice(itemId);
      if (this.gold < price) break; // 골드가 부족해지면 거기서 멈추고, 그때까지 산 만큼만 인정

      this.gold -= price;
      totalSpent += price;

      if (!item.unlimitedStock) {
        // 이제는 재고가 진짜로 0까지 줄어들 수 있어요 (예전엔 Math.max(1, ...)로 최소 1을 유지했었음)
        this.marketStock[itemId] = (this.marketStock[itemId] ?? 10) - 1;
      }
      boughtCount++;
    }
    if (boughtCount === 0) return;

    if (!this.inventory[itemId]) this.inventory[itemId] = 0;
    this.inventory[itemId] += boughtCount;

    this.addLog(`${item.name} ${boughtCount}개 구매 (-${formatCurrency(totalSpent)})`, 'info');
    this.syncStatsToReact();
  }

  // 아이템 판매 - 낱개마다 가격을 다시 계산해서, 여러 개 팔수록 뒤로 갈수록 싸짐 (재고 증가 반영)
  // quantity를 넘기면 여러 개를 한 번에 판매 (Shift+클릭용). 보유량보다 많이 요청해도 가진 만큼만 판매함
  sellItem(itemId, quantity = 1) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || !this.inventory[itemId]) return;

    const sellCount = Math.min(quantity, this.inventory[itemId]);
    if (sellCount <= 0) return;

    let totalEarned = 0;
    for (let i = 0; i < sellCount; i++) {
      const price = this.getMarketPrice(itemId);
      totalEarned += price;
      this.marketStock[itemId] = (this.marketStock[itemId] ?? 10) + 1; // 팔 때마다 재고 증가 -> 다음 가격 하락
    }

    this.inventory[itemId] -= sellCount;
    this.gold += totalEarned;

    this.addLog(`${item.name} ${sellCount}개 판매 (+${formatCurrency(totalEarned)})`, 'gain');
    this.syncStatsToReact();
  }

  // 인벤토리에 있는 소모품(회복 포션 등)을 사용 - 장비(equipment)는 이 함수 대신 equipItem/unequipItem으로 처리함
  // quantity를 넘기면 여러 개를 한 번에 사용 (Shift+클릭용). 보유량보다 많이 요청해도 가진 만큼만 사용함
  useItem(itemId, quantity = 1) {
    if (!this.inventory[itemId] || this.inventory[itemId] <= 0) return;

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || item.category !== 'consumable') return;

    const useQty = Math.min(quantity, this.inventory[itemId]);
    this.inventory[itemId] -= useQty;

    if (item.effectType === 'heal') {
      this.hp = Math.min(this.maxHp, this.hp + item.effectValue * useQty);
      this.hpText.setText('HP: ' + this.hp);
    }

    this.syncStatsToReact();
  }

  // 장비 장착 - 같은 슬롯에 이미 장착된 게 있으면 먼저 해제(효과 되돌리기)한 뒤 새로 장착함
  // 소모품과 달리 인벤토리에서 사라지지 않고, 장착 중인 동안만 효과가 적용됨
  equipItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || item.category !== 'equipment') return;
    if (!this.inventory[itemId] || this.inventory[itemId] <= 0) return;

    const slot = item.slot;
    if (this.equipped[slot]) {
      this.applyEquipEffect(this.equipped[slot], -1); // 기존 장비 효과 제거
    }
    this.equipped[slot] = itemId;
    this.applyEquipEffect(itemId, 1); // 새 장비 효과 적용

    // 이 아이템의 내구도 기록이 아직 없다면(=한 번도 착용한 적 없는 새 장비라면), maxDurability로 채워줌
    // 이미 기록이 있다면(예전에 착용하다 벗어둔 상태) 그 값을 그대로 유지해서 닳아있던 만큼 이어서 닳도록 함
    if (this.equipmentDurability[itemId] === undefined) {
      this.equipmentDurability[itemId] = item.maxDurability;
    }

    this.syncStatsToReact();
  }


  // 장비 해제 - 해당 슬롯을 비우고 효과를 되돌림
  unequipItem(slot) {
    const itemId = this.equipped[slot];
    if (!itemId) return;

    this.applyEquipEffect(itemId, -1);
    this.equipped[slot] = null;

    this.syncStatsToReact();
  }

  // direction: 1이면 장착(효과 더하기), -1이면 해제(효과 빼기) - 장착/해제 로직을 하나로 재사용하기 위한 헬퍼
  // 이제 attackPower 등을 직접 건드리지 않고, bonusStats에 누적한 뒤 recalculateDerivedStats()를
  // 호출해서 근본 스탯 기반 값 위에 다시 얹는 방식으로 바뀌었어요
  applyEquipEffect(itemId, direction) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    if (item.effectType === 'attack') {
      this.bonusStats.attack += item.effectValue * direction;
    } else if (item.effectType === 'speed') {
      this.bonusStats.speed += item.effectValue * direction;
    } else if (item.effectType === 'maxHp') {
      this.bonusStats.maxHp += item.effectValue * direction;
    }

    this.recalculateDerivedStats();
  }

  // 채집한 자원/몬스터를 인벤토리에 추가
  addToInventory(entityKey) {
    if (!this.inventory[entityKey]) {
      this.inventory[entityKey] = 0;
    }
    this.inventory[entityKey]++;
    this.syncStatsToReact();
  }

  // 자원/동물/몬스터 오브젝트를 생성하는 통합 함수
  // category에 따라 물리 속성(고정/이동/추적)이 자동으로 다르게 설정됨
  createEntity(x, y, typeKey) {
    const info = ENTITY_TYPES[typeKey];

    // renderType이 'sprite'면 실제 이미지로, 그 외에는 기존처럼 도형(circle)으로 생성
    const entity = info.renderType === 'sprite'
      ? this.add.sprite(x, y, info.spriteIdleKey, 0).setScale(info.spriteScale || 1)
      : this.add.circle(x, y, info.radius, info.color);

    entity.entityType = typeKey;
    entity.hp = info.hp;
    entity.maxHp = info.hp;
    // 채집/처치되어 리젠 대기 중인지 여부 (실내/실외 여부와는 별개로 관리)
    entity.isHarvested = false;

    if (info.renderType === 'sprite') {
      entity.play(`${typeKey}-idle`); // 생성 직후에는 대기 애니메이션으로 시작
    }

    if (info.category === 'resource') {
      // 자원은 움직이지 않는 정적 물리 객체
      this.physics.add.existing(entity, true);
    } else if (info.category === 'passive_animal') {
      // 순한 동물은 랜덤 방향으로 계속 움직임
      this.physics.add.existing(entity);
      entity.body.setCollideWorldBounds(true);
      entity.body.setBounce(1, 1);
      const vx = Phaser.Math.Between(-50, 50);
      const vy = Phaser.Math.Between(-50, 50);
      entity.body.setVelocity(vx, vy);
    } else if (info.category === 'hostile_monster') {
      // 몬스터는 update()에서 매 프레임 플레이어를 추적하도록 처리됨
      this.physics.add.existing(entity);
      entity.body.setCollideWorldBounds(true);
    }

    return entity;
  }

  // 실제 경과 시간(delta, ms)을 게임 내 시간(분)으로 환산해 누적하고,
  // 화면의 시간 텍스트와 밤 오버레이 투명도를 매 프레임 갱신함
  updateGameClock(delta) {
    const gameMinutesPerRealSecond = 1440 / GAME_CONFIG.dayLengthSeconds; // 하루(1440분)를 dayLengthSeconds초에 맞추기 위한 환산 비율
    this.gameMinutes += gameMinutesPerRealSecond * (delta / 1000);

    if (this.gameMinutes >= 1440) {
      this.gameMinutes -= 1440;
      this.currentDay++;
    }

    const hour = Math.floor(this.gameMinutes / 60);
    const minute = Math.floor(this.gameMinutes % 60);
    this.timeText.setText(`Day ${this.currentDay}  ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);

    // 몬스터 강화는 플레이어가 실내에 있어도 실외의 몬스터에게는 그대로 적용되어야 하므로
    // 화면 오버레이(alpha)와 별개로 실제 밤 깊이를 항상 계산해서 저장해둠
    this.nightIntensity = this.getNightAlpha(this.gameMinutes / 60);

    // 실내에서는 조명이 있다고 가정하고 화면은 항상 밝게 유지, 실외일 때만 오버레이로 어둡게 표시
    const alpha = this.isInsideHouse ? 0 : this.nightIntensity;
    this.nightOverlay.setAlpha(alpha);
  }

  // 시간대(0~24시, 소수 가능)에 따라 밤 오버레이의 진하기(0~0.6)를 계산
  // 8~18시는 낮(0), 18~20시는 저녁으로 점점 어두워짐, 20~다음날 6시는 밤(최대 0.6), 6~8시는 새벽으로 점점 밝아짐
  getNightAlpha(hour) {
    if (hour >= 8 && hour < 18) return 0;
    if (hour >= 18 && hour < 20) return (hour - 18) / 2 * 0.6;
    if (hour >= 6 && hour < 8) return 0.6 - (hour - 6) / 2 * 0.6;
    return 0.6;
  }

  // 밤 깊이(0~0.6)를 몬스터 강화 배율(1.0~1.5)로 변환 - 한밤중일수록 더 강해짐
  getNightMonsterMultiplier() {
    return 1 + (this.nightIntensity / 0.6) * 0.5;
  }

  // 기본 공격력(baseAttackPower)을 받아서, 정밀도(데미지 변동폭 하한선)와 치명타를
  // 반영한 최종 데미지를 계산해줘요.
  calculateDamage(baseAttackPower) {
    // 데미지는 기본적으로 "공격력의 min%~130%" 사이에서 무작위로 정해져요.
    // min%는 70%에서 시작하고, 정밀도(감각 스탯) 1당 1%씩 올라가며 최대 130%(=변동 없음)로 묶어둠
    const minPercent = Math.min(130, 70 + this.precision) / 100;
    const maxPercent = 1.3;

    // minPercent~maxPercent 사이의 무작위 배율을 하나 뽑음
    const variance = minPercent + Math.random() * (maxPercent - minPercent);
    let damage = baseAttackPower * variance;

    // 치명타 판정 - critChance(%)보다 낮은 무작위 숫자가 나오면 치명타 발동
    const isCrit = Math.random() * 100 < this.critChance;
    if (isCrit) {
      damage *= (this.critDamage / 100); // critDamage가 150이면 1.5배
    }

    return { damage: Math.max(1, Math.round(damage)), isCrit };
  }


    // 동물이 화면 안이 아니라 "화면 밖 가장자리"에서 등장하도록 좌표를 계산
    getEdgeSpawnPosition() {
      const side = Phaser.Math.Between(0, 3); // 0:위, 1:아래, 2:왼쪽, 3:오른쪽
      if (side === 0) return { x: Phaser.Math.Between(0, 800), y: -30 };
      if (side === 1) return { x: Phaser.Math.Between(0, 800), y: 630 };
      if (side === 2) return { x: -30, y: Phaser.Math.Between(0, 600) };
      return { x: 830, y: Phaser.Math.Between(0, 600) };
    }


    // 밭 하나를 화면에 그려주는 함수예요. FARM_PLOTS 배열의 항목 하나(plotConfig)를 받아서
    // 사각형(땅)과, 아직 안 샀다면 가격표까지 만들어줘요.
    createFarmPlot(plotConfig) {
      // add.rectangle(x, y, 가로, 세로, 색깔)로 네모난 도형을 만들어요.
      // 색은 일단 기본값으로 만들고, 실제 정확한 색/보임 여부는 아래 refreshFarmPlotVisual이 정리해줌
      const plotSprite = this.add.rectangle(plotConfig.x, plotConfig.y, 60, 60, 0x8a9a7a);
      plotSprite.setStrokeStyle(2, 0x4a3520); // 테두리선 추가 (두께 2, 진한 갈색) - 밭 경계가 잘 보이게

      // 아직 안 산 밭 위에 가격을 보여주는 텍스트도 만들어둠 (구매하면 refreshFarmPlotVisual에서 숨김 처리)
      const priceLabel = this.add.text(plotConfig.x, plotConfig.y - 40, formatCurrency(plotConfig.price), {
        fontSize: '11px', color: '#ffd76a', backgroundColor: '#00000088', padding: { x: 4, y: 2 }
      });
      priceLabel.setOrigin(0.5); // 텍스트의 기준점을 정중앙으로 맞춰서, 좌표가 딱 중앙에 오도록 함

      // 방금 만든 도형/텍스트들을 this.farmPlots에 저장해둬요.
      // 나중에 다른 함수에서 "farm1의 사각형 색을 바꿔야지" 할 때 이 저장해둔 걸 다시 꺼내 씀
      this.farmPlots[plotConfig.id] = {
        config: plotConfig,
        plotSprite,
        priceLabel,
        cropSprite: null // 아직 심은 작물이 없으니 null(없음)로 시작
      };

      // 만들자마자 한 번 정확한 상태로 그려줌 (저장 파일 불러와서 이미 구매/재배 중이었을 수도 있으니까)
      this.refreshFarmPlotVisual(plotConfig.id);
    }


    // 밭 하나의 "지금 상태"를 보고 화면을 최신으로 다시 그려주는 함수예요.
    // 구매 여부, 심어진 작물, 자란 정도, 그리고 "지금 실내인지"까지 전부 이 함수 하나가 판단해요.
    // 이렇게 판단 기준을 한 곳에 모아두면, 나중에 이 함수를 어디서 호출하든
    // (타이머든, 집 출입이든) 매번 따로 "실내면 숨겨야지"를 신경 쓸 필요가 없어져요.
    refreshFarmPlotVisual(plotId) {
      const farmObj = this.farmPlots[plotId];
      if (!farmObj) return; // 혹시 아직 안 만들어진 밭이면 아무것도 안 하고 함수 종료

      // 실내에 있을 때는 밭 관련 그림을 전부 숨기고 여기서 함수를 끝내요.
      // (entities에서 쓰는 refreshEntityVisual과 똑같은 패턴이에요)
      if (this.isInsideHouse) {
        farmObj.plotSprite.setVisible(false);
        farmObj.priceLabel.setVisible(false);
        if (farmObj.cropSprite) farmObj.cropSprite.setVisible(false);
        return;
      }

      // 실외라면 일단 밭 사각형은 보이게 켜둠 (아래에서 세부 상태를 계속 정리함)
      farmObj.plotSprite.setVisible(true);

      const owned = !!this.ownedPlots[plotId];
      const crop = this.plantedCrops[plotId];

      // 안 산 밭은 풀빛 회색, 산 밭(경작지)은 갈색으로 표시
      farmObj.plotSprite.setFillStyle(owned ? 0x6b4a2f : 0x8a9a7a);

      // 가격표는 "안 산 밭일 때만" 보이게 함 (setVisible(true/false)로 화면 표시 여부를 조절)
      farmObj.priceLabel.setVisible(!owned);

      // 이전에 작물 그림(원)이 그려져 있었다면 일단 지워요.
      // destroy()는 "이 오브젝트를 화면에서 완전히 없앤다"는 뜻이에요 (메모리에서도 정리됨)
      if (farmObj.cropSprite) {
        farmObj.cropSprite.destroy();
        farmObj.cropSprite = null;
      }

      // 심어진 작물이 없으면 여기서 끝 (빈 밭이니 원을 새로 그릴 필요 없음)
      if (!crop) return;

      const cropInfo = CROP_TYPES[crop.cropType];
      const progress = this.getCropProgress(plotId); // 0(막 심음) ~ 1(다 자람) 사이의 숫자

      // 자랄수록 원이 점점 커지게: 최소 반지름 8, 다 자라면 최대 22
      const radius = 8 + progress * 14;

      // 다 자랐으면(progress가 1 이상) 눈에 띄는 밝은 노란색으로, 아직 자라는 중이면 작물 고유 색으로 표시
      const color = progress >= 1 ? 0xffe066 : cropInfo.color;

      farmObj.cropSprite = this.add.circle(plotId ? farmObj.config.x : 0, farmObj.config.y, radius, color);
    }

    // 지금 이 밭에 심어진 작물이 얼마나 자랐는지 0~1 사이의 숫자로 계산해줘요.
    // 0 = 방금 심음, 1 = 다 자람(수확 가능), 0.5 = 절반쯤 자람 이런 식이에요.
    getCropProgress(plotId) {
      const crop = this.plantedCrops[plotId];
      if (!crop) return 0; // 아무것도 안 심어져 있으면 자랄 것도 없으니 0

      const cropInfo = CROP_TYPES[crop.cropType];

      // "지금이 게임 속으로 총 몇 분째인지"를 계산해요.
      // 예: 3일째 오전 2시(120분)라면 = 2일 x 1440분 + 120분 = 2일치를 다 지나온 뒤의 120분
      // (currentDay가 1부터 시작하니 -1을 빼서 "지나간 날 수"만 계산함)
      const nowTotalMinutes = (this.currentDay - 1) * 1440 + this.gameMinutes;

      const elapsedMinutes = nowTotalMinutes - crop.plantedAt; // 심은 뒤로 몇 분이 지났는지

      // Math.min(1, ...)은 "계산값이 1보다 커도 최대 1로 묶어준다"는 뜻이에요.
      // 안 그러면 다 자란 뒤에도 숫자가 계속 커져서(1.5, 2.0...) 나중에 계산이 이상해질 수 있어요.
      return Math.min(1, elapsedMinutes / cropInfo.growMinutes);
    }

    // F키를 눌렀을 때 실제로 무슨 일이 일어날지 결정하는 함수예요.
    // 밭 상태(안 삼/빈 밭/자라는 중/다 자람)에 따라 하는 일이 완전히 달라져요.
    handleFarmInteract(plotId) {
      const plotConfig = FARM_PLOTS.find(p => p.id === plotId);
      const owned = !!this.ownedPlots[plotId];

      // ① 아직 안 산 밭이라면 -> 구매를 시도함
      if (!owned) {
        if (this.gold < plotConfig.price) {
          this.addLog('골드가 부족해서 밭을 살 수 없어요', 'death');
          return; // return을 만나면 함수가 바로 끝나요 (아래 코드는 실행 안 됨)
        }

        this.gold -= plotConfig.price;
        this.ownedPlots[plotId] = true; // 이제 이 밭은 "내 것"이라고 기록
        this.addLog(`밭을 구매했어요! (-${formatCurrency(plotConfig.price)})`, 'gain');
        this.refreshFarmPlotVisual(plotId); // 색이 바로 바뀌도록 화면 갱신
        this.syncStatsToReact();
        return;
      }

      // ② 내 밭인데 아무것도 안 심어져 있다면 -> 심기 메뉴를 열어달라고 React 쪽에 알림
      const crop = this.plantedCrops[plotId];
      if (!crop) {
        if (this.onFarmMenuOpen) this.onFarmMenuOpen(plotId);
        return;
      }

      // ③ 내 밭에 뭔가 심어져 있다면 -> 다 자랐는지 확인
      const progress = this.getCropProgress(plotId);

      if (progress >= 1) {
        // 다 자랐으면 수확!
        const cropInfo = CROP_TYPES[crop.cropType];
        const yieldAmount = Phaser.Math.Between(cropInfo.yieldMin, cropInfo.yieldMax); // 몇 개 나올지 무작위로 결정

        if (!this.inventory[crop.cropType]) this.inventory[crop.cropType] = 0;
        this.inventory[crop.cropType] += yieldAmount;

        // delete는 객체 안의 특정 키(항목)를 통째로 지워버리는 자바스크립트 문법이에요.
        // 이렇게 하면 this.plantedCrops[plotId]가 다시 undefined(없음) 상태가 되어서
        // 다음에 이 밭을 확인할 때 "빈 밭"으로 인식하게 돼요.
        delete this.plantedCrops[plotId];

        this.addLog(`${cropInfo.name} ${yieldAmount}개 수확했어요!`, 'gain');
        this.refreshFarmPlotVisual(plotId);
        this.syncStatsToReact();
      } else {
        // 아직 덜 자랐으면 지금 몇 퍼센트인지만 알림으로 알려줌
        const percent = Math.floor(progress * 100);
        this.addLog(`아직 자라는 중이에요 (${percent}%)`, 'info');
      }
    }

    // React 쪽(App.js)의 심기 메뉴에서 씨앗을 선택했을 때 호출되는 함수예요.
    plantSeed(plotId, seedItemId) {
      // 이 씨앗을 실제로 갖고 있는지 확인 (없으면 아무것도 안 하고 종료)
      if (!this.inventory[seedItemId] || this.inventory[seedItemId] <= 0) return;

      const seedItem = SHOP_ITEMS.find(i => i.id === seedItemId);
      if (!seedItem || seedItem.category !== 'seed') return; // 씨앗이 아닌 걸 심으려고 하면 무시

      this.inventory[seedItemId]--; // 씨앗을 하나 소모함

      // 이 밭에 "지금 심었다"는 기록을 남김
      // plantedAt에는 "지금이 게임 속으로 총 몇 분째인지"를 저장해서, 나중에 얼마나 자랐는지 계산할 때 씀
      this.plantedCrops[plotId] = {
        cropType: seedItem.cropType,
        plantedAt: (this.currentDay - 1) * 1440 + this.gameMinutes
      };

      if (this.onFarmMenuOpen) this.onFarmMenuOpen(null); // React 쪽 심기 메뉴를 닫아달라고 알림 (null = "닫아줘")

      const cropInfo = CROP_TYPES[seedItem.cropType];
      this.addLog(`${cropInfo.name} 씨앗을 심었어요`, 'gain');
      this.refreshFarmPlotVisual(plotId);
      this.syncStatsToReact();
    }

    // NPC 오브젝트를 생성하는 통합 함수 - NPC_DATA에 항목만 추가하면 몇 명이든 생성 가능
    createNpc(x, y, npcTypeKey) {
      const info = NPC_DATA[npcTypeKey];

      // NPC는 움직이지 않으므로 "아래를 보는" 프레임(1번)을 고정으로 사용
      const npc = this.add.sprite(x, y, info.spriteKey, 1);
      npc.setScale(5); // 플레이어와 동일한 배율 (16px 원본 -> 80px 표시)
      npc.npcType = npcTypeKey;

      this.physics.add.existing(npc, true); // 정적 물리 바디 (제자리 고정)

      // 걷기 프레임이 없는 에셋이라도, 제자리에서 살짝 위아래로 흔들리게 하면
      // 정지된 느낌 대신 "숨쉬는" 느낌을 줄 수 있음 (새 이미지 없이 코드만으로 구현)
      // 물리 바디는 이 흔들림을 따라가지 않지만, 흔들리는 폭이 작아 충돌 판정엔 거의 영향 없음
      this.tweens.add({
        targets: npc,
        y: y - 4,
        duration: 700 + Math.random() * 300, // NPC마다 흔들리는 주기를 살짝 다르게 해서 기계적으로 안 보이게 함
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      return npc;
    }

    // 집 오브젝트를 생성하는 통합 함수 - BUILDING_TYPES 데이터만 있으면 몇 채든 생성 가능
    createHouse(x, y, typeKey) {
      const info = BUILDING_TYPES[typeKey];

      const house = this.add.rectangle(x, y, info.width, info.height, info.color);
      house.buildingType = typeKey; // 나중에 어떤 종류의 집인지 구분하기 위한 태그

      this.physics.add.existing(house, true); // 정적 오브젝트 (부딪히면 못 지나감)
      this.physics.add.collider(this.player, house);

      return house;
    }
  }

