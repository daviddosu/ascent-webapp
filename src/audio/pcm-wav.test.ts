import { describe, expect, it } from 'vitest'
import { pcmChunksToWav } from './pcm-wav'

describe('PCM WAV encoder', () => {
  it('writes a bounded mono 16 kHz WAV across chunk boundaries', async () => {
    const wav = pcmChunksToWav([
      new Float32Array([1, 1, 1]),
      new Float32Array([-1, -1, -1]),
    ], 48_000)
    const bytes = new Uint8Array(await wav.arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint32(40, true)).toBe(4)
    expect(view.getInt16(44, true)).toBe(0x7fff)
    expect(view.getInt16(46, true)).toBe(-0x8000)
  })
})
