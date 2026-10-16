# RIVAYA 4 iOS bootstrap

Uses the SAME assets in ../app/src/main/assets; no copied/recreated UI.
Apple team M2329MH9ZX, bundle app.rivaya.smart01, App Store Connect 6823716293.

Generate using XcodeGen: `xcodegen generate`. The workflow builds an unsigned
simulator app on macOS. This is not an installable IPA or a release candidate.
The host uses persistent WKWebView storage, safe areas, native confirmation
for destructive actions, restricted navigation and real HealthKit aggregation.
Health read authorization cannot be inferred from Apple's authorizationStatus.
An empty query is treated as unknown, not proof of permission.

Release blockers still to implement/test:
- Native local reminders, rescheduling and delivery tests on iPhone.
- App icon catalog from existing logo, launch appearance, native file backup
  import/export if retained, photo picker and all main flows on a real iPhone.
- Accurate HealthKit empty/denied UI (currently generic access prompt).
- Auth, secure sessions and cloud transport from ../cloud/README.md.
- Enable HealthKit in the registered App ID; configure distribution signing
  via CI secrets. Never commit .p8, .p12, passwords or provisioning secrets.
- Signed archive upload, TestFlight acceptance and physical-device testing.
- Privacy/support pages and App Store metadata matching actual data handling.

App Store's initial 1.0 draft is not a rollback of RIVAYA 4. Set its marketing
version to match the final iOS archive before submission.
