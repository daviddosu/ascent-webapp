// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(async () => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.localStorage.setItem('previous-app-state', '{"old":true}')
  window.sessionStorage.setItem('previous-app-view', 'old-dashboard')
  document.body.innerHTML = '<div id="app"></div>'
  await import('./main')
})

describe('Shotcount landing page', () => {
  it('uses Shotcount branding throughout the main hero', () => {
    expect(document.querySelector('.craft-logo')?.textContent).toBe('SHOTCOUNT')
    expect(document.querySelector('.craft-try')?.textContent).toBe('Try Shotcount Free')
  })

  it('uses a frozen local preview instead of a live workspace embed', () => {
    const preview = document.querySelector<HTMLIFrameElement>('.craft-static-frame')
    expect(preview?.getAttribute('src')).toBe('/upcoming-workspace-preview.html')
    expect(preview?.src).toBe('http://localhost:3000/upcoming-workspace-preview.html')
  })

  it('removes browser storage left by the previous domain app', () => {
    expect(window.localStorage.getItem('previous-app-state')).toBeNull()
    expect(window.sessionStorage.getItem('previous-app-view')).toBeNull()
    expect(window.localStorage.getItem('shotcount-current-v1:previous-app-cleared')).toBe('yes')
  })

  it('keeps current data under an isolated storage prefix', () => {
    const keys = Object.keys(window.localStorage)
    expect(keys.every(key => key.startsWith('shotcount-current-v1:'))).toBe(true)
  })
})
