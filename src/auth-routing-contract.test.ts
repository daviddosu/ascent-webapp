import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const cloudSource = readFileSync(resolve(root, 'src/data/cloud.ts'), 'utf8')
const appSource = readFileSync(resolve(root, 'src/main.ts'), 'utf8')

describe('canonical Google sign-in route', () => {
  it('uses PKCE and returns to the workspace without an auth hash', () => {
    expect(cloudSource).toContain("hash.has('access_token') || hash.has('refresh_token') ? 'implicit' : 'pkce'")
    expect(cloudSource).toContain('flowType: authFlowType()')
    expect(cloudSource).toContain("redirectTo: `${window.location.origin}/app`")
    expect(appSource).toContain("authIntent === 'google'")
    expect(appSource).toContain("currentUrl.searchParams.delete('code')")
    expect(appSource).toContain("currentUrl.hash = ''")
    expect(appSource).toContain("currentUrl.pathname = '/app'")
    expect(appSource).not.toContain("access_token|refresh_token|token_type|expires_in")
  })
})
