export function pcmChunksToWav(chunks: Float32Array[], sourceRate: number, targetRate = 16_000) {
  const normalizedSourceRate = sourceRate > 0 ? sourceRate : 48_000
  const sourceLength = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const source = new Float32Array(sourceLength)
  let sourceOffset = 0
  for (const chunk of chunks) {
    source.set(chunk, sourceOffset)
    sourceOffset += chunk.length
  }
  const ratio = normalizedSourceRate / targetRate
  const sampleCount = Math.floor(source.length / ratio)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }
  writeText(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); writeText(8, 'WAVE'); writeText(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  writeText(36, 'data'); view.setUint32(40, sampleCount * 2, true)
  for (let index = 0; index < sampleCount; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio))
    let sample = 0
    for (let cursor = start; cursor < end && cursor < source.length; cursor += 1) sample += source[cursor]
    sample = Math.max(-1, Math.min(1, sample / (end - start)))
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
