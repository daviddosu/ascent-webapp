const encoder = new TextEncoder()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number) {
  return new Uint8Array([value & 255, (value >>> 8) & 255])
}

function u32(value: number) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255])
}

function join(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

function zip(entries: Array<{ name: string; value: string }>) {
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = encoder.encode(entry.value)
    const checksum = crc32(data)
    const local = join([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data])
    locals.push(local)
    central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]))
    offset += local.length
  }
  const directory = join(central)
  return join([...locals, directory, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(directory.length), u32(offset), u16(0)])
}

function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function createDocx(title: string, body: string) {
  const paragraphs = [title, ...body.split(/\n+/)].filter(Boolean)
    .map(text => `<w:p><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`).join('')
  return zip([
    { name: '[Content_Types].xml', value: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', value: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', value: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>` },
  ])
}

export function validateDocumentText(body: string, wordLimit: number | null, characterLimit: number | null) {
  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  const characters = [...body].length
  return {
    words,
    characters,
    valid: (wordLimit === null || words <= wordLimit) && (characterLimit === null || characters <= characterLimit),
  }
}
