import { defineConfig } from 'vitest/config'

const liveProviderTestsEnabled = process.env.SHOTCOUNT_LIVE_FLIGHT_TEST === 'true'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      ...(liveProviderTestsEnabled ? [] : [
        // Live provider smoke tests run only through the explicit live-flight command.
        '**/*.live.test.ts',
      ]),
      // The preserved worktree contains a duplicate of the live smoke test.
      '**/.worktrees/**/*.live.test.ts',
      // Preserved worktrees carry duplicate, stale Calendar acceptance suites.
      '**/.worktrees/**/src/app.test.ts',
    ],
  },
})
