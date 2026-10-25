/* RIVAYA sync protocol v1. No credentials or health records belong here. */
(function(root){
  'use strict';
  const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const canonical=x=>{
    if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
    if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
    return JSON.stringify(x);
  };
  const same=(a,b)=>canonical(a)===canonical(b);
  const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  function validate(state){
    if(!plain(state)||!Array.isArray(state.goals)||!Array.isArray(state.habits)||!plain(state.checks))throw Error('Invalid state');
    for(const list of [state.goals,state.habits]){
      const ids=new Set();
      for(const item of list){
        if(!plain(item)||typeof item.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(item.id)||typeof item.name!=='string'||ids.has(item.id))throw Error('Invalid or duplicate entity');
        ids.add(item.id);
      }
    }
    for(const g of state.goals)if(g.type==='quantity'&&(!Number.isFinite(g.targetValue)||g.targetValue<=0||g.targetValue>1e9||!Number.isFinite(g.currentValue)||g.currentValue<0||g.currentValue>1e9||typeof g.unit!=='string'||!g.unit.trim()||g.unit.length>30||!Array.isArray(g.entries)||g.entries.some(e=>!plain(e)||typeof e.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(e.amount)||e.amount<=0||e.amount>1e9)))throw Error('Invalid quantity goal');
    if(!Object.values(state.checks).every(x=>typeof x==='boolean'))throw Error('Invalid checks');
    return state;
  }
  function project(state){
    validate(state);
    // Explicit allowlist: OS permissions, health history, tokens and billing never upload.
    return copy({schemaVersion:1,goals:state.goals,habits:state.habits,checks:state.checks,
      goalSnapshots:state.goalSnapshots||{},profile:{name:state.profile?.name||'',avatarData:state.profile?.avatarData||''},
      preferences:{stepGoal:state.activity?.stepGoal||8000}});
  }
  function merge(base,local,remote){
    [base,local,remote].forEach(validate);
    if([base,local,remote].some(x=>x.schemaVersion!==1))throw Error('Unsupported sync schema');
    const conflicts=[];
    function value(b,l,r,path){
      if(same(l,r))return copy(l);
      if(same(b,l))return copy(r);
      if(same(b,r))return copy(l);
      if(plain(b)&&plain(l)&&plain(r)){
        const out=Object.create(null);
        for(const key of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){
          const next=value(b[key],l[key],r[key],path.concat(key));
          if(next!==undefined)out[key]=next;
        }
        return out;
      }
      conflicts.push({path,base:copy(b),local:copy(l),remote:copy(r)});
      return copy(l); // Caller MUST stop publication while conflicts exist.
    }
    const out=value({...base,goals:undefined,habits:undefined},{...local,goals:undefined,habits:undefined},{...remote,goals:undefined,habits:undefined},[]);
    for(const collection of ['goals','habits']){
      const maps=[base,local,remote].map(s=>Object.fromEntries(s[collection].map(x=>[x.id,x])));
      out[collection]=[];
      for(const id of new Set(maps.flatMap(Object.keys))){
        const next=value(maps[0][id],maps[1][id],maps[2][id],[collection,id]);
        if(next!==undefined)out[collection].push(next);
      }
    }
    validate(out);
    return {state:out,conflicts};
  }
  function apply(local,cloud){
    validate(cloud);
    if(cloud.schemaVersion!==1)throw Error('Unsupported sync schema');
    return {...copy(local),goals:copy(cloud.goals),habits:copy(cloud.habits),checks:copy(cloud.checks),
      goalSnapshots:copy(cloud.goalSnapshots||{}),profile:{...copy(local.profile),...copy(cloud.profile),onboardingDone:true},
      activity:{...copy(local.activity),stepGoal:cloud.preferences?.stepGoal||local.activity.stepGoal}};
  }
  // One atomic localStorage value per account. Guest migration is explicit, once.
  class Journal{
    constructor(storage){this.storage=storage;}
    key(owner){if(typeof owner!=='string'||!(/^[a-zA-Z0-9-]{1,80}$/).test(owner))throw Error('Invalid owner');return 'rivaya-sync-v1:'+owner;}
    read(owner){const raw=this.storage.getItem(this.key(owner));if(!raw)return null;const doc=JSON.parse(raw);if(doc.owner!==owner||doc.version!==1)throw Error('Invalid journal');return doc;}
    capture(owner,state){
      const snapshot=project(state),old=this.read(owner);
      if(old&&same(old.pending,snapshot))return old;
      const doc={version:1,owner,revision:old?.revision||0,base:old?.base||null,pending:snapshot};
      this.storage.setItem(this.key(owner),JSON.stringify(doc));return doc;
    }
    acknowledge(owner,sent,revision){
      const doc=this.read(owner);
      if(!doc||!Number.isSafeInteger(revision)||revision<=doc.revision)throw Error('Invalid acknowledgement');
      // Preserve edits made while the network request was in flight.
      doc.base=copy(sent);doc.revision=revision;
      this.storage.setItem(this.key(owner),JSON.stringify(doc));return doc;
    }
  }
  const api={project,merge,apply,Journal,same,validate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RivayaSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
