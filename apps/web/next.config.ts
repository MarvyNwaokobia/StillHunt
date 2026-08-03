import type { NextConfig } from 'next'
import path from 'path'
import withSerwistInit from '@serwist/next'

const nextConfig: NextConfig = {
  transpilePackages: ['@goodsdks/citizen-sdk', '@goodsdks/engagement-sdk'],
  // Build marker so we can confirm at a glance which build a device is running
  // (mobile browsers cache aggressively). Refreshed on every build/deploy.
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString().slice(5, 16).replace('T', ' '),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Supabase SDK's complex template literal type inference breaks under
    // moduleResolution:bundler — queries work correctly at runtime.
    // Run `npx tsc --noEmit` to see remaining type warnings.
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // wagmi v3's tempo/Connectors.js has a dynamic `import('accounts')` for the
    // Tempo Wallet devtools connector — this module doesn't exist outside wagmi's
    // own monorepo. Alias it to a stub so webpack doesn't fail the build.
    //
    // `@wagmi/connectors`' porto() connector (also unused — StillHunt only wires up
    // injected(), but the package barrel pulls every connector in) drags in
    // `porto`, whose
    // internal modules import `zod/mini`, an export path this repo's pinned zod
    // version doesn't expose. Same fix: alias the whole package out.
    config.resolve.alias = {
      ...config.resolve.alias,
      accounts: path.resolve(__dirname, 'src/lib/stub/accounts.ts'),
      porto$: path.resolve(__dirname, 'src/lib/stub/porto.ts'),
      'porto/internal': path.resolve(__dirname, 'src/lib/stub/porto.ts'),
    }
    return config
  },
}

// Serwist wraps the config to compile src/app/sw.ts → public/sw.js and inject
// the SW registration script. `register: true` (default) auto-registers on the
// client. Disabled in dev so the SW doesn't cache the dev server aggressively.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist(nextConfig)
