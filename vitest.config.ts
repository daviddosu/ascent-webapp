import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      // Preserved worktrees contain duplicate historical application, UI, and
      // provider suites. They are evidence, not part of this checkout.
      '**/.worktrees/**',
      // Qualification and live-provider gates have explicit commands. They
      // are not part of the normal fast feedback loop.
      '**/benchmarks/**/run-benchmark.test.ts',
      '**/benchmarks/**/live-web.test.ts',
    ],
  },
})
