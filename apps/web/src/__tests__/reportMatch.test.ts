import { describe, it, expect, vi } from 'vitest'
import { reportPvpMatch } from '@/engine/sim/reportMatch'
import { GameRoom, type RoomPlayer } from '@/engine/sim/GameRoom'
import { NetMsgType, type MatchEndMsg, type InputStateMsg } from '@/engine/multiplayer/CombatProtocol'
import { setCover } from '@/engine/sim/Cover'

const matchEnd = (winnerId: string, loserId: string): MatchEndMsg => ({
  type: NetMsgType.MatchEnd,
  winnerId, loserId,
  winnerXP: 100, loserXP: 30, winnerGold: 0, loserGold: 0,
  stats: { totalDamageDealt: {}, longestCombo: {}, perfectRounds: [] },
})

const okFetch = () =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({
      battle_id: 'b1',
      winner: { wallet: '0xwin', xp_awarded: 100, ranked_up: true, new_rank: 'Silver', g_awarded: 20 },
      loser: { wallet: '0xlose', xp_awarded: 30, ranked_up: false, new_rank: null, g_awarded: 0 },
    }),
  })) as unknown as typeof fetch

describe('reportPvpMatch (PvP → economy bridge)', () => {
  it('posts the result to the server-only endpoint with the shared secret', async () => {
    const fetchImpl = okFetch()
    const res = await reportPvpMatch(matchEnd('0xWIN', '0xLOSE'), {
      apiUrl: 'http://api', secret: 's3cret', durationSecs: 42, fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('http://api/battles/pvp/complete')
    expect((init.headers as Record<string, string>)['x-pvp-secret']).toBe('s3cret')
    expect(JSON.parse(init.body as string)).toMatchObject({
      winner_wallet: '0xWIN', loser_wallet: '0xLOSE', duration_secs: 42,
    })
    expect(res?.battleId).toBe('b1')
    expect(res?.winner.gAwarded).toBe(20)
    expect(res?.winner.rankedUp).toBe(true)
  })

  it('returns null when the server rejects (e.g. bad secret)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    const res = await reportPvpMatch(matchEnd('0xA', '0xB'), {
      apiUrl: 'http://api', secret: 'wrong', durationSecs: 42, fetchImpl,
    })
    expect(res).toBeNull()
  })

  it('closes the loop: a real GameRoom MatchEnd produces the correct award payload', async () => {
    const P1: RoomPlayer = { id: 'p1', wallet: '0xAAA1', name: 'A', classId: 'berserker' }
    const P2: RoomPlayer = { id: 'p2', wallet: '0xBBB2', name: 'B', classId: 'phantom' }
    const room = new GameRoom('r', P1, P2)
    room.start()
    setCover([]) // isolate the PvP→economy path from cover line-of-sight

    let end: MatchEndMsg | null = null
    for (let i = 0; i < 3600 && !room.isOver; i++) {
      // p1 holds Fire (auto-fires on cadence); p2 idle → p1 wins.
      room.applyInput('p1', { type: NetMsgType.InputState, seq: i, timestamp: 0, moveX: 0, moveY: 0, rotation: 0, actions: ['fire'] } as InputStateMsg)
      const r = room.step()
      if (r.matchEnd) end = r.matchEnd
    }
    expect(end).toBeTruthy()

    const fetchImpl = okFetch()
    await reportPvpMatch(end!, { apiUrl: 'http://api', secret: 's', durationSecs: 30, fetchImpl })
    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.winner_wallet).toBe(P1.wallet) // the aggressor won, and that flows to the award
    expect(body.loser_wallet).toBe(P2.wallet)
  })
})
