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
  const BASE = { lean: 0.04, side: 0, twist: 0, head: 0, flip: 0, spin: 0, dx: 0, st: 0.05, aL: [0.1, 0.12, 0.3], aR: [0.1, 0.12, 0.3], lL: [0.06, 0.12], lR: [0.06, 0.12] };
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
  const PART = { aL: 0.75, aR: 0.75, head: 0.55, lL: 1.2, lR: 1.2 };
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
      lean: 0.04 + 0.2 * amt + br, twist: 0.16 * s * amt, head: -0.1 * amt,
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
    if (p.flip) { const piv = add(pel, mul(spine, 0.2)); for (const k in J) if (k.length > 1 && Array.isArray(J[k]) && !['f', 's', 'u'].includes(k)) J[k] = add(piv, rot(sub(J[k], piv), s, p.flip)); J.f = rot(J.f, s, p.flip); J.u = rot(J.u, s, p.flip); }
    let lift;
    if (root.ground) { let lo = Infinity; for (const k in J) if (k.length > 1 && !['f', 's', 'u'].includes(k)) lo = Math.min(lo, J[k][1] - (k === 'head' ? HEAD : 0.03)); lift = (root.y || 0) - lo; }
    else lift = (root.y || 0) + STAND;
    const off = [root.x, lift, root.z];
    for (const k in J) if (!['f', 's', 'u'].includes(k)) J[k] = add(J[k], off);
    return J;
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
