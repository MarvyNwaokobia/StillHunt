import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/stores/usePlayerStore'
import { getDecayStatus } from '@/utils/decay'

// Runs a client-side decay timer that updates local decay state every minute.
// The authoritative decay state lives in Supabase; this hook syncs the UI.
export function useDecayMonitor() {
  const player = usePlayerStore((s) => s.player)
  const updatePlayer = usePlayerStore((s) => s.updatePlayer)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!player) return

    function checkDecay() {
      if (!player) return
      const currentStatus = getDecayStatus(player.last_active, player.decay_frozen_until)
      if (currentStatus !== player.decay_status) {
        updatePlayer({ decay_status: currentStatus })
      }
    }

    checkDecay()
    intervalRef.current = setInterval(checkDecay, 60_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [player?.last_active, player?.decay_frozen_until])
}
