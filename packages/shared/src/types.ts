export type Rank = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond'
export type PlayStyle = 'Wanderer' | 'Fighter' | 'Champion'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type ItemCategory = 'weapon' | 'shield' | 'booster'
export type BattleMove = 'attack' | 'defend' | 'special'
export type DecayStatus = 'none' | 'warning' | 'active'

export interface PlayerDTO {
  wallet_address: string
  play_style: PlayStyle
  avatar: string
  character_name: string
  rank: Rank
  xp: number
  attack_stat: number
  defense_stat: number
  speed_stat: number
  g_earned_lifetime: number
  last_active: string
  decay_status: DecayStatus
  decay_frozen_until: string | null
  wins: number
  losses: number
  created_at: string
}

export interface ItemDTO {
  id: string
  name: string
  description: string
  rarity: Rarity
  category: ItemCategory
  stat_boost: number
  price_g: number
  image_url: string
  total_supply: number | null
  remaining_supply: number | null
}

export interface RoundDataDTO {
  round: number
  challenger_move: BattleMove
  opponent_move: BattleMove
  challenger_damage: number
  opponent_damage: number
  challenger_hp_remaining: number
  opponent_hp_remaining: number
}

export interface BattleResultDTO {
  won: boolean
  xp_awarded: number
  rounds: RoundDataDTO[]
  new_xp: number
  battle_id: string
}

export interface CollectResultDTO {
  item_dropped: string | null
  xp: number
}

export interface LeaderboardEntryDTO {
  wallet_address: string
  character_name: string
  avatar: string
  rank: Rank
  xp: number
  g_earned_lifetime: number
  wins: number
  losses: number
  position: number
}
