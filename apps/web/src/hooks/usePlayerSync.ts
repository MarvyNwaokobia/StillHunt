import { useEffect } from 'react'
import { usePlayerStore } from '@/stores/usePlayerStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
const TIMEOUT_MS = 10_000

function fetchWithTimeout(url: string, signal: AbortSignal) {
  return fetch(url, { signal })
}

export function usePlayerSync(address: string | undefined) {
  const { setPlayer, setInventory, clearPlayer, setPlayerSynced, setVerified, setSyncFailed } = usePlayerStore()

  useEffect(() => {
    if (!address) {
      clearPlayer()
      return
    }

    // Always lowercase — wagmi returns EIP-55 checksummed addresses but
    // the DB stores them normalized (lowercase) via normalize_wallet on the backend.
    const wallet = address.toLowerCase()

    // Guard: Clear cached player immediately if it belongs to a different wallet
    // Optional-chained on purpose. This runs in the effect BODY, outside the
    // try below, so a missing wallet_address here does not fail the sync — it
    // takes down the whole route through the error boundary. The store now
    // validates on rehydrate so this should be unreachable; it stays because
    // the cost of being wrong about that is a crash, and the cost of the guard
    // is one character.
    const cachedPlayer = usePlayerStore.getState().player
    if (cachedPlayer && cachedPlayer.wallet_address?.toLowerCase() !== wallet) {
      clearPlayer()
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    async function sync() {
      try {
        const [playerRes, inventoryRes] = await Promise.all([
          fetchWithTimeout(`${API}/players/${wallet}`, controller.signal),
          fetchWithTimeout(`${API}/players/${wallet}/inventory`, controller.signal),
        ])

        if (playerRes.ok) {
          const player = await playerRes.json()
          if (player && player.wallet_address.toLowerCase() === wallet) {
            setPlayer(player)
            setVerified(true)
            setSyncFailed(false)
          } else {
            clearPlayer()
          }
        } else if (playerRes.status === 404) {
          clearPlayer()
          setSyncFailed(false)
        } else {
          setSyncFailed(true)
        }

        if (inventoryRes.ok) {
          const inventory = await inventoryRes.json()
          // `?? []` only ever caught null/undefined. A 200 carrying an object
          // instead of a list went straight into the store — see setInventory.
          setInventory(Array.isArray(inventory) ? inventory : [])
        }

      } catch {
        setSyncFailed(true)
      } finally {
        clearTimeout(timeoutId)
        setPlayerSynced(true)
      }
    }

    sync()

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [address, setPlayer, setInventory, clearPlayer, setPlayerSynced, setVerified, setSyncFailed])
}
