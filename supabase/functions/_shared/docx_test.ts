import { createDocx, validateDocumentText } from './docx.ts'

Deno.test('creates a real DOCX package and enforces limits', () => {
  const bytes = createDocx('Motivation statement', 'Grounded application text.')
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes.length < 500) throw new Error('Expected a DOCX ZIP package')
  const valid = validateDocumentText('one two three', 3, null)
  if (!valid.valid || valid.words !== 3) throw new Error('Expected valid word count')
  if (validateDocumentText('one two three four', 3, null).valid) throw new Error('Expected word limit rejection')
})
