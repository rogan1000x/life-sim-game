# Day 04 - 레이아웃 버그 수정 + 사운드 개선 + 파티클 이펙트

## 오늘 배운 것
- **Phaser config의 parent 옵션**: 게임 캔버스를 특정 HTML 요소 안에 렌더링하는 방법
- **브라우저 개발자 도구(Elements 탭)로 실제 DOM 구조 확인하는 디버깅 방법**
- **배음(harmonics)을 이용한 자연스러운 악기 소리 합성**
- **Phaser Tween**: 오브젝트를 부드럽게 변화시키는 애니메이션 시스템
- **setTint/clearTint**: 스프라이트 색상을 임시로 변경하는 방법

## 오늘 한 것

### 1. 레이아웃 버그의 진짜 원인 발견 (중요한 디버깅 경험!)
**증상**: 게임 화면과 정보 패널이 나란히 안 보이고 완전히 다른 위치에 렌더링됨

**디버깅 과정**:
1. React CSS 파일들 확인 → 문제없음
2. 여러 인라인 스타일 수정 시도 → 해결 안 됨
3. **브라우저 개발자 도구(F12) → Elements 탭에서 실제 HTML 구조 직접 확인**
4. `<canvas>`가 `#phaser-game` div 안이 아니라 `<body>` 최하단에 완전히 따로 존재하는 것을 발견!

**진짜 원인**: Phaser의 `config` 객체에 `parent` 옵션이 없어서, Phaser가 캔버스를 어디에 넣어야 할지 몰라 기본값(body)에 그냥 붙여버림

**해결**:
```javascript
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'phaser-game',  // ← 이 옵션이 핵심이었음!
  ...
};
```

**교훈**: 스타일(CSS) 문제라고 생각했던 것이 실제로는 Phaser 설정 문제였음. 
"보이는 증상"만 보고 판단하지 말고, 실제 DOM 구조를 직접 확인하는 것이 정확한 디버깅 방법

### 2. 사운드를 피아노 느낌으로 개선
**이전**: 단순한 sine/sawtooth 파형 (기계음)

**이후**: 배음(harmonics)을 여러 개 겹쳐서 자연스러운 음색 구현
```javascript
const harmonics = [1, 2, 3, 4]; // 기본음, 2배음, 3배음, 4배음
const gains = [0.3, 0.15, 0.08, 0.04]; // 갈수록 작아지는 음량

harmonics.forEach((harmonic, i) => {
  oscillator.frequency.value = frequency * harmonic;
  gainNode.gain.setValueAtTime(gains[i], now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
});
```

### 3. 파티클 이펙트 시스템 구축
**범용 파티클 함수 하나로 여러 상황에 재사용**:
```javascript
function createParticleBurst(scene, x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const particle = scene.add.circle(x, y, 4, color);
    const angle = (Math.PI * 2 * i) / count;
    const speed = Phaser.Math.Between(50, 100);
    
    scene.tweens.add({
      targets: particle,
      x: x + Math.cos(angle) * speed,
      y: y + Math.sin(angle) * speed,
      alpha: 0,
      duration: 400,
      onComplete: () => particle.destroy()
    });
  }
}
```

**적용된 곳**:
- 자원 채집 시: 해당 자원 색상으로 파티클
- 몬스터 처치 시: 빨간색, 더 많은 파티클 (12개)
- 레벨업 시: 캐릭터 위치에서 노란색 파티클 (16개)

### 4. 피격 시 시각적 피드백 추가
```javascript
player.setTint(0xff0000);  // 캐릭터를 빨갛게
this.time.delayedCall(150, () => player.clearTint());  // 0.15초 후 원래대로
```

## 트러블슈팅 교훈
"레이아웃이 이상하다 = CSS 문제"라고 단정 짓지 않고, 
브라우저 개발자 도구로 실제 렌더링된 HTML 구조를 확인하는 것이 
문제의 진짜 위치(이번엔 CSS가 아니라 Phaser 설정)를 찾는 데 결정적이었음

## 완성된 이펙트 시스템
✅ 채집 파티클 (자원별 색상)
✅ 처치 파티클 (빨강, 대량)
✅ 레벨업 파티클 (노랑, 캐릭터 위치)
✅ 피격 시 캐릭터 빨간 깜빡임
✅ 피아노 느낌 사운드

## 다음 할 것
- NPC 추가 (대화 가능한 캐릭터) - 역할(상점? 단순 대화?) 미리 구상 필요
- 게임 옵션 화면 UI

## 프로젝트 로드맵 진행상황
Phase 1 (진행중): 싱글플레이어 핵심 재미
✅ 캐릭터 이동
✅ 충돌 시스템
✅ 자원 채집
✅ 인벤토리
✅ 레벨/스탯 시스템
✅ 몬스터 전투
✅ 이펙트/사운드 개선
⬜ 집 꾸미기
⬜ NPC