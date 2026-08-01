import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')

describe('Roon context panel', () => {
  it('collects free-form answers in Roon’s panel and resumes only when continued', () => {
    expect(mainSource).toContain('data-agent-context-input')
    expect(mainSource).toContain('data-action="submit-agent-context"')
    expect(mainSource).toContain("asksForConfirmation ? 'Confirm' : 'Continue'")
    expect(mainSource).not.toContain("if (task && run?.status === 'needs_context' && task.description?.trim())")
  })

  it('keeps structured choices in the same panel and attachment handling separate', () => {
    expect(mainSource).toContain('data-action="select-agent-recipient"')
    expect(mainSource).toContain('data-action="select-agent-schedule-option"')
    expect(mainSource).toContain('data-action="check-attached-context"')
    expect(mainSource).toContain('Roon checks it automatically once it is attached.')
  })
})
