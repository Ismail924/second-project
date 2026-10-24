/* Personal paths are local, optional, and never replace existing goals or habits. */
(function(){
  'use strict';
  const templates=[
    {name:'7 дней движения',icon:'↗',description:'Небольшие прогулки в удобном темпе. Меняй задания под себя.',steps:['Выйти на короткую прогулку','Найти приятный маршрут','Прогуляться 15 минут','Сделать перерыв на движение','Пройтись в удобном темпе','Повторить любимый маршрут','Подвести итоги недели движения']},
    {name:'Начать читать',icon:'▤',description:'От первой страницы к собственному ритму чтения.',steps:['Выбрать книгу','Прочитать 5 минут','Найти удобное время для чтения','Прочитать 10 минут','Записать интересную мысль','Продолжить чтение','Выбрать свой ритм на следующую неделю']},
    {name:'Продвинуть свой проект',icon:'✦',description:'Разбей большой замысел на небольшие действия.',steps:['Описать желаемый результат','Выбрать первый маленький шаг','Выделить время в расписании','Выполнить первый шаг','Показать результат и получить отзыв','Улучшить одну важную деталь','Оценить результат и выбрать следующий шаг']}
  ];
  const uid=()=> 'p'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
  let selected='',editor=null;
  const paths=()=>state.paths||(state.paths=[]);
  const tasks=()=>state.tasks||(state.tasks=[]);
  function validate(s){
    const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9-]+$/.test(x);
    const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=200;
    const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(new Date(x+'T12:00:00').getTime())&&dateKey(new Date(x+'T12:00:00'))===x;
    for(const name of ['tasks','paths']){
      if(s[name]===undefined)continue;
      if(!Array.isArray(s[name]))throw Error('Повреждены задания или пути');
      const ids=new Set();
      for(const item of s[name]){
        if(!item||!validId(item.id)||ids.has(item.id)||!text(item.name))throw Error('Повреждены задания или пути');
        ids.add(item.id);
        if(name==='tasks'){
          if(!day(item.date)||typeof item.done!=='boolean')throw Error('Повреждено задание');
        }else{
          if(!Array.isArray(item.steps)||!item.steps.length||item.steps.length>30||!day(item.createdAt)||!['active','archived'].includes(item.status))throw Error('Повреждён путь');
          const stepIds=new Set();
          for(const step of item.steps){
            if(!step||!validId(step.id)||stepIds.has(step.id)||!text(step.name)||!text(step.easy)||!(step.doneAt===null||day(step.doneAt))||typeof step.light!=='boolean')throw Error('Повреждён этап пути');
            stepIds.add(step.id);
          }
        }
      }
    }
  }
  function progress(p){const done=p.steps.filter(s=>s.doneAt).length;return {done,total:p.steps.length,p:Math.round(done/p.steps.length*100)}}
  function saveChange(){validate(state);save();render()}
  function taskList(){
    const today=todayKey();
    const list=tasks().filter(t=>t.date<=today&&(!t.done||t.date===today)).sort((a,b)=>a.date.localeCompare(b.date));
    return `<section class="rp-panel"><div class="rp-heading"><div><small>МОЙ ДЕНЬ</small><h2>Свои задания</h2></div><button data-rp-action="new-task">＋ Добавить</button></div>${list.length?list.map(t=>`<div class="rp-task ${t.done?'is-done':''}"><button class="rp-check" data-rp-task="${t.id}" aria-label="${t.done?'Снять отметку':'Выполнить задание'}" aria-pressed="${t.done}">${t.done?'✓':''}</button><button class="rp-task-copy" data-rp-edit-task="${t.id}"><b>${esc(t.name)}</b><small>${t.date<today?'Перенесено с '+esc(t.date):'Сегодня'} · Изменить</small></button></div>`).join(''):'<p class="rp-muted">Запиши своё дело на сегодня. Программу выбирать необязательно.</p>'}</section>`;
  }
  function pathCard(p,compact=false){
    const s=progress(p),next=p.steps.find(x=>!x.doneAt);
    return `<button class="rp-path-card" data-rp-path="${p.id}"><div class="rp-heading"><small>${s.done===s.total?'ПУТЬ ПРОЙДЕН':'МОЙ ПУТЬ'}</small><strong>${s.done}/${s.total}</strong></div><h${compact?'3':'2'}>${esc(p.name)}</h${compact?'3':'2'}><div class="rp-bar"><i style="width:${s.p}%"></i></div><p>${next?esc(next.light?next.easy:next.name):'Все этапы выполнены. Твой результат сохранён.'}</p><span class="rp-link">${next?'Продолжить':'Посмотреть итог'} →</span></button>`;
  }
  function home(){return taskList()+paths().filter(p=>p.status==='active'&&p.steps.some(s=>!s.doneAt)).slice(0,2).map(p=>pathCard(p,true)).join('')}
  function planSection(){return `<section class="rp-panel"><div class="rp-heading"><div><small>ТВОЙ ВЫБОР</small><h2>Задания и пути</h2></div></div><p class="rp-muted">Добавляй свои дела, составляй свой маршрут или выбери готовый.</p><div class="rp-actions"><button class="primary" data-rp-action="new-task">＋ Своё задание</button><button class="secondary" data-nav="paths">Открыть пути →</button></div></section>`}
  function renderPaths(){
    if(editor)return renderEditor();
    const p=paths().find(x=>x.id===selected);
    if(p)return detail(p);
    const active=paths().filter(p=>p.status==='active'),archived=paths().filter(p=>p.status==='archived');
    return `<div class="rv-screen rp-screen"><div class="rp-heading"><div><h1>Пути к цели</h1><p class="rp-muted">В твоём темпе. По твоим правилам.</p></div></div><div class="rp-actions"><button class="primary" data-rp-action="new-path">＋ Создать свой путь</button><button class="secondary" data-rp-action="new-task">Своё задание</button></div><p class="rp-muted">Программы необязательны. Обычные цели и привычки остаются в «Плане».</p>${tasks().length?`<section class="rp-panel"><h2>Все свои задания</h2>${tasks().slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>`<div class="rp-task ${t.done?'is-done':''}"><button class="rp-check" data-rp-task="${t.id}" aria-label="${t.done?'Снять отметку':'Выполнить задание'}" aria-pressed="${t.done}">${t.done?'✓':''}</button><button class="rp-task-copy" data-rp-edit-task="${t.id}"><b>${esc(t.name)}</b><small>${esc(t.date)}${t.done?' · выполнено':''} · Изменить</small></button></div>`).join('')}</section>`:''}${active.length?`<h2>Мои пути</h2>${active.map(p=>pathCard(p)).join('')}`:''}<h2>Готовые программы</h2><p class="rp-muted">Проверь и измени задания перед началом. Один этап в день или свой ритм.</p>${templates.map((t,i)=>`<section class="rp-panel rp-template"><span class="rp-template-icon">${t.icon}</span><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><button class="secondary" data-rp-template="${i}">Посмотреть и настроить →</button></section>`).join('')}${archived.length?`<h2>Архив</h2>${archived.map(p=>pathCard(p,true)).join('')}`:''}</div>`;
  }
  function detail(p){
    const s=progress(p),next=p.steps.find(x=>!x.doneAt);
    return `<div class="rv-screen rp-screen"><button class="ghost" data-rp-action="list">‹ Все пути</button><div class="rp-hero"><small>${p.status==='archived'?'АРХИВ':'МОЙ ПУТЬ'}</small><h1>${esc(p.name)}</h1><b>${s.done} из ${s.total} этапов · ${s.p}%</b><div class="rp-bar"><i style="width:${s.p}%"></i></div><p>${next?'Продолжай с удобного этапа. Перерыв не обнуляет результат.':'Путь пройден! Посмотри, сколько ты уже сделал.'}</p></div>${p.status==='active'&&next?`<section class="rp-panel"><small>СЛЕДУЮЩИЙ ШАГ</small><h2>${esc(next.light?next.easy:next.name)}</h2><button class="primary full" data-rp-step="${next.id}" data-rp-owner="${p.id}">Готово ✓</button><button class="ghost full" data-rp-light="${next.id}" data-rp-owner="${p.id}" aria-pressed="${next.light}">${next.light?'Вернуть полное задание':'Сегодня тяжело — облегчить'}</button><p class="rp-muted">Отмечай выполнение после действия. Шаги из Apple Health доступны в «Активности».</p></section>`:''}<section class="rp-panel"><h2>Твой маршрут</h2>${p.steps.map((step,i)=>`<div class="rp-task ${step.doneAt?'is-done':''}"><button class="rp-check" data-rp-step="${step.id}" data-rp-owner="${p.id}" aria-label="Этап ${i+1}: ${step.doneAt?'снять отметку':'выполнить'}" aria-pressed="${!!step.doneAt}" ${p.status==='archived'?'disabled':''}>${step.doneAt?'✓':i+1}</button><div class="rp-task-copy"><b>${esc(step.light?step.easy:step.name)}</b><small>${step.doneAt?'Выполнено '+esc(step.doneAt):'В своём темпе'}${step.light?' · облегчённый вариант':''}</small></div></div>`).join('')}</section><div class="rp-actions"><button class="secondary" data-rp-edit-path="${p.id}">Изменить путь</button><button class="ghost" data-rp-archive="${p.id}">${p.status==='archived'?'Вернуть в работу':'Убрать в архив'}</button></div></div>`;
  }
  function makeEditor(template){
    const t=template||{name:'',steps:['']};
    return {type:'path',id:null,name:t.name,steps:t.steps.map(name=>({id:uid(),name,easy:'Сделать небольшой шаг: '+name,doneAt:null,light:false}))};
  }
  function editorFields(){
    if(!editor)return;
    editor.name=document.getElementById('rp-name').value;
    if(editor.type==='task')editor.date=document.getElementById('rp-date').value;
    else editor.steps.forEach((s,i)=>{s.name=document.getElementById('rp-step-'+i).value;s.easy=document.getElementById('rp-easy-'+i).value});
  }
  function renderEditor(){
    const task=editor.type==='task';
    return `<div class="rv-screen rp-screen"><button class="ghost" data-rp-action="cancel">‹ Отмена</button><h1>${task?'Своё задание':editor.id?'Изменить путь':'Создать путь'}</h1><p class="rp-muted">${task?'Любое дело, которое важно тебе.':'Назови результат и добавь понятные шаги. Всё можно изменить.'}</p><form id="rp-form" class="rp-panel"><label for="rp-name">${task?'Что нужно сделать?':'Название пути'}</label><input id="rp-name" maxlength="200" required value="${esc(editor.name)}" placeholder="${task?'Например, починить машину':'Например, подготовиться к экзамену'}">${task?`<label for="rp-date">Дата</label><input type="date" id="rp-date" required value="${esc(editor.date)}">`:editor.steps.map((s,i)=>`<fieldset><legend>Этап ${i+1}${s.doneAt?' · выполнен':''}</legend><label for="rp-step-${i}">Задание</label><input id="rp-step-${i}" maxlength="200" required value="${esc(s.name)}" placeholder="Что будешь делать?"><label for="rp-easy-${i}">Облегчённый вариант</label><input id="rp-easy-${i}" maxlength="200" required value="${esc(s.easy)}" placeholder="Самый маленький посильный шаг"><button type="button" class="ghost" data-rp-remove="${i}" ${editor.steps.length===1?'disabled':''}>Удалить этап</button></fieldset>`).join('')}${!task?'<button type="button" class="secondary full" data-rp-action="add-step">＋ Добавить этап</button>':''}<p id="rp-error" role="alert" class="rp-error"></p><button class="primary full" type="submit">${editor.id?'Сохранить изменения':task?'Добавить задание':'Начать путь'}</button>${task&&editor.id?'<button type="button" class="ghost full" data-rp-action="delete-task">Удалить задание</button>':''}</form></div>`;
  }
  const oldToday=renderToday,oldPlan=renderPlan;
  renderToday=function(){return oldToday().replace('<section class="rv-target-habits-card">',home()+'<section class="rv-target-habits-card">')};
  renderPlan=function(){return oldPlan().replace('<section class="rv-plan-quick">',planSection()+'<section class="rv-plan-quick">')};
  document.addEventListener('input',e=>{
    if(!editor)return;
    const id=e.target.id,value=e.target.value;
    if(id==='rp-name')editor.name=value;
    if(id==='rp-date'&&editor.type==='task')editor.date=value;
    const field=id.match(/^rp-(step|easy)-(\d+)$/);
    if(field&&editor.type==='path'&&editor.steps[Number(field[2])])editor.steps[Number(field[2])][field[1]==='step'?'name':'easy']=value;
  });
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-rp-action],[data-rp-path],[data-rp-template],[data-rp-task],[data-rp-edit-task],[data-rp-step],[data-rp-light],[data-rp-edit-path],[data-rp-archive],[data-rp-remove]');
    if(!el)return;
    const d=el.dataset,a=d.rpAction;
    if(a==='new-task'){editor={type:'task',id:null,name:'',date:todayKey()};selected=''}
    if(a==='new-path'){editor=makeEditor();selected=''}
    if(a==='list'||a==='cancel'){editor=null;selected=''}
    if(a==='add-step'){editorFields();if(editor.steps.length>=30){toast('В одном пути до 30 этапов');return}editor.steps.push({id:uid(),name:'',easy:'',doneAt:null,light:false})}
    if(a==='delete-task'){if(!confirm('Удалить это задание?'))return;state.tasks=tasks().filter(t=>t.id!==editor.id);editor=null;saveChange();return}
    if(d.rpRemove!==undefined){editorFields();const i=Number(d.rpRemove);if(editor.steps[i].doneAt&&!confirm('Удалить выполненный этап и его отметку?'))return;if(editor.steps.length>1)editor.steps.splice(i,1)}
    if(d.rpTemplate!==undefined)editor=makeEditor(templates[Number(d.rpTemplate)]);
    if(d.rpPath){selected=d.rpPath;editor=null}
    if(d.rpTask){const t=tasks().find(t=>t.id===d.rpTask);if(t){t.done=!t.done;saveChange()}return}
    if(d.rpEditTask){const t=tasks().find(t=>t.id===d.rpEditTask);if(!t)return;editor={...t,type:'task'}}
    if(d.rpEditPath){const p=paths().find(p=>p.id===d.rpEditPath);if(!p)return;editor={...clone(p),type:'path'}}
    if(d.rpStep||d.rpLight){const p=paths().find(p=>p.id===d.rpOwner);if(!p||p.status!=='active')return;const s=p.steps.find(s=>s.id===(d.rpStep||d.rpLight));if(!s)return;if(d.rpStep)s.doneAt=s.doneAt?null:todayKey();else s.light=!s.light;saveChange();return}
    if(d.rpArchive){const p=paths().find(p=>p.id===d.rpArchive);if(p){p.status=p.status==='archived'?'active':'archived';saveChange()}return}
    currentView='paths';render();window.scrollTo(0,0);
  });
  document.addEventListener('submit',e=>{
    if(e.target.id!=='rp-form')return;e.preventDefault();editorFields();
    const name=editor.name.trim();if(!name)return;
    const record=editor.type==='task'?{id:editor.id||uid(),name,date:editor.date,done:!!editor.done}:{id:editor.id||uid(),name,createdAt:editor.createdAt||todayKey(),status:editor.status||'active',steps:editor.steps.map(s=>({...s,name:s.name.trim(),easy:s.easy.trim()}))};
    const collection=editor.type==='task'?'tasks':'paths';
    try{validate({[collection]:[record]})}catch{document.getElementById('rp-error').textContent='Заполни название, дату и все задания. Для каждого этапа нужен облегчённый вариант.';return}
    const list=state[collection]||(state[collection]=[]),i=list.findIndex(x=>x.id===record.id);
    if(i<0)list.push(record);else list[i]=record;
    selected=collection==='paths'?record.id:'';editor=null;currentView=collection==='tasks'?'today':'paths';saveChange();toast('Сохранено');
  });
  window.RivayaPaths={render:renderPaths,validate,progress,templates};
  render();
})();
