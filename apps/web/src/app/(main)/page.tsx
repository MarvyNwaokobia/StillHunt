'use client'

import { Suspense } from 'react'
import CampPage from '@/views/CampPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CampPage />
    </Suspense>
  )
}
