/** Allocate next free IPv4 in subnet, skipping server IP and used peer IPs. */
export function parseCidr(cidr: string) {
  const [base, prefixStr] = cidr.split('/')
  const prefix = Number(prefixStr)
  if (!base || Number.isNaN(prefix) || prefix < 8 || prefix > 30) {
    throw new Error('Invalid subnet CIDR')
  }
  const baseNum = ipv4ToInt(base)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (baseNum & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  return { network, broadcast, prefix, mask }
}

export function ipv4ToInt(ip: string) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4: ${ip}`)
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

export function intToIpv4(num: number) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join('.')
}

export function allocateVpnIp(opts: {
  subnet: string
  serverIp: string
  usedIps: string[]
}) {
  const { network, broadcast } = parseCidr(opts.subnet)
  const reserved = new Set<number>([
    network,
    broadcast,
    ipv4ToInt(opts.serverIp),
    ...opts.usedIps.map(ipv4ToInt)
  ])

  for (let candidate = network + 1; candidate < broadcast; candidate++) {
    if (!reserved.has(candidate >>> 0)) {
      return intToIpv4(candidate >>> 0)
    }
  }
  throw new Error('No free IP addresses in WireGuard subnet')
}

export function isIpInSubnet(ip: string, subnet: string) {
  const { network, mask } = parseCidr(subnet)
  return ((ipv4ToInt(ip) & mask) >>> 0) === network
}
