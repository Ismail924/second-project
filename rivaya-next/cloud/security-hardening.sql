-- Source of deployed migration 20261024191811, RIVAYA project only.
-- Keep automatic RLS enforcement; remove unnecessary API execution grants.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
