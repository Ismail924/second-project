const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets');
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(f)]||'application/octet-stream');res.end(d)})});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.RIVAYA_IOS=true});await p.goto('http://127.0.0.1:'+server.address().port);
  if(await p.locator('#onboardingModal.open').count())await p.locator('#finishOnboardingBtn').click();
  await p.evaluate(()=>{const k=todayKey();state.profile.language='ru';state.profile.homeLayout={mode:'simple',simple:['summary','habits'],expanded:['summary','habits']};state.habits=['Готово','Нужно сделать','Ещё одно'].map((name,i)=>({id:'test-'+i,name,freq:'Каждый день',createdAt:k,tracking:'check'}));state.checks={[k+'_test-0']:true};save();currentView='today';render()});
  assert.equal(await p.locator('.v5-group .v5-habit').count(),2);
  assert.equal(await p.locator('.v5-today-completed .v5-habit').count(),1);
  assert(!(await p.locator('.v5-today-completed .v5-habit').isVisible()));
  await p.locator('.v5-today-completed summary').click();
  assert(await p.locator('.v5-today-completed .v5-habit').isVisible());
  await p.locator('.v5-today-completed .v5-check').click();
  assert.equal(await p.locator('.v5-group .v5-habit').count(),3);
  await p.locator('.v5-group .v5-check').first().click();
  assert.equal(await p.locator('.v5-group .v5-habit').count(),2);
  for(const width of [320,375,390,430]){
   await p.setViewportSize({width,height:844});
   const offsets=await p.locator('.v5-day-ring').evaluateAll(nodes=>nodes.map(el=>{const a=el.querySelector('svg').getBoundingClientRect(),b=el.querySelector('b').getBoundingClientRect();return[Math.abs(a.left+a.width/2-b.left-b.width/2),Math.abs(a.top+a.height/2-b.top-b.height/2)]}));
   assert.equal(offsets.length,7);
   assert(offsets.every(([x,y])=>x<1&&y<1),'Misaligned weekly rings at '+width+': '+JSON.stringify(offsets));
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at '+width);
  }
  await p.reload();assert.equal(await p.locator('.v5-group .v5-habit').count(),2);
  assert.deepEqual(errors,[]);console.log('PASS: weekly rings, completed hiding, undo, persistence, mobile widths');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});