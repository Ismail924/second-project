const {chromium}=require('playwright');
const fs=require('fs'), http=require('http'), path=require('path'), assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(process.cwd(),'appstore-shots-442');
const serve=http.createServer((req,res)=>{
 const name=req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0]);
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(b);
 });
});
(async()=>{
 await new Promise(resolve=>serve.listen(0,'127.0.0.1',resolve));fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:440,height:956},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ru-RU',timezoneId:'Europe/Moscow'});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.RIVAYA_IOS=true;window.VektorNative={
    requestSteps:()=>{},requestStepAccess:()=>{},refreshSteps:()=>{},
    shareText:()=>{},publishWidgetSnapshot:()=>{},getSteps:()=>{},
    openHealthSettings:()=>{}
  }});
  await page.goto('http://127.0.0.1:'+serve.address().port+'/index.html',{waitUntil:'domcontentloaded'});
  if(await page.locator('#onboardingModal.open').count())await page.locator('#finishOnboardingBtn').click();
  await page.evaluate(()=>{
    const today=dateKey(new Date());
    const earlier=new Date();earlier.setDate(earlier.getDate()-9);
    const start=dateKey(earlier);
    state.profile={...state.profile,name:'',language:'ru',onboardingDone:true,
      homeLayout:{mode:'expanded',simple:['summary','habits'],expanded:['summary','habits','goals','steps']}};
    state.habits=[
      {id:'demo_read',name:'Читать 30 минут',emoji:'📖',freq:'Каждый день',createdAt:start,tracking:'check',reminderEnabled:true,reminderTime:'08:00'},
      {id:'demo_water',name:'Пить воду',emoji:'💧',freq:'Каждый день',createdAt:start,tracking:'count',target:8,unit:'стаканов',counts:{[today]:{value:5,target:8,unit:'стаканов'}}},
      {id:'demo_sport',name:'Отжимания',emoji:'💪',freq:'Каждый день',createdAt:start,tracking:'count',target:40,unit:'раз',counts:{[today]:{value:20,target:40,unit:'раз'}}},
      {id:'demo_project',name:'Работа над проектом',emoji:'🚀',freq:'Каждый день',createdAt:start,tracking:'check',reminderEnabled:true,reminderTime:'20:00'}
    ];
    state.checks={[today+'_demo_read']:true};
    // Demonstration history for honest, populated statistics without personal data.
    for(let i=1;i<=27;i++){
      const d=new Date();d.setDate(d.getDate()-i);const key=dateKey(d);
      if(i%7!==0)state.checks[key+'_demo_read']=true;
      if(i%3!==0)state.checks[key+'_demo_project']=true;
      state.habits[1].counts[key]={value:i%4===0?5:8,target:8,unit:'стаканов'};
      state.habits[2].counts[key]={value:i%3===0?20:40,target:40,unit:'раз'};
    }
    const dailySteps={};for(let i=0;i<30;i++){const day=new Date();day.setDate(day.getDate()-i);dailySteps[dateKey(day)]=Math.max(3400,7800-(i%5)*680);}
    dailySteps[today]=6240;
    state.activity={...state.activity,access:'granted',day:today,steps:6240,stepGoal:8000,dailySteps};
    state.goals=[
      {id:'demo_goal',name:'Запустить свой проект',type:'regular',status:'active',createdAt:start,deadline:'2027-01-20',
       steps:[{id:'g1',name:'Составить план',done:true},{id:'g2',name:'Собрать прототип',done:true},{id:'g3',name:'Провести тестирование',done:false},{id:'g4',name:'Опубликовать',done:false}]},
      {id:'demo_money',name:'Накопить на путешествие',type:'money',status:'active',createdAt:start,targetAmount:100000,contributions:[{id:'m1',amount:25000,createdAt:today}]}
    ];
    state.profile.stepsTarget=8000;
    save();currentView='today';render();
    document.querySelector('#rivayaSplash')?.remove();
    document.querySelector('#onboardingModal')?.classList.remove('open');
  });
  for(const [nav,filename] of [['today','01_today'],['plan','02_plan'],['progress','03_progress'],['profile','04_profile']]){
    await page.locator('.nav-item[data-nav="'+nav+'"]').click();
    await page.waitForTimeout(300);
    await page.evaluate(()=>{window.scrollTo(0,0);document.querySelectorAll('.toast').forEach(x=>x.classList.remove('show'))});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),nav+' horizontal overflow');
    await page.screenshot({path:path.join(out,filename+'.png'),fullPage:false,animations:'disabled'});
    const buffer=fs.readFileSync(path.join(out,filename+'.png'));
    assert(buffer.byteLength>25000,nav+' screenshot looks empty');
    console.log('CAPTURED '+filename+'.png '+buffer.byteLength+' bytes');
  }
  assert.deepEqual(errors,[],'Browser render errors');
  console.log('PASS: 4 authentic RIVAYA 4.4.1 interface screenshots (iPhone 16 Pro Max 1320x2868)');
 } finally {await browser.close();serve.close();}
})().catch(e=>{console.error(e);serve.close();process.exitCode=1;});
