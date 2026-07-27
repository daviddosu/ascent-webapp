import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { reasoningFallbackAllowed, requiredEffectsSatisfied, unresolvedRequiredEffects, verifiedCrossToolStage } from './execution-order.ts'

Deno.test('blocks out-of-order and premature cross-tool completion', () => {
  assertEquals(verifiedCrossToolStage([]).stage, 'calendar_required')
  assertEquals(verifiedCrossToolStage([
    { tool_name: 'calendar.update_event', status: 'succeeded', provider_action_id: 'event', completed_at: '2026-09-17T10:00:00Z' },
    { tool_name: 'gmail.create_draft', status: 'succeeded', provider_action_id: 'draft', completed_at: '2026-09-17T10:01:00Z' },
  ]).complete, false)
  assertEquals(verifiedCrossToolStage([{ tool_name: 'calendar.update_event', status: 'succeeded', provider_action_id: 'event', completed_at: '2026-09-17T10:00:00Z' }]).stage, 'notification_required')
  assertEquals(verifiedCrossToolStage([
    { tool_name: 'gmail.send_message', status: 'succeeded', provider_action_id: 'mail', completed_at: '2026-09-17T09:59:00Z' },
    { tool_name: 'calendar.update_event', status: 'succeeded', provider_action_id: 'event', completed_at: '2026-09-17T10:00:00Z' },
  ]).stage, 'out_of_order')
  assertEquals(verifiedCrossToolStage([
    { tool_name: 'calendar.update_event', status: 'succeeded', provider_action_id: 'event', completed_at: '2026-09-17T10:00:00Z' },
    { tool_name: 'gmail.send_message', status: 'succeeded', provider_action_id: 'mail', completed_at: '2026-09-17T10:01:00Z' },
  ]).complete, true)
})

Deno.test('Sol is allowed only for deterministic reasoning mismatches', () => {
  assertEquals(reasoningFallbackAllowed('MODEL_REASONING', true), true)
  for (const failure of ['PROVIDER_OR_BROWSER_INFRA', 'STALE_PROVIDER_STATE', 'STATE_ORDERING']) {
    assertEquals(reasoningFallbackAllowed(failure, true), false)
  }
  assertEquals(reasoningFallbackAllowed('MODEL_REASONING', false), false)
})

Deno.test('required-effect ledger ignores model claims and drafts', () => {
  const required = ['calendar_write', 'gmail_send'] as const
  assertEquals(requiredEffectsSatisfied([...required], ['calendar.update_event', 'gmail.create_draft']), false)
  assertEquals(unresolvedRequiredEffects([...required], ['calendar.update_event', 'gmail.create_draft']), ['gmail_send'])
  assertEquals(requiredEffectsSatisfied([...required], ['calendar.update_event', 'gmail.send_message']), true)
})

Deno.test('required-effect ledger preserves completed Calendar work during continuation', () => {
  const required = ['calendar_write', 'gmail_send'] as const
  const confirmed = ['calendar.update_event']
  assertEquals(unresolvedRequiredEffects([...required], confirmed), ['gmail_send'])
  assertEquals(confirmed.includes('calendar.update_event'), true)
})
