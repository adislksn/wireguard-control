# Security

- Dashboard binds to `127.0.0.1` by default.
- Session cookie: httpOnly, sameSite=strict.
- Passwords hashed with bcrypt (12 rounds).
- Login rate-limited per IP.
- SSH host fingerprints pinned after first successful connect.
- Dedicated ed25519 keys under `~/.wgcontrol/keys/` (mode 600).
- Remote operations only via fixed helpers with JSON I/O.
- Destructive actions require explicit confirmation (`DELETE WIREGUARD`, peer revoke confirm).
- DNS history is sensitive, restrict dashboard access and use retention settings.
- Never commit `.env`, SQLite DB, or private keys.

## Rotate compromised secrets

1. Change VPS root password.
2. Replace `~/.wgcontrol/keys/wgcontrol_*` and update `authorized_keys`.
3. Change `WGCONTROL_ADMIN_PASSWORD` and recreate admin user if needed.
