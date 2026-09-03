import Phaser from 'phaser';
import {
  GAME_CONFIG, ENTITY_TYPES, NPC_DATA, SHOP_ITEMS, BUILDING_TYPES, formatCurrency,
  CROP_TYPES, FARM_PLOTS, QUEST_TEMPLATES, COMPANION_TYPES, RANK_TIERS, CLASS_TYPES,
  CLASS_SKILLS, EQUIPMENT_SLOTS, CLASS_ACTIVE_SKILLS, HUNTING_GROUND_RANKS, HUNTING_GROUNDS,
  DUNGEON_RANKS, DUNGEONS
} from './gameConfig';

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

    this.gateObjects = {};
    this.nearbyGate = null;
    this.huntWaveCounts = {};

    this.dungeonGateObjects = {};
    this.nearbyDungeonGate = null;
    this.isInsideDungeon = false;
    this.currentDungeonGate = null;
    this.dungeonWaveRemaining = 0;
    this.dungeonExitGate = null;

    this.hiredCompanionId = null;
    this.companionSprite = null;
    this.companionClass = null;
    this.companionAutoSkillTimer = null;
    this.companionHp = 0;
    this.companionMaxHp = 0;
    this.companionKO = false;
    this.companionAttackCooldownEnd = 0;
    this.companionLevel = 1;
    this.companionExp = 0;

    this.activeSkillCooldownEndTime = 0;
    this.companionBuffEndTime = 0;

    this.onStatsUpdate = null;
    this.onShopToggle = null;
    this.onDialogue = null;
    this.onLog = null;
    this.onFarmMenuOpen = null;
    this.onTavernOpen = null;
    this.onCooldownUpdate = null;

    this.godMode = false;
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
    this.physics.world.setBounds(-50, -50, 900, 700);

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
      if (data.hiredCompanionId !== undefined) this.hiredCompanionId = data.hiredCompanionId;
      // 예전 저장 데이터에 있던 'traveler'는 이번에 개성 있는 동료 4명(roy/mira/sein/pie)으로
      // 바뀌면서 사라진 id예요. 그대로 두면 COMPANION_TYPES에서 못 찾아 에러가 나니,
      // 가장 비슷한 기본형인 'roy'로 자동 변환해줘요.
      if (this.hiredCompanionId === 'traveler') this.hiredCompanionId = 'roy';
      if (data.companionClass !== undefined) this.companionClass = data.companionClass;
      if (data.companionLevel !== undefined) this.companionLevel = data.companionLevel;
      if (data.companionExp !== undefined) this.companionExp = data.companionExp;
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
    for (let i = 0; i < GAME_CONFIG.wolfCount; i++) {
      this.entities.add(this.createEntity(Phaser.Math.Between(50, 750), Phaser.Math.Between(50, 550), 'wolf'));
    }

    this.player = this.add.sprite(400, 300, 'player', 5);
    this.player.setScale(5);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

    this.facingDirection = 'down';
    this.directionFrames = { left: 0, down: 1, up: 2, right: 3, idleLeft: 4, idleDown: 5, idleUp: 6, idleRight: 7 };

    if (this.hiredCompanionId) {
      this.spawnCompanion(this.hiredCompanionId);
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.eKey = this.input.keyboard.addKey('E');
    this.hKey = this.input.keyboard.addKey('H');
    this.fKey = this.input.keyboard.addKey('F');
    this.qKey = this.input.keyboard.addKey('Q');
    this.gKey = this.input.keyboard.addKey('G');

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

      if (this.hp <= 0 && !this.isDead) {
        this.isDead = true;
        this.handleDeath(info.name);
      }

      this.syncStatsToReact();
    });

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

    this.houses = this.add.group();
    const housePositions = [
      { x: 650, y: 450, type: 'myHouse' },
      { x: 700, y: 150, type: 'house2' },
      { x: 100, y: 500, type: 'house3' },
      { x: 50, y: 50, type: 'house4' }
    ];
    housePositions.push({ x: 780, y: 550, type: 'tavern' });

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

    this.hpText = this.add.text(20, 20, 'HP: ' + this.hp, { fontSize: '20px', color: '#ff4444' });

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

    this.isInsideHouse = false;
    this.isDead = false;

    this.syncStatsToReact();
  }

  update(time, delta) {
    if (this.hp <= 0) return;

    this.updateGameClock(delta);

    if (this.isInsideHouse) {
      this.handleMovement();
      this.checkHouseExit();
      this.handleReceptionistInteract();
      return;
    }

    this.handleMovement();
    this.updateCompanionFollow();

    const cooldownRemaining = Math.max(0, this.activeSkillCooldownEndTime - this.time.now);
    if (this.onCooldownUpdate) this.onCooldownUpdate(cooldownRemaining);

    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      this.useActiveSkill();
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
          const baseAttackPower = this.attackPower + (isNightBonusActive ? myClassInfo.nightAttackBonus : 0);

          const damageResult = this.calculateDamage(baseAttackPower);
          entity.hp -= damageResult.damage;
          this.addLog(
            damageResult.isCrit ? `치명타! ${info.name}에게 ${damageResult.damage} 피해` : `${info.name}에게 ${damageResult.damage} 피해`,
            'kill'
          );

          this.playHitSound();
          this.reduceWeaponDurability();
          this.createAttackSlashEffect(entity.x, entity.y);

          if (this.companionSprite && !this.companionKO) {
            const companionDistance = Phaser.Math.Distance.Between(
              this.companionSprite.x, this.companionSprite.y, entity.x, entity.y
            );
            if (companionDistance < 150) {
              const companionMultiplier = myClassInfo?.companionBonusMultiplier || 1;
              const isBuffActive = this.time.now < this.companionBuffEndTime;
              const buffMultiplier = isBuffActive ? CLASS_ACTIVE_SKILLS.summoner.buffMultiplier : 1;
              const effectiveAttackBonus = COMPANION_TYPES[this.hiredCompanionId].attackBonus + (this.companionLevel - 1) * 2;

              entity.hp -= effectiveAttackBonus * companionMultiplier * buffMultiplier;
            }
          }

          if (entity.hp <= 0) {
            this.defeatMonster(entity, info);
          }
        }
      });

      if (this.getPlayerAttackType() === 'ranged') {
        this.performRangedBasicAttack();
      }
    }

    if (!this.isInsideDungeon) {
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

      this.nearbyFarmPlot = null;
      FARM_PLOTS.forEach(plot => {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, plot.x, plot.y);
        if (distance < 80) this.nearbyFarmPlot = plot;
      });

      if (Phaser.Input.Keyboard.JustDown(this.fKey) && this.nearbyFarmPlot) {
        this.handleFarmInteract(this.nearbyFarmPlot.id);
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

      if (this.nearbyDungeonGate) {
        const rankInfo = DUNGEON_RANKS[this.nearbyDungeonGate.rank];
        this.buildingNameText.setText(`${rankInfo.name} 입구 (G키로 입장)`);
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
        } else if (this.nearbyGate) {
          this.enterHuntingGround(this.nearbyGate.id);
        }
      }
    } else {
      this.handleDungeonExit();
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

      this.furnitureObjects = this.furnitureObjects || [];
      this.furnitureObjects.forEach(f => f.destroy());
      this.furnitureObjects = [];

      info.furniture.forEach(item => {
        const furniture = this.add.sprite(item.x, item.y, item.spriteKey);
        furniture.setScale(item.scale || 4);
        this.physics.add.existing(furniture, true);
        this.physics.add.collider(this.player, furniture);
        this.furnitureObjects.push(furniture);
      });

      if (info.isTavern) {
        const counter = this.add.rectangle(600, 150, 140, 30, 0x5a3a2a);
        counter.setStrokeStyle(2, 0x3a2416);
        this.physics.add.existing(counter, true);
        this.physics.add.collider(this.player, counter);
        this.furnitureObjects.push(counter);

        const receptionistInfo = NPC_DATA['rina'];
        const receptionist = this.add.sprite(600, 110, receptionistInfo.spriteKey, 1);
        receptionist.setScale(5);
        receptionist.npcType = 'rina';
        this.physics.add.existing(receptionist, true);
        this.physics.add.collider(this.player, receptionist);
        this.furnitureObjects.push(receptionist);

        this.receptionistNpc = receptionist;

        if (this.onTavernOpen) this.onTavernOpen(true);
      }

    } else {
      this.isInsideHouse = false;
      FARM_PLOTS.forEach(plot => this.refreshFarmPlotVisual(plot.id));
      this.cameras.main.setBackgroundColor('#4a7c3c');

      this.buildingNameText.setVisible(false);
      this.receptionistNpc = null;

      if (this.companionSprite) {
        this.companionSprite.setVisible(true);
        this.companionSprite.body.enable = true;
        this.companionSprite.x = this.player.x - 60;
        this.companionSprite.y = this.player.y;
      }

      this.setOutdoorObjectsActive(true);

      if (this.floorTileSprite) {
        this.floorTileSprite.destroy();
        this.floorTileSprite = null;
      }

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
    return this.isInsideHouse || this.isInsideDungeon;
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

    [this.gateObjects, this.dungeonGateObjects].forEach(objMap => {
      Object.values(objMap).forEach(({ gateSprite, label }) => {
        gateSprite.setVisible(isActive);
        gateSprite.body.enable = isActive;
        label.setVisible(isActive);
      });
    });
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

  refreshFarmPlotVisual(plotId) {
    const farmObj = this.farmPlots[plotId];
    if (!farmObj) return;

    if (this.isIndoors()) {
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
      hiredCompanionId: this.hiredCompanionId,
      companionClass: this.companionClass,
      companionLevel: this.companionLevel,
      companionExp: this.companionExp,
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
        hiredCompanionId: this.hiredCompanionId,
        companionClass: this.companionClass,
        companionLevel: this.companionLevel,
        companionExp: this.companionExp,
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

    this.attackPower = 10 + s.str * 2 + this.bonusStats.attack;
    this.maxHp = 100 + s.vit * 8 + this.bonusStats.maxHp;
    this.moveSpeed = 200 + this.bonusStats.speed;
    this.defense = s.vit * 1 + this.bonusStats.defense;
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

  calculateDamage(baseAttackPower) {
    const minPercent = Math.min(130, 70 + this.precision) / 100;
    const maxPercent = 1.3;

    const variance = minPercent + Math.random() * (maxPercent - minPercent);
    let damage = baseAttackPower * variance;

    const isCrit = Math.random() * 100 < this.critChance;
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

    const classIds = Object.keys(CLASS_TYPES);
    this.companionClass = classIds[Phaser.Math.Between(0, classIds.length - 1)];
    this.companionLevel = 1;
    this.companionExp = 0;

    this.spawnCompanion(companionId);

    const assignedClassInfo = CLASS_TYPES[this.companionClass];
    this.addLog(`${info.name}을(를) 고용했어요! (${assignedClassInfo.icon} ${assignedClassInfo.name})`, 'gain');
    // 동료마다 다른 대사(hireLine)가 있으면 그것도 이어서 보여줌 (개성을 느낄 수 있게)
    if (info.hireLine) this.addLog(info.hireLine, 'info');
    this.syncStatsToReact();
  }

  dismissCompanion() {
    if (!this.hiredCompanionId) return;

    // 이름을 못 찾는 경우(데이터에 없는 id)에도 최소한 에러 없이 해고 자체는 되도록,
    // info가 없으면 "동료"라는 기본 이름으로 대신 처리함
    const info = COMPANION_TYPES[this.hiredCompanionId] || { name: '동료' };

    if (this.companionSprite) {
      this.companionSprite.destroy();
      this.companionSprite = null;
    }

    if (this.companionAutoSkillTimer) {
      this.companionAutoSkillTimer.remove();
      this.companionAutoSkillTimer = null;
    }

    this.hiredCompanionId = null;
    this.companionClass = null;
    this.companionHp = 0;
    this.companionMaxHp = 0;
    this.companionKO = false;

    this.addLog(`${info.name}과(와) 헤어졌어요`, 'info');
    this.syncStatsToReact();
  }

  spawnCompanion(companionId) {
    const info = COMPANION_TYPES[companionId];
    if (!info) return;

    this.companionMaxHp = info.maxHp;
    this.companionHp = info.maxHp;
    this.companionKO = false;

    const spawnX = this.player.x - 60;
    const spawnY = this.player.y;

    this.companionSprite = this.add.sprite(spawnX, spawnY, info.spriteKey, 1);
    this.companionSprite.setScale(5);

    // 동료마다 다른 색조(tintColor)를 입혀서, 같은 그림이라도 최소한의 외형 구분이 되게 함
    if (info.tintColor) this.companionSprite.setTint(info.tintColor);

    this.physics.add.existing(this.companionSprite);
    this.companionSprite.body.setCollideWorldBounds(true);

    this.physics.add.overlap(this.companionSprite, this.entities, (companionObj, entity) => {
      const info2 = ENTITY_TYPES[entity.entityType];
      if (info2.category !== 'hostile_monster' || !entity.active) return;
      if (this.companionKO) return;

      // 세인처럼 damageReduction 특성이 있으면, 받는 피해를 그만큼 줄여줌
      const companionInfo = COMPANION_TYPES[this.hiredCompanionId];
      const reductionPercent = companionInfo?.trait?.type === 'damageReduction' ? companionInfo.trait.value : 0;
      const actualDamage = Math.round(info2.damage * (1 - reductionPercent / 100));

      this.companionHp -= actualDamage;
      this.addLog(`동료가 ${info2.name}에게 ${actualDamage} 피해를 입음`, 'death');

      if (this.companionHp <= 0) {
        this.handleCompanionKO();
      }
    });

    this.startCompanionAutoSkillTimer();
  }

  handleCompanionKO() {
    this.companionKO = true;
    this.companionSprite.setVisible(false);
    this.companionSprite.body.enable = false;

    this.addLog('동료가 쓰러졌어요...', 'death');

    this.time.delayedCall(15000, () => {
      if (!this.companionSprite) return;
      this.companionKO = false;
      this.companionHp = this.companionMaxHp;
      this.companionSprite.setVisible(true);
      this.companionSprite.body.enable = true;
      this.companionSprite.x = this.player.x - 60;
      this.companionSprite.y = this.player.y;
      this.addLog('동료가 다시 일어났어요', 'gain');
    });
  }

  updateCompanionFollow() {
    if (!this.companionSprite || this.companionKO) return;

    const lowHpThreshold = this.companionMaxHp * 0.3;
    const isLowHp = this.companionHp < lowHpThreshold;

    if (isLowHp) {
      const nearbyThreat = this.findNearestMonster(120, this.companionSprite.x, this.companionSprite.y);
      if (nearbyThreat) {
        const fleeAngle = Phaser.Math.Angle.Between(nearbyThreat.x, nearbyThreat.y, this.companionSprite.x, this.companionSprite.y);
        this.companionSprite.body.setVelocity(Math.cos(fleeAngle) * 190, Math.sin(fleeAngle) * 190);
        this.updateCompanionFacing(this.companionSprite.x + Math.cos(fleeAngle), this.companionSprite.y + Math.sin(fleeAngle));
        return;
      }
    }

    const threatToPlayer = this.findNearestMonster(180, this.player.x, this.player.y);
    const nearbyTarget = threatToPlayer || this.findNearestMonster(220, this.companionSprite.x, this.companionSprite.y);

    if (nearbyTarget) {
      const attackRange = 55;
      const distanceToTarget = Phaser.Math.Distance.Between(
        this.companionSprite.x, this.companionSprite.y, nearbyTarget.x, nearbyTarget.y
      );

      if (distanceToTarget > attackRange) {
        const angle = Phaser.Math.Angle.Between(this.companionSprite.x, this.companionSprite.y, nearbyTarget.x, nearbyTarget.y);
        this.companionSprite.body.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
        this.updateCompanionFacing(nearbyTarget.x, nearbyTarget.y);
      } else {
        this.companionSprite.body.setVelocity(0, 0);
        this.updateCompanionFacing(nearbyTarget.x, nearbyTarget.y);

        if (this.time.now >= this.companionAttackCooldownEnd) {
          this.companionBasicAttack(nearbyTarget);
          this.companionAttackCooldownEnd = this.time.now + 1000;
        }
      }
      return;
    }

    const followDistance = 70;
    const distanceToPlayer = Phaser.Math.Distance.Between(
      this.companionSprite.x, this.companionSprite.y, this.player.x, this.player.y
    );

    if (distanceToPlayer > followDistance) {
      const angle = Phaser.Math.Angle.Between(this.companionSprite.x, this.companionSprite.y, this.player.x, this.player.y);
      this.companionSprite.body.setVelocity(Math.cos(angle) * 180, Math.sin(angle) * 180);
      this.updateCompanionFacing(this.player.x, this.player.y);
    } else {
      this.companionSprite.body.setVelocity(0, 0);
    }
  }

  updateCompanionFacing(targetX, targetY) {
    const dx = targetX - this.companionSprite.x;
    const dy = targetY - this.companionSprite.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.companionSprite.setFrame(dx > 0 ? this.directionFrames.right : this.directionFrames.left);
    } else {
      this.companionSprite.setFrame(dy > 0 ? this.directionFrames.down : this.directionFrames.up);
    }
  }

  companionBasicAttack(target) {
    const companionInfo = COMPANION_TYPES[this.hiredCompanionId];
    const targetInfo = ENTITY_TYPES[target.entityType];
    if (!companionInfo) return;

    const isBuffActive = this.time.now < this.companionBuffEndTime;
    const buffMultiplier = isBuffActive ? CLASS_ACTIVE_SKILLS.summoner.buffMultiplier : 1;
    const effectiveAttackBonus = companionInfo.attackBonus + (this.companionLevel - 1) * 2;
    let damage = Math.round(effectiveAttackBonus * 2 * buffMultiplier);

    // 미라처럼 critBonus 특성이 있으면, 그 확률만큼 추가 피해(2배)가 터짐
    let isCompanionCrit = false;
    if (companionInfo.trait?.type === 'critBonus' && Phaser.Math.Between(1, 100) <= companionInfo.trait.value) {
      damage *= 2;
      isCompanionCrit = true;
    }

    target.hp -= damage;
    this.addLog(isCompanionCrit ? `동료의 강타! ${targetInfo.name}에게 ${damage} 피해` : `동료가 ${targetInfo.name}에게 ${damage} 피해`, 'kill');
    this.createParticleBurst(target.x, target.y, 0xffe066, isCompanionCrit ? 12 : 6);

    this.gainCompanionExp(3);

    if (target.hp <= 0) this.defeatMonster(target, targetInfo);
  }

  gainCompanionExp(amount) {
    // 파이처럼 expBonus 특성이 있으면, 얻는 경험치 자체를 배율만큼 늘려줌
    const companionInfo = COMPANION_TYPES[this.hiredCompanionId];
    const expMultiplier = companionInfo?.trait?.type === 'expBonus' ? companionInfo.trait.value : 1;
    this.companionExp += Math.round(amount * expMultiplier);
    const expNeeded = this.companionLevel * 20;

    if (this.companionExp >= expNeeded) {
      this.companionExp -= expNeeded;
      this.companionLevel++;
      this.companionMaxHp += 10;
      this.companionHp = this.companionMaxHp;
      this.addLog(`동료가 레벨 ${this.companionLevel}(으)로 성장했어요!`, 'gain');
      if (this.companionSprite) this.createParticleBurst(this.companionSprite.x, this.companionSprite.y, 0x7cc576, 12);
    }

    this.syncStatsToReact();
  }

  startCompanionAutoSkillTimer() {
    if (this.companionAutoSkillTimer) {
      this.companionAutoSkillTimer.remove();
      this.companionAutoSkillTimer = null;
    }
    if (!this.companionClass) return;

    const skill = CLASS_ACTIVE_SKILLS[this.companionClass];
    if (!skill) return;

    this.companionAutoSkillTimer = this.time.addEvent({
      delay: skill.cooldownMs, loop: true,
      callback: () => this.useCompanionAutoSkill()
    });
  }

  useCompanionAutoSkill() {
    if (!this.companionSprite || !this.companionClass || this.companionKO) return;

    const skill = CLASS_ACTIVE_SKILLS[this.companionClass];
    const companionInfo = COMPANION_TYPES[this.hiredCompanionId];
    if (!skill || !companionInfo) return;

    const effectiveAttackBonus = companionInfo.attackBonus + (this.companionLevel - 1) * 2;
    const baseDamage = effectiveAttackBonus * 3;

    if (this.companionClass === 'warrior' || this.companionClass === 'archer' || this.companionClass === 'rogue') {
      const target = this.findNearestMonster(200, this.companionSprite.x, this.companionSprite.y);
      if (!target) return;

      const targetInfo = ENTITY_TYPES[target.entityType];
      target.hp -= baseDamage;
      this.createParticleBurst(target.x, target.y, 0xffe066, 10);
      this.addLog(`동료의 ${skill.name}! ${baseDamage} 피해`, 'kill');
      this.gainCompanionExp(5);

      if (target.hp <= 0) this.defeatMonster(target, targetInfo);
    } else if (this.companionClass === 'mage') {
      const target = this.findNearestMonster(220, this.companionSprite.x, this.companionSprite.y);
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

      this.addLog(`동료의 ${skill.name}! 광역 피해`, 'kill');
      this.gainCompanionExp(5);
    } else if (this.companionClass === 'priest') {
      const healAmount = Math.round(skill.healAmount / 2);
      this.hp = Math.min(this.maxHp, this.hp + healAmount);
      this.hpText.setText('HP: ' + this.hp);
      this.createParticleBurst(this.player.x, this.player.y, 0x7ec8e3, 10);
      this.addLog(`동료의 ${skill.name}! HP +${healAmount}`, 'gain');
      this.gainCompanionExp(4);
      this.syncStatsToReact();
    } else if (this.companionClass === 'summoner') {
      const buffAmount = 5;
      this.bonusStats.attack += buffAmount;
      this.recalculateDerivedStats();
      this.createParticleBurst(this.player.x, this.player.y, 0xc77dff, 10);
      this.addLog(`동료의 ${skill.name}! 공격력이 잠시 강해졌어요`, 'gain');
      this.gainCompanionExp(4);

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

    if (this.playerClass === 'warrior' || this.playerClass === 'archer' || this.playerClass === 'rogue') {
      const target = this.findNearestMonster(skill.range);
      if (!target) {
        this.addLog('사거리 안에 몬스터가 없어요', 'info');
      } else {
        const targetInfo = ENTITY_TYPES[target.entityType];
        const boostedAttack = this.attackPower * skill.damageMultiplier;

        const finalDamage = this.playerClass === 'rogue'
          ? Math.round(boostedAttack * (this.critDamage / 100))
          : Math.round(boostedAttack);

        target.hp -= finalDamage;
        this.createParticleBurst(target.x, target.y, 0xffe066, 16);
        this.addLog(`${skill.name}! ${finalDamage} 피해`, 'kill');

        if (target.hp <= 0) this.defeatMonster(target, targetInfo);
        skillUsed = true;
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
      const healAmount = skill.healAmount + this.magicPower;
      this.hp = Math.min(this.maxHp, this.hp + healAmount);
      this.hpText.setText('HP: ' + this.hp);
      this.createParticleBurst(this.player.x, this.player.y, 0x7ec8e3, 14);
      this.addLog(`${skill.name}! HP +${healAmount}`, 'gain');
      skillUsed = true;
    } else if (this.playerClass === 'summoner') {
      if (!this.companionSprite) {
        this.addLog('버프를 걸어줄 동료가 없어요', 'info');
      } else {
        this.companionBuffEndTime = this.time.now + skill.buffDurationMs;
        this.createParticleBurst(this.companionSprite.x, this.companionSprite.y, 0xc77dff, 18);
        this.addLog(`${skill.name}! 동료가 강해졌어요`, 'gain');
        skillUsed = true;
      }
    }

    if (skillUsed) {
      const actualCooldown = skill.cooldownMs * (1 - this.cooldownReduction / 100);
      this.activeSkillCooldownEndTime = this.time.now + actualCooldown;
    }
  }

  defeatMonster(entity, info) {
    this.addToInventory(entity.entityType);
    this.totalMonsterKills++;

    this.checkNewlyUnlockedSkills();

    this.addLog(`${info.name} 처치!`, 'kill');
    this.addLog(`${info.name} +1 획득`, 'gain');
    this.gainExp(info.exp);
    this.createParticleBurst(entity.x, entity.y, 0xff0000, 12);

    if (entity.encounterType === 'hunt') {
      if (entity.isBoss) this.tryDropRareItem(entity.encounterRankInfo);
      entity.destroy();
      this.huntWaveCounts[entity.encounterGateId] = Math.max(0, this.huntWaveCounts[entity.encounterGateId] - 1);
      if (this.huntWaveCounts[entity.encounterGateId] === 0) {
        this.addLog('사냥터 클리어!', 'gain');
      }
      return;
    }

    if (entity.encounterType === 'dungeon') {
      if (entity.isBoss) this.tryDropRareItem(entity.encounterRankInfo);
      entity.destroy();
      this.dungeonWaveRemaining = Math.max(0, this.dungeonWaveRemaining - 1);
      if (this.dungeonWaveRemaining === 0) {
        this.spawnDungeonExitDoor();
      }
      return;
    }

    entity.isHarvested = true;
    this.refreshEntityVisual(entity);

    setTimeout(() => {
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

  spawnDungeonExitDoor() {
    if (this.dungeonExitGate) return;

    const door = this.add.rectangle(400, 480, 60, 60, 0x2d5016);
    door.setStrokeStyle(4, 0xffe066, 1);
    this.physics.add.existing(door, true);

    this.dungeonExitGate = door;
    this.addLog('던전 클리어! 출구 문이 열렸어요', 'gain');
  }

  handleDungeonExit() {
    if (!this.dungeonExitGate) return;

    const distance = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.dungeonExitGate.x, this.dungeonExitGate.y
    );

    if (distance < 80 && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.exitDungeon();
    }
  }

  exitDungeon() {
    this.isInsideDungeon = false;
    this.setOutdoorObjectsActive(true);

    if (this.dungeonExitGate) {
      this.dungeonExitGate.destroy();
      this.dungeonExitGate = null;
    }

    if (this.currentDungeonGate) {
      this.player.x = this.currentDungeonGate.x;
      this.player.y = this.currentDungeonGate.y + 80;
    }
    this.currentDungeonGate = null;

    this.buildingNameText.setVisible(false);
    this.addLog('던전에서 나왔어요', 'info');
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
    try {
      const ctx = this.sound.context;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
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
}