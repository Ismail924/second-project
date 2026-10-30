const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/widget-sync.js'),'utf8');
const sent=[],now=new Date(),k=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const state={habits:[
 {id:'water',name:'Вода',freq:'daily',createdAt:k,quantity:8,emoji:'💧'},
 {id:'read',name:'Чтение',freq:'daily',createdAt:k,emoji:'📖'},
 {id:'future',name:'Будущая привычка',createdAt:'9999-01-01',emoji:'🗓️'}
],checks:{[k+'_read']:true},profile:{}};
const window={RIVAYA_IOS:true,VektorNative:{publishWidgetSnapshot:v=>sent.push(JSON.parse(v))},RivayaNextCore:{
 numeric:h=>h.id==='water',
 entry:h=>({value:5,target:8,unit:'стаканов'}),
 dayCredit:(_,h)=>h.id==='water'?5/8:h.id==='read'?1:0
},RivayaV5:{streaks:()=>({current:2})},addEventListener:()=>{}};
const context={window,state,dateKey:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
 habitScheduledOnDate:(h,d)=>h.createdAt<=k,
 doneToday:id=>!!state.checks[k+'_'+id],
 save:()=>{},document:{addEventListener:()=>{}},
 setTimeout:fn=>{fn();return 1},setInterval:()=>{},console,Date,JSON,Math,String,Number};
vm.runInNewContext(source,context,{filename:'widget-sync.js'});
assert.equal(sent.length,1);
const s=sent[0];
assert.equal(s.schema,1);assert.equal(s.date,k);assert.equal(s.total,2);assert.equal(s.completed,1);
assert.equal(s.percent,81);assert.equal(s.streak,2);assert.equal(s.habits.length,2);
assert.equal(s.habits[0].value,5);assert.equal(s.habits[0].target,8);assert.equal(s.habits[1].done,true);
assert(!JSON.stringify(s).includes('9999-01-01'));
console.log('PASS widget snapshot: real count, partial progress, streak, schedule and privacy');
