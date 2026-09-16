#!/usr/bin/env bash
# Rebuild the local Super Productivity build and reinstall it into /Applications.
# Personal file: lives on features/tiliakoos only, never in a PR diff.
set -euo pipefail

cd "$(dirname "$0")/.."

# activate the pinned node (.nvmrc -> v22.18.0); nvm misbehaves under `set -u`
set +u
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
nvm use >/dev/null 2>&1 || true
set -u

APP=".tmp/app-builds/mac-arm64/Super Productivity.app"

npm run build
npx electron-builder --mac dir --arm64 -c.mac.identity=null -c.mac.notarize=false
codesign --force --deep --sign - "$APP"

osascript -e 'quit app "Super Productivity"' 2>/dev/null || true
rm -rf "/Applications/Super Productivity.app"
cp -R "$APP" /Applications/
open "/Applications/Super Productivity.app"

echo "installed $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "/Applications/Super Productivity.app/Contents/Info.plist") from \
$(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
