const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.RIVAYA_IOS=true});
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#finishOnboardingBtn').click();
    fs.mkdirSync('health-shots',{recursive:true});
    for(const status of ['denied','granted']){
      await page.evaluate(status=>window.vektorOnNativeSteps({status,steps:1250}),status);
      assert.equal(await page.locator('#view .health-source-summary').count(),1);
      assert.equal(await page.locator('#view .source-card[aria-label="Apple Health и HealthKit"]').count(),0);
      await page.locator('.health-source-summary').click();
      assert(await page.locator('#healthInfoModal.open').isVisible());
      assert((await page.locator('#healthInfoDescription').innerText()).includes('HealthKit'));
      await page.screenshot({path:'health-shots/info-'+status+'.png'});
      await page.locator('#healthInfoModal [data-close]').last().click();
      assert.equal(await page.locator('#healthInfoModal.open').count(),0);
      await page.locator('.nav-item[data-nav="progress"]').click();
      await page.locator('#view [data-nav="activity"]').first().click();
      assert.equal(await page.locator('#view .source-card[aria-label="Apple Health и HealthKit"]').count(),1);
      await page.locator('.nav-item[data-nav="today"]').click();
    }
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator('.health-source-summary').scrollIntoViewIfNeeded();
      await page.screenshot({path:'health-shots/compact-'+width+'.png'});
    }
    await page.evaluate(()=>{window.RIVAYA_IOS=false;render()});
    assert.equal(await page.locator('.health-source-summary').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: compact disclosure, modal open/close, full Activity detail, denied/granted access, platform visibility and responsive layout');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
