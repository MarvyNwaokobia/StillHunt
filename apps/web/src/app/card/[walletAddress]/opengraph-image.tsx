import { CARD_IMAGE_SIZE, renderCardImage } from './cardImage'

/**
 * Social preview for a player card.
 *
 * A card link is only worth sharing if it arrives as a picture of the player's
 * warrior. Pasted into WhatsApp or X without this, /card/0x… rendered as the
 * generic site title and nothing else — which is the difference between a link
 * that gets opened and one that gets ignored.
 *
 * Rendered on the server per request, so it always reflects the player's CURRENT
 * rank and record rather than a snapshot baked at build time. The picture itself
 * lives in ./cardImage so the downloadable file and this preview cannot drift.
 */
export const size = CARD_IMAGE_SIZE
export const contentType = 'image/png'
export const alt = 'StillHunt player card'

export default async function Image({
  params,
}: {
  params: Promise<{ walletAddress: string }>
}) {
  const { walletAddress } = await params
  return renderCardImage(walletAddress)
}
