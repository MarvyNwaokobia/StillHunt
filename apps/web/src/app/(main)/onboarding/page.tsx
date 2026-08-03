'use client'

import { Suspense } from 'react'
import OnboardingPage from '@/views/OnboardingPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OnboardingPage />
    </Suspense>
  )
}
