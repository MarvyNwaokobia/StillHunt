export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Rank = 'Iron' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Emerald' | 'Diamond'
export type PlayStyle = 'Wanderer' | 'Fighter' | 'Champion'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type ItemCategory = 'weapon' | 'shield' | 'booster' | 'cosmetic' | 'ammo' | 'attachment' | 'gear'
export type CharacterClass = 'Berserker' | 'Sentinel' | 'Phantom' | 'Warden' | 'Specter' | 'Vanguard'
export type BattleMove = 'attack' | 'defend' | 'special'

export interface Database {
  public: {
    Tables: {
      players: {
        Row: Player
        Insert: Omit<Player, 'created_at'>
        Update: Partial<Omit<Player, 'wallet_address' | 'created_at'>>
        Relationships: []
      }
      items: {
        Row: Item
        Insert: Omit<Item, 'id'>
        Update: Partial<Omit<Item, 'id'>>
        Relationships: []
      }
      inventory: {
        Row: InventoryItem
        Insert: InventoryItem
        Update: Partial<Pick<InventoryItem, 'equipped'>>
        Relationships: []
      }
      battles: {
        Row: Battle
        Insert: Omit<Battle, 'id' | 'created_at'>
        Update: Partial<Omit<Battle, 'id' | 'created_at'>>
        Relationships: []
      }
      missions: {
        Row: Mission
        Insert: Omit<Mission, 'id'>
        Update: Partial<Pick<Mission, 'collected' | 'item_dropped' | 'xp_awarded'>>
        Relationships: []
      }
      achievements: {
        Row: Achievement
        Insert: Achievement
        Update: Partial<Achievement>
        Relationships: []
      }
      player_achievements: {
        Row: PlayerAchievement
        Insert: PlayerAchievement
        Update: Partial<PlayerAchievement>
        Relationships: []
      }
      daily_claims: {
        Row: DailyClaim
        Insert: DailyClaim
        Update: Pick<DailyClaim, 'last_claimed_at'>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      check_and_unlock_achievements: {
        Args: { p_wallet: string }
        Returns: Json[]
      }
      [fnName: string]: {
        Args: Record<string, unknown>
        Returns: unknown
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export interface CharacterCustomization {
  skin?: string       // hex color or preset key
  hair?: string
  outfit?: string     // item id or preset key
  weapon?: string
  accessories?: string[]
  gender?: 'male' | 'female'
}

export interface Player {
  wallet_address: string

  // Identity
  username: string | null
  display_name: string | null

  // Character
  character_class: CharacterClass | null
  character_customization: CharacterCustomization
  avatar: string                               // legacy emoji, kept for compat
  character_name: string
  play_style: PlayStyle

  // Progression
  rank: Rank
  xp: number
  attack_stat: number
  defense_stat: number
  speed_stat: number
  g_earned_lifetime: number
  wins: number
  losses: number
  pve_level: number                            // highest PvE Campaign level cleared (0 = none)
  prestige_level?: number                      // 0 until past Diamond; then Diamond I, II, III…
  character_confirmed?: boolean                // false for chain-reconstructed players → confirm-class

  // Decay
  last_active: string
  decay_status: 'none' | 'warning' | 'active'
  decay_frozen_until: string | null

  // On-chain proof
  character_claim_tx: string | null

  created_at: string
}

export interface Item {
  id: string
  on_chain_id: number | null   // uint256 ID in the smart contract — null until item is registered on-chain
  name: string
  description: string
  rarity: Rarity
  category: ItemCategory
  stat_boost: number
  /** Price in whole TALLY. */
  price: number
  image_url: string
  layer_type: 'outfit' | 'weapon' | 'accessory' | 'hair' | null
  layer_asset_url: string | null
  total_supply: number | null
  remaining_supply: number | null
  weapon_stats: Record<string, unknown> | null
}

export interface InventoryItem {
  wallet_address: string
  item_id: string
  equipped: boolean
  acquired_at: string
}

export interface RoundData {
  round: number
  challenger_move: BattleMove
  opponent_move: BattleMove
  challenger_damage: number
  opponent_damage: number
  challenger_hp_remaining: number
  opponent_hp_remaining: number
}

export interface Battle {
  id: string
  challenger_wallet: string
  opponent_wallet: string
  winner_wallet: string | null
  rounds_data: RoundData[]
  xp_awarded_challenger: number
  xp_awarded_opponent: number
  is_bot: boolean
  created_at: string
}

export interface Mission {
  id: string
  wallet_address: string
  deployed_at: string
  collect_by: string
  collected: boolean
  item_dropped: string | null
  xp_awarded: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  condition: string
  image_url: string
}

export interface PlayerAchievement {
  wallet_address: string
  achievement_id: string
  unlocked_at: string
}

export interface DailyClaim {
  wallet_address: string
  last_claimed_at: string
}
