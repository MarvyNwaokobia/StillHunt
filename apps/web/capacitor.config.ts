import type { CapacitorConfig } from '@capacitor/cli'

/**
 * StillHunt native shell (Capacitor).
 *
 * StillHunt's web app is fully server-rendered (`export const dynamic = 'force-dynamic'`),
 * so it CANNOT be statically exported and bundled. Instead the native app loads the
 * live site inside its own WebView container. Two consequences, both good:
 *   1. The WebView has its OWN storage jar, separate from Safari/Chrome — so Magic
 *      auth + the wallet aren't wiped by iOS Safari's ITP eviction (our worst bug).
 *   2. Every web deploy is instantly live in the app; no re-submission for content.
 *
 * `webDir` is only an offline fallback shell — at runtime `server.url` wins.
 *
 * For LOCAL testing against a dev server, temporarily point `server.url` at your
 * machine's LAN address (e.g. http://192.168.x.x:3000) with `cleartext: true`.
 */
const config: CapacitorConfig = {
  appId: 'app.stillhunt',
  appName: 'StillHunt',
  webDir: 'capacitor/www',
  server: {
    url: 'https://stillhunt.app',
    cleartext: false,
    // Keep OAuth (Magic / Google), WalletConnect and RPC navigations INSIDE the app
    // WebView rather than bouncing to the system browser (which would break the
    // redirect back into the app). Refine this list during real-device testing.
    allowNavigation: [
      'stillhunt.app',
      '*.stillhunt.app',
      '*.magic.link',
      '*.google.com',
      'accounts.google.com',
      '*.walletconnect.com',
      '*.walletconnect.org',
      '*.celo.org',
      '*.gooddollar.org',
    ],
  },
  ios: {
    // Let the web app own the safe-area insets (it already does via env(safe-area-*)).
    contentInset: 'never',
    backgroundColor: '#04030c',
  },
  android: {
    backgroundColor: '#04030c',
  },
}

export default config
