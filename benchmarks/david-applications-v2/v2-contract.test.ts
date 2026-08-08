import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DAVID_PRODUCTION_MODEL_CONFIG,
  davidAgentInstructions,
} from '../../supabase/functions/_shared/david-agent-config'
import { responseUsage } from './model-client'
import type { BenchmarkSpec } from './types'

const here = resolve(import.meta.dirname)

describe('david_application_eval_v2 contract', () => {
  it('keeps v2 separate and includes five source-material applicants plus ten E2E cases', () => {
    const spec = JSON.parse(readFileSync(resolve(here, 'spec.json'), 'utf8')) as BenchmarkSpec
    expect(spec.benchmarkVersion).toBe('david_application_eval_v2')
    expect(spec.v1BenchmarkVersion).toBe('david_application_eval_v1')
    expect(spec.atomicCases.length).toBeGreaterThanOrEqual(15)
    expect(spec.endToEndCases.length).toBeGreaterThanOrEqual(10)
    const applicants = readdirSync(resolve(here, 'applicants')).filter(name => name.endsWith('.json'))
    expect(applicants.length).toBeGreaterThanOrEqual(5)
    for (const filename of applicants) {
      const fixture = JSON.parse(readFileSync(resolve(here, 'applicants', filename), 'utf8')) as Record<string, unknown>
      expect(fixture.synthetic).toBe(true)
      expect(Array.isArray(fixture.sourceMaterials)).toBe(true)
      expect(fixture).not.toHaveProperty('expectedAnswers')
      expect(fixture).not.toHaveProperty('portalAnswers')
    }
  })

  it('pins the exact production David model configuration and prompt', () => {
    expect(DAVID_PRODUCTION_MODEL_CONFIG).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning: { effort: 'low' },
      temperature: null,
      store: false,
      maxOutputTokens: 2400,
      parallelToolCalls: false,
      toolChoice: 'auto',
      davidPromptVersion: 'david-prompt@3',
    })
    const prompt = davidAgentInstructions()
    expect(prompt).toContain('Never invent applicant facts')
    expect(prompt).toContain('Call application.build_readiness_report before final review')
    expect(prompt).toContain('A blocker summary or a failed readiness report is not completion')
    expect(createHash('sha256').update(prompt).digest('hex')).toHaveLength(64)
    const proxy = readFileSync(resolve(here, '../../supabase/functions/david-eval-v2-proxy/index.ts'), 'utf8')
    expect(proxy).toContain('atomic tasks may end at their narrower verified terminal state')
    expect(proxy).toContain('application.record_portal_checkpoint owns the reversible section save')
  })

  it('prices observed cached, uncached and output tokens without estimates from text length', () => {
    const usage = responseUsage({
      usage: {
        input_tokens: 1_000,
        input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
        output_tokens: 500,
        output_tokens_details: { reasoning_tokens: 300 },
        total_tokens: 1_500,
      },
    })
    expect(usage).toMatchObject({
      inputTokens: 1_000,
      cachedInputTokens: 200,
      cacheWriteTokens: 100,
      outputTokens: 500,
      reasoningTokens: 300,
      totalTokens: 1_500,
    })
    expect(usage.inferenceCostUsd).toBeCloseTo(0.000769, 9)
  })

  it('backs off boundedly when the model provider returns a rate limit', () => {
    const client = readFileSync(resolve(here, 'model-client.ts'), 'utf8')
    expect(client).toContain("response.status === 429")
    expect(client).toContain("name: 'model_provider_backoff'")
    expect(client).toContain('Math.min(30_000')
    expect(client).toContain("key === 'encrypted_content' ? undefined : value")
  })

  it('supports separate atomic and end-to-end execution slices', () => {
    const cli = readFileSync(resolve(here, 'cli.mjs'), 'utf8')
    const runner = readFileSync(resolve(here, 'runner.ts'), 'utf8')
    expect(cli).toContain("valueAfter('--level')")
    expect(cli).toContain("valueAfter('--atomic-repetitions')")
    expect(cli).toContain("valueAfter('--e2e-repetitions')")
    expect(runner).toContain('item.level === input.selectedLevel')
  })
})
