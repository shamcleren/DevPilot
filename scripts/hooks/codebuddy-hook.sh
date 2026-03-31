#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "codebuddy-hook: python3 is required" >&2
  exit 1
fi

# 注入稳定的 CodeBuddy 路由标识；若官方 payload 已带 source（如 SessionStart=startup），不能覆盖它
payload="$(
  python3 -c '
import json, sys
d = json.load(sys.stdin)
if "tool" not in d:
    d["tool"] = "codebuddy"
if "source" not in d:
    d["source"] = "codebuddy"
print(json.dumps(d))
'
)"

if [[ -z "${payload}" ]]; then
  echo "codebuddy-hook: empty payload" >&2
  exit 1
fi

exec node "./scripts/bridge/run-blocking-hook.mjs" "$payload"
