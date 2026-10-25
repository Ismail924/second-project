const assert=require('assert'),vm=require('vm'),fs=require('fs');
const source=fs.readFileSync(require('path').join(__dirname,'../app/src/main/assets/backend-fetch.js'),'utf8');
(async()=>{
 let sent,requests=0;
 const root={fetch:async()=>{requests++;return 'browser'},VektorNative:{backendRequest:text=>{sent=JSON.parse(text)}}};
 vm.runInNewContext(source,{window:root,Map,JSON,Date,Math,setTimeout,clearTimeout,DOMException});
 const first=root.rivayaBackendFetch('https://example.test',{method:'POST',body:'{}'});
 root.rivayaOnBackendResponse(JSON.stringify({requestId:'unrelated',status:200,body:'{}'}));
 root.rivayaOnBackendResponse(JSON.stringify({requestId:sent.requestId,status:201,body:'{"ok":true}'}));
 const response=await first;assert.equal(response.status,201);assert(response.ok);assert.equal((await response.json()).ok,true);
 const control=new AbortController(),pending=root.rivayaBackendFetch('https://example.test',{signal:control.signal});
 const old=sent.requestId;control.abort();await assert.rejects(pending,e=>e.name==='AbortError');
 root.rivayaOnBackendResponse(JSON.stringify({requestId:old,status:200,body:'{}'}));
 const failure=root.rivayaBackendFetch('https://example.test');root.rivayaOnBackendResponse(JSON.stringify({requestId:sent.requestId,error:true}));await assert.rejects(failure,/network_unavailable/);
 delete root.VektorNative;assert.equal(await root.rivayaBackendFetch('/test'),'browser');assert.equal(requests,1);
 console.log('PASS: native response correlation, abort and late response, network error and browser fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
