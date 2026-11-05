/* RIVAYA 4.5 — haptics, day-complete celebration, streak freeze, starter habits,
   review prompt and the "share my streak" story card.
   Storage: freezes live in state.profile.streakFreezes ({"YYYY-MM-DD": reason}); every other
   field of the data model is unchanged. UI-only flags (celebrated today, review asked) are kept
   in separate localStorage keys and are safe to lose. */
(function(){
  'use strict';
  const U=window.RivayaNextUI,V=window.RivayaV5,C=window.RivayaNextCore;
  if(!U||!V||!C)return;
  const t=(ru,en)=>U.t(ru,en),lang=()=>U.lang(),loc=()=>lang()==='en'?'en-US':'ru-RU';
  const native=()=>window.VektorNative||{};
  const reduceMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  const num=n=>new Intl.NumberFormat(loc(),{maximumFractionDigits:0}).format(Math.max(0,Math.round(Number(n)||0)));
  const addDays=(d,n)=>{const x=startOfDay(d);x.setDate(x.getDate()+n);return x};
  const yesterdayKey=()=>dateKey(addDays(new Date(),-1));
  const FREEZES_PER_MONTH=2;
  const APP_URL='https://apps.apple.com/app/id6823716293';

  /* ---------- haptics ---------- */
  function haptic(kind){
    try{
      if(native().haptic){native().haptic(kind);return}
      if(navigator.vibrate)navigator.vibrate(kind==='success'?[16,70,26]:kind==='soft'?6:12);
    }catch(e){}
  }
  // Celebrate only right after the person's own tap, never after a restore or sync.
  let lastTap=0;
  const baseSetDone=setDone;
  setDone=function(id,val){lastTap=Date.now();const r=baseSetDone.apply(this,arguments);haptic(val?'light':'soft');return r};
  const baseAdd=C.addCount;
  C.addCount=function(){lastTap=Date.now();const r=baseAdd.apply(this,arguments);haptic('light');return r};

  /* ---------- streak freeze ---------- */
  function freezes(){
    const f=state.profile&&state.profile.streakFreezes;
    return f&&typeof f==='object'&&!Array.isArray(f)?f:{};
  }
  // Drop anything malformed (e.g. from an edited backup) before it reaches the streak maths.
  (function sanitize(){
    const f=freezes(),clean={};let changed=false;
    for(const [k,v] of Object.entries(f)){if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&typeof v==='string'&&v.length<=20)clean[k]=v;else changed=true}
    if(changed){state.profile.streakFreezes=clean;save()}
  })();
  const usedInMonth=k=>Object.keys(freezes()).filter(x=>x.slice(0,7)===k.slice(0,7)).length;
  const freezesLeft=k=>Math.max(0,FREEZES_PER_MONTH-usedInMonth(k));
  function canFreeze(k){
    if(k!==todayKey()&&k!==yesterdayKey())return false;
    if(V.frozen(k)||freezesLeft(k)<1)return false;
    const s=V.dayScore(new Date(k+'T12:00:00'));
    return s.planned>0&&(s.p??0)<100;
  }
  function streakIfFrozen(k){
    const f=freezes(),had=Object.prototype.hasOwnProperty.call(f,k);
    state.profile.streakFreezes={...f,[k]:'preview'};
    const n=V.streaks().current;
    if(had)state.profile.streakFreezes=f;else{const copy={...f};delete copy[k];state.profile.streakFreezes=copy}
    return n;
  }
  function applyFreeze(k,reason){
    if(!canFreeze(k))return;
    state.profile.streakFreezes={...freezes(),[k]:reason};
    save();haptic('success');closeSheet();render();
    toast(t(`❄️ День заморожен — серия сохранена. Осталось в этом месяце: ${freezesLeft(k)}`,`❄️ Day frozen — your streak is safe. Left this month: ${freezesLeft(k)}`));
  }
  function unfreeze(k){
    const f={...freezes()};delete f[k];state.profile.streakFreezes=f;save();haptic('soft');render();
  }
  const REASONS=()=>[['sick','🤒',t('Болею','Sick')],['travel','✈️',t('В дороге','Travelling')],['rest','🌙',t('Выходной','Rest day')],['other','✋',t('Другое','Other')]];
  function openFreezeSheet(k){
    if(!canFreeze(k))return;
    const isToday=k===todayKey();
    openSheet(`<div class="rb-sheet-icon">❄️</div>
      <h2>${isToday?t('Пропустить сегодня?','Skip today?'):t('Заморозить вчера?','Freeze yesterday?')}</h2>
      <p>${t('Серия не обнулится. День в календаре отметится снежинкой.','Your streak will not reset. The day gets a snowflake in the calendar.')}<br><b>${t('Заморозок в этом месяце','Freezes left this month')}: ${freezesLeft(k)} / ${FREEZES_PER_MONTH}</b></p>
      <div class="rb-reasons">${REASONS().map(([id,e,l])=>`<button data-rb="freeze-apply" data-day="${k}" data-reason="${id}"><span>${e}</span>${l}</button>`).join('')}</div>
      <button class="rb-sheet-cancel" data-rb="sheet-close">${t('Отмена','Cancel')}</button>`);
  }

  /* ---------- bottom sheet ---------- */
  function openSheet(html){
    closeSheet();
    const el=document.createElement('div');el.className='rb-sheet-wrap';el.innerHTML=`<div class="rb-sheet-backdrop" data-rb="sheet-close"></div><div class="rb-sheet" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('open'));
  }
  function closeSheet(){document.querySelectorAll('.rb-sheet-wrap').forEach(e=>e.remove())}

  /* ---------- starter habits ---------- */
  const STARTERS=()=>[
    {k:'water',e:'💧',n:t('Пить воду','Drink water'),count:8,unit:t('стаканов','glasses')},
    {k:'read',e:'📖',n:t('Читать 20 минут','Read 20 minutes')},
    {k:'walk',e:'🚶',n:t('Прогулка 30 минут','Walk 30 minutes')},
    {k:'meditate',e:'🧘',n:t('Медитация 10 минут','Meditate 10 minutes')},
    {k:'workout',e:'💪',n:t('Зарядка','Morning workout')},
    {k:'sleep',e:'😴',n:t('Лечь до 23:00','In bed by 11 pm')},
    {k:'pray',e:'🤲',n:t('Намаз','Prayer'),count:5,unit:t('раз','times')},
    {k:'nophone',e:'📵',n:t('Без телефона перед сном','No phone before bed')}];
  const newId=()=>'r'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
  function addStarter(key){
    const s=STARTERS().find(x=>x.k===key);if(!s)return;
    if(state.habits.some(h=>h.name===s.n))return;
    const h={id:newId(),name:s.n,emoji:s.e,freq:'Каждый день',tracking:s.count?'count':'check',target:s.count||1,increment:1,unit:s.count?s.unit:'',
      createdAt:todayKey(),endDate:'',goalId:'',reminderEnabled:false,reminderTimes:[],reminderTime:'',stopWhenDone:true};
    C.validation({habits:[h]});
    state.habits.push(h);save();haptic('light');render();
    toast(t(`Добавлено: ${s.n}`,`Added: ${s.n}`));
  }
  function startersHtml(){
    const names=new Set(state.habits.map(h=>h.name));
    return `<div class="rb-starters"><div class="rb-starters-title">${t('Начни с готовой привычки — одно касание','Start with a ready habit — one tap')}</div><div class="rb-starter-grid">${STARTERS().map(s=>`<button data-rb="starter" data-key="${s.k}" ${names.has(s.n)?'disabled aria-pressed="true"':''}><span>${s.e}</span><b>${s.n}</b>${s.count?`<small>${s.count} ${s.unit}</small>`:''}</button>`).join('')}</div></div>`;
  }

  /* ---------- celebration ---------- */
  function todayStats(){
    const k=todayKey(),pl=scheduledHabitsToday(),c=pl.reduce((n,h)=>n+C.dayCredit(state,h,k),0);
    return {planned:pl.length,p:pl.length?Math.round(c/pl.length*100):0};
  }
  function confetti(){
    if(reduceMotion())return;
    const cv=document.createElement('canvas');cv.className='rb-confetti';cv.width=innerWidth*2;cv.height=innerHeight*2;document.body.appendChild(cv);
    const ctx=cv.getContext('2d'),cols=['#7B5CFF','#3FD0FF','#34D399','#FBBF24','#FF7AC6','#FFFFFF'];
    const ring=document.querySelector('.v5-focus-ring')?.getBoundingClientRect();
    const ox=(ring?ring.left+ring.width/2:innerWidth/2)*2,oy=(ring?ring.top+ring.height/2:innerHeight/3)*2;
    const parts=Array.from({length:140},()=>{const a=Math.random()*Math.PI*2,v=8+Math.random()*16;return {x:ox,y:oy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-10,r:6+Math.random()*8,c:cols[Math.random()*cols.length|0],rot:Math.random()*6,vr:(Math.random()-.5)*.4,shape:Math.random()<.5}});
    const start=performance.now();
    (function frame(now){
      const el=now-start;ctx.clearRect(0,0,cv.width,cv.height);
      for(const p of parts){p.vy+=0.6;p.vx*=0.985;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;ctx.save();ctx.globalAlpha=Math.max(0,1-el/1700);ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.c;if(p.shape)ctx.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);else{ctx.beginPath();ctx.arc(0,0,p.r/2.4,0,7);ctx.fill()}ctx.restore()}
      if(el<1700)requestAnimationFrame(frame);else cv.remove();
    })(start);
  }
  function maybeAskReview(){
    const n=V.streaks().current,last=Number(store.get('rivaya-review-asked')||0);
    if(n<3||Date.now()-last<120*86400000||!native().requestReview)return;
    store.set('rivaya-review-asked',String(Date.now()));
    setTimeout(()=>native().requestReview(),2200);
  }
  function celebrate(){
    store.set('rivaya-celebrated',todayKey());
    haptic('success');confetti();
    document.querySelector('.v5-focus')?.classList.add('rb-pop');
    document.querySelector('.v5-streak')?.classList.add('rb-pop');
    maybeAskReview();
  }

  /* ---------- decorate rendered screens ---------- */
  function decorateToday(view){
    const k=todayKey(),st=todayStats(),streak=V.streaks();
    const focus=view.querySelector('.v5-focus'),copy=focus?.querySelector('.v5-focus-copy');
    if(focus&&copy&&V.frozen(k)){
      focus.classList.add('rb-frozen');
      copy.querySelector('h2').textContent=t('День заморожен ❄️','Day frozen ❄️');
      const p=copy.querySelector('p');if(p)p.textContent=t(`Серия ${V.nDays(streak.current)} сохранена. Отдыхай — завтра продолжим.`,`Your ${V.nDays(streak.current)} streak is safe. Rest — back at it tomorrow.`);
      copy.insertAdjacentHTML('beforeend',`<button class="rb-link" data-rb="unfreeze" data-day="${k}">${t('Отменить заморозку','Undo freeze')}</button>`);
    }else if(copy&&streak.current>=1&&!copy.querySelector('[data-rb="share"]')){
      copy.insertAdjacentHTML('beforeend',`<button class="rb-share ${st.p>=100?'strong':''}" data-rb="share">${st.p>=100?t('Поделиться 🔥','Share 🔥'):t('🔥 Поделиться серией','🔥 Share streak')}</button>`);
    }
    if(focus&&canFreeze(k)&&st.p<100&&!view.querySelector('.rb-freeze-link'))
      focus.insertAdjacentHTML('afterend',`<button class="rb-freeze-link" data-rb="freeze" data-day="${k}">❄️ ${t('Пропустить день без потери серии','Skip a day without losing your streak')} · ${t('осталось','left')} ${freezesLeft(k)}</button>`);
    // Offer to rescue yesterday's broken streak once.
    const y=yesterdayKey();
    if(focus&&canFreeze(y)&&store.get('rivaya-freeze-offer')!==y){
      const ys=V.dayScore(new Date(y+'T12:00:00'));
      const rescued=ys.credit===0?streakIfFrozen(y):0;
      if(rescued>=2&&rescued>streak.current)
        focus.insertAdjacentHTML('beforebegin',`<section class="rb-rescue"><div class="rb-rescue-icon">❄️</div><div class="rb-rescue-copy"><b>${t('Вчера пропуск','You missed yesterday')}</b><span>${t(`Сохрани серию 🔥 ${num(rescued)} — используй заморозку.`,`Keep your 🔥 ${num(rescued)} streak — use a freeze.`)}</span></div><div class="rb-rescue-actions"><button data-rb="freeze" data-day="${y}">${t('Сохранить','Keep it')}</button><button class="ghost" data-rb="rescue-dismiss" data-day="${y}" aria-label="${t('Не сейчас','Not now')}">✕</button></div></section>`);
    }
    if(state.habits.length<3&&!view.querySelector('.rb-starters')){
      const emptyCard=view.querySelector('.v5-empty'),block=view.querySelector('[data-home-block="habits"]');
      if(emptyCard)emptyCard.insertAdjacentHTML('afterend',startersHtml());
      else if(block)block.insertAdjacentHTML('beforeend',`<section class="v5-card">${startersHtml()}</section>`);
    }
  }
  function decoratePlan(view){
    if(state.habits.length<3&&!view.querySelector('.rb-starters')){
      const e=view.querySelector('.v5-empty'),list=view.querySelector('.v5-section .v5-list');
      if(e)e.insertAdjacentHTML('afterend',startersHtml());else if(list)list.insertAdjacentHTML('afterend',`<section class="v5-card">${startersHtml()}</section>`);
    }
  }
  function decorateProgress(view){
    if(V.streaks().current>=1&&!view.querySelector('[data-rb="share"]')){
      const k=view.querySelector('.v5-kpis');if(k)k.insertAdjacentHTML('afterend',`<button class="v5-btn rb-share-wide" data-rb="share">🔥 ${t('Поделиться серией','Share my streak')}</button>`);
    }
  }

  /* ---------- share card (1080×1920 story) ---------- */
  const THEMES={
    violet:{bg:['#1A0830','#200B36','#160626'],glow:'167,139,250',side:'150,60,40',accent:['#C4B5FD','#7C3AED'],line:'#A78BFA'},
    fire:{bg:['#2A0A12','#33101A','#1A060C'],glow:'255,140,80',side:'255,90,60',accent:['#FFD48A','#F97316'],line:'#FDBA74'},
    aqua:{bg:['#04161F','#062130','#031018'],glow:'103,232,249',side:'52,211,153',accent:['#A5F3FC','#0891B2'],line:'#67E8F9'}
  };
  const PHRASES=()=>lang()==='en'
    ?['I keep my word to myself.','No waiting for motivation.','Discipline is my choice.','Every day. For me.','Small steps every day.']
    :['Я держу слово себе.','Не жду мотивации. Просто делаю.','Дисциплина — мой выбор.','Каждый день. Для себя.','Маленькие шаги каждый день.'];
  const FONT='-apple-system,"SF Pro Display","Segoe UI",Inter,Roboto,Arial,sans-serif';
  let flameImg=null;
  function loadFlame(){
    if(flameImg)return Promise.resolve(flameImg);
    return new Promise(res=>{const i=new Image();i.onload=()=>{flameImg=i;res(i)};i.onerror=()=>res(null);i.src='share-flame.png'});
  }
  function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function spaced(ctx,text,cx,y,spacing){
    const chars=[...text],widths=chars.map(c=>ctx.measureText(c).width),total=widths.reduce((a,b)=>a+b,0)+spacing*(chars.length-1);
    let x=cx-total/2;ctx.textAlign='left';chars.forEach((c,i)=>{ctx.fillText(c,x,y);x+=widths[i]+spacing});ctx.textAlign='center';
  }
  const cap=x=>x.charAt(0).toUpperCase()+x.slice(1);
  function cardData(){
    const s=V.streaks(),n=s.current,now=new Date();
    const days=Array.from({length:7},(_,i)=>{const d=addDays(now,i-6),k=dateKey(d),sc=V.dayScore(d);
      return {label:cap(new Intl.DateTimeFormat(loc(),{weekday:'short'}).format(d).replace('.','')),state:V.frozen(k)?'frozen':sc.planned===0?'none':sc.credit>=sc.planned?'done':sc.credit>0?'part':'miss'}});
    const daily=state.activity?.dailySteps||{};
    const stepDays=Array.from({length:7},(_,i)=>{const d=addDays(now,i-6),k=dateKey(d);return {label:cap(new Intl.DateTimeFormat(loc(),{weekday:'short'}).format(d).replace('.','')),v:Object.prototype.hasOwnProperty.call(daily,k)?Math.max(0,Number(daily[k])||0):null}});
    const known=stepDays.filter(x=>x.v!==null);
    const hasSteps=state.activity?.access==='granted'&&known.length>=3&&known.some(x=>x.v>0);
    const total=known.reduce((a,x)=>a+x.v,0);
    const name=(state.profile?.name||'').trim();
    const from=addDays(now,-6),sameMonth=from.getMonth()===now.getMonth();
    const range=sameMonth?`${from.getDate()}–${new Intl.DateTimeFormat(loc(),{day:'numeric',month:'long'}).format(now)}`:`${new Intl.DateTimeFormat(loc(),{day:'numeric',month:'short'}).format(from).replace('.','')} – ${new Intl.DateTimeFormat(loc(),{day:'numeric',month:'short'}).format(now).replace('.','')}`;
    const phrases=PHRASES(),idx=(now.getDate()+n)%phrases.length;
    return {n,best:s.best,record:n>=3&&n>=s.best,days,stepDays,hasSteps,total,avg:known.length?total/known.length:0,km:total*0.00072,
      name:name&&name!=='Пользователь'&&name!=='User'?name:'',range,phrase:phrases[idx],
      checks:Object.values(state.checks||{}).filter(v=>v===true).length,habits:state.habits.length};
  }
  /* Animation timeline (seconds). Static cards are drawn at tm=Infinity, i.e. the final frame. */
  const clamp01=x=>Math.max(0,Math.min(1,x));
  const ph=(tm,a,b)=>clamp01((tm-a)/(b-a));
  const easeOut=x=>1-Math.pow(1-x,3);
  const easeBack=x=>{const c1=1.70158,c3=c1+1;return x<=0?0:1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)};
  // The final result stays on screen for ~4 s so viewers can read it before the story moves on.
  const VIDEO_LEN=9,ANIM_END=4.8;
  function drawFrame(ctx,T,D,flame,tm){
    const A=Number.isFinite(tm)?tm:99,live=A<99,W=1080,H=1920;
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.globalAlpha=1;ctx.shadowBlur=0;
    let g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,T.bg[0]);g.addColorStop(.5,T.bg[1]);g.addColorStop(1,T.bg[2]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    const blob=(x,y,r,c,a)=>{const rg=ctx.createRadialGradient(x,y,0,x,y,r);rg.addColorStop(0,`rgba(${c},${a})`);rg.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=rg;ctx.fillRect(0,0,W,H)};
    const pulse=live?Math.sin(A*4.2)*0.06:0;
    blob(540,690,560,T.glow,.32+pulse);blob(1080,760,600,T.side,.28);blob(0,1920,760,T.glow,.22);
    // embers drift upwards while the video plays
    let seed=7;const rnd=()=>(seed=(seed*9301+49297)%233280)/233280;
    for(let i=0;i<46;i++){const x=540+(rnd()-.5)*900,y0=380+rnd()*620,r=2+rnd()*5,a=.25+rnd()*.5,sp=20+rnd()*50;
      let y=y0;if(live){y=380+((y0-380-A*sp)%620+620)%620}
      ctx.globalAlpha=live?clamp01(A/0.6):1;ctx.fillStyle=`rgba(255,200,140,${a})`;ctx.shadowColor='rgba(255,170,90,.9)';ctx.shadowBlur=r*4;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill()}
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    // brand + title
    ctx.globalAlpha=easeOut(ph(A,0,0.5));
    const bx=540-150,by=262;g=ctx.createLinearGradient(bx,by,bx+66,by+66);g.addColorStop(0,'#7B5CFF');g.addColorStop(1,'#3FD0FF');
    ctx.shadowColor='rgba(123,92,255,.55)';ctx.shadowBlur=30;rr(ctx,bx,by,66,66,20);ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#fff';ctx.font=`900 38px ${FONT}`;ctx.fillText('R',bx+33,by+47);
    ctx.font=`900 40px ${FONT}`;ctx.textAlign='left';ctx.fillText('R I V A Y A',bx+86,by+47);ctx.textAlign='center';
    ctx.font=`600 28px ${FONT}`;ctx.fillStyle='#CBBDE6';
    spaced(ctx,(t('МОЯ СЕРИЯ','MY STREAK')+(D.name?' · '+D.name.toUpperCase():'')).slice(0,34),540,380,9);
    ctx.globalAlpha=1;
    // flame: pops in, then flickers
    const fs=easeBack(ph(A,0.15,0.85))*(live?1+Math.sin(A*9)*0.012+Math.sin(A*5.3)*0.01:1);
    if(fs>0){ctx.save();ctx.translate(540,600);ctx.scale(fs,fs);
      if(flame){const fw=420,fh=fw*flame.height/flame.width;ctx.drawImage(flame,-fw/2,410-600,fw,fh)}
      else{ctx.font=`230px ${FONT}`;ctx.shadowColor='rgba(255,120,60,.9)';ctx.shadowBlur=60;ctx.fillText('🔥',0,90);ctx.shadowBlur=0}
      ctx.restore()}
    // 3D number counts up, then bumps
    const shown=Math.round(D.n*easeOut(ph(A,0.45,1.6)));
    const numText=String(live?shown:D.n),size=D.n>=1000?220:D.n>=100?270:330,baseY=905;
    const bump=live?1+0.09*Math.sin(Math.PI*ph(A,1.6,1.95)):1;
    if(A>=0.45){ctx.save();ctx.translate(540,baseY-size*0.35);ctx.scale(bump,bump);ctx.translate(-540,-(baseY-size*0.35));
      ctx.font=`900 ${size}px ${FONT}`;ctx.globalAlpha=easeOut(ph(A,0.45,0.75));
      for(let i=16;i>0;i--){ctx.fillStyle=`rgb(${60+i*2},${24+i},${110+i*3})`;ctx.fillText(numText,540+i*0.6,baseY+i)}
      ctx.shadowColor=`rgba(${T.glow},.75)`;ctx.shadowBlur=60;
      g=ctx.createLinearGradient(0,baseY-size*0.72,0,baseY);g.addColorStop(0,'#FFFFFF');g.addColorStop(.55,'#F1E8FF');g.addColorStop(1,'#C9B8FF');
      ctx.fillStyle=g;ctx.fillText(numText,540,baseY);ctx.shadowBlur=0;ctx.restore();ctx.globalAlpha=1}
    // labels
    ctx.globalAlpha=easeOut(ph(A,1.35,1.75));
    ctx.fillStyle='#fff';ctx.font=`900 66px ${FONT}`;ctx.shadowColor=`rgba(${T.glow},.55)`;ctx.shadowBlur=40;
    ctx.fillText(lang()==='en'?(D.n===1?'day in a row':'days in a row'):V.plural(D.n,['день подряд','дня подряд','дней подряд'],[]),540,985);ctx.shadowBlur=0;
    ctx.globalAlpha=1;
    let y=985;
    if(D.record){
      const s=easeBack(ph(A,1.65,2.0));
      if(s>0){ctx.save();ctx.translate(540,1043);ctx.scale(s,s);ctx.translate(-540,-1043);
        ctx.font=`800 32px ${FONT}`;const txt='🏆 '+t('Новый личный рекорд','New personal best'),w=ctx.measureText(txt).width+64;
        rr(ctx,540-w/2,1015,w,56,28);ctx.fillStyle='rgba(251,191,36,.18)';ctx.fill();ctx.strokeStyle='rgba(251,191,36,.6)';ctx.lineWidth=2;ctx.stroke();
        ctx.fillStyle='#FFD88A';ctx.fillText(txt,540,1054);ctx.restore()}
      y=1071;
    }
    ctx.globalAlpha=easeOut(ph(A,1.85,2.2));ctx.fillStyle='#EDE6FA';ctx.font=`700 42px ${FONT}`;ctx.fillText(D.phrase,540,y+58);ctx.globalAlpha=1;y+=58;
    // week: the line draws, then each day lights up in turn
    const wy=y+30,gap=110,x0=540-gap*3,lp=easeOut(ph(A,1.95,2.85));
    if(lp>0){ctx.strokeStyle=T.line;ctx.lineWidth=4;ctx.shadowColor=T.line;ctx.shadowBlur=14;ctx.beginPath();ctx.moveTo(x0,wy+32);ctx.lineTo(x0+gap*6*lp,wy+32);ctx.stroke();ctx.shadowBlur=0}
    D.days.forEach((d,i)=>{const cx=x0+i*gap,cy=wy+32,s=easeBack(ph(A,2.0+i*0.11,2.3+i*0.11));
      ctx.globalAlpha=clamp01(ph(A,1.95+i*0.11,2.1+i*0.11));
      ctx.fillStyle=i===6?'#FFFFFF':'#D8CDEB';ctx.font=`600 27px ${FONT}`;ctx.fillText(d.label,cx,cy+74);
      if(s<=0){ctx.globalAlpha=1;return}
      ctx.save();ctx.translate(cx,cy);ctx.scale(s,s);
      const fill=d.state==='done'||d.state==='part';
      if(fill){const rg=ctx.createRadialGradient(-10,-12,4,0,0,34);rg.addColorStop(0,T.accent[0]);rg.addColorStop(1,T.accent[1]);ctx.fillStyle=rg;ctx.shadowColor=`rgba(${T.glow},.7)`;ctx.shadowBlur=24}
      else ctx.fillStyle=d.state==='frozen'?'#1E3A5F':'#2A2346';
      ctx.beginPath();ctx.arc(0,0,32,0,7);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';
      if(d.state==='done'){ctx.lineWidth=6;ctx.strokeStyle='#fff';ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(-12,1);ctx.lineTo(-3,10);ctx.lineTo(13,-9);ctx.stroke()}
      else if(d.state==='part'){ctx.font=`900 30px ${FONT}`;ctx.fillText('•',0,10)}
      else if(d.state==='frozen'){ctx.font=`30px ${FONT}`;ctx.fillText('❄️',0,11)}
      ctx.restore();ctx.globalAlpha=1;
    });
    y=wy+114;
    // steps or stats panel slides up; bars grow one by one
    const px=80,pw=920,pa=easeOut(ph(A,2.55,2.95)),slide=(1-pa)*40;
    ctx.globalAlpha=pa;ctx.save();ctx.translate(0,slide);
    if(D.hasSteps){
      const phh=270;rr(ctx,px,y,pw,phh,44);g=ctx.createLinearGradient(px,y,px+pw,y+phh);g.addColorStop(0,'rgba(255,255,255,.11)');g.addColorStop(1,'rgba(255,255,255,.035)');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.stroke();
      ctx.textAlign='left';ctx.fillStyle='#C9BEDD';ctx.font=`600 26px ${FONT}`;ctx.fillText(`👟 ${t('Шаги','Steps')} · ${D.range}`,px+36,y+52);
      const totShown=live?D.total*easeOut(ph(A,2.6,3.5)):D.total;
      ctx.fillStyle='#fff';ctx.font=`900 52px ${FONT}`;const tot=num(totShown);ctx.fillText(tot,px+36,y+112);
      const tw=ctx.measureText(num(D.total)).width;ctx.fillStyle='#C9BEDD';ctx.font=`700 28px ${FONT}`;ctx.fillText(` · ${(Math.round(D.km*10)/10).toLocaleString(loc())} ${t('км','km')}`,px+36+tw,y+112);
      ctx.textAlign='right';ctx.fillStyle='#fff';ctx.font=`850 40px ${FONT}`;ctx.fillText(num(D.avg),px+pw-36,y+70);ctx.fillStyle='#C9BEDD';ctx.font=`600 26px ${FONT}`;ctx.fillText(t('в среднем в день','daily average'),px+pw-36,y+108);
      ctx.textAlign='center';
      const vals=D.stepDays.map(d=>d.v||0),mx=Math.max(1,...vals),mn=Math.min(...vals.filter(v=>v>0),mx),bw=106,bg2=14,bx0=px+36,base=y+phh-50;
      const bestI=vals.indexOf(mx),flash=live?Math.sin(Math.PI*ph(A,3.45,3.85)):0;
      D.stepDays.forEach((d,i)=>{const x=bx0+i*(bw+bg2),grow=easeOut(ph(A,2.75+i*0.07,3.25+i*0.07)),full=d.v?22+(mx===mn?40:(d.v-mn)/(mx-mn)*44):6,h=Math.max(2,full*grow);
        const gg=ctx.createLinearGradient(0,base-h,0,base),best=i===bestI&&d.v;
        if(best){gg.addColorStop(0,'#FFD48A');gg.addColorStop(1,'#F97316');ctx.shadowColor='rgba(249,115,22,.65)'}else{gg.addColorStop(0,T.accent[0]);gg.addColorStop(1,T.accent[1]);ctx.shadowColor=`rgba(${T.glow},.45)`}
        ctx.shadowBlur=18+(best?flash*30:0);rr(ctx,x,base-h,bw,h,Math.min(14,h/2));ctx.fillStyle=d.v?gg:'rgba(255,255,255,.10)';ctx.fill();ctx.shadowBlur=0;
        ctx.globalAlpha=pa*grow;ctx.fillStyle=best?'#FFD48A':'#C9BEDD';ctx.font=`700 21px ${FONT}`;ctx.fillText(d.v===null?'—':num(d.v),x+bw/2,base-h-10);ctx.globalAlpha=pa;
        ctx.fillStyle='#C9BEDD';ctx.font=`600 23px ${FONT}`;ctx.fillText(d.label,x+bw/2,base+34)});
      y+=phh;
    }else{
      const items=[['✅',D.checks,t('отметок','check-ins')],['🏆',D.best,t('рекорд','best streak')],['🎯',D.habits,t('привычек','habits')]];
      const cw=284,gapc=34,cx0=540-(cw*3+gapc*2)/2,cnt=live?easeOut(ph(A,2.6,3.4)):1;
      items.forEach(([e,v,l],i)=>{const x=cx0+i*(cw+gapc);rr(ctx,x,y,cw,200,40);g=ctx.createLinearGradient(x,y,x+cw,y+200);g.addColorStop(0,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,.03)');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.stroke();
        ctx.font=`40px ${FONT}`;ctx.fillStyle='#fff';ctx.fillText(e,x+cw/2,y+62);ctx.font=`900 60px ${FONT}`;ctx.fillText(num(v*cnt),x+cw/2,y+132);ctx.fillStyle='#C9BEDD';ctx.font=`600 27px ${FONT}`;ctx.fillText(l,x+cw/2,y+172)});
      y+=200;
    }
    ctx.restore();ctx.globalAlpha=1;
    // CTA pops in
    const cy=y+24,cs=easeBack(ph(A,3.3,3.7));
    if(cs>0){ctx.save();ctx.translate(540,cy+41);ctx.scale(cs,cs);ctx.translate(-540,-(cy+41));
      ctx.font=`850 34px ${FONT}`;const cta=t('Скачай RIVAYA в App Store','Get RIVAYA on the App Store'),cw2=ctx.measureText(cta).width+92;
      g=ctx.createLinearGradient(540-cw2/2,0,540+cw2/2,0);g.addColorStop(0,'#7B5CFF');g.addColorStop(1,'#3FD0FF');ctx.shadowColor='rgba(123,92,255,.55)';ctx.shadowBlur=44;
      rr(ctx,540-cw2/2,cy,cw2,82,41);ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.fillText(cta,540,cy+54);ctx.restore()}
    ctx.globalAlpha=easeOut(ph(A,3.6,4.0));ctx.fillStyle='#9F8FBF';ctx.font=`500 28px ${FONT}`;ctx.fillText(t('Маленькие шаги — большой путь','Small steps — big journey'),540,1720);ctx.globalAlpha=1;
    // confetti burst from the number (video only)
    if(live&&A>=3.5){const e=A-3.5;let s2=11;const r2=()=>(s2=(s2*9301+49297)%233280)/233280;
      const cols=['#7B5CFF','#3FD0FF','#34D399','#FBBF24','#FF7AC6','#FFFFFF'];
      for(let i=0;i<90;i++){const ang=r2()*Math.PI*2,v=500+r2()*900,x=540+Math.cos(ang)*v*e,y2=760+Math.sin(ang)*v*e-650*e+900*e*e,sz=10+r2()*12;
        ctx.globalAlpha=clamp01(1-e/1.3);ctx.fillStyle=cols[i%cols.length];ctx.save();ctx.translate(x,y2);ctx.rotate(r2()*6+e*8);ctx.fillRect(-sz/2,-sz/4,sz,sz/2);ctx.restore()}
      ctx.globalAlpha=1}
  }
  async function drawCard(themeKey){
    const T=THEMES[themeKey]||THEMES.violet,D=cardData(),flame=await loadFlame();
    const cv=document.createElement('canvas');cv.width=1080;cv.height=1920;drawFrame(cv.getContext('2d'),T,D,flame,Infinity);return cv;
  }
  function videoMime(){
    if(typeof window.MediaRecorder!=='function'||!HTMLCanvasElement.prototype.captureStream)return '';
    return ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
      .find(m=>{try{return MediaRecorder.isTypeSupported(m)}catch(e){return false}})||'';
  }
  // Records the animation in real time (≈5 s) from a visible canvas inside the preview.
  async function recordVideo(themeKey,host,onProgress,isCancelled){
    const mime=videoMime();if(!mime)throw Error('video_unsupported');
    const T=THEMES[themeKey]||THEMES.violet,D=cardData(),flame=await loadFlame();
    const cv=document.createElement('canvas');cv.width=720;cv.height=1280;cv.className='rb-rec-canvas';host.innerHTML='';host.appendChild(cv);
    const ctx=cv.getContext('2d'),draw=tm=>{ctx.setTransform(720/1080,0,0,720/1080,0,0);drawFrame(ctx,T,D,flame,tm)};
    draw(0);
    const stream=cv.captureStream(30),rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000}),chunks=[];
    rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
    const stopped=new Promise((res,rej)=>{rec.onstop=res;rec.onerror=e=>rej(e.error||Error('recorder'))});
    rec.start(250);const t0=performance.now();
    await new Promise(res=>{(function frame(){const tm=(performance.now()-t0)/1000;if(isCancelled()){res();return}draw(tm);onProgress(Math.min(1,tm/VIDEO_LEN));if(tm<VIDEO_LEN)requestAnimationFrame(frame);else res()})()});
    rec.stop();stream.getTracks().forEach(tr=>tr.stop());await stopped;
    if(isCancelled())throw Error('cancelled');
    const blob=new Blob(chunks,{type:mime.split(';')[0]});if(!blob.size)throw Error('video_empty');
    return blob;
  }
  const blobToDataURL=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(b)});

  let shareTheme=store.get('rivaya-share-theme')||'violet',shareMode=store.get('rivaya-share-mode')==='video'?'video':'image';
  let lastCard=null,lastVideo=null,lastVideoURL='',job=0;
  async function openShare(){
    if(V.streaks().current<1){toast(t('Отметь привычку сегодня, чтобы начать серию 🔥','Check off a habit today to start a streak 🔥'));return}
    if(shareMode==='video'&&!videoMime())shareMode='image';
    openSheet(`<div class="rb-share-preview">
      <div class="rb-modes" role="group">${[['image','🖼 '+t('Картинка','Image')],['video','🎬 '+t('Видео','Video')]].map(([k,l])=>`<button data-rb="share-mode" data-mode="${k}" aria-pressed="${k===shareMode}" ${k==='video'&&!videoMime()?'disabled':''}>${l}</button>`).join('')}</div>
      <div class="rb-share-img"><div class="rb-spinner"></div></div>
      <div class="rb-progress" hidden><i></i></div>
      <div class="rb-themes">${[['violet',t('Фиолетовый','Violet')],['fire',t('Огонь','Fire')],['aqua',t('Бирюза','Aqua')]].map(([k,l])=>`<button data-rb="share-theme" data-theme="${k}" aria-pressed="${k===shareTheme}"><i class="rb-dot ${k}"></i>${l}</button>`).join('')}</div>
      <button class="v5-btn rb-share-go" data-rb="share-go">${t('Поделиться','Share')}</button>
      <button class="rb-sheet-cancel" data-rb="sheet-close">${t('Закрыть','Close')}</button></div>`);
    await renderPreview();
  }
  async function renderPreview(){
    const box=document.querySelector('.rb-share-img'),go=document.querySelector('.rb-share-go'),bar=document.querySelector('.rb-progress');if(!box)return;
    const my=++job;lastCard=null;lastVideo=null;if(lastVideoURL){URL.revokeObjectURL(lastVideoURL);lastVideoURL=''}
    if(go)go.disabled=true;if(bar)bar.hidden=true;
    try{
      if(shareMode==='image'){
        const card=await drawCard(shareTheme);if(my!==job)return;lastCard=card;
        box.innerHTML=`<img alt="${t('Карточка серии','Streak card')}" src="${card.toDataURL('image/jpeg',0.92)}">`;
        if(go){go.disabled=false;go.textContent=t('Поделиться','Share')}
      }else{
        if(go)go.textContent=t('Создаём видео…','Creating video…');if(bar){bar.hidden=false;bar.firstElementChild.style.width='0%'}
        const blob=await recordVideo(shareTheme,box,p=>{if(bar&&my===job)bar.firstElementChild.style.width=Math.round(p*100)+'%'},()=>my!==job||!document.querySelector('.rb-share-img'));
        if(my!==job)return;lastVideo=blob;lastVideoURL=URL.createObjectURL(blob);
        box.innerHTML=`<video src="${lastVideoURL}" autoplay loop muted playsinline></video>`;
        if(bar)bar.hidden=true;if(go){go.disabled=false;go.textContent=t('Поделиться видео','Share video')}
      }
    }catch(e){
      if(my!==job||e.message==='cancelled')return;
      if(shareMode==='video'){shareMode='image';toast(t('Видео на этом телефоне не получилось — отправим картинку','Video is not available on this phone — sharing an image'));
        document.querySelectorAll('[data-rb="share-mode"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode==='image')));return renderPreview()}
      box.textContent=t('Не удалось создать картинку','Could not create the image');
    }
  }
  function shareText(){const n=V.streaks().current;return t(`Моя серия в RIVAYA: ${V.nDays(n)} подряд 🔥 ${APP_URL}`,`My RIVAYA streak: ${n} ${n===1?'day':'days'} in a row 🔥 ${APP_URL}`)}
  async function shareFile(blob,name){
    try{const file=new File([blob],name,{type:blob.type});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],text:shareText()});return true}}catch(e){if(e&&e.name==='AbortError')return true}
    return false;
  }
  async function shareNow(){
    haptic('light');
    if(shareMode==='video'&&lastVideo){
      if(native().shareVideo&&lastVideo.type.includes('mp4')){native().shareVideo(await blobToDataURL(lastVideo));return}
      const ext=lastVideo.type.includes('mp4')?'mp4':'webm';
      if(await shareFile(lastVideo,'rivaya-streak.'+ext))return;
      const a=document.createElement('a');a.href=lastVideoURL;a.download='rivaya-streak.'+ext;document.body.appendChild(a);a.click();a.remove();return;
    }
    if(!lastCard)return;
    const data=lastCard.toDataURL('image/jpeg',0.92);
    if(native().shareImage){native().shareImage(data);return}
    const blob=await new Promise(res=>lastCard.toBlob(res,'image/jpeg',0.92));
    if(blob&&await shareFile(blob,'rivaya-streak.jpg'))return;
    if(native().shareText){native().shareText(shareText());return}
    const a=document.createElement('a');a.href=data;a.download='rivaya-streak.jpg';document.body.appendChild(a);a.click();a.remove();
  }

  /* ---------- actions ---------- */
  window.addEventListener('click',e=>{
    const el=e.target.closest('[data-rb]');if(!el)return;
    e.preventDefault();e.stopImmediatePropagation();
    const a=el.dataset.rb,day=el.dataset.day;
    if(a==='sheet-close'){job++;closeSheet()}
    else if(a==='freeze')openFreezeSheet(day);
    else if(a==='freeze-apply')applyFreeze(day,['sick','travel','rest','other'].includes(el.dataset.reason)?el.dataset.reason:'other');
    else if(a==='unfreeze')unfreeze(day);
    else if(a==='rescue-dismiss'){store.set('rivaya-freeze-offer',day);el.closest('.rb-rescue')?.remove()}
    else if(a==='starter'&&!el.disabled)addStarter(el.dataset.key);
    else if(a==='share')openShare();
    else if(a==='share-theme'){shareTheme=THEMES[el.dataset.theme]?el.dataset.theme:'violet';store.set('rivaya-share-theme',shareTheme);document.querySelectorAll('[data-rb="share-theme"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===shareTheme)));renderPreview()}
    else if(a==='share-mode'&&!el.disabled){shareMode=el.dataset.mode==='video'?'video':'image';store.set('rivaya-share-mode',shareMode);document.querySelectorAll('[data-rb="share-mode"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===shareMode)));renderPreview()}
    else if(a==='share-go')shareNow();
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});

  /* ---------- render hook ---------- */
  let prevP=null;
  const baseRender=render;
  render=function(){
    baseRender();
    try{
      const view=document.getElementById('view');
      if(view){
        if(currentView==='today')decorateToday(view);
        else if(['plan','habits','goals'].includes(currentView))decoratePlan(view);
        else if(['progress','stats','calendar'].includes(currentView))decorateProgress(view);
      }
      const st=todayStats();
      if(prevP!==null&&prevP<100&&st.p>=100&&st.planned>0&&Date.now()-lastTap<3000&&currentView==='today'&&store.get('rivaya-celebrated')!==todayKey()&&!V.frozen(todayKey()))celebrate();
      prevP=st.p;
    }catch(err){console.warn('RIVAYA boost',err)}
  };
  window.RivayaBoost={haptic,freezesLeft,canFreeze,applyFreeze,unfreeze,addStarter,drawCard,drawFrame,recordVideo,videoMime,cardData,openShare,celebrate,FREEZES_PER_MONTH,THEMES};
  render();
})();
