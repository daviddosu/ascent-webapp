// A separate serverless entrypoint gives flight selection its own Chromium
// lifecycle instead of inheriting the search worker's exhausted process pool.
export { default, maxDuration } from './browser-worker.js'
