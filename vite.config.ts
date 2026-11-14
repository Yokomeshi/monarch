/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths, so the build works from any folder (e.g. GitHub Pages).
  base: './',
  plugins: [react()],
  // Unit tests only; the browser tests in e2e/ run with Playwright.
  test: { include: ['src/**/*.test.ts'] },
})
