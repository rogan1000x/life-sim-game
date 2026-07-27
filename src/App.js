import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';

const GAME_CONFIG = {
  treeCount: 3,
  stoneCount: 2,
  rabbitCount: 3,
  wolfCount: 4,
  wolfRespawnMin: 5000,
  wolfRespawnMax: 10000
};

const ENTITY_TYPES = {
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

const NPC_DATA = {
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

const SHOP_ITEMS = [
  { id: 'potion_small', name: '작은 포션', price: 20, heal: 30 },
  { id: 'potion_large', name: '큰 포션', price: 50, heal: 100 }
];

function App() {
  const gameRef = useRef(null);
  const allocateStatRef = useRef(null);
  const godModeRef = useRef(false);
  const revivePlayerRef = useRef(null);
  const buyItemRef = useRef(null);
  const useItemRef = useRef(null);
  const [playerStats, setPlayerStats] = useState({
    level: 1,
    exp: 0,
    expNeeded: 100,
    hp: 100,
    maxHp: 100,
    statPoints: 0,
    attackPower: 10,
    moveSpeed: 200,
    gold: 0,
    inventory: {}
  });

  const [showAdmin, setShowAdmin] = useState(false);
  const [godMode, setGodMode] = useState(false);
  const [dialogue, setDialogue] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showShop, setShowShop] = useState(false);
  useEffect(() => {
    if (!gameStarted) return;

    let player;
    let cursors;
    let entities;
    let spaceKey;
    let level = 1;
    let exp = 0;
    let inventory = {};
    let hpText;
    let statPoints = 0;
    let attackPower = 10;
    let maxHp = 100;
    let moveSpeed = 200;
    let hp = maxHp;
    let gameScene;
    let npcs;
    let nearbyNpc = null;
    let dialogueIndex = 0;
    let isKnockedBack = false;
    let gold = 0;

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'phaser-game',
      backgroundColor: '#4a7c3c',
      physics: {
        default: 'arcade',
        arcade: { debug: false }
      },
      scene: {
        preload: preload,
        create: create,
        update: update
      }
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    let audioContext = null;
    function getAudioContext() {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      return audioContext;
    }

    function playSound(frequency, type = 'piano', duration = 0.5) {
      const ctx = getAudioContext();
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

    function playLevelUpSound() {
      playSound(600, 'sine', 0.15);
      setTimeout(() => playSound(900, 'sine', 0.15), 150);
    }

    function playHitSound() {
      playSound(120, 'sawtooth', 0.2);
    }

    function saveGame() {
      const saveData = {
        level, exp, hp, maxHp, statPoints,
        attackPower, moveSpeed, gold, inventory
      };
      localStorage.setItem('lifeSimSave', JSON.stringify(saveData));
    }

    function syncStatsToReact() {
      setPlayerStats({
        level: level,
        exp: exp,
        expNeeded: level * 100,
        hp: hp,
        maxHp: maxHp,
        statPoints: statPoints,
        attackPower: attackPower,
        moveSpeed: moveSpeed,
        gold: gold,
        inventory: { ...inventory }
      });
      saveGame();
    }

    function showDialogueText(text) {
      setDialogue(text);
    }

    function gainExp(amount) {
      exp += amount;
      const expNeeded = level * 100;

      if (exp >= expNeeded) {
        exp -= expNeeded;
        level++;
        hp = maxHp;
        statPoints++;
        hpText.setText('HP: ' + hp);
        playLevelUpSound();
        createParticleBurst(gameScene, player.x, player.y, 0xffff00, 16);
      }

      syncStatsToReact();
    }

    function createParticleBurst(scene, x, y, color, count = 8) {
      for (let i = 0; i < count; i++) {
        const particle = scene.add.circle(x, y, 4, color);

        const angle = (Math.PI * 2 * i) / count;
        const speed = Phaser.Math.Between(50, 100);
        const targetX = x + Math.cos(angle) * speed;
        const targetY = y + Math.sin(angle) * speed;

        scene.tweens.add({
          targets: particle,
          x: targetX,
          y: targetY,
          alpha: 0,
          duration: 400,
          onComplete: () => particle.destroy()
        });
      }
    }

    function allocateStat(statType) {
      if (statPoints <= 0) return;

      statPoints--;

      if (statType === 'attack') {
        attackPower += 5;
      } else if (statType === 'hp') {
        maxHp += 20;
        hp += 20;
      } else if (statType === 'speed') {
        moveSpeed += 20;
      }

      syncStatsToReact();
    }
    allocateStatRef.current = allocateStat;

    function revivePlayer() {
      hp = maxHp;
      hpText.setText('HP: ' + hp);
      syncStatsToReact();
    }
    revivePlayerRef.current = revivePlayer;

// 상점 아이템 구매: 즉시 사용하지 않고 인벤토리에 저장만 함
function buyItem(item) {
  if (gold < item.price) return; // 골드 부족하면 구매 불가

  gold -= item.price;
  if (!inventory[item.id]) {
    inventory[item.id] = 0;
  }
  inventory[item.id]++; // 인벤토리에 아이템 개수 추가

  syncStatsToReact();
}
buyItemRef.current = buyItem;

// 인벤토리에 있는 아이템을 실제로 사용 (예: 포션 마시기)
function useItem(itemId) {
  if (!inventory[itemId] || inventory[itemId] <= 0) return; // 보유 개수 없으면 사용 불가

  const item = SHOP_ITEMS.find(i => i.id === itemId); // 아이템 정보(회복량 등) 찾기
  if (!item) return;

  inventory[itemId]--; // 사용했으니 개수 1개 차감
  hp = Math.min(maxHp, hp + item.heal); // 최대체력 넘지 않게 회복
  hpText.setText('HP: ' + hp);
  syncStatsToReact();
}
useItemRef.current = useItem;

    function useItem(itemId) {
      if (!inventory[itemId] || inventory[itemId] <= 0) return;

      const item = SHOP_ITEMS.find(i => i.id === itemId);
      if (!item) return;

      inventory[itemId]--;
      hp = Math.min(maxHp, hp + item.heal);
      hpText.setText('HP: ' + hp);
      syncStatsToReact();
    }
    useItemRef.current = useItem;

    function addToInventory(entityKey) {
      if (!inventory[entityKey]) {
        inventory[entityKey] = 0;
      }
      inventory[entityKey]++;
      syncStatsToReact();
    }

    function createEntity(scene, x, y, typeKey) {
      const info = ENTITY_TYPES[typeKey];

      const entity = scene.add.circle(x, y, info.radius, info.color);
      entity.entityType = typeKey;
      entity.hp = info.hp;
      entity.maxHp = info.hp;

      if (info.category === 'resource') {
        scene.physics.add.existing(entity, true);
      } else if (info.category === 'passive_animal') {
        scene.physics.add.existing(entity);
        entity.body.setCollideWorldBounds(true);
        entity.body.setBounce(1, 1);
        const vx = Phaser.Math.Between(-50, 50);
        const vy = Phaser.Math.Between(-50, 50);
        entity.body.setVelocity(vx, vy);
      } else if (info.category === 'hostile_monster') {
        scene.physics.add.existing(entity);
        entity.body.setCollideWorldBounds(true);
      }

      return entity;
    }

    function getEdgeSpawnPosition() {
      const side = Phaser.Math.Between(0, 3);
      if (side === 0) return { x: Phaser.Math.Between(0, 800), y: -30 };
      if (side === 1) return { x: Phaser.Math.Between(0, 800), y: 630 };
      if (side === 2) return { x: -30, y: Phaser.Math.Between(0, 600) };
      return { x: 830, y: Phaser.Math.Between(0, 600) };
    }

    function preload() {
      this.load.image('player', 'assets/player_init.jpg');
    }

    function create() {
      gameScene = this;
      this.physics.world.setBounds(-50, -50, 900, 700);

      const savedData = localStorage.getItem('lifeSimSave');
      if (savedData) {
        const data = JSON.parse(savedData);
        level = data.level;
        exp = data.exp;
        hp = data.hp;
        maxHp = data.maxHp;
        statPoints = data.statPoints;
        attackPower = data.attackPower;
        moveSpeed = data.moveSpeed;
        gold = data.gold;
        inventory = data.inventory;
      }

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

      entities = this.add.group();

      const resourceSpawns = [
        { x: 150, y: 150, type: 'tree' },
        { x: 600, y: 200, type: 'tree' },
        { x: 300, y: 450, type: 'tree' },
        { x: 500, y: 400, type: 'stone' },
        { x: 200, y: 350, type: 'stone' }
      ];
      resourceSpawns.forEach(spawn => {
        entities.add(createEntity(this, spawn.x, spawn.y, spawn.type));
      });

      for (let i = 0; i < GAME_CONFIG.rabbitCount; i++) {
        const pos = getEdgeSpawnPosition();
        entities.add(createEntity(this, pos.x, pos.y, 'rabbit'));
      }

      for (let i = 0; i < GAME_CONFIG.wolfCount; i++) {
        const mx = Phaser.Math.Between(50, 750);
        const my = Phaser.Math.Between(50, 550);
        entities.add(createEntity(this, mx, my, 'wolf'));
      }

      player = this.add.sprite(400, 300, 'player');
      player.setDisplaySize(80, 80);
      this.physics.add.existing(player);
      player.body.setCollideWorldBounds(true);

      cursors = this.input.keyboard.createCursorKeys();

      this.physics.add.collider(player, entities);

      this.physics.add.overlap(player, entities, (playerObj, entity) => {
        const info = ENTITY_TYPES[entity.entityType];
        if (info.category !== 'hostile_monster' || !entity.active) return;
        if (godModeRef.current) return;
        if (hp <= 0) return;

        hp -= info.damage;
        hp = Math.max(0, hp);
        hpText.setText('HP: ' + hp);
        playHitSound();

        player.setTint(0xff0000);
        this.time.delayedCall(150, () => player.clearTint());

        const knockbackAngle = Phaser.Math.Angle.Between(entity.x, entity.y, player.x, player.y);
        player.body.setVelocity(Math.cos(knockbackAngle) * 300, Math.sin(knockbackAngle) * 300);

        isKnockedBack = true;
        setTimeout(() => {
          isKnockedBack = false;
        }, 200);

        syncStatsToReact();
      });

      spaceKey = this.input.keyboard.addKey('SPACE');
      const eKey = this.input.keyboard.addKey('E');
      this.eKey = eKey;

      npcs = this.add.group();
      const npc = this.add.rectangle(400, 150, 40, 60, NPC_DATA.villager.color);
      npc.npcType = 'villager';
      this.physics.add.existing(npc, true);
      npcs.add(npc);
      this.physics.add.collider(player, npcs);

      hpText = this.add.text(20, 20, 'HP: ' + hp, {
        fontSize: '20px',
        color: '#ff4444'
      });

      syncStatsToReact();
    }

    function update() {
      let velocityX = 0;
      let velocityY = 0;
      if (hp <= 0) return;

      if (!isKnockedBack) {
        if (cursors.left.isDown) {
          velocityX = -moveSpeed;
          player.setFlipX(true);
        } else if (cursors.right.isDown) {
          velocityX = moveSpeed;
          player.setFlipX(false);
        }

        if (cursors.up.isDown) {
          velocityY = -moveSpeed;
        } else if (cursors.down.isDown) {
          velocityY = moveSpeed;
        }

        player.body.setVelocity(velocityX, velocityY);
      }

      entities.getChildren().forEach(entity => {
        if (!entity.active) return;
        const info = ENTITY_TYPES[entity.entityType];

        if (info.category === 'hostile_monster') {
          const angle = Phaser.Math.Angle.Between(entity.x, entity.y, player.x, player.y);
          entity.body.setVelocity(
            Math.cos(angle) * info.speed,
            Math.sin(angle) * info.speed
          );
        }
      });

      if (Phaser.Input.Keyboard.JustDown(spaceKey)) {
        entities.getChildren().forEach(entity => {
          if (!entity.active) return;

          const distance = Phaser.Math.Distance.Between(
            player.x, player.y, entity.x, entity.y
          );
          if (distance >= 100) return;

          const info = ENTITY_TYPES[entity.entityType];

          if (info.category === 'resource' || info.category === 'passive_animal') {
            entity.setActive(false);
            entity.setVisible(false);
            entity.body.enable = false;

            addToInventory(entity.entityType);
            playSound(info.sound);
            gainExp(info.exp);

            gold += info.sellPrice;
            syncStatsToReact();

            createParticleBurst(this, entity.x, entity.y, info.color);

            setTimeout(() => {
              entity.setActive(true);
              entity.setVisible(true);
              entity.body.enable = true;
            }, Phaser.Math.Between(5000, 15000));

          } else if (info.category === 'hostile_monster') {
            entity.hp -= attackPower;
            playHitSound();

            if (entity.hp <= 0) {
              entity.setActive(false);
              entity.setVisible(false);
              entity.body.enable = false;

              addToInventory(entity.entityType);
              gainExp(info.exp);

              gold += info.sellPrice;
              syncStatsToReact();

              createParticleBurst(this, entity.x, entity.y, 0xff0000, 12);

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

      nearbyNpc = null;
      npcs.getChildren().forEach(npc => {
        const distance = Phaser.Math.Distance.Between(player.x, player.y, npc.x, npc.y);
        if (distance < 80) {
          nearbyNpc = npc;
        }
      });

      if (Phaser.Input.Keyboard.JustDown(this.eKey) && nearbyNpc) {
        setShowShop(prev => !prev);
      }
    }

    return () => {
      game.destroy(true);
    };
  }, [gameStarted]);

  useEffect(() => {
    godModeRef.current = godMode;
  }, [godMode]);

  useEffect(() => {
    function handleKeyPress(e) {
      if (e.key === 'p' || e.key === 'P') {
        setShowAdmin(prev => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  if (!gameStarted) {
    return (
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        overflow: 'hidden',
        fontFamily: 'monospace'
      }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 800 450"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
        >
          <defs>
            <linearGradient id="sunsetSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a2d4e8" />
              <stop offset="50%" stopColor="#fcdbba" />
              <stop offset="100%" stopColor="#f4c4a3" />
            </linearGradient>
          </defs>

          {/* 하늘과 태양 */}
          <rect x="0" y="0" width="800" height="450" fill="url(#sunsetSky)" />
          <circle cx="480" cy="90" r="35" fill="#ffcc5c" />

          {/* 뒤쪽 언덕들 (숲 배경) */}
          <ellipse cx="680" cy="210" rx="220" ry="90" fill="#7cb87c" />
          <ellipse cx="850" cy="190" rx="180" ry="70" fill="#6aa96a" />

          {/* 설산 */}
          <polygon points="30,250 140,100 250,250" fill="#7a9263" />
          <polygon points="107,148 140,100 173,148" fill="#f0f0f0" />
          <polygon points="190,250 290,120 390,250" fill="#657d51" />
          <polygon points="260,162 290,120 320,162" fill="#f0f0f0" />

          {/* 앞쪽 들판과 베이스 */}
          <path d="M 0 240 Q 400 260 800 240 L 800 450 L 0 450 Z" fill="#88c388" />
          <path d="M 0 350 Q 400 320 800 370 L 800 450 L 0 450 Z" fill="#96c878" />

          {/* 구불구불한 언덕길 */}
          <path
            d="M 380 470 C 650 380, 250 310, 500 200"
            fill="none"
            stroke="#c8a165"
            strokeWidth="40"
            strokeLinecap="round"
          />

          {/* 우측 숲 (나무 군락) */}
          <g>
            <rect x="530" y="200" width="8" height="30" fill="#4a3018" /><circle cx="534" cy="180" r="20" fill="#2d5016" />
            <rect x="570" y="210" width="8" height="30" fill="#4a3018" /><circle cx="574" cy="190" r="22" fill="#2d5016" />
            <rect x="610" y="195" width="8" height="30" fill="#4a3018" /><circle cx="614" cy="175" r="18" fill="#356b1c" />
            <rect x="650" y="225" width="8" height="30" fill="#4a3018" /><circle cx="654" cy="205" r="24" fill="#2d5016" />
            <rect x="690" y="205" width="8" height="30" fill="#4a3018" /><circle cx="694" cy="185" r="20" fill="#356b1c" />
            <rect x="730" y="235" width="8" height="30" fill="#4a3018" /><circle cx="734" cy="215" r="25" fill="#2d5016" />
            <rect x="770" y="215" width="8" height="30" fill="#4a3018" /><circle cx="774" cy="195" r="22" fill="#356b1c" />
          </g>

          {/* 좌측 드문드문 있는 나무들 */}
          <g>
            <rect x="80" y="230" width="10" height="35" fill="#4a3018" /><circle cx="85" cy="210" r="22" fill="#30591b" />
            <rect x="140" y="250" width="12" height="40" fill="#4a3018" /><circle cx="146" cy="225" r="28" fill="#30591b" />
            <rect x="280" y="260" width="14" height="45" fill="#4a3018" /><circle cx="287" cy="235" r="32" fill="#2d5016" />
          </g>

          {/* 목장 울타리 */}
          <g fill="#8c623d">
            <rect x="40" y="320" width="410" height="6" />
            <rect x="40" y="345" width="410" height="6" />
            <rect x="40" y="370" width="410" height="6" />
            <rect x="40" y="315" width="8" height="60" />
            <rect x="90" y="315" width="8" height="60" />
            <rect x="140" y="315" width="8" height="60" />
            <rect x="190" y="315" width="8" height="60" />
            <rect x="290" y="315" width="8" height="60" />
            <rect x="340" y="315" width="8" height="60" />
            <rect x="390" y="315" width="8" height="60" />
            <rect x="442" y="315" width="8" height="60" />
          </g>

          {/* 중앙 집 */}
          <rect x="210" y="305" width="80" height="65" fill="#e8c89c" />
          <polygon points="195,305 250,265 305,305" fill="#a05240" />
          <rect x="220" y="325" width="15" height="15" fill="#8fd1e8" />
          <rect x="255" y="335" width="20" height="35" fill="#5c3817" />

          {/* 동물들 */}
          <circle cx="120" cy="335" r="8" fill="#ffffff" /> {/* 닭 1 */}
          <circle cx="170" cy="345" r="8" fill="#ffffff" /> {/* 닭 2 */}
          <circle cx="140" cy="360" r="6" fill="#ffd633" /> {/* 병아리 */}
          <circle cx="340" cy="330" r="10" fill="#ffb6c1" /> {/* 돼지 1 */}
          <circle cx="380" cy="345" r="9" fill="#ffb6c1" /> {/* 돼지 2 */}

          {/* 울타리 밖 동물들 */}
          <circle cx="110" cy="405" r="9" fill="#ffffff" />
          <circle cx="230" cy="415" r="11" fill="#ffb6c1" />
          <circle cx="270" cy="400" r="13" fill="#ffb6c1" />
          <circle cx="310" cy="410" r="7" fill="#ffd633" />

          {/* 바위들 */}
          <circle cx="530" cy="370" r="18" fill="#7a7a7a" />
          <circle cx="580" cy="400" r="12" fill="#8c8c8c" />
          <circle cx="490" cy="410" r="14" fill="#7a7a7a" />
          <circle cx="40" cy="305" r="8" fill="#8c8c8c" />
          <circle cx="70" cy="425" r="10" fill="#8c8c8c" />
        </svg>

        <div style={{
          position: 'relative',
          zIndex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          padding: '40px 60px',
          borderRadius: '16px',
          textAlign: 'center'
        }}>
          <h1 style={{ color: 'white', fontSize: '32px', marginBottom: '20px' }}>🌟 로건의 농장</h1>
          <button
            onClick={() => setGameStarted(true)}
            style={{
              padding: '15px 40px',
              fontSize: '20px',
              backgroundColor: '#7a9263',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            게임 시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '20px',
      justifyContent: 'center',
      minHeight: '100vh',
      paddingTop: '20px'
    }}>
      <div id="phaser-game" style={{ width: '800px', height: '600px', flexShrink: 0 }}></div>

      <div style={{
        width: '250px',
        padding: '20px',
        backgroundColor: '#1a1a1a',
        color: 'white',
        fontFamily: 'monospace',
        flexShrink: 0
      }}>
        <h3>캐릭터 정보</h3>
        <p>레벨: {playerStats.level}</p>
        <p>EXP: {playerStats.exp} / {playerStats.expNeeded}</p>
        <p>HP: {playerStats.hp} / {playerStats.maxHp}</p>
        <p>공격력: {playerStats.attackPower}</p>
        <p>이동속도: {playerStats.moveSpeed}</p>
        <p style={{ color: '#ffd700' }}>골드: {playerStats.gold} G</p>

        {playerStats.statPoints > 0 && (
          <div style={{ marginTop: '10px', padding: '10px', border: '1px solid yellow' }}>
            <p>스탯 포인트: {playerStats.statPoints}</p>
            <button onClick={() => allocateStatRef.current('attack')}>공격력 +5</button>
            <button onClick={() => allocateStatRef.current('hp')}>체력 +20</button>
            <button onClick={() => allocateStatRef.current('speed')}>속도 +20</button>
          </div>
        )}

        <h4>인벤토리</h4>
        {Object.keys(playerStats.inventory).length === 0 ? (
          <p>비어있음</p>
        ) : (
          Object.keys(playerStats.inventory).map(key => {
            const shopItem = SHOP_ITEMS.find(i => i.id === key);
            const displayName = shopItem ? shopItem.name : ENTITY_TYPES[key].name;

            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span>{displayName}: {playerStats.inventory[key]}</span>
                {shopItem && (
                  <button onClick={() => useItemRef.current(key)} style={{ fontSize: '12px' }}>
                    사용
                  </button>
                )}
              </div>
            );
          })
        )}      </div>
      {showAdmin && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          width: '200px',
          padding: '15px',
          backgroundColor: '#000',
          border: '2px solid #ff0000',
          color: 'white',
          fontFamily: 'monospace',
          zIndex: 1000
        }}>
          <h4 style={{ color: '#ff0000' }}>⚙ ADMIN</h4>

          <label style={{ display: 'block', marginBottom: '10px' }}>
            <input
              type="checkbox"
              checked={godMode}
              onChange={(e) => setGodMode(e.target.checked)}
            />
            {' '}무적 모드
          </label>
          <button onClick={() => revivePlayerRef.current()} style={{ marginBottom: '10px' }}>
            부활 (HP 회복)
          </button>
          <p style={{ fontSize: '12px', color: '#888' }}>
            'P' 키로 패널 열기/닫기
          </p>
        </div>
      )}
      {dialogue && (
        <div style={{
          position: 'fixed',
          bottom: '50px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0,0,0,0.9)',
          color: 'white',
          padding: '15px 25px',
          borderRadius: '8px',
          border: '2px solid #4444ff',
          fontFamily: 'monospace',
          fontSize: '16px',
          maxWidth: '400px',
          zIndex: 2000
        }}>
          💬 {dialogue}
        </div>
      )}
      {showShop && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#1a1a1a',
          border: '2px solid #4444ff',
          borderRadius: '10px',
          padding: '25px',
          color: 'white',
          fontFamily: 'monospace',
          zIndex: 3000,
          minWidth: '280px'
        }}>
          <h3>🏪 상점</h3>
          <p style={{ color: '#ffd700' }}>보유 골드: {playerStats.gold} G</p>

          {SHOP_ITEMS.map(item => (
            <div key={item.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '10px',
              paddingBottom: '10px',
              borderBottom: '1px solid #333'
            }}>
              <span>{item.name} (HP +{item.heal})</span>
              <button
                onClick={() => buyItemRef.current(item)}
                disabled={playerStats.gold < item.price}
              >
                {item.price} G
              </button>
            </div>
          ))}

          <button onClick={() => setShowShop(false)} style={{ marginTop: '15px' }}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

export default App;