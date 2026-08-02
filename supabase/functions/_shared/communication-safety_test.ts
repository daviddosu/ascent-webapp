import { assertEquals } from 'jsr:@std/assert@1'
import {
  actionIsAffirmed,
  actionIsNegated,
  calendarAttendeeCoordinationIsAffirmed,
  calendarCoordinationIsAffirmed,
  calendarInviteIsAffirmed,
  calendarWriteIsAffirmed,
  classifyNegotiationReply,
  isAutomatedEmailReply,
  latestEmailReplyText,
  normalizeContextQuestion,
} from './communication-safety.ts'

Deno.test('communication write detection respects common negation forms', () => {
  assertEquals(actionIsAffirmed('Schedule a meeting tomorrow.', 'calendar_write'), true)
  assertEquals(actionIsAffirmed('Schedule a meeting tomorrow without sending an email.', 'gmail_send'), false)
  assertEquals(actionIsNegated('Schedule a meeting tomorrow without sending an email.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Create a calendar event; no email or invitation.', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Do not create a calendar event. Notify Ada about the meeting.', 'calendar_write'), false)
  assertEquals(actionIsAffirmed('Create the event, but do not add it to the calendar.', 'calendar_write'), false)
  assertEquals(actionIsAffirmed('Do not create it; schedule it after approval.', 'calendar_write'), true)
  assertEquals(actionIsAffirmed('Do not reply; summarize the message.', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Reply to the email, but do not send it.', 'gmail_send'), false)
  assertEquals(actionIsNegated('Reply to the email, but do not send it.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Tell Ada about the meeting.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Do not tell Ada about the meeting.', 'gmail_send'), false)
  assertEquals(actionIsNegated('Do not tell Ada about the meeting.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Email Ada about the meeting.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Message Ada about the meeting.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Tell me about the email.', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Summarize the message for me.', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Should I email Ada?', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Can I reply to Ada?', 'gmail_send'), false)
  assertEquals(actionIsAffirmed('Can we email Ada?', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Find and forward the email to Ada.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Do not send to Ada; send it to Bob instead.', 'gmail_send'), true)
  assertEquals(actionIsAffirmed('Put the meeting on Ada\'s calendar.', 'calendar_write'), true)
  assertEquals(actionIsAffirmed('Do not put the meeting on Ada\'s calendar.', 'calendar_write'), false)
  assertEquals(actionIsAffirmed('I cannot create the calendar event.', 'calendar_write'), false)
  assertEquals(actionIsAffirmed('I won\'t send the email.', 'gmail_send'), false)
  assertEquals(calendarWriteIsAffirmed('Create the event, but do not invite anyone.'), true)
  assertEquals(actionIsAffirmed('Write and send the email.', 'gmail_send'), true)
})

Deno.test('calendar coordination detection respects recipient and negation boundaries', () => {
  assertEquals(calendarCoordinationIsAffirmed('Schedule a meeting with Ada next week.'), true)
  assertEquals(calendarCoordinationIsAffirmed('Check Ada\'s availability for next week.'), true)
  assertEquals(calendarCoordinationIsAffirmed('Check Ada availability for next week.'), true)
  assertEquals(calendarCoordinationIsAffirmed('Check when Ada is free next week.'), true)
  assertEquals(calendarCoordinationIsAffirmed('See if Ada is available next week.'), true)
  assertEquals(calendarCoordinationIsAffirmed('What time works for Ada?'), true)
  assertEquals(calendarCoordinationIsAffirmed('Invite Ada to the meeting next week.'), true)
  assertEquals(calendarCoordinationIsAffirmed('Send Ada a meeting invitation.'), true)
  assertEquals(calendarInviteIsAffirmed('Send Ada a meeting invitation.'), true)
  assertEquals(calendarCoordinationIsAffirmed('Check my availability for next week.'), false)
  assertEquals(calendarAttendeeCoordinationIsAffirmed('Schedule a meeting tomorrow.'), false)
  assertEquals(calendarAttendeeCoordinationIsAffirmed('Schedule a meeting with Ada tomorrow.'), true)
  assertEquals(calendarAttendeeCoordinationIsAffirmed('Check my availability for next week.'), false)
  assertEquals(calendarCoordinationIsAffirmed('Email Ada about scheduling the meeting.'), false)
  assertEquals(calendarCoordinationIsAffirmed('Ask Ada whether scheduling the meeting next week works.'), false)
  assertEquals(calendarCoordinationIsAffirmed('Should I schedule a meeting with Ada?'), false)
  assertEquals(calendarCoordinationIsAffirmed('Can we schedule a meeting with Ada?'), true)
  assertEquals(calendarWriteIsAffirmed('Can I create a calendar event?'), false)
  assertEquals(calendarCoordinationIsAffirmed('Do not schedule a meeting with Ada; just email her.'), false)
  assertEquals(calendarCoordinationIsAffirmed('I can\'t schedule a meeting with Ada.'), false)
  assertEquals(calendarInviteIsAffirmed('Put the meeting in Ada\'s inbox for Thursday.'), true)
  assertEquals(calendarInviteIsAffirmed('Do not put the meeting in Ada\'s inbox; email her the details.'), false)
  assertEquals(calendarInviteIsAffirmed('Put the meeting on Ada\'s calendar, but do not invite anyone else.'), true)
  assertEquals(calendarInviteIsAffirmed('Add the event to my calendar.'), false)
  assertEquals(calendarWriteIsAffirmed('Create the event on my calendar.'), true)
  assertEquals(calendarWriteIsAffirmed('Tell Ada about scheduling the meeting.'), false)
  assertEquals(calendarWriteIsAffirmed('Ask Ada whether scheduling the meeting next week works.'), false)
  assertEquals(calendarWriteIsAffirmed('Tell Ada about the calendar invite already on the schedule.'), false)
})

Deno.test('automated provider replies cannot satisfy a negotiation', () => {
  assertEquals(isAutomatedEmailReply({ subject: 'Out of office', body_text: 'I am away.' }), true)
  assertEquals(isAutomatedEmailReply({ x_auto_response_suppress: 'All', body_text: 'Automatic response.' }), true)
  assertEquals(isAutomatedEmailReply({ subject: 'Thursday works', body_text: 'See you then.' }), false)
  assertEquals(isAutomatedEmailReply({ subject: 'Thursday works', body_text: 'Here is the list we discussed.' }), false)
})

Deno.test('negotiation classification ignores quoted prior messages and signatures', () => {
  const reply = 'Yes, Thursday at 2 works for me.\n\nOn Tuesday, Ada wrote:\n> I cannot make Tuesday.\n--\nAda'
  assertEquals(latestEmailReplyText(reply), 'Yes, Thursday at 2 works for me.')
  assertEquals(classifyNegotiationReply(reply), 'accepted')
  assertEquals(classifyNegotiationReply('I cannot make Tuesday.\n\n> Thursday works for me.'), 'declined')
})

Deno.test('negotiation reply classification is conservative', () => {
  assertEquals(classifyNegotiationReply('Yes, Tuesday at 3 works for me.'), 'accepted')
  assertEquals(classifyNegotiationReply('I cannot make that time.'), 'declined')
  assertEquals(classifyNegotiationReply('Not available.'), 'declined')
  assertEquals(classifyNegotiationReply('I am not free then.'), 'declined')
  assertEquals(classifyNegotiationReply('I am unavailable, but Thursday might work.'), 'needs_resolution')
  assertEquals(classifyNegotiationReply('I cannot make Tuesday, but Thursday works.'), 'needs_resolution')
  assertEquals(classifyNegotiationReply('I cannot make Tuesday, but Thursday is fine.'), 'needs_resolution')
  assertEquals(classifyNegotiationReply('I cannot make Tuesday, but Thursday is okay.'), 'needs_resolution')
  assertEquals(classifyNegotiationReply('I am busy Tuesday.'), 'declined')
  assertEquals(classifyNegotiationReply('I have a conflict then.'), 'declined')
  assertEquals(classifyNegotiationReply('I can do Thursday.'), 'accepted')
  assertEquals(classifyNegotiationReply('Thursday is fine.'), 'accepted')
  assertEquals(classifyNegotiationReply('No, Thursday at 3 works for me.'), 'needs_resolution')
  assertEquals(classifyNegotiationReply('I cannot attend. Please cancel the meeting.'), 'declined')
  assertEquals(classifyNegotiationReply('Could we do Thursday instead?'), 'needs_resolution')
  assertEquals(classifyNegotiationReply('I am available next week.'), 'needs_resolution')
})

Deno.test('context questions normalize for duplicate detection', () => {
  assertEquals(normalizeContextQuestion(' What time should we use? '), 'what time should we use')
  assertEquals(normalizeContextQuestion('What time should we use!'), 'what time should we use')
})
