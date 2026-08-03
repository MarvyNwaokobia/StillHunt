'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { EIP1193Provider } from 'viem'
import { getMagic, AUTH_CALLBACK_PATH } from '@/lib/magic'
import { setBridgedProvider, clearBridgedProvider } from '@/lib/walletBridge'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

export type ResolvedAuthStatus = 'loading' | 'unauthenticated' | 'ready'

interface MagicAuthState {
  status: ResolvedAuthStatus
  address: `0x${string}` | undefined
  // Login identity — same person can hold >1 wallet (email vs Google, Safari-ITP),
  // so we surface these to store per-wallet and detect multi-account cases.
  email: string | undefined
  issuer: string | undefined
}

interface MagicAuthContextValue extends MagicAuthState {
  loginWithEmailOTP: (email: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const MagicAuthContext = createContext<MagicAuthContextValue | null>(null)

export function useMagicAuthContext() {
  const ctx = useContext(MagicAuthContext)
  if (!ctx) throw new Error('useMagicAuthContext must be used within MagicAuthProvider')
  return ctx
}

interface ResolvedIdentity {
  address: `0x${string}` | undefined
  email: string | undefined
  issuer: string | undefined
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Reject rather than hang for ever: a provider call that never settles would
 *  otherwise pin the whole app on `status: 'loading'`.
 *
 *  The timer is cleared once the race settles. Leaving it armed fires a rejection
 *  into a promise nobody is listening to any more, and an unhandled rejection per
 *  probe is noise we would then have to explain away while hunting real faults. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

/**
 * Can this session actually produce an account to sign with?
 *
 * `isLoggedIn()` does not answer that. On mobile Safari and in an installed PWA,
 * ITP evicts Magic's storage while leaving enough behind to report a live
 * session; the app looks signed in and then fails at the first signature with
 * "-32603 User denied account access", at the exact moment the player tries to
 * spend money. Asking the provider for an account is the cheap proof.
 *
 * RETRIED, because one failed call is not proof of a dead session. The provider
 * talks to an iframe that may not have booted on first paint, over a network
 * that may blip, on phones that throttle background frames. Treating any single
 * failure as fatal turned every transient hiccup into a forced sign-out — which
 * is exactly what players hit as an intermittent "Sign in to buy" on a session
 * they had never left.
 */
async function canSign(magic: NonNullable<ReturnType<typeof getMagic>>): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const accounts = (await withTimeout(
        (magic.rpcProvider as unknown as {
          request: (a: { method: string }) => Promise<string[]>
        }).request({ method: 'eth_accounts' }),
        4000,
      )) ?? []
      if (accounts.length) return true
    } catch {
      // Fall through and try again — see above.
    }
    if (attempt < 2) await sleep(400 * (attempt + 1))
  }
  return false
}

async function resolveIdentity(): Promise<ResolvedIdentity> {
  const magic = getMagic()
  if (!magic) return { address: undefined, email: undefined, issuer: undefined }
  const loggedIn = await magic.user.isLoggedIn()
  if (!loggedIn) return { address: undefined, email: undefined, issuer: undefined }

  // Deliberately does NOT log the user out when this fails.
  //
  // Destroying the session was the original response, and it made a temporary
  // fault permanent: a player whose provider blipped once was signed out for
  // real and had to log in again, when simply reloading would have recovered a
  // perfectly good session. Reporting "signed out" for this render is enough —
  // if the session really is dead the player signs in again, and if it was only
  // unreachable the next refresh picks it straight back up.
  if (!(await canSign(magic))) {
    return { address: undefined, email: undefined, issuer: undefined }
  }

  const info = await magic.user.getInfo()
  const address = info.wallets?.ethereum?.publicAddress
  return {
    address: address ? (address as `0x${string}`) : undefined,
    email: info.email ?? undefined,
    issuer: info.issuer ?? undefined,
  }
}

export function MagicAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MagicAuthState>({ status: 'loading', address: undefined, email: undefined, issuer: undefined })

  const refresh = useCallback(async () => {
    try {
      const { address, email, issuer } = await resolveIdentity()
      // Publish to the bridge only now that Magic has actually resolved an
      // address. Everything that signs reads the provider from there, so
      // publishing any earlier would hand out a client for a session that
      // isn't real yet.
      const magic = getMagic()
      if (address && magic) {
        setBridgedProvider('magic', magic.rpcProvider as unknown as EIP1193Provider, address)
      } else {
        clearBridgedProvider('magic')
      }
      setState({ status: address ? 'ready' : 'unauthenticated', address, email, issuer })
      // Best-effort backfill so returning users' login identity is captured too. The
      // endpoint only UPDATEs an existing row, so it's a no-op until onboarding creates one.
      if (address && (email || issuer)) {
        void fetch(`${API}/players/${address.toLowerCase()}/identity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, issuer }),
        }).catch(() => {})
      }
    } catch {
      clearBridgedProvider('magic')
      setState({ status: 'unauthenticated', address: undefined, email: undefined, issuer: undefined })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loginWithEmailOTP = useCallback(async (email: string) => {
    const magic = getMagic()
    if (!magic) return
    await magic.auth.loginWithEmailOTP({ email, showUI: true })
    await refresh()
  }, [refresh])

  const loginWithGoogle = useCallback(async () => {
    const magic = getMagic()
    if (!magic) return
    // Redirects away from the page — resolution happens on AUTH_CALLBACK_PATH.
    await magic.oauth2.loginWithRedirect({
      provider: 'google',
      redirectURI: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
    })
  }, [])

  const logout = useCallback(async () => {
    const magic = getMagic()
    if (!magic) return
    await magic.user.logout()
    // Scoped to 'magic' so signing out of Magic can never retract a provider
    // published by another SDK.
    clearBridgedProvider('magic')
    setState({ status: 'unauthenticated', address: undefined, email: undefined, issuer: undefined })
  }, [])

  return (
    <MagicAuthContext.Provider value={{ ...state, loginWithEmailOTP, loginWithGoogle, logout, refresh }}>
      {children}
    </MagicAuthContext.Provider>
  )
}
