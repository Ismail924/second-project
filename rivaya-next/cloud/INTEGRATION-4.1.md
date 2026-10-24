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

- Native iOS Sign in with Apple, optional email accounts on other platforms, explicit guest import, separate workspaces, journaled
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
2. Test real native Apple sign-in, accepted bundle audience, cancellation, private relay and
   real authenticated deletion. Apple credential revocation is implemented in apple-revoke.mjs but requires a dedicated
   Sign in with Apple key in server secrets and live verification before App Store release.
   Email confirmation/recovery delivery remains a gate only for platforms exposing email auth.
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

## Native Apple sign-in implementation

AppleSignIn.swift uses AuthenticationServices with a cryptographically random raw
nonce, SHA-256 request nonce and state validation. Only the identity token and raw
nonce cross the local main-frame bridge for Supabase's id_token exchange. The
server user is verified before switching workspace. Tokens remain in Keychain;
Apple proof is never persisted. Cancellation does not alter the current workspace.
The iOS entry screen has Continue with Apple, optional guest import enabled by
default, and Continue without signing in. It has no email/password fields.
Original guest data remains independent. Android email code remains unchanged.

Verified live read-only: Apple APPLE_ID_AUTH is enabled as a primary capability
for app.rivaya.smart01; the Supabase public settings report external.apple=true.
This does not prove successful real-device login or correct token audience.
Signing now requires applesignin Default in the distribution profile.
backend-config.js enabled and appleEnabled remain false until the live gates pass.
The Supabase connector cannot read/update Auth provider configuration; the
Dashboard requires a separate login in the current cloud browser. Do not ask for
passwords in chat or turn off nonce validation to work around a configuration error.

Automated tests use synthetic Apple credentials and verify exchange body, account
isolation, guest preservation, cancellation, concurrent attempts, stale callbacks,
timeouts, and restoring the same cloud data to an independent client fixture.
They do not simulate Apple verification, real email delivery or physical phones.

Apple deletion now requests a fresh native authorization code. Server-side code
exchanges it directly with Apple using a five-minute ES256 client secret, checks
the Apple subject against the authenticated Supabase identity, revokes the token,
then revokes Supabase sessions and deletes the account. All Apple code/token
values are transient. Missing keys, rejected/used codes and identity mismatches
fail before Supabase deletion. The App Store Connect upload key is not an Apple
Sign in signing key and must not be reused.
Required server secrets: APPLE_SIGN_IN_CLIENT_ID=app.rivaya.smart01,
APPLE_SIGN_IN_TEAM_ID=M2329MH9ZX, APPLE_SIGN_IN_KEY_ID,
APPLE_SIGN_IN_PRIVATE_KEY (a dedicated SIWA PKCS#8 private key).
Do not expose them in this repository, the app or chat.

Deployment of the Apple-aware deletion handler was blocked by automatic approval
review: replacing the live destructive endpoint needs specific user confirmation.
The running version 1 endpoint has NOT changed. Prepared version is source-only.
Do not work around this block through the CLI, SQL or another deployment route.
