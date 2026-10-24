const assert=require('assert'),{pathToFileURL}=require('url'),path=require('path');
(async()=>{
 const {revokeApple}=await import(pathToFileURL(path.resolve(__dirname,'../cloud/apple-revoke.mjs')));
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
 const config={APPLE_SIGN_IN_CLIENT_ID:'app.rivaya.smart01',APPLE_SIGN_IN_TEAM_ID:'M2329MH9ZX',APPLE_SIGN_IN_KEY_ID:'TESTKEY',APPLE_SIGN_IN_PRIVATE_KEY:pem};
 const env=k=>config[k],now=Math.floor(Date.now()/1000);let requests=[],subject='apple-user',failure=false;
 const fetch=async(url,options)=>{
  assert.equal(options.redirect,'error');assert.equal(options.method,'POST');const p=Object.fromEntries(options.body);requests.push({url,p});
  const jwt=p.client_secret.split('.'),claims=JSON.parse(Buffer.from(jwt[1],'base64url'));
  assert.equal(claims.sub,config.APPLE_SIGN_IN_CLIENT_ID);assert.equal(claims.aud,'https://appleid.apple.com');assert(claims.exp-claims.iat<=300);
  assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,Buffer.from(jwt[2],'base64url'),Buffer.from(jwt.slice(0,2).join('.'))));
  if(url.endsWith('/token'))return {ok:!failure,json:async()=>({id_token:'header.'+Buffer.from(JSON.stringify({iss:'https://appleid.apple.com',aud:'app.rivaya.smart01',sub:subject,exp:now+300})).toString('base64url')+'.signature',refresh_token:'apple-refresh'})};
  assert(url.endsWith('/revoke'));assert.equal(p.token,'apple-refresh');assert.equal(p.token_type_hint,'refresh_token');return {ok:true};
 };
 await revokeApple('one-use-code','apple-user',env,fetch);assert.equal(requests.length,2);assert.equal(requests[0].p.code,'one-use-code');
 requests=[];subject='someone-else';await assert.rejects(()=>revokeApple('code','apple-user',env,fetch),/apple_identity_mismatch/);assert.equal(requests.length,1,'never revoke another Apple identity');
 requests=[];await assert.rejects(()=>revokeApple('code','apple-user',()=>undefined,fetch),/apple_deletion_unavailable/);assert.equal(requests.length,0);
 await assert.rejects(()=>revokeApple('','apple-user',env,fetch),/apple_reauthentication_required/);
 failure=true;await assert.rejects(()=>revokeApple('used-code','apple-user',env,fetch),/apple_revocation_failed/);
 console.log('PASS: Apple deletion client-secret signature/expiry, code exchange, same-user check, token revocation and safe failure without signing secrets');
})().catch(e=>{console.error(e);process.exitCode=1});
