import { assertEquals } from 'jsr:@std/assert@1'
import {
  googleExecutionScopes,
  missingGoogleExecutionScopes,
} from './google-scopes.ts'

Deno.test('Google execution requires every Gmail, Calendar, contacts, and identity scope', () => {
  assertEquals(missingGoogleExecutionScopes([...googleExecutionScopes]), [])
  assertEquals(
    missingGoogleExecutionScopes(
      googleExecutionScopes.filter(scope => scope !== 'https://www.googleapis.com/auth/gmail.compose'),
    ),
    ['https://www.googleapis.com/auth/gmail.compose'],
  )
})

Deno.test('Google identity aliases satisfy the canonical identity scope URLs', () => {
  const scopes: string[] = googleExecutionScopes
    .filter(scope => !scope.startsWith('https://www.googleapis.com/auth/userinfo.'))
  scopes.push(
    'email',
    'profile',
  )
  assertEquals(missingGoogleExecutionScopes(scopes), [])
})
