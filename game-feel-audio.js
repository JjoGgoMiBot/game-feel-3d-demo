/* GameFeelAudio — 이펙트 키별 "소리 층(레이어 타임라인)"과 WebAudio 합성. 순수 JS, 외부 파일 없음.
 * 이펙트 한 번 = 소리 여러 겹(충격·폭발·꼬리·바닥 울림·예고 상승음)이 vfx 시간축에 맞춰 쌓인다.
 * 층마다 `sample` 칸이 있어 나중에 음원 파일(AudioBuffer)로 바꿔 끼울 수 있다.
 *   GameFeelAudio.plan('tele-lightning')      → 층 목록(소리 없이 계산만, 시험·타임라인용)
 *   GameFeelAudio.play('hit-ice', {power:.8}) → 실제 재생(오디오 컨텍스트 없으면 0을 돌려주고 무시)
 *   GameFeelAudio.attach(GameFeel)            → hit/kill/tele 이벤트의 fx 키로 자동 재생 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameFeelAudio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 상수표: 소리 수치는 모두 여기서 ─────────────────────────────────────
  // 층: {kind, at(초, vfx 시간축), vol, pv(음높이 ±비율), dur, v:[변형 후보], sample:null}
  // kind: impact 충격 · burst 스파크 폭발(n>1이면 여러 번 지직) · tail 꼬리 · rumble 바닥 울림 · rise 예고 상승음 · ring 울림(금속/성스러운 톤)
  // 변형 v: f(주파수) f2(끝 주파수) q n(폭발 횟수) m(금속 배음)
  const L = (kind, at, vol, dur, v, pv) => ({ kind, at, vol, dur, v, pv: pv == null ? 0.05 : pv, sample: null });
  const CONST = {
    master: 0.5, ceiling: 0.9, volVar: 0.05, limiter: { threshold: -10, ratio: 12 }, maxLayers: 24, noiseSec: 1,
    // 패턴별 기본 층. hitAt = 명중(터지는) 시각 → 속성 층이 여기에 붙는다
    patterns: {
      hit:     { hitAt: 0,   layers: [L('impact', 0, 1, .16, [{ f: 150 }, { f: 130 }, { f: 170 }]), L('burst', 0, .6, .06, [{ f: 3500, q: 1 }, { f: 2800, q: .8 }]), L('tail', .03, .4, .35, [{ f: 2400 }, { f: 2000 }])] },
      slash:   { hitAt: .12, layers: [L('burst', 0, .5, .14, [{ f: 1800, q: .6 }, { f: 2400, q: .7 }]), L('impact', .12, .8, .14, [{ f: 170 }, { f: 150 }]), L('tail', .14, .35, .3, [{ f: 2600 }])] },
      stab:    { hitAt: .1,  layers: [L('burst', 0, .4, .08, [{ f: 4200, q: 1.2 }]), L('impact', .1, .9, .12, [{ f: 190 }, { f: 170 }]), L('tail', .12, .3, .25, [{ f: 3000 }])] },
      smash:   { hitAt: 0,   layers: [L('impact', 0, 1.2, .22, [{ f: 95 }, { f: 80 }]), L('rumble', .02, .8, .7, [{ f: 55 }, { f: 48 }]), L('burst', 0, .6, .08, [{ f: 2200, q: .7 }]), L('tail', .05, .5, .6, [{ f: 1800 }])] },
      shatter: { hitAt: 0,   layers: [L('impact', 0, .9, .16, [{ f: 120 }]), L('burst', 0, .8, .35, [{ f: 5200, q: 2, n: 7 }, { f: 4600, q: 2, n: 6 }]), L('tail', .05, .45, .7, [{ f: 4500 }])] },
      aura:    { hitAt: .9,  layers: [L('rise', 0, .4, .9, [{ f: 200, f2: 620 }, { f: 240, f2: 700 }]), L('rumble', 0, .3, 1.0, [{ f: 60 }]), L('ring', .9, .4, .8, [{ f: 880 }, { f: 990 }])] },
      shot:    { hitAt: .5,  layers: [L('burst', 0, .5, .12, [{ f: 1500, q: .8 }, { f: 1900, q: .8 }]), L('tail', .05, .3, .4, [{ f: 1300 }]), L('impact', .5, .8, .14, [{ f: 160 }, { f: 140 }])] },
      // 예고: 1.2초에 해제(터짐). 상승음 → 터지는 지직 + 충격 + 꼬리
      tele:    { hitAt: 1.2, layers: [L('rise', 0, .5, 1.2, [{ f: 90, f2: 520 }, { f: 110, f2: 560 }]), L('rumble', 0, .3, 1.2, [{ f: 48 }]), L('burst', 1.2, .8, .3, [{ f: 3800, q: 1.4, n: 5 }, { f: 3200, q: 1.4, n: 4 }]), L('impact', 1.2, 1.1, .22, [{ f: 110 }, { f: 100 }]), L('tail', 1.22, .45, .7, [{ f: 2000 }])] },
    },
    // 무기 → 패턴 (vfx의 무기 10종)
    weapon: { sword: 'slash', axe: 'slash', dagger: 'stab', spear: 'stab', staff: 'shot', wand: 'shot', bow: 'shot', bullet: 'shot', grimoire: 'aura', throw: 'shot' },
    // 속성별 덧층: at은 패턴의 hitAt 기준 상대 시각
    elements: {
      fire:      [L('tail', 0, .5, .6, [{ f: 900 }, { f: 1100 }]), L('burst', .05, .3, .3, [{ f: 2500, q: .8, n: 4 }])],
      ice:       [L('ring', .01, .3, .5, [{ f: 2400 }, { f: 3100 }, { f: 3800 }]), L('burst', 0, .25, .3, [{ f: 6000, q: 2, n: 5 }])],
      lightning: [L('burst', 0, .7, .3, [{ f: 5000, q: 2, n: 9 }, { f: 4200, q: 2, n: 8 }]), L('burst', .1, .4, .2, [{ f: 3000, q: 1.5, n: 5 }]), L('burst', 0, .7, .05, [{ f: 7000, q: 1 }])],
      poison:    [L('burst', 0, .3, .5, [{ f: 400, q: 4, n: 6 }, { f: 520, q: 4, n: 5 }])],
      dark:      [L('rumble', 0, .7, 1.0, [{ f: 40 }, { f: 45 }]), L('tail', 0, .3, .8, [{ f: 300 }])],
      holy:      [L('ring', .02, .35, 1.0, [{ f: 660 }, { f: 880 }, { f: 990 }]), L('ring', .08, .2, .9, [{ f: 1320 }, { f: 1480 }])],
      arcane:    [L('rise', 0, .3, .25, [{ f: 300, f2: 1200 }]), L('ring', .1, .25, .6, [{ f: 1320 }, { f: 1180 }])],
      wind:      [L('tail', 0, .4, .7, [{ f: 1200 }, { f: 1000 }]), L('burst', 0, .25, .3, [{ f: 800, q: .5 }])],
      metal:     [L('ring', 0, .45, .6, [{ f: 1400, m: 1 }, { f: 1250, m: 1 }]), L('burst', 0, .5, .04, [{ f: 6500, q: 1 }])],
    },
    // 음원 매핑(비어 있음): '<키 또는 패턴>:<층 종류>' → 등록한 샘플 이름. 예: { 'tele-lightning:burst': 'spark1' }
    sampleMap: {},
    // 이펙트 키 하나만을 위한 덧층 (패턴·속성 층 위에 얹힌다). 키 → 층 목록
    keys: {
      'tele-lightning': [L('burst', .4, .25, 1.0, [{ f: 4500, q: 2, n: 10 }]), L('burst', .9, .35, .3, [{ f: 5200, q: 2, n: 6 }])], // 차오르는 동안 잔 방전
    },
  };

  // ── 계산(소리 없이): 키 → 이번 재생의 층 목록 ───────────────────────────
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const str = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  const pick = (a, r) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function plan(key, o) {
    o = o || {};
    const r = typeof o.rng === 'function' ? o.rng : Math.random;
    const k = str(key), parts = k.split('-');
    if (!k || parts.length > 2 || !parts[0]) return null;
    const pname = own(CONST.patterns, parts[0]) ? parts[0] : own(CONST.weapon, parts[0]) ? CONST.weapon[parts[0]] : null;
    if (!pname) return null;
    const P = CONST.patterns[pname];
    const defs = P.layers.slice();
    const el = parts[1] && own(CONST.elements, parts[1]) ? parts[1] : null;
    if (el) CONST.elements[el].forEach((d) => defs.push(Object.assign({}, d, { at: P.hitAt + d.at })));
    if (own(CONST.keys, k)) defs.push.apply(defs, CONST.keys[k]);
    const layers = defs.slice(0, CONST.maxLayers).map((d) => {
      const variant = d.v && d.v.length ? pick(d.v, r) : {};
      return {
        kind: d.kind, at: Math.max(0, num(d.at, 0)), dur: Math.max(0.01, num(d.dur, 0.1)),
        vol: Math.max(0, num(d.vol, 1)) * (1 + (r() * 2 - 1) * CONST.volVar),
        pitch: 1 + (r() * 2 - 1) * num(d.pv, 0.05), variant: variant, sample: d.sample || CONST.sampleMap[k + ':' + d.kind] || CONST.sampleMap[pname + ':' + d.kind] || null,
      };
    });
    const length = layers.reduce((m, l) => Math.max(m, l.at + l.dur), 0);
    return { key: k, pattern: pname, element: el, layers: layers, length: length };
  }

  // ── 합성 ─────────────────────────────────────────────────────────────────
  const chains = typeof WeakMap === 'function' ? new WeakMap() : null;
  const samples = {};
  let shared = null;

  function sharedCtx() {
    if (shared) return shared;
    const C = typeof self !== 'undefined' && (self.AudioContext || self.webkitAudioContext);
    if (!C) return null;
    try { shared = new C(); } catch (e) { shared = null; }
    return shared;
  }
  function chain(ctx) {
    let c = chains && chains.get(ctx);
    if (c) return c;
    const out = ctx.createGain(); out.gain.value = CONST.master;
    let end = out;
    if (typeof ctx.createDynamicsCompressor === 'function') {                // 합쳐진 소리가 찌그러지지 않게 리미터
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = CONST.limiter.threshold; comp.ratio.value = CONST.limiter.ratio;
      comp.knee.value = 0; comp.attack.value = 0.001;
      out.connect(comp); end = comp;
    }
    if (typeof ctx.createWaveShaper === 'function') {                          // 마지막 안전망: tanh 소프트 클립(±1 넘지 않음)
      const ws = ctx.createWaveShaper(), cv = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) cv[i] = Math.tanh((i / 511.5 - 1) * 1.5) / Math.tanh(1.5) * CONST.ceiling;
      ws.curve = cv; end.connect(ws); ws.connect(ctx.destination);
    } else end.connect(ctx.destination);
    const n = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * CONST.noiseSec)), ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    c = { in: out, noise: n };
    if (chains) chains.set(ctx, c);
    return c;
  }
  function env(g, t, vol, dur, attack) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noiseSrc(ctx, c, t, dur) { const s = ctx.createBufferSource(); s.buffer = c.noise; s.loop = true; s.start(t, Math.random() * CONST.noiseSec * 0.5); s.stop(t + dur + 0.05); return s; }
  function osc(ctx, type, t, dur) { const o = ctx.createOscillator(); o.type = type; o.start(t); o.stop(t + dur + 0.05); return o; }

  function voice(ctx, c, l, t, vol) {
    const f = num(l.variant.f, 440) * l.pitch, dur = l.dur, g = ctx.createGain();
    g.connect(c.in);
    if (l.kind === 'impact') {
      const o = osc(ctx, 'sine', t, dur); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f * 0.3), t + dur * 0.7);
      env(g, t, vol, dur, 0.003); o.connect(g);
      const n = noiseSrc(ctx, c, t, 0.03), h = ctx.createBiquadFilter(), g2 = ctx.createGain(); h.type = 'highpass'; h.frequency.value = 2000; g2.connect(c.in);
      env(g2, t, vol * 0.5, 0.03, 0.001); n.connect(h); h.connect(g2);                     // 트랜지언트(딱)
    } else if (l.kind === 'burst') {
      const reps = Math.max(1, Math.floor(num(l.variant.n, 1)));
      for (let i = 0; i < reps; i++) {
        const ti = t + (reps > 1 ? Math.random() * dur * 0.85 : 0), di = reps > 1 ? 0.03 + Math.random() * 0.03 : dur;
        const n = noiseSrc(ctx, c, ti, di), b = ctx.createBiquadFilter(), gi = ctx.createGain();
        b.type = 'bandpass'; b.frequency.value = f * (reps > 1 ? 0.8 + Math.random() * 0.5 : 1); b.Q.value = num(l.variant.q, 1);
        gi.connect(c.in); env(gi, ti, vol * (reps > 1 ? 0.5 + Math.random() * 0.5 : 1), di, 0.002); n.connect(b); b.connect(gi);
      }
    } else if (l.kind === 'tail') {
      const n = noiseSrc(ctx, c, t, dur), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f, t); lp.frequency.exponentialRampToValueAtTime(Math.max(80, f * 0.25), t + dur);
      env(g, t, vol, dur, 0.01); n.connect(lp); lp.connect(g);
    } else if (l.kind === 'rumble') {
      const o = osc(ctx, 'sawtooth', t, dur), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; o.frequency.value = f;
      env(g, t, vol, dur, 0.02); o.connect(lp); lp.connect(g);
    } else if (l.kind === 'rise') {
      const o = osc(ctx, 'sawtooth', t, dur), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(21, num(l.variant.f2, f * 4) * l.pitch), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t + dur * 0.98); g.gain.linearRampToValueAtTime(0.0001, t + dur); // 해제 직전까지 차오름
      o.connect(lp); lp.connect(g);
    } else { // ring
      env(g, t, vol, dur, 0.004);
      const parts = l.variant.m ? [1, 2.76, 5.4] : [1, 2];
      parts.forEach((m, i) => { const o = osc(ctx, 'sine', t, dur), gi = ctx.createGain(); o.frequency.value = f * m; gi.gain.value = 1 / (1 + i * 1.5); o.connect(gi); gi.connect(g); });
    }
  }
  function sampleVoice(ctx, c, l, t, vol) {
    const b = samples[l.sample]; if (!b) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.playbackRate.value = l.pitch; g.gain.value = vol; s.connect(g); g.connect(c.in); s.start(t); return true;
  }

  // 재생: 만든 층 수를 돌려준다. 키가 비었거나 컨텍스트가 없으면 0(예외 없음).
  function play(key, o) {
    o = o || {};
    try {
      const ctx = o.ctx || sharedCtx();
      if (!ctx || typeof ctx.createGain !== 'function') return 0;
      const p = plan(key, o); if (!p) return 0;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      const c = chain(ctx), t0 = num(ctx.currentTime, 0) + Math.max(0, num(o.delay, 0));
      const k = Math.max(0, Math.min(1, num(o.volume, 1))) * (0.6 + 0.4 * Math.max(0, Math.min(1, num(o.power, 1))));
      p.layers.forEach((l) => { const t = t0 + l.at, v = l.vol * k; if (!(l.sample && sampleVoice(ctx, c, l, t, v))) voice(ctx, c, l, t, v); });
      return p.layers.length;
    } catch (e) { return 0; }
  }
  function setSample(name, buffer) { const n = str(name); if (n && buffer) samples[n] = buffer; }
  // 음원 파일을 불러와 등록한다(실패해도 예외 없이 false → 합성으로 대체됨)
  async function loadSample(ctx, name, url) {
    try {
      if (!ctx || typeof ctx.decodeAudioData !== 'function' || !str(name) || typeof fetch !== 'function') return false;
      const r = await fetch(url); if (!r.ok) return false;
      setSample(name, await ctx.decodeAudioData(await r.arrayBuffer())); return true;
    } catch (e) { return false; }
  }
  // 이벤트 연결: GameFeel의 hit/kill/tele 결과(fx 키)로 자동 재생
  function attach(GF, ctx) {
    if (!GF || typeof GF.on !== 'function') return () => {};
    const offs = ['hit', 'kill', 'tele'].map((t) => GF.on(t, (out) => { if (out && out.fx) play(out.fx, { ctx: ctx, power: out.power }); }));
    return () => offs.forEach((f) => f());
  }

  return { CONST, plan, play, setSample, loadSample, attach, keys: () => Object.keys(CONST.patterns).concat(Object.keys(CONST.weapon)) };
});
