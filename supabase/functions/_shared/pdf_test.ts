import { createPdf } from './pdf.ts'

Deno.test('creates a valid private application PDF', () => {
  const bytes = createPdf('Statement of Purpose', 'Grounded application text.')
  const text = new TextDecoder().decode(bytes)
  if (!text.startsWith('%PDF-1.4') || !text.includes('Statement of Purpose') || !text.includes('%%EOF')) {
    throw new Error('Expected a valid PDF document')
  }
})
