type PdfSource = {
  objectId: number | null
  dictionary: string
  text: string
}

type PdfUnicodeMap = {
  mapping: Map<number, string>
  sourceWidth: number
}

function unescapePdfText(value: string) {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character !== '\\') {
      output += character
      continue
    }
    const next = value[index + 1]
    if (!next) break
    index += 1
    if (next === '\n') continue
    if (next === '\r') {
      if (value[index + 1] === '\n') index += 1
      continue
    }
    const octal = value.slice(index).match(/^[0-7]{1,3}/)?.[0]
    if (octal) {
      output += String.fromCharCode(Number.parseInt(octal, 8))
      index += octal.length - 1
      continue
    }
    output += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[next] ?? next
  }
  return output
}

function decodePdfHex(value: string) {
  const normalized = value.length % 2 ? `${value}0` : value
  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return new TextDecoder('latin1').decode(bytes)
}

function decodeUnicodeHex(value: string) {
  const normalized = value.length % 4 ? `${value}${'0'.repeat(4 - (value.length % 4))}` : value
  let output = ''
  for (let index = 0; index < normalized.length; index += 4) {
    const codeUnit = Number.parseInt(normalized.slice(index, index + 4), 16)
    if (!Number.isFinite(codeUnit)) continue
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 8 <= normalized.length) {
      const low = Number.parseInt(normalized.slice(index + 4, index + 8), 16)
      if (low >= 0xdc00 && low <= 0xdfff) {
        output += String.fromCodePoint(0x10000 + ((codeUnit - 0xd800) << 10) + (low - 0xdc00))
        index += 4
        continue
      }
    }
    output += String.fromCharCode(codeUnit)
  }
  return output
}

function incrementUnicodeHex(value: string, amount: number) {
  const normalized = value.length % 4 ? `${value}${'0'.repeat(4 - (value.length % 4))}` : value
  if (normalized.length <= 4) {
    return Math.max(0, Number.parseInt(normalized, 16) + amount).toString(16).padStart(normalized.length, '0')
  }
  const prefix = normalized.slice(0, -4)
  const last = Number.parseInt(normalized.slice(-4), 16)
  return `${prefix}${Math.max(0, last + amount).toString(16).padStart(4, '0')}`
}

function parseCMap(text: string): PdfUnicodeMap | null {
  const mapping = new Map<number, string>()
  const sourceWidths: number[] = []
  const addMapping = (source: string, destination: string) => {
    const sourceValue = Number.parseInt(source, 16)
    if (!Number.isFinite(sourceValue)) return
    mapping.set(sourceValue, decodeUnicodeHex(destination))
    sourceWidths.push(source.length)
  }

  for (const section of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/gi)) {
    for (const entry of (section[1] ?? '').matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      addMapping(entry[1] ?? '', entry[2] ?? '')
    }
  }

  for (const section of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/gi)) {
    for (const entry of (section[1] ?? '').matchAll(/<([0-9a-f]+)>\s+<([0-9a-f]+)>\s+(\[[^\]]*\]|<[0-9a-f]+>)/gi)) {
      const start = Number.parseInt(entry[1] ?? '', 16)
      const end = Number.parseInt(entry[2] ?? '', 16)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
      const destination = entry[3] ?? ''
      if (destination.startsWith('[')) {
        const values = [...destination.matchAll(/<([0-9a-f]+)>/gi)].map(match => match[1] ?? '')
        for (let offset = 0; offset <= end - start && offset < values.length; offset += 1) {
          addMapping((start + offset).toString(16), values[offset] ?? '')
        }
      } else {
        const base = destination.replace(/[<>]/g, '')
        for (let offset = 0; offset <= end - start; offset += 1) {
          addMapping((start + offset).toString(16), incrementUnicodeHex(base, offset))
        }
      }
    }
  }

  if (!mapping.size) return null
  return {
    mapping,
    // Identity-H Type0 fonts use two-byte CIDs. Taking the widest source
    // value handles both those maps and one-byte embedded-font CMaps.
    sourceWidth: Math.max(2, ...sourceWidths),
  }
}

function decodePdfHexWithMap(value: string, unicodeMap: PdfUnicodeMap | undefined) {
  if (!unicodeMap) return decodePdfHex(value)
  const normalized = value.length % 2 ? `${value}0` : value
  const width = Math.max(2, unicodeMap.sourceWidth)
  const parts: string[] = []
  for (let index = 0; index < normalized.length; index += width) {
    const token = normalized.slice(index, index + width)
    const cid = Number.parseInt(token, 16)
    if (!Number.isFinite(cid)) continue
    const mapped = unicodeMap.mapping.get(cid)
    parts.push(mapped ?? decodePdfHex(token))
  }
  return parts.join('')
}

function decodePdfLiteralWithMap(value: string, unicodeMap: PdfUnicodeMap | undefined) {
  const unescaped = unescapePdfText(value)
  if (!unicodeMap) return unescaped
  let hex = ''
  for (let index = 0; index < unescaped.length; index += 1) {
    hex += (unescaped.charCodeAt(index) & 0xff).toString(16).padStart(2, '0')
  }
  return decodePdfHexWithMap(hex, unicodeMap)
}

function textOperators(value: string, fontMaps = new Map<string, PdfUnicodeMap>()) {
  const chunks: string[] = []
  let currentFont: PdfUnicodeMap | undefined
  // Scan operators in stream order. The older extractor scanned Tj and TJ
  // separately, which could reorder mixed text operators and could not apply
  // a font's ToUnicode CMap to CID hex strings.
  const operatorPattern = /\/([a-z0-9_.#-]+)\s+-?(?:\d+(?:\.\d*)?|\.\d+)\s+Tf|<([0-9a-f]+)>\s*Tj|\(((?:\\.|[^()])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/gi
  for (const match of value.matchAll(operatorPattern)) {
    if (match[1] !== undefined) {
      currentFont = fontMaps.get(match[1])
      continue
    }
    if (match[2] !== undefined) {
      const text = decodePdfHexWithMap(match[2], currentFont).trim()
      if (text) chunks.push(text)
      continue
    }
    if (match[3] !== undefined) {
      const text = decodePdfLiteralWithMap(match[3], currentFont).trim()
      if (text) chunks.push(text)
      continue
    }
    const parts: string[] = []
    for (const token of (match[4] ?? '').matchAll(/\(((?:\\.|[^()])*)\)|<([0-9a-f]+)>|(-?\d+(?:\.\d+)?)/gi)) {
      if (token[3] !== undefined) {
        // TJ arrays encode visible word spacing as a negative text-position
        // adjustment. Ignoring those numbers glues whole PDF sentences into
        // one token, which makes both model grounding and coverage checks lie.
        if (Number(token[3]) <= -100 && parts.length && !parts.at(-1)?.endsWith(' ')) parts.push(' ')
        continue
      }
      const text = token[1] !== undefined
        ? decodePdfLiteralWithMap(token[1], currentFont)
        : decodePdfHexWithMap(token[2] ?? '', currentFont)
      if (text) parts.push(text)
    }
    const text = parts.join('').trim()
    if (text) chunks.push(text)
  }
  return chunks.join('\n')
}

async function inflatePdfStream(value: Uint8Array) {
  let start = 0
  let end = value.length
  while (start < end && (value[start] === 0x0a || value[start] === 0x0d || value[start] === 0x20)) start += 1
  while (end > start && (value[end - 1] === 0x0a || value[end - 1] === 0x0d || value[end - 1] === 0x20)) end -= 1
  const compressed = Uint8Array.from(value.subarray(start, end))
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream(format))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch {
      // Try the other Web Compression API spelling. PDF producers commonly
      // use zlib-wrapped Flate streams, while some runtimes expose raw deflate
      // as the only working decoder.
    }
  }
  return null
}

function dictionaryFromValue(value: string) {
  const start = value.indexOf('<<')
  const end = value.lastIndexOf('>>')
  return start >= 0 && end > start ? value.slice(start, end + 2) : ''
}

async function pdfSources(bytes: Uint8Array, raw = new TextDecoder('latin1').decode(bytes)) {
  const rawSource: PdfSource = { objectId: null, dictionary: '', text: raw }
  const sources: PdfSource[] = [rawSource]
  const streamObjectIds = new Set<number>()
  const objectHeaders = [...raw.matchAll(/(\d+)\s+0\s+obj\b/g)]
  for (let index = 0; index < objectHeaders.length; index += 1) {
    const match = objectHeaders[index]
    const objectId = Number(match[1])
    const objectStart = (match.index ?? 0) + match[0].length
    const objectEnd = index + 1 < objectHeaders.length
      ? (objectHeaders[index + 1].index ?? raw.length)
      : raw.length
    const objectBody = raw.slice(objectStart, objectEnd)
    const streamMatch = /\bstream(?:\r\n|\n|\r)/.exec(objectBody)
    if (!streamMatch) continue
    const streamStart = objectStart + (streamMatch.index ?? 0) + streamMatch[0].length
    const streamEndCandidate = raw.indexOf('endstream', streamStart)
    const streamEnd = streamEndCandidate >= streamStart && streamEndCandidate <= objectEnd
      ? streamEndCandidate
      : objectEnd
    const dictionary = dictionaryFromValue(objectBody.slice(0, streamMatch.index ?? 0))
    const inflated = /\/FlateDecode\b/i.test(dictionary)
      ? await inflatePdfStream(bytes.subarray(streamStart, streamEnd))
      : null
    const streamBytes = inflated ?? bytes.subarray(streamStart, streamEnd)
    sources.push({ objectId, dictionary, text: new TextDecoder('latin1').decode(streamBytes) })
    streamObjectIds.add(objectId)
  }

  // Resource dictionaries and Type0 font dictionaries are often ordinary
  // objects inside the file, while page/content/CMaps are streams. Include
  // non-stream objects so a font's /ToUnicode reference can be resolved even
  // for small uncompressed PDFs used by tests or alternate producers.
  for (let index = 0; index < objectHeaders.length; index += 1) {
    const match = objectHeaders[index]
    const objectId = Number(match[1])
    if (streamObjectIds.has(objectId)) continue
    const bodyStart = (match.index ?? 0) + match[0].length
    const objectEnd = index + 1 < objectHeaders.length
      ? (objectHeaders[index + 1].index ?? raw.length)
      : raw.length
    const endObject = raw.indexOf('endobj', bodyStart)
    const bodyEnd = endObject >= bodyStart && endObject <= objectEnd ? endObject : objectEnd
    const body = raw.slice(bodyStart, bodyEnd).trim()
    if (!body || /\bstream(?:\r\n|\n|\r)/i.test(body)) continue
    sources.push({ objectId, dictionary: dictionaryFromValue(body), text: body })
  }

  // Object streams contain the page tree, resource dictionary, and Type0 font
  // dictionaries in many modern PDFs. Their /First value is a byte offset;
  // latin1 decoding preserves that one-byte-per-code-unit relationship.
  const objectStreamSources = sources.filter(source => /\/Type\s*\/ObjStm\b/i.test(source.dictionary))
  for (const objectStream of objectStreamSources) {
    const first = Number(objectStream.dictionary.match(/\/First\s+(\d+)/i)?.[1] ?? 0)
    const count = Number(objectStream.dictionary.match(/\/N\s+(\d+)/i)?.[1] ?? 0)
    if (!first || !count) continue
    const indexValues = [...objectStream.text.slice(0, first).matchAll(/\d+/g)].map(match => Number(match[0]))
    if (indexValues.length < count * 2) continue
    for (let index = 0; index < count; index += 1) {
      const objectId = indexValues[index * 2]
      const offset = indexValues[index * 2 + 1]
      const nextOffset = index + 1 < count ? indexValues[index * 2 + 3] : objectStream.text.length - first
      if (!Number.isFinite(objectId) || !Number.isFinite(offset) || !Number.isFinite(nextOffset)) continue
      const body = objectStream.text.slice(first + offset, first + nextOffset).trim()
      if (!body) continue
      sources.push({ objectId, dictionary: dictionaryFromValue(body), text: body })
    }
  }
  return sources
}

function fontUnicodeMaps(sources: PdfSource[]) {
  const byId = new Map<number, PdfSource>()
  for (const source of sources) {
    if (source.objectId !== null) byId.set(source.objectId, source)
  }
  const cmaps = new Map<number, PdfUnicodeMap>()
  for (const source of sources) {
    const map = parseCMap(source.text)
    if (map && source.objectId !== null) cmaps.set(source.objectId, map)
  }
  const fontMaps = new Map<string, PdfUnicodeMap>()
  for (const source of sources) {
    const fontBlock = source.text.match(/\/Font\s*<<([\s\S]*?)>>/i)?.[1] ?? ''
    for (const match of fontBlock.matchAll(/\/([a-z0-9_.#-]+)\s+(\d+)\s+0\s+R/gi)) {
      const fontName = match[1] ?? ''
      const fontObject = byId.get(Number(match[2]))
      const cmapObjectId = Number(fontObject?.text.match(/\/ToUnicode\s+(\d+)\s+0\s+R/i)?.[1] ?? 0)
      const map = cmaps.get(cmapObjectId)
      if (fontName && map) fontMaps.set(fontName, map)
    }
  }
  return fontMaps
}

/**
 * JSON and PostgreSQL JSONB both reject NUL characters and unpaired UTF-16
 * surrogates. PDF text streams are allowed to contain either when a producer
 * embeds a custom font encoding, so normalize them before extracted text is
 * handed to a durable history or model payload.
 */
export function sanitizeExtractedText(value: string) {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0) continue
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] + value[index + 1]
        index += 1
      } else {
        output += '\ufffd'
      }
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      output += '\ufffd'
      continue
    }
    output += value[index]
  }
  return output
}

/** Extracts readable text from ordinary PDF text streams with ToUnicode support. */
export async function extractPdfText(bytes: Uint8Array, maximum = 30_000) {
  const raw = new TextDecoder('latin1').decode(bytes)
  const sources = await pdfSources(bytes, raw)
  const maps = fontUnicodeMaps(sources)
  // The raw fallback contains the same uncompressed stream bytes in a normal
  // PDF. Prefer parsed object sources whenever they exist so text is not
  // returned twice; retain the raw source for small operator-only fixtures.
  const textSources = sources.length > 1 ? sources.slice(1) : sources
  return sanitizeExtractedText(textSources
    .map(source => textOperators(source.text, maps))
    .filter(Boolean)
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maximum))
}

/** Returns the physical page count from an ordinary PDF page tree. */
export async function countPdfPages(bytes: Uint8Array) {
  const raw = new TextDecoder('latin1').decode(bytes)
  const pageObjects = raw.match(/\/Type\s*\/Page\b/g)?.length ?? 0
  if (pageObjects > 0) return pageObjects
  // PDFs produced with object streams hide the page tree inside compressed
  // streams. Inflate those streams before falling back to a declared /Count;
  // otherwise a valid uploaded CV is incorrectly blocked as unreadable.
  const sources = await pdfSources(bytes, raw)
  const inflatedPageObjects = sources
    .slice(1)
    // An object stream's inflated payload is kept as a source so embedded
    // fonts, resources, and page objects can be resolved. The page objects
    // are then also added individually below. Do not count the container's
    // own payload or a single physical page is reported twice.
    .filter(source => !/\/Type\s*\/ObjStm\b/i.test(source.dictionary))
    .reduce((total, source) => total + (source.text.match(/\/Type\s*\/Page\b/g)?.length ?? 0), 0)
  if (inflatedPageObjects > 0) return inflatedPageObjects
  const declaredCounts = sources.flatMap(source => [...source.text.matchAll(/\/Count\s+(\d+)/g)])
    .map(match => Number(match[1]))
    .filter(value => Number.isInteger(value) && value > 0)
  const pageCount = declaredCounts.length ? Math.max(...declaredCounts) : 0
  if (!pageCount) throw new Error('The source CV PDF page count could not be determined.')
  return pageCount
}
