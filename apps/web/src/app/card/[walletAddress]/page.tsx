import type { Metadata } from 'next'
import { Suspense } from 'react'
import PlayerCardPage from '@/views/PlayerCardPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

/**
 * Server component ON PURPOSE. It used to be `'use client'`, which meant the
 * route could not export generateMetadata — so every shared card link carried
 * the generic site title, whatever player it pointed at. The card itself stays
 * a client component; only the metadata moved up here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ walletAddress: string }>
}): Promise<Metadata> {
  const { walletAddress } = await params

  let name: string | null = null
  let rank: string | null = null
  try {
    const res = await fetch(`${API}/players/${walletAddress.toLowerCase()}`, {
      cache: 'no-store',
    })
    if (res.ok) {
      const p = (await res.json()) as {
        character_name?: string
        username?: string | null
        rank?: string
      }
      name = p.username || p.character_name || null
      rank = p.rank ?? null
    }
  } catch {
    // A card for a player we cannot load still deserves a sane title.
  }

  const title = name ? `${name} · ${rank ?? 'Warrior'} · StillHunt` : 'StillHunt Player Card'
  const description = name
    ? `${name} is fighting for real TALLY on StillHunt. See their rank, record and loadout.`
    : 'One human. One fighter. Earn real TALLY on Celo.'

  return {
    title,
    description,
    // The image itself comes from opengraph-image.tsx in this folder; Next wires
    // it up automatically. These make the text around it player-specific too.
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PlayerCardPage />
    </Suspense>
  )
}
