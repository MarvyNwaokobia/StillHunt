import { test, expect, type Page } from '@playwright/test'

/**
 * E2E: the walk in (engine/fps/approach.ts).
 *
 * This is the playtest the unit tests cannot do. approach.test.ts proves the maths
 * agrees with itself; this proves the maths reached the running game — that the
 * player really spawns outside, the compound really is asleep, the gate is really
 * open, and the HUD really stops pointing at the door.
 *
 * Driven through the scene's own probe hooks (`window.__hunt*`), which exist for
 * exactly this. /fight plays signed-out — the server calls are graceful no-ops — so
 * no auth is needed.
 */

const OP = 0                       // BREACH & CLEAR, layout A
const AUTHORED_START_Z = 16        // mission.start for layout A
const APPROACH_LEN = 20            // fps/approach.ts
const SPAWN_Z = AUTHORED_START_Z + APPROACH_LEN

interface Probe {
  player: { x: number; z: number }
  enemies: { room: number; active: boolean; alive: boolean }[]
  mission: { objective: number; total: number; briefing: boolean }
  hud: { objective: string; objectiveShown: boolean; markerShown: boolean }
}

async function boot(page: Page): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`/fight?op=${OP}`)
  // The scene mounts async (heavy chunk + GLB warm), so wait for the probes.
  await page.waitForFunction(
    () => typeof (window as unknown as Record<string, unknown>).__huntPlayer === 'function',
    null,
    { timeout: 90_000 },
  )
  await page.evaluate(() => (window as never as { __huntSkipBriefing: () => void }).__huntSkipBriefing())
  // Let a few frames run so the HUD has been written at least once.
  await page.waitForTimeout(600)
  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const w = window as never as Record<string, () => unknown>
    const snap = w.__huntState() as { enemies: { room: number; active: boolean; alive: boolean }[] }
    return {
      player: w.__huntPlayer() as { x: number; z: number },
      enemies: snap.enemies,
      mission: w.__huntMission() as { objective: number; total: number; briefing: boolean },
      hud: w.__huntHud() as { objective: string; objectiveShown: boolean; markerShown: boolean },
    }
  })
}

/**
 * Hold W until `done` or the deadline. Headless SwiftShader runs the frame loop at a
 * small fraction of real-time and the rate varies per machine, so every movement
 * assertion here polls to a deadline rather than sleeping for a guessed duration.
 */
async function walkForward(
  page: Page,
  done: (p: Probe) => boolean,
  deadlineMs = 150_000,
): Promise<number> {
  // Click the TRUE centre. The scene captures the mouse on first click and turns the
  // player toward it, so an off-centre click silently rotates them and W then walks
  // diagonally into a wall — which reads exactly like a broken gate.
  const vp = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.mouse.click(vp.width / 2, vp.height / 2)
  await page.keyboard.down('w')
  const until = Date.now() + deadlineMs
  let last = (await probe(page)).player.z
  let strafe: 'a' | 'd' = 'd'
  try {
    while (Date.now() < until) {
      await page.waitForTimeout(2000)
      const p = await probe(page)
      if (done(p)) return p.player.z
      const outside = p.player.z > 17.5
      if (outside && Math.abs(p.player.x) > 0.4) {
        // Still short of the rear wall: the gate is only GATE_W wide, so steer back
        // onto its centreline rather than stepping sideways into the wall.
        const back = p.player.x > 0 ? 'a' : 'd'
        await page.keyboard.down(back)
        await page.waitForTimeout(700)
        await page.keyboard.up(back)
      } else if (!outside && Math.abs(p.player.z - last) < 0.15) {
        // Inside the yard and stalled: walking dead-straight into a crate stops the
        // player, because slideMove has no lateral component to slide along. Step
        // around it the way a person would, alternating sides so a corner cannot trap
        // the walk.
        await page.keyboard.down(strafe)
        await page.waitForTimeout(1500)
        await page.keyboard.up(strafe)
        strafe = strafe === 'd' ? 'a' : 'd'
      }
      last = p.player.z
    }
  } finally {
    await page.keyboard.up('w')
  }
  return last
}

test.describe('the walk in', () => {
  test('the player starts outside the compound, not at the door', async ({ page }) => {
    await boot(page)
    const p = await probe(page)
    // The whole point: spawn is APPROACH_LEN behind the authored start.
    expect(p.player.z).toBeGreaterThan(AUTHORED_START_Z + APPROACH_LEN - 2)
    expect(p.player.z).toBeLessThan(SPAWN_Z + 2)
  })

  test('the compound is asleep — nothing is awake during the approach', async ({ page }) => {
    await boot(page)
    const p = await probe(page)
    expect(p.enemies.length).toBeGreaterThan(0)
    expect(p.enemies.filter((e) => e.active)).toHaveLength(0)
    // And the op has not started advancing on its own.
    expect(p.mission.objective).toBe(0)
  })

  test('the objective reads as prose, with no distance to navigate by', async ({ page }) => {
    await boot(page)
    const p = await probe(page)
    expect(p.hud.objective.length).toBeGreaterThan(0)
    // A metre readout would let the player walk in watching a number.
    expect(p.hud.objective).not.toMatch(/\d+\s*M\b/i)
    expect(p.hud.objective.toUpperCase()).toContain('COMPOUND')
  })

  test('the player can WALK through the gate, not just teleport through it', async ({ page }) => {
    await boot(page)
    // This must drive the real movement path. An earlier version used __huntWarp,
    // which sets the position directly and skips collision entirely — it passed
    // against a compound whose gate was open in the renderer and solid in the
    // collider set, and the player walked into a wall with a doorway in front of them.
    const start = (await probe(page)).player.z
    const z = await walkForward(page, (p) => p.player.z < 17.5)

    expect(z, 'the player never moved — is the WebGL context up?').toBeLessThan(start - 5)
    // z = 18.2 is the rear wall. Past it means the gate is genuinely walkable.
    expect(z, 'stuck at the rear wall — the gate is not in the colliders').toBeLessThan(17.5)
  })

  test('breaching wakes the front room and brings the marker back', async ({ page }) => {
    await boot(page)
    // Warping is legitimate HERE and not in the test above. That one exists to prove
    // the gate is solid-free in the COLLIDER set, so it has to move the player the
    // real way. This one is about the breach TRANSITION, and the walk it would
    // otherwise repeat is already covered — so it skips the 27m trudge, which at
    // headless SwiftShader frame rates takes longer than any sane timeout.
    for (const z of [30, 24, 20, 16, 12, 9, 8.5]) {
      await page.evaluate((zz) => (window as never as { __huntWarp: (x: number, z: number) => void }).__huntWarp(0, zz), z)
      await page.waitForTimeout(400)
    }
    await page.waitForFunction(
      () => ((window as never as Record<string, () => { objective: number }>).__huntMission().objective) > 0,
      null,
      { timeout: 60_000 },
    )

    const p = await probe(page)
    expect(p.mission.objective, 'never breached').toBeGreaterThan(0)
    expect(p.enemies.some((e) => e.active), 'front room stayed asleep').toBe(true)
    // The marker comes back the moment the approach ends.
    expect(p.hud.objective, 'objective line still reads as the approach')
      .not.toBe('THE COMPOUND IS UP THE ROAD. WALK IT.')
  })
})
