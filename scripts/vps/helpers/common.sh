#!/bin/bash
set -euo pipefail

json_ok() {
  python3 - "$@" <<'PY'
import json,sys
print(json.dumps({"ok": True, "data": json.loads(sys.argv[1]) if len(sys.argv)>1 and sys.argv[1] else {}}, separators=(",", ":")))
PY
}

json_err() {
  python3 -c 'import json,sys; print(json.dumps({"ok": False, "error": sys.argv[1]}, separators=(",", ":")))' "$1"
}

read_json() {
  python3 - <<'PY'
import json,sys
raw=sys.stdin.read().strip()
print(raw if raw else "{}")
PY
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    json_err "root required"
    exit 1
  fi
}

backup_path() {
  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  echo "/root/wgcontrol-backups/${ts}"
}
