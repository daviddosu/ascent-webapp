import { assertEquals } from 'jsr:@std/assert@1'
import { actionIsAffirmed, actionIsNegated, classifyNegotiationReply, normalizeContextQuestion } from './communication-safety.ts'

Deno.test('communication write detection respects common negation forms', () => {
  assertEquals(actionIsAffirmed('Schedule a meeting tomorrow.', 'calendar_write'), true)
  assertEquals(actionIsAffirmed('Schedule a meeting tomorrow without sending an email.', 'gmail_send'), false)
  assertEquals(actionIsNegated('Schedule a meeting tomorrow without sending an email.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Create a calendar event; no email or invitation.', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Do not create a calendar event. Notify Ada about the meeting.', 'calendar_write'), false)
  assertEquals(actionIsAffirmed('Do not reply; summarize the message.', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Write and send the email.', 'gmail_send'), true)
})

Deno.test('negotiation reply classification is conservative', () => {
  assertEquals(classifyNegotiationReply('Yes, Tuesday at 3 works for me.'), 'accepted')
  assertEquals(classifyNegotiationReply('I cannot make that time.'), 'declined')
  assertEquals(classifyNegotiationReply('Could we do Thursday instead?'), 'needs_resolution')
  assertEquals(classifyNegotiationReply('I am available next week.'), 'needs_resolution')
})

Deno.test('context questions normalize for duplicate detection', () => {
  assertEquals(normalizeContextQuestion(' What time should we use? '), 'what time should we use')
  assertEquals(normalizeContextQuestion('What time should we use!'), 'what time should we use')
})
