# Peer management

Peers use Nyr-compatible markers in `/etc/wireguard/wg0.conf`:

```
# BEGIN_PEER <name>
[Peer]
PublicKey = ...
PresharedKey = ...
AllowedIPs = 10.7.0.x/32
# END_PEER <name>
```

## Add

1. Generate client keys + PSK on VPS helper.
2. Allocate unused IP (skip server IP and existing AllowedIPs).
3. Append marker block; `wg set` live (no full restart).
4. Return client config once (DNS = server VPN IP).

## Pause vs revoke

**Pause** (temporary):

1. `wg set peer <key> remove` from the live interface.
2. Stash the Nyr conf block under `/var/lib/wgcontrol/paused/` and remove it from `wg0.conf`.
3. Keep stored client `.conf` and the SQLite peer row.
4. Reasons: `manual`, `quiet_hours`, `expired`, `quota`.

**Unpause** restores the stashed conf block and re-adds the peer with PSK + AllowedIPs.

**Revoke** (permanent):

1. Confirm in UI.
2. Match **both** name and public key.
3. `wg set peer <key> remove` then delete only that marker block.
4. Delete stored client conf; mark local peer `is_active=false`.

## Quiet hours / expire / quota (VPS-enforced)

Policies sync to `/var/lib/wgcontrol/peer-policies.json`.  
`wg-peer-policy.timer` runs `wg-peer-policy-enforce` every minute on the VPS, so rules apply even when the local dashboard is closed.

- **Quiet hours:** pause during the configured window (days + start/end + timezone).
- **Expire:** when `expiresAt` is past, auto-pause with reason `expired`.
- **Daily quota:** track usage from `wg show dump` baselines under `/var/lib/wgcontrol/quota/`. Soft-warn at `quotaWarnPercent` (default 80%) in the UI; hard-pause at 100% until the next local day.

After changing policy in the UI, the dashboard redeploys helpers if needed and runs policy sync + one enforce pass.

## Online badge

Handshake age &lt; 180 seconds → **online**; otherwise **offline**.  
Paused / expired / revoked override the badge.

## Clear domain history

1. Open the peer detail page → **Clear history**.
2. Confirm. Deletes local `dns_queries` rows for that peer (by `peer_id` and matching VPN IP).
3. Does not change WireGuard, client configs, or remote dnsmasq logs.

## Metadata

Human-readable names live in local SQLite (`peers.device_name`), keyed by public key, not inside WireGuard private material.
