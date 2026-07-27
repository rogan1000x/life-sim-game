# Day 07 - Phaser Scene 클래스 분리 (대규모 리팩토링)

## 오늘 배운 것
- ES6 모듈의 import/export를 이용한 파일 분리 방법
- Phaser.Scene 클래스를 상속받아 게임 로직을 체계적으로 관리하는 표준 방식
- 클래스의 this를 이용한 상태 관리 (기존의 흩어진 변수들을 하나로 통합)
- React와 Phaser 클래스 인스턴스를 useRef로 직접 연결하는 방법

## 오늘 한 것

### 배경 - 큰 그림을 위한 준비
게임을 마을/결혼/건축 등 훨씬 큰 규모로 확장하고 싶다는 장기 목표가 생겼고, 
그러려면 지금처럼 App.js 한 파일에 모든 로직이 뒤섞인 구조로는 
한계가 있다고 판단하여, 본격적인 콘텐츠 추가 전에 구조 정리를 진행함

### 1단계: 데이터 분리 (gameConfig.js)
GAME_CONFIG, ENTITY_TYPES, NPC_DATA, SHOP_ITEMS를 별도 파일로 분리. 
export/import를 이용해 다른 파일에서도 동일하게 사용 가능하게 함

### 2단계: 게임 로직 분리 (GameScene.js)
useEffect 안에 뒤섞여 있던 모든 Phaser 관련 함수(사운드, 파티클, 엔티티 생성, 
경험치, 인벤토리, 저장/불러오기 등)를 Phaser.Scene을 상속받는 클래스로 통합

기존에는 let player, let hp 같은 개별 변수들을 함수 밖에 선언하고 
여러 함수가 클로저로 공유하는 방식이었는데, 이제는 this.player, this.hp처럼 
클래스의 속성으로 관리하여 훨씬 명확한 구조가 됨

### 3단계: React-Phaser 연결 방식 단순화
기존에는 allocateStatRef, buyItemRef, revivePlayerRef처럼 
기능마다 별도의 useRef를 만들어 다리 역할을 하게 했는데, 
이제는 GameScene 인스턴스 자체를 하나의 sceneRef로 참조하고, 
sceneRef.current.allocateStat(...)처럼 클래스의 메서드를 직접 호출하는 
방식으로 단순화함

React에서 필요한 콜백(상태 업데이트, 상점 열기 등)은 
scene.onStatsUpdate, scene.onShopToggle처럼 GameScene에 
함수를 주입하는 방식으로 연결

## 새로운 파일 구조
- App.js: React 컴포넌트, state 관리, UI(JSX)만 담당
- gameConfig.js: 게임 데이터(자원, NPC, 상점 아이템 등)
- GameScene.js: Phaser 게임 로직 전체 (이동, 전투, 채집, 저장 등)

## 이 구조가 앞으로 확장에 유리한 이유
Phaser는 여러 Scene을 자연스럽게 전환할 수 있는 구조를 기본 지원하므로, 
나중에 마을 화면, 집 안 화면 등을 추가할 때 VillageScene, HouseScene처럼 
같은 패턴으로 새 Scene 파일을 만들어 확장하면 됨. 데이터도 gameConfig.js에 
계속 추가만 하면 되는 구조라, 큰 그림(마을, 결혼, 건축 등)으로 
나아가기 위한 기반이 마련됨

## 검증
리팩토링 후에도 기존의 모든 기능(이동, 채집, 레벨업, 전투, 상점, 
Admin 모드, 저장/불러오기)이 정상 작동하는 것을 확인함

## 다음 할 것
- 집 꾸미기 시스템 (캐릭터 근처부터 시작)
- 이후 장기적으로: 마을 시스템, NPC 확장, 결혼/동료 시스템 등 
  (모두 이번에 정리한 Scene 구조 위에 쌓아갈 예정)

## 장기 비전 (메모)
캐릭터 중심 development → 마을 형성 → 동료/결혼/자녀 시스템 → 
건축(상점, 성) → 마을/도시 이름 짓기 등을 포함한 
생활 시뮬레이션 게임으로 확장하는 것이 최종 목표