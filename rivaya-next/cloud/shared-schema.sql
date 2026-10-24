-- Deployed to RIVAYA uerhkthubarwrikjtxul as 20261024191758.
-- Source snapshot, not an idempotent migration. Do not reapply to the live project.
begin;
create schema if not exists rivaya_private;
revoke all on schema rivaya_private from public,anon;
grant usage on schema rivaya_private to authenticated;

create table public.rivaya_shared_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(title) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.rivaya_members (
  goal_id uuid not null references public.rivaya_shared_goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(length(display_name) between 1 and 60),
  primary key(goal_id,user_id)
);
create index rivaya_shared_goals_owner on public.rivaya_shared_goals(owner_id);
create index rivaya_members_user_goal on public.rivaya_members(user_id,goal_id);
create table public.rivaya_shared_steps (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.rivaya_shared_goals(id) on delete cascade,
  title text not null check(length(title) between 1 and 200),
  assigned_to uuid references auth.users(id) on delete set null,
  done boolean not null default false,
  deadline date,
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now()
);
create index rivaya_shared_steps_goal on public.rivaya_shared_steps(goal_id,created_at);
create index rivaya_shared_steps_assignee on public.rivaya_shared_steps(assigned_to);
create table rivaya_private.invites (
  token_hash bytea primary key,
  goal_id uuid not null references public.rivaya_shared_goals(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '7 days',
  used_by uuid references auth.users(id) on delete set null,
  consumed boolean not null default false
);
create table public.rivaya_shared_activity (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.rivaya_shared_goals(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('joined','step_added','step_updated','step_completed','step_reopened','support','great','keepgoing')),
  created_at timestamptz not null default now()
);
create index rivaya_invites_goal on rivaya_private.invites(goal_id);
create index rivaya_invites_user on rivaya_private.invites(used_by);
create index rivaya_shared_activity_goal on public.rivaya_shared_activity(goal_id,created_at desc);
create index rivaya_shared_activity_user on public.rivaya_shared_activity(user_id,created_at desc);
alter table public.rivaya_shared_goals enable row level security;
alter table public.rivaya_members enable row level security;
alter table public.rivaya_shared_steps enable row level security;
alter table public.rivaya_shared_activity enable row level security;
alter table rivaya_private.invites enable row level security;

create function rivaya_private.actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sid uuid;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor) then raise exception 'Authentication required' using errcode='42501'; end if;
  sid:=nullif(auth.jwt()->>'session_id','')::uuid;
  if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=actor) then raise exception 'Session revoked' using errcode='42501'; end if;
  return actor;
end $$;
create function rivaya_private.goal_ids() returns setof uuid language sql stable security definer set search_path='' as $$
  select goal_id from public.rivaya_members where user_id=(select rivaya_private.actor());
$$;
revoke all on function rivaya_private.actor() from public,anon;
revoke all on function rivaya_private.goal_ids() from public,anon;
grant execute on function rivaya_private.actor(),rivaya_private.goal_ids() to authenticated;
create function public.rivaya_session_check() returns uuid language sql security invoker set search_path='' as $$select rivaya_private.actor()$$;
revoke all on function public.rivaya_session_check() from public,anon;
grant execute on function public.rivaya_session_check() to authenticated;
alter policy own_document on public.rivaya_documents using((select rivaya_private.actor())=user_id);
create function rivaya_private.save_document(expected_revision bigint,document jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare actor uuid:=rivaya_private.actor(); next_revision bigint;
begin
  if expected_revision is null or expected_revision<0 or document is null or not(document @> '{"schemaVersion":1}')
     or jsonb_typeof(document->'goals') is distinct from 'array' or jsonb_typeof(document->'habits') is distinct from 'array'
     or jsonb_typeof(document->'checks') is distinct from 'object' or octet_length(document::text)>4194304
     or exists(select 1 from jsonb_object_keys(document) k where k not in ('schemaVersion','goals','habits','checks','goalSnapshots','profile','preferences'))
  then raise exception 'Invalid sync document' using errcode='22023'; end if;
  if expected_revision=0 then
    insert into public.rivaya_documents(user_id,payload) values(actor,document) on conflict do nothing returning revision into next_revision;
  else
    update public.rivaya_documents set payload=document,revision=revision+1,updated_at=now() where user_id=actor and revision=expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'Revision conflict' using errcode='40001'; end if;
  return next_revision;
end $$;
revoke all on function rivaya_private.save_document(bigint,jsonb) from public,anon;
grant execute on function rivaya_private.save_document(bigint,jsonb) to authenticated;
create or replace function public.rivaya_save(expected_revision bigint,document jsonb) returns bigint language sql security invoker set search_path='' as $$select rivaya_private.save_document(expected_revision,document)$$;
revoke all on function public.rivaya_save(bigint,jsonb) from public,anon;
grant execute on function public.rivaya_save(bigint,jsonb) to authenticated;
create policy member_goals on public.rivaya_shared_goals for select to authenticated using(id in(select rivaya_private.goal_ids()));
create policy member_names on public.rivaya_members for select to authenticated using(goal_id in(select rivaya_private.goal_ids()));
create policy member_steps on public.rivaya_shared_steps for select to authenticated using(goal_id in(select rivaya_private.goal_ids()));
create policy member_activity on public.rivaya_shared_activity for select to authenticated using(goal_id in(select rivaya_private.goal_ids()));
revoke all on public.rivaya_shared_goals,public.rivaya_members,public.rivaya_shared_steps,public.rivaya_shared_activity from public,anon,authenticated;
grant select on public.rivaya_shared_goals,public.rivaya_members,public.rivaya_shared_steps,public.rivaya_shared_activity to authenticated;
revoke all on rivaya_private.invites from public,anon,authenticated;

create function rivaya_private.shared_action(operation text,args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=rivaya_private.actor(); gid uuid; owner uuid; token text; title text; member_name text; step public.rivaya_shared_steps; assignee uuid; action_name text;
begin
  if jsonb_typeof(args) is distinct from 'object' or octet_length(args::text)>8192 then raise exception 'Invalid request' using errcode='22023'; end if;
  if operation='list' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'owner_id',g.owner_id,
      'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',m.display_name)),'[]'::jsonb) from public.rivaya_members m where m.goal_id=g.id),
      'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at),'[]'::jsonb) from public.rivaya_shared_steps s where s.goal_id=g.id),
      'activity',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select user_id,action,created_at from public.rivaya_shared_activity where goal_id=g.id order by created_at desc limit 20) a)))
      from public.rivaya_shared_goals g where exists(select 1 from public.rivaya_members m where m.goal_id=g.id and m.user_id=actor)),'[]'::jsonb);
  end if;
  if operation='create' then
    title:=btrim(args->>'title');member_name:=btrim(args->>'name');
    if title is null or length(title) not between 1 and 120 or member_name is null or length(member_name) not between 1 and 60 then raise exception 'Invalid title/name' using errcode='22023'; end if;
    if (select count(*) from public.rivaya_shared_goals where owner_id=actor)>=100 then raise exception 'Goal limit' using errcode='22023'; end if;
    insert into public.rivaya_shared_goals(owner_id,title) values(actor,title) returning id into gid;
    insert into public.rivaya_members(goal_id,user_id,display_name) values(gid,actor,member_name);
    return jsonb_build_object('id',gid);
  end if;
  if operation='join' then
    token:=args->>'token';member_name:=btrim(args->>'name');
    if token is null or token !~ '^[a-f0-9]{64}$' or member_name is null or length(member_name) not between 1 and 60 then raise exception 'Invalid invitation' using errcode='22023'; end if;
    select goal_id into gid from rivaya_private.invites where token_hash=sha256(convert_to(token,'UTF8')) and expires_at>now() and not consumed for update;
    if gid is null or exists(select 1 from public.rivaya_members where goal_id=gid and user_id=actor) then raise exception 'Invalid or used invitation' using errcode='22023'; end if;
    if (select count(*) from public.rivaya_members where goal_id=gid)>=20 then raise exception 'Member limit' using errcode='22023'; end if;
    insert into public.rivaya_members(goal_id,user_id,display_name) values(gid,actor,member_name);
    update rivaya_private.invites set consumed=true,used_by=actor where token_hash=sha256(convert_to(token,'UTF8'));
    insert into public.rivaya_shared_activity(goal_id,user_id,action) values(gid,actor,'joined');
    return jsonb_build_object('id',gid);
  end if;
  gid:=(args->>'goal_id')::uuid;
  select owner_id into owner from public.rivaya_shared_goals where id=gid;
  if owner is null or not exists(select 1 from public.rivaya_members where goal_id=gid and user_id=actor) then raise exception 'Not a member' using errcode='42501'; end if;
  if operation='invite' then
    if owner<>actor then raise exception 'Owner required' using errcode='42501'; end if;
    token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into rivaya_private.invites(token_hash,goal_id) values(sha256(convert_to(token,'UTF8')),gid);
    return jsonb_build_object('token',token,'expires_in_days',7);
  elsif operation='leave' then
    if owner=actor then raise exception 'Owner must delete the goal' using errcode='22023'; end if;
    update public.rivaya_shared_steps set assigned_to=null,revision=revision+1 where goal_id=gid and assigned_to=actor;
    delete from public.rivaya_members where goal_id=gid and user_id=actor;return '{}'::jsonb;
  elsif operation='delete' then
    if owner<>actor then raise exception 'Owner required' using errcode='42501'; end if;
    delete from public.rivaya_shared_goals where id=gid;return '{}'::jsonb;
  elsif operation='add_step' then
    if owner<>actor then raise exception 'Owner required' using errcode='42501'; end if;
    title:=btrim(args->>'title');assignee:=nullif(args->>'assigned_to','')::uuid;
    if title is null or length(title) not between 1 and 200 then raise exception 'Invalid step' using errcode='22023'; end if;
    if assignee is not null and not exists(select 1 from public.rivaya_members where goal_id=gid and user_id=assignee) then raise exception 'Assignee is not a member' using errcode='42501'; end if;
    if (select count(*) from public.rivaya_shared_steps where goal_id=gid)>=200 then raise exception 'Step limit' using errcode='22023'; end if;
    insert into public.rivaya_shared_steps(goal_id,title,assigned_to,deadline) values(gid,title,assignee,nullif(args->>'deadline','')::date);
    action_name:='step_added';
  elsif operation='set_step' then
    select * into step from public.rivaya_shared_steps where id=(args->>'step_id')::uuid and goal_id=gid for update;
    if step.id is null or step.assigned_to is distinct from actor then raise exception 'Assignee required' using errcode='42501'; end if;
    if step.revision is distinct from (args->>'expected_revision')::bigint then raise exception 'Revision conflict' using errcode='40001'; end if;
    if jsonb_typeof(args->'done') is distinct from 'boolean' then raise exception 'Invalid completion' using errcode='22023'; end if;
    update public.rivaya_shared_steps set done=(args->>'done')::boolean,revision=revision+1 where id=step.id;
    action_name:=case when (args->>'done')::boolean then 'step_completed' else 'step_reopened' end;
  elsif operation='react' then
    action_name:=args->>'reaction';
    if action_name is null or action_name not in ('support','great','keepgoing') then raise exception 'Invalid reaction' using errcode='22023'; end if;
    if (select count(*) from public.rivaya_shared_activity where user_id=actor and created_at>now()-interval '1 hour' and action in ('support','great','keepgoing'))>=20 then raise exception 'Reaction limit' using errcode='22023'; end if;
  else raise exception 'Unknown operation' using errcode='22023';
  end if;
  insert into public.rivaya_shared_activity(goal_id,user_id,action) values(gid,actor,action_name);
  return jsonb_build_object('id',gid);
end $$;
revoke all on function rivaya_private.shared_action(text,jsonb) from public,anon;
grant execute on function rivaya_private.shared_action(text,jsonb) to authenticated;
create function public.rivaya_shared(operation text,args jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$
  select rivaya_private.shared_action(operation,args);
$$;
revoke all on function public.rivaya_shared(text,jsonb) from public,anon;
grant execute on function public.rivaya_shared(text,jsonb) to authenticated;
commit;
