# VPS setup

## Prerequisites

- Ubuntu (tested with 26.04)
- SSH access (password bootstrap once, then key)
- UFW allowed for SSH

## From the dashboard

1. Settings → Add VPS (host, user, optional bootstrap password).
2. Test SSH.
3. Activate the VPS.
4. **Init WG** (installs WireGuard Nyr-compatible config, UFW UDP allow, dnsmasq on VPN IP only, monitor timer).
5. Add peers from the Peers page.

## Manual helper deploy

```bash
./scripts/vps/deploy-helpers.sh wg-vps
```

## Rollback

- Init/purge create backups under `/root/wgcontrol-backups/<timestamp>/`.
- Restore `wg0.conf` from backup and `systemctl restart wg-quick@wg0`.
- Purge removes WG/dnsmasq wgcontrol bits but leaves SSH/UFW base policy.

## Safety

- Do not re-run interactive Nyr installer after dashboard init.
- Do not expose port 53 publicly.
- Ask before production peer revoke / purge if unsure.
