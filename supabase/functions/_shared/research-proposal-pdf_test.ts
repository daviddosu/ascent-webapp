import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { renderResearchProposalLatex, validateResearchProposalLatex } from './research-proposal-pdf.ts'
import type { ProposalDraft, ResearchProposalRequirement } from './research-proposal-workflow.ts'

function requirement(overrides: Partial<ResearchProposalRequirement> = {}) {
  return {
    id: 'requirement-1', applicationCaseId: 'case-1', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil', proposalType: 'full_research_proposal', requirementState: 'required', required: true, stage: 'portal', deadline: null, uploadLocation: 'Research documents', submissionMethod: 'application portal', wordLimit: 1_800, pageLimit: null, requiredSections: ['Background', 'Methodology'], prohibitedSections: [], evaluationCriteria: [], citationRules: { style: null, referencesRequired: null, referencesIncludedInWordCount: null, identifierRequired: false, other: [] }, formatRequirements: { fileTypes: ['.pdf'], font: null, fontSize: null, margins: null, lineSpacing: null, header: null, filenamePattern: null, maxFileSizeBytes: null, other: [] }, supervisorReviewExpected: true, supervisorContactBeforeDrafting: null, topicMode: 'applicant_defined', sources: [], confidence: 1, retrievalDate: '2026-08-12T00:00:00.000Z', exactInstructions: '', unresolvedFields: [], ...overrides,
  } as ResearchProposalRequirement
}

function draft(overrides: Partial<ProposalDraft> = {}) {
  return {
    id: 'draft-1', version: 1, applicationCaseId: 'case-1', applicantName: 'Ada Okafor', institution: 'Northbridge University', programme: 'DPhil Computational Physics', degree: 'DPhil', supervisor: 'Professor Grace Nwosu', proposalType: 'full_research_proposal', filename: 'Ada_Okafor_proposal_v1.pdf', fileType: 'application/pdf', body: 'Background\nScientific simulation needs reliable uncertainty estimates.\n\nResearch question\nHow should uncertainty be calibrated?\n\nMethodology\nWe will compare calibrated estimators against a numerical baseline.\n\nExpected contribution\nA bounded and reproducible evaluation.\n\nReferences\nOkafor, A. (2024). Calibrated surrogate models.', sections: ['Background', 'Research question', 'Methodology', 'Expected contribution', 'References'], pageCount: 1, citations: [], sourceFactIds: ['fact-1'], sourceEvidenceIds: ['source-1'], formatMetadata: {}, artifactId: null, checksum: null, receivedAt: '2026-08-12T00:00:00.000Z', ...overrides,
  } as ProposalDraft
}

Deno.test('renders a safe, polished academic proposal template', () => {
  const rendered = renderResearchProposalLatex({ draft: draft({ body: 'Background\nAda Okafor’s proposal uses calibrated models.\n\nMethodology\nA reproducible evaluation.', sections: ['Background', 'Methodology'] }), requirement: requirement(), proposalTitle: 'Uncertainty calibration for detector reconstruction' })
  assertStringIncludes(rendered.latex, '% SHOTCOUNT_CANONICAL_RESEARCH_PROPOSAL')
  assertStringIncludes(rendered.latex, '\\documentclass[a4paper]{article}')
  assertStringIncludes(rendered.latex, '\\input{paper}')
  assertStringIncludes(rendered.latex, '\\bibliography{refs}')
  assertStringIncludes(rendered.auxiliaryFiles.find(file => file.filename === 'paper.tex')?.content ?? '', '\\section{Background}')
  assertStringIncludes(rendered.auxiliaryFiles.find(file => file.filename === 'paper.tex')?.content ?? '', "Ada Okafor's proposal")
  assertEquals(validateResearchProposalLatex(rendered.latex), [])
  assertEquals(rendered.templateId, 'uc_shss_research_proposal_v1')
  assert(rendered.sectionsRendered.includes('Methodology'))
})

Deno.test('honours bounded programme formatting requirements without allowing arbitrary LaTeX', () => {
  const rendered = renderResearchProposalLatex({ draft: draft(), requirement: requirement({ formatRequirements: { fileTypes: ['.pdf'], font: 'Arial', fontSize: '12pt', margins: '2.5 cm', lineSpacing: '1.5', header: null, filenamePattern: null, maxFileSizeBytes: null, other: ['US letter'] } }) })
  assertStringIncludes(rendered.latex, '\\usepackage{tabu}')
  assertStringIncludes(rendered.latex, '\\usepackage[a4paper,top=3cm,bottom=2cm,left=3cm,right=3cm,marginparwidth=1.75cm]{geometry}')
  assertEquals(rendered.formatMetadata.fontSize, '10pt')
  assertEquals(rendered.formatMetadata.lineSpacing, 'single')
  assertEquals(validateResearchProposalLatex(rendered.latex), [])
  const unsafe = rendered.latex.replace('\\end{document}', '\\input{private-file}\n\\end{document}')
  assert(validateResearchProposalLatex(unsafe).some(issue => /unsafe LaTeX/i.test(issue)))
})
