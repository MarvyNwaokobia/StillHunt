'use client'

import { useDisconnect } from 'wagmi'
import { useMagicAuthContext } from '@/components/providers/MagicAuthProvider'
import { useResolvedAuth } from './useResolvedAuth'
import { usePlayerStore } from '@/stores/usePlayerStore'

// Signs out through whichever path is active — Magic's logout for the
// embedded-wallet path, wagmi's disconnect for a connected external wallet — then
// ALWAYS lands on the StillHunt landing page ('/'), signed out, ready to sign in again.
//
// The hard navigation (window.location, not router.push) is deliberate: it fully
// tears down the app so no authenticated page (Profile / Bank / Marketplace) is
// left mounted without a session. That half-torn-down state — the current page
// re-rendering with a null player right after logout — was what threw the
// "application error" when you signed out from anywhere but Home.
export function useSignOut() {
  const { source } = useResolvedAuth()
  const { logout } = useMagicAuthContext()
  const { disconnect } = useDisconnect()
  const clearPlayer = usePlayerStore((s) => s.clearPlayer)

  return async () => {
    try {
      if (source === 'wallet') disconnect()
      else await logout()
    } catch {
      // Sign out locally + redirect regardless of provider errors.
    } finally {
      clearPlayer() // reset the cached player/inventory so '/' shows the signed-out landing
      if (typeof window !== 'undefined') window.location.assign('/')
    }
  }
}
