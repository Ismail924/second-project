/* One integrated 4.1 interface; legacy data and native bridges stay authoritative. */
(function(){
  'use strict';
  const C=window.RivayaNextCore;
  let selected='',draft=null,renderedDraft=null,renderedExternalKey='',period=7;
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
    return `<button class="nx-goal" data-nx="goal" ${attr(g.id)}><div class="nx-between"><b>${esc(g.name)}</b><span>${goalPct(g)}%</span></div>${progress(goalPct(g))}<small>${g.type==='money'?`${num(g.currentAmount)} / ${num(g.targetAmount)} ₽`:next?esc(next.name):g.steps.length?t('Все этапы завершены','All steps completed'):t('Добавь первый этап','Add your first step')}${g.deadline?' · '+date(g.deadline):''}</small></button>`;
  }
  function today(){
    const tasks=state.goals.filter(g=>g.type==='task'&&(!g.deadline||g.deadline<=todayKey())&&!goalIsComplete(g));
    const completed=state.goals.filter(g=>g.type==='task'&&goalIsComplete(g)&&g.completedAt?.slice(0,10)===todayKey()).length;
    const gs=state.goals.filter(g=>g.type!=='task'&&!goalIsComplete(g)),hs=scheduledHabitsToday();
    const nextGoal=gs.find(g=>g.type!=='money'&&g.steps.some(s=>!s.done));
    const daily=hs.length?Math.round(hs.reduce((n,h)=>n+C.dayCredit(state,h,todayKey()),0)/hs.length*100):0;
    return head(t('Сегодня','Today'),new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(new Date()))+
      `<section class="nx-habit-hero nx-today-hero"><div><span class="nx-eyebrow">${t('ШАГ ЗА ШАГОМ','ONE STEP AT A TIME')}</span><h2>${t('Твой день','Your day')}</h2><p>${t('Каждая привычка приближает к результату','Every habit brings you closer')}</p><span class="nx-pill">${t('Привычки выполнены','Habits completed')}: ${hs.filter(done).length} / ${hs.length}</span></div>${ring(daily,t('Привычки сегодня','Habits today'),t('за сегодня','today'))}</section>`+
      panel(t('Мои дела','My tasks'),(tasks.length?tasks.map(taskRow).join(''):empty(completed?t('Все дела на сегодня выполнены ✓','All tasks for today are done ✓'):t('Пока нет дел на сегодня.','No tasks for today yet.')))+button('＋ '+t('Добавить дело','Add a task'),'new-task','',true))+
      panel(t('Привычки','Habits'),hs.map(habitRow).join('')||empty(t('Добавь привычку в своём ритме.','Add a habit at your own pace.')))+
      (nextGoal?`<button class="nx-focus nx-next-step" data-nx="goal" ${attr(nextGoal.id)}><small>${t('СЛЕДУЮЩИЙ ЭТАП ЦЕЛИ','NEXT GOAL STEP')}</small><b>${esc(nextGoal.steps.find(s=>!s.done).name)}</b><span>${t('Цель','Goal')}: ${esc(nextGoal.name)} · ${t('Открыть →','Open →')}</span></button>`:'')+
      (gs.length?panel(t('Мои цели','My goals'),gs.slice(0,3).map(goalCard).join('')):'')+
      `<button class="nx-today-steps" data-nav="activity">${ring(activityConnected()?stepPct():0,t('Шаги','Steps'),'','green',!activityConnected())}<span><small>${window.RIVAYA_IOS?'Apple Health':'Health Connect'} · ${t('сегодня','today')}</small><b>${activityConnected()?num(state.activity.steps)+' '+t('шагов','steps'):t('Подключить шаги','Connect steps')}</b><em>${activityConnected()?t('Цель: ','Target: ')+num(state.activity.stepGoal):t('Разрешить доступ →','Allow access →')}</em></span><strong aria-hidden="true">›</strong></button>`+
      (window.RivayaAccountUI?.friendsEntry?.(true)||'')+(window.RIVAYA_IOS?button('Apple Health · HealthKit ⓘ','health-info'):'');
  }
  function plan(){
    const tasks=state.goals.filter(g=>g.type==='task'),gs=state.goals.filter(g=>g.type!=='task');
    return head(t('План','Plan'),t('Твои дела, привычки и результаты','Your tasks, habits and outcomes'))+
      `<div class="nx-actions">${button('＋ '+t('Дело','Task'),'new-task')}${button('＋ '+t('Привычка','Habit'),'new-habit')}${button('＋ '+t('Цель','Goal'),'new-goal')}${window.RivayaAccountUI?button(t('С другом','With a friend'),'account-shared'):''}</div>`+
      panel(t('Дела','Tasks'),tasks.map(taskRow).join('')||empty(t('Добавь любое личное дело.','Add any personal task.')))+
      panel(t('Привычки','Habits'),state.habits.map(habitRow).join('')||empty(t('Пока нет привычек','No habits yet')))+
      panel(t('Цели','Goals'),gs.map(goalCard).join('')||empty(t('Разбей важный результат на свои этапы.','Break an important outcome into your own steps.')))+(window.RivayaAccountUI?.friendsEntry?.()||'');
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
    return button('‹ '+t('Мои цели','My goals'),'plan')+head(esc(g.name),g.deadline?t('До ','Due ')+date(g.deadline):'')+
      panel(t('Прогресс','Progress'),`<div class="nx-number">${goalPct(g)}<span>%</span></div>${progress(goalPct(g))}${g.type==='money'?`<p>${num(g.currentAmount)} / ${num(g.targetAmount)} ₽</p>${button('＋ '+t('Добавить','Add'),'money',attr(g.id),true)}`:`<p>${g.steps.filter(s=>s.done).length} / ${g.steps.length} ${t('этапов','steps')}</p>`}`)+
      (g.type!=='money'?panel(t('Этапы','Steps'),g.steps.map(s=>`<div class="nx-row"><button class="nx-check ${s.done?'checked':''}" data-nx="step" data-id="${g.id}" data-step="${s.id}" aria-label="${t('Отметить этап','Toggle step')}" aria-pressed="${s.done}">${s.done?'✓':''}</button><button class="nx-row-copy" data-nx="edit-step" data-id="${g.id}" data-step="${s.id}"><b>${esc(s.name)}</b><small>${date(s.deadline||'')}</small></button></div>`).join('')+button('＋ '+t('Добавить этап','Add step'),'new-step',attr(g.id))):'')+
      button(t('Изменить цель','Edit goal'),'edit-goal',attr(g.id));
  }
  function ring(value,label,detail='',tone='cyan',unknown=false){
    const p=Math.max(0,Math.min(100,Number(value)||0));
    return `<div class="nx-ring nx-ring-${tone}" style="--nx-p:${p}" role="img" aria-label="${esc(label)}: ${unknown?'—':p+'%'}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="nx-ring-track" cx="60" cy="60" r="51"/><circle class="nx-ring-value" cx="60" cy="60" r="51" pathLength="100" stroke-dasharray="${p} 100"/></svg><div class="nx-ring-copy"><strong>${unknown?'—':p+'<small>%</small>'}</strong>${detail?`<span>${detail}</span>`:''}</div></div>`;
  }
  function report(){
    const range=days(period),stats=state.habits.map(h=>({h,...habitStats(h,period)}));
    const target=stats.reduce((a,x)=>a+x.target,0),total=stats.reduce((a,x)=>a+x.done,0),habitPercent=target?Math.min(100,Math.round(total/target*100)):0;
    const goals=state.goals.filter(g=>g.type!=='task'),goalPercent=goals.length?Math.round(goals.reduce((a,g)=>a+goalPct(g),0)/goals.length):0;
    const stages=goals.filter(g=>g.type!=='money').flatMap(g=>g.steps),stageDone=stages.filter(s=>s.done).length;
    const health=activityConnected(),source=window.RIVAYA_IOS?'Apple Health':'Health Connect';
    const completedTasks=state.goals.filter(g=>g.type==='task'&&g.completedAt&&range.includes(g.completedAt.slice(0,10))).length;
    const rangeLabel=({7:t('За неделю','This week'),30:t('За месяц','This month'),365:t('За год','This year')})[period];
    const habitRows=stats.map(x=>{
      const e=C.entry(x.h,todayKey()),credit=C.dayCredit(state,x.h,todayKey()),scheduled=habitScheduledOnDate(x.h,new Date());
      const todayLabel=C.numeric(x.h)?`${t('Сегодня: ','Today: ')}${num(e.value)} / ${num(e.target)} ${esc(e.unit)} · ${Math.round(credit*100)}%`:scheduled?(credit?t('Выполнено сегодня','Done today'):t('Сегодня ещё впереди','Still ahead today')):t('Сегодня без плана','Not planned today');
      return `<button class="nx-report-habit" data-nx="habit" ${attr(x.h.id)}><div class="nx-between"><b>${esc(x.h.name)}</b><strong>${x.p}%</strong></div><small>${rangeLabel} · ${todayLabel}</small>${progress(x.p)}</button>`;
    }).join('');
    const chartDays=days(7),rhythm=chartDays.map(d=>{
      const planned=state.habits.filter(h=>habitScheduledOnDate(h,new Date(d+'T12:00:00'))),value=planned.length?Math.round(planned.reduce((a,h)=>a+C.dayCredit(state,h,d),0)/planned.length*100):0;
      return `<div class="nx-rhythm-day" aria-label="${date(d)}: ${planned.length?value+'%':t('Нет плана','No plan')}"><span>${planned.length?value+'%':'—'}</span><div class="nx-rhythm-track"><i style="height:${value}%"></i></div><small>${new Intl.DateTimeFormat(lang()==='en'?'en-GB':'ru-RU',{weekday:'short'}).format(new Date(d+'T12:00:00'))}</small></div>`;
    }).join('');
    return head(t('Прогресс','Progress'),t('Каждое действие имеет значение','Every action counts'))+
      `<div class="nx-actions nx-periods">${[7,30,365].map(n=>button(({7:t('Неделя','Week'),30:t('Месяц','Month'),365:t('Год','Year')})[n],'period',`data-period="${n}" aria-pressed="${period===n}"`)).join('')}</div>`+
      `<section class="nx-overview" aria-label="${t('Обзор прогресса','Progress overview')}"><div class="nx-habit-hero"><div><span class="nx-eyebrow">${rangeLabel}</span><h2>${t('Твой ритм','Your rhythm')}</h2><p>${t('Привычки, включая частичный результат','Habits, including partial progress')}</p><span class="nx-pill">${t('Сегодня','Today')} · ${scheduledHabitsToday().filter(h=>C.dayCredit(state,h,todayKey())>0).length} / ${scheduledHabitsToday().length} ${t('в движении','in motion')}</span></div>${ring(habitPercent,t('Привычки','Habits'),t('привычки','habits'))}</div><div class="nx-mini-grid"><button class="nx-summary-card" data-nx="report-goals">${ring(goalPercent,t('Цели','Goals'),'','violet')}<b>${t('Цели','Goals')}</b><small>${stageDone} / ${stages.length} ${t('этапов','steps')}</small><em>${t('Текущий результат','Current progress')}</em></button><button class="nx-summary-card" data-nav="activity">${ring(health?stepPct():0,t('Шаги сегодня','Steps today'),'','green',!health)}<b>${health?num(state.activity.steps):t('Шаги','Steps')}</b><small>${health?t('из ','of ')+num(state.activity.stepGoal):t('Разрешить доступ','Allow access')}</small><em>${source} · ${t('сегодня','today')}</em></button></div></section>`+
      panel(t('Мои привычки','My habits'),habitRows||empty(t('Добавь первую привычку в Плане.','Add your first habit in Plan.')))+
      `<section class="nx-panel" id="nx-report-goals"><div class="nx-between"><h2>${t('Движение к целям','Moving towards goals')}</h2><span class="nx-pill">${goalPercent}%</span></div><p class="nx-muted nx-section-note">${t('Текущий результат · каждый выполненный этап учитывается','Current progress · every completed step counts')}</p>${goals.map(g=>`<button class="nx-goal" data-nx="goal" ${attr(g.id)}><div class="nx-between"><b>${esc(g.name)}</b><strong>${goalPct(g)}%</strong></div>${progress(goalPct(g))}<small>${g.type==='money'?`${num(g.currentAmount)} / ${num(g.targetAmount)} ₽`:`${g.steps.filter(s=>s.done).length} / ${g.steps.length} ${t('этапов выполнено','steps completed')}`}</small></button>`).join('')||empty(t('Здесь появятся твои цели и их этапы.','Your goals and steps will appear here.'))}</section>`+
      panel(t('Шаги и движение','Steps and movement'),`<div class="nx-between"><div><span class="nx-eyebrow">${source} · ${t('сегодня','today')}</span><div class="nx-steps-number">${health?num(state.activity.steps):'—'}<small> / ${num(state.activity.stepGoal)}</small></div></div><span class="nx-step-symbol" aria-hidden="true">↗</span></div>${progress(health?stepPct():0)}${!health?`<p class="nx-muted">${t('Доступ к шагам не включён. Разреши чтение, чтобы видеть движение и проценты здесь.','Step access is not enabled. Allow reading to see steps and percentages here.')}</p>${button(t('Разрешить доступ','Allow access'),'health-access','',true)}`:`<p class="nx-muted">${t('Шаги обновляются из системного приложения здоровья.','Steps update from your device health app.')}</p>`}<div class="nx-actions">${button(t('Подробнее','Details'),'activity')}${button(t('Обновить','Refresh'),'health-refresh')}</div>`)+
      panel(t('Ритм за 7 дней','Your last 7 days'),`<p class="nx-muted nx-section-note">${t('Выполнение привычек с учётом количества','Habit progress includes quantities')}</p><div class="nx-rhythm">${rhythm}</div>`)+
      `<div class="nx-period-footer"><span>${rangeLabel}</span><b>${completedTasks} ${t('дел выполнено','tasks completed')}</b></div>`;
  }
  function activity(){
    const source=window.RIVAYA_IOS?'Apple Health / HealthKit':'Health Connect';
    return head(t('Активность','Activity'),source)+panel(t('Шаги сегодня','Steps today'),`<div class="nx-number">${activityConnected()?num(state.activity.steps):'—'}</div><p>${t('Дневная цель','Daily target')}: ${num(state.activity.stepGoal)}</p>${progress(activityConnected()?stepPct():0)}<div class="nx-actions">${button(t('Изменить цель','Edit target'),'step-target')}${button(t('Обновить','Refresh'),'health-refresh')}</div>`)+
      (!activityConnected()?panel(t('Доступ к шагам не включён','Step access is not enabled'),`<p>${t('Разреши чтение шагов из системного приложения активности.','Allow reading steps from your device health app.')}</p>${button(t('Разрешить доступ','Allow access'),'health-access','',true)}`):'')+
      panel(source,`<p>${t('С твоего разрешения RIVAYA только читает шаги. Подключение необязательно. Данные здоровья не передаются разработчику или рекламным сервисам.','With your permission RIVAYA reads step count only. Connecting is optional. Health records are not sent to the developer or advertising services.')}</p>${button(t('Настройки доступа','Access settings'),'health-settings')}`)+
      panel(t('Последние 7 дней','Last 7 days'),days(7).map(d=>`<div class="nx-between nx-history"><span>${date(d)}</span><b>${num(state.activity.dailySteps?.[d])}</b></div>`).join(''));
  }
  function profile(){
    return head(t('Профиль','Profile'))+(window.RivayaAccountUI?.profile?.()||'')+panel(esc(state.profile.name||t('Пользователь','User')),`<div class="nx-avatar">${rvAvatarMarkup(state.profile.name||'R')}</div><div class="nx-actions"><button class="nx-button" data-avatar-pick>${t('Фото профиля','Profile photo')}</button>${button(t('Изменить имя','Edit name'),'profile-name')}</div>`)+
      panel(t('Настройки','Settings'),`${button(t('Язык','Language')+' · '+({auto:t('Автоматически','Automatic'),ru:'Русский',en:'English'})[state.profile.language||'auto'],'language')}${button(t('Напоминания и тихие часы','Reminders and quiet hours'),'notifications')}${button('Apple Health / Health Connect','activity')}${button(t('Экспорт и восстановление','Export and restore'),'backup')}`)+
      panel(t('О приложении','About'),`<p>RIVAYA 4.1 · ${t('Твои дела. Твой прогресс.','Your tasks. Your progress.')}</p><p class="nx-muted">${window.RivayaAccounts?.active?t('Локальная копия и синхронизация с аккаунтом. Статус сохранения указан выше.','Local copy and account sync. Saving status is shown above.'):t('Данные гостевого режима хранятся на этом устройстве.','Guest data stays on this device.')}</p><button class="nx-button" data-external="https://rivayaapp.com/privacy.html">${t('Конфиденциальность','Privacy')}</button><button class="nx-button" data-external="https://www.instagram.com/_isma_guder_/">@_isma_guder_</button>`);
  }
  function field(key,label,type='text',extra=''){
    return `<label>${label}<input data-field="${key}" type="${type}" value="${esc(draft[key]??'')}" ${extra}></label>`;
  }
  function select(key,label,options){return `<label>${label}<select data-field="${key}">${options.map(([value,label])=>`<option value="${value}" ${draft[key]===value?'selected':''}>${label}</option>`).join('')}</select></label>`}
  function toggle(key,label){return `<label class="nx-toggle"><span>${label}</span><input data-field="${key}" type="checkbox" ${draft[key]?'checked':''}></label>`}
  function unitExample(){
    return t('Например: ','For example: ')+esc(String(draft.target||'100'))+' '+esc(draft.unit||t('единиц','units'))+t(' в день',' per day');
  }
  function editor(){
    const kind=draft.kind;
    let title=t('Настройки','Settings'),content='';
    if(['habit','goal','task','step'].includes(kind))content=field('name',t('Название','Name'),'text','maxlength="100" required');
    if(kind==='habit'){
      title=t('Привычка','Habit');
      content+=select('freq',t('Расписание','Schedule'),[['daily',t('Каждый день','Every day')],['weekdays',t('По будням','Weekdays')],['3x',t('3 раза в неделю','3 times a week')]])+
        select('tracking',t('Способ учёта','Tracking'),[['check',t('Простая отметка','Simple check')],['count',t('Количество','Quantity')]])+
        (draft.tracking==='count'?field('target',t('Сколько в день?','How much per day?'),'number','min="0.01" max="1000000" step="any" inputmode="decimal" placeholder="100" required')+select('unitChoice',t('Что считаем?','What are you counting?'),[['раз',t('Раз (например, отжимания)','Reps (for example, push-ups)')],['минут',t('Минуты','Minutes')],['страниц',t('Страницы','Pages')],['custom',t('Своя единица','Custom unit')]])+(draft.unitChoice==='custom'?field('unit',t('Своя единица','Custom unit'),'text','maxlength="30" placeholder="'+t('Например, км','For example, km')+'" required'):'')+`<p class="nx-form-hint" id="nx-unit-example">${unitExample()}</p>`+field('increment',t('Прибавлять за одно нажатие','Add per tap'),'number','min="0.01" max="1000000" step="any" inputmode="decimal" required'):'')+
        field('endDate',t('Дата окончания — необязательно','End date — optional'),'date')+
        select('goalId',t('Связать с целью','Link to goal'),[['',t('Без цели','No goal')],...state.goals.filter(g=>g.type!=='task'&&g.type!=='money').map(g=>[g.id,esc(g.name)])])+
        toggle('reminderEnabled',t('Напоминания','Reminders'))+
        (draft.reminderEnabled?`<div class="nx-times">${draft.times.map((time,i)=>`<div><input type="time" data-time="${i}" value="${esc(time)}" required><button type="button" class="nx-button" data-nx="remove-time" data-index="${i}" aria-label="${t('Удалить время','Remove time')}">−</button></div>`).join('')}</div>${button('＋ '+t('Добавить время','Add time'),'add-time')}`:'')+
        toggle('stopWhenDone',t('После выполнения не напоминать','Stop reminders after completion'));
    }else if(kind==='goal'){
      title=t('Цель','Goal');content+=select('type',t('Тип','Type'),[['regular',t('Этапы','Steps')],['money',t('Накопления','Savings')]])+field('deadline',t('Срок — необязательно','Due date — optional'),'date')+(draft.type==='money'?field('targetAmount',t('Сумма цели, ₽','Savings target, ₽'),'number','min="1" required'):'');
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
    if(kind==='goal'||kind==='task')draft={...draft,...clone(g||{}),kind,type:g?.type||'regular'};
    if(kind==='step'){const s=g?.steps.find(s=>s.id===stepId);draft={...draft,...clone(s||{}),id:s?.id||'',owner:id,kind}}
    if(kind==='increment')draft={...draft,increment:C.increment(h)};
    if(kind==='count')draft={...draft,name:h.name,value:C.entry(h,todayKey()).value};
    if(kind==='money')draft={...draft,value:'',note:''};
    if(kind==='language')draft.language=state.profile.language||'auto';
    if(kind==='notifications')Object.assign(draft,{quietEnabled:!!state.reminders.quietEnabled,quietStart:state.reminders.quietStart||'23:00',quietEnd:state.reminders.quietEnd||'08:00'});
    if(kind==='profile-name')draft.name=state.profile.name||'';
    if(kind==='step-target')draft.value=state.activity.stepGoal;
    render();window.scrollTo(0,0);
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
      syncGoalStatus(g);if(existing)Object.assign(existing,g);else state.goals.push(g);
    }else if(kind==='step'){
      const g=state.goals.find(g=>g.id===d.owner);if(!g)throw Error('Goal missing');
      const s=g.steps.find(s=>s.id===d.id);if(s)Object.assign(s,{name,deadline:d.deadline||''});else g.steps.push({id:uid(),name,deadline:d.deadline||'',done:false});syncGoalStatus(g);
    }else if(kind==='increment'){
      const h=state.habits.find(h=>h.id===d.id),value=Number(d.increment);
      if(!h||!Number.isFinite(value)||value<0.01||value>1000000)throw Error(t('Прибавка: от 0,01 до 1 000 000','Increment: 0.01 to 1,000,000'));
      h.increment=value;
    }else if(kind==='count')C.changeCount(state,d.id,todayKey(),Number(d.value));
    else if(kind==='money'){const g=state.goals.find(g=>g.id===d.id),value=Number(d.value);if(!g||!Number.isFinite(value)||value<=0)throw Error(t('Укажи положительную сумму','Enter a positive amount'));g.currentAmount=(Number(g.currentAmount)||0)+value;g.contributions=g.contributions||[];g.contributions.push({id:uid(),amount:value,date:todayKey(),note:d.note||''});syncGoalStatus(g)}
    else if(kind==='language')state.profile.language=d.language;
    else if(kind==='profile-name')state.profile.name=name;
    else if(kind==='step-target'){const n=Number(d.value);if(!Number.isFinite(n)||n<1000||n>100000)throw Error(t('Цель: от 1000 до 100000','Target: 1,000 to 100,000'));state.activity.stepGoal=Math.round(n)}
    else if(kind==='notifications'){if(![d.quietStart,d.quietEnd].every(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))throw Error(t('Проверь время','Check the times'));Object.assign(state.reminders,{quietEnabled:!!d.quietEnabled,quietStart:d.quietStart,quietEnd:d.quietEnd})}
    save();if(kind==='habit'||kind==='task')syncSmartReminders(true);draft=null;render();toast(t('Сохранено','Saved'));
  }
  function backup(){return head(t('Экспорт и восстановление','Export and restore'))+panel(t('Твои данные','Your data'),`<p>${t('Файл содержит личные данные и не зашифрован. Храни его в безопасном месте. При восстановлении текущие данные заменяются; предыдущая копия остаётся на устройстве.','The file contains personal data and is not encrypted. Keep it safe. Restoring replaces current data; a recovery copy remains on this device.')}</p>${button(t('Сохранить файл','Save file'),'backup-export')}${button(t('Выбрать файл','Choose file'),'backup-import')}`)}
  const oldCollect=collectSmartReminderItems;
  collectSmartReminderItems=function(){
    const common=oldCollect().filter(x=>!x.id.startsWith('habit-')&&!state.goals.some(g=>g.type==='task'&&x.id==='goal-'+g.id)).map(x=>lang()==='en'?{...x,title:x.id.startsWith('goal-')?(state.goals.find(g=>'goal-'+g.id===x.id)?.name||'RIVAYA'):'RIVAYA',body:x.id.startsWith('goal-')?'Take the next step towards your goal.':'Time to check your plan in RIVAYA.'}:x);
    const tasks=state.goals.filter(g=>g.type==='task'&&g.reminderEnabled&&!goalIsComplete(g)&&g.reminderTime&&!timeInQuiet(g.reminderTime)).map(g=>({id:'task-'+g.id,title:g.name,body:t('Напоминание о твоём деле.','A reminder about your task.'),time:g.reminderTime,weekdaysOnly:false,startDate:g.deadline||g.createdAt||todayKey(),endDate:g.deadline||g.createdAt||todayKey()}));
    return common.concat(tasks,C.reminders(state,{quiet:timeInQuiet,expired:h=>!!h.endDate&&h.endDate<todayKey(),weekdays:h=>habitMode(h)==='weekdays',lang:lang()}));
  };
  render=function(){
    const routes={today,plan,habits:plan,goals:plan,progress:report,stats:report,calendar:report,profile,activity,habit:habitDetail,goal:goalDetail,backup};
    document.documentElement.lang=lang();
    Object.assign(routes,window.RivayaNextUI?.extensions||{});
    const locked=window.RivayaAccountUI?.isLocked?.();
    // Background Health/sync callbacks update state without replacing an active form.
    // Keep the same DOM nodes so the iOS keyboard, cursor and in-progress input survive.
    const externalKey=window.RivayaAccountUI?.editorKey?.()||'';
    if(!locked&&((draft&&renderedDraft===draft)||(externalKey&&externalKey===renderedExternalKey)))return;
    document.getElementById('view').innerHTML='<div class="nx-screen">'+(locked?window.RivayaAccountUI.lockedView():draft?editor():(routes[currentView]||today)())+'</div>';
    renderedDraft=locked?null:draft;renderedExternalKey=locked?'':externalKey;
    const group=['habit','goal','habits','goals','shared'].includes(currentView)?'plan':['activity','stats','calendar'].includes(currentView)?'progress':['backup','account'].includes(currentView)?'profile':currentView;
    document.querySelectorAll('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.nav===group);const small=b.querySelector('small');if(small)small.textContent=({today:t('Сегодня','Today'),plan:t('План','Plan'),progress:t('Прогресс','Progress'),profile:t('Профиль','Profile')})[b.dataset.nav]||''});
    const avatar=document.querySelector('.top-actions .avatar');if(avatar)avatar.innerHTML=rvAvatarMarkup(state.profile.name||'R');
  };
  document.addEventListener('input',e=>{
    if(!draft)return;const el=e.target;
    if(el.dataset.field){
      draft[el.dataset.field]=el.type==='checkbox'?el.checked:el.value;
      if(el.type==='checkbox'){renderedDraft=null;render()}
      else if(['target','unit'].includes(el.dataset.field)){const example=document.getElementById('nx-unit-example');if(example)example.innerHTML=unitExample()}
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
    if(['today','plan','profile','activity','backup'].includes(a)){draft=null;currentView=a}
    else if(a==='habit'||a==='goal'){selected=id;draft=null;currentView=a}
    else if(a==='new-habit'||a==='edit-habit')return openEditor('habit',id);
    else if(a==='new-task'||a==='edit-task')return openEditor('task',id);
    else if(a==='new-goal'||a==='edit-goal')return openEditor('goal',id);
    else if(a==='new-step'||a==='edit-step')return openEditor('step',id,el.dataset.step);
    else if(['count','increment','money','language','profile-name','step-target','notifications'].includes(a))return openEditor(a,id);
    else if(a==='cancel')draft=null;
    else if(a==='add-time'){if(draft.times.length>=12){toast(t('До 12 времён на привычку','Up to 12 times per habit'));return}draft.times.push('');renderedDraft=null}
    else if(a==='remove-time'){draft.times.splice(Number(el.dataset.index),1);renderedDraft=null}
    else if(a==='set-increment'){draft.increment=Number(el.dataset.amount);const field=document.querySelector('[data-field="increment"]');if(field)field.value=draft.increment;return}
    else if(a==='plus'||a==='plus-one'){const h=state.habits.find(h=>h.id===id);if(!habitScheduledOnDate(h,new Date())){toast(t('На сегодня не запланировано','Not scheduled today'));return}try{C.addCount(state,id,todayKey(),a==='plus-one'?1:undefined);save()}catch{toast(t('Не удалось прибавить: проверь количество.','Could not add: check the quantity.'));return}}
    else if(a==='check'){const h=state.habits.find(h=>h.id===id);if(!h||!habitScheduledOnDate(h,new Date())){toast(t('На сегодня не запланировано','Not scheduled today'));return}setDone(id,!doneToday(id))}
    else if(a==='step'){const g=state.goals.find(g=>g.id===id),s=g?.steps.find(s=>s.id===el.dataset.step);if(s){s.done=!s.done;syncGoalStatus(g);save()}}
    else if(a==='task-check'){const g=state.goals.find(g=>g.id===id);if(g){g.steps[0].done=!goalIsComplete(g);syncGoalStatus(g);save()}}
    else if(a==='period')period=Number(el.dataset.period);
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
  window.RivayaNextUI={lang,t,commit,openEditor,getDraft:()=>draft,extensions:{},back(){if(draft){draft=null;render();return true}if(currentView==='today')return false;currentView=['habit','goal'].includes(currentView)?'plan':currentView==='backup'?'profile':'today';render();return true}};
  const oldStatus=window.rivayaOnNotificationStatus;
  window.rivayaOnNotificationStatus=function(message){oldStatus?.(message);if(/60|Часть|Не удалось|Разрешите|выключены/.test(message))toast(lang()==='ru'?message:t('','Check notification access and open RIVAYA regularly to renew upcoming reminders.'))};
  let activeDate=todayKey();
  setInterval(()=>{if(activeDate!==todayKey()){activeDate=todayKey();render();syncSmartReminders(false)}},60000);
  render();syncSmartReminders(false);
})();
