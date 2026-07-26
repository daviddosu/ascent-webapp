export function safeBrowserRetryDelayMs(
  operationType: string,
  errorCode: string,
  completedAttempts: number,
) {
  if (operationType === 'submit' || completedAttempts < 1 || completedAttempts >= 3) return null
  const providerDelay = errorCode === 'flight_results_timeout' ? 15_000 : 8_000
  return providerDelay * completedAttempts
}
