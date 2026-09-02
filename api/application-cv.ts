import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { validateCanonicalLatex } from '../supabase/functions/_shared/cv.js'
import { RESEARCH_PROPOSAL_LATEX_MARKER, validateResearchProposalAuxiliaryFiles, validateResearchProposalLatex } from '../supabase/functions/_shared/research-proposal-pdf.js'

const execFile = promisify(execFileCallback)
const maximumLatexBytes = 220_000
const maximumOutputBytes = 20 * 1024 * 1024
const maximumPreviewBytes = 8 * 1024 * 1024
const compilerTimeoutMs = 110_000

type CompilerOptions = {
  expectedName?: string
  expectedEmail?: string
  expectedPageCount?: number
  compilerPath?: string
  auxiliaryFiles?: Array<{ filename: string; content: string }>
}

export type CompiledCv = {
  pdf: Buffer
  latex: string
  compilationLog: string
  atsText: string
  pageCount: number
  pageFillRatios: number[]
  recovered: boolean
  preview: Buffer | null
  compilerEngine: string
}

const fallbackGlyphUnicode = String.raw`% Controlled fallback for the approved glyphtounicode input.
\pdfglyphtounicode{A}{0041}\pdfglyphtounicode{B}{0042}\pdfglyphtounicode{C}{0043}
\pdfglyphtounicode{D}{0044}\pdfglyphtounicode{E}{0045}\pdfglyphtounicode{F}{0046}
\pdfglyphtounicode{G}{0047}\pdfglyphtounicode{H}{0048}\pdfglyphtounicode{I}{0049}
\pdfglyphtounicode{J}{004A}\pdfglyphtounicode{K}{004B}\pdfglyphtounicode{L}{004C}
\pdfglyphtounicode{M}{004D}\pdfglyphtounicode{N}{004E}\pdfglyphtounicode{O}{004F}
\pdfglyphtounicode{P}{0050}\pdfglyphtounicode{Q}{0051}\pdfglyphtounicode{R}{0052}
\pdfglyphtounicode{S}{0053}\pdfglyphtounicode{T}{0054}\pdfglyphtounicode{U}{0055}
\pdfglyphtounicode{V}{0056}\pdfglyphtounicode{W}{0057}\pdfglyphtounicode{X}{0058}
\pdfglyphtounicode{Y}{0059}\pdfglyphtounicode{Z}{005A}
\pdfglyphtounicode{a}{0061}\pdfglyphtounicode{b}{0062}\pdfglyphtounicode{c}{0063}
\pdfglyphtounicode{d}{0064}\pdfglyphtounicode{e}{0065}\pdfglyphtounicode{f}{0066}
\pdfglyphtounicode{g}{0067}\pdfglyphtounicode{h}{0068}\pdfglyphtounicode{i}{0069}
\pdfglyphtounicode{j}{006A}\pdfglyphtounicode{k}{006B}\pdfglyphtounicode{l}{006C}
\pdfglyphtounicode{m}{006D}\pdfglyphtounicode{n}{006E}\pdfglyphtounicode{o}{006F}
\pdfglyphtounicode{p}{0070}\pdfglyphtounicode{q}{0071}\pdfglyphtounicode{r}{0072}
\pdfglyphtounicode{s}{0073}\pdfglyphtounicode{t}{0074}\pdfglyphtounicode{u}{0075}
\pdfglyphtounicode{v}{0076}\pdfglyphtounicode{w}{0077}\pdfglyphtounicode{x}{0078}
\pdfglyphtounicode{y}{0079}\pdfglyphtounicode{z}{007A}`

function safeCompilerError(error: unknown) {
  const value = error && typeof error === 'object' ? error as { stdout?: string; stderr?: string; message?: string } : {}
  return [value.stdout, value.stderr, value.message].filter(Boolean).join('\n').slice(-80_000)
}

function validateOutput(pdf: Buffer, atsText: string, expectedName: string, expectedEmail: string) {
  if (!pdf.length || pdf.length > maximumOutputBytes || !pdf.subarray(0, 5).toString().startsWith('%PDF-')) {
    throw new Error('The LaTeX compiler did not produce a bounded PDF.')
  }
  if (!atsText.trim()) throw new Error('The compiled PDF did not contain extractable text.')
  const normalizedText = atsText.toLocaleLowerCase().replace(/[^\p{L}\p{N}@.+-]+/gu, ' ')
  const containsIdentity = (value: string) => value.toLocaleLowerCase().split(/\s+/).filter(Boolean).every(token => normalizedText.includes(token))
  if (expectedName && !containsIdentity(expectedName)) throw new Error('The compiled PDF does not contain the confirmed applicant name.')
  if (expectedEmail && !containsIdentity(expectedEmail)) throw new Error('The compiled PDF does not contain the confirmed applicant email.')
}

function isTectonicCompiler(binary: string) {
  return basename(binary).toLocaleLowerCase().startsWith('tectonic')
}

function latexForCompiler(latex: string, binary: string) {
  if (!isTectonicCompiler(binary)) return latex
  // The checked-in template intentionally preserves the canonical pdfLaTeX
  // source contract. Tectonic compiles with XeTeX, which writes searchable
  // Unicode natively and does not define pdfLaTeX's glyph-map primitives.
  // Remove only those two engine-specific directives in the ephemeral input;
  // the persisted/audited LaTeX remains byte-for-byte canonical.
  return latex
    .replace('\\input{glyphtounicode}', '% XeTeX emits Unicode mappings natively.')
    .replace('\\pdfgentounicode=1', '% XeTeX emits Unicode mappings natively.')
}

async function runCompiler(binary: string, directory: string) {
  const args = isTectonicCompiler(binary)
    ? ['--outdir', directory, '--keep-logs', '--untrusted', '--reruns', '2', join(directory, 'main.tex')]
    : [
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-file-line-error',
    '-no-shell-escape',
    '-output-directory', directory,
    join(directory, 'main.tex'),
    ]
  return execFile(binary, args, {
    cwd: directory,
    timeout: compilerTimeoutMs,
    maxBuffer: 2_000_000,
    windowsHide: true,
    env: {
      ...process.env,
      PATH: process.env.PATH ?? '',
      TEXMFOUTPUT: directory,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? join(tmpdir(), 'shotcount-tectonic-cache'),
      SOURCE_DATE_EPOCH: '0',
    },
  })
}

async function runBibliography(binary: string, directory: string) {
  return execFile(binary, ['main'], {
    cwd: directory,
    timeout: 10_000,
    maxBuffer: 2_000_000,
    windowsHide: true,
    env: {
      PATH: process.env.PATH ?? '',
      TEXMFOUTPUT: directory,
      SOURCE_DATE_EPOCH: '0',
    },
  })
}

async function extractPdf(binary: string, pdfPath: string) {
  const textResult = await execFile(binary, [pdfPath, '-'], { timeout: 5_000, maxBuffer: 2_000_000, windowsHide: true })
  return textResult.stdout
}

async function pageCount(binary: string, pdfPath: string) {
  const info = await execFile(binary, [pdfPath], { timeout: 5_000, maxBuffer: 500_000, windowsHide: true })
  const match = info.stdout.match(/^Pages:\s+(\d+)/mi)
  const value = Number(match?.[1] ?? 0)
  if (!Number.isInteger(value) || value < 1) throw new Error('The compiled PDF page count could not be verified.')
  return value
}

function parsePageFillRatios(bboxXml: string) {
  const pages = [...bboxXml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/gi)]
  return pages.map(match => {
    const height = Number(match[1]?.match(/\bheight="([\d.]+)"/i)?.[1])
    if (!Number.isFinite(height) || height <= 0) return 0
    const yValues = [...(match[2] ?? '').matchAll(/<text\b[^>]*\btop="([\d.]+)"[^>]*\bheight="([\d.]+)"/gi)]
    if (!yValues.length) return 0
    const yMin = Math.min(...yValues.map(item => Number(item[1])))
    const yMax = Math.max(...yValues.map(item => Number(item[1]) + Number(item[2])))
    return Math.max(0, Math.min(1, (yMax - yMin) / height))
  })
}

async function pageFillRatios(binary: string, pdfPath: string) {
  const result = await execFile(binary, ['-xml', '-stdout', pdfPath], { timeout: 5_000, maxBuffer: 2_000_000, windowsHide: true })
  return parsePageFillRatios(result.stdout)
}

async function inspectPdfWithPdfJs(pdf: Buffer) {
  // pdfjs uses these standards-based geometry primitives even for text-only
  // inspection. Import them explicitly so Vercel traces the native package
  // into the function instead of dropping pdfjs' optional runtime dependency.
  const canvas = await import('@napi-rs/canvas')
  globalThis.DOMMatrix ??= canvas.DOMMatrix as unknown as typeof DOMMatrix
  globalThis.Path2D ??= canvas.Path2D as unknown as typeof Path2D
  globalThis.ImageData ??= canvas.ImageData as unknown as typeof ImageData
  const { WorkerMessageHandler } = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  Object.assign(globalThis, { pdfjsWorker: { WorkerMessageHandler } })
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    useSystemFonts: true,
  })
  const document = await loadingTask.promise
  const text: string[] = []
  const fillRatios: number[] = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = content.items.flatMap(item => {
        if (!('str' in item) || !Array.isArray(item.transform)) return []
        const y = Number(item.transform[5])
        const height = Number(item.height ?? 0)
        return Number.isFinite(y) ? [{ text: item.str, y, height: Number.isFinite(height) ? height : 0 }] : []
      })
      text.push(items.map(item => item.text).join(' '))
      if (!items.length || !Number.isFinite(viewport.height) || viewport.height <= 0) {
        fillRatios.push(0)
      } else {
        const minimum = Math.min(...items.map(item => item.y))
        const maximum = Math.max(...items.map(item => item.y + item.height))
        fillRatios.push(Math.max(0, Math.min(1, (maximum - minimum) / viewport.height)))
      }
      page.cleanup()
    }
    return { atsText: text.join('\n'), pageCount: document.numPages, pageFillRatios: fillRatios }
  } finally {
    await loadingTask.destroy()
  }
}

function validateCvLayout(pageCountValue: number, fillRatios: number[], expectedPageCount?: number) {
  if (expectedPageCount === 1 && pageCountValue !== 1) {
    throw new Error('The tailored CV must remain exactly one page because the source CV is one page.')
  }
  if (expectedPageCount === 2 && pageCountValue !== 2) {
    throw new Error('The tailored CV did not preserve the required two-page source layout.')
  }
  if (pageCountValue < 1 || pageCountValue > 2) throw new Error('The CV must render as one page, or two genuinely content-filled pages.')
  if (pageCountValue === 2 && fillRatios.length >= 2 && fillRatios[1] < 0.62) {
    throw new Error('The CV produced an underfilled second page. Condense it to one page or include enough programme-relevant content to fill two pages.')
  }
}

async function renderPreview(binary: string, pdfPath: string, directory: string) {
  const prefix = join(directory, 'preview')
  try {
    await execFile(binary, ['-f', '1', '-singlefile', '-png', '-r', '120', pdfPath, prefix], {
      timeout: 5_000,
      maxBuffer: 500_000,
      windowsHide: true,
    })
    const preview = await readFile(`${prefix}.png`)
    if (preview.length > maximumPreviewBytes || preview.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null
    return preview
  } catch {
    // Preview generation is a presentation convenience. The PDF, ATS text,
    // and compiler log remain authoritative if Poppler is unavailable.
    return null
  }
}

export async function compileLatex(latex: string, options: CompilerOptions = {}): Promise<CompiledCv> {
  if (Buffer.byteLength(latex, 'utf8') > maximumLatexBytes) throw new Error('The generated LaTeX is too large.')
  const proposalAuxiliaryFiles = options.auxiliaryFiles ?? []
  const auxiliaryIssues = latex.startsWith(RESEARCH_PROPOSAL_LATEX_MARKER)
    ? validateResearchProposalAuxiliaryFiles(proposalAuxiliaryFiles)
    : proposalAuxiliaryFiles.length ? ['Auxiliary files are supported only for canonical research proposals.'] : []
  if (auxiliaryIssues.length) throw new Error('Research-proposal auxiliary-file validation failed: ' + auxiliaryIssues.join('; '))
  const staticIssues = latex.startsWith(RESEARCH_PROPOSAL_LATEX_MARKER)
    ? validateResearchProposalLatex(latex)
    : validateCanonicalLatex(latex)
  if (staticIssues.length) throw new Error(`LaTeX safety validation failed: ${staticIssues.join('; ')}`)
  const directory = await mkdtemp(join(tmpdir(), 'shotcount-cv-'))
  const bundledTectonic = join(process.cwd(), 'vendor', 'tectonic', 'tectonic')
  const compiler = options.compilerPath ?? process.env.PDFLATEX_BIN ?? process.env.TECTONIC_BIN ?? (process.env.VERCEL ? bundledTectonic : 'pdflatex')
  const compilerEngine = isTectonicCompiler(compiler) ? 'tectonic@0.17.0' : 'pdflatex'
  const pdfPath = join(directory, 'main.pdf')
  const logPath = join(directory, 'main.log')
  let compilationLog = ''
  let recovered = false
  try {
    await writeFile(join(directory, 'main.tex'), latexForCompiler(latex, compiler), 'utf8')
    for (const file of proposalAuxiliaryFiles) await writeFile(join(directory, file.filename), file.content, 'utf8')
    // A TeX installation normally provides the approved file globally. The
    // controlled local fallback keeps the isolated worker deterministic when
    // that support file is not installed.
    await writeFile(join(directory, 'glyphtounicode.tex'), fallbackGlyphUnicode, 'utf8')
    const compilePass = async () => {
      try {
        const result = await runCompiler(compiler, directory)
        return result.stdout + '\n' + result.stderr
      } catch (error) {
        const firstFailure = safeCompilerError(error)
        if (!/glyphtounicode|unicode|inputenc|undefined control sequence/i.test(firstFailure)) throw new Error('LaTeX compilation failed: ' + firstFailure.slice(-4_000))
        // The renderer already owns factual content. Recovery is limited to a
        // second deterministic compile using the generated, controlled glyph
        // fallback; it never asks the model to rewrite the template or facts.
        recovered = true
        const retry = await runCompiler(compiler, directory).catch(retryError => {
          throw new Error('LaTeX recovery failed: ' + safeCompilerError(retryError).slice(-4_000))
        })
        return firstFailure + '\n[bounded recovery]\n' + retry.stdout + '\n' + retry.stderr
      }
    }
    compilationLog = await compilePass()
    const bibliography = proposalAuxiliaryFiles.find(file => file.filename === 'refs.bib')
    if (!isTectonicCompiler(compiler) && bibliography && /@\w+\s*\{/i.test(bibliography.content)) {
      const bibtex = process.env.BIBTEX_BIN ?? 'bibtex'
      try {
        const result = await runBibliography(bibtex, directory)
        compilationLog += '\n[bibtex]\n' + result.stdout + '\n' + result.stderr
      } catch (error) {
        throw new Error('BibTeX compilation failed: ' + safeCompilerError(error).slice(-4_000))
      }
      compilationLog += '\n' + await compilePass() + '\n' + await compilePass()
    } else if (!isTectonicCompiler(compiler)) {
      compilationLog += '\n' + await compilePass()
    }
    const logFile = await readFile(logPath, 'utf8').catch(() => '')
    compilationLog = `${compilationLog}\n${logFile}`.slice(-120_000)
    const pdf = await readFile(pdfPath)
    const useConfiguredPoppler = Boolean(process.env.PDFTOTEXT_BIN || process.env.PDFINFO_BIN || process.env.PDFTOHTML_BIN)
    const inspection = useConfiguredPoppler
      ? {
          atsText: await extractPdf(process.env.PDFTOTEXT_BIN ?? 'pdftotext', pdfPath),
          pageCount: await pageCount(process.env.PDFINFO_BIN ?? 'pdfinfo', pdfPath),
          pageFillRatios: await pageFillRatios(process.env.PDFTOHTML_BIN ?? 'pdftohtml', pdfPath).catch(() => [] as number[]),
        }
      : await inspectPdfWithPdfJs(pdf)
    const { atsText, pageCount: pages, pageFillRatios: fillRatios } = inspection
    validateOutput(pdf, atsText, options.expectedName ?? '', options.expectedEmail ?? '')
    if (!latex.startsWith(RESEARCH_PROPOSAL_LATEX_MARKER)) validateCvLayout(pages, fillRatios, options.expectedPageCount)
    const preview = await renderPreview(process.env.PDFTOPPM_BIN ?? 'pdftoppm', pdfPath, directory)
    return { pdf, latex, compilationLog, atsText: atsText.slice(0, 200_000), pageCount: pages, pageFillRatios: fillRatios, recovered, preview, compilerEngine }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

type Request = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type Response = {
  status(code: number): Response
  json(value: unknown): void
  setHeader(name: string, value: string): void
}

function header(request: Request, name: string) {
  const entry = Object.entries(request.headers ?? {}).find(([key]) => key.toLocaleLowerCase() === name.toLocaleLowerCase())?.[1]
  return Array.isArray(entry) ? entry[0] ?? '' : entry ?? ''
}

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }
  const configuredToken = process.env.SHOTCOUNT_LATEX_COMPILER_TOKEN ?? ''
  if (!configuredToken) {
    response.status(503).json({ error: 'The LaTeX compiler is not configured with a server-only token.' })
    return
  }
  if (header(request, 'authorization') !== `Bearer ${configuredToken}`) {
    response.status(401).json({ error: 'Unauthorized' })
    return
  }
  const body = typeof request.body === 'string' ? JSON.parse(request.body) as Record<string, unknown> : request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {}
  const latex = typeof body.latex === 'string' ? body.latex : ''
  if (!latex) {
    response.status(400).json({ error: 'LaTeX source is required.' })
    return
  }
  try {
    const result = await compileLatex(latex, {
      expectedName: typeof body.expected_name === 'string' ? body.expected_name : '',
      expectedEmail: typeof body.expected_email === 'string' ? body.expected_email : '',
      expectedPageCount: Number.isInteger(body.expected_page_count) ? Number(body.expected_page_count) : undefined,
      auxiliaryFiles: Array.isArray(body.auxiliary_files)
        ? body.auxiliary_files.flatMap(item => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return []
          const row = item as Record<string, unknown>
          return typeof row.filename === 'string' && typeof row.content === 'string' ? [{ filename: row.filename, content: row.content }] : []
        })
        : [],
    })
    response.status(200).json({
      ok: true,
      compiler_generation: 'latex-tectonic@2',
      compiler_engine: result.compilerEngine,
      pdf_base64: result.pdf.toString('base64'),
      latex: result.latex,
      compilation_log: result.compilationLog,
      ats_text: result.atsText,
      page_count: result.pageCount,
      page_fill_ratios: result.pageFillRatios,
      recovered: result.recovered,
      preview_png_base64: result.preview?.toString('base64') ?? null,
    })
  } catch (error) {
    response.status(422).json({ error: error instanceof Error ? error.message.slice(0, 4_000) : 'LaTeX compilation failed.' })
  }
}
