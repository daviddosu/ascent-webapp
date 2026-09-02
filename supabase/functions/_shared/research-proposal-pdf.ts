/**
 * Deterministic, provenance-preserving LaTeX rendering for research proposals.
 *
 * The document skeleton follows the supplied UC-SHSS research-proposal
 * template. The writer supplies prose and verified citation metadata only;
 * this module creates the controlled paper.tex and refs.bib files that the
 * master document includes.
 */

// This renderer is also loaded by the Vercel LaTeX worker. Keep its small
// escaping dependency in a JavaScript module so the worker does not ship a
// Deno-only `.ts` runtime import.
import { escapeLatex } from './cv-runtime.js'
import type { ProposalCitation, ProposalDraft, ResearchProposalRequirement } from './research-proposal-workflow.ts'

export const RESEARCH_PROPOSAL_TEMPLATE_ID = 'uc_shss_research_proposal_v1' as const
export const RESEARCH_PROPOSAL_TEMPLATE_VERSION = '1.0.0' as const
export const RESEARCH_PROPOSAL_RENDERER_VERSION = '2.0.0' as const
export const RESEARCH_PROPOSAL_LATEX_MARKER = '% SHOTCOUNT_CANONICAL_RESEARCH_PROPOSAL'

export const RESEARCH_PROPOSAL_AUXILIARY_FILENAMES = ['paper.tex', 'refs.bib'] as const
export type ResearchProposalAuxiliaryFilename = typeof RESEARCH_PROPOSAL_AUXILIARY_FILENAMES[number]

export type ResearchProposalAuxiliaryFile = {
  filename: ResearchProposalAuxiliaryFilename
  content: string
}

type ResearchProposalSection = {
  heading: string | null
  lines: string[]
}

export type ResearchProposalLatexRenderResult = {
  latex: string
  auxiliaryFiles: ResearchProposalAuxiliaryFile[]
  templateId: typeof RESEARCH_PROPOSAL_TEMPLATE_ID
  templateVersion: typeof RESEARCH_PROPOSAL_TEMPLATE_VERSION
  rendererVersion: typeof RESEARCH_PROPOSAL_RENDERER_VERSION
  sectionsRendered: string[]
  formatMetadata: Record<string, string | number | boolean | null>
}

const knownHeadings: Record<string, string> = {
  background: 'Background',
  introduction: 'Introduction',
  'research question': 'Research question',
  'research questions': 'Research questions',
  'literature review': 'Literature review',
  literature: 'Literature',
  'research gap': 'Research gap',
  methodology: 'Methodology',
  methods: 'Methodology',
  data: 'Data and materials',
  'data and materials': 'Data and materials',
  analysis: 'Analysis',
  validation: 'Validation',
  'expected contribution': 'Expected contribution',
  contribution: 'Expected contribution',
  fit: 'Fit',
  'applicant fit': 'Applicant fit',
  'programme fit': 'Programme fit',
  'program fit': 'Programme fit',
  'supervisor fit': 'Supervisor fit',
  feasibility: 'Feasibility',
  timeline: 'Timeline',
  limitations: 'Limitations',
  'risks and limitations': 'Risks and limitations',
  conclusion: 'Conclusion',
  references: 'References',
  bibliography: 'References',
}

function clean(value: unknown, maximum = 4_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function normalized(value: unknown) {
  return clean(value, 200).replace(/^\s*\d+[.)-]\s*/, '').replace(/[:.]\s*$/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/gi, ' ').trim().toLocaleLowerCase()
}

function titleForHeading(value: string, writerSections: Set<string>) {
  const normalizedHeading = normalized(value)
  if (knownHeadings[normalizedHeading]) return knownHeadings[normalizedHeading]
  if (writerSections.has(normalizedHeading)) return value.replace(/^\s*\d+[.)-]\s*/, '').replace(/[:.]\s*$/, '').trim()
  return null
}

function isAllCapsHeading(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, '')
  return letters.length >= 3 && letters === letters.toLocaleUpperCase() && value.length <= 100 && !/[.!?]$/.test(value)
}

function parseSections(body: string, sections: string[]) {
  const writerSections = new Set(sections.map(normalized).filter(Boolean))
  const parsed: ResearchProposalSection[] = []
  let current: ResearchProposalSection = { heading: null, lines: [] }
  const flush = () => {
    if (current.lines.some(line => line.trim()) || current.heading) parsed.push(current)
    current = { heading: null, lines: [] }
  }
  for (const rawLine of body.split(/\r?\n/u)) {
    const line = rawLine.trim()
    const heading = line && (titleForHeading(line, writerSections) ?? (isAllCapsHeading(line) ? line : null))
    if (heading) {
      flush()
      current.heading = heading
    } else {
      current.lines.push(rawLine)
    }
  }
  flush()
  return parsed
}

function textBlock(lines: string[]) {
  return lines.map(line => line.trim()).filter(Boolean).join(' ')
}

function renderBlocks(lines: string[]) {
  const output: string[] = []
  let paragraph: string[] = []
  let bullets: string[] = []
  const flushParagraph = () => {
    const value = textBlock(paragraph)
    if (value) output.push(escapeLatex(value, 20_000))
    paragraph = []
  }
  const flushBullets = () => {
    if (!bullets.length) return
    output.push(
      '\\begin{itemize}\n' +
      bullets.map(item => '\\item ' + escapeLatex(item, 4_000)).join('\n') +
      '\n\\end{itemize}',
    )
    bullets = []
  }
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushBullets()
      continue
    }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/u)?.[1]?.trim()
    if (bullet) {
      flushParagraph()
      bullets.push(bullet)
    } else {
      flushBullets()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushBullets()
  return output.join('\n\n')
}

function renderSection(section: ResearchProposalSection, includeStructuredBibliography: boolean) {
  if (includeStructuredBibliography && ['references', 'bibliography'].includes(normalized(section.heading))) return ''
  const body = renderBlocks(section.lines)
  if (!body) return ''
  const heading = section.heading ? '\\section{' + escapeLatex(section.heading, 200) + '}\n' : ''
  return heading + body
}

function formatPaperTitle(title: string, programme: string) {
  return clean(title, 240) || 'Research proposal for ' + clean(programme, 240)
}

function bibtexEscape(value: unknown, maximum = 2_000) {
  return clean(value, maximum)
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/[{}]/g, character => '\\' + character)
    .replace(/([#$%&_])/g, '\\$1')
}

function bibtexKey(citation: ProposalCitation, index: number, used: Set<string>) {
  const base = clean(citation.id, 120).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'reference-' + (index + 1)
  let key = 'proposal-' + base
  let suffix = 2
  while (used.has(key)) key = 'proposal-' + base + '-' + suffix++
  used.add(key)
  return key
}

function renderBibliography(citations: ProposalCitation[]) {
  const used = new Set<string>()
  const entries = citations.filter(citation => clean(citation.title, 1_000)).map((citation, index) => {
    const key = bibtexKey(citation, index, used)
    const authors = citation.authors.length ? citation.authors.join(' and ') : 'Unknown'
    const fields = [
      '  author = {' + bibtexEscape(authors, 1_000) + '}',
      '  title = {' + bibtexEscape(citation.title, 1_000) + '}',
      '  year = {' + (citation.year && citation.year > 0 ? citation.year : 'n.d.') + '}',
      '  journal = {' + bibtexEscape(citation.venue || 'Verified research source', 500) + '}',
      ...(citation.identifier ? ['  note = {Identifier: ' + bibtexEscape(citation.identifier, 500) + '}'] : []),
    ]
    return '@article{' + key + ',\n' + fields.join(',\n') + '\n}'
  })
  return entries.length ? entries.join('\n\n') + '\n' : '% No verified bibliography entries were supplied.\n'
}

function renderPaper(draft: ProposalDraft) {
  const includeStructuredBibliography = draft.citations.length > 0
  return parseSections(draft.body, draft.sections).map(section => renderSection(section, includeStructuredBibliography)).filter(Boolean).join('\n\n') + '\n'
}

function proposalTemplate(input: { draft: ProposalDraft; title: string; includeStructuredBibliography: boolean }) {
  return [
    RESEARCH_PROPOSAL_LATEX_MARKER,
    '% The master document follows the supplied UC-SHSS research-proposal template.',
    '\\documentclass[a4paper]{article}',
    '',
    '%% Language and font encodings',
    '\\usepackage[english]{babel}',
    '\\usepackage[utf8x]{inputenc}',
    '',
    '\\usepackage{booktabs}',
    '\\usepackage{tabu}',
    '\\usepackage[T1]{fontenc}',
    '',
    '%% Sets page size and margins',
    '\\usepackage[a4paper,top=3cm,bottom=2cm,left=3cm,right=3cm,marginparwidth=1.75cm]{geometry}',
    '',
    '%% Useful packages',
    '\\usepackage{amsmath}',
    '\\usepackage{graphicx}',
    '%\\usepackage{apacite}',
    '\\usepackage[colorinlistoftodos]{todonotes}',
    '\\usepackage[colorlinks=true, allcolors=blue]{hyperref}',
    '',
    '\\input{glyphtounicode}',
    '\\pdfgentounicode=1',
    '',
    '\\title{' + escapeLatex(input.title, 800) + '}',
    '\\author{' + escapeLatex(input.draft.applicantName, 240) + ' \\\\ ' + escapeLatex(input.draft.programme, 500) + ' \\\\ ' + escapeLatex(input.draft.institution, 500) + '}',
    '\\date{}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    '\\input{paper}',
    '',
    ...(input.includeStructuredBibliography ? ['\\nocite{*}'] : []),
    '\\bibliographystyle{plain}',
    '\\bibliography{refs}',
    '',
    '\\end{document}',
    '',
  ].join('\n')
}

/** Render a validated writer draft into the supplied UC-SHSS LaTeX template. */
export function renderResearchProposalLatex(input: {
  draft: ProposalDraft
  requirement: ResearchProposalRequirement
  proposalTitle?: string | null
}): ResearchProposalLatexRenderResult {
  const title = formatPaperTitle(input.proposalTitle ?? '', input.draft.programme)
  const sections = parseSections(input.draft.body, input.draft.sections)
  const includeStructuredBibliography = input.draft.citations.length > 0
  const latex = proposalTemplate({ draft: input.draft, title, includeStructuredBibliography })
  const auxiliaryFiles: ResearchProposalAuxiliaryFile[] = [
    { filename: 'paper.tex', content: renderPaper(input.draft) },
    { filename: 'refs.bib', content: renderBibliography(input.draft.citations) },
  ]
  return {
    latex,
    auxiliaryFiles,
    templateId: RESEARCH_PROPOSAL_TEMPLATE_ID,
    templateVersion: RESEARCH_PROPOSAL_TEMPLATE_VERSION,
    rendererVersion: RESEARCH_PROPOSAL_RENDERER_VERSION,
    sectionsRendered: sections.filter(section => section.heading && (!includeStructuredBibliography || !['references', 'bibliography'].includes(normalized(section.heading)))).map(section => section.heading!).filter((heading, index, all) => all.indexOf(heading) === index),
    formatMetadata: {
      documentClass: 'article',
      paperSize: 'a4paper',
      font: 'LaTeX default Computer Modern',
      fontSize: '10pt',
      margins: 'top 3 cm; bottom 2 cm; left 3 cm; right 3 cm',
      lineSpacing: 'single',
      bibliographyStyle: 'plain',
      layout: 'uc-shss-maketitle-paper-input-bibliography',
      auxiliaryFiles: 'paper.tex,refs.bib',
    },
  }
}

export function validateResearchProposalAuxiliaryFiles(files: Array<{ filename: string; content: string }>) {
  const errors: string[] = []
  const byName = new Map(files.map(file => [file.filename, file.content]))
  for (const filename of RESEARCH_PROPOSAL_AUXILIARY_FILENAMES) {
    const content = byName.get(filename)
    if (typeof content !== 'string') errors.push('required research-proposal auxiliary file is missing: ' + filename)
    else if (new TextEncoder().encode(content).length > 220_000) errors.push('research-proposal auxiliary file is too large: ' + filename)
  }
  if (files.some(file => !RESEARCH_PROPOSAL_AUXILIARY_FILENAMES.includes(file.filename as ResearchProposalAuxiliaryFilename))) errors.push('unapproved research-proposal auxiliary filename detected')
  for (const file of files) {
    if (/\\(?:input|include|usepackage|documentclass|write18|openin|openout|read|special|catcode|csname)\b/i.test(file.content)) errors.push('unsafe research-proposal auxiliary command detected in ' + file.filename)
  }
  return [...new Set(errors)]
}

/**
 * Validate the fixed LaTeX surface before it reaches the compiler service.
 * Dynamic content is confined to paper.tex and refs.bib, which are supplied
 * by the renderer and written only under these exact allowlisted filenames.
 */
export function validateResearchProposalLatex(latex: string) {
  const errors: string[] = []
  if (!latex.startsWith(RESEARCH_PROPOSAL_LATEX_MARKER)) errors.push('canonical research-proposal template marker is missing')
  if (!/\\documentclass\[a4paper\]\{article\}/.test(latex)) errors.push('UC-SHSS article document class is missing')
  const requiredSnippets = [
    '\\usepackage[english]{babel}',
    '\\usepackage[utf8x]{inputenc}',
    '\\usepackage{booktabs}',
    '\\usepackage{tabu}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[a4paper,top=3cm,bottom=2cm,left=3cm,right=3cm,marginparwidth=1.75cm]{geometry}',
    '\\usepackage{amsmath}',
    '\\usepackage{graphicx}',
    '\\usepackage[colorinlistoftodos]{todonotes}',
    '\\usepackage[colorlinks=true, allcolors=blue]{hyperref}',
    '\\input{glyphtounicode}',
    '\\pdfgentounicode=1',
    '\\maketitle',
    '\\input{paper}',
    '\\bibliographystyle{plain}',
    '\\bibliography{refs}',
  ]
  for (const snippet of requiredSnippets) if (!latex.includes(snippet)) errors.push('required UC-SHSS template command is missing: ' + snippet)
  const executableLatex = latex.split('\n').map(line => line.replace(/(^|[^\\])%.*/, '$1')).join('\n')
  const unsafePackage = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/gi
  const approvedPackages = new Set(['babel', 'inputenc', 'booktabs', 'tabu', 'fontenc', 'geometry', 'amsmath', 'graphicx', 'todonotes', 'hyperref'])
  let packageMatch: RegExpExecArray | null
  while ((packageMatch = unsafePackage.exec(executableLatex))) {
    if (!approvedPackages.has(packageMatch[1]!.trim())) errors.push('unapproved LaTeX package: ' + packageMatch[1]!.trim())
  }
  const inputs = [...executableLatex.matchAll(/\\input\s*\{([^}]+)\}/gi)].map(match => match[1]!.trim())
  for (const filename of inputs) if (!['glyphtounicode', 'paper'].includes(filename)) errors.push('unsafe LaTeX input file detected: ' + filename)
  const bibliographyFiles = [...executableLatex.matchAll(/\\bibliography\s*\{([^}]+)\}/gi)].map(match => match[1]!.trim())
  for (const filename of bibliographyFiles) if (filename !== 'refs') errors.push('unsafe bibliography file detected: ' + filename)
  const bibliographyStyles = [...executableLatex.matchAll(/\\bibliographystyle\s*\{([^}]+)\}/gi)].map(match => match[1]!.trim())
  for (const style of bibliographyStyles) if (style !== 'plain') errors.push('unsafe bibliography style detected: ' + style)
  const dynamicStart = latex.indexOf('\\begin{document}')
  const dynamicBody = dynamicStart >= 0 ? latex.slice(dynamicStart) : latex
  if (/\\(?:write18|include|openin|openout|read|special|catcode|csname)\b/i.test(dynamicBody)) errors.push('unsafe LaTeX file or execution command detected')
  if (/\\(?:usepackage|documentclass)\b/i.test(dynamicBody)) errors.push('dynamic LaTeX package or document-class command detected')
  if (/\\(?:begin|end)\s*\{(?:verbatim|filecontents)\}/i.test(dynamicBody.replace(/\\(?:begin|end)\s*\{document\}/gi, ''))) errors.push('unsafe dynamic LaTeX environment detected')
  if (!latex.trim().endsWith('\\end{document}')) errors.push('document terminator is missing')
  return [...new Set(errors)]
}
