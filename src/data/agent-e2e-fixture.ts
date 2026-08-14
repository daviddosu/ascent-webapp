import type { AgentApproval, AgentRun } from './agent'
import type { Task } from './planner-model'

const runs = new Map<string, AgentRun>()
const approvals = new Map<string, AgentApproval>()

function timestamp() {
  return new Date().toISOString()
}

function save(run: AgentRun) {
  const updated = { ...run, durable: true, updatedAt: timestamp() }
  runs.set(updated.id, updated)
  return updated
}

function approvalFor(
  run: AgentRun,
  kind: AgentApproval['kind'],
  title: string,
  summary: string,
  preview: Record<string, unknown>,
) {
  const approval: AgentApproval = {
    id: `e2e-approval-${run.id}-${kind}`,
    runId: run.id,
    actionId: `e2e-action-${run.id}-${kind}`,
    status: 'pending',
    kind,
    title,
    summary,
    payload: { preview },
    version: 1,
    expiresAt: null,
  }
  approvals.set(run.id, approval)
  return approval
}

function completedResult(summary: string, externalChangeConfirmed: boolean) {
  return {
    summary,
    sections: [],
    drafts: [],
    followUps: [],
    sources: [],
    outcome: {
      preparedResult: !externalChangeConfirmed,
      externalChangeConfirmed,
      paymentBoundaryReached: false,
      purchaseConfirmed: false,
    },
  }
}

export function startFixtureRun(task: Task, initial: AgentRun) {
  const lowerTitle = task.title.toLocaleLowerCase()
  const base: AgentRun = {
    ...initial,
    status: 'needs_approval',
    currentStep: 3,
    progressIndex: 3,
    progress: [
      'Opened the task context',
      lowerTitle.includes('meeting') ? 'Checked Calendar availability' : 'Reviewed relevant Gmail threads',
      'Prepared the exact outreach',
    ],
    waitingReason: 'Review the exact message before ShotCount sends it.',
    result: null,
    durable: true,
    updatedAt: timestamp(),
  }

  if (base.capability === 'flight_search') {
    return save({
      ...base,
      status: 'waiting_for_user',
      currentStep: 4,
      waitingReason: 'Three live options are ready. Choose one to continue.',
      result: {
        summary: 'Compared live return-flight options that match your constraints.',
        sections: [],
        drafts: [],
        followUps: [],
        sources: [{ title: 'Google Flights', url: 'https://www.google.com/travel/flights' }],
        flightOptions: [
          {
            id: 'e2e-flight-best',
            label: 'Best overall',
            airline: 'British Airways',
            departureTime: '09:00',
            arrivalTime: '16:20',
            duration: '7h 20m',
            route: 'LOS → LHR',
            stops: 'Direct',
            price: '$842',
            currency: 'USD',
            provider: 'Google Flights',
          },
          {
            id: 'e2e-flight-cheapest',
            label: 'Cheapest',
            airline: 'Royal Air Maroc',
            departureTime: '05:15',
            arrivalTime: '15:40',
            duration: '10h 25m',
            route: 'LOS → LHR',
            stops: '1 stop',
            price: '$671',
            currency: 'USD',
            provider: 'Google Flights',
          },
          {
            id: 'e2e-flight-fastest',
            label: 'Fastest',
            airline: 'Virgin Atlantic',
            departureTime: '10:20',
            arrivalTime: '17:25',
            duration: '7h 05m',
            route: 'LOS → LHR',
            stops: 'Direct',
            price: '$918',
            currency: 'USD',
            provider: 'Google Flights',
          },
        ],
        outcome: {
          preparedResult: true,
          externalChangeConfirmed: false,
          paymentBoundaryReached: false,
          purchaseConfirmed: false,
        },
      },
    })
  }

  if (base.capability === 'scheduling') {
    approvalFor(
      base,
      'send_email',
      'Send these meeting options?',
      'Outreach to Blessing with two available times.',
      {
        to: ['blessing@example.com'],
        subject: 'ShotCount launch meeting',
        body_text: 'Hi Blessing,\n\nWould Tuesday at 2:00 PM or Thursday at 2:30 PM work for a ShotCount launch meeting?',
      },
    )
  } else {
    approvalFor(
      base,
      'send_email',
      'Send the prepared follow-up?',
      'One controlled follow-up is ready.',
      {
        to: ['investor@example.com'],
        subject: 'Re: ShotCount',
        body_text: 'Hi — following up on the ShotCount note I sent last week. Would you like a short demo?',
      },
    )
  }
  return save(base)
}

export function fixtureRuns() {
  return [...runs.values()]
}

export function fixtureApprovals(runId: string) {
  const approval = approvals.get(runId)
  return approval ? [approval] : []
}

export function invokeFixtureAction(body: Record<string, unknown>) {
  const action = String(body.action ?? '')
  const runId = String(body.runId ?? '')

  if (action === 'approve' || action === 'reject') {
    const approvalId = String(body.approvalId ?? '')
    const entry = [...approvals.entries()].find(([, approval]) => approval.id === approvalId)
    if (!entry) throw new Error('The test approval is no longer pending.')
    const [approvalRunId, approval] = entry
    const run = runs.get(approvalRunId)
    if (!run) throw new Error('The test AgentRun is missing.')
    approvals.delete(approvalRunId)
    if (action === 'reject') {
      return save({ ...run, status: 'waiting_for_user', waitingReason: 'The proposed action was declined.' })
    }
    if (approval.kind === 'calendar_write') {
      return save({
        ...run,
        status: 'completed',
        waitingReason: '',
        currentStep: 8,
        result: completedResult('Meeting scheduled for Thursday at 2:30 PM. Google Calendar confirmed the event.', true),
      })
    }
    if (run.capability === 'scheduling') {
      return save({
        ...run,
        status: 'waiting_external',
        waitingReason: 'Waiting for Blessing to reply.',
        currentStep: 5,
      })
    }
    return save({
      ...run,
      status: 'completed',
      waitingReason: '',
      currentStep: 5,
      result: completedResult('Gmail confirmed the approved follow-up was sent.', true),
    })
  }

  const run = runs.get(runId)
  if (!run) throw new Error('The test AgentRun is missing.')

  if (action === 'poll') {
    const updated = save({
      ...run,
      status: 'needs_approval',
      waitingReason: 'Blessing replied. Review the exact Calendar event.',
      currentStep: 7,
      progress: [...run.progress, 'Received Blessing’s reply', 'Prepared the Calendar event'],
    })
    approvalFor(
      updated,
      'calendar_write',
      'Add the confirmed meeting?',
      'Thursday at 2:30 PM is ready for Calendar.',
      {
        summary: 'ShotCount launch meeting with Blessing',
        description: 'Discuss the ShotCount launch.',
        start: '2026-07-30T14:30:00+01:00',
        end: '2026-07-30T15:00:00+01:00',
      },
    )
    return updated
  }

  if (action === 'select_flight') {
    const option = run.result?.flightOptions?.find(item => item.id === String(body.optionId ?? ''))
    if (!option) throw new Error('The selected test flight is unavailable.')
    return save({
      ...run,
      status: 'waiting_for_user',
      waitingReason: 'Your itinerary is selected and ready for payment.',
      currentStep: 6,
      result: {
        ...run.result!,
        selectedFlight: option,
        paymentHandoffUrl: 'https://www.google.com/travel/flights/booking',
        paymentHandoffProvider: 'Google Flights',
        paymentHandoffStage: 'google_booking_options',
        flightCheckout: {
          paymentBoundaryReached: true,
          preparedTravelerCount: 1,
        },
        outcome: {
          preparedResult: true,
          externalChangeConfirmed: false,
          paymentBoundaryReached: true,
          purchaseConfirmed: false,
        },
      },
    })
  }

  if (action === 'cancel') {
    return save({ ...run, status: 'cancelled', waitingReason: '' })
  }

  return save(run)
}
