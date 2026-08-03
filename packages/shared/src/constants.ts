export const RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'] as const
export const PLAY_STYLES = ['Wanderer', 'Fighter', 'Champion'] as const

export const RANK_G_REWARD: Record<string, number> = {
  Bronze: 10,
  Silver: 20,
  Gold: 40,
  Platinum: 80,
  Diamond: 150,
}

export const XP_PER_RANK = 1000
export const XP_WIN = 100
export const XP_LOSS = 30
export const XP_IDLE_COLLECT = 50
export const DAILY_CLAIM_G = 5

export const BATTLE_ROUNDS = 5
export const MISSION_DURATION_MS = 30 * 60 * 1000
export const DECAY_WARNING_HOURS = 48
export const DECAY_PENALIZE_HOURS = 72
export const DECAY_FREEZE_DAYS = 7

export const G_TOKEN_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A'
export const CELO_CHAIN_ID = 42220
export const CELO_ALFAJORES_CHAIN_ID = 44787
