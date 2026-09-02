import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileLatex } from '../api/application-cv'
import {
  canonicalGraduateCvPreamble,
  cvPageTargetForSourcePages,
  extractCvFactualInventory,
  GRADUATE_CV_META_PROMPT_VERSION,
  GRADUATE_CV_TAILORING_RULES,
  normalizeModelGraduateCvLatex,
  renderCanonicalCv,
  validateCvFactualInventory,
  validateCvTailoringBrief,
  validateCanonicalLatex,
  type CvData,
} from '../supabase/functions/_shared/cv'

function fact<T>(value: T, sourceFactId: string) {
  return {
    value,
    provenance: {
      confirmed: true as const,
      sourceFactIds: [sourceFactId],
      sourceAssetIds: [],
      kind: 'user_statement' as const,
    },
  }
}

function fixtureCv(): CvData {
  return {
    fullName: fact('Ada Lovelace', 'profile:name'),
    email: fact('ada@example.edu', 'profile:email'),
    phone: null,
    location: null,
    linkedin: null,
    github: null,
    portfolio: null,
    website: null,
    preferredName: null,
    education: [],
    researchExperience: [],
    workExperience: [],
    teachingExperience: [],
    publications: [],
    presentations: [],
    projects: [fact({ title: 'Safe & deterministic', description: 'A fact with % and \\input{private-file} syntax.' }, 'profile:project')],
    researchProjects: [],
    leadership: [],
    awards: [],
    scholarships: [],
    certifications: [],
    technicalSkills: [],
    researchSkills: [],
    languages: [],
    coursework: [],
    memberships: [],
  }
}

describe('canonical graduate application CV pipeline', () => {
  const tailoringBrief = {
    targetInstitution: 'Controlled University',
    targetProgramme: 'PhD Computational Physics',
    officialSourceUrls: ['https://controlled.example.edu/graduate/computational-physics'],
    prioritySignals: ['computational physics', 'numerical modelling'],
    applicantFitFactIds: ['profile:research', 'profile:skills'],
    fitStatement: 'Foreground computational physics research and numerical methods because the programme explicitly values both.',
  }

  it('derives the only two page targets from the physical source page count', () => {
    expect(cvPageTargetForSourcePages(1)).toBe('one_page')
    expect(cvPageTargetForSourcePages(2)).toBe('two_page')
    expect(cvPageTargetForSourcePages(7)).toBe('two_page')
  })

  it('validates factual atoms without requiring literal vocabulary overlap', () => {
    const source = 'Ada Example | ada@example.edu | 2021 -- 2024 | secured $300,000 for 16 internships and reached 320 institutions.'
    const faithfulRewrite = 'Ada Example, ada@example.edu. From 2021--2024, obtained $300,000 supporting 16 internships across 320 institutions.'
    const drifted = 'Ada Example, ada@example.edu. From 2022--2024, obtained $500,000 supporting 20 internships.'
    expect(extractCvFactualInventory(source).quantities).toEqual(expect.arrayContaining(['$300,000', '16 internships', '320 institutions']))
    expect(validateCvFactualInventory(source, faithfulRewrite).passed).toBe(true)
    expect(validateCvFactualInventory(source, drifted)).toMatchObject({ passed: false })
  })

  it('removes Markdown fences, restores the canonical shell, and preserves compilable currency', () => {
    const model = String.raw`\`\`\`latex
\documentclass{article}
\begin{document}
\section{Leadership}
\resumeItem{Secured $300,000 for verified internships.}
\end{document}
\`\`\``
    const normalized = normalizeModelGraduateCvLatex(model)
    expect(normalized.startsWith(canonicalGraduateCvPreamble)).toBe(true)
    expect(normalized).toContain(String.raw`Secured \$300,000`)
    expect(normalized.trimEnd().endsWith('\\end{document}')).toBe(true)
    expect(normalized).not.toContain('```')
  })

  it('uses the checked-in graduate template and deterministic provenance-gated rendering', () => {
    const template = readFileSync('templates/graduate_application_cv_v1.tex', 'utf8')
    expect(template.startsWith(canonicalGraduateCvPreamble)).toBe(true)
    expect(template.trimEnd().endsWith('\\end{document}')).toBe(true)

    const first = renderCanonicalCv({ data: fixtureCv(), pageTarget: 'academic', sectionOrder: ['projects'] })
    const second = renderCanonicalCv({ data: fixtureCv(), pageTarget: 'academic', sectionOrder: ['projects'] })
    expect(first.latex).toBe(second.latex)
    expect(first.templateId).toBe('graduate_application_cv_v1')
    expect(first.templateVersion).toBe('1.0.0')
    expect(validateCanonicalLatex(first.latex)).toEqual([])
    expect(first.latex).toContain('Safe \\& deterministic')
    expect(first.latex).not.toContain('\\input{private-file}')
    expect(validateCanonicalLatex(`${first.latex.replace('\\end{document}', '\\input {private-file}\n\\end{document}')}`)).toContain('unsafe LaTeX command or package detected')
    expect(validateCanonicalLatex(`${first.latex.replace('\\end{document}', '\\newcommand{\\unsafe}{x}\n\\end{document}')}`)).toContain('unsafe LaTeX command or package detected')
  })

  it('rejects unconfirmed or source-less facts before compilation', () => {
    const invalid = fixtureCv()
    invalid.fullName = {
      value: 'Ada Lovelace',
      provenance: { confirmed: false, sourceFactIds: [], sourceAssetIds: [], kind: 'user_statement' },
    }
    expect(() => renderCanonicalCv({ data: invalid, pageTarget: 'one_page' })).toThrow(/provenance/i)
  })

  it('keeps the pasted template semantics for headings, subheadings, projects, and skills', () => {
    const tailored = fixtureCv()
    tailored.phone = fact('+234 800 000 0000', 'profile:phone')
    tailored.linkedin = fact('https://linkedin.com/in/ada-lovelace', 'profile:linkedin')
    tailored.education = [fact({ institution: 'University of Lagos', degree: 'BSc', field: 'Physics', startDate: '2018', endDate: '2022', grade: null, country: 'Nigeria' }, 'cv:education')]
    tailored.researchExperience = [fact({ title: 'Quantum control', institution: 'Control Lab', summary: 'Built a validated control model.', methods: ['optimal control'], outcomes: ['Reduced error by 12%.'], startDate: '2022', endDate: '2024' }, 'cv:research')]
    tailored.workExperience = [fact({ employer: 'Physics Lab', title: 'Research Assistant', responsibilities: ['Ran experiments.'], startDate: '2021', endDate: '2022' }, 'cv:employment')]
    tailored.technicalSkills = [fact('Languages: Python, C++', 'cv:skills')]
    const rendered = renderCanonicalCv({ data: tailored, pageTarget: 'academic' })

    expect(rendered.latex).toContain('\\textbf{\\Huge \\scshape \\mbox{Ada Lovelace}} \\\\ \\vspace{1pt}')
    expect(rendered.latex).toContain('\\href{https://linkedin.com/in/ada-lovelace}{\\underline{linkedin.com/in/ada-lovelace}}')
    expect(rendered.latex).toContain('\\resumeSubheading{University of Lagos}{2018 -- 2022}{BSc, Physics}{Nigeria}')
    expect(rendered.latex).toContain('\\resumeSubheading{Quantum control}{2022 -- 2024}{Control Lab}{}')
    expect(rendered.latex).toContain('\\resumeProjectHeading{\\textbf{Safe \\& deterministic}}')
    expect(rendered.latex).toContain('\\section{Technical Skills}\n\\begin{itemize}[leftmargin=0.15in, label={}]')
  })

  it('honours an explicit tailored section order instead of silently appending a generic CV', () => {
    const tailored = fixtureCv()
    tailored.education = [fact({ institution: 'Controlled University', degree: 'BSc', field: 'Physics', startDate: '2020', endDate: '2024', grade: null, country: 'Nigeria' }, 'cv:education')]
    const rendered = renderCanonicalCv({ data: tailored, pageTarget: 'academic', sectionOrder: ['projects'] })
    expect(rendered.selectedSections).toEqual(['projects'])
    expect(rendered.latex).not.toContain('\\section{Education}')
  })

  it('defaults sparse academic requests to one page and validates programme tailoring briefs', () => {
    const rendered = renderCanonicalCv({ data: fixtureCv(), pageTarget: 'academic', sectionOrder: ['projects'], tailoringBrief })
    expect(rendered.pageTarget).toBe('one_page')
    expect(rendered.tailoringBrief?.targetProgramme).toBe('PhD Computational Physics')
    expect(validateCvTailoringBrief(tailoringBrief)).toEqual([])
    expect(validateCvTailoringBrief({ ...tailoringBrief, prioritySignals: ['generic'] })).toContainEqual(expect.objectContaining({ path: 'tailoring_brief.priority_signals' }))
  })

  it('publishes the explicit expert tailoring contract version', () => {
    expect(GRADUATE_CV_META_PROMPT_VERSION).toBe('graduate-cv-tailoring-v4')
    expect(GRADUATE_CV_TAILORING_RULES.length).toBeGreaterThanOrEqual(10)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/authoritative source/i)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/bounded synthesis/i)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/material applicant fact/i)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/single final PDF/i)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/generic CV is a failed output/i)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/one source page means exactly one output page/i)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/source inventory/i)
    expect(GRADUATE_CV_TAILORING_RULES.join(' ')).toMatch(/silently delete/i)
  })

  it('renders Nigerian and accented applicant names through the controlled pdfLaTeX character strategy', () => {
    const international = fixtureCv()
    international.fullName = fact('Chukwudi Élodie', 'profile:international-name')
    const rendered = renderCanonicalCv({ data: international, pageTarget: 'one_page' })
    expect(rendered.latex).toContain("Chukwudi \\'{E}lodie")
    expect(validateCanonicalLatex(rendered.latex)).toEqual([])
  })

  it('keeps rendering when a model omits optional list fields in a grounded record', () => {
    const partial = fixtureCv()
    partial.researchExperience = [fact({
      title: 'Quantum control',
      institution: 'Research Lab',
      summary: 'Built a control model.',
      methods: 'optimal control',
      outcomes: null,
      startDate: null,
      endDate: null,
    }, 'cv:research') as never]
    partial.workExperience = [fact({
      employer: 'Research Lab',
      title: 'Research assistant',
      responsibilities: 'Modelled control systems',
      startDate: null,
      endDate: null,
    }, 'cv:work') as never]

    expect(() => renderCanonicalCv({ data: partial, pageTarget: 'academic' })).not.toThrow()
  })

  it('preserves confirmed free-form CV facts instead of rendering empty sections', () => {
    const freeform = fixtureCv()
    freeform.education = [fact('Controlled University, BSc Physics, 2020–2024', 'cv:education') as never]
    freeform.researchExperience = [fact('Quantum Lab, Researcher, 2024; built a validated control model.', 'cv:research') as never]
    freeform.publications = [fact('A source-grounded quantum-control publication, 2025.', 'cv:publication') as never]
    const rendered = renderCanonicalCv({
      data: freeform,
      pageTarget: 'academic',
      sectionOrder: ['education', 'researchExperience', 'publications'],
    })

    expect(rendered.rendererVersion).toBe('1.8.0')
    expect(rendered.latex).toContain('Controlled University, BSc Physics, 2020--2024')
    expect(rendered.latex).toContain('Quantum Lab, Researcher, 2024; built a validated control model.')
    expect(rendered.latex).toContain('A source-grounded quantum-control publication, 2025.')
    expect(rendered.latex).not.toMatch(/\\resumeSubHeadingListStart\s*\\resumeSubHeadingListEnd/)
  })

  it('renders education details as real LaTeX lines', () => {
    const cv = fixtureCv()
    cv.education = [fact({
      institution: 'Controlled University',
      degree: 'BSc Physics',
      details: ['Thesis detail'],
    }, 'cv:education') as never]
    const rendered = renderCanonicalCv({ data: cv, pageTarget: 'one_page', sectionOrder: ['education'] })
    expect(rendered.latex).toContain('\\resumeItemListStart\n\\resumeItem{Thesis detail}')
    expect(rendered.latex).not.toContain('\\n\\resumeItemListStart')
  })

  it('keeps bare LinkedIn and GitHub contacts in the rendered header', () => {
    const cv = fixtureCv()
    cv.linkedin = fact('linkedin.com/in/ada-lovelace', 'cv:linkedin')
    cv.github = fact('github.com/ada-lovelace', 'cv:github')
    const rendered = renderCanonicalCv({ data: cv, pageTarget: 'one_page' })
    expect(rendered.latex).toContain('\\href{https://linkedin.com/in/ada-lovelace}{\\underline{linkedin.com/in/ada-lovelace}}')
    expect(rendered.latex).toContain('\\href{https://github.com/ada-lovelace}{\\underline{github.com/ada-lovelace}}')
  })

  it('fails closed when a serverless worker has no canonical LaTeX compiler', async () => {
    const rendered = renderCanonicalCv({ data: fixtureCv(), pageTarget: 'one_page' })
    await expect(compileLatex(rendered.latex, {
      compilerPath: '/definitely-missing/pdflatex',
      expectedName: 'Ada Lovelace',
      expectedEmail: 'ada@example.edu',
    })).rejects.toThrow(/LaTeX compilation failed/i)
  })

  it('rejects a deliberately underfilled second page', async () => {
    const rendered = renderCanonicalCv({ data: fixtureCv(), pageTarget: 'one_page', sectionOrder: ['projects'] })
    const split = rendered.latex.replace('\\end{document}', '\\newpage\n\\section{Technical Skills}\n\\begin{itemize}[leftmargin=0.15in, label={}]\\item\\small{Python}\\end{itemize}\n\\end{document}')
    await expect(compileLatex(split, { expectedName: 'Ada Lovelace', expectedEmail: 'ada@example.edu' })).rejects.toThrow(/underfilled second page/i)
  })
})
