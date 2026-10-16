# RIVAYA 4.0.2 iOS — offline first release candidate source

Reuses the existing assets in ../app/src/main/assets. No account or cloud sync is
exposed in the first release. The cloud foundation remains dormant for a later update.
Team M2329MH9ZX; bundle app.rivaya.smart01; App Store Connect 6823716293.

Implemented: persistent WKWebView, safe areas, native confirmation, read-only
HealthKit steps, PHPicker avatar, Files import/export, local notifications with
quiet-time filtering in shared JS, local privacy screen, app icon and privacy manifest.
Daily/weekday reminders repeat. Habits with an end date use finite dated requests.
At most 60 requests are queued, prioritizing nearest fires; if capacity is exceeded,
the UI explicitly asks users to open daily to renew. OS delivery and permissions
must still be checked on a physical device. HealthKit empty reads are not treated
as proof of permission denial.

## Compile

`python3 scripts/prepare-resources.py && xcodegen generate`
Use Xcode 26+ and iOS 26+ SDK. ios-preview.yml builds an unsigned simulator app.
AppIcon.png is decoded from a committed base64 representation; it is the existing
Android vector logo rendered at 1024x1024 with opaque background, not a new brand.

## Signed App Store Connect upload

Workflow .github/workflows/ios-appstore.yml runs manually. It does not submit review.
Configure the GitHub environment `app-store` and its secrets:
- APPLE_CERTIFICATE_P12_BASE64: Apple Distribution certificate WITH private key, base64.
- APPLE_CERTIFICATE_PASSWORD: its export password.
- APPLE_PROFILE_BASE64: App Store provisioning profile for app.rivaya.smart01,
  team M2329MH9ZX, with HealthKit enabled, base64.
- ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64: App Store Connect team API key
  with permission to upload builds. Keep the .p8 and private keys out of git/chat.

An ephemeral CI keychain imports existing signing credentials. No certificates
are revoked or created automatically. Secrets are not uploaded as workflow artifacts.
The build number is the upload workflow run number; bump it above the last uploaded
number if another pipeline has already uploaded this marketing version.
The workflow must exist on the repository default branch to appear in Actions UI;
merge the reviewed PRs in order before using workflow_dispatch.

## Remaining external release gates

Signing credentials are not configured yet. No signed IPA or TestFlight installation
has been produced. Check the compile workflow result after each source change.
Publish store/site on rivayaapp.com and verify privacy/support URLs. Use the text in
store/APP-STORE-RU.md. Complete real iPhone tests, real screenshots and Apple metadata
before review submission. An API upload alone does not publish the app.
