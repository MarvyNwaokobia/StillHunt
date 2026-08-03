'use client'

import { Suspense } from 'react'
import BankPage from '@/views/BankPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BankPage />
    </Suspense>
  )
}
