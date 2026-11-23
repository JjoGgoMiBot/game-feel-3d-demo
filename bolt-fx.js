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

  /* 투사체: 원점(0,0)=머리, +x 진행 방향. o = {x,y,ang,R(머리 반지름 px),d(날아간 거리 m),t(나이 초),el,w(무기)} */
  function bolt(g, o) {
    const p = pal(o.el), st = STYLE[o.w] || STYLE.staff, R = Math.max(o.R, 3), L = R * st.tail, d = o.d || 0, t = o.t || 0;
    g.save(); g.globalCompositeOperation = 'lighter'; g.translate(o.x, o.y); g.rotate(o.ang);
    glow(g, 0, 0, R * 3.4, p.mid(0.42), p.mid(0)); glow(g, -R * 1.2, 0, R * 2.4, p.edge(0.3), p.edge(0));   // 바깥 글로우(머리 뒤쪽으로 번짐)
    const lg = g.createLinearGradient(R, 0, -L, 0);   // 몸통: 흰 핵 → 중간색 → 어두운 가장자리 → 사라짐
    lg.addColorStop(0, p.hi(0.95)); lg.addColorStop(0.22, p.mid(0.8)); lg.addColorStop(0.65, p.edge(0.32)); lg.addColorStop(1, p.edge(0));
    const bw = st.thin ? 0.45 : 1;
    g.fillStyle = lg; g.beginPath(); g.moveTo(R * 1.1, 0);
    g.quadraticCurveTo(R * 0.4, -R * 1.15 * bw, -L * 0.3, -R * 0.75 * bw); g.quadraticCurveTo(-L * 0.7, -R * 0.25 * bw, -L, 0);
    g.quadraticCurveTo(-L * 0.7, R * 0.25 * bw, -L * 0.3, R * 0.75 * bw); g.quadraticCurveTo(R * 0.4, R * 1.15 * bw, R * 1.1, 0); g.fill();
    const cols = [p.mid, p.acc, p.hi];   // 나선 꼬리: 굵기가 줄고 폭이 벌어지며, 앞뒤 면에 따라 굵기가 변한다
    g.lineCap = 'round';
    for (let k = 0; k < st.n; k++) {
      const ph = d * 6 + k * TAU / st.n; let px = 0, py = 0;
      for (let i = 0; i <= 36; i++) {
        const u = i / 36, ang = ph - u * 8, x = -u * L * 0.96, y = Math.sin(ang) * R * (0.3 + 1.7 * u) * st.amp;
        if (i) { const depth = 0.55 + 0.45 * Math.cos(ang), a = Math.pow(1 - u, 1.1) * (0.5 + 0.5 * depth);
          g.strokeStyle = cols[k % 3](a); g.lineWidth = Math.max(0.5, R * 0.34 * (1 - u * 0.9) * depth); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); }
        px = x; py = y;
      }
    }
    if (st.rings) {   // 꼬리를 따라 늘어선 룬 고리(옆에서 본 타원) — 글자 대신 끊긴 눈금이 돈다
      for (let j = 0; j < 4; j++) {
        const x = -R * (2 + j * 1.5), ry = R * (1.1 + j * 0.42), a = 0.62 * (1 - j / 4.4);
        g.strokeStyle = p.acc(a); g.lineWidth = Math.max(0.8, R * 0.13); g.setLineDash([R * 0.34, R * 0.2]); g.lineDashOffset = -(d * 38 + j * 9);
        g.beginPath(); g.ellipse(x, 0, R * 0.3, ry, 0, 0, TAU); g.stroke();
        g.strokeStyle = p.hi(a * 0.7); g.lineWidth = Math.max(0.5, R * 0.06); g.setLineDash([]); g.beginPath(); g.ellipse(x, 0, R * 0.3, ry * 0.86, 0, 0, TAU); g.stroke();
      }
      g.setLineDash([]);
    }
    for (let i = 0; i < st.spark; i++) {   // 불똥: 큰 것 몇 개 + 잔 입자 다수
      const u = Math.pow(rn(i, 1), 0.8), x = -u * L * 1.08 + R * 0.6, y = (rn(i, 2) - 0.5) * 2 * R * (0.5 + 2.6 * u);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 22 + i * 3.1)), r = R * (0.05 + 0.2 * Math.pow(rn(i, 4), 3));
      mote(g, x, y, r, (i % 3 ? p.hi : p.acc)((1 - u * 0.7) * tw));
    }
    star(g, 0, 0, R * 3.0, R * 0.34, t * 0.9, 8, p.w(0.95));   // 핵: 별 모양 빛살 + 흰 중심
    glow(g, 0, 0, R * 1.15, p.w(1), p.mid(0)); g.fillStyle = p.w(1); g.beginPath(); g.arc(0, 0, R * 0.42, 0, TAU); g.fill();
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
