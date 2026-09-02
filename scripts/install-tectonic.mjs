import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const version = '0.17.0'
const releaseBase = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${version}`
const targets = {
  'darwin-arm64': {
    archive: `tectonic-${version}-aarch64-apple-darwin.tar.gz`,
    sha256: 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667',
  },
  'darwin-x64': {
    archive: `tectonic-${version}-x86_64-apple-darwin.tar.gz`,
    sha256: '7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80',
  },
  'linux-x64': {
    archive: `tectonic-${version}-x86_64-unknown-linux-musl.tar.gz`,
    sha256: '8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7',
  },
  'linux-arm64': {
    archive: `tectonic-${version}-aarch64-unknown-linux-musl.tar.gz`,
    sha256: 'b10954a95404f3ab2328d2fa59a5ebab8e657f893fab096f98be8db7c0c979b8',
  },
}

const key = `${process.platform}-${process.arch}`
const target = targets[key]
if (!target) throw new Error(`No pinned Tectonic binary is configured for ${key}.`)

const outputDirectory = resolve('vendor/tectonic')
const outputPath = join(outputDirectory, process.platform === 'win32' ? 'tectonic.exe' : 'tectonic')
const existing = spawnSync(outputPath, ['--version'], { encoding: 'utf8' })
if (existing.status === 0 && existing.stdout.includes(version)) process.exit(0)

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'shotcount-tectonic-'))
try {
  const archivePath = join(temporaryDirectory, target.archive)
  const response = await fetch(`${releaseBase}/${target.archive}`, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Tectonic download failed with HTTP ${response.status}.`)
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()))
  const digest = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  if (digest !== target.sha256) throw new Error(`Tectonic checksum mismatch for ${target.archive}.`)
  const extracted = spawnSync('tar', ['-xzf', archivePath, '-C', temporaryDirectory], { encoding: 'utf8' })
  if (extracted.status !== 0) throw new Error(`Tectonic extraction failed: ${extracted.stderr || extracted.stdout}`)
  await mkdir(outputDirectory, { recursive: true })
  // Vercel's build checkout and /tmp are separate filesystems, so rename(2)
  // cannot move the extracted binary between them.
  await copyFile(join(temporaryDirectory, 'tectonic'), outputPath)
  await chmod(outputPath, 0o755)
  const verified = spawnSync(outputPath, ['--version'], { encoding: 'utf8' })
  if (verified.status !== 0 || !verified.stdout.includes(version)) {
    throw new Error(`The installed Tectonic binary could not be verified: ${verified.error?.message ?? verified.stderr ?? verified.stdout}`)
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
