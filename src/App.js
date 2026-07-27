import { useEffect, useRef, useState } from 'react';
import { GameScene } from './GameScene';
import { SHOP_ITEMS, ENTITY_TYPES } from './gameConfig';
import Phaser from 'phaser';

function App() {
  const gameRef = useRef(null);
  const sceneRef = useRef(null); // GameScene 인스턴스에 직접 접근하기 위한 ref

  const [playerStats, setPlayerStats] = useState({
    level: 1, exp: 0, expNeeded: 100, hp: 100, maxHp: 100,
    statPoints: 0, attackPower: 10, moveSpeed: 200, gold: 0, inventory: {}
  });

  const [showAdmin, setShowAdmin] = useState(false);
  const [godMode, setGodMode] = useState(false);
  const [dialogue, setDialogue] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showShop, setShowShop] = useState(false);

  // 게임 시작 버튼을 눌렀을 때만 Phaser 게임을 생성
  useEffect(() => {
    if (!gameStarted) return;

    const scene = new GameScene();

    // GameScene 안의 로직이 React 상태를 업데이트할 수 있도록 콜백 연결
    scene.onStatsUpdate = (stats) => setPlayerStats(stats);
    scene.onShopToggle = () => setShowShop(prev => !prev);

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
      scene: scene
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;
    sceneRef.current = scene;

    return () => {
      game.destroy(true);
    };
  }, [gameStarted]);

  // Admin 무적 모드 체크박스 값을 GameScene에 실시간 반영
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.godMode = godMode;
    }
  }, [godMode]);

  // 'P' 키로 Admin 패널 토글 (Phaser와 무관하게 항상 감지)
  useEffect(() => {
    function handleKeyPress(e) {
      if (e.key === 'p' || e.key === 'P') {
        setShowAdmin(prev => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // 게임 시작 전: 배경 일러스트가 있는 시작 화면
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
          viewBox="0 0 680 400"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
        >
          <defs>
            <linearGradient id="startSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a8d8ea" />
              <stop offset="100%" stopColor="#d4f0d4" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="680" height="400" fill="url(#startSky)" />
          <circle cx="560" cy="80" r="45" fill="#ffe066" />
          <ellipse cx="150" cy="280" rx="220" ry="90" fill="#7cb87c" />
          <ellipse cx="500" cy="300" rx="260" ry="100" fill="#6aa96a" />
          <rect x="0" y="320" width="680" height="80" fill="#4a8c4a" />
          <g>
            <rect x="80" y="230" width="16" height="50" fill="#6b4423" />
            <circle cx="88" cy="210" r="35" fill="#2d5016" />
          </g>
          <g>
            <rect x="220" y="250" width="14" height="45" fill="#6b4423" />
            <circle cx="227" cy="232" r="30" fill="#356b1c" />
          </g>
          <g>
            <rect x="480" y="240" width="16" height="55" fill="#6b4423" />
            <circle cx="488" cy="215" r="38" fill="#2d5016" />
          </g>
          <g>
            <rect x="580" y="260" width="14" height="45" fill="#6b4423" />
            <circle cx="587" cy="242" r="30" fill="#356b1c" />
          </g>
          <circle cx="340" cy="340" r="14" fill="#808080" />
          <circle cx="380" cy="355" r="10" fill="#909090" />
        </svg>

        <div style={{
          position: 'relative',
          zIndex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          padding: '40px 60px',
          borderRadius: '16px',
          textAlign: 'center'
        }}>
          <h1 style={{ color: 'white', fontSize: '32px', marginBottom: '20px' }}>🌱 Life Sim Game</h1>
          <button
            onClick={() => setGameStarted(true)}
            style={{
              padding: '15px 40px',
              fontSize: '20px',
              backgroundColor: '#4a7c3c',
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

  // 게임 시작 후: 실제 게임 화면 + 정보 패널
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
            <button onClick={() => sceneRef.current.allocateStat('attack')}>공격력 +5</button>
            <button onClick={() => sceneRef.current.allocateStat('hp')}>체력 +20</button>
            <button onClick={() => sceneRef.current.allocateStat('speed')}>속도 +20</button>
          </div>
        )}

        <h4>인벤토리</h4>
        {Object.keys(playerStats.inventory).length === 0 ? (
          <p>비어있음</p>
        ) : (
          Object.keys(playerStats.inventory).map(key => {
            // 인벤토리 항목이 자원(나무 등)인지 상점 아이템(포션)인지 구분
            const shopItem = SHOP_ITEMS.find(i => i.id === key);
            const displayName = shopItem ? shopItem.name : ENTITY_TYPES[key].name;

            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                <span>{displayName}: {playerStats.inventory[key]}</span>
                {shopItem && (
                  <button onClick={() => sceneRef.current.useItem(key)} style={{ fontSize: '12px' }}>
                    사용
                  </button>
                )}
              </div>
            );
          })
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
          <button onClick={() => sceneRef.current.revivePlayer()} style={{ marginBottom: '10px' }}>
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
                onClick={() => sceneRef.current.buyItem(item)}
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