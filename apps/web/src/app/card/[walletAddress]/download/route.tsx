import { renderCardPortrait } from '../cardPortrait'

/**
 * GET /card/:wallet/download — the card as a portrait PNG.
 *
 * Portrait, not the 1200x630 link preview: a download is going to be posted as a
 * picture, and a wide banner is neither what the player sees on screen nor what
 * reads as "their card".
 *
 * NO Content-Disposition. On iOS an attachment hands the file to the Files
 * app — "Open in iRAR" — instead of the image viewer, so there is no way to get
 * it into Photos. Served as a plain inline image, the client can fetch it as a
 * blob and hand it to the share sheet, which is the only route to "Save Image"
 * on a phone (see PlayerCardPage.downloadCard).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ walletAddress: string }> },
) {
  const { walletAddress } = await params
  const image = await renderCardPortrait(walletAddress)

  const headers = new Headers(image.headers)
  headers.set('Content-Type', 'image/png')
  // The card changes as the player plays, so a long cache would hand someone a
  // stale record. Short cache keeps repeat taps cheap without freezing it.
  headers.set('Cache-Control', 'public, max-age=60')

  return new Response(image.body, { status: image.status, headers })
}
