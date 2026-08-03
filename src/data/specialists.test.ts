import { describe, expect, it } from 'vitest'
import {
  REASONING_MODEL_ID,
  createSpecialistHandoff,
  flightStageNeedsPreflightHandoff,
  legacySpecialistRoute,
  nextSpecialistForCapabilityRequest,
  nextSpecialistForTool,
  routeTask,
  routeTaskWithSemanticSpecialist,
  specialistCanUseTool,
  specialistRegistry,
  specialistRequiredEffects,
} from './specialists'

describe('ShotCount specialist contracts', () => {
  it('keeps one versioned registry and one reasoning model', () => {
    expect(Object.keys(specialistRegistry)).toEqual(['roon', 'caspian', 'david'])
    expect(Object.values(specialistRegistry).map(entry => entry.version)).toEqual(['roon@1', 'caspian@1', 'david@1'])
    expect(REASONING_MODEL_ID).toBe('gpt-5.6-luna')
  })

  it('routes communication, travel, and applications from domain semantics', () => {
    const email = routeTask('Follow up with the producer', 'Send the agreed next steps by email.')
    expect(email.primarySpecialistId).toBe('roon')
    expect(email.taskContract).toBe('communication.email')

    const calendar = routeTask('Find a time for the review', 'Check my calendar and schedule the meeting.')
    expect(calendar.primarySpecialistId).toBe('roon')
    expect(calendar.taskContract).toBe('communication.scheduling')

    const flight = routeTask('Compare flights to London', 'Leave from Lagos next Thursday and return Sunday.')
    expect(flight.primarySpecialistId).toBe('caspian')
    expect(flight.stages).toHaveLength(1)

    const application = routeTask('Build my graduate application checklist', 'List the documents and deadlines from the official programme page.')
    expect(application.primarySpecialistId).toBe('david')
    expect(application.taskContract).toBe('applications.planning')
  })

  it('sequences a cross-domain trip in the same run', () => {
    const route = routeTask('Arrange my Antler trip to London', 'Email me the strongest itinerary and put the dates on my calendar.')
    expect(route.primarySpecialistId).toBe('roon')
    expect(route.stages.map(stage => stage.specialistId)).toEqual(['roon', 'caspian', 'roon'])
    expect(route.stages.map(stage => stage.specialistVersion)).toEqual(['roon@1', 'caspian@1', 'roon@1'])
  })

  it('uses Luna only for ambiguous semantic routing', () => {
    const ambiguous = routeTask('Make this happen', 'I need help with an important project.')
    expect(ambiguous.needsSemanticClassification).toBe(true)
    expect(ambiguous.primarySpecialistId).toBeNull()

    const classified = routeTaskWithSemanticSpecialist('Make this happen', 'I need help with an important project.', 'david')
    expect(classified.classification).toBe('semantic')
    expect(classified.primarySpecialistId).toBe('david')

    expect(routeTask('', '').supported).toBe(false)
  })

  it('keeps domain tools isolated', () => {
    expect(specialistCanUseTool('roon', 'gmail.send_message')).toBe(true)
    expect(specialistCanUseTool('roon', 'browser.search_flights')).toBe(false)
    expect(specialistCanUseTool('caspian', 'browser.select_flight')).toBe(true)
    expect(specialistCanUseTool('caspian', 'browser.prepare_flight_checkout')).toBe(true)
    expect(specialistCanUseTool('roon', 'browser.prepare_flight_checkout')).toBe(false)
    expect(specialistCanUseTool('caspian', 'gmail.send_message')).toBe(false)
    expect(specialistCanUseTool('david', 'application.generate_document')).toBe(true)
    expect(specialistCanUseTool('david', 'browser.submit')).toBe(false)
    expect(specialistCanUseTool('david', 'calendar.create_event')).toBe(false)
  })

  it('forwards a next-stage tool only to the registered immediate specialist', () => {
    const route = routeTask('Arrange my Antler trip to London', 'Email me the strongest itinerary and put the dates on my calendar.')
    expect(nextSpecialistForTool(route.stages, 0, 'browser.search_flights')?.specialistId).toBe('caspian')
    expect(nextSpecialistForTool(route.stages, 0, 'calendar.create_event')).toBeNull()
    expect(nextSpecialistForTool(route.stages, 1, 'browser.search_flights')).toBeNull()
  })

  it('preflights a mixed flight task into Caspian without changing its route', () => {
    const route = routeTask('Lagos to London', 'Find a live flight and add the selected itinerary to my calendar.')
    expect(flightStageNeedsPreflightHandoff('flight_search', route.stages[0], route.stages[1])).toBe(true)
    expect(flightStageNeedsPreflightHandoff('flight_search', route.stages[1], route.stages[2])).toBe(false)
    expect(flightStageNeedsPreflightHandoff('flight_search', route.stages[0], undefined)).toBe(false)
  })

  it('forwards a capability-unavailable context request to the registered next stage', () => {
    const route = routeTask('Lagos to London', 'Find a live flight and prepare a calendar reference.')
    expect(nextSpecialistForCapabilityRequest(
      route.stages,
      0,
      'Lagos to London Find a live flight and prepare a calendar reference.',
      'I cannot access the live flight-search capability in this run.',
    )?.specialistId).toBe('caspian')
    expect(nextSpecialistForCapabilityRequest(
      route.stages,
      0,
      'Lagos to London Find a live flight and prepare a calendar reference.',
      'What return date should I use?',
    )).toBeNull()
    expect(nextSpecialistForCapabilityRequest(
      route.stages,
      1,
      'Lagos to London Find a live flight and prepare a calendar reference.',
      'Live Google Flights access is unavailable in this specialist session.',
    )).toBeNull()
  })

  it('derives provider-confirmed effects and preserves them across typed handoff', () => {
    expect(specialistRequiredEffects('roon', 'Send the itinerary by email.', 'communication.email')).toEqual(['gmail_send'])
    expect(specialistRequiredEffects('roon', 'Schedule the meeting without sending an email.', 'communication.scheduling')).toEqual(['calendar_write'])
    expect(specialistRequiredEffects('roon', 'Create a calendar event; no email or invitation.', 'communication.scheduling')).toEqual(['calendar_write'])
    expect(specialistRequiredEffects('roon', 'Do not reply; summarize the message.', 'communication.email')).toEqual([])
    expect(specialistRequiredEffects('caspian', 'Book the selected flight.', 'travel.flight_search')).toEqual(['booking_handoff'])
    expect(specialistRequiredEffects('caspian', 'Find a flight and stop before payment.', 'travel.flight_search')).toEqual(['booking_handoff'])
    expect(specialistRequiredEffects('david', 'Prepare the application documents.', 'applications.planning')).toEqual(['application_plan'])

    const handoff = createSpecialistHandoff({
      taskId: 'task-1',
      agentRunId: 'run-1',
      objective: 'Arrange the trip',
      relevantConstraints: { destination: 'London' },
      completedEffects: ['validated_itinerary'],
      unsatisfiedEffects: ['booking_handoff'],
      providerEvidence: [{ tool_name: 'browser.search_flights', provider_action_id: 'search-1' }],
      approvalState: 'waiting_for_user',
      nextRequiredStage: null,
      fromSpecialistId: 'caspian',
      toSpecialistId: 'roon',
    })
    expect(handoff.fromSpecialistVersion).toBe('caspian@1')
    expect(handoff.toSpecialistVersion).toBe('roon@1')
    expect(handoff.completedEffects).toEqual(['validated_itinerary'])
    expect(handoff.unsatisfiedEffects).toEqual(['booking_handoff'])
  })

  it('keeps event-topic emails separate from Calendar coordination', () => {
    expect(routeTask('Email Ada', 'Tell Ada that the meeting is tomorrow.').taskContract).toBe('communication.email')
    expect(routeTask('Email Ada', 'Tell Ada about the calendar invite already on the schedule.').taskContract).toBe('communication.email')
    expect(routeTask('Email Ada', 'Tell Ada about scheduling the meeting next week.').taskContract).toBe('communication.email')
    expect(routeTask('Email Ada', 'Ask Ada whether scheduling the meeting next week works.').taskContract).toBe('communication.email')
    expect(routeTask('Email Ada', 'Tell Ada about scheduling the meeting, but do not change the Calendar.').taskContract).toBe('communication.email')
    expect(routeTask('Tell Ada', 'Tell Ada about the calendar invite already on the schedule.').taskContract).toBe('communication.email')
    expect(routeTask('Ask Ada', 'Ask Ada to put the meeting on my calendar.').taskContract).toBe('communication.email')
    expect(routeTask('Tell Ada', 'Tell Ada about the meeting; do not add it to my calendar.').taskContract).toBe('communication.email')
    expect(routeTask('Create event', 'Create an event tomorrow.').taskContract).toBe('communication.calendar')
    expect(routeTask('Schedule meeting', 'Schedule a meeting tomorrow.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Set up meeting', 'Set up a meeting tomorrow.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Reschedule meeting', 'Reschedule the meeting to Friday.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Find a free slot', 'Find a free time with Ada next week.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Invite Ada', 'Invite Ada to the meeting next week.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Check availability', 'Check Ada\'s availability for next week.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Check availability', 'Check Ada availability for next week.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Arrange time', 'Arrange time with Ada next week.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Find a time', 'Find a time with Ada next week.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Check availability', 'Check my availability for next week.').taskContract).toBe('communication.calendar')
    expect(routeTask('Check Calendar', 'Check my calendar availability next week.').taskContract).toBe('communication.calendar')
    expect(routeTask('Find a slot', 'Find a free slot on my calendar next week.').taskContract).toBe('communication.calendar')
    expect(routeTask('Roon advice', 'Should I schedule a meeting with Ada?').taskContract).toBe('communication.calendar')
    expect(routeTask('Email Ada', 'Tell Ada the meeting is tomorrow; do not invite her or put it on her calendar.').taskContract).toBe('communication.email')
    expect(routeTask('Create event and email Ada', 'Create the event, but do not invite anyone. Send Ada a confirmation email.').taskContract).toBe('communication.scheduling')
    expect(routeTask('Add event', 'Add the event to my calendar for Thursday.').taskContract).toBe('communication.calendar')
    expect(routeTask('Cancel event', 'Cancel the event tomorrow.').taskContract).toBe('communication.calendar')
  })

  it('migrates legacy domain assignments without relabelling travel or applications as Roon', () => {
    expect(legacySpecialistRoute('Find relevant scholarship programs', 'Focus on Europe.', 'research')?.primarySpecialistId).toBe('roon')
    expect(legacySpecialistRoute('Find a return flight', 'Lagos to London.', 'flight_search')?.primarySpecialistId).toBe('caspian')
    expect(legacySpecialistRoute('Apply to the programme', 'Use the attached CV.', 'browser')?.primarySpecialistId).toBe('david')
    expect(legacySpecialistRoute('Unclear task', '', '')).toBeNull()
  })
})
