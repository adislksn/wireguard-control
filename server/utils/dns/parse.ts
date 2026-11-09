/**
 * Parse dnsmasq query log lines.
 * Example: Oct 11 12:00:01 dnsmasq[123]: query[A] example.com from 10.7.0.2
 */
export interface DnsLogRecord {
  timestamp: string
  domain: string
  recordType: string
  clientIp: string
  raw: string
}

const QUERY_RE = /query\[([^\]]+)\]\s+(\S+)\s+from\s+(\S+)/i

export function parseDnsLogLines(lines: string[], opts?: { defaultYear?: number }) {
  const year = opts?.defaultYear || new Date().getUTCFullYear()
  const out: DnsLogRecord[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const match = line.match(QUERY_RE)
    if (!match) continue
    const recordType = match[1]!
    const domain = match[2]!.replace(/\.$/, '').toLowerCase()
    const clientIp = match[3]!
    const ts = parseSyslogTimestamp(line, year)
    out.push({
      timestamp: ts,
      domain,
      recordType,
      clientIp,
      raw: line
    })
  }
  return out
}

function parseSyslogTimestamp(line: string, year: number) {
  // "Nov  9 00:01:02 ..." or ISO if present
  const iso = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/)
  if (iso) {
    return new Date(iso[1]!).toISOString()
  }
  const m = line.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})/)
  if (!m) {
    return new Date().toISOString()
  }
  const parsed = Date.parse(`${m[1]} ${m[2]} ${year} ${m[3]} UTC`)
  if (Number.isNaN(parsed)) {
    return new Date().toISOString()
  }
  return new Date(parsed).toISOString()
}

export function parseWgDump(dump: string) {
  const lines = dump.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) {
    return { interface: null as null | Record<string, string>, peers: [] as Array<Record<string, string | number>> }
  }
  const [ifaceLine, ...peerLines] = lines
  const ifaceParts = ifaceLine!.split('\t')
  const iface = {
    privateKey: '<REDACTED>',
    publicKey: ifaceParts[1] || '',
    listenPort: ifaceParts[2] || '',
    fwmark: ifaceParts[3] || ''
  }
  const peers = peerLines.map((line) => {
    const p = line.split('\t')
    return {
      publicKey: p[0] || '',
      presharedKey: p[1] && p[1] !== '(none)' ? '<present>' : '',
      endpoint: p[2] || '',
      allowedIps: p[3] || '',
      latestHandshake: Number(p[4] || 0),
      rxBytes: Number(p[5] || 0),
      txBytes: Number(p[6] || 0),
      persistentKeepalive: p[7] || ''
    }
  })
  return { interface: iface, peers }
}
