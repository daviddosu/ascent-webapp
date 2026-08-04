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

  it('shows flight context as a Roon-owned one-question conversation', () => {
    expect(mainSource).toContain('contextOwnerSpecialistId')
    expect(mainSource).toContain('Roon asks the questions. Caspian continues as soon as you answer.')
    expect(mainSource).toContain('One detail at a time')
    expect(mainSource).toContain('Roon will ask for missing trip or traveler details here, one question at a time.')
  })

  it('keeps Caspian copy simple and action-oriented', () => {
    expect(mainSource).toContain('Checking live flight options')
    expect(mainSource).toContain('Comparing live flights')
    expect(mainSource).toContain('I’m checking live flights and comparing the best matches.')
    expect(mainSource).toContain('The live flight site is taking too long. Your options are saved')
  })
})
