const vm=require('vm'),fs=require('fs'),assert=require('assert'),path=require('path');
const map=new Map(),els={}; const el=()=>({value:'',style:{},classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},setAttribute(){},querySelectorAll(){return[]},querySelector(){return el()},options:[{text:'Каждый день'}],selectedIndex:0});
const ctx={console,setTimeout(){},setInterval(){},Date,Intl,JSON,Math,Number,String,Array,Object,Set,Map,Blob,URL,navigator:{userAgent:'Android'},localStorage:{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},document:{documentElement:el(),getElementById:id=>els[id]||(els[id]=el()),querySelectorAll:()=>[],querySelector:()=>el(),addEventListener(){},body:el()},window:{addEventListener(){},scrollTo(){}},confirm:()=>true};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/app-rivaya.js'),'utf8'),ctx);
function test(expr){assert.strictEqual(vm.runInContext(expr,ctx),true,expr)}
test("(()=>{const t=backupText();restoreBackupText(t);return state.habits.length===0&&state.goals.length===0})()");
test("(()=>{const before=localStorage.getItem(STORAGE_KEY);try{restoreBackupText(JSON.stringify({habits:[{name:'broken'}],goals:[],checks:{}}))}catch{}return localStorage.getItem(STORAGE_KEY)===before})()");
test("(()=>{state.habits=[{id:'h1',name:'Read',freq:'Каждый день',createdAt:todayKey(),reminderEnabled:true,reminderTime:'12:00'}];state.reminders.quietEnabled=false;return collectSmartReminderItems().length===1})()");
test("(()=>{state.reminders.quietEnabled=true;state.habits[0].reminderTime='23:30';return collectSmartReminderItems().length===0})()");
test("(()=>{window.vektorOnNativeSteps({status:'granted',steps:1250,day:todayKey(),history:[1,2,3,4,5,6,1250],dailySteps:{'2026-10-01':99}});return state.activity.steps===1250&&state.activity.dailySteps['2026-10-01']===99})()");
test("(()=>{state.habits=[];return renderProgress().includes('0%')&&renderPlan().includes('Создай первую цель')})()");
console.log('PASS: backup roundtrip, invalid backup atomicity, personal reminders, quiet hours, native steps/history, empty Plan/Progress');
