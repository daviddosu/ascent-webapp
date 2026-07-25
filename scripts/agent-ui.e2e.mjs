import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { chromium as playwright } from 'playwright-core'

const host = '127.0.0.1'
const port = 4173
const baseUrl = `http://${host}:${port}`
const storageKey = 'shotcount-workspace-current-v1:agent-runs'

function runFixture(taskId, status, updatedAt, overrides = {}) {
  return {
    id: `e2e-${taskId}`,
    taskId,
    status,
    objective: taskId === 'outline'
      ? 'Outline the next newsletter'
      : 'Research potential supervisors for the MSc',
    context: '',
    capability: 'research',
    intent: {
      capability: 'research',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    },
    currentStep: 2,
    waitingReason: '',
    progressIndex: 2,
    progress: ['Opened the task context', 'Reviewed the relevant material'],
    result: null,
    durable: true,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  }
}

async function executablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH
  if (process.platform === 'linux') {
    const { default: chromium } = await import('@sparticuz/chromium')
    return chromium.executablePath()
  }
  const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  await access(macPath)
  return macPath
}

async function waitForServer(child) {
  let output = ''
  child.stdout.on('data', chunk => { output += String(chunk) })
  child.stderr.on('data', chunk => { output += String(chunk) })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Vite preview exited before it was ready.\n${output}`)
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The preview server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Vite preview did not start.\n${output}`)
}

async function assertVisible(page, selector, message) {
  const element = page.locator(selector)
  await element.first().waitFor({ state: 'visible', timeout: 10_000 })
  if (!await element.count()) throw new Error(message)
}

const server = spawn(
  'pnpm',
  ['exec', 'vite', 'preview', '--host', host, '--port', String(port), '--strictPort'],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
)

let browser
try {
  await waitForServer(server)
  browser = await playwright.launch({
    executablePath: await executablePath(),
    headless: true,
  })
  const context = await browser.newContext({
    viewport: { width: 1327, height: 934 },
    locale: 'en-GB',
    timezoneId: 'Africa/Lagos',
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text())
  })

  const now = new Date().toISOString()
  await page.addInitScript(({ key, runs }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(runs))
  }, {
    key: storageKey,
    runs: [
      runFixture('license', 'running', now),
      runFixture('outline', 'running', new Date(Date.now() - 1_000).toISOString()),
    ],
  })

  await page.goto(`${baseUrl}/?previewView=today&previewAgentIsland=1`, {
    waitUntil: 'networkidle',
  })
  await assertVisible(page, '.task-agent-card--progress', 'Today did not show inline agent progress.')
  await assertVisible(page, '.shotcount-agent-helper', 'Today did not show the base helper.')
  await assertVisible(page, '.shotcount-agent-island', 'The Dynamic Island did not show agent state.')
  if (await page.locator('.ask-shotcount-sparkles').count()) {
    throw new Error('The removed standalone sparkle control returned.')
  }
  const iconColor = await page.locator('.task-agent-card .agent-sparkle-icon')
    .first()
    .evaluate(element => getComputedStyle(element).color)
  const iconChannels = iconColor.match(/\d+/g)?.slice(0, 3).map(Number) ?? []
  if (iconChannels.length !== 3 || iconChannels.some(channel => channel > 40)) {
    throw new Error(`The agent icon is not black: ${iconColor}`)
  }
  const defaultShadow = await page.locator('.shotcount-agent-helper')
    .evaluate(element => getComputedStyle(element).boxShadow)
  await page.locator('.shotcount-agent-helper').hover()
  const hoverShadow = await page.locator('.shotcount-agent-helper')
    .evaluate(element => getComputedStyle(element).boxShadow)
  if (defaultShadow !== 'none' || hoverShadow === 'none') {
    throw new Error('The Today helper glass treatment is not hover-only.')
  }

  await page.locator('[data-view="upcoming"]').click()
  await page.locator('.upcoming-screen').waitFor({ state: 'visible' })
  if (await page.locator('.upcoming-command-row .ask-shotcount-button').count() !== 2) {
    throw new Error('Upcoming does not expose the shared ShotCount action in both groups.')
  }
  await page.locator('.task-text[data-task="outline"]').click()
  await assertVisible(page, '.task-agent-card--progress', 'Upcoming did not reuse inline agent progress.')
  await assertVisible(page, '.task-row.selected', 'Upcoming did not preserve selected-task styling.')
  if (await page.locator('.upcoming-screen .shotcount-agent-helper').count()) {
    throw new Error('The Today-only helper leaked into Upcoming.')
  }

  await page.evaluate(({ key, run }) => {
    localStorage.setItem(key, JSON.stringify([run]))
  }, {
    key: storageKey,
    run: runFixture('license', 'failed', now, {
      error: 'The browser session expired. Try again.',
      errorCode: 'browser_session_expired',
    }),
  })
  await page.goto(`${baseUrl}/?previewView=today&previewAgent=error`, {
    waitUntil: 'networkidle',
  })
  await assertVisible(page, '.task-agent-card--error', 'The recoverable error card did not render.')
  const errorText = await page.locator('.task-agent-card--error').innerText()
  if (!errorText.includes('Needs attention') || !errorText.includes('Try again')) {
    throw new Error('The error state is missing its calm status or recovery action.')
  }

  if (pageErrors.length) {
    throw new Error(`Browser console errors:\n${pageErrors.join('\n')}`)
  }
  console.log('Agent UI E2E passed: Today, Upcoming, Dynamic Island, hover glass, and error recovery.')
} finally {
  await browser?.close().catch(() => undefined)
  server.kill('SIGTERM')
}
