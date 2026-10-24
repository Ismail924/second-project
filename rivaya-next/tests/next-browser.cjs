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
  console.log('PASS: quantitative habits, multiple times, partial progress persistence, tasks, goals/steps, RU/EN and mobile overflow checks');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
