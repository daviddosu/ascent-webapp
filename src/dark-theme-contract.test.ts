import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styles = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8')

describe('dark theme contract', () => {
  it('themes pinned actions and persistent status surfaces', () => {
    expect(styles).toContain("body[data-theme='dark'] .inspector-actions {")
    expect(styles).toContain("body[data-theme='dark'] .cloud-sync-state {")
    expect(styles).toContain("body[data-theme='dark'] .screen-count {")
  })

  it('uses dark heatmap colors without changing completion accents', () => {
    expect(styles).toContain("body[data-theme='dark'] .activity-cell.level-0")
    expect(styles).toContain("body[data-theme='dark'] .activity-cell.level-4")
    expect(styles).toContain("body[data-theme='dark'] .completion-seal { fill: #fff")
  })
})
