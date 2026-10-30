#!/bin/bash
set -euo pipefail
umask 077
work="$(mktemp -d /tmp/rivaya-widget44.XXXXXX)"
keychain="$work/rivaya-widget.keychain-db"
password="$(openssl rand -hex 20)"
cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
export RIVAYA_TEMP_PASSWORD="$password"
python3 - "$work" <<'PY'
import base64,os,sys
w=sys.argv[1]
for env,name in [('APPLE_CERTIFICATE_P12_BASE64','distribution.p12'),('ASC_KEY_P8_BASE64','apple-key.p8')]:
  value=os.environ.get(env,'')
  if not value: raise SystemExit(f'Missing Apple signing secret: {env}')
  with open(os.path.join(w,name),'wb') as f:f.write(base64.b64decode(''.join(value.split()),validate=True))
PY
openssl pkcs12 -in "$work/distribution.p12" -out "$work/key.pem" -passin env:APPLE_CERTIFICATE_PASSWORD -passout env:RIVAYA_TEMP_PASSWORD
openssl pkcs12 -export -in "$work/key.pem" -out "$work/compatible.p12" -passin env:RIVAYA_TEMP_PASSWORD -passout env:RIVAYA_TEMP_PASSWORD -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
security create-keychain -p "$password" "$keychain" >/dev/null
security unlock-keychain -p "$password" "$keychain" >/dev/null
security set-keychain-settings -lut 3600 "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" /Users/runner/Library/Keychains/login.keychain-db >/dev/null
security import "$work/compatible.p12" -k "$keychain" -P "$password" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$keychain" >/dev/null
security find-identity -v -p codesigning "$keychain" | grep -F "Apple Distribution: Ismail Uzbaev (M2329MH9ZX)" >/dev/null || { echo "Existing Apple Distribution identity unavailable"; exit 1; }
xcodegen generate
echo "Attempting automatic provisioning of App Group and WidgetKit via Xcode."
xcodebuild -project Rivaya.xcodeproj -scheme Rivaya -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$work/Rivaya.xcarchive" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$work/apple-key.p8" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  DEVELOPMENT_TEAM=M2329MH9ZX REGISTER_APP_GROUPS=YES CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION="$RIVAYA_BUILD_NUMBER" archive > "$work/archive.log" 2>&1 || {
    grep -iE 'error:|provisioning|profile|group|signature|signing|No Accounts' "$work/archive.log" | tail -35 || true
    exit 1
  }
cat > "$work/export.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>signingStyle</key><string>automatic</string>
<key>teamID</key><string>M2329MH9ZX</string>
<key>destination</key><string>export</string>
<key>stripSwiftSymbols</key><true/>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$work/Rivaya.xcarchive" \
  -exportOptionsPlist "$work/export.plist" -exportPath build/widget-store \
  -allowProvisioningUpdates -authenticationKeyPath "$work/apple-key.p8" \
  -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  > "$work/export.log" 2>&1 || {
    grep -iE 'error:|provisioning|profile|group|signature|signing' "$work/export.log" | tail -35 || true
    exit 1
  }
test -f build/widget-store/Rivaya.ipa || { echo "No IPA exported"; ls -1 build/widget-store; exit 1; }
test -d "$work/Rivaya.xcarchive/Products/Applications/Rivaya.app/PlugIns/RivayaWidgets.appex" || { echo "WidgetKit extension not embedded in signed archive";exit 1; }
echo "SIGNED RIVAYA 4.4 WITH WIDGETKIT: PASS"
