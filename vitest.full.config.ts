import { defineConfig } from 'vitest/config'

// Release validation covers every active test file, while still ignoring
// preserved worktrees that are not part of this checkout. Qualification and
// live-provider files remain explicit/opt-in through their environment gates.
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/.worktrees/**',
    ],
  },
})
