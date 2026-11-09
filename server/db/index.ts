import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

type Db = ReturnType<typeof createDb>

let dbInstance: Db | null = null
let migrated = false

function resolveDatabaseUrl() {
  const config = useRuntimeConfig()
  return config.databaseUrl || process.env.DATABASE_URL || 'file:./.data/wgcontrol.sqlite'
}

function ensureDataDir(url: string) {
  if (!url.startsWith('file:')) {
    return
  }
  const path = url.replace(/^file:/, '')
  const abs = resolve(path)
  mkdirSync(dirname(abs), { recursive: true })
}

function createDb(url: string) {
  ensureDataDir(url)
  const client = createClient({ url })
  // drizzle-orm 1.0 uses `relations` (not legacy `schema`) on the client config
  return drizzle({ client })
}

export async function getDb() {
  const url = resolveDatabaseUrl()
  if (!dbInstance) {
    dbInstance = createDb(url)
  }
  if (!migrated) {
    const migrationsFolder = resolve(
      dirname(fileURLToPath(import.meta.url)),
      'migrations'
    )
    try {
      await migrate(dbInstance, { migrationsFolder })
    } catch {
      // Fresh projects may bootstrap via ensureSchema until migrations exist
      await ensureSchema(dbInstance)
    }
    migrated = true
  }
  return dbInstance
}

async function ensureSchema(db: Db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS vps_hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      ssh_port INTEGER NOT NULL DEFAULT 22,
      ssh_user TEXT NOT NULL DEFAULT 'root',
      auth_type TEXT NOT NULL DEFAULT 'key',
      private_key_path TEXT,
      host_fingerprint TEXT,
      wg_interface TEXT DEFAULT 'wg0',
      wg_subnet TEXT DEFAULT '10.7.0.0/24',
      server_vpn_ip TEXT DEFAULT '10.7.0.1',
      listen_port INTEGER DEFAULT 51820,
      status TEXT NOT NULL DEFAULT 'unknown',
      last_error TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS peers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps_hosts(id) ON DELETE CASCADE,
      public_key TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_type TEXT DEFAULT 'other',
      description TEXT,
      vpn_ip TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS peer_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps_hosts(id) ON DELETE CASCADE,
      peer_id INTEGER REFERENCES peers(id) ON DELETE SET NULL,
      public_key TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      rx_bytes INTEGER NOT NULL DEFAULT 0,
      tx_bytes INTEGER NOT NULL DEFAULT 0,
      latest_handshake TEXT,
      endpoint TEXT,
      allowed_ips TEXT
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS dns_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps_hosts(id) ON DELETE CASCADE,
      peer_id INTEGER REFERENCES peers(id) ON DELETE SET NULL,
      timestamp TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      domain TEXT NOT NULL,
      record_type TEXT DEFAULT 'A'
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER REFERENCES vps_hosts(id) ON DELETE SET NULL,
      peer_id INTEGER REFERENCES peers(id) ON DELETE SET NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      detail TEXT
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(`
    CREATE TABLE IF NOT EXISTS collector_cursors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vps_id INTEGER NOT NULL REFERENCES vps_hosts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      cursor TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  await db.run(`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);`)
  await db.run(`CREATE INDEX IF NOT EXISTS peers_vps_id_idx ON peers(vps_id);`)
  await db.run(`CREATE INDEX IF NOT EXISTS peer_snapshots_vps_ts_idx ON peer_snapshots(vps_id, timestamp);`)
  await db.run(`CREATE INDEX IF NOT EXISTS dns_queries_vps_ts_idx ON dns_queries(vps_id, timestamp);`)
  await db.run(`CREATE INDEX IF NOT EXISTS admin_audit_logs_ts_idx ON admin_audit_logs(timestamp);`)
  await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS collector_cursors_vps_kind_idx ON collector_cursors(vps_id, kind);`)
}

export type { Db }
export { schema }
