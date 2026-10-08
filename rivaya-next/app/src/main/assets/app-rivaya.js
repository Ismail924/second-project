const STORAGE_KEY = 'rivaya-public-v1';
const LEGACY_KEYS = [];
const todayKey = () => new Date().toISOString().slice(0,10);
const ruDate = (d=new Date()) => new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(d);

const defaultState = {
  reminders:{
    enabled:false,
    times:[],
    quietEnabled:true,
    quietStart:'23:00',
    quietEnd:'08:00'
  },
  profile:{name:'',avatarData:'',onboardingDone:false},
  goalSnapshots:{},
  activity:{
    access:'denied',
    steps:0,
    stepGoal:8000,
    history:[0,0,0,0,0,0,0],
    lastSync:null,
    dailySteps:{}
  },
  goals:[],
  habits:[],
  checks:{}
};

let state = loadState();
let currentView = 'today';
let currentStatsPeriod = 'month';
let calendarWeekOffset = 0;
let deferredPrompt = null;
let editingGoalId = null;
let editingHabitId = null;

function nativeHealthAvailable(){
  try{return !!(window.VektorNative && typeof window.VektorNative.refreshSteps==='function')}catch{return false}
}
function requestNativeHealthRefresh(){
  if(!nativeHealthAvailable())return false;
  try{window.VektorNative.refreshSteps();return true}catch{return false}
}
function requestNativeHealthAccess(){
  if(!nativeHealthAvailable())return false;
  try{window.VektorNative.requestStepAccess();return true}catch{return false}
}
function openNativeHealthSettings(){
  if(!nativeHealthAvailable())return false;
  try{window.VektorNative.openHealthSettings();return true}catch{return false}
}
window.vektorOnNativeSteps=function(payload){
  try{
    const data=typeof payload==='string'?JSON.parse(payload):payload||{};
    const status=String(data.status||'denied');
    if(status==='granted'){
      state.activity.access='granted';
      state.activity.steps=Math.max(0,Math.round(Number(data.steps)||0));
      if(Array.isArray(data.history)){
        const hist=data.history.slice(-7).map(v=>Math.max(0,Math.round(Number(v)||0)));
        while(hist.length<7)hist.unshift(0);
        state.activity.history=hist;
      }else{
        // Native v26 reads today's real Health Connect total.
        // Do not keep old demo/history numbers from earlier prototypes.
        state.activity.history=[0,0,0,0,0,0,state.activity.steps];
      }
      state.activity.lastSync=new Date().toISOString();
    }else{
      state.activity.access='denied';
      state.activity.steps=0;
      if(status==='unsupported' || status==='unavailable') state.activity.nativeStatus=status;
      else delete state.activity.nativeStatus;
    }
    save();
    render();
    if(data.message && status==='error')toast(data.message);
  }catch(e){console.error('Native health update failed',e)}
};

function clone(v){return JSON.parse(JSON.stringify(v))}
function loadState(){
  try{
    let raw=localStorage.getItem(STORAGE_KEY);
    if(!raw){
      for(const key of LEGACY_KEYS){
        const old=localStorage.getItem(key);
        if(old){raw=old;break}
      }
    }
    if(!raw){const fresh=clone(defaultState);fresh.habits=(fresh.habits||[]).map(h=>({...h,createdAt:todayKey()}));return fresh;}
    const s=JSON.parse(raw);
    const merged={...clone(defaultState),...s};
    merged.activity={...defaultState.activity,...(s.activity||{})};
    merged.activity.dailySteps={...(s.activity?.dailySteps||{})};
    merged.reminders={...defaultState.reminders,...(s.reminders||{})};
    merged.profile={...defaultState.profile,...(s.profile||{})};
    merged.goalSnapshots={...(s.goalSnapshots||{})};
    if(!Array.isArray(merged.reminders.times)) merged.reminders.times=clone(defaultState.reminders.times);
    merged.reminders.times=merged.reminders.times.filter(Boolean).slice(0,3);
    if(!['granted','denied'].includes(merged.activity.access))merged.activity.access='denied';
    merged.goals=(merged.goals||[]).map(g=>{
      const copy={...g};
      if(!copy.type && (copy.id==='g3' || /накоп|сберег|руб|₽/i.test(copy.name||''))){
        copy.type='money';
        const m=String(copy.name||'').replace(/\s/g,'').match(/(\d{2,9})/);
        copy.targetAmount=Number(copy.targetAmount)||Number(m?.[1])||300000;
        copy.currentAmount=Number(copy.currentAmount)||0;
        copy.contributions=Array.isArray(copy.contributions)?copy.contributions:[];
        copy.steps=[];
        copy.status=(copy.currentAmount>=copy.targetAmount && copy.targetAmount>0)?'completed':'active';
      }else{
        copy.type=copy.type||'regular';
        copy.steps=Array.isArray(copy.steps)?copy.steps:[];
        if(copy.type==='money'){
          copy.targetAmount=Math.max(1,Number(copy.targetAmount)||0);
          copy.currentAmount=Math.max(0,Number(copy.currentAmount)||0);
          copy.contributions=Array.isArray(copy.contributions)?copy.contributions:[];
        }
      }
      copy.reminderEnabled=!!copy.reminderEnabled;
      copy.reminderTime=copy.reminderTime||'';
      return copy;
    });
    merged.checks=merged.checks||{};
    merged.habits=(merged.habits||[]).map(h=>{
      const copy={...h};
      const dates=Object.keys(merged.checks)
        .filter(k=>k.endsWith('_'+copy.id))
        .map(k=>k.slice(0,10))
        .filter(Boolean)
        .sort();
      let created=copy.createdAt||dates[0]||todayKey();
      if(dates[0] && dates[0]<created)created=dates[0];
      if(created>todayKey())created=todayKey();
      copy.createdAt=created;
      copy.endDate=copy.endDate||'';
      copy.goalId=(copy.goalId && merged.goals.some(g=>g.id===copy.goalId && g.type!=='money'))?copy.goalId:'';
      copy.reminderEnabled=!!copy.reminderEnabled;
      copy.reminderTime=copy.reminderTime||'';
      if(copy.endDate && copy.endDate<copy.createdAt)copy.endDate=copy.createdAt;
      return copy;
    });
    return merged;
  }catch{const fresh=clone(defaultState);fresh.habits=(fresh.habits||[]).map(h=>({...h,createdAt:todayKey()}));return fresh}
}
function recordDailySnapshots(){
  try{
    const k=todayKey();
    state.activity.dailySteps=state.activity.dailySteps||{};
    if(state.activity.access==='granted')state.activity.dailySteps[k]=Math.max(0,Math.round(Number(state.activity.steps)||0));
    state.goalSnapshots=state.goalSnapshots||{};
    state.goalSnapshots[k]=Object.fromEntries((state.goals||[]).map(g=>[g.id,goalPct(g)]));
    const cutoff=new Date();cutoff.setDate(cutoff.getDate()-45);const cut=dateKey(cutoff);
    Object.keys(state.activity.dailySteps).forEach(d=>{if(d<cut)delete state.activity.dailySteps[d]});
    Object.keys(state.goalSnapshots).forEach(d=>{if(d<cut)delete state.goalSnapshots[d]});
  }catch{}
}
function save(){recordDailySnapshots();localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function activityConnected(){return state.activity.access==='granted'}
function healthSource(){
  const ua=navigator.userAgent||'';
  if(/iPhone|iPad|iPod/i.test(ua))return 'Apple Health';
  if(/Android/i.test(ua))return 'Health Connect';
  return 'Системная активность';
}
function dateKey(d){const x=new Date(d);const y=x.getFullYear();const m=String(x.getMonth()+1).padStart(2,'0');const day=String(x.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function doneOnDate(id,date){return !!state.checks[`${dateKey(date)}_${id}`]}
function setDoneOnDate(id,date,val){state.checks[`${dateKey(date)}_${id}`]=val;save();render()}
function doneToday(id){return doneOnDate(id,new Date())}
function setDone(id,val){setDoneOnDate(id,new Date(),val)}
function scheduledHabitsToday(){return state.habits.filter(h=>habitScheduledOnDate(h,new Date()))}
function completedToday(){return scheduledHabitsToday().filter(h=>doneToday(h.id)).length}
function pct(){const planned=scheduledHabitsToday();return planned.length?Math.round(completedToday()/planned.length*100):0}
function stepPct(){return Math.min(100,Math.round((state.activity.steps||0)/(state.activity.stepGoal||1)*100))}
function fmtNum(n){return new Intl.NumberFormat('ru-RU').format(Math.max(0,Math.round(Number(n)||0)))}
function stepDistance(){return ((state.activity.steps||0)*0.00072).toFixed(1)}
function activeMinutes(){return Math.max(0,Math.round((state.activity.steps||0)/105))}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function daysLeft(date){if(!date)return 'Без срока';const d=Math.ceil((new Date(date+'T12:00:00')-new Date())/86400000);return d<0?'Срок прошёл':d===0?'Сегодня':`${d} дн. до срока`}
function fmtMoney(n){return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.max(0,Math.round(Number(n)||0)))+' ₽'}
function goalPct(g){
  if(g.type==='money')return Math.min(100,Math.round((Number(g.currentAmount)||0)/Math.max(1,Number(g.targetAmount)||1)*100));
  return g.steps.length?Math.round(g.steps.filter(s=>s.done).length/g.steps.length*100):0;
}
function goalIsComplete(g){
  if(g.status==='completed')return true;
  if(g.status==='active')return false;
  if(g.type==='money')return (Number(g.targetAmount)||0)>0 && (Number(g.currentAmount)||0)>=(Number(g.targetAmount)||0);
  return g.steps.length>0 && g.steps.every(s=>s.done);
}
function syncGoalStatus(g){
  const complete=g.type==='money'
    ? ((Number(g.targetAmount)||0)>0 && (Number(g.currentAmount)||0)>=(Number(g.targetAmount)||0))
    : (g.steps.length>0 && g.steps.every(s=>s.done));
  if(complete){g.status='completed';g.completedAt=g.completedAt||todayKey()}
  else{g.status='active';g.completedAt=null}
}
function startOfDay(d){const x=new Date(d);x.setHours(12,0,0,0);return x}
function habitCreatedDate(h){return startOfDay(new Date((h.createdAt||todayKey())+'T12:00:00'))}
function habitEndDate(h){return h.endDate?startOfDay(new Date(h.endDate+'T12:00:00')):null}
function habitExistsOnDate(h,d){
  const day=startOfDay(d),created=habitCreatedDate(h),ended=habitEndDate(h);
  return day>=created && (!ended || day<=ended);
}
function habitScheduledOnDate(h,d){
  if(!habitExistsOnDate(h,d))return false;
  const mode=habitMode(h);
  if(mode==='weekdays')return isWeekday(d);
  return true;
}
function habitDateLabel(h){
  const fmt=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});
  const start=fmt.format(habitCreatedDate(h));
  const ended=habitEndDate(h);
  return ended?`с ${start} до ${fmt.format(ended)}`:`с ${start} · без срока`;
}
function isWeekday(d){const day=d.getDay();return day>=1&&day<=5}
function habitMode(h){
  const f=String(h.freq||'').toLowerCase();
  if(f.includes('3 раза'))return '3x';
  if(f.includes('будн'))return 'weekdays';
  return 'daily';
}
function eachDate(start,end,fn){
  const d=startOfDay(start),last=startOfDay(end);
  while(d<=last){fn(new Date(d));d.setDate(d.getDate()+1)}
}
function weekKey(d){
  const x=startOfDay(d);const delta=(x.getDay()+6)%7;x.setDate(x.getDate()-delta);return dateKey(x);
}
function habitStats(h,days){
  const today=startOfDay(new Date());
  const ended=habitEndDate(h);
  const end=ended && ended<today?ended:today;
  const periodStart=new Date(today);periodStart.setDate(today.getDate()-Math.max(1,days)+1);
  const created=habitCreatedDate(h);
  const start=created>periodStart?created:periodStart;
  if(start>end)return {p:0,done:0,target:0};
  const mode=habitMode(h);
  let done=0,target=0;
  if(mode==='3x'){
    const weeks=new Map();
    eachDate(start,end,d=>{
      if(!habitExistsOnDate(h,d))return;
      const k=weekKey(d);
      const item=weeks.get(k)||{days:0,done:0};
      item.days++;
      if(doneOnDate(h.id,d))item.done++;
      weeks.set(k,item);
    });
    for(const item of weeks.values()){
      const weekTarget=Math.min(3,item.days);
      target+=weekTarget;
      done+=Math.min(weekTarget,item.done);
    }
  }else{
    eachDate(start,end,d=>{
      if(!habitScheduledOnDate(h,d))return;
      target++;
      if(doneOnDate(h.id,d))done++;
    });
  }
  return {p:target?Math.min(100,Math.round(done/target*100)):0,done,target};
}

function habitTermStats(h){
  const start=habitCreatedDate(h);
  const ended=habitEndDate(h);
  const today=startOfDay(new Date());
  const end=ended||today;
  if(start>end)return {p:0,done:0,target:0};
  const mode=habitMode(h);
  let done=0,target=0;
  if(mode==='3x'){
    const weeks=new Map();
    eachDate(start,end,d=>{
      if(!habitExistsOnDate(h,d))return;
      const k=weekKey(d);
      const item=weeks.get(k)||{days:0,done:0};
      item.days++;
      if(d<=today && doneOnDate(h.id,d))item.done++;
      weeks.set(k,item);
    });
    for(const item of weeks.values()){
      const weekTarget=Math.min(3,item.days);
      target+=weekTarget;
      done+=Math.min(weekTarget,item.done);
    }
  }else{
    eachDate(start,end,d=>{
      if(!habitScheduledOnDate(h,d))return;
      target++;
      if(d<=today && doneOnDate(h.id,d))done++;
    });
  }
  return {p:target?Math.min(100,Math.round(done/target*100)):0,done,target};
}
function habitLifetimeStats(h){
  if(h.endDate)return habitTermStats(h);
  const start=habitCreatedDate(h),today=startOfDay(new Date());
  const days=Math.max(1,Math.floor((today-start)/86400000)+1);
  return habitStats(h,days);
}
function habitDisplayStats(h,days){
  return h.endDate?habitTermStats(h):habitStats(h,days);
}
function linkedGoal(h){return h.goalId?state.goals.find(g=>g.id===h.goalId && g.type!=='money'):null}
function linkedHabitsForGoal(goalId){return state.habits.filter(h=>h.goalId===goalId)}
function populateGoalSelect(id,value=''){
  const sel=document.getElementById(id);if(!sel)return;
  const options=state.goals.filter(g=>g.type!=='money'&&!goalIsComplete(g)).map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  sel.innerHTML='<option value="">Без цели</option>'+options;
  sel.value=value||'';
}

function completionsOnDate(d){
  const key=dateKey(d);
  return state.habits.reduce((n,h)=>{
    if(!habitScheduledOnDate(h,d))return n;
    return n+(state.checks[`${key}_${h.id}`]===true?1:0);
  },0);
}
function completionSeries(periodKey){
  const now=startOfDay(new Date());
  if(periodKey==='week'){
    return Array.from({length:7},(_,i)=>{const d=new Date(now);d.setDate(now.getDate()-6+i);return completionsOnDate(d)});
  }
  if(periodKey==='month'){
    const daily=Array.from({length:30},(_,i)=>{const d=new Date(now);d.setDate(now.getDate()-29+i);return completionsOnDate(d)});
    const out=[];for(let i=0;i<daily.length;i+=2)out.push(daily[i]+(daily[i+1]||0));return out;
  }
  return Array.from({length:12},(_,i)=>{
    const month=new Date(now.getFullYear(),now.getMonth()-11+i,1,12);
    const end=new Date(month.getFullYear(),month.getMonth()+1,0,12);
    let total=0;eachDate(month,end,d=>{if(d<=now)total+=completionsOnDate(d)});return total;
  });
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function openModal(id){const m=document.getElementById(id);if(!m)return;m.classList.add('open');m.setAttribute('aria-hidden','false')}
function closeModal(id){const m=document.getElementById(id);if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true')}
function pageHead(title,sub,actions=''){return `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`}

function activityConnectCard(compact=false){
  const unsupported=state.activity.nativeStatus==='unsupported'||state.activity.nativeStatus==='unavailable';
  const title=unsupported?'Health Connect недоступен':'Доступ к шагам не включён';
  const copy=unsupported?'На этом устройстве нельзя подключить системный источник шагов.':'Разрешите доступ, чтобы RIVAYA автоматически показывал ваши реальные шаги с телефона.';
  return `<section class="permission-card ${compact?'compact':''}" data-nav="activity">
    <div class="permission-card-icon">👟</div>
    <div class="permission-card-main">
      <div class="permission-eyebrow">АВТОМАТИЧЕСКИЕ ШАГИ</div>
      <div class="permission-card-title">${title}</div>
      <div class="permission-card-copy">${copy}</div>
    </div>
    <button class="primary permission-action" data-health-access ${unsupported?'disabled':''}>${unsupported?'Недоступно':'Разрешить доступ'}</button>
  </section>`;
}

function renderToday(){
  const p=pct();
  const todayHabits=scheduledHabitsToday();
  const tasks=todayHabits.map(h=>`<div class="task ${doneToday(h.id)?'done':''}" data-check="${h.id}"><div class="check">${doneToday(h.id)?'✓':''}</div><div class="task-text"><div class="task-name">${esc(h.name)}</div><div class="task-sub">${esc(h.freq)} · ${habitDateLabel(h)}</div></div><span class="pill">${doneToday(h.id)?'Готово':'Сегодня'}</span></div>`).join('');
  const activeGoals=state.goals.filter(g=>!goalIsComplete(g)).slice(0,3).map(g=>{
    const meta=g.type==='money'?`${fmtMoney(g.currentAmount)} из ${fmtMoney(g.targetAmount)} · ${daysLeft(g.deadline)}`:`${goalPct(g)}% · ${daysLeft(g.deadline)}`;
    const pill=g.type==='money'?`${goalPct(g)}%`:`${g.steps.filter(s=>s.done).length}/${g.steps.length}`;
    return `<div class="goal-card"><div class="goal-top"><div><div class="goal-title">${esc(g.name)}</div><div class="goal-meta">${meta}</div></div><span class="pill">${pill}</span></div><div class="progress"><i style="width:${goalPct(g)}%"></i></div></div>`;
  }).join('');
  const activityBlock=activityConnected()
    ? `<section class="steps-card" data-nav="activity"><div class="steps-icon">◒</div><div class="steps-main"><div class="steps-label">Шаги · ${healthSource()}</div><div class="steps-number">${fmtNum(state.activity.steps)}</div><div class="steps-sub">из ${fmtNum(state.activity.stepGoal)} · ${stepDistance()} км · ≈ ${activeMinutes()} мин активности</div><div class="steps-progress"><i style="width:${stepPct()}%"></i></div></div><div class="steps-pct">${stepPct()}%</div></section>`
    : activityConnectCard(true);
  return `${pageHead('Сегодня',ruDate(),'<button class="secondary" data-open="habitModal">+ Привычка</button><button class="primary" data-open="goalModal">+ Цель</button>')}
  <div class="grid two"><section class="card"><div class="hero"><div class="ring" style="--p:${p}"><div class="ring-center"><strong>${p}%</strong><span>выполнено</span></div></div><div class="hero-stats"><div class="metric"><span><i class="dot green"></i>Готово</span><b>${completedToday()}</b></div><div class="metric"><span><i class="dot purple"></i>Осталось</span><b>${todayHabits.length-completedToday()}</b></div><div class="metric"><span class="subtle">Главное — стабильность, а не идеальность.</span></div></div></div></section>
  <section class="card premium-glow"><h3>Фокус дня</h3><div class="subtle">Закрой хотя бы 3 ключевых действия. Это двигает цели быстрее, чем длинный список.</div><div class="progress"><i style="width:${Math.min(100,p+12)}%"></i></div><button class="ghost" data-nav="goals">Открыть цели →</button></section></div>
  <div class="section-title"><h2>Активность сегодня</h2><button data-nav="activity">Подробнее</button></div>${activityBlock}
  <div class="section-title"><h2>На сегодня</h2><button data-nav="habits">Все привычки</button></div><div class="task-list">${tasks||'<div class="empty">Добавь первую привычку.</div>'}</div>
  <div class="section-title"><h2>Цели в работе</h2><button data-nav="goals">Все цели</button></div><div class="grid three">${activeGoals}</div>`;
}

function renderGoals(){
  const active=state.goals.filter(g=>!goalIsComplete(g));
  const completed=state.goals.filter(goalIsComplete);
  const moneyCard=g=>{
    const remaining=Math.max(0,(Number(g.targetAmount)||0)-(Number(g.currentAmount)||0));
    const recent=(g.contributions||[]).slice(-3).reverse().map(c=>`<div class="money-history-row"><span>${esc(c.note||'Пополнение')}</span><b>+${fmtMoney(c.amount)}</b><small>${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(new Date((c.date||todayKey())+'T12:00:00'))}</small></div>`).join('');
    return `<div class="goal-card money-goal-card"><div class="goal-top"><div><div class="goal-type-label">💰 НАКОПЛЕНИЕ</div><div class="goal-title">${esc(g.name)}</div><div class="goal-meta">${daysLeft(g.deadline)}</div>${g.reminderEnabled&&g.reminderTime?`<div class="goal-reminder-meta">🔔 ${esc(g.reminderTime)}</div>`:''}</div><div class="goal-card-actions"><span class="pill">${goalPct(g)}%</span><button class="tiny-action" data-edit-goal="${g.id}" title="Изменить цель">Изменить</button></div></div><div class="money-amounts"><div><span>Накоплено</span><b>${fmtMoney(g.currentAmount)}</b></div><div><span>Цель</span><b>${fmtMoney(g.targetAmount)}</b></div><div><span>Осталось</span><b>${fmtMoney(remaining)}</b></div></div><div class="progress money-progress"><i style="width:${goalPct(g)}%"></i></div><button class="primary full money-add-btn" data-add-money="${g.id}">+ Добавить накопление</button>${recent?`<div class="money-history">${recent}</div>`:''}</div>`;
  };
  const regularCard=g=>{
    const linked=linkedHabitsForGoal(g.id);
    const linkedHtml=linked.length?`<div class="linked-habits"><div class="linked-habits-title">Связанные привычки</div>${linked.map(h=>{const st=habitLifetimeStats(h);return `<div class="linked-habit-row"><span>${esc(h.name)}</span><b>${st.done}/${st.target} · ${st.p}%</b></div>`}).join('')}<div class="goal-meta">Привычки показывают регулярность, но не меняют процент самой цели.</div></div>`:'';
    return `<div class="goal-card"><div class="goal-top"><div><div class="goal-title">${esc(g.name)}</div><div class="goal-meta">${daysLeft(g.deadline)}</div>${g.reminderEnabled&&g.reminderTime?`<div class="goal-reminder-meta">🔔 ${esc(g.reminderTime)}</div>`:''}</div><div class="goal-card-actions"><span class="pill">${goalPct(g)}%</span><button class="tiny-action" data-edit-goal="${g.id}" title="Изменить цель">Изменить</button></div></div><div class="progress"><i style="width:${goalPct(g)}%"></i></div><div class="steps">${g.steps.map(s=>`<div class="step ${s.done?'done':''}"><button class="step-check" data-step="${g.id}|${s.id}" aria-label="${s.done?'Снять выполнение':'Отметить выполненным'}">${s.done?'✓':''}</button><span>${esc(s.name)}</span><button class="step-edit" data-edit-step="${g.id}|${s.id}" title="Изменить этап" aria-label="Изменить этап">⋯</button></div>`).join('')||'<div class="goal-meta">Добавьте первый этап — так прогресс будет считаться понятнее.</div>'}</div>${linkedHtml}<button class="ghost full" data-add-step="${g.id}">+ Добавить этап</button></div>`;
  };
  const card=g=>g.type==='money'?moneyCard(g):regularCard(g);
  const activeCards=active.map(card).join('');
  const completedCards=completed.map(g=>`<div class="completed-goal-card"><div class="completed-mark">✓</div><div class="completed-main"><b>${esc(g.name)}</b><span>${g.type==='money'?`${fmtMoney(g.currentAmount)} из ${fmtMoney(g.targetAmount)}`:'Выполнено'}${g.completedAt?' · '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(new Date(g.completedAt+'T12:00:00')):''}</span></div><button class="tiny-action" data-edit-goal="${g.id}">Изменить</button>${g.type==='money'?'':`<button class="secondary" data-restore-goal="${g.id}">Вернуть в работу</button>`}</div>`).join('');
  return `${pageHead('Цели','Обычные цели — по этапам, денежные — по реальной накопленной сумме.','<button class="primary" data-open="goalModal">+ Новая цель</button>')}
  <section class="card premium-glow" style="margin-bottom:14px"><div class="goal-top"><div><div class="goal-title">Система целей</div><div class="goal-meta">Цель → прогресс. Для накоплений процент считается от внесённой суммы, а не от галочек.</div></div><span class="pill">SMART FLOW</span></div></section>
  <div class="section-title"><h2>В работе</h2><span class="subtle">${active.length}</span></div><div class="grid two">${activeCards||'<div class="empty">Все текущие цели выполнены. Можно создать новую.</div>'}</div>
  <div class="section-title"><h2>Завершённые цели</h2><span class="subtle">${completed.length}</span></div><section class="card completed-goals">${completedCards||'<div class="empty">Здесь появятся выполненные цели — они не будут висеть среди активных.</div>'}</section>`;
}
function renderHabits(){
  const today=startOfDay(new Date());
  const planned=scheduledHabitsToday();
  const list=state.habits.map(h=>{
    const ended=habitEndDate(h);
    const expired=!!(ended&&ended<today);
    const plannedToday=habitScheduledOnDate(h,today);
    const status=expired?'Срок завершён':plannedToday?(doneToday(h.id)?'Готово':'Сегодня'):'Не запланировано';
    const check=plannedToday?`<div class="check ${doneToday(h.id)?'green':''}" data-check="${h.id}" style="cursor:pointer;background:${doneToday(h.id)?'var(--green)':''};border-color:${doneToday(h.id)?'var(--green)':''};color:#06120d">${doneToday(h.id)?'✓':''}</div>`:`<span class="pill">${status}</span>`;
    const goal=linkedGoal(h);
    const linkMeta=goal?`<div class="habit-goal-link">↗ ${esc(goal.name)}</div>`:'';
    return `<div class="habit-row"><div class="habit-icon">${h.icon}</div><div class="habit-main"><div class="habit-name">${esc(h.name)}</div><div class="habit-meta">${esc(h.freq)} · ${habitDateLabel(h)}</div>${h.reminderEnabled&&h.reminderTime?`<div class="habit-reminder-meta">🔔 ${esc(h.reminderTime)}</div>`:''}${linkMeta}</div><div class="streak" title="Серия — сколько дней подряд вы держите привычку"><span class="streak-icon">🔥</span><span class="streak-copy"><small>Серия</small><b>${h.streak} дн.</b></span></div><button class="tiny-action" data-edit-habit="${h.id}">Изменить</button>${check}</div>`;
  }).join('');
  return `${pageHead('Привычки','Привычки могут быть бессрочными или идти до выбранной даты.','<button class="primary" data-open="habitModal">+ Добавить</button>')}
  <div class="grid two"><section class="card"><h3>Сегодня</h3><div class="hero"><div class="ring" style="--p:${pct()};--ring-color:var(--purple)"><div class="ring-center"><strong>${pct()}%</strong><span>${completedToday()}/${planned.length}</span></div></div><div class="hero-stats"><div class="metric"><span>Лучшая серия</span><b>${Math.max(0,...state.habits.map(h=>h.streak))} дн.</b></div><div class="metric"><span class="subtle">Срок — необязательный. По его окончании привычка перестаёт появляться в плане, а история остаётся.</span></div></div></div></section><section class="card"><h3>Гибкая система</h3><p class="subtle">Каждый день, по будням или 3 раза в неделю. Можно оставить привычку без срока или поставить конкретную дату окончания.</p></section></div>
  <div class="section-title"><h2>Все привычки</h2></div><div class="habit-list">${list}</div>`;
}
function renderActivity(){
  if(!activityConnected()){
    return `${pageHead('Активность','Шаги будут считаться телефоном автоматически.','<button class="secondary" data-open="stepGoalModal">Цель: '+fmtNum(state.activity.stepGoal)+'</button>')}
    ${activityConnectCard(false)}
    <div class="section-title"><h2>Как это будет работать</h2></div>
    <div class="grid three">
      <section class="card mini-feature"><b>1. Разрешить доступ</b><span>Один раз подтвердить чтение количества шагов в системе телефона.</span></section>
      <section class="card mini-feature"><b>2. Всё автоматически</b><span>RIVAYA получает число шагов без ручного ввода и обновляет прогресс.</span></section>
      <section class="card mini-feature"><b>3. Можно включить позже</b><span>Если отказать, эта карточка останется здесь и позволит вернуться к разрешению.</span></section>
    </div>
    <div class="section-title"><h2>Конфиденциальность</h2></div>
    <section class="card privacy-card"><div class="privacy-icon">⌁</div><div><b>RIVAYA не даёт вручную менять пройденные шаги</b><p class="subtle">Пользователь меняет только дневную цель. В мобильном приложении шаги читаются из Apple Health или Health Connect после разрешения.</p></div></section>`;
  }
  const hist=(state.activity.history||[]).slice(-7);
  while(hist.length<7)hist.unshift(0);
  hist[6]=state.activity.steps||0;
  const max=Math.max(state.activity.stepGoal||1,...hist,1);
  const names=['Пн','Вт','Ср','Чт','Пт','Сб','Сегодня'];
  const bars=hist.map((v,i)=>`<div class="step-day"><div class="step-bar-wrap"><i style="height:${Math.max(7,Math.round(v/max*100))}%"></i></div><b>${names[i]}</b><span>${v?fmtNum(v):'—'}</span></div>`).join('');
  return `${pageHead('Активность','Автоматические шаги и движение за день.','<button class="primary" data-open="stepGoalModal">Изменить цель</button>')}
  <div class="grid two"><section class="card activity-hero"><div class="activity-ring" style="--p:${stepPct()}"><div><span>Сегодня</span><strong>${fmtNum(state.activity.steps)}</strong><small>шагов</small></div></div><div class="activity-summary"><div><span>Личная цель</span><b>${fmtNum(state.activity.stepGoal)}</b></div><div><span>Выполнено</span><b>${stepPct()}%</b></div><div><span>Расстояние</span><b>${stepDistance()} км</b></div><div><span>Активность</span><b>≈ ${activeMinutes()} мин</b></div></div></section>
  <section class="card source-card"><div class="source-head"><div class="source-icon">✓</div><div><h3>Шаги подключены</h3><p>${healthSource()}</p></div></div><p class="subtle">Количество шагов обновляется автоматически. В рабочем мобильном приложении RIVAYA не будет предлагать ручное изменение этого числа.</p><button class="ghost full" data-health-manage>Настройки доступа</button></section></div>
  <div class="section-title"><h2>Последние 7 дней</h2></div><section class="card"><div class="steps-week">${bars}</div></section>
  <div class="section-title"><h2>Что важно</h2></div><div class="grid three"><section class="card mini-feature"><b>Автосинхронизация</b><span>Шаги подтягиваются с телефона без ручного ввода.</span></section><section class="card mini-feature"><b>История</b><span>День, неделя и месяц с понятными графиками.</span></section><section class="card mini-feature"><b>Своя цель</b><span>Пользователь меняет ориентир на день, но не само число шагов.</span></section></div>`;
}

function renderCalendar(){
  const now=startOfDay(new Date());
  const base=new Date(now);base.setDate(now.getDate()+calendarWeekOffset*7);
  const monday=new Date(base);const day=(base.getDay()+6)%7;monday.setDate(base.getDate()-day);
  const dates=Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d});
  const heads=dates.map(d=>`<div class="tracker-day-head"><b>${['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()]}</b><span>${d.getDate()}</span></div>`).join('');
  const rows=state.habits.map(h=>{
    const mode=habitMode(h);
    const cells=dates.map(d=>{
      const dayDate=startOfDay(d);
      const isToday=dateKey(dayDate)===dateKey(now);
      const isFuture=dayDate>now;
      const active=habitExistsOnDate(h,dayDate);
      const scheduled=habitScheduledOnDate(h,dayDate);
      const hit=active&&doneOnDate(h.id,dayDate);
      let cls='unscheduled',symbol='—',label='не запланировано';
      if(active && hit){cls='hit';symbol='✓';label='выполнено'}
      else if(active && mode==='3x'){
        cls=isFuture?'future':'available';symbol='·';label=isFuture?'будущий день':'нет отметки — для этой привычки важна недельная норма';
      }else if(active && scheduled){
        if(isFuture){cls='future';symbol='·';label='запланировано на будущее'}
        else if(isToday){cls='pending';symbol='·';label='сегодня — ещё не выполнено'}
        else{cls='missed';symbol='×';label='пропущено'}
      }
      return `<div class="day-box ${cls} ${isToday?'today':''}" role="img" aria-label="${esc(h.name)}, ${dateKey(dayDate)}: ${label}" title="${esc(label)}">${symbol}</div>`;
    }).join('');
    return `<div class="tracker-row"><div class="tracker-name">${esc(h.name)}</div><div class="tracker-days">${cells}</div></div>`;
  }).join('');
  const rangeFmt=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});
  const rangeLabel=`${rangeFmt.format(dates[0])} — ${rangeFmt.format(dates[6])}`;
  const centerLabel=calendarWeekOffset===0?'Эта неделя':rangeLabel;
  return `${pageHead('Календарь',`История привычек · ${rangeLabel}`,'<button class="secondary calendar-nav-btn" data-calendar-nav="prev" aria-label="Предыдущая неделя">‹</button><button class="secondary calendar-current-btn" data-calendar-nav="today">'+centerLabel+'</button><button class="secondary calendar-nav-btn" data-calendar-nav="next" aria-label="Следующая неделя">›</button>')}
  <section class="card calendar-card">
    <div class="calendar-legend"><span><i class="legend-dot done"></i>Выполнено</span><span><i class="legend-dot missed"></i>Пропущено</span><span><i class="legend-dot off"></i>Не запланировано</span><span><i class="legend-dot today-mark"></i>Сегодня</span></div>
    <div class="calendar-wrap"><div class="tracker"><div class="tracker-head"><div class="tracker-head-spacer"></div><div class="tracker-days tracker-days-head">${heads}</div></div>${rows}</div></div>
    <p class="subtle calendar-note">Календарь только показывает историю. Отметки меняются в разделе «Сегодня». Зелёный — выполнено, красный — пропущено, серый — не запланировано.</p>
  </section>`;
}

function renderStats(){
  const periods={
    week:{days:7,label:'последние 7 дней'},
    month:{days:30,label:'последние 30 дней'},
    year:{days:365,label:'последние 12 месяцев'}
  };
  const period=periods[currentStatsPeriod]||periods.month;
  const vals=state.habits.map(h=>({name:h.name,range:habitDateLabel(h),hasTerm:!!h.endDate,...habitDisplayStats(h,period.days)}));
  const totalDone=vals.reduce((sum,v)=>sum+v.done,0);
  const totalTarget=vals.reduce((sum,v)=>sum+v.target,0);
  const overall=totalTarget?Math.min(100,Math.round(totalDone/totalTarget*100)):0;
  const series=completionSeries(currentStatsPeriod);
  const maxValue=Math.max(1,...series);
  const bars=series.map(v=>`<div class="bar ${v===0?'empty-bar':''}" title="${v} выполнений" style="height:${v===0?2:Math.max(8,Math.round(v/maxValue*100))}%"></div>`).join('');
  const rows=vals.map(v=>`<div class="stat-row"><span class="stat-name"><b>${esc(v.name)}</b><small>${v.target?`${v.hasTerm?'Прогресс срока: ':''}${v.done} из ${v.target} выполнено · ${esc(v.range)}`:`Нет запланированных дней · ${esc(v.range)}`}</small></span><div class="small-progress"><i style="width:${v.p}%"></i></div><b>${v.p}%</b></div>`).join('');
  const periodButtons=['week','month','year'].map(key=>{
    const title={week:'Неделя',month:'Месяц',year:'Год'}[key];
    return `<button class="${currentStatsPeriod===key?'primary':'secondary'}" data-stats-period="${key}">${title}</button>`;
  }).join('');
  const activityLabel=currentStatsPeriod==='week'?'неделя':currentStatsPeriod==='year'?'год':'месяц';
  return `${pageHead('Статистика','Только реальные отметки — без демонстрационных процентов.',periodButtons)}
  <div class="grid two"><section class="card"><div class="hero"><div class="ring" style="--p:${overall};--ring-color:var(--green)"><div class="ring-center"><strong>${overall}%</strong><span>выполнено</span></div></div><div class="hero-stats"><div class="metric"><span>Результат за период</span><b>${overall}%</b></div><div class="metric"><span class="subtle">${totalDone} из ${totalTarget} запланированных выполнений · ${period.label}</span></div></div></div></section><section class="card"><h3>Реальные выполнения · ${activityLabel}</h3><div class="chart">${bars}</div><p class="subtle" style="margin-bottom:0">Каждый столбик показывает фактические отметки, которые вы сделали в RIVAYA.</p></section></div>
  <div class="section-title"><h2>По привычкам</h2></div><section class="card"><div class="stat-list">${rows||'<div class="empty">Добавьте привычку — статистика начнёт считаться с даты её создания.</div>'}</div></section>
  <div class="section-title"><h2>Как считается</h2><span class="subtle">Прозрачно</span></div><section class="card"><p class="subtle" style="margin:0">Если у привычки указан срок, процент показывает прогресс по всему сроку, включая будущие запланированные выполнения. Например, для «3 раза в неделю» с 1 по 10 октября план может быть 6 выполнений: одно выполнение = 17%, а не 100%. Без срока статистика считается по выбранному периоду. Для будней учитываются только понедельник–пятница.</p></section>`;
}

function reminderSummary(){
  if(!state.reminders?.enabled)return 'Выключены';
  const times=(state.reminders?.times||[]).filter(Boolean);
  return times.length?times.join(' · '):'Время не выбрано';
}


function minutesOf(t){const [h,m]=String(t||'00:00').split(':').map(Number);return (h||0)*60+(m||0)}
function timeInQuiet(t){
  if(!state.reminders?.quietEnabled||!t)return false;
  const x=minutesOf(t),a=minutesOf(state.reminders.quietStart||'23:00'),b=minutesOf(state.reminders.quietEnd||'08:00');
  return a===b?false:(a<b?(x>=a&&x<b):(x>=a||x<b));
}
function collectSmartReminderTimes(){
  let times=[];
  if(state.reminders?.enabled)times.push(...(state.reminders.times||[]));
  (state.habits||[]).forEach(h=>{if(h.reminderEnabled&&h.reminderTime)times.push(h.reminderTime)});
  (state.goals||[]).forEach(g=>{if(g.reminderEnabled&&g.reminderTime&&!goalIsComplete(g))times.push(g.reminderTime)});
  return [...new Set(times.filter(Boolean))].filter(t=>!timeInQuiet(t)).sort().slice(0,3);
}
function syncSmartReminders(ask=false){
  const times=collectSmartReminderTimes();
  return nativeReminderConfigure(times.length>0,times,ask);
}
function smartReminderSummary(){
  const times=collectSmartReminderTimes();
  const q=state.reminders?.quietEnabled?` · тихо ${state.reminders.quietStart}–${state.reminders.quietEnd}`:'';
  return times.length?`${times.join(' · ')}${q}`:`Нет активных времён${q}`;
}
function weeklySummary(){
  const now=startOfDay(new Date());let done=0,target=0;
  (state.habits||[]).forEach(h=>{for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);if(habitScheduledOnDate(h,d)){target++;if(doneOnDate(h.id,d))done++}}});
  let steps=0;for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);steps+=Number(state.activity?.dailySteps?.[dateKey(d)]||0)}
  const start=new Date(now);start.setDate(now.getDate()-6);const sk=dateKey(start);
  const old=state.goalSnapshots?.[sk]||{};let moved=0;
  (state.goals||[]).forEach(g=>{const before=Number(old[g.id]??0),cur=goalPct(g);if(cur>before)moved++});
  return {done,target,p:target?Math.round(done/target*100):0,steps,moved};
}
function nextFocusHabit(){
  const list=scheduledHabitsToday().filter(h=>!doneToday(h.id));if(!list.length)return null;
  const now=new Date();const cur=now.getHours()*60+now.getMinutes();
  return list.slice().sort((a,b)=>{const aa=a.reminderTime?minutesOf(a.reminderTime):9999,bb=b.reminderTime?minutesOf(b.reminderTime):9999;const av=aa>=cur?aa:aa+1440,bv=bb>=cur?bb:bb+1440;return av-bv})[0];
}
function nearestGoal(){
  return (state.goals||[]).filter(g=>!goalIsComplete(g)).slice().sort((a,b)=>{const da=a.deadline?new Date(a.deadline):new Date('2999-01-01'),db=b.deadline?new Date(b.deadline):new Date('2999-01-01');return da-db})[0]||null;
}
function backupText(){return JSON.stringify({format:'RIVAYA_BACKUP_V1',exportedAt:new Date().toISOString(),state},null,2)}
function restoreBackupText(text){
  const parsed=JSON.parse(text);const incoming=parsed?.state||parsed;
  if(!incoming||!Array.isArray(incoming.habits)||!Array.isArray(incoming.goals))throw new Error('Неверный формат');
  localStorage.setItem(STORAGE_KEY,JSON.stringify(incoming));state=loadState();save();return true;
}

function renderProfile(){
  const accessSetting=activityConnected()
    ? `<div class="setting"><div><strong>Доступ к шагам</strong><small>Подключено: ${healthSource()}</small></div><button class="secondary" data-health-manage>Настройки</button></div>`
    : `<div class="setting warning-setting"><div><strong>Доступ к шагам</strong><small>Не включён — автоматические шаги недоступны</small></div><button class="primary" data-health-access>Разрешить</button></div>`;
  return `${pageHead('Профиль','Настройки приложения и синхронизации.')}
  <div class="grid two"><section class="card"><h3>Аккаунт</h3><div class="profile-grid"><div class="setting"><div><strong>Имя</strong><small>Исмаил</small></div><button class="secondary">Изменить</button></div>${accessSetting}<div class="setting"><div><strong>Облачная синхронизация</strong><small>Подключим перед мобильным релизом</small></div><span class="pill">В разработке</span></div><div class="setting"><div><strong>Напоминания</strong><small>${esc(reminderSummary())}</small></div><button class="secondary" data-open="reminderModal">Настроить</button></div></div></section>
  <section class="card"><h3>Приложение</h3><div class="profile-grid"><div class="setting"><div><strong>RIVAYA для Android</strong><small>Установленная мобильная версия</small></div><span class="pill">1.0</span></div><div class="setting"><div><strong>Экспорт данных</strong><small>Резервная копия JSON</small></div><button class="secondary" id="exportBtn">Скачать</button></div><div class="setting"><div><strong>Сбросить демо</strong><small>Вернуть стартовые данные и сценарий без доступа к шагам</small></div><button class="ghost" id="resetBtn">Сбросить</button></div></div></section></div>
  <div class="section-title"><h2>Доступ к функциям</h2></div><section class="card free-card"><div class="free-icon">✓</div><div><div class="goal-title">RIVAYA полностью бесплатный</div><div class="goal-meta">Цели, привычки, активность, календарь, напоминания и статистика доступны всем пользователям без подписки. Платные функции пока не используются.</div></div></section>
  <div class="section-title"><h2>О приложении</h2></div><section class="card about-card"><div class="about-logo">V</div><div class="about-main"><div class="goal-title">RIVAYA</div><div class="goal-meta">Цели • привычки • прогресс · Android 1.0 RC</div><div class="author-row"><span>Автор проекта</span><a class="author-link" href="https://www.instagram.com/_isma_guder_/" target="_blank" rel="noopener noreferrer">@_isma_guder_</a></div></div><a class="secondary instagram-btn" href="https://www.instagram.com/_isma_guder_/" target="_blank" rel="noopener noreferrer">Instagram ↗</a></section>`;
}

function renderToday(){
  const p=pct(), todayHabits=scheduledHabitsToday(), focus=nextFocusHabit(), urgent=nearestGoal(), w=weeklySummary();
  const tasks=todayHabits.map(h=>`<div class="task ${doneToday(h.id)?'done':''}" data-check="${h.id}"><div class="check">${doneToday(h.id)?'✓':''}</div><div class="task-text"><div class="task-name">${esc(h.name)}</div><div class="task-sub">${esc(h.freq)}${h.reminderEnabled&&h.reminderTime?' · 🔔 '+esc(h.reminderTime):''} · ${habitDateLabel(h)}</div></div><span class="pill">${doneToday(h.id)?'Готово':'Сегодня'}</span></div>`).join('');
  const activityBlock=activityConnected()?`<section class="steps-card" data-nav="activity"><div class="steps-icon">◒</div><div class="steps-main"><div class="steps-label">Шаги · ${healthSource()}</div><div class="steps-number">${fmtNum(state.activity.steps)}</div><div class="steps-sub">из ${fmtNum(state.activity.stepGoal)} · ${stepDistance()} км · ≈ ${activeMinutes()} мин</div><div class="steps-progress"><i style="width:${stepPct()}%"></i></div></div><div class="steps-pct">${stepPct()}%</div></section>`:activityConnectCard(true);
  const focusHtml=focus?`<div class="smart-focus-title">${esc(focus.name)}</div><div class="subtle">${focus.reminderTime?'Ближайшее напоминание '+esc(focus.reminderTime):'Следующее невыполненное действие'}</div>`:`<div class="smart-focus-title">На сегодня всё закрыто ✓</div><div class="subtle">Можно спокойно перейти к целям или отдыху.</div>`;
  const goalHtml=urgent?`<div class="smart-goal"><span>Ближайшая цель</span><b>${esc(urgent.name)}</b><small>${daysLeft(urgent.deadline)} · ${goalPct(urgent)}%</small></div>`:'<div class="smart-goal"><span>Ближайшая цель</span><b>Нет активных целей</b></div>';
  return `${pageHead('Сегодня',ruDate(),'<button class="secondary" data-open="habitModal">+ Привычка</button><button class="primary" data-open="goalModal">+ Цель</button>')}
  <div class="smart-home-grid"><section class="card smart-focus"><div class="smart-kicker">ФОКУС СЕЙЧАС</div>${focusHtml}<button class="ghost" data-nav="habits">Открыть привычки →</button></section><section class="card smart-goal-card">${goalHtml}<button class="ghost" data-nav="goals">Открыть цели →</button></section></div>
  <section class="weekly-report-card"><div><span class="smart-kicker">НЕДЕЛЬНЫЙ ИТОГ</span><h3>${w.done} из ${w.target} выполнений · ${w.p}%</h3><p>${w.steps?fmtNum(w.steps)+' шагов за сохранённые дни':'Шаги начнут копиться в отчёте после синхронизации'} · ${w.moved} целей с движением</p></div><div class="weekly-score">${w.p}%</div></section>
  <div class="grid two"><section class="card"><div class="hero"><div class="ring" style="--p:${p}"><div class="ring-center"><strong>${p}%</strong><span>сегодня</span></div></div><div class="hero-stats"><div class="metric"><span><i class="dot green"></i>Готово</span><b>${completedToday()}</b></div><div class="metric"><span><i class="dot purple"></i>Осталось</span><b>${todayHabits.length-completedToday()}</b></div><div class="metric"><span class="subtle">${esc(smartReminderSummary())}</span></div></div></div></section><section class="card premium-glow"><h3>Умный день</h3><p class="subtle">RIVAYA показывает только то, что важно сейчас: ближайшее действие, цель и активность.</p><div class="progress"><i style="width:${p}%"></i></div></section></div>
  <div class="section-title"><h2>Активность сегодня</h2><button data-nav="activity">Подробнее</button></div>${activityBlock}
  <div class="section-title"><h2>На сегодня</h2><button data-nav="habits">Все привычки</button></div><div class="task-list">${tasks||'<div class="empty">Сегодня нет запланированных привычек.</div>'}</div>`;
}

function renderProfile(){
  const accessSetting=activityConnected()?`<div class="setting"><div><strong>Доступ к шагам</strong><small>Подключено: ${healthSource()}</small></div><button class="secondary" data-health-manage>Настройки</button></div>`:`<div class="setting warning-setting"><div><strong>Доступ к шагам</strong><small>Не включён — автоматические шаги недоступны</small></div><button class="primary" data-health-access>Разрешить</button></div>`;
  return `${pageHead('Профиль','Настройки, резервная копия и уведомления.')}
  <div class="grid two"><section class="card"><h3>Аккаунт</h3><div class="profile-grid"><div class="setting"><div><strong>Имя</strong><small>${esc(state.profile?.name||'Пользователь')}</small></div><button class="secondary" data-open="onboardingModal">Изменить</button></div>${accessSetting}<div class="setting"><div><strong>Облачная синхронизация</strong><small>Подготовлена как следующий серверный этап</small></div><span class="pill">Позже</span></div><div class="setting"><div><strong>Напоминания</strong><small>${esc(smartReminderSummary())}</small></div><button class="secondary" data-open="reminderModal">Настроить</button></div></div></section>
  <section class="card"><h3>Защита данных</h3><div class="profile-grid"><div class="setting"><div><strong>Резервная копия</strong><small>Скопировать или восстановить все цели, привычки и историю</small></div><button class="primary" data-open="backupModal">Открыть</button></div><div class="setting"><div><strong>RIVAYA для Android</strong><small>Release Candidate</small></div><span class="pill">1.0</span></div><div class="setting"><div><strong>Сбросить данные</strong><small>Удалить текущие локальные данные</small></div><button class="ghost" id="resetBtn">Сбросить</button></div></div></section></div>
  <div class="section-title"><h2>Доступ к функциям</h2></div><section class="card free-card"><div class="free-icon">✓</div><div><div class="goal-title">RIVAYA полностью бесплатный</div><div class="goal-meta">Цели, привычки, шаги, календарь, статистика, отчёты и резервная копия доступны без подписки.</div></div></section>
  <div class="section-title"><h2>О приложении</h2></div><section class="card about-card"><div class="about-logo">V</div><div class="about-main"><div class="goal-title">RIVAYA</div><div class="goal-meta">Цели • привычки • прогресс · Android 1.0 RC</div><div class="author-row"><span>Автор проекта</span><a class="author-link" href="https://www.instagram.com/_isma_guder_/" target="_blank" rel="noopener noreferrer">@_isma_guder_</a></div></div><a class="secondary instagram-btn" href="https://www.instagram.com/_isma_guder_/" target="_blank" rel="noopener noreferrer">Instagram ↗</a></section>`;
}

function render(){
  const view=document.getElementById('view');
  const fn={today:renderToday,goals:renderGoals,habits:renderHabits,activity:renderActivity,calendar:renderCalendar,stats:renderStats,profile:renderProfile}[currentView]||renderToday;
  view.innerHTML=fn();
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===currentView));
}

document.addEventListener('click',e=>{
  const external=e.target.closest('[data-external]');
  if(external){
    e.preventDefault();
    const url=external.dataset.external;
    try{
      if(window.VektorNative&&typeof window.VektorNative.openExternal==='function') window.VektorNative.openExternal(url);
      else window.open(url,'_blank','noopener,noreferrer');
    }catch(_e){window.location.href=url}
    return;
  }
  const avatarPick=e.target.closest('[data-avatar-pick]');
  if(avatarPick){e.preventDefault();rvOpenAvatarPicker();return}
  const avatarRemove=e.target.closest('[data-avatar-remove]');
  if(avatarRemove){e.preventDefault();rvRemoveAvatar();return}
  const fullscreen=e.target.closest('[data-fullscreen]');
  if(fullscreen){e.preventDefault();rvTryFullscreen();toast(document.fullscreenElement?'Полноэкранный режим включён':'Пробуем скрыть системную панель');return}
  const calendarNav=e.target.closest('[data-calendar-nav]');
  if(calendarNav){
    const dir=calendarNav.dataset.calendarNav;
    if(dir==='prev')calendarWeekOffset--;
    else if(dir==='next')calendarWeekOffset++;
    else calendarWeekOffset=0;
    render();
    return;
  }
  const statsPeriod=e.target.closest('[data-stats-period]');
  if(statsPeriod){
    currentStatsPeriod=statsPeriod.dataset.statsPeriod;
    render();
    return;
  }
  const health=e.target.closest('[data-health-access]');
  if(health){e.preventDefault();e.stopPropagation();openModal('healthAccessModal');return}
  const manage=e.target.closest('[data-health-manage]');
  if(manage){if(!openNativeHealthSettings())toast('Настройки Health Connect доступны в мобильной версии Android.');return}
  const editHabit=e.target.closest('[data-edit-habit]');
  if(editHabit){
    const h=state.habits.find(x=>x.id===editHabit.dataset.editHabit);
    if(h){
      editingHabitId=h.id;
      document.getElementById('editHabitName').value=h.name||'';
      const mode=habitMode(h);
      document.getElementById('editHabitFrequency').value=mode;
      document.getElementById('editHabitEndDate').value=h.endDate||'';
      const er=document.getElementById('editHabitReminderEnabled');if(er)er.checked=!!h.reminderEnabled;
      const ert=document.getElementById('editHabitReminderTime');if(ert)ert.value=h.reminderTime||'';
      populateGoalSelect('editHabitGoalLink',h.goalId||'');
      openModal('editHabitModal');
    }
    return;
  }
  const editGoal=e.target.closest('[data-edit-goal]');
  if(editGoal){
    const g=state.goals.find(x=>x.id===editGoal.dataset.editGoal);
    if(g){
      editingGoalId=g.id;
      document.getElementById('editGoalName').value=g.name||'';
      document.getElementById('editGoalDeadline').value=g.deadline||'';
      const ger=document.getElementById('editGoalReminderEnabled');if(ger)ger.checked=!!g.reminderEnabled;
      const gert=document.getElementById('editGoalReminderTime');if(gert)gert.value=g.reminderTime||'';
      const moneyWrap=document.getElementById('editMoneyFields');
      const target=document.getElementById('editGoalTargetAmount');
      if(moneyWrap)moneyWrap.hidden=g.type!=='money';
      if(target)target.value=g.type==='money'?(g.targetAmount||''):'';
      openModal('editGoalModal')
    }
    return;
  }
  const addMoney=e.target.closest('[data-add-money]');
  if(addMoney){
    const g=state.goals.find(x=>x.id===addMoney.dataset.addMoney);
    if(g){
      document.getElementById('moneyGoalId').value=g.id;
      document.getElementById('moneyAmountInput').value='';
      document.getElementById('moneyNoteInput').value='';
      const info=document.getElementById('moneyContributionInfo');
      if(info)info.textContent=`Сейчас: ${fmtMoney(g.currentAmount)} из ${fmtMoney(g.targetAmount)}`;
      openModal('moneyContributionModal');
    }
    return;
  }
  const restore=e.target.closest('[data-restore-goal]');
  if(restore){
    const g=state.goals.find(x=>x.id===restore.dataset.restoreGoal);
    if(g){g.status='active';g.completedAt=null;if(g.steps.length && g.steps.every(s=>s.done))g.steps[g.steps.length-1].done=false;save();render();toast('Цель возвращена в работу')}
    return;
  }
  const nav=e.target.closest('[data-nav]');
  if(nav){
    currentView=nav.dataset.nav;
    window.scrollTo(0,0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    render();
    requestAnimationFrame(()=>{
      window.scrollTo(0,0);
      document.documentElement.scrollTop=0;
      document.body.scrollTop=0;
    });
    if(currentView==='activity'||currentView==='today')requestNativeHealthRefresh();
    return
  }
  const op=e.target.closest('[data-open]');
  if(op){
    if(op.dataset.open==='goalModal'){
      const type=document.getElementById('goalType');
      if(type)type.value='regular';
      updateGoalTypeFields();
      const gr=document.getElementById('goalReminderEnabled');if(gr)gr.checked=false;
      const grt=document.getElementById('goalReminderTime');if(grt)grt.value='';
    }
    if(op.dataset.open==='habitModal'){document.getElementById('habitEndDate').value='';document.getElementById('habitFrequency').value='daily';populateGoalSelect('habitGoalLink','');const hr=document.getElementById('habitReminderEnabled');if(hr)hr.checked=false;const ht=document.getElementById('habitReminderTime');if(ht)ht.value='';}
    if(op.dataset.open==='stepGoalModal')document.getElementById('stepsGoalInput').value=state.activity.stepGoal||8000;
    if(op.dataset.open==='reminderModal'){
      const enabled=document.getElementById('remindersEnabled');
      if(enabled) enabled.checked=state.reminders?.enabled!==false;
      const times=(state.reminders?.times||[]);
      [0,1,2].forEach(i=>{const el=document.getElementById(`reminderTime${i+1}`);if(el)el.value=times[i]||''});
      const qe=document.getElementById('quietEnabled');if(qe)qe.checked=state.reminders?.quietEnabled!==false;
      const qs=document.getElementById('quietStart');if(qs)qs.value=state.reminders?.quietStart||'23:00';
      const qn=document.getElementById('quietEnd');if(qn)qn.value=state.reminders?.quietEnd||'08:00';
    }
    openModal(op.dataset.open);return;
  }
  const cl=e.target.closest('[data-close]');if(cl){closeModal(cl.dataset.close);return}
  const ck=e.target.closest('[data-check]');if(ck){const id=ck.dataset.check;const h=state.habits.find(x=>x.id===id);if(!h||!habitScheduledOnDate(h,new Date())){toast('Сегодня эта привычка не запланирована');return}setDone(id,!doneToday(id));toast(doneToday(id)?'Отмечено ✓':'Отметка снята');return}
  const quickMoney=e.target.closest('[data-quick-money]');
  if(quickMoney){
    const input=document.getElementById('moneyAmountInput');
    if(input){
      const next=(Number(input.value)||0)+Number(quickMoney.dataset.quickMoney||0);
      input.value=String(Math.max(0,Math.round(next/100)*100));
      input.focus();
    }
    return;
  }
  const editStep=e.target.closest('[data-edit-step]');
  if(editStep){
    const [gid,sid]=editStep.dataset.editStep.split('|');
    const g=state.goals.find(x=>x.id===gid);
    const s=g?.steps.find(x=>x.id===sid);
    if(s){
      document.getElementById('editStepGoalId').value=gid;
      document.getElementById('editStepId').value=sid;
      document.getElementById('editStepNameInput').value=s.name||'';
      openModal('editStepModal');
      setTimeout(()=>document.getElementById('editStepNameInput')?.focus(),40);
    }
    return;
  }
  const st=e.target.closest('[data-step]');if(st){const [gid,sid]=st.dataset.step.split('|');const g=state.goals.find(x=>x.id===gid);const s=g?.steps.find(x=>x.id===sid);if(s){s.done=!s.done;syncGoalStatus(g);save();render();toast(goalIsComplete(g)?'Цель выполнена ✓ — перенесена в завершённые':(s.done?'Этап выполнен ✓':'Этап снова открыт'))}return}
  const add=e.target.closest('[data-add-step]');if(add){
    const g=state.goals.find(x=>x.id===add.dataset.addStep);
    if(g){
      const idField=document.getElementById('stepGoalId');
      const nameField=document.getElementById('stepNameInput');
      if(idField)idField.value=g.id;
      if(nameField)nameField.value='';
      openModal('addStepModal');
      setTimeout(()=>nameField?.focus(),40);
    }
    return
  }
  if(e.target.id==='installInside'){installApp();return}
  if(e.target.id==='exportBtn'){exportData();return}
  if(e.target.id==='resetBtn'){if(confirm('Удалить все локальные данные RIVAYA?')){state=clone(defaultState);save();currentView='today';render();toast('Данные очищены')}return}
});

function updateGoalTypeFields(){
  const type=document.getElementById('goalType')?.value||'regular';
  const regular=document.getElementById('regularGoalFields');
  const money=document.getElementById('moneyGoalFields');
  if(regular)regular.hidden=type==='money';
  if(money)money.hidden=type!=='money';
  const sub=document.querySelector('#goalModal .modal-subtitle');
  if(sub)sub.textContent=type==='money'?'Укажи сумму цели. Прогресс будет расти после каждого пополнения.':'Сформулируй цель, срок и первый понятный этап.';
}
document.getElementById('goalType')?.addEventListener('change',updateGoalTypeFields);

function snapMoneyField(id){
  const el=document.getElementById(id);
  if(!el)return;
  const raw=el.value;
  if(raw==='')return;
  const num=Number(raw);
  if(!Number.isFinite(num))return;
  const snapped=Math.max(0,Math.round(num/100)*100);
  el.value=String(snapped);
}
['goalTargetAmount','editGoalTargetAmount','moneyAmountInput'].forEach(id=>{
  const el=document.getElementById(id);
  if(!el)return;
  el.addEventListener('change',()=>snapMoneyField(id));
  el.addEventListener('blur',()=>snapMoneyField(id));
});


document.getElementById('saveMoneyContributionBtn')?.addEventListener('click',()=>{
  const gid=document.getElementById('moneyGoalId').value;
  const g=state.goals.find(x=>x.id===gid && x.type==='money');
  if(!g)return;
  const amount=Math.max(0,Math.round((Number(document.getElementById('moneyAmountInput').value)||0)/100)*100);
  if(amount<=0){toast('Укажи сумму пополнения');return}
  const note=document.getElementById('moneyNoteInput').value.trim();
  g.currentAmount=Math.max(0,(Number(g.currentAmount)||0)+amount);
  g.contributions=Array.isArray(g.contributions)?g.contributions:[];
  g.contributions.push({id:'c'+Date.now(),amount,note,date:todayKey()});
  syncGoalStatus(g);
  save();closeModal('moneyContributionModal');render();
  toast(goalIsComplete(g)?'Цель накопления достигнута ✓':`Добавлено ${fmtMoney(amount)}`);
});

document.getElementById('saveGoalBtn').addEventListener('click',()=>{
  const name=document.getElementById('goalName').value.trim();if(!name){toast('Напиши название цели');return}
  const type=document.getElementById('goalType')?.value||'regular';
  const deadline=document.getElementById('goalDeadline').value;
  const reminderEnabled=!!document.getElementById('goalReminderEnabled')?.checked;
  const reminderTime=document.getElementById('goalReminderTime')?.value||'';
  if(type==='money'){
    const target=Math.max(0,Math.round((Number(document.getElementById('goalTargetAmount').value)||0)/100)*100);
    if(target<=0){toast('Укажи сумму, которую хочешь накопить');return}
    state.goals.unshift({id:'g'+Date.now(),type:'money',name,deadline,targetAmount:target,currentAmount:0,contributions:[],steps:[],status:'active',reminderEnabled,reminderTime});
  }else{
    const first=document.getElementById('goalFirstStep').value.trim();
    state.goals.unshift({id:'g'+Date.now(),type:'regular',name,deadline,steps:first?[{id:'s'+Date.now(),name:first,done:false}]:[],status:'active',reminderEnabled,reminderTime});
  }
  save();syncSmartReminders(true);closeModal('goalModal');document.getElementById('goalName').value='';document.getElementById('goalFirstStep').value='';document.getElementById('goalTargetAmount').value='';currentView='goals';render();toast('Цель создана');
});

document.getElementById('saveEditGoalBtn').addEventListener('click',()=>{
  const g=state.goals.find(x=>x.id===editingGoalId);if(!g)return;
  const name=document.getElementById('editGoalName').value.trim();if(!name){toast('Напиши название цели');return}
  g.name=name;g.deadline=document.getElementById('editGoalDeadline').value;g.reminderEnabled=!!document.getElementById('editGoalReminderEnabled')?.checked;g.reminderTime=document.getElementById('editGoalReminderTime')?.value||'';
  if(g.type==='money'){
    const target=Math.max(0,Math.round((Number(document.getElementById('editGoalTargetAmount').value)||0)/100)*100);
    if(target<=0){toast('Укажи целевую сумму');return}
    g.targetAmount=target;
    syncGoalStatus(g);
  }
  save();syncSmartReminders(true);closeModal('editGoalModal');editingGoalId=null;render();toast('Цель обновлена');
});
document.getElementById('deleteGoalBtn').addEventListener('click',()=>{
  const g=state.goals.find(x=>x.id===editingGoalId);if(!g)return;
  if(confirm(`Удалить цель «${g.name}»?`)){state.goals=state.goals.filter(x=>x.id!==g.id);save();closeModal('editGoalModal');editingGoalId=null;render();toast('Цель удалена')}
});

document.getElementById('saveStepBtn')?.addEventListener('click',()=>{
  const gid=document.getElementById('stepGoalId').value;
  const name=document.getElementById('stepNameInput').value.trim();
  if(!name){toast('Напиши название этапа');return}
  const g=state.goals.find(x=>x.id===gid);
  if(!g)return;
  g.steps.push({id:'s'+Date.now(),name,done:false});
  save();closeModal('addStepModal');render();toast('Этап добавлен');
});

document.getElementById('saveEditStepBtn')?.addEventListener('click',()=>{
  const gid=document.getElementById('editStepGoalId').value;
  const sid=document.getElementById('editStepId').value;
  const name=document.getElementById('editStepNameInput').value.trim();
  if(!name){toast('Напиши название этапа');return}
  const g=state.goals.find(x=>x.id===gid);
  const s=g?.steps.find(x=>x.id===sid);
  if(!g||!s)return;
  s.name=name;
  syncGoalStatus(g);
  save();closeModal('editStepModal');render();toast('Этап обновлён');
});

document.getElementById('deleteStepBtn')?.addEventListener('click',()=>{
  const gid=document.getElementById('editStepGoalId').value;
  const sid=document.getElementById('editStepId').value;
  const g=state.goals.find(x=>x.id===gid);
  const s=g?.steps.find(x=>x.id===sid);
  if(!g||!s)return;
  if(confirm(`Удалить этап «${s.name}»?`)){
    g.steps=g.steps.filter(x=>x.id!==sid);
    syncGoalStatus(g);
    save();closeModal('editStepModal');render();toast('Этап удалён');
  }
});

document.getElementById('saveHabitBtn').addEventListener('click',()=>{
  const name=document.getElementById('habitName').value.trim();if(!name){toast('Напиши название привычки');return}
  const sel=document.getElementById('habitFrequency');const freq=sel.options[sel.selectedIndex].text;
  const endDate=document.getElementById('habitEndDate').value;
  const goalId=document.getElementById('habitGoalLink')?.value||'';
  const reminderEnabled=!!document.getElementById('habitReminderEnabled')?.checked;
  const reminderTime=document.getElementById('habitReminderTime')?.value||'';
  if(endDate && endDate<todayKey()){toast('Срок не может быть раньше сегодняшней даты');return}
  state.habits.push({id:'h'+Date.now(),name,freq,icon:'✓',color:'purple',streak:0,createdAt:todayKey(),endDate,goalId,reminderEnabled,reminderTime});
  save();syncSmartReminders(true);closeModal('habitModal');document.getElementById('habitName').value='';document.getElementById('habitEndDate').value='';currentView='habits';render();toast('Привычка добавлена');
});

document.getElementById('saveEditHabitBtn')?.addEventListener('click',()=>{
  const h=state.habits.find(x=>x.id===editingHabitId);if(!h)return;
  const name=document.getElementById('editHabitName').value.trim();if(!name){toast('Напиши название привычки');return}
  const sel=document.getElementById('editHabitFrequency');
  const endDate=document.getElementById('editHabitEndDate').value;
  const goalId=document.getElementById('editHabitGoalLink')?.value||'';
  const reminderEnabled=!!document.getElementById('editHabitReminderEnabled')?.checked;
  const reminderTime=document.getElementById('editHabitReminderTime')?.value||'';
  if(endDate && endDate<h.createdAt){toast('Срок не может быть раньше даты создания привычки');return}
  h.name=name;h.freq=sel.options[sel.selectedIndex].text;h.endDate=endDate;h.goalId=goalId;h.reminderEnabled=reminderEnabled;h.reminderTime=reminderTime;
  save();syncSmartReminders(true);closeModal('editHabitModal');editingHabitId=null;render();toast('Привычка обновлена');
});

document.getElementById('deleteHabitBtn')?.addEventListener('click',()=>{
  const h=state.habits.find(x=>x.id===editingHabitId);if(!h)return;
  if(confirm(`Удалить привычку «${h.name}» и её историю отметок?`)){
    state.habits=state.habits.filter(x=>x.id!==h.id);
    Object.keys(state.checks).forEach(k=>{if(k.endsWith('_'+h.id))delete state.checks[k]});
    save();closeModal('editHabitModal');editingHabitId=null;render();toast('Привычка удалена');
  }
});

document.getElementById('saveStepGoalBtn').addEventListener('click',()=>{
  const goal=Math.max(1000,Math.min(100000,Number(document.getElementById('stepsGoalInput').value)||state.activity.stepGoal||8000));
  state.activity.stepGoal=Math.round(goal);
  save();closeModal('stepGoalModal');render();toast('Цель по шагам обновлена');
});

document.getElementById('requestHealthBtn').addEventListener('click',()=>{
  if(requestNativeHealthAccess()){
    closeModal('healthAccessModal');
    currentView='activity';
    render();
    toast('Подтвердите доступ к шагам в системном окне');
    setTimeout(()=>requestNativeHealthRefresh(),1200);
    setTimeout(()=>requestNativeHealthRefresh(),3500);
  }else{
    toast('Health Connect доступен только в мобильной Android-версии RIVAYA');
  }
});

function nativeReminderConfigure(enabled,times,askPermission=false){
  try{
    if(!window.VektorNative || typeof VektorNative.configureReminders!=='function')return false;
    const p=(times||[]).slice(0,3).map(t=>{const x=String(t||'').split(':');return x.length===2?[Number(x[0]),Number(x[1])]:[-1,-1]});
    while(p.length<3)p.push([-1,-1]);
    if(askPermission && typeof VektorNative.requestNotificationPermission==='function')VektorNative.requestNotificationPermission();
    VektorNative.configureReminders(!!enabled,p[0][0],p[0][1],p[1][0],p[1][1],p[2][0],p[2][1]);
    return true;
  }catch(e){return false}
}

document.getElementById('saveRemindersBtn').addEventListener('click',()=>{
  const enabled=document.getElementById('remindersEnabled').checked;
  const times=[1,2,3].map(i=>document.getElementById(`reminderTime${i}`).value).filter(Boolean);
  if(enabled && !times.length){toast('Выбери хотя бы одно время');return}
  state.reminders={...state.reminders,enabled,times:[...new Set(times)].sort(),quietEnabled:!!document.getElementById('quietEnabled')?.checked,quietStart:document.getElementById('quietStart')?.value||'23:00',quietEnd:document.getElementById('quietEnd')?.value||'08:00'};
  save();
  const nativeOk=syncSmartReminders(true);
  closeModal('reminderModal');render();
  toast(nativeOk?'Умное расписание уведомлений обновлено':'Настройки напоминаний сохранены');
});

document.getElementById('testReminderBtn')?.addEventListener('click',()=>{
  try{
    if(window.VektorNative && typeof VektorNative.testNotification==='function'){
      if(typeof VektorNative.requestNotificationPermission==='function')VektorNative.requestNotificationPermission();
      setTimeout(()=>VektorNative.testNotification(),400);
      toast('Отправляем тестовое уведомление');
    }else toast('Тест доступен в Android-версии RIVAYA');
  }catch(e){toast('Не удалось отправить тест')}
});

setTimeout(()=>{
  if(state.reminders)syncSmartReminders(false);
},900);


window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;document.getElementById('installBtn').style.display='block'});
document.getElementById('installBtn').addEventListener('click',installApp);
async function installApp(){
  if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;return}
  toast('На iPhone: Поделиться → На экран «Домой». На Android: меню браузера → Установить приложение.');
}
function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rivaya-backup.json';a.click();URL.revokeObjectURL(a.href);toast('Резервная копия готова');
}



document.getElementById('copyBackupBtn')?.addEventListener('click',async()=>{
  const box=document.getElementById('backupTextarea');box.value=backupText();
  try{await navigator.clipboard.writeText(box.value);toast('Резервная копия скопирована')}catch{box.select();document.execCommand('copy');toast('Текст резервной копии выделен')}
});
document.getElementById('prepareBackupBtn')?.addEventListener('click',()=>{document.getElementById('backupTextarea').value=backupText();toast('Резервная копия подготовлена')});
document.getElementById('restoreBackupBtn')?.addEventListener('click',()=>{
  const text=document.getElementById('backupTextarea').value.trim();if(!text){toast('Вставьте текст резервной копии');return}
  try{restoreBackupText(text);closeModal('backupModal');syncSmartReminders(true);render();toast('Данные восстановлены ✓')}catch{toast('Не удалось восстановить: неверный формат')}
});
document.getElementById('finishOnboardingBtn')?.addEventListener('click',()=>{
  state.profile=state.profile||{};state.profile.name=document.getElementById('onboardingName').value.trim()||'Пользователь';state.profile.onboardingDone=true;
  const sg=Number(document.getElementById('onboardingStepGoal').value)||8000;state.activity.stepGoal=Math.max(1000,Math.min(100000,Math.round(sg)));
  save();closeModal('onboardingModal');render();toast('RIVAYA настроен')
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-open="backupModal"]');if(b)setTimeout(()=>{const x=document.getElementById('backupTextarea');if(x&&!x.value)x.value=backupText()},0)});

// Android APK build v28: native Health Connect bridge; service worker disabled.
// APK build: do not register a service worker; native WebView serves bundled assets.
render();
setTimeout(()=>{if(state.profile?.onboardingDone===false){document.getElementById('onboardingName').value=state.profile?.name||'';document.getElementById('onboardingStepGoal').value=state.activity?.stepGoal||8000;openModal('onboardingModal')}},500);
setTimeout(()=>requestNativeHealthRefresh(),700);
setInterval(()=>{if(document.visibilityState==='visible')requestNativeHealthRefresh()},30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')requestNativeHealthRefresh()});

window.addEventListener('focus',()=>setTimeout(()=>requestNativeHealthRefresh(),400));


/* RIVAYA 2.1 profile photo + Android display polish */
function rvEnsureAvatarInput(){
  let input=document.getElementById('rvAvatarInput');
  if(input)return input;
  input=document.createElement('input');
  input.id='rvAvatarInput';input.type='file';input.accept='image/*';input.hidden=true;
  input.addEventListener('change',async()=>{
    const file=input.files&&input.files[0];
    input.value='';
    if(!file)return;
    if(!file.type.startsWith('image/')){toast('Выберите изображение');return}
    if(file.size>12*1024*1024){toast('Фото слишком большое');return}
    try{
      const url=URL.createObjectURL(file);
      const img=new Image();
      await new Promise((ok,fail)=>{img.onload=ok;img.onerror=fail;img.src=url});
      const side=Math.min(img.naturalWidth||img.width,img.naturalHeight||img.height);
      const sx=((img.naturalWidth||img.width)-side)/2, sy=((img.naturalHeight||img.height)-side)/2;
      const canvas=document.createElement('canvas');canvas.width=360;canvas.height=360;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,sx,sy,side,side,0,0,360,360);
      URL.revokeObjectURL(url);
      state.profile=state.profile||{};
      state.profile.avatarData=canvas.toDataURL('image/jpeg',0.82);
      save();render();toast('Фото профиля обновлено ✓');
    }catch(err){toast('Не удалось обработать фото')}
  });
  document.body.appendChild(input);return input;
}
function rvOpenAvatarPicker(){rvEnsureAvatarInput().click()}
function rvAvatarMarkup(name){
  const src=state.profile?.avatarData;
  const initial=(String(name||'R').trim()[0]||'R').toUpperCase();
  return src?`<img src="${src}" alt="Фото профиля">`:`<span>${esc(initial)}</span>`;
}
function rvRemoveAvatar(){
  if(!state.profile?.avatarData)return;
  state.profile.avatarData='';save();render();toast('Фото профиля удалено');
}
function rvTryFullscreen(){
  try{
    if(!/Android/i.test(navigator.userAgent)||!window.VektorNative||document.fullscreenElement)return;
    const el=document.documentElement;
    if(el.requestFullscreen){const r=el.requestFullscreen({navigationUI:'hide'});if(r&&r.catch)r.catch(()=>{});}
  }catch(_e){}
}
if(/Android/i.test(navigator.userAgent))document.documentElement.classList.add('rv-android');
let rvFullscreenAttempted=false;
document.addEventListener('pointerdown',()=>{
  if(!rvFullscreenAttempted){rvFullscreenAttempted=true;rvTryFullscreen()}
},{capture:true,passive:true});

/* ==========================================================
   RIVAYA 2.1 UI — four-tab navigation and premium dashboard
   Existing data model/native Health Connect bridge are preserved.
   ========================================================== */
currentStatsPeriod='week';

function rvGroup(view){
  if(view==='goals'||view==='habits'||view==='plan')return 'plan';
  if(view==='stats'||view==='calendar'||view==='activity'||view==='progress')return 'progress';
  return view==='profile'?'profile':'today';
}
function rvDaysWithActivityStreak(){
  const now=startOfDay(new Date());let streak=0;
  for(let i=0;i<365;i++){
    const d=new Date(now);d.setDate(now.getDate()-i);
    const planned=state.habits.filter(h=>habitScheduledOnDate(h,d)).length;
    const done=completionsOnDate(d);
    if(planned===0){if(i===0)continue;break}
    if(done>0)streak++;else break;
  }
  return streak;
}
function rvHabitGlyph(h){
  const n=String(h?.name||'').toLowerCase();
  if(/вод/.test(n))return '◒';
  if(/чит|книг/.test(n))return '▤';
  if(/трен|спорт|зал|бег/.test(n))return '↟';
  if(/медит|дых/.test(n))return '◌';
  if(/шаг|ход|прогул/.test(n))return '⌁';
  if(/англ|уч|курс/.test(n))return 'A';
  return '✦';
}
function rvInsight(p,planned,done){
  if(!planned)return {title:'Начни с одного действия',text:'Добавь одну привычку, которую реально выполнить сегодня. RIVAYA построит прогресс вокруг неё.'};
  if(p===100)return {title:'План на сегодня закрыт',text:'Хорошая работа. Можно перейти к цели или оставить день завершённым без лишних задач.'};
  const left=Math.max(0,planned-done);
  if(done===0)return {title:'Сделай первый маленький шаг',text:`Сегодня запланировано ${planned}. Начни с самой простой привычки — после первого выполнения продолжать легче.`};
  return {title:'Продолжай в том же темпе',text:`Осталось ${left}. Сфокусируйся на ближайшем действии, а не на всём списке сразу.`};
}
function rvTodayHabitRow(h){
  const done=doneToday(h.id);const goal=linkedGoal(h);
  const right=h.reminderEnabled&&h.reminderTime?`◷ ${esc(h.reminderTime)}`:(goal?`→ ${esc(goal.name)}`:'Сегодня');
  return `<div class="rv-habit ${done?'done':''}" data-check="${h.id}"><div class="rv-check">${done?'✓':''}</div><div class="rv-glyph">${rvHabitGlyph(h)}</div><div class="rv-habit-main"><div class="rv-habit-name">${esc(h.name)}</div><div class="rv-habit-sub">${esc(h.freq)}${goal?' · связано с целью':''}</div></div><div class="rv-habit-meta">${right}</div></div>`;
}

renderToday=function(){
  const planned=scheduledHabitsToday();
  const done=completedToday();
  const p=pct();
  const focus=nextFocusHabit();
  const goal=nearestGoal();
  const streak=rvDaysWithActivityStreak();
  const weekly=weeklySummary();
  const habitRows=planned.slice(0,5).map(rvTodayHabitRow).join('');

  const focusTitle=focus
    ? esc(focus.name)
    : (planned.length ? 'На сегодня всё выполнено ✓' : 'Создай первый маленький шаг');
  const focusSub=focus
    ? (focus.reminderEnabled&&focus.reminderTime ? `Напоминание в ${esc(focus.reminderTime)}` : 'Следующее невыполненное действие')
    : (planned.length ? 'Можно спокойно перейти к целям или отдыху.' : 'Добавь привычку, которую реально повторять каждый день.');

  const goalHtml=goal
    ? `<section class="rv-neon-mini rv-neon-goal rv-tap-card" data-nav="goals">
         <div class="rv-neon-mini-head"><span>Ближайшая цель</span><i>›</i></div>
         <h3>${esc(goal.name)}</h3>
         <p>${daysLeft(goal.deadline)} · ${goalPct(goal)}% выполнено</p>
         <div class="rv-mini-progress"><i style="width:${goalPct(goal)}%"></i></div>
         <div class="rv-neon-illustration target">◎</div>
       </section>`
    : `<section class="rv-neon-mini rv-neon-goal rv-tap-card" data-open="goalModal">
         <div class="rv-neon-mini-head"><span>Ближайшая цель</span><i>＋</i></div>
         <h3>Добавить цель</h3>
         <p>Свяжи цель с ежедневными действиями.</p>
         <div class="rv-neon-illustration target">◎</div>
       </section>`;

  const stepsHtml=activityConnected()
    ? `<section class="rv-neon-mini rv-neon-steps rv-tap-card" data-nav="activity">
         <div class="rv-neon-mini-head"><span>Шаги сегодня</span><i>›</i></div>
         <div class="rv-neon-steps-value">${fmtNum(state.activity.steps)}</div>
         <p>из ${fmtNum(state.activity.stepGoal)} · ${stepDistance()} км</p>
         <div class="rv-neon-link">${stepPct()}% дневной цели →</div>
         <div class="rv-mini-progress"><i style="width:${stepPct()}%"></i></div>
         <div class="rv-neon-illustration shoe">⌁</div>
       </section>`
    : `<section class="rv-neon-mini rv-neon-steps rv-tap-card" data-health-access>
         <div class="rv-neon-mini-head"><span>Шаги сегодня</span><i>›</i></div>
         <div class="rv-neon-steps-value">—</div>
         <p>Доступ к шагам не включён</p>
         <div class="rv-neon-link">Подключить реальные шаги →</div>
         <div class="rv-neon-illustration shoe">⌁</div>
       </section>`;

  const dayStatus=planned.length ? `${done}/${planned.length}` : 'День пока пустой';

  return `<div class="rv-screen rv-home-v32">
    <div class="rv-title-row rv-title-row-neon">
      <div><h1>Сегодня</h1><div class="rv-date">${ruDate()}</div></div>
      <div class="rv-streak rv-streak-neon"><span class="rv-streak-flame">◆</span><div><b>${streak}</b><span>дн. серия</span></div><i>›</i></div>
    </div>

    <section class="rv-neon-hero">
      <div class="rv-neon-ring" style="--p:${p}">
        <div><strong>${p}%</strong><span>${planned.length?dayStatus:'День пока пустой'}</span></div>
      </div>
      <div class="rv-neon-focus" ${focus?'data-check="'+focus.id+'"':'data-open="habitModal"'}>
        <div class="rv-neon-kicker">✦ ФОКУС ДНЯ</div>
        <h2>${focusTitle}</h2>
        <p>${focusSub}</p>
        <div class="rv-neon-pills"><span>✓ ${done}/${planned.length}</span><span>≈ ${activityConnected()?fmtNum(state.activity.steps):'шаги'}</span></div>
      </div>
      <button class="rv-neon-arrow" ${focus?'data-check="'+focus.id+'"':'data-open="habitModal"'} aria-label="Открыть">›</button>
    </section>

    <section class="rv-neon-card rv-neon-habits">
      <div class="rv-neon-section-head">
        <div><span>СЕГОДНЯ</span><h2>Привычки</h2></div>
        <button data-nav="habits">${planned.length?done+' из '+planned.length:'Все'} ›</button>
      </div>
      <div class="rv-habits">${habitRows||`<div class="rv-neon-empty">
        <div class="rv-neon-empty-icon">▤<i>✦</i></div>
        <b>Пока нет привычек на сегодня</b>
        <span>Добавь одну небольшую привычку — этого достаточно, чтобы начать.</span>
        <button class="rv-premium-cta" data-open="habitModal"><i>＋</i><strong>Добавить привычку</strong></button>
      </div>`}</div>
      ${planned.length>5?'<button class="rv-show-all" data-nav="habits">Показать остальные привычки ›</button>':''}
    </section>

    <div class="rv-neon-two">${goalHtml}${stepsHtml}</div>

    <section class="rv-neon-week">
      <div class="rv-neon-week-icon">▥</div>
      <div><span>НЕДЕЛЯ</span><b>${weekly.target?weekly.p+'% выполнения':'Собираем первые данные'}</b><p>${weekly.done} из ${weekly.target} привычек · ${weekly.steps?fmtNum(weekly.steps)+' шагов':'шаги появятся после подключения'}</p></div>
      <strong>${weekly.target?weekly.p+'%':'—'}</strong>
    </section>
  </div>`;
};

function rvPlanHabit(h){
  const st=habitLifetimeStats(h);const goal=linkedGoal(h);const scheduled=habitScheduledOnDate(h,new Date());const done=scheduled&&doneToday(h.id);
  return `<div class="rv-habit ${done?'done':''}" ${scheduled?`data-check="${h.id}"`:''}><div class="rv-check">${done?'✓':''}</div><div class="rv-glyph">${rvHabitGlyph(h)}</div><div class="rv-habit-main"><div class="rv-habit-name">${esc(h.name)}</div><div class="rv-habit-sub">${esc(h.freq)}${goal?` · → ${esc(goal.name)}`:''}</div><div class="rv-mini-progress"><i style="width:${st.p}%"></i></div></div><button class="tiny-action" data-edit-habit="${h.id}">Изменить</button></div>`;
}
function rvPlanGoal(g){
  const linked=linkedHabitsForGoal(g.id);return `<div class="rv-goal-card2" data-nav="goals"><div class="head"><div><h3>${esc(g.name)}</h3><p>${daysLeft(g.deadline)}${linked.length?` · ${linked.length} связ. привыч.`:''}</p></div><div class="pct">${goalPct(g)}%</div></div><div class="rv-mini-progress"><i style="width:${goalPct(g)}%"></i></div>${linked.length?`<div class="rv-linked">Связаны: ${linked.slice(0,2).map(h=>esc(h.name)).join(' · ')}${linked.length>2?' · …':''}</div>`:''}</div>`;
}
function renderPlan(){
  const activeGoals=state.goals.filter(g=>!goalIsComplete(g));const activeHabits=state.habits.filter(h=>habitExistsOnDate(h,new Date()));
  return `<div class="rv-screen">
    <div class="rv-title-row"><div><h1>План</h1><div class="rv-date">Привычки, которые ведут к большим целям</div></div></div>
    <div class="rv-plan-tabs"><button class="active" data-nav="habits">Привычки</button><button data-nav="goals">Цели</button></div>
    <div class="rv-plan-add"><div class="rv-plus">+</div><div><b>Быстрое добавление</b><small>Создай привычку или цель за несколько секунд</small></div><button data-open="habitModal">›</button></div>
    <section class="rv-section"><div class="rv-section-head"><h2>Активные цели</h2><button data-nav="goals">Все цели ›</button></div>${activeGoals.length?activeGoals.slice(0,3).map(rvPlanGoal).join(''):`<div class="rv-empty">Целей пока нет. Создай одну конкретную цель и привяжи к ней ежедневное действие.</div>`}<div class="rv-plan-actions"><button data-open="goalModal" class="primary2">+ Новая цель</button><button data-nav="goals">Управлять</button></div></section>
    <section class="rv-section"><div class="rv-section-head"><h2>Связанные с целями привычки</h2><button data-nav="habits">Все ›</button></div><div class="rv-habits">${activeHabits.length?activeHabits.slice(0,7).map(rvPlanHabit).join(''):`<div class="rv-empty">Добавь первую привычку. При создании можно сразу связать её с целью.</div>`}</div><div class="rv-plan-actions"><button data-open="habitModal" class="primary2">+ Новая привычка</button><button data-nav="habits">Управлять</button></div></section>
  </div>`;
}

function rvDayScore(d){
  const planned=state.habits.filter(h=>habitScheduledOnDate(h,d)).length;const done=completionsOnDate(d);return {planned,done,p:planned?Math.round(done/planned*100):0};
}
function renderProgress(){
  const periods={week:{days:7,label:'за 7 дней'},month:{days:30,label:'за 30 дней'},year:{days:365,label:'за 12 месяцев'}};const period=periods[currentStatsPeriod]||periods.week;
  const vals=state.habits.map(h=>habitDisplayStats(h,period.days));const done=vals.reduce((a,v)=>a+v.done,0);const target=vals.reduce((a,v)=>a+v.target,0);const overall=target?Math.round(done/target*100):0;
  const series=completionSeries(currentStatsPeriod);const max=Math.max(1,...series);const labels=currentStatsPeriod==='week'?['Пн','Вт','Ср','Чт','Пт','Сб','Вс']:series.map((_,i)=>currentStatsPeriod==='year'?String(i+1):String(i+1));
  const bars=series.map((v,i)=>`<div class="rv-chart-col"><div class="rv-chart-bar" style="height:${v?Math.max(8,Math.round(v/max*100)):3}%"></div><small>${labels[i]||''}</small></div>`).join('');
  const goalActive=state.goals.filter(g=>!goalIsComplete(g));const goalAvg=goalActive.length?Math.round(goalActive.reduce((s,g)=>s+goalPct(g),0)/goalActive.length):0;const streak=rvDaysWithActivityStreak();const w=weeklySummary();
  const now=startOfDay(new Date());let cal='';for(let i=27;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);const s=rvDayScore(d);const cls=s.planned===0?'':(s.p===100?'perfect':s.done>0?'partial':'missed');cal+=`<div class="rv-cal-day ${cls} ${dateKey(d)===todayKey()?'today':''}" title="${s.done}/${s.planned}">${d.getDate()}</div>`}
  const habitAvg=state.habits.length?Math.round(state.habits.reduce((sum,h)=>sum+habitDisplayStats(h,period.days).p,0)/state.habits.length):0;
  return `<div class="rv-screen">
    <div class="rv-title-row"><div><h1>Прогресс</h1><div class="rv-date">Только реальные отметки и реальные шаги</div></div></div>
    <div class="rv-period-tabs">${['week','month','year'].map(k=>`<button class="${currentStatsPeriod===k?'active':''}" data-stats-period="${k}">${{week:'Неделя',month:'Месяц',year:'Год'}[k]}</button>`).join('')}</div>
    <section class="rv-progress-summary"><div class="rv-ring" style="--p:${overall}"><div><strong>${overall}%</strong><span>выполнено</span></div></div><div><h2>${target?'Твой реальный прогресс':'Статистика начнётся после первых отметок'}</h2><p>${target?`${done} из ${target} запланированных выполнений ${period.label}`:'Никаких случайных процентов — только твои данные.'}</p><div class="rv-kpis"><div class="rv-kpi"><b>${streak} дн.</b><span>текущая серия</span></div><div class="rv-kpi"><b>${goalAvg}%</b><span>средний прогресс целей</span></div></div></div></section>
    <section class="rv-section"><div class="rv-section-head"><h2>Динамика выполнения</h2><button data-nav="stats">Подробнее ›</button></div><div class="rv-chart-wrap">${bars}</div></section>
    <section class="rv-section"><div class="rv-section-head"><h2>Привычки и цели</h2><button data-nav="stats">Аналитика ›</button></div><div class="rv-metric-row"><div class="rv-metric-icon">✓</div><div class="rv-metric-copy"><b>Привычки</b><span>${state.habits.length} активных · ${period.label}</span><div class="rv-mini-progress"><i style="width:${habitAvg}%"></i></div></div><div class="rv-metric-value">${habitAvg}%</div></div><div class="rv-metric-row"><div class="rv-metric-icon">⚑</div><div class="rv-metric-copy"><b>Цели</b><span>${goalActive.length} в работе</span><div class="rv-mini-progress"><i style="width:${goalAvg}%"></i></div></div><div class="rv-metric-value">${goalAvg}%</div></div><div class="rv-metric-row" data-nav="activity"><div class="rv-metric-icon">⌁</div><div class="rv-metric-copy"><b>Шаги</b><span>${activityConnected()?`${fmtNum(state.activity.steps)} сегодня · ${fmtNum(w.steps)} за сохранённые дни недели`:'Доступ к шагам не включён'}</span></div><div class="rv-metric-value">${activityConnected()?stepPct()+'%':'→'}</div></div></section>
    <section class="rv-section"><div class="rv-section-head"><h2>Календарь активности</h2><button data-nav="calendar">Открыть ›</button></div><div class="rv-calendar-grid">${cal}</div></section>
  </div>`;
}

renderProfile=function(){
  const name=state.profile?.name||'Пользователь';
  const streak=rvDaysWithActivityStreak();
  const w=weeklySummary();
  const health=activityConnected();
  const hasAvatar=!!state.profile?.avatarData;

  return `<div class="rv-screen rv-profile-v32">
    <section class="rv-profile-stats-neon">
      <div><i class="fire">◆</i><b>${streak}</b><span>дней серия</span></div>
      <div><i class="check">✓</i><b>${w.done}</b><span>выполнений за неделю</span></div>
      <div><i class="steps">⌁</i><b>${health?fmtNum(state.activity.steps):'—'}</b><span>шагов сегодня</span></div>
    </section>

    <div class="rv-settings-group rv-settings-group-neon">
      <div class="rv-settings-title">ПРОФИЛЬ</div>
      <div class="rv-settings">
        <div class="rv-setting rv-setting-neon" data-avatar-pick>
          <div class="rv-setting-icon rv-icon-camera">${hasAvatar?rvAvatarMarkup(name):'◉'}</div>
          <div class="rv-setting-main"><b>Фото профиля</b><span>${hasAvatar?'Нажми, чтобы заменить фотографию':'Выбрать фотографию из галереи'}</span></div>
          <button>${hasAvatar?'Изменить':'Добавить'} ›</button>
        </div>
        <div class="rv-setting rv-setting-neon" data-open="onboardingModal">
          <div class="rv-setting-icon">✦</div>
          <div class="rv-setting-main"><b>Имя и цель по шагам</b><span>${esc(name)} · ${fmtNum(state.activity.stepGoal)} шагов в день</span></div>
          <button>Изменить ›</button>
        </div>
      </div>
    </div>

    <div class="rv-settings-group rv-settings-group-neon">
      <div class="rv-settings-title">РЕЖИМ И УВЕДОМЛЕНИЯ</div>
      <div class="rv-settings">
        <div class="rv-setting rv-setting-neon" data-open="reminderModal">
          <div class="rv-setting-icon">◷</div>
          <div class="rv-setting-main"><b>Уведомления</b><span>${esc(smartReminderSummary())}</span></div>
          <button>Настроить ›</button>
        </div>
        <div class="rv-setting rv-setting-neon" data-open="reminderModal">
          <div class="rv-setting-icon">☾</div>
          <div class="rv-setting-main"><b>Тихий режим</b><span>Без уведомлений в выбранное время</span></div>
          <div class="rv-setting-value">${state.reminders?.quietEnabled?`${state.reminders.quietStart}–${state.reminders.quietEnd}`:'Выкл.'} ›</div>
        </div>
      </div>
    </div>

    <div class="rv-settings-group rv-settings-group-neon">
      <div class="rv-settings-title">ДАННЫЕ И ЗДОРОВЬЕ</div>
      <div class="rv-settings">
        <div class="rv-setting rv-setting-neon" ${health?'data-health-manage':'data-health-access'}>
          <div class="rv-setting-icon">♥</div>
          <div class="rv-setting-main"><b>Реальные шаги</b><span>${health?'Подключено: '+healthSource():'Подключи системный источник шагов'}</span></div>
          <div class="rv-setting-value">${health?'Подключено ✓':'Подключить ›'}</div>
        </div>
        <div class="rv-setting rv-setting-neon" data-open="backupModal">
          <div class="rv-setting-icon">☁</div>
          <div class="rv-setting-main"><b>Резервная копия</b><span>Цели, привычки, история, фото и настройки</span></div>
          <button>Открыть ›</button>
        </div>
      </div>
    </div>

    <section class="rv-profile-footer rv-profile-footer-neon">
      <div class="rv-profile-footer-copy"><b>RIVAYA 3.2</b><span>Цели · привычки · реальные шаги · прогресс</span></div>
      <div class="rv-profile-author-neon">
        <span>Автор</span>
        <button class="rv-instagram-link" data-external="https://www.instagram.com/_isma_guder_/">
          <i class="rv-instagram-icon">◎</i><strong>@_isma_guder_</strong><em>↗</em>
        </button>
      </div>
    </section>
  </div>`;
};

render=function(){
  const view=document.getElementById('view');
  const fn={today:renderToday,plan:renderPlan,progress:renderProgress,profile:renderProfile,goals:renderGoals,habits:renderHabits,activity:renderActivity,calendar:renderCalendar,stats:renderStats}[currentView]||renderToday;
  view.innerHTML=fn();
  const activeGroup=rvGroup(currentView);
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===activeGroup));
  const topAvatar=document.querySelector('.top-actions .avatar');
  if(topAvatar){
    topAvatar.innerHTML=rvAvatarMarkup(state.profile?.name||'Пользователь');
    topAvatar.classList.toggle('has-photo',!!state.profile?.avatarData);
  }
};
render();