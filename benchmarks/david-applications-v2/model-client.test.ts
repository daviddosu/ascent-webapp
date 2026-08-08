import { describe, expect, it } from 'vitest'
import { observableResponse, type OpenAIResponse } from './model-client'

describe('observableResponse', () => {
  it('keeps auditable evidence without repeated prompt and tool definitions', () => {
    const response = {
      id: 'resp_test',
      model: 'gpt-5.6-luna',
      status: 'completed',
      instructions: 'large repeated prompt',
      tools: [{ type: 'function', name: 'large_schema' }],
      metadata: { benchmark_role: 'agent' },
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: 'Verified result.' }],
      }, {
        type: 'reasoning',
        encrypted_content: 'opaque-payload',
      }],
      usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
    } as OpenAIResponse & Record<string, unknown>

    const compact = observableResponse(response) as OpenAIResponse & Record<string, unknown>
    expect(compact.id).toBe('resp_test')
    expect(compact.model).toBe('gpt-5.6-luna')
    expect(compact.output?.[0]?.content?.[0]?.text).toBe('Verified result.')
    expect(compact.metadata).toEqual({ benchmark_role: 'agent' })
    expect(compact).not.toHaveProperty('instructions')
    expect(compact).not.toHaveProperty('tools')
    expect(JSON.stringify(compact)).not.toContain('opaque-payload')
  })
})
