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
    this.isKnockedBack = false;
    this.nearbyNpc = null;
    this.audioContext = null;
    // 집 꾸미기 시스템 관련 상태
    // 집 꾸미기 시스템 관련 상태
    this.isInsideHouse = false;   // 지금 집 안에 있는지 여부
    this.nearbyHouse = null;      // 근처에 있는 집 오브젝트 (여러 채 중 하나)
    this.currentHouse = null;     // 현재 들어와있는 집 (나갈 때 위치 복원용)
    this.furnitureObjects = [];   // 실내에 생성된 가구 오브젝트들 (전환마다 재사용)

    // React와 연결하기 위한 콜백 함수들 (App.js에서 설정해줌)
    this.onStatsUpdate = null; // 상태가 바뀔 때마다 React에 알리는 함수
    this.onDialogue = null;    // 대화창 표시 함수
    this.onShopToggle = null;  // 상점 열기/닫기 함수
    this.godMode = false;      // Admin 무적 모드 (App.js에서 값 변경)
  }

  // 이미지 등 리소스를 미리 불러오는 단계
  preload() {
    this.load.image('player', 'assets/player_init.jpg');
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

    // 캐릭터 생성
    this.player = this.add.sprite(400, 300, 'player');
    this.player.setDisplaySize(80, 80);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

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

    // NPC 생성
    this.npcs = this.add.group();
    const npc = this.add.rectangle(400, 150, 40, 60, NPC_DATA.villager.color);
    npc.npcType = 'villager';
    this.physics.add.existing(npc, true); // 정적(안 움직이는) 오브젝트
    this.npcs.add(npc);
    this.physics.add.collider(this.player, this.npcs);

    // 집들을 그룹으로 관리 - 여러 채를 배치해도 같은 로직으로 처리 가능
    this.houses = this.add.group();

    // 집 배치 목록 (나중에 여러 채 추가하려면 이 배열에 항목만 추가하면 됨)
    const housePositions = [
      { x: 650, y: 450, type: 'myHouse' }
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
    let velocityX = 0;
    let velocityY = 0;
    if (this.hp <= 0) return; // 죽었으면 모든 조작 무시

    // 넉백 중이 아닐 때만 키 입력으로 이동
    if (!this.isKnockedBack) {
      if (this.cursors.left.isDown) {
        velocityX = -this.moveSpeed;
        this.player.setFlipX(true);
      } else if (this.cursors.right.isDown) {
        velocityX = this.moveSpeed;
        this.player.setFlipX(false);
      }

      if (this.cursors.up.isDown) {
        velocityY = -this.moveSpeed;
      } else if (this.cursors.down.isDown) {
        velocityY = this.moveSpeed;
      }

      this.player.body.setVelocity(velocityX, velocityY);
    }

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
          entity.setActive(false);
          entity.setVisible(false);
          entity.body.enable = false;

          this.addToInventory(entity.entityType);
          this.playSound(info.sound);
          this.gainExp(info.exp);

          this.gold += info.sellPrice;
          this.syncStatsToReact();

          this.createParticleBurst(entity.x, entity.y, info.color);

          // 일정 시간 후 다시 나타남 (리젠)
          setTimeout(() => {
            entity.setActive(true);
            entity.setVisible(true);
            entity.body.enable = true;
          }, Phaser.Math.Between(5000, 15000));

        } else if (info.category === 'hostile_monster') {
          // 몬스터는 체력을 깎아야 처치됨
          entity.hp -= this.attackPower;
          this.playHitSound();

          if (entity.hp <= 0) {
            entity.setActive(false);
            entity.setVisible(false);
            entity.body.enable = false;

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
              entity.setActive(true);
              entity.setVisible(true);
              entity.body.enable = true;
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

    // E키로 근처 NPC와 상호작용 (현재는 상점 열기)
    if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.nearbyNpc) {
      if (this.onShopToggle) this.onShopToggle();
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

  // 집 안/밖 상태를 전환. 어떤 집이든(내 집, 동료 집 등) 같은 로직으로 처리됨
  // 실외 오브젝트 그룹 전체에 대해, 보이는지 여부와 물리 충돌 여부를 한 번에 설정
  // (Phaser의 그룹 setVisible은 자식 오브젝트까지 확실히 전파되지 않는 경우가 있어
  //  각 오브젝트를 직접 순회하며 설정하는 방식을 사용)
setOutdoorObjectsActive(isActive) {
  [this.houses, this.entities, this.npcs].forEach(group => {
    group.getChildren().forEach(obj => {
      obj.setVisible(isActive);
      obj.setActive(isActive);
      obj.alpha = isActive ? 1 : 0; // 투명도로도 확실하게 안 보이게 처리
      if (obj.body) {
        obj.body.enable = isActive;
      }
    });
  });
}

  toggleHouse() {
    if (!this.isInsideHouse) {
      // ===== 실내 진입 =====
      this.currentHouse = this.nearbyHouse;
      const info = BUILDING_TYPES[this.currentHouse.buildingType];

      this.isInsideHouse = true;
      this.cameras.main.setBackgroundColor(info.interiorColor);

      // 실외 오브젝트들을 각각 순회하며 확실히 숨기고 충돌도 비활성화
      this.setOutdoorObjectsActive(false);

      this.player.x = 400;
      this.player.y = 400;

      this.furnitureObjects.forEach(f => f.destroy());
      this.furnitureObjects = [];

      info.furniture.forEach(item => {
        const furniture = this.add.rectangle(item.x, item.y, item.width, item.height, item.color);
        this.physics.add.existing(furniture, true);
        this.physics.add.collider(this.player, furniture);
        this.furnitureObjects.push(furniture);
      });

    } else {
      // ===== 실외 복귀 =====
      this.isInsideHouse = false;
      this.cameras.main.setBackgroundColor('#4a7c3c');

      // 실외 오브젝트들을 다시 보이게 하고 충돌도 복원
      this.setOutdoorObjectsActive(true);

      this.furnitureObjects.forEach(f => f.destroy());
      this.furnitureObjects = [];

      this.player.x = this.currentHouse.x;
      this.player.y = this.currentHouse.y + 80;
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

  // 인벤토리에 있는 아이템을 실제로 사용 (예: 포션 마시기)
  useItem(itemId) {
    if (!this.inventory[itemId] || this.inventory[itemId] <= 0) return;

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    this.inventory[itemId]--;
    this.hp = Math.min(this.maxHp, this.hp + item.heal);
    this.hpText.setText('HP: ' + this.hp);
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

