/** Arrow TD - Mycelium Space Pivot (single map) */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    if(typeof r==='number') r=[r,r,r,r];
    const [tl,tr,br,bl]=r;
    this.moveTo(x+tl,y); this.lineTo(x+w-tr,y); this.quadraticCurveTo(x+w,y,x+w,y+tr);
    this.lineTo(x+w,y+h-br); this.quadraticCurveTo(x+w,y+h,x+w-br,y+h);
    this.lineTo(x+bl,y+h); this.quadraticCurveTo(x,y+h,x,y+h-bl);
    this.lineTo(x,y+tl); this.quadraticCurveTo(x,y,x+tl,y); this.closePath();
  };
}
window.addEventListener('error', e=>{
  console.error(e.message, e.filename, e.lineno);
  const d=document.createElement('div');
  d.style.cssText='position:fixed;top:0;left:0;right:0;background:#7f1d1d;color:#fff;padding:8px;z-index:9999;font-size:12px';
  d.textContent='Error: '+e.message+' @'+e.lineno; document.body.appendChild(d);
});

/* ===== WORLD + CAMERA (scrollable galaxy, wheel zoom) ===== */
const WORLD={w:2560, h:2560};
let W=window.innerWidth, H=window.innerHeight;
let DPR=1;
function resizeCanvas(){
  W=window.innerWidth; H=window.innerHeight;
  DPR=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(W*DPR); canvas.height=Math.round(H*DPR);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  ctx.imageSmoothingEnabled=false;
}
resizeCanvas();
let cam={x:WORLD.w/2-W/2, y:WORLD.h/2-H/2, zoom:1};
let oohShown=false; // first-zoom-out reveal, reset each run
function screenToWorld(sx,sy){ return {x:sx/cam.zoom+cam.x, y:sy/cam.zoom+cam.y}; }
function worldToScreen(wx,wy){ return {x:(wx-cam.x)*cam.zoom, y:(wy-cam.y)*cam.zoom}; }
function viewCenter(){ return {x:cam.x+W/(2*cam.zoom), y:cam.y+H/(2*cam.zoom)}; }
function clampCam(){
  // The Bloom is borderless: the camera drifts freely through world coordinates.
  // Only an extremely distant soft leash prevents losing the expedition entirely.
  const LIM=5200, vw=W/cam.zoom, vh=H/cam.zoom;
  const cx0=WORLD.w/2, cy0=WORLD.h/2;
  cam.x=Math.max(cx0-LIM-vw*0.5, Math.min(cx0+LIM-vw*0.5, cam.x));
  cam.y=Math.max(cy0-LIM-vh*0.5, Math.min(cy0+LIM-vh*0.5, cam.y));
}
function centerCam(){
  cam.zoom=1;
  cam.x=WORLD.w/2-W/2; cam.y=WORLD.h/2-H/2;
  clampCam();
}
// Run start framing: zoom FIRST, then center — so the station (WORLD center)
// lands exactly in the middle of the screen at any zoom.
function centerOnStation(zoom){
  cam.zoom=zoom;
  cam.x=WORLD.w/2-W/(2*cam.zoom); cam.y=WORLD.h/2-H/(2*cam.zoom);
  clampCam();
}
function zoomAt(sx,sy,f){
  const before=screenToWorld(sx,sy);
  // STATION 2.2 → LOCAL → PLANETARY → SYSTEM → DEEP 0.22: one continuous discovery.
  cam.zoom=Math.max(0.22, Math.min(2.2, cam.zoom*f));
  cam.x=before.x-sx/cam.zoom; cam.y=before.y-sy/cam.zoom;
  clampCam();
  // first zoom-out of a run: reveal the scale of the network
  if(!oohShown && cam.zoom<0.7 && state===STATE.PLAYING){
    oohShown=true;
    sightingFlash=0.6; // wordless shimmer — no text, the scale speaks for itself
    SFX.sting();
  }
}
addEventListener('resize', ()=>{
  resizeCanvas();
  clampCam(); // world-space: entities stay put, only the view changes
});

const STATE={MENU:'menu', PLAYING:'playing', PAUSED:'paused', GAMEOVER:'gameover', SHOP:'shop', HOWTO:'howto', CLEAR:'clear', WARP:'warp'};
let state=STATE.MENU;
let speedMult=1;

/* ===== PIXEL-ART CORE (voxel look: crisp rects, no smoothing) ===== */
const PIX = 16; // mycelium voxel size in px
try{ ctx.imageSmoothingEnabled=false; }catch(e){}
const PX_COLORS={
  bg0:'#070b18', bg1:'#0d1830',
  station:'#38bdf8', stationDark:'#0c2740', stationLight:'#e0f2fe',
  comet:'#c2b8a3', cometDark:'#5b5344', cometLight:'#fef9c3',
  lane:'#7ce67c', laneDim:'#3f6212',
  drone:'#facc15', droneDark:'#92400e',
  myc:['#2e1065','#4c1d95','#6d28d9','#7c3aad','#a855f7','#d8b4fe'],
  mycHot:'#f0abfc', mycSlow:'#7dd3fc', spore:'#f0abfc'
};
let pixelStars=[];
let pixelNebula=[];
function snap(v){ return Math.round(v); }
// deterministic 2D hash (0..1) — procedural sky, stable across frames
function hash2(x,y){ let h=(x*374761393+y*668265263)|0; h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967296; }
// deterministic 1D hash (0..1) — stable slots/offsets, no RNG consumed
function hash01(s){ const x=Math.sin(s*127.1+311.7)*43758.5453; return x-Math.floor(x); }
// crisp pixel rect - the backbone of all pixel-art drawing
function px(x,y,w,h,color){
  ctx.fillStyle=color;
  ctx.fillRect(snap(x),snap(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
}
// pixel border box (dark outline + colored fill)
function pxBox(x,y,w,h,fill,border){
  px(x-2,y-2,w+4,h+4,border||'#020617');
  px(x,y,w,h,fill);
}
function buildPixelSky(){
  pixelStars=[];
  pixelNebula=[];
  const n=Math.floor(WORLD.w*WORLD.h/14000);
  for(let i=0;i<n;i++){
    pixelStars.push({x:Math.floor(Math.random()*WORLD.w), y:Math.floor(Math.random()*WORLD.h),
      s:Math.random()<0.85?2:3, tw:Math.random()*6.28,
      c:Math.random()<0.7?'#e2e8f0':(Math.random()<0.5?'#7dd3fc':'#fde68a')});
  }
  for(let i=0;i<40;i++){
    pixelNebula.push({x:Math.floor(Math.random()*WORLD.w/32)*32, y:Math.floor(Math.random()*WORLD.h/32)*32,
      w:(2+Math.floor(Math.random()*4))*32, h:(1+Math.floor(Math.random()*3))*32,
      c:['#16213f','#1b2547','#231a3f','#12302a'][i%4]});
  }
}
buildPixelSky();

// One fixed map — no seeds, no weekly rotation. The layout table in
// buildWorld IS the galaxy, same every expedition.

// audio
let audioCtx=null;
let musicEl=null;
function ensureAudio(){ if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); }
function startMusic(){
  if(!musicEl){
    musicEl=new Audio('bloom-loop.wav');
    musicEl.loop=true;
    musicEl.preload='auto';
    musicEl.volume=0.18;
  }
  musicEl.play().catch(()=>{});
}
function stopMusic(){
  if(musicEl) musicEl.pause();
}
function tone(freq,dur=0.12,type='sine',vol=0.2,slideTo){
  try{
    ensureAudio(); if(audioCtx.state==='suspended') audioCtx.resume();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(audioCtx.destination); o.start();
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo,audioCtx.currentTime+dur);
    g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur); o.stop(audioCtx.currentTime+dur+0.02);
  }catch(e){}
}
const SFX={
  shoot:()=>tone(720,0.07,'square',0.12,880),
  hit:()=>tone(220,0.06,'square',0.13),
  kill:()=>{tone(300,0.09,'triangle',0.18,150); setTimeout(()=>tone(600,0.07,'sine',0.13),60)},
  coin:()=>tone(900,0.11,'sine',0.12,1200),
  place:()=>{tone(400,0.09,'sine',0.2,600); setTimeout(()=>tone(700,0.09,'triangle',0.15),80)},
  hurt:()=>tone(140,0.22,'sawtooth',0.2,80),
  wave:()=>{tone(300,0.18,'sine',0.22,500); setTimeout(()=>tone(600,0.18,'sine',0.22),140)},
  no:()=>tone(120,0.15,'square',0.15,80),
  heal:()=>{tone(440,0.12,'sine',0.14,660); setTimeout(()=>tone(550,0.10,'sine',0.12),90)},
  pierce:()=>tone(880,0.06,'triangle',0.11,1100),
  tremorSnd:()=>tone(55,1.1,'sawtooth',0.10,38),
  sting:()=>{tone(160,0.7,'sine',0.12,340); setTimeout(()=>tone(82,0.9,'triangle',0.10,55),120)},
  boom:()=>{tone(90,1.0,'sawtooth',0.16,40); setTimeout(()=>tone(220,0.5,'square',0.08,60),80)},
};

// permanent upgrades - tower unlocks + stats
const PERM_MAX=10;
const PERM_DEFS=[
  {id:'unlock_barrage', name:'Swarm Bay', icon:'\u2726', desc:'Unlock Swarm Bay — 3-shot burst vs voxels', baseCost:120, mult:999, per:'UNLOCK', max:1, tower:'barrage', reqWave:3},
  {id:'unlock_frost', name:'Cryo Node', icon:'\u2744', desc:'Unlock Cryo Node — slows the cloud', baseCost:200, mult:999, per:'UNLOCK', max:1, tower:'frost', reqWave:6},
  {id:'unlock_cannon', name:'Plasma Mortar', icon:'\u25CE', desc:'Unlock Plasma Mortar — splash vs crowds', baseCost:320, mult:999, per:'UNLOCK', max:1, tower:'cannon', reqWave:8},
  {id:'unlock_storm', name:'Tesla Coil', icon:'\u26A1', desc:'Unlock Tesla Coil — chain lightning', baseCost:580, mult:999, per:'UNLOCK', max:1, tower:'storm', reqWave:14},
  {id:'damage', name:'Sharpened Tips', icon:'\u25B2', desc:'+10% tower damage', baseCost:45, mult:1.62, per:'+10% DMG'},
  {id:'range', name:'Hawk Eye', icon:'\u25CE', desc:'+6% tower range', baseCost:50, mult:1.65, per:'+6% RNG'},
  {id:'speed', name:'Quickdraw', icon:'\u00BB', desc:'+7% fire rate', baseCost:52, mult:1.68, per:'+7% SPD'},
  {id:'wealth', name:'Greedy Purse', icon:'\u25CF', desc:'+ starting gold', baseCost:40, mult:1.55, per:'+ gold'},
  {id:'lives', name:'Stone Core', icon:'\u2665', desc:'+2 max lives', baseCost:70, mult:1.75, per:'+2 lives'},
  {id:'slow', name:'Frost Mastery', icon:'\u2744', desc:'+8% slow duration', baseCost:55, mult:1.62, per:'+8% slow'},
];
let permLevels={}, coinsBank=0;
function loadPerm(){
  try{
    coinsBank=parseInt(localStorage.getItem('atd_coins')||'0')||0;
    permLevels=JSON.parse(localStorage.getItem('atd_perm')||'{}')||{};
    for(const k of Object.keys(permLevels)){
      const def=PERM_DEFS.find(d=>d.id===k);
      const cap=def?.max||PERM_MAX;
      permLevels[k]=Math.min(cap, Math.max(0, Math.floor(Number(permLevels[k])||0)));
    }
  }catch(e){ coinsBank=0; permLevels={}; }
}
function savePerm(){ try{ localStorage.setItem('atd_coins', coinsBank); localStorage.setItem('atd_perm', JSON.stringify(permLevels)); }catch(e){} }
loadPerm();
function permBonus(id){
  const lvl=permLevels[id]||0;
  if(id==='wealth'){
    let tot=0; for(let i=0;i<lvl;i++) tot+=Math.max(5,12 - i*1.0);
    return tot;
  }
  if(id==='lives') return lvl*2;
  const map={damage:0.10, range:0.06, speed:0.07, slow:0.08};
  return lvl*(map[id]||0);
}
function permCost(def){ return Math.floor(def.baseCost*Math.pow(def.mult, permLevels[def.id]||0)); }
function isTowerUnlocked(towerId){
  if(towerId==='archer') return true;
  if(towerId==='drone') return true;
  if(towerId==='hangar') return true;
  const map={barrage:'unlock_barrage', frost:'unlock_frost', cannon:'unlock_cannon', storm:'unlock_storm'};
  const pid=map[towerId];
  return pid ? (permLevels[pid]||0)>0 : true;
}
function getMaxDrones(){
  let hangars=0; for(const t of towers) if(t.mod==='hangar') hangars+= t.level;
  return 1 + hangars;
}
function countModules(mod){
  let c=0; for(const t of towers) if(t.mod===mod) c+= t.level;
  return c;
}

// stats & prestige
let prestigeWins=0;
let galaxy=0;
let unlockedMap=6;
function loadProgress(){
  try{ prestigeWins=parseInt(localStorage.getItem('atd_prestige')||'0')||0; }catch(e){ prestigeWins=0; }
}
loadProgress();
function saveProgress(){ try{ localStorage.setItem('atd_prestige', prestigeWins); }catch(e){} }

let stats={bestWave:0,bestKills:0,runs:0,totalKills:0,totalCoins:0};
let lastRun=null;
function loadStats(){ try{ const s=JSON.parse(localStorage.getItem('atd_stats')||'null'); if(s) stats={...stats,...s}; const lr=JSON.parse(localStorage.getItem('atd_last')||'null'); if(lr) lastRun=lr; }catch(e){} }
function saveStats(){ try{ localStorage.setItem('atd_stats', JSON.stringify(stats)); if(lastRun) localStorage.setItem('atd_last', JSON.stringify(lastRun)); }catch(e){} }
loadStats();
// M10: galaxy ledger — all-time totals across runs (localStorage).
// Declared early: refreshMenuStats() runs during initial page eval.
let galaxyStats={liberated:0, visited:1};
function loadGalaxyStats(){ try{ const g=JSON.parse(localStorage.getItem('atd_galaxy')||'null'); if(g) galaxyStats={liberated:g.liberated|0, visited:Math.max(1,g.visited|0)}; }catch(e){} }
function saveGalaxyStats(){ try{ localStorage.setItem('atd_galaxy', JSON.stringify(galaxyStats)); }catch(e){} }
loadGalaxyStats();
// Declared early: hangarUplink() (called during initial buildWorld eval via
// heart validation) reads stationTech, so this must exist before page eval.
let stationTech={solar:0, lab:0, command:0, nav:0};
function refreshMenuStats(){
  const e=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  e('statBestWave', stats.bestWave); e('statBestKills', stats.bestKills); e('statRuns', stats.runs);
  e('statTotalKills', stats.totalKills); e('statTotalCoins', stats.totalCoins);
  e('statLiberated', galaxyStats.liberated); e('statVisited', galaxyStats.visited);
  const lr=document.getElementById('statLastRun');
  if(lr) lr.textContent= lastRun ? `Last watch: held ${lastRun.wave} stirs \u2022 ${lastRun.kills} kills \u2022 ${lastRun.coins} gold` : 'No runs yet - press DEFEND';
  const sc=document.getElementById('shopCoinCount'); if(sc) sc.textContent=coinsBank;
  const pb=document.getElementById('prestigeBadge');
  if(pb){
    if(prestigeWins>0){ pb.textContent=`\u2605 Prestige ${prestigeWins} (+${prestigeWins}% DMG)`; pb.classList.remove('hidden'); }
    else pb.classList.add('hidden');
  }
}
refreshMenuStats();

// game vars - declared early: cloud seeding (buildWorld) reads wave/threatTime at load
let lives=20, maxLives=20, wave=1, coins=130, waveTimer=12, waveSpawning=false, spawnQueue=[], spawnAcc=0, threatTime=0;
let enemies=[], towers=[], projectiles=[], particles=[], damageNumbers=[];
// world - Mycelium Space only
const CORE={x:0,y:0,r:26};
let asteroids=[]; // resource worlds (gameplay data lives on the celestial body)
// ===== M1: SOLAR SYSTEM FOUNDATION (static star map; gameplay coherent) =====
// The station stays at CORE. The star + planets + belt form a still, learnable
// map — NOTHING orbits. Lanes, drones and tower anchors read asteroid x/y
// every frame (positions are simply constant now); all motion in the game
// belongs to the Bloom: drones, packets, pulses, tendrils, mycelium.
let star=null; // {x,y,r,seed}
let planets=[]; // {orbitR,angle,speed,r,x,y,base,dark,light,name,seed,res:[],moons:[{orbitR,angle,speed,r,x,y,name,res:[]}]}
let beltRocks=[]; // {angle,radiusOff,size,seed} visual debris ring around the star
// Resource bodies: every gameplay node is OWNED by a physical body and follows
// it. Planet/moon nodes ride their world; belt/derelict nodes ride slow orbit
// anchors (they ARE drifting clusters/hulks). No floating nodes.
let beltAnchors=[]; // {orbitR,angle,speed,x,y,res:[]}
let drifters=[]; // {orbitR,angle,speed,x,y,res:[]} — derelict hulks on slow orbits
// Forward outposts (declared early: buildWorld→validHeartSpot reads outposts
// during initial page eval, before the systems below execute).
const OUTPOST_COST=600, OUTPOST_MAX=2, OUTPOST_RELAY=350, OUTPOST_HP=300, OUTPOST_BUILD_TIME=18;
let outposts=[]; // {x,y,r:20,name,hp,maxHp,seed,relayed,warnT,attackT,critLogged}
let constructions=[]; // {x,y,tx,ty,phase:'travel'|'build',prog,speed,seed}
let outpostPlacing=false;
let myceliumBlocks=[]; // legacy (kept for save-compat); real cloud lives in mycCells
let drones=[];
let scouts=[]; // M5: survey wing — direct-flight charting, independent of hangar slots
const SCOUT_MAX=2;
let preferredAsteroid=null; // player choice where drones go
// --- pixel-cloud mycelium state ---
let mycCells=new Map(); // key "cx,cy" -> {cx,cy,hp,maxHp,age,seed,slowUntil,flash}
let mycKeyCache=[], mycKeyCacheT=0;
let mycGrowthAcc=0;
let mycTouchAcc=0;
let mycNearStation=false;
let mycWarnAcc=0;
// ===== REVEAL CHOREOGRAPHY (dread without instructions) =====
let tremorTimer=20;
let tremorIdx=0;
let driftMotes=[];
let seenHeart=false;
let seenCloud=false;
let sightCheckAcc=0;
let sightingFlash=0;
let wakeFlash=0;
const TREMOR_LINES=[
  'Static on all frequencies. Then silence.',
  'A drone reports movement at the rim. Probably nothing.',
  'Your coffee ripples. No gravity malfunction found.',
];
function seedDriftMotes(){
  driftMotes=[];
  for(let i=0;i<22;i++){
    driftMotes.push({
      x:cam.x+Math.random()*W/cam.zoom, y:cam.y+Math.random()*H/cam.zoom,
      vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10,
      seed:Math.random()*6.28
    });
  }
}
let purgeTotal=0;
let purgeGoal=1200; // clearing this many voxels frees the galaxy (victory)
let mycTime=0;
let driftTime=0; // M3: drives bounded resource-node drift
// The star's fixed home — gameplay nodes and decoratives both derive
// orbital geometry from this single point (one coherent system).
function starHome(){ return {x:WORLD.w/2, y:WORLD.h/2+430}; }
function buildSolarSystem(){
  // Visual-only solar playground (fixed map — no seed). Decorative angles
  // use Math.random; worlds snap to claims in attachNodesToBodies anyway.
  if(star) return;
  const home=starHome();
  // Star sits below the station so both are in the opening frame: the station
  // reads as "parked near the star", not "the universe revolves around me".
  star={x:home.x, y:home.y, r:84, seed:Math.random()*6.28};
  // Scale hierarchy: the station (r26) is TINY next to these worlds.
  // Drones (12px) crossing to a gas giant should feel like dust vs a moon.
  const defs=[
    {orbitR:260, r:46, base:'#7fb2e5', dark:'#274b73', light:'#dff1ff', band:'#4a7fb5', name:'Tethys', moons:1, v:'ice'},
    {orbitR:460, r:64, base:'#d6a35c', dark:'#7c4a1e', light:'#fde68a', band:'#a3762f', name:'Kharos', moons:2, v:'desert'},
    {orbitR:800, r:30, base:'#94a3b8', dark:'#334155', light:'#e2e8f0', band:'#64748b', name:'Vesta Belt', moons:0, v:'rock'},
    {orbitR:1020, r:92, base:'#c2703d', dark:'#5b2b12', light:'#fed7aa', band:'#7c2d12', name:'Goliath', moons:1, v:'gas'},
  ];
  planets=defs.map((d,pi)=>{
    const angle=Math.random()*Math.PI*2;
    // STATIC UNIVERSE: worlds do not orbit. A still, readable star map the
    // player can learn — the Bloom provides all the motion the game needs.
    const speed=0;
    const moons=[];
    for(let m=0;m<d.moons;m++){
      moons.push({orbitR:d.r+34+m*20, angle:Math.random()*Math.PI*2,
        speed:0, r:8+(m===0?4:0), x:0, y:0,
        name:d.name+' '+['I','II','III'][m], res:[]});
    }
    return {...d, angle, speed, x:0, y:0, seed:Math.random()*6.28, moons, res:[]};
  });
  beltRocks=[];
  for(let i=0;i<110;i++){
    beltRocks.push({angle:Math.random()*Math.PI*2, radiusOff:(Math.random()-0.5)*56,
      size:Math.random()<0.8?3:4, seed:Math.random()*6.28});
  }
  updateSolarSystem(0);
}
function updateSolarSystem(ddt){
  if(!star || !planets.length) return;
  for(const p of planets){
    p.angle+=p.speed*ddt;
    p.x=star.x+Math.cos(p.angle)*p.orbitR;
    p.y=star.y+Math.sin(p.angle)*p.orbitR*0.92;
    for(const m of p.moons){
      m.angle+=m.speed*ddt;
      m.x=p.x+Math.cos(m.angle)*m.orbitR;
      m.y=p.y+Math.sin(m.angle)*m.orbitR*0.9;
    }
  }
  for(const b of beltRocks){
    // static debris field (positions fixed at build)
    b.x=star.x+Math.cos(b.angle)*(800+b.radiusOff);
    b.y=star.y+Math.sin(b.angle)*(800+b.radiusOff)*0.92;
  }
}
// WORLD COHERENCE: every resource node is owned by a physical body.
// Planet nodes ride their world (extraction site on the surface); every
// other claim is a free world frozen on its table spot (moonlets included).
// Drones, lanes, towers and corruption all read live node positions.
function attachNodesToBodies(){
  for(const p of planets) p.res=[];
  beltAnchors=[]; drifters=[];
  if(!planets.length) return;
  const byDist=[...asteroids].sort((x,y)=>x.distCore-y.distCore);
  const planetsByOrbit=[...planets].sort((x,y)=>x.orbitR-y.orbitR);
  const idxOf=(a)=>asteroids.indexOf(a);
  const anchorFor=(a,mult,add)=>{
    // Free world frozen EXACTLY on its table spot. Anchors are circular
    // around the star with radius measured from the star, so the recompute
    // below returns this same position every tick (no drift).
    const i=idxOf(a), sh=starHome();
    return {orbitR:Math.hypot(a.x-sh.x,a.y-sh.y)+(hash01(i*mult+add)-0.5)*80, angle:Math.atan2(a.y-sh.y,a.x-sh.x), speed:0, x:a.x, y:a.y, res:[a], circ:true};
  };
  for(const a of byDist){
    const k=a.kind||'belt';
    const i=idxOf(a);
    if(k==='planet'){
      // Strict 1:1 — one claim per planet (surplus planets adopt below).
      const freeP=planetsByOrbit.filter(q=>q.res.length===0);
      const ppool=freeP.length?freeP:planetsByOrbit;
      let p=ppool[0], bs=1e18;
      for(const c of ppool){ const s=Math.abs(c.orbitR-a.distCore); if(s<bs){ bs=s; p=c; } }
      a.bodyKind='planet'; a.body=p; a.slot=0; p.res.push(a);
    } else if(k==='moon'){
      // Moonlet: minable moon exactly on its table spot.
      const an=anchorFor(a,41,2);
      beltAnchors.push(an);
      a.bodyKind='moonlet'; a.body=an; a.slot=0;
    } else if(k==='derelict'){
      const an1=anchorFor(a,31,4);
      drifters.push(an1);
      a.bodyKind='derelict'; a.body=an1; a.slot=0;
    } else {
      const an2=anchorFor(a,37,9);
      beltAnchors.push(an2);
      a.bodyKind='belt'; a.body=an2; a.slot=0;
    }
    // deterministic extraction-site slot around the world (no RNG consumed)
    a.slotAng=hash01(i*7+3)*6.28;
    a.slotSpin=(hash01(i*13+1)-0.5)*0.004; // sites creep almost imperceptibly
  }
  // Every planet is minable: a world with no claim adopts a belt claim as a
  // surface site (no wild-planet confusion). Spread-aware: each empty planet
  // takes the belt angle facing the emptiest sky, so worlds spread out
  // instead of clustering in one arc.
  const angDist=(x,y)=>{
    let d=Math.abs(x-y)%(Math.PI*2);
    return d>Math.PI?Math.PI*2-d:d;
  };
  const beltAngle=(a)=>Math.atan2(a.baseY-starHome().y, a.baseX-starHome().x);
  for(const p of planetsByOrbit){
    if(p.res.length) continue;
    const placedAngles=[];
    for(const q of planets) if(q.res.length&&q.res[0]) placedAngles.push(beltAngle(q.res[0]));
    let best=null, bs=-1;
    for(const a of asteroids){
      if(a.kind!=='belt') continue;
      const aa=beltAngle(a);
      let md=1e9;
      for(const o of placedAngles) md=Math.min(md, angDist(aa,o));
      for(const an of beltAnchors){ if(an===a.body) continue; md=Math.min(md, angDist(aa,an.angle)); }
      for(const dr of drifters) md=Math.min(md, angDist(aa,dr.angle));
      // slight preference for nearby orbits keeps travel honest
      const score=md-Math.abs(a.distCore-p.orbitR)/1500;
      if(score>bs){ bs=score; best=a; }
    }
    if(!best) continue;
    if(best.body && best.body.res){
      const ri=best.body.res.indexOf(best);
      if(ri>=0) best.body.res.splice(ri,1);
      if(best.body.res.length===0){ // vacated anchor dissolves — no ghost claims
        const ai=beltAnchors.indexOf(best.body);
        if(ai>=0) beltAnchors.splice(ai,1);
      }
    }
    best.kind='planet'; best.bodyKind='planet'; best.body=p; best.slot=p.res.length; p.res.push(best);
  }
  // Layout coherence: move WORLDS to their claims, not claims to worlds.
  // Nodes are seeded in an even angular spread; each planet takes the angle
  // of its first claim, so planet + site land on the spread instead of all
  // collapsing onto a few random bodies while arcs sit empty.
  if(star){
    for(const p of planets){
      if(!p.res.length) continue;
      const s0=p.res[0];
      p.angle=Math.atan2(s0.baseY-star.y, s0.baseX-star.x);
      p.x=star.x+Math.cos(p.angle)*p.orbitR;
      p.y=star.y+Math.sin(p.angle)*p.orbitR*0.92;
    }
    for(const p of planets){
      for(let mi=0; mi<p.moons.length; mi++){
        const m=p.moons[mi];
        if(m.x==null) continue;
        // Companion moons: each moon turns to face the nearest drifting
        // claim, so moons visually chaperone claims instead of piling onto
        // the planet's platform. Deterministic; static after.
        // (Claim clicks work through the moon — see moonClaimAt.)
        let bx=null, bd=1e18;
        for(const an of beltAnchors){
          const d=Math.hypot(an.x-p.x,an.y-p.y);
          if(d<bd){ bd=d; bx=an; }
        }
        for(const dr of drifters){
          const d=Math.hypot(dr.x-p.x,dr.y-p.y);
          if(d<bd){ bd=d; bx=dr; }
        }
        const siteDir=(p.res.length&&p.res[0].slotAng!=null)?p.res[0].slotAng:0;
        let ma=siteDir+Math.PI+(mi-(p.moons.length-1)/2)*1.6; // fallback fan
        if(bx) ma=Math.atan2(bx.y-p.y,bx.x-p.x);
        if(Math.abs(((ma-siteDir+Math.PI*3)%(Math.PI*2))-Math.PI)<0.6) ma+=0.9; // never over the platform
        m.angle=ma;
        m.x=p.x+Math.cos(m.angle)*m.orbitR;
        m.y=p.y+Math.sin(m.angle)*m.orbitR*0.9;
      }
    }
  }
  // Separation guarantee: push worlds apart until no two claims overlap.
  // Static universe, so this runs once at build and the map stays readable.
  // Tower reach is planned against THESE positions — nothing moves after.
  spreadBodies();
  snapNodesToBodies();
  // Opening fairness: never birth a world inside the purple. The cloud earns it.
  const clearAt=(x,y,rad)=>{
    const c0=mycWorldToCell(x-rad,y-rad), c1=mycWorldToCell(x+rad,y+rad);
    for(let cx=c0.cx;cx<=c1.cx;cx++) for(let cy=c0.cy;cy<=c1.cy;cy++){
      const k=mycKey(cx,cy), cell=mycCells.get(k);
      if(!cell) continue;
      const c=mycCellCenter(cx,cy);
      if(Math.hypot(c.x-x,c.y-y)<=rad) mycCells.delete(k);
    }
  };
  for(const a of asteroids) clearAt(a.x,a.y,a.r+24);
  for(const p of planets){
    if(p.x==null) continue;
    clearAt(p.x,p.y,p.r+34);
    for(const m of p.moons){ if(m.x!=null) clearAt(m.x,m.y,m.r+26); }
  }
}
// Separation guarantee: every world gets visual elbow room around the star.
// Planets carry their moons + platforms in their footprint; drifting claims
// count small. Resolves in true distance (not just angle) so far/near pairs
// on one ray don't shove each other needlessly.
function spreadBodies(){
  if(!star) return;
  const feats=[];
  for(const p of planets){
    let extent=p.r+120; // platform + labels + lane fan
    for(const m of p.moons) extent=Math.max(extent,(m.orbitR||0)+m.r+80);
    feats.push({ref:p, r:p.orbitR, size:extent, isP:true});
  }
  for(const an of beltAnchors) feats.push({ref:an, r:an.orbitR, size:90, isP:false, circ:true});
  for(const dr of drifters) feats.push({ref:dr, r:dr.orbitR, size:90, isP:false, circ:true});
  // planets ride the 0.92 ellipse; free anchors are circular (table-exact)
  const pos=(f,a)=>({x:star.x+Math.cos(a)*f.r, y:star.y+Math.sin(a)*f.r*(f.circ?1:0.92)});
  for(let it=0; it<80; it++){
    let worst=0;
    for(let i=0;i<feats.length;i++) for(let j=i+1;j<feats.length;j++){
      const A=feats[i], B=feats[j];
      const pa=pos(A,A.ref.angle), pb=pos(B,B.ref.angle);
      const d=Math.hypot(pb.x-pa.x,pb.y-pa.y)||1;
      const need=A.size+B.size;
      if(d<need){
        // push apart along the arc, proportional to orbital radius
        const sA=Math.atan2(pa.y-star.y,(pa.x-star.x)||0.001);
        const sB=Math.atan2(pb.y-star.y,(pb.x-star.x)||0.001);
        let diff=sB-sA;
        while(diff>Math.PI) diff-=Math.PI*2;
        while(diff<-Math.PI) diff+=Math.PI*2;
        if(Math.abs(diff)<0.0005) diff=0.01;
        const dir=diff>=0?1:-1;
        const step=Math.min(0.05,(need-d)/((A.r+B.r)/2));
        A.ref.angle-=dir*step*(B.r/(A.r+B.r));
        B.ref.angle+=dir*step*(A.r/(A.r+B.r));
        worst=Math.max(worst,need-d);
      }
    }
    if(worst<1) break;
  }
  for(const p of planets){
    p.x=star.x+Math.cos(p.angle)*p.orbitR;
    p.y=star.y+Math.sin(p.angle)*p.orbitR*0.92;
    for(const m of p.moons){
      m.x=p.x+Math.cos(m.angle)*m.orbitR;
      m.y=p.y+Math.sin(m.angle)*m.orbitR*0.9;
    }
  }
  for(const an of beltAnchors){ an.x=star.x+Math.cos(an.angle)*an.orbitR; an.y=star.y+Math.sin(an.angle)*an.orbitR; }
  for(const dr of drifters){ dr.x=star.x+Math.cos(dr.angle)*dr.orbitR; dr.y=star.y+Math.sin(dr.angle)*dr.orbitR; }
}
// Physical focus of a world: the BODY for planet/moon sites (infection is
// about the world), the site itself for free-drifting clusters/hulks.
function nodeFocus(a){
  if(a.body && (a.bodyKind==='planet'||a.bodyKind==='moon') && a.body.x!=null)
    return {x:a.body.x, y:a.body.y, r:a.body.r};
  return {x:a.x, y:a.y, r:a.r};
}
function snapNodesToBodies(){
  for(const a of asteroids){
    if(!a.body) continue;
    if(a.bodyKind==='planet'||a.bodyKind==='moon'){
      const b=a.body;
      if(b.x==null) continue;
      const sa=a.slotAng+a.slot*2.1, sd=b.r+26;
      a.baseX=b.x+Math.cos(sa)*sd; a.baseY=b.y+Math.sin(sa)*sd;
    } else {
      a.baseX=a.body.x; a.baseY=a.body.y;
    }
    a.x=a.baseX; a.y=a.baseY;
  }
}
// STATIC UNIVERSE: nodes sit on their worlds/anchors, recomputed (identically)
// every tick so lanes, drones, towers and smother checks always read live,
// truthful positions. Nothing moves; the Bloom is the only motion.
function updateNodeDrift(ddt){
  driftTime+=ddt;
  if(star){
    for(const an of beltAnchors){
      an.x=star.x+Math.cos(an.angle)*an.orbitR;
      an.y=star.y+Math.sin(an.angle)*an.orbitR; // circular: returns the table spot
    }
    for(const dr of drifters){
      dr.x=star.x+Math.cos(dr.angle)*dr.orbitR;
      dr.y=star.y+Math.sin(dr.angle)*dr.orbitR;
    }
  }
  for(const a of asteroids){
    if(a.baseX==null) continue;
    if(a.body && (a.bodyKind==='planet'||a.bodyKind==='moon') && a.body.x!=null){
      const b=a.body;
      const sa=a.slotAng+a.slot*2.1, sd=b.r+26;
      a.baseX=b.x+Math.cos(sa)*sd; a.baseY=b.y+Math.sin(sa)*sd;
    } else if(a.body && a.body.x!=null){
      a.baseX=a.body.x; a.baseY=a.body.y;
    }
    // STATIC: sites sit exactly on their worlds. (driftTime still drives
    // texture rotation on belt chunks, lamps and mycelium pulse.)
    a.x=a.baseX;
    a.y=a.baseY;
  }
}
function buildWorld(){
  CORE.x=WORLD.w/2; CORE.y=WORLD.h/2;
  // galaxy: ONE hand-built map (no seed lottery). 12 worlds, every tier
  // offering claims in three different directions so the player always has
  // a choice of where to push — near/mid/far/frontier, all around the sky.
  // [angleDeg, dist, kind] — PRE-SORTED by dist: sorted index == row index,
  // so kinds, tiers and overrides below always hit the intended claim.
  // 3 home moons / mid belt ring / outer planets / frontier mixed.
  const NODE_LAYOUT=[
    [30,165,'moon'],[150,170,'moon'],[270,175,'moon'],
    [200,430,'belt'],[35,435,'belt'],[320,440,'belt'],
    [10,745,'planet'],[95,750,'planet'],[250,760,'belt'],
    [300,1075,'belt'],[170,1080,'derelict'],[45,1085,'moon'],
  ];
  if(asteroids.length===0){
    asteroids=[];
    for(let i=0;i<NODE_LAYOUT.length;i++){
      const ang=NODE_LAYOUT[i][0]*Math.PI/180;
      const rad=NODE_LAYOUT[i][1];
      const distCore=rad;
      const tier=Math.floor(i/3); // 0:near moons, 1:mid, 2:outer, 3:frontier
      // RIM RISK/REWARD: far worlds are richer — expansion toward the hearts pays (M10: system mods)
      // (fixed-map variation via hash01: same map every run, no seed needed)
      const rich=Math.max(20,Math.floor((55 + distCore*0.09 + hash01(i*3+1)*11)*(sysMods.ore||1)));
      asteroids.push({x:WORLD.w/2+Math.cos(ang)*rad, y:WORLD.h/2+Math.sin(ang)*rad, r:16+hash01(i*5+2)*6, ore:rich, maxOre:rich, distCore, unlocked:false, parent:null});
    }
    // assign parent chain: each asteroid's parent is previous nearer one in same general direction, or CORE for nearest
    asteroids.sort((a,b)=>a.distCore-b.distCore);
    // M2: RESOURCE LOCATIONS — same node mechanics, believable kinds.
    // Fixed map: kinds by sorted index (table order = distCore order).
    // Near = moons (easy), mid = belts, far = planets (rich frontier).
    const PLANET_PALS=[
      {base:'#3b82f6',dark:'#1e3a8a',light:'#bfdbfe',band:'#1d4ed8'},
      {base:'#c2703d',dark:'#5b2b12',light:'#fed7aa',band:'#7c2d12'},
      {base:'#4d9e6b',dark:'#1c4632',light:'#bbf7d0',band:'#166534'},
    ];
    const MOON_PAL={base:'#9aa3b2',dark:'#4b5563',light:'#e2e8f0',band:'#6b7280'};
    const BELT_PAL={base:'#8a7d6b',dark:'#4a4238',light:'#e7dcc3',band:'#5b5344'};
    const DERELICT_PAL={base:'#6b7280',dark:'#1f2937',light:'#9ca3af',band:'#374151'};
    for(let i=0;i<asteroids.length;i++){
      const a=asteroids[i];
      if(i===0) a.parent=CORE;
      else {
        // find closest nearer asteroid within 90 deg cone and nearer distance
        let best=null, bestD=1e9;
        for(let j=0;j<i;j++){
          const b=asteroids[j];
          const d=Math.hypot(a.x-b.x, a.y-b.y);
          const angA=Math.atan2(a.y-CORE.y, a.x-CORE.x);
          const angB=Math.atan2(b.y-CORE.y, b.x-CORE.x);
          let dang=Math.abs(angA-angB); if(dang>Math.PI) dang=2*Math.PI-dang;
          if(dang< 1.3 && d<bestD){ bestD=d; best=b; }
        }
        a.parent = best || CORE;
      }
      a.unlocked=false;
      const tier=Math.floor(i/3);
      let kind=NODE_LAYOUT[i][2]; // hand-authored kind per claim (table is dist-sorted)
      // ancient systems corrupt one outer belt into a derelict hulk
      if(((sysMods.derelicts||0)>0&&i===7)) kind='derelict';
      a.kind=kind;
      if(kind==='moon') a.r=Math.max(12,Math.round(a.r*0.78));
      else if(kind==='planet') a.r=Math.round(a.r*1.4);
      a.pal= kind==='planet'?PLANET_PALS[i%3]:(kind==='moon'?MOON_PAL:(kind==='derelict'?DERELICT_PAL:BELT_PAL));
      // M5: home waters charted, frontier unknown — scouts reveal it
      a.surveyed = tier<2;
      // belt debris chunks: deterministic offsets + silhouette variants, no RNG
      a.chunks= kind==='belt' ? [0,1,2,3].map(k=>({
        dx:(hash01(i*4+k)-0.5)*a.r*2.4, dy:(hash01(i*4+k+9)-0.5)*a.r*2.4,
        s:3+Math.floor(hash01(i*7+k*3)*4), sh:Math.floor(hash01(i*11+k*5)*4)})) : [];
      // STATIC UNIVERSE: sites sit exactly on their worlds (frozen at build).
      // Seeded positions below are the layout; attach + spread refine them.
      a.baseX=a.x; a.baseY=a.y;
      const sh=starHome();
      const svx=a.x-sh.x, svy=a.y-sh.y, sl=Math.hypot(svx,svy)||1;
      a.libX=-svy/sl; a.libY=svx/sl; // unit tangent of the star orbit here
      a.libAmp=22+hash01(i*13+5)*30; // outer worlds sweep wider (22-52px)
      a.libSpd=0.012+hash01(i*17+2)*0.012; // slow breathing, not buzzing
      a.libPh=hash01(i*29+7)*6.28;
    }
    // first ring always reachable (needs just 1 drone, no parent)
    if(asteroids[0]) asteroids[0]._reachable=true;
  }
  // PIXEL CLOUD: the mycelium is a voxel grid growing in from the world rim.
  // (don't wipe the front on window resize - only seed a fresh run/warp)
  if(mycCells.size===0) initMyceliumEdges(false);
  buildSolarSystem();
  attachNodesToBodies(); // worlds own their resources from the first frame
  if(hearts.length===0) placeHearts(3+Math.min(2,galaxy)); // after bodies: real avoidance
  buildPixelSky();
}
function mycCellHP(){
  // voxel hp scales with threat so late-game cloud needs upgraded towers
  return Math.floor(26 + wave*4.5 + galaxy*8 + threatTime*0.22);
}
function mycKey(cx,cy){ return cx+','+cy; }
function mycWorldToCell(x,y){ return {cx:Math.floor(x/PIX), cy:Math.floor(y/PIX)}; }
function mycCellCenter(cx,cy){ return {x:cx*PIX+PIX/2, y:cy*PIX+PIX/2}; }
function mycCols(){ return Math.ceil(WORLD.w/PIX); }
function mycRows(){ return Math.ceil(WORLD.h/PIX); }
// The Bloom is not bound to the old square: cells live in unbounded world
// coordinates. BLOOM_LIMIT is only a memory leash, never a visible wall.
const BLOOM_LIMIT=5200;
function bloomLeashed(x,y){
  return Math.hypot(x-WORLD.w/2,y-WORLD.h/2)>BLOOM_LIMIT;
}
// The Bloom never dies on its own: no decay, no starvation, no old-age.
// The only cell deaths in the game are player kills (damageMyceliumAt),
// run/warp resets, and the one-time birth-fairness clearing below.
// MYC_CAP is backpressure, not a cull: at cap, new growth is REFUSED and
// the organism holds its mass until the player carves into it — then it
// regrows into the freed space. Carve, and it comes back. Ignore it, and it
// sits there. Forever.
const MYC_CAP=24000;
function mycCapped(){ return mycCells.size>=MYC_CAP; }
// DISTANT BLOOM LEDGER: the gameplay cap (MYC_CAP) must never READ as a cap.
// Refused growth isn't lost — it's recorded per 128px chunk as aggregate
// pressure {lx,ly,x,y,pressure}. Far zoom renders pressure as haze; when the
// player purges real voxels (budget frees), pressure materializes back into
// live cells at its recorded ground. Distant fronts keep "growing" in
// aggregate and return as geometry — promotion without simulating everything.
const LEDGER_PX=128, LEDGER_MAX=400;
let bloomLedger=new Map(); // "lx,ly" -> {lx,ly,x,y,pressure}
function ledgerCredit(x,y,n){
  const lx=Math.floor(x/LEDGER_PX), ly=Math.floor(y/LEDGER_PX);
  const k=lx+','+ly;
  let e=bloomLedger.get(k);
  if(!e){
    if(bloomLedger.size>=LEDGER_MAX){
      const first=bloomLedger.keys().next().value;
      if(first!=null) bloomLedger.delete(first);
    }
    e={lx,ly,x:lx*LEDGER_PX+LEDGER_PX/2,y:ly*LEDGER_PX+LEDGER_PX/2,pressure:0};
    bloomLedger.set(k,e);
  }
  e.pressure=Math.min(60,e.pressure+(n||1));
}
function ledgerMaterialize(ddt){
  // convert aggregate pressure back into living voxels when budget allows —
  // throttled to a slow ooze so purging stays meaningful, regrowth inevitable
  ledgerMaterialize.acc=(ledgerMaterialize.acc||0)+ddt;
  if(ledgerMaterialize.acc<0.5) return;
  ledgerMaterialize.acc=0;
  if(mycCapped() || !bloomLedger.size) return;
  let n=0;
  for(const e of bloomLedger.values()){
    if(e.pressure<=0) continue;
    for(let k=0;k<3;k++){
      const ox=(Math.random()-0.5)*180, oy=(Math.random()-0.5)*180;
      const cc=mycWorldToCell(e.x+ox,e.y+oy);
      if(infectCell(cc.cx,cc.cy)){ e.pressure--; break; }
    }
    if(e.pressure<=0) bloomLedger.delete(e.lx+','+e.ly);
    if(++n>=4) break;
  }
}
function infectCell(cx,cy,hp){
  const k=mycKey(cx,cy);
  if(mycCells.has(k)) return false;
  const c=mycCellCenter(cx,cy);
  // keep a safe bubble around the station at spawn; the cloud earns its way in
  if(Math.hypot(c.x-CORE.x,c.y-CORE.y) < CORE.r+34) return false;
  if(bloomLeashed(c.x,c.y)) return false;
  if(mycCapped()){ ledgerCredit(c.x,c.y,1); return false; } // held as pressure, not lost
  const h=hp||mycCellHP();
  mycCells.set(k,{cx,cy,hp:h,maxHp:h,age:0,seed:Math.random()*6.28,slowUntil:0});
  return true;
}
function initMyceliumEdges(seedRing){
  mycCells.clear();
  mycGrowthAcc=0; mycTouchAcc=0; mycWarnAcc=0; mycNearStation=false;
  const cols=mycCols(), rows=mycRows();
  // GRADUAL ARRIVAL: seed a few small edge clusters, not a full border wall —
  // the cloud visibly creeps in over the first minutes instead of popping in.
  const edgeCell=(side,t,inset)=>{
    if(side===0) return [t, inset+Math.floor(Math.random()*3)]; // top
    if(side===1) return [t, rows-1-inset-Math.floor(Math.random()*3)]; // bottom
    if(side===2) return [inset+Math.floor(Math.random()*3), t]; // left
    return [cols-1-inset-Math.floor(Math.random()*3), t]; // right
  };
  const clusters= seedRing? 14 : 9;
  for(let c=0;c<clusters;c++){
    const side=Math.floor(Math.random()*4);
    const along=Math.floor(Math.random()*((side<2?cols:rows)));
    const [sx,sy]=edgeCell(side,along,0);
    const blob=3+Math.floor(Math.random()*3);
    // keep the opening fair: never seed on top of a world (growth can still smother later)
    let placed=0, guard=0;
    while(placed<blob && guard++<14){
      const cx=sx+Math.floor(Math.random()*5)-2, cy=sy+Math.floor(Math.random()*5)-2;
      const cc=mycCellCenter(cx,cy);
      if(mycNearAsteroid(cc.x,cc.y,34)) continue;
      if(infectCell(cx,cy)) placed++;
    }
  }
  if(seedRing){ mycSurge(26); }
}
function mycSurge(n){
  // threat surge: infect n random frontier-adjacent empties
  const keys=mycKeyCache.length?mycKeyCache:[...mycCells.keys()];
  if(!keys.length) return;
  for(let i=0;i<n;i++){
    const k=keys[Math.floor(Math.random()*keys.length)];
    const cell=mycCells.get(k);
    if(!cell) continue;
    const dx=Math.floor(Math.random()*3)-1, dy=Math.floor(Math.random()*3)-1;
    infectCell(cell.cx+dx,cell.cy+dy);
  }
}
/* ===== MYCELIUM HEARTS, CLUSTERS & SPORE PODS (a living organism) ===== */
// There is no finish line: hearts are organs, not objectives. Slaying them
// buys breathing room — the Bloom keeps growing, clustering, and returning.
let hearts=[]; // {x,y,r,hp,maxHp,seed,emitAcc,flash,primary,tendrilAcc} — biological sources
let pods=[];   // {x,y,r,hp,maxHp,seed,emitAcc,flash} — fast spreaders, pop for purge
let clusters=[]; // {x,y,r,age,matureAt,seed,emitAcc,flash,hp,maxHp} — tendril colonies; mature into hearts
let cores=[]; // {x,y,r,hp,maxHp,seed,emitAcc,tendrilAcc,flash} — merged colony organs. Siege them: clear the colony, expose the core.
let podTimer=10;
let mile25=false, mile50=false, mile75=false;
// M9: per-system liberation ledger (reset each run/warp, fed by placeHearts + kills)
let sysHeartsTotal=0, sysHeartsSlain=0, finalPush=false;
// Colony engine: established hearts bud daughters nearby (validated), so the
// Bloom forms dense colonies that can merge — not just scattered singles.
// Capped: tendril/cluster reproduction handles the long range.
let budAcc=25;
// Continuous-expedition cycle: quiet after a clearing, then a whisper, then return.
let bloomCalm=0, nextBloomIn=0, bloomWhispered=false, bloomCycles=0;
function liberationPct(){
  if(sysHeartsTotal<=0) return myceliumPurgePct();
  const slain=Math.min(sysHeartsSlain,sysHeartsTotal);
  if(slain>=sysHeartsTotal) return 100;
  return Math.min(99,Math.round(slain/sysHeartsTotal*70+myceliumPurgePct()*0.3));
}
// M10: warp-map state — pending choice consumed by doWarp, current system mods
let sysMods={ore:1, growth:1, hearts:0, derelicts:0, reward:1};
let sysNameCur='Home';
let pendingSys=null, warpReturn='playing';
function heartHP(){ return Math.floor(300 + wave*20 + galaxy*120 + threatTime*1.2); }
function podHP(){ return Math.floor(90 + wave*6 + galaxy*20); }
// Cohesion rule (hard): every heart spawns inside practical Railgun reach of
// holdable ground — best-case Lv5 precision build + margin. Any linked world
// is a forward firing position, so expansion (not a specific tower) is the ask.
function maxRailgunReach(){
  return 430*(1+permBonus('range'))*Math.pow(1.06,4)*1.25+60;
}
function placeHearts(n){
  n=n+(sysMods.hearts||0); // M10: infested systems grow extra hearts
  hearts=[];
  for(let i=0;i<n;i++){
    const firstPrimary = i===0;
    const pos=findHeartSpot(firstPrimary);
    if(!pos) continue;
    const hp=Math.floor(heartHP()*(firstPrimary?1.6:1));
    hearts.push({x:pos.x,y:pos.y,r:firstPrimary?30:26,hp,maxHp:hp,primary:firstPrimary,seed:Math.random()*6.28,emitAcc:Math.random(),tendrilAcc:8+Math.random()*10,flash:0});
    for(let k=0;k<14;k++) infectCell(Math.floor(pos.x/PIX)+Math.floor(Math.random()*7)-3, Math.floor(pos.y/PIX)+Math.floor(Math.random()*7)-3);
  }
  sysHeartsTotal+=n;
  if(n>0 && state===STATE.PLAYING) logEvent(`<b>♥ ${n} new hearts</b> pulse at the rim. One beats <b>PRIMARY</b> — fortified!`, 'surge');
}
// The maximum fully-upgraded Railgun reach defines the maximum valid distance
// for a newly spawned heart: every heart must have at least one firing
// solution from holdable ground. Candidates are validated; rejects are retried.
// A Bloom Core commands its territory: no new heart roots in its shadow.
// (Cores themselves still form by merge — that IS the colony condensing.)
const CORE_EXCLUDE=420;
function validHeartSpot(x,y){
  if(bloomLeashed(x,y)) return false;
  if(Math.hypot(x-CORE.x,y-CORE.y)<220) return false; // never on the doorstep
  for(const c of cores){ if(Math.hypot(x-c.x,y-c.y)<CORE_EXCLUDE) return false; } // a core's ground
  for(const o of outposts){ if(Math.hypot(x-o.x,y-o.y)<o.r+40) return false; } // not on a foothold
  for(const a of asteroids){ if(Math.hypot(x-a.x,y-a.y)<a.r+40) return false; } // not inside a world
  for(const p of planets){
    if(Math.hypot(x-p.x,y-p.y)<p.r+40) return false; // not inside a planet
    for(const m of p.moons){ if(Math.hypot(x-m.x,y-m.y)<m.r+30) return false; }
  }
  if(star && Math.hypot(x-star.x,y-star.y)<star.r+40) return false;
  const maxR=maxRailgunReach();
  if(Math.hypot(x-CORE.x,y-CORE.y)<=maxR) return true;
  for(const w of asteroids){
    if(w.distCore>(hangarUplink()+200)) continue; // must stay linkable
    if(Math.hypot(x-w.x,y-w.y)<=maxR) return true;
  }
  return false;
}
function findHeartSpot(firstPrimary){
  // Ring candidates pulled inside defensive reach; invalid ones are rejected.
  for(let t=0;t<40;t++){
    const ang=Math.random()*Math.PI*2;
    const rad=420+Math.random()*620+Math.min(420,threatTime*0.35);
    let x=WORLD.w/2+Math.cos(ang)*rad, y=WORLD.h/2+Math.sin(ang)*rad*0.94;
    const maxR=maxRailgunReach();
    let nx=CORE.x, ny=CORE.y, nd=Math.hypot(x-CORE.x,y-CORE.y);
    for(const w of asteroids){
      if(w.distCore>(hangarUplink()+200)) continue;
      const d=Math.hypot(x-w.x,y-w.y);
      if(d<nd){ nd=d; nx=w.x; ny=w.y; }
    }
    if(nd>maxR){
      const f=maxR*0.90/nd;
      x=nx+(x-nx)*f; y=ny+(y-ny)*f;
    }
    if(validHeartSpot(x,y)) return {x,y};
  }
  // Fallback: just inside reach off the nearest linkable world.
  const maxR=maxRailgunReach()*0.85;
  for(const w of asteroids){
    if(w.distCore>(hangarUplink()+200)) continue;
    const x=w.x+maxR*0.7, y=w.y-maxR*0.4;
    if(validHeartSpot(x,y)) return {x,y};
  }
  const fx=CORE.x+maxR*0.7, fy=CORE.y-maxR*0.4;
  return validHeartSpot(fx,fy)?{x:fx,y:fy}:null;
}
function bloomRepose(){
  // The clearing breathes: reward, quiet, then a whisper of return.
  // Internal pressure (threatTime/wave) NEVER resets — the Bloom only rests.
  bloomCycles++;
  const bonus=40+Math.min(120,bloomCycles*15);
  coins+=bonus;
  addNum(CORE.x,CORE.y-CORE.r-20,`QUIET +${bonus}g`,'#e9d5ff');
  addParticles(CORE.x,CORE.y,30,'#e9d5ff',140);
  logEvent('<b>The system exhales.</b> The network recoils… for now.', 'good');
  setTimeout(()=>{ if(state===STATE.PLAYING) logEvent('…wait.', 'info'); }, 2500);
  bloomCalm=6;
  nextBloomIn=Math.max(38, 68-bloomCycles*4-Math.min(20,threatTime/60));
  bloomWhispered=false;
  finalPush=false;
}
function updateBloomCycle(ddt){
  if(state!==STATE.PLAYING || !defenseEstablished) return;
  if(bloomCalm>0){ bloomCalm-=ddt; return; }
  // Budding: an established heart roots a daughter nearby — colonies form,
  // colonies can merge. Capped so tendril/cluster play owns the long range.
  budAcc+=ddt;
  if(budAcc>50 && hearts.length>0 && hearts.length+cores.length<8 && clusters.length<6){
    budAcc=0;
    const h=hearts[Math.floor(Math.random()*hearts.length)];
    for(let k=0;k<6;k++){
      const a=Math.random()*Math.PI*2, rr=180+Math.random()*120;
      const bx=h.x+Math.cos(a)*rr, by=h.y+Math.sin(a)*rr;
      if(!validHeartSpot(bx,by)) continue;
      const hp=Math.floor(heartHP()*0.9);
      hearts.push({x:bx,y:by,r:26,hp,maxHp:hp,primary:false,seed:Math.random()*6.28,emitAcc:0,tendrilAcc:10,flash:0});
      sysHeartsTotal++;
      for(let q=0;q<10;q++) infectCell(Math.floor(bx/PIX)+Math.floor(Math.random()*7)-3, Math.floor(by/PIX)+Math.floor(Math.random()*7)-3);
      logEvent('<b>A heart buds a daughter colony nearby.</b> Density is building — break clusters early.', 'surge');
      addParticles(bx,by,20,'#fb7185',120);
      break;
    }
  }
  if(hearts.length>0 || cores.length>0 || clusters.length>6) return; // organism present
  // Only the true quiet schedules a return — clusters maturing handle the rest.
  if(hearts.length===0 && clusters.length===0){
    if(nextBloomIn<=0) return;
    nextBloomIn-=ddt;
    if(!bloomWhispered && nextBloomIn<14){
      bloomWhispered=true;
      logEvent('A drone reports movement at the rim. Probably nothing.', 'surge');
      SFX.tremorSnd();
    }
    if(nextBloomIn<=0){
      const n = threatTime>420 ? 2 : 1;
      const placed=[];
      for(let i=0;i<n;i++){ const s=findHeartSpot(i===0); if(s) placed.push(s); }
      for(let i=0;i<placed.length;i++){
        const s=placed[i], hp=Math.floor(heartHP()*(i===0?1.3:1));
        hearts.push({x:s.x,y:s.y,r:i===0?28:26,hp,maxHp:hp,primary:i===0,seed:Math.random()*6.28,emitAcc:0,tendrilAcc:10,flash:0});
        for(let k=0;k<14;k++) infectCell(Math.floor(s.x/PIX)+Math.floor(Math.random()*7)-3, Math.floor(s.y/PIX)+Math.floor(Math.random()*7)-3);
        sysHeartsTotal++;
      }
      if(placed.length){
        logEvent(`<b>Oh. It's coming back.</b> ${placed.length===1?'A new heart roots':'New hearts root'} at the rim.`, 'surge');
        toast('♥ NEW GROWTH AT THE RIM', 'surge');
        SFX.sting();
      }
      nextBloomIn=0;
    }
  }
}
// HEART → TENDRIL → CLUSTER → NEW HEART: each heart periodically reaches out.
// Tendrils are persistent travelers: they visibly grow from the heart across
// space (up to ~900px), branch, infect cells along their path, and may seed a
// cluster at the tip — even inside the fog. Mature clusters root into hearts.
let tendrils=[]; // {pts, ang, speed, maxLen, traveled, wob, seed, branched, acc, hp, maxHp, stun, tipFlash, root?}
const TENDRIL_MAX=16;
function tendrilHP(){ return Math.floor(50 + wave*3 + threatTime*0.15); }
// lenOverride/angOverride: cores grow short fixed ROOTS (real travelers with
// cut-down range) alongside their long-range tendrils. Roots infect, stall
// and sever exactly like any tendril — they ARE regular mycelium.
// rootFlag {slot, core}: crown roots never branch; on arrival they go dormant
// in place instead of fading.
function heartTendril(h, lenOverride, angOverride, rootFlag){
  if(activeTendrils()>=TENDRIL_MAX) return;
  // Aim: the two networks collide — outposts under genuine threat get
  // targeted too, otherwise asteroids, otherwise into the dark.
  let ang=angOverride!=null?angOverride:Math.random()*Math.PI*2;
  if(angOverride==null){
    const liveOut=outposts.filter(o=>o.hp>0);
    const roll=Math.random();
    if(liveOut.length && roll<0.3){
      const t=liveOut[Math.floor(Math.random()*liveOut.length)];
      ang=Math.atan2(t.y-h.y, t.x-h.x)+(Math.random()-0.5)*0.6;
    } else if(asteroids.length && roll<0.65){
      const t=asteroids[Math.floor(Math.random()*asteroids.length)];
      ang=Math.atan2(t.y-h.y, t.x-h.x)+(Math.random()-0.5)*0.6;
    }
  }
  const hp=tendrilHP();
  tendrils.push({pts:[{x:h.x,y:h.y}], ang, speed:26+Math.random()*10,
    maxLen:lenOverride!=null?lenOverride:(480+Math.random()*320+Math.min(300,threatTime*0.25)),
    traveled:0, wob:Math.random()*6.28, seed:Math.random()*6.28, branched:!!rootFlag, acc:0,
    hp, maxHp:hp, stun:0, tipFlash:0, fromCore:cores.includes(h),
    root:rootFlag||null, slot:rootFlag?rootFlag.slot:0, core:rootFlag?rootFlag.core:null});
}
// visuals only: newest dormant threads are kept (cells persist regardless)
function pruneDormant(){
  let dc=0;
  for(const o of tendrils) if(o.dormant) dc++;
  if(dc>40){
    for(let j=0;j<tendrils.length;j++){
      if(tendrils[j].dormant){ tendrils.splice(j,1); break; }
    }
  }
}
function seedClusterAt(tipX,tipY,ch){
  // Strategic window ("something is growing"): allowed NEAR nodes (pressure!)
  // but never inside one, never on the doorstep, never beyond the leash.
  // ch: establishment chance (cores pass high; others default 1).
  if(clusters.length>=7 || bloomLeashed(tipX,tipY)) return;
  if(Math.hypot(tipX-CORE.x,tipY-CORE.y)<180) return;
  for(const a of asteroids){ if(Math.hypot(tipX-a.x,tipY-a.y)<a.r+6) return; }
  for(const c of cores){ if(Math.hypot(tipX-c.x,tipY-c.y)<200) return; } // the core's own colony covers this ground
  if(Math.random()>(ch==null?1:ch)) return; // default 1: callers hold their own lotteries
  const hp=Math.floor(70+wave*4+threatTime*0.35);
  clusters.push({x:tipX,y:tipY,r:12,age:0,matureAt:55+Math.random()*40,seed:Math.random()*6.28,emitAcc:0,flash:0,hp,maxHp:hp});
  logEvent('SENSOR — <b>new growth</b> spreading. Burn it before it roots.', 'surge');
  addParticles(tipX,tipY,10,'#c084fc',80);
}
// Counterplay: a growing tip can be SHOT. Hits stagger it (growth stalls
// while nursing the wound); enough damage severs it outright.
// SEVERED ≠ DELETED: the traveler halts and its thread goes dormant, but
// every voxel it laid down REMAINS as territory. Dormant threads are visuals
// only (capped); the colony is what you must still purge.
function activeTendrils(){ let n=0; for(const t of tendrils) if(!t.done) n++; return n; }
function tendrilTipAt(x,y,r){
  for(const t of tendrils){
    if(t.done) continue;
    const tip=t.pts[t.pts.length-1];
    if(tip && Math.hypot(tip.x-x,tip.y-y) < r+10) return t;
  }
  return null;
}
function damageTendrilsAt(wx,wy,dmg,radius){
  let hit=false;
  for(let i=tendrils.length-1;i>=0;i--){
    const t=tendrils[i];
    const tip=t.pts[t.pts.length-1];
    if(!tip) continue;
    if(Math.hypot(tip.x-wx,tip.y-wy) > radius+10) continue;
    hit=true;
    t.hp-=dmg; t.stun=Math.max(t.stun||0,0.6); t.tipFlash=0.15;
    totalDamage+=Math.min(dmg,Math.max(0,t.hp+dmg));
    if(t.hp<=0 && !t.done){
      // severed: halt forever, thread goes dormant, territory REMAINS
      t.done=true; t.dormant=true; t.fade=1.5; t.tipFlash=0;
      kills++; purgeTotal+=2;
      addParticles(tip.x,tip.y,18,'#c084fc',130);
      addNum(tip.x,tip.y-12,'SEVERED','#e9d5ff');
      SFX.kill();
      checkMilestones();
      pruneDormant();
    }
  }
  return hit;
}
function updateTendrils(ddt){
  for(let i=tendrils.length-1;i>=0;i--){
    const t=tendrils[i];
    if(t.done) continue; // settling — fade loop below retires it
    if(t.tipFlash>0) t.tipFlash-=ddt;
    if(t.stun>0){ t.stun-=ddt; continue; } // shot tip stalls — fight back window
    const tip=t.pts[t.pts.length-1];
    const step=t.speed*ddt;
    t.wob+=ddt*1.7;
    const wobA=Math.sin(t.wob)*0.35;
    const nx=tip.x+Math.cos(t.ang+wobA)*step, ny=tip.y+Math.sin(t.ang+wobA)*step;
    t.traveled+=step;
    t.pts.push({x:nx,y:ny});
    if(t.pts.length>220) t.pts.shift(); // bounded trail memory
    // infect the path: the tendril leaves living cells behind it
    t.acc+=step;
    if(t.acc>13){
      t.acc=0;
      const cc=mycWorldToCell(nx,ny);
      infectCell(cc.cx,cc.cy);
      if(Math.random()<0.3) infectCell(cc.cx+(Math.random()<0.5?1:-1),cc.cy+(Math.random()<0.5?1:-1));
    }
    // branch once, mid-journey: Heart A ── tendril ── Cluster ╲ Heart B
    if(!t.branched && t.traveled>t.maxLen*0.4 && activeTendrils()<TENDRIL_MAX && Math.random()<0.012){
      t.branched=true;
      const bhp=Math.max(20,Math.floor(t.maxHp*0.6));
      tendrils.push({pts:[{x:nx,y:ny}], ang:t.ang+(Math.random()<0.5?1:-1)*(0.6+Math.random()*0.4),
        speed:t.speed*0.9, maxLen:t.maxLen*0.55, traveled:0, wob:Math.random()*6.28,
        seed:Math.random()*6.28, branched:true, acc:0, hp:bhp, maxHp:bhp, stun:0, tipFlash:0, fromCore:t.fromCore});
    }
    // arrival: the tip roots a cluster and the traveler settles — its thread
    // fades out over seconds while the voxel colony it laid down REMAINS.
    // Core roots instead go dormant in place: the crown persists as visible
    // settled threads (same dormant state as severed tendrils).
    if(t.traveled>=t.maxLen || bloomLeashed(nx,ny)){
      // Core travelers push PAST the no-grow zone (long range) and establish
      // reliably; heart travelers keep the old lottery.
      if(!bloomLeashed(nx,ny)){
        if(t.fromCore) seedClusterAt(nx,ny,0.9);
        else if(Math.random()<0.7) seedClusterAt(nx,ny);
      }
      t.done=true;
      if(t.root){ t.dormant=true; t.fade=1.5; pruneDormant(); }
      else t.fade=2.5;
    }
  }
  // settling + dormant threads retire here; the main loop skips done ones.
  // arrivals fade out, severed threads persist (capped at sever time).
  for(let i=tendrils.length-1;i>=0;i--){
    const t=tendrils[i];
    if(!t.done||t.dormant) continue;
    t.fade-=ddt;
    if(t.fade<=0) tendrils.splice(i,1);
  }
}
function updateClusters(ddt){
  for(let i=clusters.length-1;i>=0;i--){
    const c=clusters[i];
    c.age+=ddt;
    if(c.flash>0) c.flash-=ddt;
    c.emitAcc=(c.emitAcc||0)+ddt;
    if(c.emitAcc>2.6){
      c.emitAcc=0;
      const cc=mycWorldToCell(c.x,c.y);
      infectCell(cc.cx+Math.floor(Math.random()*5)-2, cc.cy+Math.floor(Math.random()*5)-2);
    }
    // Maturation: a rooted cluster becomes a heart (validated — never unreachable).
    if(c.age>=c.matureAt){
      const spot = validHeartSpot(c.x,c.y) ? {x:c.x,y:c.y} : findHeartSpot(false);
      if(spot){
        const hp=Math.floor(heartHP()*0.9);
        hearts.push({x:spot.x,y:spot.y,r:26,hp,maxHp:hp,primary:false,seed:Math.random()*6.28,emitAcc:0,tendrilAcc:12,flash:0});
        sysHeartsTotal++;
        logEvent('<b>A cluster roots into a new heart.</b> It is learning.', 'surge');
        toast('♥ A CLUSTER BECAME A HEART', 'surge');
        SFX.sting();
        addParticles(spot.x,spot.y,26,'#fb7185',150);
      }
      clusters.splice(i,1);
    }
  }
}
// ===== BLOOM CORES: dense colonies evolve. 3+ hearts holding together inside
// CORE_MERGE_R with living mycelium between them, stable for MERGE_HOLD
// seconds, begin a visible merge — then one siege organ takes root.
// The core is NOT a big heart: it grows a regenerating colony shield (damage
// to the core scales down while the colony is dense — clear it first) while
// sending long-range tendrils. Killing it removes the SOURCE; all territory,
// threads and clusters remain for reclaiming.
const CORE_MERGE_R=260, CORE_MERGE_HOLD=20, CORE_MERGE_DUR=8;
let merging=null; // {members:[heart refs], t, x, y} | null
let mergeSig='', mergeHold=0, mergeAcc=0;
function coreHP(){ return Math.floor(heartHP()*4.5); }
// While a Bloom Core lives, the WHOLE organism quickens: faster creep,
// faster tendrils everywhere, more pods, harder surges. Kill the core and
// the pressure lifts. This is the "oh shit" tax for letting one root.
function corePressure(){ return Math.min(3, cores.length); }
function updateMerge(ddt){
  mergeAcc+=ddt;
  if(mergeAcc<1) { if(merging) tickMerge(ddt); return; }
  mergeAcc=0;
  if(merging){ tickMerge(ddt); return; }
  if(hearts.length<3 || state!==STATE.PLAYING || !defenseEstablished) { mergeSig=''; mergeHold=0; for(const h of hearts) h.mergeSync=false; return; }
  // greedy colony: seed from each heart, absorb neighbours in radius
  const groups=[];
  const used=new Set();
  for(let i=0;i<hearts.length;i++){
    if(used.has(i)) continue;
    const g=[i]; used.add(i);
    for(let j=0;j<hearts.length;j++){
      if(used.has(j)) continue;
      if(g.some(k=>Math.hypot(hearts[k].x-hearts[j].x,hearts[k].y-hearts[j].y)<CORE_MERGE_R)){ g.push(j); used.add(j); }
    }
    if(g.length>=3) groups.push(g);
  }
  if(!groups.length){ mergeSig=''; mergeHold=0; for(const h of hearts) h.mergeSync=false; return; }
  // richest colony first: most hearts, then most surrounding mycelium
  groups.sort((a,b)=>b.length-a.length);
  const g=groups[0];
  const cx=g.reduce((n,k)=>n+hearts[k].x,0)/g.length;
  const cy=g.reduce((n,k)=>n+hearts[k].y,0)/g.length;
  if(countVoxelsNear(cx,cy,CORE_MERGE_R*0.75)<25){ mergeSig=''; mergeHold=0; for(const h of hearts) h.mergeSync=false; return; } // connected by living growth, not just near
  const sig=g.slice().sort((a,b)=>a-b).join(',');
  if(sig===mergeSig) mergeHold+=1;
  else { mergeSig=sig; mergeHold=1; for(const h of hearts) h.mergeSync=false; }
  for(const k of g){ const h=hearts[k]; if(h) h.mergeSync=true; }
  if(mergeHold>=CORE_MERGE_HOLD && state===STATE.PLAYING){
    merging={members:g.map(k=>hearts[k]).filter(Boolean), t:0, x:cx, y:cy};
    mergeSig=''; mergeHold=0;
    logEvent('<b>♥♥♥ The Bloom is merging.</b> Something large is taking root — break it apart NOW.', 'surge');
    toast('♥♥♥ MERGE IN PROGRESS — KILL ONE HEART', 'surge');
    SFX.sting(); shake=Math.min(8,shake+3);
  }
}
function tickMerge(ddt){
  const m=merging;
  if(!m) return;
  // abort if the player broke the colony mid-merge
  m.members=m.members.filter(h=>hearts.includes(h));
  if(m.members.length<3){
    for(const h of hearts) h.mergeSync=false;
    merging=null;
    logEvent('Merge disrupted — the colony scatters.', 'good');
    return;
  }
  m.t+=ddt;
  const cx=m.members.reduce((n,h)=>n+h.x,0)/m.members.length;
  const cy=m.members.reduce((n,h)=>n+h.y,0)/m.members.length;
  m.x=cx; m.y=cy;
  // densify between them: the mass they disappear into
  const cc=mycWorldToCell(cx,cy);
  for(let k=0;k<4;k++) infectCell(cc.cx+Math.floor(Math.random()*11)-5, cc.cy+Math.floor(Math.random()*11)-5);
  if(Math.random()<0.4) addParticles(cx+(Math.random()-0.5)*120,cy+(Math.random()-0.5)*120,3,'#c084fc',60);
  if(m.t>=CORE_MERGE_DUR){
    for(const h of m.members){
      const hi=hearts.indexOf(h);
      if(hi>=0){ hearts.splice(hi,1); sysHeartsSlain++; }
    }
    for(const h of hearts) h.mergeSync=false;
    const hp=coreHP();
    cores.push({x:cx,y:cy,r:46,hp,maxHp:hp,seed:Math.random()*6.28,emitAcc:0,tendrilAcc:3,flash:0});
    sysHeartsTotal++;
    merging=null;
    addParticles(cx,cy,60,'#881337',220);
    addParticles(cx,cy,40,'#e9d5ff',180);
    shake=9; SFX.boom();
    logEvent('<b>◉ A BLOOM CORE has rooted.</b> Siege it: clear the colony, expose the core — the territory stays even if it falls.', 'surge');
    toast('◉ BLOOM CORE ROOTED', 'surge');
    if(hearts.length===0 && cores.length>0){ finalPush=true; }
  }
}
function updateCores(ddt){
  for(const c of cores){
    if(c.flash>0) c.flash-=ddt;
    // LOCAL growth: dense regenerating colony shield around the core.
    // A core out-grows a heart several times over — its ground is expensive.
    c.emitAcc=(c.emitAcc||0)+ddt;
    if(c.emitAcc>0.4){
      c.emitAcc=0;
      const cc=mycWorldToCell(c.x,c.y);
      for(let k=0;k<7;k++) infectCell(cc.cx+Math.floor(Math.random()*17)-8, cc.cy+Math.floor(Math.random()*17)-8);
    }
    // LONG-RANGE growth: tendrils keep leaving the colony (faster than hearts).
    // Core travelers run LONG (guaranteed past the no-grow zone) so the core
    // seeds distant clusters — this is the threat that keeps spreading.
    c.tendrilAcc=(c.tendrilAcc==null?4:c.tendrilAcc)-ddt;
    if(c.tendrilAcc<=0){
      c.tendrilAcc=Math.max(4, 10-threatTime*0.012-wave*0.3);
      const farLen=520+Math.random()*380+Math.min(300,threatTime*0.25);
      heartTendril(c, farLen);
      if(Math.random()<0.45) heartTendril(c, farLen);
    }
    // ROOTS: the visible crown around the core is real. Short travelers on
    // fixed slots push living voxels just past the colony, then settle into
    // dormant threads — shootable, stallable, severable, like any tendril.
    // One root per slot, ever: settled roots hold their slot, severed slots
    // stay cleared. Purging the crown is permanent progress.
    c.rootAcc=(c.rootAcc==null?1:c.rootAcc)-ddt;
    if(c.rootAcc<=0){
      c.rootAcc=2.2;
      c.rootSlot=((c.rootSlot||0)+1)%8;
      const slotTaken=tendrils.some(o=>o.root&&o.core===c&&o.slot===c.rootSlot);
      let liveRoots=0;
      for(const t of tendrils) if(t.root && !t.done) liveRoots++;
      if(!slotTaken && liveRoots<8) heartTendril(c, 150, c.seed+c.rootSlot*Math.PI*2/8, {slot:c.rootSlot, core:c});
    }
  }
  updateMerge(ddt);
}
function spawnPod(){
  const keys=[...mycCells.keys()];
  if(!keys.length) return;
  const cell=mycCells.get(keys[Math.floor(Math.random()*keys.length)]);
  if(!cell) return;
  const c=mycCellCenter(cell.cx,cell.cy);
  const x=c.x+(Math.random()-0.5)*60, y=c.y+(Math.random()-0.5)*60;
  if(bloomLeashed(x,y)) return;
  if(Math.hypot(x-CORE.x,y-CORE.y)<140) return;
  const hp=podHP();
  pods.push({x,y,r:14,hp,maxHp:hp,seed:Math.random()*6.28,emitAcc:0,flash:0});
  addParticles(x,y,8,'#f0abfc',70);
}
function entityAtWorld(x,y,r){
  for(const p of pods){ if(Math.hypot(p.x-x,p.y-y) < r+p.r) return p; }
  for(const c of clusters){ if(Math.hypot(c.x-x,c.y-y) < r+c.r) return c; }
  for(const h of hearts){ if(Math.hypot(h.x-x,h.y-y) < r+h.r) return h; }
  for(const c of cores){ if(Math.hypot(c.x-x,c.y-y) < r+c.r) return c; }
  return null;
}
function damageEntitiesAt(wx,wy,dmg,radius,opts){
  opts=opts||{};
  let hit=false;
  for(let i=pods.length-1;i>=0;i--){
    const p=pods[i];
    if(Math.hypot(p.x-wx,p.y-wy) > radius+p.r) continue;
    hit=true; p.hp-=dmg; p.flash=0.12; totalDamage+=dmg;
    if(p.hp<0) overkill+=-p.hp;
    if(p.hp<=0){
      pods.splice(i,1); kills++; purgeTotal+=5;
      coins+=12; addNum(p.x,p.y-10,'+12g • POPPED','#f0abfc');
      addParticles(p.x,p.y,16,'#f0abfc',110); SFX.kill();
      logEvent('Spore pod popped! (+5 purge)', 'good');
      checkMilestones();
    }
  }
  for(let i=clusters.length-1;i>=0;i--){
    const c=clusters[i];
    if(Math.hypot(c.x-wx,c.y-wy) > radius+c.r) continue;
    hit=true; c.hp-=dmg; c.flash=0.12; totalDamage+=dmg;
    if(c.hp<0) overkill+=-c.hp;
    addParticles(c.x,c.y,3,opts.color||'#c084fc',50);
    if(c.hp<=0){
      clusters.splice(i,1); kills++; purgeTotal+=8;
      coins+=18; addNum(c.x,c.y-10,'GROWTH BURNED +18g','#c084fc');
      addParticles(c.x,c.y,20,'#c084fc',120); SFX.kill();
      logEvent('Growth burned before it could root. (+8 purge)', 'good');
      checkMilestones();
    }
  }
  for(let i=hearts.length-1;i>=0;i--){
    const h=hearts[i];
    if(Math.hypot(h.x-wx,h.y-wy) > radius+h.r) continue;
    hit=true; h.hp-=dmg; h.flash=0.12; totalDamage+=dmg;
    if(h.hp<0) overkill+=-h.hp;
    addParticles(h.x,h.y,3,opts.color||'#fb7185',50);
    if(h.hp<=0){
      hearts.splice(i,1); kills++; bossesKilled++; sysHeartsSlain++;
      const pb=h.primary?25:0; // M9: primary pays extra bounty
      purgeTotal+=25+pb;
      coins+=40+(h.primary?20:0); addNum(h.x,h.y-16,h.primary?'PRIMARY SLAIN +60g':'HEART SLAIN +40g','#fb7185');
      addParticles(h.x,h.y,40,'#fb7185',170); SFX.kill(); shake=Math.min(7,shake+4);
      logEvent(`<b>♥ ${h.primary?'PRIMARY ':''}HEART SLAIN!</b> ${hearts.length} remaining. (+${25+pb} purge)`, 'good');
      checkMilestones();
      if(hearts.length===1 && !finalPush && cores.length===0){ finalPush=true; logEvent('<b>The last heart screams.</b> The cloud surges!', 'surge'); SFX.sting(); }
      if(hearts.length===0 && cores.length===0){
        // Continuous expedition: no finish screen, no mandatory choice.
        // The quiet is the reward — and the warning.
        bloomRepose(); return true;
      }
    }
  }
  for(let i=cores.length-1;i>=0;i--){
    const c=cores[i];
    if(Math.hypot(c.x-wx,c.y-wy) > radius+c.r) continue;
    // COLONY SHIELD: dense growth around the core absorbs fire. Clear the
    // colony to expose the core — minimum 20% damage always gets through.
    const shield=countVoxelsNear(c.x,c.y,110);
    const scale=1-0.8*Math.min(1,shield/48);
    const dealt=Math.floor(dmg*scale);
    hit=true; c.hp-=dealt; c.flash=0.12; totalDamage+=dealt;
    if(dealt<dmg*0.9 && Math.random()<0.15) addNum(c.x,c.y-c.r-12,'SHIELDED','#c084fc');
    if(c.hp<0) overkill+=-c.hp;
    addParticles(c.x,c.y,4,opts.color||'#881337',60);
    if(c.hp<=0){
      cores.splice(i,1); kills++; bossesKilled++; sysHeartsSlain++;
      purgeTotal+=60;
      coins+=120; addNum(c.x,c.y-20,'CORE DESTROYED +120g','#e9d5ff');
      addParticles(c.x,c.y,70,'#881337',220); addParticles(c.x,c.y,40,'#e9d5ff',180);
      SFX.boom(); shake=Math.min(9,shake+5);
      logEvent('<b>◉ BLOOM CORE DESTROYED.</b> The source is gone — but every voxel, thread and cluster it made REMAINS. Reclaim the ground.', 'good');
      toast('◉ CORE DOWN — RECLAIM THE GROUND', 'good');
      checkMilestones();
      if(hearts.length===0 && cores.length===0){ bloomRepose(); return true; }
    }
  }
  return hit;
}
function checkMilestones(){
  const pct=myceliumPurgePct();
  if(!mile25 && pct>=25){ mile25=true; logEvent('PURGE MILESTONE — 25% // +30g', 'good'); coins+=30; SFX.coin(); }
  if(!mile50 && pct>=50){ mile50=true; logEvent('PURGE MILESTONE — 50% // +50g', 'good'); coins+=50; SFX.coin(); }
  if(!mile75 && pct>=75){ mile75=true; logEvent('PURGE MILESTONE — 75% // +80g', 'good'); coins+=80; SFX.coin(); }
}
function mycNearAsteroid(x,y,pad){
  for(const a of asteroids){ if(Math.hypot(a.x-x,a.y-y) < a.r+(pad||30)) return a; }
  return null;
}
function myceliumMass(){ return mycCells.size; }
function myceliumPurgePct(){ return Math.min(100,Math.floor(purgeTotal/Math.max(1,purgeGoal)*100)); }
function isAsteroidBlocked(a){
  // a world is smothered when any live voxel overlaps its BODY
  const f=nodeFocus(a);
  const c0=mycWorldToCell(f.x-f.r-4,f.y-f.r-4), c1=mycWorldToCell(f.x+f.r+4,f.y+f.r+4);
  for(let cx=c0.cx;cx<=c1.cx;cx++) for(let cy=c0.cy;cy<=c1.cy;cy++){
    const cell=mycCells.get(mycKey(cx,cy));
    if(!cell) continue;
    const c=mycCellCenter(cx,cy);
    if(Math.hypot(c.x-f.x,c.y-f.y) < f.r+PIX*0.6) return true;
  }
  return false;
}
function myceliumAtWorld(x,y,r){
  const c0=mycWorldToCell(x-(r||4),y-(r||4)), c1=mycWorldToCell(x+(r||4),y+(r||4));
  for(let cx=c0.cx;cx<=c1.cx;cx++) for(let cy=c0.cy;cy<=c1.cy;cy++){
    const cell=mycCells.get(mycKey(cx,cy));
    if(!cell) continue;
    const c=mycCellCenter(cx,cy);
    if(Math.hypot(c.x-x,c.y-y) < (r||4)+PIX*0.5) return cell;
  }
  return null;
}
// damage every voxel whose center falls inside radius; returns cleared count
function damageMyceliumAt(wx,wy,dmg,radius,opts){
  opts=opts||{};
  const now=performance.now()*0.001;
  const c0=mycWorldToCell(wx-radius,wy-radius), c1=mycWorldToCell(wx+radius,wy+radius);
  let cleared=0;
  for(let cx=c0.cx;cx<=c1.cx;cx++) for(let cy=c0.cy;cy<=c1.cy;cy++){
    const k=mycKey(cx,cy);
    const cell=mycCells.get(k);
    if(!cell) continue;
    const c=mycCellCenter(cx,cy);
    if(Math.hypot(c.x-wx,c.y-wy) > radius) continue;
    if(opts.slowDur) cell.slowUntil=now+opts.slowDur;
    cell.hp-=dmg;
    cell.flash=0.12;
    if(cell.hp<=0){
      if(cell.hp<0) overkill+=-cell.hp;
      mycCells.delete(k);
      cleared++;
      kills++;
      purgeTotal++;
      const gain=opts.coinPerCell!=null?opts.coinPerCell:(2+Math.floor(Math.random()*2)+(wave>=10?1:0));
      coins+=gain;
      totalDamage+=cell.maxHp;
      addParticles(c.x,c.y,4,opts.color||'#e9d5ff',60);
      if(Math.random()<0.10) addNum(c.x,c.y-6,'+'+gain+'g','#e9d5ff');
      checkMilestones();
    } else {
      totalDamage+=dmg;
      if(Math.random()<0.25) addParticles(c.x,c.y,1,opts.color||'#a855f7',30);
    }
  }
  return cleared;
}
function myceliumVisible(){
  // the network is always visible in-game (zoom out and see it!) —
  // it only starts GROWING once your first weapon wakes it up
  return state===STATE.PLAYING || state===STATE.PAUSED;
}
function myceliumBurnThreshold(){ return mycCellHP(); }
function hangarLevels(){ let h=0; for(const t of towers) if(t.mod==='hangar') h+=t.level; return h; }
function hangarLogistics(){
  const levels=hangarLevels();
  const bay=towers.find(t=>t.mod==='hangar'&&t.branch);
  const throughput=bay?.branch==='throughput' ? 1 : 0;
  const range=bay?.branch==='range' ? 1 : 0;
  return {levels, throughput, range};
}
// Hangar uplink: each Hangar level extends how far from the Station
// drones can be sent directly — the key to branching toward the rim.
// The Navigation Array (station tech) adds fine-grained reach on top.
// RANGE-path bays (Lv3+) add a second +120 each.
function hangarUplink(){
  const logistics=hangarLogistics();
  let u=190+logistics.levels*130;
  if(logistics.range) u+=120;
  return u+(stationTech.nav||0)*35;
}
// THROUGHPUT-path bays improve mining interval and delivery value.
function throughputMult(){
  const logistics=hangarLogistics();
  return logistics.throughput ? Math.max(0.72, 0.94-0.025*Math.max(0,logistics.levels-3)) : 1;
}
function droneYieldBonus(){
  const logistics=hangarLogistics();
  return logistics.throughput ? Math.floor(Math.max(0,logistics.levels-2)/2) : 0;
}
function logisticsSpeedMult(){
  const logistics=hangarLogistics();
  return droneSpeedMult()*(1+0.04*Math.max(0,logistics.levels-1));
}
// Command Center: coordinated crews fly faster (drones + scouts).
function droneSpeedMult(){ return 1+0.08*((stationTech&&stationTech.command)||0); }
// relay hop: any LINKED world within 300px can bounce drones outward,
// so the lane network branches instead of forcing one strict chain
function relayHop(a){
  let best=null, bestD=1e9;
  for(const b of asteroids){
    if(b===a || !b.unlocked) continue;
    const d=Math.hypot(a.x-b.x, a.y-b.y);
    if(d<300 && d<bestD){ bestD=d; best=b; }
  }
  return best;
}
// M2: resource-location naming. Internal ids (asteroids, targetAsteroid)
// stay as-is; only player-facing strings use these.
function nodeKind(a){ return a.kind||'belt'; }
// Worlds own their resources: an attached site takes its world's name
// (Kharos, Kharos II…) instead of a floating "Planet 7" label.
function nodeName(a){
  if(a.body && a.body.name && (a.bodyKind==='planet'||a.bodyKind==='moon'))
    return a.slot>0 ? a.body.name+' ·S'+(a.slot+1) : a.body.name;
  const k=nodeKind(a), n=asteroids.indexOf(a)+1;
  return (k==='moon'?'Moon ':k==='planet'?'Planet ':k==='derelict'?'Derelict ':'Belt ')+n;
}
// Resource identity reuses the existing economy — no new resource system.
function nodeResource(a){
  const k=nodeKind(a);
  return k==='moon'?'ICE':k==='planet'?'ORE':k==='derelict'?'SALVAGE':'METALS';
}
function nodeTag(a){
  const k=nodeKind(a), n=asteroids.indexOf(a)+1;
  return (k==='moon'?'M':k==='planet'?'P':k==='derelict'?'D':'B')+n;
}
// ===== M6: ROUTE ECONOMICS — every frontier direction pays differently =====
// Moons: safe + fast (low yield, quick crews). Belts: industrial core.
// Planets: frontier rates, slow crews. Derelicts: salvage + tech (purge).
// Data-driven: all route traits live here, mechanics read this table.
const NODE_ECON={
  moon:{yield:5, mine:0.5, blurb:'SAFE 5g fast'},
  belt:{yield:7, mine:0.7, blurb:'RICH 7g'},
  planet:{yield:8, mine:1.0, blurb:'FRONTIER 8g slow'},
  derelict:{yield:6, mine:0.8, purge:2, blurb:'SALVAGE 6g +purge'},
};
function asteroidAccess(a){
  if(isAsteroidBlocked(a)) return {ok:false, why:'smothered'};
  if(a.unlocked) return {ok:true, via:'linked'};
  if(a.distCore<190) return {ok:true, via:'core'};
  if(a.distCore<hangarUplink()) return {ok:true, via:'uplink'};
  for(const o of outposts){
    // forward staging: an online outpost relays nearby worlds into the network
    if(o.hp>0 && Math.hypot(a.x-o.x,a.y-o.y)<OUTPOST_RELAY) return {ok:true, via:'outpost', node:o};
  }
  if(a.parent && a.parent!==CORE && a.parent.unlocked) return {ok:true, via:'chain', node:a.parent};
  const hop=relayHop(a);
  if(hop) return {ok:true, via:'hop', node:hop};
  if(a.parent && a.parent!==CORE) return {ok:false, why:'chain', node:a.parent};
  return {ok:false, why:'range'};
}
function isAsteroidReachable(a){ return asteroidAccess(a).ok; }
// ===== M4: CORRUPTION — NORMAL → EXPOSED → INFECTED → CORRUPTED → OVERRUN ====
// Derived live from voxel density around each world. Infected halves mining
// throughput; corrupted/overrun refuse drones (existing blocked logic); an
// overrun world actively feeds the cloud until purged. Purging voxels off a
// world steps it back down — the enemy now fights your economy, not just the
// station.
let corruptAcc=0;
function countVoxelsNear(x,y,rad){
  let n=0;
  const c0=mycWorldToCell(x-rad,y-rad), c1=mycWorldToCell(x+rad,y+rad);
  for(let cx=c0.cx;cx<=c1.cx;cx++) for(let cy=c0.cy;cy<=c1.cy;cy++){
    const cell=mycCells.get(mycKey(cx,cy));
    if(!cell) continue;
    const c=mycCellCenter(cx,cy);
    if(Math.hypot(c.x-x,c.y-y)<=rad) n++;
  }
  return n;
}
function nodeCorruption(a){ return a.cstate||'normal'; }
function updateCorruption(){
  const order={normal:0,exposed:1,infected:2,corrupted:3,overrun:4};
  for(const a of asteroids){
    const f=nodeFocus(a); // infection is about the WORLD, not the platform
    const near=countVoxelsNear(f.x,f.y,f.r+110);
    let st='normal';
    if(near>0){
      const close=countVoxelsNear(f.x,f.y,f.r+40);
      const over=countVoxelsNear(f.x,f.y,f.r+PIX*0.6);
      st = over>=8?'overrun':over>=1?'corrupted':close>=1?'infected':'exposed';
    }
    const prev=a.cstate||'normal';
    a.cNear=near;
    a.cstate=st;
    if(st===prev) continue;
    if(a.clogT && threatTime-a.clogT<6) continue; // anti-flap cooldown per world
    if(order[st]>order[prev] && order[st]>=2){
      a.clogT=threatTime;
      if(st==='infected'){ logEvent(`SENSOR — ${nodeName(a)} tainted. Crew output halved.`, 'bad'); SFX.no(); }
      if(st==='corrupted'){ logEvent(`SENSOR — ${nodeName(a)} corrupted. No crew in or out.`, 'bad'); toast(`${nodeName(a)} CORRUPTED — purge the purple!`, 'bad'); SFX.no(); }
      if(st==='overrun'){ logEvent(`WARNING — ${nodeName(a)} overrun. It feeds the growth.`, 'surge'); toast(`${nodeName(a)} OVERRUN — it feeds the cloud!`, 'surge'); SFX.no(); }
    } else if(order[st]<order[prev] && order[prev]>=2 && order[st]<=1){
      a.clogT=threatTime;
      logEvent(`✚ SENSOR — ${nodeName(a)} clean.`, 'good');
    }
  }
}
buildWorld();

// towers + station modules: Pulse Laser, Relay Drone, Hangar, Cryo, Plasma, Tesla, Railgun, Swarm
const TOWER_DEFS=[
  {id:'archer', name:'Pulse Laser', icon:'\u25C9', cost:40, dmg:15, range:165, fireRate:1.15, projSpeed:560, desc:'Cheap single-target. First defense.', color:'#7ce67c'},
  {id:'drone', name:'Relay Drone', icon:'\u25C8', cost:45, dmg:0, range:0, fireRate:0, projSpeed:0, desc:'Harvester: CLICK a gold world • moons fast, planets rich', color:'#facc15', isDrone:true},
  {id:'scout', name:'Scout Drone', icon:'\u2727', cost:30, dmg:0, range:0, fireRate:0, projSpeed:0, desc:'Charts ? worlds: CLICK an unsurveyed signature. +8g per chart', color:'#67e8f9', isScout:true},
  {id:'hangar', name:'Hangar Bay', icon:'\u2699', cost:70, dmg:0, range:0, fireRate:0, projSpeed:0, desc:'+1 drone slot + uplink reach. Build first!', color:'#94a3b8', isModule:true, mod:'hangar'},
  {id:'frost', name:'Cryo Node', icon:'\u2744', cost:60, dmg:11, range:150, fireRate:0.9, projSpeed:480, slow:0.38, slowDur:1.4, desc:'Freezes spread. Holds lanes.', color:'#7dd3fc'},
  {id:'cannon', name:'Plasma Mortar', icon:'\u25CE', cost:85, dmg:34, range:150, fireRate:0.55, projSpeed:420, splash:62, desc:'SPLASH vs crowds + smothered worlds', color:'#fb923c'},
  {id:'storm', name:'Tesla Coil', icon:'\u26A1', cost:100, dmg:18, range:170, fireRate:0.9, projSpeed:560, chain:2, desc:'Arcs between nearby voxels', color:'#a78bfa'},
  {id:'railgun', name:'Railgun', icon:'\u2295', cost:140, dmg:60, range:430, fireRate:0.32, projSpeed:950, pierce:3, desc:'Extreme range. Pierces deep lines', color:'#67e8f9'},
  {id:'barrage', name:'Swarm Bay', icon:'\u2726', cost:35, dmg:8, range:135, fireRate:1.9, projSpeed:540, burst:3, pierce:0, desc:'3-shot burst vs loose voxels', color:'#f43f5e'},
];
// Solar Array + Research Lab are no longer orbit builds — they are
// STATION tech upgrades (see STATION_TECH + showStationPanel).
function towerStat(t){
  const dmgMul=1+permBonus('damage')+prestigeWins*0.01;
  const rangeMul=1+permBonus('range');
  const speedMul=1+permBonus('speed');
  let slowMul=1+permBonus('slow');
  // mycelium radial already buffed frost
  if(t.id==='frost') slowMul*=1.32;
  let d=t.baseDmg*dmgMul*Math.pow(1.18, t.level-1);
  let r=t.baseRange*rangeMul*Math.pow(1.06, t.level-1);
  let fr=t.baseFireRate*speedMul*Math.pow(1.07, t.level-1);
  let slowD=t.slowDur ? t.slowDur*slowMul : 0;
  let burst = t.burst ? t.burst + (t.level>=4?1:0) + (t.level>=5?1:0) : 0;
  let pierce = t.pierce || 0;
  let extraSplash = t.splash || 0;
  let extraChain = t.chain || 0;
  if(t.branch==='power'){
    if(t.id==='frost'){ slowD*=1.22; r*=1.08; }
    else if(t.id==='cannon'){ extraSplash=Math.floor(t.splash*1.32); }
    else if(t.id==='storm'){ extraChain=(t.chain||0)+1; }
    else if(t.id==='barrage'){ burst+=1; }
    else d*=1.32;
  } else if(t.branch==='precision'){
    pierce = Math.max(t.pierce||0, (t.level>=4?2:1));
    if(t.id==='archer' || t.id==='barrage' || t.id==='storm') d*=1.10;
    else if(t.id==='frost'){ slowD*=1.35; r*=1.10; }
    else if(t.id==='cannon') pierce = 1;
    else if(t.id==='railgun'){ r*=1.25; d*=1.15; }
  }
  if(t.branch==='precision' && t.id==='storm' && pierce<1) pierce=1;
  return {dmg:Math.floor(d), range:Math.floor(r), fireRate:+(fr.toFixed(2)), slowDur:slowD, splash:extraSplash, chain:extraChain, pierce, burst};
}
function upgradeCost(t){ return Math.floor(t.baseCost*1.35*Math.pow(1.28, t.level-1)); }
function sellValue(t){
  let total=t.baseCost;
  for(let i=1;i<t.level;i++) total+=Math.floor(t.baseCost*1.35*Math.pow(1.28,i-1));
  return Math.floor(total*0.6);
}

// ===== FORWARD OUTPOSTS — the civilization phase. Max 2, ever: the station
// barely has the personnel, comms and reactor output for two remote crews.
// An outpost is a foothold, not a second station: relay reach for nearby
// worlds, deliver-to-nearest for short hauls, repair aura, 2 weapon slots.
// No purge, no wing, no tech. The Bloom wants them dead.
// (State + consts live with the world state near the top — page-eval order.)
function outpostCount(){ return outposts.length+constructions.length; }
function outpostUnlocked(){
  // mature station + operating network: the last unlock, earned late
  if(!strikeUnlocked()) return false;
  if((stationTech.solar||0)<4) return false;
  if((stationTech.lab||0)<3) return false;
  if((stationTech.command||0)<3) return false;
  if((stationTech.nav||0)<2) return false;
  if(asteroids.filter(a=>a.unlocked).length<5) return false;
  if(hangarLevels()<3) return false;
  return true;
}
function outpostLockReason(){
  if(!strikeUnlocked()) return 'bring STRIKE WING online first';
  if((stationTech.solar||0)<4) return 'grow Solar Array to Lv4 (click station)';
  if((stationTech.lab||0)<3) return 'grow Research Lab to Lv3 (click station)';
  if((stationTech.command||0)<3) return 'grow Command Center to Lv3 (click station)';
  if((stationTech.nav||0)<2) return 'grow Navigation Array to Lv2 (click station)';
  if(asteroids.filter(a=>a.unlocked).length<5) return `link ${5-asteroids.filter(a=>a.unlocked).length} more trade lane(s)`;
  if(hangarLevels()<3) return 'grow Hangar to Lv3 total';
  return '';
}
function startOutpostPlacement(){
  if(state!==STATE.PLAYING) return;
  if(outpostPlacing){ outpostPlacing=false; toast('Outpost survey stood down', 'hint'); return; }
  if(!outpostUnlocked()){ SFX.no(); flashHint('FORWARD OUTPOST offline — '+outpostLockReason()+'.'); return; }
  if(outpostCount()>=OUTPOST_MAX){ SFX.no(); flashHint(`The station can crew only ${OUTPOST_MAX} outposts — lose one to rebuild.`); return; }
  if(coins<OUTPOST_COST){ SFX.no(); flashHint(`Forward Outpost needs ${OUTPOST_COST}g — the single biggest purchase you'll make.`); return; }
  outpostPlacing=true; placeType=null; ghostPos=null; strikeArming=false; selectedTower=null; hidePanel();
  SFX.place();
  toast('OUTPOST SURVEY — click open space to found it. Choose like it matters.', 'surge');
  logEvent('<b>Outpost survey active.</b> Two crews, ever. Put them where the civilization needs them.', 'surge');
}
function outpostSiteInfo(x,y){
  // placement readout: what would this ground give us?
  const near=asteroids.filter(a=>a.surveyed&&Math.hypot(a.x-x,a.y-y)<500).map(nodeName);
  const cloud=countVoxelsNear(x,y,250);
  const linked=asteroids.filter(a=>a.unlocked).length;
  return {near, cloud, linked};
}
function commitOutpost(x,y){
  if(!outpostPlacing) return;
  outpostPlacing=false;
  if(!outpostUnlocked()||outpostCount()>=OUTPOST_MAX){ SFX.no(); return; }
  if(coins<OUTPOST_COST){ SFX.no(); flashHint(`Forward Outpost needs ${OUTPOST_COST}g.`); return; }
  if(Math.hypot(x-CORE.x,y-CORE.y)<150){ SFX.no(); flashHint('Too close to the station — push into the dark.'); return; }
  for(const o of outposts.concat(constructions)){ const ox=o.tx!=null&&o.phase?o.tx:o.x, oy=o.ty!=null&&o.phase?o.ty:o.y;
    if(Math.hypot(x-ox,y-oy)<250){ SFX.no(); flashHint('Too close to another outpost ground — spread the civilization.'); return; } }
  if(star && Math.hypot(x-star.x,y-star.y)<star.r+30){ SFX.no(); flashHint('Not inside the star.'); return; }
  for(const p of planets){
    if(p.x!=null && Math.hypot(x-p.x,y-p.y)<p.r+30){ SFX.no(); flashHint('Onto open ground, not inside a planet — park beside it.'); return; }
    for(const m of p.moons){ if(m.x!=null && Math.hypot(x-m.x,y-m.y)<m.r+24){ SFX.no(); flashHint('Beside the moon, not inside it.'); return; } }
  }
  if(bloomLeashed(x,y)){ SFX.no(); flashHint('Beyond construction range.'); return; }
  coins-=OUTPOST_COST;
  constructions.push({x:CORE.x,y:CORE.y,tx:x,ty:y,phase:'travel',prog:0,speed:220,seed:Math.random()*6.28});
  SFX.wave();
  const info=outpostSiteInfo(x,y);
  logEvent(`<b>Construction fleet away.</b> ${info.near.length?('Ground covers: '+info.near.slice(0,3).join(', ')+(info.near.length>3?'…':'')):'Deep ground — no charted worlds in range yet.'} Bloom near site: ${info.cloud>30?'<b>HEAVY</b>':info.cloud>0?'present':'clear'}.`, info.cloud>30?'surge':'good');
  toast('CONSTRUCTION FLEET AWAY', 'good');
  updateBuildBar();
}
function updateOutposts(ddt){
  // construction: travel, then assembly
  for(let i=constructions.length-1;i>=0;i--){
    const c=constructions[i];
    if(c.phase==='travel'){
      const dx=c.tx-c.x, dy=c.ty-c.y, dist=Math.hypot(dx,dy)||1;
      c.x+=(dx/dist)*c.speed*ddt; c.y+=(dy/dist)*c.speed*ddt;
      if(Math.random()<0.4) addParticles(c.x,c.y,1,'#facc15',30);
      if(dist<24){ c.phase='build'; c.prog=0; logEvent('Construction fleet on site — assembly underway.', 'info'); }
    } else {
      c.prog+=ddt/OUTPOST_BUILD_TIME;
      if(Math.random()<0.5) addParticles(c.tx+(Math.random()-0.5)*36,c.ty+(Math.random()-0.5)*36,2,'#facc15',50);
      if(c.prog>=1){
        constructions.splice(i,1);
        const n=outposts.length+1;
        const name='OUTPOST '+['I','II','III'][Math.min(n-1,2)];
        outposts.push({x:c.tx,y:c.ty,r:20,name,hp:OUTPOST_HP,maxHp:OUTPOST_HP,seed:Math.random()*6.28,relayed:0,warnT:0,attackT:0,critLogged:false});
        addParticles(c.tx,c.ty,40,'#7ce67c',150);
        SFX.place(); shake=Math.min(6,shake+2);
        logEvent(`<b>${name} ONLINE.</b> Relay, repairs and 2 weapon slots. It will draw the Bloom — defend it like history depends on it.`, 'good');
        toast(`◈ ${name} ONLINE`, 'good');
      }
    }
  }
  // outposts live: contact damage, warnings, slow crew repair, loss
  for(let i=outposts.length-1;i>=0;i--){
    const o=outposts[i];
    if(o.warnT>0) o.warnT-=ddt;
    if(o.attackT>0) o.attackT-=ddt;
    const touching=myceliumAtWorld(o.x,o.y,o.r+6);
    if(touching){
      o.hp-=7*ddt;
      if(o.attackT<=0){
        o.attackT=15;
        logEvent(`<b>${o.name} UNDER ATTACK.</b> Purge it clean, park guns, or send the wing.`, 'bad');
        toast(`${o.name} UNDER ATTACK`, 'bad');
        SFX.no();
      }
      if(o.hp<90 && !o.critLogged){
        o.critLogged=true;
        logEvent(`<b>${o.name} CRITICAL.</b> It will not survive much more of this.`, 'surge');
        toast(`${o.name} CRITICAL`, 'surge');
      }
    } else {
      if(o.hp<o.maxHp) o.hp=Math.min(o.maxHp,o.hp+1*ddt); // crew repairs in quiet
      if(o.hp>150) o.critLogged=false;
      if(countVoxelsNear(o.x,o.y,220)>0 && o.warnT<=0){
        o.warnT=20;
        logEvent(`SENSOR — Bloom approaching ${o.name}.`, 'surge');
      }
    }
    if(o.hp<=0){
      outposts.splice(i,1);
      addParticles(o.x,o.y,50,'#f87171',180);
      shake=8; SFX.boom();
      // its guns fall back to the station rather than haunting dead ground
      for(const t of towers){
        if(t.anchor && t.anchor.obj===o){ t.anchor={type:'core',obj:CORE,dist:0}; t.orbitR=38; }
      }
      logEvent(`<b>${o.name} LOST.</b> The crew is gone; the ground is open again. Rebuild — or cede the region.`, 'surge');
      toast(`${o.name} LOST`, 'bad');
    }
  }
}
// ===== STATION TECH TREE (modules live INSIDE the station) =====
// Data-driven rack: adding a module = one entry here + one effect branch.
// Upgrading these grows your base itself: more wings, dishes and glow.
const STATION_TECH={
  solar:{name:'Solar Array', icon:'\u2600', base:50, mult:1.45, max:5, color:'#fef08a',
    desc:'Station mint: gold on a timer. No trips, no risk.'},
  lab:{name:'Research Lab', icon:'\u2697', base:130, mult:1.7, max:5, color:'#86efac',
    desc:'Boosts ALL pierce damage. Deep-heart DPS lives here.'},
  command:{name:'Command Center', icon:'\u2318', base:90, mult:1.6, max:5, color:'#7dd3fc',
    desc:'Coordinated crews: +8% drone & scout speed per level.'},
  nav:{name:'Navigation Array', icon:'\u25CB', base:70, mult:1.6, max:3, color:'#c4b5fd',
    desc:'Deep-space uplink: +35 drone range per level.'},
};
// (stationTech itself is declared near the top — hangarUplink needs it at eval time)
let solarAcc=0;
function solarInterval(lv){ return Math.max(1.0, 4.0-0.45*lv); }
function solarEffect(lv){ return lv<=0 ? 'offline' : `+${lv}g every ${solarInterval(lv).toFixed(1)}s`; }
function labEffect(lv){ return lv<=0 ? 'offline' : `pierce dmg +${lv*12}%`; }
function techEffect(id,lv){
  if(id==='solar') return solarEffect(lv);
  if(id==='lab') return labEffect(lv);
  if(id==='command') return lv<=0 ? 'offline' : `drone speed +${lv*8}%`;
  if(id==='nav') return lv<=0 ? 'offline' : `uplink +${lv*35}`;
  return '';
}
function techCost(id){ const d=STATION_TECH[id]; return Math.floor(d.base*Math.pow(d.mult, stationTech[id])); }
function techAvailable(id){
  if(id==='solar') return true;
  if(id==='command') return asteroids.filter(a=>a.unlocked).length>=1;
  if(id==='nav') return asteroids.filter(a=>a.unlocked).length>=2;
  if(id==='lab') return asteroids.filter(a=>a.unlocked).length>=2;
  return true;
}
function techLockReason(id){
  if(id==='command' && !techAvailable(id)) return 'Needs 1 linked lane';
  if(id==='nav' && !techAvailable(id)) return 'Needs 2 linked lanes';
  if(id==='lab' && !techAvailable(id)) return 'Needs 2 linked lanes';
  return '';
}
function buyTech(id){
  const d=STATION_TECH[id];
  if(!d || stationTech[id]>=d.max) { SFX.no(); return; }
  if(!techAvailable(id)){ SFX.no(); flashHint(techLockReason(id)||'Locked'); return; }
  const c=techCost(id);
  if(coins<c){ SFX.no(); return; }
  coins-=c; stationTech[id]++;
  SFX.place(); addParticles(CORE.x,CORE.y,16,d.color,90);
  addNum(CORE.x,CORE.y-CORE.r-14,`${d.name} Lv${stationTech[id]}!`,d.color);
  logEvent(`<b>${d.name} Lv${stationTech[id]}</b> online — ${techEffect(id,stationTech[id])}`, 'good');
  showStationPanel(); updateBuildBar();
}

// game vars
let kills=0, totalDamage=0, overkill=0, bossesKilled=0, towersBuilt=0;
let selectedTower=null, ghostPos=null, placeType=null, hoverPreview=null;
let mouse={x:W/2,y:H/2};
let shake=0;
let defenseEstablished=false;
let undoStack=[];
let dps=0, peakDps=0, dpsTimer=0, dpsLast=0;
let mycHintShown=false;

let endless=false, endlessCycle=0;
// CORE PURGE — station emergency: overcharge the reactor, pulse nearby space.
// Buys time, never wins the war. Significant gold + long cooldown.
const PURGE_COST=200, PURGE_CD=90, PURGE_RADIUS=520;
let purgeCd=0, purgeCharging=0, purgeFx=null;
// Late-game unlock: the emergency machine is earned, not given. The player
// must already run a real operation: linked lanes + solar + lab + guns.
function purgeUnlocked(){
  if(!defenseEstablished) return false;
  if(asteroids.filter(a=>a.unlocked).length<3) return false;
  if((stationTech.solar||0)<2) return false;
  if((stationTech.lab||0)<1) return false;
  if(towers.filter(t=>!t.isModule).length<3) return false;
  return true;
}
function purgeLockReason(){
  if(!defenseEstablished) return 'establish station defense first';
  if(asteroids.filter(a=>a.unlocked).length<3) return `link ${3-asteroids.filter(a=>a.unlocked).length} more trade lane(s)`;
  if((stationTech.solar||0)<2) return 'grow Solar Array to Lv2 (click station)';
  if((stationTech.lab||0)<1) return 'build the Research Lab (click station)';
  if(towers.filter(t=>!t.isModule).length<3) return 'deploy more weapons';
  return '';
}
function purgeReady(){ return purgeUnlocked() && purgeCharging<=0 && purgeCd<=0 && state===STATE.PLAYING; }
function buyCorePurge(){
  if(!purgeUnlocked()){ SFX.no(); flashHint('CORE PURGE offline — '+purgeLockReason()+'.'); return; }
  if(!purgeReady()){ SFX.no(); return; }
  if(coins<PURGE_COST){ SFX.no(); flashHint(`Core Purge needs ${PURGE_COST}g — hold the lanes a little longer.`); return; }
  coins-=PURGE_COST;
  purgeCharging=2.2;
  SFX.sting(); shake=Math.min(8,shake+3);
  logEvent('<b>CORE PURGE charging.</b> All hands brace — reactor overcharging!', 'surge');
  toast('CORE PURGE CHARGING…', 'surge');
  updateBuildBar();
}
function detonatePurge(){
  purgeFx={t:0,dur:0.9};
  purgeCd=PURGE_CD;
  SFX.boom(); shake=9;
  addParticles(CORE.x,CORE.y,80,'#fef9c3',260);
  addParticles(CORE.x,CORE.y,60,'#c084fc',220);
  // The pulse: weak tendrils snap, clusters break, hearts reel — far growth continues.
  damageMyceliumAt(CORE.x,CORE.y,240,PURGE_RADIUS,{coinPerCell:1,color:'#fef9c3'});
  if(state!==STATE.PLAYING) return;
  damageEntitiesAt(CORE.x,CORE.y,260,PURGE_RADIUS,{color:'#fef9c3'});
  if(state!==STATE.PLAYING) return;
  damageTendrilsAt(CORE.x,CORE.y,300,PURGE_RADIUS); // nearby travelers rupture
  for(let i=clusters.length-1;i>=0;i--){
    if(Math.hypot(clusters[i].x-CORE.x,clusters[i].y-CORE.y)<PURGE_RADIUS) { /* handled above, survivors reel */ }
  }
  logEvent('<b>CORE PURGE discharged.</b> Nearby Bloom recoils — far tendrils keep growing.', 'good');
  toast('PURGE DISCHARGED — BREATHING ROOM', 'good');
}
function updatePurge(ddt){
  if(purgeCd>0) purgeCd-=ddt;
  if(purgeCharging>0){
    purgeCharging-=ddt;
    shake=Math.min(8,shake+14*ddt); // the station vibrates as power concentrates
    if(Math.random()<0.5) addParticles(CORE.x+(Math.random()-0.5)*60,CORE.y+(Math.random()-0.5)*60,2,'#fef9c3',40);
    if(purgeCharging<=0) detonatePurge();
  }
  if(purgeFx){
    purgeFx.t+=ddt;
    if(purgeFx.t>=purgeFx.dur) purgeFx=null;
  }
  if(strikeCd>0) strikeCd-=ddt;
}
// ===== STRIKE WING — the station's other emergency arm. Not a pulse but
// physical spacecraft: a disposable 4-craft fleet you fly at the map to carve
// a path through Bloom territory. 1 HP each — the cloud eats them. Survivors
// strafe the target, then they're gone. Expensive, fragile, manual.
const STRIKE_COST=260, STRIKE_CD=75, STRIKE_SHIPS=4, STRIKE_DMG=25, STRIKE_LIFE=14, STRIKE_SPEED=340;
let strikers=[]; // {x,y,tx,ty,speed,hp,fireCd,life,seed,orbit}
let strikeCd=0, strikeArming=false;
function strikeUnlocked(){
  // later than purge: a real operation with crews to spare
  if(!purgeUnlocked()) return false;
  if(asteroids.filter(a=>a.unlocked).length<4) return false;
  if(hangarLevels()<2) return false;
  if((stationTech.command||0)<1) return false;
  if(towers.filter(t=>!t.isModule).length<4) return false;
  return true;
}
function strikeLockReason(){
  if(!purgeUnlocked()) return 'bring CORE PURGE online first';
  if(asteroids.filter(a=>a.unlocked).length<4) return `link ${4-asteroids.filter(a=>a.unlocked).length} more trade lane(s)`;
  if(hangarLevels()<2) return 'grow Hangar to Lv2 total';
  if((stationTech.command||0)<1) return 'build Command Center (click station)';
  if(towers.filter(t=>!t.isModule).length<4) return 'deploy more weapons';
  return '';
}
function strikeReady(){ return strikeUnlocked() && !strikeArming && strikeCd<=0 && state===STATE.PLAYING && defenseEstablished; }
function armStrike(){
  if(state!==STATE.PLAYING) return;
  if(strikeArming){ strikeArming=false; toast('STRIKE WING stood down', 'hint'); return; }
  if(!strikeUnlocked()){ SFX.no(); flashHint('STRIKE WING offline — '+strikeLockReason()+'.'); return; }
  if(strikeCd>0 || !defenseEstablished){ SFX.no(); return; }
  if(coins<STRIKE_COST){ SFX.no(); flashHint(`Strike Wing needs ${STRIKE_COST}g — hold the lanes a little longer.`); return; }
  strikeArming=true; placeType=null; ghostPos=null; outpostPlacing=false; selectedTower=null; hidePanel();
  SFX.place();
  toast('STRIKE WING ARMED — click the map to commit (right-click/X cancels)', 'surge');
  logEvent('<b>Strike Wing armed.</b> Pick where the fleet goes.', 'surge');
}
function commitStrike(x,y){
  if(!strikeArming) return;
  if(!strikeUnlocked() || strikeCd>0){ SFX.no(); strikeArming=false; return; }
  if(coins<STRIKE_COST){ SFX.no(); flashHint(`Strike Wing needs ${STRIKE_COST}g.`); strikeArming=false; return; }
  coins-=STRIKE_COST; strikeCd=STRIKE_CD; strikeArming=false;
  for(let k=0;k<STRIKE_SHIPS;k++){
    const back=k*0.35;
    strikers.push({x:CORE.x+(Math.random()-0.5)*20, y:CORE.y+(Math.random()-0.5)*20,
      tx:x+(Math.random()-0.5)*50, ty:y+(Math.random()-0.5)*50,
      speed:STRIKE_SPEED, hp:1, fireCd:0.3+k*0.15, life:STRIKE_LIFE+back,
      seed:Math.random()*6.28, orbit:Math.random()*6.28});
    addParticles(CORE.x,CORE.y,6,'#7dd3fc',120);
  }
  SFX.wave(); shake=Math.min(6,shake+2);
  logEvent(`<b>Strike Wing away — ${STRIKE_SHIPS} craft.</b> They will not all come back.`, 'surge');
  toast('STRIKE WING AWAY', 'good');
  updateBuildBar();
}
function updateStrikers(ddt){
  for(let i=strikers.length-1;i>=0;i--){
    const s=strikers[i];
    s.life-=ddt;
    if(s.life<=0){
      addParticles(s.x,s.y,6,'#7dd3fc',60);
      strikers.splice(i,1);
      continue;
    }
    const dx=s.tx-s.x, dy=s.ty-s.y, dist=Math.hypot(dx,dy)||1;
    if(dist<70){
      // on station over target: strafe orbit, guns hot
      s.orbit+=2.2*ddt;
      const ox=s.tx+Math.cos(s.orbit)*44, oy=s.ty+Math.sin(s.orbit)*44;
      const ox2=ox-s.x, oy2=oy-s.y, ol=Math.hypot(ox2,oy2)||1;
      s.x+=(ox2/ol)*s.speed*0.8*ddt; s.y+=(oy2/ol)*s.speed*0.8*ddt;
    } else {
      s.x+=(dx/dist)*s.speed*ddt; s.y+=(dy/dist)*s.speed*ddt;
      // en-route volley: every craft fires piercing slugs straight down the
      // attack lane — this is how the wing pierces into ground your towers
      // cannot reach. No bounty: the path is the reward.
      s.volleyCd=(s.volleyCd||0)-ddt;
      if(s.volleyCd<=0){
        s.volleyCd=0.5;
        const spd=750;
        projectiles.push({x:s.x, y:s.y,
          vx:(dx/dist)*spd, vy:(dy/dist)*spd,
          r:3.5, dmg:18, tower:null, life:1.4, trail:[],
          slow:0, slowDur:0, splash:0, chain:0, color:'#7dd3fc',
          pierce:3, hitSet:new Set(), striker:true});
        addParticles(s.x,s.y,2,'#7dd3fc',40);
      }
    }
    // 1 HP: touching the living cloud kills outright
    if(myceliumAtWorld(s.x,s.y,6)){
      addParticles(s.x,s.y,10,'#f87171',90);
      addNum(s.x,s.y-10,'WING DOWN','#f87171');
      strikers.splice(i,1);
      continue;
    }
    // guns: carve voxels, wound entities, snap tendril tips — no bounty
    // (player weapons don't mint gold; the path is the reward)
    s.fireCd-=ddt;
    if(s.fireCd<=0){
      s.fireCd=0.55;
      const hitC=myceliumAtWorld(s.x,s.y,60);
      const hitE=entityAtWorld(s.x,s.y,60);
      const hitT=tendrilTipAt(s.x,s.y,60);
      if(hitC||hitE||hitT){
        damageMyceliumAt(s.x,s.y,STRIKE_DMG,42,{coinPerCell:0,color:'#7dd3fc'});
        if(state!==STATE.PLAYING) return;
        damageEntitiesAt(s.x,s.y,STRIKE_DMG,42,{color:'#7dd3fc'});
        if(state!==STATE.PLAYING) return;
        damageTendrilsAt(s.x,s.y,STRIKE_DMG,42);
        addParticles(s.x,s.y,4,'#7dd3fc',70);
        if(Math.random()<0.3) SFX.shoot();
      }
    }
  }
}
function fmtTime(s){ s=Math.max(0,Math.floor(s)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function fillEndScreen(){
  document.getElementById('finalWave').textContent=wave;
  document.getElementById('finalKills').textContent=kills;
  document.getElementById('finalBosses').textContent=bossesKilled;
  document.getElementById('finalDamage').textContent=Math.floor(totalDamage);
  document.getElementById('finalTowers').textContent=towersBuilt;
  document.getElementById('finalBestWave').textContent=stats.bestWave;
  const fp=document.getElementById('finalPurge'); if(fp) fp.textContent=purgeTotal;
  const ft=document.getElementById('finalTime'); if(ft) ft.textContent=fmtTime(threatTime);
}
function winFreed(){
  // M9: SYSTEM LIBERATED — finale screen with an explicit choice:
  // warp on, keep purging, or stand down. (Defeat still uses GAMEOVER.)
  if(state!==STATE.PLAYING) return;
  const vBonus=Math.round((150+bossesKilled*20+galaxy*40)*(sysMods.reward||1));
  coinsBank+=vBonus; savePerm();
  prestigeWins++; saveProgress();
  galaxyStats.liberated++; saveGalaxyStats();
  lastRun={wave,kills,coins:vBonus+Math.floor(kills*1.2), bosses:bossesKilled, damage:Math.floor(totalDamage), towers:towersBuilt};
  stats.bestWave=Math.max(stats.bestWave,wave); stats.bestKills=Math.max(stats.bestKills,kills); stats.runs+=1; stats.totalKills+=kills; stats.totalCoins+=vBonus; saveStats(); refreshMenuStats();
  document.getElementById('clearWave').textContent=wave;
  document.getElementById('clearKills').textContent=kills;
  document.getElementById('clearBosses').textContent=bossesKilled;
  document.getElementById('clearBonus').textContent=vBonus;
  document.getElementById('clearTotal').textContent=vBonus+Math.floor(kills*1.2);
  document.getElementById('clearLiberated').textContent=galaxyStats.liberated;
  document.getElementById('stageWarpBtn').textContent=`WARP TO SYSTEM ${galaxy+2} ✦`;
  SFX.wave(); addParticles(CORE.x,CORE.y,40,'#e9d5ff',160);
  setState(STATE.CLEAR);
}
function endlessBloom(){
  // victory lap: the war is won, but the network keeps budding
  endlessCycle++;
  const bonus=100+endlessCycle*60+bossesKilled*10;
  coins+=bonus; coinsBank+=Math.floor(bonus/2); savePerm();
  addNum(CORE.x,CORE.y-CORE.r-20,`CYCLE ${endlessCycle} +${bonus}g`,'#e9d5ff');
  addParticles(CORE.x,CORE.y,40,'#e9d5ff',170);
  SFX.wave();
  logEvent(`<b>SENSOR — rim signal persists.</b> Cycle ${endlessCycle}, +${bonus}g.`, 'good');
  placeHearts(Math.min(5,2+endlessCycle));
}
function resetRun(){
  lives = 20 + permBonus('lives');
  maxLives=lives;
  galaxy=0; saveProgress();
  coins = 130 + permBonus('wealth');
  wave=1; waveTimer=8; waveSpawning=false; spawnQueue=[]; spawnAcc=0; threatTime=0;
  defenseEstablished=false;
  purgeTotal=0; purgeGoal=1200; mycGrowthAcc=0; mycTouchAcc=0; mycTime=0; driftTime=0; corruptAcc=0;
  endless=false; endlessCycle=0;
  hearts=[]; pods=[]; clusters=[]; cores=[]; tendrils=[]; podTimer=10; mile25=mile50=mile75=false; oohShown=false;
  bloomLedger=new Map(); ledgerMaterialize.acc=0;
  sysHeartsTotal=0; sysHeartsSlain=0; finalPush=false;
  budAcc=25;
  merging=null; mergeSig=''; mergeHold=0; mergeAcc=0;
  bloomCalm=0; nextBloomIn=0; bloomWhispered=false; bloomCycles=0;
  purgeCd=0; purgeCharging=0; purgeFx=null;
  strikers=[]; strikeCd=0; strikeArming=false;
  outposts=[]; constructions=[]; outpostPlacing=false;
  sysMods={ore:1, growth:1, hearts:0, derelicts:0, reward:1}; sysNameCur='Home'; pendingSys=null;
  stationTech={solar:0, lab:0, command:0, nav:0}; solarAcc=0; selectedStation=false;
  tremorTimer=22; tremorIdx=0; seenHeart=false; seenCloud=false;
  sightCheckAcc=0; sightingFlash=0; wakeFlash=0;
  centerOnStation(1.7); // intimate opening, dead-centered: station + drones + home waters
  seedDriftMotes();
  dps=0; peakDps=0; dpsTimer=0; dpsLast=0; totalDamage=0; overkill=0; mycHintShown=false;
  setTimeout(()=>{
    const tut=document.getElementById('tutorialHint');
    const bb=document.getElementById('buildBar');
    if(tut && stats.runs===0 && !localStorage.getItem('atd_tutDone')){
      tut.classList.remove('hidden');
      if(bb) bb.classList.add('tut-highlight');
    }
  }, 500);
  enemies=[]; towers=[]; projectiles=[]; particles=[]; damageNumbers=[]; drones=[]; scouts=[];
  myceliumBlocks=[]; asteroids=[]; preferredAsteroid=null;
  star=null; planets=[]; beltRocks=[];
  mycCells.clear();
  kills=0; bossesKilled=0; towersBuilt=0;
  selectedTower=null; ghostPos=null; placeType=null;
  shake=0;
  buildWorld();
  const bar0=document.getElementById('buildBar');
  if(bar0) bar0.classList.remove('minimized');
  const bt0=document.getElementById('barToggle');
  if(bt0){ bt0.textContent='–'; bt0.title='Hide build bar (B)'; }
  const logBox=document.getElementById('eventLog');
  if(logBox) logBox.innerHTML='';
  logEvent('SYSTEM — Expedition initialized.', 'info');
  flashHint('Relay Drone available — begin the route', 'hint');
  updateBuildBar();
}
/* ===== EVENT LOG + TOAST (replaces the center-screen banner) ===== */
function logTime(){
  // The expedition log runs on ship time only — no wave/level numbers.
  const s=Math.max(0,Math.floor(threatTime));
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function logEvent(txt, kind){
  kind=kind||'info';
  const box=document.getElementById('eventLog');
  if(!box) return;
  const div=document.createElement('div');
  div.className='log-line '+kind;
  div.innerHTML=`<span class="lt">${logTime()}</span><span>${txt}</span>`;
  box.appendChild(div);
  while(box.children.length>50) box.removeChild(box.firstChild);
  box.scrollTop=box.scrollHeight;
}
let toastTimer=null;
function toast(txt, kind){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=txt;
  t.className='show '+(kind||'hint');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ t.className='hidden'; }, 2600);
}
function showWaveBanner(){
  // Biological language only: the Bloom stirs, it never announces a "wave".
  if(wave%10===0){
    toast('THE BLOOM SURGES — growth quickens', 'surge');
    logEvent('SENSOR — biological surge. The network quickens.', 'surge');
  }
  SFX.wave();
}
function doWarp(force){
  if(wave<12 && !force){ SFX.no(); flashHint('Deep-space warp not yet charted — hold the line longer.'); return; }
  if(pendingSys){ sysMods=pendingSys.mods; sysNameCur=pendingSys.name; pendingSys=null; }
  galaxy++;
  galaxyStats.visited++; saveGalaxyStats();
  saveProgress();
  const cometAnchors = towers.map(t=>({tower:t, index:t.anchor?.type==='asteroid' ? asteroids.indexOf(t.anchor.obj) : -1}));
  const droneTargets = drones.map(d=>({drone:d, index:d.targetAsteroid ? asteroids.indexOf(d.targetAsteroid) : -1}));
  const scoutTargets = scouts.map(s=>({sc:s, index:s.target ? asteroids.indexOf(s.target) : -1}));
  asteroids=[]; myceliumBlocks=[];
  preferredAsteroid=null;
  hearts=[]; pods=[]; clusters=[]; cores=[]; tendrils=[]; podTimer=10;
  bloomLedger=new Map(); ledgerMaterialize.acc=0;
  seenHeart=false;
  sysHeartsTotal=0; sysHeartsSlain=0; finalPush=false; // fresh liberation ledger
  budAcc=25;
  merging=null; mergeSig=''; mergeHold=0; mergeAcc=0;
  strikers=[]; strikeCd=0; strikeArming=false; // transient wing never survives warp
  outpostPlacing=false; // placement never survives warp; online outposts do
  bloomCalm=0; nextBloomIn=0; bloomWhispered=false; bloomCycles=0;
  star=null; planets=[]; beltRocks=[];
  purgeGoal=Math.floor(purgeGoal*1.35);
  buildWorld();
  centerCam();
  // a fresh system means a fresh mycelium front pushing in
  initMyceliumEdges(true);
  for(const record of cometAnchors){
    if(record.index>=0 && asteroids[record.index]){
      record.tower.anchor.obj=asteroids[record.index];
      record.tower.anchor.dist=0;
    } else if(record.tower.anchor && record.tower.anchor.type==='outpost' && outposts.includes(record.tower.anchor.obj)){
      // outpost guns stay with their outpost across warp — empire intact
      record.tower.anchor.dist=0;
    } else if(record.tower.anchor){
      record.tower.anchor={type:'core', obj:CORE, dist:0};
      record.tower.orbitR=38;
    }
  }
  // drones must follow into the new system too — no ghost-mining dead rocks
  for(const rec of droneTargets){
    if(rec.index>=0 && asteroids[rec.index]){
      rec.drone.targetAsteroid=asteroids[rec.index];
      rec.drone.routeIndex=0; rec.drone.mineTimer=0;
    } else {
      rec.drone.targetAsteroid=null; rec.drone.routeIndex=0; rec.drone.carrying=false;
    }
  }
  // scouts keep their survey schedule in the new system (fresh dark, same wing)
  for(const rec of scoutTargets){
    if(rec.index>=0 && asteroids[rec.index]){ rec.sc.target=asteroids[rec.index]; rec.sc.mode='outbound'; rec.sc.surveyT=0; }
    else { rec.sc.target=null; rec.sc.mode='idle'; rec.sc.surveyT=0; }
  }
  waveTimer=6;
  flashHint(`Warped to ${sysNameCur} (System ${galaxy+1}) — empire intact!`);
  logEvent(`<b>✦ Warped to ${sysNameCur}.</b> New sky, same war.`, 'good');
  SFX.wave(); { const vc=viewCenter(); addParticles(vc.x,vc.y,24,'#a78bfa'); }
  if(selectedTower && !towers.includes(selectedTower)){ selectedTower=null; hidePanel(); }
  updateBuildBar();
}
// ===== M10: WARP MAP — choose the next system to liberate =====
const SYS_PREFIX=['Vey','Tal','Mor','Ish','Kel','Rau','Oss','Fen','Dral','Syr','Hal','Zev','Cor','Bel'];
const SYS_SUFFIX=[' Prime','ara',' Minor',' Major',' Reach',' Verge',' Deep',' Hollow'];
function roman(n){ const T=[[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let s=''; n=Math.max(1,n); for(const [v,r] of T){ while(n>=v){ s+=r; n-=v; } } return s; }
function genSystemChoices(){
  const arch=[
    {kind:'Fertile Expanse', color:'#7ce67c', desc:'+50% ore • lively cloud • +10% bounty',
     mods:{ore:1.5, growth:1.15, hearts:0, derelicts:0, reward:1.1}},
    {kind:'Infested Bastion', color:'#c084fc', desc:'+2 hearts • ravenous cloud • +60% bounty',
     mods:{ore:1.2, growth:1.35, hearts:2, derelicts:0, reward:1.6}},
    {kind:'Ancient Reliquary', color:'#fbbf24', desc:'extra derelict • salvage rich • +20% bounty',
     mods:{ore:1.0, growth:1.0, hearts:0, derelicts:1, reward:1.2}},
  ];
  return arch.map(a=>({
    ...a, mods:{...a.mods},
    name:`${SYS_PREFIX[Math.floor(Math.random()*SYS_PREFIX.length)]}${SYS_SUFFIX[Math.floor(Math.random()*SYS_SUFFIX.length)]} ${roman(galaxy+2)}`,
  }));
}
let warpChoices=[];
function openWarpScreen(){
  warpChoices=genSystemChoices();
  warpReturn = state===STATE.CLEAR ? STATE.CLEAR : STATE.PLAYING;
  setState(STATE.WARP);
}
function renderWarpChoices(){
  const wrap=document.getElementById('warpChoices');
  if(!wrap) return;
  wrap.innerHTML='';
  warpChoices.forEach((c,i)=>{
    const div=document.createElement('div');
    div.className='warp-card';
    div.style.borderColor=c.color;
    div.innerHTML=`<div class="warp-name" style="color:${c.color}">✦ ${c.name}</div>
      <div class="warp-kind">${c.kind}</div>
      <p>${c.desc}</p>`;
    const btn=document.createElement('button');
    btn.textContent=`WARP HERE (${i+1})`;
    btn.onclick=()=>{ pendingSys=c; doWarp(true); setState(STATE.PLAYING); ensureAudio(); updateBuildBar(); };
    div.appendChild(btn); wrap.appendChild(div);
  });
}
function queueWave(){
  // CLOUD SURGE: instead of spawning walker enemies, the voxel cloud lunges inward.
  spawnQueue=[];
  const isSurge = wave%10===0;
  const burst = Math.round(((isSurge ? 60+wave*3 : 14+Math.floor(wave*1.6)+Math.floor(threatTime/25)))*(sysMods.growth||1)*(1+0.25*corePressure()));
  mycSurge(burst);
  if(isSurge){
    showWaveBanner();
    flashHint(`Biological surge! The Bloom lunges outward`);
  } else {
    showWaveBanner();
  }
  { const vc=viewCenter(); addParticles(vc.x,vc.y,10,'#a855f7',80); }
  SFX.wave();
  waveSpawning=false;
  spawnAcc=0;
}
function spawnEnemyFromQueue(){
  // legacy walker spawner disabled - cloud uses mycSurge() instead.
  waveSpawning=false;
  return;
}
function myceliumGrowStep(ddt){
  // continuous creep: frontier voxels colonize empty neighbours
  if(!defenseEstablished) return;
  mycTime+=ddt;
  const now=performance.now()*0.001;
  // ramp: slow creep at first (~0.85s), full pressure once established
  const ramp=Math.min(1, 0.35+threatTime/75);
  const interval=Math.max(0.10, (0.85 - threatTime*0.0022 - wave*0.012 - galaxy*0.02)/((sysMods.growth||1)*(1+0.35*corePressure())));
  mycGrowthAcc+=ddt*ramp;
  // age + flash decay
  if(mycCells.size>0 && Math.random()<0.3){
    for(const cell of mycCells.values()){
      cell.age+=ddt;
      if(cell.flash>0) cell.flash-=ddt;
    }
  } else {
    for(const cell of mycCells.values()){ cell.age+=ddt; if(cell.flash>0) cell.flash-=ddt; }
  }
  let guard=0;
  const capped=mycCapped();
  // cached key array: [...24k keys] per attempt would churn GC to death
  if(!mycKeyCacheT || now-mycKeyCacheT>0.5 || !mycKeyCache.length){
    mycKeyCache=[...mycCells.keys()];
    mycKeyCacheT=now;
  }
  const keys=mycKeyCache;
  while(mycGrowthAcc>=interval && guard++<6){
    mycGrowthAcc-=interval;
    if(capped) continue; // at cap: hold mass, skip the doomed rolls entirely
    const attempts=Math.max(1, Math.round((2+Math.floor(wave/3)+galaxy)*ramp));
    for(let i=0;i<attempts;i++){
      if(!keys.length) break;
      const cell=mycCells.get(keys[Math.floor(Math.random()*keys.length)]);
      if(!cell) continue;
      if(cell.slowUntil>now) continue; // cryo-held voxels can't spread
      const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
      const d=dirs[Math.floor(Math.random()*dirs.length)];
      // bias growth toward the station so the cloud hunts the player
      let nx=cell.cx+d[0], ny=cell.cy+d[1];
      if(Math.random()<0.45){
        const c=mycCellCenter(cell.cx,cell.cy);
        nx=cell.cx+Math.sign(CORE.x-c.x);
        ny=cell.cy+Math.sign(CORE.y-c.y);
        if(Math.random()<0.5) nx=cell.cx+d[0];
        else ny=cell.cy+d[1];
      }
      infectCell(nx,ny);
    }
  }
  // hearts are organs: fountain nearby cloud AND reach out with tendrils
  for(const h of hearts){
    h.emitAcc=(h.emitAcc||0)+ddt;
    const hIv=(h.primary?0.8:1.1)*(finalPush?0.6:1); // M9: primary beats hard, the last heart screams
    if(h.emitAcc>hIv){
      h.emitAcc=0;
      const hc=mycWorldToCell(h.x,h.y);
      for(let k=0;k<2;k++) infectCell(hc.cx+Math.floor(Math.random()*7)-3, hc.cy+Math.floor(Math.random()*7)-3);
    }
    // tendril rhythm quickens as internal pressure rises — never a "wave".
    // A living core quickens every heart with it.
    h.tendrilAcc=(h.tendrilAcc==null?14:h.tendrilAcc)-ddt;
    if(h.tendrilAcc<=0){
      h.tendrilAcc=Math.max(7, 26-threatTime*0.02-wave*0.6-corePressure()*2);
      heartTendril(h);
    }
    if(h.flash>0) h.flash-=ddt;
  }
  updateClusters(ddt);
  updateCores(ddt);
  updateTendrils(ddt);
  ledgerMaterialize(ddt);
  updateBloomCycle(ddt);
  for(const p of pods){
    p.emitAcc=(p.emitAcc||0)+ddt;
    if(p.emitAcc>2.2){
      p.emitAcc=0;
      const pc=mycWorldToCell(p.x,p.y);
      infectCell(pc.cx+Math.floor(Math.random()*5)-2, pc.cy+Math.floor(Math.random()*5)-2);
    }
    if(p.flash>0) p.flash-=ddt;
  }
  podTimer-=ddt;
  if(podTimer<=0){
    podTimer=16+Math.random()*8;
    if(pods.length<2+Math.floor(wave/8)+corePressure()) spawnPod();
  }
  // M4: corrupted worlds simmer, overrun worlds feed the cloud — purge the
  // voxels off them to step the infection back down. Modest rates: overrun
  // ~1 cell per ~2.6s, corrupted ~1 per ~15s.
  for(const a of asteroids){
    const st=a.cstate;
    if(st!=='overrun' && st!=='corrupted') continue;
    a.emitAcc=(a.emitAcc||0)+ddt;
    const iv= st==='overrun'?2.2:6.0;
    if(a.emitAcc>iv){
      a.emitAcc=0;
      if(Math.random()<(st==='overrun'?0.85:0.4)){
        const ang=Math.random()*6.28, rr=a.r+14+Math.random()*30;
        const cc=mycWorldToCell(a.x+Math.cos(ang)*rr, a.y+Math.sin(ang)*rr);
        infectCell(cc.cx+Math.floor(Math.random()*3)-1, cc.cy+Math.floor(Math.random()*3)-1);
      }
    }
  }
  // mass holds at cap (see MYC_CAP): old growth never starves, new growth
  // waits for the player to carve space. Nothing to do here.
  // cloud touching the station drains lives
  mycTouchAcc+=ddt;
  const touching=myceliumAtWorld(CORE.x,CORE.y,CORE.r+8);
  if(touching){
    if(mycTouchAcc>0.5){
      mycTouchAcc=0;
      lives-=1;
      SFX.hurt(); shake=Math.min(7,shake+3);
      addParticles(CORE.x,CORE.y,10,'#a855f7',120);
      addNum(CORE.x,CORE.y-20,'MYCELIUM BREACH!','#f0abfc');
      if(lives<=0){ die(false); return; }
    }
  } else mycTouchAcc=0;
  // early warning: cloud closing in — throttled alarm, not spam
  mycWarnAcc+=ddt;
  mycNearStation=!!myceliumAtWorld(CORE.x,CORE.y,CORE.r+110);
  if(mycNearStation && mycWarnAcc>8){
    mycWarnAcc=0;
    toast('\u26A0 Mycelium closing on the Station — purge the purple!', 'bad');
    logEvent('\u26A0 <b>Mycelium near the Station!</b> Shoot the purple voxels back before they touch it.', 'bad');
    SFX.no();
  }
  if(!mycNearStation) mycWarnAcc=0;
}

// input - mouse-first: drag pans, click acts (threshold separates the two)
let dragBtn=-1, dragStart=null, dragMoved=false, camStart=null, suppressContext=false;
canvas.addEventListener('mousedown', e=>{
  if(state!==STATE.PLAYING) return;
  dragBtn=e.button; dragStart={x:e.clientX,y:e.clientY}; camStart={x:cam.x,y:cam.y}; dragMoved=false;
});
canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  if(state!==STATE.PLAYING && state!==STATE.PAUSED) return;
  zoomAt(e.clientX,e.clientY,Math.pow(1.0015,-e.deltaY));
}, {passive:false});
window.addEventListener('mouseup', e=>{
  if(dragBtn<0) return;
  const btn=dragBtn, moved=dragMoved;
  dragBtn=-1; dragStart=null; dragMoved=false;
  if(state!==STATE.PLAYING) return;
  if(btn===2 && moved){ suppressContext=true; return; }
  if(btn!==0 || moved) return;
  handleWorldClick(e.clientX,e.clientY);
});
canvas.addEventListener('mousemove', e=>{
  mouse.x=e.clientX; mouse.y=e.clientY;
  if(dragBtn>=0 && dragStart){
    const dx=e.clientX-dragStart.x, dy=e.clientY-dragStart.y;
    if(Math.hypot(dx,dy)>6) dragMoved=true;
    if(dragMoved){ cam.x=camStart.x-dx/cam.zoom; cam.y=camStart.y-dy/cam.zoom; clampCam(); }
  }
  { const wpt=screenToWorld(mouse.x,mouse.y); ghostPos={x:wpt.x, y:wpt.y}; }
  const tooltip=document.getElementById('nodeTooltip');
  if(tooltip && state===STATE.PLAYING){
    const wm=screenToWorld(mouse.x,mouse.y);
    let tip=null, tx=0, ty=0;
    // worlds first: hovering a planet/moon names it and its resource
    if(!tip && star && planets.length){
      const worldTip=(b,bname)=>{
        if(Math.hypot(b.x-wm.x,b.y-wm.y) > (b.r||20)+10/cam.zoom) return false;
        const sites=(b.res||[]).filter(n=>n.surveyed);
        if(!sites.length){
          const anyRes=(b.res||[]).length>0;
          tip=anyRes?`<b>${bname}</b><br><small>UNSURVEYED • send a Scout to the ? site</small>`:`<b>${bname}</b><br><small>wild space — no extraction site</small>`;
        } else {
          const n=sites[0];
          const emw=NODE_ECON[n.kind||'belt'];
          const dn=drones.filter(d=>d.targetAsteroid===n).length;
          const stw=nodeCorruption(n).toUpperCase();
          tip=`<b>${bname}</b> • ${nodeResource(n)} ${Math.floor(n.ore)}/${n.maxOre}<br><small>${emw.yield}g/trip • drones ${dn} • ${stw}${sites.length>1?` • +${sites.length-1} site(s)`:''}</small>`;
        }
        tx=b.x; ty=b.y-(b.r||20)-16;
        return true;
      };
      const worldTipMoon=(m)=>{
        if(Math.hypot(m.x-wm.x,m.y-wm.y) > (m.r||20)+10/cam.zoom) return false;
        const n=moonClaimAt(m);
        const mname=m.name||'Moon';
        if(!n){
          tip=`<b>${mname}</b><br><small>wild space — no extraction site</small>`;
        } else {
          const emw=NODE_ECON[n.kind||'belt'];
          const dn=drones.filter(d=>d.targetAsteroid===n).length;
          tip=`<b>${mname}</b> → ${nodeName(n)} • ${nodeResource(n)}<br><small>${emw.yield}g/trip • drones ${dn} • ${nodeCorruption(n).toUpperCase()}</small>`;
        }
        tx=m.x; ty=m.y-(m.r||20)-16;
        return true;
      };
      for(const p of planets){
        let hit=false;
        for(const m of p.moons){
          if(m.x!=null && worldTipMoon(m)){ hit=true; break; }
        }
        if(!hit && p.x!=null) worldTip(p,p.name||'Planet');
        if(tip) break;
      }
    }
    for(let i=0;i<asteroids.length;i++){
      const a=asteroids[i];
      if(Math.hypot(a.x-wm.x, a.y-wm.y) < a.r+12/cam.zoom){
        if(!a.surveyed){ // M5: the dark shows nothing until charted
          const inbound=scouts.some(s=>s.target===a);
          tip=`<b>Unknown signature</b><br><small>${inbound?'SCOUT INBOUND — charting…':'UNSURVEYED • click to send a Scout'}</small>`;
          tx=a.x; ty=a.y - a.r - 16; break;
        }
        const acc=asteroidAccess(a);
        const em0=NODE_ECON[a.kind||'belt'];
        const oreTxt=`${Math.floor(a.ore)}/${a.maxOre} ore • ${em0.yield}g/trip${a.maxOre>=100?' • RICH':''}`;
        const assigned=drones.some(d=>d.targetAsteroid===a);
        const viaName=(c)=> c===CORE? 'Station' : (c&&c.name? c.name : nodeName(c));
        let status, how;
        if(!acc.ok && acc.why==='smothered'){ status='SMOTHERED'; how='purge the purple first'; }
        else if(acc.via==='linked'){ status='LINKED'; how=`lane open • ${assigned?'drone on site':'click to recall / reassign'}`; }
        else if(acc.via==='core'){ status='SEND DRONE'; how='in Station range — click to send!'; }
        else if(acc.via==='uplink'){ status='SEND DRONE'; how='in Hangar uplink — click to send!'; }
        else if(acc.via==='chain'){ status='SEND DRONE'; how=`chain open via ${viaName(acc.node)}`; }
        else if(acc.via==='hop'){ status='SEND DRONE'; how=`relay hop via ${viaName(acc.node)}`; }
        else if(acc.via==='outpost'){ status='SEND DRONE'; how=`outpost relay via ${viaName(acc.node)}`; }
        else if(acc.why==='chain'){ status='LOCKED'; how=`link ${viaName(acc.node)} first, hop within 300, or add Hangar`; }
        else { status='TOO FAR'; how=`link nearer worlds or add Hangar (uplink ${Math.floor(hangarUplink())})`; }
        const cs0=nodeCorruption(a); // M4: infection readout overrides route status
        if(cs0==='infected'){ status='INFECTED'; how+=' • mining slowed'; }
        else if(cs0==='corrupted'){ status='CORRUPTED'; how='drones refused — purge the purple!'; }
        else if(cs0==='overrun'){ status='OVERRUN'; how='feeds the cloud — purge fast!'; }
        else if(cs0==='exposed'){ how+=' • mycelium near'; }
        if(acc.ok){ // M6: route identity — what does THIS world pay?
          const guards0=towers.reduce((n,t)=>n+((!t.isModule&&t.anchor&&t.anchor.obj===a)?1:0),0);
          how+=` • ${em0.blurb}`;
          if(cs0==='infected') how+=' • hazard pay +2g';
          if(guards0>0) how+=` • guarded ×${guards0}`;
        }
        if(assigned && acc.ok && acc.via!=='linked') status='DRONE ASSIGNED';
        tip=`<b>${nodeName(a)}</b> • ${oreTxt}<br><small>${status} • ${how}</small>`;
        tx=a.x; ty=a.y - a.r - 16; break;
      }
    }
    if(!tip && myceliumVisible()){
      const ent=entityAtWorld(wm.x,wm.y,10);
      if(ent){
        const isH=hearts.includes(ent);
        const isC=cores.includes(ent);
        tip=isC?`<b>◉ Bloom Core</b><br><small>HP ${Math.max(0,Math.ceil(ent.hp))}/${ent.maxHp} • clear its colony first!</small>`:isH?`<b>♥ Mycelium heart</b><br><small>HP ${Math.max(0,Math.ceil(ent.hp))}/${ent.maxHp} • slay it!</small>`:`<b>Spore pod</b><br><small>HP ${Math.max(0,Math.ceil(ent.hp))}/${ent.maxHp} • pop it!</small>`;
        tx=ent.x; ty=ent.y-ent.r-12;
      } else {
        const cell=myceliumAtWorld(wm.x,wm.y,10);
        if(cell){
          const c=mycCellCenter(cell.cx,cell.cy);
          tip=`<b>Mycelium voxel</b><br><small>HP ${Math.max(0,Math.ceil(cell.hp))} • shoot to purge</small>`; tx=c.x; ty=c.y-12;
        }
      }
    }
    if(tip){ const s=worldToScreen(tx,ty); tooltip.innerHTML=tip; tooltip.style.left=s.x+'px'; tooltip.style.top=s.y+'px'; tooltip.classList.remove('hidden'); }
    else tooltip.classList.add('hidden');
  } else if(tooltip) tooltip.classList.add('hidden');
});
canvas.addEventListener('contextmenu', e=>{ e.preventDefault(); if(suppressContext){ suppressContext=false; return; } if(placeType){ placeType=null; ghostPos=null; updateBuildBar(); } else if(strikeArming){ strikeArming=false; toast('STRIKE WING stood down', 'hint'); updateBuildBar(); } else if(outpostPlacing){ outpostPlacing=false; toast('Outpost survey stood down', 'hint'); } else { selectedTower=null; hidePanel(); } });
function handleWorldClick(sx,sy){
  if(state!==STATE.PLAYING) return;
  const w=screenToWorld(sx,sy), x=w.x, y=w.y;
  if(placeType){
    if(placeType==='drone'){
      // drone spawns at core, click anywhere to confirm buy (no placement)
      tryPlaceDrone();
      return;
    }
    tryPlace(x,y);
    return;
  }
  if(strikeArming){
    // manual strike: the click IS the order — fleet flies at this point
    commitStrike(x,y);
    return;
  }
  if(outpostPlacing){
    // founding click: the map IS the decision
    commitOutpost(x,y);
    return;
  }
  // celestial bodies first: planets ARE their resources — clicking a world
  // assigns drones to its extraction site, which rides it everywhere.
  const bodyHit=bodyNodeAt(x,y);
  if(bodyHit){
    if(bodyHit.wild){
      flashHint(`${bodyHit.name} — wild space, no extraction site`);
      return;
    }
    handleNodeClick(bodyHit.node);
    return;
  }
  // extraction sites / drifting clusters / hulks
  for(let i=0;i<asteroids.length;i++){
    const a=asteroids[i];
    if(Math.hypot(a.x-x, a.y-y) < a.r+12/cam.zoom){
      handleNodeClick(a);
      return;
    }
  }
  for(const o of outposts){
    if(Math.hypot(o.x-x, o.y-y) < o.r+14/cam.zoom){
      const guns=towers.filter(t=>t.anchor&&t.anchor.obj===o&&!t.isModule).length;
      flashHint(`${o.name} • hull ${Math.max(0,Math.floor(o.hp))}/${o.maxHp} • guns ${guns}/2 • relayed ${Math.floor(o.relayed)}g`);
      return;
    }
  }
  if(myceliumVisible() && myceliumAtWorld(x,y,10/cam.zoom)){ flashHint('Mycelium voxel - shoot it to purge! Plasma splashes best'); addParticles(x,y,6,'#a78bfa'); }
  let found=null, best=1e9;
  for(const t of towers){
    const d=Math.hypot(t.x-x,t.y-y);
    if(d < t.r+14/cam.zoom && d<best){ best=d; found=t; }
  }
  if(found){ selectedTower=found; showPanel(found); }
  else if(Math.hypot(CORE.x-x,CORE.y-y) < CORE.r+16/cam.zoom){ showStationPanel(); }
  else { selectedTower=null; hidePanel(); }
}
// Moons chaperone claims: clicking a moon addresses the nearest claim in
// its neighborhood (it turns to face one at build). Far from everything:
// wild space.
function moonClaimAt(m){
  if(m.x==null) return null;
  let best=null, bd=1e18;
  for(const a of asteroids){
    const d=Math.hypot(a.x-m.x,a.y-m.y);
    if(d<m.r+120 && d<bd){ bd=d; best=a; }
  }
  return best;
}
function bodyNodeAt(x,y){
  if(star && Math.hypot(star.x-x,star.y-y) < star.r+10/cam.zoom)
    return {wild:true, name:'Sol'};
  for(const p of planets){
    for(const m of p.moons){
      if(m.x!=null && Math.hypot(m.x-x,m.y-y) < m.r+10/cam.zoom){
        const nc=moonClaimAt(m);
        if(nc) return {node:nc};
        return {wild:true, name:m.name||'Moon'};
      }
    }
    if(p.x!=null && Math.hypot(p.x-x,p.y-y) < p.r+10/cam.zoom){
      if(p.res && p.res.length){
        let best=p.res[0], bd=1e18;
        for(const n of p.res){ const d=Math.hypot(n.x-x,n.y-y); if(d<bd){ bd=d; best=n; } }
        return {node:best};
      }
      return {wild:true, name:p.name||'Planet'};
    }
  }
  return null;
}
function handleNodeClick(a){
      const scBusy=scouts.find(s=>s.target===a); // M5: recall a working scout first
      if(scBusy){ scBusy.target=null; scBusy.mode='idle'; flashHint('Scout recalled'); return; }
      if(!a.surveyed){ // M5: the dark must be charted before mining drones go in
        const sc=scouts.find(s=>!s.target);
        if(!sc){
          if(scouts.length<SCOUT_MAX) flashHint('Unsurveyed signature — buy a Scout Drone below first');
          else flashHint('All scouts busy — wait for a survey to finish');
          return;
        }
        sc.target=a; sc.mode='outbound'; sc.surveyT=0;
        flashHint('Scout → unknown signature: charting, +8g on completion', 'good');
        addParticles(a.x,a.y,8,'#67e8f9');
        return;
      }
      const acc0=asteroidAccess(a);
      if(!acc0.ok && acc0.why==='smothered'){ flashHint('Smothered! Purge the purple voxels first (Plasma splashes best)'); addParticles(a.x,a.y,6,'#fb923c'); return; }
      if(!acc0.ok){
        if(acc0.why==='chain'){
          const pn=acc0.node===CORE?'Station':nodeName(acc0.node);
          flashHint(`Locked! Link ${pn} first — or hop within 300px, or add Hangar uplink`);
          if(acc0.node && acc0.node!==CORE) addParticles(acc0.node.x,acc0.node.y,6,'#7ce67c');
        } else {
          flashHint(`Too far! Link nearer worlds or build Hangar (uplink ${Math.floor(hangarUplink())})`);
        }
        return;
      }
      const assignedDrone=drones.find(d=>d.targetAsteroid===a);
      if(assignedDrone){
        assignedDrone.targetAsteroid=null;
        assignedDrone.routeIndex=0;
        flashHint(`Drone ${drones.indexOf(assignedDrone)+1} recalled from ${nodeName(a)}`);
        return;
      }
      const drone=drones.find(d=>!d.targetAsteroid);
      if(!drone){
        if(drones.length<getMaxDrones()) flashHint('No idle drone — buy another Relay Drone below first');
        else flashHint(`All ${drones.length} drones busy — build a Hangar Bay for +1 slot (Station: 3 modules max)`);
        return;
      }
      drone.targetAsteroid=a;
      drone.routeIndex=0;
      drone.mineTimer=0;
      flashHint(`Drone ${drones.indexOf(drone)+1} → ${nodeName(a)}: lane opening, ${NODE_ECON[a.kind||'belt'].yield}g per trip`, 'good');
      addParticles(a.x,a.y,10,'#facc15');
      return;
}
function tryPlaceDrone(){
  const cost= TOWER_DEFS.find(d=>d.id==='drone').cost;
  if(coins < cost){ SFX.no(); return; }
  if(drones.length >= getMaxDrones()){ SFX.no(); flashHint('Need Hangar Bay for more drones!'); return; }
  coins-=cost;
  drones.push({x:CORE.x, y:CORE.y, hp:44, maxHp:44, flash:0, invuln:1.0, carrying:false, speed:95, targetAsteroid:null, routeIndex:0, mineTimer:0, wander:Math.random()*6});
  SFX.place(); addParticles(CORE.x,CORE.y,10,'#facc15');
  flashHint(`Drone ${drones.length} launched! Now CLICK a glowing GOLD world to send it mining`);
  logEvent(`<b>Drone ${drones.length} ready.</b> Click a <b style="color:#facc15">gold SEND DRONE world</b> — it opens the lane, mines ore, ferries gold home per trip`, 'good');
  updateBuildBar();
}
// ===== M5: SCOUT DRONES — charting the dark (table-driven discoveries) =====
const DISCOVERIES=[
  {w:3, name:'Ancient beacon', bonus:'+12g', fx:()=>{ coins+=12; }},
  {w:2, name:'Pre-collapse cache', bonus:'+20g', fx:()=>{ coins+=20; }},
  {w:2, name:'Mycelium sample', bonus:'+6 purge', fx:()=>{ purgeTotal+=6; checkMilestones(); }},
  {w:1, name:'Intact fuel cell', bonus:'+15g', fx:()=>{ coins+=15; }},
];
function tryLaunchScout(){
  const cost=TOWER_DEFS.find(d=>d.id==='scout').cost;
  if(coins<cost){ SFX.no(); return; }
  if(scouts.length>=SCOUT_MAX){ SFX.no(); flashHint('Scout wing full (2 max)!'); return; }
  coins-=cost;
  scouts.push({x:CORE.x, y:CORE.y, speed:130, target:null, mode:'idle', surveyT:0, wander:Math.random()*6});
  SFX.place(); addParticles(CORE.x,CORE.y,10,'#67e8f9');
  flashHint('Scout launched! CLICK an UNSURVEYED (?) world to chart it (+8g)');
  logEvent('<b>Scout away.</b> Click a <b style="color:#67e8f9">? UNSURVEYED signature</b> — charting pays 8g, derelicts hide salvage', 'good');
  updateBuildBar();
}
function completeSurvey(a){
  a.surveyed=true;
  coins+=8;
  addParticles(a.x,a.y,16,'#67e8f9');
  addNum(a.x,a.y-a.r-14,'CHARTED! +8g','#67e8f9');
  SFX.coin();
  if(a.kind==='derelict'){
    coins+=25;
    logEvent(`SALVAGE — <b>${nodeName(a)} boarded.</b> +25g cache stripped. Link it to mine the wreck.`, 'good');
  } else {
    logEvent(`SURVEY — <b>${nodeName(a)} charted.</b> ${a.maxOre>=100?'RICH ground — worth a lane.':'Ground mapped.'} (+8g)`, 'good');
  }
  if(Math.random()<0.3){
    const tot=DISCOVERIES.reduce((n,d)=>n+d.w,0);
    let roll=Math.random()*tot, pick=DISCOVERIES[0];
    for(const d of DISCOVERIES){ roll-=d.w; if(roll<=0){ pick=d; break; } }
    pick.fx();
    addNum(a.x,a.y+a.r+16,pick.bonus,'#fde68a');
    logEvent(`SURVEY — find: <b>${pick.name}</b> — ${pick.bonus}`, 'good');
  }
  updateBuildBar();
}
function getAsteroidRoute(target){
  const route=[];
  let current=target;
  while(current && current!==CORE){ route.unshift(current); current=current.parent; }
  return route;
}
function findNearestAnchor(x,y){
  let best=null, bestD=1e9;
  const coreD=Math.hypot(CORE.x-x,CORE.y-y);
  if(coreD<115){ best={type:'core', obj:CORE, dist:coreD}; bestD=coreD; }
  for(const a of asteroids){
    // only already linked asteroids can host orbiting towers
    if(!a.unlocked) continue;
    if(isAsteroidBlocked(a)) continue;
    const d=Math.hypot(a.x-x,a.y-y);
    if(d<88 && d<bestD){ best={type:'asteroid', obj:a, dist:d}; bestD=d; }
  }
  for(const o of outposts){
    // online outposts host 2 weapons like a world — forward firing positions
    const d=Math.hypot(o.x-x,o.y-y);
    if(d<88 && d<bestD){ best={type:'outpost', obj:o, dist:d}; bestD=d; }
  }
  return best;
}
function tryPlace(x,y){
  if(!placeType) return;
  if(placeType==='drone'){ tryPlaceDrone(); return; }
  const def=TOWER_DEFS.find(d=>d.id===placeType);
  if(!def) return;
  if(coins < def.cost){ SFX.no(); return; }
  if(bloomLeashed(x,y)){ SFX.no(); return; }
  const anchor=findNearestAnchor(x,y);
  if(!anchor){
    SFX.no(); flashHint('Place near the Station or a linked world to orbit!');
    return;
  }
  for(const t of towers){
    if(t.anchor && t.anchor.obj===anchor.obj && (!!t.isModule===!!def.isModule)){
      const ang=Math.atan2(y-anchor.obj.y,x-anchor.obj.x);
      const dAng=Math.abs(((t.orbitAngle - ang + Math.PI*3) % (Math.PI*2)) - Math.PI);
      if(dAng < 0.45){ SFX.no(); flashHint('Orbit crowded — spread around!'); return; }
    }
    if(!!t.isModule===!!def.isModule && Math.hypot(t.x-x,t.y-y) < 22){ SFX.no(); flashHint('Too close to another tower!'); return; }
  }
  const sameAnchorCount=towers.filter(t=>t.anchor && t.anchor.obj===anchor.obj && (!!t.isModule===!!def.isModule)).length;
  const maxSlots = def.isModule ? 3 : anchor.type==='core'?3:2;
  if(sameAnchorCount >= maxSlots){ SFX.no(); flashHint(`Orbit full (${maxSlots} max) — upgrade!`); return; }
  if(myceliumVisible() && myceliumAtWorld(x,y,14)){ SFX.no(); flashHint('Voxel in the way — purge it first!'); return; }
  const orbitR = def.isModule ? (anchor.type==='core' ? 56 : anchor.obj.r + 38) : (anchor.type==='core' ? 38 : anchor.obj.r + 26);
  const orbitAng = Math.atan2(y-anchor.obj.y, x-anchor.obj.x);
  const nt={
    x: anchor.obj.x + Math.cos(orbitAng)*orbitR,
    y: anchor.obj.y + Math.sin(orbitAng)*orbitR,
    r:16,
    id:def.id, baseCost:def.cost, baseDmg:def.dmg, baseRange:def.range, baseFireRate:def.fireRate, projSpeed:def.projSpeed,
    splash:def.splash||0, chain:def.chain||0, slow:def.slow||0, slowDur:def.slowDur||0,
    color:def.color, icon:def.icon, name:def.name, isModule:!!def.isModule, mod:def.mod||null,
    level:1, branch:null, cd:0, angle: orbitAng,
    anchor, orbitR, orbitAngle:orbitAng, orbitSpeed:0.24+Math.random()*0.10
  };
  towers.push(nt);
  coins-=def.cost;
  towersBuilt++;
  if(!defenseEstablished && !def.isModule && !def.isDrone){
    defenseEstablished=true;
    waveTimer=5;
    // The wake is SHOWN, not told: pulse, sting, shake, spores — plus one
    // quiet sensor line in the ship log. No explanatory banner.
    logEvent('BIOLOGICAL ACTIVITY — deep-field signal registered.', 'surge');
    addParticles(CORE.x,CORE.y,16,'#7dd3fc');
    SFX.boom(); shake=Math.min(8,shake+5); wakeFlash=1;
    for(const mo of driftMotes) addParticles(mo.x,mo.y,2,'#f0abfc',40);
    driftMotes=[];
  }
  undoStack.push({type:'place', tower:nt});
  if(undoStack.length>20) undoStack.shift();
  SFX.place();
  addParticles(x,y,10,def.color);
  selectedTower=nt; showPanel(nt);
  if(def.isModule) flashHint(`${def.name} online`);
  if(coins < def.cost){ placeType=null; ghostPos=null; }
  updateBuildBar();
  if(towersBuilt===1){
    const tut=document.getElementById('tutorialHint');
    if(tut && !tut.classList.contains('hidden')) setTimeout(()=>{ tut.classList.add('hidden'); localStorage.setItem('atd_tutDone','1'); document.getElementById('buildBar')?.classList.remove('tut-highlight'); }, 900);
  }
}
function flashHint(txt, kind){
  toast(txt, kind||'hint');
  logEvent(txt, kind||'hint');
}
function distToPath(px,py){ return 999; }

function isBuildAvailable(def){
  // drones-first opening: harvesters + Hangar are available immediately
  if(def.id==='archer') return true;
  if(def.id==='drone') return true;
  if(def.id==='scout') return true;
  if(def.id==='hangar') return true;
  if(def.id==='railgun') return defenseEstablished && wave>=4;
  return isTowerUnlocked(def.id) && wave>=2;
}
function getBuildableDefs(){ return TOWER_DEFS.filter(isBuildAvailable); }

const BUILD_HELP={
  archer:'Pulse Laser — cheap single-target tower. Auto-shoots the most threatening voxel in range. Placement: orbit the Station (3 weapon slots) or a LINKED world (2 slots each).',
  frost:'Cryo Node — chills voxels (blue tint): frozen voxels STOP spreading. Best parked on trade lanes.',
  cannon:'Plasma Mortar — SPLASH damage melts voxel crowds and burns smothered worlds back open. Best purge tool.',
  storm:'Tesla Coil — lightning arcs to nearby voxels. Shines against dense fronts.',
  barrage:'Swarm Bay — fires 3 micro-missiles per shot. Shreds loose voxels cheaply.',
  railgun:'Railgun — EXTREME range (430) sniper. Hyper-velocity slugs pierce deep voxel lines and crack hearts & pods from afar. Slow firing. Unlocks once the Bloom stirs.',
  drone:'HOW DRONES WORK: 1) Buy here — the drone orbits your Station. 2) CLICK a glowing GOLD world (SEND DRONE) to send it: it opens the trade lane, mines ore, and ferries gold home per trip (5–8g by world). 3) Click its world again to recall. Smothered or unreachable worlds refuse drones. Hangar Bays raise the drone cap.',
  scout:'HOW SCOUTS WORK: 1) Buy here — the scout orbits your Station. 2) CLICK a dark ? UNSURVEYED signature: it flies direct, charts the world (+8g) and reveals moons, belts, planets and derelicts. Derelicts hide +25g salvage; strange discoveries happen. Wing cap: 2.',
  hangar:'Hangar Bay — FIRST BUY. Adds drone slots, uplink reach, and crew speed. Lv3 picks THROUGHPUT (faster mining) or RANGE (longer relays). Station holds 3 modules max.',
};
function stationWeaponCount(){ return towers.filter(t=>!t.isModule && t.anchor && t.anchor.obj===CORE).length; }
function stationModuleCount(){ return towers.filter(t=>t.isModule && t.anchor && t.anchor.obj===CORE).length; }
function idleDrones(){ return drones.filter(d=>!d.targetAsteroid).length; }
function updateBuildBar(){
  const wrap=document.getElementById('buildButtons');
  if(!wrap) return;
  const linked=asteroids.filter(a=>a.unlocked).length;
  const idle=idleDrones();
  canvas.style.cursor=placeType?'copy':'crosshair';
  // rebuild buttons only when something visible changed — rebuilding every
  // frame swallowed clicks and flickered hover state
  const sig=JSON.stringify([getBuildableDefs().map(d=>d.id),coins,placeType,drones.length,getMaxDrones(),idle,linked,wave,permLevels,scouts.length,asteroids.filter(a=>a.surveyed).length]);
  if(sig===updateBuildBar._last && wrap.children.length) return;
  updateBuildBar._last=sig;
  wrap.innerHTML='';
  const title=document.querySelector('.build-title');
  if(title) title.textContent=defenseEstablished ? 'BUILD — hover a button for its briefing' : 'BUILD';
  const buildableDefs=getBuildableDefs();
  for(let hotkeyIndex=0; hotkeyIndex<buildableDefs.length; hotkeyIndex++){
    const d=buildableDefs[hotkeyIndex];
    const hotkey=hotkeyIndex+1;
    const b=document.createElement('button');
    const affordable = coins>=d.cost;
    const focusDrone=drones.length===0 && d.isDrone;
    const focusScout=scouts.length===0 && d.isScout && asteroids.some(a=>!a.surveyed);
    b.className='tower-btn'+(placeType===d.id?' selected':'')+(affordable?' affordable':' unaffordable')+((focusDrone||focusScout)?' objective-focus':'');
    b.title=BUILD_HELP[d.id]||d.desc;
    if(d.isDrone){
      const idle=idleDrones();
      const step = drones.length===0 ? '1) Buy → 2) CLICK a gold world' : idle>0 ? `${idle} IDLE → CLICK a gold world!` : 'All busy — Hangar = +1 slot';
      b.innerHTML=`<span class="hotkey">${hotkey}</span><span class="icon">${d.icon}</span><span class="name">${d.name} (${drones.length}/${getMaxDrones()})</span><span class="cost"><span class="coin sm"></span> ${d.cost}</span><span class="desc">${step}</span>`;
    }
    else if(d.isScout){
      const idleS=scouts.filter(s=>!s.target).length;
      const unS=asteroids.filter(a=>!a.surveyed).length;
      const step = scouts.length===0 ? '1) Buy → 2) CLICK a ? world' : (idleS>0&&unS>0) ? `${idleS} IDLE → CLICK a ? world!` : unS>0 ? 'All busy — survey in progress' : 'System charted ✓';
      b.innerHTML=`<span class="hotkey">${hotkey}</span><span class="icon">${d.icon}</span><span class="name">${d.name} (${scouts.length}/${SCOUT_MAX})</span><span class="cost"><span class="coin sm"></span> ${d.cost}</span><span class="desc">${step}</span>`;
    }
    else b.innerHTML=`<span class="hotkey">${hotkey}</span><span class="icon">${d.icon}</span><span class="name">${d.name}</span><span class="cost"><span class="coin sm"></span> ${d.cost}</span><span class="desc">${d.desc}</span><span class="range-hint">RNG ${d.range}</span>`;
    b.onmouseenter=()=>{ hoverPreview=d.id; };
    b.onmouseleave=()=>{ hoverPreview=null; };
    b.onclick=()=>{
      if(d.isDrone){
        tryPlaceDrone();
        return;
      }
      if(d.isScout){
        tryLaunchScout();
        return;
      }
      if(d.isModule){
        buildStationModule(d);
        return;
      }
      if(placeType===d.id){ placeType=null; ghostPos=null; }
      else {
        if(coins < d.cost && !b.classList.contains('selected')){ SFX.no(); return; }
        placeType=d.id; { const wpt=screenToWorld(mouse.x,mouse.y); ghostPos={x:wpt.x,y:wpt.y}; }
        if(strikeArming) strikeArming=false;
        if(outpostPlacing) outpostPlacing=false;
        selectedTower=null; hidePanel();
        toast(`Placing ${d.name} — CLICK a glowing ring (Station or linked world). Right-click cancels.`, 'info');
        ensureAudio();
      }
      updateBuildBar();
    };
    wrap.appendChild(b);
  }
}
function buildStationModule(def){
  if(coins < def.cost){ SFX.no(); flashHint(`Need ${def.cost} gold for ${def.name}`); return; }
  const orbitAngles=[0,Math.PI/2,Math.PI,Math.PI*1.5];
  const freeAngle=orbitAngles.find(angle=>!towers.some(t=>{
    if(!t.anchor || t.anchor.obj!==CORE || !t.isModule) return false;
    const diff=Math.abs(((t.orbitAngle-angle+Math.PI*3)%(Math.PI*2))-Math.PI);
    return diff<0.45;
  }));
  if(freeAngle===undefined){ SFX.no(); flashHint('Station orbit full'); return; }
  placeType=def.id;
  tryPlace(CORE.x+Math.cos(freeAngle)*56,CORE.y+Math.sin(freeAngle)*56);
  placeType=null;
  ghostPos=null;
  updateBuildBar();
}
function getWavePreview(w){
  // legacy walker preview replaced: describe the living cloud instead.
  // No numbers shown to the player; this feeds tooltips only.
  const gm=sysMods.growth||1;
  if(w%10===0) return `biological surge \u2022 the Bloom quickens`;
  return `\u2593 the Bloom creeps outward \u2022 PURGE ${myceliumPurgePct()}%`;
}
function doUndo(){
  if(!undoStack.length){ SFX.no(); return; }
  const act=undoStack.pop();
  if(act.type==='place'){
    const idx=towers.indexOf(act.tower);
    if(idx>=0){ towers.splice(idx,1); coins+=act.tower.baseCost; if(selectedTower===act.tower){ selectedTower=null; hidePanel(); } SFX.coin(); addParticles(act.tower.x,act.tower.y,8,'#fff'); }
  } else if(act.type==='upgrade'){
    if(towers.includes(act.tower)){
      coins+=act.cost; act.tower.level=act.prevLevel; act.tower.branch=act.prevBranch; SFX.no(); showPanel(act.tower);
    }
  } else if(act.type==='sell'){
    towers.push(act.tower); coins-=act.value; selectedTower=act.tower; showPanel(act.tower); SFX.place();
  }
  updateBuildBar();
}

// upgrade with branch
function doUpgradeBranch(t, branch){
  const c=upgradeCost(t);
  if(coins < c || t.level>=5) { SFX.no(); return; }
  const isHangar=t.mod==='hangar';
  if(t.level===2){
    if(isHangar){ if(branch!=='throughput' && branch!=='range') return; }
    else if(branch!=='power' && branch!=='precision') return;
  }
  const prevLevel=t.level, prevBranch=t.branch;
  if(t.level===2) t.branch=branch;
  coins-=c; t.level++;
  undoStack.push({type:'upgrade', tower:t, cost:c, prevLevel, prevBranch});
  if(undoStack.length>20) undoStack.shift();
  const bCol=branch==='power'?'#ff6b35':branch==='precision'?'#fde68a':branch==='throughput'?'#ffb020':branch==='range'?'#67e8f9':'#ffd166';
  const bTxt=branch==='power'?'POWER!':branch==='precision'?'PIERCE!':branch==='throughput'?'THROUGHPUT!':branch==='range'?'RANGE!':'';
  SFX.place(); addParticles(t.x,t.y,14, bCol);
  if(t.branch) addNum(t.x, t.y-18, bTxt, bCol);
  showPanel(t); updateBuildBar();
}
const TOWER_ROLE={
  archer:'Cheap single-target purger. Your first defense — parks on the Station.',
  frost:'Chills voxels blue: frozen voxels STOP spreading. Best guarding trade lanes.',
  cannon:'SPLASH king: melts voxel crowds and burns smothered worlds back open.',
  storm:'Lightning arcs to nearby voxels. Shines against dense cloud fronts.',
  barrage:'Fires 3 micro-missiles per shot. Cheap shredder for loose voxels.',
  railgun:'Extreme-range sniper. Slugs pierce whole voxel lines — your heart-killer from afar.',
  hangar:'Logistics infrastructure. Each level adds a drone slot, uplink reach, and crew speed; Lv3 chooses faster throughput or longer relay range.',
};
function towerSlotInfo(t){
  if(!t.anchor) return 'Slot: free';
  if(t.anchor.obj===CORE) return t.isModule?`Station module ${stationModuleCount()}/3`:`Station weapon ${stationWeaponCount()}/3`;
  if(t.anchor.type==='outpost'){
    const o=t.anchor.obj;
    const n=towers.filter(x=>x.anchor && x.anchor.obj===o && (!!x.isModule===!!t.isModule)).length;
    return `${o.name} ${t.isModule?'module':'weapon'} ${n}/2`;
  }
  const i=asteroids.indexOf(t.anchor.obj);
  const n=towers.filter(o=>o.anchor && o.anchor.obj===t.anchor.obj && (!!o.isModule===!!t.isModule)).length;
  return `${nodeName(t.anchor.obj)} ${t.isModule?'module':'weapon'} ${n}/2`;
}
// what does the NEXT level actually give? (green preview line in the panel)
function previewStats(t){
  if(t.level>=5) return `<div class="next-stats">MAXED — fully purged-up</div>`;
  if(t.isModule){
    if(t.mod==='hangar'){
      const nxtUp=(t.level+1)*120+((t.branch==='range')?120:0);
      const speed=t.level+1>=2?` • crews +${t.level*4}% travel`:'';
      const path=t.level===2?' • choose <b style="color:#ffb020">THROUGHPUT</b> or <b style="color:#67e8f9">RANGE</b>':'';
      const yieldNote=t.branch==='throughput'&&t.level+1>=5?' • +1g/visit':'';
      return `<div class="next-stats">Lv${t.level+1}: +${t.level+1} slots, +${nxtUp} uplink${speed}${yieldNote}${path}</div>`;
    }
    return '';
  }
  const cur=towerStat(t);
  const nxt=towerStat({...t, level:t.level+1});
  const parts=[];
  const d=(k,a,b,suf)=>{ if(a!==b) parts.push(`${k} ${a}→<b>${b}</b>${suf||''}`); };
  d('DMG',cur.dmg,nxt.dmg); d('RNG',cur.range,nxt.range); d('RATE',cur.fireRate,nxt.fireRate,'/s');
  d('SPLASH',cur.splash,nxt.splash); d('CHAIN',cur.chain,nxt.chain); d('PIERCE',cur.pierce,nxt.pierce); d('BURST',cur.burst,nxt.burst);
  if(cur.slowDur!==nxt.slowDur) parts.push(`SLOW ${cur.slowDur.toFixed(1)}s→<b>${nxt.slowDur.toFixed(1)}s</b>`);
  let extra='';
  if(t.level===2) extra=' + picks <b style="color:#ff8a2e">POWER</b> or <b style="color:#fde68a">PIERCE</b> path';
  if(!parts.length && !extra) return '';
  return `<div class="next-stats">Lv${t.level+1}: ${parts.join(' • ')}${extra}</div>`;
}
let selectedStation=false;
function showStationPanel(){
  // the base itself as an upgradeable entity: click the Station to grow it
  selectedStation=true; selectedTower=null;
  const p=document.getElementById('towerPanel');
  if(!p) return;
  p.classList.remove('hidden');
  const bb=document.getElementById('buildBar');
  if(bb) bb.classList.add('collapsed');
  const iconEl=document.getElementById('towerPanelIcon');
  if(iconEl) iconEl.textContent='⌂';
  const nameEl=document.getElementById('towerPanelName');
  if(nameEl) nameEl.textContent='Space Station';
  const acts=document.getElementById('towerActions');
  if(acts) acts.style.display='none';
  const bc=document.getElementById('branchChoice');
  if(bc) bc.classList.add('hidden');
  const hint=document.getElementById('towerRangeHint');
  if(hint) hint.textContent='Click the Station anytime to grow your base';
  const statsEl=document.getElementById('towerStats');
  if(statsEl) statsEl.innerHTML=`
    <div class="tower-role">Your growing base. Weapons orbit outside (◉ ${stationWeaponCount()}/3 • Hangars ${stationModuleCount()}/3) — technology lives <b>inside</b>.</div>
    ${Object.keys(STATION_TECH).map(id=>{
      const d=STATION_TECH[id], lv=stationTech[id], maxed=lv>=d.max;
      const avail=techAvailable(id), lock=techLockReason(id);
      const pips='●'.repeat(lv)+'○'.repeat(d.max-lv);
      const cur=techEffect(id,lv);
      const nxt=techEffect(id,lv+1);
      const c=techCost(id);
      return `<div class="tech-row">
        <div class="tech-head"><span>${d.icon} <b>${d.name}</b></span><span class="tech-pips">${pips}</span></div>
        <div class="tech-desc">${d.desc}</div>
        <div class="tech-now">Now: <b>${cur}</b>${maxed?'':` → <b>${nxt}</b>`}</div>
        <button id="techBtn-${id}" class="tech-btn" ${maxed||!avail||coins<c?'disabled':''}>${maxed?'MAXED':!avail?lock:`UPGRADE — ${c} <span class="coin sm"></span>`}</button>
      </div>`;
    }).join('')}
    ${outpostPanelHTML()}
  `;
  statsEl.querySelectorAll('.tech-btn').forEach(b=>{
    b.onclick=()=>buyTech(b.id.replace('techBtn-',''));
  });
  const ob=document.getElementById('outpostBuildBtn');
  if(ob) ob.onclick=()=>{ ensureAudio(); startOutpostPlacement(); };
}
// Forward Outposts live in the station panel: the final unlock, earned late.
function outpostPanelHTML(){
  const rows=outposts.map(o=>{
    const pct=Math.max(0,Math.round(o.hp/o.maxHp*100));
    return `<div class="tech-desc">◈ <b>${o.name}</b> • hull ${pct}% • relayed ${Math.floor(o.relayed)}g${o.hp<90?' • <b style="color:#f87171">CRITICAL</b>':''}</div>`;
  }).join('');
  const building=constructions.map(()=>'<div class="tech-desc">◌ Construction fleet underway…</div>').join('');
  const unlocked=outpostUnlocked();
  const full=outpostCount()>=OUTPOST_MAX;
  const afford=coins>=OUTPOST_COST;
  const can=!full&&unlocked&&afford;
  const btn=full?`CREWED ${outposts.length}/${OUTPOST_MAX} — lose one to rebuild`
    :!unlocked?outpostLockReason()
    :!afford?`Needs ${OUTPOST_COST}g`
    :`FOUND OUTPOST — ${OUTPOST_COST} <span class="coin sm"></span>`;
  return `<div class="tech-row">
    <div class="tech-head"><span>◈ <b>Forward Outpost</b></span><span class="tech-pips">${outposts.length}/${OUTPOST_MAX}</span></div>
    <div class="tech-desc">A permanent foothold anywhere: relay reach, short deliveries, crew repairs, 2 weapon slots. Max ${OUTPOST_MAX}, ever — the station can crew no more. It will draw the Bloom.</div>
    ${rows}${building}
    <button id="outpostBuildBtn" class="tech-btn" ${can?'':'disabled'}>${btn}</button>
  </div>`;
}
function showPanel(t){
  selectedStation=false;
  const p=document.getElementById('towerPanel');
  if(!p) return;
  p.classList.remove('hidden');
  const bb=document.getElementById('buildBar');
  if(bb) bb.classList.add('collapsed');
  const acts=document.getElementById('towerActions');
  if(acts) acts.style.display='';
  const hint=document.getElementById('towerRangeHint');
  if(hint) hint.innerHTML='Gold corners = range • <span style="opacity:0.6">Ctrl+Z undo</span>';
  const iconEl=document.getElementById('towerPanelIcon');
  if(iconEl) iconEl.textContent=t.icon;
  const nameEl=document.getElementById('towerPanelName');
  const branchTag=!t.branch?'':t.branch==='power'?'▲ POWER':t.branch==='precision'?'→ PIERCE':t.branch==='throughput'?'▲ THROUGHPUT':'→ RANGE';
  if(nameEl) nameEl.innerHTML=t.name + (t.branch? ` <small style="opacity:0.7">${branchTag}</small>` : '');
  const lvlEl=document.getElementById('towerPanelLevel');
  if(lvlEl) lvlEl.textContent='MK·'+roman(t.level) + (t.branch? ` • ${t.branch}`:'');
  const st=towerStat(t);
  const maxLv=5;
  const isHangar=t.mod==='hangar';
  const roleLine=TOWER_ROLE[t.id]?`<div class="tower-role">${TOWER_ROLE[t.id]}</div>`:'';
  const previewLine=previewStats(t);
  const slotLine=`<div id="towerSlotInfo">${towerSlotInfo(t)} • Sell returns ${sellValue(t)} (60%)</div>`;
  const branchDesc = t.branch==='throughput'?'+6% mining speed + delivery bonus' : t.branch==='range'?'+120 uplink from this bay' : t.id==='archer' ? (t.branch==='power'?'+32% DMG +PWR' : 'TWIN x2 + Pierce 1-2') : t.id==='barrage' ? (t.branch==='power'?'+1 burst shot' : 'Pierce 2 + Burst 5') : t.id==='cannon' ? (t.branch==='power'?'+32% Splash' : 'Pierce 1') : t.id==='storm' ? (t.branch==='power'?'+1 Chain' : 'Pierce 1-2') : t.id==='frost' ? (t.branch==='power'?'+22% freeze + range' : '+35% freeze duration + range') : t.id==='railgun' ? (t.branch==='power'?'+32% DMG' : '+25% RNG +15% DMG') : (t.branch==='power'?'+32% DMG' : 'Pierce');
  const branchCol=t.branch==='power'||t.branch==='throughput'?'#ff8a2e':'#fde68a';
  const branchInfo = t.branch ? `<div class="stat"><span>Path</span><b style="color:${branchCol}">${t.branch.toUpperCase()} <small>${branchDesc}</small></b></div>` : (t.level===2 ? `<div class="stat" style="color:#ffd166;font-size:10px">◆ Next upgrade chooses ${isHangar?'a logistics path':'a combat path'}!</div>` : '');
  const hangarRows=`
    <div class="stat"><span>Drone slots</span><b>+${t.level}</b></div>
    <div class="stat"><span>Uplink</span><b>+${t.level*120+((t.branch==='range'&&t.level>=3)?120:0)}</b></div>
    ${t.branch?`<div class="stat"><span>Level</span><b>${t.level} / ${maxLv}</b></div>`:''}`;
  const weaponRows=`
    <div class="stat"><span>Damage</span><b>${st.dmg}</b></div>
    <div class="stat"><span>Range</span><b>${st.range}</b></div>
    <div class="stat"><span>Fire rate</span><b>${st.fireRate}/s</b></div>
    ${st.splash? `<div class="stat"><span>Splash</span><b>${st.splash}</b></div>`:''}
    ${st.chain? `<div class="stat"><span>Chain</span><b>${st.chain}</b></div>`:''}
    ${st.pierce? `<div class="stat"><span>Pierce</span><b>${st.pierce}</b></div>`:''}
    ${st.burst? `<div class="stat"><span>Burst</span><b>${st.burst}-shot</b></div>`:''}
    ${t.slow? `<div class="stat"><span>Slow</span><b>${Math.round(t.slow*100)}% ${st.slowDur.toFixed(1)}s</b></div>`:''}
    <div class="stat"><span>Level</span><b>${t.level} / ${maxLv}</b></div>`;
  const statsEl=document.getElementById('towerStats');
  if(statsEl) statsEl.innerHTML=`
    ${roleLine}
    ${isHangar?hangarRows:weaponRows}
    ${previewLine}
    ${branchInfo}
    ${slotLine}
  `;
  const up=document.getElementById('upgradeBtn');
  const sell=document.getElementById('sellBtn');
  const sellEl=document.getElementById('sellValue');
  if(sellEl) sellEl.textContent=sellValue(t);
  if(up){
    if(t.level>=maxLv){
      up.disabled=true;
      up.innerHTML='MAXED';
      up.classList.add('disabled');
      up.style.display='';
      const bc=document.getElementById('branchChoice');
      if(bc) bc.classList.add('hidden');
    } else if(t.level===2){
      up.style.display='none';
      let bc=document.getElementById('branchChoice');
      if(!bc){
        bc=document.createElement('div'); bc.id='branchChoice'; bc.className='branch-choice';
        up.parentNode.insertBefore(bc, up);
      }
      bc.classList.remove('hidden');
      const c=upgradeCost(t);
      const canAfford = coins >= c;
      const isHg=t.mod==='hangar';
      const powLabel = isHg?'\u25B2 THROUGHPUT<br><small>Mining speed +6%</small>' : t.id==='archer'?'\u25B2 POWER<br><small>+32% DMG</small>' : t.id==='barrage'?'\u25B2 POWER<br><small>+1 burst shot</small>' : t.id==='cannon'?'\u25B2 POWER<br><small>+32% Splash</small>' : t.id==='storm'?'\u25B2 POWER<br><small>+1 Chain</small>' : t.id==='railgun'?'\u25B2 POWER<br><small>+32% DMG</small>' : '\u25B2 POWER';
      const preLabel = isHg?'\u2192 RANGE<br><small>+120 uplink</small>' : t.id==='archer'?'\u2192 PIERCE<br><small>Twin + Pierce 1-2</small>' : t.id==='barrage'?'\u2192 PIERCE<br><small>Pierce 2 + Burst 5</small>' : t.id==='cannon'?'\u2192 PIERCE<br><small>Pierce 1 \u2022 line cutter</small>' : t.id==='storm'?'\u2192 PIERCE<br><small>Pierce 1-2</small>' : t.id==='railgun'?'\u2192 PIERCE<br><small>+25% RNG +15% DMG</small>' : '\u2192 PIERCE';
      bc.innerHTML=`
        <button class="branch-btn power ${canAfford?'':'disabled'}" data-branch="${isHg?'throughput':'power'}">${powLabel}<br><b>${c} <span class="coin sm"></span></b></button>
        <button class="branch-btn precision ${canAfford?'':'disabled'}" data-branch="${isHg?'range':'precision'}">${preLabel}<br><b>${c} <span class="coin sm"></span></b></button>
      `;
      bc.querySelectorAll('.branch-btn').forEach(b=>{
        const handler=(ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          b.classList.add('selected');
          setTimeout(()=>b.classList.remove('selected'), 250);
          const br=b.dataset.branch;
          if(coins < c){ SFX.no(); shake=2; return; }
          b.style.transform='scale(0.95)';
          setTimeout(()=>{ doUpgradeBranch(t, br); }, 90);
        };
        b.onclick=handler;
      });
    } else {
      up.style.display='';
      const bc=document.getElementById('branchChoice');
      if(bc) bc.classList.add('hidden');
      const c=upgradeCost(t);
      const canAfford = coins >= c;
      up.disabled = !canAfford;
      up.innerHTML=`UPGRADE \u2192 Lv${t.level+1} \u2014 <span id="upgradeCost">${c}</span> <span class="coin sm"></span>${t.branch? ` <small>${t.branch}</small>`:''}`;
      if(canAfford) up.classList.remove('disabled');
      else up.classList.add('disabled');
    }
  }
}
function hidePanel(){
  selectedStation=false;
  document.getElementById('towerPanel').classList.add('hidden');
  const bb=document.getElementById('buildBar');
  if(bb) bb.classList.remove('collapsed');
}

document.getElementById('upgradeBtn').onclick=()=>{
  if(!selectedTower) return;
  if(selectedTower.level>=5) return;
  if(selectedTower.level===2) return;
  const c=upgradeCost(selectedTower);
  if(coins < c){ SFX.no(); return; }
  const prevLevel=selectedTower.level, prevBranch=selectedTower.branch;
  coins-=c; selectedTower.level++; 
  undoStack.push({type:'upgrade', tower:selectedTower, cost:c, prevLevel, prevBranch});
  if(undoStack.length>20) undoStack.shift();
  SFX.place(); addParticles(selectedTower.x,selectedTower.y,12, selectedTower.branch==='power'?'#ff8a2e': selectedTower.branch==='precision'?'#fde68a':'#ffd166'); showPanel(selectedTower); updateBuildBar();
};
document.getElementById('sellBtn').onclick=()=>{
  if(!selectedTower) return;
  const v=sellValue(selectedTower);
  const sold=selectedTower;
  coins+=v;
  undoStack.push({type:'sell', tower:sold, value:v});
  if(undoStack.length>20) undoStack.shift();
  const idx=towers.indexOf(sold); if(idx>=0) towers.splice(idx,1);
  addParticles(sold.x,sold.y,10,'#fff'); SFX.coin(); selectedTower=null; hidePanel(); updateBuildBar();
};
document.getElementById('closePanel').onclick=()=>{ selectedTower=null; hidePanel(); };

// screens
let shopFilter='all';
function setState(s){
  state=s;
  document.body.classList.toggle('menu-state', s===STATE.MENU);
  if(s===STATE.PLAYING) startMusic();
  else if(s===STATE.MENU || s===STATE.PAUSED || s===STATE.SHOP || s===STATE.HOWTO) stopMusic();
  document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
  if(s===STATE.MENU) document.getElementById('mainMenu').classList.add('active');
  else if(s===STATE.HOWTO) document.getElementById('howToPlayScreen').classList.add('active');
  else if(s===STATE.SHOP){ document.getElementById('upgradeShopScreen').classList.add('active'); renderShop(); }
  else if(s===STATE.GAMEOVER) document.getElementById('gameOverScreen').classList.add('active');
  else if(s===STATE.PAUSED) document.getElementById('pauseScreen').classList.add('active');
  else if(s===STATE.CLEAR) document.getElementById('stageClearScreen').classList.add('active');
  else if(s===STATE.WARP){ document.getElementById('warpScreen').classList.add('active'); renderWarpChoices(); }
  // modal click-guard: rapid gameplay clicks must not instantly hit freshly
  // revealed modal buttons (e.g. defeat popping under an active cursor)
  const screens=document.getElementById('screens');
  if(s===STATE.GAMEOVER || s===STATE.PAUSED || s===STATE.CLEAR){
    if(screens) screens.classList.add('arming');
    setTimeout(()=>{ if(screens) screens.classList.remove('arming'); }, 850);
  } else if(screens) screens.classList.remove('arming');
}
function renderShop(){
  const wrap=document.getElementById('shopItems');
  if(!wrap) return;
  const fb=document.querySelectorAll('#shopFilter button');
  if(fb.length && !wrap._filterBound){
    fb.forEach(b=>b.onclick=()=>{
      fb.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      shopFilter=b.dataset.filter;
      renderShop();
    });
    wrap._filterBound=true;
  }
  document.querySelectorAll('#shopFilter button').forEach(b=> b.classList.toggle('active', b.dataset.filter===shopFilter));
  wrap.innerHTML='';
  PERM_DEFS.forEach(def=>{
    const isTower = !!def.tower;
    if(shopFilter==='tower' && !isTower) return;
    if(shopFilter==='stats' && isTower) return;
    const cap = def.max || PERM_MAX;
    const lvl=permLevels[def.id]||0;
    const isMax=lvl>=cap;
    const cost=isMax?0:permCost(def);
    const div=document.createElement('div'); div.className='shop-item'+(lvl>0?' owned':'');
    const reqMet = !def.reqWave || (stats.bestWave>=def.reqWave);
    if(isTower && !reqMet){
      div.style.opacity='0.55';
    }
    let pct, total, next;
    if(isTower){
      pct = isMax?100: lvl*100;
      total = isMax? 'UNLOCKED' : `Hold to depth ${def.reqWave}`;
      next = isMax? 'UNLOCKED' : def.per;
    } else {
      pct=(lvl/cap)*100;
      total= def.id==='wealth'? '+'+permBonus('wealth')+' gold' : def.id==='lives'? '+'+permBonus('lives')+' lives' : '+'+Math.round(permBonus(def.id)*100)+'%';
      next= isMax? 'MAXED' : `${def.per} \u2192 Lv.${lvl+1}`;
    }
    div.innerHTML=`
      <div style="font-size:22px">${def.icon}</div>
      <h4>${def.name}</h4>
      <div class="${lvl>0?'owned-badge':'lvl-label'}">${lvl>0? `Lv.${lvl} \u2022 ${total}`: total}</div>
      <p>${def.desc}</p>
      <div class="next-bonus">${next}</div>
      <div class="lvl-bar"><div class="lvl-fill" style="width:${pct}%"></div></div>
      <div class="lvl-label">Lv.${lvl} / ${cap}</div>
      <div class="cost">${isMax?'-':cost+' '}</div>
    `;
    const btn=document.createElement('button');
    if(isMax){ btn.textContent= isTower? 'UNLOCKED' : 'MAXED'; btn.disabled=true; btn.style.opacity='0.5'; }
    else if(isTower && !reqMet){
      btn.textContent=`HOLD TO DEPTH ${def.reqWave}`;
      btn.disabled=true; btn.style.opacity='0.5';
      btn.title=`Hold the expedition to depth ${def.reqWave} (best ${stats.bestWave})`;
    } else {
      const can=coinsBank>=cost;
      btn.textContent= can ? (isTower? 'UNLOCK' : (lvl>0?`UPGRADE Lv.${lvl+1}`:'BUY')) : `NEED ${cost-coinsBank}`;
      btn.disabled=!can; if(!can) btn.style.opacity='0.5';
      btn.onclick=()=>{
        const cap2=def.max||PERM_MAX;
        if(coinsBank>=cost && lvl<cap2){
          if(isTower && !reqMet) return;
          coinsBank-=cost; permLevels[def.id]=(permLevels[def.id]||0)+1; savePerm(); renderShop(); refreshMenuStats(); updateBuildBar();
          tone(700,0.12,'sine',0.2,900); { const vc=viewCenter(); addParticles(vc.x,vc.y,10, def.tower?'#7ce67c':'#ffd166'); }
        }
      };
    }
    div.appendChild(btn); wrap.appendChild(div);
  });
  document.getElementById('shopCoinCount').textContent=coinsBank;
}

// helpers
function addParticles(x,y,n,color,spd=100){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=30+Math.random()*spd;
    particles.push({x,y,vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:0.4+Math.random()*0.35, max:0.6, r:2+Math.random()*3, color});
  }
}
function addNum(x,y,val,color){
  damageNumbers.push({x,y,vx:(Math.random()-0.5)*24, vy:-60, life:0.7, val, color});
}
let keys={};
addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  keys[k]=true;
  // TEMPORARY TEST CHEAT — REMOVE BEFORE RELEASE. Type 1993 in-game:
  // all lanes linked+surveyed, station tech maxed, 2× max Pulse Lasers
  // per world (free). Early digits may arm build ghosts; firing cleans up.
  if(state===STATE.PLAYING && /^[0-9]$/.test(k)){
    cheatBuf=(cheatBuf+k).slice(-4);
    if(cheatBuf==='1993'){ cheatBuf=''; cheat1993(); return; }
  }
  if((e.ctrlKey || e.metaKey) && k==='z' && state===STATE.PLAYING){ e.preventDefault(); doUndo(); return; }
  if(k===' ' && state===STATE.PLAYING){ e.preventDefault(); buyCorePurge(); }
  if(k==='x' && state===STATE.PLAYING){ e.preventDefault(); ensureAudio(); armStrike(); updateBuildBar(); }
  if(k==='escape'){
    if(placeType){ placeType=null; ghostPos=null; updateBuildBar(); }
    else if(strikeArming){ strikeArming=false; toast('STRIKE WING stood down', 'hint'); updateBuildBar(); }
    else if(outpostPlacing){ outpostPlacing=false; toast('Outpost survey stood down', 'hint'); }
    else if(selectedTower||selectedStation){ selectedTower=null; hidePanel(); }
    else if(state===STATE.PLAYING) setState(STATE.PAUSED);
    else if(state===STATE.PAUSED) setState(STATE.PLAYING);
    else if(state===STATE.WARP) setState(warpReturn);
  }
  if(k==='p' && state===STATE.PLAYING) setState(STATE.PAUSED);
  if(k==='b' && (state===STATE.PLAYING||state===STATE.PAUSED)) toggleBar();
  if(['1','2','3'].includes(k) && state===STATE.WARP){
    const c=warpChoices[parseInt(k)-1];
    if(c){ pendingSys=c; doWarp(true); setState(STATE.PLAYING); ensureAudio(); updateBuildBar(); }
    return;
  }
  if(['1','2','3','4','5','6','7','8','9'].includes(k) && state===STATE.PLAYING){    const idx=parseInt(k)-1; const def=getBuildableDefs()[idx]; if(def){
      if(def.isDrone){ if(!isBuildAvailable(def)){ SFX.no(); return; } tryPlaceDrone(); return; }
      if(def.isScout){ tryLaunchScout(); return; }
      if(!isBuildAvailable(def)){ SFX.no(); return; }
      if(def.isModule){ buildStationModule(def); return; }
      if(!isTowerUnlocked(def.id)){ SFX.no(); flashHint('Unlock in Shop!'); setState(STATE.SHOP); return; }
      if(placeType===def.id){ placeType=null; ghostPos=null; }
      else {
        placeType=def.id; { const wpt=screenToWorld(mouse.x,mouse.y); ghostPos={x:wpt.x,y:wpt.y}; }
        if(strikeArming) strikeArming=false; // tower tools stand the wing down
        if(outpostPlacing) outpostPlacing=false;
        selectedTower=null; hidePanel();
        toast(`Placing ${def.name} — CLICK a glowing ring (Station or linked world). Right-click cancels.`, 'info');
      }
      updateBuildBar();
    }
  }
  if(k==='delete' && selectedTower && state===STATE.PLAYING){ 
    document.getElementById('sellBtn').click();
  }
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '].includes(k)) e.preventDefault();
});
addEventListener('keyup', e=> keys[e.key.toLowerCase()]=false);

function triggerNextWave(){
  // Legacy surge-forcing retired: the Bloom cannot be summoned like a wave.
  // Space now holds the emergency Core Purge instead.
  buyCorePurge();
}
// TEMPORARY TEST CHEAT — REMOVE BEFORE RELEASE (search CHEAT1993).
let cheatBuf='';
function cheat1993(){
  for(const a of asteroids){ a.unlocked=true; a.surveyed=true; }
  for(const id of Object.keys(STATION_TECH)) stationTech[id]=STATION_TECH[id].max;
  const def=TOWER_DEFS.find(d=>d.id==='archer');
  for(const a of asteroids){
    for(let k=0;k<2;k++){
      const orbitR=a.r+26, orbitAng=k*Math.PI+(a.slotAng||0);
      const anchor={type:'asteroid', obj:a, dist:0};
      towers.push({x:a.x+Math.cos(orbitAng)*orbitR, y:a.y+Math.sin(orbitAng)*orbitR, r:16,
        id:def.id, baseCost:def.cost, baseDmg:def.dmg, baseRange:def.range, baseFireRate:def.fireRate, projSpeed:def.projSpeed,
        splash:0, chain:0, slow:0, slowDur:0, color:def.color, icon:def.icon, name:def.name,
        isModule:false, mod:null, level:5, branch:null, cd:0, angle:orbitAng,
        anchor, orbitR, orbitAngle:orbitAng, orbitSpeed:0.24+Math.random()*0.10});
      towersBuilt++;
    }
  }
  if(!defenseEstablished){ defenseEstablished=true; waveTimer=5; logEvent('BIOLOGICAL ACTIVITY — deep-field signal registered.', 'surge'); }
  placeType=null; ghostPos=null; selectedTower=null; hidePanel();
  if(selectedStation) showStationPanel();
  console.warn('[TEST CHEAT 1993] lanes+tech+maxed lasers applied — REMOVE BEFORE RELEASE');
  logEvent('<b>[TEST] Cheat 1993:</b> all lanes linked, station tech maxed, 2× max Pulse Lasers per world. <b>REMOVE BEFORE RELEASE.</b>', 'surge');
  toast('[TEST] 1993 APPLIED — remove before release', 'surge');
  SFX.wave();
  updateBuildBar();
}
function findCloudTarget(tx,ty,range){
  // pods, clusters & hearts pull tower aim (magnets), voxels win by station-threat
  let ent=null, entD=1e18;
  for(const p of pods){
    const d=Math.hypot(p.x-tx,p.y-ty);
    if(d<=range && d-60<entD){ entD=d-60; ent={pod:p,x:p.x,y:p.y}; }
  }
  for(const c of clusters){
    const d=Math.hypot(c.x-tx,c.y-ty);
    if(d<=range && d-80<entD){ entD=d-80; ent={cluster:c,x:c.x,y:c.y}; }
  }
  for(const h of hearts){
    const d=Math.hypot(h.x-tx,h.y-ty);
    if(d<=range && d-120<entD){ entD=d-120; ent={heart:h,x:h.x,y:h.y}; }
  }
  for(const c of cores){
    // siege priority: the biggest organ pulls hardest once seen
    const d=Math.hypot(c.x-tx,c.y-ty);
    if(d<=range && d-160<entD){ entD=d-160; ent={core:c,x:c.x,y:c.y}; }
  }
  for(const t of tendrils){
    // growing tips draw fire too — a stalled tip is a dead tendril
    // (settled threads don't: shoot the colony they left behind)
    if(t.done) continue;
    const tip=t.pts[t.pts.length-1];
    if(!tip) continue;
    const d=Math.hypot(tip.x-tx,tip.y-ty);
    if(d<=range && d-40<entD){ entD=d-40; ent={tendril:t,x:tip.x,y:tip.y}; }
  }
  let best=null, bestScore=1e18, bestD=1e18;
  const r2=range*range;
  // grid-restricted scan: only cells in the range box are candidates.
  // Identical results to a full scan at a fraction of the cost as mass grows.
  const q0=mycWorldToCell(tx-range,ty-range), q1=mycWorldToCell(tx+range,ty+range);
  for(let qx=q0.cx;qx<=q1.cx;qx++) for(let qy=q0.cy;qy<=q1.cy;qy++){
    const cell=mycCells.get(mycKey(qx,qy));
    if(!cell) continue;
    const c=mycCellCenter(qx,qy);
    const dx=c.x-tx, dy=c.y-ty;
    const d2=dx*dx+dy*dy;
    if(d2>r2) continue;
    const threat=Math.hypot(c.x-CORE.x,c.y-CORE.y);
    const score=threat*2+Math.sqrt(d2);
    if(score<bestScore){ bestScore=score; bestD=Math.sqrt(d2); best={cell,x:c.x,y:c.y}; }
  }
  if(ent && entD<bestD) return ent;
  return best;
}

function checkFirstSightings(){
  if(state!==STATE.PLAYING) return;
  const m=50;
  if(!seenHeart){
    for(const h of hearts){
      const s=worldToScreen(h.x,h.y);
      if(s.x>-m&&s.x<W+m&&s.y>-m&&s.y<H+m){
        seenHeart=true; sightingFlash=1;
        SFX.sting();
        logEvent('SENSOR — rim pulse registered.', 'surge');
        break;
      }
    }
  }
  if(!seenCloud){
    for(const cell of mycCells.values()){
      const c=mycCellCenter(cell.cx,cell.cy);
      const s=worldToScreen(c.x,c.y);
      if(s.x>-m&&s.x<W+m&&s.y>-m&&s.y<H+m){
        seenCloud=true;
        SFX.sting();
        logEvent('SENSOR — non-mechanical mass on scope.', 'surge');
        break;
      }
    }
  }
}
function update(dt){
  const ddt=dt*speedMult;
  updateSolarSystem(ddt);
  updateNodeDrift(ddt);
  corruptAcc+=ddt;
  if(corruptAcc>0.4){ corruptAcc=0; updateCorruption(); }
  dpsTimer+=ddt;
  if(dpsTimer>=0.5){
    const delta = totalDamage - dpsLast;
    dps = delta / dpsTimer;
    if(dps>peakDps) peakDps=dps;
    dpsLast=totalDamage;
    dpsTimer=0;
  }
  // WASD / arrows pan the camera (drag with mouse works too, wheel zooms)
  {
    const panSpd=650/cam.zoom*ddt;
    let panned=false;
    if(keys['a']||keys['arrowleft']){ cam.x-=panSpd; panned=true; }
    if(keys['d']||keys['arrowright']){ cam.x+=panSpd; panned=true; }
    if(keys['w']||keys['arrowup']){ cam.y-=panSpd; panned=true; }
    if(keys['s']||keys['arrowdown']){ cam.y+=panSpd; panned=true; }
    if(panned) clampCam();
  }
  // drones - harvest loop with relay chain + player choice + 1s spawn shield
  // (backwards: cloud-burned drones are spliced mid-loop)
  for(let di=drones.length-1; di>=0; di--){
    const d=drones[di];
    if(d.flash>0) d.flash-=dt*speedMult;
    if(d.invuln>0) d.invuln-=dt*speedMult;
    let target=d.targetAsteroid||null;
    if(target && (!isAsteroidReachable(target) || isAsteroidBlocked(target))){
      d.targetAsteroid=null; d.routeIndex=0; target=null;
    }
    // THREATENED LANES: hauling crews fly through the living cloud, not
    // around it. Dense voxels cling (slow) and burn (damage). Parked guns
    // escort: each weapon on the destination world cuts crew damage ~35%.
    let slowF=1;
    if(target && d.invuln<=0){
      const dense=countVoxelsNear(d.x,d.y,30);
      d.inCloud=dense>0;
      if(dense>0){
        const escort=towers.reduce((n,t)=>n+((!t.isModule&&t.anchor&&t.anchor.obj===target)?1:0),0);
        slowF=Math.max(0.45,1-dense*0.06);
        const dps=Math.min(9,1.5+dense*0.9)*Math.pow(0.65,escort);
        d.hp-=dps*ddt; d.flash=0.12;
        if(Math.random()<0.3) addParticles(d.x,d.y,1,'#a855f7',20);
        if(dense>=4 && (d.warnT||0)<=0){
          d.warnT=12;
          logEvent(`<b>Drone ${di+1} crossing dense growth</b> near ${nodeName(target)} — parked guns escort crews.`, 'bad');
          toast(`DRONE ${di+1} IN THE PURPLE — escort with guns`, 'bad');
          SFX.no();
        }
      }
    } else d.inCloud=false;
    if(d.warnT>0) d.warnT-=ddt;
    if(d.hp<=0){
      addParticles(d.x,d.y,14,'#facc15');
      drones.splice(di,1);
      flashHint('Drone burned down in the cloud! Lane lost!');
      SFX.hurt(); shake=4;
      continue;
    }
    if(!target){
      // idle orbit around core
      d.wander = (d.wander||0)+ddt*0.8;
      const orbitR= 38;
      const tx=CORE.x + Math.cos(d.wander)*orbitR;
      const ty=CORE.y + Math.sin(d.wander)*orbitR;
      const dx=tx-d.x, dy=ty-d.y, len=Math.hypot(dx,dy)||1;
      d.x += (dx/len)*d.speed*logisticsSpeedMult()*0.6*ddt;
      d.y += (dy/len)*d.speed*logisticsSpeedMult()*0.6*ddt;
      continue;
    }
    if(!d.carrying){
      const route=getAsteroidRoute(target);
      let routeIndex=Math.min(d.routeIndex||0,Math.max(0,route.length-1));
      let waypoint=route[routeIndex]||target;
      const dx=waypoint.x-d.x, dy=waypoint.y-d.y, len=Math.hypot(dx,dy)||1;
      if(len < waypoint.r+6){
        if(waypoint!==target){
          d.routeIndex=routeIndex+1;
          continue;
        }
        if(!target.unlocked){
          target.unlocked=true;
          addParticles(target.x,target.y,14,'#7ce67c');
          addNum(target.x,target.y-14,'LANE LINKED!', '#7ce67c');
          flashHint('Trade lane to '+nodeName(target)+' opened!');
          SFX.wave();
          const tut2=document.getElementById('tutorialHint');
          if(tut2 && !tut2.classList.contains('hidden')) setTimeout(()=>{ tut2.classList.add('hidden'); localStorage.setItem('atd_tutDone','1'); document.getElementById('buildBar')?.classList.remove('tut-highlight'); }, 1200);
        }
        d.mineTimer+=ddt;
        // M6: route traits — kind sets pace, infection slows, parked guns escort crews
        const em6=NODE_ECON[target.kind||'belt'];
        const guards=towers.reduce((n,t)=>n+((!t.isModule&&t.anchor&&t.anchor.obj===target)?1:0),0);
        const mThresh=(em6.mine+(target.cstate==='infected'?0.8:0))*Math.max(0.6,1-0.15*guards)*throughputMult();
        d.mThresh=mThresh;
        if(d.mineTimer>mThresh){
          d.mineTimer=0; d.carrying=true;
          target.ore-=8; if(target.ore<0) target.ore=0;
          addParticles(target.x,target.y,4,'#facc15');
          setTimeout(()=>{ if(target.ore<target.maxOre) target.ore=Math.min(target.maxOre, target.ore+20); }, 8000);
        }
      } else {
        d.x += (dx/len)*d.speed*logisticsSpeedMult()*slowF*ddt;
        d.y += (dy/len)*d.speed*logisticsSpeedMult()*slowF*ddt;
      }
    } else {
      // return leg: deliver to the station or the nearest online outpost,
      // whichever is closer — distant operations stay viable through outposts
      let destX=CORE.x, destY=CORE.y, destR=CORE.r, destOut=null;
      let bestD=Math.hypot(CORE.x-d.x,CORE.y-d.y);
      for(const o of outposts){
        if(o.hp<=0) continue;
        const od=Math.hypot(o.x-d.x,o.y-d.y);
        if(od<bestD){ bestD=od; destX=o.x; destY=o.y; destR=o.r; destOut=o; }
      }
      d.deliverOut=(destOut&&destOut.hp>0)?destOut:null;
      const dx=destX-d.x, dy=destY-d.y, dlen=Math.hypot(dx,dy)||1;
      if(dlen < destR+8){
        d.carrying=false;
        d.routeIndex=0;
        const em=NODE_ECON[(d.targetAsteroid&&d.targetAsteroid.kind)||'belt'];
        const gain=em.yield+droneYieldBonus()+((d.targetAsteroid&&d.targetAsteroid.cstate==='infected')?2:0);
        coins+=gain;
        if(destOut){ destOut.relayed+=gain; addNum(destX,destY-14,'+'+gain+'g → relay', '#7ce67c'); }
        addParticles(destX,destY,6,'#ffd166'); addNum(destX,destY-12,'+'+gain+'g', '#ffd166'); SFX.coin();
        if(em.purge){ purgeTotal+=em.purge; addNum(destX,destY-24,'+'+em.purge+' purge','#e9d5ff'); checkMilestones(); }
      } else {
        d.x += (dx/dlen)*d.speed*logisticsSpeedMult()*1.15*slowF*ddt;
        d.y += (dy/dlen)*d.speed*logisticsSpeedMult()*1.15*slowF*ddt;
      }
    }
    // repair aura: crews patch up near a live outpost
    if(d.hp<d.maxHp){
      for(const o of outposts){
        if(o.hp>0 && Math.hypot(o.x-d.x,o.y-d.y)<120){ d.hp=Math.min(d.maxHp,d.hp+4*ddt); break; }
      }
    }
    // drones avoid mycelium? small wobble
  }
  // M5: scout drones — direct-flight surveyors for ? signatures
  for(const s of scouts){
    if(!s.target){
      s.wander=(s.wander||0)+ddt*1.1;
      const tx=CORE.x+Math.cos(s.wander)*30, ty=CORE.y+Math.sin(s.wander)*30;
      const dx=tx-s.x, dy=ty-s.y, len=Math.hypot(dx,dy)||1;
      s.x+=(dx/len)*s.speed*logisticsSpeedMult()*0.6*ddt; s.y+=(dy/len)*s.speed*logisticsSpeedMult()*0.6*ddt;
      continue;
    }
    const st=s.target;
    if(st.surveyed){ s.target=null; s.mode='idle'; continue; }
    if(s.mode==='survey'){
      s.surveyT+=ddt;
      if(s.surveyT>2.0){ completeSurvey(st); s.target=null; s.mode='idle'; s.surveyT=0; }
      continue;
    }
    const dx=st.x-s.x, dy=st.y-s.y, len=Math.hypot(dx,dy)||1;
    if(len<st.r+10){ s.mode='survey'; s.surveyT=0; continue; }
    s.x+=(dx/len)*s.speed*logisticsSpeedMult()*ddt; s.y+=(dy/len)*s.speed*logisticsSpeedMult()*ddt;
  }
  // playability: first mycelium block highlight - now W5
  if(wave===5 && !mycHintShown && asteroids.some(a=> isAsteroidBlocked(a) && !a.unlocked)){
    mycHintShown=true;
    flashHint('Mycelium blocks lane! Plasma clears it');
    const bA=asteroids.find(a=> isAsteroidBlocked(a) && !a.unlocked);
    if(bA) addParticles(bA.x,bA.y,12,'#fb923c');
  }
  // wave timer - threat clock drives cloud growth + periodic surges
  if(!defenseEstablished){
    waveTimer=8;
    // ambient dread while farming: tremors on a slow timer, never instructions
    tremorTimer-=ddt;
    if(tremorTimer<=0){
      tremorTimer=26+Math.random()*14;
      SFX.tremorSnd(); shake=Math.min(2.5,shake+1.2);
      logEvent(TREMOR_LINES[tremorIdx%TREMOR_LINES.length], 'surge');
      tremorIdx++;
    }
  } else {
    threatTime+=ddt;
    wave=Math.max(1,1+Math.floor(threatTime/45));
    waveTimer-=ddt;
    if(waveTimer<=0 && !waveSpawning){
      queueWave();
      waveTimer=Math.max(1.6,5.2-Math.min(3.2,threatTime/70));
    }
  }
  // cloud creep (replaces walker spawning)
  myceliumGrowStep(ddt);
  if(state!==STATE.PLAYING) return; // die() may have fired inside growth
  updatePurge(ddt);
  updateStrikers(ddt);
  if(state!==STATE.PLAYING) return;
  updateOutposts(ddt);
  if(state!==STATE.PLAYING) return;
  enemies.length=0; waveSpawning=false;
  // drift motes (pre-defense spores on the wind) + first-sighting checks
  if(sightingFlash>0) sightingFlash-=ddt;
  if(wakeFlash>0) wakeFlash-=ddt;
  if(!defenseEstablished){
    const vw=W/cam.zoom, vh=H/cam.zoom;
    while(driftMotes.length<22){
      const side=Math.floor(Math.random()*4);
      driftMotes.push({
        x: side===0?cam.x-20 : side===1?cam.x+vw+20 : cam.x+Math.random()*vw,
        y: side===2?cam.y-20 : side===3?cam.y+vh+20 : cam.y+Math.random()*vh,
        vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10, seed:Math.random()*6.28
      });
    }
    for(let i=driftMotes.length-1;i>=0;i--){
      const m=driftMotes[i];
      m.x+=m.vx*ddt; m.y+=m.vy*ddt;
      if(m.x<cam.x-60||m.x>cam.x+vw+60||m.y<cam.y-60||m.y>cam.y+vh+60) driftMotes.splice(i,1);
    }
  }
  sightCheckAcc-=ddt;
  if(sightCheckAcc<=0){
    sightCheckAcc=0.25;
    checkFirstSightings();
  }
  // enemies
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    if(e.flash>0) e.flash-=ddt;
    if(e.slowTime>0) e.slowTime-=ddt;
    const isHealerAura = e.type==='healer' || (e.boss && e.variant && e.variant.includes('heal'));
    if(isHealerAura && e.hp>0){
      e.healCd-=ddt;
      if(e.healCd<=0){
        e.healCd=0.85;
        let healed=0;
        for(const other of enemies){
          if(other!==e && other.hp>0 && other.hp < other.maxHp && Math.hypot(other.x-e.x, other.y-e.y) < (e.boss?110:90)){
            const heal = e.boss ? 8 + wave*0.9 : 6 + wave*0.7;
            other.hp = Math.min(other.maxHp, other.hp + heal);
            healed++;
            addParticles(other.x, other.y-6, 3, '#34d399');
            if(Math.random()<0.3) addNum(other.x, other.y-14, '+'+Math.floor(heal), '#6ee7b7');
          }
        }
        if(healed>0){ SFX.heal(); if(e.boss) shake=Math.min(shake+1.0, 4); else shake=Math.min(shake+0.6, 3); }
        addParticles(e.x,e.y, e.boss?8:5,'#10b981');
      }
    }
    if(e.burnTime>0){
      e.burnTime-=ddt; e.burnAcc=(e.burnAcc||0)-ddt;
      if(e.burnAcc<=0){ e.burnAcc=0.55; e.hp-=e.burnDmg||6; e.flash=0.08; addParticles(e.x,e.y,2,'#ff7a00'); }
    }
    // mycelium creep - targets drones first, then station (so lanes must be defended)
    const spd = e.slowTime>0 ? e.speed*0.42 : e.speed;
    let targetX=CORE.x, targetY=CORE.y, targetR=CORE.r, targetIsDrone=false, targetDrone=null;
    // find nearest drone to intercept
    let bestD=1e9;
    for(const d of drones){
      const dd=Math.hypot(d.x-e.x, d.y-e.y);
      const coreDist=Math.hypot(CORE.x-e.x, CORE.y-e.y);
      if(dd<110 && dd < coreDist*0.88 && dd<bestD){ bestD=dd; targetDrone=d; }
    }
    if(targetDrone){
      targetX=targetDrone.x; targetY=targetDrone.y; targetR=6; targetIsDrone=true;
      if(bestD < e.r + 8){
        if(targetDrone.invuln>0){
          if(Math.random()<0.06) addNum(targetDrone.x, targetDrone.y-10, 'SHIELDED', '#7dd3fc');
          e.flash=0.05;
        } else {
          targetDrone.hp -= (e.boss? 18 : 7) * ddt * 3.2;
          targetDrone.flash=0.12;
          e.flash=0.08;
        }
        if(targetDrone.hp<=0){
          addParticles(targetDrone.x,targetDrone.y,14,'#facc15');
          drones.splice(drones.indexOf(targetDrone),1);
          flashHint('Drone destroyed! Lane lost!');
          SFX.hurt(); shake=4;
          // break chain - far asteroids now need relay again (already handled via drones.length check)
        }
        // drone blocks creep slightly
        e.x -= (targetX - e.x)/bestD * 4*ddt;
        e.y -= (targetY - e.y)/bestD * 4*ddt;
      }
    }
    const dx = targetX - e.x, dy = targetY - e.y;
    const dist = Math.hypot(dx,dy) || 1;
    if(dist < targetR + e.r + 2){
      if(targetIsDrone){
        // already handled attack above, just nudge
        e.x -= (dx/dist)*8*ddt;
        e.y -= (dy/dist)*8*ddt;
      } else {
        lives -= e.boss ? 5 : (e.type==='tank'?2: e.type==='shielded'?2 : 1);
        SFX.hurt(); shake=7; addParticles(CORE.x,CORE.y,16,'#a78bfa',140);
        enemies.splice(i,1);
        if(lives<=0){ die(false); return; }
      }
    } else {
      e.wander += ddt*1.8;
      const wobble = Math.sin(e.wander + wave*0.3)*0.35;
      const nx = dx/dist, ny = dy/dist;
      const wx = -ny * wobble * 0.6, wy = nx * wobble * 0.6;
      e.x += (nx*spd + wx*18)*ddt;
      e.y += (ny*spd + wy*18)*ddt;
    }
    if(e.flash<0) e.flash=0;
     if(e.hp<=0){
      kills++; totalDamage+=e.maxHp;
      const gain = e.boss? 45 + Math.floor(wave*1.8) : 7 + Math.floor(wave*0.6) + (e.type==='tank'?4: e.type==='shielded'?5: e.type==='healer'?6: e.type==='swift'?1: e.type==='flying'?2:2);
      coins += gain;
      if(e.boss) bossesKilled++;
      SFX.kill(); addParticles(e.x,e.y,12, e.boss?'#facc15': e.type==='tank'?'#a78bfa': e.type==='shielded'?'#94a3b8': e.type==='healer'?'#34d399': e.type==='swift'?'#ffd166': e.type==='flying'?'#c4b5fd':'#ff4d5a'); addNum(e.x,e.y-8, '+'+gain+'g', '#ffd166');
      SFX.coin();
      if(e.type==='splitter'){
        for(let k=0;k<2;k++){
          const ne={x:e.x+ (Math.random()-0.5)*12, y:e.y+ (Math.random()-0.5)*12, r:8, hp:14*(1+wave*0.12), maxHp:14*(1+wave*0.12), speed:105, baseSpeed:105, val:3, type:'swift', slowTime:0, flash:0, wander:Math.random()*6};
          enemies.push(ne);
        }
      }
      enemies.splice(i,1);
      if(wave>30){
          const vBonus = 150 + bossesKilled*20;
          coinsBank+= vBonus; savePerm();
          prestigeWins++; saveProgress();
          setState(STATE.GAMEOVER);
          document.getElementById('gameOverTitle').textContent='\u2726 THE BLOOM RECOILS \u2726';
          document.getElementById('newBest').textContent=`\u2605 VICTORY! Prestige ${prestigeWins} (+${prestigeWins}% DMG) \u2605`;
          document.getElementById('newBest').classList.remove('hidden');
          SFX.wave(); addParticles(CORE.x,CORE.y,28,'#facc15');
          lastRun={wave,kills,coins: vBonus + Math.floor(kills*1.2), bosses:bossesKilled, damage:Math.floor(totalDamage), towers:towersBuilt};
          stats.bestWave=Math.max(stats.bestWave,wave); saveStats(); refreshMenuStats();
          return;
      }
    }
  }
  // towers - orbiting anchors
  for(const t of towers){
    if(t.anchor){
      t.orbitAngle += t.orbitSpeed*ddt*0.55;
      // anchor may be asteroid or core - both have x,y
      t.x = t.anchor.obj.x + Math.cos(t.orbitAngle)*t.orbitR;
      t.y = t.anchor.obj.y + Math.sin(t.orbitAngle)*t.orbitR;
    }
    t.cd-=ddt;
    const st=towerStat(t);
    // aim at the voxel cloud — full grid scan throttled to 6Hz per tower
    // (was every frame; identical behavior, ~10x cheaper). Modules don't aim.
    let aimTarget=null;
    if(st.range>0){
      t.scanAcc=(t.scanAcc||0)-ddt;
      if(t.scanAcc<=0 || !t.aimCache){
        t.scanAcc=0.15;
        const scan=findCloudTarget(t.x,t.y,Math.max(st.range, 220));
        t.aimCache=scan?{x:scan.x, y:scan.y}:null;
      }
      aimTarget=t.aimCache;
    }
    if(aimTarget){
      const targetAng=Math.atan2(aimTarget.y - t.y, aimTarget.x - t.x);
      let diff = targetAng - t.angle;
      while(diff > Math.PI) diff -= Math.PI*2;
      while(diff < -Math.PI) diff += Math.PI*2;
      t.angle += diff * Math.min(1, 10*ddt);
    }
    if(t.cd<=0){
      const best=findCloudTarget(t.x,t.y,st.range);
      if(best){
        const fireAng=Math.atan2(best.y - t.y, best.x - t.x);
        t.angle = fireAng;
        t.cd= 1/st.fireRate;
        SFX.shoot();
        const spd = t.projSpeed || 520;
        const pierce = st.pierce || 0;
        const burst = st.burst || 1;
        const isTwin = t.branch==='precision' && (t.id==='archer' || t.id==='storm');
        const count = burst>1 ? burst : (isTwin ? 2 : 1);
        const spread = count>1 ? (t.id==='barrage'? 0.18 : 0.12) : 0;
        for(let bi=0; bi<count; bi++){
          let ang = fireAng;
          if(count>1){
            const offset = (bi/(count-1)-0.5)*spread;
            ang += offset + (Math.random()-0.5)*0.02;
          }
          const proj={
            x:t.x + Math.cos(ang)*(t.r+6), y:t.y + Math.sin(ang)*(t.r+6),
            vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
            r: t.id==='cannon'?6 : pierce?3.5 : 4.5, dmg:st.dmg, tower:t, life:1.6, trail:[],
            slow:t.slow||0, slowDur:st.slowDur||0, splash:st.splash||0, chain:st.chain||0, color:t.color,
            pierce, hitSet: pierce? new Set() : null
          };
          projectiles.push(proj);
        }
        const isPower = t.branch==='power';
        addParticles(t.x+Math.cos(fireAng)*14, t.y+Math.sin(fireAng)*14, count>1? (isPower?6:4) : (isPower?4:2), t.color, isPower?70:40);
        if(isPower){ shake=Math.min(shake+0.8, 4); }
        if(pierce) SFX.pierce();
      }
    }
  }
  // station tech - solar mint lives INSIDE the station and grows with it
  if(stationTech.solar>0){
    solarAcc+=ddt;
    const interval=solarInterval(stationTech.solar);
    while(solarAcc>=interval){
      solarAcc-=interval;
      coins+=stationTech.solar;
      addParticles(CORE.x,CORE.y-CORE.r-10,4,'#fef08a',60);
      if(Math.random()<0.35) addNum(CORE.x,CORE.y-CORE.r-16,`+${stationTech.solar}g`, '#fef08a');
    }
  }
  // projectiles vs voxel cloud - direct grid lookup, no walker loop
  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];
    p.x+=p.vx*ddt; p.y+=p.vy*ddt; p.life-=ddt;
    p.trail.push({x:p.x,y:p.y}); if(p.trail.length>5) p.trail.shift();
    if(p.life<=0 || bloomLeashed(p.x,p.y)){ projectiles.splice(i,1); continue; }
    const touchR=(p.splash? 10 : 7)+p.r;
    const hitCell=myceliumAtWorld(p.x,p.y,touchR);
    const hitEnt=entityAtWorld(p.x,p.y,touchR);
    const hitTip=tendrilTipAt(p.x,p.y,touchR);
    if(hitCell || hitEnt || hitTip){
      let dmg=p.dmg;
      const labCount=stationTech.lab;
      if(labCount>0 && p.pierce) dmg=Math.floor(dmg*(1+labCount*0.12));
      const radius=p.splash||26;
      const cleared=damageMyceliumAt(p.x,p.y,dmg,radius,{slowDur:p.slow?p.slowDur:0,color:p.color,coinPerCell:p.striker?0:undefined});
      if(state!==STATE.PLAYING) return; // winFreed() may have fired
      damageEntitiesAt(p.x,p.y,dmg,radius,{color:p.color});
      if(state!==STATE.PLAYING) return; // heart slain may have freed the galaxy
      damageTendrilsAt(p.x,p.y,dmg,radius); // tips stall when shot, sever when broken
      SFX.hit();
      addNum(p.x,p.y-10,dmg,p.splash?'#fb923c':p.slow?'#7dd3fc':p.chain?'#a78bfa':'#fff');
      if(p.splash){
        addParticles(p.x,p.y,10,'#fb923c',90);
        shake=Math.min(4,1.2+dmg*0.03);
      }
      if(p.slow) addParticles(p.x,p.y,4,'#7dd3fc');
      if(p.chain){
        // tesla arcs to nearby voxels
        let cx=p.x, cy=p.y;
        for(let c=0;c<p.chain;c++){
          const nxt=findCloudTarget(cx,cy,130);
          if(!nxt) break;
          if(Math.hypot(nxt.x-cx,nxt.y-cy)>130) break;
          const dmg2=Math.floor(p.dmg*0.55);
          damageMyceliumAt(nxt.x,nxt.y,dmg2,30,{color:'#a78bfa'});
          if(state!==STATE.PLAYING) return;
          damageEntitiesAt(nxt.x,nxt.y,dmg2,30,{color:'#a78bfa'});
          if(state!==STATE.PLAYING) return;
          addParticles(nxt.x,nxt.y,4,'#a78bfa'); addNum(nxt.x,nxt.y-10,dmg2,'#a78bfa');
          addParticles((cx+nxt.x)/2,(cy+nxt.y)/2,3,'#c4b5fd');
          cx=nxt.x; cy=nxt.y;
        }
      }
      if(cleared>0) SFX.kill();
      if(p.pierce && p.pierce>0){
        p.pierce--;
        p.x+=p.vx*0.03; p.y+=p.vy*0.03;
        if(Math.random()<0.4) addParticles(p.x,p.y,2,'#fde68a',20);
      } else {
        projectiles.splice(i,1);
      }
      continue;
    }
  }
  // particles
  for(let i=particles.length-1;i>=0;i--){
    const pa=particles[i];
    pa.x+=pa.vx*ddt; pa.y+=pa.vy*ddt; pa.vy+=140*ddt; pa.life-=ddt;
    if(pa.life<=0) particles.splice(i,1);
  }
  for(let i=damageNumbers.length-1;i>=0;i--){
    const d=damageNumbers[i];
    d.x+=d.vx*ddt; d.y+=d.vy*ddt; d.vy+=120*ddt; d.life-=ddt;
    if(d.life<=0) damageNumbers.splice(i,1);
  }
  if(shake>0) shake-=ddt*30;
}

function die(victory){
  const earned = Math.floor(kills*1.1 + wave*4 + bossesKilled*12);
  coinsBank+=earned; savePerm();
  lastRun={wave,kills,coins:earned, bosses:bossesKilled, damage:Math.floor(totalDamage), towers:towersBuilt};
  let isBest=false;
  if(wave>stats.bestWave){ stats.bestWave=wave; isBest=true; }
  if(kills>stats.bestKills){ stats.bestKills=kills; isBest=true; }
  stats.runs+=1; stats.totalKills+=kills; stats.totalCoins+=earned; saveStats();
  document.getElementById('finalCoins').textContent=earned;
  document.getElementById('gameOverTitle').textContent= victory? 'VICTORY' : 'DEFEAT';
  const nb=document.getElementById('newBest'); if(nb) nb.classList.toggle('hidden', !isBest);
  const eb=document.getElementById('endlessBtn'); if(eb) eb.classList.add('hidden');
  fillEndScreen();
  setState(STATE.GAMEOVER);
}

function getObjective(){
  // drones-first arc: farm in peace → hangar → zoom out → weapons → hunt hearts
  if(drones.length===0) return {step:1, text:'Launch a Relay Drone', detail:'Buy it below — start your farming empire'};
  const linked=asteroids.filter(a=>a.unlocked).length;
  if(linked===0) return {step:2, text:'Link your first world', detail:'CLICK a gold SEND DRONE moon, belt or planet'};
  if(countModules('hangar')===0) return {step:3, text:'Build a Hangar Bay', detail:'+1 drone slot + uplink reach for far worlds'};
  if(!defenseEstablished){
    if(scouts.length===0 && asteroids.some(a=>!a.surveyed)) return {step:4, text:'Survey the frontier', detail:'Buy a Scout Drone, CLICK a ? world (+8g per chart)'};
    return {step:4, text:'Establish Station defense', detail:'Place one Pulse Laser'};
  }
  const sick=asteroids.find(a=>a.unlocked&&(a.cstate==='overrun'||a.cstate==='corrupted'));
  if(sick) return {step:5, text:'Purge the corruption', detail:`${nodeName(sick)} is ${sick.cstate.toUpperCase()} — shoot the purple off it`};
  if(linked===1) return {step:5, text:'Protect the trade lane', detail:'Orbit a weapon on the linked world (2 slots each)'};
  if(linked<4) return {step:5, text:'Choose your frontier', detail:'Moons: safe+fast • Belts: rich • Derelicts: tech • Infected: hazard pay'};
  const unS=asteroids.filter(a=>!a.surveyed).length;
  if(unS>0) return {step:6, text:'Chart unknown worlds', detail:`${unS} ? signatures left — scouts earn 8g each`};
  if(cores.length) return {step:7, text:'Siege the Bloom Core', detail:`◉ ${cores.length} core(s) • clear its colony first • territory stays`};
  if(outpostUnlocked() && outposts.length===0 && constructions.length===0) return {step:7, text:'Found a Forward Outpost', detail:'click the Station — 2 crews, ever. Choose like it matters'};
  return {step:7, text:'Hold against the hearts', detail:`${hearts.length} ♥ pulsing • growth ${myceliumMass()} • click Station for tech`};
}

function updateUI(){
  const livesEl=document.getElementById('lives');
  if(livesEl) livesEl.textContent=Math.max(0,Math.floor(lives));
  // NOTE: internal difficulty (wave) + system index (galaxy) stay hidden —
  // the player reads the organism, not a level number.
  const laneEl=document.getElementById('laneCount');
  if(laneEl) laneEl.textContent=asteroids.filter(a=>a.unlocked).length;
  const nodeEl=document.getElementById('nodeCount');
  if(nodeEl) nodeEl.textContent=asteroids.length;
  const droneEl=document.getElementById('droneCount');
  if(droneEl) droneEl.textContent=`${drones.length}/${getMaxDrones()} · ✧${scouts.length}/${SCOUT_MAX}`;
  const objective=getObjective();
  const objectiveKicker=document.getElementById('objectiveKicker');
  const objectiveText=document.getElementById('objectiveText');
  const objectiveDetail=document.getElementById('objectiveDetail');
  if(objectiveKicker) objectiveKicker.textContent=`OBJECTIVE ${objective.step}`;
  if(objectiveText) objectiveText.textContent=objective.text;
  if(objectiveDetail) objectiveDetail.textContent=objective.detail;
  const coinsEl=document.getElementById('coins');
  if(coinsEl) coinsEl.innerHTML='<span class="coin"></span> '+coins+'g';
  const heartsEl=document.getElementById('heartsLeft');
  if(heartsEl) heartsEl.textContent=hearts.length+cores.length;
  const wt=document.getElementById('waveTimer');
  if(wt){
    // Diegetic status only: what the crew can SEE. No wave numbers, no timers.
    const blooming = waveTimer<2.2 || wave%10===0;
    const near = mycNearStation ? ' — NEAR THE STATION' : '';
    wt.textContent = hearts.length===0
      ? `QUIET… PURGE ${myceliumPurgePct()}%`
      : blooming ? `BLOOM STIRRING • ♥ ${hearts.length}${near}` : `♥ ${hearts.length} • CLOUD ${myceliumMass()}${near}`;
  }
  const warpBtn=document.getElementById('warpBtn');
  if(warpBtn){
    const canWarp = wave>=12;
    warpBtn.classList.toggle('hidden', !canWarp);
    warpBtn.disabled = !canWarp;
    if(canWarp) warpBtn.title=`Warp to System ${galaxy+2} - keep empire, new asteroids (cost free)`;
  }
  const purgeDial=document.getElementById('purgeDial');
  const purgeTxt=document.getElementById('purgeDialTxt');
  const purgeHint=document.getElementById('purgeHint');
  if(purgeDial){
    const unlocked=purgeUnlocked();
    const ready=purgeReady() && coins>=PURGE_COST;
    purgeDial.classList.toggle('ready',unlocked&&purgeCharging<=0&&purgeCd<=0&&coins>=PURGE_COST);
    purgeDial.classList.toggle('charging',purgeCharging>0);
    purgeDial.classList.toggle('locked',!unlocked||!ready);
    if(purgeTxt){
      if(purgeCharging>0) purgeTxt.textContent=`${purgeCharging.toFixed(1)}s`;
      else if(!unlocked) purgeTxt.textContent='—';
      else if(purgeCd>0) purgeTxt.textContent=`${Math.ceil(purgeCd)}s`;
      else purgeTxt.textContent=`${PURGE_COST}g`;
    }
    if(purgeHint){
      if(purgeCharging>0) purgeHint.innerHTML='<b>CORE PURGE CHARGING…</b> brace!';
      else if(!unlocked) purgeHint.textContent=`CORE PURGE // offline — ${purgeLockReason()}`;
      else if(purgeCd>0) purgeHint.textContent=`CORE PURGE // cycling… ${Math.ceil(purgeCd)}s`;
      else if(coins<PURGE_COST) purgeHint.innerHTML=`CORE PURGE // ready — needs <b>${PURGE_COST}g</b>`;
      else purgeHint.innerHTML='CORE PURGE // <b>READY</b> — Space';
    }
    purgeDial.title=`CORE PURGE — ${PURGE_COST}g, ${PURGE_CD}s cooldown. Damages nearby Bloom, never the whole organism. (Space)`;
  }
  const strikeDial=document.getElementById('strikeDial');
  const strikeTxt=document.getElementById('strikeDialTxt');
  const strikeHint=document.getElementById('strikeHint');
  if(strikeDial){
    const sunlocked=strikeUnlocked();
    const sready=strikeReady() && coins>=STRIKE_COST;
    strikeDial.classList.toggle('ready',sunlocked&&!strikeArming&&strikeCd<=0&&coins>=STRIKE_COST);
    strikeDial.classList.toggle('arming',strikeArming);
    strikeDial.classList.toggle('locked',!sunlocked||!sready);
    if(strikeTxt){
      if(strikeArming) strikeTxt.textContent='AIM';
      else if(!sunlocked) strikeTxt.textContent='—';
      else if(strikeCd>0) strikeTxt.textContent=`${Math.ceil(strikeCd)}s`;
      else strikeTxt.textContent=`${STRIKE_COST}g`;
    }
    if(strikeHint){
      if(strikeArming) strikeHint.innerHTML='<b>CLICK MAP</b> to commit';
      else if(!sunlocked) strikeHint.textContent=`STRIKE WING // offline — ${strikeLockReason()}`;
      else if(strikeCd>0) strikeHint.textContent=`STRIKE WING // refitting… ${Math.ceil(strikeCd)}s`;
      else if(coins<STRIKE_COST) strikeHint.innerHTML=`STRIKE WING // ready — needs <b>${STRIKE_COST}g</b>`;
      else strikeHint.innerHTML='STRIKE WING // <b>READY</b> — X';
    }
    strikeDial.title=`STRIKE WING — ${STRIKE_COST}g, ${STRIKE_CD}s refit. ${STRIKE_SHIPS} fragile craft carve a path where you point them. (X)`;
  }
  const wp=document.getElementById('wavePreviewText');
  const wavePreview=document.getElementById('wavePreview');
  if(wavePreview) wavePreview.classList.toggle('early-hidden', !defenseEstablished);
  const statsOverlay=document.getElementById('statsOverlay');
  if(statsOverlay) statsOverlay.classList.toggle('early-hidden', wave<3);
  if(wp){
    // Organism language: quiet / creeping / surging. Never "wave N".
    // The zoom layer reads as discovery: STATION → LOCAL → PLANETARY → SYSTEM → DEEP.
    const zl = cam.zoom>=1.5?'STATION':cam.zoom>=1.0?'LOCAL':cam.zoom>=0.65?'PLANETARY':cam.zoom>=0.4?'SYSTEM':'DEEP';
    const bloomMood = cores.length?`◉ CORE ×${cores.length} — BLOOM QUICKENING`:(wave%10===0?'BLOOM SURGING':defenseEstablished?'BLOOM CREEPING':'SYSTEM QUIET');
    wp.textContent=`${zl} • ${bloomMood} • ♥ ${hearts.length+cores.length} • CLOUD ${myceliumMass()}`;
  }
  const dpsEl=document.getElementById('statDps');
  if(dpsEl) dpsEl.textContent=Math.round(dps);
  const peakEl=document.getElementById('statPeak');
  if(peakEl) peakEl.textContent=Math.round(peakDps);
  const wasteEl=document.getElementById('statWaste');
  if(wasteEl){
    const wastePct = totalDamage>0 ? Math.round(overkill/totalDamage*100) : 0;
    wasteEl.textContent=wastePct+'%';
    wasteEl.style.color = wastePct>35 ? '#fb7185' : wastePct>20 ? '#facc15' : '#7ce67c';
  }
  if(selectedStation){
    const lvlEl=document.getElementById('towerPanelLevel');
    if(lvlEl) lvlEl.textContent=`TECH ${Object.keys(STATION_TECH).reduce((n,id)=>n+(stationTech[id]||0),0)} • HULL ${Math.max(0,Math.floor(lives))}/${maxLives}`;
    for(const id of Object.keys(STATION_TECH)){
      const b=document.getElementById('techBtn-'+id);
      if(!b) continue;
      const d=STATION_TECH[id], maxed=stationTech[id]>=d.max;
      const can=!maxed&&techAvailable(id)&&coins>=techCost(id);
      b.disabled=!can; b.classList.toggle('disabled',!can);
    }
    const ob2=document.getElementById('outpostBuildBtn');
    if(ob2){
      const can2=outpostUnlocked()&&outpostCount()<OUTPOST_MAX&&coins>=OUTPOST_COST;
      ob2.disabled=!can2; ob2.classList.toggle('disabled',!can2);
    }
  }
  if(selectedTower){
    if(!towers.includes(selectedTower)){ selectedTower=null; hidePanel(); }
    else {
      const bc=document.getElementById('branchChoice');
      const up=document.getElementById('upgradeBtn');
      if(selectedTower.level===2 && bc && !bc.classList.contains('hidden')){
        const c=upgradeCost(selectedTower);
        const canAfford = coins >= c;
        bc.querySelectorAll('.branch-btn').forEach(b=>{
          b.classList.toggle('disabled', !canAfford);
          const costSpan=b.querySelector('b');
          if(costSpan && !costSpan.textContent.includes(String(c))) costSpan.innerHTML=`${c} <span class="coin sm"></span>`;
        });
      } else if(up){
        if(selectedTower.level<5){
          const c=upgradeCost(selectedTower);
          const canAfford = coins >= c;
          up.disabled = !canAfford;
          up.classList.toggle('disabled', !canAfford);
        }
      }
    }
  }
  updateBuildBar();
}

function drawNodeShape(x,y,r,fill,stroke,lineWidth=2){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(Math.PI/4);
  ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=lineWidth;
  ctx.beginPath(); ctx.rect(-r*0.72,-r*0.72,r*1.44,r*1.44); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawLaneArrow(x1,y1,x2,y2,color){
  const mx=x1+(x2-x1)*0.58, my=y1+(y2-y1)*0.58;
  const ang=Math.atan2(y2-y1,x2-x1);
  ctx.save(); ctx.translate(mx,my); ctx.rotate(ang);
  ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(-5,-4); ctx.lineTo(-3,0); ctx.lineTo(-5,4); ctx.closePath(); ctx.fill(); ctx.restore();
}

function render(){
  ctx.save();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  if(state!==STATE.PLAYING && state!==STATE.PAUSED && state!==STATE.WARP){
    // Title plate: a quiet instrument-window composition, separate from the map.
    ctx.fillStyle='#050812'; ctx.fillRect(0,0,W,H);
    const mt=performance.now()*0.001;
    for(let gx=0;gx<W/42;gx++) for(let gy=0;gy<H/42;gy++){
      const hh=hash2(gx,gy);
      if(hh<0.62) continue;
      ctx.globalAlpha=0.22+0.35*Math.abs(Math.sin(mt*0.55+hh*20));
      ctx.fillStyle=hh>0.95?'#e9c878':'#9aa8b8';
      ctx.fillRect(Math.round(gx*42+hh*28),Math.round(gy*42+hash2(gy,gx)*28),hh>0.95?3:2,hh>0.95?3:2);
    }
    ctx.globalAlpha=1;
    const sx=W*0.50, sy=H*0.58;
    ctx.strokeStyle='rgba(143,160,175,0.18)'; ctx.lineWidth=1;
    for(const rr of [92,148,218]){ ctx.beginPath(); ctx.ellipse(sx,sy,rr,rr*0.46,0,0,Math.PI*2); ctx.stroke(); }
    ctx.fillStyle='rgba(238,184,84,0.10)'; ctx.fillRect(sx-46,sy-46,92,92);
    ctx.fillStyle='#8f5b21'; ctx.fillRect(sx-22,sy-22,44,44);
    ctx.fillStyle='#e2a83b'; ctx.fillRect(sx-16,sy-16,32,32);
    ctx.fillStyle='#fff0ad'; ctx.fillRect(sx-10,sy-10,20,12);
    const planets=[{x:sx-150,y:sy-44,r:19,c:'#557a9c',l:'#d6e5e7'},{x:sx+136,y:sy+34,r:27,c:'#9a6339',l:'#d7a86a'},{x:sx+48,y:sy-94,r:10,c:'#7d8790',l:'#d0d6cf'}];
    for(const p of planets){
      ctx.fillStyle='#02040a'; ctx.fillRect(p.x-p.r-3,p.y-p.r-3,p.r*2+6,p.r*2+6);
      ctx.fillStyle=p.c; ctx.fillRect(p.x-p.r,p.y-p.r,p.r*2,p.r*2);
      ctx.fillStyle=p.l; ctx.fillRect(p.x-p.r+3,p.y-p.r+3,p.r*2-6,5);
      ctx.fillStyle='rgba(5,8,18,.38)'; ctx.fillRect(p.x-2,p.y+4,p.r-1,5);
    }
    for(let b=0;b<34;b++){
      const ba=mt*0.02+b/34*Math.PI*2;
      ctx.fillStyle=b%5===0?'#c9a96a':'#5c6670';
      ctx.fillRect(Math.round(sx+Math.cos(ba)*218)-1,Math.round(sy+Math.sin(ba)*100)-1,3,3);
    }
    const stx=W*0.18, sty=H*0.72;
    ctx.fillStyle='rgba(229,168,62,0.10)'; ctx.fillRect(stx-84,sty-60,168,120);
    ctx.fillStyle='#101b25'; ctx.fillRect(stx-48,sty-14,96,28); ctx.fillRect(stx-14,sty-40,28,80);
    ctx.fillStyle='#34424b'; ctx.fillRect(stx-43,sty-9,86,18); ctx.fillRect(stx-9,sty-35,18,70);
    ctx.fillStyle='#c58c3b'; ctx.fillRect(stx-28,sty-5,10,7); ctx.fillRect(stx-11,sty-5,10,7); ctx.fillRect(stx+6,sty-5,10,7);
    ctx.fillStyle='#f5d68d'; ctx.fillRect(stx-27,sty-4,7,3); ctx.fillRect(stx-10,sty-4,7,3); ctx.fillRect(stx+7,sty-4,7,3);
    ctx.fillStyle='#617784'; ctx.fillRect(stx-84,sty-3,32,6); ctx.fillRect(stx+52,sty-3,32,6);
    ctx.fillStyle='#9db6bb'; ctx.fillRect(stx-82,sty-2,28,2); ctx.fillRect(stx+54,sty-2,28,2);
    ctx.fillStyle='#9b6c35'; ctx.fillRect(stx-4,sty-55,8,15); ctx.fillStyle='#d8b353'; ctx.fillRect(stx-6,sty-59,12,4);
    if((mt*1.5|0)%2===0){ ctx.fillStyle='#df5b45'; ctx.fillRect(stx-51,sty+8,4,4); ctx.fillRect(stx+47,sty+8,4,4); }
    const mdx=(mt*28)%(W+180)-90, mdy=H*0.62+Math.sin(mt*0.7)*8;
    ctx.fillStyle='rgba(224,180,76,0.36)'; for(let td=1;td<=5;td++) ctx.fillRect(Math.round(mdx-td*8),Math.round(mdy),4,2);
    ctx.fillStyle='#d9a943'; ctx.fillRect(Math.round(mdx)-5,Math.round(mdy)-4,13,8); ctx.fillStyle='#26333a'; ctx.fillRect(Math.round(mdx)-5,Math.round(mdy)-4,13,2);
    ctx.globalAlpha=0.18+0.05*Math.sin(mt*0.8);
    ctx.strokeStyle='#703c78'; ctx.lineWidth=5; ctx.beginPath();
    ctx.moveTo(W*0.88,H*0.08); ctx.bezierCurveTo(W*0.74,H*0.24,W*0.94,H*0.32,W*0.78,H*0.48);
    ctx.moveTo(W*0.94,H*0.18); ctx.bezierCurveTo(W*0.80,H*0.40,W*0.98,H*0.55,W*0.82,H*0.78);
    ctx.moveTo(W*0.86,H*0.45); ctx.bezierCurveTo(W*0.70,H*0.56,W*0.76,H*0.76,W*0.67,H*0.90); ctx.stroke();
    ctx.fillStyle='#bd72bb'; ctx.fillRect(W*0.84,H*0.46,6,6);
    ctx.globalAlpha=1;
    ctx.globalAlpha=1; ctx.restore(); return;
  }
  // camera: world-space with whole-screen-pixel snap, shake in screen px
  const shx=shake>0?(Math.random()-0.5)*shake:0, shy=shake>0?(Math.random()-0.5)*shake:0;
  ctx.setTransform(DPR*cam.zoom,0,0,DPR*cam.zoom, Math.round(DPR*(-cam.x*cam.zoom+shx)), Math.round(DPR*(-cam.y*cam.zoom+shy)));
  // PIXEL SKY: infinite surround + world nebula + twinkling stars.
  // The fill extends far past the world so no border can ever show.
  const nowS=performance.now()*0.001;
  px(cam.x-2400,cam.y-2400,W/cam.zoom+4800,H/cam.zoom+4800,PX_COLORS.bg0);
  for(const n of pixelNebula) px(n.x,n.y,n.w,n.h,n.c);
  ctx.globalAlpha=1;
  for(const s of pixelStars){
    const tw=0.55+0.45*Math.sin(nowS*2+s.tw);
    ctx.globalAlpha=tw;
    px(s.x,s.y,s.s,s.s,s.c);
  }
  ctx.globalAlpha=1;
  // deep field: procedural stars ONLY outside the world rect (infinite illusion)
  {
    const x0=Math.floor((cam.x-600)/90), x1=Math.floor((cam.x+W/cam.zoom+600)/90);
    const y0=Math.floor((cam.y-600)/90), y1=Math.floor((cam.y+H/cam.zoom+600)/90);
    for(let gx=x0;gx<=x1;gx++) for(let gy=y0;gy<=y1;gy++){
      const cx=gx*90+45, cy=gy*90+45;
      if(cx>-60&&cy>-60&&cx<WORLD.w+60&&cy<WORLD.h+60) continue; // inner sky stays as-is
      const h1=hash2(gx,gy);
      if(h1<0.42) continue;
      ctx.globalAlpha=(0.3+0.5*Math.abs(Math.sin(nowS*1.2+h1*20)))*(h1>0.93?0.9:0.55);
      const sz=h1>0.93?3:2;
      px(cx,cy,sz,sz,h1>0.97?'#fde68a':(h1>0.9?'#7dd3fc':'#cbd5e1'));
    }
    ctx.globalAlpha=1;
  }
  // distant mycelium: the organism continues past the rim, into the fog
  {
    const fr0=Math.min(WORLD.w,WORLD.h)/2;
    for(let k=0;k<30;k++){
      const ang=k/30*Math.PI*2+0.21;
      const rr=fr0+140+hash2(k,7)*380;
      const bx=WORLD.w/2+Math.cos(ang)*rr, by=WORLD.h/2+Math.sin(ang)*rr*0.96;
      ctx.globalAlpha=0.35+0.3*Math.sin(nowS*1.4+k*1.7);
      const s1=10+Math.floor(hash2(k,13)*22);
      px(bx-s1/2,by-s1/2,s1,s1,'#4c1d95');
      px(bx-s1/4,by-s1/4,s1/2,s1/2,'#7c3aad');
      if(hash2(k,29)>0.5) px(bx+s1/2+4,by-6,5,5,'#6d28d9');
    }
    ctx.globalAlpha=1;
  }
  // deep-space vignette follows the CAMERA, never the old square:
  // there is no rim, no wall, no edge of the world — only darkness ahead.
  {
    const vc=viewCenter();
    const vw2=W/cam.zoom, vh2=H/cam.zoom;
    const vr=Math.max(vw2,vh2)*0.75;
    const g=ctx.createRadialGradient(vc.x,vc.y,vr*0.55,vc.x,vc.y,vr+620);
    g.addColorStop(0,'rgba(7,11,24,0)');
    g.addColorStop(1,'rgba(4,6,15,0.35)');
    ctx.fillStyle=g;
    ctx.fillRect(cam.x-2400,cam.y-2400,W/cam.zoom+4800,H/cam.zoom+4800);
  }
  // faint pixel grid across the visible view (not just the old square)
  ctx.fillStyle='rgba(148,163,184,0.05)';
  {
    const gx0=Math.floor(cam.x/32)*32, gx1=cam.x+W/cam.zoom;
    for(let gx=gx0;gx<gx1;gx+=32) ctx.fillRect(gx,cam.y,1,H/cam.zoom);
    const gy0=Math.floor(cam.y/32)*32, gy1=cam.y+H/cam.zoom;
    for(let gy=gy0;gy<gy1;gy+=32) ctx.fillRect(cam.x,gy,W/cam.zoom,1);
  }
  // (no rim: the Bloom grows in world coordinates, indefinitely)
  // DEEP-SPACE FOG: uncharted darkness around the explored region. Not a wall —
  // the universe continues; this is only how far the expedition can SEE.
  // Explored ground grows as lanes link and the watch lengthens.
  {
    const hx=WORLD.w/2, hy=WORLD.h/2;
    const explored=Math.min(2600, 850+asteroids.filter(a=>a.unlocked).length*130+threatTime*0.35);
    const g2=ctx.createRadialGradient(hx,hy,explored*0.72,hx,hy,explored+950);
    g2.addColorStop(0,'rgba(3,5,12,0)');
    g2.addColorStop(0.55,'rgba(3,5,12,0.28)');
    g2.addColorStop(1,'rgba(2,4,10,0.88)');
    ctx.fillStyle=g2;
    ctx.fillRect(cam.x-2400,cam.y-2400,W/cam.zoom+4800,H/cam.zoom+4800);
    // Faint organic hints beyond sight: "this thing is bigger than this system."
    // Fixed positions (stable across frames); fade as the expedition reaches them.
    for(let k=0;k<26;k++){
      const ang=k/26*Math.PI*2+0.35+hash2(k,3)*0.3;
      const rr=1500+hash2(k,11)*1900;
      const bx=hx+Math.cos(ang)*rr, by=hy+Math.sin(ang)*rr*0.94;
      const depth=Math.min(1,Math.max(0,(rr-explored)/800));
      if(depth<=0) continue;
      const s2=14+Math.floor(hash2(k,17)*30);
      ctx.globalAlpha=depth*(0.16+0.10*Math.sin(nowS*1.1+k*1.7));
      px(bx-s2/2,by-s2/2,s2,s2,'#3b1d6e');
      px(bx-s2/4,by-s2/4,s2/2,s2/2,'#5b2a86');
      ctx.globalAlpha=1;
    }
  }
  // drift motes: faint spores on the wind (pre-defense dread, no gameplay)
  for(const mo of driftMotes){
    const tw2=0.35+0.3*Math.sin(nowS*2+mo.seed);
    ctx.globalAlpha=tw2;
    px(snap(mo.x)-1,snap(mo.y)-1,3,3,'#f0abfc');
  }
  ctx.globalAlpha=1;
  const threatActive=myceliumVisible();
  // ===== M1: SOLAR SYSTEM (under the cloud so the invasion can cover it) =====
  if(star){
    // orbit paths: dotted pixel squares
    for(const p of planets){
      for(let a=0;a<72;a++){
        if(a%3) continue;
        const ang=a/72*Math.PI*2;
        px(star.x+Math.cos(ang)*p.orbitR-1, star.y+Math.sin(ang)*p.orbitR*0.92-1, 2, 2, 'rgba(148,163,184,0.22)');
      }
    }
    for(let a=0;a<96;a++){
      if(a%2) continue;
      const ang=a/96*Math.PI*2;
      px(star.x+Math.cos(ang)*800-1, star.y+Math.sin(ang)*800*0.92-1, 2, 2, 'rgba(148,163,184,0.12)');
    }
    // debris belt rocks
    for(const b of beltRocks){
      if(b.x==null) continue;
      px(snap(b.x)-1, snap(b.y)-1, b.size, b.size, '#57534e');
      px(snap(b.x)-1, snap(b.y)-1, b.size, 1, '#a8a29e');
    }
    // star: layered glow + flickering pixel core
    {
      const sx=snap(star.x), sy=snap(star.y), flick=Math.sin(nowS*3+star.seed)>0?2:0;
      px(sx-70,sy-70,140,140,'rgba(251,191,36,0.07)');
      px(sx-58,sy-58,116,116,'rgba(251,191,36,0.10)');
      pxBox(sx-star.r-6,sy-star.r-6,(star.r+6)*2,(star.r+6)*2,'#b45309','#020617');
      pxBox(sx-star.r,sy-star.r,star.r*2,star.r*2,'#f59e0b','#7c2d12');
      px(sx-star.r+8,sy-star.r+8,star.r*2-16,star.r*2-16,'#fbbf24');
      px(sx-20,sy-20+flick,40,30,'#fef3c7');
      px(sx-20,sy-20+flick,40,6,'#ffffff');
      px(sx-8+Math.round(Math.sin(nowS*2)*3),sy-34,5,5,'#fef08a');
      px(sx+14,sy+22-Math.round(Math.sin(nowS*2.4)*2),4,4,'#fde68a');
      ctx.fillStyle='#fde68a'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
      ctx.fillText('☀ SOL', sx, sy+star.r+20);
    }
    // planets + moons: real worlds. Worlds with extraction sites show a
    // resource dot by their name (zoom-gated); infected worlds grow a rim.
    ctx.globalAlpha=0.85;
    const detailD=cam.zoom>=0.6;
    const worldState=(p)=>{
      // worst infection across this world's sites drives the rim
      let worst=0, res=null;
      for(const n of (p.res||[])){
        if(!n.surveyed) continue;
        if(!res) res=n;
        const o={normal:0,exposed:1,infected:2,corrupted:3,overrun:4}[n.cstate||'normal'];
        if(o>worst) worst=o;
      }
      return {worst, res};
    };
    for(const p of planets){
      const pxx=snap(p.x), pyy=snap(p.y), pr=p.r;
      px(pxx-pr+3,pyy+pr+4,pr*2-6,4,'rgba(0,0,0,0.35)'); // shadow
      pxBox(pxx-pr,pyy-pr,pr*2,pr*2,p.dark,'#020617');
      px(pxx-pr+3,pyy-pr+3,pr*2-6,pr*2-6,p.base);
      px(pxx-pr+3,pyy-pr+3,pr*2-6,4,p.light); // top light
      if(detailD){
        if(p.v==='ice'){
          px(pxx-pr+5,pyy-pr+4,pr*2-10,7,'#f8fafc'); // cap
          px(pxx-pr+5,pyy-pr+10,pr*2-10,2,p.band);
          px(pxx-2,pyy-pr+12,2,10,p.band); px(pxx+6,pyy-pr+14,2,8,p.band); // cracks
          px(pxx-pr+8,pyy+6,6,4,'rgba(255,255,255,0.35)');
        } else if(p.v==='desert'){
          px(pxx-pr+4,pyy-4,pr*2-8,5,p.band); // dunes
          px(pxx-pr+6,pyy+5,pr*2-12,3,'rgba(0,0,0,0.25)');
          px(pxx+pr-9,pyy-8,4,6,p.dark); // dark region
          px(pxx-pr,pyy+2,3,5,p.dark); // irregular edge bite
        } else if(p.v==='gas'){
          px(pxx-pr+3,pyy-6,pr*2-6,4,p.band);
          px(pxx-pr+3,pyy+1,pr*2-6,5,'rgba(255,255,255,0.22)');
          px(pxx-pr+3,pyy+8,pr*2-6,4,p.dark); // underside
          const stx=pxx+Math.round(Math.sin(nowS*0.5+p.seed)*3);
          px(stx-5,pyy+2,10,7,p.light); px(stx-3,pyy+4,6,3,p.dark); // storm
        } else { // rock
          px(pxx-pr+8,pyy-2,6,6,p.dark); px(pxx-pr+7,pyy-3,6,2,p.light);
          px(pxx+2,pyy+6,7,7,p.dark); px(pxx+3,pyy+5,7,2,p.light);
          px(pxx-10,pyy+10,5,5,p.dark);
        }
        px(pxx+pr-8,pyy-pr+6,5,pr*2-12,'rgba(0,0,0,0.28)'); // shadow side
      }
      for(const m of p.moons){
        const mxx=snap(m.x), myy=snap(m.y);
        px(mxx-m.r+1,myy+m.r+2,m.r*2-2,2,'rgba(0,0,0,0.3)');
        pxBox(mxx-m.r,myy-m.r,m.r*2,m.r*2,'#57534e','#020617');
        px(mxx-m.r+2,myy-m.r+2,m.r*2-4,m.r*2-4,'#78716c');
        px(mxx-m.r+2,myy-m.r+2,m.r*2-4,2,'#e7e5e4');
        if(detailD) px(mxx-2,myy+1,3,3,'#4b5563');
        const ms=worldState(m);
        if(ms.worst>=2){ // infected moon: purple fringe you can see coming
          ctx.globalAlpha=0.5+0.3*Math.sin(nowS*4);
          px(mxx-m.r-3,myy-m.r-3,m.r*2+6,2,'#c084fc');
          px(mxx-m.r-3,myy+m.r+1,m.r*2+6,2,'#c084fc');
          ctx.globalAlpha=0.85;
        }
        if(cam.zoom>=0.9){
          ctx.fillStyle='#e2e8f0'; ctx.font='bold 7px monospace'; ctx.textAlign='center';
          ctx.fillText((m.name||'Moon').toUpperCase(),mxx,myy-m.r-6);
        }
      }
      const ps=worldState(p);
      if(ps.worst>=2){ // infected world: the Bloom is ON the planet
        ctx.globalAlpha=0.45+0.25*Math.sin(nowS*4);
        const pr2=pr+4;
        px(pxx-pr2,pyy-pr2,pr2*2,2,'#c084fc'); px(pxx-pr2,pyy+pr2-2,pr2*2,2,'#c084fc');
        px(pxx-pr2,pyy-pr2,2,pr2*2,'#c084fc'); px(pxx+pr2-2,pyy-pr2,2,pr2*2,'#c084fc');
        ctx.globalAlpha=0.85;
      }
      ctx.fillStyle=ps.worst>=3?'rgba(240,171,252,0.85)':'rgba(226,232,240,0.6)'; ctx.font='bold 8px monospace'; ctx.textAlign='center';
      ctx.fillText(p.name.toUpperCase()+(ps.res&&cam.zoom>=0.8?' · '+nodeResource(ps.res):''), pxx, pyy-pr-8);
    }
    ctx.globalAlpha=1;
  }
  // ===== VOXEL MYCELIUM CLOUD (under everything except sky) =====
  if(threatActive){
    // distant-ledger haze: aggregate pressure reads as faint organic mass at
    // far zoom (the capped Bloom, still growing). Near zoom shows only real
    // voxels — no double vision.
    if(cam.zoom<0.85 && bloomLedger.size){
      for(const e of bloomLedger.values()){
        if(e.pressure<8) continue;
        const a=Math.min(0.22,0.06+e.pressure*0.0025)*(0.7+0.3*Math.sin(nowS*1.3+e.lx+e.ly));
        ctx.globalAlpha=Math.max(0,a);
        px(e.lx*LEDGER_PX,e.ly*LEDGER_PX,LEDGER_PX,LEDGER_PX,'#4c1d95');
        px(e.lx*LEDGER_PX+LEDGER_PX/4,e.ly*LEDGER_PX+LEDGER_PX/4,LEDGER_PX/2,LEDGER_PX/2,'#6d28d9');
        ctx.globalAlpha=1;
      }
    }
    // LOD: far zoom aggregates — body + outline only, no veins/shading/strips.
    // Viewport cull: off-screen voxels cost nothing (matters now mass persists).
    const voxFar=cam.zoom<0.5;
    const vc0=mycWorldToCell(cam.x-PIX,cam.y-PIX), vc1=mycWorldToCell(cam.x+W/cam.zoom+PIX,cam.y+H/cam.zoom+PIX);
    for(const cell of mycCells.values()){
      if(cell.cx<vc0.cx||cell.cx>vc1.cx||cell.cy<vc0.cy||cell.cy>vc1.cy) continue;
      const bx=cell.cx*PIX, by=cell.cy*PIX;
      const hpFrac=Math.max(0,cell.hp/cell.maxHp);
      const pulse=0.5+0.5*Math.sin(nowS*2.2+cell.seed);
      const stage=Math.min(5,Math.floor((1-hpFrac)*3+cell.age*0.05+pulse*0.6));
      const base=PX_COLORS.myc[Math.max(0,Math.min(5,stage))];
      // voxel body + dark outline (1px inset look via overdraw)
      px(bx-1,by-1,PIX+2,PIX+2,'#150826');
      px(bx,by,PIX,PIX,cell.flash>0?'#ffffff':base);
      if(voxFar) continue; // aggregated far representation
      // inner shading: top-light pixel row + bottom shadow row
      px(bx+2,by+2,PIX-4,3,'rgba(255,255,255,0.20)');
      px(bx+2,by+PIX-5,PIX-4,3,'rgba(0,0,0,0.30)');
      // vein pixel: mycelium network feel
      if(((cell.cx*7+cell.cy*13)|0)%3===0) px(bx+PIX/2-2,by+PIX/2-2,4,4,'#f0abfc');
      else if(((cell.cx*5+cell.cy*11)|0)%4===0) px(bx+3,by+3,3,3,'#e9d5ff');
      // cryo-held voxels tint blue
      if(cell.slowUntil>nowS) px(bx+1,by+1,PIX-2,PIX-2,'rgba(125,211,252,0.35)');
      // damaged voxels crack (hp bar as 3px strip)
      if(hpFrac<1){
        px(bx+2,by+PIX-3,PIX-4,2,'#020617');
        px(bx+2,by+PIX-3,(PIX-4)*hpFrac,2,hpFrac>0.5?'#f0abfc':'#fb7185');
      }
    }
    // spore sparkle on random frontier voxels (gated: invisible at far zoom anyway)
    if(mycCells.size && cam.zoom>=0.5){
      const keys=null;
      for(let s=0;s<6;s++){
        // cheap random sample without array alloc
        let n=Math.floor(Math.random()*mycCells.size), it=mycCells.values(), c=null;
        for(let k=0;k<=n;k++) c=it.next().value;
        if(!c) break;
        const cc=mycCellCenter(c.cx,c.cy);
        px(cc.x-1,cc.y-4+Math.sin(nowS*3+c.seed)*2,3,3,'#f5d0fe');
      }
    }
  }
  // ===== HEARTS, CLUSTERS & PODS (over the cloud so they read at any zoom) =====
  if(threatActive){
    for(const c of clusters){
      const dx=snap(c.x), dy=snap(c.y);
      const growth=Math.min(1,c.age/c.matureAt);
      const pulse=Math.sin(nowS*3+c.seed)>0?2:0;
      const S=20+Math.floor(growth*10)+pulse;
      px(dx-S/2-6,dy-S/2-6,S+12,S+12,'rgba(192,132,252,0.14)');
      pxBox(dx-S/2,dy-S/2,S,S,c.flash>0?'#ffffff':'#6d28d9','#150826');
      px(dx-S/2+3,dy-S/2+3,S-6,4,'rgba(255,255,255,0.3)');
      // rooting veins
      px(dx-8,dy+S/2,4,6,'#4c1d95'); px(dx+4,dy+S/2,4,6,'#4c1d95');
      px(dx-3,dy-3,6,6,'#e9d5ff');
      const cf=Math.max(0,c.hp/c.maxHp);
      px(dx-12,dy+S/2+6,24,4,'#020617');
      px(dx-11,dy+S/2+7,22*cf,2,'#c084fc');
      // maturity ring: the window closing
      px(dx-12,dy-S/2-8,24,3,'#020617');
      px(dx-11,dy-S/2-7,22*growth,1,growth>0.75?'#fb7185':'#c084fc');
      if(growth>0.75){ ctx.fillStyle='#fecdd3'; ctx.font='bold 8px monospace'; ctx.textAlign='center'; ctx.fillText('ROOTING!',dx,dy-S/2-12); }
    }
    // Traveling tendrils: chains of discrete square voxel growth — a colony
    // spreading cell by cell, never a smooth snake. Grid-snapped, irregular,
    // with side nubs. Far zoom draws thin dotted threads.
    const tendFar=cam.zoom<0.5;
    for(const t of tendrils){
      const n=t.pts.length;
      if(n<2) continue;
      if(t.done) ctx.globalAlpha=Math.max(0,Math.min(1,(t.fade||0)/1.5));
      const stride=tendFar?4:1;
      for(let pi=stride;pi<n;pi+=stride){
        const a=t.pts[pi-stride], b=t.pts[pi];
        // snap to the voxel grid: the tendril IS the cellular growth
        const cc=mycWorldToCell((a.x+b.x)/2,(a.y+b.y)/2);
        const gx=cc.cx*PIX+PIX/2, gy=cc.cy*PIX+PIX/2;
        const jx=((cc.cx*7+cc.cy*13)%5)-2, jy=((cc.cx*3+cc.cy*11)%5)-2; // organic jitter
        if(tendFar) px(gx-1,gy-1,2,2,'#6d28d9');
        else {
          const big=(cc.cx+cc.cy)%2===0;
          const s2=big?7:5;
          px(gx-s2/2+jx*0.5-1,gy-s2/2+jy*0.5-1,s2+2,s2+2,'#150826');
          px(gx-s2/2+jx*0.5,gy-s2/2+jy*0.5,s2,s2,'#4c1d95');
          px(gx-1+jx*0.5,gy-1+jy*0.5,2,2,'#a855f7');
          if((cc.cx*5+cc.cy*7)%7===0) px(gx+jx-4,gy+jy+3,3,3,'#6d28d9'); // side nub
        }
      }
      const tip=t.pts[n-1];
      const pulseT=Math.sin(nowS*4+t.seed)>0?1:0;
      const struck=t.tipFlash>0;
      if(tendFar) px(tip.x-1,tip.y-1,3,3,struck?'#ffffff':'#f0abfc');
      else {
        const tc=mycWorldToCell(tip.x,tip.y);
        const tx2=tc.cx*PIX+PIX/2, ty2=tc.cy*PIX+PIX/2;
        // stalled tips dim flicker-white: the colony is nursing the wound
        const dimmed=(t.stun||0)>0 && Math.sin(nowS*10)>0;
        px(tx2-4,ty2-4,8+pulseT,8+pulseT,struck?'#ffffff':'#6d28d9');
        px(tx2-2,ty2-2,4,4,struck?'#ffffff':(dimmed?'#c4b5fd':'#f0abfc'));
        px(tx2-2,ty2-2,4,1,'#ffffff');
        // wound strip: only once it's been shot — shoot the pale head
        if(t.hp<t.maxHp){
          const hf=Math.max(0,t.hp/t.maxHp);
          px(tx2-9,ty2+7,18,3,'#020617');
          px(tx2-8,ty2+8,16*hf,1,hf>0.5?'#e9d5ff':'#fb7185');
        }
      }
      ctx.globalAlpha=1;
    }
    for(const p of pods){
      const dx=snap(p.x), dy=snap(p.y);
      const beat=Math.sin(nowS*4+p.seed)>0?2:0;
      px(dx-14,dy-14,28,28,'rgba(240,171,252,0.15)');
      pxBox(dx-11-beat/2,dy-11-beat/2,22+beat,22+beat,p.flash>0?'#ffffff':'#a855f7','#150826');
      px(dx-11-beat/2,dy-11-beat/2,22+beat,5,'rgba(255,255,255,0.35)');
      px(dx-4,dy-4,8,8,'#f0abfc');
      px(dx-4,dy-4,8,2,'#ffffff');
      const pf=Math.max(0,p.hp/p.maxHp);
      px(dx-12,dy+15,24,4,'#020617');
      px(dx-11,dy+16,22*pf,2,pf>0.5?'#f0abfc':'#fb7185');
    }
    for(const h of hearts){
      const hx=snap(h.x), hy=snap(h.y);
      const beat=Math.sin(nowS*2.4+h.seed)>0?4:0;
      const S=(h.primary?52:44)+beat;
      // merge sync: grouped hearts beat TOGETHER — the tell before a core
      const sync=h.mergeSync&&Math.sin(nowS*6)>0;
      // tendrils: branching arms rooted in the core (LOD-gated)
      if(cam.zoom>=0.55){
        for(let ta=0;ta<5;ta++){
          const tang=h.seed+ta*Math.PI*2/5+Math.sin(nowS*0.7+h.seed+ta)*0.15;
          let tx2=hx, ty2=hy;
          const segs=3+(ta%2);
          for(let sg=1;sg<=segs;sg++){
            const sl2=(S/2+6)+sg*11;
            tx2=hx+Math.cos(tang)*sl2+Math.sin(nowS*1.1+ta*2+sg)*4;
            ty2=hy+Math.sin(tang)*sl2+Math.cos(nowS*0.9+ta+sg*1.3)*4;
            px(tx2-3,ty2-3,6,6,sg%2?'#6d28d9':'#4c1d95');
            px(tx2-1,ty2-1,2,2,'#a855f7');
          }
          px(tx2-2,ty2-2,4,4,'#f0abfc'); // spore tip
        }
      }
      // orbiting spore pixels
      for(let o=0;o<6;o++){
        const oa=nowS*0.9+h.seed+o*Math.PI/3;
        px(hx+Math.cos(oa)*(30+beat)-2,hy+Math.sin(oa)*(30+beat)-2,4,4,'#f0abfc');
      }
      px(hx-S/2-4,hy-S/2-4,S+8,S+8,sync?'rgba(240,171,252,0.35)':'rgba(251,113,133,0.18)');
      pxBox(hx-S/2,hy-S/2,S,S,(h.flash>0||sync)?'#ffffff':'#7f1d1d','#020617');
      px(hx-S/2+5,hy-S/2+5,S-10,S-10,'#dc2626');
      px(hx-11,hy-13,22,18,'#f0abfc'); // bright core
      px(hx-11,hy-13,22,4,'#ffffff');
      px(hx-4,hy-6,8,8,h.flash>0?'#ffffff':'#881337'); // dark nucleus
      const hf=Math.max(0,h.hp/h.maxHp);
      px(hx-24,hy+S/2+6,48,6,'#020617');
      px(hx-23,hy+S/2+7,46*hf,4,hf>0.5?'#fb7185':'#ef4444');
      ctx.fillStyle='#fecdd3'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText(h.primary?`♥ PRIMARY ${Math.ceil(Math.max(0,h.hp))}`:`♥ HEART ${Math.ceil(Math.max(0,h.hp))}`,hx,hy-S/2-10);
    }
    // merge in progress: converging ring at the centroid — break it apart NOW
    if(merging && threatActive){
      const mrg=merging, f=1-mrg.t/CORE_MERGE_DUR;
      const rr=120*f+30;
      ctx.globalAlpha=0.5+0.3*Math.sin(nowS*8);
      for(let a=0;a<40;a++){
        const aa=a/40*Math.PI*2;
        px(mrg.x+Math.cos(aa)*rr-2,mrg.y+Math.sin(aa)*rr-2,4,4,'#f0abfc');
      }
      ctx.globalAlpha=1;
      ctx.fillStyle='#fecdd3'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
      ctx.fillText('♥♥♥ MERGING',snap(mrg.x),snap(mrg.y)-70);
    }
    // BLOOM CORES: siege organs inside regenerating colonies. Bigger mass,
    // triple pulse rings, eight arms — mechanically distinct, not a big heart.
    for(const c of cores){
      const hx=snap(c.x), hy=snap(c.y);
      const beat=Math.sin(nowS*2.0+c.seed)>0?6:0;
      const S=92+beat;
      if(cam.zoom>=0.55){
        for(let ta=0;ta<8;ta++){
          const tang=c.seed+ta*Math.PI*2/8+Math.sin(nowS*0.6+c.seed+ta)*0.12;
          let tx2=hx, ty2=hy;
          const segs=4+(ta%2);
          for(let sg=1;sg<=segs;sg++){
            const sl2=(S/2+8)+sg*12;
            tx2=hx+Math.cos(tang)*sl2+Math.sin(nowS*1.0+ta*2+sg)*5;
            ty2=hy+Math.sin(tang)*sl2+Math.cos(nowS*0.8+ta+sg*1.3)*5;
            px(tx2-3,ty2-3,7,7,sg%2?'#5b21b6':'#4c1d95');
            px(tx2-2,ty2-2,3,3,'#c084fc');
          }
          px(tx2-2,ty2-2,5,5,'#f0abfc'); // spore tip
        }
      }
      for(let o=0;o<9;o++){
        const oa=-nowS*0.7+c.seed+o*Math.PI*2/9;
        px(hx+Math.cos(oa)*(52+beat)-2,hy+Math.sin(oa)*(52+beat)-2,4,4,'#e9d5ff');
      }
      // triple pulse rings: the siege read at any zoom
      for(let rr2=0;rr2<3;rr2++){
        const pr2=S/2+14+((nowS*36+rr2*22)%66);
        ctx.globalAlpha=0.35-rr2*0.09;
        px(hx-pr2,hy-2,pr2*2,3,'#c084fc'); px(hx-2,hy-pr2,3,pr2*2,'#c084fc');
        ctx.globalAlpha=1;
      }
      px(hx-S/2-6,hy-S/2-6,S+12,S+12,'rgba(136,19,55,0.30)');
      pxBox(hx-S/2,hy-S/2,S,S,c.flash>0?'#ffffff':'#4c0519','#020617');
      px(hx-S/2+8,hy-S/2+8,S-16,S-16,'#881337');
      px(hx-S/2+8,hy-S/2+8,S-16,6,'rgba(255,255,255,0.25)');
      px(hx-16,hy-18,32,26,'#e9d5ff'); // bright fused core
      px(hx-16,hy-18,32,5,'#ffffff');
      px(hx-6,hy-9,12,12,c.flash>0?'#ffffff':'#3b0764'); // deep nucleus
      const cf=Math.max(0,c.hp/c.maxHp);
      px(hx-34,hy+S/2+8,68,7,'#020617');
      px(hx-33,hy+S/2+9,66*cf,5,cf>0.5?'#c084fc':'#ef4444');
      ctx.fillStyle='#fecdd3'; ctx.font='bold 12px monospace'; ctx.textAlign='center';
      ctx.fillText(`◉ CORE ${Math.ceil(Math.max(0,c.hp))}`,hx,hy-S/2-12);
    }
  }
  // PIXEL trade lanes: physical logistics routes. Base dots mark the path;
  // bright packets flow world → parent (cargo home), dim packets flow
  // parent → world (empty outbound). Busy routes glow with a second rail.
  for(const a of asteroids){
    if(!a.parent) continue;
    if(!a.surveyed){
      // uncharted path: faint planned-route dashes only, no details
      for(let s=0;s<=12;s+=2){
        const t=s/12;
        px(a.parent.x+(a.x-a.parent.x)*t-1,a.parent.y+(a.y-a.parent.y)*t-1,2,2,'rgba(51,65,85,0.8)');
      }
      continue;
    }
    const linked=a.unlocked;
    const blocked=isAsteroidBlocked(a);
    const reachable=isAsteroidReachable(a);
    const laneColor=blocked?'#fb7185':linked?'#7ce67c':reachable?'#facc15':'#475569';
    const laneDrones=drones.reduce((n,d)=>n+(d.targetAsteroid===a?1:0),0);
    const steps=14;
    for(let s=0;s<=steps;s++){
      if(!linked && s%2===0) continue; // dashed look for unlinked
      const t=s/steps;
      const lx=a.parent.x+(a.x-a.parent.x)*t, ly=a.parent.y+(a.y-a.parent.y)*t;
      px(lx-2,ly-2,4,4,laneColor);
    }
    if(linked && laneDrones>0){
      // activity rail: offset parallel dots, brighter with more drones
      const dx=a.x-a.parent.x, dy=a.y-a.parent.y, len=Math.hypot(dx,dy)||1;
      const ox=-dy/len*5, oy=dx/len*5;
      ctx.globalAlpha=Math.min(0.55,0.22+laneDrones*0.12);
      for(let s=0;s<=steps;s+=2){
        const t=s/steps;
        px(a.parent.x+dx*t+ox-1,a.parent.y+dy*t+oy-1,3,3,laneColor);
      }
      ctx.globalAlpha=1;
    }
    if(linked){
      const mx=a.parent.x+(a.x-a.parent.x)*0.58, my=a.parent.y+(a.y-a.parent.y)*0.58;
      px(mx-3,my-2,6,4,laneColor);
      // cargo flow: inbound bright (ore home), outbound dim (empty drone)
      const nPk=1+Math.min(3,laneDrones*2);
      for(let k=0;k<nPk;k++){
        const ti=(nowS*0.22+k/nPk)%1;
        px(a.x+(a.parent.x-a.x)*ti-2,a.y+(a.parent.y-a.y)*ti-2,5,5,'#fde68a');
        const to=(1-ti);
        ctx.globalAlpha=0.55;
        px(a.parent.x+(a.x-a.parent.x)*to-1,a.parent.y+(a.y-a.parent.y)*to-1,3,3,'#94a3b8');
        ctx.globalAlpha=1;
      }
    } else if(reachable && !blocked){
      // faint pulse crawling toward the open world — "send a drone here"
      const ti=(nowS*0.15)%1;
      ctx.globalAlpha=0.7;
      px(a.parent.x+(a.x-a.parent.x)*ti-1,a.parent.y+(a.y-a.parent.y)*ti-1,3,3,'#facc15');
      ctx.globalAlpha=1;
    }
  }
  // PIXEL resource locations: designed interactables — silhouette variants,
  // surface detail, and orbital-infrastructure markers that say "drones work
  // here" (decorative bodies have none of this). Mechanics identical per node.
  const detailN=cam.zoom>=0.55;
  for(const a of asteroids){
    const kind=nodeKind(a);
    const cs=nodeCorruption(a); // M4: infection tint, labels and aura
    const mycBlocked=isAsteroidBlocked(a);
    const reachable=isAsteroidReachable(a);
    const needRelay = !a.unlocked && !reachable && !mycBlocked;
    let nodeColor=mycBlocked?'#fb7185':a.unlocked?'#7ce67c':reachable?'#facc15':'#64748b';
    if(cs==='infected'||cs==='overrun') nodeColor='#c084fc';
    const pal=a.pal||{base:'#8a7d6b',dark:'#4a4238',light:'#e7dcc3',band:'#5b5344'};
    const ax=snap(a.x), ay=snap(a.y), r=Math.round(a.r);
    // Attached extraction site: the world IS the resource. No floating rock —
    // a surface marker on the body, a tether, and a small orbital platform
    // where drones dock. The body (drawn in the solar pass) carries the mass.
    const attached=(a.bodyKind==='planet'||a.bodyKind==='moon')&&a.body&&a.body.x!=null;
    const mblink=Math.sin(nowS*3+ax*0.13)>0;
    if(attached && a.surveyed){
      const b=a.body, sa=a.slotAng+a.slot*2.1;
      const mxx=b.x+Math.cos(sa)*(b.r-3), myy=b.y+Math.sin(sa)*(b.r-3);
      px(mxx-3,myy-3,6,6,nodeColor); // surface claim-marker: the resource lives HERE
      px(mxx-3,myy-3,6,2,'rgba(255,255,255,0.7)');
      // tether platform → surface
      const dx=b.x-ax, dy=b.y-ay, dl=Math.hypot(dx,dy)||1;
      const steps=Math.floor((dl-b.r)/7);
      for(let s2=1;s2<steps;s2++){
        const t2=s2/Math.max(1,steps);
        if(s2%2) continue;
        px(ax+dx*t2-1,ay+dy*t2-1,2,2,'rgba(148,163,184,0.55)');
      }
      // orbital platform: where drones dock and lanes terminate
      px(ax-7,ay+5,14,3,'rgba(0,0,0,0.35)');
      pxBox(ax-7,ay-5,14,10,'#374151','#020617');
      px(ax-7,ay-5,14,2,'#94a3b8');
      px(ax-2,ay-2,5,5,nodeColor); // docked crystal
      px(ax-2,ay-2,5,1,'rgba(255,255,255,0.7)');
      px(ax+6,ay-9,3,3,mblink?'#facc15':'#451a03'); // mast lamp
    }
    if(!a.surveyed){
      // M5: uncharted signature — dark silhouette, kind/tag/ore all hidden
      px(ax-r+3,ay+r+5,r*2-6,5,'rgba(0,0,0,0.35)');
      pxBox(ax-r,ay-r,r*2,r*2,'#0b1220','#020617');
      px(ax-r,ay-r,r*2,2,'rgba(148,163,184,0.30)');
      ctx.fillStyle='#94a3b8'; ctx.font='bold 13px monospace'; ctx.textAlign='center';
      ctx.fillText('?',ax,ay+5);
      const inbound=scouts.some(s=>s.target===a);
      ctx.fillStyle=inbound?'#67e8f9':'#64748b'; ctx.font='bold 8px monospace';
      ctx.fillText(inbound?'SCOUT INBOUND':'UNSURVEYED',ax,ay+r+22);
      continue;
    }
    // free-drifting clusters/hulks keep their rock/hulk bodies; attached
    // sites live on their world (drawn above), so no duplicate body here.
    if(!attached){
    // drop shadow (hard offset)
    px(ax-r+3,ay+r+5,r*2-6,5,'rgba(0,0,0,0.35)');
    if(kind==='belt'){
      // main rock + deterministic satellite chunks (varied silhouettes)
      pxBox(ax-r,ay-r,r*2,r*2,'#334155','#020617');
      px(ax-r+3,ay-r+3,r*2-6,r*2-6,'#475569');
      px(ax-r+6,ay-r+6,r*2-12,r*2-12,pal.dark);
      px(ax-r+6,ay-r+6,r*2-12,5,pal.light); // top light
      if(detailN) px(ax+r-10,ay+r-9,5,6,'#292524'); // notched bite
      const rot=driftTime*0.05, rc=Math.cos(rot), rs=Math.sin(rot);
      for(const c of a.chunks){
        const rdx=c.dx*rc-c.dy*rs, rdy=c.dx*rs+c.dy*rc;
        const cx2=ax+Math.round(rdx), cy2=ay+Math.round(rdy), s=c.s;
        if(c.sh===1) pxBox(cx2-s,cy2-Math.round(s*0.4),s*2,Math.max(2,Math.round(s*0.8)),pal.base,'#020617');
        else if(c.sh===2) pxBox(cx2-Math.round(s*0.4),cy2-s,Math.max(2,Math.round(s*0.8)),s*2,pal.base,'#020617');
        else if(c.sh===3){ pxBox(cx2-s,cy2-s,s*2,s,pal.base,'#020617'); pxBox(cx2-s,cy2-s,s,s*2,pal.base,'#020617'); }
        else pxBox(cx2-s,cy2-s,s*2,s*2,pal.base,'#020617');
        px(cx2-s,cy2-s,Math.min(s*2,6),1,pal.light);
        if(detailN && c.sh===0) px(cx2,cy2,2,2,pal.dark);
      }
      px(ax-4,ay-4,8,8,nodeColor); // core crystal on the main rock
      px(ax-4,ay-4,8,2,'rgba(255,255,255,0.7)');
      px(ax-r+8,ay+4,5,5,'#292524');
    } else if(kind==='planet'){
      // banded sphere + faint atmosphere rim
      px(ax-r-3,ay-r-3,r*2+6,r*2+6,'rgba(125,211,252,0.14)');
      pxBox(ax-r,ay-r,r*2,r*2,pal.dark,'#020617');
      px(ax-r+3,ay-r+3,r*2-6,r*2-6,pal.base);
      px(ax-r+3,ay-r+3,r*2-6,4,pal.light); // top light
      px(ax-r+4,ay-2,r*2-8,4,pal.band); // bands
      px(ax-r+4,ay+6,r*2-8,3,'rgba(0,0,0,0.28)');
      if(detailN){
        px(ax-8,ay+10,9,6,pal.light); px(ax-6,ay+11,5,3,pal.dark); // storm
        px(ax+r-9,ay-6,4,8,'rgba(0,0,0,0.25)'); // shadow side
      }
      px(ax-4,ay-4,8,8,nodeColor); // beacon crystal
      px(ax-4,ay-4,8,2,'rgba(255,255,255,0.7)');
      px(ax-r+8,ay+8,5,5,'rgba(0,0,0,0.30)');
    } else if(kind==='derelict'){
      // dead hulk: broken hull slabs + blinking distress light
      pxBox(ax-r,ay-r,r*2,r*2,'#1f2937','#020617');
      px(ax-r+3,ay-r+3,r*2-6,r*2-6,'#374151');
      px(ax-r+5,ay-3,r*2-10,5,'#4b5563'); // hull band
      px(ax-2,ay+r-8,4,6,'#111827'); // breach
      px(ax-r+6,ay+r-8,6,4,'#0f172a');
      if(Math.sin(nowS*3+ax)>0) px(ax-2,ay-r-6,4,4,'#fbbf24'); // distress blink
      else px(ax-2,ay-r-6,4,4,'#451a03');
      px(ax-4,ay-4,8,8,nodeColor); // salvage beacon
      px(ax-4,ay-4,8,2,'rgba(255,255,255,0.7)');
    } else {
      // moon: pale cratered sphere
      pxBox(ax-r,ay-r,r*2,r*2,'#334155','#020617');
      px(ax-r+3,ay-r+3,r*2-6,r*2-6,'#6b7280');
      px(ax-r+5,ay-r+5,r*2-10,r*2-10,pal.base);
      px(ax-r+5,ay-r+5,r*2-10,3,pal.light); // top light
      px(ax-3,ay-3,6,6,nodeColor); // core crystal
      px(ax-3,ay-3,6,2,'rgba(255,255,255,0.7)');
      // crater pixels
      px(ax-r+6,ay+2,4,4,'#4b5563');
      px(ax+2,ay+r-10,5,5,'#4b5563');
      px(ax-6,ay-8,3,3,'#6b7280');
    }
    } // end free-body rendering
    // cohesion markers: orbital infrastructure says "drones work here"
    // (attached sites already drew their platform above; wild bodies carry none)
    if(!attached){
    if(kind==='planet'){
      px(ax+r-8,ay-r-13,11,4,'#475569'); // mining platform
      px(ax+r-8,ay-r-13,11,1,'#94a3b8');
      px(ax+r-4,ay-r-17,3,4,'#1f2937'); // mast
      px(ax+r-4,ay-r-18,3,3,mblink?'#fbbf24':'#451a03'); // lamp
    } else if(kind==='moon'){
      px(ax-1,ay-r-9,2,7,'#64748b'); // beacon mast
      px(ax-2,ay-r-11,5,4,mblink?'#67e8f9':'#164e63'); // beacon
    } else if(kind==='belt'){
      pxBox(ax-r-2,ay-r-12,11,6,'#facc15','#020617'); // docked skiff
      px(ax-r-2,ay-r-12,11,1,'#fef9c3');
      px(ax+r-9,ay-r-11,3,3,mblink?'#f87171':'#450a0a');
    }
    } // end cohesion markers
    // LOD: at far zoom the system stays beautiful — no cloud of markers.
    // Danger always reads; economy detail needs proximity or selection.
    const farQ=cam.zoom<0.55;
    const dangerQ=(cs==='infected'||cs==='corrupted'||cs==='overrun');
    if(!farQ || dangerQ){
    ctx.fillStyle='#f8fafc'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
    ctx.fillText(nodeTag(a),ax,ay-r-10);
    }
    // M4: infection marks — specks → veins → pulsing aura.
    // Attached sites mark their WORLD (infection is about the planet).
    {
      const f=attached?nodeFocus(a):{x:ax,y:ay,r};
      const fx=snap(f.x), fy=snap(f.y), fr=Math.round(f.r);
    if(cs==='exposed'){ px(fx+fr-4,fy-fr+2,3,3,'#a855f7'); px(fx-fr+1,fy+fr-5,3,3,'#7c3aad'); }
    if(cs==='infected'){ px(fx-8,fy-1,16,2,'#a855f7'); px(fx-1,fy-8,2,16,'#7c3aad'); }
    if(cs==='corrupted'||cs==='overrun'){
      ctx.globalAlpha=0.35+0.25*Math.sin(nowS*4);
      const pr=fr+6+((nowS*14)%10);
      px(fx-pr,fy-pr,pr*2,2,'#c084fc'); px(fx-pr,fy+pr-2,pr*2,2,'#c084fc');
      px(fx-pr,fy-pr,2,pr*2,'#c084fc'); px(fx+pr-2,fy-pr,2,pr*2,'#c084fc');
      ctx.globalAlpha=1;
      if(cs==='overrun'&&Math.random()<0.4) px(fx+(Math.random()-0.5)*fr*2,fy+(Math.random()-0.5)*fr*2,3,3,'#f0abfc');
    }
    }
    const assignedCount=drones.filter(d=>d.targetAsteroid===a).length;
    if(assignedCount && (!farQ || dangerQ)){
      px(ax-r-5,ay-r-5,r*2+10,3,'#facc15');
      px(ax-r-5,ay+r+2,r*2+10,3,'#facc15');
      ctx.fillStyle='#facc15'; ctx.font='bold 8px monospace';
      ctx.fillText('DRONE x'+assignedCount,ax,ay-r-20);
    }
    // ore bar (chunky) + status: economy detail needs proximity; danger shouts far
    let label, labelColor=nodeColor;
    if(cs==='overrun'){ label='OVERRUN'; labelColor='#f0abfc'; }
    else if(cs==='corrupted'){ label='CORRUPTED'; labelColor='#fb7185'; }
    else if(cs==='infected'){ label='INFECTED'; labelColor='#c084fc'; }
    else label=mycBlocked?'SMOTHERED':a.unlocked?'LINKED':reachable?'SEND DRONE':needRelay?'NO ROUTE':'OFFLINE';
    const showLabel = !farQ || dangerQ || mycBlocked;
    if(showLabel){
    const orePct=Math.max(0,a.ore/a.maxOre);
    px(ax-r,ay+r+9,r*2,5,'#020617');
    px(ax-r+1,ay+r+10,(r*2-2)*orePct,3,nodeColor);
    ctx.fillStyle=labelColor; ctx.font='bold 8px monospace'; ctx.textAlign='center';
    ctx.fillText(label,ax,ay+r+26);
    } // end showLabel
  }
  // PIXEL station: chunky cross-shaped sprite
  {
    const sx=snap(CORE.x), sy=snap(CORE.y);
    const hurt=lives<=5;
    px(sx-22,sy+26,44,6,'rgba(0,0,0,0.35)');
    pxBox(sx-26,sy-10,52,20,hurt?'#7f1d1d':'#1e3a5f','#020617');
    pxBox(sx-10,sy-26,20,52,hurt?'#7f1d1d':'#1e3a5f','#020617');
    pxBox(sx-14,sy-14,28,28,hurt?'#991b1b':'#0c2740','#38bdf8');
    px(sx-8,sy-8,16,16,'#38bdf8');
    px(sx-8,sy-8,16,4,'#e0f2fe');
    px(sx-6,sy+16,12,6,'#facc15'); // engine glow
    px(sx-22,sy-4,6,8,'#7dd3fc'); px(sx+16,sy-4,6,8,'#7dd3fc'); // side pods
    for(let wn=0;wn<5;wn++) px(sx-18+wn*8,sy-2,4,4,'#fef9c3'); // lit windows
    const dockBlink=Math.sin(nowS*4)>0; // dock lights alternate
    px(sx-26,sy+8,3,3,dockBlink?'#4ade80':'#14532d');
    px(sx+23,sy+8,3,3,dockBlink?'#14532d':'#4ade80');
    px(sx-2,sy-36,4,10,'#e2e8f0'); px(sx-3,sy-40,6,5,'#facc15'); // antenna
    // TECH PROGRESSION: solar wings grow with Solar Array, lab crown with Research Lab
    for(let sw=0;sw<stationTech.solar;sw++){
      const wy=sy-14+sw*7, ww=10+sw*3;
      px(sx-26-ww,wy,ww,5,'#0c2740'); px(sx+26,wy,ww,5,'#0c2740');
      px(sx-26-ww,wy,ww,2,'#fef08a'); px(sx+26,wy,ww,2,'#fef08a');
    }
    if(stationTech.lab>0){
      const blink=Math.sin(performance.now()*0.004)>0;
      px(sx-6,sy-32,12,4,'#052e16');
      for(let lb=0;lb<stationTech.lab;lb++) px(sx-5+lb*2,sy-31,1,2,blink?'#86efac':'#166534');
      px(sx-2,sy-44,4,4,blink?'#bbf7d0':'#166534'); // lab beacon
    }
    // M8: Command Center deck lights + Navigation Array mast grow with tech
    if(stationTech.command>0){
      const blink2=Math.sin(performance.now()*0.005)>0;
      px(sx-10,sy+8,20,3,'#0c2740');
      for(let cb=0;cb<stationTech.command;cb++) px(sx-9+cb*4,sy+8,2,2,blink2?'#7dd3fc':'#0c4a6e');
    }
    if(stationTech.nav>0){
      const nl=stationTech.nav;
      px(sx+12,sy-30-nl*2,3,6+nl*2,'#0c2740');
      px(sx+12,sy-30-nl*2,3,6+nl*2,'rgba(196,181,253,0.5)');
      px(sx+10,sy-32-nl*2,7,3,'#ddd6fe'); // dish
      if(Math.sin(performance.now()*0.003)>0) px(sx+12,sy-34-nl*2,3,2,'#ffffff'); // ping
    }
    // Hangar growth: docking arms + bay lights grow with Hangar levels.
    // Subtle by design — the station stays tiny next to planets.
    {
      const hl=hangarLevels();
      for(let ha=0;ha<Math.min(6,hl);ha++){
        const side=ha%2===0?-1:1, row=Math.floor(ha/2);
        const ax2=sx+side*(20+row*3), ay2=sy+10-row*9;
        px(ax2-5,ay2-2,10,4,'#0c2740');
        px(ax2-5,ay2-2,10,1,'#94a3b8');
        if(Math.sin(nowS*3+ha*1.7)>0) px(ax2+side*4,ay2-1,2,2,'#facc15');
      }
    }
    if(myceliumAtWorld(sx,sy,CORE.r+8)){
      const bl=2+Math.floor(performance.now()/150)%2*2;
      pxBox(sx-30,sy-30,60,60,'rgba(168,85,247,0.15)','#a855f7');
      px(sx-30,sy-32-bl,60,4,'#f0abfc');
    }
    const pct=Math.max(0,lives/maxLives);
    const barC=pct<0.3?'#ef4444':pct<0.6?'#facc15':'#7ce67c';
    px(sx-26,sy+30,52,6,'#020617');
    px(sx-25,sy+31,50*pct,4,barC);
    ctx.fillStyle='#fff'; ctx.font='bold 9px monospace'; ctx.textAlign='center';
    ctx.fillText('STATION — CLICK FOR TECH', sx, sy+CORE.r+22);
    // CORE PURGE charge + discharge rings: the emergency you can SEE.
    if(purgeCharging>0){
      const chg=1-purgeCharging/2.2;
      for(let a=0;a<32;a++){
        if(a/32>chg) break;
        const aa=a/32*Math.PI*2;
        px(sx+Math.cos(aa)*(CORE.r+14)-2,sy+Math.sin(aa)*(CORE.r+14)-2,4,4,'#fef9c3');
      }
      px(sx-CORE.r-8,sy-CORE.r-8,(CORE.r+8)*2,3,'rgba(254,249,195,0.7)');
    }
    if(purgeFx){
      const f=purgeFx.t/purgeFx.dur;
      const rr=PURGE_RADIUS*f;
      ctx.globalAlpha=0.8*(1-f);
      for(let a=0;a<72;a++){
        const aa=a/72*Math.PI*2;
        px(sx+Math.cos(aa)*rr-2,sy+Math.sin(aa)*rr-2,4,4,f<0.4?'#ffffff':'#c084fc');
      }
      ctx.globalAlpha=1;
    }
  }
  // orbit rings: dotted pixel squares
  for(const t of towers) if(t.anchor){
    for(let a=0;a<24;a++){
      if(a%2) continue;
      const ang=a/24*Math.PI*2;
      px(t.anchor.obj.x+Math.cos(ang)*t.orbitR-1,t.anchor.obj.y+Math.sin(ang)*t.orbitR-1,2,2,'rgba(226,232,240,0.25)');
    }
  }
  // FORWARD OUTPOSTS: small industrial kin of the station — hub box, dock
  // arms, antenna with ping, warm windows, hp bar. Reads as "ours" at a glance.
  for(const o of outposts){
    const ox=snap(o.x), oy=snap(o.y);
    const hurt=o.hp<90;
    px(ox-16,oy+18,32,4,'rgba(0,0,0,0.35)');
    pxBox(ox-18,oy-8,36,16,hurt?'#7f1d1d':'#1e3a5f','#020617');
    pxBox(ox-7,oy-14,14,28,hurt?'#991b1b':'#0c2740','#38bdf8');
    px(ox-4,oy-8,8,8,'#38bdf8');
    px(ox-4,oy-8,8,2,'#e0f2fe');
    for(let wn=0;wn<3;wn++) px(ox-14+wn*10,oy+1,5,3,'#fef9c3'); // warm windows
    px(ox-24,oy-2,6,5,'#0c2740'); px(ox+18,oy-2,6,5,'#0c2740'); // dock arms
    const dockBlink=Math.sin(nowS*4+o.seed)>0;
    px(ox-24,oy-2,2,2,dockBlink?'#4ade80':'#14532d');
    px(ox+22,oy-2,2,2,dockBlink?'#14532d':'#4ade80');
    px(ox-1,oy-26,2,10,'#e2e8f0'); px(ox-2,oy-29,4,3,'#facc15'); // antenna
    if(Math.sin(nowS*3+o.seed)>0) px(ox-1,oy-31,2,2,'#ffffff'); // ping
    if(myceliumAtWorld(ox,oy,o.r+8)){
      pxBox(ox-24,oy-24,48,48,'rgba(168,85,247,0.15)','#a855f7');
    }
    const opct=Math.max(0,o.hp/o.maxHp);
    const obarC=opct<0.3?'#ef4444':opct<0.6?'#facc15':'#7ce67c';
    px(ox-20,oy+24,40,5,'#020617');
    px(ox-19,oy+25,38*opct,3,obarC);
    ctx.fillStyle=hurt?'#fca5a5':'#fff'; ctx.font='bold 9px monospace'; ctx.textAlign='center';
    ctx.fillText(o.name, ox, oy+o.r+18);
    if(cam.zoom>=0.8 && o.relayed>0){
      ctx.fillStyle='rgba(124,230,124,0.75)'; ctx.font='bold 8px monospace';
      ctx.fillText(`relayed ${Math.floor(o.relayed)}g`, ox, oy+o.r+30);
    }
  }
  // construction sites: the fleet on-site + rising frame + progress bar
  for(const c of constructions){
    const cx=c.phase==='travel'?snap(c.x):snap(c.tx), cy=c.phase==='travel'?snap(c.y):snap(c.ty);
    for(let s2=0;s2<3;s2++){
      const sa=c.seed+s2*Math.PI*2/3+nowS*0.8;
      const bx2=cx+Math.cos(sa)*14, by2=cy+Math.sin(sa)*14;
      px(bx2-3,by2-2,6,4,'#facc15');
      px(bx2-3,by2-2,6,1,'#fef9c3');
    }
    if(c.phase==='build'){
      const f=c.prog||0;
      pxBox(cx-16,cy-12,32,24,'rgba(30,58,95,0.85)','#020617');
      px(cx-16,cy+12-Math.round(24*f),32,Math.max(2,Math.round(24*f)),'#38bdf8'); // rising frame
      px(cx-22,cy+18,44,5,'#020617');
      px(cx-21,cy+19,42*f,3,'#facc15');
      ctx.fillStyle='#facc15'; ctx.font='bold 8px monospace'; ctx.textAlign='center';
      ctx.fillText('BUILDING '+Math.floor(f*100)+'%',cx,cy-20);
    } else {
      ctx.fillStyle='rgba(250,204,21,0.8)'; ctx.font='bold 8px monospace'; ctx.textAlign='center';
      ctx.fillText('CONSTRUCTION FLEET',cx,cy-20);
    }
  }
  // outpost survey ghost: relay radius + live site readout
  if(outpostPlacing && ghostPos && (state===STATE.PLAYING||state===STATE.PAUSED)){
    const gx=ghostPos.x, gy=ghostPos.y;
    ctx.globalAlpha=0.10;
    ctx.fillStyle='#7ce67c';
    ctx.fillRect(snap(gx-OUTPOST_RELAY),snap(gy-OUTPOST_RELAY),OUTPOST_RELAY*2,OUTPOST_RELAY*2);
    ctx.globalAlpha=1;
    ctx.fillStyle='rgba(124,230,124,0.6)';
    for(let a=0;a<36;a++){
      const aa=a/36*Math.PI*2;
      if(a%2) continue;
      px(gx+Math.cos(aa)*OUTPOST_RELAY-1,gy+Math.sin(aa)*OUTPOST_RELAY-1,2,2,'rgba(124,230,124,0.6)');
    }
    px(gx-3,gy-3,6,6,'#7ce67c');
    px(gx-1,gy-1,2,2,'#ffffff');
    const info=outpostSiteInfo(gx,gy);
    ctx.fillStyle='#fff'; ctx.font='bold 9px monospace'; ctx.textAlign='center';
    ctx.fillText(`OUTPOST SITE — ${info.near.length} world(s) in relay`,snap(gx),snap(gy)-OUTPOST_RELAY-12);
    ctx.fillStyle=info.cloud>30?'#f0abfc':'#7ce67c'; ctx.font='bold 8px monospace';
    ctx.fillText(info.cloud>30?'BLOOM: HEAVY — it will come for this ground':(info.cloud>0?'BLOOM: present':'BLOOM: clear'),snap(gx),snap(gy)-OUTPOST_RELAY-24);
  }
  // PIXEL drones: 11x7 chunky haulers with nav lights + mining rig
  for(const d of drones){    if(d.flash>0) d.flash-=0.016;
    const dx=snap(d.x), dy=snap(d.y);
    px(dx-5,dy+6,10,3,'rgba(0,0,0,0.3)');
    const body=d.flash>0?'#ffffff':(d.carrying?'#facc15':'#94a3b8');
    pxBox(dx-6,dy-4,12,8,body,'#020617');
    px(dx-6,dy-4,12,2,'rgba(255,255,255,0.6)');
    px(dx+4,dy-2,4,4,'#38bdf8'); // cockpit
    if(d.carrying) px(dx-4,dy-2,4,4,'#fde68a');
    // blinking nav light on the tail
    if(Math.sin(nowS*6+(d.wander||0)*3)>0) px(dx-8,dy-2,2,2,'#f87171');
    else px(dx-8,dy-2,2,2,'#450a0a');
    // mining rig: beam + fill pips while docked at a world
    const tgt=d.targetAsteroid;
    if(tgt && !d.carrying && Math.hypot(tgt.x-d.x,tgt.y-d.y) < tgt.r+14){
      for(let b=1;b<=3;b++){
        const bt=b/4;
        ctx.globalAlpha=0.8;
        px(d.x+(tgt.x-d.x)*bt-1,d.y+(tgt.y-d.y)*bt-1,2,2,'#fde68a');
      }
      ctx.globalAlpha=1;
      const emR=NODE_ECON[tgt.kind||'belt'];
      const fill=Math.min(1,(d.mineTimer||0)/(d.mThresh||emR.mine));
      px(dx-9,dy-14,18,3,'#020617');
      px(dx-8,dy-13,16*fill,1,'#facc15');
      if(Math.random()<0.25) px(tgt.x+(Math.random()-0.5)*12,tgt.y+(Math.random()-0.5)*12,2,2,'#fef9c3');
    }
    else if(Math.sin(nowS*30+d.x*0.1)>-0.2) px(dx-9,dy-1,3,2,'#fb923c'); // thrust flicker while underway
    if(d.inCloud){ // spores clinging to the hull — this lane is threatened
      if(Math.sin(nowS*8+d.x*0.2)>0) px(dx-8,dy-6,3,3,'#a855f7');
      px(dx+5,dy+2,2,2,'#6d28d9');
    }
    if(d.hp<d.maxHp){
      px(dx-10,dy-11,20,4,'#020617');
      px(dx-9,dy-10,18*(d.hp/d.maxHp),2,d.hp<10?'#ef4444':'#7ce67c');
    }
  }
  // M5: scout drones — small cyan diamonds with survey rig
  for(const s of scouts){
    const sx=snap(s.x), sy=snap(s.y);
    px(sx-4,sy+5,8,2,'rgba(0,0,0,0.3)');
    const dd=Math.sin(nowS*6+(s.wander||0))>0;
    pxBox(sx-5,sy-5,10,10,dd?'#22d3ee':'#0e7490','#020617');
    px(sx-2,sy-2,4,4,'#ecfeff');
    const tgt=s.target;
    if(tgt && s.mode==='survey'){
      for(let b=1;b<=3;b++){ const bt=b/4; ctx.globalAlpha=0.8; px(s.x+(tgt.x-s.x)*bt-1,s.y+(tgt.y-s.y)*bt-1,2,2,'#67e8f9'); }
      ctx.globalAlpha=1;
      const fill=Math.min(1,(s.surveyT||0)/2.0);
      px(sx-9,sy-13,18,3,'#020617');
      px(sx-8,sy-12,16*fill,1,'#67e8f9');
    }
  }
  // STRIKE WING fleet: tiny physical spacecraft, thrust + blink + guns
  for(const s of strikers){
    const sx=snap(s.x), sy=snap(s.y);
    const ang=Math.atan2(s.ty-s.y,s.tx-s.x);
    const fx=Math.cos(ang), fy=Math.sin(ang);
    if(Math.sin(nowS*30+s.seed*7)>0) px(sx-fx*8-1,sy-fy*8-1,3,2,'#fb923c'); // thrust
    px(sx-4,sy-3,8,6,'#0c2740');
    px(sx-4,sy-3,8,2,'#7dd3fc');
    px(sx+1,sy-1,3,3,'#e0f2fe'); // cockpit
    if(Math.sin(nowS*9+s.seed*3)>0) px(sx-5,sy-1,2,2,'#f87171'); // nav blink
    // life bar: these craft are borrowed time
    const lf=Math.max(0,s.life/STRIKE_LIFE);
    px(sx-6,sy-9,12,2,'#020617');
    px(sx-5,sy-8,10*lf,1,lf>0.4?'#7dd3fc':'#f87171');
  }
  // strike targeting: reticle + dashed route from the station
  if(strikeArming && ghostPos && (state===STATE.PLAYING||state===STATE.PAUSED)){
    const gx=ghostPos.x, gy=ghostPos.y;
    const pr=26+Math.sin(nowS*6)*3;
    ctx.fillStyle='rgba(125,211,252,0.85)';
    ctx.fillRect(snap(gx-pr),snap(gy)-1,10,2); ctx.fillRect(snap(gx+pr)-10,snap(gy)-1,10,2);
    ctx.fillRect(snap(gx)-1,snap(gy-pr),2,10); ctx.fillRect(snap(gx)-1,snap(gy+pr)-10,2,10);
    px(gx-2,gy-2,4,4,'#fef9c3');
    const dx=gx-CORE.x, dy=gy-CORE.y, dl=Math.hypot(dx,dy)||1;
    const steps=Math.floor(dl/26);
    ctx.globalAlpha=0.5;
    for(let s2=1;s2<steps;s2+=2){
      const t2=s2/steps;
      px(CORE.x+dx*t2-1,CORE.y+dy*t2-1,3,3,'#7dd3fc');
    }
    ctx.globalAlpha=1;
    ctx.fillStyle='#7dd3fc'; ctx.font='bold 9px monospace'; ctx.textAlign='center';
    ctx.fillText(`STRIKE ${Math.ceil(dl)}px — CLICK TO COMMIT`,snap(gx),snap(gy)-pr-10);
  }
  // ghost placement - snaps to orbit around anchor (station or linked asteroid)
  let ghostValid=false, ghostX=0,ghostY=0, ghostAnchor=null;
  if(placeType && ghostPos){
    const def=TOWER_DEFS.find(d=>d.id===placeType);
    if(def && !def.isDrone){
      const gx=ghostPos.x, gy=ghostPos.y;
      ghostAnchor=findNearestAnchor(gx,gy);
      if(ghostAnchor){
        const ang=Math.atan2(gy-ghostAnchor.obj.y,gx-ghostAnchor.obj.x);
        const r=ghostAnchor.type==='core'?38:ghostAnchor.obj.r+26;
        ghostX=ghostAnchor.obj.x+Math.cos(ang)*r;
        ghostY=ghostAnchor.obj.y+Math.sin(ang)*r;
        // preview orbit ring (dotted pixel squares, like placed towers)
        for(let a=0;a<24;a++){
          if(a%2) continue;
          const aa=a/24*Math.PI*2;
          px(ghostAnchor.obj.x+Math.cos(aa)*r-1,ghostAnchor.obj.y+Math.sin(aa)*r-1,2,2,'rgba(226,232,240,0.3)');
        }
        // anchor highlight
        px(ghostAnchor.obj.x-4,ghostAnchor.obj.y-4,8,8,'rgba(124,230,124,0.3)');
      } else {
        ghostX=gx; ghostY=gy;
      }
      const useX=ghostAnchor?ghostX:gx, useY=ghostAnchor?ghostY:gy;
      const coreDist = Math.hypot(CORE.x-useX,CORE.y-useY);
      let blockedByCreep=false;
      if(myceliumVisible() && myceliumAtWorld(useX,useY,16)) blockedByCreep=true;
      const pathOk = !blockedByCreep && !!ghostAnchor;
      ghostValid = !!ghostAnchor && !bloomLeashed(useX,useY) && pathOk && !towers.some(t=> Math.hypot(t.x-useX,t.y-useY)<22) && coins>=def.cost;
      // pixel range preview: stepped square ring
      const rr=def.range*(1+permBonus('range'));
      ctx.fillStyle=ghostValid?'rgba(124,230,124,0.07)':'rgba(239,68,68,0.07)';
      ctx.fillRect(snap(useX-rr),snap(useY-rr),rr*2,rr*2);
      ctx.fillStyle=ghostValid?'rgba(124,230,124,0.5)':'rgba(239,68,68,0.5)';
      for(let gx2=useX-rr;gx2<=useX+rr;gx2+=12){ ctx.fillRect(snap(gx2),snap(useY-rr),6,2); ctx.fillRect(snap(gx2),snap(useY+rr),6,2); }
      for(let gy2=useY-rr;gy2<=useY+rr;gy2+=12){ ctx.fillRect(snap(useX-rr),snap(gy2),2,6); ctx.fillRect(snap(useX+rr),snap(gy2),2,6); }
      ctx.globalAlpha=0.85;
      pxBox(snap(useX)-14,snap(useY)-14,28,28,ghostValid?def.color:'#4b5563','#020617');
      px(snap(useX)-14,snap(useY)-14,28,4,'rgba(255,255,255,0.5)');
      ctx.fillStyle='#fff'; ctx.font='bold 13px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(def.icon, snap(useX), snap(useY)+1);
      ctx.globalAlpha=1;
      if(!ghostValid){
        ctx.fillStyle='#ef4444';
        for(let k=-3;k<=3;k++){ ctx.fillRect(snap(useX)+k*3-1,snap(useY)+k*3-1,3,3); ctx.fillRect(snap(useX)+k*3-1,snap(useY)-k*3-1,3,3); }
      }
    }
  }
  if(!placeType && hoverPreview && ghostPos){
    const hd=TOWER_DEFS.find(d=>d.id===hoverPreview);
    if(hd && !hd.isDrone && !hd.isScout){
      const rr=hd.range*(1+permBonus('range'));
      const hw=screenToWorld(mouse.x,mouse.y);
      ctx.fillStyle=coins>=hd.cost?'rgba(124,230,124,0.05)':'rgba(239,68,68,0.05)';
      ctx.fillRect(snap(hw.x-rr),snap(hw.y-rr),rr*2,rr*2);
    }
  }
  // selected range (pixel corners)
  if(selectedTower){
    const st=towerStat(selectedTower);
    const sx=snap(selectedTower.x), sy=snap(selectedTower.y), rr=st.range;
    ctx.fillStyle='rgba(255,209,102,0.08)';
    ctx.fillRect(sx-rr,sy-rr,rr*2,rr*2);
    ctx.fillStyle='rgba(255,209,102,0.8)';
    const c=10;
    ctx.fillRect(sx-rr,sy-rr,c,3); ctx.fillRect(sx-rr,sy-rr,3,c);
    ctx.fillRect(sx+rr-c,sy-rr,c,3); ctx.fillRect(sx+rr-3,sy-rr,3,c);
    ctx.fillRect(sx-rr,sy+rr-3,c,3); ctx.fillRect(sx-rr,sy+rr-c,3,c);
    ctx.fillRect(sx+rr-c,sy+rr-3,c,3); ctx.fillRect(sx+rr-3,sy+rr-c,3,c);
  }
  // PIXEL towers: chunky bunkers with stepped barrels
  for(const t of towers){
    const tx=snap(t.x), ty=snap(t.y);
    px(tx-13,ty+13,26,4,'rgba(0,0,0,0.35)');
    const trim=t===selectedTower?'#facc15':(t.branch==='power'||t.branch==='throughput'?'#ff8a2e':t.branch==='precision'||t.branch==='range'?'#7dd3fc':t.color);
    pxBox(tx-14,ty-14,28,28,'#1a2a33',trim);
    px(tx-14,ty-14,28,5,'rgba(255,255,255,0.18)');
    px(tx-14,ty+9,28,5,'rgba(0,0,0,0.35)');
    if(t.branch){
      const bWarm=t.branch==='power'||t.branch==='throughput';
      const bTxt=t.branch==='power'?'POW':t.branch==='precision'?'PRE':t.branch==='throughput'?'THP':'RNG';
      ctx.fillStyle=bWarm?'#ff8a2e':'#7dd3fc'; ctx.font='bold 8px monospace'; ctx.textAlign='center';
      ctx.fillText(bTxt, tx, ty-18);
    }
    for(let i=0;i<t.level;i++){
      px(tx-11+i*5,ty+15,4,4,i===t.level-1?'#ffd166':'#7ce67c');
    }
    // barrel: stepped in 8 directions
    const dirs=8, di=Math.round(((t.angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/(Math.PI*2)*dirs)%dirs;
    const bx=[1,1,0,-1,-1,-1,0,1][di], by=[0,1,1,1,0,-1,-1,-1][di];
    px(tx+bx*8-3,ty+by*8-3,12,6,t.color);
    px(tx+bx*8-3,ty+by*8-3,12,2,'rgba(255,255,255,0.55)');
    px(tx-7,ty-7,14,14,'rgba(0,0,0,0.45)');
    ctx.fillStyle='#fff'; ctx.font='bold 12px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(t.icon, tx, ty+1);
  }
  // PIXEL drone tethers: dotted lanes + square packets
  for(const d of drones){
    const target=d.targetAsteroid;
    if(!target) continue;
    const route=getAsteroidRoute(target);
    const waypoint=route[Math.min(d.routeIndex||0,Math.max(0,route.length-1))]||target;
    let prev={x:CORE.x,y:CORE.y};
    for(const node of route){
      const steps=Math.floor(Math.hypot(node.x-prev.x,node.y-prev.y)/14);
      for(let s=0;s<=steps;s+=2){
        const t2=s/Math.max(1,steps);
        px(prev.x+(node.x-prev.x)*t2-1,prev.y+(node.y-prev.y)*t2-1,3,3,'rgba(250,204,21,0.5)');
      }
      prev=node;
    }
    // cargo goes home to the station — or to the nearer outpost relay
    let homeX=CORE.x, homeY=CORE.y;
    if(d.carrying && d.deliverOut && d.deliverOut.hp>0){ homeX=d.deliverOut.x; homeY=d.deliverOut.y; }
    if(d.carrying){
      const t = (performance.now()*0.001 + d.x*0.005) % 1;
      px(d.x+(homeX-d.x)*t-2,d.y+(homeY-d.y)*t-2,5,5,'#fde68a');
    } else {
      const t = (performance.now()*0.0012) % 1;
      px(CORE.x+(waypoint.x-CORE.x)*t-1,CORE.y+(waypoint.y-CORE.y)*t-1,3,3,'rgba(148,163,184,0.7)');
    }
  }
  // PIXEL projectiles: chunky bolts, no glow
  for(const p of projectiles){
    for(let i=0;i<p.trail.length;i++){
      ctx.globalAlpha=(i+1)/p.trail.length*0.4;
      px(snap(p.trail[i].x)-1,snap(p.trail[i].y)-1,3,3,p.color);
    }
    ctx.globalAlpha=1;
    const pxx=snap(p.x), pyy=snap(p.y);
    if(p.splash){
      pxBox(pxx-5,pyy-5,10,10,p.color,'#7c2d12');
      px(pxx-2,pyy-2,4,4,'#fff');
    } else if(p.slow){
      px(pxx-6,pyy-2,12,4,p.color);
      px(pxx-2,pyy-2,4,4,'#e0f2fe');
    } else if(p.chain){
      px(pxx-6,pyy-1,12,3,p.color);
      px(pxx-1,pyy-4,3,8,'#fff');
    } else if(p.pierce){
      px(pxx-8,pyy-2,16,4,p.color);
      px(pxx+3,pyy-2,4,4,'#fff');
    } else {
      px(pxx-6,pyy-2,12,4,p.color);
      px(pxx+2,pyy-2,4,4,'#fff');
    }
  }
  // PIXEL particles: squares
  for(const pa of particles){
    ctx.globalAlpha=Math.max(0, pa.life/0.6);
    const s=Math.max(2,Math.round(pa.r));
    px(snap(pa.x)-s/2,snap(pa.y)-s/2,s,s,pa.color);
  }
  ctx.globalAlpha=1;
  for(const d of damageNumbers){
    ctx.globalAlpha=Math.max(0,d.life/0.7);
    ctx.fillStyle='#020617'; ctx.font='bold 13px monospace'; ctx.textAlign='center';
    ctx.fillText(d.val, snap(d.x)+1,snap(d.y)+1);
    ctx.fillStyle=d.color||'#fff';
    ctx.fillText(d.val, snap(d.x),snap(d.y));
  }
  ctx.globalAlpha=1;
  // screen-space edge language: breach alarm, sighting/wake flashes, heart compass
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if((state===STATE.PLAYING||state===STATE.PAUSED) && mycNearStation){
    const va=0.22+0.12*Math.sin(performance.now()*0.006);
    ctx.fillStyle=`rgba(239,68,68,${va.toFixed(3)})`;
    const vb=10;
    ctx.fillRect(0,0,W,vb); ctx.fillRect(0,H-vb,W,vb); ctx.fillRect(0,0,vb,H); ctx.fillRect(W-vb,0,vb,H);
  }
  if((state===STATE.PLAYING||state===STATE.PAUSED) && (sightingFlash>0 || wakeFlash>0)){
    const fa=Math.max(sightingFlash, wakeFlash);
    ctx.fillStyle=`rgba(168,85,247,${(0.30*fa).toFixed(3)})`;
    const fb=14;
    ctx.fillRect(0,0,W,fb); ctx.fillRect(0,H-fb,W,fb); ctx.fillRect(0,0,fb,H); ctx.fillRect(W-fb,0,fb,H);
  }
  if((state===STATE.PLAYING||state===STATE.PAUSED) && (hearts.length||cores.length)){
    // heart compass: a faint pull toward the nearest off-screen heart.
    // no words, just "something is out there." Cores pull harder (purple).
    const vc=viewCenter();
    let nh=null, nd=1e18, isCore=false;
    for(const h of hearts){
      const d=Math.hypot(h.x-vc.x,h.y-vc.y);
      if(d<nd){ nd=d; nh=h; isCore=false; }
    }
    for(const c of cores){
      const d=Math.hypot(c.x-vc.x,c.y-vc.y)*0.7; // cores loom larger
      if(d<nd){ nd=d; nh=c; isCore=true; }
    }
    if(nh){
      const s=worldToScreen(nh.x,nh.y);
      if(s.x<-20||s.x>W+20||s.y<-20||s.y>H+20){
        const ga=0.06+0.05*Math.sin(performance.now()*0.0025+nh.seed);
        ctx.fillStyle=isCore?`rgba(192,132,252,${(ga+0.04).toFixed(3)})`:`rgba(251,113,133,${ga.toFixed(3)})`;
        const gw=26, gh=8;
        if(s.x<0) ctx.fillRect(0,H/2-gh/2,gw,gh);
        if(s.x>W) ctx.fillRect(W-gw,H/2-gh/2,gw,gh);
        if(s.y<0) ctx.fillRect(W/2-gw/2,0,gw,gh);
        if(s.y>H) ctx.fillRect(W/2-gw/2,H-gh,gw,gh);
      }
    }
  }
  ctx.restore();
}

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min(0.033, (now-last)/1000); last=now;
  if(state===STATE.PLAYING) update(dt);
  render();
  updateUI();
}
requestAnimationFrame(loop);

// UI wiring
document.getElementById('playBtn').onclick=()=>{ resetRun(); setState(STATE.PLAYING); ensureAudio(); };
document.getElementById('howToPlayBtn').onclick=()=> setState(STATE.HOWTO);
document.getElementById('backBtn').onclick=()=> setState(STATE.MENU);
document.getElementById('shopBackBtn').onclick=()=> setState(STATE.MENU);
document.getElementById('restartBtn').onclick=()=>{ resetRun(); setState(STATE.PLAYING); };
document.getElementById('endlessBtn').onclick=()=>{ endless=true; setState(STATE.PLAYING); ensureAudio(); endlessBloom(); };
document.getElementById('toUpgradesBtn').onclick=()=> setState(STATE.SHOP);
document.getElementById('menuBtn').onclick=()=> setState(STATE.MENU);
document.getElementById('stageMenuBtn').onclick=()=> setState(STATE.MENU);
document.getElementById('stageWarpBtn').onclick=()=> openWarpScreen();
document.getElementById('libEndlessBtn').onclick=()=>{ endless=true; setState(STATE.PLAYING); ensureAudio(); endlessBloom(); };
document.getElementById('warpBackBtn').onclick=()=> setState(warpReturn);
document.getElementById('pauseBtn').onclick=()=>{ if(state===STATE.PLAYING) setState(STATE.PAUSED); };
document.getElementById('resumeBtn').onclick=()=> setState(STATE.PLAYING);
let abandonArmed=false;
document.getElementById('pauseToMenuBtn').onclick=(e)=>{
  const btn=e.target;
  if(!abandonArmed){
    abandonArmed=true;
    btn.textContent='SURE? CLICK AGAIN TO ABANDON';
    setTimeout(()=>{ abandonArmed=false; btn.textContent='ABANDON RUN'; }, 3000);
    return;
  }
  abandonArmed=false; btn.textContent='ABANDON RUN';
  setState(STATE.MENU);
};
const warpBtnEl=document.getElementById('warpBtn');
if(warpBtnEl) warpBtnEl.onclick=()=>openWarpScreen();
const purgeBtnEl=document.getElementById('purgeDial');
if(purgeBtnEl) purgeBtnEl.onclick=()=>{ ensureAudio(); buyCorePurge(); };
const strikeBtnEl=document.getElementById('strikeDial');
if(strikeBtnEl) strikeBtnEl.onclick=()=>{ ensureAudio(); armStrike(); updateBuildBar(); };
document.getElementById('speedBtn').onclick=()=>{
  speedMult = speedMult===1?1.8: speedMult===1.8?2.6:1;
  document.getElementById('speedBtn').textContent='\u00D7'+speedMult;
};
function dismissTut(){
  const tut=document.getElementById('tutorialHint');
  const bb=document.getElementById('buildBar');
  if(tut) tut.classList.add('hidden');
  if(bb) bb.classList.remove('tut-highlight');
  localStorage.setItem('atd_tutDone','1');
}
const tutBtn=document.getElementById('tutDismiss');
if(tutBtn) tutBtn.onclick=dismissTut;
function toggleBar(){
  const bar=document.getElementById('buildBar');
  if(!bar || (state!==STATE.PLAYING && state!==STATE.PAUSED)) return;
  bar.classList.toggle('minimized');
  const t=document.getElementById('barToggle');
  if(t){ const min=bar.classList.contains('minimized'); t.textContent=min?'+':'–'; t.title=min?'Show build bar (B)':'Hide build bar (B)'; }
}
const barToggleEl=document.getElementById('barToggle');
if(barToggleEl) barToggleEl.onclick=()=>toggleBar();
const logToggle=document.getElementById('logToggle');
if(logToggle) logToggle.onclick=()=>{
  const wrap=document.getElementById('eventLogWrap');
  if(!wrap) return;
  wrap.classList.toggle('collapsed');
  logToggle.textContent=wrap.classList.contains('collapsed')?'+':'–';
};

// initial
setState(STATE.MENU);
updateBuildBar();
updateUI();

// expose for test
window._game={resetRun, getState:()=>state, STATE, getCoins:()=>coins, getLives:()=>lives, getWave:()=>wave,
  getMass:()=>mycCells.size, getPurge:()=>purgeTotal, getPurgeGoal:()=>purgeGoal, damageAt:damageMyceliumAt, infect:infectCell,
  getHearts:()=>hearts.length, getPods:()=>pods.length, getCam:()=>({x:cam.x,y:cam.y,zoom:cam.zoom}),
  getNodes:()=>asteroids.map(a=>({kind:nodeKind(a),name:nodeName(a),corr:nodeCorruption(a),surv:!!a.surveyed,g:NODE_ECON[a.kind||'belt'].yield,x:Math.round(a.x),y:Math.round(a.y),r:Math.round(a.r),ore:a.maxOre})),
  getScouts:()=>scouts.length, getUnsurveyed:()=>asteroids.filter(a=>!a.surveyed).length,
  getStar:()=>star, getPlanets:()=>planets, getBelt:()=>beltRocks, updateSolar:updateSolarSystem,
  getClusters:()=>clusters.length, getCores:()=>cores.length, getTendrils:()=>tendrils.length, purge:buyCorePurge, getPurgeCd:()=>purgeCd, purgeUnlocked,
  getOutposts:()=>outposts.map(o=>({name:o.name,x:Math.round(o.x),y:Math.round(o.y),hp:Math.round(o.hp),relayed:Math.floor(o.relayed)})), outpostUnlocked};