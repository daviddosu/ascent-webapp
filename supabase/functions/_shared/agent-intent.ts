import { actionIsAffirmed, calendarCoordinationIsAffirmed, calendarInviteIsAffirmed, calendarWriteIsAffirmed } from './communication-safety.ts'
import { isApplicationIntent } from './application.ts'

export type SharedAgentIntent = {
  capability: 'research' | 'draft' | 'research_draft' | 'gmail' | 'calendar' | 'scheduling' | 'browser'
  strategy: 'structured' | 'browser' | 'hybrid'
  outcomeType: 'prepared_result' | 'external_change'
}

export function hasEmailIntent(value: string) {
  return /\b(?:email|mail|gmail|reply|respond|follow[\s-]?up|message|outreach|recipient|inbox)\b/i.test(value) ||
    /\b(?:tell|ask|inform|remind|notify)\s+(?!me\b|myself\b|us\b|the\s+user\b)(?:the\s+)?(?:[a-z][a-z'-]*|them|him|her|someone|everyone)\b/i.test(value)
}

export function hasCalendarIntent(value: string) {
  return /\b(?:meeting|meet|calendar|schedule|scheduled|scheduling|reschedule|availability|appointment|invite|invitation|slot|free)\b/i.test(value) ||
    /\b(?:create|add|put|place|sync|move|update|change|cancel|delete|remove|book)\b[\s\S]{0,80}\b(?:event|meeting|appointment|call|calendar|slot)\b/i.test(value)
}

export function classifySharedAgentIntent(title: string, description = ''): SharedAgentIntent {
  const value = `${title} ${description}`.toLocaleLowerCase()
  const applicationIntent = isApplicationIntent(title, description)
  const hasEmail = hasEmailIntent(value)
  const calendarCoordination = calendarCoordinationIsAffirmed(value) || calendarInviteIsAffirmed(value)
  const hasCalendar = hasCalendarIntent(value) || calendarCoordination
  const preparingEmail = /\b(?:prepare|draft|write)\b/.test(value)
  const explicitSendRequest = actionIsAffirmed(
    value.replace(/\b(?:email|message|follow[\s-]?up)\b/g, ''),
    'gmail_send',
  )
  const wantsEmailWrite = actionIsAffirmed(value, 'gmail_send') && (!preparingEmail || explicitSendRequest)
  const wantsCalendarWrite = calendarWriteIsAffirmed(value)
  const wantsBrowserWrite = /\b(?:submit|register|sign[\s-]?up|apply|upload)\b/.test(value) ||
    /\b(?:fill|complete)\b[\s\S]{0,40}\bform\b/.test(value)
  const research = /\b(?:research|find|compare|identify|program|professor|supervisor|resource)\b/.test(value)
  const draft = /\b(?:draft|write|outline|application|polish|document)\b/.test(value)

  if (applicationIntent) {
    return { capability: 'browser', strategy: 'hybrid', outcomeType: 'prepared_result' }
  }
  if (calendarCoordination || (hasEmail && hasCalendar && wantsCalendarWrite)) {
    return { capability: 'scheduling', strategy: 'hybrid', outcomeType: 'external_change' }
  }
  if (hasEmail && hasCalendar && !wantsCalendarWrite && !calendarCoordination) {
    return { capability: 'gmail', strategy: 'structured', outcomeType: wantsEmailWrite ? 'external_change' : 'prepared_result' }
  }
  if (hasCalendar) {
    return { capability: 'calendar', strategy: 'structured', outcomeType: wantsCalendarWrite ? 'external_change' : 'prepared_result' }
  }
  if (hasEmail) {
    return { capability: 'gmail', strategy: 'structured', outcomeType: wantsEmailWrite ? 'external_change' : 'prepared_result' }
  }
  if (research && draft) return { capability: 'research_draft', strategy: 'structured', outcomeType: 'prepared_result' }
  if (draft) return { capability: 'draft', strategy: 'structured', outcomeType: 'prepared_result' }
  return {
    capability: research ? 'research' : 'browser',
    strategy: research ? 'structured' : 'browser',
    outcomeType: wantsBrowserWrite ? 'external_change' : 'prepared_result',
  }
}

export function needsSharedAgentContext(title: string, description = '', context = '') {
  const combined = `${title} ${description} ${context}`.toLocaleLowerCase()
  const explicitlyMissingMeetingDetails =
    /\b(?:meet|meeting|call|appointment)\b/.test(combined) &&
    /\b(?:no|missing|without)\b[\s\S]{0,80}\b(?:duration|topic|agenda|time|date)\b/.test(combined) &&
    /\b(?:do not|don't|never|without)\b[\s\S]{0,80}\b(?:guess|invent|assume|fabricate)/.test(combined)
  if (explicitlyMissingMeetingDetails) return true
  if (description.trim() || context.trim()) return false
  const words = title.trim().match(/[\p{L}\p{N}]+/gu) ?? []
  return words.length < 3
}
