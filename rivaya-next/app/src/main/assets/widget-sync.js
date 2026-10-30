/* RIVAYA WidgetKit bridge: export a minimal, real daily summary from the existing local state.
   This never sends HealthKit values or a full backup to the widget. */
(function(){
  'use strict';
  if(!window.RIVAYA_IOS || !window.VektorNative?.publishWidgetSnapshot)return;
  let scheduled=false,lastPayload='';
  const safeString=(s,max)=>String(s||'').slice(0,max);
  function snapshot(){
    const d=new Date(),date=dateKey(d);
    const planned=state.habits.filter(h=>habitScheduledOnDate(h,d));
    const core=window.RivayaNextCore;
    const habits=planned.slice(0,30).map(h=>{
      const numeric=!!core?.numeric(h),entry=numeric?core.entry(h,date):null;
      const credited=core?.dayCredit(state,h,date)??(doneToday(h.id)?1:0);
      return {id:safeString(h.id,100),name:safeString(h.name,100),
        emoji:safeString(h.emoji||'',12),done:credited>=1,
        numeric,value:numeric?Math.max(0,Number(entry.value)||0):0,
        target:numeric?Math.max(1,Number(entry.target)||1):0,
        unit:numeric?safeString(entry.unit,20):''};
    });
    const completed=planned.filter(h=>(core?.dayCredit(state,h,date)??(doneToday(h.id)?1:0))>=1).length;
    const credit=planned.reduce((n,h)=>n+Math.min(1,Math.max(0,core?.dayCredit(state,h,date)??(doneToday(h.id)?1:0))),0);
    return {schema:1,date,total:planned.length,completed,
      percent:planned.length?Math.round(credit/planned.length*100):0,
      streak:Math.max(0,Number(window.RivayaV5?.streaks?.().current)||0),
      habits,updatedAt:new Date().toISOString()};
  }
  function publish(){
    scheduled=false;
    try{
      const payload=JSON.stringify(snapshot());
      if(payload===lastPayload)return;
      window.VektorNative.publishWidgetSnapshot(payload);
      lastPayload=payload;
    }catch(e){console.warn('RIVAYA widget update skipped',e)}
  }
  function schedule(){
    if(scheduled)return;scheduled=true;setTimeout(publish,80);
  }
  const originalSave=save;
  save=function(...args){const result=originalSave.apply(this,args);schedule();return result;};
  window.rivayaPublishWidget=schedule;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  window.addEventListener('focus',schedule);
  let lastDay=dateKey(new Date());
  setInterval(()=>{const current=dateKey(new Date());if(current!==lastDay){lastDay=current;schedule()}},60000);
  schedule();
})();
