import { describe, expect, it } from 'vitest'
import { appendTranscript } from './transcription'

describe('description voice text insertion', () => {
  it('uses the transcript when the description is empty', () => {
    expect(appendTranscript('', 'Book a flight to London.')).toBe('Book a flight to London.')
  })

  it('appends speech without overwriting existing text', () => {
    expect(appendTranscript('Need to reach London before Tuesday afternoon.', 'I also want no more than one stop.'))
      .toBe('Need to reach London before Tuesday afternoon.\n\nI also want no more than one stop.')
  })
})
