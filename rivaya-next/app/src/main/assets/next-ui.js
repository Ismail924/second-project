/* One integrated 4.1 interface; legacy data and native bridges stay authoritative. */
(function(){
  'use strict';
  const C=window.RivayaNextCore;
  let selected='',draft=null,renderedDraft=null,renderedExternalKey='',period=7,reportOffset=0,planFilter='all',addReturn='today',stepPeriod=7,stepDay='';
  const lang=()=>state.profile?.language==='en'?'en':state.profile?.language==='ru'?'ru':(/^en/i.test(navigator.language||'')?'en':'ru');
  const t=(ru,en)=>lang()==='en'?en:ru;
  const uid=()=> 'r'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
  const num=n=>new Intl.NumberFormat(lang()).format(Number(n)||0);
  const date=d=>d?new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ru-RU',{day:'numeric',month:'short'}).format(new Date(d+'T12:00:00')):'';
  const button=(label,action,extra='',primary=false)=>`<button class="nx-button ${primary?'nx-primary':''}" data-nx="${action}" ${extra}>${label}</button>`;
  const head=(title,sub='')=>`<header class="nx-heading"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div></header>`;
  const empty=text=>`<p class="nx-empty">${text}</p>`;
  const panel=(title,body)=>`<section class="nx-panel"><h2>${title}</h2>${body}</section>`;
  const progress=p=>`<div class="nx-progress"><i style="width:${Math.max(0,Math.min(100,p))}%"></i></div>`;
  const attr=id=>`data-id="${id}"`;
  const habit=()=>state.habits.find(h=>h.id===selected);
  const goal=()=>state.goals.find(g=>g.id===selected);
  const frequency=h=>({daily:t('Каждый день','Every day'),weekdays:t('По будням','Weekdays'),'3x':t('3 раза в неделю','3 times a week')})[habitMode(h)];
  const done=h=>doneToday(h.id);
  const days=n=>Array.from({length:n},(_,i)=>{const d=new Date();d.setDate(d.getDate()-n+1+i);return dateKey(d)});
  function habitRow(h){
    const e=C.entry(h,todayKey()),count=C.numeric(h);
    return `<div class="nx-row"><button class="nx-check ${done(h)?'checked':''}" data-nx="${count?'habit':'check'}" ${attr(h.id)} aria-label="${t('Открыть или отметить привычку','Open or complete habit')}" aria-pressed="${done(h)}">${done(h)?'✓':count?'+':''}</button><button class="nx-row-copy" data-nx="habit" ${attr(h.id)}><b>${esc(h.name)}</b><small>${count?`${num(e.value)} / ${num(e.target)} ${esc(e.unit)}`:frequency(h)}</small>${count?progress(e.value/e.target*100):''}</button>${count?button('＋'+num(C.increment(h)),'plus',attr(h.id)):button('⋯','habit',attr(h.id))}</div>`;
  }
  function taskRow(g){
    return `<div class="nx-row"><button class="nx-check ${goalIsComplete(g)?'checked':''}" data-nx="task-check" ${attr(g.id)} aria-label="${t('Отметить задание','Toggle task')}" aria-pressed="${goalIsComplete(g)}">${goalIsComplete(g)?'✓':''}</button><button class="nx-row-copy" data-nx="edit-task" ${attr(g.id)}><b>${esc(g.name)}</b><small>${g.deadline?date(g.deadline):t('Без срока','No due date')}</small></button></div>`;
  }
  function goalCard(g){
    const next=g.steps.find(s=>!s.done);
    return `<button class="nx-goal" data-nx="goal" ${attr(g.id)}><div class="nx-between"><b>${esc(g.name)}</b><span>${goalPct(g)}%</span></div>${progress(goalPct(g))}<small>${g.type==='quantity'?`${num(g.currentValue)} / ${num(g.targetValue)} ${esc(g.unit)}`:g.type==='money'?`${num(g.currentAmount)} / ${num(g.targetAmount)} ₽`:g.steps.length?`${g.steps.filter(s=>s.done).length} / ${g.steps.length} ${t('этапов','steps')}${next?.name?' · '+esc(next.name):''}`:t('Добавь первый этап','Add your first step')}${g.deadline?' · '+date(g.deadline):''}</small></button>`;
  }
  const homeKeys=['summary','tasks','habits','next','goals','steps','shared'];
  const homeLabels=()=>({summary:t('Прогресс дня','Daily progress'),tasks:t('Мои дела','My tasks'),habits:t('Привычки','Habits'),next:t('Следующий этап','Next goal step'),goals:t('Цели','Goals'),steps:t('Шаги','Steps'),shared:t('Совместные цели','Shared goals')});
  function homePrefs(){
    const raw=state.profile.homeLayout||{mode:'expanded'},clean=list=>[...new Set((Array.isArray(list)?list:[]).filter(k=>homeKeys.includes(k)))];
    return {mode:raw.mode==='simple'?'simple':'expanded',simple:Array.isArray(raw.simple)?clean(raw.simple):['habits'],expanded:Array.isArray(raw.expanded)?clean(raw.expanded):[...homeKeys]};
  }
  function saveHome(p){state.profile.homeLayout=p;save()}
  function homeSwitch(){const p=homePrefs();return `<div class="nx-home-switch" aria-label="${t('Режим главного экрана','Home screen mode')}">${['simple','expanded'].map(m=>button(m==='simple'?t('Простой','Simple'):t('Расширенный','Expanded'),'home-mode',`data-mode="${m}" aria-pressed="${p.mode===m}"`)).join('')}</div>`}
  function homeSettings(){
    const p=homePrefs(),visible=p[p.mode],order=visible.concat(homeKeys.filter(k=>!visible.includes(k))),labels=homeLabels();
    return button('‹ '+t('Профиль','Profile'),'profile')+head(t('Главный экран','Home screen'),t('Выбери блоки для каждого режима. Данные сохраняются, даже если блок скрыт.','Choose blocks for each mode. Hiding a block keeps all its data.'))+homeSwitch()+
      `<section class="nx-panel nx-home-options">${order.map(k=>{const on=visible.includes(k),i=visible.indexOf(k);return `<div class="nx-home-option"><button class="nx-home-toggle" data-nx="home-toggle" data-block="${k}" role="switch" aria-checked="${on}"><span>${labels[k]}</span><i aria-hidden="true"></i></button><div class="nx-home-order">${on?button('↑','home-move',`data-block="${k}" data-direction="-1" aria-label="${labels[k]}: ${t('выше','move up')}" ${i===0?'disabled':''}`)+button('↓','home-move',`data-block="${k}" data-direction="1" aria-label="${labels[k]}: ${t('ниже','move down')}" ${i===visible.length-1?'disabled':''}`):''}</div></div>`}).join('')}</section><p class="nx-muted">${t('Стрелки меняют порядок блоков. Изменения сохраняются сразу на этом устройстве.','Use arrows to reorder blocks. Changes are saved immediately on this device.')}</p>`+button(t('Готово','Done'),'profile','',true);
  }
  function homeAdd(){return button('‹ '+(addReturn==='plan'?t('План','Plan'):t('Сегодня','Today')),addReturn)+head(t('Что добавим?','What would you like to add?'))+`<div class="nx-home-add">${button('＋ '+t('Привычку','Habit'),'new-habit','',true)}${button('＋ '+t('Цель','Goal'),'new-goal')}${button('＋ '+t('Дело','Task'),'new-task')}</div>`}
  function today(){
    const tasks=state.goals.filter(g=>g.type==='task'&&(!g.deadline||g.deadline<=todayKey())&&!goalIsComplete(g));
    const completed=state.goals.filter(g=>g.type==='task'&&goalIsComplete(g)&&g.completedAt?.slice(0,10)===todayKey()).length;
    const gs=state.goals.filter(g=>g.type!=='task'&&!goalIsComplete(g)),hs=scheduledHabitsToday();
    const nextGoal=gs.find(g=>g.type==='regular'&&g.steps.some(s=>!s.done));
    const daily=hs.length?Math.round(hs.reduce((n,h)=>n+C.dayCredit(state,h,todayKey()),0)/hs.length*100):0;
    const p=homePrefs(),blocks={summary:()=>`<section class="nx-day-summary"><div class="nx-between"><b>${hs.filter(done).length} ${t('из','of')} ${hs.length} ${t('привычек выполнено','habits completed')}</b><span>${daily}%</span></div>${progress(daily)}<small>${t('Полоска учитывает и частичный результат','The bar includes partial progress')}</small></section>`,
tasks:()=>panel(t('Мои дела','My tasks'),(tasks.length?tasks.map(taskRow).join(''):empty(completed?t('Все дела на сегодня выполнены ✓','All tasks for today are done ✓'):t('Пока нет дел на сегодня.','No tasks for today yet.')))),
habits:()=>panel(t('Привычки','Habits'),hs.map(habitRow).join('')||empty(t('Добавь привычку в своём ритме.','Add a habit at your own pace.'))),
next:()=>(nextGoal?`<button class="nx-focus nx-next-step" data-nx="goal" ${attr(nextGoal.id)}><small>${t('СЛЕДУЮЩИЙ ЭТАП ЦЕЛИ','NEXT GOAL STEP')}</small><b>${esc(nextGoal.steps.find(s=>!s.done).name)}</b><span>${t('Цель','Goal')}: ${esc(nextGoal.name)} · ${t('Открыть →','Open →')}</span></button>`:''),
goals:()=>(gs.length?panel(t('Мои цели','My goals'),gs.slice(0,3).map(goalCard).join('')):''),
steps:()=>`<button class="nx-home-steps" data-nav="activity"><span class="nx-footprint">${rvUiIcon('steps')}</span><span><b>${t('Шаги сегодня','Steps today')}</b><small>${activityConnected()?num(state.activity.steps)+' / '+num(state.activity.stepGoal):t('Подключить шаги','Connect steps')}</small>${progress(activityConnected()?stepPct():0)}</span><span aria-hidden="true">›</span></button>`,
shared:()=>(window.RivayaAccountUI?.friendsEntry?.(true)||'')};
    return `<div class="nx-home ${p.mode}">`+head(t('Сегодня','Today'),new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(new Date()))+
      p[p.mode].map(k=>`<div class="nx-home-block" data-home-block="${k}">${blocks[k]()}</div>`).join('')+
      (!p[p.mode].length?empty(t('Твой экран пока пуст. Добавь привычку или выбери нужные блоки.','Your home is empty. Add a habit or choose your blocks.')):'')+
      `<div class="nx-home-footer">${button('＋ '+t('Добавить','Add'),'home-add','',true)}</div></div>`;
  }
  function plan(){
    const tasks=state.goals.filter(g=>g.type==='task'),gs=state.goals.filter(g=>g.type!=='task');
    const active=list=>list.filter(g=>!goalIsComplete(g)),finished=(planFilter==='habits'?[]:state.goals.filter(g=>goalIsComplete(g)&&(planFilter!=='goals'||g.type!=='task')));
    return `<div class="nx-plan"><div class="nx-between">${head(t('План','Plan'))}${button('＋','home-add',`aria-label="${t('Добавить','Add')}"`,true)}</div>`+
      `<div class="nx-plan-tabs">${[['all',t('Всё','All')],['habits',t('Привычки','Habits')],['goals',t('Цели','Goals')]].map(([v,l])=>button(l,'plan-filter',`data-filter="${v}" aria-pressed="${planFilter===v}"`)).join('')}</div>`+
      (planFilter==='all'&&active(tasks).length?panel(t('Дела','Tasks'),active(tasks).map(taskRow).join('')):'')+
      (planFilter!=='goals'?panel(t('Привычки','Habits'),state.habits.map(habitRow).join('')||empty(t('Нажми +, чтобы добавить привычку.','Tap + to add a habit.'))):'')+
      (planFilter!=='habits'?panel(t('Цели','Goals'),active(gs).map(goalCard).join('')||empty(t('Нажми +, чтобы добавить цель.','Tap + to add a goal.'))):'')+
      (finished.length?`<details class="nx-panel nx-completed"><summary>${t('Завершённые','Completed')} · ${finished.length}</summary>${finished.map(g=>g.type==='task'?taskRow(g):goalCard(g)).join('')}</details>`:'')+
      (planFilter!=='habits'&&window.RivayaAccountUI?button(t('Совместные цели','Shared goals')+' ›','account-shared'):'')+'</div>';
  }
  function nextReminder(h){
    if(!h.reminderEnabled)return t('Выключены','Off');
    if(h.stopWhenDone!==false&&done(h))return t('На сегодня завершены','Completed for today');
    const now=new Date(),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    const available=C.times(h).filter(x=>!timeInQuiet(x));
    return available.find(x=>x>time)||(available.length?t('Следующий запланированный день','Next scheduled day')+' · '+available[0]:t('Нет времени вне тихих часов','No time outside quiet hours'));
  }
  function habitDetail(){
    const h=habit();if(!h){currentView='plan';return plan()}
    const e=C.entry(h,todayKey()),count=C.numeric(h);
    return button('‹ '+t('Привычки','Habits'),'plan')+head(esc(h.name),frequency(h))+
      panel(t('Сегодня','Today'),count?`<div class="nx-number">${num(e.value)} <span>/ ${num(e.target)}</span></div><p class="nx-muted">${esc(e.unit)}</p>${progress(e.value/e.target*100)}<div class="nx-actions">${button('＋'+num(C.increment(h)),'plus',attr(h.id),true)}${C.increment(h)!==1?button('＋1','plus-one',attr(h.id)):''}${button(t('Изменить результат','Edit result'),'count',attr(h.id))}${button(t('Прибавка: +','Increment: +')+num(C.increment(h)),'increment',attr(h.id))}</div>`:button(done(h)?t('Выполнено ✓','Completed ✓'):t('Отметить выполнение','Mark complete'),'check',attr(h.id),true))+
      panel(t('Напоминания','Reminders'),`<div class="nx-between"><span>${t('Следующее','Next')}</span><b>${esc(nextReminder(h))}</b></div><p class="nx-muted">${C.times(h).join(' · ')||t('Время не выбрано','No times selected')}</p>${button(t('Настроить','Configure'),'edit-habit',attr(h.id))}`)+
      panel(t('Последние 7 дней','Last 7 days'),days(7).map(d=>{const v=h.counts?.[d];return `<div class="nx-between nx-history"><span>${date(d)}</span><b>${v?`${num(v.value)} / ${num(v.target)} ${esc(v.unit)}`:state.checks[d+'_'+h.id]?'✓':'—'}</b></div>`}).join(''))+
      button(t('Изменить привычку','Edit habit'),'edit-habit',attr(h.id));
  }
  function goalDetail(){
    const g=goal();if(!g){currentView='plan';return plan()}
    if(g.type==='quantity')return button('‹ '+t('План','Plan'),'plan')+head(esc(g.name),g.deadline?t('До ','Due ')+date(g.deadline):'')+
      `<section class="nx-panel nx-quantity-hero"><span class="nx-quantity-icon">${rvUiIcon('target')}</span><div class="nx-number">${num(g.currentValue)} <span>/ ${num(g.targetValue)}</span></div><p>${esc(g.unit)}</p>${progress(goalPct(g))}<b>${goalPct(g)}%</b></section>`+
      `<div class="nx-quantity-kpis"><div><small>${t('Осталось','Remaining')}</small><b>${num(Math.max(0,g.targetValue-g.currentValue))} ${esc(g.unit)}</b></div><div><small>${t('Выполнено','Completed')}</small><b>${goalPct(g)}%</b></div></div>`+
      button('＋ '+t('Добавить результат','Add progress'),'quantity-add',attr(g.id),true)+
      panel(t('Последние записи','Recent entries'),g.entries.length?g.entries.slice(-10).reverse().map(e=>`<div class="nx-between nx-history"><span>${date(e.date)}${e.initial?' · '+t('Начальное значение','Initial value'):''}</span><b>+${num(e.amount)} ${esc(g.unit)}</b></div>`).join(''):empty(t('Здесь появятся внесённые результаты.','Your progress entries will appear here.')))+button(t('Изменить цель','Edit goal'),'edit-goal',attr(g.id));
    return button('‹ '+t('Мои цели','My goals'),'plan')+head(esc(g.name),g.deadline?t('До ','Due ')+date(g.deadline):'')+
      panel(t('Прогресс','Progress'),`<div class="nx-number">${goalPct(g)}<span>%</span></div>${progress(goalPct(g))}${g.type==='money'?`<p>${num(g.currentAmount)} / ${num(g.targetAmount)} ₽</p>${button('＋ '+t('Добавить','Add'),'money',attr(g.id),true)}`:`<p>${g.steps.filter(s=>s.done).length} / ${g.steps.length} ${t('этапов','steps')}</p>`}`)+
      (g.type!=='money'?panel(t('Этапы','Steps'),g.steps.map(s=>`<div class="nx-row"><button class="nx-check ${s.done?'checked':''}" data-nx="step" data-id="${g.id}" data-step="${s.id}" aria-label="${t('Отметить этап','Toggle step')}" aria-pressed="${s.done}">${s.done?'✓':''}</button><button class="nx-row-copy" data-nx="edit-step" data-id="${g.id}" data-step="${s.id}"><b>${esc(s.name)}</b><small>${date(s.deadline||'')}</small></button></div>`).join('')+button('＋ '+t('Добавить этап','Add step'),'new-step',attr(g.id))):'')+
      button(t('Изменить цель','Edit goal'),'edit-goal',attr(g.id));
  }
  function ring(value,label,detail='',tone='cyan',unknown=false,icon=false){
    const p=Math.max(0,Math.min(100,Number(value)||0));
    return `<div class="nx-ring nx-ring-${tone}" style="--nx-p:${p}" role="img" aria-label="${esc(label)}: ${unknown?'—':p+'%'}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="nx-ring-track" cx="60" cy="60" r="51"/><circle class="nx-ring-value" cx="60" cy="60" r="51" pathLength="100" stroke-dasharray="${p} 100"/></svg><div class="nx-ring-copy">${icon?`<span class="nx-footprint">${rvUiIcon('steps')}</span>`:''}<strong>${unknown?'—':p+'<small>%</small>'}</strong>${detail?`<span>${detail}</span>`:''}</div></div>`;
  }
  function report(){
    const ending=new Date();ending.setDate(ending.getDate()-reportOffset*period);
    const range=Array.from({length:period},(_,i)=>{const d=new Date(ending);d.setDate(d.getDate()-period+1+i);return dateKey(d)});
    const stats=state.habits.map(h=>({h,...habitStats(h,period,ending)})),target=stats.reduce((a,x)=>a+x.target,0),credit=stats.reduce((a,x)=>a+x.done,0),pct=target?Math.min(100,Math.round(credit/target*100)):0;
    const rhythm=range.map(day=>{const planned=state.habits.filter(h=>habitScheduledOnDate(h,new Date(day+'T12:00:00')));return{day,target:planned.length,credit:planned.reduce((n,h)=>n+C.dayCredit(state,h,day),0)}});
    const size=period===365?Math.ceil(period/12):1,bins=[];for(let i=0;i<rhythm.length;i+=size){const xs=rhythm.slice(i,i+size),n=xs.reduce((n,x)=>n+x.target,0);bins.push({day:xs[0].day,last:xs.at(-1).day,p:n?Math.round(xs.reduce((n,x)=>n+x.credit,0)/n*100):null})}
    const bars=bins.map((x,i)=>`<div class="nx-report-bar" aria-label="${date(x.day)}${x.last!==x.day?' – '+date(x.last):''}: ${x.p===null?t('нет плана','no plan'):x.p+'%'}"><div><i style="height:${x.p||0}%"></i></div><small>${period===7?new Intl.DateTimeFormat(lang(),{weekday:'short'}).format(new Date(x.day+'T12:00:00')):period===30?(i%5===0?new Date(x.day+'T12:00:00').getDate():''):date(x.day)}</small></div>`).join('');
    const connected=activityConnected(),known=connected?range.filter(d=>Object.hasOwn(state.activity.dailySteps||{},d)):[],steps=known.reduce((n,d)=>n+Math.max(0,Number(state.activity.dailySteps[d])||0),0);
    const goals=state.goals.filter(g=>g.type!=='task'),completed=state.goals.filter(g=>g.type==='task'&&range.includes(g.completedAt?.slice(0,10))).length;
    return `<div class="nx-report-clean">`+head(t('Прогресс','Progress'))+
      `<div class="nx-actions nx-periods">${[7,30,365].map(n=>button(({7:t('Неделя','Week'),30:t('Месяц','Month'),365:t('Год','Year')})[n],'period',`data-period="${n}" aria-pressed="${period===n}"`)).join('')}</div>`+
      `<div class="nx-between nx-report-range">${button('‹','report-prev',`aria-label="${t('Предыдущий период','Previous period')}"`)}<b>${date(range[0])} — ${date(range.at(-1))}</b>${button('›','report-next',`aria-label="${t('Следующий период','Next period')}" ${reportOffset===0?'disabled':''}`)}</div>`+
      `<section class="nx-panel nx-period-summary"><small>${t('За выбранный период','For the selected period')}</small><div class="nx-between"><div class="nx-number">${num(Number(credit.toFixed(1)))} <span>${t('из','of')} ${num(target)}</span></div><b>${pct}%</b></div><p>${t('С учётом частичного результата привычек','Includes partial habit progress')}</p>${progress(pct)}</section>`+
      panel(t('Выполнение по дням','Daily habit progress'),`<div class="nx-report-bars ${period===30?'month':''}" style="--bars:${bins.length}">${bars}</div>${period===365?`<p class="nx-muted">${t('График сгруппирован по интервалам; даты указаны под столбцами.','Chart is grouped into intervals; dates are shown below.')}</p>`:''}`)+
      panel(t('Привычки за период','Habits in this period'),stats.map(x=>`<button class="nx-report-habit" data-nx="habit" ${attr(x.h.id)}><div class="nx-between"><b>${esc(x.h.name)}</b><strong>${x.p}%</strong></div><small>${num(Number(x.done.toFixed(1)))} / ${num(x.target)} · ${t('включая частичный результат','including partial progress')}</small>${progress(x.p)}</button>`).join('')||empty(t('Добавь привычку в Плане.','Add a habit in Plan.')))+
      `<section class="nx-panel nx-period-steps"><div class="nx-between"><span class="nx-footprint">${rvUiIcon('steps')}</span><div><small>${t('Шаги за выбранный период','Steps in the selected period')} · ${window.RIVAYA_IOS?'Apple Health':'Health Connect'}</small><b>${known.length?num(steps):'—'}</b></div><button class="nx-step-symbol" data-nav="activity" aria-label="${t('История шагов','Step history')}">${rvUiIcon('steps')}</button></div>${!connected?`<p class="nx-muted">${t('Доступ к шагам не включён','Step access is not enabled')}</p>${button(t('Разрешить доступ','Allow access'),'health-access','',true)}`:known.length<range.length?`<p class="nx-muted">${t('Данные за','Data for')} ${known.length} / ${range.length} ${t('дней. Пустые дни не считаются нулевыми.','days. Missing days are not counted as zero.')}</p>`:''}</section>`+
      `<section class="nx-panel" id="nx-report-goals"><h2>${t('Цели · текущий результат','Goals · current progress')}</h2><p class="nx-muted nx-section-note">${t('Не зависит от периода выше','Independent of the selected period above')}</p>${goals.map(goalCard).join('')||empty(t('Добавь первую цель в Плане.','Add your first goal in Plan.'))}</section>`+
      `<div class="nx-period-footer"><span>${t('Дела за период','Tasks in this period')}</span><b>${completed}</b></div></div>`;
  }
  function activity(){
    const source=window.RIVAYA_IOS?'Apple Health / HealthKit':'Health Connect',connected=activityConnected();
    const range=days(stepPeriod),daily=state.activity.dailySteps||{};
    const entries=range.map(d=>({day:d,value:connected&&Object.hasOwn(daily,d)?Math.max(0,Number(daily[d])||0):null}));
    const known=entries.filter(e=>e.value!==null),total=known.reduce((sum,e)=>sum+e.value,0),best=known.reduce((a,e)=>!a||e.value>a.value?e:a,null);
    const selectedDay=range.includes(stepDay)?stepDay:todayKey(),selectedEntry=entries.find(e=>e.day===selectedDay),max=Math.max(state.activity.stepGoal,...known.map(e=>e.value),1);
    const bars=entries.map(e=>`<button type="button" class="nx-step-bar ${e.day===selectedDay?'selected':''} ${e.value===null?'unknown':''}" data-nx="step-day" data-day="${e.day}" aria-pressed="${e.day===selectedDay}" aria-label="${date(e.day)}: ${e.value===null?t('нет данных','no data'):num(e.value)+' '+t('шагов','steps')}"><span class="nx-step-track"><i style="height:${e.value===null?0:e.value/max*100}%"></i></span>${stepPeriod===7?`<small>${new Intl.DateTimeFormat(lang(),{weekday:'short'}).format(new Date(e.day+'T12:00:00'))}</small>`:''}</button>`).join('');
    return head(t('Твоё движение','Your movement'),t('Каждый шаг — вклад в себя','Every step counts'))+
      `<section class="nx-panel nx-activity-hero"><div class="nx-between"><div><span class="nx-eyebrow">${t('ШАГИ СЕГОДНЯ','STEPS TODAY')}</span><div class="nx-number">${connected?num(state.activity.steps):'—'}</div><p class="nx-muted">${t('из','of')} ${num(state.activity.stepGoal)} ${t('шагов','steps')}</p></div>${ring(connected?stepPct():0,t('Дневная цель','Daily target'),'','green',!connected,true)}</div>${progress(connected?stepPct():0)}<div class="nx-between"><small class="nx-muted">${t('Обновляется автоматически','Updates automatically')}</small>${button(t('Изменить цель','Edit target'),'step-target')}</div></section>`+
      (!connected?panel(t('Доступ к шагам не включён','Step access is not enabled'),`<p>${t('Разреши чтение шагов из системного приложения активности.','Allow reading steps from your device health app.')}</p>${button(t('Разрешить доступ','Allow access'),'health-access','',true)}`):'')+
      `<section class="nx-panel nx-step-history"><div class="nx-between"><h2>${t('История шагов','Step history')}</h2><span class="nx-footprint">${rvUiIcon('steps')}</span></div><div class="nx-step-tabs" role="group" aria-label="${t('Период истории шагов','Step history range')}">${[7,30].map(n=>`<button data-nx="step-period" data-period="${n}" aria-pressed="${stepPeriod===n}" class="${stepPeriod===n?'active':''}">${n===7?t('Неделя','Week'):t('Месяц','Month')}</button>`).join('')}</div><p class="nx-muted nx-step-range">${date(range[0])} — ${date(range.at(-1))}</p><div class="nx-step-selected" aria-live="polite"><span>${date(selectedDay)}</span><b>${selectedEntry?.value===null?t('Нет данных','No data'):num(selectedEntry?.value)+' '+t('шагов','steps')}</b></div><div class="nx-step-chart ${stepPeriod===30?'month':''}" style="--days:${stepPeriod}">${bars}</div><div class="nx-step-axis"><span>${date(range[0])}</span><span>${t('Сегодня','Today')}</span></div><div class="nx-step-kpis"><div><small>${t('Всего шагов','Total steps')}</small><b>${known.length?num(total):'—'}</b></div><div><small>${t('В среднем за день','Daily average')}</small><b>${known.length?num(Math.round(total/known.length)):'—'}</b></div><div><small>${t('Лучший день','Best day')}</small><b>${best?num(best.value):'—'}</b><em>${best?date(best.day):''}</em></div></div>${known.length<range.length?`<p class="nx-muted nx-step-note">${t('Среднее — только по дням с данными. Пустые дни не считаются нулевыми.','Average uses days with data only. Missing days are not counted as zero.')}</p>`:''}<details class="nx-step-list"><summary>${t('Все дни','All days')}</summary>${entries.slice().reverse().map(e=>`<div class="nx-between nx-history"><span>${date(e.day)}</span><b>${e.value===null?'—':num(e.value)}</b></div>`).join('')}</details></section>`+
      `<section class="nx-panel nx-health-note"><h2>${source}</h2><p>${t('С твоего разрешения RIVAYA только читает шаги. Подключение необязательно. Данные здоровья не передаются разработчику или рекламным сервисам.','With your permission RIVAYA reads step count only. Connecting is optional. Health records are not sent to the developer or advertising services.')}</p>${button(t('Настройки доступа','Access settings'),'health-settings')}</section>`;
  }
  function profile(){
    return head(t('Профиль','Profile'))+(window.RivayaAccountUI?.profile?.()||'')+panel(esc(state.profile.name||t('Пользователь','User')),`<div class="nx-avatar">${rvAvatarMarkup(state.profile.name||'R')}</div><div class="nx-actions"><button class="nx-button" data-avatar-pick>${t('Фото профиля','Profile photo')}</button>${button(t('Изменить имя','Edit name'),'profile-name')}</div>`)+
      panel(t('Настройки','Settings'),`${button(t('Главный экран','Home screen'),'home-settings')}${button(t('Язык','Language')+' · '+({auto:t('Автоматически','Automatic'),ru:'Русский',en:'English'})[state.profile.language||'auto'],'language')}${button(t('Напоминания и тихие часы','Reminders and quiet hours'),'notifications')}${button('Apple Health / Health Connect','activity')}${button(t('Экспорт и восстановление','Export and restore'),'backup')}`)+
      panel(t('О приложении','About'),`<p>RIVAYA 4.2.0 · ${t('Твои дела. Твой прогресс.','Your tasks. Your progress.')}</p><p class="nx-muted">${window.RivayaAccounts?.active?t('Локальная копия и синхронизация с аккаунтом. Статус сохранения указан выше.','Local copy and account sync. Saving status is shown above.'):t('Данные гостевого режима хранятся на этом устройстве.','Guest data stays on this device.')}</p><button class="nx-button" data-external="https://rivayaapp.com/privacy.html">${t('Конфиденциальность','Privacy')}</button><button class="nx-button" data-external="https://www.instagram.com/_isma_guder_/">@_isma_guder_</button>`);
  }
  function field(key,label,type='text',extra=''){
    return `<label>${label}<input data-field="${key}" type="${type}" value="${esc(draft[key]??'')}" ${extra}></label>`;
  }
  function select(key,label,options){return `<label>${label}<select data-field="${key}">${options.map(([value,label])=>`<option value="${value}" ${draft[key]===value?'selected':''}>${label}</option>`).join('')}</select></label>`}
  function toggle(key,label){return `<label class="nx-toggle"><span>${label}</span><input data-field="${key}" type="checkbox" ${draft[key]?'checked':''}></label>`}
  function unitExample(){
    return t('Например: ','For example: ')+esc(String(draft.target||'100'))+' '+esc(draft.unit||t('единиц','units'))+t(' в день',' per day');
  }
  function habitPreview(){return `<b>${esc(draft.name||t('Новая привычка','New habit'))}</b><div class="nx-between"><small>${draft.tracking==='count'?'0 / '+num(draft.target)+' '+esc(draft.unit):frequency({freq:({daily:'Каждый день',weekdays:'По будням','3x':'3 раза в неделю'})[draft.freq]})}</small><span>${draft.tracking==='count'?'＋'+num(draft.increment):'○'}</span></div>${draft.tracking==='count'?progress(0):''}`}
  function updateHabitPreview(){const el=document.getElementById('nx-habit-preview');if(el&&draft?.kind==='habit')el.innerHTML=habitPreview()}
  document.addEventListener('toggle',e=>{if(draft&&e.target.matches?.('.nx-advanced'))draft.advanced=e.target.open;},true);
  function editor(){
    const kind=draft.kind;
    let title=t('Настройки','Settings'),content='';
    if(['habit','goal','task','step'].includes(kind))content=field('name',t('Название','Name'),'text','maxlength="100" required');
    if(kind==='habit'){
      title=draft.id?t('Изменить привычку','Edit habit'):t('Новая привычка','New habit');
      content+=select('tracking',t('Как отмечать','How to track'),[['check',t('Галочка','Check')],['count',t('Количество','Quantity')]])+
        (draft.tracking==='count'?`<div class="nx-form-pair">${field('target',t('В день','Per day'),'number','min="0.01" max="1000000" step="any" inputmode="decimal" required')}${select('unitChoice',t('Что считаем?','Unit'),[['раз',t('Раз','Reps')],['минут',t('Минуты','Minutes')],['страниц',t('Страницы','Pages')],['custom',t('Своё','Custom')]])}</div>`+(draft.unitChoice==='custom'?field('unit',t('Своя единица','Custom unit'),'text','maxlength="30" required'):'')+field('increment',t('Прибавлять за нажатие','Add per tap'),'number','min="0.01" max="1000000" step="any" inputmode="decimal" required')+`<div class="nx-actions nx-increments">${[1,5,10,20].map(n=>button('＋'+n,'set-increment',`data-amount="${n}" aria-pressed="${Number(draft.increment)===n}"`)).join('')}</div>`:'')+
        select('freq',t('Повторять','Repeat'),[['daily',t('Каждый день','Every day')],['weekdays',t('По будням','Weekdays')],['3x',t('3 раза в неделю','3 times a week')]])+
        `<details class="nx-advanced" ${draft.advanced?'open':''}><summary>${t('Дополнительно','Advanced')}<small>${t('Напоминания, срок, связь с целью','Reminders, end date, linked goal')}</small></summary>`+
        field('endDate',t('Дата окончания — необязательно','End date — optional'),'date')+
        select('goalId',t('Связать с целью','Link to goal'),[['',t('Без цели','No goal')],...state.goals.filter(g=>g.type==='regular').map(g=>[g.id,esc(g.name)])])+
        toggle('reminderEnabled',t('Напоминания','Reminders'))+
        (draft.reminderEnabled?`<div class="nx-times">${draft.times.map((time,i)=>`<div><input type="time" data-time="${i}" value="${esc(time)}" required><button type="button" class="nx-button" data-nx="remove-time" data-index="${i}" aria-label="${t('Удалить время','Remove time')}">−</button></div>`).join('')}</div>${button('＋ '+t('Добавить время','Add time'),'add-time')}`:'')+
        toggle('stopWhenDone',t('После выполнения не напоминать','Stop reminders after completion'))+'</details>'+
        `<section class="nx-live-preview"><small>${t('На главной','On your home')}</small><div id="nx-habit-preview">${habitPreview()}</div></section>`;
    }else if(kind==='goal'){
      title=draft.id?t('Изменить цель','Edit goal'):t('Новая цель','New goal');
      content+=select('type',t('Как измерять результат','How to measure progress'),[['regular',t('По этапам','Milestones')],['quantity',t('Количество','Quantity')],['money',t('Накопления','Savings')]])+
        (draft.type==='quantity'?`<div class="nx-form-pair">${field('targetValue',t('Всего','Target'),'number','min="0.01" max="1000000000" step="any" inputmode="decimal" required')}${field('unit',t('Единица','Unit'),'text','maxlength="30" placeholder="'+t('страниц','pages')+'" required')}</div>`+(!draft.id?field('currentValue',t('Уже выполнено','Already completed'),'number','min="0" max="1000000000" step="any" inputmode="decimal" required'):''):'')+
        (draft.type==='money'?field('targetAmount',t('Сумма цели, ₽','Savings target, ₽'),'number','min="1" required'):'')+
        field('deadline',t('Срок — необязательно','Due date — optional'),'date')+
        `<details class="nx-advanced" ${draft.advanced?'open':''}><summary>${t('Дополнительно','Advanced')}</summary>`+toggle('reminderEnabled',t('Напоминание','Reminder'))+(draft.reminderEnabled?field('reminderTime',t('Время','Time'),'time','required'):'')+'</details>';
    }else if(kind==='task'){
      title=t('Своё дело','Your task');content+=field('deadline',t('Дата — необязательно','Date — optional'),'date')+toggle('reminderEnabled',t('Напоминание','Reminder'))+(draft.reminderEnabled?field('reminderTime',t('Время','Time'),'time','required'):'');
    }else if(kind==='step'){
      title=t('Этап цели','Goal step');content+=field('deadline',t('Срок — необязательно','Due date — optional'),'date');
    }else if(kind==='increment'){
      title=t('Прибавка за нажатие','Add per tap');content=field('increment',t('Сколько добавлять?','How much to add?'),'number','min="0.01" max="1000000" step="any" inputmode="decimal" required')+`<div class="nx-actions nx-increments">${[1,5,10,20].map(n=>button('＋'+n,'set-increment',`data-amount="${n}"`)).join('')}</div><p class="nx-form-hint">${t('Можно указать своё число. Дневной результат не изменится — изменится только кнопка прибавления.','Choose any amount. Your daily result stays the same; only the increment button changes.')}</p>`;
    }else if(kind==='count'){
      title=t('Изменить результат','Edit result');content=field('value',esc(draft.name),'number','min="0" max="1000000000" step="any" required');
    }else if(kind==='money'){
      title=t('Добавить к накоплению','Add to savings');content=field('value',t('Сумма, ₽','Amount, ₽'),'number','min="0.01" step="any" required')+field('note',t('Комментарий','Note'),'text','maxlength="100"');
    }else if(kind==='quantity-add'){
      const g=goal();title=t('Добавить результат','Add progress');content=field('value',esc(g?.unit||''),'number','min="0.000001" max="1000000000" step="any" inputmode="decimal" required')+`<p id="nx-quantity-after" class="nx-form-hint"></p>`;
    }else if(kind==='language'){
      title=t('Язык приложения','App language');content=select('language','Русский / English',[['auto',t('По языку телефона','Use device language')],['ru','Русский'],['en','English']]);
    }else if(kind==='notifications'){
      title=t('Уведомления','Notifications');content=toggle('quietEnabled',t('Тихие часы','Quiet hours'))+field('quietStart',t('Начало','From'),'time')+field('quietEnd',t('Окончание','Until'),'time')+`<p class="nx-muted">${t('Время персональных напоминаний выбирается в каждой привычке или цели. На iPhone хранится очередь ближайших уведомлений: открывай приложение регулярно для её продления.','Choose reminder times for each habit or goal. iPhone keeps a limited queue of upcoming notifications; open the app regularly to renew it.')}</p>`;
    }else if(kind==='profile-name')content=field('name',t('Имя','Name'),'text','maxlength="30"');
    else if(kind==='step-target')content=field('value',t('Личная цель по шагам','Personal step target'),'number','min="1000" max="100000" required');
    return `<div class="nx-form-head">${button('‹ '+t('Отмена','Cancel'),'cancel')}</div>${head(title)}<form id="nx-form" class="nx-panel">${content}<p id="nx-error" role="alert"></p><button type="submit" class="nx-button nx-primary">${t('Сохранить','Save')}</button>${draft.id&&['habit','task','goal','step'].includes(kind)?button(t('Удалить','Delete'),'delete','class="nx-danger"'):''}</form>`;
  }
  function openEditor(kind,id,stepId){
    const h=state.habits.find(h=>h.id===id),g=state.goals.find(g=>g.id===id);
    draft={kind,id:id||'',name:'',deadline:'',reminderEnabled:false,reminderTime:''};
    if(kind==='habit')draft={...draft,...clone(h||{}),kind,tracking:h?.tracking||'check',target:h?.target||100,increment:h?.increment??(h?1:10),unit:h?.unit||'раз',unitChoice:!h?.unit?'раз':['раз','минут','страниц'].includes(h.unit)?h.unit:'custom',freq:h?habitMode(h):'daily',times:h?C.times(h):[],stopWhenDone:h?.stopWhenDone!==false,goalId:h?.goalId||'',endDate:h?.endDate||''};
    if(kind==='goal'||kind==='task')draft={...draft,targetValue:300,currentValue:0,unit:lang()==='en'?'pages':'страниц',...clone(g||{}),kind,type:g?.type||'regular'};
    if(kind==='step'){const s=g?.steps.find(s=>s.id===stepId);draft={...draft,...clone(s||{}),id:s?.id||'',owner:id,kind}}
    if(kind==='increment')draft={...draft,increment:C.increment(h)};
    if(kind==='count')draft={...draft,name:h.name,value:C.entry(h,todayKey()).value};
    if(kind==='quantity-add'){selected=id;draft={...draft,value:'',name:g?.name||''};}
    if(kind==='money')draft={...draft,value:'',note:''};
    if(kind==='language')draft.language=state.profile.language||'auto';
    if(kind==='notifications')Object.assign(draft,{quietEnabled:!!state.reminders.quietEnabled,quietStart:state.reminders.quietStart||'23:00',quietEnd:state.reminders.quietEnd||'08:00'});
    if(kind==='profile-name')draft.name=state.profile.name||'';
    if(kind==='step-target')draft.value=state.activity.stepGoal;
    draft.advanced=!!(draft.reminderEnabled||draft.endDate||draft.goalId);render();window.scrollTo(0,0);
  }
  function commit(){
    const d=draft,kind=d.kind,name=String(d.name||'').trim();
    if(['habit','goal','task','step'].includes(kind)&&(!name||name.length>100))throw Error(t('Укажи название','Enter a name'));
    if(kind==='habit'){
      const existing=state.habits.find(h=>h.id===d.id),timeList=[...new Set(d.times.filter(Boolean))].sort();
      if(d.reminderEnabled&&(!timeList.length||timeList.some(x=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(x))))throw Error(t('Выбери время напоминаний','Choose reminder times'));
      if(d.endDate&&d.endDate<(existing?.createdAt||todayKey()))throw Error(t('Проверь дату окончания','Check the end date'));
      const next={...(existing||{}),id:existing?.id||uid(),name,freq:{daily:'Каждый день',weekdays:'По будням','3x':'3 раза в неделю'}[d.freq],tracking:d.tracking,target:Number(d.target),increment:Number(d.increment),unit:String(d.unit||'').trim(),createdAt:existing?.createdAt||todayKey(),endDate:d.endDate,goalId:d.goalId,reminderEnabled:!!d.reminderEnabled,reminderTimes:timeList,reminderTime:timeList[0]||'',stopWhenDone:!!d.stopWhenDone};
      if(existing?.unit&&existing.unit!==next.unit&&Object.values(existing.counts||{}).some(e=>e.value>0))throw Error(t('Для другой единицы создай новую привычку: история не пересчитывается.','Create a new habit for another unit; existing history cannot be converted.'));
      C.validation({habits:[next]});
      if(C.numeric(next)){next.counts={...(next.counts||{})};if(next.counts[todayKey()])next.counts[todayKey()]={...next.counts[todayKey()],target:next.target};else if(state.checks[todayKey()+'_'+next.id])next.counts[todayKey()]={value:next.target,target:next.target,unit:next.unit};if(next.counts[todayKey()])state.checks[todayKey()+'_'+next.id]=next.counts[todayKey()].value>=next.target}
      if(existing)Object.assign(existing,next);else state.habits.push(next);
    }else if(kind==='task'||kind==='goal'){
      const existing=state.goals.find(g=>g.id===d.id),g={...(existing||{}),id:existing?.id||uid(),name,deadline:d.deadline||'',type:kind==='task'?'task':d.type,steps:existing?.steps||[],reminderEnabled:!!d.reminderEnabled,reminderTime:d.reminderTime||'',createdAt:existing?.createdAt||todayKey()};
      if(g.reminderEnabled&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(g.reminderTime))throw Error(t('Выбери время','Choose a time'));
      if(g.type==='task'&&!g.steps.length)g.steps=[{id:uid(),name,done:false}];
      if(g.type==='money'){g.targetAmount=Number(d.targetAmount);if(!Number.isFinite(g.targetAmount)||g.targetAmount<=0)throw Error(t('Укажи сумму цели','Enter the savings target'));g.currentAmount=existing?.currentAmount||0;g.contributions=existing?.contributions||[]}
      if(existing&&existing.type!==g.type&&(existing.type==='quantity'||existing.steps.length||(existing.currentAmount||0)>0))throw Error(t('Для другого способа учёта создай новую цель. История этой цели сохранится.','Create a new goal for another tracking type. This goal keeps its history.'));
      if(g.type==='quantity'){
        g.targetValue=Number(d.targetValue);g.currentValue=existing?.currentValue??Number(d.currentValue);g.unit=String(d.unit||'').trim();g.entries=existing?.entries||[];if(!existing&&g.currentValue>0)g.entries=[{id:uid(),date:todayKey(),amount:g.currentValue,initial:true}];
        if(existing?.unit!==undefined&&existing.unit!==g.unit&&(existing.currentValue>0||existing.entries?.length))throw Error(t('Для другой единицы создай новую цель.','Create a new goal for a different unit.'));
        C.validation({goals:[g]});
      }
      syncGoalStatus(g);if(existing)Object.assign(existing,g);else state.goals.push(g);
    }else if(kind==='step'){
      const g=state.goals.find(g=>g.id===d.owner);if(!g)throw Error('Goal missing');
      const s=g.steps.find(s=>s.id===d.id);if(s)Object.assign(s,{name,deadline:d.deadline||''});else g.steps.push({id:uid(),name,deadline:d.deadline||'',done:false});syncGoalStatus(g);
    }else if(kind==='increment'){
      const h=state.habits.find(h=>h.id===d.id),value=Number(d.increment);
      if(!h||!Number.isFinite(value)||value<0.01||value>1000000)throw Error(t('Прибавка: от 0,01 до 1 000 000','Increment: 0.01 to 1,000,000'));
      h.increment=value;
    }else if(kind==='quantity-add'){const g=state.goals.find(g=>g.id===d.id);if(!g)throw Error(t('Цель не найдена','Goal not found'));try{C.addGoalValue(g,Number(d.value),uid(),todayKey());syncGoalStatus(g)}catch{throw Error(t('Укажи положительный результат до 1 000 000 000','Enter a positive result up to 1,000,000,000'))}}
    else if(kind==='count')C.changeCount(state,d.id,todayKey(),Number(d.value));
    else if(kind==='money'){const g=state.goals.find(g=>g.id===d.id),value=Number(d.value);if(!g||!Number.isFinite(value)||value<=0)throw Error(t('Укажи положительную сумму','Enter a positive amount'));g.currentAmount=(Number(g.currentAmount)||0)+value;g.contributions=g.contributions||[];g.contributions.push({id:uid(),amount:value,date:todayKey(),note:d.note||''});syncGoalStatus(g)}
    else if(kind==='language')state.profile.language=d.language;
    else if(kind==='profile-name')state.profile.name=name;
    else if(kind==='step-target'){const n=Number(d.value);if(!Number.isFinite(n)||n<1000||n>100000)throw Error(t('Цель: от 1000 до 100000','Target: 1,000 to 100,000'));state.activity.stepGoal=Math.round(n)}
    else if(kind==='notifications'){if(![d.quietStart,d.quietEnd].every(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))throw Error(t('Проверь время','Check the times'));Object.assign(state.reminders,{quietEnabled:!!d.quietEnabled,quietStart:d.quietStart,quietEnd:d.quietEnd})}
    if(['habit','task','goal'].includes(kind)&&!d.id){const p=homePrefs(),key={habit:'habits',task:'tasks',goal:'goals'}[kind];if(!p[p.mode].includes(key))p[p.mode].push(key);state.profile.homeLayout=p;}
    save();if(['habit','task','goal'].includes(kind))syncSmartReminders(true);if(currentView==='home-add')currentView=addReturn;if(kind==='quantity-add')currentView='goal';draft=null;render();toast(t('Сохранено','Saved'));
  }
  function backup(){return head(t('Экспорт и восстановление','Export and restore'))+panel(t('Твои данные','Your data'),`<p>${t('Файл содержит личные данные и не зашифрован. Храни его в безопасном месте. При восстановлении текущие данные заменяются; предыдущая копия остаётся на устройстве.','The file contains personal data and is not encrypted. Keep it safe. Restoring replaces current data; a recovery copy remains on this device.')}</p>${button(t('Сохранить файл','Save file'),'backup-export')}${button(t('Выбрать файл','Choose file'),'backup-import')}`)}
  const oldCollect=collectSmartReminderItems;
  collectSmartReminderItems=function(){
    const common=oldCollect().filter(x=>!x.id.startsWith('habit-')&&!state.goals.some(g=>g.type==='task'&&x.id==='goal-'+g.id)).map(x=>lang()==='en'?{...x,title:x.id.startsWith('goal-')?(state.goals.find(g=>'goal-'+g.id===x.id)?.name||'RIVAYA'):'RIVAYA',body:x.id.startsWith('goal-')?'Take the next step towards your goal.':'Time to check your plan in RIVAYA.'}:x);
    const tasks=state.goals.filter(g=>g.type==='task'&&g.reminderEnabled&&!goalIsComplete(g)&&g.reminderTime&&!timeInQuiet(g.reminderTime)).map(g=>({id:'task-'+g.id,title:g.name,body:t('Напоминание о твоём деле.','A reminder about your task.'),time:g.reminderTime,weekdaysOnly:false,startDate:g.deadline||g.createdAt||todayKey(),endDate:g.deadline||g.createdAt||todayKey()}));
    return common.concat(tasks,C.reminders(state,{quiet:timeInQuiet,expired:h=>!!h.endDate&&h.endDate<todayKey(),weekdays:h=>habitMode(h)==='weekdays',lang:lang()}));
  };
  render=function(){
    const routes={today,'home-settings':homeSettings,'home-add':homeAdd,plan,habits:plan,goals:plan,progress:report,stats:report,calendar:report,profile,activity,habit:habitDetail,goal:goalDetail,backup};
    document.documentElement.lang=lang();
    Object.assign(routes,window.RivayaNextUI?.extensions||{});
    const locked=window.RivayaAccountUI?.isLocked?.();
    // Background Health/sync callbacks update state without replacing an active form.
    // Keep the same DOM nodes so the iOS keyboard, cursor and in-progress input survive.
    const externalKey=window.RivayaAccountUI?.editorKey?.()||'';
    if(!locked&&((draft&&renderedDraft===draft)||(externalKey&&externalKey===renderedExternalKey)))return;
    document.getElementById('view').innerHTML='<div class="nx-screen">'+(locked?window.RivayaAccountUI.lockedView():draft?editor():(routes[currentView]||today)())+'</div>';
    renderedDraft=locked?null:draft;renderedExternalKey=locked?'':externalKey;
    const group=currentView==='home-settings'?'profile':currentView==='home-add'?addReturn:['habit','goal','habits','goals','shared'].includes(currentView)?'plan':['activity','stats','calendar'].includes(currentView)?'progress':['backup','account'].includes(currentView)?'profile':currentView;
    document.querySelectorAll('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.nav===group);const small=b.querySelector('small');if(small)small.textContent=({today:t('Сегодня','Today'),plan:t('План','Plan'),progress:t('Прогресс','Progress'),profile:t('Профиль','Profile')})[b.dataset.nav]||''});
    const avatar=document.querySelector('.top-actions .avatar');if(avatar)avatar.innerHTML=rvAvatarMarkup(state.profile.name||'R');
  };
  document.addEventListener('input',e=>{
    if(!draft)return;const el=e.target;
    if(el.dataset.field){
      draft[el.dataset.field]=el.type==='checkbox'?el.checked:el.value;
      if(el.type==='checkbox'){renderedDraft=null;render()}
      else if(draft.kind==='habit')updateHabitPreview();
      if(draft.kind==='quantity-add'){const g=goal(),n=Number(draft.value),hint=document.getElementById('nx-quantity-after');if(hint)hint.textContent=g&&n>0&&Number.isFinite(n)?t('После добавления: ','After adding: ')+num(g.currentValue+n)+' / '+num(g.targetValue)+' '+g.unit:''}
    }
    if(el.dataset.time!==undefined)draft.times[Number(el.dataset.time)]=el.value;
  });
  document.addEventListener('change',e=>{
    if(!draft||e.target.tagName!=='SELECT')return;
    const key=e.target.dataset.field;draft[key]=e.target.value;
    if(key==='unitChoice'){if(draft.unitChoice==='custom'){draft.unit=''}else draft.unit=draft.unitChoice}
    renderedDraft=null;render();
  });
  document.addEventListener('submit',e=>{if(e.target.id!=='nx-form')return;e.preventDefault();try{commit()}catch(error){document.getElementById('nx-error').textContent=error.message}},true);
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-nav]'),el=e.target.closest('[data-nx]');
    if(!el&&!nav)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(window.RivayaAccountUI?.isLocked?.()&&el?.dataset.nx!=='account-recover-workspace')return;
    if(el?.dataset.nx.startsWith('account-')){window.RivayaAccountUI?.action(el.dataset.nx,el);return}
    if(nav&&!el){draft=null;currentView=nav.dataset.nav;render();window.scrollTo(0,0);if(['today','activity','progress'].includes(currentView))requestNativeHealthRefresh();return}
    const a=el.dataset.nx,id=el.dataset.id;
    if(['today','plan','profile','activity','backup','home-settings','home-add'].includes(a)){if(a==='home-add')addReturn=currentView==='plan'?'plan':'today';draft=null;currentView=a;if(a==='activity')requestNativeHealthRefresh()}
    else if(a==='plan-filter'){planFilter=['habits','goals'].includes(el.dataset.filter)?el.dataset.filter:'all'}
    else if(a==='home-mode'){const p=homePrefs();p.mode=el.dataset.mode==='simple'?'simple':'expanded';saveHome(p)}
    else if(a==='home-toggle'){const p=homePrefs(),k=el.dataset.block;if(homeKeys.includes(k)){p[p.mode]=p[p.mode].includes(k)?p[p.mode].filter(x=>x!==k):p[p.mode].concat(k);saveHome(p)}}
    else if(a==='home-move'){const p=homePrefs(),list=p[p.mode],i=list.indexOf(el.dataset.block),j=i+Number(el.dataset.direction);if(i>=0&&j>=0&&j<list.length){[list[i],list[j]]=[list[j],list[i]];saveHome(p)}}
    else if(a==='habit'||a==='goal'){selected=id;draft=null;currentView=a}
    else if(a==='new-habit'||a==='edit-habit')return openEditor('habit',id);
    else if(a==='new-task'||a==='edit-task')return openEditor('task',id);
    else if(a==='new-goal'||a==='edit-goal')return openEditor('goal',id);
    else if(a==='new-step'||a==='edit-step')return openEditor('step',id,el.dataset.step);
    else if(['quantity-add','count','increment','money','language','profile-name','step-target','notifications'].includes(a))return openEditor(a,id);
    else if(a==='cancel')draft=null;
    else if(a==='add-time'){if(draft.times.length>=12){toast(t('До 12 времён на привычку','Up to 12 times per habit'));return}draft.times.push('');renderedDraft=null}
    else if(a==='remove-time'){draft.times.splice(Number(el.dataset.index),1);renderedDraft=null}
    else if(a==='set-increment'){draft.increment=Number(el.dataset.amount);const field=document.querySelector('[data-field="increment"]');if(field)field.value=draft.increment;updateHabitPreview();document.querySelectorAll('[data-nx="set-increment"]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.amount)===draft.increment));return}
    else if(a==='plus'||a==='plus-one'){const h=state.habits.find(h=>h.id===id);if(!habitScheduledOnDate(h,new Date())){toast(t('На сегодня не запланировано','Not scheduled today'));return}try{C.addCount(state,id,todayKey(),a==='plus-one'?1:undefined);save()}catch{toast(t('Не удалось прибавить: проверь количество.','Could not add: check the quantity.'));return}}
    else if(a==='check'){const h=state.habits.find(h=>h.id===id);if(!h||!habitScheduledOnDate(h,new Date())){toast(t('На сегодня не запланировано','Not scheduled today'));return}setDone(id,!doneToday(id))}
    else if(a==='step'){const g=state.goals.find(g=>g.id===id),s=g?.steps.find(s=>s.id===el.dataset.step);if(s){s.done=!s.done;syncGoalStatus(g);save()}}
    else if(a==='task-check'){const g=state.goals.find(g=>g.id===id);if(g){g.steps[0].done=!goalIsComplete(g);syncGoalStatus(g);save()}}
    else if(a==='period'){period=[7,30,365].includes(Number(el.dataset.period))?Number(el.dataset.period):7;reportOffset=0}
    else if(a==='report-prev')reportOffset=Math.min(120,reportOffset+1);
    else if(a==='report-next')reportOffset=Math.max(0,reportOffset-1);
    else if(a==='step-period'){stepPeriod=Number(el.dataset.period)===30?30:7;stepDay=''}
    else if(a==='step-day')stepDay=el.dataset.day;
    else if(a==='delete'){
      if(!confirm(t('Удалить эту запись?','Delete this record?')))return;
      if(draft.kind==='habit'){state.habits=state.habits.filter(h=>h.id!==draft.id);for(const k of Object.keys(state.checks))if(k.endsWith('_'+draft.id))delete state.checks[k]}
      else if(draft.kind==='step'){const g=state.goals.find(g=>g.id===draft.owner);g.steps=g.steps.filter(s=>s.id!==draft.id);syncGoalStatus(g)}
      else state.goals=state.goals.filter(g=>g.id!==draft.id);
      draft=null;currentView='plan';save();
    }else if(a==='report-goals'){document.getElementById('nx-report-goals')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    else if(a==='health-info'){currentView='activity';requestNativeHealthRefresh()}
    else if(a==='health-refresh')requestNativeHealthRefresh();
    else if(a==='health-access'){if(!requestNativeHealthAccess())toast(t('Доступно в мобильном приложении','Available in the mobile app'))}
    else if(a==='health-settings'){if(!openNativeHealthSettings())toast(t('Доступно в мобильном приложении','Available in the mobile app'))}
    else if(a==='backup-export')document.getElementById('saveBackupFileBtn').click();
    else if(a==='backup-import')document.getElementById('loadBackupFileBtn').click();
    render();
  },true);
  window.RivayaNextUI={lang,t,commit,openEditor,getDraft:()=>draft,extensions:{},back(){if(draft){draft=null;render();return true}if(currentView==='today')return false;currentView=['habit','goal'].includes(currentView)?'plan':['backup','home-settings'].includes(currentView)?'profile':currentView==='home-add'?addReturn:'today';render();return true}};
  const oldStatus=window.rivayaOnNotificationStatus;
  window.rivayaOnNotificationStatus=function(message){oldStatus?.(message);if(/60|Часть|Не удалось|Разрешите|выключены/.test(message))toast(lang()==='ru'?message:t('','Check notification access and open RIVAYA regularly to renew upcoming reminders.'))};
  let activeDate=todayKey();
  setInterval(()=>{if(activeDate!==todayKey()){activeDate=todayKey();render();syncSmartReminders(false)}},60000);
  render();syncSmartReminders(false);
})();
