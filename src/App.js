import { useEffect, useRef, useState } from 'react';
import { GameScene } from './GameScene';
import { SHOP_ITEMS, ENTITY_TYPES, formatCurrency } from './gameConfig';
import Phaser from 'phaser';
// recharts는 React에서 그래프/차트를 쉽게 그릴 수 있게 해주는 라이브러리예요.
// LineChart: 꺾은선 그래프 전체를 감싸는 틀
// Line: 실제로 그려지는 선 하나 (데이터 하나당 선 하나)
// XAxis/YAxis: 가로축/세로축
// ResponsiveContainer: 부모 크기에 맞춰 그래프 크기를 자동으로 조절해주는 도구
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';

// 상점 아이템의 효과를 사람이 읽기 좋은 텍스트로 변환 (회복형/스탯 강화형 공통 처리)
function getEffectLabel(item) {
  if (item.effectType === 'heal') return `HP +${item.effectValue}`;
  if (item.effectType === 'attack') return `공격력 +${item.effectValue}`;
  if (item.effectType === 'speed') return `이동속도 +${item.effectValue}`;
  if (item.effectType === 'maxHp') return `최대체력 +${item.effectValue}`;
  // 나무/돌/토끼/늑대 같은 재료 아이템은 effectType이 없어서 위 조건에 하나도 안 걸려요.
  // 그런 경우엔 "재료" 문구를 대신 보여줘서, 괄호가 텅 비어보이지 않게 함
  if (item.category === 'resource' || item.category === 'monster') return '재료 (거래 전용)';
  return '';
}

// UI 전체에서 재사용할 색상 테마 - 게임 톤(자연/농장 생활시뮬)에 맞춘 나무색+금색 팔레트
const THEME = {
  panelBg: 'linear-gradient(180deg, #3d2b1c 0%, #2a1b10 100%)',
  borderColor: '#c9a66b',
  text: '#f3e6d3',
  gold: '#ffd76a',
  green: '#7cc576',
  red: '#ff6b6b',
  blue: '#7ec8e3'
};

// 버튼마다 스타일을 따로 적던 것을 하나로 통일 - 필요하면 {...buttonStyle, ...개별속성}으로 덮어씀
const buttonStyle = {
  fontFamily: 'monospace',
  fontSize: '13px',
  padding: '6px 12px',
  backgroundColor: '#7a5330',
  color: THEME.text,
  border: `2px solid ${THEME.borderColor}`,
  borderRadius: '4px',
  cursor: 'pointer'
};

// 사이드바/상점/관리자창처럼 떠있는 패널들이 공통으로 쓰는 배경/테두리 스타일
const panelStyle = {
  background: THEME.panelBg,
  border: `3px solid ${THEME.borderColor}`,
  borderRadius: '8px',
  color: THEME.text,
  fontFamily: 'monospace',
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
};



function App() {
  const gameRef = useRef(null);
  const sceneRef = useRef(null); // GameScene 인스턴스에 직접 접근하기 위한 ref

  const [playerStats, setPlayerStats] = useState({
    level: 1, exp: 0, expNeeded: 100, hp: 100, maxHp: 100,
    statPoints: 0, attackPower: 10, moveSpeed: 200, gold: 0, inventory: {},
    equipped: { weapon: null }
  });

  const [showAdmin, setShowAdmin] = useState(false);
  const [godMode, setGodMode] = useState(false);
  const [dialogue, setDialogue] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [logs, setLogs] = useState([]); // 몬스터 처치/아이템 획득/사망 등 이벤트 알림 목록

  // 지금 그래프를 펼쳐서 보고 있는 아이템의 id를 저장해요. null이면 "아무 그래프도 안 열려있음"이라는 뜻이에요.
  // 예: 사용자가 "작은 포션" 옆 그래프 버튼을 누르면 이 값이 'potion_small'로 바뀜
  const [graphItemId, setGraphItemId] = useState(null);


  // 이벤트를 알림창에 추가하고, 3초 후 자동으로 사라지게 함
  // 화면을 너무 많이 가리지 않도록 최대 4개까지만 화면에 보여주고, 더 생기면 가장 오래된 것부터 없앰
  const MAX_VISIBLE_LOGS = 4;

  const addLog = (text, type) => {
    const id = Date.now() + Math.random(); // 같은 타이밍에 로그가 여러 개 쌓여도 구분되도록 고유 id 부여

    setLogs(prev => {
      // [...prev, 새로운 로그] 는 "기존 배열 뒤에 새 항목 하나를 추가한 새 배열"을 만드는 거예요
      const updated = [...prev, { id, text, type }];

      // slice(-MAX_VISIBLE_LOGS)는 "배열의 뒤에서부터 MAX_VISIBLE_LOGS개만 잘라낸다"는 뜻이에요.
      // 예를 들어 배열이 6개인데 MAX_VISIBLE_LOGS가 4면, 앞의 2개는 버리고 최근 4개만 남겨요
      return updated.slice(-MAX_VISIBLE_LOGS);
    });

    setTimeout(() => {
      setLogs(prev => prev.filter(log => log.id !== id));
    }, 3000);
  };

  // 게임 시작 버튼을 눌렀을 때만 Phaser 게임을 생성
  useEffect(() => {
    if (!gameStarted) return;

    const scene = new GameScene();

    // GameScene 안의 로직이 React 상태를 업데이트할 수 있도록 콜백 연결
    scene.onStatsUpdate = (stats) => setPlayerStats(stats);
    scene.onShopToggle = () => setShowShop(prev => !prev);
    scene.onDialogue = (text) => setDialogue(text); // GameScene에서 대사를 보내주면 대화창 상태에 반영
    scene.onLog = (text, type) => addLog(text, type); // GameScene에서 이벤트가 발생하면 알림창에 기록

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
      <div id="phaser-game" style={{ width: '800px', height: '600px', flexShrink: 0, position: 'relative' }}>
        {/* 몬스터 처치/아이템 획득/사망 알림 - 화면 하단에 작게 표시해서 게임 시야(캐릭터 주변)를 덜 가리게 함
            pointerEvents: 'none'은 이 영역이 마우스 클릭을 가로채지 않게 하는 옵션이에요
            (알림이 화면을 덮고 있어도, 그 아래 게임을 클릭하면 알림이 아니라 게임이 반응하게 됨) */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px', // 가로 중앙 정렬(left:50% + translateX)을 없애고, 왼쪽에서 10px만 띄운 위치로 고정
          display: 'flex',
          flexDirection: 'column-reverse', // 최신 로그가 아래쪽에 오도록 순서를 뒤집음 (자연스럽게 아래에서 위로 쌓이는 느낌)
          gap: '4px',
          zIndex: 500,
          fontFamily: 'monospace',
          pointerEvents: 'none',
          alignItems: 'flex-start' // 중앙 정렬 대신 왼쪽 정렬로 변경 (알림들이 왼쪽 끝에 딱 붙어서 쌓임)
        }}>
          {logs.map(log => (
            <div key={log.id} style={{
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '12px', // 기존 14px보다 작게
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              whiteSpace: 'nowrap', // 줄바꿈 없이 한 줄로만 표시해서 세로 공간을 덜 차지하게 함
              backgroundColor:
                log.type === 'kill' ? 'rgba(180,60,20,0.85)' :
                  log.type === 'gain' ? 'rgba(40,120,60,0.85)' :
                    log.type === 'death' ? 'rgba(150,0,0,0.9)' :
                      'rgba(0,0,0,0.8)'
            }}>
              {log.text}
            </div>
          ))}
        </div>
      </div>

      <div style={{
        ...panelStyle,
        width: '250px',
        padding: '20px',
        flexShrink: 0
      }}>
        <h3 style={{ margin: '0 0 12px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '8px' }}>
          🧑‍🌾 캐릭터 정보
        </h3>
        <p>레벨: {playerStats.level}</p>
        <p>EXP: {playerStats.exp} / {playerStats.expNeeded}</p>
        <p style={{ color: THEME.red }}>❤ HP: {playerStats.hp} / {playerStats.maxHp}</p>
        <p>⚔ 공격력: {playerStats.attackPower}</p>
        <p>👟 이동속도: {playerStats.moveSpeed}</p>
        <p style={{ color: THEME.gold }}>💰 {formatCurrency(playerStats.gold)}</p>
        <p>
          🗡 장착 무기: {playerStats.equipped?.weapon
            ? SHOP_ITEMS.find(i => i.id === playerStats.equipped.weapon)?.name
            : '없음'}
        </p>

        {playerStats.statPoints > 0 && (
          <div style={{
            marginTop: '12px', padding: '10px',
            backgroundColor: 'rgba(255,215,106,0.12)',
            border: `2px solid ${THEME.gold}`, borderRadius: '6px'
          }}>
            <p style={{ margin: '0 0 8px', color: THEME.gold }}>✨ 스탯 포인트: {playerStats.statPoints}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button style={buttonStyle} onClick={() => sceneRef.current.allocateStat('attack')}>⚔ 공격력 +5</button>
              <button style={buttonStyle} onClick={() => sceneRef.current.allocateStat('hp')}>❤ 체력 +20</button>
              <button style={buttonStyle} onClick={() => sceneRef.current.allocateStat('speed')}>👟 속도 +20</button>
            </div>
          </div>
        )}

        <h4 style={{ margin: '16px 0 10px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
          🎒 인벤토리
        </h4>
        {Object.keys(playerStats.inventory).length === 0 ? (
          <p style={{ color: '#a8927a', fontStyle: 'italic' }}>비어있음</p>
        ) : (
          Object.keys(playerStats.inventory).map(key => {
            const shopItem = SHOP_ITEMS.find(i => i.id === key);
            const displayName = shopItem ? shopItem.name : ENTITY_TYPES[key].name;
            const isEquipped = shopItem && shopItem.category === 'equipment' && playerStats.equipped?.[shopItem.slot] === key;

            return (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '6px', padding: '4px 6px',
                backgroundColor: isEquipped ? 'rgba(255,215,106,0.15)' : 'rgba(255,255,255,0.05)',
                border: isEquipped ? `1px solid ${THEME.gold}` : '1px solid transparent',
                borderRadius: '4px'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {shopItem && shopItem.icon && (
                    <img src={`/assets/shop/${shopItem.icon}`} alt="" style={{ width: '20px', height: '20px', imageRendering: 'pixelated' }} />
                  )}
                  {displayName}: {playerStats.inventory[key]} {isEquipped && '(장착 중)'}
                </span>
                {shopItem && shopItem.category === 'consumable' && (
                  <button
                    onClick={(e) => sceneRef.current.useItem(key, e.shiftKey ? 10 : 1)}
                    style={{ ...buttonStyle, fontSize: '11px', padding: '4px 8px' }}
                    title="Shift+클릭: 10개 사용"
                  >
                    사용
                  </button>
                )}
                {shopItem && shopItem.category === 'equipment' && (
                  <button
                    onClick={() => isEquipped ? sceneRef.current.unequipItem(shopItem.slot) : sceneRef.current.equipItem(key)}
                    style={{ ...buttonStyle, fontSize: '11px', padding: '4px 8px' }}
                  >
                    {isEquipped ? '해제' : '장착'}
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
          backgroundColor: '#1a0505',
          border: '3px solid #ff4444',
          borderRadius: '8px',
          color: THEME.text,
          fontFamily: 'monospace',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(255,0,0,0.3)'
        }}>
          <h4 style={{ color: '#ff4444', margin: '0 0 10px' }}>⚙ ADMIN</h4>
          <label style={{ display: 'block', marginBottom: '12px' }}>
            <input
              type="checkbox"
              checked={godMode}
              onChange={(e) => setGodMode(e.target.checked)}
            />
            {' '}무적 모드
          </label>
          <button onClick={() => sceneRef.current.revivePlayer()} style={{ ...buttonStyle, marginBottom: '10px', width: '100%' }}>
            부활 (HP 회복)
          </button>
          <p style={{ fontSize: '12px', color: '#a87878', margin: 0 }}>
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
          background: THEME.panelBg,
          color: THEME.text,
          padding: '16px 26px',
          borderRadius: '8px',
          border: `3px solid ${THEME.blue}`,
          fontFamily: 'monospace',
          fontSize: '16px',
          maxWidth: '400px',
          zIndex: 2000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
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
          ...panelStyle,
          padding: '25px',
          zIndex: 3000,
          minWidth: '300px'
        }}>
          <h3 style={{ margin: '0 0 6px', color: THEME.gold }}>🏪 상점</h3>
          <p style={{ color: THEME.gold, margin: '0 0 14px' }}>💰 보유: {formatCurrency(playerStats.gold)}</p>

          <div style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
            {SHOP_ITEMS.map(item => {
              const price = playerStats.marketPrices?.[item.id] ?? item.basePrice;
              const ownedCount = playerStats.inventory[item.id] || 0;

              // marketStock은 "상인이 지금 몇 개를 갖고 있는지"를 나타내는 숫자예요.
              // ?? 10은 아직 값이 안 왔을 때(게임 막 시작해서 서버 응답 전 같은 상황) 기본으로 10을 보여준다는 뜻
              const merchantStock = playerStats.marketStock?.[item.id] ?? 10;

              // 이제 "살 수 있는지"를 판단할 때 골드뿐 아니라 재고도 같이 봐야 해요.
              // && 는 "그리고"라는 뜻이라, 두 조건이 둘 다 true여야 최종적으로 true가 됨
              const canAfford = playerStats.gold >= price && merchantStock > 0;

              return (
                <div key={item.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                  paddingBottom: '10px',
                  borderBottom: '1px solid rgba(201,166,107,0.3)'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.icon && (
                      <img src={`/assets/shop/${item.icon}`} alt="" style={{ width: '28px', height: '28px', imageRendering: 'pixelated' }} />
                    )}
                    <span>
                      {/* getEffectLabel(item)이 빈 문자열('')이면 자바스크립트에서는 false 취급이 돼요.
                          그래서 "getEffectLabel(item) &&" 는 "문구가 있을 때만 뒤에 있는 걸 보여줘라"는 뜻이 됨
                          (이런 걸 "조건부 렌더링"이라고 불러요 - 조건이 참일 때만 화면에 그려주는 방식) */}
                      {item.name} {getEffectLabel(item) && `(${getEffectLabel(item)})`}<br />
                      <span style={{ fontSize: '11px', color: '#c9a66b' }}>
                        시세 {formatCurrency(price)}
                        {' · '}
                        {/* 재고가 0이면 빨간 글씨로 "품절"이라고 보여주고, 아니면 남은 개수를 보여줌 */}
                        {merchantStock > 0
                          ? `상인 재고 ${merchantStock}`
                          : <span style={{ color: THEME.red }}>품절</span>
                        }
                        {ownedCount > 0 && ` · 내 보유 ${ownedCount}`}
                      </span>
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px', opacity: canAfford ? 1 : 0.4, cursor: canAfford ? 'pointer' : 'not-allowed' }}
                      onClick={(e) => sceneRef.current.buyItem(item.id, e.shiftKey ? 10 : 1)}
                      disabled={!canAfford}
                      title={merchantStock <= 0 ? '상인 재고가 없어요' : 'Shift+클릭: 10개 구매'}
                    >
                      구매
                    </button>
                    <button
                      style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px', opacity: ownedCount > 0 ? 1 : 0.4, cursor: ownedCount > 0 ? 'pointer' : 'not-allowed' }}
                      onClick={(e) => sceneRef.current.sellItem(item.id, e.shiftKey ? 10 : 1)}
                      disabled={ownedCount <= 0}
                      title="Shift+클릭: 10개 판매"
                    >
                      판매
                    </button>
                    {/* 그래프 버튼: 누르면 이 아이템의 id를 graphItemId에 저장해요.
                        만약 이미 이 아이템 그래프가 열려있는 상태에서 또 누르면 null로 바꿔서 닫히게 함
                        (이런 방식을 "토글"이라고 불러요 - 누를 때마다 열림/닫힘이 반복됨) */}
                    <button
                      style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px' }}
                      onClick={() => setGraphItemId(graphItemId === item.id ? null : item.id)}
                    >
                      📈
                    </button>
                  </div>

                  {/* graphItemId가 지금 보고 있는 이 아이템과 같을 때만 그래프를 화면에 그림 */}
                  {graphItemId === item.id && (
                    <div style={{ width: '100%', marginTop: '8px' }}>
                      {(() => {
                        // playerStats.priceHistory에서 이 아이템의 가격 기록 배열을 꺼내옴
                        // 아직 한 번도 기록이 안 됐을 수도 있으니, 없으면 빈 배열([])을 대신 사용
                        const historyArray = playerStats.priceHistory?.[item.id] || [];

                        // recharts는 데이터를 [{price: 20}, {price: 22}, ...] 같은
                        // "객체가 담긴 배열" 형태로 받아야 그래프를 그릴 수 있어요.
                        // 그래서 그냥 숫자만 있는 배열([20, 22, ...])을 map으로 하나씩
                        // {price: 숫자} 형태의 객체로 바꿔주는 작업이에요.
                        const chartData = historyArray.map((price, index) => ({ index, price }));

                        // 기록이 2개 미만이면 아직 그래프로 그릴 게 별로 없다는 뜻이라 안내 문구만 보여줌
                        if (chartData.length < 2) {
                          return <p style={{ fontSize: '11px', color: '#a8927a' }}>아직 가격 기록이 부족해요 (조금 기다려보세요)</p>;
                        }

                        return (
                          // ResponsiveContainer로 감싸면 부모 div 크기에 맞춰 그래프가 자동으로 늘어남
                          <ResponsiveContainer width="100%" height={80}>
                            <LineChart data={chartData}>
                              {/* X축은 시간 흐름(순서)을 나타내는데, 숫자만 나오면 지저분해 보여서 눈금(tick)을 숨김 */}
                              <XAxis dataKey="index" hide />
                              {/* Y축(가격)도 공간이 좁으니 숨기고, 대신 선 색과 값 자체로 흐름만 보여줌 */}
                              <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                              <Line
                                type="monotone"
                                dataKey="price"
                                stroke={THEME.gold}
                                strokeWidth={2}
                                dot={false} // 점을 안 찍고 선만 깔끔하게 표시
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={() => setShowShop(false)} style={{ ...buttonStyle, marginTop: '18px', width: '100%' }}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

export default App;