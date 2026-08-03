'use client'

import { Suspense } from 'react'
import MarketplacePage from '@/views/MarketplacePage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MarketplacePage />
    </Suspense>
  )
}
