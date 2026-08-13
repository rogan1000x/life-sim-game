import Phaser from 'phaser';
import { GAME_CONFIG, ENTITY_TYPES, NPC_DATA, SHOP_ITEMS, BUILDING_TYPES } from './gameConfig';

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
    this.attackPower = 10;
    this.maxHp = 100;
    this.moveSpeed = 200;
    this.hp = 100;
    this.gold = 0;
    this.dialogueIndex = 0;
    this.lastDialogueNpc = null; // 직전에 대화한 NPC 종류 (NPC가 바뀌면 대사를 처음부터 다시 보여주기 위함)
    this.dialogueTimer = null;   // 대화창 자동 숨김 타이머 (연속으로 말 걸었을 때 이전 타이머를 취소하기 위해 저장)
    this.gameMinutes = 480;      // 게임 속 현재 시각 (분 단위, 480 = 08:00부터 시작)
    this.currentDay = 1;         // 게임 속 날짜
    this.nightIntensity = 0;     // 밤의 깊이 (0=낮, 0.6=한밤중) - 몬스터 강화 배율 계산에 사용
    this.equipped = { weapon: null }; // 슬롯별 장착 중인 아이템 id (지금은 weapon 슬롯만 존재)
    this.isDead = false;         // 사망 후 부활 대기 중인지 여부 (중복 사망 처리 방지용)
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

    // React와 연결하기 위한 콜백 함수들 (App.js에서 설정해줌)
    this.onStatsUpdate = null; // 상태가 바뀔 때마다 React에 알리는 함수
    this.onDialogue = null;    // 대화창 표시 함수
    this.onShopToggle = null;  // 상점 열기/닫기 함수
    this.onLog = null;         // 몬스터 처치/아이템 획득/사망 등 이벤트를 알림창에 전달하는 함수
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

    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.eKey = this.input.keyboard.addKey('E');
    this.hKey = this.input.keyboard.addKey('H'); // 집 입장/퇴장 키

    this.physics.add.collider(this.player, this.entities);

    // 몬스터와 부딪혔을 때 데미지 처리
    this.physics.add.overlap(this.player, this.entities, (playerObj, entity) => {
      const info = ENTITY_TYPES[entity.entityType];
      if (info.category !== 'hostile_monster' || !entity.active) return;
      if (this.godMode) return; // Admin 무적 모드면 데미지 무시
      if (this.hp <= 0) return; // 이미 죽었으면 중복 데미지 방지

      // 밤에는 늑대의 공격력이 최대 1.5배까지 강해짐 (한밤중이 가장 위험)
      const nightMultiplier = this.getNightMonsterMultiplier();
      const actualDamage = Math.round(info.damage * nightMultiplier);
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

    housePositions.forEach(pos => {
      this.houses.add(this.createHouse(pos.x, pos.y, pos.type));
    });

    this.hpText = this.add.text(20, 20, 'HP: ' + this.hp, {
      fontSize: '20px',
      color: '#ff4444'
    });

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
      return;
    }

    this.handleMovement();

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

          this.gold += info.sellPrice;
          this.syncStatsToReact();
          this.addLog(`${info.name} 획득 (+${info.sellPrice}G)`, 'gain');

          this.createParticleBurst(entity.x, entity.y, info.color);

          // 일정 시간 후 다시 나타남 (리젠)
          // 타이머 실행 시점에 실내에 있었더라도 refreshEntityVisual이 그 상태를 반영해줌
          setTimeout(() => {
            entity.isHarvested = false;
            this.refreshEntityVisual(entity);
          }, Phaser.Math.Between(5000, 15000));

        } else if (info.category === 'hostile_monster') {
          // 몬스터는 체력을 깎아야 처치됨
          entity.hp -= this.attackPower;
          this.playHitSound();

          if (entity.hp <= 0) {
            // 채집 자원과 동일한 방식으로 숨김 상태 관리 (실내 여부와 충돌 방지)
            entity.isHarvested = true;
            this.refreshEntityVisual(entity);

            this.addToInventory(entity.entityType);
            this.gainExp(info.exp);

            this.gold += info.sellPrice;
            this.syncStatsToReact();
            this.addLog(`${info.name} 처치! (+${info.exp} EXP, +${info.sellPrice}G)`, 'kill');

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
      gameMinutes: this.gameMinutes, currentDay: this.currentDay, equipped: this.equipped
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

    } else {
      // ===== 실외 복귀 =====
      this.isInsideHouse = false;
      this.cameras.main.setBackgroundColor('#4a7c3c');

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
        equipped: { ...this.equipped }
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

  // 스탯 포인트를 사용해 공격력/체력/속도 중 하나를 강화
  allocateStat(statType) {
    if (this.statPoints <= 0) return;

    this.statPoints--;

    if (statType === 'attack') {
      this.attackPower += 5;
    } else if (statType === 'hp') {
      this.maxHp += 20;
      this.hp += 20;
    } else if (statType === 'speed') {
      this.moveSpeed += 20;
    }

    this.syncStatsToReact();
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

  // 상점에서 아이템 구매 - 즉시 사용하지 않고 인벤토리에 저장만 함
  // quantity를 넘기면 여러 개를 한 번에 구매 (Shift+클릭용). 골드가 부족하면 살 수 있는 만큼만 구매함
  buyItem(item, quantity = 1) {
    const affordableQty = Math.min(quantity, Math.floor(this.gold / item.price));
    if (affordableQty <= 0) return;

    this.gold -= item.price * affordableQty;
    if (!this.inventory[item.id]) {
      this.inventory[item.id] = 0;
    }
    this.inventory[item.id] += affordableQty;

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
  applyEquipEffect(itemId, direction) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    if (item.effectType === 'attack') {
      this.attackPower += item.effectValue * direction;
    } else if (item.effectType === 'speed') {
      this.moveSpeed += item.effectValue * direction;
    } else if (item.effectType === 'maxHp') {
      this.maxHp += item.effectValue * direction;
      this.hp = Math.max(0, Math.min(this.hp + item.effectValue * direction, this.maxHp));
    }
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

  // 동물이 화면 안이 아니라 "화면 밖 가장자리"에서 등장하도록 좌표를 계산
  getEdgeSpawnPosition() {
    const side = Phaser.Math.Between(0, 3); // 0:위, 1:아래, 2:왼쪽, 3:오른쪽
    if (side === 0) return { x: Phaser.Math.Between(0, 800), y: -30 };
    if (side === 1) return { x: Phaser.Math.Between(0, 800), y: 630 };
    if (side === 2) return { x: -30, y: Phaser.Math.Between(0, 600) };
    return { x: 830, y: Phaser.Math.Between(0, 600) };
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

