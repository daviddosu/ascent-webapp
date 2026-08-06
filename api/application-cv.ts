import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { validateCanonicalLatex } from '../supabase/functions/_shared/cv.js'

const execFile = promisify(execFileCallback)
const maximumLatexBytes = 220_000
const maximumOutputBytes = 20 * 1024 * 1024
const maximumPreviewBytes = 8 * 1024 * 1024
const compilerTimeoutMs = 20_000

type CompilerOptions = {
  expectedName?: string
  expectedEmail?: string
  compilerPath?: string
}

export type CompiledCv = {
  pdf: Buffer
  latex: string
  compilationLog: string
  atsText: string
  pageCount: number
  recovered: boolean
  preview: Buffer | null
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

async function runCompiler(binary: string, directory: string) {
  return execFile(binary, [
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-file-line-error',
    '-no-shell-escape',
    '-output-directory', directory,
    join(directory, 'main.tex'),
  ], {
    cwd: directory,
    timeout: compilerTimeoutMs,
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
  const staticIssues = validateCanonicalLatex(latex)
  if (staticIssues.length) throw new Error(`LaTeX safety validation failed: ${staticIssues.join('; ')}`)
  const directory = await mkdtemp(join(tmpdir(), 'shotcount-cv-'))
  const compiler = options.compilerPath ?? process.env.PDFLATEX_BIN ?? 'pdflatex'
  const pdfPath = join(directory, 'main.pdf')
  const logPath = join(directory, 'main.log')
  let compilationLog = ''
  let recovered = false
  try {
    await writeFile(join(directory, 'main.tex'), latex, 'utf8')
    // A TeX installation normally provides the approved file globally. The
    // controlled local fallback keeps the isolated worker deterministic when
    // that support file is not installed.
    await writeFile(join(directory, 'glyphtounicode.tex'), fallbackGlyphUnicode, 'utf8')
    try {
      const first = await runCompiler(compiler, directory)
      compilationLog = `${first.stdout}\n${first.stderr}`
    } catch (error) {
      compilationLog = safeCompilerError(error)
      if (!/glyphtounicode|unicode|inputenc|undefined control sequence/i.test(compilationLog)) throw new Error(`LaTeX compilation failed: ${compilationLog.slice(-4_000)}`)
      // The renderer already owns factual content. Recovery is limited to a
      // second deterministic compile using the generated, controlled glyph
      // fallback; it never asks the model to rewrite the template or facts.
      recovered = true
      const retry = await runCompiler(compiler, directory).catch(retryError => {
        throw new Error(`LaTeX recovery failed: ${safeCompilerError(retryError).slice(-4_000)}`)
      })
      compilationLog = `${compilationLog}\n[bounded recovery]\n${retry.stdout}\n${retry.stderr}`
    }
    const logFile = await readFile(logPath, 'utf8').catch(() => '')
    compilationLog = `${compilationLog}\n${logFile}`.slice(-120_000)
    const [pdf, atsText, pages] = await Promise.all([
      readFile(pdfPath),
      extractPdf(process.env.PDFTOTEXT_BIN ?? 'pdftotext', pdfPath),
      pageCount(process.env.PDFINFO_BIN ?? 'pdfinfo', pdfPath),
    ])
    validateOutput(pdf, atsText, options.expectedName ?? '', options.expectedEmail ?? '')
    const preview = await renderPreview(process.env.PDFTOPPM_BIN ?? 'pdftoppm', pdfPath, directory)
    return { pdf, latex, compilationLog, atsText: atsText.slice(0, 200_000), pageCount: pages, recovered, preview }
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
    })
    response.status(200).json({
      ok: true,
      pdf_base64: result.pdf.toString('base64'),
      latex: result.latex,
      compilation_log: result.compilationLog,
      ats_text: result.atsText,
      page_count: result.pageCount,
      recovered: result.recovered,
      preview_png_base64: result.preview?.toString('base64') ?? null,
    })
  } catch (error) {
    response.status(422).json({ error: error instanceof Error ? error.message.slice(0, 4_000) : 'LaTeX compilation failed.' })
  }
}
