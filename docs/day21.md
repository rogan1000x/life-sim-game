# Day 21

## 오늘 고친 버그 두 가지

### 1. 도적 Q키(은신)가 안 먹히던 버그

**증상**: 도적으로 Q를 누르면 은신이 아니라 "사거리 안에 몬스터가 없어요"만 뜨고 아무 일도 안 일어남.

**원인**: `useActiveSkill()`에서 도적이 warrior/archer랑 같은 조건문에 묶여 있었음.
그래서 Q가 "은신"이 아니라 "근처 타겟에게 즉시 공격"으로 동작했고, 근처에 몬스터가 없으면
그냥 실패 메시지만 뜨고 끝났음. 정작 은신→기습(치명타) 로직(`rogueAmbushReady`)은
근접 공격 코드에 이미 구현되어 있었는데, Q키가 그걸 켜주질 않고 있었음.

**수정**:
- 도적을 별도 분기로 분리. Q를 누르면 몬스터 유무와 상관없이 은신 상태
  (`rogueAmbushReady = true`, 플레이어 반투명 처리)가 됨.
- `gameConfig.js`의 `CLASS_ACTIVE_SKILLS.rogue.stealthDurationMs`(5000ms)를 반영해서,
  그 시간 안에 공격하지 않으면 은신이 자동으로 풀리도록 타이머 추가.
- 다음 근접 공격은 자동으로 기습 치명타(`ambushMultiplier` 적용)로 들어감.
- 사망 시(`handleDeath`) 은신 상태가 남아있으면 초기화해서, 부활 후에도 계속
  반투명으로 남는 일이 없게 처리.

**관련 파일**: `GameScene.js` (`useActiveSkill`, `handleDeath`)

---

### 2. 용병(동료)과 소환사 정령이 같은 슬롯을 공유하던 버그

**증상**: 용병을 고용한 상태에서 소환사가 정령을 소환하면(또는 반대로), 이전 유닛 정보가
덮어써져서 둘을 동시에 데리고 다닐 수 없었음.

**원인**: 용병 고용(`hireCompanion`)과 소환사 정령 소환(Q키 / 테이밍)이
`hiredCompanionId`, `companionSprite`, `companionClass` 등 **같은 변수**를 공유하고 있었음.

**수정**:
- `this.allies = { mercenary, spirit }` 구조로 상태를 완전히 분리.
- 스프라이트, 체력, 콜라이더, 자동 스킬 타이머까지 각 슬롯이 독립적으로 관리되도록
  관련 메서드를 전부 슬롯 기반으로 리팩터링
  (`spawnAlly`, `dismissAlly`, `updateAllyFollow`, `updateAllyFacing`, `allyBasicAttack`,
  `gainAllyExp`, `startAllyAutoSkillTimer`, `useAllyAutoSkill`, `handleAllyKO`).
- 근접 공격 보너스, 성직자 힐 대상 선정 등도 두 유닛을 모두 고려하도록 일반화.
- 따라다닐 때/부활할 때 서로 겹치지 않게 슬롯별로 위치를 살짝 다르게 배치
  (용병은 왼쪽, 정령은 오른쪽).
- 세이브 데이터 포맷을 `allies: { mercenary, spirit }`로 변경하되, 예전 세이브
  (`hiredCompanionId` 등)도 자동 마이그레이션되도록 처리.
- `syncStatsToReact()`는 기존 UI 호환을 위해 예전 키(`hiredCompanionId` 등)는
  용병 정보 그대로 유지하고, 정령 정보는 `spiritCompanionId`/`spiritLevel`/`spiritExp`로
  새로 추가함. **(TODO: App.js에 정령 상태를 보여주는 UI는 아직 없음 — 다음에 추가 필요)**

**관련 파일**: `GameScene.js` (동료/정령 관련 메서드 전반)

---

## 남은 할 일 (Day 22 후보)
- [ ] `App.js` 주점 UI에 소환사 정령 상태(`spiritCompanionId`, `spiritLevel`, `spiritExp`) 표시 추가
- [ ] 용병/정령 두 유닛을 UI에서 각각 구분해서 보여주는 패널 검토
- [ ] (선택) 도적 은신 중 피격 시 은신이 풀리는 연출 추가 여부 검토