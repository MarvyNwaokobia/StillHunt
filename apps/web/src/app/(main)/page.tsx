'use client'

import { Suspense } from 'react'
import HomePage from '@/views/HomePage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HomePage />
    </Suspense>
  )
}
