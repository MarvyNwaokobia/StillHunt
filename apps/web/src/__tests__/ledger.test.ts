import { describe, it, expect } from 'vitest'
import {
  CONTRACTS, LEDGER_LENGTH, ZONE_META, getContract, zoneMeta, zoneOf,
  nextContract, isCleared, isLocked, contractsTaken, bossTrophies,
  zoneBoss, zoneProgress, zoneReached,
} from '@/lib/ledger'
import { CAMPAIGN } from '@/engine/fps/campaign'

describe('CONTRACTS ↔ campaign parity', () => {
  it('mirrors the campaign one-for-one, in order', () => {
    expect(CONTRACTS).toHaveLength(CAMPAIGN.length)
    CONTRACTS.forEach((c, i) => {
      expect(c.op).toBe(i)
      expect(c.id).toBe(CAMPAIGN[i].id)
      expect(c.name).toBe(CAMPAIGN[i].name)
      expect(c.zone).toBe(CAMPAIGN[i].zone)
      expect(c.isBoss).toBe(CAMPAIGN[i].boss === true)
    })
  })

  // The whole point of `op` is that it is the value /fight?op= takes and the value
  // pve_level counts. If it ever drifts from the array index, the board sends players
  // into the wrong mission — silently, because a valid index still boots something.
  it('op is the zero-based campaign index', () => {
    expect(CONTRACTS[0].op).toBe(0)
    expect(getContract(0)?.id).toBe(CAMPAIGN[0].id)
    expect(getContract(LEDGER_LENGTH - 1)?.id).toBe(CAMPAIGN[CAMPAIGN.length - 1].id)
  })

  it('every contract carries a name and a brief', () => {
    for (const c of CONTRACTS) {
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.brief.length).toBeGreaterThan(0)
    }
  })

  it('reads past the end as undefined rather than wrapping', () => {
    expect(getContract(LEDGER_LENGTH)).toBeUndefined()
    expect(getContract(-1)).toBeUndefined()
  })
})

describe('zones', () => {
  it('every zone the campaign uses has display copy', () => {
    const used = new Set(CAMPAIGN.map((m) => m.zone))
    for (const key of used) {
      expect(ZONE_META.some((z) => z.key === key)).toBe(true)
    }
  })

  it('every contract resolves to its zone metadata', () => {
    for (const c of CONTRACTS) {
      expect(zoneOf(c).key).toBe(c.zone)
    }
  })

  it('falls back rather than throwing on an unknown zone', () => {
    expect(zoneMeta('NOWHERE').name).toBe('Unknown')
  })

  it('every zone ends on a boss', () => {
    for (const z of ZONE_META) {
      const ops = CONTRACTS.filter((c) => c.zone === z.key)
      expect(ops.length).toBeGreaterThan(0)
      expect(ops[ops.length - 1].isBoss).toBe(true)
      expect(zoneBoss(z.key)?.op).toBe(ops[ops.length - 1].op)
    }
  })
})

describe('nextContract', () => {
  it('a new hunter is offered the first op', () => {
    expect(nextContract(0)?.op).toBe(0)
    expect(nextContract(0)?.id).toBe(CAMPAIGN[0].id)
  })

  it('pve_level is the index of the next op', () => {
    expect(nextContract(4)?.op).toBe(4)
    expect(nextContract(9)?.op).toBe(9)
  })

  it('runs out once the Ledger is cleared', () => {
    expect(nextContract(LEDGER_LENGTH)).toBeUndefined()
    expect(nextContract(LEDGER_LENGTH + 25)).toBeUndefined()
  })
})

describe('cleared / locked', () => {
  const first = CONTRACTS[0]
  const third = CONTRACTS[2]

  it('counts an op as cleared once pve_level passes its index', () => {
    expect(isCleared(first, 0)).toBe(false)
    expect(isCleared(first, 1)).toBe(true)
    expect(isCleared(first, 9)).toBe(true)
  })

  it('locks anything beyond the next open contract', () => {
    expect(isLocked(first, 0)).toBe(false)  // the open one
    expect(isLocked(third, 0)).toBe(true)   // two out — face-down
    expect(isLocked(third, 1)).toBe(true)   // op 2 is next; op 3 still face-down
    expect(isLocked(third, 2)).toBe(false)  // now next
  })

  it('never reports a contract as both cleared and locked', () => {
    for (let pve = 0; pve <= LEDGER_LENGTH; pve++) {
      for (const c of CONTRACTS) {
        expect(isCleared(c, pve) && isLocked(c, pve)).toBe(false)
      }
    }
  })
})

describe('trophies', () => {
  it('the wall is empty for a new hunter', () => {
    expect(contractsTaken(0)).toHaveLength(0)
    expect(bossTrophies(0)).toHaveLength(0)
  })

  it('fills as ops clear', () => {
    expect(contractsTaken(5)).toHaveLength(5)
    expect(bossTrophies(5)).toHaveLength(1)   // Ashfall's boss is op index 4
    expect(bossTrophies(10)).toHaveLength(2)
  })

  it('clearing the Ledger takes one boss per zone', () => {
    expect(bossTrophies(LEDGER_LENGTH)).toHaveLength(ZONE_META.length)
  })
})

describe('zoneProgress / zoneReached', () => {
  it('clamps to the zone rather than bleeding across zones', () => {
    const [ashfall, proving] = ZONE_META
    const ashfallOps = CONTRACTS.filter((c) => c.zone === ashfall.key).length
    expect(zoneProgress(ashfall.key, ashfallOps)).toEqual({ cleared: ashfallOps, total: ashfallOps })
    expect(zoneProgress(proving.key, ashfallOps).cleared).toBe(0)
  })

  it('never exceeds the zone total once well past it', () => {
    for (const z of ZONE_META) {
      const { cleared, total } = zoneProgress(z.key, 999)
      expect(cleared).toBe(total)
    }
  })

  it('only the first zone is reached at the start', () => {
    expect(zoneReached(ZONE_META[0].key, 0)).toBe(true)
    expect(zoneReached(ZONE_META[1].key, 0)).toBe(false)
    expect(zoneReached(ZONE_META[2].key, 0)).toBe(false)
  })
})
