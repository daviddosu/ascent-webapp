import { describe, expect, it } from 'vitest'
import { forbiddenNetworkAddress, normalizedIpLiteral, pinnedHostResolverRules, resolvePublicHostname, type HostLookup } from './_egress-policy.js'

const lookup = (records: Array<{ address: string; family: number }>): HostLookup => async () => records

describe('browser egress DNS policy', () => {
  it('blocks loopback, private, link-local, metadata, mapped, and reserved networks', () => {
    for (const address of [
      '127.0.0.1', '10.2.3.4', '100.64.0.1', '169.254.169.254', '172.31.0.1',
      '192.168.1.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fc00::1',
      '::ffff:127.0.0.1', '2001:db8::1',
    ]) expect(forbiddenNetworkAddress(address), address).toBe(true)
    expect(forbiddenNetworkAddress('8.8.8.8')).toBe(false)
    expect(forbiddenNetworkAddress('2606:4700:4700::1111')).toBe(false)
  })

  it('normalizes bracketed IPv6 literals and URL-normalized alternate IPv4 forms', () => {
    expect(normalizedIpLiteral('[::1]')).toBe('::1')
    expect(new URL('https://2130706433/').hostname).toBe('127.0.0.1')
    expect(new URL('https://0x7f000001/').hostname).toBe('127.0.0.1')
  })

  it('rejects mixed public/private DNS answers to prevent rebinding', async () => {
    await expect(resolvePublicHostname('safe.example', lookup([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]))).rejects.toThrow(/non-public/)
    await expect(resolvePublicHostname('safe.example', lookup([]))).rejects.toThrow(/non-public/)
  })

  it('pins validated document hosts to the address that passed policy', async () => {
    await expect(pinnedHostResolverRules(['safe.example'], lookup([
      { address: '93.184.216.34', family: 4 },
    ]))).resolves.toBe('MAP safe.example 93.184.216.34')
  })
})
