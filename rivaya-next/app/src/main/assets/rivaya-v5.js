/* RIVAYA 4.3 interface layer.
   Renders the four main screens (Today, Plan, Progress, Profile) in the new design.
   Data model, storage key, editors, native bridges and reminders stay in the existing code:
   every action below reuses the existing data-nx / data-nav / data-open handlers. */
(function(){
  'use strict';
  const U=window.RivayaNextUI,C=window.RivayaNextCore;
  if(!U||!C)return;
  const VERSION='4.3.0';
  const lang=()=>U.lang();
  const t=(ru,en)=>U.t(ru,en);
  const loc=()=>lang()==='en'?'en-US':'ru-RU';
  const ui={planFilter:'all',period:7,offset:0};
  document.documentElement.classList.add('v5');

  /* ---------- formatting ---------- */
  const num=n=>new Intl.NumberFormat(loc(),{maximumFractionDigits:0}).format(Math.max(0,Math.round(Number(n)||0)));
  const dec=n=>new Intl.NumberFormat(loc(),{maximumFractionDigits:2}).format(Number(n)||0);
  const fmtDate=(k,o={day:'numeric',month:'short'})=>k?new Intl.DateTimeFormat(loc(),o).format(new Date(k+'T12:00:00')):'';
  const dkey=d=>dateKey(d);
  const addDays=(d,n)=>{const x=startOfDay(d);x.setDate(x.getDate()+n);return x};
  // Russian plural forms: one / few / many. English: one / other.
  function plural(n,ru,en){
    const a=Math.abs(Math.round(n));
    if(lang()==='en')return en[a===1?0:1];
    const m10=a%10,m100=a%100;
    return ru[m10===1&&m100!==11?0:m10>=2&&m10<=4&&(m100<12||m100>14)?1:2];
  }
  const nDays=n=>num(n)+' '+plural(n,['день','дня','дней'],['day','days']);
  const nHabits=n=>num(n)+' '+plural(n,['привычка','привычки','привычек'],['habit','habits']);
  function dueLabel(deadline){
    if(!deadline)return t('Без срока','No deadline');
    const d=Math.round((new Date(deadline+'T12:00:00')-startOfDay(new Date()))/86400000);
    if(d<0)return t('Срок прошёл','Overdue');
    if(d===0)return t('Сегодня','Today');
    if(d===1)return t('Завтра','Tomorrow');
    return lang()==='en'?`${d} days left`:`${plural(d,['остался','осталось','осталось'],[])} ${nDays(d)}`;
  }

  /* ---------- habit helpers ---------- */
  const PALETTE=['#7B5CFF','#3FD0FF','#34D399','#FBBF24','#F87171','#FF7AC6','#FB923C'];
  function colorOf(h){if(h.color&&/^#[0-9a-f]{6}$/i.test(h.color))return h.color;let s=0;for(const c of String(h.id))s=(s*31+c.charCodeAt(0))>>>0;return PALETTE[s%PALETTE.length]}
  function emojiOf(h){
    if(typeof h.emoji==='string'&&h.emoji.trim())return esc(h.emoji.trim().slice(0,4));
    const n=String(h.name||'').toLowerCase();
    const map=[[/вод|water|drink|пить/,'💧'],[/чит|книг|read|book/,'📖'],[/медит|дых|meditat|breath/,'🧘'],[/бег|run|jog/,'🏃'],[/трен|спорт|зал|отжим|присед|gym|workout|sport|push/,'💪'],[/сон|спать|sleep/,'😴'],[/проект|работ|project|work|code|код/,'🚀'],[/англ|язык|english|language/,'🗣️'],[/уч|курс|study|learn|урок/,'📚'],[/шаг|ход|прогул|walk|step/,'👟'],[/еда|овощ|фрукт|сахар|сладк|food|eat|sugar|fruit/,'🍎'],[/деньг|копи|бюджет|money|save|budget/,'💰'],[/молит|намаз|pray/,'🤲'],[/дневник|пис|journal|write/,'✍️'],[/кур|smok/,'🚭'],[/зуб|tooth|teeth/,'🦷'],[/уборк|clean/,'🧹']];
    for(const [re,e] of map)if(re.test(n))return e;
    return '✨';
  }
  const tint=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`};
  function freqLabel(h){return ({daily:t('Каждый день','Every day'),weekdays:t('По будням','Weekdays'),'3x':t('3 раза в неделю','3× a week')})[habitMode(h)]}
  const credit=(h,k)=>C.dayCredit(state,h,k);
  function dayScore(d){
    const k=dkey(d),list=state.habits.filter(h=>habitScheduledOnDate(h,d));
    const c=list.reduce((n,h)=>n+credit(h,k),0);
    return {planned:list.length,credit:c,p:list.length?Math.round(c/list.length*100):null};
  }
  function earliestStart(){
    let k=todayKey();
    state.habits.forEach(h=>{if(h.createdAt&&h.createdAt<k)k=h.createdAt});
    Object.keys(state.checks||{}).forEach(x=>{const d=x.slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<k)k=d});
    return k;
  }
  // A day "counts" when at least one planned habit was completed. Days without a plan never break a streak.
  function streaks(){
    const today=startOfDay(new Date()),start=startOfDay(new Date(earliestStart()+'T12:00:00'));
    const span=Math.min(730,Math.round((today-start)/86400000));
    let best=0,run=0;
    for(let i=span;i>=0;i--){
      const s=dayScore(addDays(today,-i));
      if(s.planned===0)continue;
      if(s.credit>=1||(s.credit>0&&s.planned===1))run++;
      else if(i!==0)run=0;
      best=Math.max(best,run);
    }
    let current=0;
    for(let i=0;i<=span;i++){
      const s=dayScore(addDays(today,-i));
      if(s.planned===0)continue;
      if(s.credit>0)current++;
      else if(i===0)continue;
      else break;
    }
    return {current,best:Math.max(best,current)};
  }
  function habitStreak(h){
    const today=startOfDay(new Date());
    if(habitMode(h)==='3x'){
      // Consecutive weeks where the weekly norm was met.
      let n=0;
      for(let w=0;w<104;w++){
        const end=addDays(today,-w*7-((today.getDay()+6)%7)+6),begin=addDays(end,-6);
        let done=0,days=0;
        for(let i=0;i<7;i++){const d=addDays(begin,i);if(d>today||!habitExistsOnDate(h,d))continue;days++;done+=credit(h,dkey(d))>=1?1:0}
        if(!days)break;
        if(done>=Math.min(3,days))n++;else if(w!==0)break;
      }
      return {n,unit:'week'};
    }
    let n=0;
    for(let i=0;i<730;i++){
      const d=addDays(today,-i);
      if(!habitExistsOnDate(h,d))break;
      if(!habitScheduledOnDate(h,d))continue;
      if(credit(h,dkey(d))>=1)n++;
      else if(i===0)continue;
      else break;
    }
    return {n,unit:'day'};
  }
  function streakLabel(s){return s.unit==='week'?num(s.n)+' '+plural(s.n,['нед.','нед.','нед.'],['wk','wks']):num(s.n)+' '+plural(s.n,['день','дня','дней'],['day','days'])}
  function totalCompletions(){return Object.values(state.checks||{}).filter(v=>v===true).length}
  function timeGroup(h){
    const tm=h.reminderEnabled?C.times(h)[0]:'';
    if(!tm)return 'any';
    const hr=Number(tm.slice(0,2));
    return hr<12?'morning':hr<17?'day':'evening';
  }
  const GROUPS=()=>[['morning','☀️',t('Утро','Morning')],['day','🌤️',t('День','Afternoon')],['evening','🌙',t('Вечер','Evening')],['any','✦',t('В любое время','Anytime')]];

  /* ---------- small components ---------- */
  function ring(p,size,stroke,cls=''){
    const v=Math.max(0,Math.min(100,Number(p)||0));
    return `<svg class="v5-ring ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><circle class="v5-ring-track" cx="50" cy="50" r="${50-stroke/2}" stroke-width="${stroke}"/>${v>0?`<circle class="v5-ring-val" cx="50" cy="50" r="${50-stroke/2}" stroke-width="${stroke}" pathLength="100" stroke-dasharray="${v} 100"/>`:''}</svg>`;
  }
  const bar=(p,cls='')=>`<div class="v5-bar ${cls}"><i style="width:${Math.max(0,Math.min(100,p))}%"></i></div>`;
  const chev='<svg class="v5-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const checkSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  function avatarBtn(){return `<button class="v5-avatar" data-nav="profile" aria-label="${t('Профиль','Profile')}">${rvAvatarMarkup(state.profile?.name||'R')}</button>`}
  function header(title,sub,right=''){return `<header class="v5-head"><div class="v5-head-copy">${sub?`<p>${sub}</p>`:''}<h1>${title}</h1></div><div class="v5-head-actions">${right}</div></header>`}
  function empty(icon,title,text,action=''){return `<div class="v5-empty"><div class="v5-empty-icon">${icon}</div><b>${title}</b><span>${text}</span>${action}</div>`}

  function habitRow(h,opts={}){
    const k=todayKey(),scheduled=habitScheduledOnDate(h,new Date()),count=C.numeric(h),e=C.entry(h,k),done=scheduled&&doneToday(h.id);
    const col=colorOf(h),st=habitStreak(h);
    const meta=[];
    if(count)meta.push(`${dec(e.value)} / ${dec(e.target)} ${esc(e.unit)}`);
    else if(opts.plan)meta.push(freqLabel(h));
    if(st.n>0)meta.push('🔥 '+streakLabel(st));
    if(h.reminderEnabled&&C.times(h).length)meta.push('🔔 '+C.times(h).slice(0,2).join(', '));
    const goal=linkedGoal(h);if(goal&&!opts.compact)meta.push('🎯 '+esc(goal.name));
    if(opts.plan&&!scheduled)meta.push(t('сегодня не по плану','not planned today'));
    const action=!scheduled?'':count?`<button class="v5-plus" data-nx="plus" data-id="${h.id}" aria-label="${t('Добавить','Add')} ${dec(C.increment(h))}">+${dec(C.increment(h))}</button>`
      :`<button class="v5-check ${done?'on':''}" data-nx="check" data-id="${h.id}" aria-pressed="${done}" aria-label="${done?t('Снять отметку','Undo'):t('Отметить выполненной','Mark as done')}: ${esc(h.name)}">${done?checkSvg:''}</button>`;
    return `<div class="v5-habit ${done?'done':''}" style="--hc:${col}">
      <button class="v5-habit-open" data-nx="habit" data-id="${h.id}" aria-label="${esc(h.name)}">
        <span class="v5-habit-icon" style="background:${tint(col,.18)}">${emojiOf(h)}</span>
        <span class="v5-habit-copy"><b>${esc(h.name)}</b><small>${meta.join(' · ')||freqLabel(h)}</small>${count&&scheduled?bar(e.value/e.target*100,'thin'):''}</span>
      </button>${action}</div>`;
  }
  function taskRow(g){
    const done=goalIsComplete(g);
    return `<div class="v5-habit ${done?'done':''}" style="--hc:#7B5CFF"><button class="v5-habit-open" data-nx="edit-task" data-id="${g.id}"><span class="v5-habit-icon" style="background:rgba(123,92,255,.16)">📌</span><span class="v5-habit-copy"><b>${esc(g.name)}</b><small>${g.deadline?fmtDate(g.deadline):t('Без срока','No date')}${g.reminderEnabled&&g.reminderTime?' · 🔔 '+esc(g.reminderTime):''}</small></span></button><button class="v5-check ${done?'on':''}" data-nx="task-check" data-id="${g.id}" aria-pressed="${done}" aria-label="${t('Отметить дело','Toggle task')}">${done?checkSvg:''}</button></div>`;
  }
  function goalInfo(g){
    if(g.type==='money')return `${num(g.currentAmount)} / ${num(g.targetAmount)} ₽`;
    if(g.type==='quantity')return `${dec(g.currentValue)} / ${dec(g.targetValue)} ${esc(g.unit)}`;
    if(!g.steps.length)return t('Добавь первый этап','Add the first step');
    const doneN=g.steps.filter(s=>s.done).length;
    return lang()==='en'?`${doneN} / ${g.steps.length} steps`:`${doneN} / ${g.steps.length} ${plural(g.steps.length,['этап','этапа','этапов'],[])}`;
  }
  function goalCard(g){
    const p=goalPct(g),icon=g.type==='money'?'💰':g.type==='quantity'?'📈':'🎯',linked=linkedHabitsForGoal(g.id).length;
    return `<button class="v5-goal" data-nx="goal" data-id="${g.id}">
      <span class="v5-goal-ring">${ring(p,58,10)}<em>${icon}</em></span>
      <span class="v5-goal-copy"><b>${esc(g.name)}</b><small>${goalInfo(g)}</small>${bar(p,'thin')}
      <span class="v5-goal-tags"><i class="${g.deadline&&dueLabel(g.deadline)===t('Срок прошёл','Overdue')?'warn':''}">${dueLabel(g.deadline)}</i>${linked?`<i>🔗 ${nHabits(linked)}</i>`:''}</span></span>
      <strong>${p}%</strong></button>`;
  }

  /* ---------- TODAY ---------- */
  const HOME_KEYS=['summary','tasks','habits','next','goals','steps','shared'];
  function homePrefs(){
    const raw=state.profile.homeLayout||{mode:'expanded'},clean=list=>[...new Set((Array.isArray(list)?list:[]).filter(k=>HOME_KEYS.includes(k)))];
    return {mode:raw.mode==='simple'?'simple':'expanded',simple:Array.isArray(raw.simple)?clean(raw.simple):['summary','habits'],expanded:Array.isArray(raw.expanded)?clean(raw.expanded):[...HOME_KEYS]};
  }
  function greeting(){
    const h=new Date().getHours(),name=(state.profile?.name||'').trim();
    const g=h<5?t('Доброй ночи','Good night'):h<12?t('Доброе утро','Good morning'):h<18?t('Добрый день','Good afternoon'):t('Добрый вечер','Good evening');
    return esc(name&&name!=='Пользователь'?`${g}, ${name}`:g)+' 👋';
  }
  function weekStrip(){
    const now=startOfDay(new Date()),monday=addDays(now,-((now.getDay()+6)%7));
    return `<div class="v5-week" role="group" aria-label="${t('Эта неделя','This week')}">`+Array.from({length:7},(_,i)=>{
      const d=addDays(monday,i),k=dkey(d),future=d>now,s=future?{p:null}:dayScore(d);
      return `<div class="v5-day ${k===todayKey()?'today':''} ${future?'future':''}" aria-label="${fmtDate(k,{weekday:'long',day:'numeric'})}: ${s.p===null?'—':s.p+'%'}"><span>${new Intl.DateTimeFormat(loc(),{weekday:'short'}).format(d).replace('.','')}</span><div class="v5-day-ring">${ring(s.p||0,34,12,s.p===100?'full':'')}<b>${d.getDate()}</b></div></div>`;
    }).join('')+'</div>';
  }
  function today(){
    const planned=scheduledHabitsToday(),k=todayKey();
    const creditSum=planned.reduce((n,h)=>n+credit(h,k),0),done=planned.filter(h=>doneToday(h.id)).length;
    const p=planned.length?Math.round(creditSum/planned.length*100):0,left=planned.length-done,st=streaks();
    const tasks=state.goals.filter(g=>g.type==='task'&&!goalIsComplete(g)&&(!g.deadline||g.deadline<=k));
    let title,sub;
    if(!planned.length){title=t('Начни с одной привычки','Start with one habit');sub=t('Маленькое ежедневное действие — лучший старт.','One small daily action is the best start.')}
    else if(p>=100){title=t('День закрыт! 🎉','Day complete! 🎉');sub=st.current>1?t(`Серия ${nDays(st.current)} подряд — так держать.`,`${nDays(st.current)} in a row — keep it up.`):t('Все привычки на сегодня выполнены.','All habits for today are done.')}
    else if(done===0&&p===0){title=t('Сделай первый шаг','Make the first move');sub=t(`Сегодня по плану: ${nHabits(planned.length)}.`,`Planned today: ${nHabits(planned.length)}.`)}
    else{title=lang()==='en'?`${left} ${left===1?'habit':'habits'} left`:`${plural(left,['Осталась','Осталось','Осталось'],[])} ${nHabits(left)}`;sub=t('Ты на верном пути — ещё немного.','You are on track — almost there.')}
    const groups=GROUPS().map(([key,icon,label])=>{
      const list=planned.filter(h=>timeGroup(h)===key);if(!list.length)return '';
      const d=list.filter(h=>doneToday(h.id)).length;
      return `<section class="v5-card v5-group"><div class="v5-group-head"><span>${icon} ${label}</span><small>${d} ${t('из','of')} ${list.length}</small></div>${list.map(h=>habitRow(h,{compact:true})).join('')}</section>`;
    }).join('');
    const goal=nearestGoal&&nearestGoal();
    const goalTile=goal&&goal.type!=='task'?`<button class="v5-card v5-tile" data-nx="goal" data-id="${goal.id}"><span class="v5-cap">${t('Ближайшая цель','Next goal')}</span><b>${esc(goal.name)}</b>${bar(goalPct(goal),'thin')}<small>${goalPct(goal)}% · ${dueLabel(goal.deadline)}</small></button>`
      :`<button class="v5-card v5-tile" data-nx="new-goal"><span class="v5-cap">${t('Цель','Goal')}</span><b>${t('Поставь цель','Set a goal')}</b><small>${t('Свяжи её с привычками','Link it to your habits')}</small></button>`;
    const connected=activityConnected();
    const stepsTile=`<div class="v5-card v5-tile v5-steps-tile"><button class="v5-tile-hit" ${connected?'data-nav="activity"':'data-nx="health-access"'} aria-label="${t('Шаги','Steps')}"></button><span class="v5-cap">${t('Шаги','Steps')}</span><div class="v5-steps-row">${ring(connected?stepPct():0,46,14,'v5-green')}<div><b>${connected?num(state.activity.steps):'—'}</b><small>${connected?t('из ','of ')+num(state.activity.stepGoal):t('Подключить','Connect')}</small></div></div>${healthKitDisclosure(true)}</div>`;
    const lay=homePrefs(),visible=lay[lay.mode];
    const nextGoal=state.goals.find(g=>g.type==='regular'&&!goalIsComplete(g)&&g.steps.some(x=>!x.done));
    const activeGoals=state.goals.filter(g=>g.type!=='task'&&!goalIsComplete(g));
    const blocks={
      summary:()=>`${weekStrip()}<section class="v5-focus ${p>=100?'complete':''}">
        <div class="v5-focus-ring">${ring(p,112,11,'v5-focusring')}<div><strong>${p}<small>%</small></strong><span>${planned.length?`${done} ${t('из','of')} ${planned.length}`:'—'}</span></div></div>
        <div class="v5-focus-copy"><span class="v5-cap">${t('Фокус дня','Daily focus')}</span><h2>${title}</h2><p>${sub}</p>${planned.length||visible.includes('habits')?'':`<button class="v5-btn small" data-nx="new-habit">＋ ${t('Добавить привычку','Add a habit')}</button>`}</div>
      </section>`,
      tasks:()=>tasks.length?`<section class="v5-card v5-group"><div class="v5-group-head"><span>📌 ${t('Дела на сегодня','Tasks for today')}</span><small>${tasks.length}</small></div>${tasks.map(taskRow).join('')}</section>`:'',
      habits:()=>groups||(planned.length?'':`<section class="v5-card">${empty('✨',t('Сегодня привычек нет','No habits today'),state.habits.length?t('По расписанию на сегодня ничего не запланировано.','Nothing is scheduled for today.'):t('Добавь первую привычку — например, «Вода 8 стаканов» или «Читать 20 минут».','Add your first habit — e.g. “Water, 8 glasses” or “Read 20 minutes”.'),`<button class="v5-btn" data-nx="new-habit">＋ ${t('Новая привычка','New habit')}</button>`)}</section>`),
      next:()=>nextGoal?`<button class="v5-card v5-next" data-nx="goal" data-id="${nextGoal.id}"><span class="v5-habit-icon" style="background:rgba(123,92,255,.18)">🎯</span><span class="v5-habit-copy"><span class="v5-cap">${t('Следующий этап','Next step')}</span><b>${esc(nextGoal.steps.find(x=>!x.done).name)}</b><small>${esc(nextGoal.name)} · ${goalPct(nextGoal)}%</small></span>${chev}</button>`:'',
      goals:()=>activeGoals.length?`<div class="v5-goals">${activeGoals.slice(0,2).map(goalCard).join('')}</div>`:goalTile,
      steps:()=>stepsTile,
      shared:()=>window.RivayaAccountUI?.friendsEntry?.(true)||''
    };
    return `<div class="v5 nx-screen nx-home ${lay.mode} v5-today">
      ${header(t('Сегодня','Today'),greeting(),`<button class="v5-streak" data-nav="progress" aria-label="${t('Серия','Streak')}: ${nDays(st.current)}">🔥 ${num(st.current)}</button>${avatarBtn()}`)}
      <p class="v5-date">${esc(new Intl.DateTimeFormat(loc(),{weekday:'long',day:'numeric',month:'long'}).format(new Date()))}</p>
      ${visible.map(k=>`<div class="v5-block" data-home-block="${k}">${blocks[k]()}</div>`).join('')}
      ${!visible.includes('steps')&&window.RIVAYA_IOS?`<div class="v5-steps-strip"><button ${connected?'data-nav="activity"':'data-nx="health-access"'}>👟 ${connected?`${num(state.activity.steps)} / ${num(state.activity.stepGoal)}`:t('Подключить шаги','Connect steps')}</button>${healthKitDisclosure(true)}</div>`:''}
      ${visible.length?'':`<section class="v5-card">${empty('🧩',t('Главный экран пуст','Your home is empty'),t('Выбери блоки в Профиле → Главный экран.','Choose blocks in Profile → Home screen.'),`<button class="v5-btn" data-nx="home-settings">${t('Настроить','Customize')}</button>`)}</section>`}
    </div>`;
  }

  /* ---------- PLAN ---------- */
  function plan(){
    const f=ui.planFilter;
    const tasks=state.goals.filter(g=>g.type==='task'&&!goalIsComplete(g));
    const goals=state.goals.filter(g=>g.type!=='task'&&!goalIsComplete(g));
    const finished=state.goals.filter(g=>goalIsComplete(g)&&(f==='all'||(f==='goals'&&g.type!=='task')));
    const active=state.habits.filter(h=>!h.endDate||h.endDate>=todayKey()),ended=state.habits.filter(h=>h.endDate&&h.endDate<todayKey());
    const seg=[['all',t('Всё','All')],['habits',t('Привычки','Habits')],['goals',t('Цели','Goals')]].map(([v,l])=>`<button data-nx="plan-filter" data-filter="${v}" aria-pressed="${f===v}">${l}</button>`).join('');
    const section=(title,count,body,add)=>`<section class="v5-section"><div class="v5-section-head"><h2>${title}<span>${count}</span></h2>${add}</div>${body}</section>`;
    const habitsHtml=active.length?`<div class="v5-card v5-list">${active.map(h=>habitRow(h,{plan:true})).join('')}</div>`:`<div class="v5-card">${empty('🌱',t('Пока нет привычек','No habits yet'),t('Привычка — действие, которое ты повторяешь.','A habit is an action you repeat.'),`<button class="v5-btn" data-nx="new-habit">＋ ${t('Привычка','Habit')}</button>`)}</div>`;
    const goalsHtml=goals.length?`<div class="v5-goals">${goals.map(goalCard).join('')}</div>`:`<div class="v5-card">${empty('🎯',t('Пока нет целей','No goals yet'),t('Цель — результат, к которому идёшь: этапы, сумма или количество.','A goal is a result: milestones, savings or a quantity.'),`<button class="v5-btn" data-nx="new-goal">＋ ${t('Цель','Goal')}</button>`)}</div>`;
    return `<div class="v5 nx-screen v5-plan">
      ${header(t('План','Plan'),t('Привычки, цели и дела','Habits, goals and tasks'),`<button class="v5-round-add" data-v5="home-add" aria-label="${t('Добавить','Add')}">＋</button>${avatarBtn()}`)}
      <div class="v5-seg" role="group">${seg}</div>
      ${f==='all'&&tasks.length?section(t('Дела','Tasks'),tasks.length,`<div class="v5-card v5-list">${tasks.map(taskRow).join('')}</div>`,`<button class="v5-link" data-nx="new-task">＋ ${t('Дело','Task')}</button>`):''}
      ${f!=='goals'?section(t('Привычки','Habits'),active.length,habitsHtml,`<button class="v5-link" data-nx="new-habit">＋ ${t('Привычка','Habit')}</button>`):''}
      ${f!=='habits'?section(t('Цели','Goals'),goals.length,goalsHtml,`<button class="v5-link" data-nx="new-goal">＋ ${t('Цель','Goal')}</button>`):''}
      ${f!=='goals'&&ended.length?`<details class="v5-card v5-done-list"><summary>${t('Завершённые привычки','Finished habits')} · ${ended.length}</summary>${ended.map(h=>habitRow(h,{plan:true})).join('')}</details>`:''}
      ${finished.length?`<details class="v5-card v5-done-list nx-completed"><summary>${t('Выполненные цели и дела','Completed goals and tasks')} · ${finished.length}</summary>${finished.map(g=>g.type==='task'?taskRow(g):goalCard(g)).join('')}</details>`:''}
      ${f!=='habits'&&window.RivayaAccountUI?`<button class="v5-card v5-row-link" data-nx="account-shared">👥 ${t('Совместные цели','Shared goals')}${chev}</button>`:''}
    </div>`;
  }

  /* ---------- PROGRESS ---------- */
  function periodRange(){
    const n=ui.period,end=addDays(new Date(),-ui.offset*n);
    return Array.from({length:n},(_,i)=>addDays(end,-n+1+i));
  }
  function periodStats(endDate,n){
    let target=0,done=0;
    state.habits.forEach(h=>{const s=habitStats(h,n,endDate);target+=s.target;done+=s.done});
    return {target,done,p:target?Math.min(100,Math.round(done/target*100)):null};
  }
  function heatmap(){
    const now=startOfDay(new Date()),weeks=15,lastMonday=addDays(now,-((now.getDay()+6)%7)),first=addDays(lastMonday,-(weeks-1)*7);
    let cols='';
    for(let w=0;w<weeks;w++){
      cols+='<div class="v5-heat-col">';
      for(let d=0;d<7;d++){
        const day=addDays(first,w*7+d),future=day>now,s=future?null:dayScore(day);
        const lvl=!s||s.p===null?(future?'f':'0'):s.p===0?'0':s.p<34?'1':s.p<67?'2':s.p<100?'3':'4';
        cols+=`<i data-l="${lvl}" class="${dkey(day)===todayKey()?'today':''}" title="${fmtDate(dkey(day))}${s&&s.p!==null?': '+s.p+'%':''}"></i>`;
      }
      cols+='</div>';
    }
    return `<div class="v5-heat" role="img" aria-label="${t('Календарь активности за 15 недель','Activity calendar, 15 weeks')}">${cols}</div>`;
  }
  function bestWeekday(){
    const sum=Array(7).fill(0),cnt=Array(7).fill(0),now=new Date();
    for(let i=1;i<=56;i++){const d=addDays(now,-i),s=dayScore(d);if(s.p===null)continue;const w=(d.getDay()+6)%7;sum[w]+=s.p;cnt[w]++}
    let best=-1,bv=-1;for(let w=0;w<7;w++)if(cnt[w]>=2&&sum[w]/cnt[w]>bv){bv=sum[w]/cnt[w];best=w}
    if(best<0||bv<=0)return '';
    const name=new Intl.DateTimeFormat(loc(),{weekday:'long'}).format(addDays(new Date(2024,0,1),best));
    return t(`💡 Лучше всего у тебя получается: ${name}`,`💡 Your strongest day: ${name}`);
  }
  function progress(){
    const range=periodRange(),n=ui.period,end=range[range.length-1];
    const cur=periodStats(end,n),prev=periodStats(addDays(end,-n),n);
    const p=cur.p??0,st=streaks();
    const message=cur.p===null?t('Здесь появится твой прогресс','Your progress will appear here'):p>=85?t('Отличный результат!','Excellent work!'):p>=60?t('Ты на верном пути','You are on track'):p>=30?t('Хорошее начало — не останавливайся','Good start — keep going'):t('Каждый день — новый шанс','Every day is a new chance');
    const change=cur.p!==null&&prev.p!==null?cur.p-prev.p:null;
    const periodName=n===7?t('к прошлой неделе','vs last week'):n===30?t('к прошлому месяцу','vs last month'):t('к прошлому году','vs last year');
    // Bars
    let bins;
    if(n===365){bins=Array.from({length:12},(_,i)=>{const m=new Date(end.getFullYear(),end.getMonth()-11+i,1,12),last=new Date(m.getFullYear(),m.getMonth()+1,0,12);let pl=0,c=0;for(let d=new Date(m);d<=last&&d<=end;d.setDate(d.getDate()+1)){const s=dayScore(d);pl+=s.planned;c+=s.credit}return {label:new Intl.DateTimeFormat(loc(),{month:'narrow'}).format(m),p:pl?Math.round(c/pl*100):null,title:new Intl.DateTimeFormat(loc(),{month:'long'}).format(m)}})}
    else bins=range.map((d,i)=>({label:n===7?new Intl.DateTimeFormat(loc(),{weekday:'short'}).format(d).replace('.',''):(i%5===4||i===n-1?String(d.getDate()):''),p:dayScore(d).p,title:fmtDate(dkey(d)),today:dkey(d)===todayKey()}));
    const bars=bins.map(b=>`<div class="v5-col nx-report-bar ${b.today?'today':''}" title="${b.title}: ${b.p===null?'—':b.p+'%'}"><div><i style="height:${b.p?Math.max(4,b.p):0}%"></i></div><small>${b.label}</small></div>`).join('');
    const habits=state.habits.map(h=>({h,s:habitStats(h,n,end),st:habitStreak(h)})).filter(x=>x.s.target>0).sort((a,b)=>b.s.p-a.s.p);
    const habitsHtml=habits.map(({h,s,st})=>`<button class="nx-report-habit v5-hstat" data-nx="habit" data-id="${h.id}" style="--hc:${colorOf(h)}"><span class="v5-habit-icon" style="background:${tint(colorOf(h),.18)}">${emojiOf(h)}</span><span class="v5-habit-copy"><span class="v5-between"><b>${esc(h.name)}</b><strong>${s.p}%</strong></span>${bar(s.p,'thin')}<small>${num(s.done)} ${t("из","of")} ${num(s.target)}${st.n?` · 🔥 ${streakLabel(st)}`:''}</small></span></button>`).join('');
    const connected=activityConnected(),daily=state.activity.dailySteps||{};
    const known=connected?range.map(dkey).filter(k=>Object.hasOwn(daily,k)):[];
    const steps=known.reduce((a,k)=>a+Math.max(0,Number(daily[k])||0),0);
    const bestDay=known.reduce((b,k)=>!b||Number(daily[k])>Number(daily[b])?k:b,'');
    const goals=state.goals.filter(g=>g.type!=='task'&&!goalIsComplete(g));
    const label=`${fmtDate(dkey(range[0]))} — ${fmtDate(dkey(end))}`;
    return `<div class="v5 nx-screen v5-progress">
      ${header(t('Прогресс','Progress'),t('Твоя статистика','Your statistics'),avatarBtn())}
      <div class="v5-seg" role="group">${[[7,t('Неделя','Week')],[30,t('Месяц','Month')],[365,t('Год','Year')]].map(([v,l])=>`<button data-nx="period" data-period="${v}" aria-pressed="${n===v}">${l}</button>`).join('')}</div>
      <div class="v5-range nx-report-range"><button data-nx="report-prev" aria-label="${t('Раньше','Earlier')}">‹</button><b>${label}</b><button data-nx="report-next" ${ui.offset===0?'disabled':''} aria-label="${t('Позже','Later')}">›</button></div>
      <section class="v5-hero">
        <div class="v5-focus-ring">${ring(p,104,11,'v5-green')}<div><strong>${cur.p===null?'—':p}<small>${cur.p===null?'':'%'}</small></strong></div></div>
        <div class="v5-focus-copy"><h2>${message}</h2>${change!==null?`<span class="v5-change ${change<0?'down':''}">${change>=0?'▲ +':'▼ '}${change}% ${periodName}</span>`:''}<p>${cur.target?`${num(cur.done)} ${t("из","of")} ${num(cur.target)} ${t('выполнений','completions')}`:t('Сделай первые отметки — без выдуманных процентов.','Make your first check-ins — no made-up numbers.')}</p></div>
      </section>
      <div class="v5-kpis"><div class="v5-card"><span>🔥</span><b>${num(st.current)}</b><small>${t('Текущая серия','Current streak')}</small></div><div class="v5-card"><span>🏆</span><b>${num(st.best)}</b><small>${t('Лучшая серия','Best streak')}</small></div><div class="v5-card"><span>✅</span><b>${num(totalCompletions())}</b><small>${t('Всего отметок','Total check-ins')}</small></div></div>
      <section class="v5-card"><div class="v5-section-head"><h2>${t('Календарь активности','Activity calendar')}</h2><small>${t('15 недель','15 weeks')}</small></div>${heatmap()}<div class="v5-legend">${t('меньше','less')}<i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i>${t('больше','more')}</div></section>
      <section class="v5-card"><div class="v5-section-head"><h2>${n===365?t('По месяцам','By month'):t('По дням','By day')}</h2></div><div class="v5-cols ${n===30?'dense':''}">${bars}</div>${bestWeekday()?`<p class="v5-insight">${bestWeekday()}</p>`:''}</section>
      <section class="v5-card"><div class="v5-section-head"><h2>${t('Привычки','Habits')}</h2></div>${habitsHtml||empty('📊',t('Нет данных за период','No data for this period'),t('Добавь привычку в Плане — статистика начнётся с даты создания.','Add a habit in Plan — stats start from its creation date.'))}</section>
      <section class="v5-card v5-steps-card nx-period-steps"><div class="v5-section-head"><h2><button class="v5-step-symbol nx-step-symbol" data-nav="activity" aria-label="${t('История шагов','Step history')}">👟</button> ${t('Шаги','Steps')}</h2><button class="v5-link" data-nav="activity">${window.RIVAYA_IOS?'Apple Health':'Health Connect'} ›</button></div>${connected?`<div class="v5-kpis inner"><div><b>${known.length?num(steps):'—'}</b><small>${t('за период','this period')}</small></div><div><strong>${known.length?num(steps/known.length):'—'}</strong><small>${t('в среднем','daily avg')}</small></div><div><strong>${bestDay?num(daily[bestDay]):'—'}</strong><small>${bestDay?t('лучший: ','best: ')+fmtDate(bestDay):t('лучший день','best day')}</small></div></div><button class="v5-btn ghost" data-nav="activity">${t('История шагов','Step history')}${chev}</button>`:`<div class="v5-steps-off"><b>—</b><span>${t('шагов за период','steps this period')}</span></div><p class="v5-muted">${t('Доступ к шагам не включён. RIVAYA только читает шаги с твоего разрешения.','Step access is off. RIVAYA only reads steps with your permission.')}</p><button class="v5-btn" data-nx="health-access">${t('Подключить шаги','Connect steps')}</button>`}</section>
      ${goals.length?`<section class="v5-section" id="nx-report-goals"><div class="v5-section-head"><h2>${t('Цели','Goals')}<span>${goals.length}</span></h2></div><div class="v5-goals">${goals.map(goalCard).join('')}</div></section>`:''}
    </div>`;
  }

  /* ---------- PROFILE ---------- */
  function achievements(){
    const st=streaks(),total=totalCompletions();
    let perfect=false;for(let i=0;i<120&&!perfect;i++){const s=dayScore(addDays(new Date(),-i));if(s.p===100&&s.planned>0)perfect=true}
    const goalDone=state.goals.some(g=>g.type!=='task'&&goalIsComplete(g));
    const steps10=Object.values(state.activity?.dailySteps||{}).some(v=>Number(v)>=10000);
    return [
      ['🌱',t('Первый шаг','First step'),total>=1],
      ['⚡',t('3 дня подряд','3-day streak'),st.best>=3],
      ['🔥',t('Неделя подряд','7-day streak'),st.best>=7],
      ['✨',t('Идеальный день','Perfect day'),perfect],
      ['🎯',t('Цель достигнута','Goal reached'),goalDone],
      ['👟',t('10 000 шагов','10,000 steps'),steps10],
      ['💯',t('100 отметок','100 check-ins'),total>=100],
      ['🏆',t('30 дней подряд','30-day streak'),st.best>=30]];
  }
  function row(icon,bg,title,value,attrs,danger=false){return `<button class="v5-set ${danger?'danger':''}" ${attrs}><span class="v5-set-icon" style="background:${bg}">${icon}</span><span class="v5-set-title">${title}</span><span class="v5-set-value">${value}</span>${chev}</button>`}
  function profile(){
    const name=(state.profile?.name||'').trim()||t('Пользователь','User'),st=streaks(),ach=achievements(),got=ach.filter(a=>a[2]).length;
    const since=Math.max(1,Math.round((startOfDay(new Date())-startOfDay(new Date(earliestStart()+'T12:00:00')))/86400000)+1);
    const theme={system:t('Системная','System'),light:t('Светлая','Light'),dark:t('Тёмная','Dark')}[state.profile.theme||'dark'];
    const language={auto:t('Как в телефоне','Device'),ru:'Русский',en:'English'}[state.profile.language||'auto'];
    const health=activityConnected();
    const review=window.RIVAYA_IOS?'https://apps.apple.com/app/id6823716293?action=write-review':'https://play.google.com/store/apps/details?id=app.rivaya.smart01';
    return `<div class="v5 nx-screen v5-profile">
      ${window.RivayaAccountUI?.profile?.()||''}
      <section class="v5-me">
        <button class="v5-me-avatar" data-avatar-pick aria-label="${t('Фото профиля','Profile photo')}">${rvAvatarMarkup(name)}<span class="v5-me-cam">📷</span></button>
        <h1>${esc(name)}</h1>
        <p>${t(`В RIVAYA ${nDays(since)}`,`With RIVAYA for ${nDays(since)}`)}</p>
        <button class="v5-link" data-nx="profile-name">${t('Изменить имя','Edit name')}</button>
      </section>
      <div class="v5-kpis"><div class="v5-card"><span>🔥</span><b>${num(st.current)}</b><small>${t('Серия','Streak')}</small></div><div class="v5-card"><span>🏆</span><b>${num(st.best)}</b><small>${t('Рекорд','Best')}</small></div><div class="v5-card"><span>✅</span><b>${num(totalCompletions())}</b><small>${t('Отметок','Check-ins')}</small></div></div>
      <section class="v5-card"><div class="v5-section-head"><h2>${t('Достижения','Achievements')}</h2><small>${got} ${t('из','of')} ${ach.length}</small></div><div class="v5-badges">${ach.map(([e,l,on])=>`<div class="v5-badge ${on?'on':''}" aria-label="${l}: ${on?t('получено','unlocked'):t('пока закрыто','locked')}"><span>${e}</span><small>${l}</small></div>`).join('')}</div></section>
      <div class="v5-group-label">${t('Настройки','Settings')}</div>
      <section class="v5-card v5-settings">
        ${row('🔔','#E5484D',t('Напоминания','Reminders'),(state.reminders?.enabled||state.habits.some(h=>h.reminderEnabled)||state.goals.some(g=>g.reminderEnabled))?t('Вкл.','On'):t('Выкл.','Off'),'data-open="reminderModal"')}
        ${row('🌙','#5B5BD6',t('Тихие часы','Quiet hours'),state.reminders?.quietEnabled?`${esc(state.reminders.quietStart)}–${esc(state.reminders.quietEnd)}`:t('Выкл.','Off'),'data-nx="notifications"')}
        ${row('🏠','#2563EB',t('Главный экран','Home screen'),homePrefs().mode==='simple'?t('Простой','Simple'):t('Расширенный','Expanded'),'data-nx="home-settings"')}
        ${row('🎨','#7B5CFF',t('Внешний вид','Appearance'),theme,'data-nx="appearance"')}
        ${row('🌐','#0EA5A4',t('Язык','Language'),language,'data-nx="language"')}
      </section>
      <div class="v5-group-label">${t('Данные и здоровье','Data and health')}</div>
      <section class="v5-card v5-settings">
        ${row('❤️','#E5487A',window.RIVAYA_IOS?'Apple Health':'Health Connect',health?t('Подключено','Connected'):t('Не подключено','Off'),'data-nav="activity"')}
        ${row('👟','#16A34A',t('Цель по шагам','Step goal'),num(state.activity.stepGoal),'data-nx="step-target"')}
        ${row('💾','#1E6FD9',t('Резервная копия','Backup'),t('Файл','File'),'data-nx="backup"')}
      </section>
      <div class="v5-group-label">${t('Приложение','App')}</div>
      <section class="v5-card v5-settings">
        ${row('⭐','#F59E0B',t('Оценить RIVAYA','Rate RIVAYA'),'',`data-external="${review}"`)}
        ${row('✉️','#6B7280',t('Поддержка','Support'),'support@rivayaapp.com','data-external="mailto:support@rivayaapp.com"')}
        ${row('🔒','#4B5563',t('Конфиденциальность','Privacy'),'','data-privacy')}
        ${row('🗑️','#7F1D1D',t('Удалить данные','Delete data'),'','data-v5="reset"',true)}
      </section>
      <p class="v5-muted v5-note">${t('Все данные хранятся только на этом телефоне. Делай резервную копию перед сменой устройства.','All data is stored only on this phone. Make a backup before switching devices.')}</p>
      <footer class="v5-foot"><b>RIVAYA ${VERSION}</b><span>${t('Цели · привычки · прогресс','Goals · habits · progress')}</span><button class="v5-link" data-external="https://www.instagram.com/_isma_guder_/">${t('Автор','Author')}: @_isma_guder_</button></footer>
    </div>`;
  }

  /* ---------- routes & actions ---------- */
  Object.assign(U.extensions,{today,plan,habits:plan,goals:plan,progress,stats:progress,calendar:progress,profile});

  window.addEventListener('click',e=>{
    const el=e.target.closest('[data-v5],[data-nx="plan-filter"],[data-nx="period"],[data-nx="report-prev"],[data-nx="report-next"]');if(!el)return;
    const a=el.dataset.v5||el.dataset.nx;
    // Only screens rendered by this layer use these controls; detail screens keep next-ui behaviour.
    if(!el.dataset.v5&&!el.closest('.v5'))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(a==='plan-filter')ui.planFilter=['habits','goals'].includes(el.dataset.filter)?el.dataset.filter:'all';
    else if(a==='period'){ui.period=[7,30,365].includes(Number(el.dataset.period))?Number(el.dataset.period):7;ui.offset=0}
    else if(a==='report-prev'||a==='report-next')ui.offset=Math.max(0,Math.min(120,ui.offset+(a==='report-prev'?1:-1)));
    else if(a==='home-add'){document.querySelector('.rv-nav-quick')?.click();return}
    else if(a==='reset'){document.getElementById('resetBtn')?.click()||legacyReset();return}
    render();
  },true);
  // The profile no longer renders the legacy #resetBtn, so keep a hidden one wired to the original handler.
  if(!document.getElementById('resetBtn')){const b=document.createElement('button');b.id='resetBtn';b.hidden=true;document.body.appendChild(b)}
  function legacyReset(){}

  /* ---------- localize static dialogs (index.html is Russian) ---------- */
  const STATIC={
    en:{
      title:'RIVAYA — goals and habits',splash:'Goals • Habits • Progress',
      onboardingTitle:'Set up RIVAYA in a minute',onbSub:'You can change your name and step goal later.',onboardingName:['What should we call you?','Name'],onboardingStepGoal:['Daily step goal'],
      onbPoints:['✓ Goals and habits','✓ Real steps','✓ Reminders','✓ Backup'],onbBtn:['Start','All features are free'],
      reminderTitle:'Reminders',remOn:['Turn on reminders','RIVAYA will remind you at the times you choose'],reminderTime1:['First time'],reminderTime2:['Second time'],reminderTime3:['Third time'],
      quietOn:['Quiet hours','Do not disturb at night'],quietStart:['From'],quietEnd:['Until'],saveRemindersBtn:'Save',testReminderBtn:'Test notification',
      remNote:'General reminders, habits and goals work independently. Quiet hours block notifications during the selected night interval.',
      healthInfoTitle:'Apple Health and HealthKit',healthInfoDescription:'With your permission, RIVAYA reads your step count from Apple Health via HealthKit to show your activity and progress.',healthInfo2:'Connecting is optional. The app only reads steps, never changes Health data and never shares it with the developer or advertisers.',healthInfoOk:'Got it',
      healthAccessTitle:'Connect automatic steps',healthCopy:'RIVAYA will ask your phone for access to your step count. After that, steps update automatically — nothing to enter by hand.',requestHealthBtn:'Allow access',
      healthPoints:[['✓ Only with your permission','You turn access on yourself.'],['✓ Steps cannot be edited in the app','RIVAYA shows data from the system activity source.'],['✓ You can enable it later','If you decline, the button stays in the Activity section.']]
    }
  };
  const ruCache=new Map();
  function setText(sel,val){const el=typeof sel==='string'?document.querySelector(sel):sel;if(!el||val==null)return;if(!ruCache.has(el))ruCache.set(el,el.textContent);el.textContent=val}
  function setLabel(inputId,val){const inp=document.getElementById(inputId);const lab=inp?.closest('label');if(!lab)return;const node=[...lab.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(!node)return;if(!ruCache.has(node))ruCache.set(node,node.textContent);node.textContent=val[0];if(val[1]!==undefined&&inp.placeholder!==undefined){if(!ruCache.has(inp))ruCache.set(inp,inp.placeholder);inp.placeholder=val[1]}}
  function toggleRow(inputId,val){const lab=document.getElementById(inputId)?.closest('label');if(!lab)return;const b=lab.querySelector('b'),s=lab.querySelector('small');if(b)setText(b,val[0]);if(s)setText(s,val[1])}
  let lastLang='';
  function localizeStatic(){
    const l=lang();if(l===lastLang)return;lastLang=l;
    if(l!=='en'){ruCache.forEach((v,el)=>{if(el.nodeType===3||!('placeholder' in el)||el.tagName!=='INPUT')el.textContent=v;else el.placeholder=v});document.title='RIVAYA — цели и привычки';return}
    const s=STATIC.en;document.title=s.title;
    setText('.rivaya-splash-tag',s.splash);
    setText('#onboardingTitle',s.onboardingTitle);setText('#onboardingModal .modal-subtitle',s.onbSub);
    setLabel('onboardingName',s.onboardingName);setLabel('onboardingStepGoal',s.onboardingStepGoal);
    document.querySelectorAll('#onboardingModal .onboarding-points span').forEach((sp,i)=>setText(sp,s.onbPoints[i]));
    setText('#finishOnboardingBtn b',s.onbBtn[0]);setText('#finishOnboardingBtn small',s.onbBtn[1]);
    setText('#reminderTitle',s.reminderTitle);toggleRow('remindersEnabled',s.remOn);toggleRow('quietEnabled',s.quietOn);
    ['reminderTime1','reminderTime2','reminderTime3','quietStart','quietEnd'].forEach(id=>setLabel(id,s[id]));
    document.querySelectorAll('#reminderModal .optional').forEach(o=>setText(o,'optional'));
    setText('#saveRemindersBtn',s.saveRemindersBtn);setText('#testReminderBtn',s.testReminderBtn);setText('#reminderModal .fineprint',s.remNote);
    setText('#healthInfoTitle',s.healthInfoTitle);setText('#healthInfoDescription',s.healthInfoDescription);
    const hi=document.querySelectorAll('#healthInfoModal p.subtle');if(hi[1])setText(hi[1],s.healthInfo2);
    setText('#healthInfoModal .primary',s.healthInfoOk);
    setText('#healthAccessTitle',s.healthAccessTitle);setText('#healthAccessModal .permission-copy',s.healthCopy);setText('#requestHealthBtn',s.requestHealthBtn);
    document.querySelectorAll('#healthAccessModal .permission-points > div').forEach((d,i)=>{setText(d.querySelector('b'),s.healthPoints[i]?.[0]);setText(d.querySelector('span'),s.healthPoints[i]?.[1])});
    const hf=document.querySelector('#healthAccessModal .fineprint');if(hf)setText(hf,window.RIVAYA_IOS?'iOS will show the system Health permission sheet.':'Android will open the Health Connect permission screen.');
    document.querySelectorAll('.modal .close-btn').forEach(b=>b.setAttribute('aria-label','Close'));
  }


  /* ---------- HealthKit disclosure (required by App Review), localized ---------- */
  healthKitDisclosure=function(compact=false){
    if(!window.RIVAYA_IOS)return '';
    if(compact)return `<button class="health-source-summary" data-open="healthInfoModal" aria-haspopup="dialog" aria-controls="healthInfoModal" aria-label="${t('Шаги из Apple Health: информация о HealthKit','Steps from Apple Health: HealthKit information')}"><span>${t('Шаги · Apple Health','Steps · Apple Health')}</span><span class="health-source-info" aria-hidden="true">ⓘ</span></button>`;
    return `<section class="card source-card" aria-label="${t('Apple Health и HealthKit','Apple Health and HealthKit')}"><h3>${t('Шаги из Apple Health («Здоровье»)','Steps from Apple Health')}</h3><p class="subtle">${t('RIVAYA использует HealthKit, чтобы с вашего разрешения читать количество шагов из приложения «Здоровье» и показывать дневную активность и прогресс.','RIVAYA uses HealthKit to read your step count from the Health app, with your permission, to show daily activity and progress.')}</p><p class="subtle">${t('Доступ необязателен. Мы только читаем шаги, не изменяем данные «Здоровья» и не передаём их разработчику или рекламным сервисам.','Access is optional. We only read steps, never change Health data and never share it with the developer or advertisers.')}</p></section>`;
  };
  function ensureActivityDisclosure(){
    if(currentView!=='activity'||!window.RIVAYA_IOS)return;
    const view=document.getElementById('view');
    if(!view||view.querySelector('.source-card'))return;
    const note=view.querySelector('.nx-health-note');
    if(note){note.classList.add('source-card');note.setAttribute('aria-label',t('Apple Health и HealthKit','Apple Health and HealthKit'));return}
    view.insertAdjacentHTML('beforeend',healthKitDisclosure());
  }

  /* ---------- English for legacy toasts and confirms ---------- */
  const EN_MSG={'RIVAYA настроен':'RIVAYA is ready','Вставьте текст резервной копии':'Paste the backup text','Выбери время напоминания':'Choose a reminder time','Выбери хотя бы одно время':'Choose at least one time','Выберите изображение':'Choose an image','Данные восстановлены ✓':'Data restored ✓','Данные очищены':'Data deleted','Напиши название привычки':'Enter a habit name','Напиши название цели':'Enter a goal name','Напиши название этапа':'Enter a step name','Не удалось восстановить: неверный файл':'Restore failed: invalid file','Не удалось восстановить: неверный формат':'Restore failed: invalid format','Не удалось обработать фото':'Could not process the photo','Не удалось отправить тест':'Could not send the test','Не удалось прочитать файл':'Could not read the file','Отправляем тестовое уведомление':'Sending a test notification','Подтвердите доступ к шагам в системном окне':'Confirm step access in the system dialog','Привычка добавлена':'Habit added','Привычка обновлена':'Habit updated','Привычка удалена':'Habit deleted','Резервная копия готова':'Backup is ready','Резервная копия подготовлена':'Backup prepared','Резервная копия скопирована':'Backup copied','Сегодня эта привычка не запланирована':'This habit is not scheduled today','Срок не может быть раньше даты создания привычки':'The end date cannot be before the habit was created','Срок не может быть раньше сегодняшней даты':'The date cannot be in the past','Текст резервной копии выделен':'Backup text selected','Тест доступен в мобильном приложении RIVAYA':'The test works in the RIVAYA mobile app','Укажи сумму пополнения':'Enter the amount','Укажи сумму, которую хочешь накопить':'Enter the amount you want to save','Укажи целевую сумму':'Enter the target amount','Фото профиля обновлено ✓':'Profile photo updated ✓','Фото профиля удалено':'Profile photo removed','Фото слишком большое':'The photo is too large','Цель возвращена в работу':'Goal reopened','Цель обновлена':'Goal updated','Цель по шагам обновлена':'Step goal updated','Цель создана':'Goal created','Цель удалена':'Goal deleted','Шаги доступны в мобильном приложении RIVAYA':'Steps are available in the RIVAYA mobile app','Этап добавлен':'Step added','Этап обновлён':'Step updated','Этап удалён':'Step deleted',"Не удалось сохранить файл":"Could not save the file","Не удалось прочитать резервную копию":"Could not read the backup","Не удалось прочитать шаги Apple Health":"Could not read steps from Apple Health","Не удалось прочитать расписание уведомлений":"Could not read the notification schedule","Уведомления выключены. Разрешите их в настройках iPhone → RIVAYA.":"Notifications are off. Allow them in iPhone Settings \u2192 RIVAYA.","Не удалось запросить разрешение на уведомления":"Could not request notification permission","Разрешите уведомления в настройках iPhone → RIVAYA.":"Allow notifications in iPhone Settings \u2192 RIVAYA.","Тестовое уведомление появится через 3 секунды":"A test notification will appear in 3 seconds","Не удалось создать тестовое уведомление":"Could not create a test notification","Нет активных напоминаний":"No active reminders","Расписание уведомлений обновлено":"Reminder schedule updated",'Удалить все локальные данные RIVAYA?':'Delete all RIVAYA data on this device? This cannot be undone.'};
  const tr=m=>lang()==='en'&&typeof m==='string'&&EN_MSG[m]?EN_MSG[m]:m;
  if(typeof toast==='function'){const baseToast=toast;toast=function(m,...r){return baseToast(tr(m),...r)}}
  const baseStatus=window.rivayaOnNotificationStatus;
  if(typeof baseStatus==='function')window.rivayaOnNotificationStatus=function(m){baseStatus(m);const el=document.getElementById('nativeNotificationStatus');if(el&&lang()==='en')el.textContent=tr(String(m))};
  const baseConfirm=window.confirm.bind(window);window.confirm=m=>baseConfirm(tr(m));

  /* ---------- wrap render: localize + keep screen at top on tab change ---------- */
  const baseRender=render;
  let lastView='';
  render=function(){baseRender();const root=document.querySelector('#view > .v5');if(root&&currentView!==lastView)root.classList.add('v5-enter');lastView=currentView;ensureActivityDisclosure();localizeStatic();document.querySelector('.rv-nav-quick')?.setAttribute('aria-label',t('Добавить','Add'))};
  window.RivayaV5={version:VERSION,plural,streaks,habitStreak,achievements,ui};
  render();
})();
