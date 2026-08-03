'use client'

import { Suspense } from 'react'
import DuelsPage from '@/views/DuelsPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DuelsPage />
    </Suspense>
  )
}
