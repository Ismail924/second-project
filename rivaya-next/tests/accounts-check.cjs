const assert=require('assert'),core=require('../app/src/main/assets/sync-core.js');
const {Transport}=require('../app/src/main/assets/sync-transport.js');
const {Accounts}=require('../app/src/main/assets/account-service.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const empty=()=>({goals:[],habits:[],checks:{},profile:{name:'',avatarData:'',onboardingDone:true},activity:{stepGoal:8000,access:'denied',steps:0},goalSnapshots:{},reminders:{times:[]}});
const g=(id,name)=>({id,name,steps:[],status:'active',type:'regular'});
const document=(id,name)=>core.project({...empty(),goals:[g(id,name)]});
async function fixture(){
  let state=empty(),saved=null,gate=null;
  const map=new Map(),rows=new Map([[A,{revision:1,document:document('a-goal','A goal')}],[B,{revision:1,document:document('b-goal','B goal')}] ]);
  const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
  const fetch=async(url,opt)=>{
    const token=opt.headers.Authorization?.replace('Bearer ','');
    if(url.includes('/auth/v1/token?grant_type=password')){const {email}=JSON.parse(opt.body),owner=email==='a@example.test'?A:B;return response({user:{id:owner,email},access_token:owner,refresh_token:'refresh-'+owner,expires_at:Date.now()/1000+3600})}
    if(url.endsWith('/auth/v1/user'))return response({id:token});
    if(url.includes('/auth/v1/logout'))return response({},204);
    if(url.includes('rivaya_documents')){const r=rows.get(token);return response(r?[{user_id:token,revision:r.revision,payload:copy(r.document)}]:[])}
    if(url.endsWith('/rpc/rivaya_save')){
      const {expected_revision,document}=JSON.parse(opt.body),r=rows.get(token);
      if((r?.revision||0)!==expected_revision)return response({code:'40001'},409);
      if(gate)await gate();
      rows.set(token,{revision:expected_revision+1,document:copy(document)});return response(expected_revision+1);
    }
    throw Error('unexpected request');
  };
  const account=new Accounts({url:'https://example.supabase.co',key:'sb_publishable_example',core,Transport,storage,vault:{read:async()=>saved,write:async x=>{saved=copy(x)},clear:async()=>{saved=null}},read:()=>state,write:x=>{state=copy(x)},empty,fetch});
  return {account,storage,rows,set:x=>{state=x},get:()=>state,setGate:x=>{gate=x},vault:()=>saved};
}
(async()=>{
  const f=await fixture();f.set({...empty(),goals:[g('guest','Guest task')]});
  await f.account.login('a@example.test','password');
  assert.deepEqual(f.get().goals.map(g=>g.id),['a-goal'],'guest data not imported implicitly');
  assert.equal(f.vault().user.id,A);
  await f.account.logout();assert.deepEqual(f.get().goals.map(g=>g.id),['guest'],'logout restores only guest workspace');
  await f.account.login('b@example.test','password',{importGuest:true});
  assert.deepEqual(f.get().goals.map(g=>g.id).sort(),['b-goal','guest']);
  assert(!f.get().goals.some(g=>g.id==='a-goal'),'account workspaces isolated');
  let release,entered;const active=new Promise(r=>{entered=r});
  f.setGate(()=>new Promise(r=>{release=r;entered()}));
  const syncing=f.account.sync();await active;
  f.get().goals[0].name='Edited during upload';release();f.setGate(null);await syncing;
  assert.equal(f.get().goals[0].name,'Edited during upload','in-flight edits remain local');
  await f.account.sync();
  assert.equal(f.rows.get(B).document.goals[0].name,'Edited during upload');
  f.get().goals[0].name='Local conflict';f.rows.get(B).document.goals[0].name='Remote conflict';f.rows.get(B).revision++;
  await assert.rejects(()=>f.account.sync(),e=>e.code==='merge_conflict');
  assert.equal(f.get().goals[0].name,'Local conflict','conflict never overwrites silently');
  await f.account.resolve(f.account.pending.result.conflicts.map(()=> 'remote'));
  assert.equal(f.get().goals[0].name,'Remote conflict');
  await f.account.logout();
  assert.equal(f.storage.getItem('rivaya-active-owner'),null);assert.equal(f.vault(),null);
  const saved=JSON.parse(f.storage.getItem(f.account.workspace(B)));assert(saved.goals.some(g=>g.name==='Remote conflict'));
  clearTimeout(f.account.debounce);
  const wrong=await fixture();wrong.storage.setItem('rivaya-active-owner',A);wrong.set({...empty(),goals:[g('private-a','Private A')]});
  wrong.account.vault.read=async()=>({user:{id:B},access_token:B,refresh_token:'b',expires_at:Date.now()/1000+3600});
  await wrong.account.init();
  assert(!wrong.storage.getItem(wrong.account.workspace('guest')),'restored private workspace never becomes guest');
  assert(JSON.parse(wrong.storage.getItem(wrong.account.workspace(A))).goals.some(g=>g.id==='private-a'));
  const quota=await fixture();quota.set({...empty(),goals:[g('guest-safe','Preserved guest')]});
  const set=quota.storage.setItem;let fail=true;
  quota.storage.setItem=(key,value)=>{if(key===quota.account.workspace(A)&&fail){fail=false;throw Error('QuotaExceededError')}return set(key,value)};
  await assert.rejects(()=>quota.account.login('a@example.test','password'),e=>e.code==='workspace_storage_failed');
  assert.equal(quota.account.owner,null);assert.equal(quota.vault(),null);assert(!quota.account.locked);
  assert.equal(quota.get().goals[0].name,'Preserved guest','failed workspace writes roll back without exposing the next account');
  console.log('PASS: explicit guest import, separate accounts, secure session callbacks, logout restoration, CAS sync, in-flight edits, conflict resolution, startup account isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
