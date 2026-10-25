const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)})});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.RIVAYA_IOS=true});
  await p.goto('http://127.0.0.1:'+server.address().port);await p.locator('#finishOnboardingBtn').click();
  await p.evaluate(()=>{state.profile.language='ru';render()});
  await p.locator('.nav-item[data-nav="plan"]').click();await p.locator('[data-nx="new-habit"]').click();
  await p.locator('[data-field="name"]').fill('100 отжиманий');
  // Health and sync callbacks must preserve the active editor node and focus.
  await p.locator('[data-field="name"]').focus();
  await p.evaluate(()=>{window.editorNameNode=document.querySelector('[data-field="name"]');window.vektorOnNativeSteps({status:'granted',day:todayKey(),steps:1234});render()});
  assert(await p.evaluate(()=>document.querySelector('[data-field="name"]')===window.editorNameNode&&document.activeElement===window.editorNameNode),'background update preserves input and focus');
  assert.equal(await p.locator('[data-field="name"]').inputValue(),'100 отжиманий');await p.locator('[data-field="tracking"]').selectOption('count');
  assert.equal(await p.locator('[data-field="target"]').inputValue(),'100');
  assert.equal(await p.locator('[data-field="unitChoice"]').inputValue(),'раз');
  await p.locator('[data-field="unitChoice"]').selectOption('custom');await p.locator('[data-field="unit"]').fill('км');await p.locator('[data-field="unit"]').focus();
  await p.evaluate(()=>{window.unitNode=document.querySelector('[data-field="unit"]');window.vektorOnNativeSteps({status:'denied'});render()});
  assert(await p.evaluate(()=>document.querySelector('[data-field="unit"]')===window.unitNode&&document.activeElement===window.unitNode));
  assert.equal(await p.locator('[data-field="unit"]').inputValue(),'км');
  await p.locator('[data-field="target"]').fill('100');await p.locator('[data-field="unitChoice"]').selectOption('раз');
  await p.locator('[data-field="reminderEnabled"]').check();
  for(const [i,time]of ['10:00','15:00','20:00'].entries()){await p.locator('[data-nx="add-time"]').click();await p.locator('[data-time="'+i+'"]').fill(time)}
  await p.locator('#nx-form button[type="submit"]').click();
  await p.locator('[data-nx="habit"]').filter({hasText:'100 отжиманий'}).first().click();await p.locator('[data-nx="count"]').click();await p.locator('[data-field="value"]').fill('30');await p.locator('#nx-form button[type="submit"]').click();
  assert((await p.locator('.nx-number').innerText()).includes('30'));
  assert((await p.locator('[data-nx="plus"]').innerText()).includes('10'));await p.locator('[data-nx="plus"]').click();assert((await p.locator('.nx-number').innerText()).includes('40'));
  await p.locator('[data-nx="increment"]').click();await p.locator('[data-nx="set-increment"][data-amount="20"]').click();await p.locator('#nx-form button[type="submit"]').click();assert((await p.locator('.nx-number').innerText()).includes('40'));await p.locator('[data-nx="plus"]').click();await p.locator('[data-nx="plus-one"]').click();assert((await p.locator('.nx-number').innerText()).includes('61'));
  await p.locator('[data-nx="count"]').click();await p.locator('[data-field="value"]').fill('30');await p.locator('#nx-form button[type="submit"]').click();

  await p.reload();await p.locator('.nav-item[data-nav="plan"]').click();await p.locator('[data-nx="habit"]').filter({hasText:'100 отжиманий'}).first().click();assert((await p.locator('.nx-number').innerText()).includes('30'));
  fs.mkdirSync('next-shots',{recursive:true});await p.screenshot({path:'next-shots/habit.png',fullPage:true});
  await p.locator('.nav-item[data-nav="plan"]').click();await p.locator('[data-nx="new-task"]').click();await p.locator('[data-field="name"]').fill('Подготовить документы');await p.locator('#nx-form button[type="submit"]').click();
  await p.locator('.nav-item[data-nav="today"]').click();assert((await p.locator('#view').innerText()).includes('Подготовить документы'));
  await p.locator('[data-nx="task-check"]').click();assert.equal(await p.evaluate(()=>state.goals.find(g=>g.type==='task').status),'completed');
  assert(!(await p.locator('#view').innerText()).includes('Подготовить документы'),'completed task leaves Today');
  await p.locator('.nav-item[data-nav="plan"]').click();assert((await p.locator('#view').innerText()).includes('Подготовить документы'),'history remains in Plan');
  await p.locator('.nav-item[data-nav="plan"]').click();await p.locator('[data-nx="new-goal"]').click();await p.locator('[data-field="name"]').fill('Подготовиться к экзамену');await p.locator('#nx-form button[type="submit"]').click();
  await p.locator('[data-nx="goal"]').filter({hasText:'Подготовиться к экзамену'}).click();await p.locator('[data-nx="new-step"]').click();await p.locator('[data-field="name"]').fill('Разобрать вопросы');await p.locator('#nx-form button[type="submit"]').click();await p.locator('[data-nx="step"]').click();
  assert.equal(await p.evaluate(()=>state.goals.find(g=>g.type==='regular').status),'completed');
  await p.locator('.nav-item[data-nav="profile"]').click();await p.locator('[data-nx="language"]').click();await p.locator('[data-field="language"]').selectOption('en');await p.locator('#nx-form button[type="submit"]').click();
  assert.equal(await p.locator('html').getAttribute('lang'),'en');
  for(const v of ['today','plan','progress','profile']){await p.locator('.nav-item[data-nav="'+v+'"]').click();for(const width of [320,390,768]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),v+' overflow '+width)}await p.setViewportSize({width:390,height:844});await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:'next-shots/'+v+'-en.png',fullPage:true})}
  await p.reload();assert.equal(await p.locator('html').getAttribute('lang'),'en');assert.deepEqual(errors,[]);
  // Regression + review screenshots from the real interface, using isolated sample data.
  const review=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await review.addInitScript(()=>{window.RIVAYA_IOS=true});
  await review.goto('http://127.0.0.1:'+server.address().port);await review.locator('#finishOnboardingBtn').click();
  await review.evaluate(()=>{
   const day=todayKey();state.profile.language='ru';state.profile.name='Исмаил';state.habits=[
    {id:'read',name:'Читать 30 минут',freq:'Каждый день',createdAt:day},
    {id:'project',name:'Заняться проектом',freq:'Каждый день',createdAt:day},
    {id:'quantity',name:'Ничего',freq:'Каждый день',createdAt:day,tracking:'count',target:100,unit:'раз',counts:{[day]:{value:44,target:100,unit:'раз'}}}
   ];state.checks={[day+'_read']:true};
   state.goals=[{id:'review-goal',name:'Запустить свой проект',type:'regular',status:'active',createdAt:day,steps:['Идея и план','Первый прототип','Проверка на телефоне','Последние улучшения','Запуск'].map((name,i)=>({id:'s'+i,name,done:i<2}))}];
   state.activity={...state.activity,access:'granted',day,steps:6280,stepGoal:10000,dailySteps:{[day]:6280}};save();currentView='progress';render();
  });
  assert.equal(await review.locator('.nx-report-habit').filter({hasText:'Ничего'}).locator('strong').innerText(),'44%');
  assert((await review.locator('#nx-report-goals').innerText()).includes('2 / 5'));
  assert((await review.locator('.nx-summary-card').last().innerText()).includes('6'));
  for(const width of [320,390,430,768]){await review.setViewportSize({width,height:844});assert(await review.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'progress width '+width)}
  await review.setViewportSize({width:390,height:844});await review.waitForFunction(()=>!document.getElementById('toast').classList.contains('show'));await review.screenshot({path:'next-shots/progress-redesign-ru.png',fullPage:true,style:'.rv-bottom-nav.bottom-nav,.toast{display:none!important}'});
  await review.screenshot({path:'next-shots/progress-overview-ru.png'});
  // Step history uses the actual native daily map, not fabricated missing zeroes.
  await review.evaluate(()=>{const daily={};for(let i=0;i<30;i++){const d=new Date();d.setDate(d.getDate()-i);daily[dateKey(d)]=(30-i)*100}state.activity.dailySteps=daily;state.activity.steps=3000;render()});
  assert((await review.locator('.nx-summary-card').last().innerText()).includes('Шаги'));
  await review.locator('.nx-step-symbol').click();
  assert.equal(await review.locator('.nx-step-bar').count(),7);
  assert.equal((await review.locator('.nx-step-kpis b').first().innerText()).replace(/\s/g,''),'18900');
  await review.locator('[data-nx="step-period"][data-period="30"]').click();
  assert.equal(await review.locator('.nx-step-bar').count(),30);
  assert.equal((await review.locator('.nx-step-kpis b').first().innerText()).replace(/\s/g,''),'46500');
  assert.equal((await review.locator('.nx-step-kpis b').nth(1).innerText()).replace(/\s/g,''),'1550');
  await review.locator('.nx-step-bar').first().click();assert((await review.locator('.nx-step-selected').innerText()).includes('100'));
  for(const width of [320,390,430]){await review.setViewportSize({width,height:844});assert(await review.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'activity width '+width)}
  await review.setViewportSize({width:390,height:844});await review.evaluate(()=>scrollTo(0,0));await review.screenshot({path:'next-shots/steps-month-ru.png',fullPage:true});
  await review.locator('[data-nx="step-period"][data-period="7"]').click();await review.screenshot({path:'next-shots/steps-week-ru.png',fullPage:true});
  assert.equal(await review.locator('[data-nx="health-refresh"]').count(),0);
  await review.evaluate(()=>{state.activity.dailySteps={[todayKey()]:0};state.activity.steps=0;render()});
  assert.equal(await review.locator('.nx-step-bar.unknown').count(),6);assert.equal(await review.locator('.nx-step-kpis b').nth(1).innerText(),'0');
  await review.evaluate(()=>{state.activity.access='denied';render()});assert.equal(await review.locator('.nx-step-bar.unknown').count(),7);assert.equal(await review.locator('.nx-step-kpis b').first().innerText(),'—');
  console.log('PASS: steps navigation, week/month totals, daily selection, missing vs zero data, permissions and mobile widths');

  for(const v of ['today','plan','progress','profile']){
   await review.locator('.nav-item[data-nav="'+v+'"]').click();await review.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   const geometry=await review.evaluate(()=>{const screen=document.querySelector('.nx-screen').getBoundingClientRect(),nav=document.querySelector('.rv-bottom-nav').getBoundingClientRect();return{gap:nav.top-screen.bottom,overflow:document.documentElement.scrollWidth-innerWidth}});
   assert(geometry.gap>=8&&geometry.gap<=30,v+' bottom gap '+JSON.stringify(geometry));assert(geometry.overflow<=1);
   await review.screenshot({path:'next-shots/'+v+'-bottom-ru.png'});
  }
  await review.locator('.nav-item[data-nav="today"]').click();await review.evaluate(()=>scrollTo(0,0));await review.screenshot({path:'next-shots/today-redesign-ru.png'});
  await review.screenshot({path:'next-shots/today-full-ru.png',fullPage:true,style:'.rv-bottom-nav.bottom-nav,.toast{display:none!important}'});
  await review.locator('.nav-item[data-nav="plan"]').click();await review.evaluate(()=>scrollTo(0,0));await review.screenshot({path:'next-shots/plan-redesign-ru.png',fullPage:true});
  await review.evaluate(()=>{state.activity.access='not_requested';currentView='progress';render()});
  assert.equal(await review.locator('[data-nx="health-access"]').count(),1);assert.equal(await review.locator('.nx-summary-card').last().locator('.nx-ring-copy strong').innerText(),'—');
  // Configurable homes preserve results, independent orders, and empty preferences across reloads.
  await review.locator('.nav-item[data-nav="today"]').click();
  await review.locator('[data-nx="home-mode"][data-mode="simple"]').click();
  await review.locator('[data-nx="home-settings"]').click();
  // Seed only the preferences; the same real habit data remains authoritative.
  await review.evaluate(()=>{state.profile.homeLayout={mode:'simple',simple:['habits'],expanded:['summary','tasks','habits','next','goals','steps','shared']};save();render()});
  await review.locator('[data-nx="home-toggle"][data-block="steps"]').click();
  await review.locator('[data-nx="home-move"][data-block="steps"][data-direction="-1"]').click();
  await review.locator('[data-nx="today"]').last().click();
  assert.deepEqual(await review.locator('[data-home-block]').evaluateAll(es=>es.map(e=>e.dataset.homeBlock)),['steps','habits']);
  const quantityBefore=await review.evaluate(()=>state.habits.find(h=>h.id==='quantity').counts[todayKey()].value);
  await review.locator('[data-nx="plus"][data-id="quantity"]').click();
  assert.equal(await review.evaluate(()=>state.habits.find(h=>h.id==='quantity').counts[todayKey()].value),quantityBefore+1);
  await review.locator('[data-nx="home-mode"][data-mode="expanded"]').click();
  assert.equal(await review.locator('[data-home-block]').count(),7);
  await review.locator('[data-nx="home-mode"][data-mode="simple"]').click();
  await review.reload();
  assert.deepEqual(await review.locator('[data-home-block]').evaluateAll(es=>es.map(e=>e.dataset.homeBlock)),['steps','habits']);
  await review.locator('[data-nx="home-settings"]').click();
  for(const k of ['steps','habits'])await review.locator('[data-nx="home-toggle"][data-block="'+k+'"]').click();
  for(const width of [320,390,430]){await review.setViewportSize({width,height:844});assert(await review.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'home settings overflow '+width)}
  await review.setViewportSize({width:390,height:844});await review.screenshot({path:'next-shots/home-settings-ru.png',fullPage:true});
  await review.locator('[data-nx="today"]').last().click();await review.reload();assert.equal(await review.locator('[data-home-block]').count(),0);
  await review.locator('[data-nx="home-add"]').click();await review.locator('[data-nx="new-habit"]').click();
  await review.locator('[data-field="name"]').fill('Новая простая привычка');await review.locator('#nx-form button[type="submit"]').click();
  await review.locator('.nav-item[data-nav="today"]').click();assert.equal(await review.locator('[data-home-block="habits"]').count(),1);
  await review.screenshot({path:'next-shots/home-simple-ru.png',fullPage:true});
  await review.locator('[data-nx="home-mode"][data-mode="expanded"]').click();await review.screenshot({path:'next-shots/home-expanded-ru.png',fullPage:true});
  // Existing installations without home preferences migrate to the detailed home.
  await review.evaluate(()=>{delete state.profile.homeLayout;save()});await review.reload();
  assert.equal(await review.locator('.nx-home.expanded').count(),1);
  assert.equal(await review.evaluate(()=>state.habits.find(h=>h.id==='quantity').counts[todayKey()].value),quantityBefore+1);
  console.log('PASS: home modes, visibility, order, empty home, new habits, migration and count preservation');
  await review.close();
  // Exercise the gated account UI with synthetic sessions; no real email or backend.
  const account=await browser.newPage({viewport:{width:390,height:844}}),accountErrors=[];
  account.on('pageerror',e=>accountErrors.push(e.message));
  await account.route('**/backend-config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.RIVAYA_BACKEND={enabled:true,url:"https://example.supabase.co",publishableKey:"sb_publishable_test"};'}));
  await account.addInitScript(()=>{
   let saved=null;
   window.VektorNative={secureSession:text=>{const x=JSON.parse(text);if(x.operation==='write')saved=x.value;if(x.operation==='clear')saved=null;setTimeout(()=>window.rivayaOnSecureSession(JSON.stringify({requestId:x.requestId,value:saved})),0)}};
  });
  const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';let cloud=null;
  await account.route('https://example.supabase.co/**',async route=>{
   const request=route.request(),url=request.url();let data={};
   if(url.includes('grant_type=password'))data={user:{id:owner,email:'test@example.test'},access_token:'synthetic-test-token',refresh_token:'synthetic-test-refresh',expires_at:Date.now()/1000+3600};
   else if(url.endsWith('/auth/v1/user'))data={id:owner,email:'test@example.test'};
   else if(url.includes('/rivaya_documents?'))data=cloud?[{user_id:owner,revision:cloud.revision,payload:cloud.payload}]:[];
   else if(url.endsWith('/rpc/rivaya_save')){const body=request.postDataJSON();cloud={revision:(cloud?.revision||0)+1,payload:body.document};data=cloud.revision}
   else if(url.endsWith('/rpc/rivaya_shared'))data=[];
   else if(!url.includes('/auth/v1/logout'))throw Error('Unexpected account request '+url);
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await account.goto('http://127.0.0.1:'+server.address().port);await account.locator('#finishOnboardingBtn').click();
  await account.waitForFunction(()=>window.RivayaAccountUI&&!window.RivayaAccountUI.isLocked());
  await account.evaluate(()=>{state.profile.language='en';render()});
  await account.locator('.nav-item[data-nav="profile"]').click();await account.locator('[data-nx="account-login"]').click();
  await account.locator('[data-account-field="email"]').fill('test@example.test');await account.locator('[data-account-field="password"]').fill('short');
  await account.locator('#account-form button[type="submit"]').click();
  await account.waitForFunction(()=>window.RivayaAccounts.active&&window.RivayaAccounts.lastSync);
  assert.equal(await account.evaluate(()=>localStorage.getItem('rivaya-active-owner')),owner);
  assert(!(await account.evaluate(()=>JSON.stringify(localStorage))).includes('synthetic-test-token'),'session token never in localStorage');
  await account.locator('[data-nx="account-shared"]').click();await account.getByRole('heading',{name:'Shared goals'}).waitFor();
  await account.locator('.nav-item[data-nav="profile"]').click();await account.locator('[data-nx="account-logout"]').click();
  await account.waitForFunction(()=>!window.RivayaAccounts.active&&!window.RivayaAccountUI.isLocked());
  assert.equal(await account.evaluate(()=>localStorage.getItem('rivaya-active-owner')),null);assert.deepEqual(accountErrors,[]);
  await account.close();
  // Native Apple UI with a synthetic system bridge; never a real Apple login.
  const apple=await browser.newPage({viewport:{width:390,height:844}}),appleErrors=[];
  apple.on('pageerror',e=>appleErrors.push(e.message));
  await apple.route('**/backend-config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.RIVAYA_BACKEND={enabled:true,appleEnabled:true,url:"https://example.supabase.co",publishableKey:"sb_publishable_test"};'}));
  await apple.addInitScript(()=>{
   window.RIVAYA_IOS=true;window.appleCancelled=true;let saved=null;
   window.VektorNative={
    secureSession:text=>{const x=JSON.parse(text);if(x.operation==='write')saved=x.value;if(x.operation==='clear')saved=null;setTimeout(()=>window.rivayaOnSecureSession(JSON.stringify({requestId:x.requestId,value:saved})),0)},
    signInWithApple:text=>{const x=JSON.parse(text);setTimeout(()=>window.rivayaOnAppleSignIn(JSON.stringify(window.appleCancelled?{requestId:x.requestId,error:'apple_cancelled'}:{requestId:x.requestId,idToken:'synthetic-apple-proof',nonce:'synthetic-single-use-nonce'})),0)}
   };
  });
  await apple.route('https://example.supabase.co/**',async route=>{
   const req=route.request(),url=req.url();let data={};
   if(url.includes('grant_type=id_token')){assert.equal(req.postDataJSON().provider,'apple');assert.equal(req.postDataJSON().nonce,'synthetic-single-use-nonce');data={user:{id:owner},access_token:'synthetic-apple-session',refresh_token:'synthetic-refresh',expires_at:Date.now()/1000+3600}}
   else if(url.endsWith('/auth/v1/user'))data={id:owner,email:'private@privaterelay.appleid.com'};
   else if(url.includes('/rivaya_documents?'))data=[];
   else if(url.endsWith('/rpc/rivaya_save'))data=1;
   else if(!url.includes('/auth/v1/logout'))throw Error('Unexpected Apple request '+url);
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await apple.goto('http://127.0.0.1:'+server.address().port);await apple.locator('#finishOnboardingBtn').click();
  await apple.waitForFunction(()=>window.RivayaAccountUI&&!window.RivayaAccountUI.isLocked());
  await apple.evaluate(()=>{state.profile.language='ru';state.goals.push({id:'existing-local',name:'Сохранить мою цель',steps:[],type:'regular',status:'active'});save();render()});
  await apple.locator('.nav-item[data-nav="profile"]').click();await apple.locator('[data-nx="account-login"]').click();
  assert.equal(await apple.locator('input[type="password"]').count(),0);
  await apple.screenshot({path:'next-shots/apple-login-ru.png',fullPage:true});
  await apple.locator('[data-nx="account-apple"]').click();await apple.waitForFunction(()=>!window.RivayaAccounts.authenticating);
  assert.equal(await apple.locator('[role="alert"]').count(),0);assert.equal(await apple.evaluate(()=>window.RivayaAccounts.active),false);
  await apple.evaluate(()=>window.appleCancelled=false);await apple.locator('[data-nx="account-apple"]').click();
  await apple.waitForFunction(()=>window.RivayaAccounts.active&&window.RivayaAccounts.lastSync);
  assert(await apple.evaluate(()=>state.goals.some(g=>g.id==='existing-local')));
  assert(!(await apple.evaluate(()=>JSON.stringify(localStorage))).includes('synthetic-apple-session'));
  await apple.locator('[data-nx="account-logout"]').click();await apple.waitForFunction(()=>!window.RivayaAccounts.active);
  assert(await apple.evaluate(()=>state.goals.some(g=>g.id==='existing-local')));assert.deepEqual(appleErrors,[]);
  await apple.close();

  // End-to-end shared UI with isolated synthetic Apple accounts and a stateful RPC fixture.
  const people=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
  const team=[],sharedErrors=[],inviteToken='ab'.repeat(32);let sharedGoal=null,used=false;
  for(let i=0;i<3;i++){
   const page=await browser.newPage({viewport:{width:390,height:844}});team.push(page);page.on('pageerror',e=>sharedErrors.push(e.message));
   await page.route('**/backend-config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.RIVAYA_BACKEND={enabled:true,appleEnabled:true,url:"https://friends.supabase.co",publishableKey:"sb_publishable_fixture"};'}));
   await page.addInitScript(()=>{window.RIVAYA_IOS=true;let saved=null;window.VektorNative={secureSession:text=>{const x=JSON.parse(text);if(x.operation==='write')saved=x.value;if(x.operation==='clear')saved=null;setTimeout(()=>window.rivayaOnSecureSession(JSON.stringify({requestId:x.requestId,value:saved})),0)},signInWithApple:text=>{const x=JSON.parse(text);setTimeout(()=>window.rivayaOnAppleSignIn(JSON.stringify({requestId:x.requestId,idToken:'synthetic-proof',nonce:'synthetic-nonce'})),0)},shareText:text=>{window.sharedInvitation=text}}});
   await page.route('https://friends.supabase.co/**',async route=>{
    const req=route.request(),url=req.url(),actor=people[i];let data={},status=200;
    if(url.includes('grant_type=id_token'))data={user:{id:actor},access_token:'synthetic-'+i,refresh_token:'synthetic-refresh-'+i,expires_at:Date.now()/1000+3600};
    else if(url.endsWith('/auth/v1/user'))data={id:actor};
    else if(url.includes('/rivaya_documents?'))data=[];
    else if(url.endsWith('/rpc/rivaya_save'))data=1;
    else if(url.endsWith('/rpc/rivaya_shared')){
     const{operation:op,args:a}=req.postDataJSON();assert.equal(req.headers().authorization,'Bearer synthetic-'+i);
     if(op==='list')data=sharedGoal&&sharedGoal.members.some(m=>m.user_id===actor)?[sharedGoal]:[];
     else if(op==='create'){assert.equal(i,0);sharedGoal={id:'44444444-4444-4444-8444-444444444444',owner_id:actor,title:a.title,members:[{user_id:actor,name:a.name}],steps:[],activity:[]};data={id:sharedGoal.id}}
     else if(op==='invite'){assert.equal(actor,sharedGoal.owner_id);data={token:inviteToken,expires_in_days:7}}
     else if(op==='join'){assert.equal(a.token,inviteToken);if(used){status=400;data={code:'22023'}}else{used=true;sharedGoal.members.push({user_id:actor,name:a.name});data={id:sharedGoal.id}}}
     else if(op==='add_step'){assert.equal(actor,sharedGoal.owner_id);assert.equal(a.assigned_to,people[1]);sharedGoal.steps.push({id:'55555555-5555-4555-8555-555555555555',title:a.title,assigned_to:a.assigned_to,done:false,revision:1});data={id:sharedGoal.id}}
     else if(op==='set_step'){const step=sharedGoal.steps[0];assert.equal(actor,step.assigned_to);assert.equal(a.expected_revision,step.revision);step.done=a.done;step.revision++;data={id:sharedGoal.id}}
     else throw Error('Unexpected shared operation '+op);
    }else if(!url.endsWith('/auth/v1/logout'))throw Error('Unexpected friend request '+url);
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#finishOnboardingBtn').click();await page.waitForFunction(()=>window.RivayaAccountUI&&!window.RivayaAccountUI.isLocked());await page.evaluate(()=>{state.profile.language='ru';render()});
  }
  const[a,b,c]=team;await a.locator('.nav-item[data-nav="plan"]').click();await a.locator('[data-nx="account-new-shared"]').click();await a.locator('[data-nx="account-apple"]').click();await a.locator('#shared-form').waitFor();
  await a.locator('[data-account-field="title"]').fill('Тренируемся вместе');await a.locator('[data-account-field="name"]').fill('Исмаил');await a.locator('[data-account-field="title"]').focus();
  await a.evaluate(()=>{window.sharedTitleNode=document.querySelector('[data-account-field="title"]');window.vektorOnNativeSteps({status:'granted',day:todayKey(),steps:100});render()});
  assert(await a.evaluate(()=>document.activeElement===window.sharedTitleNode&&document.querySelector('[data-account-field="title"]')===window.sharedTitleNode),'shared form survives Health updates');
  await a.locator('#shared-form button[type="submit"]').click();await a.locator('[data-nx="account-invite"]').waitFor();await a.locator('[data-nx="account-invite"]').click();await a.locator('.nx-invite').waitFor();await a.locator('[data-nx="account-share-invite"]').click();await a.waitForFunction(()=>!!window.sharedInvitation);const inviteText=await a.evaluate(()=>window.sharedInvitation);
  await b.locator('.nav-item[data-nav="plan"]').click();await b.locator('[data-nx="account-join"]').click();await b.locator('[data-nx="account-apple"]').click();await b.locator('#shared-form').waitFor();await b.locator('[data-account-field="token"]').fill(inviteText);await b.locator('[data-account-field="name"]').fill('Друг');await b.locator('#shared-form button[type="submit"]').click();await b.getByRole('heading',{name:'Тренируемся вместе'}).waitFor();assert.equal(await b.locator('[data-nx="account-invite"]').count(),0);
  await a.locator('[data-nx="account-shared"]').click();await a.locator('[data-nx="account-open-shared"]').waitFor();await a.locator('[data-nx="account-open-shared"]').click();await a.locator('[data-nx="account-new-shared-step"]').click();await a.locator('[data-account-field="title"]').fill('Сделать 20 отжиманий');await a.locator('[data-account-field="assigned_to"]').selectOption(people[1]);
  await a.evaluate(()=>{window.vektorOnNativeSteps({status:'denied'});render()});assert.equal(await a.locator('[data-account-field="assigned_to"]').inputValue(),people[1]);
  await a.locator('#shared-form button[type="submit"]').click();await a.locator('[data-nx="account-complete-shared"]').waitFor();assert(await a.locator('[data-nx="account-complete-shared"]').isDisabled());
  assert.equal(await b.locator('[data-nx="account-refresh-shared"]').count(),0);await b.bringToFront();await b.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await b.locator('[data-nx="account-complete-shared"]').waitFor();await b.locator('[data-nx="account-complete-shared"]').click();await b.waitForFunction(()=>document.querySelector('[data-nx="account-complete-shared"]')?.classList.contains('checked'));
  assert.equal(await a.locator('[data-nx="account-react"]').count(),0);await a.bringToFront();await a.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await a.waitForFunction(()=>document.querySelector('[data-nx="account-complete-shared"]')?.classList.contains('checked'));assert((await a.locator('#view').innerText()).includes('1 / 1'));
  await a.screenshot({path:'next-shots/shared-goal-ru.png',fullPage:true});
  await c.locator('.nav-item[data-nav="plan"]').click();await c.locator('[data-nx="account-join"]').click();await c.locator('[data-nx="account-apple"]').click();await c.locator('#shared-form').waitFor();await c.locator('[data-account-field="token"]').fill(inviteText);await c.locator('[data-account-field="name"]').fill('Другой');await c.locator('#shared-form button[type="submit"]').click();await c.getByRole('alert').waitFor();assert((await c.getByRole('alert').innerText()).includes('новое'));assert.equal(await c.getByRole('heading',{name:'Тренируемся вместе'}).count(),0);
  assert.deepEqual(sharedErrors,[]);for(const page of team)await page.close();
  console.log('PASS: shared goal creation, Apple return path, native share, join from message, assignee permissions, shared completion, reused invitation and form focus');

  console.log('PASS: quantitative habits, multiple times, partial progress persistence, tasks, goals/steps, RU/EN and mobile overflow checks');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
