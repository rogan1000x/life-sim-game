# Day 21

## 1. 도적 Q키(은신)가 안 먹히던 버그

**증상**: 도적으로 Q를 누르면 은신이 아니라 "사거리 안에 몬스터가 없어요"만 뜨고 아무 일도 안 일어남.

**원인**: `useActiveSkill()`에서 도적이 warrior/archer랑 같은 조건문에 묶여 있었음.
Q가 "은신"이 아니라 "근처 타겟에게 즉시 공격"으로 동작했고, 근처에 몬스터가 없으면 실패 메시지만 뜸.
은신→기습(치명타) 로직(`rogueAmbushReady`)은 근접 공격 코드에 이미 있었는데, Q키가 그걸 켜주지 않고 있었음.

**수정**:
- 도적을 별도 분기로 분리. Q를 누르면 몬스터 유무와 상관없이 은신 상태(`rogueAmbushReady = true`, 반투명)가 됨.
- `CLASS_ACTIVE_SKILLS.rogue.stealthDurationMs`(5000ms) 동안 공격하지 않으면 자동 해제.
- 다음 근접 공격은 기습 치명타(`ambushMultiplier`)로 들어감.
- 은신 해제 로직을 `breakStealth()` 하나로 통합 (기습 성공 / 피격 / 시간 초과 / 사망 공통).
- 몬스터에게 맞으면 은신이 풀림 ("공격을 받아 은신이 풀렸어요!").
- 자동 해제 타이머를 `rogueStealthTimer`에 저장하고 해제 시 함께 제거
  → 은신 → 해제 → 재은신 시 옛 타이머가 새 은신을 조기 종료시키는 문제 방지.

**관련 파일**: `GameScene.js` (`useActiveSkill`, `breakStealth`, 플레이어-몬스터 overlap, `handleDeath`)

---

## 2. 용병(동료)과 소환사 정령이 같은 슬롯을 공유하던 버그

**증상**: 용병을 고용한 상태에서 정령을 소환하면(또는 반대로) 이전 유닛 정보가 덮어써져서 둘을 동시에 데리고 다닐 수 없었음.

**원인**: `hireCompanion`과 정령 소환(Q키/테이밍)이 `hiredCompanionId`, `companionSprite`, `companionClass` 등 같은 변수를 공유.

**수정**:
- `this.allies = { mercenary, spirit }` 구조로 상태를 완전히 분리.
- 스프라이트/체력/콜라이더/자동스킬 타이머를 슬롯별로 독립 관리하도록 메서드를 슬롯 기반으로 리팩터링
  (`spawnAlly`, `dismissAlly`, `updateAllyFollow`, `updateAllyFacing`, `allyBasicAttack`,
  `gainAllyExp`, `startAllyAutoSkillTimer`, `useAllyAutoSkill`, `handleAllyKO`).
- 근접 공격 보너스, 성직자 힐 대상 선정도 두 유닛을 모두 고려.
- 따라다닐 때/부활할 때 겹치지 않게 슬롯별 위치 분리 (용병 왼쪽, 정령 오른쪽).
- 세이브 포맷을 `allies: { mercenary, spirit }`로 변경, 예전 세이브는 자동 마이그레이션.
- `syncStatsToReact()`: 기존 키(`hiredCompanionId` 등)는 용병 정보로 유지, 정령은 `spiritCompanionId`/`spiritLevel`/`spiritExp` 추가.

**관련 파일**: `GameScene.js` (동료/정령 관련 메서드 전반)

---

## 3. 주점 UI에 정령 상태 표시
- `App.js` 주점의 "🤝 동료" 아래에 "👻 정령" 섹션 추가 (이름/성격/레벨/EXP, 놓아주기 버튼).
- 정령이 없을 때: 소환사면 Q키 소환 안내, 다른 직업이면 "소환사 전용" 안내.
- `GameScene.js`에 `dismissSpirit()` 추가 (`dismissAlly('spirit')` 래퍼).

## 4. 용병/정령 HP바를 게임 화면에 표시
- `allyHpBarGraphics`(Graphics 1개)를 매 프레임 `drawAllyHpBars()`가 clear 후 다시 그림
  → 유닛별 오브젝트를 만들고 지울 필요가 없어 유령 오브젝트 문제 여지 없음.
- 체력 비율에 따라 초록(60%↑) → 노랑(30%↑) → 빨강.
- 쓰러진(KO)/해고된 유닛은 바를 안 그림. 집/주점 내부에서는 바를 지움.

---

## 남은 할 일
- [ ] (아이디어) 유닛 레벨을 HP바 옆에 작게 표시
- [ ] (아이디어) 피격 시 HP바가 잠깐 깜빡이는 연출