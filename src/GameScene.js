import Phaser from 'phaser';
import {
  GAME_CONFIG, ENTITY_TYPES, NPC_DATA, SHOP_ITEMS, BUILDING_TYPES, formatCurrency,
  CROP_TYPES, FARM_PLOTS, QUEST_TEMPLATES, COMPANION_TYPES, RANK_TIERS, CLASS_TYPES,
  CLASS_SKILLS, EQUIPMENT_SLOTS, CLASS_ACTIVE_SKILLS, HUNTING_GROUND_RANKS, HUNTING_GROUNDS,
  DUNGEON_RANKS, DUNGEONS, FIELD_ZONES, BOND_CONFIG, CLASS_AOE_SKILLS, VILLAGE_EXTENSIONS
} from './gameConfig';

// 고용할 수 있는 용병(동료) 슬롯 목록이에요. 슬롯 개수가 곧 "최대 동행 인원"이라서,
// 정원을 늘리고 싶으면 여기에 'mercenary_3' 같은 이름을 추가하기만 하면 돼요.
// 소환사의 정령('spirit')은 이 목록과 상관없는 별도 슬롯이라 정원에 포함되지 않아요.
const MERCENARY_SLOTS = ['mercenary_0', 'mercenary_1', 'mercenary_2'];

// 플레이어가 경험치를 얻을 때, 함께하는 동료/정령도 그 몇 배만큼 같이 얻을지 정하는 비율이에요.
// 1.0이면 플레이어와 똑같이, 0.5면 절반만 받아요. 동료의 레벨업 기준(레벨x20)이 플레이어(레벨x100)보다
// 훨씬 가벼워서 동료가 너무 빨리 크면 이 값을 낮춰서 조절하면 돼요.
const ALLY_SHARED_EXP_RATIO = 1.0;

// 동료/정령이 전부 똑같이 움직이는 것처럼 보이던 문제를 고치기 위한 "개성" 표예요.
// attackAngleDeg: 같은 몬스터를 공격할 때 몬스터를 중심으로 어느 방향에서 접근할지 (서로 겹치지 않게 분산).
// idlePhase: 대기 중 미세하게 흔들리는 움직임의 위상 (유닛마다 다른 타이밍에 흔들리게).
// speedMod: 이동속도 배율 (0.85~1.15 사이, 유닛별로 조금씩 빠르거나 느리게).
// 동서남북 필드는 마을과 달리 건물/NPC 배치를 신경 쓸 필요가 없는 "완전히 비어있는 전투 공간"이라,
// 여기서는 배치 재정리 대신 공간 자체를 키우고 카메라가 플레이어를 따라다니게(스크롤) 했어요.
// 마을은 건물 좌표가 복잡하게 얽혀있어서 스크롤을 안 썼지만, 필드는 몬스터만 있어서 훨씬 간단해요.
const FIELD_WORLD_WIDTH = 1600;
const FIELD_WORLD_HEIGHT = 1200;
// 마을(과 다른 실내/사냥터/던전 공간)에서 쓰는 원래 월드 경계예요. 필드에서 나갈 때 이 값으로 복원해요.
const VILLAGE_WORLD_BOUNDS = { x: -50, y: -50, width: 900, height: 700 };

const ALLY_PERSONALITY = {
  mercenary_0: { attackAngleDeg: 0, idlePhase: 0, speedMod: 1.08 },
  mercenary_1: { attackAngleDeg: 130, idlePhase: 2.1, speedMod: 0.92 },
  mercenary_2: { attackAngleDeg: 250, idlePhase: 4.2, speedMod: 1.0 },
  spirit: { attackAngleDeg: 60, idlePhase: 1.3, speedMod: 1.15 }
};


export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');

    this.level = 1;
    this.exp = 0;
    this.inventory = {};
    this.statPoints = 0;
    this.skillPoints = 0;
    this.skillLevels = {};
    this.playerClass = null;

    this.primaryStats = { str: 0, vit: 0, agi: 0, int: 0, sen: 0 };
    this.bonusStats = { attack: 0, speed: 0, maxHp: 0, defense: 0, critChance: 0 };

    this.attackPower = 10;
    this.maxHp = 100;
    this.moveSpeed = 200;
    this.hp = 100;
    this.defense = 0;
    this.critChance = 0;
    this.critDamage = 150;
    this.magicPower = 0;
    this.cooldownReduction = 0;
    this.precision = 0;

    this.gold = 0;
    this.dialogueIndex = 0;
    this.lastDialogueNpc = null;
    this.dialogueTimer = null;
    this.gameMinutes = 480;
    this.currentDay = 1;
    this.nightIntensity = 0;

    this.equipped = {};
    EQUIPMENT_SLOTS.forEach(slotInfo => { this.equipped[slotInfo.id] = null; });
    this.equipmentDurability = {};

    this.marketStock = {};
    this.priceHistory = {};

    this.ownedPlots = {};
    this.plantedCrops = {};
    this.farmPlots = {};

    this.rank = 'bronze';
    this.questsCompletedCount = 0;
    this.activeQuestIds = [];

    this.totalMonsterKills = 0;

    this.floorTileSprite = null;
    this.receptionistNpc = null;
    // 집/주점에 들어갈 때마다 새로 만드는 콜라이더들을 기억해두는 배열이에요.
    // 나갈 때 가구/카운터/리나 오브젝트만 destroy하고 이 콜라이더들을 안 지우면,
    // 이미 사라진 대상을 가리키는 "유령 콜라이더"가 계속 쌓여서 물리 엔진 에러의 원인이 돼요.
    this.furnitureColliders = [];

    this.gateObjects = {};
    this.nearbyGate = null;
    this.huntWaveCounts = {};

    this.dungeonGateObjects = {};
    this.nearbyDungeonGate = null;
    this.isInsideDungeon = false;
    this.currentDungeonGate = null;
    this.dungeonWaveRemaining = 0;
    this.dungeonExitGate = null;
    // 출구 문 주변의 빛/글자 오브젝트와 반짝임 트윈이에요. 나갈 때 한꺼번에 정리해야 해서 기억해둬요.
    this.dungeonExitObjects = [];
    this.dungeonExitTween = null;
    this.lastDungeonRemainingShown = -1;

    // 소모품 단축키(1~9, 0=10번) 등록 목록이에요. 칸마다 아이템 id(또는 null)가 들어가요.
    this.hotbar = new Array(10).fill(null);
    this.hotbarKeys = [];

    // 동서남북 별도 필드 관련 상태예요. 던전과 달리 "클리어해야 나감" 조건이 없고,
    // 언제든 H키로 나갈 수 있는 자유로운 공간이에요.
    this.fieldGateObjects = {};
    this.nearbyFieldZone = null;
    this.isInsideField = false;
    this.currentFieldZone = null;

    // 마을 외곽 텃밭 - 밭(FARM_PLOTS)을 전부 여기로 옮겨서, 좁던 마을 중심부에 여유를 줬어요.
    // 던전/필드처럼 완전히 독립된 공간이고, 전투는 없고 밭 작업만 하는 공간이에요.
    this.outskirtsGateObject = null;
    this.nearbyOutskirts = false;
    this.isInsideOutskirts = false;

    // 용병(동료)은 여러 명(MERCENARY_SLOTS 개수만큼), 소환사의 정령은 별도 1칸으로 관리해요.
    // 전부 같은 모양의 상태 객체를 슬롯 이름(mercenary_0, mercenary_1, ..., spirit)으로 들고 있어서,
    // 유닛끼리 서로 정보를 덮어쓰는 일이 없어요.
    this.allies = {};
    this.getAllySlots().forEach(slot => { this.allies[slot] = this.createEmptyAllyState(); });

    this.activeSkillCooldownEndTime = 0;
    this.aoeSkillCooldownEndTime = 0; // R키 광역기 전용 쿨타임 (Q키와 완전히 별개)

    // 도적 은신 관련 상태예요.
    this.rogueAmbushReady = false; // true면 "다음 공격이 기습(무조건 치명타)"으로 처리됨
    this.rogueStealthTimer = null; // 은신 자동 해제 타이머 (새 은신이 옛 타이머에 끊기지 않게 기억해둠)

    this.onStatsUpdate = null;
    this.onShopToggle = null;
    this.onDialogue = null;
    this.onLog = null;
    this.onFarmMenuOpen = null;
    this.onTavernOpen = null;
    this.onCooldownUpdate = null;
    this.onAoeCooldownUpdate = null;

    this.godMode = false;

    this.isPaused = false;
    this.soundVolume = 100;
    this.brightnessPercent = 100;
  }

  // 은신을 푸는 공통 함수예요. 공격 성공/피격/시간 초과/사망 어느 경우든 여기로 모아서,
  // 상태(rogueAmbushReady), 투명도, 자동 해제 타이머를 한 번에 확실히 정리해요.
  breakStealth(message = null) {
    if (this.rogueStealthTimer) {
      this.rogueStealthTimer.remove();
      this.rogueStealthTimer = null;
    }
    if (!this.rogueAmbushReady) return;

    this.rogueAmbushReady = false;
    if (this.player) this.player.setAlpha(1);
    if (message) this.addLog(message, 'info');
  }

  createEmptyAllyState() {
    return {
      id: null,
      sprite: null,
      cls: null,
      level: 1,
      exp: 0,
      hp: 0,
      maxHp: 0,
      isKO: false,
      overlapCollider: null,
      autoSkillTimer: null,
      attackCooldownEnd: 0,
      buffEndTime: 0,
      isSpiritSummon: false,
      bondLevel: 1,
      bondExp: 0,
      bondMaxCelebrated: false,
      lastTalkedDay: 0, // 유대감 "대화하기"를 마지막으로 한 게임 속 날짜 (하루 1회 제한용)
      hitFlashUntil: 0 // 이 시각까지는 HP바가 흰색으로 번쩍여서 "방금 맞았다"는 걸 알려줘요
    };
  }

  getAllySlots() {
    return [...MERCENARY_SLOTS, 'spirit'];
  }

  isMercenarySlot(slot) {
    return MERCENARY_SLOTS.includes(slot);
  }

  // 플레이어 기준으로 각 유닛이 서 있을 자리예요. 용병들은 왼쪽 뒤에 세로로 나란히,
  // 정령은 오른쪽에 서서 여러 유닛이 한 점에 겹치지 않게 해요.
  getAllyFormationOffset(slot) {
    const offsets = {
      mercenary_0: { x: -70, y: 0 },
      mercenary_1: { x: -70, y: 70 },
      mercenary_2: { x: -70, y: -70 },
      spirit: { x: 70, y: 0 }
    };
    return offsets[slot] || { x: -70, y: 0 };
  }

  // 로그에 "동료가"라고만 쓰면 여럿일 때 누군지 모르니, 유닛 이름을 꺼내주는 헬퍼예요.
  getAllyPersonality(slot) {
    return ALLY_PERSONALITY[slot] || { attackAngleDeg: 0, idlePhase: 0, speedMod: 1 };
  }

  getAllyName(slot) {
    const id = this.allies[slot]?.id;
    return (id && COMPANION_TYPES[id]?.name) || '동료';
  }

  preload() {
    this.load.image('player_bg', 'assets/player_init.jpg');

    this.load.spritesheet('player', 'assets/character/character_directions_v2.png', {
      frameWidth: 16, frameHeight: 16
    });

    this.load.spritesheet('npc_villager1', 'assets/npc/npc_villager1.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('npc_villager2', 'assets/npc/npc_villager2.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('npc_villager3', 'assets/npc/npc_villager3.png', { frameWidth: 16, frameHeight: 16 });

    this.load.image('floor_wood', 'assets/tiles/floor_wood.png');
    this.load.image('floor_gray', 'assets/tiles/floor_gray.png');
    this.load.image('furn_couch', 'assets/tiles/furn_couch.png');
    this.load.image('furn_dresser1', 'assets/tiles/furn_dresser1.png');
    this.load.image('furn_dresser2', 'assets/tiles/furn_dresser2.png');
    this.load.image('furn_shelf_green', 'assets/tiles/furn_shelf_green.png');

    Object.keys(ENTITY_TYPES).forEach(key => {
      const info = ENTITY_TYPES[key];
      if (info.renderType !== 'sprite') return;
      this.load.spritesheet(info.spriteIdleKey, `assets/animals/${info.spriteIdleKey}.png`, { frameWidth: 32, frameHeight: 32 });
      this.load.spritesheet(info.spriteRunKey, `assets/animals/${info.spriteRunKey}.png`, { frameWidth: 32, frameHeight: 32 });
    });
  }

  create() {
    this.physics.world.setBounds(
      VILLAGE_WORLD_BOUNDS.x, VILLAGE_WORLD_BOUNDS.y, VILLAGE_WORLD_BOUNDS.width, VILLAGE_WORLD_BOUNDS.height
    );

    SHOP_ITEMS.forEach(item => {
      this.marketStock[item.id] = 10;
      this.priceHistory[item.id] = [];
    });

    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.recordPriceHistory() });

    const savedData = localStorage.getItem('lifeSimSave');
    if (savedData) {
      const data = JSON.parse(savedData);
      this.level = data.level;
      this.exp = data.exp;
      this.hp = data.hp;
      this.maxHp = data.maxHp;
      this.statPoints = data.statPoints;
      this.gold = data.gold;
      this.inventory = data.inventory;

      if (data.gameMinutes !== undefined) this.gameMinutes = data.gameMinutes;
      if (data.currentDay !== undefined) this.currentDay = data.currentDay;
      if (data.equipped !== undefined) this.equipped = { ...this.equipped, ...data.equipped };
      if (data.marketStock !== undefined) this.marketStock = { ...this.marketStock, ...data.marketStock };
      if (data.ownedPlots !== undefined) this.ownedPlots = data.ownedPlots;
      if (data.plantedCrops !== undefined) this.plantedCrops = data.plantedCrops;
      if (data.equipmentDurability !== undefined) this.equipmentDurability = data.equipmentDurability;
      if (data.activeQuestIds !== undefined) this.activeQuestIds = data.activeQuestIds;
      if (data.allies !== undefined) {
        // 예전(용병 1명) 저장 형식의 'mercenary' 키는 첫 번째 용병 슬롯으로 옮겨줘요.
        const savedAllies = { ...data.allies };
        if (savedAllies.mercenary && !savedAllies.mercenary_0) savedAllies.mercenary_0 = savedAllies.mercenary;

        this.getAllySlots().forEach(slot => {
          if (savedAllies[slot]) {
            this.allies[slot] = {
              ...this.createEmptyAllyState(),
              ...savedAllies[slot],
              sprite: null,
              overlapCollider: null,
              autoSkillTimer: null
            };
          }
        });
      } else if (data.hiredCompanionId !== undefined) {
        // 예전 저장 형식(용병 하나만 있던 시절) 호환용 마이그레이션이에요.
        let legacyId = data.hiredCompanionId;
        if (legacyId === 'traveler') legacyId = 'roy';
        this.allies.mercenary_0.id = legacyId;
        this.allies.mercenary_0.cls = data.companionClass ?? null;
        this.allies.mercenary_0.level = data.companionLevel ?? 1;
        this.allies.mercenary_0.exp = data.companionExp ?? 0;
      }
      if (Array.isArray(data.hotbar)) {
        this.hotbar = Array.from({ length: 10 }, (_, i) => data.hotbar[i] ?? null);
      }
      if (data.rank !== undefined) this.rank = data.rank;
      if (data.questsCompletedCount !== undefined) this.questsCompletedCount = data.questsCompletedCount;
      if (data.playerClass !== undefined) this.playerClass = data.playerClass;
      if (data.skillPoints !== undefined) this.skillPoints = data.skillPoints;
      if (data.skillLevels !== undefined) this.skillLevels = data.skillLevels;
      if (data.primaryStats !== undefined) this.primaryStats = data.primaryStats;
      if (data.bonusStats !== undefined) this.bonusStats = data.bonusStats;
      if (data.totalMonsterKills !== undefined) this.totalMonsterKills = data.totalMonsterKills;
    }

    this.recalculateDerivedStats();
    if (savedData) {
      const data = JSON.parse(savedData);
      if (data.hp !== undefined) this.hp = data.hp;
    } else {
      this.hp = this.maxHp;
    }

    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x3a6b2a, 0.3);
    for (let x = 0; x <= 800; x += 40) graphics.lineBetween(x, 0, x, 600);
    for (let y = 0; y <= 600; y += 40) graphics.lineBetween(0, y, 800, y);
    graphics.strokePath();

    Object.keys(ENTITY_TYPES).forEach(key => {
      const info = ENTITY_TYPES[key];
      if (info.renderType !== 'sprite') return;

      this.anims.create({
        key: `${key}-idle`,
        frames: this.anims.generateFrameNumbers(info.spriteIdleKey, { start: 0, end: info.spriteIdleFrames - 1 }),
        frameRate: 6, repeat: -1
      });
      this.anims.create({
        key: `${key}-run`,
        frames: this.anims.generateFrameNumbers(info.spriteRunKey, { start: 0, end: info.spriteRunFrames - 1 }),
        frameRate: 10, repeat: -1
      });
    });

    this.entities = this.add.group();

    for (let i = 0; i < GAME_CONFIG.treeCount; i++) {
      this.entities.add(this.createEntity(Phaser.Math.Between(50, 750), Phaser.Math.Between(50, 550), 'tree'));
    }
    for (let i = 0; i < GAME_CONFIG.stoneCount; i++) {
      this.entities.add(this.createEntity(Phaser.Math.Between(50, 750), Phaser.Math.Between(50, 550), 'stone'));
    }
    for (let i = 0; i < GAME_CONFIG.rabbitCount; i++) {
      this.entities.add(this.createEntity(Phaser.Math.Between(50, 750), Phaser.Math.Between(50, 550), 'rabbit'));
    }
    // 늑대/고블린/도적은 이제 마을 지도가 아니라 동서남북 별도 필드에서만 등장해요
    for (let i = 0; i < GAME_CONFIG.deerCount; i++) {
      this.entities.add(this.createEntity(Phaser.Math.Between(50, 750), Phaser.Math.Between(50, 550), 'deer'));
    }

    this.player = this.add.sprite(400, 300, 'player', 5);
    this.player.setScale(5);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

    this.facingDirection = 'down';
    this.directionFrames = { left: 0, down: 1, up: 2, right: 3, idleLeft: 4, idleDown: 5, idleUp: 6, idleRight: 7 };

    this.getAllySlots().forEach(slot => {
      if (this.allies[slot].id) {
        this.spawnAlly(slot, this.allies[slot].id);
      }
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.eKey = this.input.keyboard.addKey('E');
    this.hKey = this.input.keyboard.addKey('H');
    this.fKey = this.input.keyboard.addKey('F');
    this.qKey = this.input.keyboard.addKey('Q');
    this.rSkillKey = this.input.keyboard.addKey('R'); // 광역(다중 타겟) 스킬 전용 키
    this.gKey = this.input.keyboard.addKey('G');

    // 소모품 단축키 1~9, 0(=10번)이에요. addKey의 두 번째 값(false)은 "브라우저 기본 동작을 막지 않음"이라는
    // 뜻인데, 이걸 안 끄면 Admin 패널의 레벨 입력창 같은 곳에 숫자를 못 치게 되기 때문에 꼭 필요해요.
    const hotbarKeyNames = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];
    this.hotbarKeys = hotbarKeyNames.map(name => this.input.keyboard.addKey(name, false));

    this.physics.add.collider(this.player, this.entities);

    this.physics.add.overlap(this.player, this.entities, (playerObj, entity) => {
      const info = ENTITY_TYPES[entity.entityType];
      if (info.category !== 'hostile_monster' || !entity.active) return;
      if (this.godMode) return;

      const baseDamageForHit = entity.customDamage ?? info.damage;
      const nightMultiplier = this.getNightMonsterMultiplier();
      const rawDamage = Math.round(baseDamageForHit * nightMultiplier);
      const actualDamage = Math.max(1, rawDamage - this.defense);
      this.hp -= actualDamage;
      this.hp = Math.max(0, this.hp);
      this.hpText.setText('HP: ' + this.hp);
      this.addLog(`${info.name}에게 ${actualDamage} 피해를 입음`, 'death');
      this.playHitSound();
      this.breakStealth('공격을 받아 은신이 풀렸어요!');

      if (this.hp <= 0 && !this.isDead) {
        this.isDead = true;
        this.handleDeath(info.name);
      }

      this.syncStatsToReact();
    });

    this.npcs = this.add.group();
    // 마을이 좁아 보인다는 피드백으로 재배치했어요. 밭을 "마을 외곽 텃밭"으로 전부 옮기면서
    // 생긴 중앙 공간을 활용해 건물/NPC/게이트 사이 간격을 전체적으로 넓혔어요.
    const npcPositions = [
      { x: 400, y: 170, type: 'villager1' },
      { x: 220, y: 330, type: 'villager2' },
      { x: 580, y: 330, type: 'villager3' }
    ];
    npcPositions.forEach(pos => {
      this.npcs.add(this.createNpc(pos.x, pos.y, pos.type));
    });
    this.physics.add.collider(this.player, this.npcs);

    this.houses = this.add.group();
    const housePositions = [
      { x: 710, y: 510, type: 'myHouse' },
      { x: 710, y: 90, type: 'house2' },
      { x: 90, y: 510, type: 'house3' },
      { x: 90, y: 90, type: 'house4' }
    ];
    housePositions.push({ x: 560, y: 540, type: 'tavern' });

    housePositions.forEach(pos => {
      this.houses.add(this.createHouse(pos.x, pos.y, pos.type));
    });

    FARM_PLOTS.forEach(plotConfig => {
      this.createFarmPlot(plotConfig);
    });

    this.time.addEvent({
      delay: 5000, loop: true,
      callback: () => { FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id)); }
    });

    HUNTING_GROUNDS.forEach(gateConfig => {
      const rankInfo = HUNTING_GROUND_RANKS[gateConfig.rank];

      const gate = this.add.circle(gateConfig.x, gateConfig.y, 25, rankInfo.color);
      gate.setStrokeStyle(3, 0xffffff, 0.8);

      const label = this.add.text(gateConfig.x, gateConfig.y, gateConfig.rank, {
        fontSize: '18px', color: '#ffffff', fontStyle: 'bold'
      });
      label.setOrigin(0.5);

      this.physics.add.existing(gate, true);
      this.physics.add.collider(this.player, gate);

      this.gateObjects[gateConfig.id] = { config: gateConfig, gateSprite: gate, label };
      this.huntWaveCounts[gateConfig.id] = 0;
    });

    DUNGEONS.forEach(dungeonConfig => {
      const rankInfo = DUNGEON_RANKS[dungeonConfig.rank];

      const gate = this.add.rectangle(dungeonConfig.x, dungeonConfig.y, 50, 50, rankInfo.color);
      gate.setStrokeStyle(3, 0xffffff, 0.9);

      const label = this.add.text(dungeonConfig.x, dungeonConfig.y, dungeonConfig.rank, {
        fontSize: '14px', color: '#ffffff', fontStyle: 'bold'
      });
      label.setOrigin(0.5);

      this.physics.add.existing(gate, true);
      this.physics.add.collider(this.player, gate);

      this.dungeonGateObjects[dungeonConfig.id] = { config: dungeonConfig, gateSprite: gate, label };
    });

    // 동서남북 별도 필드 입구 4개를 마을 지도 가장자리에 배치함
    Object.keys(FIELD_ZONES).forEach(zoneId => {
      const zone = FIELD_ZONES[zoneId];

      const entrance = this.add.circle(zone.entrance.x, zone.entrance.y, 22, zone.color);
      entrance.setStrokeStyle(3, 0xffffff, 0.9);

      const label = this.add.text(zone.entrance.x, zone.entrance.y - 32, zone.name, {
        fontSize: '12px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 4, y: 2 }
      });
      label.setOrigin(0.5);

      this.physics.add.existing(entrance, true);
      this.physics.add.collider(this.player, entrance);

      this.fieldGateObjects[zoneId] = { gateSprite: entrance, label };
    });

    // 마을 외곽 텃밭 입구예요. 밭들을 여기로 옮겨서 마을 중심부를 넓게 쓸 수 있게 했어요.
    const outskirtsZone = VILLAGE_EXTENSIONS.outskirts_farm;
    const outskirtsEntrance = this.add.circle(outskirtsZone.entrance.x, outskirtsZone.entrance.y, 22, outskirtsZone.color);
    outskirtsEntrance.setStrokeStyle(3, 0xffffff, 0.9);

    const outskirtsLabel = this.add.text(outskirtsZone.entrance.x, outskirtsZone.entrance.y - 32, outskirtsZone.name, {
      fontSize: '12px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 4, y: 2 }
    });
    outskirtsLabel.setOrigin(0.5);

    this.physics.add.existing(outskirtsEntrance, true);
    this.physics.add.collider(this.player, outskirtsEntrance);

    this.outskirtsGateObject = { gateSprite: outskirtsEntrance, label: outskirtsLabel };

    // 용병/정령 머리 위에 HP바를 그려줄 Graphics 하나예요. 매 프레임 clear() 후 다시 그리는 방식이라
    // 유닛마다 오브젝트를 만들고 지울 필요가 없어서(=유령 오브젝트 걱정이 없어서) 가장 안전해요.
    this.allyHpBarGraphics = this.add.graphics();
    this.allyHpBarGraphics.setDepth(500);
    this.allyLevelTexts = {}; // 슬롯별 레벨 표시 Text를 재사용하기 위한 캐시예요 (매 프레임 새로 만들지 않음)

    this.hpText = this.add.text(20, 20, 'HP: ' + this.hp, { fontSize: '20px', color: '#ff4444' });
    // 필드에서 카메라가 플레이어를 따라 스크롤하기 때문에, 화면 고정 UI는 명시적으로
    // scrollFactor(0)을 줘야 해요. 이게 빠져있으면 카메라가 움직일 때 HP 글씨도 같이 흘러가요.
    this.hpText.setScrollFactor(0);
    this.hpText.setDepth(1000);

    this.buildingNameText = this.add.text(400, 20, '', {
      fontSize: '22px', color: '#ffd76a', backgroundColor: '#00000099', padding: { x: 12, y: 6 }
    });
    this.buildingNameText.setOrigin(0.5, 0);
    this.buildingNameText.setScrollFactor(0);
    this.buildingNameText.setDepth(1000);
    this.buildingNameText.setVisible(false);

    this.timeText = this.add.text(600, 20, '', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 8, y: 4 }
    });
    this.timeText.setScrollFactor(0);
    this.timeText.setDepth(1000);

    this.nightOverlay = this.add.rectangle(400, 300, 800, 600, 0x000033);
    this.nightOverlay.setScrollFactor(0);
    this.nightOverlay.setDepth(999);
    this.nightOverlay.setAlpha(0);

    this.brightnessOverlay = this.add.rectangle(400, 300, 800, 600, 0x000000);
    this.brightnessOverlay.setScrollFactor(0);
    this.brightnessOverlay.setDepth(998);
    this.brightnessOverlay.setAlpha(0);

    this.isInsideHouse = false;
    this.isDead = false;

    this.syncStatsToReact();
  }

  update(time, delta) {
    if (this.hp <= 0) return;
    if (this.isPaused) return;

    this.updateGameClock(delta);
    this.handleHotbarInput(); // 집 안에서도 포션은 쓸 수 있어야 해서, 실내 분기보다 먼저 처리해요

    if (this.isInsideHouse) {
      this.allyHpBarGraphics.clear();
      Object.values(this.allyLevelTexts).forEach(t => t.setVisible(false));
      this.handleMovement();
      this.checkHouseExit();
      this.handleReceptionistInteract();
      return;
    }

    this.handleMovement();
    this.updateAlliesFollow();
    this.drawAllyHpBars();

    const cooldownRemaining = Math.max(0, this.activeSkillCooldownEndTime - this.time.now);
    if (this.onCooldownUpdate) this.onCooldownUpdate(cooldownRemaining);

    const aoeCooldownRemaining = Math.max(0, this.aoeSkillCooldownEndTime - this.time.now);
    if (this.onAoeCooldownUpdate) this.onAoeCooldownUpdate(aoeCooldownRemaining);

    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      this.useActiveSkill();
    }
    if (Phaser.Input.Keyboard.JustDown(this.rSkillKey)) {
      this.useAoeSkill();
    }

    this.entities.getChildren().forEach(entity => {
      if (!entity.active) return;
      const info = ENTITY_TYPES[entity.entityType];
      if (info.category === 'hostile_monster') {
        const nightMultiplier = this.getNightMonsterMultiplier();
        const effectiveSpeed = entity.customSpeed ?? info.speed;
        const angle = Phaser.Math.Angle.Between(entity.x, entity.y, this.player.x, this.player.y);
        entity.body.setVelocity(
          Math.cos(angle) * effectiveSpeed * nightMultiplier,
          Math.sin(angle) * effectiveSpeed * nightMultiplier
        );

        if (info.renderType === 'sprite') {
          entity.setRotation(angle + Phaser.Math.DegToRad(info.facingOffsetDeg));
          entity.anims.play(`${entity.entityType}-run`, true);

          if (this.nightIntensity > 0.3) {
            entity.setTint(0xff6666);
          } else if (!entity.isBoss) {
            entity.clearTint();
          }
        } else {
          if (this.nightIntensity > 0.3) {
            entity.setFillStyle(0xff2222);
          } else {
            entity.setFillStyle(info.color);
          }
        }
      }
    });

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.entities.getChildren().forEach(entity => {
        if (!entity.active) return;

        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entity.x, entity.y);
        if (distance >= 100) return;

        const info = ENTITY_TYPES[entity.entityType];

        if (info.category === 'resource' || info.category === 'passive_animal') {
          entity.isHarvested = true;
          this.refreshEntityVisual(entity);

          this.addToInventory(entity.entityType);
          this.playSound(info.sound);
          this.gainExp(info.exp);
          this.addLog(`${info.name} +1 획득`, 'gain');

          if (Phaser.Math.Between(1, 100) <= 15) {
            const commonSeeds = ['wheat_seed', 'carrot_seed'];
            const randomIndex = Phaser.Math.Between(0, commonSeeds.length - 1);
            const bonusSeedId = commonSeeds[randomIndex];

            this.addToInventory(bonusSeedId);
            const seedInfo = SHOP_ITEMS.find(i => i.id === bonusSeedId);
            this.addLog(`덤으로 ${seedInfo.name}도 얻었어요!`, 'gain');
          }

          this.createParticleBurst(entity.x, entity.y, info.color);

          setTimeout(() => {
            entity.isHarvested = false;
            this.refreshEntityVisual(entity);
          }, Phaser.Math.Between(5000, 15000));

        } else if (info.category === 'hostile_monster' && this.getPlayerAttackType() === 'melee') {
          const myClassInfo = this.playerClass ? CLASS_TYPES[this.playerClass] : null;
          const isNightBonusActive = myClassInfo?.nightAttackBonus && this.nightIntensity > 0.3;
          let baseAttackPower = this.attackPower + (isNightBonusActive ? myClassInfo.nightAttackBonus : 0);

          // 성직자는 언데드 몬스터에게 공격력 1.6배 + 크리티컬 확률 +25%를 받아요
          const isUndeadTarget = !!info.isUndead;
          let critBonusForThisHit = 0;
          if (this.playerClass === 'priest' && isUndeadTarget) {
            baseAttackPower *= 1.6;
            critBonusForThisHit = 25;
          }

          let damageResult;
          // 도적이 은신 중 "기습 준비"가 된 상태라면, 확률 계산 없이 무조건 치명타 + 추가 배율로 처리함
          if (this.playerClass === 'rogue' && this.rogueAmbushReady) {
            this.breakStealth(); // 기습에 성공하면 은신이 풀리며 다시 또렷하게 보임
            const skill = CLASS_ACTIVE_SKILLS.rogue;
            const ambushDamage = Math.round(baseAttackPower * (this.critDamage / 100) * skill.ambushMultiplier);
            damageResult = { damage: ambushDamage, isCrit: true };
            this.addLog(`기습 공격! ${info.name}에게 ${ambushDamage} 피해`, 'kill');
          } else {
            damageResult = this.calculateDamage(baseAttackPower, critBonusForThisHit);
            this.addLog(
              damageResult.isCrit
                ? `치명타!${isUndeadTarget && this.playerClass === 'priest' ? ' (언데드 특효)' : ''} ${info.name}에게 ${damageResult.damage} 피해`
                : `${info.name}에게 ${damageResult.damage} 피해`,
              'kill'
            );
          }

          entity.hp -= damageResult.damage;

          this.playHitSound();
          this.reduceWeaponDurability();
          this.createAttackSlashEffect(entity.x, entity.y);

          this.getAllySlots().forEach(slot => {
            const ally = this.allies[slot];
            if (!ally.sprite || ally.isKO) return;

            const allyDistance = Phaser.Math.Distance.Between(
              ally.sprite.x, ally.sprite.y, entity.x, entity.y
            );
            if (allyDistance >= 150) return;

            const companionMultiplier = myClassInfo?.companionBonusMultiplier || 1;
            const isBuffActive = this.time.now < ally.buffEndTime;
            const buffMultiplier = isBuffActive ? CLASS_ACTIVE_SKILLS.summoner.buffMultiplier : 1;
            const effectiveAttackBonus = COMPANION_TYPES[ally.id].attackBonus + (ally.level - 1) * 2 + (ally.bondLevel - 1) * BOND_CONFIG.statBonusPerLevel;

            entity.hp -= effectiveAttackBonus * companionMultiplier * buffMultiplier;
          });

          if (entity.hp <= 0) {
            this.defeatMonster(entity, info);
          }
        }
      });

      if (this.getPlayerAttackType() === 'ranged') {
        this.performRangedBasicAttack();
      }
    }

    if (!this.isInsideDungeon && !this.isInsideField && !this.isInsideOutskirts) {
      this.nearbyNpc = null;
      this.npcs.getChildren().forEach(npc => {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
        if (distance < 100) this.nearbyNpc = npc;
      });

      if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.nearbyNpc) {
        const npcType = this.nearbyNpc.npcType;
        const info = NPC_DATA[npcType];

        if (this.lastDialogueNpc !== npcType) {
          this.dialogueIndex = 0;
          this.lastDialogueNpc = npcType;
        }

        if (this.onDialogue) {
          this.onDialogue(info.dialogues[this.dialogueIndex]);
          if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
          this.dialogueTimer = setTimeout(() => { if (this.onDialogue) this.onDialogue(null); }, 3000);
        }
        this.dialogueIndex = (this.dialogueIndex + 1) % info.dialogues.length;

        if (info.hasShop && this.onShopToggle) this.onShopToggle();
      }

      this.nearbyHouse = null;
      this.houses.getChildren().forEach(house => {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, house.x, house.y);
        if (distance < 100) this.nearbyHouse = house;
      });

      if (Phaser.Input.Keyboard.JustDown(this.hKey) && this.nearbyHouse) {
        this.toggleHouse();
      }

      this.nearbyGate = null;
      HUNTING_GROUNDS.forEach(gateConfig => {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, gateConfig.x, gateConfig.y);
        if (distance < 100) this.nearbyGate = gateConfig;
      });

      this.nearbyDungeonGate = null;
      DUNGEONS.forEach(dungeonConfig => {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, dungeonConfig.x, dungeonConfig.y);
        if (distance < 100) this.nearbyDungeonGate = dungeonConfig;
      });

      this.nearbyFieldZone = null;
      Object.keys(FIELD_ZONES).forEach(zoneId => {
        const zone = FIELD_ZONES[zoneId];
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, zone.entrance.x, zone.entrance.y);
        if (distance < 90) this.nearbyFieldZone = zoneId;
      });

      const outskirtsZone = VILLAGE_EXTENSIONS.outskirts_farm;
      this.nearbyOutskirts = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, outskirtsZone.entrance.x, outskirtsZone.entrance.y
      ) < 90;

      if (this.nearbyDungeonGate) {
        const rankInfo = DUNGEON_RANKS[this.nearbyDungeonGate.rank];
        this.buildingNameText.setText(`${rankInfo.name} 입구 (G키로 입장)`);
        this.buildingNameText.setVisible(true);
      } else if (this.nearbyFieldZone) {
        this.buildingNameText.setText(`${FIELD_ZONES[this.nearbyFieldZone].name} 입구 (G키로 입장)`);
        this.buildingNameText.setVisible(true);
      } else if (this.nearbyOutskirts) {
        this.buildingNameText.setText(`${outskirtsZone.name} 입구 (G키로 입장)`);
        this.buildingNameText.setVisible(true);
      } else if (this.nearbyGate) {
        const rankInfo = HUNTING_GROUND_RANKS[this.nearbyGate.rank];
        this.buildingNameText.setText(`${rankInfo.name} 사냥터 게이트 (G키로 입장)`);
        this.buildingNameText.setVisible(true);
      } else {
        this.buildingNameText.setVisible(false);
      }

      if (Phaser.Input.Keyboard.JustDown(this.gKey)) {
        if (this.nearbyDungeonGate) {
          this.enterDungeon(this.nearbyDungeonGate);
        } else if (this.nearbyFieldZone) {
          this.enterField(this.nearbyFieldZone);
        } else if (this.nearbyOutskirts) {
          this.enterOutskirts();
        } else if (this.nearbyGate) {
          this.enterHuntingGround(this.nearbyGate.id);
        }
      }
    } else if (this.isInsideDungeon) {
      this.handleDungeonExit();
    } else if (this.isInsideField) {
      if (Phaser.Input.Keyboard.JustDown(this.hKey)) {
        this.exitField();
      }
    } else if (this.isInsideOutskirts) {
      this.nearbyFarmPlot = null;
      FARM_PLOTS.forEach(plot => {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, plot.x, plot.y);
        if (distance < 80) this.nearbyFarmPlot = plot;
      });

      if (Phaser.Input.Keyboard.JustDown(this.fKey) && this.nearbyFarmPlot) {
        this.handleFarmInteract(this.nearbyFarmPlot.id);
      }

      if (Phaser.Input.Keyboard.JustDown(this.hKey)) {
        this.exitOutskirts();
      }
    }
  }

  handleMovement() {
    let velocityX = 0;
    let velocityY = 0;
    let direction = this.facingDirection;

    if (!this.isKnockedBack) {
      if (this.cursors.left.isDown) { velocityX = -this.moveSpeed; direction = 'left'; }
      else if (this.cursors.right.isDown) { velocityX = this.moveSpeed; direction = 'right'; }

      if (this.cursors.up.isDown) { velocityY = -this.moveSpeed; if (velocityX === 0) direction = 'up'; }
      else if (this.cursors.down.isDown) { velocityY = this.moveSpeed; if (velocityX === 0) direction = 'down'; }

      this.player.body.setVelocity(velocityX, velocityY);

      if (direction !== this.facingDirection) {
        this.player.setFrame(this.directionFrames[direction]);
      }
      this.facingDirection = direction;
    }
  }

  checkHouseExit() {
    if (Phaser.Input.Keyboard.JustDown(this.hKey)) {
      this.toggleHouse();
    }
  }

  handleReceptionistInteract() {
    if (!this.receptionistNpc) return;

    const distance = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.receptionistNpc.x, this.receptionistNpc.y
    );
    if (distance >= 100) return;

    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      const npcType = 'rina';
      const info = NPC_DATA[npcType];

      if (this.lastDialogueNpc !== npcType) {
        this.dialogueIndex = 0;
        this.lastDialogueNpc = npcType;
      }

      if (this.onDialogue) {
        this.onDialogue(info.dialogues[this.dialogueIndex]);
        if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
        this.dialogueTimer = setTimeout(() => { if (this.onDialogue) this.onDialogue(null); }, 3000);
      }
      this.dialogueIndex = (this.dialogueIndex + 1) % info.dialogues.length;
    }
  }

  toggleHouse() {
    if (!this.isInsideHouse) {
      this.currentHouse = this.nearbyHouse;
      const info = BUILDING_TYPES[this.currentHouse.buildingType];

      this.isInsideHouse = true;
      FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));

      this.buildingNameText.setText(info.name);
      this.buildingNameText.setVisible(true);
      this.nearbyGate = null;

      this.setOutdoorObjectsActive(false);

      this.player.x = 400;
      this.player.y = 400;

      if (this.floorTileSprite) this.floorTileSprite.destroy();
      this.floorTileSprite = this.add.tileSprite(400, 300, 800, 600, info.floorTile);
      this.floorTileSprite.setDepth(-1);

      // 이전에 들어왔던 집의 가구/카운터/리나 오브젝트와, 거기 걸려있던 콜라이더를
      // 전부 확실히 정리해요. 콜라이더까지 같이 안 지우면, 이미 사라진 가구를
      // 가리키는 유령 콜라이더가 남아서 물리 엔진 에러의 원인이 돼요.
      this.furnitureObjects = this.furnitureObjects || [];
      this.furnitureObjects.forEach(f => f.destroy());
      this.furnitureObjects = [];
      this.furnitureColliders.forEach(c => c.destroy());
      this.furnitureColliders = [];

      info.furniture.forEach(item => {
        const furniture = this.add.sprite(item.x, item.y, item.spriteKey);
        furniture.setScale(item.scale || 4);
        this.physics.add.existing(furniture, true);
        const collider = this.physics.add.collider(this.player, furniture);
        this.furnitureObjects.push(furniture);
        this.furnitureColliders.push(collider);
      });

      if (info.isTavern) {
        const counter = this.add.rectangle(600, 150, 140, 30, 0x5a3a2a);
        counter.setStrokeStyle(2, 0x3a2416);
        this.physics.add.existing(counter, true);
        const counterCollider = this.physics.add.collider(this.player, counter);
        this.furnitureObjects.push(counter);
        this.furnitureColliders.push(counterCollider);

        const receptionistInfo = NPC_DATA['rina'];
        const receptionist = this.add.sprite(600, 110, receptionistInfo.spriteKey, 1);
        receptionist.setScale(5);
        receptionist.npcType = 'rina';
        this.physics.add.existing(receptionist, true);
        const receptionistCollider = this.physics.add.collider(this.player, receptionist);
        this.furnitureObjects.push(receptionist);
        this.furnitureColliders.push(receptionistCollider);

        this.receptionistNpc = receptionist;

        if (this.onTavernOpen) this.onTavernOpen(true);
      }

    } else {
      this.isInsideHouse = false;
      FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));
      this.cameras.main.setBackgroundColor('#4a7c3c');

      this.buildingNameText.setVisible(false);
      this.receptionistNpc = null;

      this.getAllySlots().forEach(slot => {
        const ally = this.allies[slot];
        if (!ally.sprite) return;
        const offset = this.getAllyFormationOffset(slot);
        ally.sprite.setVisible(true);
        ally.sprite.body.enable = true;
        ally.sprite.x = this.player.x + offset.x;
        ally.sprite.y = this.player.y + offset.y;
      });

      this.setOutdoorObjectsActive(true);

      if (this.floorTileSprite) {
        this.floorTileSprite.destroy();
        this.floorTileSprite = null;
      }

      this.furnitureColliders.forEach(c => c.destroy());
      this.furnitureColliders = [];
      this.furnitureObjects.forEach(f => f.destroy());
      this.furnitureObjects = [];

      this.player.x = this.currentHouse.x;
      this.player.y = this.currentHouse.y + 80;

      if (this.onTavernOpen) this.onTavernOpen(false);
    }
  }

  createHouse(x, y, typeKey) {
    const info = BUILDING_TYPES[typeKey];
    const house = this.add.rectangle(x, y, info.width, info.height, info.color);
    house.buildingType = typeKey;
    this.physics.add.existing(house, true);
    return house;
  }

  createNpc(x, y, npcTypeKey) {
    const info = NPC_DATA[npcTypeKey];

    const npc = this.add.sprite(x, y, info.spriteKey, 1);
    npc.setScale(5);
    npc.npcType = npcTypeKey;

    this.physics.add.existing(npc, true);

    this.tweens.add({
      targets: npc, y: y - 4,
      duration: 700 + Math.random() * 300,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    return npc;
  }

  createEntity(x, y, typeKey) {
    const info = ENTITY_TYPES[typeKey];

    const entity = info.renderType === 'sprite'
      ? this.add.sprite(x, y, info.spriteIdleKey, 0).setScale(info.spriteScale || 1)
      : this.add.circle(x, y, info.radius, info.color);

    entity.entityType = typeKey;
    entity.hp = info.hp;
    entity.maxHp = info.hp;
    entity.isHarvested = false;

    if (info.renderType === 'sprite') {
      entity.play(`${typeKey}-idle`);
    }

    if (info.category === 'resource') {
      this.physics.add.existing(entity, true);
    } else if (info.category === 'passive_animal') {
      this.physics.add.existing(entity);
      entity.body.setCollideWorldBounds(true);
      entity.body.setBounce(1, 1);
      const vx = Phaser.Math.Between(-50, 50);
      const vy = Phaser.Math.Between(-50, 50);
      entity.body.setVelocity(vx, vy);
    } else if (info.category === 'hostile_monster') {
      this.physics.add.existing(entity);
      entity.body.setCollideWorldBounds(true);
    }

    return entity;
  }

  refreshEntityVisual(entity) {
    const shouldHide = this.isIndoors() || entity.isHarvested;

    entity.setVisible(!shouldHide);
    entity.setActive(!shouldHide);
    entity.alpha = shouldHide ? 0 : 1;
    if (entity.body) entity.body.enable = !shouldHide;
  }

  isIndoors() {
    return this.isInsideHouse || this.isInsideDungeon || this.isInsideField || this.isInsideOutskirts;
  }

  setOutdoorObjectsActive(isActive) {
    this.entities.getChildren().forEach(entity => {
      this.refreshEntityVisual(entity);
    });

    [this.houses, this.npcs].forEach(group => {
      group.getChildren().forEach(obj => {
        obj.setVisible(isActive);
        obj.setActive(isActive);
        obj.alpha = isActive ? 1 : 0;
        if (obj.body) obj.body.enable = isActive;
      });
    });

    [this.gateObjects, this.dungeonGateObjects, this.fieldGateObjects].forEach(objMap => {
      Object.values(objMap).forEach(({ gateSprite, label }) => {
        gateSprite.setVisible(isActive);
        gateSprite.body.enable = isActive;
        label.setVisible(isActive);
      });
    });

    if (this.outskirtsGateObject) {
      this.outskirtsGateObject.gateSprite.setVisible(isActive);
      this.outskirtsGateObject.gateSprite.body.enable = isActive;
      this.outskirtsGateObject.label.setVisible(isActive);
    }
  }

  createFarmPlot(plotConfig) {
    const plotSprite = this.add.rectangle(plotConfig.x, plotConfig.y, 60, 60, 0x8a9a7a);
    plotSprite.setStrokeStyle(2, 0x4a3520);

    const priceLabel = this.add.text(plotConfig.x, plotConfig.y - 40, formatCurrency(plotConfig.price), {
      fontSize: '11px', color: '#ffd76a', backgroundColor: '#00000088', padding: { x: 4, y: 2 }
    });
    priceLabel.setOrigin(0.5);

    this.farmPlots[plotConfig.id] = { config: plotConfig, plotSprite, priceLabel, cropSprite: null };

    this.refreshFarmPlotVisual(plotConfig.id);
  }

  // 밭은 이제 마을 외곽 텃밭(isInsideOutskirts)에서만 보여요. 마을/집/던전/필드 등 그 외의
  // 어떤 공간에 있든(과거엔 isIndoors()만 체크했음) 전부 숨겨야, 좌표가 겹쳐도 안 보이고
  // F키로도 상호작용이 안 돼요 (F키 체크 자체도 update()에서 isInsideOutskirts일 때만 돌아가요).
  refreshFarmPlotVisual(plotId) {
    const farmObj = this.farmPlots[plotId];
    if (!farmObj) return;

    if (!this.isInsideOutskirts) {
      farmObj.plotSprite.setVisible(false);
      farmObj.priceLabel.setVisible(false);
      if (farmObj.cropSprite) farmObj.cropSprite.setVisible(false);
      return;
    }

    farmObj.plotSprite.setVisible(true);

    const owned = !!this.ownedPlots[plotId];
    const crop = this.plantedCrops[plotId];

    farmObj.plotSprite.setFillStyle(owned ? 0x6b4a2f : 0x8a9a7a);
    farmObj.priceLabel.setVisible(!owned);

    if (farmObj.cropSprite) {
      farmObj.cropSprite.destroy();
      farmObj.cropSprite = null;
    }

    if (!crop) return;

    const cropInfo = CROP_TYPES[crop.cropType];
    const progress = this.getCropProgress(plotId);

    const radius = 8 + progress * 14;
    const color = progress >= 1 ? 0xffe066 : cropInfo.color;

    farmObj.cropSprite = this.add.circle(farmObj.config.x, farmObj.config.y, radius, color);
  }

  getCropProgress(plotId) {
    const crop = this.plantedCrops[plotId];
    if (!crop) return 0;

    const cropInfo = CROP_TYPES[crop.cropType];
    const nowTotalMinutes = (this.currentDay - 1) * 1440 + this.gameMinutes;
    const elapsedMinutes = nowTotalMinutes - crop.plantedAt;

    return Math.min(1, elapsedMinutes / cropInfo.growMinutes);
  }

  handleFarmInteract(plotId) {
    const plotConfig = FARM_PLOTS.find(p => p.id === plotId);
    const owned = !!this.ownedPlots[plotId];

    if (!owned) {
      if (this.gold < plotConfig.price) {
        this.addLog('골드가 부족해서 밭을 살 수 없어요', 'death');
        return;
      }

      this.gold -= plotConfig.price;
      this.ownedPlots[plotId] = true;
      this.addLog(`밭을 구매했어요! (-${formatCurrency(plotConfig.price)})`, 'gain');
      this.refreshFarmPlotVisual(plotId);
      this.syncStatsToReact();
      return;
    }

    const crop = this.plantedCrops[plotId];
    if (!crop) {
      if (this.onFarmMenuOpen) this.onFarmMenuOpen(plotId);
      return;
    }

    const progress = this.getCropProgress(plotId);

    if (progress >= 1) {
      const cropInfo = CROP_TYPES[crop.cropType];
      const yieldAmount = Phaser.Math.Between(cropInfo.yieldMin, cropInfo.yieldMax);

      if (!this.inventory[crop.cropType]) this.inventory[crop.cropType] = 0;
      this.inventory[crop.cropType] += yieldAmount;

      delete this.plantedCrops[plotId];

      this.addLog(`${cropInfo.name} ${yieldAmount}개 수확했어요!`, 'gain');
      this.refreshFarmPlotVisual(plotId);
      this.syncStatsToReact();
    } else {
      const percent = Math.floor(progress * 100);
      this.addLog(`아직 자라는 중이에요 (${percent}%)`, 'info');
    }
  }

  plantSeed(plotId, seedItemId) {
    if (!this.inventory[seedItemId] || this.inventory[seedItemId] <= 0) return;

    const seedItem = SHOP_ITEMS.find(i => i.id === seedItemId);
    if (!seedItem || seedItem.category !== 'seed') return;

    this.inventory[seedItemId]--;

    this.plantedCrops[plotId] = {
      cropType: seedItem.cropType,
      plantedAt: (this.currentDay - 1) * 1440 + this.gameMinutes
    };

    if (this.onFarmMenuOpen) this.onFarmMenuOpen(null);

    this.addLog(`${seedItem.name} -1 (심음)`, 'info');
    this.refreshFarmPlotVisual(plotId);
    this.syncStatsToReact();
  }

  updateGameClock(delta) {
    const gameMinutesPerRealSecond = 1440 / GAME_CONFIG.dayLengthSeconds;
    this.gameMinutes += gameMinutesPerRealSecond * (delta / 1000);

    if (this.gameMinutes >= 1440) {
      this.gameMinutes -= 1440;
      this.currentDay++;
    }

    const hour = Math.floor(this.gameMinutes / 60);
    const minute = Math.floor(this.gameMinutes % 60);
    this.timeText.setText(`Day ${this.currentDay}  ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);

    this.nightIntensity = this.getNightAlpha(this.gameMinutes / 60);
    const alpha = this.isIndoors() ? 0 : this.nightIntensity;
    this.nightOverlay.setAlpha(alpha);
  }

  getNightAlpha(hour) {
    if (hour >= 8 && hour < 18) return 0;
    if (hour >= 18 && hour < 20) return (hour - 18) / 2 * 0.6;
    if (hour >= 6 && hour < 8) return 0.6 - (hour - 6) / 2 * 0.6;
    return 0.6;
  }

  getNightMonsterMultiplier() {
    return 1 + (this.nightIntensity / 0.6) * 0.5;
  }

  getEdgeSpawnPosition() {
    const side = Phaser.Math.Between(0, 3);
    if (side === 0) return { x: Phaser.Math.Between(0, 800), y: 0 };
    if (side === 1) return { x: 800, y: Phaser.Math.Between(0, 600) };
    if (side === 2) return { x: Phaser.Math.Between(0, 800), y: 600 };
    return { x: 0, y: Phaser.Math.Between(0, 600) };
  }

  saveGame() {
    const saveData = {
      level: this.level, exp: this.exp, hp: this.hp, maxHp: this.maxHp,
      statPoints: this.statPoints, gold: this.gold, inventory: this.inventory,
      gameMinutes: this.gameMinutes, currentDay: this.currentDay, equipped: this.equipped,
      marketStock: this.marketStock,
      ownedPlots: this.ownedPlots, plantedCrops: this.plantedCrops,
      equipmentDurability: this.equipmentDurability,
      activeQuestIds: this.activeQuestIds,
      allies: this.getAllySlots().reduce((acc, slot) => {
        const a = this.allies[slot];
        acc[slot] = {
          id: a.id, cls: a.cls, level: a.level, exp: a.exp,
          bondLevel: a.bondLevel, bondExp: a.bondExp,
          bondMaxCelebrated: a.bondMaxCelebrated, lastTalkedDay: a.lastTalkedDay
        };
        return acc;
      }, {}),
      hotbar: this.hotbar,
      rank: this.rank, questsCompletedCount: this.questsCompletedCount,
      playerClass: this.playerClass,
      skillPoints: this.skillPoints, skillLevels: this.skillLevels,
      primaryStats: this.primaryStats, bonusStats: this.bonusStats,
      totalMonsterKills: this.totalMonsterKills
    };
    localStorage.setItem('lifeSimSave', JSON.stringify(saveData));
  }

  addLog(text, type = 'info') {
    if (this.onLog) this.onLog(text, type);
  }

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
        priceHistory: { ...this.priceHistory },
        marketStock: { ...this.marketStock },
        equipmentDurability: { ...this.equipmentDurability },
        activeQuestIds: [...this.activeQuestIds],
        // 고용한 동료(용병) 목록이에요. 여러 명이라 배열로 내려주고, UI는 이 배열을 그대로 돌려서 그려요.
        mercenaries: MERCENARY_SLOTS
          .filter(slot => this.allies[slot].id)
          .map(slot => {
            const a = this.allies[slot];
            return {
              slot, id: a.id, cls: a.cls, level: a.level, exp: a.exp, hp: a.hp, maxHp: a.maxHp,
              bondLevel: a.bondLevel, bondExp: a.bondExp, bondExpNeeded: a.bondLevel * BOND_CONFIG.expPerLevel,
              canTalkToday: a.lastTalkedDay !== this.currentDay
            };
          }),
        maxMercenaries: MERCENARY_SLOTS.length,
        bondMaxLevel: BOND_CONFIG.maxLevel,
        hotbar: [...this.hotbar],
        // 소환사의 정령은 용병과 완전히 별개 유닛이라 새 키로 따로 내려줘요.
        // (화면에 표시하려면 UI 쪽에도 이 키들을 읽는 코드가 추가로 필요해요)
        spiritCompanionId: this.allies.spirit.id,
        spiritLevel: this.allies.spirit.level,
        spiritExp: this.allies.spirit.exp,
        spiritBondLevel: this.allies.spirit.bondLevel,
        spiritBondExp: this.allies.spirit.bondExp,
        spiritBondExpNeeded: this.allies.spirit.bondLevel * BOND_CONFIG.expPerLevel,
        spiritCanTalkToday: this.allies.spirit.lastTalkedDay !== this.currentDay,
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
        precision: this.precision,
        totalMonsterKills: this.totalMonsterKills
      });
    }
    this.saveGame();
  }

  addToInventory(itemId) {
    if (!this.inventory[itemId]) this.inventory[itemId] = 0;
    this.inventory[itemId]++;
    this.syncStatsToReact();
  }

  gainExp(amount) {
    this.addLog(`+${amount} EXP`, 'gain');
    this.exp += amount;

    // 함께하는 동료(용병들)와 정령도 같이 경험치를 나눠 받아요. 각자 성격(expBonus 등)은
    // gainAllyExp 안에서 그대로 적용되고, 마지막에 아래 syncStatsToReact() 한 번으로 화면에 반영해요.
    const sharedExp = Math.round(amount * ALLY_SHARED_EXP_RATIO);
    if (sharedExp > 0) {
      this.getAllySlots().forEach(slot => {
        if (this.allies[slot].id) this.gainAllyExp(slot, sharedExp, true);
      });
    }

    const expNeeded = this.level * 100;

    if (this.exp >= expNeeded) {
      this.exp -= expNeeded;
      this.level++;
      this.hp = this.maxHp;
      this.statPoints++;
      this.skillPoints++;
      this.hpText.setText('HP: ' + this.hp);

      if (this.playerClass) {
        const mySkills = CLASS_SKILLS[this.playerClass] || [];
        mySkills.forEach(skill => {
          if (skill.unlockCondition?.type === 'level' && this.level === skill.unlockCondition.value) {
            this.addLog(`새 스킬 해금: ${skill.name}!`, 'gain');
            this.createSkillUnlockEffect(this.player.x, this.player.y);
          }
        });
      }

      this.addLog(`레벨업! Lv.${this.level}`, 'gain');
      this.createParticleBurst(this.player.x, this.player.y, 0xffff00, 16);
    }

    this.syncStatsToReact();
  }

  recalculateDerivedStats() {
    const s = this.primaryStats;
    const oldMaxHp = this.maxHp;

    // 동료/정령과 쌓은 유대감(Bond)도 플레이어 스탯에 소량 반영돼요. bonusStats처럼 누적시키지 않고
    // 매번 현재 동료들의 유대 레벨을 합산해서 새로 계산하기 때문에, 동료를 해고해도 보너스가 저절로 빠져요.
    let bondAttackBonus = 0;
    let bondDefenseBonus = 0;
    this.getAllySlots().forEach(slot => {
      const ally = this.allies[slot];
      if (!ally.id) return;
      const bonus = (ally.bondLevel - 1) * BOND_CONFIG.statBonusPerLevel;
      bondAttackBonus += bonus;
      bondDefenseBonus += bonus;
    });

    this.attackPower = 10 + s.str * 2 + this.bonusStats.attack + bondAttackBonus;
    this.maxHp = 100 + s.vit * 8 + this.bonusStats.maxHp;
    this.moveSpeed = 200 + this.bonusStats.speed;
    this.defense = s.vit * 1 + this.bonusStats.defense + bondDefenseBonus;
    this.critChance = Math.min(50, s.agi * 0.5 + this.bonusStats.critChance);
    this.critDamage = 150 + s.agi * 2;
    this.magicPower = s.int * 1;
    this.cooldownReduction = Math.min(40, s.int * 0.5);
    this.precision = s.sen * 1;

    const deltaHp = this.maxHp - oldMaxHp;
    if (deltaHp > 0) this.hp += deltaHp;
    this.hp = Math.min(this.hp, this.maxHp);

    if (this.hpText) this.hpText.setText('HP: ' + this.hp);
  }

  investStat(statType) {
    if (this.statPoints <= 0) return;
    if (!(statType in this.primaryStats)) return;

    this.statPoints--;
    this.primaryStats[statType]++;
    this.recalculateDerivedStats();

    this.syncStatsToReact();
  }

  // critChanceBonus를 추가로 받을 수 있게 확장했어요 (성직자의 언데드 특효에서 사용).
  // 기본값 0을 줘서, 안 넘기면 예전이랑 완전히 똑같이 동작해요.
  calculateDamage(baseAttackPower, critChanceBonus = 0) {
    const minPercent = Math.min(130, 70 + this.precision) / 100;
    const maxPercent = 1.3;

    const variance = minPercent + Math.random() * (maxPercent - minPercent);
    let damage = baseAttackPower * variance;

    const effectiveCritChance = Math.min(100, this.critChance + critChanceBonus);
    const isCrit = Math.random() * 100 < effectiveCritChance;
    if (isCrit) damage *= (this.critDamage / 100);

    return { damage: Math.max(1, Math.round(damage)), isCrit };
  }

  chooseClass(classId) {
    if (this.playerClass) return;

    const classInfo = CLASS_TYPES[classId];
    if (!classInfo) return;

    this.playerClass = classId;
    this.primaryStats = { ...classInfo.primaryStats };

    this.recalculateDerivedStats();
    this.hp = this.maxHp;
    if (this.hpText) this.hpText.setText('HP: ' + this.hp);

    this.addLog(`${classInfo.name}(으)로 용병 등록을 마쳤어요!`, 'gain');
    this.syncStatsToReact();
  }

  adminSetLevel(newLevel) {
    const level = Math.max(1, Math.floor(Number(newLevel)));
    if (isNaN(level)) return;

    this.level = level;
    this.exp = 0;

    this.addLog(`GM: 레벨이 ${level}(으)로 변경됐어요`, 'info');
    this.syncStatsToReact();
  }

  adminSetClass(classId) {
    const classInfo = CLASS_TYPES[classId];
    if (!classInfo) return;

    this.playerClass = classId;
    this.primaryStats = { ...classInfo.primaryStats };

    this.recalculateDerivedStats();
    this.hp = this.maxHp;
    if (this.hpText) this.hpText.setText('HP: ' + this.hp);

    this.addLog(`GM: 직업이 ${classInfo.name}(으)로 변경됐어요`, 'info');
    this.syncStatsToReact();
  }

  getItemDisplayNameForLog(itemId) {
    const shopItem = SHOP_ITEMS.find(i => i.id === itemId);
    if (shopItem) return shopItem.name;
    const entityItem = ENTITY_TYPES[itemId];
    if (entityItem) return entityItem.name;
    return itemId;
  }

  acceptQuest(questId) {
    if (this.activeQuestIds.includes(questId)) return;

    const quest = QUEST_TEMPLATES.find(q => q.id === questId);
    if (!quest) return;

    const myRankOrder = RANK_TIERS.find(r => r.id === this.rank).order;
    const requiredRankOrder = RANK_TIERS.find(r => r.id === quest.minRank).order;

    if (myRankOrder < requiredRankOrder) {
      this.addLog('등급이 부족해서 받을 수 없는 의뢰예요', 'info');
      return;
    }

    this.activeQuestIds.push(questId);
    this.addLog(`퀘스트 수락: ${quest.name}`, 'info');
    this.syncStatsToReact();
  }

  turnInQuest(questId) {
    if (!this.activeQuestIds.includes(questId)) return;

    const quest = QUEST_TEMPLATES.find(q => q.id === questId);
    if (!quest) return;

    const haveCount = this.inventory[quest.targetId] || 0;
    if (haveCount < quest.targetCount) {
      this.addLog('아직 조건을 다 채우지 못했어요', 'info');
      return;
    }

    this.inventory[quest.targetId] -= quest.targetCount;
    if (this.inventory[quest.targetId] <= 0) delete this.inventory[quest.targetId];
    this.addLog(`${this.getItemDisplayNameForLog(quest.targetId)} -${quest.targetCount} (퀘스트 제출)`, 'info');

    this.gold += quest.rewardGold;
    this.activeQuestIds = this.activeQuestIds.filter(id => id !== questId);
    this.questsCompletedCount++;

    this.addLog(`퀘스트 완료: ${quest.name} (+${formatCurrency(quest.rewardGold)})`, 'gain');
    this.gainExp(quest.rewardExp);
  }

  takeExam() {
    const myRankOrder = RANK_TIERS.find(r => r.id === this.rank).order;
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

  upgradeSkill(skillId) {
    if (!this.playerClass) return;
    if (this.skillPoints <= 0) {
      this.addLog('스킬 포인트가 부족해요', 'info');
      return;
    }

    const mySkills = CLASS_SKILLS[this.playerClass] || [];
    const skill = mySkills.find(s => s.id === skillId);
    if (!skill) return;

    if (!this.isSkillUnlocked(skill)) {
      this.addLog('아직 해금되지 않은 스킬이에요', 'info');
      return;
    }

    const currentLevel = this.skillLevels[skillId] || 0;
    if (currentLevel >= skill.maxLevel) {
      this.addLog('이미 최대 레벨이에요', 'info');
      return;
    }

    this.skillPoints--;
    this.skillLevels[skillId] = currentLevel + 1;

    if (skill.effectType === 'attack') this.bonusStats.attack += skill.effectPerLevel;
    else if (skill.effectType === 'speed') this.bonusStats.speed += skill.effectPerLevel;
    else if (skill.effectType === 'maxHp') this.bonusStats.maxHp += skill.effectPerLevel;
    else if (skill.effectType === 'defense') this.bonusStats.defense += skill.effectPerLevel;
    else if (skill.effectType === 'critChance') this.bonusStats.critChance += skill.effectPerLevel;

    this.recalculateDerivedStats();
    this.createParticleBurst(this.player.x, this.player.y, 0xffd76a, 10);

    this.addLog(`${skill.name} 레벨 ${this.skillLevels[skillId]}!`, 'gain');
    this.syncStatsToReact();
  }

  isSkillUnlocked(skill) {
    const condition = skill.unlockCondition;
    if (!condition || condition.type === 'always') return true;
    if (condition.type === 'level') return this.level >= condition.value;
    if (condition.type === 'kills') return this.totalMonsterKills >= condition.value;
    return false;
  }

  checkNewlyUnlockedSkills() {
    if (!this.playerClass) return;
    const mySkills = CLASS_SKILLS[this.playerClass] || [];

    mySkills.forEach(skill => {
      if (skill.unlockCondition?.type === 'kills' && this.totalMonsterKills === skill.unlockCondition.value) {
        this.addLog(`새 스킬 해금: ${skill.name}!`, 'gain');
        this.createSkillUnlockEffect(this.player.x, this.player.y);
      }
    });
  }

  equipItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || item.category !== 'equipment') return;
    if (!this.inventory[itemId] || this.inventory[itemId] <= 0) return;

    const slot = item.slot;
    if (this.equipped[slot]) {
      this.applyEquipEffect(this.equipped[slot], -1);
    }
    this.equipped[slot] = itemId;
    this.applyEquipEffect(itemId, 1);

    if (this.equipmentDurability[itemId] === undefined) {
      this.equipmentDurability[itemId] = item.maxDurability;
    }

    this.syncStatsToReact();
  }

  unequipItem(slot) {
    const itemId = this.equipped[slot];
    if (!itemId) return;

    this.applyEquipEffect(itemId, -1);
    this.equipped[slot] = null;

    this.syncStatsToReact();
  }

  applyEquipEffect(itemId, direction) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    if (item.effectType === 'attack') this.bonusStats.attack += item.effectValue * direction;
    else if (item.effectType === 'speed') this.bonusStats.speed += item.effectValue * direction;
    else if (item.effectType === 'maxHp') this.bonusStats.maxHp += item.effectValue * direction;
    else if (item.effectType === 'defense') this.bonusStats.defense += item.effectValue * direction;
    else if (item.effectType === 'critChance') this.bonusStats.critChance += item.effectValue * direction;

    this.recalculateDerivedStats();
  }

  reduceWeaponDurability() {
    const itemId = this.equipped.weapon;
    if (!itemId) return;
    if (this.equipmentDurability[itemId] === undefined) return;

    this.equipmentDurability[itemId]--;

    if (this.equipmentDurability[itemId] <= 0) {
      const item = SHOP_ITEMS.find(i => i.id === itemId);

      this.applyEquipEffect(itemId, -1);
      this.equipped.weapon = null;
      delete this.equipmentDurability[itemId];

      if (this.inventory[itemId]) {
        this.inventory[itemId]--;
        if (this.inventory[itemId] <= 0) delete this.inventory[itemId];
      }

      this.addLog(`${item.name}이(가) 부서졌어요!`, 'death');
    }

    this.syncStatsToReact();
  }

  repairItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || item.category !== 'equipment') return;

    const currentDurability = this.equipmentDurability[itemId];
    if (currentDurability === undefined || currentDurability >= item.maxDurability) return;

    const missing = item.maxDurability - currentDurability;
    const cost = Math.max(1, Math.round(item.basePrice * 0.5 * (missing / item.maxDurability)));

    if (this.gold < cost) {
      this.addLog('골드가 부족해서 수리할 수 없어요', 'death');
      return;
    }

    this.gold -= cost;
    this.equipmentDurability[itemId] = item.maxDurability;

    this.addLog(`${item.name} 수리 완료! (-${formatCurrency(cost)})`, 'gain');
    this.syncStatsToReact();
  }

  restAtTavern() {
    this.hp = this.maxHp;
    this.hpText.setText('HP: ' + this.hp);
    this.addLog('푹 쉬어서 체력을 모두 회복했어요', 'gain');
    this.syncStatsToReact();
  }

  recordPriceHistory() {
    const maxHistoryLength = 30;

    SHOP_ITEMS.forEach(item => {
      const currentPrice = this.getMarketPrice(item.id);
      this.priceHistory[item.id].push(currentPrice);
      if (this.priceHistory[item.id].length > maxHistoryLength) {
        this.priceHistory[item.id].shift();
      }
    });
  }

  getMarketPrice(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return 0;

    if (item.unlimitedStock) return item.basePrice;

    const baselineStock = 10;
    const stock = this.marketStock[itemId] ?? baselineStock;
    const multiplier = Math.min(2.5, Math.max(0.4, baselineStock / Math.max(stock, 1)));

    return Math.max(1, Math.round(item.basePrice * multiplier));
  }

  buyItem(itemId, quantity = 1) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    let boughtCount = 0;
    let totalSpent = 0;

    for (let i = 0; i < quantity; i++) {
      if (!item.unlimitedStock) {
        const currentStock = this.marketStock[itemId] ?? 10;
        if (currentStock <= 0) break;
      }

      const price = this.getMarketPrice(itemId);
      if (this.gold < price) break;

      this.gold -= price;
      totalSpent += price;

      if (!item.unlimitedStock) {
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

  sellItem(itemId, quantity = 1) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || !this.inventory[itemId]) return;

    const sellCount = Math.min(quantity, this.inventory[itemId]);
    if (sellCount <= 0) return;

    let totalEarned = 0;
    for (let i = 0; i < sellCount; i++) {
      const price = this.getMarketPrice(itemId);
      totalEarned += price;
      this.marketStock[itemId] = (this.marketStock[itemId] ?? 10) + 1;
    }

    this.inventory[itemId] -= sellCount;
    this.gold += totalEarned;

    this.addLog(`${item.name} ${sellCount}개 판매 (+${formatCurrency(totalEarned)})`, 'gain');
    this.syncStatsToReact();
  }

  // 숫자키를 눌렀는지 확인해서 해당 칸의 아이템을 써요.
  // 입력창/선택창에 글자를 치는 중이면(예: Admin 패널 레벨 입력) 단축키로 오작동하지 않게 무시해요.
  handleHotbarInput() {
    const active = document.activeElement;
    const isTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);

    this.hotbarKeys.forEach((key, index) => {
      if (!Phaser.Input.Keyboard.JustDown(key)) return;
      if (isTyping) return;
      this.useHotbarSlot(index);
    });
  }

  // index는 0~9 (화면에 보이는 번호는 1~9, 0). 키보드와 화면 클릭 둘 다 이 함수를 써요.
  useHotbarSlot(index) {
    const label = (index + 1) % 10;
    const itemId = this.hotbar[index];

    if (!itemId) {
      this.addLog(`단축키 ${label}번이 비어있어요`, 'info');
      return;
    }

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    if (!this.inventory[itemId] || this.inventory[itemId] <= 0) {
      this.addLog(`${item.name}이(가) 없어요`, 'info');
      return;
    }

    // 체력이 가득인데 회복 아이템을 눌러서 헛되이 소모하는 일이 없게 막아줘요
    if (item.effectType === 'heal' && this.hp >= this.maxHp) {
      this.addLog('체력이 이미 가득해요', 'info');
      return;
    }

    this.useItem(itemId, 1);
  }

  // 단축키 칸에 소모품을 등록해요. 같은 아이템이 다른 칸에 이미 있으면 그쪽은 비우고 옮겨와요.
  setHotbarSlot(index, itemId) {
    if (!Number.isInteger(index) || index < 0 || index > 9) return;

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || item.category !== 'consumable') return;

    this.hotbar = this.hotbar.map(id => (id === itemId ? null : id));
    this.hotbar[index] = itemId;

    this.addLog(`${item.name}을(를) 단축키 ${(index + 1) % 10}번에 등록했어요`, 'info');
    this.syncStatsToReact();
  }

  clearHotbarSlot(index) {
    if (!Number.isInteger(index) || index < 0 || index > 9) return;
    if (!this.hotbar[index]) return;

    this.hotbar[index] = null;
    this.syncStatsToReact();
  }

  useItem(itemId, quantity = 1) {
    if (!this.inventory[itemId] || this.inventory[itemId] <= 0) return;

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item || item.category !== 'consumable') return;

    const useQty = Math.min(quantity, this.inventory[itemId]);
    this.inventory[itemId] -= useQty;

    if (item.effectType === 'heal') {
      const healedAmount = Math.min(this.maxHp - this.hp, item.effectValue * useQty);
      this.hp = Math.min(this.maxHp, this.hp + item.effectValue * useQty);
      this.hpText.setText('HP: ' + this.hp);
      this.addLog(`${item.name} ${useQty}개 사용 (HP +${healedAmount})`, 'gain');
    } else {
      this.addLog(`${item.name} ${useQty}개 사용`, 'info');
    }

    this.syncStatsToReact();
  }

  hireCompanion(companionId) {
    const info = COMPANION_TYPES[companionId];
    if (!info || info.isSpiritSummon) return;

    // 같은 사람을 두 번 고용할 수는 없어요 (로이가 둘이 되면 이상하니까요)
    if (MERCENARY_SLOTS.some(slot => this.allies[slot].id === companionId)) {
      this.addLog(`${info.name}은(는) 이미 함께하고 있어요`, 'info');
      return;
    }

    const freeSlot = MERCENARY_SLOTS.find(slot => !this.allies[slot].id);
    if (!freeSlot) {
      this.addLog(`동료는 최대 ${MERCENARY_SLOTS.length}명까지 데리고 다닐 수 있어요. 먼저 해고해주세요`, 'info');
      return;
    }

    if (this.gold < info.hireCost) {
      this.addLog('골드가 부족해서 고용할 수 없어요', 'death');
      return;
    }

    this.gold -= info.hireCost;

    const classIds = Object.keys(CLASS_TYPES);
    const assignedClass = classIds[Phaser.Math.Between(0, classIds.length - 1)];

    this.spawnAlly(freeSlot, companionId, { cls: assignedClass });

    const assignedClassInfo = CLASS_TYPES[assignedClass];
    this.addLog(`${info.name}을(를) 고용했어요! (${assignedClassInfo.icon} ${assignedClassInfo.name})`, 'gain');
    if (info.hireLine) this.addLog(info.hireLine, 'info');
    this.syncStatsToReact();
  }

  // slot은 'mercenary_0' 같은 슬롯 이름이에요. 여러 명 중 누구를 해고할지 알려줘야 해서 필수예요.
  dismissCompanion(slot) {
    if (!this.isMercenarySlot(slot)) return;
    this.dismissAlly(slot, '동료');
  }

  dismissSpirit() {
    this.dismissAlly('spirit', '정령');
  }

  dismissAlly(slot, fallbackName = '동료') {
    const ally = this.allies[slot];
    if (!ally.id) return;

    const info = COMPANION_TYPES[ally.id] || { name: fallbackName };

    if (ally.overlapCollider) {
      ally.overlapCollider.destroy();
      ally.overlapCollider = null;
    }

    if (ally.sprite) {
      ally.sprite.destroy();
      ally.sprite = null;
    }

    if (ally.autoSkillTimer) {
      ally.autoSkillTimer.remove();
      ally.autoSkillTimer = null;
    }

    this.allies[slot] = this.createEmptyAllyState();

    this.addLog(`${info.name}과(와) 헤어졌어요`, 'info');
    this.syncStatsToReact();
  }

  spawnAlly(slot, companionId, options = {}) {
    const info = COMPANION_TYPES[companionId];
    if (!info) return;

    const ally = this.allies[slot];

    // level/exp는 여기서 덮어쓰지 않아요. 새로 고용/소환할 때는 슬롯이 비어있어서 기본값(1/0)이고,
    // 저장 데이터를 불러와 다시 소환할 때는 저장된 레벨/경험치가 그대로 유지돼야 하니까요.
    ally.id = companionId;
    ally.cls = options.cls !== undefined ? options.cls : ally.cls;
    ally.maxHp = info.maxHp + (ally.level - 1) * 10; // 레벨업마다 최대체력 +10이 붙는 규칙과 맞춤
    ally.hp = ally.maxHp;
    ally.isKO = false;
    ally.isSpiritSummon = !!info.isSpiritSummon;
    ally.buffEndTime = 0;
    ally.attackCooldownEnd = 0;

    // 슬롯마다 위치를 살짝 다르게 잡아서(용병은 왼쪽, 정령은 오른쪽) 두 유닛이
    // 서로 완전히 겹쳐서 소환되지 않게 해요.
    const spawnOffset = this.getAllyFormationOffset(slot);
    const spawnX = this.player.x + spawnOffset.x;
    const spawnY = this.player.y + spawnOffset.y;

    if (info.isSpiritSummon) {
      // 정령은 사람 그림이 아니라 색깔 있는 원으로 표현해요 (몬스터를 닮은 정령이라는 느낌)
      ally.sprite = this.add.circle(spawnX, spawnY, info.radius, info.color);
    } else {
      ally.sprite = this.add.sprite(spawnX, spawnY, info.spriteKey, 1);
      ally.sprite.setScale(5);
      if (info.tintColor) ally.sprite.setTint(info.tintColor);
    }

    this.physics.add.existing(ally.sprite);
    ally.sprite.body.setCollideWorldBounds(true);

    // 이전 유닛(이 슬롯)을 가리키던 콜라이더가 남아있다면 먼저 확실히 지워요.
    // 이 정리를 빼먹으면, 해고→재고용을 반복할 때마다 이미 사라진 유닛을 가리키는
    // "유령 콜라이더"가 계속 쌓여서 물리 엔진이 undefined를 읽으려다 에러가 나요.
    if (ally.overlapCollider) {
      ally.overlapCollider.destroy();
      ally.overlapCollider = null;
    }

    ally.overlapCollider = this.physics.add.overlap(ally.sprite, this.entities, (allyObj, entity) => {
      const info2 = ENTITY_TYPES[entity.entityType];
      if (info2.category !== 'hostile_monster' || !entity.active) return;
      if (ally.isKO) return;

      const companionInfo = COMPANION_TYPES[ally.id];
      const reductionPercent = companionInfo?.trait?.type === 'damageReduction' ? companionInfo.trait.value : 0;
      const actualDamage = Math.round(info2.damage * (1 - reductionPercent / 100));

      ally.hp -= actualDamage;
      ally.hitFlashUntil = this.time.now + 250; // 0.25초 동안 HP바가 하얗게 번쩍여요
      this.addLog(`${this.getAllyName(slot)}이(가) ${info2.name}에게 ${actualDamage} 피해를 입음`, 'death');

      if (ally.hp <= 0) {
        this.handleAllyKO(slot);
      }
    });

    this.startAllyAutoSkillTimer(slot);
  }

  handleAllyKO(slot) {
    const ally = this.allies[slot];
    ally.isKO = true;
    ally.sprite.setVisible(false);
    ally.sprite.body.enable = false;

    this.addLog(`${this.getAllyName(slot)}이(가) 쓰러졌어요...`, 'death');

    this.time.delayedCall(15000, () => {
      if (!ally.sprite) return;
      ally.isKO = false;
      ally.hp = ally.maxHp;
      ally.sprite.setVisible(true);
      ally.sprite.body.enable = true;
      const reviveOffset = this.getAllyFormationOffset(slot);
      ally.sprite.x = this.player.x + reviveOffset.x;
      ally.sprite.y = this.player.y + reviveOffset.y;
      this.addLog(`${this.getAllyName(slot)}이(가) 다시 일어났어요`, 'gain');
    });
  }

  // 용병/정령 머리 위에 작은 HP바 + 레벨 표시를 그려요. 쓰러진(KO) 유닛은 스프라이트가 숨겨져
  // 있으니 바도 안 그려요. 색은 체력 비율에 따라 초록(60%↑) → 노랑(30%↑) → 빨강으로 바뀌고,
  // 방금 맞았으면(hitFlashUntil) 0.25초간 하얗게 번쩍여서 피격을 더 잘 느끼게 해요.
  drawAllyHpBars() {
    const g = this.allyHpBarGraphics;
    g.clear();

    const barWidth = 44;
    const barHeight = 6;

    this.getAllySlots().forEach(slot => {
      const ally = this.allies[slot];
      const levelText = this.allyLevelTexts[slot];

      if (!ally.sprite || ally.isKO || ally.maxHp <= 0) {
        if (levelText) levelText.setVisible(false);
        return;
      }

      const ratio = Phaser.Math.Clamp(ally.hp / ally.maxHp, 0, 1);
      const x = ally.sprite.x - barWidth / 2;
      const y = ally.sprite.y - ally.sprite.displayHeight / 2 - 12;

      const isFlashing = this.time.now < ally.hitFlashUntil;
      // 번쩍이는 동안엔 100ms 간격으로 하양/원래색을 교대해서 "깜빡"거리는 느낌을 줘요
      const baseColor = ratio > 0.6 ? 0x4caf50 : ratio > 0.3 ? 0xffc107 : 0xf44336;
      const blink = isFlashing && Math.floor(this.time.now / 100) % 2 === 0;
      const fillColor = blink ? 0xffffff : baseColor;

      g.fillStyle(0x000000, 0.7);
      g.fillRect(x - 1, y - 1, barWidth + 2, barHeight + 2);
      g.fillStyle(fillColor, 1);
      g.fillRect(x, y, barWidth * ratio, barHeight);

      // 레벨 텍스트는 바 오른쪽에 작게 표시해요. 슬롯당 하나씩만 만들어서 재사용해요.
      if (!levelText) {
        const newText = this.add.text(0, 0, '', { fontSize: '10px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 2, y: 0 } });
        newText.setDepth(500);
        this.allyLevelTexts[slot] = newText;
      }
      const text = this.allyLevelTexts[slot];
      text.setText(`Lv.${ally.level}`);
      text.setPosition(x + barWidth + 3, y - 2);
      text.setVisible(true);
    });
  }

  updateAlliesFollow() {
    this.getAllySlots().forEach(slot => this.updateAllyFollow(slot));
  }

  updateAllyFollow(slot) {
    const ally = this.allies[slot];
    if (!ally.sprite || ally.isKO) return;

    // 유닛마다 다른 "개성"(공격 접근 각도/흔들림 위상/이동속도 배율)을 적용해서, 여러 동료가
    // 있어도 전부 같은 궤적으로 똑같이 움직이는 게 아니라 각자 다르게 움직이도록 해요.
    const personality = this.getAllyPersonality(slot);
    const speedMod = personality.speedMod;

    const lowHpThreshold = ally.maxHp * 0.3;
    const isLowHp = ally.hp < lowHpThreshold;

    if (isLowHp) {
      const nearbyThreat = this.findNearestMonster(120, ally.sprite.x, ally.sprite.y);
      if (nearbyThreat) {
        const fleeAngle = Phaser.Math.Angle.Between(nearbyThreat.x, nearbyThreat.y, ally.sprite.x, ally.sprite.y);
        ally.sprite.body.setVelocity(Math.cos(fleeAngle) * 190 * speedMod, Math.sin(fleeAngle) * 190 * speedMod);
        this.updateAllyFacing(slot, ally.sprite.x + Math.cos(fleeAngle), ally.sprite.y + Math.sin(fleeAngle));
        return;
      }
    }

    const threatToPlayer = this.findNearestMonster(180, this.player.x, this.player.y);
    const nearbyTarget = threatToPlayer || this.findNearestMonster(220, ally.sprite.x, ally.sprite.y);

    if (nearbyTarget) {
      // 모든 동료가 몬스터의 정중앙을 향해 일직선으로 달려가면 한 점에 겹쳐서 "다같이 똑같이
      // 움직이는" 것처럼 보여요. 그 대신 유닛별 각도(attackAngleDeg)만큼 몬스터 주위를 돌아
      // 각자 다른 방향에서 접근하는 지점을 목표로 삼아요.
      const angleRad = Phaser.Math.DegToRad(personality.attackAngleDeg);
      const attackRange = 55;
      const approachX = nearbyTarget.x + Math.cos(angleRad) * (attackRange * 0.6);
      const approachY = nearbyTarget.y + Math.sin(angleRad) * (attackRange * 0.6);

      const distanceToApproach = Phaser.Math.Distance.Between(ally.sprite.x, ally.sprite.y, approachX, approachY);

      if (distanceToApproach > 10) {
        const angle = Phaser.Math.Angle.Between(ally.sprite.x, ally.sprite.y, approachX, approachY);
        ally.sprite.body.setVelocity(Math.cos(angle) * 200 * speedMod, Math.sin(angle) * 200 * speedMod);
        this.updateAllyFacing(slot, nearbyTarget.x, nearbyTarget.y);
      } else {
        ally.sprite.body.setVelocity(0, 0);
        this.updateAllyFacing(slot, nearbyTarget.x, nearbyTarget.y);

        if (this.time.now >= ally.attackCooldownEnd) {
          this.allyBasicAttack(slot, nearbyTarget);
          ally.attackCooldownEnd = this.time.now + 1000;
        }
      }
      return;
    }

    // 슬롯마다 따라다니는 위치를 살짝 다르게 둬서(용병들은 왼쪽 뒤에 각자 다른 자리, 정령은
    // 오른쪽 뒤), 여러 유닛을 동시에 데리고 다닐 때 같은 자리로 몰려서 겹치지 않게 해요.
    // 거기에 유닛별 위상(idlePhase)으로 아주 살짝 제자리에서 흔들리게 해서, 가만히 서 있을
    // 때도 모두가 얼음처럼 똑같이 멈춰있지 않고 각자 숨 쉬듯 움직이는 것처럼 보이게 해요.
    const followOffset = this.getAllyFormationOffset(slot);
    const sway = 6;
    const swayX = Math.sin(this.time.now / 600 + personality.idlePhase) * sway;
    const swayY = Math.cos(this.time.now / 800 + personality.idlePhase) * sway;
    const followTargetX = this.player.x + followOffset.x + swayX;
    const followTargetY = this.player.y + followOffset.y + swayY;
    const followDistance = 12;

    const distanceToFollowPoint = Phaser.Math.Distance.Between(
      ally.sprite.x, ally.sprite.y, followTargetX, followTargetY
    );

    if (distanceToFollowPoint > followDistance) {
      const angle = Phaser.Math.Angle.Between(ally.sprite.x, ally.sprite.y, followTargetX, followTargetY);
      ally.sprite.body.setVelocity(Math.cos(angle) * 180 * speedMod, Math.sin(angle) * 180 * speedMod);
      this.updateAllyFacing(slot, followTargetX, followTargetY);
    } else {
      ally.sprite.body.setVelocity(0, 0);
    }
  }

  updateAllyFacing(slot, targetX, targetY) {
    const ally = this.allies[slot];
    // 정령(원 모양)은 방향별 그림이 없어서 setFrame 자체가 없는 오브젝트예요.
    // 그대로 호출하면 에러가 나니, 정령일 때는 방향 전환을 그냥 건너뜀
    if (ally.isSpiritSummon) return;

    const dx = targetX - ally.sprite.x;
    const dy = targetY - ally.sprite.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      ally.sprite.setFrame(dx > 0 ? this.directionFrames.right : this.directionFrames.left);
    } else {
      ally.sprite.setFrame(dy > 0 ? this.directionFrames.down : this.directionFrames.up);
    }
  }

  allyBasicAttack(slot, target) {
    const ally = this.allies[slot];
    const companionInfo = COMPANION_TYPES[ally.id];
    const targetInfo = ENTITY_TYPES[target.entityType];
    if (!companionInfo) return;

    const isBuffActive = this.time.now < ally.buffEndTime;
    const buffMultiplier = isBuffActive ? CLASS_ACTIVE_SKILLS.summoner.buffMultiplier : 1;
    const effectiveAttackBonus = companionInfo.attackBonus + (ally.level - 1) * 2 + (ally.bondLevel - 1) * BOND_CONFIG.statBonusPerLevel;
    let damage = Math.round(effectiveAttackBonus * 2 * buffMultiplier);

    let isCompanionCrit = false;
    if (companionInfo.trait?.type === 'critBonus' && Phaser.Math.Between(1, 100) <= companionInfo.trait.value) {
      damage *= 2;
      isCompanionCrit = true;
    }

    target.hp -= damage;
    this.addLog(isCompanionCrit ? `${this.getAllyName(slot)}의 강타! ${targetInfo.name}에게 ${damage} 피해` : `${this.getAllyName(slot)}이(가) ${targetInfo.name}에게 ${damage} 피해`, 'kill');
    this.createParticleBurst(target.x, target.y, 0xffe066, isCompanionCrit ? 12 : 6);

    this.gainAllyExp(slot, 3);
    this.gainBondExp(slot, BOND_CONFIG.combatGain, true);

    if (target.hp <= 0) this.defeatMonster(target, targetInfo);
  }

  // skipSync: 여러 유닛에게 연달아 경험치를 줄 때, 매번 화면 갱신/저장을 하지 않고
  // 호출한 쪽(gainExp)이 마지막에 한 번만 하게 하려고 만든 옵션이에요.
  gainAllyExp(slot, amount, skipSync = false) {
    const ally = this.allies[slot];
    const companionInfo = COMPANION_TYPES[ally.id];
    const expMultiplier = companionInfo?.trait?.type === 'expBonus' ? companionInfo.trait.value : 1;
    ally.exp += Math.round(amount * expMultiplier);

    // 한 번에 큰 경험치를 받으면 여러 레벨이 한꺼번에 오를 수 있어서 while로 반복해요.
    let leveledUp = false;
    while (ally.exp >= ally.level * 20) {
      ally.exp -= ally.level * 20;
      ally.level++;
      ally.maxHp += 10;
      ally.hp = ally.maxHp;
      leveledUp = true;
    }

    if (leveledUp) {
      this.addLog(`${this.getAllyName(slot)}이(가) 레벨 ${ally.level}(으)로 성장했어요!`, 'gain');
      if (ally.sprite && !ally.isKO) this.createParticleBurst(ally.sprite.x, ally.sprite.y, 0x7cc576, 12);
    }

    if (!skipSync) this.syncStatsToReact();
  }

  // 유대감(Bond) 경험치예요. 전투 레벨(gainAllyExp)과는 완전히 별개 축이라, 별도의 레벨/경험치를 써요.
  // skipSync: 전투 중 자잘하게 자주 호출되니 매번 리액트로 동기화하지 않고 호출부가 알아서 처리하게 함.
  gainBondExp(slot, amount, skipSync = false) {
    const ally = this.allies[slot];
    if (!ally.id) return;

    ally.bondExp += amount;

    let leveledUp = false;
    while (ally.bondExp >= ally.bondLevel * BOND_CONFIG.expPerLevel) {
      ally.bondExp -= ally.bondLevel * BOND_CONFIG.expPerLevel;
      ally.bondLevel++;
      leveledUp = true;
    }

    if (leveledUp) {
      this.addLog(`${this.getAllyName(slot)}과(와)의 유대가 깊어졌어요! (유대 Lv.${ally.bondLevel})`, 'gain');
      this.recalculateDerivedStats(); // 유대 보너스가 즉시 반영되도록

      if (ally.bondLevel >= BOND_CONFIG.maxLevel && !ally.bondMaxCelebrated) {
        ally.bondMaxCelebrated = true;
        this.celebrateMaxBond(slot);
      }
    }

    if (!skipSync) this.syncStatsToReact();
  }

  // 유대 레벨이 최고치에 처음 도달한 순간 한 번만 재생되는 축하 연출이에요.
  celebrateMaxBond(slot) {
    const ally = this.allies[slot];
    const info = COMPANION_TYPES[ally.id];

    if (ally.sprite) {
      this.createParticleBurst(ally.sprite.x, ally.sprite.y, 0xffd76a, 24);
      this.createSkillUnlockEffect(ally.sprite.x, ally.sprite.y);
    }
    this.cameras.main.flash(400, 255, 215, 106);
    this.addLog(`✨ ${this.getAllyName(slot)}과(와) 최고 수준의 유대를 쌓았어요!`, 'gain');

    const maxLine = info?.bondDialogues?.[BOND_CONFIG.maxLevel];
    if (maxLine && this.onDialogue) {
      this.onDialogue(maxLine);
      if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
      this.dialogueTimer = setTimeout(() => { if (this.onDialogue) this.onDialogue(null); }, 4000);
    }
  }

  // 주점에서 동료/정령에게 말을 걸어 유대감을 쌓는 기능이에요. 하루 한 번만 되고,
  // 유대 레벨이 bondDialogues의 어느 단계를 막 넘겼는지에 맞춰 대사를 골라줘요
  // (예: 방금 6레벨을 찍었으면 3레벨 대사가 아니라 6레벨 대사가 나옴).
  talkToAlly(slot) {
    const ally = this.allies[slot];
    if (!ally.id) return;

    if (ally.lastTalkedDay === this.currentDay) {
      this.addLog('오늘은 이미 대화했어요. 내일 다시 말을 걸어보세요', 'info');
      return;
    }
    ally.lastTalkedDay = this.currentDay;

    const info = COMPANION_TYPES[ally.id];
    const bondDialogues = info?.bondDialogues || {};
    const unlockedLevels = Object.keys(bondDialogues).map(Number).filter(lv => ally.bondLevel >= lv);
    const bestLevel = unlockedLevels.length > 0 ? Math.max(...unlockedLevels) : null;

    let line;
    if (bestLevel !== null) {
      line = bondDialogues[bestLevel];
    } else {
      const talkLines = info?.talkLines || ['...'];
      line = talkLines[Phaser.Math.Between(0, talkLines.length - 1)];
    }

    if (this.onDialogue) {
      this.onDialogue(line);
      if (this.dialogueTimer) clearTimeout(this.dialogueTimer);
      this.dialogueTimer = setTimeout(() => { if (this.onDialogue) this.onDialogue(null); }, 3500);
    }
    this.addLog(`${this.getAllyName(slot)}과(와) 대화했어요`, 'info');

    if (ally.sprite) this.createParticleBurst(ally.sprite.x, ally.sprite.y, 0xff9ec4, 8);
    this.gainBondExp(slot, BOND_CONFIG.talkGain);
  }

  startAllyAutoSkillTimer(slot) {
    const ally = this.allies[slot];

    if (ally.autoSkillTimer) {
      ally.autoSkillTimer.remove();
      ally.autoSkillTimer = null;
    }
    if (!ally.cls) return;

    const skill = CLASS_ACTIVE_SKILLS[ally.cls];
    if (!skill) return;

    ally.autoSkillTimer = this.time.addEvent({
      delay: skill.cooldownMs, loop: true,
      callback: () => this.useAllyAutoSkill(slot)
    });
  }

  useAllyAutoSkill(slot) {
    const ally = this.allies[slot];
    if (!ally.sprite || !ally.cls || ally.isKO) return;

    const skill = CLASS_ACTIVE_SKILLS[ally.cls];
    const companionInfo = COMPANION_TYPES[ally.id];
    if (!skill || !companionInfo) return;

    const effectiveAttackBonus = companionInfo.attackBonus + (ally.level - 1) * 2 + (ally.bondLevel - 1) * BOND_CONFIG.statBonusPerLevel;
    const baseDamage = effectiveAttackBonus * 3;

    if (ally.cls === 'warrior' || ally.cls === 'archer' || ally.cls === 'rogue') {
      const target = this.findNearestMonster(200, ally.sprite.x, ally.sprite.y);
      if (!target) return;

      const targetInfo = ENTITY_TYPES[target.entityType];
      target.hp -= baseDamage;
      this.createParticleBurst(target.x, target.y, 0xffe066, 10);
      this.addLog(`${this.getAllyName(slot)}의 ${skill.name}! ${baseDamage} 피해`, 'kill');
      this.gainAllyExp(slot, 5);
      this.gainBondExp(slot, BOND_CONFIG.combatGain, true);

      if (target.hp <= 0) this.defeatMonster(target, targetInfo);
    } else if (ally.cls === 'mage') {
      const target = this.findNearestMonster(220, ally.sprite.x, ally.sprite.y);
      if (!target) return;

      this.createParticleBurst(target.x, target.y, 0xff6633, 14);

      this.entities.getChildren().forEach(entity => {
        if (!entity.active) return;
        const info = ENTITY_TYPES[entity.entityType];
        if (info.category !== 'hostile_monster') return;

        const distance = Phaser.Math.Distance.Between(target.x, target.y, entity.x, entity.y);
        if (distance <= 60) {
          entity.hp -= baseDamage;
          if (entity.hp <= 0) this.defeatMonster(entity, info);
        }
      });

      this.addLog(`${this.getAllyName(slot)}의 ${skill.name}! 광역 피해`, 'kill');
      this.gainAllyExp(slot, 5);
      this.gainBondExp(slot, BOND_CONFIG.combatGain, true);
    } else if (ally.cls === 'priest') {
      const healAmount = Math.round(skill.healAmount / 2);
      this.hp = Math.min(this.maxHp, this.hp + healAmount);
      this.hpText.setText('HP: ' + this.hp);
      this.createParticleBurst(this.player.x, this.player.y, 0x7ec8e3, 10);
      this.addLog(`${this.getAllyName(slot)}의 ${skill.name}! HP +${healAmount}`, 'gain');
      this.gainAllyExp(slot, 4);
      this.gainBondExp(slot, BOND_CONFIG.combatGain, true);
      this.syncStatsToReact();
    } else if (ally.cls === 'summoner') {
      const buffAmount = 5;
      this.bonusStats.attack += buffAmount;
      this.recalculateDerivedStats();
      this.createParticleBurst(this.player.x, this.player.y, 0xc77dff, 10);
      this.addLog(`${this.getAllyName(slot)}의 ${skill.name}! 공격력이 잠시 강해졌어요`, 'gain');
      this.gainAllyExp(slot, 4);
      this.gainBondExp(slot, BOND_CONFIG.combatGain, true);

      this.time.delayedCall(skill.buffDurationMs, () => {
        this.bonusStats.attack -= buffAmount;
        this.recalculateDerivedStats();
        this.syncStatsToReact();
      });

      this.syncStatsToReact();
    }
  }

  findNearestMonster(maxRange, fromX = this.player.x, fromY = this.player.y) {
    let nearest = null;
    let nearestDistance = maxRange;

    this.entities.getChildren().forEach(entity => {
      if (!entity.active) return;
      const info = ENTITY_TYPES[entity.entityType];
      if (info.category !== 'hostile_monster') return;

      const distance = Phaser.Math.Distance.Between(fromX, fromY, entity.x, entity.y);
      if (distance < nearestDistance) {
        nearest = entity;
        nearestDistance = distance;
      }
    });

    return nearest;
  }

  getPlayerAttackType() {
    if (!this.playerClass) return 'melee';
    return CLASS_TYPES[this.playerClass]?.attackType || 'melee';
  }

  performRangedBasicAttack() {
    const range = 260;
    const target = this.findNearestMonster(range);

    if (!target) {
      this.addLog('사거리 안에 몬스터가 없어요', 'info');
      return;
    }

    const targetInfo = ENTITY_TYPES[target.entityType];
    const targetX = target.x;
    const targetY = target.y;

    const projectileColor = this.playerClass === 'mage' ? 0xc77dff : 0x8b5a2b;
    const projectile = this.add.circle(this.player.x, this.player.y, 6, projectileColor);

    const travelDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, targetX, targetY);
    const travelDuration = Math.max(100, travelDistance * 1.5);

    this.tweens.add({
      targets: projectile,
      x: targetX, y: targetY,
      duration: travelDuration,
      onComplete: () => {
        projectile.destroy();
        if (!target.active) return;

        const damageResult = this.calculateDamage(this.attackPower);
        target.hp -= damageResult.damage;
        this.addLog(
          damageResult.isCrit ? `치명타! ${targetInfo.name}에게 ${damageResult.damage} 피해` : `${targetInfo.name}에게 ${damageResult.damage} 피해`,
          'kill'
        );

        this.createParticleBurst(target.x, target.y, projectileColor, 8);
        this.reduceWeaponDurability();

        if (target.hp <= 0) this.defeatMonster(target, targetInfo);
      }
    });
  }

  useActiveSkill() {
    if (!this.playerClass) return;

    const skill = CLASS_ACTIVE_SKILLS[this.playerClass];
    if (!skill) return;

    if (this.time.now < this.activeSkillCooldownEndTime) {
      const remainingSec = Math.ceil((this.activeSkillCooldownEndTime - this.time.now) / 1000);
      this.addLog(`아직 쿨타임이에요 (${remainingSec}초)`, 'info');
      return;
    }

    let skillUsed = false;

    if (this.playerClass === 'warrior' || this.playerClass === 'archer') {
      const target = this.findNearestMonster(skill.range);
      if (!target) {
        this.addLog('사거리 안에 몬스터가 없어요', 'info');
      } else {
        const targetInfo = ENTITY_TYPES[target.entityType];
        const boostedAttack = this.attackPower * skill.damageMultiplier;
        const finalDamage = Math.round(boostedAttack);

        target.hp -= finalDamage;
        this.createParticleBurst(target.x, target.y, 0xffe066, 16);
        this.addLog(`${skill.name}! ${finalDamage} 피해`, 'kill');

        if (target.hp <= 0) this.defeatMonster(target, targetInfo);
        skillUsed = true;
      }
    } else if (this.playerClass === 'rogue') {
      // 도적의 Q는 원래 "은신"이에요. 근처에 몬스터가 있어야 쓸 수 있는 즉시 공격형 스킬이
      // 아니라, 몬스터가 없어도 언제든 쓸 수 있고, 다음 근접 공격이 무조건 치명타(기습)로
      // 들어가게 예약해두는 스킬이에요. 예전 코드는 이걸 warrior/archer랑 같은 "근처 타겟
      // 필요" 조건에 묶어놔서, 근처에 적이 없으면 "사거리 안에 몬스터가 없어요"만 뜨고
      // 은신 자체가 걸리지 않는 게 버그였어요.
      if (this.rogueAmbushReady) {
        this.addLog('이미 은신 상태예요', 'info');
      } else {
        this.rogueAmbushReady = true;
        this.player.setAlpha(0.4);
        this.createParticleBurst(this.player.x, this.player.y, 0x444444, 10);

        const stealthDurationMs = skill.stealthDurationMs || 5000;
        this.addLog(`${skill.name}! ${Math.round(stealthDurationMs / 1000)}초간 은신 상태가 되었어요. 다음 공격이 기습(치명타)으로 들어가요`, 'gain');
        skillUsed = true;

        // gameConfig의 stealthDurationMs 동안 공격을 안 했으면 은신이 자동으로 풀리게 해요.
        // (공격에 성공하면 update()의 근접 공격 코드에서 이미 rogueAmbushReady를 꺼주니까,
        // 여기서는 "시간 초과로 안 쓰인 경우"만 정리해주면 돼요)
        this.rogueStealthTimer = this.time.delayedCall(stealthDurationMs, () => {
          this.breakStealth('은신이 풀렸어요');
        });
      }
    } else if (this.playerClass === 'mage') {
      const target = this.findNearestMonster(skill.range);
      if (!target) {
        this.addLog('사거리 안에 몬스터가 없어요', 'info');
      } else {
        const damage = Math.round(this.magicPower * skill.damageMultiplier);
        this.createParticleBurst(target.x, target.y, 0xff6633, 24);

        this.entities.getChildren().forEach(entity => {
          if (!entity.active) return;
          const info = ENTITY_TYPES[entity.entityType];
          if (info.category !== 'hostile_monster') return;

          const distance = Phaser.Math.Distance.Between(target.x, target.y, entity.x, entity.y);
          if (distance <= skill.aoeRadius) {
            entity.hp -= damage;
            if (entity.hp <= 0) this.defeatMonster(entity, info);
          }
        });

        this.addLog(`${skill.name}! ${damage} 광역 피해`, 'kill');
        skillUsed = true;
      }
    } else if (this.playerClass === 'priest') {
      // 우선순위: 본인 체력 낮으면 자힐 -> 동료(용병/정령) 중 체력 낮은 쪽 힐 -> 그 외엔 성속성 공격
      const selfLowHp = this.hp < this.maxHp * 0.5;

      let lowestAlly = null;
      let lowestAllyRatio = 1;
      this.getAllySlots().forEach(slot => {
        const ally = this.allies[slot];
        if (!ally.sprite || ally.isKO || ally.maxHp <= 0) return;
        const ratio = ally.hp / ally.maxHp;
        if (ratio < 0.5 && ratio < lowestAllyRatio) {
          lowestAllyRatio = ratio;
          lowestAlly = ally;
        }
      });

      const nearbyTarget = this.findNearestMonster(skill.range);

      if (selfLowHp || (!lowestAlly && !nearbyTarget)) {
        const healAmount = skill.healAmount + this.magicPower;
        this.hp = Math.min(this.maxHp, this.hp + healAmount);
        this.hpText.setText('HP: ' + this.hp);
        this.createParticleBurst(this.player.x, this.player.y, 0x7ec8e3, 14);
        this.addLog(`${skill.name}! HP +${healAmount}`, 'gain');
        skillUsed = true;
      } else if (lowestAlly) {
        const healAmount = skill.healAmount + this.magicPower;
        lowestAlly.hp = Math.min(lowestAlly.maxHp, lowestAlly.hp + healAmount);
        this.createParticleBurst(lowestAlly.sprite.x, lowestAlly.sprite.y, 0x7ec8e3, 14);
        this.addLog(`${skill.name}! 동료 HP +${healAmount}`, 'gain');
        skillUsed = true;
      } else {
        const targetInfo = ENTITY_TYPES[nearbyTarget.entityType];
        const isUndead = !!targetInfo.isUndead;
        const holyMultiplier = isUndead ? 2.2 : 1.2;
        const critBonus = isUndead ? 30 : 0;

        const damageResult = this.calculateDamage(this.magicPower * holyMultiplier, critBonus);
        nearbyTarget.hp -= damageResult.damage;
        this.createParticleBurst(nearbyTarget.x, nearbyTarget.y, 0xfff2b3, 16);
        this.addLog(`${skill.name}!${isUndead ? ' (언데드 특효)' : ''} ${damageResult.damage} 피해`, 'kill');

        if (nearbyTarget.hp <= 0) this.defeatMonster(nearbyTarget, targetInfo);
        skillUsed = true;
      }

      // 뭘 했든 상관없이, 사용할 때마다 본인+동료에게 짧은 성력 버프(방어력)를 걸어줌
      if (skillUsed) {
        this.bonusStats.defense += 3;
        this.recalculateDerivedStats();
        this.time.delayedCall(6000, () => {
          this.bonusStats.defense -= 3;
          this.recalculateDerivedStats();
          this.syncStatsToReact();
        });
      }
    } else if (this.playerClass === 'summoner') {
      const spirit = this.allies.spirit;
      if (!spirit.id) {
        // 소환수가 없으면, Q키로 정령 하나를 무료로 소환함 (늑대 정령/고블린 정령 중 무작위)
        // 용병(mercenary_*)이 몇 명 있든 상관없이, 정령은 완전히 별개 슬롯에 소환돼요.
        const spiritIds = ['spirit_wolf', 'spirit_goblin'];
        const chosen = spiritIds[Phaser.Math.Between(0, spiritIds.length - 1)];
        this.spawnAlly('spirit', chosen);
        this.addLog(`${COMPANION_TYPES[chosen].name}을(를) 소환했어요!`, 'gain');
        skillUsed = true;
      } else if (!spirit.sprite) {
        this.addLog('강화해줄 소환수가 없어요', 'info');
      } else {
        spirit.buffEndTime = this.time.now + skill.buffDurationMs;
        this.createParticleBurst(spirit.sprite.x, spirit.sprite.y, 0xc77dff, 18);
        this.addLog(`${skill.name}! 소환수가 강해졌어요`, 'gain');
        skillUsed = true;
      }
    }

    if (skillUsed) {
      const actualCooldown = skill.cooldownMs * (1 - this.cooldownReduction / 100);
      this.activeSkillCooldownEndTime = this.time.now + actualCooldown;
    }
  }

  // R키로 쓰는 직업별 광역(다중 타겟) 스킬이에요. Q키의 CLASS_ACTIVE_SKILLS와는 완전히 별개의
  // 쿨타임을 쓰고, "여러 몬스터를 한 번에 때린다"는 공통점만 있고 방식은 두 갈래로 나뉘어요:
  // - radius가 있으면: 플레이어 주변 반경 안의 몬스터 전부를 때림 (근접 계열)
  // - maxTargets가 있으면: 가까운 순으로 최대 N마리를 동시에 때림 (원거리 계열)
  useAoeSkill() {
    if (!this.playerClass) return;

    const skill = CLASS_AOE_SKILLS[this.playerClass];
    if (!skill) return;

    if (this.time.now < this.aoeSkillCooldownEndTime) {
      const remainingSec = Math.ceil((this.aoeSkillCooldownEndTime - this.time.now) / 1000);
      this.addLog(`아직 쿨타임이에요 (${remainingSec}초)`, 'info');
      return;
    }

    const basePower = skill.useMagicPower ? this.magicPower : this.attackPower;
    let hitCount = 0;

    const strikeTarget = (entity) => {
      const info = ENTITY_TYPES[entity.entityType];
      let multiplier = skill.damageMultiplier;
      if (skill.undeadMultiplier && info.isUndead) multiplier = skill.undeadMultiplier;

      const damage = Math.round(basePower * multiplier);
      entity.hp -= damage;
      hitCount++;
      this.createParticleBurst(entity.x, entity.y, 0xff6633, 10);

      if (entity.hp <= 0) this.defeatMonster(entity, info);
    };

    if (skill.radius) {
      // 플레이어를 중심으로 반경 안의 몬스터 전부를 때려요.
      this.entities.getChildren().forEach(entity => {
        if (!entity.active) return;
        const info = ENTITY_TYPES[entity.entityType];
        if (info.category !== 'hostile_monster') return;

        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, entity.x, entity.y);
        if (distance <= skill.radius) strikeTarget(entity);
      });
    } else if (skill.maxTargets) {
      // 사거리 안의 몬스터 중 가까운 순으로 최대 maxTargets마리를 골라서 때려요.
      const candidates = this.entities.getChildren()
        .filter(entity => entity.active && ENTITY_TYPES[entity.entityType].category === 'hostile_monster')
        .map(entity => ({ entity, distance: Phaser.Math.Distance.Between(this.player.x, this.player.y, entity.x, entity.y) }))
        .filter(item => item.distance <= skill.range)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, skill.maxTargets);

      candidates.forEach(item => strikeTarget(item.entity));
    }

    if (hitCount === 0) {
      this.addLog('주변에 맞출 몬스터가 없어요', 'info');
      return; // 맞은 대상이 없으면 Q키 스킬들과 마찬가지로 쿨타임을 소모하지 않아요
    }

    this.createSkillUnlockEffect(this.player.x, this.player.y);
    this.addLog(`${skill.name}! ${hitCount}마리 적중`, 'kill');

    const actualCooldown = skill.cooldownMs * (1 - this.cooldownReduction / 100);
    this.aoeSkillCooldownEndTime = this.time.now + actualCooldown;
  }

  defeatMonster(entity, info) {
    // 같은 몬스터가 한 프레임에 두 번 처치 처리되는 걸 막아요 (예: 플레이어 공격과 동료 공격이 동시에
    // 마무리한 경우). 막지 않으면 전리품/경험치가 두 번 들어가고, 던전 남은 몬스터 수도 두 번 깎여요.
    if (entity.isDefeated) return;
    entity.isDefeated = true;

    this.addToInventory(entity.entityType);
    this.totalMonsterKills++;

    this.checkNewlyUnlockedSkills();

    this.addLog(`${info.name} 처치!`, 'kill');
    this.addLog(`${info.name} +1 획득`, 'gain');
    this.gainExp(info.exp);
    this.createParticleBurst(entity.x, entity.y, 0xff0000, 12);

    // 소환사가 정령 없이 몬스터를 처치하면, 10% 확률로 테이밍에 성공해 정령을 얻음
    // (용병을 따로 고용해뒀어도 상관없이, 정령은 독립된 슬롯이라 그대로 얻을 수 있어요)
    if (this.playerClass === 'summoner' && !this.allies.spirit.id && Phaser.Math.Between(1, 100) <= 10) {
      const spiritIds = ['spirit_wolf', 'spirit_goblin'];
      const chosen = spiritIds[Phaser.Math.Between(0, spiritIds.length - 1)];
      this.spawnAlly('spirit', chosen);
      this.addLog(`몬스터를 길들여 ${COMPANION_TYPES[chosen].name}을(를) 얻었어요!`, 'gain');
    }

    if (entity.encounterType === 'hunt') {
      if (entity.isBoss) this.tryDropRareItem(entity.encounterRankInfo);
      this.entities.remove(entity, true, true);
      this.huntWaveCounts[entity.encounterGateId] = Math.max(0, this.huntWaveCounts[entity.encounterGateId] - 1);
      if (this.huntWaveCounts[entity.encounterGateId] === 0) {
        this.addLog('사냥터 클리어!', 'gain');
      }
      return;
    }

    if (entity.encounterType === 'dungeon') {
      if (entity.isBoss) this.tryDropRareItem(entity.encounterRankInfo);
      this.entities.remove(entity, true, true);
      this.dungeonWaveRemaining = Math.max(0, this.dungeonWaveRemaining - 1);
      if (this.dungeonWaveRemaining === 0) {
        this.spawnDungeonExitDoor();
      }
      return;
    }

    if (entity.encounterType === 'field') {
      this.entities.remove(entity, true, true);
      return;
    }

    entity.isHarvested = true;
    this.refreshEntityVisual(entity);

    setTimeout(() => {
      entity.isDefeated = false; // 리스폰하면 다시 처치할 수 있어야 해요
      entity.hp = entity.maxHp;
      entity.x = Phaser.Math.Between(50, 750);
      entity.y = Phaser.Math.Between(50, 550);
      entity.isHarvested = false;
      this.refreshEntityVisual(entity);
    }, Phaser.Math.Between(GAME_CONFIG.wolfRespawnMin, GAME_CONFIG.wolfRespawnMax));
  }

  createHuntMonster(typeKey, x, y, rankInfo, gateId, isBoss, encounterType) {
    const baseInfo = ENTITY_TYPES[typeKey];
    const monster = this.createEntity(x, y, typeKey);

    const multiplier = rankInfo.monsterMultiplier * (isBoss ? rankInfo.bossHpMultiplier : 1);

    monster.hp = Math.round(baseInfo.hp * multiplier);
    monster.maxHp = monster.hp;
    monster.customDamage = Math.round(baseInfo.damage * rankInfo.monsterMultiplier);
    monster.customSpeed = baseInfo.speed;

    monster.encounterType = encounterType;
    monster.encounterGateId = gateId;
    monster.encounterRankInfo = rankInfo;
    monster.isBoss = isBoss;

    if (isBoss) {
      monster.setScale((monster.spriteScale || monster.scale || 1) * 1.6);
      monster.setTint(0xffcc00);
    }

    return monster;
  }

  tryDropRareItem(rankOrRankInfo) {
    const rankInfo = typeof rankOrRankInfo === 'string' ? HUNTING_GROUND_RANKS[rankOrRankInfo] : rankOrRankInfo;
    if (!rankInfo) return;

    const roll = Phaser.Math.Between(1, 100);
    if (roll > rankInfo.rareDropChance) return;

    const rareItem = SHOP_ITEMS.find(i => i.id === rankInfo.rareItemId);
    if (!rareItem) return;

    this.addToInventory(rareItem.id);
    this.addLog(`✨ 레어 아이템 획득: ${rareItem.name}!`, 'gain');
  }

  enterHuntingGround(gateId) {
    const gateObj = this.gateObjects[gateId];
    if (!gateObj) return;

    if (this.huntWaveCounts[gateId] > 0) {
      this.addLog('아직 이전 웨이브가 남아있어요', 'info');
      return;
    }

    const rankInfo = HUNTING_GROUND_RANKS[gateObj.config.rank];
    const gateX = gateObj.config.x;
    const gateY = gateObj.config.y;

    const normalCount = 4;
    let spawnedCount = 0;

    for (let i = 0; i < normalCount; i++) {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnRadius = Phaser.Math.Between(80, 150);
      const spawnX = gateX + Math.cos(spawnAngle) * spawnRadius;
      const spawnY = gateY + Math.sin(spawnAngle) * spawnRadius;

      const monster = this.createHuntMonster('wolf', spawnX, spawnY, rankInfo, gateId, false, 'hunt');
      this.entities.add(monster);
      spawnedCount++;
    }

    const bossMonster = this.createHuntMonster('wolf', gateX, gateY - 100, rankInfo, gateId, true, 'hunt');
    this.entities.add(bossMonster);
    spawnedCount++;

    this.huntWaveCounts[gateId] = spawnedCount;
    this.addLog(`${rankInfo.name} 사냥터 입장! 몬스터 ${spawnedCount}마리 출현`, 'info');
  }

  enterDungeon(dungeonConfig) {
    if (this.isInsideDungeon) return;

    this.cleanupDungeonExitObjects(); // 혹시 이전 출구 흔적이 남아있으면 먼저 정리
    this.lastDungeonRemainingShown = -1;

    const rankInfo = DUNGEON_RANKS[dungeonConfig.rank];

    this.isInsideDungeon = true;
    this.currentDungeonGate = dungeonConfig;
    this.setOutdoorObjectsActive(false);

    this.player.x = 400;
    this.player.y = 300;

    this.buildingNameText.setText(`${rankInfo.name} (몬스터를 전부 처치하면 출구가 열려요)`);
    this.buildingNameText.setVisible(true);

    const normalCount = 5;
    let spawnedCount = 0;

    for (let i = 0; i < normalCount; i++) {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnRadius = Phaser.Math.Between(80, 160);
      const spawnX = 400 + Math.cos(spawnAngle) * spawnRadius;
      const spawnY = 300 + Math.sin(spawnAngle) * spawnRadius;

      const monster = this.createHuntMonster('wolf', spawnX, spawnY, rankInfo, dungeonConfig.id, false, 'dungeon');
      this.entities.add(monster);
      spawnedCount++;
    }

    const bossMonster = this.createHuntMonster('wolf', 400, 180, rankInfo, dungeonConfig.id, true, 'dungeon');
    this.entities.add(bossMonster);
    spawnedCount++;

    this.dungeonWaveRemaining = spawnedCount;
    this.dungeonExitGate = null;

    this.addLog(`${rankInfo.name} 입장! 몬스터 ${spawnedCount}마리 출현`, 'info');
  }

  // 던전 몬스터가 전부 사라졌는지 직접 세어서 확인해요. 처치할 때마다 숫자를 깎는 방식만 쓰면
  // 어떤 이유로든 숫자가 어긋났을 때 출구가 영영 안 열릴 수 있어서, 살아있는 몬스터를 직접 세는
  // 안전장치를 함께 둬요. 남은 마리 수 안내 문구도 여기서 갱신해요.
  checkDungeonCleared() {
    if (this.dungeonExitGate) return;

    const alive = this.entities.getChildren().filter(
      e => e.encounterType === 'dungeon' && e.hp > 0 && !e.isDefeated
    );
    this.dungeonWaveRemaining = alive.length;

    if (alive.length === 0) {
      this.spawnDungeonExitDoor();
      return;
    }

    if (alive.length !== this.lastDungeonRemainingShown && this.currentDungeonGate) {
      this.lastDungeonRemainingShown = alive.length;
      const rankInfo = DUNGEON_RANKS[this.currentDungeonGate.rank];
      this.buildingNameText.setText(`${rankInfo.name} · 남은 몬스터 ${alive.length}마리`);
    }
  }

  spawnDungeonExitDoor() {
    if (this.dungeonExitGate) return;

    const doorX = 400;
    const doorY = 480;

    const door = this.add.rectangle(doorX, doorY, 60, 60, 0x2d5016);
    door.setStrokeStyle(4, 0xffe066, 1);
    this.physics.add.existing(door, true);
    this.dungeonExitGate = door;

    // 문 뒤에서 은은하게 커졌다 작아지는 빛과, 문 위의 안내 글자예요
    const glow = this.add.circle(doorX, doorY, 50, 0xffe066, 0.3);
    glow.setDepth(-0.5);
    const doorLabel = this.add.text(doorX, doorY - 55, '🚪 출구 (E키)', {
      fontSize: '14px', color: '#ffe066', backgroundColor: '#000000aa', padding: { x: 6, y: 3 }
    });
    doorLabel.setOrigin(0.5);

    this.dungeonExitObjects = [glow, doorLabel];
    this.dungeonExitTween = this.tweens.add({
      targets: glow, scale: 1.5, alpha: 0.05, duration: 700, yoyo: true, repeat: -1
    });

    // 클리어 연출: 화면 번쩍임 + 문 주변 파티클 + 퍼져나가는 링
    this.cameras.main.flash(500, 255, 255, 200);
    this.createParticleBurst(doorX, doorY, 0xffe066, 24);
    this.createSkillUnlockEffect(doorX, doorY);

    // 화면 가운데에 큰 안내 문구를 잠깐 보여주고 서서히 사라지게 해요
    const banner = this.add.text(400, 230, '🎉 던전 클리어!\n출구 문 근처에서 E키를 누르면 나갈 수 있어요\n(어디서든 H키로도 나갈 수 있어요)', {
      fontSize: '22px', color: '#ffe066', backgroundColor: '#000000cc',
      padding: { x: 18, y: 12 }, align: 'center'
    });
    banner.setOrigin(0.5);
    banner.setScrollFactor(0);
    banner.setDepth(1001);
    this.tweens.add({
      targets: banner, alpha: 0, delay: 4500, duration: 800,
      onComplete: () => banner.destroy()
    });

    // 화면 위쪽 상시 안내 문구는 남겨둬서, 배너가 사라진 뒤에도 나가는 방법을 알 수 있게 해요
    if (this.currentDungeonGate) {
      const rankInfo = DUNGEON_RANKS[this.currentDungeonGate.rank];
      this.buildingNameText.setText(`${rankInfo.name} 클리어! 출구 문에서 E키 / 어디서든 H키로 나가기`);
      this.buildingNameText.setVisible(true);
    }

    this.addLog('던전 클리어! 출구 문이 열렸어요 (E키 또는 H키로 나가기)', 'gain');
  }

  handleDungeonExit() {
    this.checkDungeonCleared();
    if (!this.dungeonExitGate) return;

    const pressedE = Phaser.Input.Keyboard.JustDown(this.eKey);
    const pressedH = Phaser.Input.Keyboard.JustDown(this.hKey);

    // H키는 문까지 못 가는 상황을 대비한 비상 탈출이에요 (클리어한 뒤에만 동작해요)
    if (pressedH) {
      this.exitDungeon();
      return;
    }

    if (pressedE) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.dungeonExitGate.x, this.dungeonExitGate.y
      );
      if (distance < 80) {
        this.exitDungeon();
      } else {
        this.addLog('출구 문 가까이에서 E키를 눌러주세요', 'info');
      }
    }
  }

  cleanupDungeonExitObjects() {
    if (this.dungeonExitTween) {
      this.dungeonExitTween.stop();
      this.dungeonExitTween = null;
    }
    this.dungeonExitObjects.forEach(obj => obj.destroy());
    this.dungeonExitObjects = [];

    if (this.dungeonExitGate) {
      this.dungeonExitGate.destroy();
      this.dungeonExitGate = null;
    }
  }

  exitDungeon() {
    // 나가는 연출: 지금 서 있는 자리에서 파티클 + 화면 번쩍임
    this.createParticleBurst(this.player.x, this.player.y, 0xffffff, 20);
    this.cameras.main.flash(400, 255, 255, 255);

    this.isInsideDungeon = false;
    this.setOutdoorObjectsActive(true);

    this.cleanupDungeonExitObjects();

    if (this.currentDungeonGate) {
      this.player.x = this.currentDungeonGate.x;
      this.player.y = this.currentDungeonGate.y + 80;
    }
    this.currentDungeonGate = null;
    this.lastDungeonRemainingShown = -1;

    this.buildingNameText.setVisible(false);
    this.addLog('던전에서 나왔어요', 'info');
  }

  // 필드 입구(G키)에 들어갔을 때 호출돼요. 던전과 비슷하게 완전히 별도의 공간으로 이동하지만,
  // 클리어 조건 없이 몬스터를 몇 마리 잡든 상관없이 자유롭게 다닐 수 있어요.
  enterField(zoneId) {
    if (this.isInsideField) return;

    const zone = FIELD_ZONES[zoneId];

    this.isInsideField = true;
    this.currentFieldZone = zoneId;
    this.setOutdoorObjectsActive(false);

    // 필드는 마을(800x600)보다 훨씬 넓은 공간(FIELD_WORLD_WIDTH x FIELD_WORLD_HEIGHT)이에요.
    // 물리 경계를 넓히고, 카메라가 플레이어를 부드럽게 따라다니게 해서 실제로 넓은 땅을
    // 돌아다니는 느낌을 줘요. 나갈 때(exitField)는 이걸 전부 마을 설정으로 되돌려요.
    this.physics.world.setBounds(0, 0, FIELD_WORLD_WIDTH, FIELD_WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, FIELD_WORLD_WIDTH, FIELD_WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    this.player.x = FIELD_WORLD_WIDTH / 2;
    this.player.y = FIELD_WORLD_HEIGHT / 2;

    this.cameras.main.setBackgroundColor(Phaser.Display.Color.IntegerToColor(zone.color).rgba);

    this.buildingNameText.setText(`${zone.name} (H키로 나가기)`);
    this.buildingNameText.setVisible(true);

    // 별도 그룹 없이 기존 entities 그룹 하나에만 등록하고, "꼬리표(fieldZoneId)"로
    // 어느 필드 소속인지 구분해요. 이렇게 하면 그룹을 여러 개 관리하며 생기는
    // 물리 엔진 꼬임 없이, entities.remove()만으로 안전하게 정리할 수 있어요.
    // 넓어진 공간에 맞춰 몬스터도 가장자리 150px씩 여백을 두고 전체에 골고루 퍼뜨려요.
    zone.monsters.forEach(monsterConfig => {
      for (let i = 0; i < monsterConfig.count; i++) {
        const spawnX = Phaser.Math.Between(150, FIELD_WORLD_WIDTH - 150);
        const spawnY = Phaser.Math.Between(150, FIELD_WORLD_HEIGHT - 150);

        const monster = this.createEntity(spawnX, spawnY, monsterConfig.type);
        monster.encounterType = 'field';
        monster.fieldZoneId = zoneId;
        this.entities.add(monster);
      }
    });

    this.addLog(`${zone.name}에 입장했어요 (예전보다 훨씬 넓어요!)`, 'info');
  }

  // 필드에서 나갈 때 호출돼요. 언제든(H키) 자유롭게 나갈 수 있음
  exitField() {
    this.isInsideField = false;

    // group.remove(대상, true, true)로 그룹에서 확실히 빼고 destroy까지 함께 처리해요.
    // 배열을 [...]로 먼저 복사하는 이유는, forEach 도중에 remove가 그룹의 원본 배열을
    // 실시간으로 바꾸면 반복문이 몇 개를 건너뛸 수 있어서예요.
    const fieldMonsters = [...this.entities.getChildren()].filter(e => e.fieldZoneId === this.currentFieldZone);
    fieldMonsters.forEach(monster => this.entities.remove(monster, true, true));

    this.setOutdoorObjectsActive(true);
    this.cameras.main.setBackgroundColor('#4a7c3c');

    // 카메라 추적을 멈추고, 물리 경계와 카메라 경계를 전부 마을 기준으로 되돌려요.
    // 이걸 안 하면 마을로 돌아와서도 카메라가 계속 플레이어를 따라다니려고 해요.
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.setBounds(0, 0, 800, 600);
    this.physics.world.setBounds(
      VILLAGE_WORLD_BOUNDS.x, VILLAGE_WORLD_BOUNDS.y, VILLAGE_WORLD_BOUNDS.width, VILLAGE_WORLD_BOUNDS.height
    );

    const zone = FIELD_ZONES[this.currentFieldZone];
    if (zone) {
      this.player.x = zone.entrance.x;
      this.player.y = zone.entrance.y + 80;
    }
    this.currentFieldZone = null;

    this.buildingNameText.setVisible(false);
    this.addLog('필드에서 나왔어요', 'info');
  }

  // 마을 외곽 텃밭에 들어갈 때 호출돼요. 던전/필드와 같은 패턴(완전히 별도 공간)이지만,
  // 몬스터가 없고 밭 작업만 하는 평화로운 공간이라는 점이 달라요.
  enterOutskirts() {
    if (this.isInsideOutskirts) return;

    this.isInsideOutskirts = true;
    this.setOutdoorObjectsActive(false);

    this.player.x = 400;
    this.player.y = 520; // 밭들이 위쪽에 모여있어서, 입구 근처인 아래쪽에서 시작해요

    this.cameras.main.setBackgroundColor(Phaser.Display.Color.IntegerToColor(VILLAGE_EXTENSIONS.outskirts_farm.color).rgba);

    this.buildingNameText.setText(`${VILLAGE_EXTENSIONS.outskirts_farm.name} (H키로 나가기)`);
    this.buildingNameText.setVisible(true);

    FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));

    this.addLog(`${VILLAGE_EXTENSIONS.outskirts_farm.name}에 들어왔어요`, 'info');
  }

  exitOutskirts() {
    this.isInsideOutskirts = false;
    this.setOutdoorObjectsActive(true);
    this.cameras.main.setBackgroundColor('#4a7c3c');

    FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));

    const outskirtsZone = VILLAGE_EXTENSIONS.outskirts_farm;
    this.player.x = outskirtsZone.entrance.x;
    this.player.y = outskirtsZone.entrance.y + 80;

    this.buildingNameText.setVisible(false);
    this.addLog('마을 외곽에서 돌아왔어요', 'info');
  }

  createParticleBurst(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const particle = this.add.circle(x, y, 4, color);
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 50;

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 400,
        onComplete: () => particle.destroy()
      });
    }
  }

  createAttackSlashEffect(x, y) {
    const slash = this.add.rectangle(x, y, 30, 4, 0xffffff);
    slash.setRotation(Phaser.Math.Between(0, 360) * (Math.PI / 180));

    this.tweens.add({
      targets: slash,
      scaleX: 2, alpha: 0, duration: 150,
      onComplete: () => slash.destroy()
    });
  }

  createSkillUnlockEffect(x, y) {
    for (let i = 0; i < 2; i++) {
      this.time.delayedCall(i * 150, () => {
        const ring = this.add.circle(x, y, 10, 0xffffff, 0);
        ring.setStrokeStyle(3, 0xffd76a, 1);

        this.tweens.add({
          targets: ring,
          radius: 60, alpha: 0, duration: 500,
          onUpdate: () => ring.setStrokeStyle(3, 0xffd76a, ring.alpha),
          onComplete: () => ring.destroy()
        });
      });
    }

    this.createParticleBurst(x, y, 0xffe066, 20);
  }

  playSound(freq) {
    if (this.soundVolume <= 0) return;

    try {
      const ctx = this.sound.context;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const volumeMultiplier = this.soundVolume / 100;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.1 * volumeMultiplier, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      // 오디오 컨텍스트 문제는 게임 진행에 치명적이지 않으니 조용히 무시함
    }
  }

  playHitSound() {
    this.playSound(150);
  }

  handleDeath(killerName) {
    this.addLog(`${killerName}에게 당했습니다...`, 'death');

    // 사망 시 도적 은신 상태를 초기화해서, 부활 후 계속 반투명 상태로 남지 않게 해요.
    this.breakStealth();

    const expNeeded = this.level * 100;
    this.exp -= Math.floor(expNeeded * 0.3);

    if (this.exp < 0 && this.level > 1) {
      this.level--;
      this.exp = 0;
      this.addLog(`레벨이 ${this.level + 1} → ${this.level}로 떨어졌습니다`, 'death');
    } else if (this.exp < 0) {
      this.exp = 0;
    }

    this.recalculateDerivedStats();
    this.syncStatsToReact();

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

  revivePlayer() {
    this.hp = this.maxHp;
    this.hpText.setText('HP: ' + this.hp);
    this.syncStatsToReact();
  }

  setPaused(isPausedValue) {
    this.isPaused = isPausedValue;
    if (isPausedValue && this.player?.body) {
      this.player.body.setVelocity(0, 0);
    }
  }

  setSoundVolume(percent) {
    this.soundVolume = Math.max(0, Math.min(100, percent));
  }

  setBrightness(percent) {
    this.brightnessPercent = Math.max(0, Math.min(100, percent));
    const darkness = (100 - this.brightnessPercent) / 100 * 0.8;
    this.brightnessOverlay.setAlpha(darkness);
  }
}