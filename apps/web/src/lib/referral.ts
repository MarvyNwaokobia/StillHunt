'use client'

/**
 * Referral attribution, client side.
 *
 * Three layers, because no single one survives every path a shared link takes:
 *
 *   1. the `?ref=` in the URL            — right now, this tab
 *   2. a server-set cookie (middleware)  — survives ITP's 7-day cap on anything
 *                                          JS writes, and the Google sign-in
 *                                          round trip
 *   3. localStorage                      — covers the installed PWA, which has
 *                                          its own storage jar separate from
 *                                          Safari's
 *
 * None of them survive a click on a phone followed by a signup on a laptop.
 * That case is recovered by the "who invited you" field in onboarding, which is
 * pre-filled from whatever these layers found — the storage problem becomes a UI
 * problem, and the UI one is solvable.
 */

const KEY = 'stillhunt_ref'
const WALLET = /^0x[a-fA-F0-9]{40}$/

function fromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${KEY}=`))
  return hit ? decodeURIComponent(hit.slice(KEY.length + 1)) : null
}

/** Mirror the referrer into localStorage. The cookie is the durable copy; this
 *  is what an installed PWA can still see. */
export function rememberReferrer(ref: string): void {
  if (!WALLET.test(ref)) return
  try {
    // First writer wins, matching the middleware — whoever's link was followed
    // first keeps the credit.
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, ref.toLowerCase())
  } catch {
    /* private mode / storage disabled — the cookie still covers it */
  }
}

/** The referrer to attribute a new signup to, or null. */
export function getReferrer(): string | null {
  if (typeof window === 'undefined') return null

  const url = new URLSearchParams(window.location.search).get('ref')
  if (url && WALLET.test(url)) {
    rememberReferrer(url)
    return url.toLowerCase()
  }

  const cookie = fromCookie()
  if (cookie && WALLET.test(cookie)) {
    rememberReferrer(cookie)
    return cookie.toLowerCase()
  }

  try {
    const stored = localStorage.getItem(KEY)
    if (stored && WALLET.test(stored)) return stored.toLowerCase()
  } catch {
    /* nothing more to try */
  }
  return null
}

/** Clear attribution once it has been spent on a signup. */
export function clearReferrer(): void {
  try {
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.cookie = `${KEY}=; Max-Age=0; path=/`
  }
}
