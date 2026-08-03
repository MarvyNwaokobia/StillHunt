'use client'

import { Suspense } from 'react'
import AdminPage from '@/views/AdminPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AdminPage />
    </Suspense>
  )
}
