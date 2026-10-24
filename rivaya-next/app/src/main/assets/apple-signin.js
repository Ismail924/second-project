(function(root){
  'use strict';
  let pending=null;
  root.rivayaOnAppleSignIn=function(text){
    let data;try{data=JSON.parse(text)}catch{return}
    if(!pending||data.requestId!==pending.id)return;
    const p=pending;pending=null;clearTimeout(p.timer);
    if(data.error)p.reject(Object.assign(Error(data.error),{code:data.error}));
    else if(typeof data.idToken!=='string'||!data.idToken||typeof data.nonce!=='string'||!data.nonce)p.reject(Object.assign(Error('apple_invalid_response'),{code:'apple_invalid_response'}));
    else p.resolve({idToken:data.idToken,nonce:data.nonce,authorizationCode:data.authorizationCode});
  };
  root.RivayaAppleSignIn={
    available:()=>root.RIVAYA_IOS===true&&typeof root.VektorNative?.signInWithApple==='function',
    signIn:()=>new Promise((resolve,reject)=>{
      const fail=code=>reject(Object.assign(Error(code),{code}));
      if(!root.RivayaAppleSignIn.available())return fail('apple_unavailable');
      if(pending)return fail('apple_busy');
      const id=String(Date.now())+'-'+Math.random().toString(36).slice(2);
      const timer=setTimeout(()=>{pending=null;fail('apple_timeout')},120000);
      pending={id,timer,resolve,reject};
      try{root.VektorNative.signInWithApple(JSON.stringify({requestId:id}))}
      catch{clearTimeout(timer);pending=null;fail('apple_failed')}
    })
  };
})(typeof window!=='undefined'?window:globalThis);
