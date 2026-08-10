import { lookup as nodeLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

type LookupAddress = { address: string; family: number }
export type HostLookup = (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>

const forbidden = new BlockList()

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) forbidden.addSubnet(network, prefix, 'ipv4')

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) forbidden.addSubnet(network, prefix, 'ipv6')

export function normalizedIpLiteral(hostname: string) {
  const normalized = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  return isIP(normalized) ? normalized : ''
}

export function forbiddenNetworkAddress(address: string) {
  const normalized = normalizedIpLiteral(address)
  const family = isIP(normalized)
  if (!family) return true
  // Node's BlockList treats the IPv4-mapped /96 as covering every IPv4
  // address during cross-family checks. Handle mapped answers explicitly so
  // ordinary public IPv4 remains usable while mapped DNS answers stay denied.
  if (family === 6 && normalized.toLocaleLowerCase().startsWith('::ffff:')) return true
  return forbidden.check(normalized, family === 4 ? 'ipv4' : 'ipv6')
}

export async function resolvePublicHostname(hostname: string, lookup: HostLookup = nodeLookup as HostLookup) {
  const literal = normalizedIpLiteral(hostname)
  if (literal) {
    if (forbiddenNetworkAddress(literal)) throw new Error('hostname resolves to a non-public network')
    return [literal]
  }
  const records = await lookup(hostname, { all: true, verbatim: true })
  const addresses = [...new Set(records.map(record => record.address))]
  if (!addresses.length || addresses.some(forbiddenNetworkAddress)) {
    throw new Error('hostname resolves to a non-public network')
  }
  return addresses
}

export async function pinnedHostResolverRules(hostnames: string[], lookup?: HostLookup) {
  const rules: string[] = []
  for (const hostname of [...new Set(hostnames)]) {
    const addresses = await resolvePublicHostname(hostname, lookup)
    const address = addresses[0]!
    rules.push(`MAP ${hostname} ${isIP(address) === 6 ? `[${address}]` : address}`)
  }
  return rules.join(', ')
}
