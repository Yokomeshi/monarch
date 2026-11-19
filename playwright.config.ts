import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // The 3D view is software-rendered here, so the longer tests need more than the default 30 s.
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // 1280 plus the 280 px inspector column, so the canvas stays 1000 px wide: wider than tall, 36 px per metre in Top view.
    viewport: { width: 1560, height: 800 },
    trace: 'off',
    // Software WebGL, so the 3D view renders the same with or without a GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
