/* GameFeel — 게임쪽 연출(손맛) 모듈. 순수 JS, 외부 의존 없음. 그래픽은 vfx가 맡고 여기는 "언제·얼마나"만 정한다.
 * 이벤트 하나로 쓴다: GameFeel.emit('hit', {weapon, element, power, ...}) → 결과 묶음(+구독자 호출).
 * 매 프레임: const f = GameFeel.update(realDt); 게임 시간은 f.dt(히트스톱 반영), 카메라는 f.cam. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameFeel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 상수표: 모든 수치는 여기서만 조정한다 ──────────────────────────────
  const CONST = {
    hitstop: { base: 0.04, perPower: 0.08, crit: 0.05, kill: 0.07, max: 0.22 },            // 초. 정지 중 게임 시간은 0
    shake: { base: 0.15, perPower: 0.6, crit: 0.25, max: 1.0, amp: 14, decay: 2.2, freq: 38 }, // amp=최대 px, decay=초당 감쇠(0~1 세기)
    zoom: { hit: 0.03, crit: 0.07, kill: 0.1, lockHold: 0.35, ease: 9, max: 1.25, min: 0.8 },  // 명중 때 당기고 lockHold초 뒤 복귀
    assist: { range: 140, arc: 0.9, pull: 36, minGap: 18 },                                   // 거리(px)·허용각(rad)·최대 이동(px)·멈출 간격
    weather: {
      kinds: {
        clear: { rate: 0, wind: 0, tint: 0 }, rain: { rate: 220, wind: 0.2, tint: 0.25 }, snow: { rate: 90, wind: 0.1, tint: 0.1 },
        storm: { rate: 420, wind: 0.8, tint: 0.45 }, fog: { rate: 0, wind: 0.05, tint: 0.35 },
      },
      ease: 0.8, // 날씨 전환 시간(초)
    },
    sound: {
      hit: 'hit', crit: 'crit', kill: 'kill', tele: 'tele', weather: 'amb', pitchSpread: 0.06, maxQueue: 32,
      weapon: { sword: 'slash', axe: 'chop', dagger: 'stab', spear: 'stab', staff: 'cast', wand: 'cast', bow: 'shot', bullet: 'shot', grimoire: 'cast', throw: 'throw' },
    },
    tele: { dur: 1.2, shake: 0.1 }, // vfx tele 패턴의 예고 길이(1.2초)와 맞춘다
    maxDt: 0.1,                     // 탭 복귀 등 큰 프레임 시간은 이 값으로 자른다
  };

  // ── 내부 상태 ───────────────────────────────────────────────────────────
  let vfx = null, rng = Math.random;
  const subs = {};
  const S = { stop: 0, shake: 0, zoomT: 1, zoom: 1, lock: 0, t: 0, weather: { kind: 'clear', to: 'clear', k: 1 }, sounds: [] };

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const str = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

  function reset() { S.stop = 0; S.shake = 0; S.zoomT = 1; S.zoom = 1; S.lock = 0; S.t = 0; S.weather = { kind: 'clear', to: 'clear', k: 1 }; S.sounds.length = 0; }
  function merge(t, s) { for (const k in s) { if (s[k] && typeof s[k] === 'object' && t[k] && typeof t[k] === 'object') merge(t[k], s[k]); else t[k] = s[k]; } }
  function configure(o) {
    o = o || {};
    if ('vfx' in o) vfx = o.vfx || null;           // VFXSet 객체를 넘긴다
    if (typeof o.rng === 'function') rng = o.rng;
    if (o.const && typeof o.const === 'object') merge(CONST, o.const);
  }

  // vfx 키 연결: VFXSet.weapon(무기,속성)을 쓴다. 없거나 모르는 조합이면 null. 예고는 tele-<속성>.
  function fxKey(weapon, element) {
    const w = str(weapon), e = str(element);
    if (!w || !e || !vfx || typeof vfx.weapon !== 'function') return null;
    return vfx.weapon(w, e) || null;
  }
  function teleKey(element) { const e = str(element); return e ? 'tele-' + e : null; }

  function cue(name, vol, pitch) {
    if (!name) return null;
    const c = { cue: name, vol: clamp(num(vol, 1), 0, 1), pitch: +(num(pitch, 1) + (rng() - 0.5) * 2 * CONST.sound.pitchSpread).toFixed(3) };
    S.sounds.push(c);
    if (S.sounds.length > CONST.sound.maxQueue) S.sounds.shift();
    return c;
  }

  // ── 이벤트 API ──────────────────────────────────────────────────────────
  // 종류: hit(명중) · kill(처치) · tele(예고) · weather(날씨 전환) · attack(공격 시작, 흡착 계산). 모르는 종류는 null.
  function emit(type, p) {
    p = p && typeof p === 'object' ? p : {};
    type = str(type);
    let out;
    if (type === 'hit' || type === 'kill') out = onHit(type, p);
    else if (type === 'tele') out = onTele(p);
    else if (type === 'weather') out = { weather: setWeather(p.kind) };
    else if (type === 'attack') out = { assist: assist(p) };
    else return null;
    out.type = type;
    (subs[type] || []).concat(subs['*'] || []).forEach((fn) => { try { fn(out, p); } catch (e) { /* 구독자 오류가 게임을 멈추지 않는다 */ } });
    return out;
  }
  function on(type, fn) {
    if (typeof fn !== 'function') return () => {};
    (subs[type] = subs[type] || []).push(fn);
    return () => { subs[type] = subs[type].filter((f) => f !== fn); };
  }

  function onHit(type, p) {
    const power = clamp(num(p.power, 0.5), 0, 1); // 0~1: 피해 크기 비율. 연출은 이것에 비례한다
    const crit = !!p.crit, kill = type === 'kill' || !!p.kill;
    const H = CONST.hitstop, K = CONST.shake, Z = CONST.zoom;
    const stop = clamp(H.base + H.perPower * power + (crit ? H.crit : 0) + (kill ? H.kill : 0), 0, H.max);
    const shake = clamp(K.base + K.perPower * power + (crit ? K.crit : 0), 0, K.max);
    const zoomIn = Z.hit * (0.5 + power) + (crit ? Z.crit : 0) + (kill ? Z.kill : 0);
    S.stop = Math.max(S.stop, stop);
    S.shake = Math.max(S.shake, shake);
    S.zoomT = clamp(1 + zoomIn, Z.min, Z.max);
    S.lock = Z.lockHold;
    const sound = [cue(kill ? CONST.sound.kill : crit ? CONST.sound.crit : CONST.sound.hit, 0.5 + 0.5 * power, 1 - 0.1 * power)];
    const wc = CONST.sound.weapon[str(p.weapon)];
    if (wc) sound.push(cue(wc, 0.6, 1));
    return { fx: fxKey(p.weapon, p.element), at: pos(p), power, hitstop: stop, shake, zoom: S.zoomT, sound };
  }
  function onTele(p) {
    const dur = clamp(num(p.dur, CONST.tele.dur), 0, 10);
    S.shake = Math.max(S.shake, CONST.tele.shake);
    return { fx: teleKey(p.element), at: pos(p), dur, sound: [cue(CONST.sound.tele, 0.7, 1)] };
  }
  function pos(p) { return { x: num(p.x, 0), y: num(p.y, 0) }; }

  // ── 공격 흡착: 공격 방향 허용각 안의 가장 가까운 적 쪽으로 살짝 이동량을 돌려준다 ──
  // p = {x,y,dir(rad),targets:[{x,y}]} → {dx,dy,target:index|-1}
  function assist(p) {
    p = p || {};
    const A = CONST.assist;
    const ts = Array.isArray(p.targets) ? p.targets : [];
    const x = num(p.x, 0), y = num(p.y, 0), dir = num(p.dir, 0);
    let best = -1, bd = Infinity;
    ts.forEach((t, i) => {
      if (!t) return;
      const dx = num(t.x, NaN) - x, dy = num(t.y, NaN) - y;
      if (!isFinite(dx) || !isFinite(dy)) return;
      const d = Math.hypot(dx, dy);
      if (d > A.range || d < 1e-6) return;
      let da = Math.atan2(dy, dx) - dir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > A.arc) return;
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return { dx: 0, dy: 0, target: -1 };
    const t = ts[best], mv = Math.min(A.pull, Math.max(0, bd - A.minGap));
    return { dx: ((t.x - x) / bd) * mv, dy: ((t.y - y) / bd) * mv, target: best };
  }

  // ── 날씨 신호: 파티클은 게임이 만든다. 여기서는 부드럽게 전환되는 값만 낸다 ──
  function setWeather(kind) {
    const k = str(kind);
    if (!k || !CONST.weather.kinds[k]) return S.weather.to; // 모르는 종류는 현재 목표 유지
    const cur = weatherSignal();
    S.weather.kind = cur.kind; S.weather.to = k; S.weather.k = 0;
    S.weather.fromV = cur;                                  // 도중 전환도 현재 값에서 이어진다
    cue(CONST.sound.weather, 0.4, 1);
    return k;
  }
  function weatherSignal() {
    const W = CONST.weather.kinds, b = W[S.weather.to] || W.clear, k = clamp(S.weather.k, 0, 1);
    const a = k >= 1 ? b : (S.weather.fromV || W[S.weather.kind] || W.clear);
    const l = (u, v) => u + (v - u) * k;
    return { kind: k >= 1 ? S.weather.to : S.weather.kind, to: S.weather.to, rate: l(a.rate, b.rate), wind: l(a.wind, b.wind), tint: l(a.tint, b.tint), blend: k };
  }

  // ── 매 프레임 ───────────────────────────────────────────────────────────
  // realDt: 실제 경과(초). 음수·NaN은 0. 반환 dt는 히트스톱이 반영된 게임 시간.
  function update(realDt) {
    const dt = clamp(num(realDt, 0), 0, CONST.maxDt);
    S.t += dt;
    const used = Math.min(S.stop, dt);
    S.stop -= used;
    const gdt = dt - used;
    S.shake = Math.max(0, S.shake - CONST.shake.decay * dt);
    if (S.lock > 0) S.lock = Math.max(0, S.lock - dt); else S.zoomT = 1;
    S.zoom += (S.zoomT - S.zoom) * (1 - Math.exp(-CONST.zoom.ease * dt));
    if (S.weather.k < 1) S.weather.k = Math.min(1, S.weather.k + dt / Math.max(1e-3, CONST.weather.ease));
    const a = S.shake * S.shake * CONST.shake.amp, f = CONST.shake.freq;
    return {
      dt: gdt, frozen: S.stop > 0,
      cam: { x: a * Math.sin(S.t * f), y: a * Math.cos(S.t * f * 1.3), zoom: S.zoom },
      weather: weatherSignal(), sounds: S.sounds.splice(0),
    };
  }

  return { CONST, emit, on, update, assist, configure, reset, fxKey, teleKey, weatherSignal, state: () => S };
});
