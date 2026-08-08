import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APPLICATION_CONTROLLER_VERSION, applicationControllerStates } from '../../supabase/functions/_shared/application-controller'

const here = resolve(import.meta.dirname)
const source = resolve(here, '../david-applications-v2')
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('david_application_eval_v2_1 contract', () => {
  it('freezes only the eight original failed E2E cases for five repetitions', () => {
    const manifest = JSON.parse(readFileSync(resolve(here, 'frozen-cases.json'), 'utf8'))
    expect(manifest.benchmarkVersion).toBe('david_application_eval_v2_1')
    expect(manifest.repetitions).toBe(5)
    expect(manifest.cases).toHaveLength(8)
    expect(new Set(manifest.cases.map((item: { id: string }) => item.id)).size).toBe(8)
    expect(digest(resolve(source, 'spec.json'))).toBe(manifest.sourceSpecSha256)
    expect(digest(resolve(source, 'oracles.json'))).toBe(manifest.sourceOraclesSha256)
    for (const item of manifest.cases) expect(digest(resolve(source, 'traces', 'david-v2-final', `${item.id}-r1.json`))).toBe(item.traceSha256)
  })

  it('uses the complete deterministic controller state vocabulary', () => {
    expect(APPLICATION_CONTROLLER_VERSION).toBe('david-application-controller@2.1')
    expect(applicationControllerStates).toHaveLength(18)
    expect(applicationControllerStates).toEqual(expect.arrayContaining(['PROFILE_RESOLUTION', 'PORTAL_EXECUTION', 'SUBMISSION_APPROVAL', 'COMPLETE', 'BLOCKED']))
  })
})
