import { describe, expect, it } from 'vitest'
import { addPeerToConfig, listUsedPeerIps, parseNyrConfig, removePeerFromConfig } from '../server/utils/wg/nyr-config'
import { allocateVpnIp } from '../server/utils/wg/ip'
import { parseDnsLogLines } from '../server/utils/dns/parse'

const sample = `[Interface]
Address = 10.7.0.1/24
ListenPort = 51820
PrivateKey = SERVERPRIVATEKEY=

# BEGIN_PEER phone1
[Peer]
PublicKey = ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi012345j=
PresharedKey = PSK=
AllowedIPs = 10.7.0.2/32
# END_PEER phone1
`

describe('nyr-config', () => {
  it('parses peer markers', () => {
    const parsed = parseNyrConfig(sample)
    expect(parsed.peers).toHaveLength(1)
    expect(parsed.peers[0]!.name).toBe('phone1')
    expect(parsed.peers[0]!.allowedIps).toBe('10.7.0.2/32')
  })

  it('adds and removes peers without touching others', () => {
    const withSecond = addPeerToConfig(sample, {
      name: 'phone2',
      publicKey: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ=',
      allowedIps: '10.7.0.3/32'
    })
    expect(withSecond).toContain('# BEGIN_PEER phone2')
    expect(withSecond).toContain('# BEGIN_PEER phone1')
    const removed = removePeerFromConfig(withSecond, {
      name: 'phone2',
      publicKey: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ='
    })
    expect(removed).not.toContain('phone2')
    expect(removed).toContain('phone1')
  })

  it('lists used IPs', () => {
    expect(listUsedPeerIps(sample)).toEqual(['10.7.0.2'])
  })
})

describe('ip allocation', () => {
  it('skips server and used ips', () => {
    const ip = allocateVpnIp({
      subnet: '10.7.0.0/24',
      serverIp: '10.7.0.1',
      usedIps: ['10.7.0.2', '10.7.0.3']
    })
    expect(ip).toBe('10.7.0.4')
  })

  it('prevents duplicates filling subnet', () => {
    expect(() => allocateVpnIp({
      subnet: '10.7.0.0/30',
      serverIp: '10.7.0.1',
      usedIps: ['10.7.0.2']
    })).toThrow(/No free IP/)
  })
})

describe('dns parse', () => {
  it('parses dnsmasq query lines', () => {
    const rows = parseDnsLogLines([
      'Nov  9 01:02:03 dnsmasq[1]: query[A] example.com from 10.7.0.2'
    ], { defaultYear: 2026 })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.domain).toBe('example.com')
    expect(rows[0]!.clientIp).toBe('10.7.0.2')
    expect(rows[0]!.recordType).toBe('A')
  })
})
