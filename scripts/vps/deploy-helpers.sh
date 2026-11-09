#!/bin/bash
# Deploy wgcontrol helpers to a remote host via SSH.
# Usage: ./deploy-helpers.sh user@host
set -euo pipefail
TARGET="${1:?target required}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

ssh "$TARGET" 'mkdir -p /usr/local/lib/wgcontrol /etc/systemd/system /var/lib/wg-monitor /var/log/wgcontrol'
scp "$ROOT"/helpers/wg-status \
  "$ROOT"/helpers/vps-health \
  "$ROOT"/helpers/wg-monitor-collect \
  "$ROOT"/helpers/wg-init \
  "$ROOT"/helpers/wg-purge \
  "$ROOT"/helpers/wg-peer-add \
  "$ROOT"/helpers/wg-peer-revoke \
  "$ROOT"/helpers/wg-peer-config \
  "$ROOT"/helpers/wg-peer-dns-sync \
  "$ROOT"/helpers/dns-log-tail \
  "$ROOT"/helpers/dns-setup \
  "$TARGET":/usr/local/lib/wgcontrol/
ssh "$TARGET" 'chmod 755 /usr/local/lib/wgcontrol/*'
scp "$ROOT"/systemd/wg-monitor.service "$ROOT"/systemd/wg-monitor.timer "$TARGET":/etc/systemd/system/
ssh "$TARGET" 'systemctl daemon-reload && systemctl enable --now wg-monitor.timer || true'
echo "Helpers deployed to $TARGET"
