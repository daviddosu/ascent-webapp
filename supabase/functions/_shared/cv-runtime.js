function safeText(value, maximum = 4_000) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function escapeUnicode(value) {
  const replacements = {
    '–': '--', '—': '---', '…': '\\ldots{}', '•': '\\textbullet{}', '’': "'", '‘': "'", '“': '``', '”': "''",
    'é': "\\'{e}", 'É': "\\'{E}", 'è': "\\`{e}", 'È': "\\`{E}", 'ê': "\\^{e}", 'Ê': "\\^{E}",
    'á': "\\'{a}", 'Á': "\\'{A}", 'à': "\\`{a}", 'À': "\\`{A}", 'â': "\\^{a}", 'Â': "\\^{A}",
    'í': "\\'{i}", 'Í': "\\'{I}", 'ì': "\\`{i}", 'Ì': "\\`{I}", 'î': "\\^{i}", 'Î': "\\^{I}",
    'ó': "\\'{o}", 'Ó': "\\'{O}", 'ò': "\\`{o}", 'Ò': "\\`{O}", 'ô': "\\^{o}", 'Ô': "\\^{O}",
    'ú': "\\'{u}", 'Ú': "\\'{U}", 'ù': "\\`{u}", 'Ù': "\\`{U}", 'û': "\\^{u}", 'Û': "\\^{U}",
    'ñ': "\\~{n}", 'Ñ': "\\~{N}", 'ç': "\\c{c}", 'Ç': "\\c{C}", 'ø': '\\o{}', 'Ø': '\\O{}',
    'ß': '{\\ss}', 'ü': '"{u}', 'Ü': '"{U}', 'ö': '"{o}', 'Ö': '"{O}', 'ä': '"{a}', 'Ä': '"{A}',
  }
  return [...value].map(character => replacements[character] ?? character).join('')
}

export function escapeLatex(value, maximum = 4_000) {
  const text = safeText(value, maximum)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  return escapeUnicode(text)
}
