#!/bin/bash
set -euo pipefail
# Prefer the runner's default. Fall back to a stable installed Xcode >= 26.
major=$(xcodebuild -version | awk '/Xcode/{split($2,v,".");print v[1]}')
if [ "$major" -lt 26 ]; then
  for app in /Applications/Xcode*.app; do
    [[ "$app" == *beta* || "$app" == *Beta* ]] && continue
    version=$(DEVELOPER_DIR="$app/Contents/Developer" xcodebuild -version | awk '/Xcode/{split($2,v,".");print v[1]}')
    if [ "$version" -ge 26 ]; then sudo xcode-select -s "$app/Contents/Developer"; break; fi
  done
fi
xcodebuild -version
major=$(xcodebuild -version | awk '/Xcode/{split($2,v,".");print v[1]}')
[ "$major" -ge 26 ] || { echo 'Xcode 26+ is required for App Store uploads'; exit 1; }
