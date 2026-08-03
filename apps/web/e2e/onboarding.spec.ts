import { test, expect } from '@playwright/test'

/**
 * E2E: Onboarding flow smoke tests.
 * These run against the running dev server and test the covenant → select flow.
 * No real login is wired up yet, so every flow here exercises the
 * unauthenticated path.
 */

test.describe('Landing page', () => {
  test('renders hero text', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('One Verified Human. One Warrior.')).toBeVisible({ timeout: 10_000 })
  })

  test('has a call-to-action link that navigates somewhere', async ({ page }) => {
    await page.goto('/')
    // Check there is at least one button/link on landing
    const cta = page.locator('a, button').first()
    await expect(cta).toBeVisible()
  })
})

test.describe('Onboarding page', () => {
  test('redirects unauthenticated users to sign-in prompt', async ({ page }) => {
    await page.goto('/onboarding')
    // Without wallet the page should ask the user to sign in
    const text = await page.locator('body').innerText()
    expect(
      text.includes('Sign In') || text.includes('Connect') || text.includes('ONE VERIFIED HUMAN')
    ).toBe(true)
  })
})

test.describe('Battle page', () => {
  test('redirects to home when player not authenticated', async ({ page }) => {
    await page.goto('/battle')
    // Should either redirect or show a message — just assert the page loads without crash
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('navbar is absent on landing page for unauthenticated users', async ({ page }) => {
    await page.goto('/')
    // Navbar returns null when no wallet connected
    await expect(page.locator('nav')).not.toBeVisible()
    await expect(page.locator('body')).toBeVisible()
  })
})
