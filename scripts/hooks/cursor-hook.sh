#!/usr/bin/env bash
set -euo pipefail

# DevPilot 项目根（本脚本位于 scripts/hooks/）
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# 从 stdin 读一行 JSON，规范化后交给 bridge（兼容无换行、多余空白）
if ! command -v python3 >/dev/null 2>&1; then
  echo "cursor-hook: python3 is required" >&2
  exit 1
fi

payload="$(
  python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)))'
)"

if [[ -z "${payload}" ]]; then
  echo "cursor-hook: empty payload" >&2
  exit 1
fi

exec node "./scripts/bridge/send-event.mjs" "$payload"
