/* Live UI is gated until native Apple login, sync and account deletion pass live checks. */
(function(){
 'use strict';
 const config=window.RIVAYA_BACKEND;if(!config?.enabled)return;
 const U=window.RivayaNextUI,t=U.t,core=window.RivayaSync;
 let booting=true,busy=false,error='',mode='login',fields={},choices=[],invite='',selected='';
 const appleAvailable=()=>config.appleEnabled===true&&window.RivayaAppleSignIn?.available();
 const appleButton=()=>`<button type="button" class="nx-apple" data-nx="account-apple" ${busy?'disabled':''}><span aria-hidden="true">&#63743;</span> ${busy?t('Подожди…','Please wait…'):t('Продолжить с Apple','Continue with Apple')}</button>`;
 const b=(text,action,attrs='')=>`<button type="button" class="nx-button" data-nx="account-${action}" ${attrs}>${text}</button>`;
 const box=(title,body)=>`<section class="nx-panel"><h2>${title}</h2>${body}</section>`;
 const input=(name,label,type='text',extra='')=>`<label>${label}<input data-account-field="${name}" type="${type}" value="${esc(fields[name]||'')}" ${extra}></label>`;
 const info=()=>error?`<p role="alert" class="nx-error">${esc(error)}</p>`:'';
 function message(e){return ({merge_conflict:t('Есть разные изменения. Выбери, что сохранить.','Different changes need your choice.'),network_unavailable:t('Нет связи. Данные остаются на устройстве.','No connection. Your data stays on this device.'),authentication_failed:t('Проверь почту, пароль или код подтверждения.','Check your email, password or verification code.'),authentication_required:t('Войди в аккаунт заново. Локальные данные сохранены.','Sign in again. Your local data is preserved.'),rate_limited:t('Слишком много попыток. Попробуй позже.','Too many attempts. Try again later.'),workspace_storage_failed:t('Не удалось переключить данные. Освободи место на устройстве и повтори.','Could not switch data. Free some device storage and retry.'),apple_unavailable:t('Вход Apple сейчас недоступен. Данные сохранены на устройстве.','Apple sign-in is unavailable. Your data stays on this device.'),apple_failed:t('Apple не завершила вход. Попробуй ещё раз.','Apple could not complete sign-in. Please try again.'),apple_timeout:t('Время ожидания входа истекло. Попробуй ещё раз.','Sign-in timed out. Please try again.'),apple_busy:t('Закрой предыдущее окно Apple и повтори вход.','Close the previous Apple window and try again.'),revision_conflict:t('Другой участник уже изменил задание. Обнови список.','Another participant changed this task. Refresh the list.')})[e.code||e.message]||t('Не удалось завершить действие. Данные не подтверждены как сохранённые в аккаунте.','The action did not finish. Cloud saving is not confirmed.')}
 const A=new window.RivayaAccountsModule.Accounts({url:config.url,key:config.publishableKey,core,Transport:window.RivayaSyncTransport.Transport,vault:window.RivayaVault,storage:localStorage,read:()=>state,empty:()=>clone(defaultState),write:next=>{window.RivayaNextCore.validation(next);core.validate(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;rvLastReminderFingerprint='';syncSmartReminders(false)},changed:()=>{if(!booting)render()},fetch:window.rivayaBackendFetch});
 const S=new window.RivayaSharedModule.SharedGoals(A);
 function dirty(){try{const j=A.journal.read(A.owner);return !j?.base||!core.same(j.pending,j.base)}catch{return true}}
 function profile(){
  if(!A.active)return box(t('Аккаунт','Account'),`<p>${t('Сохраняй цели и привычки в аккаунте и продолжай на другом устройстве. Вход необязателен.','Save goals and habits to your account and continue on another device. Sign-in is optional.')}</p>${b(t('Войти и синхронизировать','Sign in and sync'),'login')}`);
  const status=A.busy?t('Синхронизация…','Syncing…'):A.lastError||dirty()?t('Есть несинхронизированные изменения','Some changes are not synced'):A.lastSync?t('Сохранено в аккаунте','Saved in your account'):t('Данные на устройстве','Data on this device');
  return box(t('Аккаунт','Account'),`<p>${esc(A.session?.user?.email||'')}</p><p class="nx-muted">${status}</p>${b(t('Синхронизировать','Sync now'),'sync')}${A.pending?b(t('Разобрать изменения','Resolve changes'),'conflicts'):''}${b(t('Совместные цели','Shared goals'),'shared')}${b(t('Выйти','Sign out'),'logout')}${b(t('Удалить аккаунт','Delete account'),'delete')}`);
 }
 function account(){
  if(A.active&&mode!=='delete'&&mode!=='conflicts')return profile()+info();
  if(mode==='conflicts'){
   const list=A.pending?.result.conflicts||[];
   const show=value=>value===undefined?t('Удалено','Deleted'):value===null?'—':typeof value==='object'?(value.name||value.value!==undefined?`${value.name||value.value}${value.target?' / '+value.target:''}${value.unit?' '+value.unit:''}`:Array.isArray(value)?value.join(', '):t('Изменённая запись','Changed record')):String(value);
   return box(t('Выбери изменения','Choose changes'),`<p>${t('Копии обоих вариантов сохранены на устройстве до разрешения конфликта.','Both versions are kept on this device until resolved.')}</p>${list.map((c,i)=>`<label>${t('Изменение','Change')} ${i+1}<select data-conflict="${i}"><option value="">${t('Выбрать','Choose')}</option><option value="local" ${choices[i]==='local'?'selected':''}>${t('На устройстве','On this device')}: ${esc(show(c.local)).slice(0,400)}</option><option value="remote" ${choices[i]==='remote'?'selected':''}>${t('В аккаунте','In your account')}: ${esc(show(c.remote)).slice(0,400)}</option></select></label>`).join('')}${b(t('Сохранить выбранное','Save choices'),'resolve')}${info()}`);
  }
  if(mode==='delete')return box(t('Удалить аккаунт и его данные','Delete account and its data'),`<p>${t('Облачные данные и локальная копия этого аккаунта будут удалены. Независимые данные гостевого режима останутся на телефоне.','Cloud data and this account’s local copy will be deleted. Independent guest data stays on the phone.')}</p>${input('confirm',t('Введи DELETE для подтверждения','Type DELETE to confirm'))}${b(t('Удалить безвозвратно','Delete permanently'),'delete-confirm')}${b(t('Отмена','Cancel'),'profile')}${info()}`);
  if(window.RIVAYA_IOS===true&&mode==='login')return box(t('Твои данные с тобой','Your data, with you'),`<p>${t('Войди с Apple, чтобы автоматически сохранять цели, привычки и историю и продолжать на другом устройстве. Отдельный пароль RIVAYA не нужен.','Sign in with Apple to automatically save goals, habits and history and continue on another device. No separate RIVAYA password needed.')}</p><label class="nx-toggle"><span>${t('Добавить текущие цели и привычки в аккаунт','Add current goals and habits to your account')}</span><input type="checkbox" data-account-field="importGuest" ${fields.importGuest!==false?'checked':''}></label><p class="nx-muted">${t('Исходная копия на этом телефоне сохранится. Шаги Apple Health не передаются в облако.','The original copy stays on this phone. Apple Health steps are not uploaded.')}</p>${appleAvailable()?appleButton():`<p>${t('Вход Apple ещё не подключён в этой тестовой сборке.','Apple sign-in is not connected in this test build yet.')}</p>`}${b(t('Продолжить без входа','Continue without signing in'),'profile')}${info()}`);
  let body=input('email',t('Электронная почта','Email'),'email','required autocomplete="email"');
  if(mode==='login'||mode==='signup')body+=input('password',t('Пароль','Password'),'password','required '+(mode==='signup'?'minlength="10" ':'')+'autocomplete="'+(mode==='login'?'current-password':'new-password')+'"');
  if(mode==='login')body+=`<label class="nx-toggle"><span>${t('Перенести гостевые цели и привычки в этот аккаунт','Import guest goals and habits into this account')}</span><input type="checkbox" data-account-field="importGuest" ${fields.importGuest?'checked':''}></label>`;
  if(mode==='confirm'||mode==='reset')body+=input('code',t('Код из письма','Code from email'),'text','required inputmode="numeric" autocomplete="one-time-code"');
  if(mode==='reset')body+=input('password',t('Новый пароль','New password'),'password','required minlength="10" autocomplete="new-password"');
  const title=({login:t('Вход','Sign in'),signup:t('Регистрация','Sign up'),confirm:t('Подтвердить почту','Verify email'),recover:t('Восстановить доступ','Recover access'),reset:t('Новый пароль','New password')})[mode];
  return box(title,`<form id="account-form">${body}<button class="nx-button nx-primary" type="submit" ${busy?'disabled':''}>${busy?t('Подожди…','Please wait…'):title}</button></form>${b(t('Вход','Sign in'),'login')}${b(t('Регистрация','Sign up'),'signup')}${b(t('Забыли пароль?','Forgot password?'),'recover')}${info()}`);
 }
 function shared(){
  if(!A.active)return account();
  const goals=S.owner===A.owner?S.cache:[],g=goals.find(g=>g.id===selected);
  if(mode==='invite')return box(t('Приглашение','Invitation'),`<p>${t('Одно приглашение — один участник. Код действует 7 дней.','One invitation admits one participant. The code expires in 7 days.')}</p><textarea class="nx-invite" readonly>${esc(invite)}</textarea>${b(t('Поделиться кодом','Share code'),'share-invite')}${b(t('Назад','Back'),'shared')}${info()}`);
  if(['new-shared','join','new-shared-step'].includes(mode))return box(({join:t('Присоединиться по коду','Join with code'),'new-shared':t('Совместная цель','Shared goal'),'new-shared-step':t('Задание участника','Participant task')})[mode],`<form id="shared-form">${mode==='join'?input('token',t('Код приглашения','Invitation code'),'text','required maxlength="64"'):input('title',t('Название','Title'),'text','required maxlength="120"')}${mode==='new-shared'||mode==='join'?input('name',t('Твоё имя для участников','Your name for participants'),'text','required maxlength="60"'): `<label>${t('Участник','Participant')}<select data-account-field="assigned_to">${g.members.map(m=>`<option value="${m.user_id}">${esc(m.name)}</option>`).join('')}</select></label>${input('deadline',t('Срок — необязательно','Due date — optional'),'date')}`}<button type="submit" class="nx-button nx-primary" ${busy?'disabled':''}>${t('Сохранить','Save')}</button></form>${b(t('Отмена','Cancel'),'shared')}${info()}`);
  if(!g)return box(t('Совместные цели','Shared goals'),`${b('＋ '+t('Создать','Create'),'new-shared')}${b(t('Присоединиться','Join'),'join')}${b(t('Обновить','Refresh'),'shared')}<p>${busy?t('Загрузка…','Loading…'):''}</p>${goals.map(g=>`<button class="nx-goal" data-nx="account-open-shared" data-id="${g.id}"><b>${esc(g.title)}</b><small>${g.steps.filter(s=>s.done).length} / ${g.steps.length} · ${g.members.length} ${t('участников','participants')}</small></button>`).join('')}${info()}`);
  const names=Object.fromEntries(g.members.map(m=>[m.user_id,m.name]));
  const actions={joined:t('Присоединился','Joined'),step_added:t('Добавил задание','Added a task'),step_updated:t('Изменил задание','Updated a task'),step_completed:t('Завершил задание','Completed a task'),step_reopened:t('Вернул задание в работу','Reopened a task'),support:t('Поддерживает тебя','Supports you'),great:t('Отличная работа!','Great work!'),keepgoing:t('Продолжай!','Keep going!')};
  return box(esc(g.title),`<p>${g.members.map(m=>esc(m.name)).join(' · ')}</p><p>${g.steps.filter(s=>s.done).length} / ${g.steps.length} ${t('заданий выполнено','tasks completed')}</p>${g.steps.map(s=>`<div class="nx-row"><button class="nx-check ${s.done?'checked':''}" data-nx="account-complete-shared" data-step="${s.id}" ${s.assigned_to!==A.owner?'disabled':''}>${s.done?'✓':''}</button><div class="nx-row-copy"><b>${esc(s.title)}</b><small>${esc(names[s.assigned_to]||t('Не назначено','Unassigned'))}${s.deadline?' · '+esc(s.deadline):''}</small></div></div>`).join('')}${g.owner_id===A.owner?b('＋ '+t('Задание','Task'),'new-shared-step')+b(t('Пригласить','Invite'),'invite'):''}${b(t('Поддержать','Support'),'react')}<h3>${t('Последние действия','Recent activity')}</h3>${g.activity.map(a=>`<p class="nx-muted">${esc(names[a.user_id]||t('Участник','Participant'))}: ${actions[a.action]||''}</p>`).join('')}${b(g.owner_id===A.owner?t('Удалить общую цель','Delete shared goal'):t('Покинуть цель','Leave goal'),'leave-shared')}${b(t('Все совместные цели','All shared goals'),'shared')}${info()}`);
 }
 async function action(name,el){
  if(busy)return;
  const a=name.replace('account-','');error='';
  if(a==='profile'){mode='';currentView='profile';render();return}
  if(['login','signup','confirm','recover','reset','delete'].includes(a)){mode=a;fields={email:fields.email||''};currentView='account';render();return}
  if(a==='conflicts'){mode=a;choices=[];currentView='account';render();return}
  if(a==='new-shared'||a==='join'||a==='new-shared-step'){mode=a;fields={name:state.profile.name||'',assigned_to:S.cache.find(g=>g.id===selected)?.members[0]?.user_id||''};currentView='shared';render();return}
  if(a==='open-shared'){selected=el.dataset.id;mode='';currentView='shared';render();return}
  busy=true;render();
  try{
   if(a==='apple'){if(!appleAvailable())throw Object.assign(Error('apple_unavailable'),{code:'apple_unavailable'});await A.loginApple(()=>window.RivayaAppleSignIn.signIn(),{importGuest:fields.importGuest!==false});fields={};currentView='profile'}
   else if(a==='recover-workspace'){await A.vault.clear();A.locked=false;try{await A.init()}catch(e){A.locked=true;throw e}currentView='profile'}
   else if(a==='sync')await A.sync();
   else if(a==='logout'){await A.logout();S.cache=[];S.owner=null;currentView='profile'}
   else if(a==='resolve'){await A.resolve(choices);currentView='profile'}
   else if(a==='delete-confirm'){if(fields.confirm!=='DELETE')throw Error('confirm');await A.deleteAccount();S.cache=[];currentView='profile'}
   else if(a==='shared'){selected='';mode='';currentView='shared';await S.list()}
   else if(a==='invite'){const result=await S.invite(selected);invite=result.token;mode='invite'}
   else if(a==='share-invite'){
    const text='RIVAYA\n'+t('Приглашение в совместную цель. В приложении открой Профиль → Совместные цели → Присоединиться. Код:','Shared goal invitation. In the app open Profile → Shared goals → Join. Code:')+'\n'+invite;
    if(window.VektorNative?.shareText)window.VektorNative.shareText(text);else if(navigator.share)await navigator.share({text});else if(navigator.clipboard)await navigator.clipboard.writeText(invite);else error=t('Выдели и скопируй код из поля.','Select and copy the code from the field.');
   }else if(a==='complete-shared'){const g=S.cache.find(g=>g.id===selected),s=g.steps.find(s=>s.id===el.dataset.step);await S.complete(selected,s);await S.list()}
   else if(a==='react'){await S.react(selected,'support');await S.list()}
   else if(a==='leave-shared'){if(!confirm(t('Подтвердить действие?','Confirm this action?')))return;const g=S.cache.find(g=>g.id===selected);await (g.owner_id===A.owner?S.remove(selected):S.leave(selected));selected='';await S.list()}
  }catch(e){error=e.code==='apple_cancelled'?'':message(e)}finally{busy=false;render()}
 }
 document.addEventListener('input',e=>{if(e.target.dataset.accountField)fields[e.target.dataset.accountField]=e.target.type==='checkbox'?e.target.checked:e.target.value});
 document.addEventListener('change',e=>{if(e.target.dataset.conflict!==undefined)choices[Number(e.target.dataset.conflict)]=e.target.value;if(e.target.dataset.accountField)fields[e.target.dataset.accountField]=e.target.type==='checkbox'?e.target.checked:e.target.value});
 document.addEventListener('submit',async e=>{
  if(!['account-form','shared-form'].includes(e.target.id))return;e.preventDefault();if(busy)return;busy=true;error='';render();
  try{
   if(e.target.id==='shared-form'){
    if(mode==='new-shared'){const g=await S.create(fields.title.trim(),fields.name.trim());selected=g.id}
    else if(mode==='join'){const g=await S.join(fields.token,fields.name.trim());selected=g.id}
    else await S.add(selected,fields.title.trim(),fields.assigned_to,fields.deadline||'');
    mode='';await S.list();
   }else if(mode==='login'){await A.login(fields.email,fields.password,{importGuest:!!fields.importGuest});fields={};currentView='profile'}
   else if(mode==='signup'){await A.signup(fields.email,fields.password);mode='confirm';delete fields.password}
   else if(mode==='confirm'){await A.verify(fields.email,fields.code);mode='login';delete fields.code}
   else if(mode==='recover'){await A.recovery(fields.email);mode='reset'}
   else if(mode==='reset'){await A.resetPassword(fields.email,fields.code,fields.password);mode='login';delete fields.password;delete fields.code}
  }catch(e){error=message(e)}finally{busy=false;render()}
 });
 const guestCapture=captureSyncDraft;
 captureSyncDraft=function(){if(booting||A.locked)return;if(A.active)A.capture();else guestCapture()};
 U.extensions.account=account;U.extensions.shared=shared;
 window.RivayaAccounts=A;window.RivayaAccountUI={profile,action,isLocked:()=>booting||A.locked,lockedView:()=>box(t('Подготовка данных','Preparing your data'),`<p>${booting?t('Открываем данные выбранного аккаунта.','Opening the selected workspace.'):t('Не удалось открыть защищённую сессию. Можно вернуться в гостевой режим и войти заново. Локальные данные аккаунта сохранятся отдельно.','The secure session could not be opened. Return to guest mode and sign in again. Local account data will be kept separately.')}</p>${info()}${!booting?b(t('Открыть гостевой режим','Open guest mode'),'recover-workspace'):''}`)};
 render();A.init().then(()=>{booting=false;render();if(A.active)A.sync().catch(e=>{error=message(e);render()})}).catch(e=>{booting=false;A.locked=true;error=message(e);render()});
 window.addEventListener('online',()=>{if(A.active)A.sync().catch(()=>{})});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&A.active)A.sync().catch(()=>{})});
})();
