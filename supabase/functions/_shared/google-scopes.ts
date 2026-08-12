export const googleExecutionScopes = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/contacts.readonly',
] as const

const identityScopeAliases: Record<string, string[]> = {
  'https://www.googleapis.com/auth/userinfo.email': ['email'],
  'https://www.googleapis.com/auth/userinfo.profile': ['profile'],
}

export function missingGoogleExecutionScopes(grantedScopes: string[]) {
  const granted = new Set(grantedScopes)
  return googleExecutionScopes.filter(scope =>
    !granted.has(scope) &&
    !(identityScopeAliases[scope] ?? []).some(alias => granted.has(alias))
  )
}
