import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
const taskAgent = readFileSync(resolve(root, 'supabase/functions/task-agent/index.ts'), 'utf8')
const migration = readFileSync(resolve(root, 'supabase/migrations/202608090001_david_application_engine_v3.sql'), 'utf8')
const spec = JSON.parse(readFileSync(resolve(import.meta.dirname, 'spec.json'), 'utf8')) as { engineCases: Array<{ level: string }>; workSampleCases: Array<{ class: string }> }

describe('canonical David application production contract', () => {
  it('exposes one active benchmark command and archives older generations', () => {
    expect(Object.keys(packageJson.scripts).filter(name => name.startsWith('benchmark:david'))).toEqual(['benchmark:david'])
    expect(readFileSync(resolve(root, 'benchmarks/david-applications-v2/ARCHIVED.md'), 'utf8')).toContain('historical audit artifact')
    expect(readFileSync(resolve(root, 'benchmarks/david-applications-v2-1/ARCHIVED.md'), 'utf8')).toContain('historical audit artifact')
  })

  it('consolidates all hard coverage and ten E2E cases', () => {
    expect(spec.engineCases).toHaveLength(26)
    expect(spec.engineCases.filter(item => item.level === 'end_to_end')).toHaveLength(10)
    expect(spec.workSampleCases).toHaveLength(3)
    expect(spec.workSampleCases.map(item => item.class)).toEqual(['academic_writing', 'code_portfolio', 'project_portfolio'])
  })

  it('makes the engine select one step and validates bounded semantic answers', () => {
    expect(taskAgent).toContain('planApplicationEngineStep(engineState)')
    expect(taskAgent).toContain('applicationEngineDirective(engineState, engineStep)')
    expect(taskAgent).toContain("engineStep.kind === 'SEMANTIC_DECISION'")
    expect(taskAgent).toContain('validateSemanticDecision')
    expect(taskAgent).toContain('application_semantic_decision_escalated')
  })

  it('persists fact conflicts, retry state, tiers, and validated semantic decisions', () => {
    expect(migration).toContain("'CONFLICTING'")
    expect(migration).toContain('retry_state jsonb')
    expect(migration).toContain('resolution_tier integer')
    expect(migration).toContain('application_semantic_decisions')
  })
})
