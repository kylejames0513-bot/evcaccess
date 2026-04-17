#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web; locally the developer manages deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] installing npm dependencies..."
npm install --no-audit --no-fund --loglevel=error

echo "[session-start] done."
