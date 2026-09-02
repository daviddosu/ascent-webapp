import { assertEquals } from 'jsr:@std/assert'
import { countPdfPages, extractPdfText, sanitizeExtractedText } from './pdf-text.ts'

Deno.test('sanitizeExtractedText removes JSON-invalid PDF code units', () => {
  assertEquals(sanitizeExtractedText('\u0000A\ud800B\udc00C\ud83d\ude80'), 'A�B�C🚀')
})

Deno.test('extractPdfText preserves word boundaries encoded by TJ spacing adjustments', async () => {
  const source = new TextEncoder().encode('[(Quantum)-250(Control)-90(PhD)] TJ')
  assertEquals(await extractPdfText(source), 'Quantum ControlPhD')
})

Deno.test('extractPdfText resolves CID text through a referenced ToUnicode CMap', async () => {
  const content = 'BT /F1 12 Tf [<0001>120<0002>-120<0003>] TJ ET'
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n1 begincodespacerange\n<0000> <00ff>\nendcodespacerange\n3 beginbfchar\n<0001> <0048>\n<0002> <0069>\n<0003> <0021>\nendbfchar\nendcmap\nend\nend`
  const source = new TextEncoder().encode([
    '%PDF-1.4',
    '1 0 obj << /Type /Page /Resources 2 0 R /Contents 3 0 R >> endobj',
    '2 0 obj << /Font << /F1 4 0 R >> >> endobj',
    `3 0 obj << /Length ${content.length} >> stream`,
    content,
    'endstream endobj',
    '4 0 obj << /Type /Font /Subtype /Type0 /ToUnicode 5 0 R >> endobj',
    `5 0 obj << /Length ${cmap.length} >> stream`,
    cmap,
    'endstream endobj',
  ].join('\n'))
  assertEquals(await extractPdfText(source), 'Hi !')
})

Deno.test('countPdfPages reads physical page objects and maps any positive source count', async () => {
  const source = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Pages /Count 3 >> endobj\n2 0 obj << /Type /Page /Parent 1 0 R >> endobj\n3 0 obj << /Type /Page /Parent 1 0 R >> endobj\n4 0 obj << /Type /Page /Parent 1 0 R >> endobj')
  assertEquals(await countPdfPages(source), 3)
})

Deno.test('countPdfPages inflates object streams before rejecting a valid source PDF', async () => {
  const encoder = new TextEncoder()
  const objectStream = '1 0 << /Type /Pages /Count 2 >> 2 0 << /Type /Page /Parent 1 0 R >> 3 0 << /Type /Page /Parent 1 0 R >>'
  const stream = new Blob([objectStream]).stream().pipeThrough(new CompressionStream('deflate'))
  const deflated = new Uint8Array(await new Response(stream).arrayBuffer())
  const prefix = encoder.encode(`%PDF-1.5\n1 0 obj << /Type /ObjStm /Filter /FlateDecode /Length ${deflated.length} >>\nstream\n`)
  const suffix = encoder.encode('\nendstream\nendobj\n')
  const source = new Uint8Array(prefix.length + deflated.length + suffix.length)
  source.set(prefix)
  source.set(deflated, prefix.length)
  source.set(suffix, prefix.length + deflated.length)
  assertEquals(await countPdfPages(source), 2)
})

Deno.test('countPdfPages does not double-count pages from an expanded object stream', async () => {
  const encoder = new TextEncoder()
  const bodies = [
    '<</Type/Pages/Count 1>>',
    '<</Type/Page/Parent 1 0 R>>',
  ]
  const index = `1 0 2 ${bodies[0].length} `
  const objectStream = `${index}${bodies.join('')}`
  const stream = new Blob([objectStream]).stream().pipeThrough(new CompressionStream('deflate'))
  const deflated = new Uint8Array(await new Response(stream).arrayBuffer())
  const prefix = encoder.encode(`%PDF-1.5\n9 0 obj\n<</Type/ObjStm/N 2/First ${index.length}/Filter/FlateDecode/Length ${deflated.length}>>\nstream\n`)
  const suffix = encoder.encode('\nendstream\nendobj\n')
  const source = new Uint8Array(prefix.length + deflated.length + suffix.length)
  source.set(prefix)
  source.set(deflated, prefix.length)
  source.set(suffix, prefix.length + deflated.length)
  assertEquals(await countPdfPages(source), 1)
})
