// Run with NODE_PATH pointing to an installation of @electric-sql/pglite@0.5.11.
const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'../cloud');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',C='cccccccc-cccc-cccc-cccc-cccccccccccc';
const sessions={ [A]:'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa',[B]:'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb',[C]:'cccccccc-0000-0000-0000-cccccccccccc'};
(async()=>{
 const db=new PGlite();await db.waitReady;
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));grant usage on schema auth to authenticated;create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;`);
 for(const id of [A,B,C]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into auth.sessions values($1,$2)',[sessions[id],id])}
 await db.exec(fs.readFileSync(path.join(root,'001_sync.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(root,'shared-schema.sql'),'utf8'));
 const as=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:sessions[id],role:'authenticated'})]);await db.exec('set role authenticated')};
 const act=async(operation,args={})=>(await db.query('select public.rivaya_shared($1,$2::jsonb) as result',[operation,JSON.stringify(args)])).rows[0].result;
 await as(A);const g=await act('create',{title:'Shared exam',name:'A'});assert(g.id);
 const invite=await act('invite',{goal_id:g.id});assert.equal(invite.token.length,64);
 await as(C);assert.deepEqual(await act('list'),[]);assert.equal((await db.query('select * from public.rivaya_shared_goals')).rows.length,0);
 await assert.rejects(()=>act('invite',{goal_id:g.id}));await assert.rejects(()=>act('delete',{goal_id:g.id}));
 await as(B);await act('join',{token:invite.token,name:'B'});assert.equal((await act('list')).length,1);
 await as(C);await assert.rejects(()=>act('join',{token:invite.token,name:'C'}));
 await as(A);await act('add_step',{goal_id:g.id,title:'Read topics',assigned_to:B,deadline:'2026-12-01'});
 const step=(await act('list'))[0].steps[0];assert.equal(step.assigned_to,B);
 await assert.rejects(()=>act('set_step',{goal_id:g.id,step_id:step.id,expected_revision:1,done:true}));
 await as(B);await act('set_step',{goal_id:g.id,step_id:step.id,expected_revision:1,done:true});
 await assert.rejects(()=>act('set_step',{goal_id:g.id,step_id:step.id,expected_revision:1,done:false}));
 await assert.rejects(()=>db.query('update public.rivaya_shared_steps set assigned_to=$1 where id=$2',[A,step.id]));
 await act('react',{goal_id:g.id,reaction:'support'});await assert.rejects(()=>act('react',{goal_id:g.id,reaction:'free text'}));
 const payload=JSON.stringify({schemaVersion:1,goals:[],habits:[],checks:{}});
 await db.query('select public.rivaya_save(0,$1::jsonb)',[payload]);
 await as(A);assert.equal((await db.query('select * from public.rivaya_documents')).rows.length,0,'personal documents isolated');
 await as(B);await act('leave',{goal_id:g.id});assert.deepEqual(await act('list'),[]);
 await assert.rejects(()=>act('set_step',{goal_id:g.id,step_id:step.id,expected_revision:2,done:false}));
 await db.exec('reset role');await db.query('delete from auth.sessions where user_id=$1',[A]);await as(A);
 await assert.rejects(()=>act('list'));await assert.rejects(()=>db.query('select public.rivaya_save(0,$1::jsonb)',[payload]));
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[A]);assert.equal((await db.query('select * from public.rivaya_shared_goals')).rows.length,0,'owner deletion cascades');
 await db.close();console.log('PASS: RLS, membership, one-use invites, assignee-only completion, revision conflicts, direct-write denial, reactions, personal isolation, leave and revoked/deleted users');
})().catch(e=>{console.error(e);process.exitCode=1});
