/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // TypeSafe's Jev API refuses calls made from a browser, so the dev and preview servers
  // forward them, adding the key from TYPESAFE_API_KEY (in .env.local, which is not committed).
  // The key never reaches the browser. A static host such as GitHub Pages has no such route.
  const key = loadEnv(mode, '.', '').TYPESAFE_API_KEY ?? ''
  const jev: Record<string, ProxyOptions> = {
    '/jev': {
      target: 'https://api.typesafe.ai',
      changeOrigin: true,
      rewrite: () => '/v1/systemone',
      headers: { Authorization: `Bearer ${key}` },
    },
  }
  return {
    // Relative asset paths, so the build works from any folder (e.g. GitHub Pages).
    base: './',
    plugins: [react()],
    server: { proxy: jev },
    preview: { proxy: jev },
    // Unit tests only; the browser tests in e2e/ run with Playwright.
    test: { include: ['src/**/*.test.ts', 'worker/**/*.test.ts'] },
  }
})
