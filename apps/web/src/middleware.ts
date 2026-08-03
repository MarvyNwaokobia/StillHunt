import { NextResponse, type NextRequest } from 'next/server'

/**
 * Referral capture.
 *
 * Any request carrying `?ref=<wallet>` writes a first-party cookie, on ANY
 * route, so a shared card link attributes even if the visitor wanders off to the
 * landing page before signing up.
 *
 * Why a SERVER-set cookie rather than localStorage: Safari's ITP caps anything
 * JavaScript writes — localStorage and document.cookie alike — at 7 days, and
 * the slowest-converting visitors are exactly the ones who lose it. A cookie set
 * in the response is not subject to that cap. It also survives the Magic/Google
 * sign-in round trip, because the user returns to this same origin and the
 * cookie is still attached.
 *
 * Deliberately NOT httpOnly: onboarding is client-side and has to read this to
 * pre-fill the "who invited you" field. There is no secret here — a referrer
 * address is public, and the server re-validates it before paying anyone.
 */
export const REFERRAL_COOKIE = 'stillhunt_ref'

const WALLET = /^0x[a-fA-F0-9]{40}$/
const NINETY_DAYS = 60 * 60 * 24 * 90

export function middleware(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  const res = NextResponse.next()

  if (!ref || !WALLET.test(ref)) return res

  // First writer wins. Someone who followed A's link a week ago and B's link
  // today is A's referral — overwriting would let the most recent sharer take
  // credit for a decision that was already made.
  if (req.cookies.get(REFERRAL_COOKIE)) return res

  res.cookies.set(REFERRAL_COOKIE, ref.toLowerCase(), {
    maxAge: NINETY_DAYS,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}

export const config = {
  // Everything except Next internals and static assets — a ref can arrive on any
  // page, and an image request has nothing to capture.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.png$|.*\\.ogg$|.*\\.mp3$).*)'],
}
