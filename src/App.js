import { useEffect, useRef, useState } from 'react';
import { GameScene } from './GameScene';
import { SHOP_ITEMS, ENTITY_TYPES, formatCurrency, QUEST_TEMPLATES, COMPANION_TYPES, RANK_TIERS, CLASS_TYPES, CLASS_SKILLS, EQUIPMENT_SLOTS, CLASS_ACTIVE_SKILLS } from './gameConfig';
import Phaser from 'phaser';
// recharts는 React에서 그래프/차트를 쉽게 그릴 수 있게 해주는 라이브러리예요.
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// 퀘스트의 targetId(예: 'tree', 'wolf')로 실제 사람이 읽을 이름('나무', '늑대 가죽')을 찾아줘요.
function getItemDisplayName(itemId) {
  const shopItem = SHOP_ITEMS.find(i => i.id === itemId);
  if (shopItem) return shopItem.name;

  const entityItem = ENTITY_TYPES[itemId];
  if (entityItem) return entityItem.name;

  return itemId;
}

// 특정 슬롯(예: 'weapon', 'head')에 장착된 아이템 이름을 "낡은 곡괭이 (내구도 18/30)" 같은 문구로 만들어줘요.
function getEquippedItemLabel(playerStats, slotId) {
  const itemId = playerStats.equipped?.[slotId];
  if (!itemId) return '없음';

  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return '없음';

  const durability = playerStats.equipmentDurability?.[itemId] ?? 0;

  // 반지/목걸이처럼 maxDurability가 999(사실상 무제한)인 경우엔 내구도 표시를 생략함
  if (item.maxDurability >= 999) return item.name;

  return `${item.name} (내구도 ${durability}/${item.maxDurability})`;
}

// 상점 아이템의 효과를 사람이 읽기 좋은 텍스트로 변환 (회복형/스탯 강화형 공통 처리)
function getEffectLabel(item) {
  if (item.effectType === 'heal') return `HP +${item.effectValue}`;
  if (item.effectType === 'attack') return `공격력 +${item.effectValue}`;
  if (item.effectType === 'speed') return `이동속도 +${item.effectValue}`;
  if (item.effectType === 'maxHp') return `최대체력 +${item.effectValue}`;
  if (item.effectType === 'defense') return `방어력 +${item.effectValue}`;
  if (item.effectType === 'critChance') return `치명타 확률 +${item.effectValue}%`;
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
  const sceneRef = useRef(null);

  const [playerStats, setPlayerStats] = useState({
    level: 1, exp: 0, expNeeded: 100, hp: 100, maxHp: 100,
    statPoints: 0, attackPower: 10, moveSpeed: 200, gold: 0, inventory: {},
    equipped: { weapon: null }, rank: 'bronze', questsCompletedCount: 0, playerClass: null,
    primaryStats: { str: 0, vit: 0, agi: 0, int: 0, sen: 0 },
    defense: 0, critChance: 0, critDamage: 150, magicPower: 0, cooldownReduction: 0, precision: 0
  });

  const [showAdmin, setShowAdmin] = useState(false);
  const [showCharacterPanel, setShowCharacterPanel] = useState(false);
  const [godMode, setGodMode] = useState(false);
  const [dialogue, setDialogue] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [logs, setLogs] = useState([]);
  const [farmMenuPlotId, setFarmMenuPlotId] = useState(null);
  const [showTavern, setShowTavern] = useState(false);
  const [graphItemId, setGraphItemId] = useState(null);
  const [skillCooldownMs, setSkillCooldownMs] = useState(0);

  const MAX_VISIBLE_LOGS = 10;

  const addLog = (text, type) => {
    const id = Date.now() + Math.random();

    setLogs(prev => {
      const updated = [...prev, { id, text, type }];
      return updated.slice(-MAX_VISIBLE_LOGS);
    });

    setTimeout(() => {
      setLogs(prev => prev.filter(log => log.id !== id));
    }, 3000);
  };

  useEffect(() => {
    if (!gameStarted) return;

    const scene = new GameScene();

    scene.onStatsUpdate = (stats) => setPlayerStats(stats);
    scene.onShopToggle = () => setShowShop(prev => !prev);
    scene.onDialogue = (text) => setDialogue(text);
    scene.onLog = (text, type) => addLog(text, type);
    scene.onFarmMenuOpen = (plotId) => setFarmMenuPlotId(plotId);
    scene.onTavernOpen = (isOpen) => setShowTavern(isOpen);
    scene.onCooldownUpdate = (ms) => setSkillCooldownMs(ms);

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

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.godMode = godMode;
    }
  }, [godMode]);

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

        {playerStats.playerClass && CLASS_ACTIVE_SKILLS[playerStats.playerClass] && (() => {
          const activeSkill = CLASS_ACTIVE_SKILLS[playerStats.playerClass];
          const isReady = skillCooldownMs <= 0;
          const remainingSec = Math.ceil(skillCooldownMs / 1000);

          return (
            <div style={{ position: 'absolute', bottom: '10px', right: '10px', zIndex: 500, fontFamily: 'monospace' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '8px',
                border: `2px solid ${isReady ? THEME.gold : '#666'}`,
                backgroundColor: isReady ? 'rgba(255,215,106,0.25)' : 'rgba(0,0,0,0.6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Q</span>
                {isReady ? (
                  <span style={{ fontSize: '10px' }}>{activeSkill.name}</span>
                ) : (
                  <span style={{ fontSize: '20px', color: '#aaa' }}>{remainingSec}</span>
                )}
              </div>
            </div>
          );
        })()}

        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: '4px',
          zIndex: 500,
          fontFamily: 'monospace',
          pointerEvents: 'none',
          alignItems: 'flex-start'
        }}>
          {logs.map((log, index) => {
            // logs 배열은 오래된 순서대로 쌓여있어요(맨 뒤가 가장 최신). 그래서
            // "최신으로부터 몇 번째로 오래됐는지"를 구하려면 뒤에서부터 거꾸로 세야 해요.
            const distanceFromNewest = logs.length - 1 - index;
            // 최근 5개(0~4)는 완전히 선명하게(1), 그 뒤부터는 하나씩 지날 때마다 0.2씩 흐려지다가
            // Math.max(0, ...)로 0 밑으로는 안 내려가게 막아둠
            const opacity = distanceFromNewest < 5 ? 1 : Math.max(0, 1 - (distanceFromNewest - 4) * 0.2);

            return (
              <div key={log.id} style={{
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.2)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                whiteSpace: 'nowrap',
                opacity, // 계산한 흐림 정도를 그대로 적용
                transition: 'opacity 0.3s', // 값이 바뀔 때 뚝 끊기지 않고 부드럽게 변하게 함
                backgroundColor:
                  log.type === 'kill' ? 'rgba(180,60,20,0.85)' :
                    log.type === 'gain' ? 'rgba(40,120,60,0.85)' :
                      log.type === 'death' ? 'rgba(150,0,0,0.9)' :
                        'rgba(0,0,0,0.8)'
              }}>
                {log.text}
              </div>
            );
          })}
        </div>
      </div>

      {showCharacterPanel && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          width: '280px',
          maxHeight: '90vh',
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

          <div style={{ marginTop: '8px', fontSize: '12px' }}>
            <p style={{ margin: '0 0 4px', color: THEME.gold }}>🎽 장비</p>
            {EQUIPMENT_SLOTS.map(slotInfo => (
              <p key={slotInfo.id} style={{ margin: '2px 0' }}>
                {slotInfo.icon} {slotInfo.label}: {getEquippedItemLabel(playerStats, slotInfo.id)}
              </p>
            ))}
          </div>

          <div style={{
            marginTop: '12px', padding: '10px',
            backgroundColor: 'rgba(255,215,106,0.08)',
            border: `2px solid ${THEME.borderColor}`, borderRadius: '6px'
          }}>
            <p style={{ margin: '0 0 4px', color: THEME.gold }}>✨ 스탯 포인트: {playerStats.statPoints}</p>

            {(() => {
              const statRadarData = [
                { stat: '근력', value: playerStats.primaryStats?.str || 0 },
                { stat: '활력', value: playerStats.primaryStats?.vit || 0 },
                { stat: '민첩', value: playerStats.primaryStats?.agi || 0 },
                { stat: '지능', value: playerStats.primaryStats?.int || 0 },
                { stat: '감각', value: playerStats.primaryStats?.sen || 0 }
              ];
              const maxValue = Math.max(10, ...statRadarData.map(d => d.value)) + 2;

              return (
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={statRadarData} outerRadius="70%">
                    <PolarGrid stroke={THEME.borderColor} />
                    <PolarAngleAxis dataKey="stat" tick={{ fill: THEME.text, fontSize: 11 }} />
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
              {CLASS_ACTIVE_SKILLS[playerStats.playerClass] && (
                <div style={{ marginBottom: '10px', padding: '6px', backgroundColor: 'rgba(126,200,227,0.1)', border: `1px solid ${THEME.blue}`, borderRadius: '4px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: THEME.blue }}>
                    ⚡ [Q] {CLASS_ACTIVE_SKILLS[playerStats.playerClass].name}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#a8927a' }}>
                    {CLASS_ACTIVE_SKILLS[playerStats.playerClass].description}
                  </p>
                </div>
              )}

              <p style={{ margin: '0 0 8px', color: THEME.gold }}>
                📖 스킬 포인트: {playerStats.skillPoints || 0}
              </p>
              {(CLASS_SKILLS[playerStats.playerClass] || []).map(skill => {
                const currentLevel = playerStats.skillLevels?.[skill.id] || 0;
                const isMaxed = currentLevel >= skill.maxLevel;

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

          {/* 레벨 직접 입력 - useState로 입력창 값을 따로 관리해서, "적용" 버튼 누를 때만 실제로 반영되게 함 */}
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '12px', margin: '0 0 4px' }}>레벨 직접 설정</p>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                type="number"
                min="1"
                id="gm-level-input"
                placeholder="레벨"
                style={{ width: '70px', fontSize: '12px', padding: '4px', fontFamily: 'monospace' }}
              />
              <button
                onClick={() => {
                  // getElementById로 입력창의 지금 값을 직접 읽어와요 (별도 state 없이 간단하게 처리)
                  const input = document.getElementById('gm-level-input');
                  sceneRef.current.adminSetLevel(input.value);
                }}
                style={{ ...buttonStyle, fontSize: '11px', padding: '4px 10px' }}
              >
                적용
              </button>
            </div>
          </div>

          {/* 직업 변경 - 이미 직업이 있어도 카드를 누르면 즉시 바뀜 */}
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '12px', margin: '0 0 4px' }}>직업 변경</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              {Object.entries(CLASS_TYPES).map(([classId, info]) => (
                <button
                  key={classId}
                  onClick={() => sceneRef.current.adminSetClass(classId)}
                  title={info.name}
                  style={{ ...buttonStyle, fontSize: '16px', padding: '6px 0' }}
                >
                  {info.icon}
                </button>
              ))}
            </div>
          </div>

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
                  onClick={() => sceneRef.current.plantSeed(farmMenuPlotId, seed.id)}
                >
                  심기
                </button>
              </div>
            ))
          )}

          <button
            onClick={() => setFarmMenuPlotId(null)}
            style={{ ...buttonStyle, marginTop: '16px', width: '100%' }}
          >
            닫기
          </button>
        </div>
      )}

      {showTavern && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          ...panelStyle,
          padding: '25px',
          zIndex: 3000,
          minWidth: '300px',
          maxHeight: '85vh',
          overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 6px', color: THEME.gold }}>🍺 주점</h3>
          <p style={{ color: '#a8927a', margin: '0 0 16px', fontSize: '13px' }}>
            여행자와 용병들이 쉬어가는 곳이에요
          </p>

          <button
            onClick={() => sceneRef.current.restAtTavern()}
            style={{ ...buttonStyle, width: '100%', marginBottom: '18px', padding: '10px' }}
          >
            🛌 쉬기 (체력 완전 회복)
          </button>

          <h4 style={{ margin: '0 0 10px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
            🍞 음식
          </h4>

          {SHOP_ITEMS.filter(item => item.tavernOnly).map(item => {
            const price = playerStats.marketPrices?.[item.id] ?? item.basePrice;
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

          {!playerStats.playerClass ? (
            <div style={{ marginTop: '18px', marginBottom: '18px' }}>
              <h4 style={{ margin: '0 0 6px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
                📜 용병 등록
              </h4>
              <p style={{ fontSize: '13px', color: '#c9a66b', margin: '8px 0 12px' }}>
                "처음 왔구나! 용병으로 등록하려면 먼저 전문 분야를 정해야 해. 신중하게 골라줘~"
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
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
              <h4 style={{ margin: '18px 0 10px', color: THEME.gold, borderBottom: `2px solid ${THEME.borderColor}`, paddingBottom: '6px' }}>
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

              {playerStats.hiredCompanionId ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span>
                    현재 동료: {COMPANION_TYPES[playerStats.hiredCompanionId]?.name}
                    {playerStats.companionClass && ` (${CLASS_TYPES[playerStats.companionClass]?.icon} ${CLASS_TYPES[playerStats.companionClass]?.name})`}
                  </span>
                  <button onClick={() => sceneRef.current.dismissCompanion()} style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px' }}>
                    해고
                  </button>
                </div>
              ) : (
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
                const isActive = (playerStats.activeQuestIds || []).includes(quest.id);
                const currentCount = playerStats.inventory[quest.targetId] || 0;
                const canTurnIn = isActive && currentCount >= quest.targetCount;

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
            {SHOP_ITEMS.filter(item => !item.tavernOnly).map(item => {
              const price = playerStats.marketPrices?.[item.id] ?? item.basePrice;
              const ownedCount = playerStats.inventory[item.id] || 0;
              const merchantStock = playerStats.marketStock?.[item.id] ?? 10;
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
                      {item.name} {getEffectLabel(item) && `(${getEffectLabel(item)})`}<br />
                      <span style={{ fontSize: '11px', color: '#c9a66b' }}>
                        시세 {formatCurrency(price)}
                        {' · '}
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
                    <button
                      style={{ ...buttonStyle, fontSize: '11px', padding: '5px 8px' }}
                      onClick={() => setGraphItemId(graphItemId === item.id ? null : item.id)}
                    >
                      📈
                    </button>
                  </div>

                  {graphItemId === item.id && (
                    <div style={{ width: '100%', marginTop: '8px' }}>
                      {(() => {
                        const historyArray = playerStats.priceHistory?.[item.id] || [];
                        const chartData = historyArray.map((price, index) => ({ index, price }));

                        if (chartData.length < 2) {
                          return <p style={{ fontSize: '11px', color: '#a8927a' }}>아직 가격 기록이 부족해요 (조금 기다려보세요)</p>;
                        }

                        return (
                          <ResponsiveContainer width="100%" height={80}>
                            <LineChart data={chartData}>
                              <XAxis dataKey="index" hide />
                              <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                              <Line
                                type="monotone"
                                dataKey="price"
                                stroke={THEME.gold}
                                strokeWidth={2}
                                dot={false}
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