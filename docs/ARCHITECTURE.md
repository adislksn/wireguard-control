# Architecture

**wgcontrol** (wireguard-control) is a **localhost-only** Nuxt dashboard. The VPS stays lightweight.

## Components

- **Nuxt UI + Nitro**: dashboard, session auth, Zod-validated APIs
- **Drizzle ORM + SQLite (`@libsql/client`)**: peers, snapshots, DNS history, VPS profiles, audit logs
- **SSH (`ssh2`)**: typed helper invocations to the active VPS (no arbitrary shell API)
- **VPS helpers** (`/usr/local/lib/wgcontrol/*`): status, monitor, init, purge, peer add/revoke, DNS setup/tail
- **Collectors**: local timers pull peer stats (60s), DNS logs (30s incremental), health (5m)

## Multi-VPS

Each host is a `vps_hosts` row. Exactly one may be `is_active`. Historical data is scoped by `vps_id`.

## Trust boundary

```
Browser (localhost) → Nitro API → SQLite
                              ↘ SSH helpers → WireGuard / dnsmasq
```

Private keys never enter SQLite or ordinary logs. Client configs are returned once for download/QR.
