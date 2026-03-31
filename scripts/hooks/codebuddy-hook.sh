#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "codebuddy-hook: python3 is required" >&2
  exit 1
fi

# 注入 source，便于 Hub 侧路由到 CodeBuddy normalizer（stdin 可已含同名字段）
payload="$(
  python3 -c '
import json, sys
d = json.load(sys.stdin)
if "source" not in d:
    d["source"] = "codebuddy"
print(json.dumps(d))
'
)"

if [[ -z "${payload}" ]]; then
  echo "codebuddy-hook: empty payload" >&2
  exit 1
fi

exec node "./scripts/bridge/send-event.mjs" "$payload"
