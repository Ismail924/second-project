(function(root){
  'use strict';
  const waiting=new Map();
  root.rivayaOnBackendResponse=function(text){
    let result;try{result=JSON.parse(text)}catch{return}
    const p=waiting.get(result.requestId);if(!p)return;
    clearTimeout(p.timer);waiting.delete(result.requestId);p.cleanup();
    if(result.error||!result.status){p.reject(Error('network_unavailable'));return}
    p.resolve({ok:result.status>=200&&result.status<300,status:result.status,json:async()=>JSON.parse(result.body||'{}')});
  };
  root.rivayaBackendFetch=function(url,options={}){
    if(!root.VektorNative?.backendRequest)return root.fetch(url,options);
    return new Promise((resolve,reject)=>{
      const requestId=String(Date.now())+'-'+Math.random().toString(36).slice(2),signal=options.signal;
      const abort=()=>{const p=waiting.get(requestId);if(p){clearTimeout(p.timer);waiting.delete(requestId);p.cleanup();reject(new DOMException('Aborted','AbortError'))}};
      if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return}
      const slowDelete=String(url).endsWith('/functions/v1/delete-account');
      const timer=setTimeout(()=>{const p=waiting.get(requestId);if(p){waiting.delete(requestId);p.cleanup();reject(Error('network_timeout'))}},slowDelete?50000:20000);
      const cleanup=()=>signal?.removeEventListener('abort',abort);
      waiting.set(requestId,{resolve,reject,timer,cleanup});signal?.addEventListener('abort',abort,{once:true});
      try{root.VektorNative.backendRequest(JSON.stringify({requestId,url,method:options.method||'GET',headers:options.headers||{},body:options.body||null}))}catch(e){clearTimeout(timer);waiting.delete(requestId);cleanup();reject(e)}
    });
  };
})(typeof window!=='undefined'?window:globalThis);
