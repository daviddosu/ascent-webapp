import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  approveSupervisorOutreachPackage,
  determineSupervisorOutreachPolicy,
  generateSupervisorOutreach,
  rankSupervisorCandidates,
  supervisorOutreachHtmlFromText,
  validateFirstContactSupervisorOutreachPayload,
  validateSupervisorOutreachPackage,
  type SupervisorCvReference,
  type SupervisorOutreachPackage,
  type SupervisorResearchDossier,
} from './supervisor-outreach.ts'

const now = '2026-08-12T12:00:00.000Z'

function dossier(overrides: Partial<SupervisorResearchDossier> = {}): SupervisorResearchDossier {
  return {
    supervisor_id: 'uoft:bo-wang',
    name: 'Bo Wang',
    title: 'Associate Professor',
    institution: 'University of Toronto',
    department: 'Laboratory Medicine and Pathobiology',
    lab_or_group: 'Wang computational biology group',
    verified_email: 'bowang.wang@utoronto.ca',
    verified_email_source_id: 'official-profile',
    alternate_verified_emails: [{ email: 'bwang@cs.toronto.edu', source_id: 'official-cs-directory' }],
    research_themes: [{ text: 'Machine learning and computational biology for biomedical data.', source_ids: ['official-profile'] }],
    current_projects: [{ text: 'Graph-based models for cell-cell communication in spatial single-cell data.', source_ids: ['graphcomm'] }],
    recent_publications: [{ text: 'GraphComm predicts cell-cell communication using graph-based deep learning.', source_ids: ['graphcomm'] }],
    recent_activity: [{ text: 'Current cross-appointment and biomedical AI leadership keep the research programme active.', source_ids: ['official-news'] }],
    availability_evidence: [{ text: 'The official profile identifies the faculty member as graduate faculty.', source_ids: ['official-profile'] }],
    source_ids: ['official-profile', 'official-cs-directory', 'graphcomm', 'official-news'],
    retrieved_at: now,
    evidence: [
      { id: 'official-profile', title: 'University of Toronto LMP faculty profile', url: 'https://lmp.utoronto.ca/faculty/bo-wang', authority: 'official', source_type: 'official_profile', retrieved_at: now, excerpt: 'Associate Professor Bo Wang is graduate faculty and lists AI, cancer, and genomics among his research interests.', claims: ['Associate Professor', 'graduate faculty', 'computational biology'], },
      { id: 'official-cs-directory', title: 'University of Toronto Computer Science faculty directory', url: 'https://web.cs.toronto.edu/people/faculty-directory', authority: 'official', source_type: 'official_profile', retrieved_at: now, excerpt: 'Bo Wang is an Associate Professor working in machine learning and computational biology.', claims: ['machine learning', 'computational biology'], },
      { id: 'graphcomm', title: 'GraphComm, Scientific Reports', url: 'https://doi.org/10.1038/s41598-025-20812-1', authority: 'peer_reviewed', source_type: 'publication', retrieved_at: now, publication_date: '2025-10-22', excerpt: 'GraphComm predicts cell-cell communication using a graph-based deep learning method in single-cell RNA sequencing data.', claims: ['cell-cell communication', 'graph-based deep learning', 'spatial single-cell RNA sequencing'], },
      { id: 'official-news', title: 'Bo Wang named to the Royal Society of Canada college', url: 'https://web.cs.toronto.edu/news-events/news/bo-wang-named-to-royal-society-of-canadas-college-of-new-scholars-artists-and-scientists', authority: 'official', source_type: 'activity', retrieved_at: now, excerpt: 'The University of Toronto describes current joint appointments and biomedical AI leadership.', claims: ['current joint appointment', 'biomedical AI'], },
    ],
    ...overrides,
  }
}

function cv(): SupervisorCvReference {
  return {
    artifact_id: 'cv-artifact-1',
    file_asset_id: 'cv-asset-1',
    checksum: 'a'.repeat(64),
    filename: 'Amara_Okafor_CV.pdf',
    mime_type: 'application/pdf',
    template_id: 'graduate_application_cv_v1',
    template_version: '1.0.0',
    renderer_version: '1.0.0',
    page_count: 2,
    applicant_name: 'Amara Okafor',
    applicant_email: 'amara.okafor@example.test',
    ats_text: 'Amara Okafor amara.okafor@example.test Research Experience Single-cell RNA sequencing Python graph models',
  }
}

function draftPackage(): SupervisorOutreachPackage {
  return generateSupervisorOutreach({
    application_case_id: 'case-1',
    opportunity_id: 'opportunity-1',
    target_programme: 'Cell and Systems Biology PhD',
    target_institution: 'University of Toronto',
    target_intake: 'Fall 2026',
    policy: { category: 'required', strategic_usefulness: 'high', rationale: 'The official admissions page says applicants should contact prospective supervisors and that admission requires potential-supervisor support.', evidence_ids: ['official-programme'] },
    supervisor_dossier: dossier({
      evidence: [
        { id: 'official-programme', title: 'CSB PhD admissions', url: 'https://csb.utoronto.ca/graduate-studies/prospective-students/admissions/', authority: 'official', source_type: 'official_programme', retrieved_at: now, excerpt: 'Applicants should contact prospective supervisors; applicants with potential-supervisor support will be admitted.', claims: ['contact prospective supervisors', 'potential-supervisor support'], },
        ...dossier().evidence,
      ],
      source_ids: ['official-programme', 'official-profile', 'official-cs-directory', 'graphcomm', 'official-news'],
    }),
    applicant_fit_evidence: [
      { id: 'fit-research', dimension: 'research_experience', text: 'Amara has confirmed research experience analysing single-cell RNA sequencing data with Python.', score: 92, applicant_fact_ids: ['profile:research:0'], supervisor_evidence_ids: ['graphcomm'] },
      { id: 'fit-method', dimension: 'methodological_overlap', text: 'Amara proposes studying interpretable graph models for spatial cell communication.', score: 88, applicant_fact_ids: ['profile:proposal:0'], supervisor_evidence_ids: ['graphcomm', 'official-profile'] },
      { id: 'fit-programme', dimension: 'programme_fit', text: 'The programme and supervisor evidence support a computational biology PhD direction.', score: 80, applicant_fact_ids: ['profile:education:0'], supervisor_evidence_ids: ['official-programme', 'official-profile'] },
    ],
    strongest_connection: {
      short_area: 'graph models for cell communication',
      statement: 'GraphComm\'s graph-based deep learning treatment of cell-cell communication is a close match for Amara\'s confirmed single-cell analysis and proposed spatial modelling direction.',
      applicant_fact_ids: ['profile:research:0', 'profile:proposal:0'],
      supervisor_evidence_ids: ['graphcomm'],
    },
    applicant_name: 'Amara Okafor',
    applicant_email: 'amara.okafor@example.test',
    applicant_role: 'research assistant in a synthetic computational biology lab',
    writing: {
      research_connection: 'Your GraphComm work on cell-cell communication using graph-based deep learning and spatial single-cell RNA sequencing is the clearest connection to my proposed direction. I was especially interested in how the method combines neighbourhood information with intracellular signalling rather than treating ligand-receptor pairs in isolation.',
      applicant_fit: 'My confirmed research experience includes analysing single-cell RNA sequencing data with Python and building reproducible feature pipelines. I am now developing a proposal around interpretable graph models for spatial cell communication, grounded in the same methodological questions.',
      request: 'Would you be considering new doctoral students for Fall 2026, and would this direction merit a short conversation?',
      closing_context: '',
    },
    cv: cv(),
    idempotency_key: 'outreach-case-1-uoft-bo-wang-v1',
    now,
  })
}

Deno.test('classifies official programme policy and blocks discouraged outreach', () => {
  const accepted = determineSupervisorOutreachPolicy({ category: 'required', strategic_usefulness: 'high', rationale: 'The official admissions page directs applicants to contact prospective supervisors.', evidence_ids: ['official-programme'] }, dossier({
    evidence: [{ id: 'official-programme', title: 'Admissions', url: 'https://example.edu/admissions', authority: 'official', source_type: 'official_programme', retrieved_at: now, excerpt: 'Contact prospective supervisors.', claims: ['contact prospective supervisors'] }, ...dossier().evidence],
    source_ids: ['official-programme', ...dossier().source_ids],
  }))
  assertEquals(accepted.active, true)
  const rejected = determineSupervisorOutreachPolicy({ category: 'discouraged', strategic_usefulness: 'low', rationale: 'The programme asks applicants not to contact faculty before review.', evidence_ids: ['official-profile'] }, dossier())
  assertEquals(rejected.active, false)
})

Deno.test('generates a research-backed package with exact email/CV consistency and Gmail parity', () => {
  const packageValue = draftPackage()
  assertEquals(packageValue.status, 'quality_checked')
  assertEquals(packageValue.quality.passed, true)
  assertEquals(packageValue.email.to, 'bowang.wang@utoronto.ca')
  assertEquals(packageValue.cv.template_id, 'graduate_application_cv_v1')
  assertEquals(packageValue.approved_cv_checksum, 'a'.repeat(64))
  assertEquals(packageValue.email.word_count >= 120 && packageValue.email.word_count <= 220, true)
  assertStringIncludes(packageValue.email.body_text, 'GraphComm')
  assertStringIncludes(packageValue.email.body_html, '<p>')
  assertEquals(validateSupervisorOutreachPackage(packageValue, { now }).valid, true)
  const approved = approveSupervisorOutreachPackage(packageValue, now)
  assertEquals(approved.status, 'approved')
  assertEquals(approved.user_approval.approved, true)
  assertEquals(validateSupervisorOutreachPackage(approved, { now, require_user_approval: true }).valid, true)
})

Deno.test('rejects body drift, missing package, stale evidence, and a mismatched CV checksum', () => {
  const packageValue = draftPackage()
  const drifted = validateFirstContactSupervisorOutreachPayload({
    request_kind: 'create_draft',
    to: [packageValue.verified_email],
    subject: packageValue.email.subject,
    body_text: `${packageValue.email.body_text} Changed`,
    supervisor_outreach_package: packageValue,
  }, { now })
  assertEquals(drifted.valid, false)
  assert(drifted.issues.some(issue => issue.includes('body')))
  assertEquals(validateFirstContactSupervisorOutreachPayload({ request_kind: 'create_draft', to: [packageValue.verified_email] }).valid, false)
  const stale = validateSupervisorOutreachPackage({ ...packageValue, supervisor_dossier: dossier({ retrieved_at: '2024-01-01T00:00:00.000Z', evidence: packageValue.supervisor_dossier.evidence.map(source => ({ ...source, retrieved_at: '2024-01-01T00:00:00.000Z' })) }) }, { now }).valid
  assertEquals(stale, false)
  const wrongChecksum = validateSupervisorOutreachPackage({ ...packageValue, approved_cv_checksum: 'b'.repeat(64) }, { now }).valid
  assertEquals(wrongChecksum, false)
})

Deno.test('ranks actual evidenced intellectual fit instead of keyword-only matches', () => {
  const good = draftPackage()
  const ranked = rankSupervisorCandidates([
    { dossier: good.supervisor_dossier, fit_evidence: good.applicant_fit_evidence, strongest_connection: good.strongest_connection },
    { dossier: dossier({ supervisor_id: 'uoft:weak', name: 'Keyword Match', current_projects: [{ text: 'A generic project.', source_ids: ['official-profile'] }], recent_publications: [{ text: 'A generic paper.', source_ids: ['official-profile'] }] }), fit_evidence: [{ id: 'keyword-only', dimension: 'technical_skill', text: 'The applicant knows machine learning.', score: 98, applicant_fact_ids: ['profile:skill'], supervisor_evidence_ids: [] }], strongest_connection: null },
  ])
  assertEquals(ranked[0]?.supervisor_id, 'uoft:bo-wang')
  assertEquals(ranked[0]?.eligible, true)
  assertEquals(ranked[1]?.eligible, false)
})

Deno.test('escapes names and special characters in the Gmail-safe HTML representation', () => {
  const textBody = 'Dear Professor O\'Neil,\n\nYour & my work on <graphs> merits a careful discussion.'
  const html = supervisorOutreachHtmlFromText(textBody)
  assertStringIncludes(html, 'O&#39;Neil')
  assertStringIncludes(html, '&amp;')
  assertStringIncludes(html, '&lt;graphs&gt;')
  assertFalse(html.includes('<graphs>'))
})
