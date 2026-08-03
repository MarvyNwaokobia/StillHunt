import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RankBadge from '@/components/player-card/RankBadge'
import { RANK_DEFINITIONS } from '@/lib/ranks'
import type { Rank } from '@/types/database'

const RANKS: Rank[] = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']

describe('RankBadge', () => {
  it.each(RANKS)('renders %s label text', (rank) => {
    render(<RankBadge rank={rank} />)
    expect(screen.getByText(RANK_DEFINITIONS[rank].label)).toBeTruthy()
  })

  it('applies drop-shadow filter at Gold+', () => {
    const { container: goldContainer } = render(<RankBadge rank="Gold" />)
    const badge = goldContainer.firstChild as HTMLElement
    expect(badge.style.filter).toContain('drop-shadow')
  })

  it('does not apply filter at Bronze/Silver', () => {
    const { container: bronzeContainer } = render(<RankBadge rank="Bronze" />)
    const badge = bronzeContainer.firstChild as HTMLElement
    expect(badge.style.filter).toBeFalsy()
  })
})
