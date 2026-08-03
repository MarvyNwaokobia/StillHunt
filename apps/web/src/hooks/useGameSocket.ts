'use client'

import { useEffect, useRef, useCallback, useReducer } from 'react'
import type { Player } from '@/types'

// ── Public types ──────────────────────────────────────────────────────────────

export type ActionType = 'attack' | 'block' | 'special'
export type AnimState  = ActionType | 'idle' | 'hit' | 'death'

export interface OpponentInfo {
  wallet: string
  name:   string
  class:  string
}

export type MatchPhase = 'idle' | 'queuing' | 'countdown' | 'fighting' | 'result'

export interface ActionEvent {
  attacker:     'player' | 'opponent'
  action:       ActionType
  was_blocked:  boolean
  damage:       number
  player_hp:    number
  opponent_hp:  number
}

export interface MatchResult {
  winner:    'player' | 'opponent'
  reason:    'hp_zero' | 'timeout' | 'disconnect'
  xp_earned: number
  g_earned:  number
}

export interface GameState {
  phase:         MatchPhase
  roomId:        string | null
  opponent:      OpponentInfo | null
  playerHp:      number
  opponentHp:    number
  countdown:     number
  lastAction:    ActionEvent | null
  result:        MatchResult | null
  queuePosition: number
  error:         string | null
  playerAnim:    AnimState
  opponentAnim:  AnimState
}

// ── Reducer ───────────────────────────────────────────────────────────────────

type Msg =
  | { t: 'QUEUE_START' }
  | { t: 'QUEUED';       position: number }
  | { t: 'MATCH_FOUND';  roomId: string; opponent: OpponentInfo; countdown: number }
  | { t: 'COUNTDOWN';    value: number }
  | { t: 'FIGHT_START' }
  | { t: 'ACTION';       event: ActionEvent }
  | { t: 'END';          result: MatchResult }
  | { t: 'RESET' }
  | { t: 'ERROR';        message: string }
  | { t: 'PANIM';        anim: AnimState }
  | { t: 'OANIM';        anim: AnimState }

const INIT: GameState = {
  phase: 'idle', roomId: null, opponent: null,
  playerHp: 100, opponentHp: 100, countdown: 3,
  lastAction: null, result: null, queuePosition: 0,
  error: null, playerAnim: 'idle', opponentAnim: 'idle',
}

function reduce(s: GameState, a: Msg): GameState {
  switch (a.t) {
    case 'QUEUE_START': return { ...INIT, phase: 'queuing' }
    case 'QUEUED':      return { ...s, queuePosition: a.position }
    case 'MATCH_FOUND': return { ...s, phase: 'countdown', roomId: a.roomId, opponent: a.opponent, countdown: a.countdown }
    case 'COUNTDOWN':   return { ...s, countdown: a.value }
    case 'FIGHT_START': return { ...s, phase: 'fighting', playerHp: 100, opponentHp: 100 }
    case 'ACTION':      return { ...s, lastAction: a.event, playerHp: a.event.player_hp, opponentHp: a.event.opponent_hp }
    case 'END':         return { ...s, phase: 'result', result: a.result }
    case 'RESET':       return INIT
    case 'ERROR':       return { ...s, error: a.message }
    case 'PANIM':       return { ...s, playerAnim: a.anim }
    case 'OANIM':       return { ...s, opponentAnim: a.anim }
    default:            return s
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGameSocket(player: Player, walletAddress: string) {
  const [state, dispatch] = useReducer(reduce, INIT)
  const ws        = useRef<WebSocket | null>(null)
  const timers    = useRef<ReturnType<typeof setTimeout>[]>([])
  const stateRef  = useRef(state)
  stateRef.current = state

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    const apiUrl    = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
    const wsUrl     = apiUrl.replace(/^http/, 'ws')
    const socket    = new WebSocket(`${wsUrl}/ws/battle`)
    ws.current      = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type:         'queue',
        wallet:       walletAddress,
        name:         player.character_name,
        player_class: player.character_class,
        attack:       player.attack_stat,
        defense:      player.defense_stat,
        speed:        player.speed_stat,
      }))
      dispatch({ t: 'QUEUE_START' })
    }

    socket.onmessage = (e) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(e.data as string) }
      catch { return }

      switch (msg.type) {

        case 'queued':
          dispatch({ t: 'QUEUED', position: (msg.position as number) ?? 1 })
          break

        case 'match_found': {
          const opp = msg.opponent as OpponentInfo
          dispatch({ t: 'MATCH_FOUND', roomId: msg.room_id as string, opponent: opp, countdown: msg.countdown as number ?? 3 })
          // drive the countdown locally
          let count = (msg.countdown as number) ?? 3
          const tick = setInterval(() => {
            count -= 1
            if (count <= 0) {
              clearInterval(tick)
            } else {
              dispatch({ t: 'COUNTDOWN', value: count })
            }
          }, 1000)
          break
        }

        case 'fight_start':
          dispatch({ t: 'FIGHT_START' })
          break

        case 'action_result': {
          const ev: ActionEvent = {
            attacker:    msg.attacker    as 'player' | 'opponent',
            action:      msg.action      as ActionType,
            was_blocked: msg.was_blocked as boolean,
            damage:      msg.damage      as number,
            player_hp:   msg.player_hp   as number,
            opponent_hp: msg.opponent_hp as number,
          }
          dispatch({ t: 'ACTION', event: ev })

          clearTimers()
          if (ev.attacker === 'player') {
            dispatch({ t: 'PANIM', anim: ev.action })
            const t1 = setTimeout(() => dispatch({ t: 'OANIM', anim: ev.damage > 0 ? 'hit' : 'idle' }), 280)
            const t2 = setTimeout(() => { dispatch({ t: 'PANIM', anim: 'idle' }); dispatch({ t: 'OANIM', anim: 'idle' }) }, 1300)
            timers.current = [t1, t2]
          } else {
            dispatch({ t: 'OANIM', anim: ev.action })
            const t1 = setTimeout(() => dispatch({ t: 'PANIM', anim: ev.damage > 0 ? 'hit' : 'idle' }), 280)
            const t2 = setTimeout(() => { dispatch({ t: 'PANIM', anim: 'idle' }); dispatch({ t: 'OANIM', anim: 'idle' }) }, 1300)
            timers.current = [t1, t2]
          }
          break
        }

        case 'match_end': {
          clearTimers()
          const result: MatchResult = {
            winner:    msg.winner    as 'player' | 'opponent',
            reason:    msg.reason    as MatchResult['reason'],
            xp_earned: msg.xp_earned as number ?? 0,
            g_earned:  msg.g_earned  as number ?? 0,
          }
          if (result.winner === 'opponent') {
            dispatch({ t: 'PANIM', anim: 'death' })
          } else {
            dispatch({ t: 'OANIM', anim: 'death' })
          }
          const t = setTimeout(() => dispatch({ t: 'END', result }), 1600)
          timers.current = [t]
          break
        }

        case 'opponent_disconnected':
          clearTimers()
          dispatch({ t: 'END', result: { winner: 'player', reason: 'disconnect', xp_earned: 50, g_earned: 0 } })
          break

        case 'error':
          dispatch({ t: 'ERROR', message: msg.message as string })
          break
      }
    }

    socket.onclose = () => {
      const cur = stateRef.current
      if (cur.phase === 'fighting' || cur.phase === 'queuing') {
        dispatch({ t: 'ERROR', message: 'Connection lost.' })
        dispatch({ t: 'RESET' })
      }
    }

    socket.onerror = () => {
      dispatch({ t: 'ERROR', message: 'Could not connect to battle server.' })
    }
  }, [walletAddress, player])

  const sendAction = useCallback((action: ActionType) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return
    const { phase, roomId } = stateRef.current
    if (phase !== 'fighting' || !roomId) return
    ws.current.send(JSON.stringify({ type: 'action', room_id: roomId, action }))
  }, [])

  const disconnect = useCallback(() => {
    clearTimers()
    ws.current?.close()
    ws.current = null
    dispatch({ t: 'RESET' })
  }, [])

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimers()
    ws.current?.close()
  }, [])

  return { state, connect, sendAction, disconnect }
}
