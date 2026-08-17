import { assertEquals } from 'jsr:@std/assert@1'
import {
  canUseOfficialRequirementEvidence,
  fundingCitationSupportsFullFunding,
  officialCitationSupportsRequirement,
  requiresApplicantSpecificEvidence,
} from './application-requirement-evidence.ts'

Deno.test('official policy evidence stays separate from applicant-specific evidence', () => {
  const applicantRequirements = [
    'Academic performance',
    'Research experience',
    'Letters of recommendation',
    'GRE General Test',
    'Physics GRE Subject Test',
    'Broad physics area selection',
  ]
  for (const name of applicantRequirements) {
    assertEquals(requiresApplicantSpecificEvidence({ name }), true, name)
    assertEquals(canUseOfficialRequirementEvidence({ name }), false, name)
  }
})

Deno.test('official pages may verify a deadline and full doctoral funding only when the excerpt supports each fact', () => {
  const funding = { name: 'Doctoral funding', requirement_type: 'funding' }
  const deadline = { name: 'Application deadline' }
  const fundingExcerpt = 'Stanford commits to funding five years of doctoral programs for all admitted students in good academic standing.'
  const deadlineExcerpt = 'The application submission deadline is 11:59pm Pacific Time on December 14.'

  assertEquals(canUseOfficialRequirementEvidence(funding), true)
  assertEquals(fundingCitationSupportsFullFunding(fundingExcerpt), true)
  assertEquals(officialCitationSupportsRequirement(funding, fundingExcerpt), true)
  assertEquals(officialCitationSupportsRequirement(deadline, deadlineExcerpt), true)
  assertEquals(officialCitationSupportsRequirement(funding, 'Funding may be available from several sources.'), false)
})
