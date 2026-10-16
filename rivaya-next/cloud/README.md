# Account and sync foundation — not a live service

The existing `rivaya-public-v1` storage remains authoritative. `sync-core.js`
adds an atomic guest journal, a versioned allowlist, per-account namespaces,
three-way field/entity merge and explicit delete/edit conflicts. No network
requests, login form, tokens or simulated sync success are introduced.

`sync-transport.js` adds an opt-in REST transport with owner checks, cancellation
on session switches, request timeouts, explicit CAS/auth/network errors and an
upload field allowlist. It is not loaded by the app yet: the native secure session
provider and transactional workspace switching must be connected first. Tokens
are supplied per request and are never persisted by the transport. The session
coordinator must call `cancel()` before logout or switching accounts. Transport
tests use mock responses; they do not establish live RLS or delivery correctness.

The SQL migration targets a dedicated RIVAYA Supabase project. It provides RLS,
owner-only reads and a security-definer compare-and-swap write RPC; a caller
cannot choose someone else's user ID. The owner applied it through SQL Editor
on 2026-10-16; live two-user isolation tests remain pending. Never apply it to MUBARAKA.

Next integration gates:
1. Provision project in the owner's account; configure email OTP delivery,
   rate limits, supported regions and production backup/restore policy.
2. Implement native secure session storage (Keychain / Android Keystore),
   refresh/revocation and a server-side delete-account endpoint.
3. Explicit first-login guest import. If cloud data exists, merge from an empty
   base, surface conflicts, never overwrite silently. Account switching must
   save the old workspace, cancel in-flight requests and load a distinct one.
4. Pull revision, merge base/local/remote, stop on conflicts, CAS publish;
   retry revision conflicts and transient failures with backoff. Re-check
   current owner/session before applying responses. Persist edits during upload.
5. Apply and acknowledge cloud responses transactionally with a recovery copy.
6. Integration tests with two real users, offline devices, expired sessions,
   deletion, concurrent edits, quota limits and restore from server backup.

Only goals, habits, completion history, goal snapshots, name/avatar and step
TARGET are in this protocol. Health samples, permissions, device reminder
settings and billing entitlements are deliberately excluded. Health history
comes from the device's health provider and needs a separate consent design
before any cross-platform server transfer.

PRO entitlement must be verified server-side from store transactions, never
trusted from a profile field, imported JSON or this sync payload.
