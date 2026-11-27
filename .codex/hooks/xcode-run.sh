#!/bin/bash
# Cursor "stop" hook: builds & launches Electron via `npm run dev` when the
# user ended their prompt with "build and run" (see check-build-run.sh).

input=$(cat)
generation_id=$(echo "$input" | jq -r '.generation_id // empty')
status=$(echo "$input" | jq -r '.status // empty')
flag_file=".cursor/.xcode-build-run-pending"

if [[ "$status" != "completed" ]]; then
  exit 0
fi

if [[ ! -f "$flag_file" ]]; then
  exit 0
fi

pending_id=$(cat "$flag_file" 2>/dev/null || true)
rm -f "$flag_file"

if [[ "$pending_id" != "$generation_id" ]]; then
  exit 0
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root" || exit 0

log_file=".cursor/.last-build-run.log"
{
  echo "=== grabbit-desktop electron build & run $(date) ==="
  npm run dev
} >"$log_file" 2>&1 &

exit 0
