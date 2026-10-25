// Deploy as delete-account only after configuring Supabase secrets on the server.
// Service role is never included in the app or returned in a response.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { revokeApple } from './apple-revoke.mjs';

Deno.serve(async (request: Request) => {
  const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Content-Type':'application/json'};
  if(request.method==='OPTIONS')return new Response(null,{headers});
  if(request.method!=='POST')return new Response('{}',{status:405,headers});
  const bearer=request.headers.get('Authorization')||'';
  if(!bearer.startsWith('Bearer '))return new Response('{}',{status:401,headers});
  const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  if(!url||!secret||!anon)return new Response('{}',{status:503,headers});
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=bearer.slice(7);
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)return new Response('{}',{status:401,headers});
  const scoped=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const active=await scoped.rpc('rivaya_session_check');
  if(active.error||active.data!==data.user.id)return new Response('{}',{status:401,headers});
  const apple=data.user.identities?.find(identity=>identity.provider==='apple');
  if(apple){
    try{
      const text=await request.text();if(text.length>16384)throw Error('invalid_body');
      const body=JSON.parse(text);
      await revokeApple(body.appleAuthorizationCode,apple.identity_data?.sub,(name: string)=>Deno.env.get(name));
    }catch{
      // Never delete only part of an Apple account or log single-use codes/tokens.
      return new Response('{"error":"apple_revocation_required"}',{status:503,headers});
    }
  }
  // Revoke refresh sessions first, then delete auth row. App tables cascade by user_id.
  const revoked=await admin.auth.admin.signOut(token,'global');
  if(revoked.error)return new Response('{}',{status:503,headers});
  const deleted=await admin.auth.admin.deleteUser(data.user.id);
  if(deleted.error)return new Response('{}',{status:503,headers});
  return new Response('{"deleted":true}',{status:200,headers});
});
