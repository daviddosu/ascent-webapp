import type {
  ApplicationPendingInput,
  ApplicationPendingInputField,
  ApplicationPendingInputOption,
} from './david-applications.ts'
import {
  applicationContextOwner,
  applicationContextPriority,
  applicationContextSource,
} from './application-context-broker.ts'
import { missingValueOwnerForRequirement, type MissingValueOwner } from './application-value-ownership.ts'

const documentMimeTypes = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

function option(value: string, label: string, description: string): ApplicationPendingInputOption {
  return { value, label, description }
}

function attachmentField(id: string, label: string, placeholder: string): ApplicationPendingInputField {
  return { id, kind: 'attachment', label, placeholder, required: true, acceptedMimeTypes: documentMimeTypes }
}

function textField(id: string, label: string, placeholder: string, kind: ApplicationPendingInputField['kind'] = 'text'): ApplicationPendingInputField {
  return { id, kind, label, placeholder, required: true, maximumCharacters: 240 }
}

function titleFor(type: string, name: string) {
  if (type === 'admissions_test' || type === 'english_language_test') return testName(name, type)
  if (type === 'transcript') return name || 'Official transcript'
  if (type === 'referee') return 'Add a recommender'
  if (type === 'writer' || type === 'research_proposal') return essayTitle(name, '') && !genericEssayRequirementName.test(name) ? essayTitle(name, '') : 'Prepare the programme essay'
  return name || 'Application item'
}

function testName(name: string, type: string) {
  if (/^tests?\s*1$/i.test(name)) return 'GRE General Test'
  if (/^tests?\s*2$/i.test(name)) return 'Physics GRE Subject Test'
  if (/^tests?\s*3$/i.test(name)) return 'English proficiency test'
  return name || (type === 'english_language_test' ? 'English proficiency test' : 'admissions test')
}

function deadlineText(deadline: string | null) {
  if (!deadline) return 'before the programme deadline'
  const parsed = new Date(deadline)
  if (Number.isNaN(parsed.getTime())) return 'before the programme deadline'
  return `before ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(parsed)}`
}

const genericEssayRequirementName = /^(?:essay|essays)\s*(?:[-—:]\s*)?\d+$/i

function essayInstructionSummary(value: string | null | undefined) {
  const instruction = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:prompt|essay prompt|statement prompt)\s*[:\-]\s*/i, '')
  if (!instruction || /^verify the required essay or statement prompts?/i.test(instruction)) return ''
  return instruction.length > 180 ? `${instruction.slice(0, 177).trimEnd()}…` : instruction
}

function essayTitle(name: string, instructions: string | null | undefined) {
  const summary = essayInstructionSummary(instructions)
  if (summary && genericEssayRequirementName.test(name)) return `Essay: ${summary}`
  if (/^(?:application essays?|essays? and statements?)$/i.test(name) && summary) return `Essay: ${summary}`
  return name
}

function isTranscriptInput(type: string, name = '') {
  return type === 'transcript' || /transcript|academic record|grade report/i.test(`${type} ${name}`)
}

export function applicationPendingInputOptions(type: string, deadline: string | null, name = ''): ApplicationPendingInputOption[] {
  if (type === 'admissions_test' || type === 'english_language_test') {
    return [
      option('have_score', 'I already have a score', 'Attach the result or enter the score next.'),
      option('can_take_before_deadline', 'I can take it before the deadline', `I can complete it ${deadlineText(deadline)}.`),
      option('cannot_take_before_deadline', 'I cannot take it before the deadline', 'I’ll flag the risk and keep the rest of the application moving.'),
    ]
  }
  if (isTranscriptInput(type, name)) {
    return [
      option('have_document', 'I have it — attach it now', 'Attach the required transcript so I can validate it and unlock the dependent application steps.'),
    ]
  }
  if (['degree_certificate', 'proof_of_graduation', 'document', 'artifact_upload', 'credential_evaluation'].includes(type)) {
    return [
      option('have_document', 'I have it — attach it now', 'I’ll check the file and use it if it meets the programme’s rules.'),
    ]
  }
  // Recommendations and narrative work are agent-owned workflows. They do
  // not need a user-facing routing quiz; only the smallest missing fact gets
  // a field below.
  if (type === 'referee' || type === 'writer' || type === 'research_proposal') return []
  // A known applicant fact is rendered as a compact field.  There is no
  // generic now/later/help routing quiz; leaving the field unanswered already
  // means that only its dependent lane is waiting.
  return []
}

export function applicationPendingInputFor(input: {
  id: string
  requirementId: string
  name: string
  type: string
  question: string
  detail: string
  deadline: string | null
  instructions?: string | null
  required?: boolean
  source?: { label?: string | null; url?: string | null; section?: string | null; field?: string | null }
  portal?: string | null
  suggestedValue?: string | number | boolean | null
  missingValueOwner?: MissingValueOwner | null
  programmeValue?: string | number | boolean | null
  blockedRequirementIds?: string[]
}): ApplicationPendingInput {
  const title = input.type === 'writer' || input.type === 'research_proposal'
    ? essayTitle(input.name, input.instructions) || 'Prepare the programme essay'
    : titleFor(input.type, input.name)
  const shared = {
    owner: applicationContextOwner(input.type),
    status: 'active' as const,
    priority: applicationContextPriority(input.type, input.required !== false),
    source: applicationContextSource(input.source ?? {}),
    missingValueOwner: input.missingValueOwner ?? missingValueOwnerForRequirement({
      name: input.name,
      type: input.type,
      responsible: input.source?.label,
      exactInstructions: input.instructions,
      source: input.source ? { ...input.source } : null,
    }),
    blockedRequirementIds: input.blockedRequirementIds ?? [input.requirementId],
    allowLater: !isTranscriptInput(input.type, input.name),
    askedAt: null,
  }
  if (input.type === 'portal_field') {
    const fieldName = String(input.source?.field ?? input.name).trim() || 'application detail'
    const lower = fieldName.toLocaleLowerCase()
    const kind: ApplicationPendingInputField['kind'] = /email/.test(lower) ? 'email'
      : /phone|mobile|telephone/.test(lower) ? 'tel'
        : /date|birth/.test(lower) ? 'date'
          : /number|count|score|gpa/.test(lower) ? 'number'
            : 'text'
    const label = fieldName.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title: `Add ${label}`,
      question: `What should I enter for ${label}?`,
      detail: input.source?.section
        ? `This appears in ${input.source.section}. I’ll enter it and verify the saved value.`
        : 'I found this required field in the application form. I’ll enter it and verify the saved value.',
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      fields: [textField('value', label, `Enter ${label.toLocaleLowerCase()}`, kind)],
      options: [],
      submitLabel: 'Use this answer',
      portalField: {
        portal: input.portal ?? null,
        section: input.source?.section ?? null,
        field: fieldName,
        required: input.required !== false,
        suggestedValue: input.suggestedValue ?? null,
        ...(input.programmeValue !== undefined ? { suggestedValue: input.programmeValue } : {}),
      },
    }
  }
  if (input.type === 'additional_information' || /^additional$/i.test(input.name)) {
    const question = /^additional$/i.test(input.name)
      ? 'What exact detail is missing?'
      : input.question
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title: 'Provide the missing application detail',
      question,
      detail: 'Enter the exact detail. I’ll check it against the programme requirements before using it.',
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      options: [],
      fields: [textField('value', 'Detail', 'Enter the exact detail')],
      submitLabel: 'Save detail',
    }
  }
  const question = input.type === 'admissions_test' || input.type === 'english_language_test'
    ? `Do you already have your ${title} score, or can you take the test ${deadlineText(input.deadline)}?`
    : /^additional$/i.test(input.name)
      ? 'What short detail should I use here?'
    : input.type === 'referee'
      ? 'Who should I contact for your recommendation letter?'
      : input.type === 'writer' || input.type === 'research_proposal'
        ? essayInstructionSummary(input.instructions)
          ? `Write about: ${essayInstructionSummary(input.instructions)}`
          : 'I’m checking the programme instructions and will brief the writer automatically.'
        : input.question
  if (input.type === 'referee') {
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title,
      question,
      detail: 'Enter the full name and email of a lecturer or project supervisor. I’ll prepare the request and keep it ready for your approval.',
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      options: [],
      fields: [
        textField('full_name', 'Full name', 'Enter their full name'),
        textField('email', 'Email address', 'Enter their email address', 'email'),
      ],
      submitLabel: 'Save recommender',
    }
  }
  const genericApplicantFact = !['transcript', 'degree_certificate', 'proof_of_graduation', 'document', 'artifact_upload', 'credential_evaluation', 'admissions_test', 'english_language_test'].includes(input.type) &&
    !['writer', 'research_proposal', 'referee'].includes(input.type)
  if (genericApplicantFact && !applicationPendingInputOptions(input.type, input.deadline, input.name).length) {
    const normalizedName = input.name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'application detail'
    const lowerName = normalizedName.toLocaleLowerCase()
    const fieldKind: ApplicationPendingInputField['kind'] = /email/.test(lowerName) ? 'email'
      : /phone|mobile|telephone/.test(lowerName) ? 'tel'
        : /date|deadline|term|year/.test(lowerName) ? 'date'
          : /number|count|score|gpa/.test(lowerName) ? 'number'
            : 'text'
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title,
      question,
      detail: input.detail,
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      options: [],
      fields: [textField('value', normalizedName, `Enter ${lowerName}`, fieldKind)],
      submitLabel: 'Save detail',
    }
  }
  return {
    ...shared,
    id: input.id,
    requirementId: input.requirementId,
    title,
    question,
    detail: input.type === 'writer' || input.type === 'research_proposal'
      ? essayInstructionSummary(input.instructions)
        ? 'I’ll give the writer this programme instruction and keep the work moving.'
        : 'I’m checking the programme instructions before I brief the writer.'
      : input.detail,
    deadline: input.deadline,
    kind: ['transcript', 'degree_certificate', 'proof_of_graduation', 'document', 'artifact_upload', 'credential_evaluation'].includes(input.type) ? 'document' : 'decision',
    requirementType: input.type,
    options: applicationPendingInputOptions(input.type, input.deadline, input.name),
    fields: [],
  }
}

export function replaceApplicationPendingInput(
  pendingInputs: ApplicationPendingInput[],
  requirementId: string,
  replacement: ApplicationPendingInput,
): ApplicationPendingInput[] {
  const index = pendingInputs.findIndex(item => item.requirementId === requirementId)
  if (index < 0) return [replacement, ...pendingInputs]
  return pendingInputs.map((item, itemIndex) => itemIndex === index ? replacement : item)
}

export function applicationPendingFollowUpFor(input: {
  id: string
  requirementId: string
  name: string
  type: string
  deadline: string | null
  action: string
}): ApplicationPendingInput {
  const title = titleFor(input.type, input.name)
  const shared = {
    owner: applicationContextOwner(input.type),
    status: 'active' as const,
    priority: applicationContextPriority(input.type),
    blockedRequirementIds: [input.requirementId],
    allowLater: !isTranscriptInput(input.type, input.name),
    askedAt: null,
  }
  if (input.action === 'have_score') {
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title,
      question: `How should I record your ${nameForScore(input.name)}?`,
      detail: 'Attach the official result or enter the score exactly as reported. I will verify it before using it.',
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      options: [
        option('attach_score', 'Attach the result', 'Use the official score report if you have it.'),
        option('enter_score', 'Enter the score', 'Type the score exactly as it appears on the result.'),
      ],
      fields: [],
    }
  }
  if (input.action === 'enter_score') {
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title,
      question: `What score did you receive on the ${nameForScore(input.name)}?`,
      detail: 'Enter the result exactly as reported. You can attach the official report afterward if you have it.',
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      options: [],
      fields: [textField('score', 'Your score', 'Enter the score exactly as reported')],
      submitLabel: 'Save score',
    }
  }
  if (input.action === 'attach_score') {
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title,
      question: `Attach your ${nameForScore(input.name)} result`,
      detail: 'Use the official score report. I’ll check it and continue the application.',
      deadline: input.deadline,
      kind: 'document',
      requirementType: input.type,
      options: [],
      fields: [attachmentField('score_report', 'Score report', 'Choose the official result file')],
    }
  }
  if (input.action === 'have_referee') {
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title,
      question: 'Who should I contact for this recommendation?',
      detail: 'Add the recommender’s full name and email. I’ll verify the contact before preparing the request.',
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      options: [],
      fields: [
        textField('full_name', 'Full name', 'Enter their full name'),
        textField('email', 'Email address', 'Enter their email address', 'email'),
      ],
      submitLabel: 'Save recommender',
    }
  }
  if (input.action === 'provide_now') {
    const factName = /^additional$/i.test(input.name) ? 'missing information' : input.name
    return {
      ...shared,
      id: input.id,
      requirementId: input.requirementId,
      title,
      question: `What ${factName.toLocaleLowerCase()} should I use?`,
      detail: 'Enter the exact detail. I’ll check it against the application requirements before using it.',
      deadline: input.deadline,
      kind: 'fact',
      requirementType: input.type,
      options: [],
      fields: [textField('value', factName, `Enter ${factName.toLocaleLowerCase()}`)],
      submitLabel: 'Save detail',
    }
  }
  return applicationPendingInputFor({
    id: input.id,
    requirementId: input.requirementId,
    name: input.name,
    type: input.type,
    question: `What should I know about ${input.name.toLocaleLowerCase()}?`,
    detail: 'Choose an option so I can keep the application moving.',
    deadline: input.deadline,
  })
}

function nameForScore(name: string) {
  return name.replace(/\b(?:score|result)\b/gi, '').replace(/\s+/g, ' ').trim() || 'test'
}
