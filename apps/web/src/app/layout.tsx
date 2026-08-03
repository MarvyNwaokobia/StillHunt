import type { Metadata } from 'next'
import { Providers } from './providers'
import { NoZoom } from '@/components/NoZoom'
import { InstallPrompt } from '@/components/InstallPrompt'
import './globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'StillHunt · One human. One warrior.',
  description: 'StillHunt · One human. One warrior. Fight, earn real G$, own everything. Built on GoodDollar + Celo.',
  icons: {
    icon: [
      { url: '/hunt-icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/hunt-icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/hunt-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/hunt-icon.png', sizes: '512x512', type: 'image/png' },
    ],
    // apple-touch-icon lives in the literal <head> below, not here.
  },
  // NOTE: manifest / appleWebApp / apple-mobile-web-app-capable are NOT declared
  // here. Next streams this metadata export and appends it to <body>, and iOS
  // only honours those tags from <head> — so they are hardcoded into the <head>
  // below instead. See the comment there.
  other: {
    'talentapp:project_verification':
      'e533deb2e7132258b7993c84b2458f36a8fc8ab5f6d32a6aa25347ff61d284cc4ac8c09a6d18ae09bca77bac5a74a0532044156c3bd622df5d9780f3d5889125',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,       // lock zoom — STILLHUNT is a fullscreen game, not a document
  userScalable: false,   // a stray double-tap / pinch mid-fight must not zoom the HUD
  viewportFit: 'cover',
  themeColor: '#04030c',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* ── iOS PWA tags, deliberately hand-written into <head> ────────────
            These cannot go through the `metadata` export. Next 15 streams
            metadata for dynamic routes and appends the resulting tags to the
            END OF <body>, not <head> — Next even ships an `IconMark` script
            that hoists `link[rel=icon]` and `link[rel=apple-touch-icon]` back
            into <head> afterwards, but it hoists nothing else.

            iOS reads `apple-mobile-web-app-capable` and `rel=manifest` from
            <head> only. Left in <body> they are silently ignored, so "Add to
            Home Screen" produced a plain Safari bookmark — it opened with the
            browser chrome instead of launching standalone, which is what made
            the PWA look broken on iPhone while working on Android.

            Anything below that iOS needs at install time must stay in this
            literal <head>. After a Next upgrade, re-check that these tags are
            still served inside <head> and not appended to <body>:
              curl -s https://stillhunt.app/ | head -c 3000 */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="StillHunt" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NoZoom />
        <Providers>{children}</Providers>
        <InstallPrompt />
      </body>
    </html>
  )
}
