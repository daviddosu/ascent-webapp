import { join } from 'node:path'
import {
  renderCanonicalCv,
  type CvData,
  type CvProvenance,
} from '../../supabase/functions/_shared/cv.ts'
import {
  approveSupervisorOutreachPackage,
  generateSupervisorOutreach,
  type SupervisorResearchDossier,
} from '../../supabase/functions/_shared/supervisor-outreach.ts'
import { renderGmailMimeMessage } from '../../supabase/functions/_shared/google.ts'
import { APPLICATION_EMAIL_SCHEMA_VERSION, APPLICATION_EMAIL_WORKFLOW_VERSION, applicationEmailHtmlFromText } from '../../supabase/functions/_shared/application-email.ts'

const root = Deno.cwd()
const outputDir = join(root, 'output', 'pdf', 'supervisor-outreach-demo')
const now = '2026-08-12T12:00:00.000Z'

await Deno.mkdir(outputDir, { recursive: true })

function provenance(sourceFactId: string, sourceUrl = 'synthetic://applicant-profile') : CvProvenance {
  return { confirmed: true, sourceFactIds: [sourceFactId], sourceAssetIds: [], kind: 'user_statement', sourceUrl }
}

function fact<T>(value: T, sourceFactId: string, sourceUrl?: string) {
  return { value, provenance: provenance(sourceFactId, sourceUrl) }
}

const applicantName = 'Amara Okafor'
const applicantEmail = 'amara.okafor@example.test'
const cvData: CvData = {
  fullName: fact(applicantName, 'synthetic:identity:name'),
  preferredName: null,
  email: fact(applicantEmail, 'synthetic:identity:email'),
  phone: null,
  location: fact('Lagos, Nigeria', 'synthetic:identity:location'),
  linkedin: null,
  github: null,
  portfolio: null,
  website: null,
  education: [fact({ institution: 'University of Lagos', degree: 'B.Sc.', field: 'Computer Science', startDate: '2020', endDate: '2024', grade: 'First Class', country: 'Nigeria' }, 'synthetic:education:0')],
  researchExperience: [fact({ title: 'Single-cell transcriptomics research assistant', institution: 'Lagos Computational Biology Lab (synthetic)', summary: 'Analysed single-cell RNA sequencing data and built reproducible feature tables for cell-state comparisons.', methods: ['Python', 'Scanpy', 'quality control', 'feature engineering'], outcomes: ['Documented a reproducible analysis workflow for a synthetic pilot dataset.'], startDate: '2024', endDate: null }, 'synthetic:research:0')],
  workExperience: [],
  teachingExperience: [],
  publications: [],
  presentations: [],
  projects: [fact({ title: 'Cell-state analysis toolkit', description: 'Built a small Python and Scanpy workflow for quality control, dimensionality reduction, and annotated cell-state comparisons.', technologies: ['Python', 'Scanpy'], date: '2024' }, 'synthetic:project:0')],
  researchProjects: [fact({ title: 'Spatial cell communication models', description: 'Proposed a study using graph representation learning, single-cell RNA sequencing, and spatial analysis to combine neighbourhoods with interpretable cell-cell communication signals.', methods: ['graph learning'], outcomes: ['Synthetic proposal grounded in confirmed research interests; no results are claimed.'], date: '2025-2026' }, 'synthetic:proposal:0')],
  leadership: [],
  awards: [],
  scholarships: [],
  certifications: [],
  technicalSkills: [fact('Python', 'synthetic:skill:python'), fact('SQL', 'synthetic:skill:sql'), fact('Git', 'synthetic:skill:git')],
  researchSkills: [fact('Single-cell RNA sequencing analysis', 'synthetic:research-skill:single-cell'), fact('Graph representation learning', 'synthetic:research-skill:graphs'), fact('Reproducible computational workflows', 'synthetic:research-skill:reproducibility')],
  languages: [fact('English', 'synthetic:language:english')],
  coursework: [fact('Algorithms', 'synthetic:coursework:algorithms'), fact('Machine Learning', 'synthetic:coursework:ml'), fact('Database Systems', 'synthetic:coursework:databases')],
  memberships: [],
}

const rendered = renderCanonicalCv({
  data: cvData,
  pageTarget: 'two_page',
  sectionOrder: ['education', 'researchExperience', 'researchProjects', 'technicalSkills', 'researchSkills', 'coursework', 'projects'],
})
await Deno.writeTextFile(join(outputDir, 'Amara_Okafor_CV.tex'), rendered.latex)
await Deno.writeTextFile(join(outputDir, 'cv-data.json'), JSON.stringify(cvData, null, 2))

async function run(command: string, args: string[]) {
  const result = await new Deno.Command(command, { args, stdout: 'piped', stderr: 'piped' }).output()
  const stdout = new TextDecoder().decode(result.stdout)
  const stderr = new TextDecoder().decode(result.stderr)
  if (!result.success) throw new Error(`${command} failed:\n${stdout}\n${stderr}`)
  return `${stdout}\n${stderr}`
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

const pdfPath = join(outputDir, 'Amara_Okafor_CV.pdf')
const compilationLog = await run('/Library/TeX/texbin/pdflatex', ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-output-directory', outputDir, join(outputDir, 'Amara_Okafor_CV.tex')])
await run('/opt/homebrew/bin/pdftotext', ['-layout', pdfPath, join(outputDir, 'Amara_Okafor_CV.txt')])
await run('/opt/homebrew/bin/pdftoppm', ['-png', '-f', '1', '-singlefile', pdfPath, join(outputDir, 'Amara_Okafor_CV-preview')])
await Deno.writeTextFile(join(outputDir, 'Amara_Okafor_CV.compile.log'), compilationLog)

const pdfBytes = await Deno.readFile(pdfPath)
const pdfDigest = await crypto.subtle.digest('SHA-256', pdfBytes)
const checksum = Array.from(new Uint8Array(pdfDigest), byte => byte.toString(16).padStart(2, '0')).join('')
const atsText = await Deno.readTextFile(join(outputDir, 'Amara_Okafor_CV.txt'))
const pageCount = (await run('/opt/homebrew/bin/pdfinfo', [pdfPath])).match(/^Pages:\s+(\d+)/m)?.[1]

const evidence = {
  programme_admissions: 'https://csb.utoronto.ca/graduate-studies/prospective-students/admissions/',
  supervisor_profile: 'https://lmp.utoronto.ca/faculty/bo-wang',
  supervisor_cs_directory: 'https://web.cs.toronto.edu/people/faculty-directory',
  graphcomm: 'https://doi.org/10.1038/s41598-025-20812-1',
  medbio_profile: 'https://medbio.utoronto.ca/faculty/wang',
  supervisor_news: 'https://web.cs.toronto.edu/news-events/news/bo-wang-named-to-royal-society-of-canadas-college-of-new-scholars-artists-and-scientists',
  bionic: 'https://www.nature.com/articles/s41592-022-01616-x',
}

const dossier: SupervisorResearchDossier = {
  supervisor_id: 'uoft:bo-wang',
  name: 'Bo Wang',
  title: 'Associate Professor',
  institution: 'University of Toronto',
  department: 'Laboratory Medicine and Pathobiology',
  lab_or_group: 'Wang computational biology group',
  verified_email: 'bowang.wang@utoronto.ca',
  verified_email_source_id: 'source:supervisor-profile',
  alternate_verified_emails: [{ email: 'bwang@cs.toronto.edu', source_id: 'source:cs-directory' }],
  research_themes: [
    { text: 'Integrative and interpretable machine learning for clinical, genomic, and biomedical data.', source_ids: ['source:supervisor-profile', 'source:medbio-profile'] },
    { text: 'Machine learning and computational biology, including graph-based biological modelling.', source_ids: ['source:cs-directory', 'source:bionic'] },
  ],
  current_projects: [
    { text: 'GraphComm uses graph-based deep learning to predict cell-cell communication from spatial single-cell RNA sequencing data.', source_ids: ['source:graphcomm'] },
  ],
  recent_publications: [
    { text: 'GraphComm predicts cell-cell communication using a graph-based deep learning method in single-cell RNA sequencing data, Scientific Reports, 2025.', source_ids: ['source:graphcomm'] },
    { text: 'BIONIC integrates multiple biological networks with graph convolutional learning for gene and chemical-genetic interaction prediction.', source_ids: ['source:bionic'] },
  ],
  recent_activity: [
    { text: 'The University of Toronto describes current joint appointments and biomedical AI leadership, including work connected to UHN and Vector.', source_ids: ['source:news'] },
  ],
  availability_evidence: [
    { text: 'The official LMP profile identifies Bo Wang as graduate faculty with a primary appointment.', source_ids: ['source:supervisor-profile'] },
  ],
  source_ids: ['source:programme', 'source:supervisor-profile', 'source:cs-directory', 'source:graphcomm', 'source:medbio-profile', 'source:news', 'source:bionic'],
  retrieved_at: now,
  evidence: [
    { id: 'source:programme', title: 'CSB prospective students admissions', url: evidence.programme_admissions, authority: 'official', source_type: 'official_programme', retrieved_at: now, excerpt: 'The programme advises applicants to contact prospective supervisors and states that admission requires support from a potential supervisor.', claims: ['contact prospective supervisors', 'potential supervisor support'] },
    { id: 'source:supervisor-profile', title: 'Bo Wang, LMP faculty profile', url: evidence.supervisor_profile, authority: 'official', source_type: 'official_profile', retrieved_at: now, excerpt: 'Bo Wang is an Associate Professor and graduate faculty member whose interests include AI, cancer, and genomics.', claims: ['Associate Professor', 'graduate faculty', 'AI', 'genomics', 'computational biology'] },
    { id: 'source:cs-directory', title: 'U of T Computer Science faculty directory', url: evidence.supervisor_cs_directory, authority: 'official', source_type: 'official_profile', retrieved_at: now, excerpt: 'The faculty directory lists Bo Wang as an Associate Professor working in machine learning and computational biology.', claims: ['machine learning', 'computational biology'] },
    { id: 'source:graphcomm', title: 'GraphComm, Scientific Reports', url: evidence.graphcomm, authority: 'peer_reviewed', source_type: 'publication', retrieved_at: now, publication_date: '2025-10-22', excerpt: 'GraphComm predicts cell-cell communication using a graph-based deep learning method in single-cell RNA sequencing data.', claims: ['cell-cell communication', 'graph-based deep learning', 'spatial single-cell RNA sequencing'] },
    { id: 'source:medbio-profile', title: 'Bo Wang, MedBio faculty profile', url: evidence.medbio_profile, authority: 'official', source_type: 'official_profile', retrieved_at: now, excerpt: 'The profile describes integrative and interpretable machine learning for clinical prediction and genomic traits.', claims: ['integrative machine learning', 'interpretable machine learning', 'genomic traits'] },
    { id: 'source:news', title: 'Bo Wang named to the Royal Society of Canada college', url: evidence.supervisor_news, authority: 'official', source_type: 'activity', retrieved_at: now, excerpt: 'University of Toronto news describes current joint appointments and biomedical AI leadership.', claims: ['current joint appointment', 'biomedical AI', 'UHN'] },
    { id: 'source:bionic', title: 'BIONIC, Nature Methods', url: evidence.bionic, authority: 'peer_reviewed', source_type: 'publication', retrieved_at: now, publication_date: '2022-10-03', excerpt: 'BIONIC integrates multiple biological networks with a graph convolutional network for scalable biological prediction.', claims: ['graph convolutional network', 'biological networks'] },
  ],
}

const outreachTextBody = [
  'Dear Professor Wang,',
  'I am preparing an application to the Cell and Systems Biology PhD at the University of Toronto for Fall 2026 and am writing about potential supervision.',
  'Your GraphComm work on graph-based deep learning for cell-cell communication is closely connected to the research direction I hope to pursue. I am particularly interested in interpretable graph models for spatial cell communication.',
  'My research experience includes analysing single-cell RNA sequencing data with Python and building reproducible feature pipelines. This gives me a practical foundation for investigating the methodological questions raised by your work.',
  'Would you be considering new doctoral students for Fall 2026, and would this direction merit a short conversation? I have attached my programme-specific CV for context.',
  `Kind regards,\n${applicantName}`,
].join('\n\n')

const packageDraft = generateSupervisorOutreach({
  task_id: 'demo-task-001',
  application_case_id: 'demo-application-case-001',
  opportunity_id: 'demo-opportunity-utoronto-csb-phd',
  target_programme: 'Cell and Systems Biology PhD',
  target_institution: 'University of Toronto',
  target_intake: 'Fall 2026',
  policy: {
    category: 'required',
    strategic_usefulness: 'high',
    rationale: 'The official CSB admissions page directs applicants to contact prospective supervisors and states that admission requires potential-supervisor support.',
    evidence_ids: ['source:programme'],
  },
  supervisor_dossier: dossier,
  applicant_fit_evidence: [
    { id: 'fit:single-cell', dimension: 'research_experience', text: 'Amara has confirmed experience analysing single-cell RNA sequencing data with Python and reproducible feature pipelines.', score: 93, applicant_fact_ids: ['synthetic:research:0'], supervisor_evidence_ids: ['source:graphcomm'] },
    { id: 'fit:graph-methods', dimension: 'methodological_overlap', text: 'Amara proposes interpretable graph models for spatial cell communication, directly connecting to GraphComm\'s graph-based deep learning direction.', score: 91, applicant_fact_ids: ['synthetic:proposal:0'], supervisor_evidence_ids: ['source:graphcomm', 'source:medbio-profile'] },
    { id: 'fit:programme', dimension: 'programme_fit', text: 'The applicant\'s confirmed computer science education and computational biology direction fit the CSB PhD context.', score: 82, applicant_fact_ids: ['synthetic:education:0'], supervisor_evidence_ids: ['source:programme', 'source:supervisor-profile'] },
  ],
  strongest_connection: {
    short_area: 'graph models for cell communication',
    statement: 'GraphComm\'s graph-based deep learning treatment of cell-cell communication is a close match for Amara\'s confirmed single-cell analysis and proposed spatial modelling direction.',
    applicant_fact_ids: ['synthetic:research:0', 'synthetic:proposal:0'],
    supervisor_evidence_ids: ['source:graphcomm'],
  },
  applicant_name: applicantName,
  applicant_email: applicantEmail,
  applicant_role: 'research assistant at a synthetic computational biology lab',
  email_action_package: {
    schemaVersion: APPLICATION_EMAIL_SCHEMA_VERSION,
    workflowVersion: APPLICATION_EMAIL_WORKFLOW_VERSION,
    emailType: 'prospective_supervisor_first_contact',
    recipientEmail: dossier.verified_email,
    subject: 'PhD supervision inquiry: graph models for cell communication',
    textBody: outreachTextBody,
    htmlBody: applicationEmailHtmlFromText(outreachTextBody),
    communicationGoal: 'Ask whether Professor Wang is considering Fall 2026 doctoral students and whether a short research-fit conversation would be useful.',
    strongestConnection: 'Graph models for spatial cell communication.',
    attachmentArtifactIds: ['demo-cv-artifact-001'],
    claims: [
      { claim: 'GraphComm uses graph-based deep learning for cell-cell communication.', evidenceIds: ['source:graphcomm'] },
      { claim: 'Amara has single-cell RNA sequencing and Python research experience.', evidenceIds: ['fit:single-cell'] },
      { claim: 'The programme directs applicants to contact prospective supervisors.', evidenceIds: ['source:programme'] },
    ],
    followUp: { recommended: true, afterDays: 10, purpose: 'Briefly check whether supervision capacity is known.' },
    quality: { specific: true, concise: true, recipientSpecific: true, programmeSpecific: true, applicantEvidenceUsed: true },
  },
  cv: {
    artifact_id: 'demo-cv-artifact-001',
    file_asset_id: 'demo-cv-asset-001',
    checksum,
    filename: 'Amara_Okafor_CV.pdf',
    mime_type: 'application/pdf',
    template_id: rendered.templateId,
    template_version: rendered.templateVersion,
    renderer_version: rendered.rendererVersion,
    page_count: Number(pageCount ?? 0),
    ats_text: atsText,
    applicant_name: applicantName,
    applicant_email: applicantEmail,
    latex: rendered.latex,
  },
  idempotency_key: 'demo-supervisor-outreach-utoronto-bo-wang-v1',
  now,
})
if (!packageDraft.quality.passed) throw new Error(`Demo outreach quality gate failed: ${packageDraft.quality.issues.join(' ')}`)
const approvedPackage = approveSupervisorOutreachPackage(packageDraft, now)

const mimeRawBase64 = renderGmailMimeMessage({
  to: [approvedPackage.email.to],
  subject: approvedPackage.email.subject,
  bodyText: approvedPackage.email.body_text,
  bodyHtml: approvedPackage.email.body_html,
  messageId: '<demo-supervisor-outreach-v1@shotcount.app>',
  idempotencyKey: approvedPackage.idempotency_key,
  attachments: [{ name: approvedPackage.cv.filename, mimeType: approvedPackage.cv.mime_type, base64: base64FromBytes(pdfBytes) }],
})
const mimeBytes = Uint8Array.from(atob(mimeRawBase64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(mimeRawBase64.length / 4) * 4, '=')), character => character.charCodeAt(0))

await Deno.writeTextFile(join(outputDir, 'supervisor-dossier.json'), JSON.stringify(dossier, null, 2))
await Deno.writeTextFile(join(outputDir, 'fit-evidence.json'), JSON.stringify(approvedPackage.applicant_fit_evidence, null, 2))
await Deno.writeTextFile(join(outputDir, 'programme-policy.json'), JSON.stringify(approvedPackage.policy, null, 2))
await Deno.writeTextFile(join(outputDir, 'email.txt'), approvedPackage.email.body_text)
await Deno.writeTextFile(join(outputDir, 'email.html'), approvedPackage.email.body_html)
await Deno.writeTextFile(join(outputDir, 'gmail-message.mime'), new TextDecoder().decode(mimeBytes).replace(/\r\n/g, '\n'))
await Deno.writeTextFile(join(outputDir, 'quality-result.json'), JSON.stringify(approvedPackage.quality, null, 2))
await Deno.writeTextFile(join(outputDir, 'outreach-package.json'), JSON.stringify(approvedPackage, null, 2))
await Deno.writeTextFile(join(outputDir, 'source-urls.json'), JSON.stringify({ synthetic_applicant: true, no_message_sent: true, sources: evidence }, null, 2))

console.log(JSON.stringify({
  outputDir,
  pdfPath,
  cvChecksum: checksum,
  pageCount: Number(pageCount ?? 0),
  emailWordCount: approvedPackage.email.word_count,
  qualityPassed: approvedPackage.quality.passed,
  approved: approvedPackage.user_approval.approved,
  noMessageSent: true,
}, null, 2))
