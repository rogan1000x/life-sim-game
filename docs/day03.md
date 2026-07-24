# Day 03 - 자원 시스템 확장 + 경험치/레벨업 + 스탯 성장 시스템

## 오늘 배운 것
- **확장 가능한 데이터 구조 설계**: ENTITY_TYPES로 모든 오브젝트(자원/동물/몬스터) 통합 관리
- **category 기반 행동 분기**: 하나의 로직으로 여러 종류의 오브젝트를 다르게 처리
- **Phaser ↔ React 데이터 연동**: useState로 게임 상태를 UI 패널에 실시간 표시
- **useRef를 활용한 함수 브릿지**: Phaser(useEffect 안) 함수를 React(버튼)에서 호출하기
- **오브젝트 재사용 (숨기기/보이기)**: destroy 대신 setActive/setVisible로 리젠 시스템 구현

## 오늘 한 것

### 1. 자원 채집 시스템
- 나무 근처에서 스페이스바 → 채집, 인벤토리 반영
- 거리 계산(Phaser.Math.Distance.Between)으로 상호작용 범위 판정

### 2. 경험치/레벨업 시스템
```javascript
function gainExp(amount) {
  exp += amount;
  const expNeeded = level * 100;
  if (exp >= expNeeded) {
    exp -= expNeeded;
    level++;
    hp = maxHp; // 레벨업 시 풀회복
    statPoints++; // 스탯 포인트 지급
  }
}
```

### 3. 확장 가능한 구조로 리팩토링 (핵심!)
**Before**: 나무/돌/토끼/늑대 각각 다른 그룹과 로직으로 관리
**After**: ENTITY_TYPES 하나의 데이터 + category로 행동 통합
```javascript
const ENTITY_TYPES = {
  tree: { category: 'resource', ... },
  rabbit: { category: 'passive_animal', ... },
  wolf: { category: 'hostile_monster', ... }
};
```
새 오브젝트 추가 시 데이터 한 줄 + 스폰 위치만 추가하면 자동으로 작동

### 4. 몬스터(늑대) 시스템
- 캐릭터를 향해 자동으로 추적
- 스페이스바로 공격 → 체력 감소 → 처치 시 경험치/인벤토리 획득
- 접촉 시 플레이어 HP 감소 + 넉백

### 5. 스탯 성장 시스템
- 레벨업 시 스탯 포인트 획득
- React 버튼으로 공격력/체력/속도 분배
- `useRef`로 Phaser 내부 함수를 React에서 호출

### 6. 화면 밖 등장 + 랜덤 리젠 시간
```javascript
this.physics.world.setBounds(-50, -50, 900, 700); // 월드를 화면보다 넓게
setTimeout(() => {...}, Phaser.Math.Between(5000, 15000)); // 랜덤 리젠
```

### 7. 게임 설정(GAME_CONFIG) 분리
```javascript
const GAME_CONFIG = {
  wolfCount: 4,
  wolfRespawnMin: 5000,
  wolfRespawnMax: 10000
};
```
나중에 옵션 화면에서 조정 가능한 구조로 설계

## 트러블슈팅

### 1. AudioContext 반복 생성 문제
**해결**: 전역 audioContext를 한 번만 생성해서 재사용하는 패턴 적용

### 2. 변수 초기화 순서 오류
**에러**: `Cannot access 'maxHp' before initialization`
**해결**: `let maxHp`를 `let hp = maxHp`보다 먼저 선언

### 3. 오타로 인한 참조 오류
**에러**: `info.moveSpeed`가 존재하지 않는 속성 (실제로는 `info.speed`)
**교훈**: 리팩토링 시 변수명 일관성을 재확인해야 함

### 4. React 개발 서버의 Hot Reload로 인한 게임 중복 생성
**증상**: 콘솔에 "Phaser v4.2.1"이 2번 출력, 레이아웃 깨짐, ref 함수 호출 실패
**원인**: StrictMode는 없었지만, 코드 저장을 반복하며 useEffect가 완전히 정리되지 않고 누적됨
**해결**: 브라우저 탭과 개발 서버를 완전히 재시작하여 해결

## 남은 이슈 (다음 세션에서 확인)
- 레이아웃(게임 화면 + 정보 패널)이 여전히 부자연스러움 - 완전 재시작 후 재확인 필요
- allocateStatRef 관련 동작 재확인 필요

## 현재 게임 시스템 요약
✅ 이동 + 방향 전환
✅ 자원 채집 (나무, 돌)
✅ 동물 (토끼) - 랜덤 이동, 화면 밖 등장
✅ 몬스터 (늑대) - 추적, 전투, 리스폰
✅ 경험치/레벨업
✅ 스탯 성장 (공격력/체력/속도)
✅ 인벤토리
✅ 확장 가능한 ENTITY_TYPES 구조

## 다음 할 것
- 레이아웃 문제 재확인 (완전 재시작 후에도 지속되는지)
- 게임 옵션 화면 UI 만들기 (GAME_CONFIG 값을 조정하는 설정창)
- 새로운 자원/동물/몬스터 종류 추가

## 프로젝트 로드맵 진행상황
Phase 1 (진행중): 싱글플레이어 핵심 재미
✅ 캐릭터 이동
✅ 충돌 시스템
✅ 자원 채집
✅ 인벤토리
✅ 레벨/스탯 시스템
✅ 몬스터 전투
⬜ 집 꾸미기
⬜ NPC