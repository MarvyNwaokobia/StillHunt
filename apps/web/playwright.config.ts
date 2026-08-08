import { defineConfig, devices } from '@playwright/test'

/**
 * The dev server's port, overridable.
 *
 * `reuseExistingServer` means Playwright will happily adopt WHATEVER is already
 * listening on this port — including an unrelated project — and then every spec
 * fails with a 404 that looks like a broken route rather than a wrong server.
 * Set E2E_PORT to run beside something else.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // SwiftShader is fill-rate bound, and the 3D scene at 1280x720 renders about
        // one frame every ten seconds — slow enough that a walking test looks like a
        // wall. Every pixel dropped here buys frames back.
        viewport: { width: 800, height: 450 },
        // Software GL, or the WebGL context never comes up headlessly: the canvas
        // stays black AND r3f's frame loop never ticks, so anything that drives the
        // game (movement, objectives, the sim clock) silently does nothing while the
        // page still looks alive. Tests then fail as "the player didn't move" when
        // the truth is the game never ran a frame.
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
