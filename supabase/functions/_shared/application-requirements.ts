type RequirementRecord = Record<string, unknown>

const metadataKeys = new Set([
  'citations',
  'source',
  'source_url',
  'source_urls',
  'source_evidence',
  'sourceEvidence',
  'retrieved_at',
  'retrievedAt',
  'extracted_at',
  'extractedAt',
  'source_backed',
  'sourceBacked',
  'unresolved_fields',
  'unresolvedFields',
])

const explicitTextKeys = [
  'exact_instructions',
  'exactInstructions',
  'instructions',
  'description',
  'prompt',
  'text',
  'value',
  'details',
]

const explicitNameKeys = ['name', 'label', 'title', 'requirement']

function recordValue(value: unknown): RequirementRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RequirementRecord : {}
}

function compactText(value: unknown, maxLength = 4_000) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function humanizeKey(value: string) {
  const humanized = value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return humanized ? humanized.charAt(0).toLocaleUpperCase() + humanized.slice(1) : 'Application requirement'
}

function pathLabel(path: string[]) {
  return path.map(humanizeKey).join(' — ')
}

function categoryFor(path: string[], name: string) {
  const value = [...path, name].join(' ').toLocaleLowerCase()
  if (/transcript|degree|education|academic|credential/.test(value)) return 'academic'
  if (/test|gre|gmat|toefl|ielts|english|exam/.test(value)) return 'test'
  if (/essay|statement|writing|personal.?history|supplement/.test(value)) return 'essay'
  if (/letter|recommend|reference|referee/.test(value)) return 'reference'
  if (/portfolio|sample|publication|paper|code|resume|cv/.test(value)) return 'portfolio'
  if (/portal|application.?form|account/.test(value)) return 'portal'
  if (/fee|financial|funding|bank/.test(value)) return 'financial'
  return 'other'
}

function requirementTypeFor(path: string[], name: string) {
  const value = [...path, name].join(' ').toLocaleLowerCase()
  if (/deadline/.test(value)) return 'deadline'
  if (/test|gre|gmat|toefl|ielts|english|exam/.test(value)) return 'test'
  if (/essay|statement|writing/.test(value)) return 'essay'
  if (/letter|recommend|reference|referee/.test(value)) return 'reference'
  if (/transcript|degree|education|academic|credential/.test(value)) return 'academic'
  if (/portfolio|sample|publication|paper|code|resume|cv/.test(value)) return 'portfolio'
  if (/portal|application.?form|account/.test(value)) return 'portal'
  if (/fee|financial|funding|bank/.test(value)) return 'financial'
  return 'official_requirement'
}

function sourceUrlFor(value: unknown, fallback: string) {
  const input = recordValue(value)
  const nestedSource = recordValue(input.source)
  return compactText(
    input.source_url ?? input.sourceUrl ?? input.url ?? nestedSource.url ?? nestedSource.source_url ?? fallback,
    2_000,
  )
}

function isOptional(value: unknown, exactInstructions: string) {
  const input = recordValue(value)
  if (input.required === false || input.optional === true) return true
  const status = compactText(input.status, 100).toLocaleLowerCase()
  if (status === 'optional') return true
  return /\boptional\b|if applicable|where relevant/i.test(exactInstructions)
}

function textFromRecord(input: RequirementRecord) {
  for (const key of explicitTextKeys) {
    const text = compactText(input[key])
    if (text) return text
  }
  const name = explicitNameKeys.map(key => compactText(input[key])).find(Boolean) ?? ''
  return name
}

function nameFromRecord(input: RequirementRecord, fallback: string) {
  return explicitNameKeys.map(key => compactText(input[key], 500)).find(Boolean) ?? fallback
}

const genericTestRequirementName = /^(?:tests?|test requirements?|admissions tests?)(?:\s+\d+)?$/i
const genericEssayRequirementName = /^(?:(?:essay|essays)\s*(?:[-—:]\s*)?\d+|application requirements?\s*[-—:]\s*(?:essay|essays)\s*[-—:]\s*\d+)$/i
const genericRecommendationSlotName = /^(?:recommender|recommendation|reference|referee)\s+\d+\s+of\s+\d+$/i

function essayNameFromInstruction(name: string, exactInstructions: string) {
  if (!genericEssayRequirementName.test(name)) return ''
  const instruction = compactText(exactInstructions, 4_000)
    .replace(/^(?:prompt|essay prompt|statement prompt)\s*[:\-]\s*/i, '')
  if (!instruction || /^verify the required essay or statement prompts?/i.test(instruction)) return ''
  const summary = instruction.length > 180 ? `${instruction.slice(0, 177).trimEnd()}…` : instruction
  return `Essay: ${summary}`
}

/**
 * Replace list-index labels only when the authoritative instructions identify
 * the actual requirement. This keeps source-backed requirements readable
 * without guessing at an applicant's obligations.
 */
export function canonicalApplicationRequirementName(name: string, exactInstructions: string, category = '') {
  const rawName = compactText(name, 500)
  if (genericRecommendationSlotName.test(rawName) || /\b(?:recommendations?|reference letters?|referees?)\b/i.test(rawName) && /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine)\b.*\b(?:letters?|recommendations?|referees?)\b/i.test(exactInstructions)) {
    return 'Recommendation letters'
  }
  const essayName = essayNameFromInstruction(rawName, exactInstructions)
  if (essayName && (category === 'essay' || /essay|statement/i.test(`${rawName} ${exactInstructions}`))) return essayName
  if (!rawName || !genericTestRequirementName.test(rawName)) return rawName

  const instructions = compactText(exactInstructions, 4_000)
  const searchable = `${instructions} ${category}`
  if (/\bphysics\s+gre\b|\bgre\s+subject\b/i.test(searchable)) return 'Physics GRE Subject Test'
  if (/\bgre\s+general\b|\bgeneral\s+gre\b/i.test(searchable)) return 'GRE General Test'
  if (/\btoefl\b/i.test(searchable)) return 'English proficiency test (TOEFL)'
  if (/\bielts\b/i.test(searchable)) return 'English proficiency test (IELTS)'
  if (/\bduolingo\s+english\b|\bdet\b/i.test(searchable)) return 'English proficiency test (Duolingo English Test)'
  if (/\b(?:pte|pearson\s+test\s+of\s+english)\b/i.test(searchable)) return 'English proficiency test (PTE)'
  if (/\benglish\s+(?:language|proficiency)\b|\bfirst language is not english\b/i.test(searchable)) return 'English proficiency test'
  return rawName
}

function sourceIdFor(sourceUrl: string, path: string[]) {
  const suffix = path.map(segment => segment.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('-') || 'requirement'
  return `${sourceUrl}#requirements/${suffix}`.slice(0, 2_000)
}

export type DerivedApplicationRequirement = {
  name: string
  category: 'identity' | 'academic' | 'test' | 'essay' | 'reference' | 'financial' | 'portfolio' | 'portal' | 'other'
  required: boolean
  exact_instructions: string
  status: 'unknown'
  responsible_party: 'applicant'
  verification_evidence_ids: string[]
  requirement_type: string
  source: { url: string; authority: 'official'; field: string }
  source_id: string
  dependency_ids: string[]
  evidence_contract: { kinds: ['web'] }
  cardinality?: { exact?: number; min?: number; max?: number }
  prompt?: string
  word_limit?: { min?: number; max?: number }
  condition?: Record<string, unknown>
}

export function deriveSourceBackedApplicationRequirements(input: {
  requirements: unknown
  officialUrl: string
}): DerivedApplicationRequirement[] {
  const officialUrl = compactText(input.officialUrl, 2_000)
  if (!officialUrl) return []

  const derived: DerivedApplicationRequirement[] = []
  const seen = new Set<string>()

  const push = (path: string[], fallbackName: string, rawValue: unknown) => {
    const inputRecord = recordValue(rawValue)
    const primitiveText = compactText(typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean' ? rawValue : '')
    const primitiveInstruction = typeof rawValue === 'number' && /letter|recommend|reference/i.test(path.join(' '))
      ? `Provide ${rawValue} ${pathLabel(path).toLocaleLowerCase()}.`
      : primitiveText
    const exactInstructions = textFromRecord(inputRecord) || primitiveInstruction
    const rawName = nameFromRecord(inputRecord, fallbackName)
    const category = categoryFor(path, rawName)
    const name = canonicalApplicationRequirementName(rawName, exactInstructions, category)
    if (!name || !exactInstructions) return
    const sourceUrl = sourceUrlFor(rawValue, officialUrl)
    if (!sourceUrl) return
    const dedupeKey = `${name.toLocaleLowerCase()}|${exactInstructions.toLocaleLowerCase()}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    const recommendationCount = `${rawName} ${exactInstructions}`.match(/\b(?:at\s+least\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine)\s+(?:academic\s+|professional\s+|other\s+)?(?:letters?|recommendations?|referees?)\b/i)
    const countWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
    const count = recommendationCount ? countWords[recommendationCount[1].toLocaleLowerCase()] ?? Number(recommendationCount[1]) : null
    const cardinality = count && Number.isInteger(count) ? /at\s+least/i.test(recommendationCount?.[0] ?? '') ? { min: count } : { exact: count } : undefined
    derived.push({
      name: name.slice(0, 500),
      category: categoryFor(path, name),
      required: !isOptional(rawValue, exactInstructions),
      exact_instructions: exactInstructions,
      status: 'unknown',
      responsible_party: 'applicant',
      verification_evidence_ids: [],
      requirement_type: requirementTypeFor(path, name),
      source: { url: sourceUrl, authority: 'official', field: path.join('.') || 'requirements' },
      source_id: sourceIdFor(sourceUrl, path),
      dependency_ids: [],
      evidence_contract: { kinds: ['web'] },
      ...(cardinality ? { cardinality } : {}),
      ...(compactText(inputRecord.prompt, 4_000) ? { prompt: compactText(inputRecord.prompt, 4_000) } : {}),
      ...(inputRecord.word_limit && typeof inputRecord.word_limit === 'object' && !Array.isArray(inputRecord.word_limit) ? { word_limit: inputRecord.word_limit as { min?: number; max?: number } } : {}),
      ...(inputRecord.condition && typeof inputRecord.condition === 'object' && !Array.isArray(inputRecord.condition) ? { condition: inputRecord.condition as Record<string, unknown> } : {}),
    })
  }

  const walk = (path: string[], value: unknown) => {
    if (derived.length >= 80) return
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (derived.length >= 80) return
        const label = pathLabel(path) || 'Application requirement'
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const itemRecord = recordValue(item)
          const explicitName = nameFromRecord(itemRecord, '')
          const fallback = explicitName || (value.length === 1 ? label : `${label} ${index + 1}`)
          const hasRequirementText = explicitTextKeys.some(key => compactText(itemRecord[key])) || Boolean(explicitName)
          if (hasRequirementText) push([...path, String(index + 1)], fallback, item)
          else walk([...path, String(index + 1)], item)
        } else {
          push([...path, String(index + 1)], value.length === 1 ? label : `${label} ${index + 1}`, item)
        }
      })
      return
    }
    if (typeof value === 'number' && Number.isInteger(value) && value > 1 && value <= 12 && /letter|recommend|reference|referee/i.test(path.join(' '))) {
      const instruction = `Provide ${value} ${pathLabel(path).toLocaleLowerCase()}.`
      push(path, 'Recommendation letters', {
        name: 'Recommendation letters',
        exact_instructions: instruction,
        source_url: officialUrl,
        cardinality: { exact: value },
      })
      return
    }
    if (value && typeof value === 'object') {
      const inputRecord = recordValue(value)
      const hasRequirementText = explicitTextKeys.some(key => compactText(inputRecord[key])) || explicitNameKeys.some(key => compactText(inputRecord[key]))
      if (hasRequirementText) {
        push(path, pathLabel(path) || 'Application requirement', inputRecord)
        return
      }
      for (const [key, nested] of Object.entries(inputRecord)) {
        if (metadataKeys.has(key)) continue
        walk([...path, key], nested)
        if (derived.length >= 80) return
      }
      return
    }
    push(path, pathLabel(path) || 'Application requirement', value)
  }

  walk([], input.requirements)
  return derived.slice(0, 80)
}
