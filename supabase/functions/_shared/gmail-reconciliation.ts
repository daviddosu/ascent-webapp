export type GmailIdentity = { id: string; thread_id: string }

export function reconcileGmailIdentity(staleMessageId: string, cached: GmailIdentity[], fresh: GmailIdentity[]) {
  const stale = cached.find(message => message.id === staleMessageId)
  if (!stale?.thread_id) return null
  const candidates = fresh.filter(message => message.thread_id === stale.thread_id && message.id !== staleMessageId)
  return candidates.at(-1) ?? null
}

export function providerStateIsFresh(cachedHistoryId: string, currentHistoryId: string) {
  return Boolean(cachedHistoryId && currentHistoryId && cachedHistoryId === currentHistoryId)
}
