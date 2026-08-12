import { describe, expect, it } from 'vitest'
import { compileLatex } from '../api/application-cv.js'
import { renderResearchProposalLatex } from '../supabase/functions/_shared/research-proposal-pdf'
import type { ProposalDraft, ResearchProposalRequirement } from '../supabase/functions/_shared/research-proposal-workflow'

const requirement = {
  id: 'requirement-compile-1', applicationCaseId: 'case-compile-1', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil', proposalType: 'full_research_proposal', requirementState: 'required', required: true, stage: 'portal', deadline: null, uploadLocation: 'Research documents', submissionMethod: 'application portal', wordLimit: 1_800, pageLimit: null, requiredSections: ['Background', 'Methodology'], prohibitedSections: [], evaluationCriteria: [], citationRules: { style: null, referencesRequired: null, referencesIncludedInWordCount: null, identifierRequired: false, other: [] }, formatRequirements: { fileTypes: ['.pdf'], font: null, fontSize: null, margins: null, lineSpacing: null, header: null, filenamePattern: null, maxFileSizeBytes: null, other: [] }, supervisorReviewExpected: true, supervisorContactBeforeDrafting: null, topicMode: 'applicant_defined', sources: [], confidence: 1, retrievalDate: '2026-08-12T00:00:00.000Z', exactInstructions: '', unresolvedFields: [],
} as ResearchProposalRequirement

const draft = {
  id: 'draft-compile-1', version: 1, applicationCaseId: 'case-compile-1', applicantName: 'Ada Okafor', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal', filename: 'Ada_Okafor_proposal_v1.pdf', fileType: 'application/pdf', body: 'Background\nA grounded research problem.\n\nMethodology\nA reproducible evaluation.', sections: ['Background', 'Methodology'], pageCount: 1, citations: [], sourceFactIds: ['fact-1'], sourceEvidenceIds: ['source-1'], formatMetadata: {}, artifactId: null, checksum: null, receivedAt: '2026-08-12T00:00:00.000Z',
} as ProposalDraft

describe('canonical research-proposal LaTeX compiler integration', () => {
  it('compiles the renderer output through the same server-side compiler route', async () => {
    const rendered = renderResearchProposalLatex({ draft, requirement, proposalTitle: 'A grounded research proposal' })
    const compiled = await compileLatex(rendered.latex, { expectedName: draft.applicantName, auxiliaryFiles: rendered.auxiliaryFiles })
    expect(compiled.pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(compiled.atsText).toContain('Ada Okafor')
    expect(compiled.pageCount).toBeGreaterThanOrEqual(1)
  }, 30_000)
})
