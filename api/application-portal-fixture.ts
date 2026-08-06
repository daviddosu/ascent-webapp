type FixtureRequest = {
  method?: string
  url?: string
}

type FixtureResponse = {
  setHeader(name: string, value: string): void
  status(code: number): FixtureResponse
  send(body: string): void
}

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:32px 20px;color:#172020;background:#f5f7f7}main{max-width:620px;margin:auto;padding:28px;border:1px solid #d9e0e0;border-radius:18px;background:#fff}label{display:grid;gap:6px;margin:16px 0;font-weight:600}input,textarea,select,button{font:inherit}input,textarea,select{padding:10px;border:1px solid #aebbbb;border-radius:9px}button{padding:11px 16px;border:0;border-radius:999px;color:#fff;background:#172020}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}nav a{color:#176b69}.notice{padding:12px;border-radius:10px;background:#edf8f4}</style></head><body><main>${body}</main></body></html>`

function stepFromUrl(url = '') {
  try {
    return new URL(url, 'https://shotcount.test').searchParams.get('step') ?? 'account'
  } catch {
    return 'account'
  }
}

function parameters(url = '') {
  try {
    return new URL(url, 'https://shotcount.test').searchParams
  } catch {
    return new URLSearchParams()
  }
}

function navigation() {
  return '<nav aria-label="Application sections"><a href="/api/application-portal-fixture?step=account">Account</a><a href="/api/application-portal-fixture?step=verification">Verification</a><a href="/api/application-portal-fixture?step=profile">Profile</a><a href="/api/application-portal-fixture?step=education">Education</a><a href="/api/application-portal-fixture?step=research">Research</a><a href="/api/application-portal-fixture?step=documents">Documents</a><a href="/api/application-portal-fixture?step=review">Review</a></nav>'
}

export default function handler(request: FixtureRequest, response: FixtureResponse) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  const step = stepFromUrl(request.url)
  const query = parameters(request.url)
  const sessionExpired = query.get('session') === 'expired'
  const injectedError = query.get('error') === 'validation'
  if (request.method === 'POST') {
    if (sessionExpired) {
      response.status(409).send(page('Session expired', `${navigation()}<h1>Session expired</h1><p role="alert">Your portal session expired before this action could be saved.</p><a href="/api/application-portal-fixture?step=account&recovery=1">Resume sign in</a>`))
      return
    }
    if (step !== 'review') {
      response.status(422).send(page('Validation error', `${navigation()}<h1>Section needs attention</h1><p role="alert">Save the current section before continuing to final review.</p>`))
      return
    }
    response.status(200).send(page('Application submitted', `${navigation()}<h1>Application submitted</h1><p id="application-id">Application ID: SC-TEST-2027-001</p><p id="confirmation-email" class="notice">A confirmation email was sent by the controlled admissions system.</p><p class="notice">Submission confirmed once. This controlled fixture stores no applicant values.</p>`))
    return
  }
  if (request.method !== 'GET') {
    response.status(405).send(page('Method not allowed', '<h1>Method not allowed</h1>'))
    return
  }
  const bodies: Record<string, string> = {
    account: `${navigation()}<h1>${query.get('recovery') ? 'Resume sign in' : 'Create account'}</h1><p>Use the controlled university application portal.</p><form><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button type="submit">${query.get('recovery') ? 'Resume sign in' : 'Create account'}</button></form>`,
    verification: `${navigation()}<h1>Verify email</h1><p id="verification-status" class="notice">A verification code was sent to the applicant email.</p><label>Verification code<input name="verification_code" inputmode="numeric" autocomplete="one-time-code" required></label><button type="button">Verify email</button>`,
    profile: `${navigation()}<h1>Applicant profile</h1>${injectedError ? '<p role="alert">Choose a nationality before saving this section.</p>' : ''}<form><label>Legal name<input name="legal_name" required></label><label>Nationality<select name="nationality" required><option value="">Choose</option><option>Nigeria</option><option>Ghana</option></select></label><label>Research interests<textarea name="research_interests" required></textarea></label><button type="button">Save section</button></form>`,
    education: `${navigation()}<h1>Education history</h1><form><label>Degree<input name="degree" required></label><label>Institution<input name="institution" required></label><label>Dates<input name="dates" required></label><button type="button">Save section</button></form>`,
    research: `${navigation()}<h1>Research experience</h1><form><label>Research title<input name="research_title" required></label><label>Methods<textarea name="methods" required></textarea></label><label>Outcomes<textarea name="outcomes" required></textarea></label><button type="button">Save section</button></form>`,
    documents: `${navigation()}<h1>Documents</h1><form><label>Academic CV<input name="cv" type="file" accept=".pdf,.docx" required></label><label>Statement of purpose<input name="statement" type="file" accept=".pdf,.docx" required></label><label>Transcript<input name="transcript" type="file" accept=".pdf" required></label><button type="button">Save section</button></form>`,
    review: `${navigation()}<h1>Final review</h1><dl><dt>Programme</dt><dd>Controlled University PhD in Computational Physics</dd><dt>Funding</dt><dd>Full tuition waiver and stipend</dd></dl><p class="notice">All required sections are saved. Submission remains a separate approved action.</p><form method="post" action="/api/application-portal-fixture?step=review"><button type="submit">Submit application</button></form>`,
    expired: `${navigation()}<h1>Session expired</h1><p role="alert">The controlled session expired. Resume sign in to recover the saved sections.</p><a href="/api/application-portal-fixture?step=account&recovery=1">Resume sign in</a>`,
  }
  response.status(200).send(page(`Application portal · ${sessionExpired ? 'expired' : step}`, sessionExpired ? bodies.expired : bodies[step] ?? bodies.account))
}
