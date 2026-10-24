/* RIVAYA 4.1 pure habit and reminder rules. Existing storage keys remain unchanged. */
(function(root){
  'use strict';
  const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
  function times(h){return [...new Set((Array.isArray(h.reminderTimes)?h.reminderTimes:[h.reminderTime]).filter(t=>typeof t==='string'&&timePattern.test(t)))].sort()}
  function entry(h,day){
    const stored=h.counts?.[day];
    return stored?{...stored}:{value:0,target:Number(h.target)||1,unit:h.unit||''};
  }
  function numeric(h){return h.tracking==='count'}
  function changeCount(state,id,day,value){
    const h=state.habits.find(h=>h.id===id);
    if(!h||!numeric(h)||!datePattern.test(day)||!finite(value)||value<0||value>1000000000)throw Error('invalid_count');
    const record=entry(h,day);
    h.counts={...(h.counts||{}),[day]:{...record,value,updatedAt:new Date().toISOString()}};
    state.checks[day+'_'+id]=value>=record.target;
    return h.counts[day];
  }
  function validation(state){
    for(const h of state.habits||[]){
      if(h.tracking!==undefined&&!['check','count'].includes(h.tracking))throw Error('invalid_tracking');
      if(numeric(h)&&(!finite(h.target)||h.target<=0||h.target>1000000||typeof h.unit!=='string'||h.unit.length>30))throw Error('invalid_target');
      if(h.reminderTimes!==undefined&&(!Array.isArray(h.reminderTimes)||h.reminderTimes.length>12||h.reminderTimes.some(t=>!timePattern.test(t))))throw Error('invalid_times');
      if(h.counts!==undefined){
        if(!h.counts||typeof h.counts!=='object'||Array.isArray(h.counts))throw Error('invalid_history');
        for(const [day,e] of Object.entries(h.counts))if(!datePattern.test(day)||!e||!finite(e.value)||e.value<0||e.value>1000000000||!finite(e.target)||e.target<=0||typeof e.unit!=='string'||e.unit.length>30)throw Error('invalid_history');
      }
    }
    return true;
  }
  function skipDates(h,checks){
    if(h.stopWhenDone===false)return [];
    return Object.keys(checks).filter(k=>checks[k]&&k.endsWith('_'+h.id)).map(k=>k.slice(0,10)).sort();
  }
  function reminders(state,{quiet=()=>false,expired=()=>false,weekdays=()=>false,lang='ru'}={}){
    const out=[];
    for(const h of state.habits||[]){
      if(!h.reminderEnabled||expired(h))continue;
      for(const time of times(h))if(!quiet(time))out.push({id:'habit-'+h.id+'-'+time.replace(':',''),title:h.name,body:lang==='en'?'Time for your habit. Open RIVAYA to see your progress.':'Время для привычки. Открой RIVAYA, чтобы посмотреть прогресс.',time,weekdaysOnly:weekdays(h),endDate:h.endDate||'',skipDates:skipDates(h,state.checks||{})});
    }
    return out;
  }
  function weekSummary(state,days){
    const tasks=(state.goals||[]).filter(g=>g.type==='task'&&g.completedAt&&days.includes(g.completedAt.slice(0,10))).length;
    const goals=(state.goals||[]).filter(g=>g.type!=='task'&&g.completedAt&&days.includes(g.completedAt.slice(0,10))).length;
    const checks=Object.entries(state.checks||{}).filter(([k,v])=>v&&days.includes(k.slice(0,10))).length;
    return {tasks,goals,checks};
  }
  const api={times,entry,numeric,changeCount,validation,skipDates,reminders,weekSummary};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RivayaNextCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
