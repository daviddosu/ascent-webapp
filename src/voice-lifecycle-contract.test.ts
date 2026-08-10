import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const source = readFileSync('src/main.ts', 'utf8')

it('stops microphone tracks when recorder setup fails before ownership transfer', () => {
  expect(source).toContain('let pendingStream: MediaStream | null = null')
  expect(source).toContain('pendingStream = stream')
  expect(source).toContain('recorder.start(250)\n    // The stop handler now owns the live tracks.\n    pendingStream = null')
  expect(source).toContain('pendingStream?.getTracks().forEach(track => track.stop())')
})
