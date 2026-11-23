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
  function crystal(g, R, spin, p) {
    g.save(); g.scale(0.72 + 0.28 * Math.cos(spin), 1);
    const N = 16, pts = [];
    for (let i = 0; i < N; i++) { const a = i * TAU / N, main = i % 4 === 0, mid = i % 2 === 0 && !main; const r = main ? R : mid ? R * 0.62 : R * 0.36; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (let i = 0; i < N; i++) {   // 삼각 면: 번갈아 밝고 어둡게
      const a = pts[i], b = pts[(i + 1) % N], gr = g.createLinearGradient(a[0], a[1], b[0], b[1]);
      const lit = (i + Math.floor(spin * 1.3)) % 2 === 0;
      gr.addColorStop(0, lit ? p.hi(0.95) : p.mid(0.85)); gr.addColorStop(1, lit ? p.mid(0.9) : p.edge(0.9));
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath(); g.fill();
    }
    g.strokeStyle = p.hi(0.8); g.lineWidth = Math.max(0.7, R * 0.05); g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.stroke();
    g.restore();
  }
  function bolt(g, o) {
    const p = pal(o.el), st = STYLE[o.w] || STYLE.staff, R = Math.max(o.R, 3), L = R * st.tail * 1.45, d = o.d || 0, t = o.t || 0;
    const comp = (a) => hsl(p.h + 150, p.s, 62, a);
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x, o.y); g.rotate(o.ang);
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
    glow(g, 0, 0, R * 1.6, p.w(0.4), p.mid(0));
    g.globalCompositeOperation = 'source-over'; crystal(g, R * 2.5, t * 3.5 + d, p); g.globalCompositeOperation = 'lighter';
    glow(g, 0, 0, R * 0.7, p.w(0.8), p.hi(0));
    g.restore();
  }

  /* 착탄: o = {x,y,ang,R,age(초),el}. 섬광 → 충격파 링 → 빛살 → 불똥, 0.5초에 사라진다 */
  function impact(g, o) {
    const p = pal(o.el), R = Math.max(o.R, 3), k = clamp(o.age / 0.5, 0, 1), e = ease(k), fade = Math.pow(1 - k, 1.4);
    if (k >= 1) return;
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x, o.y);
    if (o.age < 0.1) glow(g, 0, 0, R * (3.2 + 4 * o.age * 10), p.w(1 - o.age * 6), p.mid(0));   // 섬광 2~4프레임
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
    if (o.age < 0.18) star(g, 0, 0, R * 4.2 * (1 - o.age * 4), R * 0.4, 0.5, 8, p.w(1 - o.age * 5));
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

  /* 바닥 룬 원(마법서): m = [a,b,c,d,e,f] 월드(미터,바닥 평면)→화면 아핀. r 반지름(m), ppm 화면 1m 길이, t 나이 초(0~0.9) */
  function rune(g, o) {
    const p = pal(o.el), r = o.r, t = o.t, on = ease(t / 0.16), off = 1 - clamp((t - 0.55) / 0.35, 0, 1), A = on * off, m = o.m;
    if (A <= 0) return;
    g.save(); g.globalCompositeOperation = 'lighter'; g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    const lw = (w) => w * r * 0.02;
    glow(g, 0, 0, r * 1.15, p.mid(0.38 * A), p.mid(0));
    g.strokeStyle = p.mid(0.95 * A); g.lineWidth = lw(1.4); g.beginPath(); g.arc(0, 0, r * 0.97 * on, 0, TAU); g.stroke();   // 바깥 테두리
    g.strokeStyle = p.hi(0.8 * A); g.lineWidth = lw(0.7); g.beginPath(); g.arc(0, 0, r * 0.7, 0, TAU); g.stroke();
    g.strokeStyle = p.acc(0.7 * A); g.lineWidth = lw(0.7); g.beginPath(); g.arc(0, 0, r * 0.45, 0, TAU); g.stroke();
    g.save(); g.rotate(t * 0.9);   // 글자 띠: 짧은 획 40개가 바깥 고리 안쪽을 돈다
    for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, r0 = r * 0.8, ln = r * (0.04 + 0.05 * rn(i, 1)), tw = rn(i, 2) * 1.2 - 0.6;
      g.strokeStyle = p.hi(0.8 * A); g.lineWidth = lw(0.8); g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a + tw * 0.06) * (r0 + ln), Math.sin(a + tw * 0.06) * (r0 + ln)); g.stroke(); }
    g.restore();
    g.save(); g.rotate(-t * 0.7); g.strokeStyle = p.mid(0.85 * A); g.lineWidth = lw(1);   // 육각성: 삼각형 둘이 역회전
    for (let s = 0; s < 2; s++) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + s * Math.PI / 3 - Math.PI / 2; g.lineTo(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68); } g.closePath(); g.stroke(); }
    g.restore();
    const sw = ease(t / 0.45);   // 충격파 링
    if (sw < 1) { g.strokeStyle = p.w((1 - sw) * 0.9); g.lineWidth = lw(3.2 * (1 - sw) + 0.6); g.beginPath(); g.arc(0, 0, r * (0.2 + 0.85 * sw), 0, TAU); g.stroke(); }
    g.restore();
    const ppm = o.ppm;   // 치솟는 고리·빛기둥·불똥(화면 위쪽)
    g.save(); g.globalCompositeOperation = 'lighter';
    const H = ppm * 2.6, gr = g.createLinearGradient(0, m[5], 0, m[5] - H); gr.addColorStop(0, p.hi(0.45 * A)); gr.addColorStop(0.5, p.mid(0.2 * A)); gr.addColorStop(1, p.mid(0));
    g.fillStyle = gr; g.beginPath(); g.moveTo(m[4] - r * ppm * 0.28, m[5]); g.lineTo(m[4] - r * ppm * 0.1, m[5] - H); g.lineTo(m[4] + r * ppm * 0.1, m[5] - H); g.lineTo(m[4] + r * ppm * 0.28, m[5]); g.closePath(); g.fill();
    for (let j = 0; j < 4; j++) { const u = fr(t * 1.5 + j * 0.25), rr = r * 0.62 * (1 - u * 0.45);
      g.save(); g.transform(m[0], m[1], m[2], m[3], m[4], m[5] - u * H * 0.9); g.strokeStyle = p.acc(A * (1 - u) * 0.9); g.lineWidth = lw(1.6); g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke(); g.restore(); }
    for (let i = 0; i < 44; i++) { const u = fr(t * (0.8 + rn(i, 1)) + rn(i, 2)), a = rn(i, 3) * TAU, rr = r * 0.85 * Math.sqrt(rn(i, 4)) * (1 - u * 0.5);
      mote(g, m[4] + (Math.cos(a) * m[0] + Math.sin(a) * m[2]) * rr, m[5] + (Math.cos(a) * m[1] + Math.sin(a) * m[3]) * rr - u * H, ppm * 0.035 * (0.5 + rn(i, 5)), (i % 2 ? p.hi : p.acc)(A * (1 - u))); }
    g.restore();
  }
  return { bolt, impact, stab, rune };
})();
if (typeof window !== 'undefined') window.BoltFx = BoltFx;
