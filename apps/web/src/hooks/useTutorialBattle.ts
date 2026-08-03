'use client'

import { useState } from 'react'
import type { Player, BattleMove } from '@/types'
import type { BattlePhase, BattleRoundResult, BattleResultState } from './useBattle'

// Scripted tutorial bot moves — teaches core mechanics through play, not tooltips
const TUTORIAL_SCRIPT: BattleMove[] = ['attack', 'defend', 'attack', 'attack', 'defend']

// Hints keyed by round (1-indexed) — shown BEFORE the player picks their move
export interface TutorialHint {
  round: number
  text: string
  targetMove: BattleMove | null  // button to highlight
}

export const TUTORIAL_HINTS: TutorialHint[] = [
  { round: 1, text: 'Pick an action. Attack deals damage, Defend halves what you take.', targetMove: null },
  { round: 2, text: 'The enemy is defending — your attack deals half damage. Try a different angle.', targetMove: 'special' },
  { round: 3, text: 'Heavy strike incoming. Use Defend to cut the damage in half.', targetMove: 'defend' },
  { round: 4, text: "Now's your moment — unleash your Special ability.", targetMove: 'special' },
  { round: 5, text: 'Final round. Finish this.', targetMove: 'attack' },
]

function tutorialDamage(attack: number, defense: number, isSpecial: boolean, opponentDefending: boolean): number {
  const base    = isSpecial ? 40 : 20
  const statMod = 1 + (attack - defense) * 0.01
  const defMult = opponentDefending ? 0.5 : 1
  // Tutorial bot deals 50% less — player always survives
  return Math.max(1, Math.round(base * statMod * defMult))
}

export function useTutorialBattle(player: Player) {
  const [phase,       setPhase]       = useState<BattlePhase>('idle')
  const [playerHp,    setPlayerHp]    = useState(100)
  const [botHp,       setBotHp]       = useState(100)
  const [round,       setRound]       = useState(1)
  const [log,         setLog]         = useState<BattleRoundResult[]>([])
  const [specialUsed, setSpecialUsed] = useState(false)
  const [result,      setResult]      = useState<BattleResultState | null>(null)

  const botStats = { attack: 8, defense: 8 }

  function startBattle() {
    setPhase('fighting')
    setPlayerHp(100)
    setBotHp(100)
    setRound(1)
    setLog([])
    setSpecialUsed(false)
    setResult(null)
  }

  function handleMove(move: BattleMove) {
    if (phase !== 'fighting') return
    if (move === 'special' && specialUsed) return
    if (move === 'special') setSpecialUsed(true)

    const botMove      = TUTORIAL_SCRIPT[round - 1] ?? 'attack'
    const playerDmg    = tutorialDamage(player.attack_stat, botStats.defense, move === 'special', botMove === 'defend')
    // Bot does 50% damage — tutorial is forgiving
    const botDmgFull   = tutorialDamage(botStats.attack, player.defense_stat, botMove === 'special', move === 'defend')
    const botDmg       = Math.round(botDmgFull * 0.5)

    const newBotHp    = Math.max(0, botHp    - playerDmg)
    const newPlayerHp = Math.max(0, playerHp - botDmg)

    const entry: BattleRoundResult = {
      round, playerMove: move, botMove,
      playerDmg, botDmg, playerHp: newPlayerHp, botHp: newBotHp,
    }

    const newLog = [...log, entry]
    setLog(newLog)
    setPlayerHp(newPlayerHp)
    setBotHp(newBotHp)

    const isLast = round >= 5 || newBotHp <= 0 || newPlayerHp <= 0

    if (isLast) {
      setPhase('result')
      setResult({
        won:       true,   // tutorial always results in a win for narrative
        xpAwarded: 50,
        newXp:     player.xp + 50,
        rankedUp:  false,
        newRank:   null,
        gAwarded:  0,
        rounds:    newLog,
      })
    } else {
      setRound(r => r + 1)
    }
  }

  function reset() {
    setPhase('idle')
    setResult(null)
  }

  return { phase, playerHp, botHp, round, log, specialUsed, result, startBattle, handleMove, reset }
}
