// RIVAYA 4.5: haptics, celebration, freeze, starter habits, review prompt and share card.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data)})});
const out=process.env.BOOST_SHOTS||'';
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'ru-RU'});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.RIVAYA_IOS=true;window.__native=[];
    window.VektorNative={haptic:s=>__native.push('haptic:'+s),shareImage:d=>__native.push('share:'+d.slice(0,23)+':'+d.length),requestReview:()=>__native.push('review'),shareText:t=>__native.push('text:'+t)}});
  const url='http://127.0.0.1:'+server.address().port;
  // These browser tests simulate iOS without a native secure-session vault.
  await p.route('**/backend-config.js',route=>route.fulfill({
    contentType:'text/javascript',
    body:'window.RIVAYA_BACKEND={enabled:false,appleEnabled:false};'
  }));
  await p.goto(url);await p.locator('#finishOnboardingBtn').click();
  await p.evaluate(()=>{state.profile.language='ru';render()});
  const shot=async n=>{if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,n+'.png'),fullPage:true})}};

  // 1. Starter habits on an empty Today
  assert.equal(await p.locator('.rb-starters').count(),1,'starters on empty Today');await shot('01-starters');
  await p.locator('[data-rb="starter"][data-key="water"]').click();await p.locator('[data-rb="starter"][data-key="read"]').click();
  const hs=await p.evaluate(()=>state.habits.map(h=>({n:h.name,t:h.tracking,target:h.target,e:h.emoji})));
  assert.deepEqual(hs.map(h=>h.n),['Пить воду','Читать 20 минут']);assert.equal(hs[0].t,'count');assert.equal(hs[0].target,8);assert.equal(hs[1].t,'check');
  assert.equal(await p.locator('.rb-starters').count(),1,'starters stay while fewer than 3 habits');
  await p.locator('[data-rb="starter"][data-key="walk"]').click();
  assert.equal(await p.locator('.rb-starters').count(),0,'starters disappear at 3 habits');
  await p.evaluate(()=>{state.habits.pop();save();render()});

  // 2. Haptic on check, celebration once when the day closes, review only with streak >= 3
  await p.evaluate(()=>{const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return dateKey(x)};state.habits.forEach(h=>h.createdAt=d(20));
    for(let i=1;i<=5;i++){state.checks[d(i)+'_'+state.habits[1].id]=true}save();render();__native.length=0});
  await p.locator(`[data-nx="check"]`).first().click();
  assert(await p.evaluate(()=>__native.includes('haptic:light')),'light haptic on check');
  for(let i=0;i<8;i++){await p.locator('[data-nx="plus"]').first().click()}
  await p.waitForTimeout(300);
  let n=await p.evaluate(()=>__native.slice());
  assert(n.includes('haptic:success'),'success haptic on day close: '+n);
  assert.equal(await p.locator('.rb-confetti').count(),1,'confetti shown');await shot('02-day-closed');
  await p.waitForTimeout(2600);
  assert(await p.evaluate(()=>__native.includes('review')),'review requested at streak >= 3');
  assert.equal(await p.locator('.rb-share.strong').count(),1,'share button after closing the day');
  await p.evaluate(()=>{__native.length=0;render();render()});
  assert(!(await p.evaluate(()=>__native.includes('haptic:success'))),'celebration only once per day');

  // 3. Share card renders 1080x1920 and goes to the native share sheet
  await p.locator('[data-rb="share"]').first().click();
  await p.waitForSelector('.rb-share-img img');
  const dims=await p.evaluate(async()=>{const c=await RivayaBoost.drawCard('violet');return [c.width,c.height]});
  assert.deepEqual(dims,[1080,1920]);await shot('03-share-sheet');
  await p.locator('[data-rb="share-theme"][data-theme="fire"]').click();await p.waitForTimeout(300);
  await p.locator('[data-rb="share-go"]').click();
  assert(await p.evaluate(()=>__native.some(x=>x.startsWith('share:data:image/jpeg;base64'))),'native image share');
  // Animated video card (Chromium records WebM here; iPhone records MP4)
  if(await p.evaluate(()=>!!RivayaBoost.videoMime())){
    await p.locator('[data-rb="share-mode"][data-mode="video"]').click();
    await p.waitForSelector('.rb-share-img video',{timeout:20000});
    await p.locator('[data-rb="share-go"]').click();await p.waitForTimeout(300);
  }
  await p.locator('[data-rb="sheet-close"]').last().click();

  // 4. Freeze: yesterday rescue keeps the streak; 2 per month; undo; survives backup
  await p.evaluate(()=>{const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return dateKey(x)};
    // reset: streak of 5 days ending the day before yesterday, nothing yesterday, nothing today
    state.checks={};state.habits.forEach(h=>{h.counts={};});state.profile.streakFreezes={};
    for(let i=2;i<=6;i++)state.habits.forEach(h=>{state.checks[d(i)+'_'+h.id]=true});
    localStorage.removeItem('rivaya-freeze-offer');save();render()});
  assert.equal(await p.evaluate(()=>RivayaV5.streaks().current),0,'streak broken by yesterday');
  assert.equal(await p.locator('.rb-rescue').count(),1,'rescue banner offered');await shot('04-rescue');
  await p.locator('.rb-rescue [data-rb="freeze"]').click();await shot('05-freeze-sheet');
  await p.locator('[data-rb="freeze-apply"][data-reason="sick"]').click();
  assert.equal(await p.evaluate(()=>RivayaV5.streaks().current),5,'streak restored by freeze');
  assert.equal(await p.locator('.rb-rescue').count(),0);
  assert.equal(await p.evaluate(()=>RivayaBoost.freezesLeft(todayKey())),1);
  // freeze today too -> limit reached
  await p.locator('.rb-freeze-link').click();await p.locator('[data-rb="freeze-apply"][data-reason="rest"]').click();
  assert.equal(await p.locator('.v5-focus.rb-frozen').count(),1,'today shows frozen state');await shot('06-today-frozen');
  assert.equal(await p.evaluate(()=>RivayaBoost.freezesLeft(todayKey())),0);
  assert.equal(await p.evaluate(()=>RivayaBoost.canFreeze(todayKey())),false);
  assert.equal(await p.evaluate(()=>RivayaV5.streaks().current),5,'frozen days neither break nor extend');
  // widget snapshot uses the same streak
  // backup roundtrip keeps freezes
  const kept=await p.evaluate(()=>{const txt=backupText();restoreBackupText(txt);return Object.keys(state.profile.streakFreezes).length});
  assert.equal(kept,2,'freezes survive backup/restore');
  await p.locator('[data-rb="unfreeze"]').click();
  assert.equal(await p.evaluate(()=>RivayaV5.frozen(todayKey())),false,'undo freeze');
  // malformed freeze data is ignored safely on reload
  await p.evaluate(()=>{state.profile.streakFreezes={'bad':1,'2026-01-01':'x'.repeat(50)};save()});
  await p.reload();await p.waitForTimeout(500);
  assert.deepEqual(await p.evaluate(()=>state.profile.streakFreezes),{},'malformed freezes dropped');

  // 5. Progress share button, English, widths
  await p.evaluate(()=>{const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return dateKey(x)};for(let i=0;i<=3;i++)state.habits.forEach(h=>{state.checks[d(i)+'_'+h.id]=true});save();currentView='progress';render()});
  assert.equal(await p.locator('.rb-share-wide').count(),1);
  await p.evaluate(()=>{state.profile.language='en';currentView='today';render()});
  for(const w of [320,390,768]){await p.setViewportSize({width:w,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+w)}
  assert.deepEqual(errors,[]);
  console.log('PASS: starter habits, haptics, one-time celebration, review prompt, share card + native share, freeze rescue/limit/undo/backup, progress share, EN and widths');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
