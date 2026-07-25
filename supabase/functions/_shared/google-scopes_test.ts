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

Deno.test('Google identity scope URLs satisfy the email and profile aliases', () => {
  const scopes: string[] = googleExecutionScopes
    .filter(scope => scope !== 'email' && scope !== 'profile')
  scopes.push(
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  )
  assertEquals(missingGoogleExecutionScopes(scopes), [])
})
