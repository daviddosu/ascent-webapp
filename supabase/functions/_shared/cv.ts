/**
 * Deterministic, provenance-gated CV rendering for David.
 *
 * The canonical workflow may render validated structured content or validate
 * complete model-authored LaTeX. In both cases this module owns the exact
 * Jake/SB2Nov template contract and rejects unsafe commands before compilation.
 */

import type { ApplicantProfile, ApplicantFact, EducationRecord, EmploymentRecord, PublicationRecord, ResearchRecord, AwardRecord } from './david-applications.ts'

export const GRADUATE_CV_TEMPLATE_ID = 'graduate_application_cv_v1' as const
export const GRADUATE_CV_TEMPLATE_VERSION = '1.0.0' as const
export const GRADUATE_CV_RENDERER_VERSION = '1.8.0' as const
export const GRADUATE_CV_META_PROMPT_VERSION = 'graduate-cv-tailoring-v4' as const
export const GRADUATE_CV_TAILORING_RULE_SET_ID = 'CV_TAILORING_RULES_V4' as const

/**
 * Expert graduate-CV tailoring rules. These are shared by the model contract,
 * the deterministic renderer, and the regression tests so “tailoring” cannot
 * silently degrade into arbitrary model formatting.
 */
export const GRADUATE_CV_TAILORING_RULES = [
  'Use the task-attached CV as the authoritative source for this application; never merge facts from another applicant or case.',
  'First build a source inventory before tailoring: identity and every contact link; every education, research, teaching, employment, leadership, publication, presentation, project, award, scholarship, course, method, tool, quantified result, collaborator, distinction, and date in the attached CV. Do not draft until that inventory is complete.',
  'Preserve every source-backed fact that adds distinct evidence. Tailoring may reorder, foreground, and tighten facts, but it may not silently delete unique achievements, quantified impact, technical depth, academic distinctions, research outputs, collaborators, funding, awards, scholarships, or contact channels.',
  'Do not confuse concision with information loss. Consolidate only genuine duplication. A shorter paraphrase must retain the original action, method, object, scope, number, outcome, authorship status, and named institution when the source supplies them.',
  'After inventorying the source, assign every distinct fact to exactly one strongest section. Do not repeat the same course, project, method, outcome, award, role, or description across education, research, projects, teaching, leadership, and skills merely to raise coverage; coverage means preserved evidence, not duplicated evidence.',
  'Tailor for the verified programme by prioritising evidence of the programme\'s actual research areas, methods, evaluation signals, and document expectations; a generic CV is a failed output even when every fact is true.',
  'Every generated CV must carry a programme-specific tailoring brief naming the verified institution and programme, citing at least one official source URL, naming at least two priority signals, and linking the fit to confirmed applicant facts.',
  'The tailoring brief must change the document selection, ordering, or wording in a visible, evidence-backed way; copying the same generic CV into a programme-specific filename does not count as tailoring.',
  'Allow bounded synthesis within sensible range: infer a modest programme-relevant connection, consolidate overlapping evidence, and use stronger action language when the source facts support it. Phrase an inference as an inference and never turn it into a new factual claim.',
  'Do not add a Profile, Summary, Professional Summary, or Objective section unless the source already contains it and retaining it is clearly useful; prefer the normal evidence-first Jake structure.',
  'Rewrite for clarity, concision, and programme fit when the source evidence supports the underlying claim; preserve numbers, scope, authorship, dates, and outcomes exactly.',
  'Make each bullet one concrete contribution: action or method, object or problem, and verified result or output where available. Remove generic duties and empty adjectives.',
  'Do not fabricate or upgrade any material applicant fact, including responsibilities, results, technical ownership, degrees, grades, publications, authorship, funding, availability, dates, tools, or supervisor fit. If a detail is missing, use conservative wording or leave it out.',
  'When evidence supports only a broad statement, keep it broad: prefer “worked on,” “contributed to,” “used,” or “prepared for” over a specific claim that the record does not establish.',
  'Derive the page target from the physical source PDF: one source page means exactly one output page; two or more source pages means exactly two full output pages. Never publish a partial or materially underfilled second page.',
  'Use the supplied Jake Gutierrez / SB2Nov LaTeX template shell exactly for layout, spacing, headings, links, and ATS-readable structure; applicant text may fill approved placeholders only.',
  'Use a single final PDF deliverable. LaTeX, compiler logs, ATS text, previews, and retries are private checks, never user-facing files.',
  'Before publishing, validate a factual inventory rather than literal vocabulary overlap: identity, contacts, institutions, degrees, roles, dates, publications, awards, projects, tools, named programmes, metrics, percentages, funding amounts, and other distinctive achievements must remain source-backed and materially complete.',
  'If the authoritative evidence is insufficient for a material tailoring decision, ask one precise question or leave the claim out; bounded narrative synthesis may proceed without blocking when no material fact changes.',
] as const

export const GRADUATE_CV_TAILORING_PROMPT = GRADUATE_CV_TAILORING_RULES.join(' ')

export type CvPageTarget = 'one_page' | 'two_page' | 'academic'

export function cvPageTargetForSourcePages(sourcePageCount: number): Exclude<CvPageTarget, 'academic'> {
  if (!Number.isInteger(sourcePageCount) || sourcePageCount < 1) throw new Error('The source CV page count must be a positive integer.')
  return sourcePageCount === 1 ? 'one_page' : 'two_page'
}

export type CvFactualInventory = {
  contacts: string[]
  dates: string[]
  quantities: string[]
}

function normalizeCvAtom(value: string) {
  return value.toLocaleLowerCase()
    .replace(/\\[$%&_#{}]/g, match => match.slice(1))
    // PDF extraction and LaTeX commonly insert a space after a currency
    // symbol. Treat `$ 300,000` and `$300,000` as the same protected atom.
    .replace(/([$£€])\s+(?=\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCvDateAtom(value: string) {
  return normalizeCvAtom(value)
    // Date ranges may arrive as `2017 - 2022`, `2017--2022`, or use a
    // Unicode dash. Canonicalise all of them before comparing source and
    // model output.
    // The checked-in PDF text extractor decodes some en-dashes as `{` in
    // legacy font encodings, so accept that representation only in a date
    // range context as well.
    .replace(/\s*(?:--|[-–—]|\bto\b|\{)\s*/gi, '--')
}

function dateYears(value: string) {
  return [...value.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match => match[0])
}

function dateHasPresent(value: string) {
  return /\bpresent\b/i.test(value)
}

export function extractCvFactualInventory(value: string): CvFactualInventory {
  const text = normalizeCvAtom(value)
  const contacts = (text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s|}]+|\+?\d[\d\s().-]{7,}\d/gi) ?? [])
    // A spaced year range such as `2021 -- 2024` can look like a phone
    // number to a permissive PDF-text regex. It belongs in the date inventory
    // only, never in contacts.
    .filter(contact => !/\b(?:19|20)\d{2}\s*(?:--|[-–—]|\bto\b)\s*(?:19|20)\d{2}\b/i.test(contact))
  const dates = text.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{4}\b|\b(?:19|20)\d{2}\s*(?:--|-|–|—|to|\{)\s*(?:(?:19|20)\d{2}|present)\b|\b(?:19|20)\d{2}\b/gi) ?? []
  const quantities = text.match(/(?:[$£€]\s?\d[\d,.]*(?:\s?(?:k|m|million|billion))?|\b\d[\d,.]*%|\b\d+(?:\.\d+)?x\b|\b\d[\d,]*(?:\+|\s+(?:institutions?|students?|internships?|countries?|people|members?|awards?|publications?|papers?|teams?)))/gi) ?? []
  const unique = (items: string[], normalizer = normalizeCvAtom) => [...new Set(items.map(normalizer).filter(Boolean))]
  return { contacts: unique(contacts), dates: unique(dates, normalizeCvDateAtom), quantities: unique(quantities) }
}

export type CvFactualValidation = {
  passed: boolean
  missingContacts: string[]
  missingDates: string[]
  missingQuantities: string[]
  unsupportedDates: string[]
  unsupportedQuantities: string[]
}

export function validateCvFactualInventory(sourceText: string, candidateText: string): CvFactualValidation {
  const source = extractCvFactualInventory(sourceText)
  const candidate = extractCvFactualInventory(candidateText)
  const missing = (required: string[], actual: string[]) => required.filter(value => !actual.includes(value))
  const unsupported = (actual: string[], required: string[]) => actual.filter(value => !required.includes(value))
  const missingContacts = missing(source.contacts, candidate.contacts)
  const sourceYears = new Set(source.dates.flatMap(dateYears))
  const candidateYears = new Set(candidate.dates.flatMap(dateYears))
  const sourceHasPresent = source.dates.some(dateHasPresent)
  const candidateHasPresent = candidate.dates.some(dateHasPresent)
  const candidateContainsDate = (sourceDate: string) => {
    if (candidate.dates.includes(sourceDate)) return true
    const years = dateYears(sourceDate)
    // A source year may be rendered as part of a faithful range (for
    // example, `2024` -> `2024--present`). Do not force formatting-level
    // equality when the protected year is still present.
    if (years.length === 1 && !sourceDate.includes('--')) return candidateYears.has(years[0]!)
    return false
  }
  const missingDates = source.dates.filter(date => !candidateContainsDate(date))
  const missingQuantities = missing(source.quantities, candidate.quantities)
  const unsupportedDates = candidate.dates.filter(date => {
    if (source.dates.includes(date)) return false
    const years = dateYears(date)
    if (date.includes('--')) {
      // A model may consolidate adjacent source entries into a range, but it
      // cannot introduce a new year or an open-ended current role.
      return years.some(year => !sourceYears.has(year)) || (dateHasPresent(date) && !sourceHasPresent)
    }
    if (years.length === 1 && sourceYears.has(years[0]!)) return false
    return true
  })
  const unsupportedQuantities = unsupported(candidate.quantities, source.quantities)
  return {
    // A one-page editorial pass may omit low-signal source entries when
    // necessary to meet the physical page target. It may never introduce a
    // new contact, date, open-ended role, or quantity. Missing dates and
    // quantities remain in diagnostics for auditability but are not failures.
    passed: !missingContacts.length && !unsupportedDates.length && !unsupportedQuantities.length && (!candidateHasPresent || sourceHasPresent),
    missingContacts,
    missingDates,
    missingQuantities,
    unsupportedDates,
    unsupportedQuantities,
  }
}

export type GeneratedApplicationCv = {
  applicationCaseId: string
  sourceCvArtifactId: string
  programmeId: string
  latexArtifactId: string
  pdfArtifactId: string
  pageCount: 1 | 2
  strategyVersion: number
  validation: {
    sourceFactsPassed: boolean
    latexSafetyPassed: boolean
    compilationPassed: boolean
    layoutPassed: boolean
    pageTargetPassed: boolean
  }
  renderEvidenceId: string
}

export type CvTailoringBrief = {
  targetInstitution: string
  targetProgramme: string
  strategyId?: string | null
  strategyRevision?: number | null
  officialSourceUrls: string[]
  prioritySignals: string[]
  applicantFitFactIds: string[]
  fitStatement: string
}

export const CV_ONE_PAGE_LINE_CAPACITY = 58 as const
export const CV_TWO_PAGE_LINE_CAPACITY = 116 as const
export const CV_TWO_PAGE_MIN_LINE_COUNT = 94 as const
export const CV_MIN_SECOND_PAGE_FILL_RATIO = 0.62 as const

export type CvProvenance = {
  confirmed: boolean
  sourceFactIds: string[]
  sourceAssetIds: string[]
  kind: 'user_statement' | 'uploaded_document' | 'verified_external_source' | 'approved_derived_artifact'
  sourceUrl?: string | null
}

export type CvFact<T = string> = {
  value: T
  provenance: CvProvenance
}

export type CvEducation = CvFact<EducationRecord>
export type CvEmployment = CvFact<EmploymentRecord>
export type CvResearch = CvFact<ResearchRecord>
export type CvPublication = CvFact<PublicationRecord>
export type CvAward = CvFact<AwardRecord>

export type CvData = {
  fullName: CvFact<string>
  profileSummary?: CvFact<string> | null
  preferredName?: CvFact<string> | null
  email: CvFact<string>
  phone?: CvFact<string> | null
  location?: CvFact<string> | null
  linkedin?: CvFact<string> | null
  github?: CvFact<string> | null
  portfolio?: CvFact<string> | null
  website?: CvFact<string> | null
  education: CvEducation[]
  researchExperience: CvResearch[]
  workExperience: CvEmployment[]
  teachingExperience: CvEmployment[]
  publications: CvPublication[]
  presentations: CvFact<string>[]
  projects: CvFact<{ title: string; description: string; technologies?: string[]; date?: string | null }>[]
  researchProjects: CvFact<{ title: string; description: string; methods?: string[]; outcomes?: string[]; date?: string | null }>[]
  leadership: CvFact<string>[]
  awards: CvAward[]
  scholarships: CvAward[]
  certifications: CvFact<string>[]
  technicalSkills: CvFact<string>[]
  researchSkills: CvFact<string>[]
  languages: CvFact<string>[]
  coursework: CvFact<string>[]
  memberships: CvFact<string>[]
}

export type CvRenderIssue = {
  path: string
  message: string
}

export type CvRenderResult = {
  latex: string
  selectedSections: string[]
  omittedContent: string[]
  pageTarget: CvPageTarget
  tailoringBrief: CvTailoringBrief | null
  templateId: typeof GRADUATE_CV_TEMPLATE_ID
  templateVersion: typeof GRADUATE_CV_TEMPLATE_VERSION
  rendererVersion: typeof GRADUATE_CV_RENDERER_VERSION
}

export const canonicalGraduateCvPreamble = String.raw`%-------------------------
% Resume in Latex
% Author : Jake Gutierrez
% Based off of: https://github.com/sb2nov/resume
% License : MIT
%------------------------

\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}


%----------FONT OPTIONS----------
% sans-serif
% \usepackage[sfdefault]{FiraSans}
% \usepackage[sfdefault]{roboto}
% \usepackage[sfdefault]{noto-sans}
% \usepackage[default]{sourcesanspro}

% serif
% \usepackage{CormorantGaramond}
% \usepackage{charter}

\pagestyle{fancy}
\fancyhf{} % clear all header and footer fields
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Adjust margins
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

%-------------------------
% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
  \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
  \item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%

\begin{document}

%----------HEADING----------
% ShotCount renders the applicant-specific heading and sections from
% confirmed, opportunity-tailored facts.`

export const canonicalGraduateCvEnd = String.raw`\end{document}`

/** Small, non-semantic normalization for model-authored Jake-template LaTeX. */
export function normalizeModelGraduateCvLatex(value: string) {
  const latex = value.trim().replace(/^```(?:latex|tex)?\s*/i, '').replace(/\s*```$/i, '').trim()
  if (!latex) return ''
  const begin = latex.indexOf('\\begin{document}')
  const end = latex.lastIndexOf('\\end{document}')
  const body = (begin >= 0
    ? latex.slice(begin + '\\begin{document}'.length, end > begin ? end : undefined)
    : latex.replace(/\\end{document}\s*$/i, ''))
    .replace(/(^|[^\\])\$(?=\s?\d)/g, '$1\\$')
    .trim()
  if (!body || /\\documentclass\b/i.test(body)) return ''
  return `${canonicalGraduateCvPreamble}\n\n${body}\n\n${canonicalGraduateCvEnd}\n`
}

const sectionPriorityResearch = [
  'profileSummary', 'education', 'researchExperience', 'publications', 'workExperience', 'researchProjects',
  'teachingExperience', 'leadership', 'awards', 'scholarships', 'technicalSkills', 'researchSkills',
  'coursework', 'certifications', 'languages', 'memberships', 'presentations', 'projects',
]

const sectionLabels: Record<string, string> = {
  profileSummary: 'Research Profile',
  education: 'Education',
  researchExperience: 'Research Experience',
  workExperience: 'Work Experience',
  teachingExperience: 'Teaching Experience',
  publications: 'Publications',
  presentations: 'Presentations',
  projects: 'Projects',
  researchProjects: 'Research Projects',
  leadership: 'Leadership',
  awards: 'Awards',
  scholarships: 'Scholarships',
  certifications: 'Certifications',
  technicalSkills: 'Technical Skills',
  researchSkills: 'Research Skills',
  languages: 'Languages',
  coursework: 'Relevant Coursework',
  memberships: 'Professional Memberships',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeText(value: unknown, maximum = 4_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function validProvenance(value: unknown): value is CvProvenance {
  if (!isRecord(value)) return false
  const sourceFactIds = Array.isArray(value.sourceFactIds) ? value.sourceFactIds : []
  const sourceAssetIds = Array.isArray(value.sourceAssetIds) ? value.sourceAssetIds : []
  return value.confirmed === true &&
    ['user_statement', 'uploaded_document', 'verified_external_source', 'approved_derived_artifact'].includes(String(value.kind)) &&
    (sourceFactIds.length + sourceAssetIds.length > 0)
}

function walkFacts(value: unknown, path: string, issues: CvRenderIssue[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkFacts(item, `${path}[${index}]`, issues))
    return
  }
  if (!isRecord(value)) return
  if ('value' in value && 'provenance' in value) {
    if (!validProvenance(value.provenance)) issues.push({ path, message: 'Every rendered CV item needs confirmed provenance and a source fact or asset.' })
    return
  }
  Object.entries(value).forEach(([key, item]) => walkFacts(item, path ? `${path}.${key}` : key, issues))
}

export function validateCvData(value: unknown): CvRenderIssue[] {
  const issues: CvRenderIssue[] = []
  if (!isRecord(value)) return [{ path: 'cv_data', message: 'Structured CV data is required.' }]
  walkFacts(value, 'cv_data', issues)
  const fullName = value.fullName
  const email = value.email
  if (!isRecord(fullName) || !safeText(fullName.value, 240)) issues.push({ path: 'cv_data.fullName', message: 'A confirmed applicant name is required.' })
  if (!isRecord(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(email.value, 320))) issues.push({ path: 'cv_data.email', message: 'A confirmed applicant email is required.' })
  return issues
}

export function validateCvTailoringBrief(value: unknown): CvRenderIssue[] {
  const issues: CvRenderIssue[] = []
  if (!isRecord(value)) return [{ path: 'tailoring_brief', message: 'A programme-specific CV tailoring brief is required.' }]
  const targetInstitution = safeText(value.targetInstitution ?? value.target_institution, 500)
  const targetProgramme = safeText(value.targetProgramme ?? value.target_programme, 800)
  const officialSourceUrls = Array.isArray(value.officialSourceUrls ?? value.official_source_urls)
    ? (value.officialSourceUrls ?? value.official_source_urls) as unknown[]
    : []
  const prioritySignals = Array.isArray(value.prioritySignals ?? value.priority_signals)
    ? (value.prioritySignals ?? value.priority_signals) as unknown[]
    : []
  const applicantFitFactIds = Array.isArray(value.applicantFitFactIds ?? value.applicant_fit_fact_ids)
    ? (value.applicantFitFactIds ?? value.applicant_fit_fact_ids) as unknown[]
    : []
  const fitStatement = safeText(value.fitStatement ?? value.fit_statement, 2_000)
  if (!targetInstitution) issues.push({ path: 'tailoring_brief.target_institution', message: 'The verified target institution is required.' })
  if (!targetProgramme) issues.push({ path: 'tailoring_brief.target_programme', message: 'The verified target programme is required.' })
  if (officialSourceUrls.length < 1 || officialSourceUrls.length > 12 || officialSourceUrls.some(item => !/^https:\/\//i.test(safeText(item, 2_000)))) {
    issues.push({ path: 'tailoring_brief.official_source_urls', message: 'At least one HTTPS official programme source URL is required.' })
  }
  if (prioritySignals.length < 2 || prioritySignals.length > 12 || prioritySignals.some(item => !safeText(item, 300))) {
    issues.push({ path: 'tailoring_brief.priority_signals', message: 'At least two concrete programme signals are required.' })
  }
  if (applicantFitFactIds.length < 2 || applicantFitFactIds.length > 40 || applicantFitFactIds.some(item => !safeText(item, 300))) {
    issues.push({ path: 'tailoring_brief.applicant_fit_fact_ids', message: 'At least two confirmed applicant fact IDs must ground the programme fit.' })
  }
  if (!fitStatement) issues.push({ path: 'tailoring_brief.fit_statement', message: 'A concise evidence-backed fit statement is required.' })
  return issues
}

function escapeUnicode(value: string) {
  const replacements: Record<string, string> = {
    '–': '--', '—': '---', '…': '\\ldots{}', '•': '\\textbullet{}', '’': "'", '‘': "'", '“': '``', '”': "''",
    'é': "\\'{e}", 'É': "\\'{E}", 'è': "\\`{e}", 'È': "\\`{E}", 'ê': "\\^{e}", 'Ê': "\\^{E}",
    'á': "\\'{a}", 'Á': "\\'{A}", 'à': "\\`{a}", 'À': "\\`{A}", 'â': "\\^{a}", 'Â': "\\^{A}",
    'í': "\\'{i}", 'Í': "\\'{I}", 'ì': "\\`{i}", 'Ì': "\\`{I}", 'î': "\\^{i}", 'Î': "\\^{I}",
    'ó': "\\'{o}", 'Ó': "\\'{O}", 'ò': "\\`{o}", 'Ò': "\\`{O}", 'ô': "\\^{o}", 'Ô': "\\^{O}",
    'ú': "\\'{u}", 'Ú': "\\'{U}", 'ù': "\\`{u}", 'Ù': "\\`{U}", 'û': "\\^{u}", 'Û': "\\^{U}",
    'ñ': "\\~{n}", 'Ñ': "\\~{N}", 'ç': "\\c{c}", 'Ç': "\\c{C}", 'ø': "\\o{}", 'Ø': "\\O{}",
    'ß': "{\\ss}", 'ü': '"{u}', 'Ü': '"{U}', 'ö': '"{o}', 'Ö': '"{O}', 'ä': '"{a}', 'Ä': '"{A}',
  }
  return [...value].map(character => replacements[character] ?? character).join('')
}

export function escapeLatex(value: unknown, maximum = 4_000) {
  const text = safeText(value, maximum)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  return escapeUnicode(text)
}

function escapeUrl(value: unknown) {
  const supplied = safeText(value, 2_000)
  const url = /^(?:www\.)?(?:linkedin\.com|github\.com)\//i.test(supplied)
    ? `https://${supplied.replace(/^www\./i, '')}`
    : supplied
  if (!/^(?:https?:\/\/|mailto:)[^\s]+$/i.test(url)) return ''
  return url.replace(/([%#_{}&])/g, '\\$1')
}

function linkLabel(value: unknown) {
  return safeText(value, 2_000).replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function factValue<T>(fact: CvFact<T> | null | undefined) {
  return fact?.value
}

function factRecord(fact: unknown): Record<string, unknown> {
  if (isRecord(fact) && Object.prototype.hasOwnProperty.call(fact, 'value')) {
    return recordValue(fact.value)
  }
  return recordValue(fact)
}

function freeformFactText(fact: unknown, maximum = 4_000) {
  const value = isRecord(fact) && Object.prototype.hasOwnProperty.call(fact, 'value') ? fact.value : fact
  return isRecord(value) || Array.isArray(value) ? '' : safeText(value, maximum)
}

function renderFreeformFact(fact: unknown, maximum = 4_000) {
  const value = freeformFactText(fact, maximum)
  return value ? `\\resumeItem{${escapeLatex(value, maximum)}}` : ''
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function firstRecordText(record: Record<string, unknown>, keys: string[], maximum = 4_000) {
  for (const key of keys) {
    const raw = record[key]
    const value = typeof raw === 'number' || typeof raw === 'boolean' ? String(raw).slice(0, maximum) : safeText(raw, maximum)
    if (value) return value
  }
  return ''
}

function recordTextList(record: Record<string, unknown>, keys: string[], maximum = 3_500) {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      const items = value.map(item => typeof item === 'number' || typeof item === 'boolean' ? String(item).slice(0, maximum) : safeText(item, maximum)).filter(Boolean)
      if (items.length) return items
    }
    const text = typeof value === 'number' || typeof value === 'boolean' ? String(value).slice(0, maximum) : safeText(value, maximum)
    if (text) return [text]
  }
  return []
}

function recordDateLabel(record: Record<string, unknown>) {
  return dateRange(
    firstRecordText(record, ['startDate', 'start_date'], 80),
    firstRecordText(record, ['endDate', 'end_date'], 80),
  ) || firstRecordText(record, ['dates', 'date', 'period'], 120)
}

function renderFactValue(value: unknown) {
  if (Array.isArray(value)) return value.map(item => safeText(item, 4_000)).filter(Boolean).join(', ')
  if (isRecord(value)) {
    const category = firstRecordText(value, ['category', 'name', 'title'], 300)
    const items = recordTextList(value, ['items', 'skills', 'values'], 1_200)
    if (category && items.length) return `${category}: ${items.join(', ')}`
    const details = recordTextList(value, ['details', 'description', 'status'], 3_500)
    if (category && details.length) return `${category}: ${details.join(' ')}`
    return firstRecordText(value, ['text', 'value', 'label'], 4_000)
  }
  return safeText(value, 4_000)
}

function dateRange(start: string | null | undefined, end: string | null | undefined) {
  const clean = (value: string | null | undefined) => safeText(value, 40)
  return [clean(start), clean(end)].filter(Boolean).join(' -- ')
}

function itemText(value: CvFact<string> | undefined) {
  return escapeLatex(renderFactValue(factValue(value)), 4_000)
}

function sectionStart(label: string) {
  return `\\section{${escapeLatex(label, 120)}}\n\\resumeSubHeadingListStart`
}

function sectionEnd() {
  return '\\resumeSubHeadingListEnd'
}

function renderEducation(items: CvEducation[]) {
  return items.map(item => {
    const record = factRecord(item)
    if (!Object.keys(record).length) return renderFreeformFact(item)
    const institution = firstRecordText(record, ['institution', 'school', 'university', 'organization'], 300)
    const country = firstRecordText(record, ['country', 'location'], 120)
    const degree = firstRecordText(record, ['degree', 'qualification', 'programme', 'program'], 300)
    const field = firstRecordText(record, ['field', 'major', 'discipline', 'subject'], 300)
    const details = recordTextList(record, ['details', 'bullets', 'notes'], 3_000)
    const detailMarkup = details.length
      ? `\n\\resumeItemListStart\n${details.map(value => `\\resumeItem{${escapeLatex(value, 3_000)}}`).join('\n')}\n\\resumeItemListEnd`
      : ''
    return `\\resumeSubheading{${escapeLatex(institution, 300)}}{${escapeLatex(recordDateLabel(record), 120)}}{${escapeLatex([degree, field].filter(Boolean).join(', '), 300)}}{${escapeLatex(country, 120)}}${detailMarkup}`
  }).join('\n')
}

function renderResearch(items: CvResearch[]) {
  return items.map(item => {
    const record = factRecord(item)
    if (!Object.keys(record).length) return renderFreeformFact(item)
    const institution = firstRecordText(record, ['institution', 'organization', 'employer', 'lab'], 300)
    const title = firstRecordText(record, ['title', 'role', 'position'], 300)
    const bullets = [
      firstRecordText(record, ['summary', 'description'], 3_000),
      ...recordTextList(record, ['methods'], 3_000),
      ...recordTextList(record, ['outcomes'], 3_000),
      ...recordTextList(record, ['bullets', 'details', 'responsibilities'], 3_000),
    ].filter(Boolean)
    if (!title && !institution) return ''
    const bulletMarkup = bullets.length
      ? `\n\\resumeItemListStart\n${bullets.map(value => `\\resumeItem{${escapeLatex(value, 3_000)}}`).join('\n')}\n\\resumeItemListEnd`
      : ''
    return `\\resumeSubheading{${escapeLatex(title, 300)}}{${escapeLatex(recordDateLabel(record), 120)}}{${escapeLatex(institution, 300)}}{}${bulletMarkup}`
  }).filter(Boolean).join('\n')
}

function renderEmployment(items: CvEmployment[]) {
  return items.map(item => {
    const record = factRecord(item)
    if (!Object.keys(record).length) return renderFreeformFact(item)
    const employer = firstRecordText(record, ['employer', 'organization', 'company'], 300)
    const title = firstRecordText(record, ['title', 'role', 'position'], 300)
    if (!employer && !title) return ''
    const details = recordTextList(record, ['responsibilities', 'bullets', 'details', 'summary'], 3_000)
    const bulletMarkup = details.length
      ? `\n\\resumeItemListStart\n${details.map(value => `\\resumeItem{${escapeLatex(value, 3_000)}}`).join('\n')}\n\\resumeItemListEnd`
      : ''
    return `\\resumeSubheading{${escapeLatex(employer, 300)}}{${escapeLatex(recordDateLabel(record), 120)}}{${escapeLatex(title, 300)}}{}${bulletMarkup}`
  }).filter(Boolean).join('\n')
}

function renderPublications(items: CvPublication[]) {
  return items.map(item => {
    const record = factRecord(item)
    if (!Object.keys(record).length) return renderFreeformFact(item)
    const title = firstRecordText(record, ['title', 'name'], 3_500)
    const citation = [
      title,
      firstRecordText(record, ['venue', 'journal', 'conference'], 1_000),
      firstRecordText(record, ['authorship', 'authors'], 1_000),
      firstRecordText(record, ['year', 'date'], 80),
      firstRecordText(record, ['status', 'details'], 1_500),
    ].filter(Boolean).join('. ')
    const link = escapeUrl(record.url ?? record.link)
    return citation ? `\\resumeItem{${escapeLatex(citation, 3_500)}${link ? ` \\href{${link}}{link}` : ''}}` : ''
  }).filter(Boolean).join('\n')
}

function renderProjects(items: CvData['projects'] | CvData['researchProjects']) {
  return items.map(item => {
    const record = factRecord(item)
    if (!Object.keys(record).length) return renderFreeformFact(item)
    const title = firstRecordText(record, ['title', 'name'], 300)
    const technologies = recordTextList(record, ['technologies', 'methods', 'tools'], 120)
    // Escape applicant-controlled text before adding the approved math
    // separator. Escaping the complete string would turn the `$|$` separator
    // into literal dollar signs in the rendered PDF.
    const heading = [`\\textbf{${escapeLatex(title, 300)}}`, technologies.length ? `\\emph{${technologies.map(value => escapeLatex(value, 120)).join(', ')}}` : ''].filter(Boolean).join(' $|$ ')
    const bullets = [
      firstRecordText(record, ['description', 'details', 'summary'], 3_500),
      ...recordTextList(record, ['outcomes', 'bullets'], 3_500),
    ].filter(Boolean)
    if (!heading || !bullets.length) return ''
    return `\\resumeProjectHeading{${heading}}{${escapeLatex(recordDateLabel(record), 120)}}\n\\resumeItemListStart\n${bullets.map(value => `\\resumeItem{${escapeLatex(value, 3_500)}}`).join('\n')}\n\\resumeItemListEnd`
  }).filter(Boolean).join('\n')
}

function renderStrings(items: CvFact<string>[]) {
  return items.map(item => itemText(item)).filter(Boolean).map(value => `\\resumeItem{${value}}`).join('\n')
}

function renderAwards(items: CvAward[]) {
  return items.map(item => {
    const record = factRecord(item)
    if (!Object.keys(record).length) return renderFreeformFact(item)
    const title = firstRecordText(record, ['title', 'name'], 300)
    const issuer = firstRecordText(record, ['issuer', 'organization'], 240)
    const year = firstRecordText(record, ['year', 'date'], 20)
    const description = firstRecordText(record, ['description', 'details', 'status'], 1_500)
    return title ? `\\resumeItem{\\textbf{${escapeLatex(title, 300)}}${issuer ? `, ${escapeLatex(issuer, 240)}` : ''}${year ? ` (${escapeLatex(year, 20)})` : ''}${description ? `: ${escapeLatex(description, 1_500)}` : ''}}` : ''
  }).filter(Boolean).join('\n')
}

function renderSkillSection(items: CvFact<string>[]) {
  const lines = items
    .map(item => itemText(item))
    .filter(Boolean)
    .map(value => `     ${value} \\\\`)
    .join('\n')
  return `\\begin{itemize}[leftmargin=0.15in, label={}]\n    \\small{\\item{\n${lines}\n    }}\n \\end{itemize}`
}

function sectionItems(data: CvData, section: string): unknown[] {
  const value = data[section as keyof CvData]
  if (section === 'profileSummary' && value && !Array.isArray(value)) return [value]
  return Array.isArray(value) ? value : []
}

function estimateText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(estimateText).filter(Boolean).join(' ')
  if (!isRecord(value)) return ''
  if ('value' in value) return estimateText(value.value)
  return Object.entries(value).filter(([key]) => key !== 'provenance').map(([, item]) => estimateText(item)).filter(Boolean).join(' ')
}

function estimateLines(data: CvData, section: string) {
  const items = sectionItems(data, section)
  const textLines = items.reduce<number>((total, item) => total + Math.max(1, Math.ceil(estimateText(item).length / 96)), 0)
  const structuralLines = ['technicalSkills', 'researchSkills'].includes(section) ? 1 : items.length * 2
  return Math.max(1, textLines + structuralLines + 2)
}

function renderSection(data: CvData, section: string) {
  const label = sectionLabels[section]
  if (!label || !sectionItems(data, section).length) return ''
  const items = sectionItems(data, section)
  let body = ''
  if (section === 'profileSummary') body = renderStrings(items as CvFact<string>[])
  else if (section === 'education') body = renderEducation(items as CvEducation[])
  else if (section === 'researchExperience') body = renderResearch(items as CvResearch[])
  else if (['workExperience', 'teachingExperience'].includes(section)) body = renderEmployment(items as CvEmployment[])
  else if (section === 'publications') body = renderPublications(items as CvPublication[])
  else if (['projects', 'researchProjects'].includes(section)) body = renderProjects(items as CvData['projects'])
  else if (['awards', 'scholarships'].includes(section)) body = renderAwards(items as CvAward[])
  else if (['technicalSkills', 'researchSkills'].includes(section)) return `\\section{${escapeLatex(label, 120)}}\n${renderSkillSection(items as CvFact<string>[])}`
  else body = renderStrings(items as CvFact<string>[])
  return body ? `${sectionStart(label)}\n${body}\n${sectionEnd()}` : ''
}

function normaliseSectionOrder(order: string[], data: CvData) {
  const candidate = order.length ? order : sectionPriorityResearch
  return [...new Set(candidate)].filter(section => sectionLabels[section] && sectionItems(data, section).length)
}

function header(data: CvData) {
  const name = escapeLatex(factValue(data.fullName), 240)
  const email = safeText(factValue(data.email), 320)
  const links = [
    ['phone', factValue(data.phone), factValue(data.phone) ? escapeLatex(factValue(data.phone), 120) : ''],
    ['email', email, email ? `\\href{${escapeUrl(`mailto:${email}`)}}{\\underline{${escapeLatex(email, 320)}}}` : ''],
    ['linkedin', factValue(data.linkedin), escapeUrl(factValue(data.linkedin)) ? `\\href{${escapeUrl(factValue(data.linkedin))}}{\\underline{${escapeLatex(linkLabel(factValue(data.linkedin)), 320)}}}` : ''],
    ['github', factValue(data.github), escapeUrl(factValue(data.github)) ? `\\href{${escapeUrl(factValue(data.github))}}{\\underline{${escapeLatex(linkLabel(factValue(data.github)), 320)}}}` : ''],
    ['portfolio', factValue(data.portfolio), escapeUrl(factValue(data.portfolio)) ? `\\href{${escapeUrl(factValue(data.portfolio))}}{\\underline{${escapeLatex(linkLabel(factValue(data.portfolio)), 320)}}}` : ''],
    ['website', factValue(data.website), escapeUrl(factValue(data.website)) ? `\\href{${escapeUrl(factValue(data.website))}}{\\underline{${escapeLatex(linkLabel(factValue(data.website)), 320)}}}` : ''],
  ].filter(([, value, rendered]) => Boolean(value) && Boolean(rendered)).map(([, , rendered]) => rendered)
  return [
    '\\begin{center}',
    `    \\textbf{\\Huge \\scshape \\mbox{${name}}} \\\\ \\vspace{1pt}`,
    `    \\small ${links.join(' $|$ ')}`,
    '\\end{center}',
  ].join('\n')
}

export function renderCanonicalCv(input: {
  data: CvData
  pageTarget: CvPageTarget
  sectionOrder?: string[]
  tailoringBrief?: CvTailoringBrief | null
}): CvRenderResult {
  const issues = validateCvData(input.data)
  if (issues.length) throw new Error(`CV provenance validation failed: ${issues.map(issue => `${issue.path}: ${issue.message}`).join(' ')}`)
  const tailoringIssues = input.tailoringBrief ? validateCvTailoringBrief(input.tailoringBrief) : []
  if (tailoringIssues.length) throw new Error(`CV tailoring validation failed: ${tailoringIssues.map(issue => `${issue.path}: ${issue.message}`).join(' ')}`)
  const order = normaliseSectionOrder(input.sectionOrder ?? [], input.data)
  const estimatedContentLines = order.reduce((total, section) => total + estimateLines(input.data, section), 4)
  const resolvedPageTarget: CvPageTarget = input.pageTarget === 'one_page'
    ? 'one_page'
    : input.pageTarget === 'two_page' || estimatedContentLines > CV_ONE_PAGE_LINE_CAPACITY ? 'two_page' : 'one_page'
  const selectedSections: string[] = []
  const omittedContent: string[] = []
  const rendered: string[] = []
  for (const section of order) {
    const sectionTex = renderSection(input.data, section)
    if (!sectionTex) continue
    rendered.push(sectionTex)
    selectedSections.push(section)
  }
  const latex = `${canonicalGraduateCvPreamble}\n\n${header(input.data)}\n\n${rendered.join('\n\n')}\n\n${canonicalGraduateCvEnd}\n`
  return {
    latex,
    selectedSections,
    omittedContent,
    pageTarget: resolvedPageTarget,
    tailoringBrief: input.tailoringBrief ?? null,
    templateId: GRADUATE_CV_TEMPLATE_ID,
    templateVersion: GRADUATE_CV_TEMPLATE_VERSION,
    rendererVersion: GRADUATE_CV_RENDERER_VERSION,
  }
}

function factFromApplicant<T>(fact: ApplicantFact<T>, sourceFactId: string): CvFact<T> {
  return {
    value: fact.value,
    provenance: {
      confirmed: fact.provenance.confirmed,
      sourceFactIds: [sourceFactId],
      sourceAssetIds: fact.provenance.sourceAssetIds,
      kind: fact.provenance.kind === 'generated_inference' ? 'approved_derived_artifact' : fact.provenance.kind,
      sourceUrl: fact.provenance.sourceUrl,
    },
  }
}

export function cvDataFromApplicantProfile(profile: ApplicantProfile): CvData {
  const source = (path: string) => `${profile.id}:${path}`
  const strings = (items: ApplicantFactCollectionLike<string> | undefined, path: string) => (items ?? []).filter(item => item.provenance.confirmed).map((item, index) => factFromApplicant(item, source(`${path}.${index}`)))
  return {
    fullName: profile.legalName ? factFromApplicant(profile.legalName, source('legalName')) : { value: '', provenance: { confirmed: false, sourceFactIds: [], sourceAssetIds: [], kind: 'user_statement' } },
    preferredName: profile.preferredName ? factFromApplicant(profile.preferredName, source('preferredName')) : null,
    email: profile.contactInformation.email ? factFromApplicant(profile.contactInformation.email, source('contactInformation.email')) : { value: '', provenance: { confirmed: false, sourceFactIds: [], sourceAssetIds: [], kind: 'user_statement' } },
    phone: profile.contactInformation.phone ? factFromApplicant(profile.contactInformation.phone, source('contactInformation.phone')) : null,
    location: profile.residency ? factFromApplicant(profile.residency, source('residency')) : null,
    education: profile.education.filter(item => item.provenance.confirmed).map((item, index) => factFromApplicant(item, source(`education.${index}`))),
    researchExperience: profile.researchExperience.filter(item => item.provenance.confirmed).map((item, index) => factFromApplicant(item, source(`researchExperience.${index}`))),
    workExperience: profile.employment.filter(item => item.provenance.confirmed).map((item, index) => factFromApplicant(item, source(`employment.${index}`))),
    teachingExperience: [],
    publications: profile.publications.filter(item => item.provenance.confirmed).map((item, index) => factFromApplicant(item, source(`publications.${index}`))),
    presentations: strings([], 'presentations'),
    projects: strings(profile.projects, 'projects').map(item => ({ ...item, value: { title: item.value, description: item.value } })),
    researchProjects: [],
    leadership: strings(profile.leadershipExperience, 'leadershipExperience'),
    awards: profile.awards.filter(item => item.provenance.confirmed).map((item, index) => factFromApplicant(item, source(`awards.${index}`))),
    scholarships: [],
    certifications: [],
    technicalSkills: strings(profile.skills, 'skills'),
    researchSkills: strings(profile.researchInterests, 'researchInterests'),
    languages: [],
    coursework: [],
    memberships: [],
  }
}

type ApplicantFactCollectionLike<T> = Array<ApplicantFact<T>>

export function validateCanonicalLatex(latex: string) {
  const errors: string[] = []
  if (!latex.startsWith(canonicalGraduateCvPreamble)) errors.push('canonical graduate CV template preamble is missing or changed')
  if (!latex.includes(`\\documentclass[letterpaper,11pt]{article}`)) errors.push('canonical document class is missing')
  if (!latex.includes('\\input{glyphtounicode}')) errors.push('approved glyph-to-unicode input is missing')
  if (!latex.includes('\\pdfgentounicode=1')) errors.push('ATS unicode extraction is disabled')
  const executableLatex = latex.split('\n').map(line => line.replace(/(^|[^\\])%.*/, '$1')).join('\n')
  const unsafePackage = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/gi
  const approvedPackages = new Set(['latexsym', 'fullpage', 'titlesec', 'marvosym', 'color', 'verbatim', 'enumitem', 'hyperref', 'fancyhdr', 'babel', 'tabularx'])
  let packageMatch: RegExpExecArray | null
  let hasUnsafePackage = false
  while ((packageMatch = unsafePackage.exec(executableLatex))) {
    if (!approvedPackages.has(packageMatch[1]!.trim())) hasUnsafePackage = true
  }
  const inputCommands = executableLatex.match(/\\input\s*\{[^}]*\}/gi) ?? []
  const hasUnapprovedInput = inputCommands.some(command => !/^\\input\s*\{glyphtounicode\}$/i.test(command))
  const endIndex = latex.lastIndexOf('\\end{document}')
  const dynamicBody = endIndex >= canonicalGraduateCvPreamble.length
    ? latex.slice(canonicalGraduateCvPreamble.length, endIndex)
    : ''
  const unsafeDynamicCommand = /\\(?:newcommand|renewcommand|providecommand|def|edef|gdef|xdef|let|newenvironment|renewenvironment|newif|Declare[A-Za-z@]+|AtBeginDocument|AtEndDocument|catcode|read|openin|openout|write|special|csname|usepackage|documentclass|input|include)\b/i
  const unsafeDynamicEnvironment = /\\(?:begin|end)\s*\{(?:document|verbatim|filecontents)\}/i
  if (
    /\\(?:write18|include|openin|openout)\s*(?:\{|\s|$)/i.test(executableLatex) ||
    hasUnapprovedInput ||
    hasUnsafePackage ||
    unsafeDynamicCommand.test(dynamicBody) ||
    unsafeDynamicEnvironment.test(dynamicBody)
  ) {
    errors.push('unsafe LaTeX command or package detected')
  }
  if (/\\(?:documentclass|begin|end)\s*\{(?:verbatim|filecontents)\}/i.test(executableLatex)) errors.push('unsafe environment detected')
  if (!latex.trim().endsWith('\\end{document}')) errors.push('document terminator is missing')
  return errors
}
