# Day 01 - Phaser.js 시작 + 캐릭터 이동

## 오늘 배운 것
- Phaser.js 설치 및 React와 연동
- Phaser 핵심 3단계: preload(준비) → create(생성) → update(매 프레임 반복)
- 키보드 입력 감지 (createCursorKeys)
- 캐릭터를 화살표 키로 이동
- 화면 경계 제한 (Phaser.Math.Clamp)
- 이미지를 캐릭터 스프라이트로 사용하기

## 오늘 한 것
1. `npx create-react-app life-sim-game`
2. `npm install phaser`
3. App.js에 Phaser 게임 설정
4. 네모(임시 캐릭터) → 이미지 스프라이트로 교체
5. 화살표 키로 상하좌우 이동 구현
6. 화면 밖으로 못 나가게 경계 제한

## 핵심 코드
```javascript
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
  if (cursors.left.isDown) player.x -= speed;
  if (cursors.right.isDown) player.x += speed;
  if (cursors.up.isDown) player.y -= speed;
  if (cursors.down.isDown) player.y += speed;

  player.x = Phaser.Math.Clamp(player.x, 20, 780);
  player.y = Phaser.Math.Clamp(player.y, 20, 580);
}
```

## 트러블슈팅
- **cursors is undefined 에러**: create()에서 cursors 초기화 코드가 누락되어 발생 → 추가하여 해결
- **이미지 화질 뭉개짐**: 일반 사진을 억지로 작게 리사이즈해서 발생 → 추후 게임 전용 스프라이트(Kenney.nl 등)로 교체 예정

## 다음 할 것
- 게임 전용 캐릭터 스프라이트로 교체 (Kenney.nl)
- 맵/배경 타일 추가
- 자원(나무/돌) 채집 시스템 시작

## 프로젝트 로드맵
```
Phase 1 (현재): 싱글플레이어 핵심 재미 완성
  ✅ 캐릭터 이동
  ⬜ 자원 채집
  ⬜ 인벤토리
  ⬜ 집 꾸미기
  ⬜ NPC
  ⬜ 동물
  ⬜ 몬스터 전투

Phase 2 (나중): 백엔드 연결 (세이브 데이터)
Phase 3 (최종): 멀티플레이어 (Socket.io)
```