import { useMutation } from '@tanstack/react-query'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { DECAY_FREEZE_DAYS } from '@/lib/constants'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

// Protection Shield: freeze decay for 7 days.
// Server checks that the player owns a shield item and consumes it.
export function useFreezeDecay(walletAddress: string) {
  const updatePlayer      = usePlayerStore((s) => s.updatePlayer)
  const removeInventoryItem = usePlayerStore((s) => s.removeInventoryItem)

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/players/${walletAddress}/freeze-decay`, {
        method: 'POST',
      })
      if (res.status === 422) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'No Protection Shield in inventory')
      }
      if (!res.ok) throw new Error('Failed to activate Protection Shield')
      return res.json() as Promise<{ frozen_until: string; shield_item_id: string }>
    },
    onSuccess: ({ frozen_until, shield_item_id }) => {
      updatePlayer({ decay_frozen_until: frozen_until, decay_status: 'none' })
      removeInventoryItem(shield_item_id)
    },
  })
}

// Keep DECAY_FREEZE_DAYS in scope so imports stay consistent across the codebase.
export { DECAY_FREEZE_DAYS }
