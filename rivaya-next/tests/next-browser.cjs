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
  await p.locator('[data-field="name"]').fill('100 отжиманий');await p.locator('[data-field="tracking"]').selectOption('count');
  await p.locator('[data-field="target"]').fill('100');await p.locator('[data-field="unit"]').fill('раз');
  await p.locator('[data-field="reminderEnabled"]').check();
  for(const [i,time]of ['10:00','15:00','20:00'].entries()){await p.locator('[data-nx="add-time"]').click();await p.locator('[data-time="'+i+'"]').fill(time)}
  await p.locator('#nx-form button[type="submit"]').click();
  await p.locator('[data-nx="habit"]').filter({hasText:'100 отжиманий'}).first().click();await p.locator('[data-nx="count"]').click();await p.locator('[data-field="value"]').fill('30');await p.locator('#nx-form button[type="submit"]').click();
  assert((await p.locator('.nx-number').innerText()).includes('30'));
  await p.reload();await p.locator('.nav-item[data-nav="plan"]').click();await p.locator('[data-nx="habit"]').filter({hasText:'100 отжиманий'}).first().click();assert((await p.locator('.nx-number').innerText()).includes('30'));
  fs.mkdirSync('next-shots',{recursive:true});await p.screenshot({path:'next-shots/habit.png',fullPage:true});
  await p.locator('.nav-item[data-nav="plan"]').click();await p.locator('[data-nx="new-task"]').click();await p.locator('[data-field="name"]').fill('Подготовить документы');await p.locator('#nx-form button[type="submit"]').click();
  await p.locator('.nav-item[data-nav="today"]').click();assert((await p.locator('#view').innerText()).includes('Подготовить документы'));
  await p.locator('[data-nx="task-check"]').click();assert.equal(await p.evaluate(()=>state.goals.find(g=>g.type==='task').status),'completed');
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
  await review.setViewportSize({width:390,height:844});await review.waitForFunction(()=>!document.getElementById('toast').classList.contains('show'));await review.screenshot({path:'next-shots/progress-redesign-ru.png',fullPage:true,style:'.rv-bottom-nav{visibility:hidden!important}'});
  await review.screenshot({path:'next-shots/progress-overview-ru.png'});
  for(const v of ['today','plan','progress','profile']){
   await review.locator('.nav-item[data-nav="'+v+'"]').click();await review.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   const geometry=await review.evaluate(()=>{const screen=document.querySelector('.nx-screen').getBoundingClientRect(),nav=document.querySelector('.rv-bottom-nav').getBoundingClientRect();return{gap:nav.top-screen.bottom,overflow:document.documentElement.scrollWidth-innerWidth}});
   assert(geometry.gap>=8&&geometry.gap<=30,v+' bottom gap '+JSON.stringify(geometry));assert(geometry.overflow<=1);
   await review.screenshot({path:'next-shots/'+v+'-bottom-ru.png'});
  }
  await review.locator('.nav-item[data-nav="plan"]').click();await review.evaluate(()=>scrollTo(0,0));await review.screenshot({path:'next-shots/plan-redesign-ru.png',fullPage:true});
  await review.evaluate(()=>{state.activity.access='not_requested';currentView='progress';render()});
  assert.equal(await review.locator('[data-nx="health-access"]').count(),1);assert.equal(await review.locator('.nx-summary-card').last().locator('.nx-ring-copy strong').innerText(),'—');
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

  console.log('PASS: quantitative habits, multiple times, partial progress persistence, tasks, goals/steps, RU/EN and mobile overflow checks');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
