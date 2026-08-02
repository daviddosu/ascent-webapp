function safeString(value: unknown, maximum = 600) {
  return typeof value === 'string' ? value.slice(0, maximum) : ''
}

/** Extract only person-name phrases, not the rest of an email instruction. */
export function namedRecipientsFromObjective(objective: string, description = '') {
  const titleValue = objective.trim().replace(/[’‘]/g, "'")
  const descriptionValue = description.trim().replace(/[’‘]/g, "'")
  // Prefer the explicit title anchor, then parse the Description on its own
  // so a generic title such as “Find availability” cannot contaminate the
  // recipient name captured from “Check Ada's availability”. Only combine
  // them when the instruction is split across both fields.
  const values = [titleValue, descriptionValue, `${titleValue} ${descriptionValue}`.trim()].filter(Boolean)
  const patterns = [
    /^(?:reply\s+to|follow[\s-]?up\s+with)\s+(.+?)(?:\s+(?:['’]s\s+)?(?:most\s+recent|latest)\s+email\b|\s+(?:about|regarding|on|re:)\b|$)/i,
    /^(?:email|message)\s+(.+?)(?:\s+(?:about|regarding|on|re:|the)\b|$)/i,
    /^(?:tell|ask|inform|remind)\s+(.+?)(?:\s+(?:about|regarding|whether|if|to|that|the)\b|$)/i,
    /^(?:invite|notify)\s+(.+?)(?:\s+(?:to|for|about|regarding|on|at)\b|$)/i,
    /^(?:schedule|arrange|coordinate|organize|set\s*up|book|reschedule)\b[\s\S]*?\bwith\s+(.+?)(?:\s+(?:about|regarding|for|on|at|next|this|today|tomorrow)\b|$)/i,
    /^(?:find|check|look\s+for)\s+(.+?)\s+(?:availability|free\s+(?:time|slot))\b/i,
    /^(?:find|check|look\s+for)\s+(?:availability|free\s+(?:time|slot))\s+(?:with|for)\s+(.+?)(?:\s+(?:about|regarding|on|at|next|this|today|tomorrow)\b|$)/i,
    /^(?:find|check|look\s+for)\b[\s\S]*?\bwith\s+(.+?)(?:\s+(?:about|regarding|for|on|at|next|this|today|tomorrow)\b|$)/i,
    /^(?:when|what\s+time)\b[\s\S]*?\b(?:is|can|could|would)\s+(.+?)\s+(?:free|available|meet)\b/i,
    /^(?:what|which)\s+(?:time|day|date)\b[\s\S]*?\bworks?\s+for\s+(.+?)(?:\s+(?:about|regarding|on|at|next|this|today|tomorrow)\b|$)/i,
    /^(?:put|place|add|sync)\b[\s\S]*?\b(?:to|in|into|on)\s+(.+?)\s+(?:email|gmail|inbox|calendar|schedule)\b/i,
  ]
  const match = values.flatMap(value => patterns.map(pattern => value.match(pattern))).find(Boolean)
  const raw = safeString(match?.[1]).trim()
  if (!raw) return []
  return raw
    .split(/\s*(?:,|\band\b|&)\s*/i)
    .map(value => value
      .replace(/[’‘]s\b|'s\b/gi, '')
      .replace(/\b(?:most\s+recent|latest)\s+(?:email|message)\b/gi, '')
      .replace(/\b(?:email|message|inbox)\b$/i, '')
      .replace(/\b(?:please|today|tomorrow|next\s+week)\b/gi, '')
      .trim())
    .filter(value => value && !/^(?:me|myself|us|everyone|them|the\s+team)$/i.test(value))
    .filter((value, index, values) => values.findIndex(candidate => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) === index)
    .slice(0, 10)
}
