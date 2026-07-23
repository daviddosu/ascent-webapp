// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(async () => {
  window.history.replaceState({}, '', '/?auth=signin')
  window.localStorage.clear()
  window.sessionStorage.clear()
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
})

describe('Shotcount sign-in pop-over', () => {
  it('does not show the square S logo', () => {
    expect(document.querySelector('.simple-auth-logo')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('closes from its close button and cleans the URL', () => {
    document.querySelector<HTMLButtonElement>('.google-auth-close')!.click()

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(window.location.search).toBe('')
  })

  it('opens email sign-in immediately instead of bouncing through the workspace', () => {
    document.querySelector<HTMLButtonElement>('[data-action="signin"]')!.click()

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector<HTMLInputElement>('#auth-email')).not.toBeNull()
    expect(window.location.search).toBe('?auth=signin')
  })

  it('always offers identity-only Google sign-in alongside email', () => {
    const googleButton = document.querySelector<HTMLButtonElement>('[data-action="continue-google"]')

    expect(googleButton).not.toBeNull()
    expect(googleButton?.textContent).toContain('Continue with Google')
  })
})
