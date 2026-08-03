'use client'

import { Suspense } from 'react'
import BattlePage from '@/views/BattlePage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BattlePage />
    </Suspense>
  )
}
