// Run with Playwright installed: node rivaya-next/tests/paths-browser.cjs
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',err=>errors.push(err.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#finishOnboardingBtn').click();
    await page.locator('[data-rp-action="new-task"]').click();
    await page.locator('#rp-name').fill('Позвонить другу');
    await page.locator('#rp-form button[type="submit"]').click();
    assert(await page.locator('.rp-task-copy').filter({hasText:'Позвонить другу'}).count());
    await page.locator('.rp-task [data-rp-task]').click();
    await page.locator('.nav-item[data-nav="plan"]').click();
    await page.locator('.rp-actions [data-nav="paths"]').click();
    await page.locator('[data-rp-template="0"]').click();
    await page.locator('#rp-name').fill('Моя неделя движения');
    await page.locator('#rp-step-0').fill('Прогулка в парке');
    await page.locator('#rp-form button[type="submit"]').click();
    await page.locator('[data-rp-light]').click();
    await page.locator('.rp-panel .primary[data-rp-step]').click();
    await page.reload();
    await page.locator('.nav-item[data-nav="plan"]').click();
    await page.locator('.rp-actions [data-nav="paths"]').click();
    await page.locator('.rp-path-card').click();
    assert((await page.locator('.rp-hero').innerText()).includes('1 из 7'));
    await page.locator('[data-rp-edit-path]').click();
    assert.equal(await page.locator('#rp-step-0').inputValue(),'Прогулка в парке');
    await page.locator('#rp-name').fill('Моя неделя');
    // Native step refresh must not wipe a typed draft.
    await page.evaluate(()=>window.vektorOnNativeSteps({status:'denied'}));
    assert.equal(await page.locator('#rp-name').inputValue(),'Моя неделя');
    await page.locator('#rp-form button[type="submit"]').click();
    await page.locator('[data-rp-archive]').click();
    assert((await page.locator('.rp-hero').innerText()).includes('АРХИВ'));
    await page.locator('[data-rp-archive]').click();
    const shots=process.env.RIVAYA_SHOTS||'paths-shots';fs.mkdirSync(shots,{recursive:true});
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow at '+width);
      await page.screenshot({path:path.join(shots,'path-'+width+'.png'),fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-rp-action="list"]').click();
    await page.screenshot({path:path.join(shots,'paths.png'),fullPage:true});
    await page.locator('.nav-item[data-nav="today"]').click();
    await page.screenshot({path:path.join(shots,'today.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: real mobile browser create/edit/complete/relaunch/archive, draft preservation, responsive layout');
  }finally{await browser.close();server.close()}
})().catch(err=>{console.error(err);server.close();process.exitCode=1});
