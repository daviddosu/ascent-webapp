import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canonicalGraduateCvPreamble,
  renderCanonicalCv,
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

  it('renders Nigerian and accented applicant names through the controlled pdfLaTeX character strategy', () => {
    const international = fixtureCv()
    international.fullName = fact('Chukwudi Élodie', 'profile:international-name')
    const rendered = renderCanonicalCv({ data: international, pageTarget: 'one_page' })
    expect(rendered.latex).toContain("Chukwudi \\'{E}lodie")
    expect(validateCanonicalLatex(rendered.latex)).toEqual([])
  })
})
