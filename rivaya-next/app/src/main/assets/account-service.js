/* Account coordinator. Never enable without secure storage and live backend checks. */
(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  class AccountError extends Error{constructor(code){super(code);this.code=code}}
  class Accounts{
    constructor({url,key,core,Transport,vault,storage,read,write,empty,changed=()=>{},fetch:fetcher=root.fetch.bind(root)}){
      if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key.startsWith('sb_publishable_'))throw new AccountError('invalid_config');
      Object.assign(this,{url,key,core,vault,storage,read,write,empty,changed,fetch:fetcher});
      this.session=null;this.owner=null;this.generation=0;this.busy=false;this.pending=null;this.lastError=null;
      this.journal=new core.Journal(storage);
      this.vaultQueue=Promise.resolve();
      this.transport=new Transport({url,publishableKey:key,fetch:fetcher,session:()=>this.credentials()});
    }
    get active(){return !!this.owner}
    storeSession(session,generation=this.generation){
      const action=this.vaultQueue.catch(()=>{}).then(()=>{if(generation!==this.generation)throw new AccountError('cancelled');return session?this.vault.write(session):this.vault.clear()});
      this.vaultQueue=action;return action;
    }
    async switchState(owner,session,target){
      if(this.locked)throw new AccountError('workspace_busy');
      this.core.validate(target);
      const previous=clone(this.read()),oldOwner=this.owner,oldSession=this.session,tag=this.storage.getItem('rivaya-active-owner');
      const key=this.workspace(owner||'guest'),oldTarget=this.storage.getItem(key);
      this.locked=true;this.changed();
      try{
        await this.storeSession(session);
        this.storage.setItem(key,JSON.stringify(target));
        this.write(target);
        if(owner)this.storage.setItem('rivaya-active-owner',owner);else this.storage.removeItem('rivaya-active-owner');
        this.owner=owner;this.session=session;this.locked=false;this.changed();
      }catch(error){
        this.owner=oldOwner;this.session=oldSession;
        try{
          if(oldTarget===null)this.storage.removeItem(key);else this.storage.setItem(key,oldTarget);
          if(tag===null)this.storage.removeItem('rivaya-active-owner');else this.storage.setItem('rivaya-active-owner',tag);
          this.write(previous);await this.storeSession(oldSession);this.locked=false;
        }catch{this.locked=true}
        this.changed();throw new AccountError('workspace_storage_failed');
      }
    }
    workspace(owner){return 'rivaya-workspace:'+owner}
    async auth(path,body,method='POST',token){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const r=await this.fetch(this.url+'/auth/v1/'+path,{method,redirect:'error',signal:controller.signal,headers:{apikey:this.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const data=r.status===204?{}:await r.json();
        if(!r.ok)throw new AccountError(r.status===429?'rate_limited':r.status===401||r.status===400?'authentication_failed':'auth_unavailable');
        return data;
      }catch(e){if(e instanceof AccountError)throw e;throw new AccountError('network_unavailable')}finally{clearTimeout(timer)}
    }
    async credentials(){
      if(!this.session||!this.owner||this.locked)return null;
      if((this.session.expires_at||0)<Date.now()/1000+60){
        if(!this.refreshing)this.refreshing=this.refresh().finally(()=>{this.refreshing=null});
        await this.refreshing;
      }
      return {userId:this.owner,accessToken:this.session.access_token};
    }
    async refresh(){
      const generation=this.generation,owner=this.owner,old=this.session;
      const next=await this.auth('token?grant_type=refresh_token',{refresh_token:old.refresh_token});
      if(generation!==this.generation||owner!==this.owner)throw new AccountError('cancelled');
      if(next.user?.id!==owner)throw new AccountError('owner_mismatch');
      next.expires_at=next.expires_at||Date.now()/1000+next.expires_in;
      await this.storeSession(next,generation);
      if(generation!==this.generation)throw new AccountError('cancelled');
      this.session=next;
    }
    stash(){this.storage.setItem(this.workspace(this.owner||'guest'),JSON.stringify(this.read()))}
    async init(){
      const saved=await this.vault.read();
      if(saved?.user?.id&&saved.access_token&&saved.refresh_token){
        const previous=this.storage.getItem('rivaya-active-owner');
        if(previous!==saved.user.id)this.storage.setItem(this.workspace(previous||'guest'),JSON.stringify(this.read()));
        const raw=this.storage.getItem(this.workspace(saved.user.id));
        await this.switchState(saved.user.id,saved,previous===saved.user.id?clone(this.read()):raw?JSON.parse(raw):this.empty());
      }else if(this.storage.getItem('rivaya-active-owner')){
        this.storage.setItem(this.workspace(this.storage.getItem('rivaya-active-owner')),JSON.stringify(this.read()));
        const raw=this.storage.getItem(this.workspace('guest'));await this.switchState(null,null,raw?JSON.parse(raw):this.empty());
      }
    }
    async login(email,password,{importGuest=false}={}){
      if(this.owner)throw new AccountError('logout_required');
      if(this.authenticating)throw new AccountError('authentication_busy');
      this.authenticating=true;const generation=this.generation;
      try{
      const session=await this.auth('token?grant_type=password',{email:email.trim(),password});
      const user=await this.auth('user',undefined,'GET',session.access_token);
      if(!user?.id||session.user?.id!==user.id)throw new AccountError('owner_mismatch');
      if(generation!==this.generation)throw new AccountError('cancelled');
      session.user=user;session.expires_at=session.expires_at||Date.now()/1000+session.expires_in;
      const guest=clone(this.read());this.stash();
      const raw=this.storage.getItem(this.workspace(user.id));
      const target=raw?JSON.parse(raw):(importGuest?guest:this.empty());
      this.core.validate(target);
      await this.switchState(user.id,session,target);
      if(generation!==this.generation)throw new AccountError('cancelled');
      this.transport.cancel();this.generation++;
      return await this.sync();
      }finally{this.authenticating=false}
    }
    async signup(email,password){return this.auth('signup',{email:email.trim(),password})}
    async recovery(email){return this.auth('recover',{email:email.trim()})}
    async verify(email,token,type='signup'){return this.auth('verify',{email:email.trim(),token,type})}
    async resetPassword(email,token,password){
      const recovery=await this.verify(email,token,'recovery');
      if(!recovery.access_token)throw new AccountError('authentication_failed');
      await this.auth('user',{password},'PUT',recovery.access_token);
      await this.auth('logout?scope=local',undefined,'POST',recovery.access_token);
    }
    capture(){
      if(!this.owner||this.locked)return;
      this.journal.capture(this.owner,this.read());this.stash();
      clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.sync().catch(()=>{}),1200);
    }
    async sync(){
      if(!this.owner||this.pending||this.locked)return;
      if(this.busy){this.again=true;return}
      this.busy=true;this.lastError=null;this.changed();
      const owner=this.owner,generation=this.generation;
      const current=()=>{if(owner!==this.owner||generation!==this.generation)throw new AccountError('cancelled')};
      try{
        for(let attempt=0;attempt<3;attempt++){
          current();
          const local=this.core.project(this.read()),journal=this.journal.capture(owner,this.read());
          const remote=await this.transport.pull(owner);current();
          const blank=this.core.project(this.empty());
          let merged=local,revision=remote?.revision||0;
          if(remote){
            const isEmpty=!local.goals.length&&!local.habits.length&&!Object.keys(local.checks).length&&!local.profile.name&&!local.profile.avatarData;
            const result=this.core.merge(journal.base||blank,isEmpty&&!journal.base?blank:local,remote.document);
            if(result.conflicts.length){
              this.pending={owner,generation,local,remote,result};
              this.storage.setItem('rivaya-conflict:'+owner,JSON.stringify({local,remote:remote.document,at:new Date().toISOString()}));
              throw new AccountError('merge_conflict');
            }
            merged=result.state;
          }
          try{
            const next=await this.transport.push(owner,revision,merged);current();
            this.journal.acknowledge(owner,merged,next);
            const after=this.core.merge(local,this.core.project(this.read()),merged);
            if(after.conflicts.length){this.again=true;return}
            this.write(this.core.apply(this.read(),after.state));this.stash();this.journal.capture(owner,this.read());
            if(!this.core.same(this.core.project(this.read()),merged))this.again=true;
            this.lastSync=Date.now();this.changed();return;
          }catch(e){if(e.code==='revision_conflict'&&attempt<2)continue;throw e}
        }
      }catch(e){this.lastError=e.code||'sync_failed';this.changed();throw e}
      finally{this.busy=false;this.changed();if(this.again){this.again=false;setTimeout(()=>this.sync().catch(()=>{}),1000)}}
    }
    async resolve(choices){
      const p=this.pending;
      if(!p||p.owner!==this.owner||p.generation!==this.generation)throw new AccountError('cancelled');
      if(!Array.isArray(choices)||choices.length!==p.result.conflicts.length||choices.some(x=>!['local','remote'].includes(x)))throw new AccountError('choose_conflicts');
      const doc=clone(p.result.state);
      p.result.conflicts.forEach((conflict,i)=>{
        const keys=conflict.path.slice(),value=conflict[choices[i]];let target=doc;
        if(['goals','habits'].includes(keys[0])){
          const collection=keys.shift(),id=keys.shift(),index=doc[collection].findIndex(x=>x.id===id);
          if(!keys.length){if(value===undefined){if(index>=0)doc[collection].splice(index,1)}else if(index>=0)doc[collection][index]=clone(value);else doc[collection].push(clone(value));return}
          target=doc[collection].find(x=>x.id===id);
        }
        if(!target)throw new AccountError('invalid_resolution');
        while(keys.length>1){const key=keys.shift();if(!target[key])target[key]={};target=target[key]}
        if(value===undefined)delete target[keys[0]];else target[keys[0]]=clone(value);
      });
      this.core.validate(doc);
      const next=await this.transport.push(this.owner,p.remote.revision,doc);
      if(p.owner!==this.owner||p.generation!==this.generation)throw new AccountError('cancelled');
      const after=this.core.merge(p.local,this.core.project(this.read()),doc);
      this.journal.acknowledge(this.owner,doc,next);this.pending=null;
      if(after.conflicts.length){this.lastError='edited_during_resolution';this.changed();return this.sync()}
      this.write(this.core.apply(this.read(),after.state));this.lastError=null;this.stash();this.journal.capture(this.owner,this.read());this.changed();
    }
    async logout(){
      const old=this.session;
      this.stash();this.transport.cancel();this.generation++;clearTimeout(this.debounce);
      const guest=this.storage.getItem(this.workspace('guest'));await this.switchState(null,null,guest?JSON.parse(guest):this.empty());this.pending=null;
      if(old?.access_token)this.auth('logout?scope=local',undefined,'POST',old.access_token).catch(()=>{});
    }
    async deleteAccount(){
      const owner=this.owner,credentials=await this.credentials();if(!owner||!credentials)throw new AccountError('authentication_required');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const r=await this.fetch(this.url+'/functions/v1/delete-account',{method:'POST',redirect:'error',signal:controller.signal,headers:{apikey:this.key,Authorization:'Bearer '+credentials.accessToken,'Content-Type':'application/json'},body:'{}'});
        if(!r.ok)throw new AccountError('deletion_failed');
        if(this.owner!==owner)throw new AccountError('cancelled');
        await this.logout();this.storage.removeItem(this.workspace(owner));this.storage.removeItem(this.journal.key(owner));this.storage.removeItem('rivaya-conflict:'+owner);
      }finally{clearTimeout(timer)}
    }
  }
  const api={Accounts,AccountError};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RivayaAccountsModule=api;
})(typeof globalThis!=='undefined'?globalThis:this);
