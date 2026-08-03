/**
 * Best-effort fullscreen. MUST NEVER throw or block the action that follows it —
 * on iPad Safari `document.documentElement.requestFullscreen()` can throw
 * SYNCHRONOUSLY (fullscreen isn't allowed on non-video elements there), and the old
 * `el.requestFullscreen().catch()` only caught async rejections, so the throw killed
 * the navigation right after it ("tapping Play does nothing" on iPad).
 *
 * This swallows both sync throws and async rejections and is a safe no-op on any
 * device that doesn't support it — so callers can always run their real action next.
 */
export function tryFullscreen(): void {
  try {
    if (typeof document === 'undefined' || document.fullscreenElement) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
    const p = req?.call(el);
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
  } catch {
    /* fullscreen not permitted on this device — ignore, never block the caller */
  }
}
