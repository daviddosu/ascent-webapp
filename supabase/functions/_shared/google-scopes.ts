export const googleExecutionScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.events.freebusy',
  'https://www.googleapis.com/auth/contacts.readonly',
] as const

const identityScopeAliases: Record<string, string> = {
  email: 'https://www.googleapis.com/auth/userinfo.email',
  profile: 'https://www.googleapis.com/auth/userinfo.profile',
}

export function missingGoogleExecutionScopes(grantedScopes: string[]) {
  const granted = new Set(grantedScopes)
  return googleExecutionScopes.filter(scope =>
    !granted.has(scope) &&
    !(identityScopeAliases[scope] && granted.has(identityScopeAliases[scope]!))
  )
}
