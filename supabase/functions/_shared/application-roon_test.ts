import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { applicationContactResolutionPayloads } from './application-roon.ts'

Deno.test('expands a bounded referee slate into independently idempotent contact resolutions', () => {
  const result = applicationContactResolutionPayloads({
    contacts: [
      { name: 'Dr Ada Lee', email: 'Ada.Lee@example.edu', relationship: 'MSc supervisor' },
      { name: 'Prof Sam Green', email: 'sam.green@example.edu', relationship: 'Research mentor' },
      { name: 'Duplicate Ada', email: 'ada.lee@example.edu' },
    ],
    purpose: 'Resolve referees without contacting them.',
  }, 'request-1')

  assertEquals(result.invalidIndexes, [])
  assertEquals(result.payloads.map(payload => ({
    recipient: payload.recipient,
    email: payload.email,
    name: payload.name,
    kind: payload.contact_kind,
    key: payload.contact_idempotency_key,
  })), [
    { recipient: 'Ada.Lee@example.edu', email: 'Ada.Lee@example.edu', name: 'Dr Ada Lee', kind: 'referee', key: 'request-1:1' },
    { recipient: 'sam.green@example.edu', email: 'sam.green@example.edu', name: 'Prof Sam Green', kind: 'referee', key: 'request-1:2' },
  ])
})

Deno.test('keeps malformed referee entries explicit and preserves the single-recipient contract', () => {
  const batch = applicationContactResolutionPayloads({ contacts: [{ relationship: 'Unknown' }, { name: 'Dr Ada Lee' }] }, 'request-2')
  assertEquals(batch.invalidIndexes, [0])
  assertEquals(batch.payloads.map(payload => ({
    recipient: payload.recipient,
    name: payload.name,
    kind: payload.contact_kind,
    key: payload.contact_idempotency_key,
  })), [{ recipient: 'Dr Ada Lee', name: 'Dr Ada Lee', kind: 'referee', key: 'request-2:1' }])
  const single = { recipient: 'admissions@example.edu', contact_kind: 'admissions' }
  assertEquals(applicationContactResolutionPayloads(single, 'request-3'), { payloads: [single], invalidIndexes: [] })
})
