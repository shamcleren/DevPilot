#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "cursor-agent-hook: python3 is required" >&2
  exit 1
fi

EVENT_NAME="${1:-}"
if [[ -z "${EVENT_NAME}" ]]; then
  echo "cursor-agent-hook: missing event name argument" >&2
  exit 1
fi

payload="$(
  python3 -c '
import json
import os
import sys

event_name = sys.argv[1]
raw = json.load(sys.stdin)
session_id = raw.get("session_id")

if not isinstance(session_id, str) or not session_id.strip():
    raise SystemExit("cursor-agent-hook: session_id is required")

status = "running"
task = None

if event_name == "sessionStart":
    composer_mode = raw.get("composer_mode")
    if isinstance(composer_mode, str) and composer_mode.strip():
        task = composer_mode.strip()
elif event_name == "stop":
    stop_status = raw.get("status")
    if stop_status == "completed":
        status = "completed"
    elif stop_status == "error":
        status = "error"
    else:
        status = "offline"
    if isinstance(stop_status, str) and stop_status.strip():
        task = stop_status.strip()
else:
    raise SystemExit(f"cursor-agent-hook: unsupported event {event_name!r}")

payload = {
    "hook_event_name": "StatusChange",
    "session_id": session_id.strip(),
    "status": status,
}

if task:
    payload["task"] = task

cwd = os.environ.get("CURSOR_PROJECT_DIR")
if isinstance(cwd, str) and cwd.strip():
    payload["cwd"] = cwd.strip()

print(json.dumps(payload))
' "${EVENT_NAME}"
)"

if [[ -z "${payload}" ]]; then
  echo "cursor-agent-hook: empty payload" >&2
  exit 1
fi

exec node "./scripts/bridge/send-event.mjs" "$payload"
