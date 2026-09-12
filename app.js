import { api, getUserId, submitWaitlist } from './api.js';

const BUILDER_ID = getUserId();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const STORAGE = 'zorta-builder-v4';
const WALL_STORAGE = 'zorta-wall-v2';
const COLORS = ['#8b5cf6','#a855f7','#d946ef','#f0abfc','#67e8f9','#22d3ee','#f8fafc','#17121f','#ef4444','#f59e0b','#22c55e','#3b82f6'];
const GAMES = [
  {name:'Ship It', cta:'SHIP ↗', desc:'Ship the feature request before the deploy window closes.', duration:30},
  {name:'Recall the Stack', cta:'RECALL ↗', desc:'Remember the build history and reconstruct the sequence.', duration:45},
  {name:'Pitch Sprint', cta:'PITCH ↗', desc:"Type the founder's words before the opportunity disappears.", duration:45},
  {name:'Spot the Bug', cta:'DEBUG ↗', desc:'Catch the one signal that breaks the pattern.', duration:40},
  {name:'Hit the Deadline', cta:'DEPLOY ↗', desc:'Submit inside the shrinking deploy window.', duration:35},
  {name:'Find the Real One', cta:'VERIFY ↗', desc:'Identify the verified opportunity hiding among decoys.', duration:40}
];
const RANKS = [
  {name:'Curious Builder', min:0}, {name:'Contributor', min:150}, {name:'Shipper', min:400}, {name:'Founder', min:900}, {name:'Legend', min:1800}
];
const defaultState = {rep:0,coins:0,streak:0,lastDay:'',best:{},plays:0,level:1,rank:'Curious Builder',daily:{}};
let state = loadState();
let profileOnline = false;
let boardMode = 'weekly';
let wallOnline = false;
let selectedColor = 0;
let lastPlace = Number(localStorage.getItem('zorta-place-v2') || 0);
let gameTimer = null;
let gameEnds = 0;
let gameFinished = false;
let activeGame = -1;
let gameCleanup = [];

function loadState(){ try { return {...defaultState, ...JSON.parse(localStorage.getItem(STORAGE)||'{}')}; } catch { return {...defaultState}; } }
function saveState(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
function dayKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function previousDay(k){ const d=new Date(`${k}T12:00:00`); d.setDate(d.getDate()-1); return dayKey(d); }
function rankFor(rep){ let current=RANKS[0], next=null; for(let i=0;i<RANKS.length;i++){ if(rep>=RANKS[i].min){current=RANKS[i]; next=RANKS[i+1]||null;} } return {current,next,level:RANKS.indexOf(current)+1}; }
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message){ const el=$('#toast'); if(!el)return; el.textContent=message; el.classList.add('show'); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('show'),2600); }
function setStatus(text, kind=''){ const el=$('#canvasStatus') || $('.canvasbox .notice'); if(el){el.textContent=text;el.className=`notice ${kind}`;} }

async function loadProfile(){
  const result=await api(`/api/profile?userId=${encodeURIComponent(BUILDER_ID)}`);
  if(result?.ok && result.profile){
    profileOnline=true;
    state={...state,...result.profile,best:{...state.best,...(result.profile.best||{})},daily:{...state.daily,...(result.profile.daily||{})}};
    saveState();
  }
  renderProfile();
}

function renderProfile(){
  const r=rankFor(Number(state.rep)||0); state.level=r.level; state.rank=r.current.name;
  const next=r.next;
  $('#rank') && ($('#rank').textContent=r.current.name);
  if($('#rep')) $('#rep').textContent=Number(state.rep)||0;
  if($('#coins')) $('#coins').textContent=Number(state.coins)||0;
  if($('#streak')) $('#streak').textContent=Number(state.streak)||0;
  if($('#level')) $('#level').textContent=`LV ${r.level}`;
  const bar=$('#rankbar');
  if(bar) bar.style.width=next?`${Math.min(100,((state.rep-r.current.min)/(next.min-r.current.min))*100)}%`:'100%';
  const msg=$('#streakmsg');
  if(msg) msg.textContent=state.streak>0?`${state.streak}-day Build Streak · ${next?`${Math.max(0,next.min-state.rep)} REP to ${next.name}`:'LEGEND STATUS'}`:'Build today to start your Build Streak.';
  $('#reset') && updateReset();
  $$('.best').forEach(el=>{const game=el.dataset.game; if(game) el.textContent=`BEST · ${Number(state.best[game]||0)} REP`;});
}
function updateReset(){ const n=new Date(), t=new Date(n); t.setHours(24,0,0,0); const s=Math.max(0,(t-n)/1000); const el=$('#reset'); if(el)el.textContent=[s/3600,s/60%60,s%60].map(x=>String(Math.floor(x)).padStart(2,'0')).join(':'); }
setInterval(updateReset,1000);

const SCORE_QUEUE='zorta-score-queue-v1';
function readScoreQueue(){try{return JSON.parse(localStorage.getItem(SCORE_QUEUE)||'[]');}catch{return [];}}
function writeScoreQueue(q){localStorage.setItem(SCORE_QUEUE,JSON.stringify(q.slice(-50)));}
async function flushScoreQueue(){
  const queue=readScoreQueue(); if(!queue.length)return; const remaining=[];
  for(const payload of queue){
    const result=await api('/api/score',{method:'POST',body:JSON.stringify(payload),timeoutMs:6000});
    if(result?.ok&&result.profile){state={...state,...result.profile,best:{...state.best,...(result.profile.best||{})}};saveState();}
    else remaining.push(payload);
  }
  writeScoreQueue(remaining); renderProfile();
}
window.addEventListener('online',flushScoreQueue);

async function recordScore(points, game, reason='game', eventId=crypto.randomUUID(), dailyType=''){
  points=Math.max(0,Math.floor(Number(points)||0)); if(!points)return null;
  const day=dayKey();
  const payload={userId:BUILDER_ID,displayName:`Builder #${BUILDER_ID.slice(-4)}`,reputationDelta:points,source:String(game||reason).slice(0,80),eventId,dayKey:day,bestScore:points,playsIncrement:1,...(dailyType?{dailyKey:`${day}:${dailyType}`}:{})};
  const result=await api('/api/score',{method:'POST',body:JSON.stringify(payload),timeoutMs:8000});
  if(result?.ok && result.profile){
    profileOnline=true; state={...state,...result.profile,best:{...state.best,...(result.profile.best||{})}}; saveState(); renderProfile(); return result.profile;
  }
  // Offline: retain local progress and queue the exact event for a later retry. It is never presented as live server state.
  const queue=readScoreQueue(); if(!queue.some(x=>x.eventId===eventId)){queue.push(payload);writeScoreQueue(queue);}
  const r=rankFor(state.rep);
  state.rep+=points; state.coins+=Math.max(1,Math.floor(points/5)); state.plays=(state.plays||0)+1; state.best[game]=Math.max(state.best[game]||0,points);
  if(state.lastDay!==day){state.streak=state.lastDay===previousDay(day)?state.streak+1:1;state.lastDay=day;}
  state.level=rankFor(state.rep).level; state.rank=rankFor(state.rep).current.name; saveState(); renderProfile();
  return null;
}

function renderGames(){
  const wrap=$('#games'); if(!wrap)return;
  wrap.innerHTML=GAMES.map((g,i)=>`<article class="card game-card"><div class="eyebrow">BUILD ${String(i+1).padStart(2,'0')}</div><h3>${g.name}</h3><div class="preview" data-preview="${i}" aria-hidden="true"></div><div class="desc">${g.desc}</div><div class="best" data-game="${g.name}">BEST · ${Number(state.best[g.name]||0)} REP</div><button class="buildbtn" data-game-index="${i}">${g.cta}</button></article>`).join('');
  $$('.game-card .buildbtn').forEach(b=>b.addEventListener('click',()=>openGame(Number(b.dataset.gameIndex))));
  $$('.preview').forEach(c=>previewLoop(c,Number(c.dataset.preview)));
}
function previewLoop(c,kind){
  const ctx=c.getContext?.('2d'); if(!ctx)return; let raf;
  function resize(){const r=c.getBoundingClientRect(),d=devicePixelRatio||1;c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d);ctx.setTransform(d,0,0,d,0,0);}
  resize(); addEventListener('resize',resize);
  const f=t=>{const w=c.clientWidth,h=c.clientHeight;ctx.clearRect(0,0,w,h);ctx.fillStyle='#101212';ctx.fillRect(0,0,w,h);ctx.fillStyle='#d9ff3f';ctx.strokeStyle='#353936';
    if(kind===0){const x=w/2+Math.cos(t/500)*w*.3,y=h/2+Math.sin(t/650)*h*.2;ctx.beginPath();ctx.arc(x,y,10+4*Math.sin(t/100),0,7);ctx.fill();}
    if(kind===1){for(let i=0;i<9;i++){const x=(i%3)*w/3+w/6,y=Math.floor(i/3)*h/3+h/6;ctx.strokeRect(x-w*.1,y-h*.14,w*.2,h*.28);}const i=Math.floor(t/330)%9;ctx.fillRect((i%3)*w/3+w*.39,Math.floor(i/3)*h/3+h*.36,w*.22,h*.28);}
    if(kind===2){ctx.font='700 22px Space Grotesk';ctx.fillText('ship',w*.2,h*.55);ctx.fillStyle='#5b605b';ctx.font='12px DM Mono';ctx.fillText('build',w*.6,h*.4);ctx.fillText('merge',w*.55,h*.7);}
    if(kind===3){for(let i=0;i<16;i++){const x=(i%4)*w/4+w/8,y=Math.floor(i/4)*h/4+h/8;ctx.strokeRect(x-16,y-16,32,32);if(i!==11){ctx.fillStyle='#d9ff3f';ctx.font='700 12px Space Grotesk';ctx.fillText((i*3)%9+1,x-4,y+4);ctx.fillStyle='#d9ff3f';}}}
    if(kind===4){const p=(t%700)/700;ctx.beginPath();ctx.arc(w/2,h/2,10+p*40,0,7);ctx.stroke();ctx.beginPath();ctx.arc(w/2,h/2,8,0,7);ctx.fill();}
    if(kind===5){for(let i=0;i<18;i++){ctx.fillStyle=i===7?'#d9ff3f':'#555a55';ctx.font=i===7?'700 19px Space Grotesk':'13px Space Grotesk';ctx.fillText(i===7?'Z':'N',(i*47+t/8)%w,(i*29)%h);}}
    raf=requestAnimationFrame(f);
  }; raf=requestAnimationFrame(f);
  gameCleanup.push(()=>{cancelAnimationFrame(raf);removeEventListener('resize',resize);});
}

function startTimer(i){ stopTimer(); gameFinished=false; gameEnds=Date.now()+GAMES[i].duration*1000; const el=$('#gameTimer'),label=$('#gameTimerLabel'); if(label)label.textContent=i===0?'SPRINT TIMER':i===4?'DEPLOY WINDOW':'BUILD WINDOW';
  const tick=()=>{const left=Math.max(0,(gameEnds-Date.now())/1000); if(el)el.textContent=`00:${String(Math.ceil(left)).padStart(2,'0')}`; if(left<=10&&el)el.classList.add('warn'); if(left<=0){stopTimer();if(!gameFinished)endGame(0,'TIME EXPIRED');}}; tick();gameTimer=setInterval(tick,100);
}
function stopTimer(){if(gameTimer){clearInterval(gameTimer);gameTimer=null;} }
function cleanupGame(){stopTimer();gameCleanup.splice(0).forEach(fn=>{try{fn();}catch{}});}
function openGame(i){cleanupGame();activeGame=i;gameFinished=false;const m=$('#modal'),stage=$('#mstage'),foot=$('#mfoot');m.classList.remove('hidden');$('#mtitle').textContent=GAMES[i].name;stage.innerHTML='<div class="count">3</div>';foot.innerHTML='<p class="notice">Get ready…</p>';let n=3;const id=setInterval(()=>{n--;const count=stage.querySelector('.count');if(count)count.textContent=n||'BUILD';if(n<=0){clearInterval(id);startTimer(i);startGame(i);}},600);gameCleanup.push(()=>clearInterval(id));}
function closeGame(){cleanupGame();activeGame=-1;$('#modal')?.classList.add('hidden');}
window.closeGame=closeGame;
function endGame(score,reason='SHIPPED'){
  if(gameFinished)return;gameFinished=true;const i=activeGame;if(i<0)return;cleanupGame();const name=GAMES[i].name; const safeScore=Math.max(0,Math.floor(score));
  const stage=$('#mstage'),foot=$('#mfoot');stage.innerHTML=`<div class="result"><div class="eyebrow">${escapeHtml(reason)}</div><div class="big">+${safeScore}</div><p>REPUTATION / BUILD POINTS</p><p id="resultSync">SAVING BUILD…</p></div>`;
  foot.innerHTML=`<div class="gamecontrols"><button class="btn primary" id="rebuild">REBUILD ↗</button><button class="btn" id="done">BACK TO ARCADE</button></div>`;
  $('#rebuild').onclick=()=>openGame(i);$('#done').onclick=closeGame;
  recordScore(safeScore,name,reason).then(profile=>{$('#resultSync').textContent=profile?'BUILD RECORDED · LIVE PROFILE UPDATED':'SAVED LOCALLY · SERVER UNAVAILABLE';});
}
window.openGame=openGame;

function startGame(i){const stage=$('#mstage'),foot=$('#mfoot');stage.innerHTML='';
  if(i===0){let score=0,round=0;const spawn=()=>{if(gameFinished)return;round++;stage.innerHTML='<button class="target" aria-label="Ship feature"></button>';const t=stage.querySelector('.target'),b=stage.getBoundingClientRect();t.style.left=Math.max(0,Math.random()*(b.width-70))+'px';t.style.top=Math.max(0,Math.random()*(b.height-80))+'px';const delay=Math.max(300,1100-round*35);const timeout=setTimeout(()=>{if(!gameFinished&&stage.contains(t))spawn();},delay);gameCleanup.push(()=>clearTimeout(timeout));t.onclick=()=>{score+=10+round;spawn();};};spawn();foot.innerHTML='<p class="notice">Ship each request before the window closes. Faster chains raise the difficulty.</p>';}
  else if(i===1){let seq=[],input=[],level=0,score=0,showing=false;const round=()=>{if(gameFinished)return;input=[];seq.push(Math.floor(Math.random()*9));level++;showing=true;stage.innerHTML=`<div class="logic" id="mem">${Array.from({length:9},(_,x)=>`<button data-x="${x}">${x+1}</button>`).join('')}</div>`;seq.forEach((x,k)=>setTimeout(()=>stage.querySelector(`[data-x="${x}"]`)?.classList.add('selected'),k*300));const reveal=setTimeout(()=>{stage.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));showing=false;},seq.length*300+300);gameCleanup.push(()=>clearTimeout(reveal));stage.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(showing||gameFinished)return;const x=Number(b.dataset.x);if(x!==seq[input.length]){endGame(score,'REVERTED');return;}b.classList.add('selected');input.push(x);if(input.length===seq.length){score+=20+level*3;setTimeout(round,250);}});};round();foot.innerHTML='<p class="notice">Watch the sequence. One wrong pad ends the run.</p>';}
  else if(i===2){let score=0,round=0;const words=['SHIP','BUILD','MERGE','CRAFT','NETWORK','DEPLOY','ZORTA'];const next=()=>{if(gameFinished)return;if(round>=10){endGame(score,'SHIPPED');return;}round++;const word=words[Math.floor(Math.random()*words.length)];stage.innerHTML=`<div class="center"><div class="eyebrow">PITCH SPRINT · ROUND ${round}</div><div class="pitch-word">${word}</div><input id="type" autocomplete="off" aria-label="Type the displayed word"></div>`;const inp=$('#type',stage);inp.focus();inp.oninput=()=>{if(inp.value.toUpperCase()===word){score+=10+round*2;next();}};};next();foot.innerHTML='<p class="notice">Type the displayed word before the next signal arrives.</p>';}
  else if(i===3){let score=0,round=0;const bug=()=>{if(gameFinished)return;round++;if(round>9){endGame(score,'SHIPPED');return;}const good=Math.floor(Math.random()*16);stage.innerHTML=`<div class="logic" style="max-width:520px">${Array.from({length:16},(_,x)=>`<button data-x="${x}">${x===good?'△':'○'}</button>`).join('')}</div>`;stage.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(Number(b.dataset.x)===good){score+=12+round;bug();}else endGame(score,'REVERTED');});};bug();foot.innerHTML='<p class="notice">Find the one signal that breaks the pattern. Decoys multiply.</p>';}
  else if(i===4){let score=0,round=0;const beat=()=>{if(gameFinished)return;round++;const started=performance.now(),windowMs=Math.max(350,1150-round*70);stage.innerHTML=`<div class="center"><div class="eyebrow">DEPLOY WINDOW · ROUND ${round}</div><div id="bar" class="meter deadline"><i></i></div><button id="submit" class="btn primary" style="margin-top:25px">SUBMIT BUILD</button></div>`;let raf;const tick=t=>{const p=Math.min(1,(t-started)/windowMs);const fill=stage.querySelector('#bar i');if(fill)fill.style.width=p*100+'%';if(p<1&&!gameFinished)raf=requestAnimationFrame(tick);else if(!gameFinished)endGame(score,'SESSION CLOSED');};raf=requestAnimationFrame(tick);gameCleanup.push(()=>cancelAnimationFrame(raf));stage.querySelector('#submit').onclick=()=>{score+=20+round*3;beat();};};beat();foot.innerHTML='<p class="notice">Submit inside the shrinking deploy window.</p>';}
  else {let score=0,round=0;const cards=()=>{if(gameFinished)return;round++;if(round>8){endGame(score,'SHIPPED');return;}const real=Math.floor(Math.random()*6);stage.innerHTML=`<div class="opportunity-grid">${Array.from({length:6},(_,x)=>`<button class="opportunity" data-x="${x}"><b>${x===real?'VERIFIED':'OPPORTUNITY'}</b><small>BUILD #${Math.floor(Math.random()*900+100)}</small></button>`).join('')}</div>`;stage.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(Number(b.dataset.x)===real){score+=15+round*3;cards();}else endGame(score,'REVERTED');});};cards();foot.innerHTML='<p class="notice">Find the verified build. More decoys enter the network each round.</p>';}
}

// Daily Word Build
const DAILY_WORDS=['BUILD','CRAFT','MERGE','STACKS','SHIPS','ZORTA','TEAMS','CODEX','PITCH','GIGSY'];
function daySeed(k){let n=2166136261;for(const c of k)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
function dailyWordForDay(k=dayKey()){return DAILY_WORDS[daySeed(k)%DAILY_WORDS.length];}
function ensureDailyState(){const k=dayKey();if(state.daily.date!==k){state.daily={date:k,word:{rows:[],cur:'',done:false},logic:{sel:[],done:false}};saveState();}}
function renderWord(){ensureDailyState();const el=$('#wordgame');if(!el)return;const d=state.daily.word||{rows:[],cur:'',done:false};el.innerHTML=`<div class="wordgrid">${Array.from({length:30},(_,i)=>{const cell=d.rows[Math.floor(i/5)]?.[i%5];return `<div class="tile ${cell?.c||''}">${cell?.l||''}</div>`}).join('')}</div>${d.done?'<div class="notice">BUILD LOCKED · Come back tomorrow for a new word.</div>':`<div class="keyboard">${'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map(k=>`<button class="key" data-key="${k}">${k}</button>`).join('')}<button class="key" data-back>⌫</button><button class="key" data-enter>↵</button></div><div class="notice">Build a 5-letter word · ${6-d.rows.length} attempts left</div>`}`;
  $$('.key[data-key]',el).forEach(b=>b.onclick=()=>typeWord(b.dataset.key)); $('[data-back]',el).onclick=backWord; $('[data-enter]',el).onclick=enterWord;
}
function typeWord(k){const d=state.daily.word||{rows:[],cur:'',done:false};if(!d.done&&d.cur.length<5){d.cur+=k;state.daily.word=d;saveState();renderWord();}}
function backWord(){const d=state.daily.word||{rows:[],cur:'',done:false};if(!d.done){d.cur=d.cur.slice(0,-1);state.daily.word=d;saveState();renderWord();}}
async function enterWord(){ensureDailyState();const d=state.daily.word||{rows:[],cur:'',done:false};if(d.cur.length!==5)return;const guess=d.cur.toUpperCase();const answer=dailyWordForDay(); const row=[...guess].map((l,i)=>({l,c:l===answer[i]?'good':answer.includes(l)?'mid':'bad'}));d.rows.push(row);d.cur='';if(guess===answer||d.rows.length>=6){d.done=true;state.daily.word=d;saveState();renderWord();await recordScore(guess===answer?40:10,'Daily Word Build','daily',crypto.randomUUID(),'word');}else{state.daily.word=d;saveState();renderWord();}}

// Daily Signal
const signalSets=[['SHIP','MERGE','DEPLOY','BUILD'],['GIG','TALENT','FOUNDER','PROJECT'],['CODE','STACK','COMMIT','REPO']];
function signalSetForDay(k=dayKey()){return signalSets[daySeed(k)%signalSets.length];}
const signalPoolForDay=k=>[...signalSetForDay(k),...['PITCH','COIN','EVENT','NETWORK','BADGE','STARTUP','DESIGN','COMMUNITY','BOT','HIRE','CRAFT','LAUNCH']];
function renderLogic(){ensureDailyState();const el=$('#logicgame');if(!el)return;const d=state.daily.logic||{sel:[],done:false};const signalSet=signalSetForDay();const signalPool=signalPoolForDay(dayKey());el.innerHTML=d.done?'<div class="notice">SIGNAL MERGED ✓<br>Return tomorrow for a new daily build.</div>':`<div class="logic">${signalPool.map((x,i)=>`<button class="${d.sel.includes(i)?'selected':''}" data-signal="${i}">${x}</button>`).join('')}</div><div class="notice">Select the four tiles that share one build signal.</div><button class="buildbtn" data-merge>MERGE ↗</button>`; if(d.done)return;$$('[data-signal]',el).forEach(b=>b.onclick=()=>{const i=Number(b.dataset.signal);if(d.sel.includes(i))d.sel=d.sel.filter(x=>x!==i);else if(d.sel.length<4)d.sel.push(i);state.daily.logic=d;saveState();renderLogic();});$('[data-merge]',el).onclick=async()=>{if(d.sel.length!==4)return;if(d.sel.every(i=>signalSet.includes(signalPool[i]))){d.done=true;state.daily.logic=d;saveState();renderLogic();await recordScore(35,'Daily Signal','daily',crypto.randomUUID(),'signal');}else{d.sel=[];state.daily.logic=d;saveState();renderLogic();toast('NOT THIS SIGNAL.');}};}

// Shared Build Wall
function loadWallLocal(){try{const x=JSON.parse(localStorage.getItem(WALL_STORAGE)||'{}');return x.cells||{};}catch{return {};}}
const wallCells=loadWallLocal();
function renderWall(){const pc=$('#pixelcanvas');if(!pc)return;pc.innerHTML='';for(let i=0;i<4096;i++){const b=document.createElement('button');b.className='px';b.dataset.i=i;b.style.background=wallCells[i]||COLORS[7];b.setAttribute('aria-label',`Pixel ${i%64+1}, ${Math.floor(i/64)+1}`);b.onclick=()=>placePixel(i);pc.appendChild(b);}const colors=$('#colors');if(colors){colors.innerHTML=COLORS.map((c,i)=>`<button class="color ${i===0?'sel':''}" data-color="${i}" aria-label="Color ${i+1}" style="background:${c}"></button>`).join('');$$('.color',colors).forEach(b=>b.onclick=()=>{selectedColor=Number(b.dataset.color);$$('.color',colors).forEach(x=>x.classList.remove('sel'));b.classList.add('sel');});}}
function saveWall(){localStorage.setItem(WALL_STORAGE,JSON.stringify({cells:wallCells}));}
async function syncCanvas(){const result=await api('/api/canvas-state');if(!result||!Array.isArray(result.pixels)){wallOnline=false;setStatus('NETWORK OFFLINE · SHARED WALL UNAVAILABLE');return;}wallOnline=true;for(const p of result.pixels){const i=p.y*64+p.x;wallCells[i]=p.color;const el=$(`.px[data-i="${i}"]`);if(el)el.style.background=p.color;}saveWall();setStatus(`LIVE · ${result.pixels.length} PIXELS PLACED`);}
async function placePixel(i){if(!wallOnline){toast('SHARED WALL OFFLINE · TRY AGAIN IN A MOMENT');return;}const now=Date.now();if(now-lastPlace>0&&now-lastPlace<120000){toast(`BUILD SLOT OPENS IN ${Math.ceil((120000-(now-lastPlace))/1000)}s`);return;}const result=await api('/api/canvas-place',{method:'POST',body:JSON.stringify({x:i%64,y:Math.floor(i/64),color:COLORS[selectedColor],userId:BUILDER_ID,displayName:`Builder #${BUILDER_ID.slice(-4)}`})});if(result?.ok){lastPlace=Date.now();localStorage.setItem('zorta-place-v2',lastPlace);wallCells[i]=COLORS[selectedColor];saveWall();const el=$(`.px[data-i="${i}"]`);if(el)el.style.background=COLORS[selectedColor];if(result.profile){state={...state,...result.profile,best:{...state.best,...(result.profile.best||{})}};saveState();renderProfile();}setStatus('LIVE · PIXEL PLACED · NEXT BUILD SLOT IN 120s');}else if(result?.error==='cooldown'){lastPlace=Date.now()-(120000-(result.retryAfterMs||120000));localStorage.setItem('zorta-place-v2',lastPlace);toast(`BUILD SLOT OPENS IN ${Math.ceil((result.retryAfterMs||0)/1000)}s`);}else{toast('PLACEMENT FAILED · NOTHING WAS SAVED');}}
function updateCooldown(){const el=$('#cooldown');if(!el)return;const left=Math.max(0,120000-(Date.now()-lastPlace));el.textContent=left?`${Math.ceil(left/1000)}s`:'READY';}
setInterval(updateCooldown,250); updateCooldown();

async function loadBoard(scope){const result=await api(`/api/leaderboard?scope=${scope}`);const body=$('#boardrows');if(!body)return;if(!result||result.error){body.innerHTML='<tr><td colspan="3" class="notice">NETWORK OFFLINE · LIVE RANKINGS UNAVAILABLE</td></tr>';return;}const entries=Array.isArray(result.entries)?result.entries:[];if(!entries.length){body.innerHTML=`<tr><td colspan="3" class="notice">${scope==='weekly'?'NO BUILDS THIS WEEK YET.':'NO BUILDS RECORDED YET.'}</td></tr>`;return;}body.innerHTML=entries.map((r,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td>${escapeHtml(r.displayName||`Builder #${String(r.userId||'').slice(-4)}`)}</td><td>${Number(r.reputation)||0} REP</td></tr>`).join('');}

// Waitlist
const waitModal=$('#waitModal'),waitForm=$('#waitlistForm'),waitEmail=$('#waitlistEmail'),waitStatus=$('#waitStatus');
function openWaitlist(){waitModal?.classList.add('open');waitModal?.setAttribute('aria-hidden','false');if(waitStatus){waitStatus.textContent='';waitStatus.className='wait-status';}setTimeout(()=>waitEmail?.focus(),60);}
function closeWaitlist(){waitModal?.classList.remove('open');waitModal?.setAttribute('aria-hidden','true');}
$$('[data-open-waitlist]').forEach(b=>b.addEventListener('click',openWaitlist));$('#waitClose')?.addEventListener('click',closeWaitlist);waitModal?.addEventListener('click',e=>{if(e.target===waitModal)closeWaitlist();});
waitForm?.addEventListener('submit',async e=>{e.preventDefault();if(!waitForm.checkValidity())return;const btn=waitForm.querySelector('button');btn.disabled=true;btn.textContent='ADDING…';try{const result=await submitWaitlist(waitEmail.value.trim().toLowerCase());if(result?.ok){waitStatus.textContent="YOU'RE ON THE LIST. We'll let you know when Zorta ships.";waitStatus.className='wait-status success';waitEmail.value='';}else if(result?.error==='already_registered'){waitStatus.textContent='That email is already on the list.';waitStatus.className='wait-status';}else{waitStatus.textContent='Couldn’t add you right now. Please try again.';waitStatus.className='wait-status error';}}finally{btn.disabled=false;btn.textContent='JOIN';}});

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&waitModal?.classList.contains('open'))closeWaitlist();});
$('#weekly')?.addEventListener('click',()=>{boardMode='weekly';$('#weekly').classList.add('active');$('#life').classList.remove('active');loadBoard('weekly');});
$('#life')?.addEventListener('click',()=>{boardMode='life';$('#life').classList.add('active');$('#weekly').classList.remove('active');loadBoard('lifetime');});
$('#dailyBtn')?.addEventListener('click',()=>document.querySelector('#wordgame')?.scrollIntoView({behavior:'smooth',block:'center'}));
$('#heroDailyBtn')?.addEventListener('click',()=>document.querySelector('#wordgame')?.scrollIntoView({behavior:'smooth',block:'center'}));
$('#closeGame')?.addEventListener('click',closeGame);
renderGames();renderWall();renderWord();renderLogic();renderProfile();
loadProfile();loadBoard('weekly');syncCanvas();flushScoreQueue();setInterval(syncCanvas,4000);
