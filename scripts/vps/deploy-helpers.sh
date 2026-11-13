#!/bin/bash
# Deploy wgcontrol helpers to a remote host via SSH.
# Usage: ./deploy-helpers.sh user@host
set -euo pipefail
TARGET="${1:?target required}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

ssh "$TARGET" 'mkdir -p /usr/local/lib/wgcontrol /etc/systemd/system /var/lib/wg-monitor /var/log/wgcontrol /var/lib/wgcontrol'
scp "$ROOT"/helpers/wg-status \
  "$ROOT"/helpers/vps-health \
  "$ROOT"/helpers/wg-monitor-collect \
  "$ROOT"/helpers/wg-init \
  "$ROOT"/helpers/wg-purge \
  "$ROOT"/helpers/wg-peer-add \
  "$ROOT"/helpers/wg-peer-revoke \
  "$ROOT"/helpers/wg-peer-config \
  "$ROOT"/helpers/wg-peer-dns-sync \
  "$ROOT"/helpers/wg-peer-pause \
  "$ROOT"/helpers/wg-peer-unpause \
  "$ROOT"/helpers/wg-peer-policy-sync \
  "$ROOT"/helpers/wg-peer-policy-enforce \
  "$ROOT"/helpers/wg-peer-quota-status \
  "$ROOT"/helpers/dns-log-tail \
  "$ROOT"/helpers/dns-setup \
  "$TARGET":/usr/local/lib/wgcontrol/
ssh "$TARGET" 'chmod 755 /usr/local/lib/wgcontrol/*'
scp "$ROOT"/systemd/wg-monitor.service "$ROOT"/systemd/wg-monitor.timer \
  "$ROOT"/systemd/wg-peer-policy.service "$ROOT"/systemd/wg-peer-policy.timer \
  "$TARGET":/etc/systemd/system/
ssh "$TARGET" 'systemctl daemon-reload && systemctl enable --now wg-monitor.timer wg-peer-policy.timer || true'
echo "Helpers deployed to $TARGET"
