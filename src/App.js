import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

function App() {
  const gameRef = useRef(null);

  useEffect(() => {
    let player;
    let cursors;

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      backgroundColor: '#2d2d2d',
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
      player = this.add.sprite(400, 300, 'player');
      player.setDisplaySize(80, 80);
      cursors = this.input.keyboard.createCursorKeys();      
    }

    function update() {
      const speed = 4;

      if (cursors.left.isDown) {
        player.x -= speed;
      } else if (cursors.right.isDown) {
        player.x += speed;
      }

      if (cursors.up.isDown) {
        player.y -= speed;
      } else if (cursors.down.isDown) {
        player.y += speed;
      }
      // 화면 경계 제한 (캐릭터 크기의 절반만큼 여백)
      player.x = Phaser.Math.Clamp(player.x, 20, 780);
      player.y = Phaser.Math.Clamp(player.y, 20, 580);
    }

    return () => {
      game.destroy(true);
    };
  }, []);

  return <div id="phaser-game"></div>;
}

export default App;