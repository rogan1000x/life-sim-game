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

      this.hp -= info.damage;
      this.hp = Math.max(0, this.hp);
      this.hpText.setText('HP: ' + this.hp);
      this.playHitSound();

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

    this.syncStatsToReact();
  }

  // 매 프레임(1초에 약 60번) 반복 실행되는 게임 로직
  update() {
    if (this.hp <= 0) return; // 죽었으면 모든 조작 무시

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
        const angle = Phaser.Math.Angle.Between(entity.x, entity.y, this.player.x, this.player.y);
        entity.body.setVelocity(
          Math.cos(angle) * info.speed,
          Math.sin(angle) * info.speed
        );
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
      if (distance < 80) {
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
      moveSpeed: this.moveSpeed, gold: this.gold, inventory: this.inventory
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
        inventory: { ...this.inventory }
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

  // Admin 패널의 부활 버튼용 - HP를 최대치로 즉시 회복
  revivePlayer() {
    this.hp = this.maxHp;
    this.hpText.setText('HP: ' + this.hp);
    this.syncStatsToReact();
  }

  // 상점에서 아이템 구매 - 즉시 사용하지 않고 인벤토리에 저장만 함
  buyItem(item) {
    if (this.gold < item.price) return;

    this.gold -= item.price;
    if (!this.inventory[item.id]) {
      this.inventory[item.id] = 0;
    }
    this.inventory[item.id]++;

    this.syncStatsToReact();
  }

  // 인벤토리에 있는 아이템을 실제로 사용 - 회복형(heal)과 스탯 강화형(attack/speed/maxHp)을 함께 처리
  useItem(itemId) {
    if (!this.inventory[itemId] || this.inventory[itemId] <= 0) return;

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    this.inventory[itemId]--;

    if (item.effectType === 'heal') {
      this.hp = Math.min(this.maxHp, this.hp + item.effectValue);
      this.hpText.setText('HP: ' + this.hp);
    } else if (item.effectType === 'attack') {
      this.attackPower += item.effectValue;
    } else if (item.effectType === 'speed') {
      this.moveSpeed += item.effectValue;
    } else if (item.effectType === 'maxHp') {
      this.maxHp += item.effectValue;
      this.hp += item.effectValue; // 최대체력이 늘어난 만큼 현재체력도 함께 회복시켜줌
    }

    this.syncStatsToReact();
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

    const entity = this.add.circle(x, y, info.radius, info.color);
    entity.entityType = typeKey;
    entity.hp = info.hp;
    entity.maxHp = info.hp;
    entity.isHarvested = false; // 채집/처치되어 리젠 대기 중인지 여부 (실내/실외와 별개)

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

