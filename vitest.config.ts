import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      // Preserved worktrees carry duplicate, stale Calendar acceptance suites.
      '**/.worktrees/**/src/app.test.ts',
    ],
  },
})
