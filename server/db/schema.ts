import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
}, table => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_expires_at_idx').on(table.expiresAt)
])

export const vpsHosts = sqliteTable('vps_hosts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  host: text('host').notNull(),
  sshPort: integer('ssh_port').notNull().default(22),
  sshUser: text('ssh_user').notNull().default('root'),
  authType: text('auth_type', { enum: ['key', 'password'] }).notNull().default('key'),
  privateKeyPath: text('private_key_path'),
  hostFingerprint: text('host_fingerprint'),
  wgInterface: text('wg_interface').default('wg0'),
  wgSubnet: text('wg_subnet').default('10.7.0.0/24'),
  serverVpnIp: text('server_vpn_ip').default('10.7.0.1'),
  listenPort: integer('listen_port').default(51820),
  status: text('status', {
    enum: ['unknown', 'reachable', 'no_wireguard', 'ready', 'error']
  }).notNull().default('unknown'),
  lastError: text('last_error'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
}, table => [
  uniqueIndex('vps_hosts_host_port_idx').on(table.host, table.sshPort),
  index('vps_hosts_is_active_idx').on(table.isActive)
])

export const peers = sqliteTable('peers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id').notNull().references(() => vpsHosts.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  deviceName: text('device_name').notNull(),
  deviceType: text('device_type').default('other'),
  description: text('description'),
  vpnIp: text('vpn_ip').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  revokedAt: text('revoked_at'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
}, table => [
  uniqueIndex('peers_vps_public_key_idx').on(table.vpsId, table.publicKey),
  index('peers_vps_vpn_ip_idx').on(table.vpsId, table.vpnIp),
  index('peers_vps_id_idx').on(table.vpsId),
  index('peers_is_active_idx').on(table.isActive)
])

export const peerSnapshots = sqliteTable('peer_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id').notNull().references(() => vpsHosts.id, { onDelete: 'cascade' }),
  peerId: integer('peer_id').references(() => peers.id, { onDelete: 'set null' }),
  publicKey: text('public_key').notNull(),
  timestamp: text('timestamp').notNull(),
  rxBytes: integer('rx_bytes').notNull().default(0),
  txBytes: integer('tx_bytes').notNull().default(0),
  latestHandshake: text('latest_handshake'),
  endpoint: text('endpoint'),
  allowedIps: text('allowed_ips')
}, table => [
  index('peer_snapshots_vps_ts_idx').on(table.vpsId, table.timestamp),
  index('peer_snapshots_peer_ts_idx').on(table.peerId, table.timestamp),
  index('peer_snapshots_public_key_idx').on(table.publicKey)
])

export const dnsQueries = sqliteTable('dns_queries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id').notNull().references(() => vpsHosts.id, { onDelete: 'cascade' }),
  peerId: integer('peer_id').references(() => peers.id, { onDelete: 'set null' }),
  timestamp: text('timestamp').notNull(),
  clientIp: text('client_ip').notNull(),
  domain: text('domain').notNull(),
  recordType: text('record_type').default('A')
}, table => [
  index('dns_queries_vps_ts_idx').on(table.vpsId, table.timestamp),
  index('dns_queries_peer_id_idx').on(table.peerId),
  index('dns_queries_domain_idx').on(table.domain),
  index('dns_queries_client_ip_idx').on(table.clientIp)
])

export const adminAuditLogs = sqliteTable('admin_audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id').references(() => vpsHosts.id, { onDelete: 'set null' }),
  peerId: integer('peer_id').references(() => peers.id, { onDelete: 'set null' }),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
  action: text('action').notNull(),
  result: text('result').notNull(),
  detail: text('detail')
}, table => [
  index('admin_audit_logs_ts_idx').on(table.timestamp),
  index('admin_audit_logs_vps_id_idx').on(table.vpsId),
  index('admin_audit_logs_action_idx').on(table.action)
])

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
})

export const collectorCursors = sqliteTable('collector_cursors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vpsId: integer('vps_id').notNull().references(() => vpsHosts.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  cursor: text('cursor').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
}, table => [
  uniqueIndex('collector_cursors_vps_kind_idx').on(table.vpsId, table.kind)
])
