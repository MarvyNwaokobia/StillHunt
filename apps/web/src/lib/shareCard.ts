/**
 * Public URL of a player's card — and their referral link.
 *
 * The `?ref=` is what ties a new signup back to whoever shared it. It rides on
 * the card rather than a separate invite code because the card already previews
 * as a picture of their warrior, which is a far better invite than a bare code.
 */
export function cardUrl(wallet: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://stillhunt.app'
  return `${origin}/card/${wallet}?ref=${wallet.toLowerCase()}`
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled'

/**
 * Share a player card the way the device expects.
 *
 * On a phone that means the native share sheet — WhatsApp, X, Messages — which
 * is where a card link is actually going. Copying to the clipboard and saying
 * "Copied!" leaves the player to find somewhere to paste it, which is a step
 * most people simply do not take.
 *
 * Falls back to the clipboard wherever the Web Share API is missing (every
 * desktop browser bar Safari).
 */
export async function shareCard(wallet: string, name?: string): Promise<ShareOutcome> {
  const url = cardUrl(wallet)
  const payload = {
    title: name ? `${name} · StillHunt` : 'StillHunt player card',
    text: name
      ? `${name} is fighting for real G$ on StillHunt.`
      : 'One human. One fighter. Earn real G$ on Celo.',
    url,
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (err) {
      // Dismissing the sheet is a decision, not a failure — falling back to a
      // silent clipboard write would override a choice the player just made.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
      // Anything else (permission, unsupported payload) still deserves the link.
    }
  }

  await navigator.clipboard.writeText(url)
  return 'copied'
}
