export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'

export function parseTags(value: string, limit = 8) {
  const seen = new Set<string>()
  return value
    .split(',')
    .map(tag => tag.trim().replace(/^#/, ''))
    .filter(tag => {
      const key = tag.toLocaleLowerCase()
      if (!tag || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}

export function nextRecurringDate(dateKey: string, recurrence: Recurrence, monthlyAnchorDay?: number) {
  if (recurrence === 'none') return null
  const date = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  if (recurrence === 'daily') {
    date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }
  if (recurrence === 'weekdays') {
    do {
      date.setUTCDate(date.getUTCDate() + 1)
    } while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
    return date.toISOString().slice(0, 10)
  }
  if (recurrence === 'weekly') {
    date.setUTCDate(date.getUTCDate() + 7)
    return date.toISOString().slice(0, 10)
  }

  const currentDay = date.getUTCDate()
  const anchorDay = monthlyAnchorDay ?? currentDay
  const targetMonth = date.getUTCMonth() + 1
  const targetYear = date.getUTCFullYear()
  const endOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 12))
  const targetDay = Math.min(anchorDay, endOfTargetMonth.getUTCDate())
  date.setUTCMonth(targetMonth, targetDay)
  return date.toISOString().slice(0, 10)
}

export function reorderById<T extends { id: string }>(items: T[], movedId: string, targetId: string) {
  const copy = [...items]
  const from = copy.findIndex(item => item.id === movedId)
  const to = copy.findIndex(item => item.id === targetId)
  if (from < 0 || to < 0 || from === to) return copy
  const [moved] = copy.splice(from, 1)
  if (!moved) return copy
  copy.splice(to, 0, moved)
  return copy
}

export function completionPercent<T>(items: T[], isCompleted: (item: T) => boolean) {
  if (!items.length) return 0
  return Math.round(items.filter(isCompleted).length / items.length * 100)
}
