/* 더미봇 관절 인형: 자세(관절 각도) → 3D 관절 위치 → 화면에 원기둥처럼 그리기.
   근거
   - 비율: 키 1.75m, 머리 약 1/8(앤드루 루미스 8등신), 넓적다리≈정강이 0.43m, 위팔 0.29m·아래팔 0.27m(인체 측정 평균 비율).
   - 앞으로 계산(FK): 엉덩이 → 무릎 → 발, 어깨 → 팔꿈치 → 손. 팔이 무기를 쥘 때는 두 관절 IK(코사인 법칙)로 팔꿈치를 푼다.
   - 발 붙이기: 땅에 있으면 몸에서 가장 낮은 점을 바닥에 맞춘다 → 무릎을 굽히면 골반이 저절로 내려가고 달릴 때 위아래로 출렁인다.
   - 달리기: 보폭을 속도에 맞춰 위상을 '간 거리'로 돌린다 → 발이 미끄러지지 않는다(foot skating 방지).
   - 겹침 동작(디즈니): 몸통·팔·머리의 따라가는 빠르기를 다르게 해서 머리와 팔이 늦게 따라온다(index의 smooth). */
const Rig = (() => {
  const UA = 0.29, FA = 0.27, TH = 0.43, SH = 0.43, SPINE = 0.5, HIPW = 0.1, SHW = 0.19, HEAD = 0.12;
  const STAND = TH + SH + 0.05;   // 똑바로 섰을 때 골반 높이
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rot = (v, k, t) => { const c = Math.cos(t), s = Math.sin(t), kv = cross(k, v), kd = dot(k, v) * (1 - c); return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd]; };

  /* 자세: 각도는 라디안. a* = [어깨 앞들기(0 아래·π/2 앞·π 머리 위), 벌리기, 팔꿈치 굽힘], l* = [엉덩이 앞들기, 무릎 굽힘]
     lean 상체 앞숙임, twist 가슴 비틀기(+오른쪽 어깨가 뒤로), side 옆기울기, head 고개, flip 몸 전체 앞구르기 회전, spin 몸 전체 제자리 돌기, dx 앞으로 내민 거리 */
  const BASE = { lean: 0.04, side: 0, twist: 0, head: 0, flip: 0, spin: 0, dx: 0, st: 0.05, wt: 0.5, bal: 1, aL: [0.1, 0.12, 0.3], aR: [0.1, 0.12, 0.3], lL: [0.06, 0.12], lR: [0.06, 0.12] };
  const pose = (o) => { const p = JSON.parse(JSON.stringify(BASE)); for (const k in o) p[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; return p; };
  function mix(a, b, t) { const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => v + (b[k][i] - v) * t) : a[k] + (b[k] - a[k]) * t; return o; }
  const backOut = (x) => { const c = 1.7, k = x - 1; return 1 + (c + 1) * k * k * k + c * k * k; };
  const EASE = { lin: (x) => x, in: (x) => x * x * x, out: (x) => 1 - Math.pow(1 - x, 3), io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), back: backOut };
  /* 키 자세 줄: keys = [[시각, 자세, 곡선]] (곡선은 그 칸으로 들어가는 모양). 시각 밖이면 양끝 자세 */
  function track(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i], u = (t - a[0]) / (b[0] - a[0] || 1); return mix(a[1], b[1], (EASE[b[2] || 'io'])(clamp(u, 0, 1))); }
    return keys[keys.length - 1][1];
  }
  /* 부드럽게 따라가기: 부위마다 빠르기를 달리한다(몸통 1, 다리 1.2, 팔 0.75, 머리 0.55 배) → 머리·팔이 늦게 따라와 겹침 동작이 생긴다 */
  const PART = { aL: 0.75, aR: 0.75, head: 0.55, lL: 1.2, lR: 1.2, wt: 1.3 };   // 체중(골반)이 가장 먼저 — 몸쪽에서 끝쪽으로(Putnam 1993)
  function smooth(cur, tgt, rate, dt) {
    if (!cur) return mix(tgt, tgt, 0);
    const o = {}; for (const k in tgt) { const a = 1 - Math.exp(-rate * (PART[k] || 1) * dt); o[k] = Array.isArray(tgt[k]) ? tgt[k].map((v, i) => cur[k][i] + (v - cur[k][i]) * a) : cur[k] + (tgt[k] - cur[k]) * a; }
    return o;
  }

  /* 달리기·서기: phase 는 간 거리로 돌린 위상, amt 0(서기)~1(달리기), t 초(숨쉬기) */
  function locomotion(phase, amt, t) {
    const A = 0.55 * amt, s = Math.sin(phase), c = Math.cos(phase), br = Math.sin(t * 2.4) * 0.02 * (1 - amt);
    const leg = (sn, cs) => [0.06 + A * sn, 0.12 + amt * (0.15 + 1.15 * Math.max(0, cs))];   // 다리가 앞으로 넘어올 때 무릎을 접는다
    return pose({
      lean: 0.04 + 0.2 * amt + br, twist: 0.16 * s * amt, head: -0.1 * amt, bal: 1 - 0.8 * amt,
      lL: leg(s, c), lR: leg(-s, -c),
      aL: [0.1 - 0.6 * s * amt, 0.12, 0.3 + 1.05 * amt], aR: [0.1 + 0.6 * s * amt, 0.12, 0.3 + 1.05 * amt],
    });
  }

  /* 관절 위치. root = {x, z, y, face, ground}. ground 면 가장 낮은 점을 y에, 아니면 골반을 y+STAND 에 둔다 */
  function build(p, root) {
    const fa = root.face + p.spin, f = [Math.cos(fa), 0, Math.sin(fa)], s = [-f[2], 0, f[0]], u = [0, 1, 0];
    const spine = norm(add(add(mul(u, Math.cos(p.lean)), mul(f, Math.sin(p.lean))), mul(s, Math.sin(p.side))));
    const pel = mul(f, p.dx);
    const J = { pel };
    const legs = (k, side) => { const [hp, kn] = p[k], hip = add(pel, mul(s, side * (HIPW + p.st * 0.5))), d1 = add(mul(u, -Math.cos(hp)), mul(f, Math.sin(hp))), d2 = add(mul(u, -Math.cos(hp - kn)), mul(f, Math.sin(hp - kn)));
      const kn3 = add(hip, mul(d1, TH)), ft = add(kn3, mul(d2, SH)); return [hip, kn3, ft, add(ft, mul(norm(add(f, mul(u, -0.15 * Math.sin(hp - kn)))), 0.13))]; };
    [J.hipL, J.knL, J.ftL, J.toeL] = legs('lL', -1); [J.hipR, J.knR, J.ftR, J.toeR] = legs('lR', 1);
    J.chest = add(pel, mul(spine, SPINE * 0.82)); J.neck = add(pel, mul(spine, SPINE));
    const f2 = rot(f, u, -p.twist), s2 = rot(s, u, -p.twist), down = mul(spine, -1), fwdT = norm(add(mul(f2, Math.cos(p.lean)), mul(u, -Math.sin(p.lean))));
    J.head = add(J.neck, add(mul(spine, HEAD + 0.03), mul(fwdT, 0.03 + 0.06 * Math.sin(p.head))));
    const arm = (k, side) => { const [sh, ab, el] = p[k], so = add(J.neck, add(mul(s2, side * SHW), mul(spine, -0.05)));
      const dir = (a) => { const d = add(mul(down, Math.cos(a)), mul(fwdT, Math.sin(a))); return norm(add(mul(d, Math.cos(ab)), mul(s2, side * Math.sin(ab)))); };
      const eb = add(so, mul(dir(sh), UA)); return [so, eb, add(eb, mul(dir(sh + el), FA))]; };
    [J.shL, J.elL, J.haL] = arm('aL', -1); [J.shR, J.elR, J.haR] = arm('aR', 1);
    J.f = fwdT; J.s = s2; J.u = spine;
    if (!p.flip && p.bal > 0) balance(J, p, f, u);
    if (p.flip) { const piv = add(pel, mul(spine, 0.2)); for (const k in J) if (k.length > 1 && Array.isArray(J[k]) && !['f', 's', 'u'].includes(k)) J[k] = add(piv, rot(sub(J[k], piv), s, p.flip)); J.f = rot(J.f, s, p.flip); J.u = rot(J.u, s, p.flip); }
    let lift;
    if (root.ground) { let lo = Infinity; for (const k in J) if (k.length > 1 && !['f', 's', 'u'].includes(k)) lo = Math.min(lo, J[k][1] - (k === 'head' ? HEAD : 0.03)); lift = (root.y || 0) - lo; }
    else lift = (root.y || 0) + STAND;
    const off = [root.x, lift, root.z];
    for (const k in J) if (!['f', 's', 'u'].includes(k)) J[k] = add(J[k], off);
    if (root.lock && root.ground && !p.flip) plant(J, root, f, u);
    J.com = com(J);
    return J;
  }

  /* ---------- 무게중심 · 체중 이동 · 발 고정 ----------
     부위 질량 비율과 부위 무게중심 위치(몸쪽 끝에서의 비율)는 Winter, Biomechanics and Motor Control of Human Movement(Dempster 1955 자료를 정리한 표):
     머리·목 0.081 · 몸통 0.497(가운데) · 위팔 0.028(0.436) · 아래팔 0.016(0.430) · 손 0.006 · 넓적다리 0.100(0.433) · 정강이 0.0465(0.433) · 발 0.0145. 합 1.0. 무기 무게는 넣지 않았다. */
  const MASS = [['head', 'head', 0.081, 0], ['pel', 'neck', 0.497, 0.5],
    ['shL', 'elL', 0.028, 0.436], ['elL', 'haL', 0.016, 0.43], ['haL', 'haL', 0.006, 0], ['shR', 'elR', 0.028, 0.436], ['elR', 'haR', 0.016, 0.43], ['haR', 'haR', 0.006, 0],
    ['hipL', 'knL', 0.1, 0.433], ['knL', 'ftL', 0.0465, 0.433], ['ftL', 'toeL', 0.0145, 0.5], ['hipR', 'knR', 0.1, 0.433], ['knR', 'ftR', 0.0465, 0.433], ['ftR', 'toeR', 0.0145, 0.5]];
  function com(J) { let c = [0, 0, 0]; for (const [a, b, m, r] of MASS) c = add(c, mul(add(J[a], mul(sub(J[b], J[a]), r)), m)); return c; }
  const flat = (v) => [v[0], 0, v[2]];
  /* 두 관절 다리 IK: 엉덩이에서 발목 target 까지, 무릎은 앞(f)으로 굽힌다. 다리가 닿지 않으면 발을 끌어온다 */
  function legIK(J, side, target, f) {
    const hip = J['hip' + side], to = sub(target, hip), d0 = len(to), d = clamp(d0, 0.05, TH + SH - 1e-3), dir = norm(to);
    const ca = (TH * TH + d * d - SH * SH) / (2 * TH * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    let pv = sub(f, mul(dir, dot(f, dir))); pv = len(pv) < 1e-4 ? f : norm(pv);
    J['kn' + side] = add(hip, add(mul(dir, TH * ca), mul(pv, TH * sa)));
    J['ft' + side] = add(hip, mul(dir, d));
    const dy = clamp(J['ft' + side][1] - target[1], 0, 0.1);   // 발목이 못 닿으면 뒤꿈치를 들고 발끝으로 딛는다
    J['toe' + side] = add(J['ft' + side], add(mul(norm(flat(f)), Math.sqrt(0.13 * 0.13 - dy * dy)), [0, -dy, 0]));
  }
  /* 체중 이동: 무게중심의 바닥 투영을 받치는 발 사이 목표점(p.wt 0=뒷발·1=앞발)으로 옮긴다. 받치는 발은 제자리에 두고 다리를 IK로 다시 맞춘다.
     정적 균형 조건 = 무게중심 투영이 지지 다각형(디딘 발) 안 — 생체역학 기본. p.bal 0~1 이 따르는 정도(달릴 땐 낮다: 달리기는 동적 균형) */
  function balance(J, p, f, u) {
    const L = J.ftL, R = J.ftR, lo = Math.min(L[1], R[1]), still = p.bal > 0.85;   // 서 있는 자세(달리기 아님)
    const band = still ? 0.14 : 0.08;   // 서 있을 땐 0.14m 안쪽 발도 땅을 딛는 발로 본다(뒷발이 뜬 채 떠 있지 않게)
    const swL = clamp(1 - (L[1] - lo) / band, 0, 1), swR = clamp(1 - (R[1] - lo) / band, 0, 1);   // 바닥에 가까울수록 받치는 발
    const a = clamp((dot(L, f) - dot(R, f)) / 0.12, -1, 1);   // 왼발이 앞이면 +1. 발이 엇갈릴 때도 끊기지 않게 부드럽게
    let wL = (0.5 + (p.wt - 0.5) * a) * swL, wR = (0.5 - (p.wt - 0.5) * a) * swR; const ws = wL + wR || 1; wL /= ws; wR /= ws;
    const tgt = add(mul(L, wL), mul(R, wR));
    let d = mul(flat(sub(tgt, com(J))), p.bal); const dl = len(d); if (dl > 0.25) d = mul(d, 0.25 / dl);
    const keep = {}; for (const sd of ['L', 'R']) { const ft = J['ft' + sd]; if ((sd === 'L' ? swL : swR) > 0.2) keep[sd] = still ? [ft[0], lo, ft[2]] : ft.slice(); }
    const REACH = TH + SH - 0.02, hor = (sd, k) => len(flat(sub(add(J['hip' + sd], mul(d, k)), keep[sd])));
    let k = 1; for (const sd in keep) if (hor(sd, k) > REACH) { let a0 = 0, a1 = 1; for (let i = 0; i < 8; i++) { const m = (a0 + a1) / 2; hor(sd, m) > REACH ? (a1 = m) : (a0 = m); } k = Math.min(k, a0); }
    d = mul(d, k);   // 디딘 발이 닿지 않을 만큼은 옮기지 않는다
    let drop = 0;   // 다리가 모자라면 골반을 낮춰(무릎을 굽혀) 닿게 한다 — 런지에서 몸이 내려앉는 것
    for (const sd in keep) { const h = hor(sd, 1), v = J['hip' + sd][1] - keep[sd][1]; if (Math.hypot(h, v) > REACH) drop = Math.max(drop, v - Math.sqrt(Math.max(0, REACH * REACH - h * h))); }
    const mv = add(d, [0, -Math.min(drop, 0.12), 0]);
    for (const k2 in J) if (k2.length > 1 && !['f', 's', 'u'].includes(k2)) J[k2] = add(J[k2], mv);
    for (const sd of ['L', 'R']) if (keep[sd]) legIK(J, sd, keep[sd], f);
  }
  /* 발 고정: 받치는 발은 땅에 박아 둔다(미끄러짐 방지). 몸이 멀어져 0.28m 넘게 벌어지면 0.1초 남짓에 걸쳐 들어 올려 새 자리로 디딘다.
     root.lock = { L:{p,step}, R:{…} } 은 배우마다 따로 두는 상태, root.dt 는 프레임 시간, root.spd 는 이동 속도 */
  function plant(J, root, f, u) {
    const lk = root.lock, dt = root.dt || 0, run = (root.spd || 0) > 1.2;
    const lo = Math.min(J.ftL[1], J.ftR[1]), S = {};
    for (const sd of ['L', 'R']) {
      const fr = J['ft' + sd], s = lk[sd] || (lk[sd] = { p: fr.slice(), step: 0, a: null, k: 0 });
      const sup = fr[1] - lo < 0.04 && !run && dt > 0;
      if (!sup) { s.p = fr.slice(); s.step = 0; continue; }   // 든 발·달리기는 자세 그대로(걷기 위상이 이미 간 거리로 돈다)
      const gap = len(flat(sub(fr, s.p)));
      s.idle = gap > 0.06 && !s.step ? (s.idle || 0) + dt : 0;   // 어긋난 채 서 있던 시간
      S[sd] = { fr, s, gap, need: gap > 0.2 || s.idle > 0.4 };   // 다리가 펴져 발이 끌리기 전에, 또는 멈춘 뒤 0.4초 지나 발을 모은다
    }
    /* 한 번에 한 발만 옮긴다(다른 발은 바닥을 지탱). 더 뒤처진 발부터. 0.22초 동안 천천히-빠르게-천천히, 발은 반원으로 든다 */
    const busy = Object.values(S).some((o) => o.s.step);
    if (!busy) {
      const c = Object.values(S).filter((o) => o.need).sort((x, y) => y.gap - x.gap)[0];
      if (c) { c.s.step = 1; c.s.a = c.s.p.slice(); c.s.k = 0; }
    }
    for (const sd in S) {
      const { fr, s } = S[sd]; let lift = 0;
      if (s.step) {
        s.k = Math.min(1, s.k + dt / 0.22);
        const e = s.k * s.k * (3 - 2 * s.k);
        s.p = add(s.a, mul(sub(fr, s.a), e)); lift = 0.08 * Math.sin(Math.PI * s.k);
        if (s.k >= 1) s.step = 0;
      }
      legIK(J, sd, [s.p[0], fr[1] + lift, s.p[2]], f);
    }
  }
  /* 두 관절 IK: 어깨에서 target 까지 팔꿈치를 pole 쪽으로 굽힌다. 닿지 않으면 쭉 편다. 반환: 손까지 남은 거리(몸을 더 내밀어야 하는 양) */
  function armIK(J, side, target, pole) {
    const so = J['sh' + side], to = sub(target, so), d0 = len(to), d = clamp(d0, Math.abs(UA - FA) + 1e-3, UA + FA - 1e-3), dir = norm(to);
    const ca = (UA * UA + d * d - FA * FA) / (2 * UA * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    let pv = sub(pole, mul(dir, dot(pole, dir))); pv = len(pv) < 1e-4 ? J.u : norm(pv);
    J['el' + side] = add(so, add(mul(dir, UA * ca), mul(pv, UA * sa))); J['ha' + side] = add(so, mul(dir, d));
    return d0 - d;
  }

  /* 그리기: proj(v) → [화면x, 화면y, 1m당 px, 깊이]. 먼 쪽 팔다리는 어둡게, 원기둥처럼 밝은 줄을 겹친다 */
  const SEG = [['pel', 'chest', 0.17, 'c'], ['chest', 'neck', 0.15, 'c'], ['hipL', 'knL', 0.1, 'L'], ['knL', 'ftL', 0.085, 'L'], ['ftL', 'toeL', 0.065, 'L'], ['hipR', 'knR', 0.1, 'R'], ['knR', 'ftR', 0.085, 'R'], ['ftR', 'toeR', 0.065, 'R'],
    ['shL', 'elL', 0.075, 'L'], ['elL', 'haL', 0.065, 'L'], ['shR', 'elR', 0.075, 'R'], ['elR', 'haR', 0.065, 'R'], ['shL', 'shR', 0.09, 'c'], ['hipL', 'hipR', 0.12, 'c']];
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(clamp(v * k, 0, 255)); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; }
  function draw(g, J, proj, o) {
    const P = {}; for (const k in J) if (!['f', 's', 'u'].includes(k)) { P[k] = proj(J[k]); if (!P[k]) return; }
    const farL = P.shL[3] > P.shR[3], col = o.flash ? '#ffffff' : o.color;
    const segs = SEG.map(([a, b, w, sd]) => ({ a: P[a], b: P[b], w, k: sd === 'c' ? 1 : (sd === 'L') === farL ? 0.62 : 1.06, d: (P[a][3] + P[b][3]) / 2 }));
    segs.push({ head: true, a: P.head, d: P.head[3] - 0.01, k: 1 });
    segs.sort((x, y) => y.d - x.d);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const sg of segs) {
      if (sg.head) {
        const r = HEAD * sg.a[2], gr = g.createRadialGradient(sg.a[0] - r * 0.35, sg.a[1] - r * 0.4, r * 0.1, sg.a[0], sg.a[1], r);
        gr.addColorStop(0, shade(col.length === 7 ? col : '#ffffff', 1.35)); gr.addColorStop(1, shade(col.length === 7 ? col : '#ffffff', 0.7));
        g.fillStyle = gr; g.beginPath(); g.arc(sg.a[0], sg.a[1], r, 0, Math.PI * 2); g.fill();
        const fv = proj(add(J.head, mul(J.f, HEAD * 0.9))), sv = proj(add(J.head, mul(J.s, HEAD * 0.55))), sv2 = proj(add(J.head, mul(J.s, -HEAD * 0.55)));   // 눈 가리개: 바라보는 쪽이 보인다
        if (fv && sv && sv2 && fv[3] < sg.a[3]) { g.strokeStyle = o.flash ? '#ffd9a0' : (o.visor || '#ffe6a8'); g.lineWidth = Math.max(1.5, r * 0.28); g.beginPath(); g.moveTo(sv[0] + (fv[0] - sg.a[0]) * 0.8, sv[1] + (fv[1] - sg.a[1]) * 0.8); g.lineTo(sv2[0] + (fv[0] - sg.a[0]) * 0.8, sv2[1] + (fv[1] - sg.a[1]) * 0.8); g.stroke(); }
        continue;
      }
      const w = Math.max(2, sg.w * (sg.a[2] + sg.b[2]) / 2);
      g.strokeStyle = o.flash ? '#ffffff' : shade(o.color, sg.k * 0.78); g.lineWidth = w; g.beginPath(); g.moveTo(sg.a[0], sg.a[1]); g.lineTo(sg.b[0], sg.b[1]); g.stroke();
      g.strokeStyle = o.flash ? '#ffffff' : shade(o.color, sg.k * 1.25); g.lineWidth = w * 0.42; g.beginPath(); g.moveTo(sg.a[0] - w * 0.16, sg.a[1] - w * 0.16); g.lineTo(sg.b[0] - w * 0.16, sg.b[1] - w * 0.16); g.stroke();
    }
    g.restore();
  }
  /* 바닥 그림자: 높이 올라갈수록 작고 옅어진다(높이를 읽게 해 주는 접지 단서) */
  function shadow(g, x, z, h, ellipse) { const k = 1 / (1 + h * 0.7); ellipse(x, z, 0.38 * k, `rgba(0,0,0,${(0.42 * k).toFixed(3)})`); }

  return { pose, mix, track, smooth, locomotion, build, armIK, draw, shadow, EASE, STAND, UA, FA, add, sub, mul, norm, len, rot, cross, dot };
})();
if (typeof window !== 'undefined') window.Rig = Rig;
