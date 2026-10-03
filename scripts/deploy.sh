#!/usr/bin/env bash
# Builds web/ and lays the static export at the repository root, which is what
# GitHub Pages serves. Run from anywhere; commit the result.
#
#   ./scripts/deploy.sh
#
# The site lives at https://almailgroup.github.io/Almail-AI/, so the export is
# built with that basePath. Serving it from a different path means rebuilding
# with NEXT_PUBLIC_BASE_PATH set to that path (empty for a domain root).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_PATH="${NEXT_PUBLIC_BASE_PATH-/Almail-AI}"

cd "$ROOT/web"
npm run typecheck
NEXT_PUBLIC_BASE_PATH="$BASE_PATH" npx next build

# Stale hashed chunks would otherwise pile up forever; the export is the whole
# truth, so the old one goes first.
rm -rf "$ROOT/_next" "$ROOT/404" "$ROOT/404.html" "$ROOT/index.html" "$ROOT/index.txt"
cp -r "$ROOT/web/out/." "$ROOT/"

# Without this, Pages runs its Jekyll pass and silently drops every _next/*
# path, which serves a blank page with no error anywhere.
touch "$ROOT/.nojekyll"

echo "Export laid down at $ROOT (basePath '$BASE_PATH'). Commit and push."
