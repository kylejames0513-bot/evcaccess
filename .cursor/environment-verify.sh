#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "training-hub" ]; then
  echo "[environment-verify] training-hub directory not found."
  exit 1
fi

cd "training-hub"

echo "[environment-verify] Running tests..."
npm test

echo "[environment-verify] Running typecheck..."
npm run typecheck

echo "[environment-verify] Running lint..."
npm run lint

echo "[environment-verify] Environment validation complete."
