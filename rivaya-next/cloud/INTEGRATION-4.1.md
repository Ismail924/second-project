# RIVAYA 4.1 integration status

Prepared code is on `feature/rivaya-4.1`; `backend-config.js` remains disabled.
Target project: `uerhkthubarwrikjtxul`. Authenticated plugin access is working.
The paused project was resumed and reached ACTIVE_HEALTHY on October 24.
Do not apply this source to another application/project.

## Live verification, October 24

- Inspected the existing document schema/policy/function before changing it.
  The cloud document table was empty; one existing auth user was preserved.
- Applied `20261024191758` (shared goals/session security) and
  `20261024191811` (revoke public execution of the RLS event-trigger function).
- Deployed `delete-account` version 1. The handler independently validates the
  bearer with Auth and the live database session; platform legacy JWT checking
  is disabled to permit current signing keys. Missing/invalid bearer tests
  both returned 401. Real authenticated deletion remains to be tested.
- Live PostgreSQL transaction tests passed: separate personal/shared access,
  nonmember denial, invitation join, assignee-only completion, missing revision
  rejection, direct-write denial and nonexistent-session rejection. Synthetic
  users, sessions and goals were rolled back; counts remained 1 user, 0 documents,
  0 shared goals. The existing user's data was not modified.
- Security advisors show no remaining public definer-function warnings.
  Private invitations deliberately have RLS with no direct-access policies.
  Leaked-password checking is still disabled in Auth; review configuration
  before enabling accounts. Fresh indexes are understandably reported unused.

## Implemented

- Optional email accounts, explicit guest import, separate workspaces, journaled
  CAS sync, conflict choices, refresh, logout and deletion UI.
- Native Keychain / encrypted Keystore sessions; no tokens in localStorage.
- Fixed-host native HTTPS transport, no redirects, external links outside the
  privileged WebView. Workspace writes roll back on storage failure.
- Shared-goal UI, single-use seven-day invites, assigned tasks, support/activity.
- `shared-schema.sql`: deployed source snapshot with private definer functions,
  member-only reads, assignee-only completion and live auth-session validation.
- `delete-account.ts`: server-only endpoint verifies user/session, revokes
  sessions, then deletes the auth user and cascading data. Service-role keys
  belong only in the server environment.

Local state, sync, account isolation, conflict, quota rollback and native-fetch
tests pass. PGlite runs actual SQL under authenticated roles: two members and
an outsider, RLS, invitation reuse, assignment, revision conflicts, direct-write
denial, leaving and revoked/deleted users. These are not live Supabase tests.

The separate live transaction check is saved in `live-isolation-check.sql`.
The latest implementation checkpoint passed all three CI workflows: browser
including gated account login/shared list/logout, Android instrumentation and
iOS simulator compilation/goal persistence.

Advisor references: [private RLS with no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
is intentional deny-by-default for invites;
[leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
needs configuration review before enabling accounts.

Public Auth settings verified: email enabled, confirmation required, anonymous
sign-in disabled. The publishable key matches the app configuration. Anonymous
REST reads and shared RPC calls both return 401. Email delivery, recovery
templates/code display and authenticated account deletion are still unverified.

## Before enabling or submitting

1. Verify full Auth configuration and final migration-source history.
2. Test authenticated deletion. Verify confirmation/recovery delivery, including Yandex,
   rate limits, expired codes and password policy. Require email confirmation.
3. Test two accounts/devices, offline edits, restarts, concurrent changes, token
   expiry, logout during requests, deletion and the full invitation lifecycle.
4. Inspect current browser/Android/iOS CI and real-device notifications. Update
   published privacy, App Store privacy answers, RU/EN listing and screenshots.
5. Enable the backend only after those checks; upload one complete 4.1 test
   build before the single agreed App Store submission.

Only goals, habits, completion history, goal snapshots, name/avatar and the step
target enter personal sync. Health samples, permissions and device reminder
settings are excluded. Shared goals expose only explicitly shared content and
participant names/assignments/activity. Verify PRO entitlement server-side;
never trust an imported profile. No PRO feature is added by this change.
