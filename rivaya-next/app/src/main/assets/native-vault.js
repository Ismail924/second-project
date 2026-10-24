(function(root){
  'use strict';
  const pending=new Map();
  root.rivayaOnSecureSession=function(text){
    let d;try{d=JSON.parse(text)}catch{return}
    const p=pending.get(d.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(d.requestId);
    if(d.error)p.reject(Error('secure_storage_failed'));else{try{p.resolve(d.value?JSON.parse(d.value):null)}catch{p.reject(Error('invalid_secure_session'))}}
  };
  function call(operation,value){
    return new Promise((resolve,reject)=>{
      if(!root.VektorNative?.secureSession){reject(Error('secure_storage_unavailable'));return}
      const requestId=String(Date.now())+'-'+Math.random().toString(36).slice(2);
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('secure_storage_timeout'))},10000);
      pending.set(requestId,{resolve,reject,timer});
      try{root.VektorNative.secureSession(JSON.stringify({requestId,operation,value:value?JSON.stringify(value):null}))}catch(e){clearTimeout(timer);pending.delete(requestId);reject(e)}
    });
  }
  root.RivayaVault={read:()=>call('read'),write:value=>call('write',value),clear:()=>call('clear')};
})(typeof window!=='undefined'?window:globalThis);
