#!/usr/bin/env bash
# Creates the Apps Script project for the Gmail Add-on and pushes addon/ to it.
# Re-run safely: it only creates the project once, then always pushes.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .clasp.json ]; then
  echo "Logging in to Google (a browser window opens)..."
  npx clasp login
  npx clasp create --type standalone --title "Send as alias" --rootDir addon
  git checkout -- addon/appsscript.json
fi

npx clasp push -f
echo
echo "Pushed. Final manual step (Google offers no CLI for it):"
echo "  1. npm run addon:open"
echo "  2. Deploy > Test deployments > Install"
echo "  3. Reload Gmail, open the 'Send as alias' side panel > Settings"
