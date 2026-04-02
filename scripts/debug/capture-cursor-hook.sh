#!/bin/zsh
set -euo pipefail

payload="$(cat)"
log_dir="/tmp/codepal-cursor-hook-captures"
mkdir -p "$log_dir"

timestamp="$(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
)"

capture_path="$log_dir/$timestamp.json"
printf '%s\n' "$payload" > "$capture_path"
printf '%s\n' "$payload" >> "$log_dir/all.ndjson"

printf '%s' "$payload" | "/Applications/CodePal.app/Contents/MacOS/CodePal" --codepal-hook cursor
