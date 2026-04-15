#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "training-hub" ]; then
  echo "[environment-bootstrap] training-hub directory not found; skipping dependency bootstrap."
  exit 0
fi

echo "[environment-bootstrap] Installing training-hub dependencies (npm ci)..."
(
  cd "training-hub"
  npm ci
)

echo "[environment-bootstrap] Dependency bootstrap complete."
