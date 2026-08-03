'use client'

import { Suspense } from 'react'
import ProfilePage from '@/views/ProfilePage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ProfilePage />
    </Suspense>
  )
}
