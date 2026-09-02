const encoder = new TextEncoder()

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e]/g, '?')
}

function wrapLine(line: string, width = 88) {
  if (!line.trim()) return ['']
  const words = line.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= width) current = next
    else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function object(id: number, body: string) {
  return `${id} 0 obj\n${body}\nendobj\n`
}

/** Creates a compact, valid, text-first PDF suitable for private application documents. */
export function createPdf(title: string, body: string) {
  const lines = body.split(/\r?\n/).flatMap(line => wrapLine(line))
  const pages: string[][] = []
  for (let index = 0; index < lines.length || (index === 0 && !lines.length); index += 44) {
    pages.push(lines.slice(index, index + 44))
  }
  const objects: Array<{ id: number; body: string }> = []
  const pageIds: number[] = []
  const contentIds: number[] = []
  let nextId = 4
  for (const _page of pages) {
    pageIds.push(nextId++)
    contentIds.push(nextId++)
  }
  objects.push({ id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' })
  objects.push({ id: 2, body: `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>` })
  objects.push({ id: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' })
  pages.forEach((page, index) => {
    const content = [
      'BT', '/F1 16 Tf', '72 760 Td', `(${escapePdfText(title)}) Tj`,
      '/F1 10.5 Tf', '0 -30 Td', '14 TL',
      ...page.map(line => `(${escapePdfText(line)}) Tj T*`), 'ET',
    ].join('\n')
    objects.push({ id: pageIds[index], body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>` })
    objects.push({ id: contentIds[index], body: `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream` })
  })
  objects.sort((left, right) => left.id - right.id)
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = [0]
  for (const item of objects) {
    offsets[item.id] = encoder.encode(pdf).length
    pdf += object(item.id, item.body)
  }
  const xref = encoder.encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return encoder.encode(pdf)
}
