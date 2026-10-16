/* Authenticated transport. Native session integration must supply short-lived tokens.
 * No token persistence and no automatic activation from this module. */
(function(root){
  'use strict';
  const core=typeof module!=='undefined'&&module.exports?require('./sync-core.js'):root.RivayaSync;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  class SyncError extends Error{
    constructor(code){super(code);this.name='SyncError';this.code=code;}
  }
  class Transport{
    constructor({url,publishableKey,session,fetch:fetcher=root.fetch.bind(root),timeoutMs=15000}){
      const parsed=new URL(url);
      if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new SyncError('invalid_config');
      if(!/^sb_publishable_[\w-]+$/.test(publishableKey)||typeof session!=='function')throw new SyncError('invalid_config');
      this.url=parsed.origin;this.key=publishableKey;this.session=session;this.fetch=fetcher;this.timeoutMs=timeoutMs;
      this.generation=0;this.requests=new Set();
    }
    // Call before logout/account switching, even when returning to the same account.
    cancel(){this.generation++;for(const controller of this.requests)controller.abort();this.requests.clear();}
    async request(owner,path,body){
      if(!UUID.test(owner))throw new SyncError('invalid_owner');
      const generation=this.generation;
      const credentials=await this.session();
      if(generation!==this.generation)throw new SyncError('cancelled');
      if(!credentials||credentials.userId!==owner||!credentials.accessToken)throw new SyncError('authentication_required');
      const controller=new AbortController();this.requests.add(controller);
      const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
      try{
        const response=await this.fetch(this.url+'/rest/v1/'+path,{
          method:body===undefined?'GET':'POST',signal:controller.signal,redirect:'error',cache:'no-store',
          headers:{apikey:this.key,Authorization:'Bearer '+credentials.accessToken,'Content-Type':'application/json'},
          ...(body===undefined?{}:{body:JSON.stringify(body)})
        });
        const current=await this.session();
        if(generation!==this.generation||!current||current.userId!==owner)throw new SyncError('cancelled');
        let data;try{data=await response.json();}catch{throw new SyncError('invalid_response');}
        if(generation!==this.generation)throw new SyncError('cancelled');
        if(!response.ok){
          if(response.status===401||response.status===403)throw new SyncError('authentication_required');
          if(data?.code==='40001')throw new SyncError('revision_conflict');
          if(response.status===429)throw new SyncError('rate_limited');
          throw new SyncError(response.status>=500?'server_unavailable':'request_rejected');
        }
        return data;
      }catch(error){
        if(generation!==this.generation)throw new SyncError('cancelled');
        if(error instanceof SyncError)throw error;
        throw new SyncError(controller.signal.aborted?'timeout':'network_unavailable');
      }finally{clearTimeout(timer);this.requests.delete(controller);}
    }
    async pull(owner){
      const rows=await this.request(owner,'rivaya_documents?select=user_id,revision,payload&user_id=eq.'+encodeURIComponent(owner)+'&limit=2');
      if(!Array.isArray(rows)||rows.length>1)throw new SyncError('invalid_response');
      if(!rows.length)return null;
      const row=rows[0];
      if(row.user_id!==owner||!Number.isSafeInteger(row.revision)||row.revision<1||row.payload?.schemaVersion!==1)throw new SyncError('invalid_response');
      try{core.validate(row.payload);}catch{throw new SyncError('invalid_response');}
      return {revision:row.revision,document:row.payload};
    }
    async push(owner,revision,document){
      if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER||document?.schemaVersion!==1)throw new SyncError('invalid_document');
      try{core.validate(document);}catch{throw new SyncError('invalid_document');}
      // Re-project instead of forwarding arbitrary fields from imported JSON.
      const safe=core.project({...document,activity:{stepGoal:document.preferences?.stepGoal}});
      const next=await this.request(owner,'rpc/rivaya_save',{expected_revision:revision,document:safe});
      if(!Number.isSafeInteger(next)||next!==revision+1)throw new SyncError('invalid_response');
      return next;
    }
  }
  const api={Transport,SyncError};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RivayaSyncTransport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
