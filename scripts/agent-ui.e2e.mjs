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
    specialistId: 'roon',
    activeSpecialistId: 'roon',
    intent: {
      capability: 'research',
      strategy: 'structured',
      outcomeType: 'prepared_result',
    },
    currentStep: 2,
    waitingReason: '',
    progressIndex: 2,
    progress: ['Opened the task context', 'Reviewed the relevant material'],
    currentProgress: { specialistId: 'roon', label: 'Roon is reviewing the latest result and selecting the next verified operation.' },
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
      runFixture('outline', 'running', new Date(Date.now() - 1_000).toISOString(), {
        objective: 'Prepare my MSc application',
        capability: 'research_draft',
        specialistId: 'david',
        activeSpecialistId: 'david',
        currentProgress: { specialistId: 'david', label: 'David is reviewing the latest result and selecting the next verified operation.' },
      }),
    ],
  })

  await page.goto(`${baseUrl}/?previewView=today`, {
    waitUntil: 'networkidle',
  })
  await assertVisible(page, '.task-agent-card--progress', 'Today did not show inline agent progress.')
  const progressText = await page.locator('.task-agent-card--progress').first().innerText()
  if (!progressText.includes('Roon is reviewing the latest result and selecting the next verified operation.')) {
    throw new Error('The active Roon operation is not shown in the progress card.')
  }
  if (progressText.includes('Summarizing main points') || progressText.includes('Identifying key takeaways')) {
    throw new Error('The progress card still shows anticipated static steps.')
  }
  if (await page.locator('.shotcount-agent-island').count()) {
    throw new Error('The retired Dynamic Island returned instead of using inline agent progress.')
  }
  if (await page.locator('.shotcount-agent-helper').count()) {
    throw new Error('The persistent Roon banner still appears on Today.')
  }
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

  await page.goto(`${baseUrl}/?previewView=today`, { waitUntil: 'networkidle' })
  const manualTaskButton = page.locator('.today-command-row .add-task-row')
  if (await manualTaskButton.innerText() !== 'Add New Task') {
    throw new Error('Manual Create Task changed during the Roon refinement.')
  }

  await page.locator('.today-command-row .ask-shotcount-button').click()
  await assertVisible(page, '.roon-planner-card', 'Ask Roon did not open in the workspace.')
  if (await page.locator('[data-today-form]').count()) {
    throw new Error('Ask Roon incorrectly opened the manual task composer.')
  }
  await page.locator('[data-roon-goal-form] textarea').fill('I want to win a fully funded scholarship to study in Europe.')
  await page.locator('[data-roon-goal-form]').evaluate(form => form.requestSubmit())
  await assertVisible(page, '.roon-plan-list', 'Ask Roon did not return a task plan.')
  const plannedTitles = await page.locator('.roon-plan-item input[name="title"]')
    .evaluateAll(inputs => inputs.map(input => input.value))
  if (plannedTitles.length !== 5 || plannedTitles.some(title => title.trim().split(/\s+/).length > 5)) {
    throw new Error(`Ask Roon did not return five concise task titles: ${plannedTitles.join(', ')}`)
  }
  const firstDescription = await page.locator('.roon-plan-item textarea[name="description"]').first().inputValue()
  if (!firstDescription.includes('fully funded')) {
    throw new Error('Ask Roon did not generate useful task descriptions.')
  }
  await page.locator('.roon-plan-item input[name="title"]').first().fill('Research scholarships')
  await page.locator('[data-action="remove-roon-plan-task"]').nth(1).click()
  await page.locator('[data-roon-plan-form]').evaluate(form => form.requestSubmit())
  await page.locator('.task-text', { hasText: 'Research scholarships' }).click()
  if (!await page.locator('.inspector textarea[aria-label="Description"]').inputValue().then(value => value.includes('fully funded'))) {
    throw new Error('A Roon-created task did not retain its Description.')
  }
  if (await page.locator('.task-text', { hasText: 'Shortlist programmes' }).count()) {
    throw new Error('A task removed from the Roon preview was still created.')
  }

  await page.locator('[data-view="upcoming"]').click()
  await page.locator('.upcoming-screen').waitFor({ state: 'visible' })
  if (await page.locator('.upcoming-command-row .ask-shotcount-button').count() !== 2) {
    throw new Error('Upcoming does not expose the shared ShotCount action in both groups.')
  }
  await page.locator('.task-text[data-task="outline"]').click()
  await assertVisible(page, '.task-agent-card--progress', 'Upcoming did not reuse inline agent progress.')
  const davidProgressText = await page.locator('.inspector .task-agent-card--progress').innerText()
  if (!davidProgressText.includes('David is reviewing the latest result and selecting the next verified operation.')) {
    throw new Error('The active David operation is not shown in the progress card.')
  }
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
    'Follow up with investors',
    'Follow up with everyone I emailed about ShotCount last week who has not replied. Keep it concise and use the controlled test inbox.',
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
    'Meet with Blessing',
    'Set up a 30-minute meeting next week to discuss the ShotCount launch. Prefer afternoons and use the controlled development contact.',
  )
  await delegateSelectedTask(page)
  await assertVisible(page, '.task-agent-card--approval', 'Scheduling outreach did not request approval.')
  await page.locator('[data-action="approve-agent-approval"]').click()
  await assertVisible(page, '.task-agent-card--progress', 'Scheduling did not show its durable waiting progress.')
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

  await createTodayTask(page, 'Book flight')
  await delegateSelectedTask(page)
  await assertVisible(page, '.task-agent-card--context', 'A vague flight task did not ask for context.')
  await page.locator('[data-action="focus-task-description"]').click()
  const descriptionField = page.locator('.inspector textarea[aria-label="Description"]')
  if (!await descriptionField.evaluate(element => element === document.activeElement)) {
    throw new Error('Add details did not focus the existing Description field.')
  }
  await page.locator('[data-action="cancel-agent"]').click()
  await page.locator('[data-action="delete-task"]').click()

  await createTodayTask(
    page,
    'Book London flight',
    'Return trip from Lagos. Depart next Thursday and return Sunday. Economy. Maximum one stop, preferably under $1,000.',
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
  console.log('Agent UI E2E passed: manual task creation, Ask Roon planning, description-aware delegation, missing context, Gmail approval, reply resume, Calendar confirmation, flight handoff, Dynamic Island, and error recovery.')
} finally {
  await browser?.close().catch(() => undefined)
  server.kill('SIGTERM')
}
