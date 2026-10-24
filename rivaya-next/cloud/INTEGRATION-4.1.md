# RIVAYA 4.1 integration status

Prepared code is on `feature/rivaya-4.1`; `backend-config.js` remains disabled.
Target project: `uerhkthubarwrikjtxul`. No production schema or function changes
have been deployed. Do not apply this source to another application/project.

## Implemented

- Optional email accounts, explicit guest import, separate workspaces, journaled
  CAS sync, conflict choices, refresh, logout and deletion UI.
- Native Keychain / encrypted Keystore sessions; no tokens in localStorage.
- Fixed-host native HTTPS transport, no redirects, external links outside the
  privileged WebView. Workspace writes roll back on storage failure.
- Shared-goal UI, single-use seven-day invites, assigned tasks, support/activity.
- `shared-schema.sql`: additive schema draft with private definer functions,
  member-only reads, assignee-only completion and live auth-session validation.
- `delete-account.ts`: server-only endpoint verifies user/session, revokes
  sessions, then deletes the auth user and cascading data. Service-role keys
  belong only in the server environment.

Local state, sync, account isolation, conflict, quota rollback and native-fetch
tests pass. PGlite runs actual SQL under authenticated roles: two members and
an outsider, RLS, invitation reuse, assignment, revision conflicts, direct-write
denial, leaving and revoked/deleted users. These are not live Supabase tests.

## Before enabling or submitting

1. Obtain authenticated project tools. Plugin installation is confirmed, but
   project/SQL/deployment tools were not exposed in this agent session.
2. Inspect the real schema and Auth settings. Iterate the additive draft,
   run security/performance advisors and generate/verify the final migration
   history with the current Supabase CLI. The owner reportedly applied the
   original `001_sync.sql` on 2026-10-16; verify before changing it.
3. Deploy/test deletion. Verify confirmation/recovery delivery, including Yandex,
   rate limits, expired codes and password policy. Require email confirmation.
4. Test two accounts/devices, offline edits, restarts, concurrent changes, token
   expiry, logout during requests, deletion and the full invitation lifecycle.
5. Inspect current browser/Android/iOS CI and real-device notifications. Update
   published privacy, App Store privacy answers, RU/EN listing and screenshots.
6. Enable the backend only after those checks; upload one complete 4.1 test
   build before the single agreed App Store submission.

Only goals, habits, completion history, goal snapshots, name/avatar and the step
target enter personal sync. Health samples, permissions and device reminder
settings are excluded. Shared goals expose only explicitly shared content and
participant names/assignments/activity. Verify PRO entitlement server-side;
never trust an imported profile. No PRO feature is added by this change.
