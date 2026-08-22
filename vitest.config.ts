import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Same mapping the demo build uses, so the demo smoke test runs on src/.
      'announce-queue': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
