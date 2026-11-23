/* 기본 동작 수치와 무기별 특수 공격표, 그리고 상태 → 자세(Rig.pose) 변환.
   근거(README "동작과 특수 공격" 표에 정리)
   - 점프: Kyle Pittman, "Math for Game Programmers: Building a Better Jump"(GDC 2016). 높이 h·꼭대기까지 시간 th 로 정한다 → g = 2h/th², v0 = 2h/th.
     떨어질 때 중력을 키워(×1.7) 둥실 뜨는 느낌을 없애고, 키를 일찍 떼면 위 속도를 반으로 잘라 낮은 점프가 된다(가변 점프 높이).
   - 구르기: 다크 소울 류 회피. 무적 시간은 전체의 약 60%(0.04~0.34초), 끝 0.1초는 무방비(회복). 거리 3.2m, 처음에 빠르고 끝에 느리게.
   - 튕겨내기: 세키로 '튕겨내기'·스트리트 파이터 3 '블로킹'. 누른 뒤 짧은 창(0.12~0.24초) 안에 맞으면 성공, 헛치면 회복 시간이 있어 연타를 막는다.
   - 모으기: 몬스터 헌터 대검 '모아 베기' 3단. 단계마다 위력·사거리가 오르고, 단계가 오르는 순간 빛과 몸 떨림으로 알린다.
   - 프레임 데이터: 발동(wind)·판정(swing)·회복(end) 세 칸. 무거운 무기일수록 발동·회복이 길다(격투 게임 프레임 표 관례). */
const Moves = (() => {
  const JUMP = { h: 1.3, th: 0.3, fallMul: 1.7, cut: 0.5, pre: 0.05, air: 3.6 };
  JUMP.g = 2 * JUMP.h / (JUMP.th * JUMP.th); JUMP.v0 = 2 * JUMP.h / JUMP.th;
  const ROLL = { dur: 0.48, dist: 3.2, iFrom: 0.04, iTo: 0.34, cancel: 0.4 };
  const CHARGE = { start: 0.22, lv: [0.45, 0.95], max: 1.6, mul: [1, 1.3, 1.65] };
  const LAND = { soft: 0.1, heavy: 0.32 };

  /* 무기별 특수 공격. dash 는 발동(wind) 동안 앞으로 미끄러지는 거리 — 다 붙은 뒤 휘두른다.
      kind: 모으기(charge)·점프 올려베기(rise)·점프 내려치기(plunge)·튕겨내기(parry)·웅크려 쓸기(low)
     근접 값은 index.html 의 M() 기본값 위에 덮어쓴다. 원거리는 쏘는 방식(n 발·퍼짐·크기)을 바꾼다. */
  const SP = {
    sword: {
      charge: { n: '발도 일섬', roll: 90, a0: -160, a1: 120, sweep: true, reach: 2.7, wind: 0.16, swing: 0.12, end: 0.5, pow: [0.7, 1], dash: 3.0, h: 1.1 },
      rise: { n: '올려베기 점프', roll: -10, pitch: 10, a0: 80, a1: -150, reach: 2.3, arc: 75, wind: 0.02, swing: 0.14, end: 0.42, launch: 7.5, h: 1.0 },
      plunge: { n: '내려치기', roll: 0, a0: -170, a1: 60, shock: 2.2, pow: [0.7, 1] },
      parry: { n: '칼날 튕겨내기', win: 0.18, rec: 0.34, stun: 1.4 },
      low: { n: '낮은 쓸기', roll: 85, a0: -100, a1: 90, sweep: true, h: 0.35, reach: 2.4, wind: 0.06, swing: 0.12, end: 0.4, trip: true },
    },
    axe: {
      charge: { n: '대지 가르기', roll: 0, a0: -175, a1: 60, reach: 2.6, arc: 50, wind: 0.08, swing: 0.13, end: 0.75, pow: [0.8, 1], w: 8, shockAt: 2.0, shock: 1.6 },
      rise: { n: '회전 올려치기', roll: -20, pitch: 15, a0: 90, a1: -200, reach: 2.5, arc: 90, wind: 0.04, swing: 0.2, end: 0.55, launch: 8.5, w: 7, h: 1.0 },
      plunge: { n: '지면 강타', roll: 0, a0: -180, a1: 70, shock: 3.0, pow: [0.8, 1], w: 7 },
      parry: { n: '자루 막기', win: 0.12, rec: 0.42, stun: 2.0 },
      low: { n: '발목 베기', roll: 88, a0: -90, a1: 90, sweep: true, h: 0.3, reach: 2.4, wind: 0.12, swing: 0.16, end: 0.55, trip: true, w: 7 },
    },
    dagger: {
      charge: { n: '그림자 돌진', type: 'thrust', reach: 2.4, arc: 30, a0: 0, a1: 0, wind: 0.14, swing: 0.08, end: 0.4, dash: 4.2, multi: 3, pow: [0.4, 0.7], len: 120, w: 3 },
      rise: { n: '회전 올려베기', roll: -20, pitch: 20, a0: 70, a1: -290, reach: 2.2, arc: 90, wind: 0.02, swing: 0.16, end: 0.34, launch: 6.5, len: 120, w: 3, h: 0.9 },
      plunge: { n: '낙하 찌르기', roll: 0, a0: -150, a1: 50, shock: 1.3, pow: [0.6, 0.9], len: 120, w: 3 },
      parry: { n: '흘려 받기', win: 0.24, rec: 0.24, stun: 1.0 },
      low: { n: '다리 긋기', roll: 80, a0: -80, a1: 80, sweep: true, h: 0.3, reach: 2.1, wind: 0.03, swing: 0.07, end: 0.22, trip: true, len: 120, w: 3 },
    },
    spear: {
      charge: { n: '돌진 찌르기', type: 'thrust', reach: 3.6, arc: 20, a0: 0, a1: 0, wind: 0.16, swing: 0.14, end: 0.55, dash: 3.6, pow: [0.7, 1], len: 320 },
      rise: { n: '장대 올려치기', roll: -5, pitch: 25, a0: 70, a1: -140, reach: 3.0, arc: 60, wind: 0.03, swing: 0.15, end: 0.45, launch: 8, len: 320, h: 1.0 },
      plunge: { n: '내리꽂기', roll: 0, a0: -100, a1: 80, shock: 2.4, pow: [0.7, 1], len: 320 },
      parry: { n: '자루 돌려 튕기기', win: 0.16, rec: 0.36, stun: 1.5 },
      low: { n: '휩쓸어 넘기기', roll: 88, a0: -100, a1: 100, sweep: true, h: 0.3, reach: 3.2, wind: 0.08, swing: 0.16, end: 0.48, trip: true, len: 320 },
    },
    /* 원거리: 모으기 = 큰 탄·여러 발, 점프 = 뒤로 뛰며 쏘기, 공중 = 땅에 내려쏘기(착탄 폭발) */
    staff: { charge: { n: '대마력구', mul: 1.8, n2: 1 }, rise: { n: '뒤로 뛰며 쏘기', back: 3.4 }, plunge: { n: '내려쏘기', shock: 2.0 }, parry: { n: '지팡이 밀쳐내기', win: 0.15, rec: 0.36, stun: 1.0 } },
    wand: { charge: { n: '삼연발', n2: 3, spread: 0, gap: 0.07 }, rise: { n: '뒤로 뛰며 쏘기', back: 3.4 }, plunge: { n: '내려쏘기', shock: 1.5 }, parry: { n: '밀쳐내기', win: 0.15, rec: 0.3, stun: 0.9 } },
    bow: { charge: { n: '끝까지 당긴 세 발', n2: 3, spread: 12, mul: 1.3 }, rise: { n: '뒤로 뛰며 쏘기', back: 3.8 }, plunge: { n: '화살비', shock: 2.2 }, parry: { n: '활 밀쳐내기', win: 0.14, rec: 0.36, stun: 0.9 } },
    bullet: { charge: { n: '산탄', n2: 5, spread: 24, mul: 0.9 }, rise: { n: '뒤로 뛰며 쏘기', back: 3.4 }, plunge: { n: '내려쏘기', shock: 1.6 }, parry: { n: '개머리 치기', win: 0.15, rec: 0.32, stun: 1.0 } },
    throw: { charge: { n: '부채꼴 투척', n2: 3, spread: 20, mul: 1.1 }, rise: { n: '뒤로 뛰며 던지기', back: 3.4 }, plunge: { n: '내리꽂아 던지기', shock: 1.8 }, parry: { n: '쳐내기', win: 0.16, rec: 0.32, stun: 1.0 } },
    grimoire: { charge: { n: '대폭발', mul: 1.5 }, rise: { n: '상승 폭발', launch: 7 }, plunge: { n: '운석 낙하', shock: 3.4 }, parry: { n: '마력 반사', win: 0.16, rec: 0.36, stun: 1.2 } },
  };

  /* ---------- 자세 ---------- */
  const R = Rig.pose, PI = Math.PI;
  const KEY = {
    crouch: R({ wt: 0.5, lean: 0.5, lL: [1.25, 2.3], lR: [1.0, 2.1], aL: [1.1, 0.15, 1.3], aR: [0.9, 0.15, 1.2], head: 0.3, st: 0.16 }),
    preJump: R({ wt: 0.5, lean: 0.45, lL: [0.95, 1.7], lR: [0.95, 1.7], aL: [-0.5, 0.15, 0.4], aR: [-0.5, 0.15, 0.4] }),
    rise: R({ lean: -0.05, lL: [1.25, 1.9], lR: [0.15, 0.35], aL: [2.4, 0.2, 0.4], aR: [2.2, 0.2, 0.4], head: -0.3 }),
    apex: R({ lean: 0.2, lL: [1.3, 2.1], lR: [0.8, 1.6], aL: [1.6, 0.6, 0.8], aR: [1.6, 0.6, 0.8] }),
    fall: R({ lean: 0.1, lL: [0.5, 0.7], lR: [0.2, 0.4], aL: [1.9, 1.0, 0.4], aR: [1.9, 1.0, 0.4], head: 0.2 }),
    land: R({ wt: 0.5, lean: 0.5, lL: [1.1, 1.9], lR: [0.9, 1.7], aL: [0.7, 0.5, 0.6], aR: [0.7, 0.5, 0.6], head: 0.25 }),
    heavyLand: R({ wt: 0.7, lean: 0.85, lL: [1.5, 2.5], lR: [0.4, 1.9], aL: [1.2, 0.5, 0.4], aR: [1.3, 0.2, 0.2], head: 0.5 }),
    roll: R({ lean: 1.0, lL: [2.0, 2.6], lR: [2.1, 2.6], aL: [1.5, 0.3, 2.1], aR: [1.5, 0.3, 2.1], head: 0.6 }),
    parry: R({ wt: 0.35, lean: 0.1, twist: -0.35, lL: [0.45, 0.6], lR: [-0.15, 0.3], aL: [1.4, 0.2, 1.5], aR: [1.9, -0.1, 1.0], head: 0.1 }),
    charge: R({ wt: 0.25, lean: 0.38, twist: 0.75, lL: [0.75, 1.1], lR: [-0.1, 0.65], aL: [0.6, 0.3, 0.6], aR: [0.4, 0.4, 0.5], st: 0.2 }),
    aim: R({ wt: 0.4, lean: 0.08, twist: -0.25, lL: [0.3, 0.35], lR: [-0.15, 0.2], aL: [1.2, 0.1, 0.6], aR: [1.57, 0, 0.05] }),
    plunge: R({ lean: -0.2, lL: [1.1, 1.8], lR: [0.6, 1.2], aL: [2.9, 0.1, 0.3], aR: [2.9, 0.1, 0.3], head: -0.2 }),
    hurt: R({ wt: 0.15, lean: -0.35, side: 0.1, head: -0.4, aL: [0.6, 0.6, 0.5], aR: [0.7, 0.6, 0.6], lL: [0.35, 0.5], lR: [-0.1, 0.2] }),
    stun: R({ wt: 0.55, lean: 0.45, side: 0.15, head: 0.7, aL: [0.15, 0.3, 0.2], aR: [0.15, 0.3, 0.2], lL: [0.5, 1.0], lR: [0.2, 0.6] }),
    teleUp: R({ wt: 0.25, lean: -0.3, aL: [2.9, 0.35, 0.5], aR: [2.9, 0.35, 0.5], lL: [0.5, 0.8], lR: [-0.1, 0.4], head: -0.35 }),
    slam: R({ wt: 0.85, lean: 0.75, aL: [1.0, 0.25, 0.1], aR: [1.0, 0.25, 0.1], lL: [0.9, 1.3], lR: [-0.2, 0.3], head: 0.3 }),
    down: R({ lean: 0.1, aL: [2.6, 0.9, 0.2], aR: [2.4, 0.9, 0.3], lL: [0.3, 0.4], lR: [0.15, 0.6], head: -0.3 }),
  };
  /* 근접 공격 몸: 감기(예비) → 풀기(판정) → 돌아오기. 비틀기로 상체가 먼저 감기고(꼬임), 발이 앞으로 한 걸음 나간다 */
  /* t 는 공격 시작 후 초, m 은 동작(wind 발동·swing 판정·end 끝). 판정 시각에 몸이 가장 멀리 풀려 있게 키를 프레임 데이터에 맞춘다 */
  function swingBody(t, m, heavy) {
    const thrust = m.type === 'thrust', dir = (m.a1 || 0) >= (m.a0 || 0) ? 1 : -1;   // 휘두르는 방향으로 몸을 감았다 푼다
    const coil = R({ wt: 0.22, lean: -0.08 - 0.1 * heavy, twist: dir * (0.55 + 0.3 * heavy), lL: [0.3, 0.45], lR: [-0.1, 0.35], head: 0.1, aL: [0.7, 0.4, 0.9] });
    const hit = R({ wt: thrust ? 0.9 : 0.8 + 0.1 * heavy, lean: 0.3 + 0.25 * heavy + (thrust ? 0.15 : 0), twist: thrust ? -0.3 : -dir * (0.65 + 0.25 * heavy), lL: [0.75 + (thrust ? 0.3 : 0), 0.55], lR: [-0.5, 0.35], head: 0.15, aL: [0.3, 0.5, 0.4] });
    const rest = R({ wt: 0.6, lean: 0.12, twist: -dir * 0.15, lL: [0.35, 0.4], lR: [-0.1, 0.25] });
    const w = Math.max(0.03, m.wind || 0), s = m.swing || 0.1;
    const K = [[0, coil, 'out'], [w, coil, 'io'], [w + s, hit, 'out'], [Math.max(w + s + 0.01, m.end || 0.4), rest, 'io']];
    /* 몸쪽→끝쪽 순서(Putnam 1993 · 투구·타격 운동사슬): 체중·다리가 먼저, 몸통이 다음, 팔·머리가 마지막에 같은 키에 닿는다.
       앞선 시간(다리 0.05초 · 몸통 0.025초)은 논문 값이 아니라 60fps에서 3·1.5프레임으로 보이게 정한 값 */
    const lead = Math.min(0.05, w * 0.6), legs = Rig.track(K, t + lead), core = Rig.track(K, t + lead * 0.5), o = Rig.mix(Rig.track(K, t), core, 0);
    o.wt = legs.wt; o.lL = legs.lL; o.lR = legs.lR; o.st = legs.st; o.lean = core.lean; o.twist = core.twist; o.side = core.side;
    return o;
  }
  return { JUMP, ROLL, CHARGE, LAND, SP, KEY, swingBody };
})();
if (typeof window !== 'undefined') window.Moves = Moves;
