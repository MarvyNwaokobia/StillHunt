import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Player, InventoryItem } from '@/types'

interface PlayerState {
  player: Player | null
  inventory: InventoryItem[]
  isVerified: boolean
  playerSynced: boolean
  syncFailed: boolean
  setPlayer: (player: Player) => void
  updatePlayer: (updates: Partial<Player>) => void
  setInventory: (inventory: InventoryItem[]) => void
  addInventoryItem: (item: InventoryItem) => void
  removeInventoryItem: (itemId: string) => void
  toggleEquip: (itemId: string) => void
  setVerified: (verified: boolean) => void
  setPlayerSynced: (synced: boolean) => void
  setSyncFailed: (failed: boolean) => void
  clearPlayer: () => void
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      player: null,
      inventory: [],
      isVerified: false,
      playerSynced: false,
      syncFailed: false,

      setPlayer: (player) => set({ player }),
      updatePlayer: (updates) =>
        set((state) => ({
          player: state.player ? { ...state.player, ...updates } : null,
        })),
      // Coerced, not trusted. `inventory` is read straight into render by
      // MarketplaceItem, ProfilePage, LoadoutModal and useBattle, all of which
      // call .map/.some/.filter on it — so a non-array here is not a bad value,
      // it is a TypeError during render, which React escalates to the route
      // error boundary and the player sees as "Something broke".
      //
      // It arrives from `await res.json()` on a 200. Any response that is
      // shaped like {"error": ...} rather than a list — a proxy error page, a
      // truncated body, an API returning a message with the wrong status —
      // slips through a `?? []` guard untouched, because it is neither null nor
      // undefined. Then persist writes it to localStorage and every reload
      // rehydrates the same crash.
      setInventory: (inventory) => set({ inventory: Array.isArray(inventory) ? inventory : [] }),
      addInventoryItem: (item) =>
        set((state) => ({ inventory: [...state.inventory, item] })),
      removeInventoryItem: (itemId) =>
        set((state) => ({ inventory: state.inventory.filter((i) => i.item_id !== itemId) })),
      toggleEquip: (itemId) =>
        set((state) => ({
          inventory: state.inventory.map((i) =>
            i.item_id === itemId ? { ...i, equipped: !i.equipped } : i,
          ),
        })),
      setVerified: (isVerified) => set({ isVerified }),
      setPlayerSynced: (playerSynced) => set({ playerSynced }),
      setSyncFailed: (syncFailed) => set({ syncFailed }),
      clearPlayer: () => set({ player: null, inventory: [], isVerified: false, playerSynced: false, syncFailed: false }),
    }),
    {
      name: 'stillhunt-player',
      // Cache the player + inventory so a RETURNING user (same wallet) sees their
      // real dashboard INSTANTLY instead of staring at a loader while the (cold-
      // starting) API responds. It's safe to route from because usePlayerSync clears
      // this cache the moment the signed-in wallet doesn't match it (a switched/new
      // wallet), and a reconstructed player is still sent to confirm-your-class by
      // its character_confirmed flag. The server sync always refreshes it in the
      // background. `playerSynced`/`syncFailed` are intentionally NOT persisted so a
      // fresh load always re-verifies with the server.
      partialize: (state) => ({
        isVerified: state.isVerified,
        player: state.player,
        inventory: state.inventory,
      }),

      // Rehydration must be TOTAL: whatever is in localStorage, the store comes
      // back in a shape the app can render.
      //
      // It was not. Anything persisted under this key was trusted as-is, so a
      // `player` missing `wallet_address` made usePlayerSync throw on
      // `cachedPlayer.wallet_address.toLowerCase()` — in the effect body, which
      // React reports to the route error boundary as "Something broke". And
      // because the bad value is in localStorage, reloading rehydrates it and
      // throws again, so the retry button cannot clear it. That is the
      // intermittent, sticky crash.
      //
      // localStorage gets into that state without anyone doing anything wrong:
      // the persisted shape changes between releases while an old blob survives,
      // and iOS can kill a tab mid-write and leave a truncated record.
      //
      // `version` handles the honest schema bump; this validation handles
      // everything else, since a corrupt blob carries whatever version it was
      // written with. A cache is not worth a crash — anything that fails to
      // convince us is dropped, and the server sync refills it moments later.
      version: 1,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PlayerState>
        const player =
          saved.player && typeof saved.player.wallet_address === 'string' && saved.player.wallet_address
            ? saved.player
            : null
        return {
          ...current,
          ...saved,
          player,
          // A non-array here would throw the moment anything mapped over it.
          inventory: Array.isArray(saved.inventory) ? saved.inventory : [],
          isVerified: Boolean(saved.isVerified),
        }
      },
    },
  ),
)
