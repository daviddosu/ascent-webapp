export class BrowserExecutionError extends Error {
  code: string
  retryable: boolean
  details?: Record<string, unknown>

  constructor(code: string, message: string, retryable = true, details?: Record<string, unknown>) {
    super(message)
    this.name = 'BrowserExecutionError'
    this.code = code
    this.retryable = retryable
    this.details = details
  }
}

export function isRecoverableBrowserRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /target page, context or browser has been closed|browser has been closed|err_insufficient_resources|browsercontext\.newpage|page\.goto/i.test(message)
}
