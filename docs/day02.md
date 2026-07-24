# Day 02 - 캐릭터 방향전환 + 오브젝트 충돌 시스템

## 오늘 배운 것
- **setFlipX()**: 스프라이트를 좌우로 반전시켜 방향 표현
- **Phaser Physics (Arcade Physics)**: 충돌 감지를 위한 물리 엔진 활성화
- **정적 물리 객체 (static body)**: 움직이지 않는 오브젝트(나무) 만들기
- **collider()**: 두 오브젝트 간 충돌 규칙 설정
- **핵심 개념**: 위치를 직접 변경하는 것과 velocity(속도)로 제어하는 것의 차이
- **React StrictMode와 Phaser의 충돌 문제**

## 오늘 한 것

### 1. 배경 스타일링
```javascript
backgroundColor: '#4a7c3c',  // 잔디 느낌 초록색
```
격자무늬를 그려서 타일 느낌 추가:
```javascript
const graphics = this.add.graphics();
graphics.lineStyle(1, 0x3d6830, 0.5);
for (let x = 0; x <= 800; x += 40) {
  graphics.moveTo(x, 0);
  graphics.lineTo(x, 600);
}
```

### 2. 캐릭터 방향 전환
```javascript
if (cursors.left.isDown) {
  player.setFlipX(true);   // 왼쪽 볼 때 이미지 뒤집기
} else if (cursors.right.isDown) {
  player.setFlipX(false);  // 오른쪽 볼 때 원래대로
}
```

### 3. 나무 오브젝트 배치 (충돌 시스템 기반)
```javascript
trees = this.add.group();

treePositions.forEach(pos => {
  const tree = this.add.circle(pos.x, pos.y, 20, 0x2d5016);
  this.physics.add.existing(tree, true);  // 정적 물리 객체
  trees.add(tree);
});
```

### 4. Physics 설정 추가
```javascript
physics: {
  default: 'arcade',
  arcade: { debug: true }  // 개발 중엔 충돌 영역 시각화
}
```

## 트러블슈팅

### 문제 1: React StrictMode로 인한 게임 중복 생성
**증상**: 콘솔에 "Phaser v4.2.1"이 2번 출력됨

**원인**: `<React.StrictMode>`가 개발 모드에서 useEffect를 의도적으로 2번 실행시킴

**해결**: `index.js`에서 `<React.StrictMode>` 제거

### 문제 2 (핵심!): 충돌 설정을 했는데도 캐릭터가 나무를 통과함
**원인**: `update()`에서 위치를 직접 변경하고 있었음
```javascript
// 문제가 된 코드
player.x -= speed;  // 물리엔진의 충돌 계산을 무시하고 강제로 위치 변경
```

물리엔진이 "충돌났으니 멈춰야 함"을 계산해도, 다음 프레임에서 코드가 다시 강제로 위치를 바꿔버려서 마치 통과하는 것처럼 보임

**해결**: 위치를 직접 바꾸지 않고, velocity(속도)를 설정해서 물리엔진이 알아서 처리하게 함
```javascript
// 수정된 코드
player.body.setVelocity(velocityX, velocityY);
```

**핵심 교훈**:
직접 위치 변경 = 물리엔진 무시하고 강제 이동
velocity 설정 = 물리엔진에게 "이 속도로 움직여줘"라고 위임
→ 충돌이 발생하면 물리엔진이 알아서 멈추거나 막아줌

## 완성된 update() 함수
```javascript
function update() {
  const speed = 200;
  let velocityX = 0;
  let velocityY = 0;

  if (cursors.left.isDown) {
    velocityX = -speed;
    player.setFlipX(true);
  } else if (cursors.right.isDown) {
    velocityX = speed;
    player.setFlipX(false);
  }

  if (cursors.up.isDown) {
    velocityY = -speed;
  } else if (cursors.down.isDown) {
    velocityY = speed;
  }

  player.body.setVelocity(velocityX, velocityY);
}
```

## 남은 이슈 (추후 확인 필요)
- AudioContext 관련 에러 메시지 발생 (개발 모드 hot-reload 특성으로 추정)
- 게임 플레이(이동, 충돌)에는 영향 없음을 확인
- 나중에 실제 사운드 추가 시 재점검 필요

## 현재 게임 상태
- ✅ 캐릭터 이동 (velocity 기반)
- ✅ 방향 전환 (좌우 반전)
- ✅ 배경 (잔디 + 격자)
- ✅ 나무 오브젝트 + 충돌 처리

## 다음 할 것
- 나무를 "채집 가능한 자원"으로 발전 (클릭/상호작용 시 사라지고 아이템 획득)
- 인벤토리 시스템 기초
- 진짜 타일 이미지로 교체 (현재는 색상 도형)

## 프로젝트 로드맵 진행상황
Phase 1 (진행중): 싱글플레이어 핵심 재미
✅ 캐릭터 이동
✅ 충돌 시스템
⬜ 자원 채집
⬜ 인벤토리
⬜ 집 꾸미기
⬜ NPC
⬜ 동물
⬜ 몬스터 전투
