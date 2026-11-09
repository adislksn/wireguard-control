export interface NyrPeerBlock {
  name: string
  publicKey: string
  presharedKey?: string
  allowedIps: string
  raw: string
}

export interface NyrConfig {
  interfaceRaw: string
  peers: NyrPeerBlock[]
  full: string
}

const BEGIN = '# BEGIN_PEER '
const END = '# END_PEER '

export function parseNyrConfig(content: string): NyrConfig {
  const peers: NyrPeerBlock[] = []
  const lines = content.split(/\r?\n/)
  let i = 0
  const interfaceLines: string[] = []
  let inPeer = false

  while (i < lines.length) {
    const line = lines[i]!
    if (line.startsWith(BEGIN)) {
      inPeer = true
      const name = line.slice(BEGIN.length).trim()
      const blockLines = [line]
      i++
      let publicKey = ''
      let presharedKey: string | undefined
      let allowedIps = ''
      while (i < lines.length) {
        const l = lines[i]!
        blockLines.push(l)
        const pk = l.match(/^\s*PublicKey\s*=\s*(.+)\s*$/i)
        if (pk) publicKey = pk[1]!.trim()
        const psk = l.match(/^\s*PresharedKey\s*=\s*(.+)\s*$/i)
        if (psk) presharedKey = psk[1]!.trim()
        const ai = l.match(/^\s*AllowedIPs\s*=\s*(.+)\s*$/i)
        if (ai) allowedIps = ai[1]!.trim()
        if (l.startsWith(END) && l.slice(END.length).trim() === name) {
          peers.push({
            name,
            publicKey,
            presharedKey,
            allowedIps,
            raw: blockLines.join('\n')
          })
          inPeer = false
          i++
          break
        }
        i++
      }
      continue
    }
    if (!inPeer) {
      interfaceLines.push(line)
    }
    i++
  }

  return {
    interfaceRaw: interfaceLines.join('\n').trimEnd(),
    peers,
    full: content
  }
}

export function buildPeerBlock(opts: {
  name: string
  publicKey: string
  presharedKey?: string
  allowedIps: string
}) {
  const lines = [
    `${BEGIN}${opts.name}`,
    '[Peer]',
    `PublicKey = ${opts.publicKey}`
  ]
  if (opts.presharedKey) {
    lines.push(`PresharedKey = ${opts.presharedKey}`)
  }
  lines.push(`AllowedIPs = ${opts.allowedIps}`, `${END}${opts.name}`)
  return lines.join('\n')
}

export function addPeerToConfig(content: string, peer: {
  name: string
  publicKey: string
  presharedKey?: string
  allowedIps: string
}) {
  const parsed = parseNyrConfig(content)
  if (parsed.peers.some(p => p.name === peer.name)) {
    throw new Error(`Peer name already exists: ${peer.name}`)
  }
  if (parsed.peers.some(p => p.publicKey === peer.publicKey)) {
    throw new Error('Peer public key already exists')
  }
  const block = buildPeerBlock(peer)
  const base = content.trimEnd()
  return `${base}\n\n${block}\n`
}

export function removePeerFromConfig(content: string, opts: { name?: string, publicKey?: string }) {
  const parsed = parseNyrConfig(content)
  const target = parsed.peers.find(p =>
    (opts.name && p.name === opts.name) || (opts.publicKey && p.publicKey === opts.publicKey)
  )
  if (!target) {
    throw new Error('Peer not found in configuration')
  }
  if (opts.name && opts.publicKey && (target.name !== opts.name || target.publicKey !== opts.publicKey)) {
    throw new Error('Peer name and public key do not match')
  }

  const markerStart = `${BEGIN}${target.name}`
  const markerEnd = `${END}${target.name}`
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let skipping = false
  for (const line of lines) {
    if (line === markerStart) {
      skipping = true
      continue
    }
    if (skipping) {
      if (line === markerEnd) {
        skipping = false
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

export function listUsedPeerIps(content: string) {
  const parsed = parseNyrConfig(content)
  const ips: string[] = []
  for (const peer of parsed.peers) {
    const match = peer.allowedIps.match(/(\d+\.\d+\.\d+\.\d+)/)
    if (match) ips.push(match[1]!)
  }
  return ips
}

export function redactConfig(content: string) {
  return content
    .replace(/^(PrivateKey\s*=\s*).+$/gim, '$1<REDACTED>')
    .replace(/^(PresharedKey\s*=\s*).+$/gim, '$1<REDACTED>')
}
