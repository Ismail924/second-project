// Server-only Apple credential revocation. Never bundle signing material in the app.
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const part=value=>encode(new TextEncoder().encode(JSON.stringify(value)));
export async function revokeApple(code,subject,env,fetcher=fetch){
  const client=env('APPLE_SIGN_IN_CLIENT_ID'),team=env('APPLE_SIGN_IN_TEAM_ID'),kid=env('APPLE_SIGN_IN_KEY_ID'),pem=env('APPLE_SIGN_IN_PRIVATE_KEY');
  if(client!=='app.rivaya.smart01'||team!=='M2329MH9ZX'||!kid||!pem)throw Error('apple_deletion_unavailable');
  if(typeof code!=='string'||!code||code.length>8192||!subject)throw Error('apple_reauthentication_required');
  const now=Math.floor(Date.now()/1000);
  const body=part({alg:'ES256',kid,typ:'JWT'})+'.'+part({iss:team,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:client});
  const raw=Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',raw,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const secret=body+'.'+encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(body)));
  async function post(path,params){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetcher('https://appleid.apple.com/auth/'+path,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,...params})});
      if(!response.ok)throw Error('apple_revocation_failed');
      return response;
    }finally{clearTimeout(timer)}
  }
  // The token response arrives directly from Apple's HTTPS endpoint, never from the client.
  const tokens=await (await post('token',{grant_type:'authorization_code',code})).json();
  let claims;
  try{claims=JSON.parse(atob(tokens.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{throw Error('apple_identity_mismatch')}
  if(claims.iss!=='https://appleid.apple.com'||claims.aud!==client||claims.sub!==subject||!Number.isFinite(claims.exp)||claims.exp<=now)throw Error('apple_identity_mismatch');
  const token=tokens.refresh_token||tokens.access_token;
  if(typeof token!=='string'||!token)throw Error('apple_revocation_failed');
  await post('revoke',{token,token_type_hint:tokens.refresh_token?'refresh_token':'access_token'});
}
