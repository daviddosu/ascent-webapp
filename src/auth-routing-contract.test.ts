import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const cloudSource = readFileSync(resolve(root, 'src/data/cloud.ts'), 'utf8')
const appSource = readFileSync(resolve(root, 'src/main.ts'), 'utf8')

describe('canonical Google sign-in route', () => {
  it('uses PKCE and returns to the workspace without an auth hash', () => {
    expect(cloudSource).toContain("query.get('auth') === 'google' || query.has('code') ? 'pkce' : 'implicit'")
    expect(cloudSource).toContain('flowType: authFlowType()')
    expect(cloudSource).toContain("redirectTo: `${window.location.origin}/`")
    expect(appSource).toContain("authIntent === 'google'")
    expect(appSource).toContain("cleanUrl.searchParams.delete('code')")
    expect(appSource).not.toContain("access_token|refresh_token|token_type|expires_in")
  })
})
