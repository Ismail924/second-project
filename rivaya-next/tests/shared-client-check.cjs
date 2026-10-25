const assert=require('assert');
const{SharedGoals,invitationCode}=require('../app/src/main/assets/shared-service.js');
(async()=>{
 const token='a1'.repeat(32);assert.equal(invitationCode('RIVAYA\nКод: '+token.toUpperCase()),token);assert.throws(()=>invitationCode('wrong'));assert.throws(()=>invitationCode(token+' '+ 'b2'.repeat(32)));
 let release;const account={owner:'owner-a',transport:{request:async(owner,path,body)=>{assert.equal(owner,'owner-a');assert.equal(path,'rpc/rivaya_shared');assert.equal(body.args.token,token);return{id:'goal'}}}};
 const s=new SharedGoals(account);assert.deepEqual(await s.join('Код: '+token,'Friend'),{id:'goal'});
 account.transport.request=()=>new Promise(r=>release=r);const pending=s.list();account.owner='owner-b';release([{id:'private-goal'}]);await assert.rejects(()=>pending,/cancelled/);assert.deepEqual(s.cache,[]);
 account.owner=null;await assert.rejects(()=>s.create('Goal','Name'),/authentication_required/);
 console.log('PASS: invitation parsing, ambiguous token rejection, authenticated shared RPC and late response isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
