import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  test: {
    testTimeout: 30_000,
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    env: loadEnv(mode ?? 'test', process.cwd(), ''),
  },
}))
