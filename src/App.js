import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';

// 게임 설정 (나중에 옵션 화면에서 조정 가능하게!)
const GAME_CONFIG = {
  treeCount: 3,
  stoneCount: 2,
  rabbitCount: 3,
  wolfCount: 4,        // ← 늑대 개수 늘림! (2 → 4)
  wolfRespawnMin: 5000,   // 늑대 리스폰 최소 시간 (기존보다 빠르게)
  wolfRespawnMax: 10000   // 늑대 리스폰 최대 시간 (기존 10000~20000에서 단축)
};

const ENTITY_TYPES = {
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
    exp: 40, color: 0x4a0000, radius: 18, sound: 150, hp: 30,
    damage: 10, speed: 80
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

function App() {
  const gameRef = useRef(null);
  const allocateStatRef = useRef(null);
  const godModeRef = useRef(false);
  const [playerStats, setPlayerStats] = useState({
    level: 1,
    exp: 0,
    expNeeded: 100,
    hp: 100,
    maxHp: 100,
    statPoints: 0,
    attackPower: 10,
    moveSpeed: 200,
    inventory: {}
  });

  const [showAdmin, setShowAdmin] = useState(false);
  const [godMode, setGodMode] = useState(false);
  const [dialogue, setDialogue] = useState(null);

  useEffect(() => {
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

      // 피아노는 배음(harmonics)을 여러 개 겹쳐서 자연스러운 소리를 냄
      const harmonics = [1, 2, 3, 4];
      const gains = [0.3, 0.15, 0.08, 0.04];

      harmonics.forEach((harmonic, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency * harmonic;
        oscillator.type = 'sine';

        // 피아노 특유의 "치면 바로 크게, 서서히 작아짐" 소리 모양
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
        inventory: { ...inventory }
      });
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
      }

      syncStatsToReact();
    }

    function createParticleBurst(scene, x, y, color, count = 8) {
      for (let i = 0; i < count; i++) {
        const particle = scene.add.circle(x, y, 4, color);

        const angle = (Math.PI * 2 * i) / count; // 원형으로 퍼지게
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

      // 동물(토끼) - GAME_CONFIG로 개수 조정 가능
      for (let i = 0; i < GAME_CONFIG.rabbitCount; i++) {
        const pos = getEdgeSpawnPosition();
        entities.add(createEntity(this, pos.x, pos.y, 'rabbit'));
      }

      // 몬스터(늑대) - GAME_CONFIG로 개수 조정 가능
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

        hp -= info.damage;
        hp = Math.max(0, hp);
        hpText.setText('HP: ' + hp);
        playHitSound();

        // 피격 시 캐릭터 깜빡임 효과
        player.setTint(0xff0000);
        this.time.delayedCall(150, () => player.clearTint());

        const knockbackAngle = Phaser.Math.Angle.Between(entity.x, entity.y, player.x, player.y);
        player.body.setVelocity(Math.cos(knockbackAngle) * 300, Math.sin(knockbackAngle) * 300);

        syncStatsToReact();
      });

      spaceKey = this.input.keyboard.addKey('SPACE');
      const eKey = this.input.keyboard.addKey('E');
      this.eKey = eKey; // update()에서 접근하기 위해 scene에 저장

      npcs = this.add.group();
      const npc = this.add.rectangle(400, 150, 40, 60, NPC_DATA.villager.color);
      npc.npcType = 'villager';
      this.physics.add.existing(npc, true); // 정적 (안 움직임)
      npcs.add(npc);
      this.physics.add.collider(player, npcs);

      hpText = this.add.text(20, 20, 'HP: 100', {
        fontSize: '20px',
        color: '#ff4444'
      });

      syncStatsToReact();
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

        createParticleBurst(gameScene, player.x, player.y, 0xffff00, 16);  // ← 추가!
      }

      syncStatsToReact();
    }

    function update() {
      let velocityX = 0;
      let velocityY = 0;

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
      // NPC와 대화
      nearbyNpc = null;
      npcs.getChildren().forEach(npc => {
        const distance = Phaser.Math.Distance.Between(player.x, player.y, npc.x, npc.y);
        if (distance < 80) {
          nearbyNpc = npc;
        }
      });

      if (Phaser.Input.Keyboard.JustDown(this.eKey) && nearbyNpc) {
        const npcInfo = NPC_DATA[nearbyNpc.npcType];
        showDialogueText(npcInfo.dialogues[dialogueIndex]);
        dialogueIndex = (dialogueIndex + 1) % npcInfo.dialogues.length;

        setTimeout(() => {
          setDialogue(null);
        }, 3000);
      }
    }

    return () => {
      game.destroy(true);
    };
  }, []);

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
          Object.keys(playerStats.inventory).map(key => (
            <p key={key}>
              {ENTITY_TYPES[key].name}: {playerStats.inventory[key]}
            </p>
          ))
        )}
      </div>
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
    </div>
  );
}

export default App;