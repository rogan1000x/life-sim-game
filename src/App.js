import { useEffect, useRef, useState } from 'react';
import { GameScene } from './GameScene';
import { SHOP_ITEMS, ENTITY_TYPES, formatCurrency, QUEST_TEMPLATES, COMPANION_TYPES, RANK_TIERS, CLASS_TYPES, CLASS_SKILLS } from './gameConfig';
import Phaser from 'phaser';
// recharts는 React에서 그래프/차트를 쉽게 그릴 수 있게 해주는 라이브러리예요.
// LineChart: 꺾은선 그래프 전체를 감싸는 틀
// Line: 실제로 그려지는 선 하나 (데이터 하나당 선 하나)
// XAxis/YAxis: 가로축/세로축
// ResponsiveContainer: 부모 크기에 맞춰 그래프 크기를 자동으로 조절해주는 도구
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// 퀘스트의 targetId(예: 'tree', 'wolf')로 실제 사람이 읽을 이름('나무', '늑대 가죽')을 찾아줘요.
// targetId가 SHOP_ITEMS에 있을 수도, ENTITY_TYPES에 있을 수도 있어서 둘 다 확인함
function getItemDisplayName(itemId) {
  const shopItem = SHOP_ITEMS.find(i => i.id === itemId);
  if (shopItem) return shopItem.name;

  const entityItem = ENTITY_TYPES[itemId];
  if (entityItem) return entityItem.name;

  return itemId; // 혹시 둘 다 없으면 안전하게 id 자체라도 보여줌
}

// 장착한 무기의 이름과 내구도를 "낡은 곡괭이 (내구도 18/30)" 같은 문구로 만들어줘요.
// playerStats 전체를 통째로 받아서, 그 안에서 필요한 값들만 꺼내 씀
function getEquippedWeaponLabel(playerStats) {
  const weaponId = playerStats.equipped?.weapon;
  if (!weaponId) return '없음'; // 아무것도 안 꼈으면 그냥 "없음"

  const item = SHOP_ITEMS.find(i => i.id === weaponId);
  if (!item) return '없음'; // 혹시 데이터에 없는 이상한 id면 안전하게 "없음" 처리

  // ?? 0 은 "durability 값이 없으면(undefined) 0을 대신 쓴다"는 뜻이에요
  const durability = playerStats.equipmentDurability?.[weaponId] ?? 0;

  return `${item.name} (내구도 ${durability}/${item.maxDurability})`;
}

// 상점 아이템의 효과를 사람이 읽기 좋은 텍스트로 변환 (회복형/스탯 강화형 공통 처리)
function getEffectLabel(item) {
  if (item.effectType === 'heal') return `HP +${item.effectValue}`;
  if (item.effectType === 'attack') return `공격력 +${item.effectValue}`;
  if (item.effectType === 'speed') return `이동속도 +${item.effectValue}`;
  if (item.effectType === 'maxHp') return `최대체력 +${item.effectValue}`;
  if (item.category === 'seed') return '씨앗 (밭에 심기)';
  if (item.category === 'resource' || item.category === 'monster' || item.category === 'crop') return '재료 (거래 전용)';
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
    equipped: { weapon: null }, rank: 'bronze', questsCompletedCount: 0, playerClass: null,
    primaryStats: { str: 0, vit: 0, agi: 0, int: 0, sen: 0 },
    defense: 0, critChance: 0, critDamage: 150, magicPower: 0, cooldownReduction: 0, precision: 0
  });

    const [showAdmin, setShowAdmin] = useState(false);
  // I키로 여닫는 캐릭터/인벤토리 패널이에요. 평소엔 닫혀있다가, I키를 누르면 열림
  const [showCharacterPanel, setShowCharacterPanel] = useState(false);
  const [godMode, setGodMode] = useState(false);
  const [dialogue, setDialogue] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [logs, setLogs] = useState([]); // 몬스터 처치/아이템 획득/사망 등 이벤트 알림 목록

  // 지금 "씨앗 심기 메뉴"가 열려있다면 어느 밭(farm1, farm2...)에 대한 건지 저장해요.
  // null이면 "메뉴가 안 열려있음"이라는 뜻이에요.
  const [farmMenuPlotId, setFarmMenuPlotId] = useState(null);

  // 지금 주점 메뉴가 열려있는지 여부예요. true면 화면에 주점 패널이 보임
  const [showTavern, setShowTavern] = useState(false);

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
    // GameScene이 "심기 메뉴 열어줘/닫아줘"라고 요청하면(onFarmMenuOpen 호출), 그 값을 그대로 state에 저장함
    scene.onFarmMenuOpen = (plotId) => setFarmMenuPlotId(plotId);
    // GameScene이 "주점 메뉴 열어줘/닫아줘"라고 요청하면(onTavernOpen 호출), 그 값을 그대로 반영함
    scene.onTavernOpen = (isOpen) => setShowTavern(isOpen);

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

  // 'P' 키로 Admin 패널, 'I' 키로 캐릭터/인벤토리 패널을 토글함 (Phaser와 무관하게 항상 감지)
  useEffect(() => {
    function handleKeyPress(e) {
      if (e.key === 'p' || e.key === 'P') {
        setShowAdmin(prev => !prev);
      }
      if (e.key === 'i' || e.key === 'I') {
        setShowCharacterPanel(prev => !prev);
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

      {/* showCharacterPanel이 true일 때만 화면 위에 겹쳐서 보이는 패널이에요.
          기존처럼 항상 화면 옆에 자리를 차지하지 않고, 필요할 때만 화면을 덮어서 보여줌 */}
      {showCharacterPanel && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          width: '280px',
          maxHeight: '90vh', // 화면 높이의 90%를 넘지 않게 해서, 내용이 길어지면 안에서 스크롤되게 함
          overflowY: 'auto',
          ...panelStyle,
          padding: '20px',
          zIndex: 1500
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
          <p>🎖 등급: {RANK_TIERS.find(r => r.id === playerStats.rank)?.name}</p>
          <p>
            {CLASS_TYPES[playerStats.playerClass]?.icon} 직업: {CLASS_TYPES[playerStats.playerClass]?.name || '미지정'}
          </p>
          <p>
            🗡 장착 무기: {getEquippedWeaponLabel(playerStats)}
          </p>

          <div style={{
            marginTop: '12px', padding: '10px',
            backgroundColor: 'rgba(255,215,106,0.08)',
            border: `2px solid ${THEME.borderColor}`, borderRadius: '6px'
          }}>
            <p style={{ margin: '0 0 4px', color: THEME.gold }}>✨ 스탯 포인트: {playerStats.statPoints}</p>

            {/* 근본 스탯 5개를 다이아몬드(오각형) 모양의 레이더 차트로 보여줌 */}
            {(() => {
              // recharts의 RadarChart는 [{축이름, 값}, ...] 형태의 배열을 원해요.
              const statRadarData = [
                { stat: '근력', value: playerStats.primaryStats?.str || 0 },
                { stat: '활력', value: playerStats.primaryStats?.vit || 0 },
                { stat: '민첩', value: playerStats.primaryStats?.agi || 0 },
                { stat: '지능', value: playerStats.primaryStats?.int || 0 },
                { stat: '감각', value: playerStats.primaryStats?.sen || 0 }
              ];
              // 스탯이 계속 늘어나므로, 축의 최대 범위(domain)도 값에 맞춰 자동으로 커지게 함
              // (그래야 스탯을 아무리 많이 찍어도 차트 밖으로 안 삐져나감)
              const maxValue = Math.max(10, ...statRadarData.map(d => d.value)) + 2;

              return (
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={statRadarData} outerRadius="70%">
                    <PolarGrid stroke={THEME.borderColor} />
                    <PolarAngleAxis dataKey="stat" tick={{ fill: THEME.text, fontSize: 11 }} />
                    {/* tick={false}로 눈금 숫자는 숨기고, 오각형 모양 자체로만 크기를 보여줌 */}
                    <PolarRadiusAxis angle={90} domain={[0, maxValue]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke={THEME.gold} fill={THEME.gold} fillOpacity={0.35} />
                  </RadarChart>
                </ResponsiveContainer>
              );
            })()}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
              {[
                { key: 'str', label: '근력' },
                { key: 'vit', label: '활력' },
                { key: 'agi', label: '민첩' },
                { key: 'int', label: '지능' },
                { key: 'sen', label: '감각' }
              ].map(stat => (
                <div key={stat.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{stat.label}: {playerStats.primaryStats?.[stat.key] || 0}</span>
                  <button
                    onClick={() => sceneRef.current.investStat(stat.key)}
                    disabled={playerStats.statPoints <= 0}
                    style={{ ...buttonStyle, fontSize: '11px', padding: '2px 10px', opacity: playerStats.statPoints > 0 ? 1 : 0.4, cursor: playerStats.statPoints > 0 ? 'pointer' : 'not-allowed' }}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(201,166,107,0.3)', fontSize: '11px', color: '#c9a66b' }}>
              <div>🛡 방어력: {playerStats.defense || 0}</div>
              <div>💥 치명타: {playerStats.critChance || 0}% (피해 {playerStats.critDamage || 150}%)</div>
              <div>🎯 정밀도: {playerStats.precision || 0}</div>
              <div>🔮 마력: {playerStats.magicPower || 0} · ⏱ 재사용감소: {playerStats.cooldownReduction || 0}%</div>
            </div>
          </div>

          {!playerStats.playerClass ? (
            <p style={{ marginTop: '12px', fontSize: '12px', color: '#a8927a', fontStyle: 'italic' }}>
              주점에서 직업을 정하면 전용 스킬을 배울 수 있어요
            </p>
          ) : (
            <div style={{ marginTop: '12px' }}>
              <p style={{ margin: '0 0 8px', color: THEME.gold }}>
                📖 스킬 포인트: {playerStats.skillPoints || 0}
              </p>
              {(CLASS_SKILLS[playerStats.playerClass] || []).map(skill => {
                const currentLevel = playerStats.skillLevels?.[skill.id] || 0;
                const isMaxed = currentLevel >= skill.maxLevel;

                // 해금 조건 확인 - GameScene의 isSkillUnlocked와 같은 로직을 여기서도 계산함
                const condition = skill.unlockCondition;
                let isUnlocked = true;
                let unlockText = '';
                if (condition?.type === 'level') {
                  isUnlocked = playerStats.level >= condition.value;
                  unlockText = `레벨 ${condition.value} 필요`;
                } else if (condition?.type === 'kills') {
                  isUnlocked = (playerStats.totalMonsterKills || 0) >= condition.value;
                  unlockText = `몬스터 ${condition.value}마리 처치 필요 (현재 ${playerStats.totalMonsterKills || 0})`;
                }

                const canUpgrade = isUnlocked && (playerStats.skillPoints || 0) > 0 && !isMaxed;

                return (
                  <div key={skill.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '6px', padding: '6px',
                    backgroundColor: isUnlocked ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)',
                    borderRadius: '4px',
                    opacity: isUnlocked ? 1 : 0.6
                  }}>
                    <span style={{ fontSize: '12px' }}>
                      {isUnlocked ? skill.name : `🔒 ${skill.name}`} Lv.{currentLevel}/{skill.maxLevel}<br />
                      <span style={{ fontSize: '10px', color: '#a8927a' }}>
                        {isUnlocked ? skill.description : unlockText}
                      </span>
                    </span>
                    <button
                      onClick={() => sceneRef.current.upgradeSkill(skill.id)}
                      disabled={!canUpgrade}
                      style={{ ...buttonStyle, fontSize: '11px', padding: '4px 8px', opacity: canUpgrade ? 1 : 0.4, cursor: canUpgrade ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                    >
                      {isMaxed ? '최대' : '+'}
                    </button>
                  </div>
                );
              })}
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
                    {displayName}: {playerStats.inventory[key]}
                    {isEquipped && ` (장착 중, 내구도 ${playerStats.equipmentDurability?.[key] ?? 0}/${shopItem.maxDurability})`}
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
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => isEquipped ? sceneRef.current.unequipItem(shopItem.slot) : sceneRef.current.equipItem(key)}
                        style={{ ...buttonStyle, fontSize: '11px', padding: '4px 8px' }}
                      >
                        {isEquipped ? '해제' : '장착'}
                      </button>
                      {(() => {
                        const durability = playerStats.equipmentDurability?.[key];
                        const needsRepair = durability !== undefined && durability < shopItem.maxDurability;
                        if (!needsRepair) return null;

                        const missing = shopItem.maxDurability - durability;
                        const repairCost = Math.max(1, Math.round(shopItem.basePrice * 0.5 * (missing / shopItem.maxDurability)));

                        return (
                          <button
                            onClick={() => sceneRef.current.repairItem(key)}
                            style={{ ...buttonStyle, fontSize: '11px', padding: '4px 8px' }}
                            title="수리하면 내구도가 최대치로 회복돼요"
                          >
                            🔧 {formatCurrency(repairCost)}
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <p style={{ fontSize: '11px', color: '#a87878', marginTop: '14px', textAlign: 'center' }}>
            'I' 키로 패널 열기/닫기
          </p>
        </div>
      )}

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
          <button
            onClick={() => {
              // window.confirm은 브라우저 기본 확인창을 띄우는 함수예요. "확인"을 눌러야 true를 반환해서
              // 실제로 초기화가 진행되고, "취소"를 누르면 false라서 아무 일도 안 일어나요.
              // 되돌릴 수 없는 동작이라 실수로 누르는 걸 막기 위한 안전장치예요.
              if (window.confirm('레벨과 직업을 정말 초기화할까요?')) {
                sceneRef.current.resetProgress();
              }
            }}
            style={{ ...buttonStyle, marginBottom: '10px', width: '100%', backgroundColor: '#7a3030' }}
          >
            레벨/직업 초기화
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

      {/* farmMenuPlotId가 null이 아닐 때만(즉, 밭 하나가 선택되어 있을 때만) 이 메뉴가 화면에 보임 */}
      {farmMenuPlotId && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          ...panelStyle,
          padding: '25px',
          zIndex: 3000,
          minWidth: '260px'
        }}>
          <h3 style={{ margin: '0 0 14px', color: THEME.gold }}>🌱 무엇을 심을까요?</h3>

          {/* SHOP_ITEMS 중에서 "씨앗인데(category==='seed') && 내가 실제로 갖고 있는(재고>0)" 것만 골라서 보여줌
              filter()는 배열에서 조건에 맞는 것들만 뽑아 새 배열로 만들어주는 함수예요 */}
          {SHOP_ITEMS.filter(i => i.category === 'seed' && (playerStats.inventory[i.id] || 0) > 0).length === 0 ? (
            <p style={{ color: '#a8927a' }}>보유한 씨앗이 없어요. 상점에서 구매해보세요.</p>
          ) : (
            SHOP_ITEMS.filter(i => i.category === 'seed' && (playerStats.inventory[i.id] || 0) > 0).map(seed => (
              <div key={seed.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px'
              }}>
                <span>{seed.name} (보유 {playerStats.inventory[seed.id]})</span>
                <button
                  style={{ ...buttonStyle, fontSize: '12px' }}
                  // 이 버튼을 누르면 GameScene의 plantSeed 함수를 호출해서 실제로 심기를 실행함
                  onClick={() => sceneRef.current.plantSeed(farmMenuPlotId, seed.id)}
                >
                  심기
                </button>
              </div>
            ))
          )}

          <button
            onClick={() => setFarmMenuPlotId(null)} // null로 바꾸면 위 조건(farmMenuPlotId &&)이 거짓이 되어 메뉴가 사라짐
            style={{ ...buttonStyle, marginTop: '16px', width: '100%' }}
          >
            닫기
          </button>
        </div>
      )}
      {/* showTavern이 true일 때만 이 패널이 화면에 보여요 */}
      {showTavern && (
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
          <h3 style={{ margin: '0 0 6px', color: THEME.gold }}>🍺 주점</h3>
          <p style={{ color: '#a8927a', margin: '0 0 16px', fontSize: '13px' }}>
            여행자와 용병들이 쉬어가는 곳이에요
          </p>

          {/* 쉬기 버튼 - 누르면 즉시 체력이 전부 회복돼요 */}
          <button
            onClick={() => sceneRef.current.restAtTavern()}
            style={{ ...buttonStyle, width: '100%', marginBottom: '18px', padding: '10px' }}
          >
            🛌 쉬기 (체력 완전 회복)
          </button>

          <h4 style={{ margin: '0 0 10px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
            🍞 음식
          </h4>

          {/* tavernOnly인 음식들만 여기에 나열함 */}
          {SHOP_ITEMS.filter(item => item.tavernOnly).map(item => {
            const price = playerStats.marketPrices?.[item.id] ?? item.basePrice;
            // 주점 음식은 unlimitedStock이라 재고 체크가 필요 없음 - 골드만 확인하면 됨
            const canAfford = playerStats.gold >= price;

            return (
              <div key={item.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(201,166,107,0.3)'
              }}>
                <span>{item.name} (HP +{item.effectValue}) · {formatCurrency(price)}</span>
                <button
                  style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px', opacity: canAfford ? 1 : 0.4, cursor: canAfford ? 'pointer' : 'not-allowed' }}
                  disabled={!canAfford}
                  // 버튼 하나로 "구매 + 즉시 사용(먹기)"까지 한 번에 처리해요.
                  // buyItem으로 인벤토리에 음식을 넣자마자, 바로 이어서 useItem으로 그 음식을 먹게 함
                  // (두 함수가 순서대로 실행되니, 사용자 입장에선 버튼 한 번에 "사서 바로 먹는" 것처럼 느껴짐)
                  onClick={() => {
                    sceneRef.current.buyItem(item.id, 1);
                    sceneRef.current.useItem(item.id, 1);
                  }}
                >
                  구매 후 먹기
                </button>
              </div>
            );
          })}
          {/* 직업이 아직 없으면(playerClass가 null이면), 등급/퀘스트 대신 직업 등록 화면을 보여줌 */}
          {!playerStats.playerClass ? (
            <div style={{ marginBottom: '18px' }}>
              <h4 style={{ margin: '0 0 6px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
                📜 용병 등록
              </h4>
              <p style={{ fontSize: '13px', color: '#c9a66b', margin: '8px 0 12px' }}>
                "처음 왔구나! 용병으로 등록하려면 먼저 전문 분야를 정해야 해. 신중하게 골라줘~"
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px'
              }}>
                {Object.entries(CLASS_TYPES).map(([classId, info]) => (
                  <div
                    key={classId}
                    onClick={() => sceneRef.current.chooseClass(classId)}
                    style={{
                      padding: '10px 6px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: `2px solid ${THEME.borderColor}`,
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '22px' }}>{info.icon}</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '2px' }}>{info.name}</div>
                    <div style={{ fontSize: '9px', color: '#a8927a', marginTop: '2px' }}>{info.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <h4 style={{ margin: '0 0 10px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
                🎖 용병 등급
              </h4>

              {(() => {
                const myRank = RANK_TIERS.find(r => r.id === playerStats.rank);
                const nextRank = RANK_TIERS.find(r => r.order === myRank.order + 1);

                return (
                  <div style={{ marginBottom: '18px' }}>
                    <p style={{ margin: '0 0 6px' }}>현재 등급: <span style={{ color: THEME.gold }}>{myRank.name}</span></p>

                    {!nextRank ? (
                      <p style={{ fontSize: '12px', color: '#a8927a' }}>이미 최고 등급이에요</p>
                    ) : (
                      <>
                        <p style={{ fontSize: '12px', color: '#c9a66b', margin: '0 0 8px' }}>
                          {nextRank.name} 승급 조건: 레벨 {playerStats.level}/{nextRank.requiredLevel}
                          {' · '}완료 의뢰 {playerStats.questsCompletedCount}/{nextRank.requiredQuests}
                          {' · '}시험비 {formatCurrency(nextRank.examFee)}
                        </p>
                        <button
                          onClick={() => sceneRef.current.takeExam()}
                          style={{ ...buttonStyle, width: '100%' }}
                        >
                          리나에게 승급 시험 보기
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}

              <h4 style={{ margin: '18px 0 10px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
                🤝 동료
              </h4>

              {/* 이미 동료가 있으면 그 정보와 해고 버튼을, 없으면 고용 가능한 목록을 보여줌 */}
              {playerStats.hiredCompanionId ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span>현재 동료: {COMPANION_TYPES[playerStats.hiredCompanionId]?.name}</span>
                  <button onClick={() => sceneRef.current.dismissCompanion()} style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px' }}>
                    해고
                  </button>
                </div>
              ) : (
                // Object.entries()는 객체를 [키, 값] 쌍의 배열로 바꿔줘요. COMPANION_TYPES는
                // 배열이 아니라 객체라서, map을 쓰려면 이렇게 먼저 배열 형태로 바꿔줘야 해요.
                Object.entries(COMPANION_TYPES).map(([companionId, info]) => {
                  const canAfford = playerStats.gold >= info.hireCost;
                  return (
                    <div key={companionId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'
                    }}>
                      <span>{info.name} · {info.description}</span>
                      <button
                        onClick={() => sceneRef.current.hireCompanion(companionId)}
                        disabled={!canAfford}
                        style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px', opacity: canAfford ? 1 : 0.4, cursor: canAfford ? 'pointer' : 'not-allowed' }}
                      >
                        고용 {formatCurrency(info.hireCost)}
                      </button>
                    </div>
                  );
                })
              )}

              <h4 style={{ margin: '18px 0 10px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
                📋 퀘스트 게시판
              </h4>

              {QUEST_TEMPLATES.map(quest => {
                // 이 퀘스트를 지금 수락한 상태인지 확인 (playerStats.activeQuestIds가 아직 안 왔을 수도 있어서 ?. 와 [] 로 안전하게 처리)
                const isActive = (playerStats.activeQuestIds || []).includes(quest.id);
                const currentCount = playerStats.inventory[quest.targetId] || 0;
                const canTurnIn = isActive && currentCount >= quest.targetCount;

                // 내 등급이 이 퀘스트가 요구하는 등급보다 낮으면 잠긴 상태예요
                const myRankOrder = RANK_TIERS.find(r => r.id === playerStats.rank)?.order ?? 0;
                const requiredRankOrder = RANK_TIERS.find(r => r.id === quest.minRank)?.order ?? 0;
                const isLocked = myRankOrder < requiredRankOrder;

                return (
                  <div key={quest.id} style={{
                    marginTop: '10px', paddingBottom: '10px',
                    borderBottom: '1px solid rgba(201,166,107,0.3)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ color: THEME.gold, fontSize: '13px' }}>{quest.name}</div>
                        <div style={{ fontSize: '11px', color: '#a8927a', marginTop: '2px' }}>{quest.description}</div>
                        <div style={{ fontSize: '11px', color: '#c9a66b', marginTop: '2px' }}>
                          {getItemDisplayName(quest.targetId)} {currentCount}/{quest.targetCount}
                          {' · '}보상 {formatCurrency(quest.rewardGold)} + EXP {quest.rewardExp}
                        </div>
                      </div>

                      {/* 네 가지 상태에 따라 버튼이 달라짐: 등급 부족 -> 잠김 / 안 받음 -> 수락 / 받았지만 조건 부족 -> 진행중 표시 / 조건 만족 -> 완료 */}
                      {isLocked && (
                        <span style={{ fontSize: '11px', color: THEME.red, flexShrink: 0 }}>
                          🔒 {RANK_TIERS.find(r => r.id === quest.minRank)?.name} 이상
                        </span>
                      )}
                      {!isLocked && !isActive && (
                        <button onClick={() => sceneRef.current.acceptQuest(quest.id)} style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px', flexShrink: 0 }}>
                          수락
                        </button>
                      )}
                      {isActive && !canTurnIn && (
                        <span style={{ fontSize: '11px', color: '#a8927a', flexShrink: 0 }}>진행중</span>
                      )}
                      {isActive && canTurnIn && (
                        <button onClick={() => sceneRef.current.turnInQuest(quest.id)} style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px', flexShrink: 0 }}>
                          완료
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <button onClick={() => setShowTavern(false)} style={{ ...buttonStyle, marginTop: '18px', width: '100%' }}>
            나가기
          </button>
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
            {/* tavernOnly가 true인 음식들은 상인 상점 목록에서 제외 - 주점에서만 살 수 있게 함 */}
            {SHOP_ITEMS.filter(item => !item.tavernOnly).map(item => {
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