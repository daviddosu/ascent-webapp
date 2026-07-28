import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')

describe('recipient ambiguity hydration', () => {
  it('reloads persisted choices when the immediate needs-context response is stale', () => {
    expect(mainSource).toContain("completed.status === 'needs_context'")
    expect(mainSource).toContain('!completed.recipientResolution')
    expect(mainSource).toContain('const persisted = (await loadAgentRuns()).find')
    expect(mainSource).toContain('if (persisted) completed = persisted')
  })
})
