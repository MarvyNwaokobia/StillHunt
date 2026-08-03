'use client';
import OperationsSelect from '@/components/battle/OperationsSelect';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { Player } from '@/types';

/** Dev preview of the campaign list. ?cleared=15 shows the unlocked Endless entry. */
function Inner() {
  const cleared = Number(useSearchParams().get('cleared') ?? 15);
  const player = { wallet_address: '0x0', pve_level: cleared, rank: 'Iron', xp: 0 } as unknown as Player;
  return <div style={{ background: '#04030c', minHeight: '100vh' }}><OperationsSelect player={player} onBack={() => {}} /></div>;
}
export default function DevOps() {
  return <Suspense><Inner /></Suspense>;
}
