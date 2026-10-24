-- Apply to a dedicated Supabase project, never MUBARAKA's database.
-- Auth and account deletion must be connected before enabling sign-in in the app.
begin;
create table public.rivaya_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload @> '{"schemaVersion":1}'),
  updated_at timestamptz not null default now()
);
alter table public.rivaya_documents enable row level security;
create policy own_document on public.rivaya_documents for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.rivaya_documents from anon, authenticated;
grant select on public.rivaya_documents to authenticated;

-- Compare-and-swap prevents stale devices overwriting newer cloud data.
-- Caller receives a conflict and must merge with the latest document before retry.
create function public.rivaya_save(expected_revision bigint, document jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); next_revision bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if expected_revision is null or expected_revision < 0 or document is null
     or not (document @> '{"schemaVersion":1}')
     or jsonb_typeof(document->'goals') is distinct from 'array'
     or jsonb_typeof(document->'habits') is distinct from 'array'
     or jsonb_typeof(document->'checks') is distinct from 'object'
     or octet_length(document::text) > 4194304
     or exists(select 1 from jsonb_object_keys(document) k where k not in
       ('schemaVersion','goals','habits','checks','goalSnapshots','profile','preferences')) then
    raise exception 'Invalid sync document' using errcode='22023';
  end if;
  if expected_revision = 0 then
    insert into public.rivaya_documents(user_id,payload) values(actor,document)
      on conflict do nothing returning revision into next_revision;
  else
    update public.rivaya_documents set payload=document,revision=revision+1,updated_at=now()
      where user_id=actor and revision=expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'Revision conflict' using errcode='40001'; end if;
  return next_revision;
end; $$;
revoke all on function public.rivaya_save(bigint,jsonb) from public,anon;
grant execute on function public.rivaya_save(bigint,jsonb) to authenticated;
commit;
