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

async function createTodayTask(page, title, description = '') {
  await page.locator('.today-command-row .add-task-row').click()
  await page.locator('[data-today-form] input[name="title"]').fill(title)
  if (description) {
    await page.locator('[data-today-form] textarea[name="description"]').fill(description)
  }
  await page.locator('[data-today-form]').evaluate(form => form.requestSubmit())
  await page.locator('.inspector-title').waitFor({ state: 'visible' })
  const inspectorTitle = await page.locator('.inspector-title').inputValue()
  if (inspectorTitle !== title) {
    throw new Error(`Expected inspector for "${title}", received "${inspectorTitle}".`)
  }
  await assertVisible(page, '[data-action="delegate-task"]', `The new task "${title}" could not be delegated.`)
}

async function delegateSelectedTask(page) {
  await page.locator('[data-action="delegate-task"]').click()
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

  await createTodayTask(
    page,
    'Follow up with everyone I emailed about ShotCount last week',
    'Use the controlled test inbox and exclude threads that already received a reply.',
  )
  await delegateSelectedTask(page)
  await assertVisible(page, '.task-agent-card--approval', 'Gmail follow-up did not reach exact approval.')
  const gmailApproval = await page.locator('.task-agent-card--approval').innerText()
  if (!gmailApproval.includes('investor@example.com') || !gmailApproval.includes('Only this exact action')) {
    throw new Error('Gmail approval did not expose the exact reviewed action.')
  }
  await page.locator('[data-action="approve-agent-approval"]').click()
  await assertVisible(page, '.task-agent-card--result', 'Approved Gmail follow-up did not complete.')
  if (!await page.locator('.task-agent-card--result').innerText().then(text => text.includes('Gmail confirmed'))) {
    throw new Error('Gmail completion was not provider-confirmed in the UI.')
  }

  await createTodayTask(
    page,
    'Set up a meeting with Blessing next week to discuss the ShotCount launch',
    'Use 30 minutes and the controlled development contact.',
  )
  await delegateSelectedTask(page)
  await assertVisible(page, '.task-agent-card--approval', 'Scheduling outreach did not request approval.')
  await page.locator('[data-action="approve-agent-approval"]').click()
  await assertVisible(page, '.task-agent-card--waiting', 'Scheduling did not enter waiting_external.')
  const waitingText = await page.locator('.task-agent-card--waiting').innerText()
  if (!waitingText.includes('Waiting for Blessing')) {
    throw new Error('The external-reply waiting state is missing.')
  }
  await page.locator('[data-action="poll-agent"]').click()
  await assertVisible(page, '.task-agent-card--approval', 'Reply resume did not prepare Calendar approval.')
  const calendarApproval = await page.locator('.task-agent-card--approval').innerText()
  if (!calendarApproval.includes('ShotCount launch meeting with Blessing') || !calendarApproval.includes('2026-07-30')) {
    throw new Error('Calendar approval did not expose the exact event.')
  }
  await page.locator('[data-action="approve-agent-approval"]').click()
  await assertVisible(page, '.task-agent-card--result', 'Calendar confirmation did not complete the AgentRun.')
  if (!await page.locator('.task-agent-card--result').innerText().then(text => text.includes('Google Calendar confirmed'))) {
    throw new Error('Scheduling completion was not provider-confirmed in the UI.')
  }

  await createTodayTask(
    page,
    'Find me a return flight from Lagos to London next Thursday returning Sunday',
    'Economy, maximum one stop, preferably under $1,000.',
  )
  await delegateSelectedTask(page)
  await assertVisible(page, '.task-agent-flight-options', 'Flight search did not return options into ShotCount.')
  if (await page.locator('.task-agent-flight-options > button').count() !== 3) {
    throw new Error('Flight search did not return the expected concise set of three options.')
  }
  await page.locator('[data-flight-option-id="e2e-flight-best"]').click()
  await assertVisible(page, '.task-agent-payment-handoff', 'Flight selection did not resume to the payment boundary.')
  const paymentText = await page.locator('.task-agent-payment-handoff').innerText()
  if (!paymentText.includes('Payment and the final purchase remain under your control')) {
    throw new Error('The payment boundary does not clearly preserve user control.')
  }
  const paymentLink = await page.locator('.task-agent-payment-handoff a').getAttribute('href')
  if (paymentLink !== 'https://www.google.com/travel/flights/booking') {
    throw new Error(`Unexpected payment handoff URL: ${paymentLink}`)
  }

  if (pageErrors.length) {
    throw new Error(`Browser console errors:\n${pageErrors.join('\n')}`)
  }
  console.log('Agent UI E2E passed: Today, Upcoming, Gmail approval, reply resume, Calendar confirmation, live-flight handoff UI, Dynamic Island, hover glass, and error recovery.')
} finally {
  await browser?.close().catch(() => undefined)
  server.kill('SIGTERM')
}
