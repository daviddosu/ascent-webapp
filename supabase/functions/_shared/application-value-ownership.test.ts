import { describe, expect, it } from 'vitest'
import {
  missingValueOwnerForRequirement,
  programmeMetadataFromContext,
  programmeValueForRequirement,
} from './application-value-ownership.ts'

describe('application value ownership', () => {
  const opportunity = {
    institution: 'Harvard University',
    programme_title: 'Physics PhD',
    entry_term: 'Fall',
    data: {
      currentCycle: { intakeYear: 2027, startTerm: 'Fall' },
      officialUrl: 'https://gsas.harvard.edu/program/physics',
    },
  }

  it('resolves cycle and term from selected programme metadata as one typed value', () => {
    const metadata = programmeMetadataFromContext({
      opportunity,
      name: 'Application cycle and start term',
      canonicalKey: 'application-cycle-start-term',
    })
    expect(metadata).toMatchObject({ applicationCycle: '2027–2028', startTerm: 'Fall' })
    expect(programmeValueForRequirement({
      opportunity,
      name: 'Application cycle and start term',
      canonicalKey: 'application-cycle-start-term',
      source: { suggested_value: '2026' },
    })).toBe('Fall 2027 entry')
  })

  it('repairs stale persisted ownership for unambiguous programme metadata', () => {
    expect(missingValueOwnerForRequirement({
      name: 'Application cycle and start term',
      type: 'official_requirement',
      source: { missing_value_owner: 'applicant' },
    })).toBe('programme')
    expect(missingValueOwnerForRequirement({
      name: 'Applicant transcript',
      type: 'transcript',
      source: { missing_value_owner: 'programme' },
    })).toBe('applicant')
  })

  it('keeps genuine personal choices and provider waits distinct', () => {
    expect(missingValueOwnerForRequirement({ name: 'Which research direction to emphasize', type: 'portal_field' })).toBe('user_choice')
    expect(missingValueOwnerForRequirement({ name: 'Professor reply', type: 'communication' })).toBe('external_provider')
    expect(missingValueOwnerForRequirement({ name: 'Programme fee', type: 'fee' })).toBe('programme')
  })

  it('keeps writer-owned narrative autonomous unless the official rule is editing-only', () => {
    expect(missingValueOwnerForRequirement({
      name: 'Statement of purpose',
      type: 'writer',
      responsible: 'writer',
      exactInstructions: 'Explain your research interests in no more than 1,000 words.',
    })).toBe('programme')
    expect(missingValueOwnerForRequirement({
      name: 'Statement of purpose',
      type: 'writer',
      responsible: 'writer',
      source: { authorship_policy: 'Editing-only assistance; applicant must provide the original draft.' },
    })).toBe('applicant')
  })
})
