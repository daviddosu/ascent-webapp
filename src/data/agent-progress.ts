export type AgentProgressTimeline = {
  completed: string[]
  active: string | null
}

export const PROGRESS_DETAIL_VISIBLE_COUNT = 5 as const

export type ManualContinuationPolicy = {
  userDecisionRequired: boolean
  userInitiatedPauseCanResume: boolean
}

/** Continue is a user decision affordance, never a generic scheduler button. */
export function canUserContinueManually(policy: ManualContinuationPolicy) {
  return policy.userDecisionRequired || policy.userInitiatedPauseCanResume
}

export type PendingInputProgressItem = {
  fields?: unknown[]
  options?: Array<{ value?: string }>
  status?: string
  priority?: number
}

/** Keep a newly actionable follow-up visible even when an older run appended it. */
export function prioritizePendingInputs<T extends PendingInputProgressItem>(items: T[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const priority = (entry: PendingInputProgressItem) =>
        entry.status === 'parked' ? 3
          : Number.isFinite(entry.priority) ? Number(entry.priority)
            : entry.fields?.length || entry.options?.some(option => ['attach_score', 'enter_score'].includes(option.value ?? '')) ? 0 : 50
      return priority(left.item) - priority(right.item) || left.index - right.index
    })
    .map(entry => entry.item)
}

export function progressDetailWindow<T>(items: T[], maximum = PROGRESS_DETAIL_VISIBLE_COUNT) {
  const limit = Math.max(1, Math.min(PROGRESS_DETAIL_VISIBLE_COUNT, Math.floor(maximum)))
  return {
    visible: items.slice(0, limit),
    overflow: items.slice(limit),
  }
}

function cleanProgressLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function progressMomentKey(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[.!?…]+$/g, '')
    .replace(/\b(?:finding|found)\b/g, 'find')
    .replace(/\b(?:preparing|prepared)\b/g, 'prepare')
    .replace(/\b(?:checking|checked)\b/g, 'check')
    .replace(/\b(?:opening|opened)\b/g, 'open')
    .replace(/\b(?:choosing|chosen)\b/g, 'choose')
    .replace(/\b(?:submitting|submitted)\b/g, 'submit')
    .replace(/\b(?:moving|moved)\b/g, 'move')
    .replace(/\s+/g, ' ')
    .trim()
}

const progressLabels = new Map<string, string>([
  ['Started an isolated browser session.', 'Opened the browser.'],
  ['Reused the task-owned browser session.', 'Resumed the task.'],
  ['Observed the isolated browser session.', 'Checked the latest page.'],
  ['Opened the allowed public webpage.', 'Opened the page.'],
  ['Opening the allowed public webpage.', 'Opening the page…'],
  ['Found the right page.', 'Opened the page.'],
  ['Finding the right page.', 'Opening the page…'],
  ['Prepared the public webpage.', 'Prepared the next step.'],
  ['Preparing the public webpage.', 'Preparing the next step.'],
  ['Submitted the exact approved public form.', 'Submitted the form.'],
  ['Submitting the exact approved public form.', 'Submitting the form…'],
  ['David is entering the canonical application controller.', 'I’m taking the lead on your application.'],
  ['David is creating the single verified application case.', 'Setting up the application.'],
  ['David is continuing the application workflow.', 'I’m moving your application forward.'],
  ['David is resuming from the last verified application state.', 'I’m picking up from the last confirmed step.'],
  ['David is preparing the first verified operation.', 'I’m getting started.'],
  ['David is preparing the next verified operation.', 'I’m choosing the best next move.'],
  ['David is verifying the completion evidence.', 'I’m checking that every step is on track.'],
  ['Roon is repairing the task-owned browser domain configuration.', 'I’m fixing the browser connection.'],
])

function applicationProgressTitleCopy(label: string, context = '') {
  const compact = label.replace(/[.!?…]+$/g, '').trim().replace(/\s+requirement$/i, '')
  const surroundingText = `${label} ${context}`

  if (/^tests?\s*1$/i.test(compact)) return 'Take the GRE General Test'
  if (/^tests?\s*2$/i.test(compact)) return 'Take the Physics GRE Subject Test'
  if (/^tests?\s*3$/i.test(compact)) return 'Take an English proficiency test'
  if (/^gre general test$/i.test(compact)) return 'Take the GRE General Test'
  if (/^physics gre subject test$/i.test(compact)) return 'Take the Physics GRE Subject Test'
  if (/^(?:english proficiency test|toefl)(?:\s*\(toefl\))?$/i.test(compact)) return 'Take an English proficiency test'
  const essayPrompt = compact.match(/^essay\s*:\s*(.+)$/i)
  if (essayPrompt) return `Write about: ${essayPrompt[1]}`
  if (/^(?:(?:essay|essays)\s*(?:[-—:]\s*)?\d+|application requirements?\s*[-—:]\s*(?:essay|essays)\s*[-—:]\s*\d+)$/i.test(compact)) return 'Prepare the programme essay'
  if (/^(?:application essays?(?: and statements?)?|essays? and statements?)$/i.test(compact)) return 'Prepare the programme essays'
  if (/^additional$/i.test(compact)) {
    if (/\b(?:physics|area|field|speciali[sz]ation|subfield)\b/i.test(surroundingText)) return 'Choose your physics area'
    if (/\b(?:document|transcript|attach|upload|file)\b/i.test(surroundingText)) return 'Add the missing document'
    return 'Add the missing information'
  }
  if (/^(?:official )?transcript(?:s)?$/i.test(compact)) return 'Get your official transcript'
  if (/^(?:recommendation letters?|references?)$/i.test(compact)) return 'Get your recommendation letters'
  if (/^(?:tailored )?(?:cv|resume|résumé|curriculum vitae)$/i.test(compact)) return 'Prepare your CV'
  if (/^(?:statement of purpose|personal statement)$/i.test(compact)) return 'Write your statement of purpose'
  if (/^research proposal$/i.test(compact)) return 'Prepare your research proposal'
  if (/^application form$/i.test(compact)) return 'Complete the application form'
  if (/^application fee$/i.test(compact)) return 'Checking the application fee'
  return ''
}

function applicationRequirementCopy(value: string, context = '') {
  const compact = value.trim().replace(/\s+requirement$/i, '')
  if (/^tests?\s*1$/i.test(compact)) return 'GRE General Test'
  if (/^tests?\s*2$/i.test(compact)) return 'Physics GRE Subject Test'
  if (/^tests?\s*3$/i.test(compact)) return 'English proficiency test'
  if (/^additional$/i.test(compact)) {
    if (/\b(?:physics|area|field|speciali[sz]ation|subfield)\b/i.test(context)) return 'physics area'
    if (/\b(?:document|transcript|attach|upload|file)\b/i.test(context)) return 'missing document'
    return 'missing information'
  }
  return compact.toLocaleLowerCase()
}

/**
 * Workstream titles are requirement names in durable state, not instructions
 * written for a person. Give them a clear verb before showing them in the
 * progress panel, while keeping the stored requirement name unchanged.
 */
export function humanizeApplicationProgressTitle(value: unknown, context = '') {
  const label = cleanProgressLabel(value)
  if (!label) return ''
  return applicationProgressTitleCopy(label, context) || humanizeAgentProgressLabel(label)
}

function plainProgressCopy(label: string) {
  if (/^Attached immutable evidence to the application case\.$/i.test(label)) return 'Saved the supporting evidence.'
  if (/^Created the writer assignment with source materials and SLA deadline\.$/i.test(label)) return 'Assigned the work to the writer.'
  if (/^Approved the exact derived work-sample artifact;/i.test(label)) return 'Approved the work sample. I still need to confirm it on the application page.'
  if (/^Verified the exact work-sample (?:URL|filename).*portal read-back/i.test(label)) return 'Confirmed the work-sample upload.'
  if (/^The exact work-sample upload was already verified/i.test(label)) return 'The work-sample upload was already confirmed.'
  if (/^Updated the canonical academic evidence map/i.test(label)) return 'Checked the academic records and delivery plan.'
  if (/^Academic evidence map updated with \d+ blocker/i.test(label)) return 'Found items that still need attention in the academic records.'
  if (/^Prepared the canonical recommendation strategy/i.test(label)) return 'Prepared the recommendation plan. No message was sent.'
  if (/^Prepared a source-linked referee support pack/i.test(label)) return 'Prepared the referee support pack. No message was sent.'
  if (/^Prepared the research-backed supervisor dossier/i.test(label)) return 'Prepared the supervisor outreach package. Nothing was sent.'
  if (/^Prepared the canonical research-proposal brief for (.+)\.$/i.test(label)) {
    return label.replace(/^Prepared the canonical research-proposal brief/i, 'Prepared the research-proposal brief')
  }
  if (/^The proposal passed deterministic review and is awaiting applicant approval\.$/i.test(label)) return 'The proposal passed review and is ready for your approval.'
  if (/^The proposal is blocked by /i.test(label)) return 'The proposal needs changes before I can prepare the final file.'
  if (/^Created the approved, LaTeX-formatted research-proposal PDF/i.test(label)) return 'Created the research-proposal PDF. It’s ready to upload.'
  if (/^Verified the exact research-proposal upload/i.test(label)) return 'Confirmed the research-proposal upload.'
  if (/^The verified programme shortlist is ready for selection\.$/i.test(label)) return 'Choose a programme from the shortlist.'
  if (/^(?:Reused|Created) the (?:durable )?application case(?: and its requirements)?\.$/i.test(label)) return label.startsWith('Reused') ? 'Resumed the application.' : 'Set up the application and its to-do list.'
  if (/^Attached the application contact to this case/i.test(label)) return 'Added the application contact.'
  if (/^No work-sample or portfolio requirement was found/i.test(label) || /^Verified that the official programme source explicitly prohibits/i.test(label) || /^The official programme source explicitly prohibits/i.test(label)) return 'Checked the programme: no work sample is required.'
  if (/^Prepared the exact application readiness package for approval\.$/i.test(label)) return 'Prepared the application for your approval.'
  if (/^Readiness report found \d+ blocker/i.test(label)) {
    const count = Number(label.match(/^Readiness report found (\d+)/i)?.[1] ?? 0)
    return `Found ${count} thing${count === 1 ? '' : 's'} to fix before submission.`
  }
  if (/^Converted supervisor feedback into a typed, source-linked revision plan\.$/i.test(label)) return 'Turned supervisor feedback into a revision plan.'
  if (/^I’m taking care of this now\.$/i.test(label)) return 'Working on this now.'
  if (/^I can work on this independently while you handle the items waiting on you\.$/i.test(label)) return 'Working on this while you handle the items waiting on you.'
  if (/^You can add this while I continue with the other work\.$/i.test(label) || /^This is waiting on you\. I’ll keep moving on the rest of the application\.$/i.test(label)) return 'Add this when you’re ready. I’ll keep working on the rest.'
  if (/^Needs a decision before it can continue\.$/i.test(label)) return 'Choose what to do next.'
  if (/^Queued behind the current application work\.$/i.test(label)) return 'I’ll start this after its dependencies are ready.'
  if (/^Available after its dependencies are verified\.$/i.test(label)) return 'Waiting for its dependencies to be verified.'
  return ''
}

function friendlyRecoveryMessage(label: string) {
  if (/production reasoning connection needs to be refreshed/i.test(label)) {
    return 'ShotCount needs a quick connection refresh before it can continue this task.'
  }
  const applicationRequirement = label.match(/^Resolve the (.+?) requirement\.\s*(.*)$/i)
  if (applicationRequirement) {
    const detail = applicationRequirement[2].trim()
    const requirement = applicationRequirementCopy(applicationRequirement[1], detail)
    if (/no verified transcript artifact and a conflicting education record/i.test(detail)) {
      return 'I need your official transcript to continue. I couldn’t find one in your uploaded material, and the education details don’t match. Attach the correct transcript or tell me which education record is accurate.'
    }
    if (/no verified/i.test(detail)) {
      return `I need the ${requirement} before I can continue. Please attach it or add the missing details.`
    }
    if (/conflicting (?:.+?) record|conflicting information/i.test(detail)) {
      return `I found conflicting information about your ${requirement}. Please tell me which details are correct.`
    }
    return `I need one more thing for your application: ${requirement}. I’ll continue as soon as it’s confirmed.`
  }
  if (/\bsign in\b|authentication required|reconnect (?:google|your account)/i.test(label)) {
    return 'Sign in to continue, then I’ll pick up from the last confirmed step.'
  }
  if (/official requirement.*candidate evidence.*(?:bounded )?decision/i.test(label)) {
    return 'I’ve checked the programme requirements and your material. I just need your decision on this next step.'
  }
  if (/required external effect remained unsatisfied after bounded same-run continuations/i.test(label)) {
    return 'I hit a snag finishing this step. Your progress is saved, and I’m finding a safer way forward.'
  }
  if (/bounded semantic decision remained invalid|evidence_invalid|application_semantic_handoff/i.test(label)) {
    return 'I found a mismatch in the details, so I’m double-checking the application before I move on.'
  }
  if (/application_funding_evidence_required/i.test(label)) {
    return 'I’m confirming the funding details from an official source before I move on.'
  }
  if (/application_applicant_evidence_required/i.test(label)) {
    return 'I’m matching this requirement to your documents before I move on.'
  }
  if (/browser[_ -]?(?:domain|allowlist)|outside the task/i.test(label)) {
    return 'I’m opening the page for this step.'
  }
  if (/\b(?:bounded|semantic|controller|ledger|idempotency|continuation|provider action)\b/i.test(label) || /\b[a-z]+(?:_[a-z]+){1,}\b/i.test(label)) {
    return 'I found something to double-check before I move on. Your progress is saved.'
  }
  if (/\bbounded decision\b/i.test(label)) {
    return 'I’ve checked what I can. I need your decision on this next step.'
  }
  if (/model_reasoning_luna|application_controller_repair_exhausted|idempotency|provider[_ -]?action|external effect|semantic decision|bounded (?:repair|continuation)|controller|ledger/i.test(label)) {
    return 'I hit a snag while checking this step. Your progress is saved, and I’m choosing the safest next move.'
  }
  return ''
}

/**
 * Durable progress is also audit history, so it intentionally retains the
 * precise worker wording. This adapter keeps that history intact while giving
 * people a single, clear activity statement in the product.
 */
export function humanizeAgentProgressLabel(value: unknown) {
  const label = cleanProgressLabel(value)
  if (!label) return ''
  const exact = progressLabels.get(label)
  if (exact) return exact
  const titleCopy = applicationProgressTitleCopy(label)
  if (titleCopy) return titleCopy
  const plainCopy = plainProgressCopy(label)
  if (plainCopy) return plainCopy
  const recovery = friendlyRecoveryMessage(label)
  if (recovery) return recovery

  const externalWait = label.match(/^(.+?) is waiting for the external update:\s*(.+)$/i)
  if (externalWait) return humanizeAgentProgressLabel(externalWait[2])

  const progressive = label
    .replace(/\btask-owned browser session\b/gi, 'browser session')
    .replace(/\bisolated browser session\b/gi, 'browser session')
    .replace(/\ballowed public webpage\b/gi, 'page')
    .replace(/\bverified website page\b/gi, 'page')
    .replace(/\bcurrent website state\b/gi, 'latest page')
    .replace(/\bprovider-confirmed\b/gi, 'confirmed')
    .replace(/\bimmutable evidence\b/gi, 'supporting evidence')
    .replace(/\bcanonical\b/gi, 'current')
    .replace(/\bapplication case\b/gi, 'application')
    .replace(/\bportal checkpoint\b/gi, 'application page')
    .replace(/\bread-back\b/gi, 'page check')
    .replace(/\bSLA\b/gi, 'deadline')
    .replace(/\bartifact\b/gi, 'file')
    .replace(/\bverified applicant material\b/gi, 'your documents')
    .replace(/\btyped handoff\b/gi, 'handoff')
    .replace(/^(?:David|Roon|ShotCount) is\s+/i, 'I’m ')

  for (const [imperative, active] of [
    [/^Search\s+/i, 'Searching '],
    [/^Check\s+/i, 'Checking '],
    [/^Match\s+/i, 'Matching '],
    [/^Find\s+/i, 'Finding '],
    [/^Open\s+/i, 'Opening '],
    [/^Read\s+/i, 'Reading '],
    [/^Review\s+/i, 'Reviewing '],
    [/^Verify\s+/i, 'Verifying '],
  ] as const) {
    if (imperative.test(progressive)) return progressive.replace(imperative, active)
  }
  return progressive
}

/**
 * Builds the visible timeline from durable facts only. There is never a
 * client-side list of anticipated steps: a row is complete only when it is
 * present in `progress`, and the one active row comes from live state.
 */
export function agentProgressTimeline(input: {
  completed: unknown[]
  current?: string | null
  waitingReason?: string | null
  status?: string | null
}): AgentProgressTimeline {
  const waitingReason = humanizeAgentProgressLabel(input.waitingReason)
  const isLive = !input.status || ['planning', 'running', 'waiting_external'].includes(input.status)
  const active = isLive
    ? input.status === 'waiting_external'
      ? waitingReason
      : humanizeAgentProgressLabel(input.current)
    : ''
  const completed = input.completed
    .map(humanizeAgentProgressLabel)
    .filter(Boolean)
    .filter(label => !active || progressMomentKey(label) !== progressMomentKey(active))
    .reduce<string[]>((timeline, label) => {
      const key = progressMomentKey(label)
      if (!timeline.some(item => progressMomentKey(item) === key)) timeline.push(label)
      return timeline
    }, [])
    .slice(-(PROGRESS_DETAIL_VISIBLE_COUNT - 1))

  return {
    completed,
    active: active && (!completed.length || progressMomentKey(active) !== progressMomentKey(completed[completed.length - 1])) ? active : null,
  }
}
