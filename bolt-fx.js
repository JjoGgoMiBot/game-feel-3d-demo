/* bolt-fx.js — 층으로 쌓는 투사체·착탄·찌르기·바닥 룬 이펙트(캔버스 2D, 외부 의존 없음).
   핵 플레어 · 몸통(물방울) · 나선 꼬리 · 룬 고리 · 불똥 · 충격파를 가산 합성으로 겹친다.
   공개: BoltFx.bolt / impact / stab / rune. 모든 함수는 g(2D 컨텍스트)에 그리고 상태를 남기지 않는다(시간·거리로만 계산). */
const BoltFx = (() => {
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), fr = (x) => x - Math.floor(x);
  const rn = (i, k) => fr(Math.sin(i * 127.1 + k * 311.7) * 43758.5453);   // 같은 입력이면 같은 값 → 프레임 사이 불똥이 안 튄다
  const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const hsl = (h, s, l, a) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${clamp(a, 0, 1)})`;
  const HUE = { fire: 16, ice: 196, lightning: 52, poison: 104, dark: 268, holy: 46, arcane: 284, wind: 166, metal: 214 };
  const STYLE = {   // 무기별 몸통 모양: tail 꼬리 길이(R배), n 나선 가닥, rings 룬 고리, amp 나선 폭
    staff: { tail: 6.5, n: 3, rings: true, amp: 1.1, spark: 40 }, wand: { tail: 5, n: 2, rings: false, amp: 0.9, spark: 30 },
    bow: { tail: 10, n: 1, rings: false, amp: 0.5, spark: 16, thin: true }, bullet: { tail: 7.5, n: 2, rings: true, amp: 0.8, spark: 26 },
    throw: { tail: 4.5, n: 2, rings: false, amp: 1.0, spark: 24 },
  };
  function pal(el) {
    const h = HUE[el] != null ? HUE[el] : 200, s = el === 'metal' ? 28 : 92;
    return { h, s, hi: (a) => hsl(h, s * 0.55, 90, a), mid: (a) => hsl(h, s, 58, a), edge: (a) => hsl(h - 14, s, 30, a), acc: (a) => hsl(h + 42, s, 68, a), w: (a) => `rgba(255,255,255,${clamp(a, 0, 1)})` };
  }
  function glow(g, x, y, r, c0, c1) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function spike(g, len, w, col) {   // 원점에서 +x로 뻗는 뾰족한 빛살
    const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.closePath(); g.fill();
  }
  function star(g, x, y, len, w, rot, n, col) { g.save(); g.translate(x, y); g.rotate(rot); for (let i = 0; i < n; i++) { g.save(); g.rotate(i * TAU / n); spike(g, len * (i % 2 ? 0.55 : 1), w * (i % 2 ? 0.7 : 1), col); g.restore(); } g.restore(); }
  function mote(g, x, y, r, col) { if (r > 1.6) star(g, x, y, r * 3.2, r * 0.45, 0.3, 4, col); else { g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.max(r, 0.6), 0, TAU); g.fill(); } }

  /* 투사체: 원점(0,0)=머리, +x 진행 방향. o = {x,y,ang,R(머리 반지름 px),d(날아간 거리 m),t(나이 초),el,w(무기)}
     층: ① 렌즈플레어(무지개 고리·가로 빛줄기) ② 반투명 리본 나선(2색, 3겹 선) ③ 반짝이 구름 ④ 면 있는 결정 코어 */
  function crystal(g, R, spin, p) {   // 8갈래 보석: 갈래마다 좌우 두 면, 고정된 빛 방향(왼쪽 위)으로 명암을 계산 → 돌면 면이 번쩍인다
    g.save(); g.scale(0.78 + 0.22 * Math.cos(spin), 1);
    const N = 8, LIGHT = -2.2, rot = spin * 0.25;
    const tip = (i) => { const a = i * TAU / N + rot, r = i % 2 ? R * 0.62 : R; return [Math.cos(a) * r, Math.sin(a) * r, a]; };
    const val = (a) => [Math.cos(a) * R * 0.27, Math.sin(a) * R * 0.27];
    const face = (ax, ay, bx, by, na, lift) => {
      const lit = 0.5 + 0.5 * Math.cos(na - LIGHT), L = clamp(18 + 62 * lit + lift, 10, 92);
      const gr = g.createLinearGradient(0, 0, (ax + bx) / 2, (ay + by) / 2);
      gr.addColorStop(0, hsl(p.h, p.s, clamp(L + 14, 0, 96), 1)); gr.addColorStop(1, hsl(p.h - 10, p.s, clamp(L - 14, 6, 90), 1));
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(ax, ay); g.lineTo(bx, by); g.closePath(); g.fill();
    };
    for (let i = 0; i < N; i++) {
      const t0 = tip(i), a = t0[2], vl = val(a - Math.PI / N), vr = val(a + Math.PI / N), lift = i % 2 ? -8 : 0;
      face(t0[0], t0[1], vl[0], vl[1], a - 0.35, lift); face(t0[0], t0[1], vr[0], vr[1], a + 0.35, lift);
    }
    g.strokeStyle = hsl(p.h, p.s * 0.4, 96, 0.75); g.lineWidth = Math.max(0.7, R * 0.04); g.lineJoin = 'round';
    g.beginPath(); for (let i = 0; i < N; i++) { const t0 = tip(i), v = val(t0[2] + Math.PI / N); g.lineTo(t0[0], t0[1]); g.lineTo(v[0], v[1]); } g.closePath(); g.stroke();
    g.strokeStyle = hsl(p.h, p.s * 0.3, 98, 0.55); g.lineWidth = Math.max(0.6, R * 0.03);
    for (let i = 0; i < N; i++) { const t0 = tip(i); g.beginPath(); g.moveTo(0, 0); g.lineTo(t0[0], t0[1]); g.stroke(); }
    g.restore();
  }
  /* ---------- 애니메이션 원칙(api.rules 가 켜졌을 때만 작동 · 끄면 같은 장면이 밋밋하게 나온다) ----------
     예비동작(모으기) → 발사 반동(침 부채) → 날아갈 때 늘어남(부피 유지)+오버슈트 → 착탄 정지 → 느리게 시작해 빠르게 끝나는 소멸 → 맞은 몸의 찌그러짐 */
  const api = { rules: true };
  const backOut = (x) => { const c = 1.7, k = clamp(x, 0, 1) - 1; return 1 + (c + 1) * k * k * k + c * k * k; };
  function life(age) {   // 발사 직후 크기(오버슈트)와 늘어남. 늘어남은 가로로 늘면 세로가 줄어 부피가 같다
    if (!api.rules) return { s: 1, sx: 1, sy: 1 };
    const s = 0.3 + 0.7 * backOut(age / 0.14), sx = 1.12 + 0.38 * Math.exp(-age * 16);
    return { s, sx, sy: 1 / sx };
  }
  function squash(age) {   // 맞은 몸: 눌렸다가 스프링으로 돌아온다(-45%, 감쇠 13)
    if (!api.rules || age > 0.6) return { sx: 1, sy: 1, flash: !api.rules && age < 0.2 };
    const v = Math.exp(-age * 13) * Math.cos(age * 30), sy = 1 - 0.45 * v;
    return { sx: 1 / sy, sy, flash: age < 0.08 };
  }
  function charge(g, o) {   // 예비동작: 바늘이 안으로 모이고 고리가 줄며 구슬이 커진다(느리게 시작 → 쌓임)
    if (!api.rules) return;
    const p = pal(o.el), R = Math.max(o.R, 3), k = clamp(o.k, 0, 1), e = k * k, comp = hsl(p.h + 150, p.s, 62, 1);
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x, o.y); g.rotate(o.ang);
    glow(g, 0, 0, R * (1 + 2.6 * e), p.mid(0.55 * e), p.mid(0));
    for (let i = 0; i < 14; i++) {
      const a = rn(i, 1) * TAU, u = fr(k * 1.25 + rn(i, 2)), len = R * (0.9 + 1.7 * rn(i, 3)), dist = R * (6 - 5 * u) * (0.75 + 0.4 * rn(i, 4));
      g.save(); g.rotate(a); g.translate(dist, 0); spike(g, len, R * 0.06, (i % 3 ? p.hi : p.acc)(0.9 * e * (0.3 + 0.7 * u))); g.restore();
    }
    g.strokeStyle = p.acc(0.85 * e); g.lineWidth = Math.max(1, R * 0.14 * (1 - k * 0.5)); g.beginPath(); g.arc(0, 0, R * (4.2 - 3.2 * ease(k)), 0, TAU); g.stroke();
    glow(g, 0, 0, R * (0.3 + 1.2 * e), p.w(0.9 * e), p.hi(0)); star(g, 0, 0, R * (1 + 2.4 * e), R * 0.14, k * 3, 4, p.w(0.8 * e));
    g.restore();
  }
  function muzzle(g, o) {   // 발사 반동: 침 6개가 부채꼴로 튀고 0.14초에 꺼진다
    if (!api.rules || o.age >= 0.14) return;
    const p = pal(o.el), R = Math.max(o.R, 3), k = o.age / 0.14, f = ease(k * 2.5), a = 1 - k;
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x, o.y); g.rotate(o.ang);
    glow(g, 0, 0, R * (2.4 - k), p.w(0.9 * a), p.mid(0));
    for (let i = 0; i < 6; i++) { g.save(); g.rotate((i - 2.5) * 0.34); g.translate(R * 0.6 * f, 0); spike(g, R * (2.2 + 3.2 * f) * (i % 2 ? 0.7 : 1), R * 0.12 * a + 0.4, (i % 2 ? p.hi : p.mid)(a)); g.restore(); }
    g.restore();
  }
  function bolt(g, o) {
    const p = pal(o.el), st = STYLE[o.w] || STYLE.staff, R = Math.max(o.R, 3), L = R * st.tail * 1.45, d = o.d || 0, t = o.t || 0;
    const comp = (a) => hsl(p.h + 150, p.s, 62, a), lf = life(t);
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x, o.y); g.rotate(o.ang); g.scale(lf.s * lf.sx, lf.s * lf.sy);
    glow(g, 0, 0, R * 4.2, p.mid(0.4), p.mid(0)); glow(g, -R * 2.5, 0, R * 3.6, p.edge(0.28), p.edge(0));
    for (let j = 0; j < 14; j++) { const a0 = j / 14 * TAU, a1 = (j + 1.2) / 14 * TAU;   // 렌즈플레어: 무지개 고리
      g.strokeStyle = hsl(p.h - 70 + j * 18, 90, 64, 0.07); g.lineWidth = R * 0.9; g.beginPath(); g.arc(0, 0, R * 3.1, a0, a1); g.stroke(); }
    spike(g, R * 9, R * 0.16, p.hi(0.55)); g.save(); g.rotate(Math.PI); spike(g, R * 9, R * 0.16, p.hi(0.55)); g.restore();
    const cols = [p.mid, comp, p.acc];   // 리본: 굵기 3겹(넓은 번짐·본체·밝은 심지), 앞뒤 면에 따라 굵기가 변한다
    g.lineCap = 'round';
    const strands = Math.max(2, st.n + 1);
    for (let k = 0; k < strands; k++) {
      const ph = d * 5 + k * TAU / strands, pts = [];
      for (let i = 0; i <= 48; i++) { const u = i / 48, ang = ph - u * 7.5; pts.push([-u * L, Math.sin(ang) * R * st.amp * 1.45 * (0.35 + 1.5 * Math.pow(u, 0.7)), Math.cos(ang), u]); }
      [[2.4, 0.16, cols[k % 3]], [1, 0.55, cols[k % 3]], [0.3, 0.95, p.hi]].forEach(([wm, am, c]) => {
        for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], u = b[3], dep = 0.4 + 0.6 * (0.5 + 0.5 * b[2]);
          g.strokeStyle = c(am * Math.pow(1 - u, 1.15) * (0.45 + 0.55 * dep)); g.lineWidth = Math.max(0.6, R * 0.62 * wm * Math.pow(1 - u, 0.8) * dep);
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      });
    }
    if (st.rings) {
      for (let j = 0; j < 3; j++) { const x = -R * (2.6 + j * 1.9), ry = R * (1.6 + j * 0.5), a = 0.6 * (1 - j / 3.4);
        g.strokeStyle = p.acc(a); g.lineWidth = Math.max(0.8, R * 0.12); g.setLineDash([R * 0.34, R * 0.2]); g.lineDashOffset = -(d * 38 + j * 9);
        g.beginPath(); g.ellipse(x, 0, R * 0.32, ry, 0, 0, TAU); g.stroke(); }
      g.setLineDash([]);
    }
    const ns = st.spark * 4;   // 반짝이 구름: 몸 뒤쪽으로 넓게 퍼진다
    for (let i = 0; i < ns; i++) {
      const u = Math.pow(rn(i, 1), 0.75), x = -u * L * 1.15 + R * 0.8, y = (rn(i, 2) - 0.5) * 2 * R * (0.9 + 3.6 * u);
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 20 + i * 3.1)), r = R * (0.04 + 0.2 * Math.pow(rn(i, 4), 3));
      mote(g, x, y, r, [p.hi, comp, p.acc][i % 3]((1 - u * 0.75) * tw));
    }
    star(g, 0, 0, R * 3.4, R * 0.26, t * 0.6, 8, p.w(0.6));
    glow(g, 0, 0, R * 1.6, p.w(0.22), p.mid(0));
    g.globalCompositeOperation = 'source-over'; crystal(g, R * 2.5, t * 3.5 + d, p); g.globalCompositeOperation = 'lighter';
    glow(g, 0, 0, R * 0.32, p.w(0.55), p.hi(0));
    g.restore();
  }

  /* 착탄: o = {x,y,ang,R,age(초),el}. 섬광 → 충격파 링 → 빛살 → 불똥, 0.5초에 사라진다 */
  function impact(g, o) {
    const on = api.rules, HOLD = on ? 0.06 : 0, ag = Math.max(0, o.age - HOLD);   // 착탄 정지: 처음 0.06초(약 4프레임)는 최대 섬광에서 멈춘다
    const p = pal(o.el), R = Math.max(o.R, 3), k = clamp(ag / (0.5 - HOLD), 0, 1), e = on ? ease(k) : k, fade = on ? Math.pow(1 - k, 1.4) : 1 - k;
    if (k >= 1) return;
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x, o.y);
    if (!on) { glow(g, 0, 0, R * (1 + 4 * e), p.mid(0.5 * fade), p.mid(0)); g.restore(); return; }   // 규칙 끔: 부드러운 번짐 하나가 선형으로 줄 뿐
    if (o.age < HOLD + 0.1) glow(g, 0, 0, R * (3.2 + 4 * ag * 10), p.w(1 - ag * 6), p.mid(0));   // 섬광 2~4프레임
    glow(g, 0, 0, R * (2 + 4 * e), p.mid(0.5 * fade), p.mid(0));
    [[1, 5.8, 0.5, p.mid], [0.7, 4.2, 0.3, p.hi]].forEach(([sp, mx, wd, c], i) => {   // 충격파 링 2겹(지면에 눕힌 타원)
      const rr = R * (0.8 + mx * ease(k * sp * 1.25)); g.strokeStyle = c(fade * (i ? 0.7 : 0.95)); g.lineWidth = Math.max(0.8, R * wd * (1 - k));
      g.beginPath(); g.ellipse(0, R * 0.2, rr, rr * 0.55, 0, 0, TAU); g.stroke();
    });
    for (let i = 0; i < 16; i++) {   // 뾰족한 빛살
      const a = rn(i, 5) * TAU, r0 = R * (0.4 + 2.6 * e * rn(i, 6)), len = R * (1.6 + 4.5 * rn(i, 7)) * (1 - k * 0.6);
      g.save(); g.rotate(a); g.translate(r0, 0); spike(g, len, R * 0.1 * (1 - k) + 0.4, (i % 2 ? p.hi : p.mid)(fade)); g.restore();
    }
    for (let i = 0; i < 26; i++) {   // 불똥: 감속하며 날고 아래로 처진다
      const a = rn(i, 8) * TAU, dist = R * (1 + (3 + 6 * rn(i, 9)) * (1 - Math.pow(1 - k, 2)));
      mote(g, Math.cos(a) * dist, Math.sin(a) * dist + R * 3 * k * k, R * (0.06 + 0.16 * rn(i, 10)) * (1 - k * 0.6), (i % 3 ? p.hi : p.acc)(fade));
    }
    if (ag < 0.18) star(g, 0, 0, R * 4.2 * (1 - ag * 4), R * 0.4, 0.5, 8, p.w(1 - ag * 5));
    g.restore();
  }

  /* 창·단검 찌르기: (x0,y0)에서 (x1,y1) 끝점까지 빛줄기. t 0~1 */
  function stab(g, o) {
    const p = pal(o.el), dx = o.x1 - o.x0, dy = o.y1 - o.y0, len = Math.hypot(dx, dy) || 1, R = Math.max(o.R, 3), t = clamp(o.t, 0, 1);
    const reach = ease(t / 0.45), a = (t < 0.45 ? 1 : Math.pow(1 - (t - 0.45) / 0.55, 1.5));
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x0, o.y0); g.rotate(Math.atan2(dy, dx));
    const tip = len * reach, tail = Math.max(0, tip - len * (0.35 + 0.65 * t));
    const lg = g.createLinearGradient(tail, 0, tip, 0); lg.addColorStop(0, p.edge(0)); lg.addColorStop(0.7, p.mid(0.7 * a)); lg.addColorStop(1, p.hi(a));
    g.fillStyle = lg; g.beginPath(); g.moveTo(tip + R * 0.8, 0); g.lineTo(tip - R, -R * 0.9); g.lineTo(tail, 0); g.lineTo(tip - R, R * 0.9); g.closePath(); g.fill();
    g.lineCap = 'round';
    for (let k = 0; k < 2; k++) { let px = tail, py = 0;   // 가는 나선 두 가닥
      for (let i = 1; i <= 20; i++) { const u = i / 20, x = tail + (tip - tail) * u, y = Math.sin(u * 9 + k * Math.PI + t * 10) * R * 0.9 * u;
        g.strokeStyle = (k ? p.acc : p.mid)(a * u * 0.8); g.lineWidth = Math.max(0.5, R * 0.22 * u); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); px = x; py = y; } }
    for (let i = 0; i < 18; i++) { const u = rn(i, 1), x = tail + (tip - tail) * u, y = (rn(i, 2) - 0.5) * R * 2.4 * u; mote(g, x, y, R * (0.05 + 0.15 * Math.pow(rn(i, 3), 3)), p.hi(a * u)); }
    glow(g, tip, 0, R * 2.6, p.mid(0.5 * a), p.mid(0)); star(g, tip, 0, R * 3, R * 0.3, 0, 4, p.w(a)); glow(g, tip, 0, R * 0.9, p.w(a), p.mid(0));
    g.restore();
    if (t > 0.4) impact(g, { x: o.x1, y: o.y1, R: R * 0.9, age: (t - 0.4) * 0.7, el: o.el });
  }

  /* 바닥 룬 원(마법서): m = [a,b,c,d,e,f] 월드(미터,바닥 평면)→화면 아핀. r 반지름(m), ppm 화면 1m 길이, t 나이 초(0~0.9)
     층: 원판 번짐 · 이중 고리(발광) · 룬 글자 띠 · 눈금 · 꽃무늬 · 육각성+꼭짓점 구슬 · 핵 · 충격파 · 꼭짓점에서 솟는 빛줄기 · 오르는 룬 입자 */
  const GLYPH = [[[0, -1, 0, 1], [0, -0.1, 0.7, -0.8]], [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.6, -0.1], [0.6, -0.1, -0.5, 0.5]], [[0, -1, 0, 1], [-0.6, -0.6, 0, -0.05], [0.6, -0.6, 0, -0.05]],
    [[-0.6, -1, 0.6, 1], [0.6, -1, -0.6, 1]], [[0, -1, -0.6, 0], [0, -1, 0.6, 0], [-0.6, 0, 0, 1], [0.6, 0, 0, 1]], [[-0.5, -1, -0.5, 1], [0.5, -1, 0.5, 1], [-0.5, 0, 0.5, 0]],
    [[0, -1, 0, 1], [0, -1, 0.6, -0.4], [0, 0, 0.6, 0.6]], [[-0.55, -1, 0.55, -1], [0, -1, 0, 1], [-0.55, 1, 0.55, 1]]];
  function rune(g, o) {
    const p = pal(o.el), r = o.r, t = o.t, on = ease(t / 0.16), off = 1 - clamp((t - 0.55) / 0.35, 0, 1), A = on * off, m = o.m;
    if (A <= 0) return;
    const ppm = o.ppm, lw = (w) => w * r * 0.02, rot = t * 0.55;
    g.save(); g.globalCompositeOperation = 'lighter'; g.transform(m[0], m[1], m[2], m[3], m[4], m[5]); g.lineCap = 'round'; g.lineJoin = 'round';
    const disc = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.05); disc.addColorStop(0, p.mid(0.1 * A)); disc.addColorStop(0.7, p.edge(0.26 * A)); disc.addColorStop(0.97, p.mid(0.34 * A)); disc.addColorStop(1, p.mid(0));
    g.fillStyle = disc; g.beginPath(); g.arc(0, 0, r * 1.05, 0, TAU); g.fill();
    const ring = (rad, w, col, a, blur) => { g.shadowColor = col(1); g.shadowBlur = blur; g.strokeStyle = col(a); g.lineWidth = lw(w); g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke(); g.shadowBlur = 0; };
    const sweep = clamp(t / 0.2, 0, 1) * TAU;   // 바깥 고리는 한 바퀴 그려지며 나타난다
    g.shadowColor = p.mid(1); g.shadowBlur = ppm * r * 0.05; g.strokeStyle = p.mid(0.95 * A); g.lineWidth = lw(2.4); g.beginPath(); g.arc(0, 0, r * 0.97, -Math.PI / 2, -Math.PI / 2 + sweep); g.stroke(); g.shadowBlur = 0;
    ring(r * 0.93, 0.7, p.hi, 0.9 * A, 0); ring(r * 0.66, 0.9, p.acc, 0.8 * A, ppm * r * 0.03); ring(r * 0.62, 0.5, p.hi, 0.6 * A, 0);
    g.save(); g.rotate(-rot * 0.6);   // 눈금: 72개, 6번째마다 길게
    for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, long = i % 6 === 0, r0 = r * 0.9, r1 = r * (long ? 0.855 : 0.875); g.strokeStyle = p.hi((long ? 0.9 : 0.55) * A); g.lineWidth = lw(long ? 0.9 : 0.5);
      g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
    g.restore();
    g.save(); g.rotate(rot);   // 룬 글자 띠: 28자, 차례로 켜진다
    const NG = 28; g.shadowColor = p.hi(1); g.shadowBlur = ppm * r * 0.02;
    for (let i = 0; i < NG; i++) {
      const lit = clamp((t - 0.04 - i * 0.006) / 0.08, 0, 1); if (lit <= 0) continue;
      const a = i / NG * TAU, gl = GLYPH[Math.floor(rn(i, 3) * GLYPH.length)], s = r * 0.052;
      g.save(); g.translate(Math.cos(a) * r * 0.775, Math.sin(a) * r * 0.775); g.rotate(a + Math.PI / 2); g.scale(s, s * 1.25);
      g.strokeStyle = (i % 4 === 0 ? p.w : p.hi)(0.95 * A * lit); g.lineWidth = 0.2; g.beginPath(); gl.forEach((q) => { g.moveTo(q[0], q[1]); g.lineTo(q[2], q[3]); }); g.stroke(); g.restore();
    }
    g.shadowBlur = 0; g.restore();
    g.save(); g.rotate(-rot * 1.3); g.strokeStyle = p.acc(0.5 * A); g.lineWidth = lw(0.6);   // 꽃무늬: 겹친 원 6개
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.arc(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, r * 0.2, 0, TAU); g.stroke(); }
    g.restore();
    g.save(); g.rotate(rot * 0.8); g.shadowColor = p.mid(1); g.shadowBlur = ppm * r * 0.03; g.strokeStyle = p.mid(0.95 * A); g.lineWidth = lw(1.1);   // 육각성 + 꼭짓점 구슬 + 안쪽 육각형
    const vx = [];
    for (let s = 0; s < 2; s++) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + s * Math.PI / 3 - Math.PI / 2, x = Math.cos(a) * r * 0.6, y = Math.sin(a) * r * 0.6; g.lineTo(x, y); vx.push([x, y]); } g.closePath(); g.stroke(); }
    g.shadowBlur = 0; g.strokeStyle = p.hi(0.7 * A); g.lineWidth = lw(0.5); g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.lineTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34); } g.closePath(); g.stroke();
    vx.forEach((q) => { glow(g, q[0], q[1], r * 0.11, p.w(0.9 * A), p.mid(0)); g.strokeStyle = p.hi(0.9 * A); g.lineWidth = lw(0.7); g.beginPath(); g.arc(q[0], q[1], r * 0.05, 0, TAU); g.stroke(); });
    g.restore();
    glow(g, 0, 0, r * 0.28, p.w(0.85 * A), p.mid(0));
    const sw = ease(t / 0.45);   // 충격파 링 2겹
    if (sw < 1) { [[0.2, 0.85, 1], [0.1, 0.6, 0.55]].forEach(([a0, a1, am]) => { g.strokeStyle = p.w((1 - sw) * 0.85 * am); g.lineWidth = lw(3 * (1 - sw) + 0.6); g.beginPath(); g.arc(0, 0, r * (a0 + a1 * sw), 0, TAU); g.stroke(); }); }
    g.restore();
    const H = ppm * 2.4;   // 화면 위쪽: 꼭짓점에서 솟는 빛줄기 · 오르는 고리 · 룬 입자
    g.save(); g.globalCompositeOperation = 'lighter';
    const base = (ang, rr) => ({ x: m[4] + (Math.cos(ang) * m[0] + Math.sin(ang) * m[2]) * rr, y: m[5] + (Math.cos(ang) * m[1] + Math.sin(ang) * m[3]) * rr });
    for (let i = 0; i < 6; i++) { const b = base(rot * 0.8 + i * TAU / 6 - Math.PI / 2, r * 0.6), h = H * (0.55 + 0.35 * rn(i, 1)), gr = g.createLinearGradient(0, b.y, 0, b.y - h);
      gr.addColorStop(0, p.hi(0.75 * A)); gr.addColorStop(1, p.mid(0)); g.fillStyle = gr; g.beginPath(); g.moveTo(b.x - ppm * 0.012, b.y); g.lineTo(b.x, b.y - h); g.lineTo(b.x + ppm * 0.012, b.y); g.closePath(); g.fill(); }
    g.save(); g.translate(m[4], m[5]); g.scale(1, 0.55); const gx = g.createRadialGradient(0, 0, 0, 0, 0, r * ppm * 0.3); gx.addColorStop(0, p.hi(0.5 * A)); gx.addColorStop(1, p.mid(0)); g.fillStyle = gx; g.beginPath(); g.arc(0, 0, r * ppm * 0.3, 0, TAU); g.fill(); g.restore();
    for (let j = 0; j < 4; j++) { const u = fr(t * 1.5 + j * 0.25), rr = r * 0.6 * (1 - u * 0.4);
      g.save(); g.transform(m[0], m[1], m[2], m[3], m[4], m[5] - u * H * 0.9); g.strokeStyle = p.acc(A * (1 - u) * 0.85); g.lineWidth = lw(1.2); g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke(); g.restore(); }
    for (let i = 0; i < 40; i++) { const u = fr(t * (0.7 + rn(i, 1)) + rn(i, 2)), a = rn(i, 3) * TAU, rr = r * 0.85 * Math.sqrt(rn(i, 4)) * (1 - u * 0.5), b = base(a, rr);
      mote(g, b.x, b.y - u * H, ppm * 0.04 * (0.5 + rn(i, 5)), (i % 2 ? p.hi : p.acc)(A * (1 - u))); }
    g.restore();
  }
  Object.assign(api, { bolt, impact, stab, rune, charge, muzzle, life, squash });
  return api;
})();
if (typeof window !== 'undefined') window.BoltFx = BoltFx;
