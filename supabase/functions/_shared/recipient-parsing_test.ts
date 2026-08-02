import { assertEquals } from 'jsr:@std/assert@1'
import { namedRecipientsFromObjective } from './recipient-parsing.ts'

Deno.test('recipient parsing stops before email and message context', () => {
  assertEquals(namedRecipientsFromObjective("Reply to Sarah's most recent email"), ['Sarah'])
  assertEquals(namedRecipientsFromObjective('Tell Sarah the meeting is tomorrow'), ['Sarah'])
  assertEquals(namedRecipientsFromObjective('Follow up with Ada about the proposal'), ['Ada'])
  assertEquals(namedRecipientsFromObjective('Schedule a call with Ada and Bob next week'), ['Ada', 'Bob'])
})
