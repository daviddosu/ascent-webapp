import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const source = readFileSync('src/main.ts', 'utf8')

it('escapes persisted identifiers before inserting them into HTML attributes', () => {
  for (const expression of ['task.id', 'goal.id', 'profile.id', 'run.id', 'asset.id', 'subtask.id', 'item.task.id']) {
    expect(source).not.toContain(`\${${expression}}`)
  }
  expect(source).not.toMatch(/['"]\s*\+\s*(?:task|goal|profile|run|asset|subtask)\.id\s*\+\s*['"]/)
  expect(source).toContain('data-creator-task="${escapeHtml(task.id)}"')
  expect(source).toContain('data-calendar-task="${escapeHtml(item.task.id)}"')
})
