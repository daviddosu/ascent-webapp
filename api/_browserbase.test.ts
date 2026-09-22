import { afterEach, describe, expect, it } from 'vitest'
import { browserbaseSessionSettings } from './_browserbase.js'

describe('Browserbase session privacy settings', () => {
  const originalTimeout = process.env.BROWSERBASE_SESSION_TIMEOUT_SECONDS
  const originalRecord = process.env.BROWSERBASE_RECORD_SESSION
  const originalLog = process.env.BROWSERBASE_LOG_SESSION

  afterEach(() => {
    for (const [key, value] of [
      ['BROWSERBASE_SESSION_TIMEOUT_SECONDS', originalTimeout],
      ['BROWSERBASE_RECORD_SESSION', originalRecord],
      ['BROWSERBASE_LOG_SESSION', originalLog],
    ] as Array<[string, string | undefined]>) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('keeps recording and provider logs disabled by default', () => {
    delete process.env.BROWSERBASE_SESSION_TIMEOUT_SECONDS
    delete process.env.BROWSERBASE_RECORD_SESSION
    delete process.env.BROWSERBASE_LOG_SESSION

    expect(browserbaseSessionSettings()).toEqual({
      timeoutSeconds: 900,
      recordSession: false,
      logSession: false,
    })
  })

  it('honours explicit beta qualification settings and bounds the timeout', () => {
    expect(browserbaseSessionSettings({
      BROWSERBASE_SESSION_TIMEOUT_SECONDS: '99999',
      BROWSERBASE_RECORD_SESSION: 'yes',
      BROWSERBASE_LOG_SESSION: '1',
    })).toEqual({
      timeoutSeconds: 21_600,
      recordSession: true,
      logSession: true,
    })
  })
})
