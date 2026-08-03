'use client'

import { Suspense } from 'react'
import LeaderboardPage from '@/views/LeaderboardPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LeaderboardPage />
    </Suspense>
  )
}
