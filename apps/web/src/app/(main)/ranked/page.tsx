'use client'

import { Suspense } from 'react'
import RankedPage from '@/views/RankedPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RankedPage />
    </Suspense>
  )
}
