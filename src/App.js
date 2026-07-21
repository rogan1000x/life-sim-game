import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

function App() {
  const gameRef = useRef(null);

  useEffect(() => {
    let player;
    let cursors;
    let trees;

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      backgroundColor: '#4a7c3c',
      physics: {
        default: 'arcade',
        arcade: {
          debug: true
        }
      },
      scene: {
        preload: preload,
        create: create,
        update: update
      }
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    function preload() {
      this.load.image('player', 'assets/player_init.jpg');
    }

    function create() {
      // 격자 무늬 그리기 (타일 느낌)
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

      // 나무 오브젝트 배치 (원 3개로 임시 표현)
      trees = this.add.group();

      const treePositions = [
        { x: 150, y: 150 },
        { x: 600, y: 200 },
        { x: 300, y: 450 }
      ];

      treePositions.forEach(pos => {
        const tree = this.add.circle(pos.x, pos.y, 20, 0x2d5016);
        this.physics.add.existing(tree, true);  // 고정된 물리 객체로 만듦
        trees.add(tree);
      });

      player = this.add.sprite(400, 300, 'player');
      player.setDisplaySize(80, 80);
      this.physics.add.existing(player);  // 캐릭터도 물리 시스템에 등록
      player.body.setCollideWorldBounds(true);

      cursors = this.input.keyboard.createCursorKeys();

      // 캐릭터와 나무 충돌 처리
      this.physics.add.collider(player, trees);
    }

    function update() {
      const speed = 200;
      let velocityX = 0;
      let velocityY = 0;

      if (cursors.left.isDown) {
        velocityX = -speed;
        player.setFlipX(true);
      } else if (cursors.right.isDown) {
        velocityX = speed;
        player.setFlipX(false);
      }

      if (cursors.up.isDown) {
        velocityY = -speed;
      } else if (cursors.down.isDown) {
        velocityY = speed;
      }

      player.body.setVelocity(velocityX, velocityY);
    }
    return () => {
      game.destroy(true);
    };
  }, []);

  return <div id="phaser-game"></div>;
}

export default App;