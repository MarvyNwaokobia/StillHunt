import { Magic } from 'magic-sdk'
import { OAuthExtension } from '@magic-ext/oauth2'

// StillHunt runs on Celo mainnet in production (see NEXT_PUBLIC_GOODDOLLAR_ENV) —
// Magic's embedded wallet only ever talks to this one RPC, so there's no
// "wrong network" state to handle like with a bring-your-own-wallet flow.
export const CELO_CHAIN_ID = 42220
const CELO_RPC_URL = 'https://forno.celo.org'

// Must match the path registered in Google Cloud Console's authorized
// redirect URIs and Magic dashboard's "Allowed Origins & Redirects".
export const AUTH_CALLBACK_PATH = '/auth/callback'

function createMagic() {
  const apiKey = process.env.NEXT_PUBLIC_MAGIC_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_MAGIC_API_KEY is not set')
  return new Magic(apiKey, {
    network: { rpcUrl: CELO_RPC_URL, chainId: CELO_CHAIN_ID },
    extensions: [new OAuthExtension()],
  })
}

let instance: ReturnType<typeof createMagic> | null = null

// Magic's SDK reaches for `window` at construction time, so it can only be
// built client-side — every call site must already be inside 'use client'.
export function getMagic() {
  if (typeof window === 'undefined') return null
  if (!instance) instance = createMagic()
  return instance
}

/**
 * Is the Magic session actually able to sign RIGHT NOW?
 *
 * `isLoggedIn()` is not the same question as "the app thinks you're signed in".
 * On mobile Safari and in an installed PWA, ITP can evict Magic's storage while
 * the app still holds a cached address, leaving a session that reads as valid
 * but refuses to sign. Asking Magic directly, immediately before a signature, is
 * the only reliable check.
 */
export async function magicCanSign(): Promise<boolean> {
  const magic = getMagic()
  if (!magic) return false
  try {
    return await magic.user.isLoggedIn()
  } catch {
    return false
  }
}

/**
 * Turn a provider signing failure into something a player can act on.
 *
 * Magic reports a dead or unauthorised session as
 *   "Magic RPC Error: [-32603] Internal error: User denied account access"
 * which reads like the player refused a prompt they never saw. It is far more
 * often an evicted session — so name the likely cause and the remedy instead of
 * printing the SDK's stack.
 */
export function describeSigningError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)

  if (/user (denied|rejected)|account access|-32603/i.test(raw)) {
    return 'Your wallet session on this device could not sign. Sign out and back in, then try again.'
  }
  if (/user rejected|denied (the )?request|4001/i.test(raw)) {
    return 'Signature declined.'
  }
  return raw
}
