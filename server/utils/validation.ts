import { z } from 'zod'

const safeName = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._@+-]*$/, 'Invalid name')

/** Human-readable device names (spaces allowed); still blocks shell metacharacters. */
const deviceNameSchema = z.string().trim().min(1).max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._@+-]*$/, 'Invalid device name')
  .refine(v => !/[`$;|&<>\\]/.test(v), 'Invalid device name')

export const ipv4Schema = z.string().regex(
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/,
  'Invalid IPv4 address'
)

export const cidrSchema = z.string().regex(
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\/(?:[0-9]|[1-2]\d|3[0-2])$/,
  'Invalid CIDR'
)

export const wgPublicKeySchema = z.string().regex(/^[A-Za-z0-9+/]{42,44}=$/, 'Invalid WireGuard public key')

export const vpsCreateSchema = z.object({
  name: safeName,
  host: z.string().trim().min(1).max(253),
  sshPort: z.number().int().min(1).max(65535).default(22),
  sshUser: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9._-]+$/).default('root'),
  password: z.string().min(1).max(256).optional(),
  wgInterface: z.string().regex(/^wg\d+$/).default('wg0'),
  wgSubnet: cidrSchema.default('10.7.0.0/24'),
  serverVpnIp: ipv4Schema.default('10.7.0.1'),
  listenPort: z.number().int().min(1).max(65535).default(51820)
})

export const vpsUpdateSchema = vpsCreateSchema.partial().omit({ password: true }).extend({
  password: z.string().min(1).max(256).optional()
})

export const peerCreateSchema = z.object({
  deviceName: deviceNameSchema,
  deviceType: z.enum(['phone', 'tablet', 'laptop', 'desktop', 'router', 'other']).default('other'),
  description: z.string().trim().max(280).optional()
})

export const peerUpdateSchema = z.object({
  deviceName: deviceNameSchema.optional(),
  deviceType: z.enum(['phone', 'tablet', 'laptop', 'desktop', 'router', 'other']).optional(),
  description: z.string().trim().max(280).nullable().optional()
})

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256)
})

export const settingsSchema = z.object({
  peerStatsIntervalSec: z.number().int().min(15).max(3600).optional(),
  dnsCollectIntervalSec: z.number().int().min(10).max(3600).optional(),
  healthIntervalSec: z.number().int().min(60).max(3600).optional(),
  dnsRetentionDays: z.number().int().min(1).max(365).optional(),
  peerStatsRetentionDays: z.number().int().min(1).max(730).optional(),
  timezone: z.string().min(1).max(64).optional(),
  upstreamDns: ipv4Schema.optional(),
  clientDns: z.string().trim().min(7).max(128)
    .regex(/^[0-9., ]+$/, 'Invalid client DNS list')
    .optional()
})

export const initSchema = z.object({
  listenPort: z.number().int().min(1).max(65535).default(51820),
  wgSubnet: cidrSchema.default('10.7.0.0/24'),
  serverVpnIp: ipv4Schema.default('10.7.0.1'),
  interfaceName: z.string().regex(/^wg\d+$/).default('wg0'),
  enableIpv6: z.boolean().default(false),
  upstreamDns: ipv4Schema.default('1.1.1.1'),
  force: z.boolean().default(false)
})

export const purgeSchema = z.object({
  confirm: z.literal('DELETE WIREGUARD')
})
