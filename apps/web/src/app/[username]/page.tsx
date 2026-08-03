import { redirect, notFound } from 'next/navigation'

/**
 * stillhunt.app/<username> — the vanity permalink printed on every player card.
 *
 * The card image (and the card page footer) shows `stillhunt.app/<username>`, so
 * anyone who screenshots a card and types what they see has to land somewhere.
 * Until this existed that URL 404'd, which made the line on the card a promise
 * the site did not keep.
 *
 * Resolves the name and redirects to the real card, carrying `?ref=` so a visitor
 * who arrives by typing the vanity link is attributed to that player exactly like
 * one who tapped a shared link (see middleware.ts).
 *
 * SAFETY OF A ROOT-LEVEL DYNAMIC SEGMENT: Next matches static routes first, so
 * /profile, /bank, /fight and friends are untouched — this only ever sees paths
 * nothing else claimed. Anything that cannot be a username (a filename, a wallet
 * address, the wrong length) is rejected before the lookup rather than turned
 * into an API call.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'

interface Resolved {
  wallet_address: string
}

export default async function UsernamePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const name = decodeURIComponent(username)

  // A wallet belongs on /card/<wallet>; send it there rather than looking it up
  // as a name it can never be.
  if (/^0x[a-fA-F0-9]{40}$/.test(name)) {
    redirect(`/card/${name}?ref=${name.toLowerCase()}`)
  }

  // Usernames are 3-20 chars (see check_username). A dot means a file request
  // that fell through, not a person.
  if (name.length < 3 || name.length > 20 || name.includes('.')) notFound()

  let wallet: string | null = null
  try {
    const res = await fetch(`${API}/players/by-username/${encodeURIComponent(name)}`, {
      // A player's card should reflect them now, and this is only a redirect
      // lookup — caching it would pin a name to a wallet past a rename.
      cache: 'no-store',
    })
    if (res.ok) wallet = ((await res.json()) as Resolved).wallet_address
  } catch {
    wallet = null
  }

  if (!wallet) notFound()

  redirect(`/card/${wallet}?ref=${wallet.toLowerCase()}`)
}
