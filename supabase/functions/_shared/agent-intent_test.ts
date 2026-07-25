import { assertEquals } from 'jsr:@std/assert@1'
import { classifySharedAgentIntent } from './agent-intent.ts'

Deno.test('read-only Gmail and Calendar tasks use prepared-result completion', () => {
  assertEquals(
    classifySharedAgentIntent('Summarize the subject and sender of my latest Gmail message'),
    { capability: 'gmail', strategy: 'structured', outcomeType: 'prepared_result' },
  )
  assertEquals(
    classifySharedAgentIntent('Check my Calendar availability next week'),
    { capability: 'calendar', strategy: 'structured', outcomeType: 'prepared_result' },
  )
})

Deno.test('provider writes and meeting coordination keep external-change completion', () => {
  assertEquals(
    classifySharedAgentIntent('Follow up with everyone I emailed last week'),
    { capability: 'gmail', strategy: 'structured', outcomeType: 'external_change' },
  )
  assertEquals(
    classifySharedAgentIntent('Set up a meeting with Blessing next week'),
    { capability: 'scheduling', strategy: 'hybrid', outcomeType: 'external_change' },
  )
})
