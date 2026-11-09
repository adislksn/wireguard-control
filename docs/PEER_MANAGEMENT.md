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

## Revoke

1. Confirm in UI.
2. Match **both** name and public key.
3. `wg set peer <key> remove` then delete only that marker block.
4. Mark local peer `is_active=false` and write audit (no private keys).

## Metadata

Human-readable names live in local SQLite (`peers.device_name`), keyed by public key — not inside WireGuard private material.
