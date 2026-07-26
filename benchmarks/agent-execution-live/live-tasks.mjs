const DAY_MS = 86_400_000

function lagosDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function dateAt(daysFromNow, hour = 0, minute = 0) {
  const date = new Date(Date.now() + daysFromNow * DAY_MS)
  const day = lagosDate(date)
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+01:00`
}

function nextWeekday(targetDay, minimumDays = 1) {
  const currentDay = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos', weekday: 'short',
  }).formatToParts(new Date()).find(part => part.type === 'weekday')?.value
    ?.replace('Sun', '0').replace('Mon', '1').replace('Tue', '2').replace('Wed', '3')
    .replace('Thu', '4').replace('Fri', '5').replace('Sat', '6'))
  let delta = (targetDay - currentDay + 7) % 7
  while (delta < minimumDays) delta += 7
  return delta
}

function marker(taskId, runNumber, nonce) {
  return `[SC-LIVE-v1 ${taskId} r${runNumber} ${nonce}]`
}

export function buildLiveTasks({ runNumber, nonce, primaryEmail, secondaryEmail }) {
  const tag = taskId => marker(taskId, runNumber, nonce)
  const tomorrow = 1
  const tuesday = nextWeekday(2, 2)
  const wednesday = nextWeekday(3, 3)
  const thursday = nextWeekday(4, 4)
  const friday = nextWeekday(5, 5)
  const monday = nextWeekday(1, 2)
  const flightThursday = nextWeekday(4, 10)
  const flightFriday = nextWeekday(5, 10)

  return [
    {
      id: 'email-01', category: 'email', title: 'Reply to Sarah',
      description: `Reply to Sarah's most recent email about ShotCount and tell her Tuesday afternoon works. Sarah's controlled address is ${secondaryEmail}.`,
      fixture: { kind: 'incoming', subject: `${tag('email-01')} ShotCount timing`, body: 'Does Tuesday work for a quick ShotCount discussion?' },
      expected: { state: 'sent', to: secondaryEmail, bodyIncludes: ['Tuesday', 'afternoon'], marker: tag('email-01') },
    },
    {
      id: 'email-02', category: 'email', title: 'Follow up with investors',
      description: `Find the two most recent ShotCount investor emails I sent today that have no reply and prepare a concise follow-up to each. The controlled recipient is ${secondaryEmail}.`,
      fixture: { kind: 'two_outgoing', subjects: [`${tag('email-02')} ShotCount — Ada`, `${tag('email-02')} ShotCount — Max`] },
      expected: { state: 'draft', draftCount: 2, maxWords: 55, marker: tag('email-02') },
    },
    {
      id: 'email-03', category: 'email', title: 'Find latest deck',
      description: 'Find the most recent email containing the ShotCount deck and identify the relevant message and attachment.',
      fixture: { kind: 'incoming_attachment', subject: `${tag('email-03')} Latest ShotCount deck`, attachment: 'ShotCount-Deck-Live-v1.pdf' },
      expected: { state: 'identified', attachment: 'ShotCount-Deck-Live-v1.pdf', marker: tag('email-03') },
    },
    {
      id: 'email-04', category: 'email', title: 'Handle unanswered email',
      description: `Find the important controlled email from today that needs a reply and prepare an appropriate response without sending it. The sender is ${secondaryEmail}.`,
      fixture: { kind: 'incoming', subject: `${tag('email-04')} Important: launch timeline`, body: 'Can you confirm the launch timeline? We need an answer by Friday.' },
      expected: { state: 'draft', bodyIncludes: ['timeline', 'Friday'], marker: tag('email-04') },
    },
    {
      id: 'email-05', category: 'email', title: 'Reply in thread',
      description: `Find the latest ShotCount launch conversation and reply inside that thread to confirm the revised copy is ready. The controlled recipient is ${secondaryEmail}.`,
      fixture: { kind: 'incoming', subject: `${tag('email-05')} ShotCount launch copy`, body: 'Is the revised launch copy ready?' },
      expected: { state: 'sent', to: secondaryEmail, bodyIncludes: ['revised', 'copy', 'ready'], marker: tag('email-05') },
    },
    {
      id: 'calendar-01', category: 'calendar', title: "Move tomorrow's meeting",
      description: 'Move the controlled Product Review tomorrow from 10:00 AM to 2:00 PM. Keep it one hour and do not create a duplicate.',
      fixture: { kind: 'calendar_event', summary: 'Product Review', start: dateAt(tomorrow, 10), end: dateAt(tomorrow, 11) },
      expected: { state: 'confirmed', summary: 'Product Review', start: dateAt(tomorrow, 14), end: dateAt(tomorrow, 15), count: 1 },
    },
    {
      id: 'calendar-02', category: 'calendar', title: 'Find a free hour',
      description: `Find a conflict-free one-hour slot on my calendar on ${lagosDate(new Date(Date.now() + wednesday * DAY_MS))} between 1:00 PM and 5:00 PM. Do not create an event.`,
      fixture: { kind: 'busy_windows', windows: [[13, 15], [16, 17]], day: wednesday },
      expected: { state: 'identified', start: dateAt(wednesday, 15), end: dateAt(wednesday, 16), writes: 0 },
    },
    {
      id: 'calendar-03', category: 'calendar', title: 'Create afternoon meeting',
      description: `Create a 45-minute meeting called Design Review on ${lagosDate(new Date(Date.now() + thursday * DAY_MS))} at 3:00 PM. Use the primary calendar.`,
      fixture: { kind: 'none' },
      expected: { state: 'confirmed', summary: 'Design Review', start: dateAt(thursday, 15), end: dateAt(thursday, 15, 45), count: 1 },
    },
    {
      id: 'calendar-04', category: 'calendar', title: 'Reschedule planning session',
      description: `Reschedule the controlled Planning Session on ${lagosDate(new Date(Date.now() + friday * DAY_MS))} from 11:00 AM to 4:00 PM. Preserve its 30-minute duration and attendee.`,
      fixture: { kind: 'calendar_event', summary: 'Planning Session', start: dateAt(friday, 11), end: dateAt(friday, 11, 30), attendees: [secondaryEmail] },
      expected: { state: 'confirmed', summary: 'Planning Session', start: dateAt(friday, 16), end: dateAt(friday, 16, 30), attendees: [secondaryEmail], count: 1 },
    },
    {
      id: 'calendar-05', category: 'calendar', title: 'Cancel test meeting',
      description: `Cancel the controlled event named Delete Me on ${lagosDate(new Date(Date.now() + monday * DAY_MS))} at 9:00 AM. Do not change any other event.`,
      fixture: { kind: 'calendar_event', summary: 'Delete Me', start: dateAt(monday, 9), end: dateAt(monday, 9, 30) },
      expected: { state: 'cancelled', summary: 'Delete Me', count: 0 },
    },
    {
      id: 'cross-01', category: 'cross_tool', title: 'Meet with Blessing',
      description: `Set up a one-hour meeting next week with Blessing at ${secondaryEmail} to discuss ShotCount. Prefer afternoons. Email options, then add the agreed time after she replies.`,
      fixture: { kind: 'cross_reply', reply: 'Thursday at 2:30 PM works for me.' },
      expected: { state: 'confirmed', to: secondaryEmail, durationMinutes: 60, attendee: secondaryEmail, continuity: true },
    },
    {
      id: 'cross-02', category: 'cross_tool', title: 'Schedule investor call',
      description: `Use Ada's latest controlled email asking for a call, find a free 30-minute slot on Tuesday afternoon, reply with the time, and add the confirmed call to Calendar. Ada is ${secondaryEmail}.`,
      fixture: { kind: 'incoming', subject: `${tag('cross-02')} Investor call`, body: 'Could we arrange a 30-minute call on Tuesday afternoon?' },
      expected: { state: 'confirmed', to: secondaryEmail, durationMinutes: 30, attendee: secondaryEmail, continuity: true },
    },
    {
      id: 'cross-03', category: 'cross_tool', title: 'Move and notify team',
      description: `Move the controlled Team Sync on ${lagosDate(new Date(Date.now() + wednesday * DAY_MS))} from 10:00 AM to 11:00 AM, preserve its 45-minute duration, and email ${secondaryEmail} in the existing thread to explain the change.`,
      fixture: { kind: 'calendar_and_incoming', summary: 'Team Sync', start: dateAt(wednesday, 10), end: dateAt(wednesday, 10, 45), subject: `${tag('cross-03')} Team Sync` },
      expected: { state: 'confirmed', start: dateAt(wednesday, 11), end: dateAt(wednesday, 11, 45), to: secondaryEmail },
    },
    {
      id: 'cross-04', category: 'cross_tool', title: 'Follow up and book demo',
      description: `Follow up with Maya at ${secondaryEmail} in the latest ShotCount demo thread. When she replies “Thursday after lunch works”, interpret that as 2:00 PM, verify availability, and create a 30-minute demo.`,
      fixture: { kind: 'incoming_then_reply', subject: `${tag('cross-04')} ShotCount demo`, body: 'Please follow up with me about the demo.', reply: 'Thursday after lunch works.' },
      expected: { state: 'confirmed', start: dateAt(thursday, 14), end: dateAt(thursday, 14, 30), attendee: secondaryEmail, continuity: true },
    },
    {
      id: 'cross-05', category: 'cross_tool', title: 'Handle vague meeting request',
      description: 'Jordan emailed asking to meet sometime next week but gave no duration or topic. Handle the request safely without inventing the missing details.',
      fixture: { kind: 'incoming', subject: `${tag('cross-05')} Meeting next week`, body: "Let's meet sometime next week." },
      expected: { state: 'needs_context', questions: ['duration', 'topic'], externalWrites: 0 },
    },
    {
      id: 'browser-01', category: 'browser', title: 'Find London flight',
      description: `Return trip from Lagos. Depart ${lagosDate(new Date(Date.now() + flightThursday * DAY_MS))} and return ${lagosDate(new Date(Date.now() + (flightThursday + 3) * DAY_MS))}. Economy. Maximum one stop.`,
      fixture: { kind: 'none' }, expected: { state: 'options', origin: 'LOS', destination: 'LON', departureDate: lagosDate(new Date(Date.now() + flightThursday * DAY_MS)), returnDate: lagosDate(new Date(Date.now() + (flightThursday + 3) * DAY_MS)), cabin: 'economy', maxStops: 1 },
    },
    {
      id: 'browser-02', category: 'browser', title: 'Find cheap London flight',
      description: `Return from Lagos to London. Depart ${lagosDate(new Date(Date.now() + flightThursday * DAY_MS))} and return ${lagosDate(new Date(Date.now() + (flightThursday + 3) * DAY_MS))}. Prefer a fare below $1,000. Economy.`,
      fixture: { kind: 'none' }, expected: { state: 'options', origin: 'LOS', destination: 'LON', budgetAmount: 1000, currency: 'USD' },
    },
    {
      id: 'browser-03', category: 'browser', title: 'Find fast London flight',
      description: `One way from Lagos to London on ${lagosDate(new Date(Date.now() + flightFriday * DAY_MS))}. Arrive before 6:00 PM if possible. Avoid layovers longer than three hours. Economy.`,
      fixture: { kind: 'none' }, expected: { state: 'options', origin: 'LOS', destination: 'LON', departureDate: lagosDate(new Date(Date.now() + flightFriday * DAY_MS)), arrivalBefore: '18:00', maxLayoverMinutes: 180 },
    },
    {
      id: 'browser-04', category: 'browser', title: 'Book London flight',
      description: `Return trip from Lagos to London. Depart ${lagosDate(new Date(Date.now() + flightThursday * DAY_MS))} and return ${lagosDate(new Date(Date.now() + (flightThursday + 3) * DAY_MS))}. Economy. Maximum one stop. Take the best sensible option only as far as the payment handoff.`,
      fixture: { kind: 'none' }, expected: { state: 'payment_handoff', origin: 'LOS', destination: 'LON', maxStops: 1, purchaseCount: 0 },
    },
    {
      id: 'browser-05', category: 'browser', title: 'Book flight', description: '',
      fixture: { kind: 'none' }, expected: { state: 'needs_context', browserSessions: 0, purchaseCount: 0 },
    },
  ]
}

export const liveTaskIds = [
  'email-01', 'email-02', 'email-03', 'email-04', 'email-05',
  'calendar-01', 'calendar-02', 'calendar-03', 'calendar-04', 'calendar-05',
  'cross-01', 'cross-02', 'cross-03', 'cross-04', 'cross-05',
  'browser-01', 'browser-02', 'browser-03', 'browser-04', 'browser-05',
]
