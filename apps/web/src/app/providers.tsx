'use client'

import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { MagicAuthProvider } from '@/components/providers/MagicAuthProvider'
import { Web3AuthSessionProvider } from '@/components/providers/Web3AuthSessionProvider'
import AppInit from './app-init'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 2,
          },
        },
      }),
  )

  return (
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {/* Two independent embedded-wallet SDKs. Neither blocks the other:
              each publishes to lib/walletBridge on its own schedule, and
              useResolvedAuth takes whichever has actually resolved. */}
          <MagicAuthProvider>
            <Web3AuthSessionProvider>
              <AppInit />
              {children}
            </Web3AuthSessionProvider>
          </MagicAuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  )
}
