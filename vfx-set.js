/* vfx-set.js — 세트피스 이펙트(방어막·차원문·마법탄·폭발·발사대).
   검기·타격(vfx-engine.js)과 별개로, 언리얼 Niagara 작업물처럼 "부품을 겹쳐 하나의 이펙트"를 만든다.
   부품(메시·데칼·파티클·충격파·볼륨)을 WebGL2 셰이더로 계산해 HDR 버퍼에 쌓고, 블룸·톤매핑으로 마무리한다.
   부품마다 mask 비트가 있어 따로 켜고 끌 수 있다(브레이크다운 시트가 이걸 쓴다).
   사용: const S = new VFXSet(canvas); S.render({fx:'shield', time, w, h, mask, cam}) */
(function (G) {
  'use strict';

  /* ───────────── 효과 정의 ───────────── */
  const D = Math.PI / 180;
  const FX = {
    shield: {
      id: 0, dur: 5, title: 'KINETIC FORCE FIELD', result: 'Kinetic Force Shield', pBit: 4, pN: 220,
      cam: { target: [0, 1.4, 0], dist: 10.5, yaw: .12, pitch: .17, fov: 38 },
      parts: [
        { label: 'FORCE FIELD BARRIER MESH', bit: 1, t: 2.4, cam: { dist: 8.6, target: [0, 1.3, 0] } },
        { label: 'KINETIC GROUND DECAL', bit: 2, t: 2.4, cam: { dist: 9.5, pitch: 1.2, target: [0, 0, 0] } },
        { label: 'FLOATING ENERGY PARTICLES', bit: 4, t: 2.4, cam: { dist: 8.6, target: [0, 1.3, 0] } },
        { label: 'IMPACT SHOCKWAVE RIPPLES', bit: 8, t: 1.95, cam: { dist: 9.5, pitch: .75, target: [0, 0, 0] } }
      ]
    },
    portal: {
      id: 1, dur: 5, title: 'ASTRAL RIFT PORTAL', result: 'Astral Rift Portal', pBit: 8, pN: 300,
      cam: { target: [0, 1.9, 0], dist: 8.4, yaw: 0, pitch: .13, fov: 40 },
      parts: [
        { label: 'SWIRLING VOID CORE', bit: 1, t: 2.6, cam: { dist: 4.6 } },
        { label: 'RUNED PORTAL FRAME', bit: 2, t: 2.6, cam: { dist: 4.6 } },
        { label: 'DIMENSIONAL TENDRILS', bit: 4, t: 2.6, cam: { dist: 5.2 } },
        { label: 'RIFT GROUND DECAL', bit: 8, t: 2.6, cam: { dist: 8.5, pitch: 1.15, target: [0, 0, 0] } }
      ]
    },
    bolt: {
      id: 2, dur: 2.4, title: 'ASTRAL ARCANE BOLT', result: 'Astral Arcane Bolt', pBit: 8, pN: 260,
      cam: { target: [0, 1.4, 0], dist: 9.2, yaw: -.42, pitch: .12, fov: 38 },
      parts: [
        { label: 'CORE ENERGY PROJECTILE', bit: 1, t: 1.1, cam: { dist: 5, target: [0, 1.5, 0], follow: 1 } },
        { label: 'SWIRLING ARCANE TRAILS', bit: 2, t: 1.1, cam: { dist: 6.2, target: [0, 1.5, 0], follow: 1 } },
        { label: 'RUNIC PROPULSION AURA', bit: 4, t: 1.1, cam: { dist: 6.2, target: [0, 1.5, 0], follow: 1 } },
        { label: 'SPARK & SPARKLE MOTES', bit: 8, t: 1.1, cam: { dist: 6.2, target: [0, 1.5, 0], follow: 1 } }
      ]
    },
    pyro: {
      id: 3, dur: 4, title: 'PYROCLASTIC IMPACT', result: 'Pyroclastic Impact', pBit: 4, pN: 520, dN: 40,
      cam: { target: [0, 2.2, 0], dist: 11.5, yaw: 0, pitch: .07, fov: 40 },
      parts: [
        { label: 'CORE FLASH & GLOW', bit: 1, t: .3, cam: { dist: 8 } },
        { label: 'ROLLING FIREBALL VOLUMETRICS', bit: 2, t: 1.1, cam: { dist: 8.5 } },
        { label: 'SPARKS & FLYING DEBRIS', bit: 4, t: 1.0, cam: { dist: 11 } },
        { label: 'RADIAL SHOCKWAVE & DUST', bit: 8, t: 1.0, cam: { dist: 11, pitch: .45 } },
        { label: 'RISING BILLOWING SMOKE', bit: 16, t: 2.4, cam: { dist: 11, target: [0, 3.2, 0] } }
      ]
    },
    pad: {
      id: 4, dur: 3, title: 'KINETIC LAUNCHPAD', result: 'Kinetic Launchpad', pBit: 4, pN: 300,
      cam: { target: [0, 2.7, 0], dist: 9.4, yaw: .08, pitch: .26, fov: 42 },
      parts: [
        { label: 'SCI-FI PAD DECAL', bit: 1, t: 1.3, cam: { dist: 6.5, pitch: .95, target: [0, 0, 0] } },
        { label: 'UPWARD PROPULSION RINGS', bit: 2, t: 1.3, cam: { dist: 9.4 } },
        { label: 'LAUNCH BLAST PARTICLES', bit: 4, t: 1.3, cam: { dist: 9.4 } },
        { label: 'GROUND SHOCKWAVE', bit: 8, t: 1.3, cam: { dist: 9.4, pitch: .6, target: [0, 0, 0] } }
      ]
    }
  };
  FX.torrent = {
    id: 5, dur: 5, title: 'CASCADING TORRENT', result: 'Cascading Torrent', pBit: 4, pN: 420,
    cam: { target: [0, 2.3, 0], dist: 11, yaw: .35, pitch: .15, fov: 40 },
    parts: [
      { label: 'FLOWING WATER SHEET', bit: 1, t: 2.5, cam: { dist: 8, yaw: .2 } },
      { label: 'IMPACT FOAM & POOL', bit: 2, t: 2.5, cam: { dist: 8.5, pitch: .6, target: [0, .3, 0] } },
      { label: 'SPLASH DROPLETS', bit: 4, t: 2.5, cam: { dist: 8, target: [0, 1.2, 0] } },
      { label: 'RISING MIST', bit: 8, t: 2.5, cam: { dist: 8, target: [0, 1.5, 0] } }
    ]
  };
  FX.buff = {
    id: 6, dur: 4, title: 'LIGHTNING BUFF', result: 'Lightning Buff', pBit: 4, pN: 220,
    cam: { target: [0, 1.6, 0], dist: 8.5, yaw: .15, pitch: .2, fov: 40 },
    parts: [
      { label: 'GROUND RUNE DECAL', bit: 1, t: 1.8, cam: { dist: 8, pitch: 1.1, target: [0, 0, 0] } },
      { label: 'ELECTRIC ARC AURA', bit: 2, t: 1.8, cam: { dist: 6.5 } },
      { label: 'RISING SPARK MOTES', bit: 4, t: 1.8, cam: { dist: 6.5 } },
      { label: 'CHARGE PULSE RINGS', bit: 8, t: 1.8, cam: { dist: 8, pitch: .6, target: [0, .3, 0] } }
    ]
  };
  /* 속성 × 패턴 계열(id 7). 셰이더 함수는 패턴당 하나, 속성은 색·거칠기 표(EL_*)만 바뀐다 */
  const ELEMS = [
    { k: 'fire', n: 'FIRE', ko: '불꽃' }, { k: 'ice', n: 'ICE', ko: '얼음' }, { k: 'lightning', n: 'LIGHTNING', ko: '번개' },
    { k: 'poison', n: 'POISON', ko: '독' }, { k: 'dark', n: 'DARK', ko: '어둠' }, { k: 'holy', n: 'HOLY', ko: '신성' },
    { k: 'arcane', n: 'ARCANE', ko: '비전' }, { k: 'wind', n: 'WIND', ko: '바람' }, { k: 'metal', n: 'METAL', ko: '금속' }
  ];
  const PL = { target: [0, 1.5, 0], dist: 8.5, yaw: 0, pitch: 0, fov: 40 };
  const PATS = [
    { k: 'hit', id: 0, ko: '타격', n: 'HIT', dur: 1.4, pN: 200, cam: PL, parts: [['IMPACT CORE FLASH', 1, .3], ['RADIAL SPIKES', 2, .35], ['SPARK BURST', 4, .5], ['SHOCK RING', 8, .6]] },
    { k: 'slash', id: 1, ko: '베기', n: 'SLASH', dur: 1.4, pN: 200, cam: PL, parts: [['CRESCENT BLADE ARC', 1, .3], ['AFTERIMAGE STREAKS', 2, .3], ['EDGE SPARKS', 4, .45], ['TIP IMPACT', 8, .7]] },
    { k: 'stab', id: 2, ko: '찌르기', n: 'THRUST', dur: 1.2, pN: 180, cam: PL, parts: [['THRUST LINE', 1, .12], ['AFTERIMAGE STREAK', 2, .2], ['SPARK BURST', 4, .45], ['TIP IMPACT', 8, .45]] },
    { k: 'smash', id: 3, ko: '내려치기', n: 'SMASH', dur: 1.8, pN: 200, dN: 20, cam: { target: [0, 1.2, 0], dist: 9.5, yaw: 0, pitch: .3, fov: 40 },
      parts: [['IMPACT FLASH & PLUME', 1, .4], ['GROUND SHOCKWAVE', 2, .5], ['SPARKS', 4, .5], ['GROUND CRACKS', 8, .7], ['FLYING DEBRIS', 16, .6]] },
    { k: 'shatter', id: 4, ko: '파괴', n: 'SHATTER', dur: 2.2, pN: 220, dN: 36, cam: PL, parts: [['CRACKING BODY', 1, .6], ['BREAK FLASH', 2, 1.0], ['SPARKS', 4, 1.1], ['DUST CLOUD', 8, 1.3], ['FLYING SHARDS', 16, 1.2]] },
    { k: 'aura', id: 5, ko: '오라', n: 'AURA', dur: 3.2, pN: 200, cam: { target: [0, 1.5, 0], dist: 8.5, yaw: .15, pitch: .2, fov: 40 },
      parts: [['GROUND RUNE DECAL', 1, 1.5], ['ENERGY COLUMN', 2, 1.5], ['RISING MOTES', 4, 1.5], ['PULSE BANDS', 8, 1.5]] },
    { k: 'shot', id: 6, ko: '투사체', n: 'PROJECTILE', dur: 2.2, pN: 220, cam: PL, parts: [['PROJECTILE HEAD', 1, .5], ['STREAMING TRAIL', 2, .5], ['TRAIL SPARKS', 4, .5], ['TARGET IMPACT', 8, 1.2]] },
    { k: 'tele', id: 7, ko: '예고', n: 'TELEGRAPH', dur: 2.0, pN: 160, cam: { target: [1.2, 0, 0], dist: 9, yaw: 0, pitch: .95, fov: 40 },
      parts: [['CONE ZONE', 1, 1.0], ['BLADE LINE', 2, 1.0], ['BURST SPARKS', 4, 1.4], ['RELEASE RING', 8, 1.4]] }
  ];
  PATS.forEach(P => ELEMS.forEach((E, ei) => {
    FX[P.k + '-' + E.k] = {
      id: 7, pat: P.id, elem: ei, cat: P.k, ek: E.k, ko: E.ko + ' ' + P.ko, dur: P.dur, pN: P.pN, dN: P.dN || 0,
      title: E.n + ' ' + P.n, result: E.n + ' ' + P.n, pBit: 4, cam: P.cam,
      parts: P.parts.map(p => ({ label: p[0], bit: p[1], t: p[2], cam: {} }))
    };
  }));
  // 무기 10종: 같은 패턴 셰이더에 변형값(var)만 바꿔 모양을 달리한다. 어떤 속성과도 조합된다.
  const WEAPONS = [
    { k: 'sword', ko: '직검', n: 'SWORD', pat: 'slash', v: 0 }, { k: 'axe', ko: '도끼', n: 'AXE', pat: 'slash', v: 1 },
    { k: 'dagger', ko: '단검', n: 'DAGGER', pat: 'stab', v: 2 }, { k: 'spear', ko: '창', n: 'SPEAR', pat: 'stab', v: 3 },
    { k: 'staff', ko: '지팡이', n: 'STAFF', pat: 'shot', v: 4 }, { k: 'wand', ko: '마법봉', n: 'WAND', pat: 'shot', v: 5 },
    { k: 'bow', ko: '활', n: 'BOW', pat: 'shot', v: 6 }, { k: 'bullet', ko: '마법탄환', n: 'BULLET', pat: 'shot', v: 7 },
    { k: 'grimoire', ko: '마법서', n: 'GRIMOIRE', pat: 'aura', v: 8 }, { k: 'throw', ko: '투척', n: 'THROWN', pat: 'shot', v: 9 }
  ];
  WEAPONS.forEach(W => { const P = PATS.find(p => p.k === W.pat); ELEMS.forEach((E, ei) => {
    FX[W.k + '-' + E.k] = {
      id: 7, pat: P.id, vr: W.v, elem: ei, cat: W.k, ek: E.k, ko: E.ko + ' ' + W.ko, dur: P.dur, pN: P.pN, dN: P.dN || 0,
      title: E.n + ' ' + W.n, result: E.n + ' ' + W.n, pBit: 4, cam: P.cam,
      parts: P.parts.map(p => ({ label: p[0], bit: p[1], t: p[2], cam: {} }))
    };
  }); });
  const HOLD = { 0: [0.0, .06], 1: [.3, .08], 2: [.27, .08], 3: [.15, .12], 4: [.8, .12], 6: [1.0, .08] }; // 패턴별 [명중 시각, 홀드 초]
  const CATS = [{ k: 'set', ko: '세트피스' }].concat(WEAPONS.map(w => ({ k: w.k, ko: w.ko })), PATS.map(p => ({ k: p.k, ko: p.ko })));
  for (const k in FX) { const f = FX[k]; f.key = k; f.full = (1 << f.parts.length) - 1; if (!f.cat) { f.cat = 'set'; f.ko = f.title; } }

  /* ───────────── 장면 셰이더 ───────────── */
  const VS_FULL = `#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }`;

  const FS_SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uT; uniform int uFx; uniform int uMask; uniform float uBg; uniform int uElem,uPat,uVar;
uniform vec3 uCP,uCF,uCR,uCU; uniform float uTan;
out vec4 oC;
#define PI 3.14159265
#define TAU 6.2831853
bool M(int b){return (uMask&b)!=0;}
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float h31(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float vn3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=mat2(.8,.6,-.6,.8)*p*2.02+7.3;a*=.5;}return s;}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn3(p);p=p*2.03+vec3(5.2,1.3,3.7);a*=.5;}return s;}
mat2 R2(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
float sdBox(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float ln(float d,float w){return 1.-smoothstep(0.,w,d);}
float gw(float d,float k){return exp(-d*k);}
float ring(float r,float r0,float w){return 1.-smoothstep(0.,w,abs(r-r0));}
float ticks(float a,float n,float w){float f=abs(fract(a/TAU*n)-.5)*2.;return smoothstep(1.-w,1.,f);}
float wrapA(float x){return mod(x+PI,TAU)-PI;}
float sdStar(vec2 p,float r,int n,float m){
  float an=PI/float(n),en=PI/m; vec2 acs=vec2(cos(an),sin(an)),ecs=vec2(cos(en),sin(en));
  float bn=mod(atan(p.x,p.y),2.*an)-an; p=length(p)*vec2(cos(bn),abs(sin(bn)));
  p-=r*acs; p+=ecs*clamp(-dot(p,ecs),0.,r*acs.y/ecs.y); return length(p)*sign(p.x);}
const vec2 HS=vec2(1.,1.7320508);
float hexD(vec2 p){p=abs(p);return max(dot(p,HS*.5),p.x);}
vec4 hexCell(vec2 p){
  vec4 hC=floor(vec4(p,p-vec2(.5,1.))/HS.xyxy)+.5;
  vec4 h=vec4(p-hC.xy*HS,p-(hC.zw+.5)*HS);
  return dot(h.xy,h.xy)<dot(h.zw,h.zw)?vec4(h.xy,hC.xy):vec4(h.zw,hC.zw+.5);}
// 룬 글리프: 세로·가로·사선 획을 해시로 조합
float glyph(vec2 q,float id){
  q=q*2.-1.; float d=9.;
  float a=h11(id*1.7+.3),b=h11(id*3.1+1.1),c=h11(id*5.3+2.2),e=h11(id*7.9+3.3);
  if(a>.25) d=min(d,sdBox(q-vec2(mix(-.45,.45,b),0.),vec2(.09,.8)));
  if(c>.35) d=min(d,sdBox(q-vec2(0.,mix(-.55,.55,e)),vec2(.7,.09)));
  if(e>.45) d=min(d,sdSeg(q,vec2(-.6,-.75),vec2(.6,.75*(b*2.-1.)))-.08);
  if(b>.5)  d=min(d,sdSeg(q,vec2(-.55,.7),vec2(.55,-.1))-.08);
  return d;}
float runeBand(float r,float ang,float r0,float r1,float n,float seed){
  float v=(r-r0)/(r1-r0); if(v<0.||v>1.) return 0.;
  float u=ang/TAU*n; float id=floor(u); float fu=fract(u);
  float d=glyph(vec2(fu,v),id+seed*13.);
  float inside=step(.1,fu)*step(fu,.9)*step(.1,v)*step(v,.9);
  return (1.-smoothstep(0.,.16,d))*inside;}
vec3 fireRamp(float x){
  vec3 c=vec3(0.);
  c=mix(c,vec3(.45,.03,0.),smoothstep(0.,.2,x));
  c=mix(c,vec3(1.,.3,.02),smoothstep(.18,.45,x));
  c=mix(c,vec3(1.,.7,.18),smoothstep(.4,.7,x));
  c=mix(c,vec3(1.,.95,.7),smoothstep(.65,.92,x));
  c=mix(c,vec3(1.,1.,1.),smoothstep(.9,1.2,x));
  return c;}
vec2 gp;
const vec3 EL_D[9]=vec3[9](vec3(.5,.04,0.),vec3(.05,.25,.6),vec3(.3,.2,.9),vec3(.05,.3,.05),vec3(.18,.03,.35),vec3(.7,.5,.1),vec3(.3,.1,.7),vec3(.1,.45,.4),vec3(.35,.35,.4));
const vec3 EL_M[9]=vec3[9](vec3(1.,.4,.05),vec3(.4,.8,1.),vec3(.55,.7,1.),vec3(.4,.9,.2),vec3(.5,.15,.8),vec3(1.,.85,.35),vec3(.7,.4,1.),vec3(.5,.95,.8),vec3(.8,.85,.95));
const vec3 EL_H[9]=vec3[9](vec3(1.,.9,.55),vec3(.9,1.,1.),vec3(1.),vec3(.85,1.,.5),vec3(.95,.6,1.),vec3(1.,1.,.9),vec3(1.,.9,1.),vec3(.95,1.,.97),vec3(1.));
const float EL_T[9]=float[9](1.,.15,1.4,1.,1.,.3,.7,.8,.0);

/* ── 시간표: 충격 ── */
float impPulse(float t){float s=0.; s+=t>1.5?exp(-(t-1.5)*5.):0.; s+=t>2.8?exp(-(t-2.8)*5.):0.; s+=t>3.7?exp(-(t-3.7)*5.):0.; return s;}
float rippleAt(vec3 n,float t){
  float s=0.;
  vec3 d0=normalize(vec3(.6,.5,.6)),d1=normalize(vec3(-.7,.4,.5)),d2=normalize(vec3(.1,.85,.5));
  for(int i=0;i<3;i++){
    float ti=i==0?1.5:(i==1?2.8:3.7); vec3 d=i==0?d0:(i==1?d1:d2);
    float age=t-ti; if(age<0.||age>1.8) continue;
    float th=acos(clamp(dot(n,d),-1.,1.));
    float w=th-age*2.0; s+=exp(-w*w*20.)*exp(-age*1.3)+exp(-th*3.)*exp(-age*8.)*1.4;
  }
  return s;}
float boltHx(float t){float u=clamp((t-.15)/1.9,0.,1.);return -5.2+10.*u;}
float boltHy(float t){return 1.5+.1*sin(t*2.8);}

void lightFor(float t,out vec3 lp,out vec3 lc){
  if(uFx==0){ float a=smoothstep(0.,.8,t)*(1.-smoothstep(4.3,5.,t)); lp=vec3(0,1.4,0); lc=vec3(.1,.55,1.)*(1.3*a+1.4*impPulse(t)*a); }
  else if(uFx==1){ float a=smoothstep(0.,1.2,t)*(1.-smoothstep(4.3,5.,t)); lp=vec3(0,1.9,1.8); lc=vec3(.5,.2,1.)*(1.7*a)*(.85+.3*vn(vec2(t*9.,1.))); }
  else if(uFx==2){ float a=smoothstep(0.,.25,t)*(1.-smoothstep(2.1,2.4,t)); lp=vec3(boltHx(t),boltHy(t),1.4); lc=vec3(.3,.4,1.)*2.4*a; }
  else if(uFx==3){ float ag=t-.12; float fi=ag>0.?smoothstep(0.,.1,ag)*(1.-smoothstep(1.2,3.2,ag)):0.; float fl=ag>0.?exp(-ag*5.):0.; lp=vec3(0,1.6,.6); lc=vec3(1.,.45,.12)*(fl*7.+fi*2.6); }
  else if(uFx==4){ float ag=t-.7; float lau=ag>0.?exp(-ag*2.):0.; lp=vec3(0,1.3,0); lc=vec3(.15,.65,1.)*(.55+.25*sin(t*4.)+3.*lau); }
  else if(uFx==5){ float a=smoothstep(0.,.7,t)*(1.-smoothstep(4.4,5.,t)); lp=vec3(0,1.6,1.4); lc=vec3(.3,.65,1.)*1.8*a; }
  else if(uFx==6){ float a=smoothstep(0.,.5,t)*(1.-smoothstep(3.5,4.,t)); lp=vec3(0,1.7,0); lc=vec3(.35,.55,1.)*(1.6+1.6*step(.5,vn(vec2(t*14.,2.))))*a; }
  else { lp=vec3(0.,1.5,1.6); float f=0.;
    if(uPat==0) f=t>.15?exp(-(t-.15)*4.):0.;
    else if(uPat==1) f=exp(-abs(t-.3)*7.);
    else if(uPat==2) f=t>.27?exp(-(t-.27)*5.):0.;
    else if(uPat==3){ f=t>.15?exp(-(t-.15)*3.)*1.5:0.; lp=vec3(0.,.5,1.4); }
    else if(uPat==4) f=t<.8?.25+.5*smoothstep(.2,.8,t):exp(-(t-.8)*3.)*2.;
    else if(uPat==5) f=smoothstep(0.,.5,t)*(1.-smoothstep(2.7,3.2,t))*.9;
    else if(uPat==7){ f=t<1.2?.15+.25*t:exp(-(t-1.2)*5.)*1.6; lp=vec3(1.5,.8,0.); }
    else { float u=clamp(t,0.,1.); lp=vec3(mix(-5.,3.2,u),1.5,1.6); f=t<1.?.8:exp(-(t-1.)*4.)*2.; }
    lc=EL_M[uElem]*f*2.2; }
}
vec3 envColor(vec3 ro,vec3 rd,vec3 lp,vec3 lc){
  vec3 col=vec3(.004,.006,.012);
  float tf=rd.y<-1e-3?-ro.y/rd.y:1e9; float tw=rd.z<-1e-3?(-14.-ro.z)/rd.z:1e9; float tt=min(tf,tw);
  if(tt>1e8) return col;
  vec3 p=ro+rd*tt; vec3 alb,n;
  if(tf<tw){
    vec2 g=p.xz*.42; vec2 id=floor(g),f=fract(g);
    float edge=min(min(f.x,1.-f.x),min(f.y,1.-f.y));
    float tex=fbm(p.xz*2.2);
    alb=vec3(.07,.075,.095)*(.55+.9*tex)*(.75+.5*h21(id));
    alb*=.3+.7*smoothstep(0.,.035,edge); n=vec3(0,1,0);
  } else {
    float by=p.y*.7; float bx=p.x*.35+.5*floor(by); vec2 f=vec2(fract(bx),fract(by));
    float edge=min(min(f.x,1.-f.x),min(f.y,1.-f.y)*1.6);
    alb=vec3(.06,.065,.085)*(.5+1.1*fbm(p.xy*vec2(1.4,.9)))*(.3+.7*smoothstep(0.,.05,edge)); n=vec3(0,0,1);
  }
  vec3 L=lp-p; float d2=dot(L,L); L=normalize(L);
  float att=1./(1.+d2*.045);
  col+=alb*vec3(.5,.6,.9)*.12;
  col+=alb*lc*max(dot(n,L),0.)*att*2.2;
  if(n.y>.5){ float sp=pow(max(dot(reflect(rd,n),L),0.),22.); col+=lc*sp*att*.45*(1.-fbm(p.xz*2.2)*.6); col+=lc*.05*exp(-length(p.xz-lp.xz)*.3); }
  col*=exp(-tt*.028);
  return col;}

/* ═════ 1. 방어막 ═════ */
vec3 fxShield(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  vec3 cD=vec3(.02,.25,.7),cM=vec3(.1,.75,1.),cH=vec3(.8,.97,1.);
  float fo=1.-smoothstep(4.3,5.,t); float spawn=smoothstep(0.,.9,t);
  float ip=impPulse(t);
  if(M(1)){
    float R=3.; float reveal=smoothstep(0.,1.15,t)*1.3-.05;
    float b=dot(ro,rd),c=dot(ro,ro)-R*R,disc=b*b-c;
    if(disc>0.){ float sq=sqrt(disc);
      for(int k=0;k<2;k++){
        float tt=k==0?-b-sq:-b+sq; if(tt<0.) continue;
        vec3 p=ro+rd*tt; if(p.y<-.02) continue;
        vec3 n=p/R; float fr=k==0?1.:.42;
        float ndv=abs(dot(n,rd)); float fres=pow(1.-ndv,2.3);
        vec2 q=n.xz/(n.y+1.)*2.7; vec4 hc=hexCell(q+vec2(t*.01,0.)); float edge=.5-hexD(hc.xy);
        float rid=h21(hc.zw);
        float line=1.-smoothstep(0.,.075,edge);
        float vis=smoothstep(0.,.1,reveal-n.y+(rid-.5)*.3);
        float wf=exp(-pow((reveal-n.y)*9.,2.))*(1.-smoothstep(1.1,1.35,reveal));
        float en=fbm3(n*4.+vec3(0.,-t*.5,t*.2));
        float w=M(8)?rippleAt(n,t):0.;
        float cellOn=smoothstep(.72,1.,rid+.25*sin(t*2.+rid*30.));
        float fill=(.05+.6*fres)*(.55+.9*en);
        vec3 v=fill*cM*1.1;
        v+=line*(.5+1.7*fres+2.6*w+(en-.3)*1.2)*mix(cM,cH,.35+.4*w);
        v+=cellOn*cM*(.22+.3*w);
        v+=w*(.3+fres)*cH*.8;
        v+=exp(-max(p.y,0.)*5.)*cM*1.3*(.7+.6*en);
        v+=pow(max(dot(n,normalize(vec3(-.5,.8,.4))),0.),50.)*.7*fres*cH;
        v+=wf*cH*1.4;
        col+=v*fr*vis*fo*(1.+.5*ip);
      }
    }
  }
  if(M(2)&&hf){
    vec2 g=fp.xz; float r=length(g),a=atan(g.y,g.x);
    float rs=r/(.15+.85*spawn);
    float e=0.;
    e+=ring(rs,3.68,.035)*1.2+ring(rs,3.42,.014)*.8+ring(rs,3.0,.04)*1.4+ring(rs,2.52,.014)*.7+ring(rs,1.3,.02)*.8;
    e+=runeBand(rs,a+t*.12,3.06,3.37,44.,1.)*1.5;
    e+=runeBand(rs,a-t*.18,1.5,1.82,22.,2.)*1.3;
    e+=ticks(a-t*.05,128.,.22)*step(3.46,rs)*step(rs,3.62)*.8;
    vec2 qq=R2(-t*.1)*g/(.15+.85*spawn);
    e+=ln(abs(sdStar(qq,2.35,6,3.)),.028)*1.15;
    e+=ln(abs(sdStar(R2(t*.15)*g/(.15+.85*spawn),1.1,6,2.4)),.02)*.8;
    e*=step(rs,3.8);
    vec3 v=mix(cM,cH,clamp(e*.35,0.,1.))*e*(1.4+1.2*ip);
    v+=cM*gw(abs(rs-3.),1.8)*.2*step(rs,3.8)+cM*exp(-r*.45)*.25;
    col+=v*spawn*fo;
  }
  if(M(8)&&hf){
    vec2 g=fp.xz; float r=length(g),a=atan(g.y,g.x);
    float s=0.;
    for(int i=0;i<3;i++){
      float ti=i==0?1.5:(i==1?2.8:3.7); float age=t-ti; if(age<0.||age>2.) continue;
      float rad=3.2+age*3.1; float wd=.1+age*.17; float nz=.5+.7*fbm(vec2(a*3.+float(i)*4.,age*2.)+r*.3);
      for(int j=0;j<3;j++){ float rj=rad-float(j)*.55; float k=j==0?1.:(j==1?.5:.25);
        s+=exp(-pow((r-rj)/wd,2.))*nz*k*exp(-age*1.15)*(1.+.8*exp(-age*6.)); }
    }
    col+=mix(cM,cH,clamp(s*.4,0.,1.))*s*1.5*fo;
  }
  return col;}

/* ═════ 2. 차원문 ═════ */
vec3 fxPortal(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  vec3 C=vec3(0,2.,0); float Rp=1.55;
  float spawn=smoothstep(0.,1.2,t); float gS=1.-pow(1.-spawn,3.); float fo=1.-smoothstep(4.3,5.,t);
  bool onP=rd.z<-1e-3; float tp=onP?-ro.z/rd.z:-1.;
  vec3 pp=ro+rd*max(tp,0.); vec2 q=pp.xy-C.xy; float rp=length(q)/Rp; float a=atan(q.y,q.x);
  if(M(8)&&hf){
    vec2 g=fp.xz; float r=length(g),ang=atan(g.y,g.x); float sp=.15+.85*gS; float rs=r/sp;
    float e=ring(rs,2.7,.035)*1.2+ring(rs,2.35,.014)+ring(rs,1.1,.02)*.9+ring(rs,2.78,.012)*.6;
    e+=runeBand(rs,ang+t*.1,2.4,2.66,40.,3.)*1.4;
    e+=ln(abs(sdStar(R2(-t*.12)*g/sp,1.85,5,2.5)),.03)*1.1;
    float crack=1.-smoothstep(0.,.035,abs(fbm(g*1.7+3.)-.5)); crack*=(1.-smoothstep(1.,3.3,r))*(.5+.5*vn(g*3.+t));
    e=(e+crack*.9)*step(rs,3.);
    vec3 v=mix(vec3(.5,.2,1.),vec3(.95,.85,1.),clamp(e*.3,0.,1.))*e*1.5;
    v+=vec3(.45,.15,.9)*exp(-r*.4)*.3*fbm(g*.9+t*.1)*2.;
    col+=v*gS*fo;
  }
  if(M(1)&&onP){
    float rr=rp/(.98*gS+.001);
    if(rr<1.){
      float sw=a+3.2/(rr+.25)-t*1.1;
      float arms=fbm(vec2(sw*1.3,rr*4.-t*.6));
      float arms2=.5+.5*sin(sw*3.+fbm(vec2(sw,rr*3.))*4.);
      float dens=arms*.6+arms2*.4;
      vec3 cc=mix(vec3(.01,0.,.04),vec3(.35,.1,.9),dens*smoothstep(0.,.6,rr));
      cc+=vec3(.2,.5,1.)*pow(dens,3.)*smoothstep(.2,.8,rr)*1.6;
      float acc=exp(-pow((rr-.17)*9.,2.));
      cc+=mix(vec3(.5,.7,1.),vec3(1.),acc)*acc*(1.2+.8*fbm(vec2(sw*2.,t)));
      cc*=smoothstep(.03,.12,rr)*.9+.1*smoothstep(.0,.05,rr);
      cc+=vec3(.5,.2,1.)*smoothstep(.78,1.,rr)*1.2;
      col=mix(col,cc*fo,1.-smoothstep(.96,1.,rr));
    }
  }
  if(M(2)&&onP){
    float rev=smoothstep(0.,1.4,t)*1.05; float a0=a/TAU+.5; float sv=step(a0,rev);
    float inB=step(1.,rp)*step(rp,1.2); float spk=.09*(1.-abs(fract(a/TAU*16.)-.5)*2.);
    float inS=step(1.2,rp)*step(rp,1.2+spk);
    float body=clamp(inB+inS,0.,1.)*sv*gS;
    vec3 base=vec3(.05,.03,.1)*(.6+.8*fbm(q*6.));
    base+=vec3(.25,.12,.5)*.15*smoothstep(.1,.0,abs(rp-1.1))*0.;
    float e=ring(rp,1.012,.012)*1.2+ring(rp,1.188,.012)*1.2+ring(rp,1.21+spk,.01)*inS*.8;
    e+=runeBand(rp,a+t*.06,1.04,1.16,26.,5.)*1.7;
    vec2 gm=vec2(rp-1.1,(fract(a/TAU*8.+.5)-.5)*TAU/8.*1.1); float gem=1.-smoothstep(.03,.055,length(gm));
    e+=gem*2.2*(.7+.3*sin(t*3.+a*8.));
    col=mix(col,base,body*.95);
    col+=mix(vec3(.55,.25,1.),vec3(.9,.95,1.),clamp(e*.35,0.,1.))*e*body*1.3*fo;
    col+=vec3(.5,.2,1.)*gw(abs(rp-1.1),4.5)*.55*sv*gS*fo;
  }
  if(M(4)&&onP){
    for(int i=0;i<7;i++){
      float sd=float(i)*7.1; float ai=h11(sd)*TAU+t*.15*(h11(sd+1.)-.5);
      float st=floor(t*10.+h11(sd)*20.); float on=step(.3,h11(sd+st*1.3));
      float disp=(vn(vec2(rp*6.,sd+st))-.5)*.9+(vn(vec2(rp*14.,sd*1.3+st))-.5)*.25;
      float d=abs(wrapA(a-ai-disp))*rp*Rp;
      float L=1.5+.8*h11(sd+4.);
      float m=smoothstep(1.1,1.2,rp)*(1.-smoothstep(L-.35,L,rp));
      float bolt=(ln(d,.014)*2.6+gw(d,16.)*.4)*m*on;
      vec3 cb=mix(vec3(.5,.2,1.),vec3(.95,.9,1.),ln(d,.007));
      col+=cb*bolt*gS*fo;
    }
  }
  return col;}

/* ═════ 3. 마법탄 ═════ */
vec3 fxBolt(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  float Hx=boltHx(t),Hy=boltHy(t);
  float al=smoothstep(0.,.25,t)*(1.-smoothstep(2.1,2.4,t));
  bool onP=rd.z<-1e-3; float tp=onP?-ro.z/rd.z:-1.;
  vec3 pp=ro+rd*max(tp,0.); float s=Hx-pp.x,py=pp.y-Hy;
  if(M(1)&&onP){
    float w=s<0.?.34*pow(clamp(1.+s/.62,0.,1.),.65):.34*(1.-smoothstep(0.,1.8,s));
    float n=fbm(vec2(s*4.-t*9.,py*7.));
    float dd=w-abs(py)*(1.+.9*(n-.5));
    float body=smoothstep(0.,.1,dd)*step(-.62,s);
    float hot=smoothstep(.05,.26,dd)*step(-.62,s);
    vec3 cc=mix(vec3(.15,.3,1.),vec3(.6,.35,1.),smoothstep(0.,.14,dd));
    cc=mix(cc,vec3(.85,.95,1.),hot*hot);
    float rim=smoothstep(0.,.05,dd)*(1.-smoothstep(.05,.13,dd));
    vec3 v=cc*body*1.6+vec3(.3,.9,1.)*rim*1.3+vec3(1.)*hot*hot*1.2;
    v+=vec3(.35,.4,1.)*exp(-length(vec2(max(s,0.)*.55,py))*2.6)*.8;
    v+=vec3(.6,.8,1.)*exp(-abs(py)*24.)*exp(-abs(s+.2)*2.2)*.6*(.7+.3*sin(t*30.));
    col+=v*al;
  }
  if(M(2)&&onP&&s>.05&&s<5.4){
    for(int i=0;i<3;i++){
      float fi=float(i); float ph=s*3.4-t*6.+fi*2.094; float amp=.14+.17*smoothstep(0.,2.5,s);
      float yc=amp*sin(ph); float sl=amp*3.4*cos(ph);
      float thick=(.02+.055*abs(cos(ph)))*(1.-s/5.4)*(.8+.4*fbm(vec2(s*2.,fi)));
      float d=abs(py-yc)/sqrt(1.+sl*sl);
      float f=(1.-smoothstep(1.,5.4,s))*smoothstep(0.,.3,s)*(.5+.5*cos(ph));
      vec3 c0=i==0?vec3(.6,.25,1.):(i==1?vec3(.15,.9,1.):vec3(.9,.4,1.));
      vec3 cc=mix(c0,vec3(.9,.95,1.),exp(-s*1.1));
      col+=cc*(ln(d,thick)*1.7+gw(d,22.)*.28)*f*al;
    }
  }
  if(M(4)&&abs(rd.x)>1e-3){
    for(int k=0;k<6;k++){
      float fk=float(k); float xk=Hx-(.9+.62*fk); float tt=(xk-ro.x)/rd.x; if(tt<0.||tt>40.) continue;
      vec3 q=ro+rd*tt-vec3(xk,Hy,0.); float rc=length(q.yz),ang=atan(q.z,q.y); float rr=.46+.075*fk;
      float e=ring(rc,rr,.028)*1.9+ring(rc,rr-.13,.012)*.9;
      e+=runeBand(rc,ang+t*(mod(fk,2.)<1.?1.2:-1.2),rr-.12,rr-.015,17.,fk)*1.5;
      e*=(1.-fk/7.5)*(.5+.5*smoothstep(0.,.6,Hx-xk));
      col+=mix(vec3(.4,.35,1.),vec3(.7,.95,1.),clamp(e*.3,0.,1.))*e*al*1.1;
    }
  }
  return col;}

/* ═════ 4. 폭발 ═════ */
vec3 fxPyro(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  float ag=t-.12; float agp=max(ag,0.);
  float Rf=2.3*(1.-exp(-agp*3.)); float cy=1.2+.55*agp;
  float fi=ag>0.?smoothstep(0.,.1,ag)*(1.-smoothstep(1.2,3.2,ag)):0.;
  float fl=ag>0.?exp(-ag*5.):0.;
  vec3 C=vec3(0,cy,0);
  if(M(8)&&hf&&ag>0.){
    vec2 g=fp.xz; float r=length(g),a=atan(g.y,g.x);
    float Rs=7.5*(1.-exp(-ag*2.4)); float wd=.25+.35*ag;
    float rg=exp(-pow((r-Rs)/wd,2.))*(.5+.9*fbm(vec2(a*5.,ag*3.)+r*.3))*exp(-ag*1.1);
    float dust=fbm(g*.6+vec2(ag*.5,0.))*(1.-smoothstep(Rs-1.5,Rs+.3,r))*exp(-ag*.9);
    float crack=(1.-smoothstep(0.,.04,abs(fbm(g*1.3)-.5)))*exp(-r*.5)*exp(-ag*.8);
    col*=1.-dust*.35;
    col+=vec3(1.,.55,.2)*rg*2.2+vec3(.9,.45,.18)*dust*.55*(.3+fi)+vec3(1.,.4,.08)*crack*1.4+vec3(1.,.4,.1)*exp(-r*.55)*fi*.5;
  }
  if(M(16)&&ag>.2){
    float sa=ag-.2; float Rs=1.5+2.3*(1.-exp(-sa*1.0)); vec3 Cs=vec3(0,2.8+.55*sa,0);
    float fo=smoothstep(0.,.8,sa)*(1.-smoothstep(3.1,3.8,t));
    vec3 oc=ro-Cs; float b=dot(oc,rd),c=dot(oc,oc)-Rs*Rs,disc=b*b-c;
    if(disc>0.){
      float sq=sqrt(disc),tn=max(-b-sq,0.),tf=-b+sq; float dt=(tf-tn)/24.; float T=1.; vec3 acc=vec3(0.);
      float jit=h21(gl_FragCoord.xy);
      for(int i=0;i<24;i++){
        float tt=tn+(float(i)+jit)*dt; vec3 p=ro+rd*tt; float len=length((p-Cs)/Rs);
        float nz=fbm3(p*.9+vec3(0.,-t*.4,0.)+fbm3(p*.5)*1.5);
        float d=clamp((1.-len)*1.3+(nz-.5)*2.1,0.,1.)*fo;
        vec3 sc=vec3(.05,.047,.048)+vec3(1.,.42,.12)*fi*.9*exp(-max(p.y-.4,0.)*.5)*(1.-len*.5)+vec3(.3,.15,.07)*fl;
        acc+=T*sc*d*dt*3.; T*=exp(-d*dt*2.6);
      }
      col=col*T+acc;
    }
  }
  if(M(2)&&ag>0.&&Rf>.05){
    float Rb=Rf*1.4; vec3 oc=ro-C; float b=dot(oc,rd),c=dot(oc,oc)-Rb*Rb,disc=b*b-c;
    if(disc>0.){
      float sq=sqrt(disc),tn=max(-b-sq,0.),tf=-b+sq; float dt=(tf-tn)/30.; float T=1.; vec3 em=vec3(0.);
      float jit=h21(gl_FragCoord.xy+3.);
      for(int i=0;i<30;i++){
        float tt=tn+(float(i)+jit)*dt; vec3 p=ro+rd*tt; vec3 qv=(p-C)/Rf; float len=length(qv);
        vec3 w=p*1.1+vec3(0.,-ag*1.8,0.); w.xz=R2(len*1.4-ag*.8)*w.xz;
        float nz=fbm3(w*1.5+fbm3(w*.8)*1.2);
        float d=clamp((1.-len)*1.25+(nz-.5)*1.8,0.,1.);
        float tmp=d*(.45+.75*(1.-len))*fi*(1.15+.5*fl);
        em+=T*fireRamp(tmp)*d*dt*5.2; T*=exp(-d*dt*3.2);
      }
      col+=em;
    }
  }
  if(M(1)){
    vec3 v=C-ro; float zc=dot(v,uCF);
    if(zc>.1){ vec2 sp=vec2(dot(v,uCR),dot(v,uCU))/zc/uTan; vec2 dd=gp-sp; float d=length(dd);
      float f=fl*1.+.18*fi;
      float fz=1./(1.+d*d*55.)*3.+exp(-abs(dd.y)*26.)*exp(-abs(dd.x)*2.4)*.9+exp(-abs(dd.x)*30.)*exp(-abs(dd.y)*3.)*.45+exp(-d*2.)*.35;
      col+=mix(vec3(1.,.55,.2),vec3(1.,.95,.85),clamp(fz*.3,0.,1.))*fz*f*(ag>-.05?1.:0.);
    }
  }
  return col;}

/* ═════ 5. 발사대 ═════ */
vec3 fxPad(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  float ag=t-.7; float lau=ag>0.?exp(-ag*3.):0.;
  vec3 cB=vec3(.1,.5,1.),cT=vec3(.35,1.,.95),cW=vec3(.9,1.,1.);
  if(M(1)&&hf){
    vec2 g=fp.xz; float r=length(g),a=atan(g.y,g.x); float R=1.75;
    float plate=1.-smoothstep(R-.04,R,r);
    vec3 metal=vec3(.035,.045,.06)*(.7+.6*fbm(g*9.));
    metal*=.75+.25*smoothstep(0.,.03,abs(fract(a/TAU*16.)-.5)*r*.6);
    col=mix(col,metal,plate);
    float pulse=.6+.4*sin(t*4.); float boost=pulse+2.5*lau;
    float e=ring(r,1.68,.03)*step(.12,abs(fract(a/TAU*12.)-.5))*1.4+ring(r,1.45,.014)+ring(r,.9,.012)*.8;
    float cell=floor(a/TAU*28.); float cr=h11(cell*1.9+.3);
    float rad=abs(fract(a/TAU*28.)-.5)*r*TAU/28.;
    e+=ln(rad,.012)*step(.5,cr)*step(.95,r)*step(r,1.4)*.8+ln(abs(r-(1.0+.3*cr)),.012)*step(.4,h11(cell+9.))*.6;
    vec2 q=g; float oct=max(max(abs(q.x),abs(q.y)),(abs(q.x)+abs(q.y))*.7071);
    e+=ln(abs(oct-.55),.016)*1.3;
    e*=plate;
    vec3 v=mix(cB,cT,clamp(e*.4,0.,1.))*e*boost*1.2;
    v+=cB*smoothstep(.55,.0,oct)*.35*boost*plate*(.6+.4*fbm(g*4.-t));
    v+=cB*gw(max(r-R,0.),6.)*.35*boost*(1.-plate*.0);
    col+=v;
  }
  if(M(2)&&ag>0.){
    for(int k=0;k<14;k++){
      float ak=ag-float(k)*.065; if(ak<0.||ak>1.4) continue;
      float h=.1+ak*5.2*(1.-.15*ak); float rr=1.3*(1.-.33*ak)+.06*sin(float(k)*2.1);
      float tt=(h-ro.y)/rd.y; if(tt<0.) continue;
      vec3 p=ro+rd*tt; float r=length(p.xz),a=atan(p.z,p.x);
      float f=(1.-ak/1.4)*smoothstep(0.,.05,ak);
      float e=ring(r,rr,.05)*2.+ring(r,rr*.9,.018)*.9+gw(abs(r-rr),8.)*.3;
      e*=.7+.3*ticks(a+float(k),36.,.3); e+=smoothstep(rr,rr*.4,r)*.1;
      col+=mix(cB,cT,.5+.5*sin(float(k)))*e*f*1.3;
    }
  }
  if(M(4)&&ag>0.){
    float H=6.5; float dxz=dot(rd.xz,rd.xz);
    if(dxz>1e-5){ float tc=-dot(ro.xz,rd.xz)/dxz; vec2 cp=ro.xz+rd.xz*tc; float d=length(cp); float yv=ro.y+rd.y*tc;
      if(tc>0.&&yv>0.&&yv<H){
        float act=smoothstep(0.,.08,ag)*exp(-ag*1.3)*(1.-smoothstep(1.8,2.4,ag));
        float w=.42*(1.+yv*.04); float prof=exp(-pow(d/w,2.));
        float sn=.55+.9*vn(vec2(yv*3.-t*14.,d*5.));
        float bm=prof*sn*(1.-yv/H)*act;
        col+=mix(cB,cW,prof*prof)*bm*2.6+cT*exp(-pow(d/(w*.28),2.))*(1.-yv/H)*act*1.6;
      } }
  }
  if(M(8)&&hf&&ag>0.){
    vec2 g=fp.xz; float r=length(g),a=atan(g.y,g.x);
    float Rs=.8+6.5*(1.-exp(-ag*2.3)); float wd=.3*(1.+ag);
    float rg=exp(-pow((r-Rs)/wd,2.))*(.5+.9*fbm(vec2(a*6.,ag*4.)))*exp(-ag*1.3);
    float rg2=exp(-pow((r-Rs*.72)/(wd*.6),2.))*.5*exp(-ag*1.6);
    col+=mix(cB,cW,clamp(rg,0.,1.))*(rg+rg2)*2.2;
  }
  return col;}

/* ═════ 6. 폭포 ═════ */
vec3 fxTorrent(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  float al=smoothstep(0.,.7,t)*(1.-smoothstep(4.4,5.,t));
  vec3 cD=vec3(.02,.2,.45),cW=vec3(.3,.75,1.),cH=vec3(.92,.98,1.);
  float H=5.6;
  if(M(1)&&abs(rd.z)>1e-3){
    float tp=-ro.z/rd.z;
    if(tp>0.){ vec3 pp=ro+rd*tp; float hw=1.15+.12*sin(pp.y*.9+1.)+.08*vn(vec2(pp.y*2.,t));
      float m=smoothstep(hw,hw-.18,abs(pp.x))*step(0.,pp.y)*step(pp.y,H);
      float fall=pp.y*.5+t*5.5;
      float st=vn(vec2(pp.x*12.,fall*1.3)); st=st*st*(.5+.5*vn(vec2(pp.x*30.,fall*2.6)));
      float bd=fbm(vec2(pp.x*3.,fall*.7));
      vec3 c=mix(cD,cW,bd*.9)+cH*st*1.8;
      c+=cH*smoothstep(.6,1.,vn(vec2(pp.x*9.,fall*.45+3.)))*.9;
      float lip=exp(-pow((pp.y-H)*3.,2.))*1.6; c+=cH*lip;
      float edge=1.-smoothstep(.0,.25,hw-abs(pp.x)); c+=cH*edge*.9;
      float a=(.62+.38*st)*m*al;
      col=mix(col,c,a)+cW*m*.18*al;
    }
  }
  if(M(2)&&hf){
    vec2 g=fp.xz*vec2(1.,1.1)-vec2(0.,.4); float r=length(g),an=atan(g.y,g.x);
    float R=2.7+.15*sin(an*3.+t); float pool=1.-smoothstep(R-.3,R,r);
    float rip=.5+.5*sin(r*11.-t*7.+fbm(g*2.)*3.); rip=pow(rip,3.)*exp(-r*.5);
    float foam=fbm(g*3.+vec2(0.,-t*.8)); foam=smoothstep(.5,.85,foam+exp(-r*1.1)*.6)*exp(-r*.55);
    float sp=exp(-pow(r*.9,2.))*(.6+.4*sin(t*9.));
    vec3 pc=mix(cD*1.2,cW*.55,fbm(g*1.5+t*.2))+cW*rip*.9+cH*foam*1.5+cH*sp*.9;
    col=mix(col,pc,pool*al)+cW*gw(max(r-R,0.),5.)*.3*al;
  }
  if(M(8)&&abs(rd.z)>1e-3){
    float tp=(.35-ro.z)/rd.z;
    if(tp>0.){ vec3 pp=ro+rd*tp; float d=fbm(vec2(pp.x*.7,pp.y*.6-t*.25)+fbm(vec2(pp.x*.5+t*.1,pp.y*.4))*1.4);
      float dens=smoothstep(.4,.9,d)*exp(-max(pp.y,0.)*.55)*smoothstep(3.6,.2,abs(pp.x))*step(0.,pp.y);
      col+=mix(cW,cH,.5)*dens*.7*al; }
  }
  return col;}

/* ═════ 7. 번개 버프 ═════ */
vec3 fxBuff(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  float al=smoothstep(0.,.5,t)*(1.-smoothstep(3.5,4.,t));
  vec3 cB=vec3(.25,.5,1.),cH=vec3(.9,.95,1.),cV=vec3(.6,.35,1.);
  float R=1.1,Hc=3.2;
  if(M(1)&&hf){
    vec2 g=fp.xz; float r=length(g),a=atan(g.y,g.x); float sp=.2+.8*smoothstep(0.,.7,t); float rs=r/sp;
    float e=ring(rs,2.5,.03)*1.2+ring(rs,2.2,.012)+ring(rs,1.25,.02)*.9;
    e+=runeBand(rs,a+t*.15,1.35,1.75,24.,7.)*1.4+runeBand(rs,a-t*.2,2.26,2.46,34.,8.)*1.2;
    e+=ln(abs(sdStar(R2(t*.3)*g/sp,2.05,8,3.5)),.026)*1.1;
    e*=step(rs,2.7);
    float fl=.75+.25*sin(t*17.)*vn(vec2(t*6.,1.));
    col+=mix(cB,cH,clamp(e*.3,0.,1.))*e*1.5*al*fl+cB*exp(-r*.7)*.5*al*fl;
  }
  if(M(8)&&hf){
    vec2 g=fp.xz; float r=length(g),a=atan(g.y,g.x); float s=0.;
    for(int i=0;i<3;i++){ float age=mod(t-float(i)*1.2,3.6); float rad=age*3.3; float wd=.08+age*.05;
      s+=exp(-pow((r-rad)/wd,2.))*(.6+.6*fbm(vec2(a*5.,age*2.)))*exp(-age*.9); }
    col+=mix(cB,cH,clamp(s*.5,0.,1.))*s*1.6*al;
  }
  if(M(2)){
    float a2=dot(rd.xz,rd.xz); float b=dot(ro.xz,rd.xz),c=dot(ro.xz,ro.xz)-R*R,disc=b*b-a2*c;
    if(disc>0.&&a2>1e-6){ float sq=sqrt(disc);
      for(int k=0;k<2;k++){
        float tt=(k==0?-b-sq:-b+sq)/a2; if(tt<0.) continue;
        vec3 p=ro+rd*tt; if(p.y<0.||p.y>Hc) continue;
        vec3 n=vec3(p.x,0.,p.z)/R; float fr=k==0?1.:.45;
        float ndv=abs(dot(n,rd)); float fres=pow(1.-ndv,2.);
        float ang=atan(p.z,p.x); float y=p.y;
        float env=exp(-y*.35)*(1.-smoothstep(Hc*.75,Hc,y));
        float sh=fbm3(vec3(ang*1.5,y*1.8-t*2.5,t*.5));
        vec3 v=cB*(.1+.9*fres)*(.4+sh)*env*1.1;
        float b2=0.;
        for(int i=0;i<7;i++){
          float fi=float(i); float st=floor(t*13.+fi*1.3);
          float on=step(.2,h11(fi*3.1+st*1.7));
          float ai=h11(fi*5.3)*TAU+y*(h11(fi+9.)-.5)*3.+t*(h11(fi+4.)-.5)*2.;
          float disp=(vn(vec2(y*4.,fi*3.+st))-.5)*1.1+(vn(vec2(y*13.,st+fi))-.5)*.3;
          float d=abs(wrapA(ang-ai-disp))*R;
          float f=1.-smoothstep(Hc*.6,Hc,y+h11(fi)*.6);
          b2+=(ln(d,.018)*2.4+gw(d,13.)*.4)*on*f;
        }
        v+=mix(cB,cH,clamp(b2*.4,0.,1.))*b2*1.5+cV*b2*.15;
        col+=v*fr*al;
      }
    }
  }
  return col;}

/* ═════ 8. 속성×패턴 계열 ═════ */
// 타격 한 점: 섬광(bc)·방사 가시(br)·충격 고리(bg). q=점 기준 좌표, a=경과, sc=크기
vec3 famHit(vec2 q,float a,float sc,bool bc,bool br,bool bg){
  vec3 Dd=EL_D[uElem],Mm=EL_M[uElem],Hh=EL_H[uElem]; float tb=EL_T[uElem];
  vec3 o=vec3(0.); if(a<0.||a>1.4) return o;
  float r=length(q)/sc, an=atan(q.y,q.x);
  if(bc){ o+=mix(Mm,Hh,.7)*(gw(r,3.)*2.2+gw(r,12.)*3.5)*exp(-a*8.); }
  if(br){
    float ang=an+(vn(vec2(an*2.5+3.,a*18.))-.5)*tb*1.1;
    float rays=pow(abs(cos(ang*7.)),14.)*.9+pow(abs(cos(ang*3.+1.)),30.)*.7;
    if(uElem==2){ // 번개: 가지가 거리에 따라 꺾이고 갈라진다(고주파 흔들림 + 불규칙 5갈래)
      float ja=an+(vn(vec2(r*5.5+a*40.,an*2.))-.5)*1.1*smoothstep(0.,2.,r*2.);
      rays=pow(abs(cos(ja*2.5+1.)),16.)*2.4+pow(abs(cos(ja*5.5)),30.)*1.6; }
    else if(uElem==1){ // 얼음: 6각 결정 가시 + 가시 위의 곁가지
      float s6=pow(abs(cos(an*3.)),60.); float side=pow(abs(cos(an*3.)),6.)*step(.5,fract(r*2.2))*.0;
      float br2=pow(abs(cos((an+sin(r*7.)*.0)*6.)),90.)*smoothstep(.5,2.,r)*.7;
      rays=s6*1.4+br2+pow(abs(cos(an*3.+1.57)),120.)*.5; }
    float len=.4+a*7.; float fall=smoothstep(len,len*.25,r)*step(.04,r);
    o+=mix(Mm,Hh,smoothstep(len,0.,r))*rays*fall*exp(-a*4.5)*2.2; }
  if(bg){
    float R=a*4.8, w=.06+a*.35; float g=exp(-pow((r-R)/w,2.));
    float n=1.+tb*(fbm(vec2(an*3.,a*3.))-.5)*1.4;
    o+=(Mm*g*n+Hh*g*g*.4)*exp(-a*3.2)*1.4; }
  return o; }

vec3 fxFam(vec3 ro,vec3 rd,float t,bool hf,vec3 fp,vec3 col){
  vec3 Dd=EL_D[uElem],Mm=EL_M[uElem],Hh=EL_H[uElem]; float tb=EL_T[uElem];
  if(uPat==5){
    float al=smoothstep(0.,.5,t)*(1.-smoothstep(2.7,3.2,t));
    if(M(1)&&hf){
      vec2 g=fp.xz; float r=length(g),an=atan(g.y,g.x); float sp=.25+.75*smoothstep(0.,.8,t);
      float e=ring(r,2.1*sp,.04)*1.1+ring(r,1.5*sp,.025)+runeBand(r,an+t*.2,1.55*sp,2.0*sp,22.,3.)*1.3;
      e*=step(r,2.2*sp+.05);
      col+=mix(Mm,Hh,clamp(e*.3,0.,1.))*e*1.4*al+Mm*exp(-r*.8)*.5*al; }
    if(abs(rd.z)>1e-3){
      float tp=-ro.z/rd.z;
      if(tp>0.){ vec3 pp=ro+rd*tp; float Hc=3.8;
        if(M(2)){
          float w=1.*(1.-.35*pp.y/Hc)+.1*vn(vec2(pp.y*2.,t*3.));
          float m=smoothstep(w,w*.3,abs(pp.x))*step(0.,pp.y)*(1.-smoothstep(Hc*.55,Hc,pp.y));
          float fl=fbm(vec2(pp.x*2.5,pp.y*1.3-t*(2.5+tb*2.)));
          float st=smoothstep(.62,.9,vn(vec2(pp.x*7.+floor(t*10.*tb)*3.,pp.y*.6-t*4.)));
          col+=(mix(Dd,Mm,clamp(fl*1.5,0.,1.))*(.5+fl)+Hh*st*.9)*m*al*1.3; }
        if(uVar==8&&M(1)){ vec2 c=vec2(pp.x,pp.y-2.4); float r=length(c),an=atan(c.y,c.x);
          float e=ring(r,1.25,.03)+ring(r,.9,.02)+runeBand(r,an-t*.6,.95,1.2,16.,3.)*1.2+ln(abs(sin(an*3.+t)*r-.0),.0)*0.;
          col+=mix(Mm,Hh,.4)*e*1.3*al*step(r,1.35); }
        if(M(8)){
          float s=0.; for(int i=0;i<3;i++){ float yk=mod(t*1.6+float(i)*1.2,3.6); s+=exp(-pow((pp.y-yk)*6.,2.))*(1.-yk/3.6); }
          col+=Mm*s*smoothstep(1.1,.3,abs(pp.x))*step(0.,pp.y)*al*1.1; }
      } }
    return col; }
  if(uPat==7){ // 예고 그래픽: 바닥에 깔리는 위험 범위. 차오르다가 t=1.2에 터진다.
    if(!hf) return col;
    vec2 g=fp.xz; float p=clamp(t/1.2,0.,1.); float r=length(g),an=atan(g.y,g.x);
    float go=t<1.2?1.:exp(-(t-1.2)*5.); float fl=t>1.2?exp(-(t-1.2)*7.):0.;
    float pu=.7+.3*sin(t*18.)*(1.-p); // 시간이 갈수록 깜빡임이 멎고 선명해진다
    if(M(1)){ float R=3.4,HA=.65; float inC=step(abs(an),HA)*step(r,R);
      float d=min(abs(abs(an)-HA)*r+(r>R?9.:0.),abs(r-R)+(abs(an)>HA?9.:0.)); float edge=ln(d,.035);
      float flow=smoothstep(.35,.8,sin(r*9.-t*9.)*.5+.5)*(.6+.4*vn(vec2(r*3.,an*4.)));
      float Rf=p*R; float fill=step(r,Rf)*inC; float front=ln(abs(r-Rf),.05)*inC;
      col+=(Dd*inC*.35+Mm*flow*inC*.35*(1.-fill*.5)+Mm*fill*.55+Hh*front*1.6+mix(Mm,Hh,.5)*edge*1.3)*go*pu;
      col+=Hh*inC*fl*2.2; }
    if(M(2)){ float L=5.2; float x=g.x; float w=.42*(1.-x/L); float in_=step(0.,x)*step(x,L)*step(abs(g.y),w);
      float eg=ln(abs(abs(g.y)-w),.03)*step(0.,x)*step(x,L)+ln(abs(x-L*.0),.03)*step(abs(g.y),.42);
      float sw=smoothstep(.0,.25,p*L-x)*in_; float lead=ln(abs(x-p*L),.06)*in_;
      col+=(Dd*in_*.3+Mm*sw*.6+Hh*lead*1.8+Mm*eg*.9)*go*pu; col+=Hh*in_*fl*2.; }
    if(M(8)){ float rr=abs(r-(.4+(t-1.2)*9.)); col+=(t>1.2?Hh*ln(rr,.09)*exp(-(t-1.2)*4.)*1.6:vec3(0.)); }
    return col; }
  if(abs(rd.z)<1e-4) return col;
  float tp=-ro.z/rd.z; if(tp<0.) return col;
  vec3 pp=ro+rd*tp; vec2 q=pp.xy-vec2(0.,1.5);
  if(uPat==0){ float a=t-.15;
    col+=famHit(q,a,1.,M(1),M(2),M(8)); }
  else if(uPat==1||uPat==2){
    if(uPat==1){
      bool ax=uVar==1; vec2 qr=R2(ax?.95:.55)*q; vec2 qq=qr-vec2(0.,-1.4); float r=length(qq),th=atan(qq.x,qq.y);
      float R0=ax?3.0:2.5, th0=-1.25, th1=1.25;
      float u=clamp(t/.3,0.,1.); u=1.-pow(1.-u,2.5); float thh=mix(th0,th1,u);
      float s=(thh-th)/(th1-th0); float inb=step(0.,s)*step(s,1.);
      float fade=exp(-max(t-.3,0.)*5.);
      if(M(1)){
        float wd=(ax?.95:.55)*pow(max(1.-s,0.),.8)*smoothstep(0.,.04,s)+.001;
        float d=(r-R0)/wd+(fbm(vec2(th*6.,r*3.-t*4.))-.5)*tb*1.1;
        float body=1.-smoothstep(.5,1.,abs(d)); float core=pow(max(1.-abs(d),0.),2.);
        col+=(mix(Mm,Hh,core*core)*body*1.9+Dd*body*.6)*(1.-s*.85)*fade*inb; }
      if(M(2)){
        float L=0.; for(int i=0;i<3;i++){ float off=i==0?-.6:(i==1?.55:.9); float sd2=s*(i==1?1.3:1.)+.08*float(i);
          L+=ln(abs(r-(R0+off)),.02+.02*sd2)*pow(max(1.-sd2,0.),2.)*step(0.,s)*step(sd2,1.); }
        col+=mix(Mm,Hh,.5)*L*fade*1.1; }
      if(M(8)){ vec2 e=vec2(sin(th1),cos(th1))*R0+vec2(0.,-1.4); col+=famHit(qr-e,t-.3,.6,true,false,true); }
    } else {
      float SL=uVar==3?6.5:(uVar==2?2.4:4.2); float SW=uVar==3?.09:(uVar==2?.2:.16);
      float xh=mix(-4.5,1.2,clamp(t/.12,0.,1.)); float fade=exp(-max(t-.12,0.)*9.);
      if(M(1)){ float L=xh-q.x; float m=step(0.,L)*step(L,SL);
        float w=SW*(1.-L/SL)+.004; float d=abs(q.y-(vn(vec2(q.x*3.,t*20.))-.5)*.06*tb);
        float core=1.-smoothstep(0.,w,d); col+=(mix(Mm,Hh,core)*core*2.2+Mm*gw(d,9.)*.5)*m*(1.-L/SL)*fade; }
      if(M(2)){ float L=xh-q.x; float m=step(0.,L)*step(L,SL); float d=min(abs(q.y-.3),abs(q.y+.25));
        col+=Mm*ln(d,.012)*m*(1.-L/SL)*.8*fade; }
      if(M(8)) col+=famHit(q-vec2(1.2,0.),t-.12,.8,true,true,true);
    } }
  else if(uPat==3){ float a=t-.15; vec2 c=vec2(0.,-1.2);
    if(M(1)){ col+=famHit(q-c,a,.8,true,true,false);
      if(a>0.){ float ht=min(a*7.,3.4); float w=(.9+a*1.2); float m=smoothstep(w,.2,abs(q.x-c.x))*step(0.,q.y-c.y)*smoothstep(ht,ht*.4,q.y-c.y);
        float dn=fbm(vec2(q.x*2.5,q.y*1.5-a*3.)); col+=mix(Dd,Mm,dn)*dn*m*exp(-a*1.6)*1.3; } }
    if(M(2)&&hf&&a>0.){ float r=length(fp.xz); float R=a*6.5; float g=exp(-pow((r-R)/(.12+a*.3),2.));
      col+=(Mm*g*1.6+Hh*g*g*.5)*exp(-a*2.5)+Dd*smoothstep(R,R*.3,r)*exp(-a*3.)*.6; }
    if(M(8)&&hf&&a>0.){ float r=length(fp.xz); float R=a*5.5; float cr=ln(abs(fbm(fp.xz*2.5)-.5),.03);
      col+=mix(Mm,Hh,.4)*cr*smoothstep(R+.2,R-.3,r)*smoothstep(.15,.5,r)*exp(-max(a-.5,0.)*2.)*1.4; } }
  else if(uPat==4){ float tb0=.8; float r=length(q);
    float hx=hexD(q/1.3);
    if(M(1)&&t<tb0){ float m=1.-smoothstep(1.,1.04,hx);
      float ridge=abs(fbm(q*2.2+3.)-.5); float grow=smoothstep(.15,.7,t);
      float crack=ln(ridge,.035)*smoothstep(grow*1.6,grow*1.6-.5,r)*grow*(1.+3.*smoothstep(.45,.8,t));
      vec3 base=Dd*(.5-.25*r/1.3)+Mm*.12*fbm(q*3.)+Mm*ln(abs(hx-1.),.06)*.8*(.5+.5*t);
      float jit=(t>.6)?(vn(vec2(t*60.,1.))-.5)*.04:0.; col=mix(col,base,m)+Mm*crack*m*1.8+Hh*crack*crack*m*.8+vec3(jit); }
    float a=t-tb0;
    if(M(2)&&a>0.) col+=famHit(q,a,1.5,true,true,true);
    if(M(8)&&a>0.){ float R=.8+a*2.6; float dn=fbm(q*1.6-vec2(0.,a*.4)+a*.7); col+=mix(Dd,Mm,.3)*dn*smoothstep(R,R*.3,r)*exp(-a*1.6)*.9; } }
  else { // 투사체
    float hs=1.,TL=5.,tw=.28; bool lin=false; float v=float(uVar);
    if(uVar==4){hs=1.8;TL=3.;tw=.4;} else if(uVar==5){hs=.8;TL=4.;} else if(uVar==6){hs=.5;TL=7.;tw=.07;lin=true;}
    else if(uVar==7){hs=.4;TL=8.;tw=.05;lin=true;} else if(uVar==9){hs=1.2;TL=3.;tw=.14;}
    float u=clamp(t/1.,0.,1.); u=lin?u:u*u*(3.-2.*u); if(uVar==4) u=u*u;
    float hy=uVar==9?.15+1.6*sin(u*PI):.15*sin(t*7.);
    vec2 hd=vec2(mix(-5.,3.2,u),hy); float sh=t<1.?1.:exp(-(t-1.)*12.);
    float L=hd.x-q.x; float r=length(q-hd); float rr=r/hs;
    if(M(1)){ float hv=(gw(rr,4.)*1.6+gw(rr,16.)*3.)+Hh.r*0.;
      if(uVar==9){ vec2 dq=q-hd; float an=atan(dq.y,dq.x)+t*30.; float sr=length(dq)/(.2*hs*(1.+.6*cos(4.*an))); hv+=smoothstep(1.,.6,sr)*2.5; }
      if(uVar==4){ float rg=abs(rr-.55-.08*sin(t*14.)); hv+=ln(rg,.03)*1.6; }
      if(lin) hv+=ln(abs(q.y-hd.y),.015)*step(abs(q.x-hd.x),.6)*3.;
      col+=(mix(Mm,Hh,.6)*hv+Hh*ln(rr,.25)*.8)*sh; }
    if(M(2)){ float m=step(0.,L)*step(L,TL)*(t<1.?1.:sh); float w=tw*(1.-L/TL)+.03*hs*.5; float yy=q.y-(uVar==9?mix(.15+1.6*sin(clamp((q.x+5.)/8.2,0.,1.)*PI),hd.y,.0):hd.y)-(fbm(vec2(q.x*1.2-t*3.,3.))-.5)*tb*.5*(lin?.1:1.);
      float d=abs(yy)/w; float body=1.-smoothstep(.2,1.,d); float fl=fbm(vec2(q.x*3.+t*6.,q.y*3.));
      col+=(mix(Dd,Mm,fl*1.5)*body*(.6+fl)+Hh*pow(max(1.-d,0.),3.)*.9)*m*(1.-L/TL)*1.4; }
    if(M(8)) col+=famHit(q-vec2(3.2,0.),t-1.,uVar==7?1.5:(uVar==6?.7:1.),true,true,true); }
  return col; }

void main(){
  vec2 p=(gl_FragCoord.xy*2.-uRes)/uRes.y; gp=p;
  vec3 ro=uCP; vec3 rd=normalize(uCF+uTan*(p.x*uCR+p.y*uCU));
  float t=uT; vec3 lp,lc; lightFor(t,lp,lc);
  vec3 col;
  if(uBg>1.5) col=vec3(0.);
  else if(uBg>.5) col=mix(vec3(.30,.31,.33),vec3(.15,.16,.18),clamp(length(p)*.75,0.,1.));
  else col=envColor(ro,rd,lp,lc);
  float tf=rd.y<-1e-4?-ro.y/rd.y:-1.; bool hf=tf>0.; vec3 fp=ro+rd*max(tf,0.);
  if(uFx==0) col=fxShield(ro,rd,t,hf,fp,col);
  else if(uFx==1) col=fxPortal(ro,rd,t,hf,fp,col);
  else if(uFx==2) col=fxBolt(ro,rd,t,hf,fp,col);
  else if(uFx==3) col=fxPyro(ro,rd,t,hf,fp,col);
  else if(uFx==4) col=fxPad(ro,rd,t,hf,fp,col);
  else if(uFx==5) col=fxTorrent(ro,rd,t,hf,fp,col);
  else if(uFx==6) col=fxBuff(ro,rd,t,hf,fp,col);
  else col=fxFam(ro,rd,t,hf,fp,col);
  oC=vec4(col,1.);
}`;

  /* ───────────── 입자 셰이더 (상태 없이 시간만으로 위치 계산) ───────────── */
  const VS_PART = `#version 300 es
precision highp float;
uniform mat4 uVP; uniform float uT,uPx; uniform int uFx,uMask,uPass,uElem,uPat,uVar;
const vec3 PM[9]=vec3[9](vec3(1.,.4,.05),vec3(.4,.8,1.),vec3(.55,.7,1.),vec3(.4,.9,.2),vec3(.5,.15,.8),vec3(1.,.85,.35),vec3(.7,.4,1.),vec3(.5,.95,.8),vec3(.8,.85,.95));
const vec3 PH[9]=vec3[9](vec3(1.,.9,.55),vec3(.9,1.,1.),vec3(1.),vec3(.85,1.,.5),vec3(.95,.6,1.),vec3(1.,1.,.9),vec3(1.,.9,1.),vec3(.95,1.,.97),vec3(1.));
out vec4 vC; out float vK; out float vS;
#define TAU 6.2831853
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float boltHx(float t){float u=clamp((t-.15)/1.9,0.,1.);return -5.2+10.*u;}
float boltHy(float t){return 1.5+.1*sin(t*2.8);}
mat2 R2(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
  float fid=float(gl_VertexID); float t=uT;
  float sd=h11(fid*.713+1.7),s2=h11(fid*1.91+3.1),s3=h11(fid*2.77+5.3),s4=h11(fid*3.37+7.7);
  vec3 pos=vec3(0.); float size=0.,al=0.,kind=0.; vec3 col=vec3(1.);
  if(uFx==0&&(uMask&4)!=0&&uPass==0){
    float env=smoothstep(0.,1.,t)*(1.-smoothstep(4.3,5.,t));
    float rad=2.7*sqrt(s2); float ang=sd*TAU+sin(t*.4+s3*9.)*.5;
    float y=mod(s3*2.8+t*(.12+.25*s4),2.8)+.1;
    pos=vec3(rad*cos(ang)+.15*sin(t*.7+sd*20.),y,rad*sin(ang)+.15*cos(t*.6+s2*20.));
    float l=length(pos); if(l>2.75) pos*=2.75/l;
    col=mix(vec3(.4,.85,1.),vec3(1.,.5,.15),step(.86,s4));
    size=.03+.05*s4*s4; al=(.5+.5*sin(t*3.+sd*40.))*env; kind=s4>.7?1.:0.;
  }
  else if(uFx==1&&(uMask&8)!=0&&uPass==0){
    float env=smoothstep(0.,1.2,t)*(1.-smoothstep(4.3,5.,t));
    if(fid<200.){
      float ph=fract(t*.16*(.6+s2)+s3); float rad=3.3*pow(1.-ph,1.4)+.08;
      float ang=sd*TAU+ph*(5.+3.*s2);
      pos=vec3(0,2.,0)+vec3(rad*cos(ang),rad*sin(ang)*.85,(s4-.5)*1.3*rad);
      col=mix(vec3(.6,.3,1.),mix(vec3(.3,.8,1.),vec3(1.),s4),step(.6,s3));
      size=(.025+.04*s4)*(.4+rad*.4); al=smoothstep(0.,.1,ph)*(1.-smoothstep(.9,1.,ph))*env; kind=s4>.75?1.:0.;
    } else {
      float ph=fract(t*(.12+.2*s2)+s3); float r=1.1+1.9*sqrt(s4); float ang=sd*TAU;
      pos=vec3(r*cos(ang),ph*2.8,r*sin(ang)); col=vec3(.55,.3,1.);
      size=.03+.03*s2; al=sin(ph*3.1416)*.9*env; kind=s2>.8?1.:0.;
    }
  }
  else if(uFx==2&&(uMask&8)!=0&&uPass==0){
    float ph=fract(t/1.3+s2); float age=ph*1.3; float tb=t-age;
    if(tb>.18&&tb<2.05){
      vec3 off=vec3(s3-.5,s4-.5,sd-.5)*(.3+age*1.2);
      pos=vec3(boltHx(tb),boltHy(tb),0.)+off+vec3(0.,-.25*age*age,0.);
      col=mix(vec3(.6,.4,1.),mix(vec3(.4,.9,1.),vec3(1.),s4),step(.5,s3));
      float al0=smoothstep(0.,.15,age)*(1.-age/1.3);
      size=(.02+.04*s4)*(.6+.8*(1.-age/1.3)); al=al0*(.6+.4*sin(t*20.+sd*60.))*smoothstep(0.,.25,t)*(1.-smoothstep(2.1,2.4,t)); kind=s3>.65?1.:0.;
    }
  }
  else if(uFx==3&&(uMask&4)!=0){
    float a0=t-.12;
    if(uPass==0){
      float gid=floor(fid/4.),lag=mod(fid,4.)*.022;
      float g1=h11(gid*1.31+.5),g2=h11(gid*2.17+1.5),g3=h11(gid*3.71+2.5),g4=h11(gid*5.13+4.5);
      if(fid<360.){
        float a=a0-lag-g4*.08; float life=.9+g1*1.3;
        if(a>0.&&a<life){
          float th=g2*TAU; float el=acos(1.-g3*.95);
          vec3 dir=normalize(vec3(sin(el)*cos(th),cos(el)*.9+.2,sin(el)*sin(th)));
          float sp=5.+13.*g1*g1+5.*g4; vec3 v=dir*sp;
          float k=1.2; pos=vec3(0.,.8,0.)+v*(1.-exp(-k*a))/k; pos.y-=3.4*a*a;
          if(pos.y<0.) pos.y=-pos.y*.25;
          float lf=a/life; col=mix(vec3(1.,.95,.7),mix(vec3(1.,.5,.1),vec3(.7,.1,0.),lf),smoothstep(0.,.35,lf));
          al=(1.-lf*lf)*(1.-lag*10.); size=.05*(1.-.5*lf);
        }
      } else {
        float a=a0-.35-g1*1.4; float life=1.8+g2;
        if(a>0.&&a<life){
          float ang=g3*TAU; float r=.5+g4*3.5; float lf=a/life;
          pos=vec3(r*cos(ang)+sin(a*2.+g1*9.)*.3,.4+a*(.8+g2)*1.1,r*sin(ang)+cos(a*1.7+g3*9.)*.3);
          col=mix(vec3(1.,.6,.2),vec3(.8,.15,0.),lf); al=(1.-lf)*smoothstep(0.,.2,a)*(.6+.4*sin(t*18.+g1*50.)); size=.03+.03*g4;
        }
      }
    } else if(fid<40.){
      float g1=h11(fid*1.31+.5),g2=h11(fid*2.17+1.5),g3=h11(fid*3.71+2.5);
      float a=a0; if(a>0.&&a<2.6){
        float th=g2*TAU; vec3 dir=normalize(vec3(cos(th),.9+g3*.6,sin(th))); float sp=3.5+7.*g1;
        vec3 v=dir*sp*vec3(1.,1.,1.); float T=(v.y+sqrt(v.y*v.y+4.*4.9*.6))/9.8; float ae=min(a,T);
        pos=vec3(v.x*ae*.8,.6+v.y*ae-4.9*ae*ae,v.z*ae*.8); pos.y=max(pos.y,.1);
        col=vec3(1.,.45,.1)*(exp(-a*1.1)+.12); size=.1+.2*g3; al=1.-smoothstep(1.9,2.6,a);
      }
    }
  }
  else if(uFx==4&&(uMask&4)!=0&&uPass==0){
    float ag=t-.7;
    if(fid<240.){
      float gid=floor(fid/4.),lag=mod(fid,4.)*.02;
      float g1=h11(gid*1.31+.5),g2=h11(gid*2.17+1.5),g3=h11(gid*3.71+2.5),g4=h11(gid*5.13+4.5);
      float a=ag-lag-g4*.35; float life=.7+g1*1.1;
      if(a>0.&&a<life){
        float th=g2*TAU; float r=.1+g3*.9;
        vec3 v=vec3(cos(th)*.9,7.+11.*g1,sin(th)*.9);
        pos=vec3(cos(th)*r,.05,sin(th)*r)+v*a-vec3(0.,1.5*a*a,0.);
        pos.xz=R2(a*2.5)*pos.xz;
        float lf=a/life; col=mix(vec3(.3,.9,1.),vec3(1.),exp(-a*3.)); al=(1.-lf)*(1.-lag*10.); size=.045*(1.-.5*lf);
      }
    } else {
      float ph=fract(t*(.15+.2*s4)+s2); float r=sqrt(s3)*1.6; float ang=sd*TAU;
      pos=vec3(cos(ang)*r,ph*3.,sin(ang)*r); col=vec3(.3,.8,1.); size=.03; al=sin(ph*3.1416)*.55; kind=s4>.8?1.:0.;
    }
  }
  else if(uFx==5&&(uMask&4)!=0&&uPass==0){
    float env=smoothstep(0.,.7,t)*(1.-smoothstep(4.4,5.,t));
    float gid=floor(fid/3.); float lag=mod(fid,3.)*.03;
    float g1=h11(gid*1.31+.5),g2=h11(gid*2.17+1.5),g3=h11(gid*3.71+2.5);
    float per=.9+g1*.9; float a=mod(t-lag+g2*per*3.,per); float lf=a/per;
    float th=g3*TAU; float sp=1.2+3.2*g1;
    vec3 v=vec3(cos(th)*sp,2.5+3.8*g2,sin(th)*sp*.6);
    pos=vec3(cos(th)*.4*g1,.15,sin(th)*.3)+v*a-vec3(0.,4.9*a*a,0.);
    if(pos.y>.05){ col=mix(vec3(.5,.85,1.),vec3(1.),g3); size=.03+.03*g2; al=(1.-lf)*env*.9; }
  }
  else if(uFx==6&&(uMask&4)!=0&&uPass==0){
    float env=smoothstep(0.,.6,t)*(1.-smoothstep(3.5,4.,t));
    float ph=fract(t*(.28+.4*s4)+s2); float ang=sd*TAU+ph*(3.+4.*s3); float r=1.25*(.7+.5*s3)*(1.-.25*ph);
    pos=vec3(r*cos(ang),ph*3.6,r*sin(ang));
    col=mix(vec3(.4,.6,1.),vec3(1.),s4); size=.025+.035*s4; al=sin(ph*3.1416)*env*(.6+.4*sin(t*25.+sd*60.)); kind=s4>.72?1.:0.;
  }
  else if(uFx==7){
    vec3 cm=PM[uElem], ch=PH[uElem]; float g1=sd,g2=s2,g3=s3,g4=s4;
    if(uPass==0&&(uMask&4)!=0){
      if(uPat==5){
        float env=smoothstep(0.,.6,t)*(1.-smoothstep(2.8,3.2,t));
        float ph=fract(t*(.3+.4*g4)+g2); float ang=sd*TAU+ph*3.; float r=(1.6*sqrt(g3)+.2)*(1.-.3*ph);
        pos=vec3(r*cos(ang),ph*3.6,r*sin(ang)*.5); col=mix(cm,ch,g4); size=.03+.04*g4; al=sin(ph*3.1416)*env; kind=g4>.75?1.:0.;
      } else {
        vec3 o=vec3(0.,1.5,0.); float a0=t-.15; float sp0=1.;
        if(uPat==1){ float th=-1.25+2.5*g1; o=vec3(sin(th)*2.2,.1+cos(th)*2.5,0.); a0=t-.3*(th+1.25)/2.5; }
        else if(uPat==2){ o=vec3(1.2,1.5,0.); a0=t-.12; }
        else if(uPat==3){ o=vec3(0.,.3,0.); a0=t-.15; }
        else if(uPat==4){ a0=t-.8; sp0=1.4; }
        else if(uPat==7){ o=vec3(1.5*g3,.05,(g4-.5)*2.); a0=t-1.2; sp0=.6; }
        else if(uPat==6){ o=vec3(3.2,1.5,0.); a0=t-1.; sp0=uVar==7?1.4:(uVar==6?.7:(uVar==5?.85:1.)); }
        if(uPat==2&&uVar==3) o.x=1.2;
        float lag=g4*.06; float a=a0-lag; float life=.5+g2*.9;
        if(a>0.&&a<life){
          float th=g3*TAU; float el=acos(1.-2.*g1);
          vec3 dir=vec3(sin(el)*cos(th),sin(el)*sin(th),cos(el)*.6);
          if(uPat==3) dir=normalize(vec3(dir.x*1.4,abs(dir.y)+.2,dir.z));
          if(uPat==2||uPat==6) dir=normalize(vec3(dir.x*.45+abs(dir.x)*.9+.6,dir.y*.7,dir.z*.5));
          float sp=(2.5+7.*g2*g2)*sp0; float k=1.6;
          pos=o+dir*sp*(1.-exp(-k*a))/k; pos.y-=2.2*a*a;
          float lf=a/life; col=mix(ch,cm,smoothstep(0.,.5,lf)); al=(1.-lf*lf); size=.04*(1.-.5*lf)+.01; kind=g4>.8?1.:0.;
          if(pos.y<0.05&&uPat==3) pos.y=.05;
        }
      }
    } else if(uPass==1&&(uMask&16)!=0&&(uPat==3||uPat==4)){
      float a0=(uPat==3)?t-.15:t-.8; float a=a0; float life=1.6+g2*.6;
      if(a>0.&&a<life){
        float th=g3*TAU; vec3 dir=normalize(vec3(cos(th),.5+g1*1.1,(g4-.5)*.8));
        float sp=(uPat==3)?2.5+5.*g2:3.+7.*g2; vec3 o=(uPat==3)?vec3(0.,.3,0.):vec3(0.,1.5,0.);
        vec3 v=dir*sp; float T=(v.y+sqrt(v.y*v.y+4.*4.9*(o.y-.05)))/9.8; float ae=min(a,max(T,.01));
        pos=o+vec3(v.x*ae,v.y*ae-4.9*ae*ae,v.z*ae); pos.y=max(pos.y,.05);
        col=cm*.7; size=.12+.2*g1; al=1.-smoothstep(life-.5,life,a); kind=0.;
      }
    }
  }
  if(al<=.001){ gl_Position=vec4(2.,2.,2.,1.); gl_PointSize=0.; vC=vec4(0.); vK=0.; vS=0.; return; }
  vec4 cp=uVP*vec4(pos,1.); gl_Position=cp;
  float sz=size*(kind>.5?3.2:1.); gl_PointSize=clamp(sz*uPx/cp.w,1.,256.);
  vC=vec4(col,al); vK=kind; vS=sd;
}`;

  const FS_PART = `#version 300 es
precision highp float;
precision highp int;
in vec4 vC; in float vK; in float vS; uniform int uPass; out vec4 oC;
void main(){
  vec2 u=gl_PointCoord*2.-1.; float r2=dot(u,u);
  if(uPass==1){
    float a=atan(u.y,u.x)+vS*20.; float rad=.72+.2*sin(a*3.+vS*9.)+.12*sin(a*5.+vS*3.);
    float m=1.-smoothstep(rad-.08,rad,length(u)); if(m<=0.) discard;
    float lit=clamp(dot(normalize(u+vec2(.0001)),vec2(.5,.8))*.5+.5,0.,1.)*smoothstep(.2,1.,length(u)/rad);
    oC=vec4(vec3(.03,.028,.03)+vC.rgb*lit*1.6,m*vC.a); return;
  }
  if(r2>1.) discard;
  float g=exp(-r2*5.5),core=exp(-r2*22.);
  float star=0.; if(vK>.5) star=exp(-abs(u.x)*14.)*exp(-abs(u.y)*2.8)+exp(-abs(u.y)*14.)*exp(-abs(u.x)*2.8);
  float I=g*.7+core*.9+star*.8;
  oC=vec4(vC.rgb*I*vC.a*1.5,1.);
}`;

  /* ───────────── 후처리(블룸·톤매핑) ───────────── */
  const FS_DOWN = `#version 300 es
precision highp float; uniform sampler2D uS; uniform vec2 uTexel; uniform float uPre; out vec4 oC;
void main(){
  vec2 uv=gl_FragCoord.xy*uTexel*2.; vec2 o=uTexel;
  vec3 c=texture(uS,uv+vec2(-o.x,-o.y)).rgb+texture(uS,uv+vec2(o.x,-o.y)).rgb+texture(uS,uv+vec2(-o.x,o.y)).rgb+texture(uS,uv+vec2(o.x,o.y)).rgb;
  c*=.25;
  if(uPre>.5){ float l=max(c.r,max(c.g,c.b)); c*=max(l-.8,0.)/max(l,1e-4)*1.0+.0; c=min(c,vec3(30.)); }
  oC=vec4(c,1.);
}`;
  const FS_UP = `#version 300 es
precision highp float; uniform sampler2D uS; uniform vec2 uTexel; uniform float uW; out vec4 oC;
void main(){
  vec2 uv=gl_FragCoord.xy*uTexel; vec2 o=uTexel*1.0;
  vec3 c=texture(uS,uv).rgb*4.;
  c+=(texture(uS,uv+vec2(-o.x,0.)).rgb+texture(uS,uv+vec2(o.x,0.)).rgb+texture(uS,uv+vec2(0.,-o.y)).rgb+texture(uS,uv+vec2(0.,o.y)).rgb)*2.;
  c+=texture(uS,uv+vec2(-o.x,-o.y)).rgb+texture(uS,uv+vec2(o.x,-o.y)).rgb+texture(uS,uv+vec2(-o.x,o.y)).rgb+texture(uS,uv+vec2(o.x,o.y)).rgb;
  oC=vec4(c/16.*uW,1.);
}`;
  const FS_FINAL = `#version 300 es
precision highp float; uniform sampler2D uS,uB; uniform vec2 uRes; uniform float uAmt,uTime,uExp,uLv,uDith;
uniform int uPix,uKey; out vec4 oC;
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 grade(vec2 uv){ vec3 c=(texture(uS,uv).rgb+texture(uB,uv).rgb*uAmt)*uExp; return pow(aces(c),vec3(1./2.2)); }
float bayer(vec2 p){ ivec2 i=ivec2(mod(p,4.)); int k=(i.x&1)*8+(i.y&1)*4+((i.x>>1)&1)*2+((i.y>>1)&1); return (float(k)+.5)/16.-.5; }
float alphaOf(vec3 c){ return clamp(max(c.r,max(c.g,c.b))*1.8-.08,0.,1.); }
float alphaAt(vec2 uv){ return alphaOf(pow(aces(texture(uS,uv).rgb*uExp),vec3(1./2.2))); }
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  if(uPix==0){
    vec2 d=uv-.5; vec2 ca=d*dot(d,d)*.012;
    vec3 s=vec3(texture(uS,uv+ca).r,texture(uS,uv).g,texture(uS,uv-ca).b);
    vec3 c=(s+texture(uB,uv).rgb*uAmt)*uExp;
    c=aces(c); c=pow(c,vec3(1./2.2));
    if(uKey==0){ c*=1.-.5*dot(d,d)*1.4; c+=(h21(gl_FragCoord.xy+fract(uTime)*91.)-.5)*.018; oC=vec4(c,1.); }
    else { float a=max(alphaAt(uv),alphaOf(c)*.5); oC=vec4(c/max(a,.001),a); }
    return;
  }
  vec3 c=grade(uv);
  vec3 q=floor(c*(uLv-1.)+.5+bayer(gl_FragCoord.xy)*uDith)/(uLv-1.); q=clamp(q,0.,1.);
  if(uKey==0){ oC=vec4(q,1.); return; }
  float a=alphaAt(uv); vec2 t=1./uRes;
  float nb=max(max(alphaAt(uv+vec2(t.x,0.)),alphaAt(uv-vec2(t.x,0.))),max(alphaAt(uv+vec2(0.,t.y)),alphaAt(uv-vec2(0.,t.y))));
  float on=step(.34,a);
  if(on>.5) oC=vec4(q,1.);
  else if(nb>.34) oC=vec4(q*.18+vec3(.02,.03,.06),1.);
  else oC=vec4(0.);
}`;

  /* ───────────── 행렬 ───────────── */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function camera(c, aspect) {
    const tg = c.target, d = c.dist;
    const e = [tg[0] + d * Math.cos(c.pitch) * Math.sin(c.yaw), tg[1] + d * Math.sin(c.pitch), tg[2] + d * Math.cos(c.pitch) * Math.cos(c.yaw)];
    const f = norm(sub(tg, e)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    const tn = Math.tan(c.fov * D / 2);
    const V = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1];
    const n = .1, fa = 100;
    const P = [1 / (aspect * tn), 0, 0, 0, 0, 1 / tn, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
    return { e, f, r, u, tn, VP: mul(P, V) };
  }

  /* ───────────── 렌더러 ───────────── */
  class VFXSet {
    constructor(canvas) {
      this.canvas = canvas || document.createElement('canvas');
      const gl = this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error('WebGL2를 쓸 수 없습니다');
      this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
      gl.getExtension('OES_texture_float_linear');
      this.P = {}; this.pool = new Map(); this.U = new Map();
      this.P.scene = this.prog(VS_FULL, FS_SCENE); this.P.part = this.prog(VS_PART, FS_PART);
      this.P.down = this.prog(VS_FULL, FS_DOWN); this.P.up = this.prog(VS_FULL, FS_UP); this.P.fin = this.prog(VS_FULL, FS_FINAL);
      this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
      this.t0 = performance.now();
    }
    prog(vs, fs) {
      const gl = this.gl; const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); console.error(log); throw new Error('셰이더 오류: ' + log); } return s; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('링크 오류: ' + gl.getProgramInfoLog(p));
      return p;
    }
    u(p, n) { const k = n; let m = this.U.get(p); if (!m) this.U.set(p, m = {}); if (!(k in m)) m[k] = this.gl.getUniformLocation(p, n); return m[k]; }
    target(w, h) {
      const gl = this.gl; const key = w + 'x' + h; let t = this.pool.get(key); if (t) return t;
      const mk = (tw, th) => {
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.HALF_FLOAT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fb, w: tw, h: th };
      };
      t = { scene: mk(w, h), bloom: [] };
      let bw = w, bh = h; for (let i = 0; i < 6; i++) { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); t.bloom.push(mk(bw, bh)); }
      if (this.pool.size > 6) { this.pool.clear(); }  // 크기가 자주 바뀌면 오래된 것은 버린다(메모리는 GC가 정리)
      this.pool.set(key, t); return t;
    }
    /** opts: fx, time(초), w, h, mask, cam(부분 덮어쓰기), bg(0 장면|1 회색판), bloom, exposure,
        style('real'|'pixel'), px(픽셀 한 칸 크기·정수), levels(채널당 색 단계), dither(0~1), key(true면 투명 배경) */
    render(o) {
      const gl = this.gl; const F = typeof o.fx === 'string' ? FX[o.fx] : o.fx;
      const pix = o.style === 'pixel'; const px = pix ? Math.max(1, o.px | 0 || 4) : 1;
      this.last = { W: o.w | 0, H: o.h | 0, px };
      const w = pix ? Math.max(8, Math.ceil((o.w | 0) / px)) : o.w | 0, h = pix ? Math.max(8, Math.ceil((o.h | 0) / px)) : o.h | 0; const cv = this.canvas;
      this.last.w = w; this.last.h = h;
      if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
      let t = o.loop === false ? Math.min(o.time, F.dur) : ((o.time % F.dur) + F.dur) % F.dur;
      if (F.id === 7 && o.hold !== false && HOLD[F.pat]) { // 임팩트 홀드: 명중 순간에 잠깐 멈춘다(히트스톱 0.06~0.12초)
        const hT = HOLD[F.pat][0], hD = HOLD[F.pat][1], L = F.dur + hD;
        const u = o.loop === false ? Math.min(o.time, L) : ((o.time % L) + L) % L;
        t = u < hT ? u : (u < hT + hD ? hT : u - hD);
      }
      const mask = o.mask == null ? F.full : o.mask;
      const cam = Object.assign({}, F.cam, o.cam || {});
      if (cam.follow) cam.target = [boltHeadX(t) * cam.follow * .35 + (cam.target ? cam.target[0] : 0), cam.target[1], cam.target[2]];
      const C = camera(cam, w / h);
      const T = this.target(w, h);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      // 1) 장면
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb); gl.viewport(0, 0, w, h);
      let p = this.P.scene; gl.useProgram(p);
      gl.uniform2f(this.u(p, 'uRes'), w, h); gl.uniform1f(this.u(p, 'uT'), t); gl.uniform1i(this.u(p, 'uFx'), F.id); gl.uniform1i(this.u(p, 'uMask'), mask);
      gl.uniform1f(this.u(p, 'uBg'), o.key ? 2 : o.bg ? 1 : 0);
      gl.uniform1i(this.u(p, 'uElem'), F.elem | 0); gl.uniform1i(this.u(p, 'uPat'), F.pat | 0); gl.uniform1i(this.u(p, 'uVar'), F.vr | 0);
      gl.uniform3fv(this.u(p, 'uCP'), C.e); gl.uniform3fv(this.u(p, 'uCF'), C.f); gl.uniform3fv(this.u(p, 'uCR'), C.r); gl.uniform3fv(this.u(p, 'uCU'), C.u); gl.uniform1f(this.u(p, 'uTan'), C.tn);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2) 입자(파편은 알파, 불빛은 가산)
      p = this.P.part; gl.useProgram(p); gl.enable(gl.BLEND);
      gl.uniformMatrix4fv(this.u(p, 'uVP'), false, C.VP); gl.uniform1f(this.u(p, 'uT'), t); gl.uniform1f(this.u(p, 'uPx'), h / (2 * C.tn));
      gl.uniform1i(this.u(p, 'uFx'), F.id); gl.uniform1i(this.u(p, 'uMask'), mask);
      gl.uniform1i(this.u(p, 'uElem'), F.elem | 0); gl.uniform1i(this.u(p, 'uPat'), F.pat | 0); gl.uniform1i(this.u(p, 'uVar'), F.vr | 0);
      if (F.dN) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1i(this.u(p, 'uPass'), 1); gl.drawArrays(gl.POINTS, 0, F.dN); }
      gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1i(this.u(p, 'uPass'), 0); gl.drawArrays(gl.POINTS, 0, F.pN);
      gl.disable(gl.BLEND);
      // 3) 블룸
      const B = T.bloom; let src = T.scene;
      p = this.P.down; gl.useProgram(p);
      for (let i = 0; i < B.length; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, B[i].fb); gl.viewport(0, 0, B[i].w, B[i].h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(this.u(p, 'uS'), 0);
        gl.uniform2f(this.u(p, 'uTexel'), 1 / src.w, 1 / src.h); gl.uniform1f(this.u(p, 'uPre'), i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3); src = B[i];
      }
      p = this.P.up; gl.useProgram(p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = B.length - 2; i >= 0; i--) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, B[i].fb); gl.viewport(0, 0, B[i].w, B[i].h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, B[i + 1].tex); gl.uniform1i(this.u(p, 'uS'), 0);
        gl.uniform2f(this.u(p, 'uTexel'), 1 / B[i].w, 1 / B[i].h); gl.uniform1f(this.u(p, 'uW'), 1.05);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
      // 4) 합성
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      p = this.P.fin; gl.useProgram(p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex); gl.uniform1i(this.u(p, 'uS'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B[0].tex); gl.uniform1i(this.u(p, 'uB'), 1);
      gl.uniform2f(this.u(p, 'uRes'), w, h); gl.uniform1f(this.u(p, 'uAmt'), o.bloom == null ? .55 : o.bloom);
      gl.uniform1f(this.u(p, 'uTime'), (performance.now() - this.t0) / 1000); gl.uniform1f(this.u(p, 'uExp'), o.exposure == null ? 1 : o.exposure);
      gl.uniform1i(this.u(p, 'uPix'), pix ? 1 : 0); gl.uniform1i(this.u(p, 'uKey'), o.key ? 1 : 0);
      gl.uniform1f(this.u(p, 'uLv'), o.levels || 5); gl.uniform1f(this.u(p, 'uDith'), o.dither == null ? .6 : o.dither);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return { w, h, t };
    }
    /** 렌더 결과를 2D 캔버스의 (dx,dy)에 W×H로 복사. 픽셀 스타일은 최근접(정수 배율)으로 키운다.
        GL 원점이 왼쪽 아래라 아래쪽 행을 잘라 쓴다 */
    blit(ctx, W, H, dx = 0, dy = 0) {
      const L = this.last, w = L ? L.w : W, h = L ? L.h : H; ctx.imageSmoothingEnabled = !(L && L.px > 1);
      ctx.drawImage(this.canvas, 0, this.canvas.height - h, w, h, dx, dy, W, H);
    }
  }
  function boltHeadX(t) { const u = Math.min(1, Math.max(0, (t - .15) / 1.9)); return -5.2 + 10 * u; }

  VFXSet.FX = FX; VFXSet.ELEMS = ELEMS; VFXSet.PATS = PATS; VFXSet.WEAPONS = WEAPONS; VFXSet.CATS = CATS;
  // 무기·속성 이름으로 이펙트 키를 얻는다: VFXSet.weapon('bow','ice') → 'bow-ice'. 없으면 null.
  VFXSet.weapon = (w, e) => (FX[w + '-' + e] ? w + '-' + e : null);
  G.VFXSet = VFXSet;
})(window);
