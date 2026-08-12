/**
 * Deterministic, provenance-gated CV rendering for David.
 *
 * The model supplies structured content only. This module owns the complete
 * LaTeX surface so applicant text can never introduce a command, package, or
 * file read into the compiler.
 */

import type { ApplicantProfile, ApplicantFact, EducationRecord, EmploymentRecord, PublicationRecord, ResearchRecord, AwardRecord } from './david-applications.ts'

export const GRADUATE_CV_TEMPLATE_ID = 'graduate_application_cv_v1' as const
export const GRADUATE_CV_TEMPLATE_VERSION = '1.0.0' as const
export const GRADUATE_CV_RENDERER_VERSION = '1.0.0' as const
export const GRADUATE_CV_META_PROMPT_VERSION = 'graduate-cv-selection-v1' as const

export type CvPageTarget = 'one_page' | 'two_page' | 'academic'

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
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

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

% Dynamic header rendered from confirmed ApplicantProfile facts.
% Dynamic sections rendered from the typed CV schema.`

const canonicalGraduateCvEnd = String.raw`\end{document}`

const sectionPriorityResearch = [
  'education', 'researchExperience', 'publications', 'workExperience', 'researchProjects',
  'teachingExperience', 'leadership', 'awards', 'scholarships', 'technicalSkills', 'researchSkills',
  'coursework', 'certifications', 'languages', 'memberships', 'presentations', 'projects',
]

const sectionLabels: Record<string, string> = {
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
  const url = safeText(value, 2_000)
  if (!/^(?:https?:\/\/|mailto:)[^\s]+$/i.test(url)) return ''
  return url.replace(/([%#_{}&])/g, '\\$1')
}

function factValue<T>(fact: CvFact<T> | null | undefined) {
  return fact?.value
}

function dateRange(start: string | null | undefined, end: string | null | undefined) {
  const clean = (value: string | null | undefined) => safeText(value, 40)
  return [clean(start), clean(end)].filter(Boolean).join(' -- ')
}

function itemText(value: CvFact<string> | undefined) {
  return escapeLatex(factValue(value), 4_000)
}

function sectionStart(label: string) {
  return `\\section{${escapeLatex(label, 120)}}\n\\resumeSubHeadingListStart`
}

function sectionEnd() {
  return '\\resumeSubHeadingListEnd'
}

function renderEducation(items: CvEducation[]) {
  return items.map(item => {
    const record = factValue(item) ?? {} as EducationRecord
    return `\\resumeSubheading{${escapeLatex(record.institution, 300)}}{${escapeLatex(dateRange(record.startDate, record.endDate), 80)}}{${escapeLatex([record.degree, record.field].filter(Boolean).join(', '), 300)}}{${escapeLatex(record.country, 120)}}`
  }).join('\n')
}

function renderResearch(items: CvResearch[]) {
  return items.map(item => {
    const record = factValue(item) ?? {} as ResearchRecord
    const details = [...record.methods, ...record.outcomes].filter(Boolean).map(value => `\\resumeItem{${escapeLatex(value, 3_000)}}`).join('\n')
    return `\\resumeSubheading{${escapeLatex(record.title, 300)}}{${escapeLatex(dateRange(record.startDate, record.endDate), 80)}}{${escapeLatex(record.institution, 300)}}{}\n\\resumeItemListStart\n\\resumeItem{${escapeLatex(record.summary, 3_000)}}\n${details}\n\\resumeItemListEnd`
  }).join('\n')
}

function renderEmployment(items: CvEmployment[]) {
  return items.map(item => {
    const record = factValue(item) ?? {} as EmploymentRecord
    const details = record.responsibilities.filter(Boolean).map(value => `\\resumeItem{${escapeLatex(value, 3_000)}}`).join('\n')
    return `\\resumeSubheading{${escapeLatex(record.employer, 300)}}{${escapeLatex(dateRange(record.startDate, record.endDate), 80)}}{${escapeLatex(record.title, 300)}}{}\n\\resumeItemListStart\n${details}\n\\resumeItemListEnd`
  }).join('\n')
}

function renderPublications(items: CvPublication[]) {
  return items.map(item => {
    const record = factValue(item) ?? {} as PublicationRecord
    const citation = [record.title, record.venue, record.authorship, record.year].filter(value => value !== null && value !== undefined && String(value).trim()).join('. ')
    const link = escapeUrl(record.url)
    return `\\resumeItem{${escapeLatex(citation, 3_500)}${link ? ` \\href{${link}}{link}` : ''}}`
  }).join('\n')
}

function renderProjects(items: CvData['projects'] | CvData['researchProjects']) {
  return items.map(item => {
    const record = factValue(item) as { title: string; description: string; technologies?: string[]; methods?: string[]; outcomes?: string[]; date?: string | null } ?? { title: '', description: '' }
    const technologies = Array.isArray(record.technologies) ? record.technologies : Array.isArray(record.methods) ? record.methods : []
    // Escape applicant-controlled text before adding the approved math
    // separator. Escaping the complete string would turn the `$|$` separator
    // into literal dollar signs in the rendered PDF.
    const heading = [escapeLatex(record.title, 300), technologies.length ? technologies.map(value => escapeLatex(value, 120)).join(', ') : ''].filter(Boolean).join(' $|$ ')
    return `\\resumeProjectHeading{\\textbf{${heading}}}{${escapeLatex(record.date, 80)}}\n\\resumeItemListStart\n\\resumeItem{${escapeLatex(record.description, 3_500)}}${Array.isArray(record.outcomes) ? `\n${record.outcomes.map(value => `\\resumeItem{${escapeLatex(value, 2_000)}}`).join('\n')}` : ''}\n\\resumeItemListEnd`
  }).join('\n')
}

function renderStrings(items: CvFact<string>[]) {
  return items.map(item => `\\resumeItem{${itemText(item)}}`).join('\n')
}

function renderAwards(items: CvAward[]) {
  return items.map(item => {
    const record = factValue(item) ?? {} as AwardRecord
    return `\\resumeItem{\\textbf{${escapeLatex(record.title, 300)}}${record.issuer ? `, ${escapeLatex(record.issuer, 240)}` : ''}${record.year ? ` (${escapeLatex(record.year, 20)})` : ''}${record.description ? `: ${escapeLatex(record.description, 1_500)}` : ''}}`
  }).join('\n')
}

function sectionItems(data: CvData, section: string): unknown[] {
  const value = data[section as keyof CvData]
  return Array.isArray(value) ? value : []
}

function estimateLines(data: CvData, section: string) {
  return Math.max(1, sectionItems(data, section).length * (['researchExperience', 'workExperience', 'teachingExperience', 'projects', 'researchProjects'].includes(section) ? 5 : 2) + 2)
}

function renderSection(data: CvData, section: string) {
  const label = sectionLabels[section]
  if (!label || !sectionItems(data, section).length) return ''
  const items = sectionItems(data, section)
  let body = ''
  if (section === 'education') body = renderEducation(items as CvEducation[])
  else if (section === 'researchExperience') body = renderResearch(items as CvResearch[])
  else if (['workExperience', 'teachingExperience'].includes(section)) body = renderEmployment(items as CvEmployment[])
  else if (section === 'publications') body = renderPublications(items as CvPublication[])
  else if (['projects', 'researchProjects'].includes(section)) body = renderProjects(items as CvData['projects'])
  else if (['awards', 'scholarships'].includes(section)) body = renderAwards(items as CvAward[])
  else body = renderStrings(items as CvFact<string>[])
  return `${sectionStart(label)}\n${body}\n${sectionEnd()}`
}

function normaliseSectionOrder(order: string[], data: CvData) {
  const defaults = order.length ? order : sectionPriorityResearch
  return [...new Set([...defaults, ...sectionPriorityResearch])].filter(section => sectionLabels[section] && sectionItems(data, section).length)
}

function header(data: CvData) {
  const name = escapeLatex(factValue(data.fullName), 240)
  const email = safeText(factValue(data.email), 320)
  const links = [
    ['email', email, email ? `\\href{${escapeUrl(`mailto:${email}`)}}{${escapeLatex(email, 320)}}` : ''],
    ['phone', factValue(data.phone), escapeLatex(factValue(data.phone), 120)],
    ['location', factValue(data.location), escapeLatex(factValue(data.location), 160)],
    ['linkedin', factValue(data.linkedin), escapeUrl(factValue(data.linkedin)) ? `\\href{${escapeUrl(factValue(data.linkedin))}}{LinkedIn}` : ''],
    ['github', factValue(data.github), escapeUrl(factValue(data.github)) ? `\\href{${escapeUrl(factValue(data.github))}}{GitHub}` : ''],
    ['portfolio', factValue(data.portfolio), escapeUrl(factValue(data.portfolio)) ? `\\href{${escapeUrl(factValue(data.portfolio))}}{Portfolio}` : ''],
    ['website', factValue(data.website), escapeUrl(factValue(data.website)) ? `\\href{${escapeUrl(factValue(data.website))}}{Website}` : ''],
  ].filter(([, value, rendered]) => Boolean(value) && Boolean(rendered)).map(([, , rendered]) => rendered)
  return [
    '\\begin{center}',
    `    {\\Huge \\scshape \\mbox{${name}}} \\\\`,
    `    \\small ${links.join(' $|$ ')}`,
    '\\end{center}',
  ].join('\n')
}

export function renderCanonicalCv(input: {
  data: CvData
  pageTarget: CvPageTarget
  sectionOrder?: string[]
}): CvRenderResult {
  const issues = validateCvData(input.data)
  if (issues.length) throw new Error(`CV provenance validation failed: ${issues.map(issue => `${issue.path}: ${issue.message}`).join(' ')}`)
  const order = normaliseSectionOrder(input.sectionOrder ?? [], input.data)
  const maxLines = input.pageTarget === 'one_page' ? 42 : input.pageTarget === 'two_page' ? 82 : Number.POSITIVE_INFINITY
  let usedLines = 0
  const selectedSections: string[] = []
  const omittedContent: string[] = []
  const rendered: string[] = []
  for (const section of order) {
    const estimated = estimateLines(input.data, section)
    if (usedLines + estimated > maxLines && input.pageTarget !== 'academic') {
      omittedContent.push(section)
      continue
    }
    const sectionTex = renderSection(input.data, section)
    if (!sectionTex) continue
    rendered.push(sectionTex)
    selectedSections.push(section)
    usedLines += estimated
  }
  const latex = `${canonicalGraduateCvPreamble}\n\n${header(input.data)}\n\n${rendered.join('\n\n')}\n\n${canonicalGraduateCvEnd}\n`
  return {
    latex,
    selectedSections,
    omittedContent,
    pageTarget: input.pageTarget,
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
