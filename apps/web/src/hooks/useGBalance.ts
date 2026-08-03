import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { G_TOKEN_ADDRESS } from '@/lib/constants'

const BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

export function useGBalance(address: `0x${string}` | undefined) {
  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: G_TOKEN_ADDRESS,
    abi: BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      // Refresh every 30s — balance only changes on purchase/claim
      staleTime: 30_000,
      refetchInterval: 30_000,
    },
  })

  const balance = rawBalance ? parseFloat(formatUnits(rawBalance as bigint, 18)) : null
  const formatted = balance === null
    ? null
    : balance >= 1000
      ? `${(balance / 1000).toFixed(1)}k`
      : balance.toFixed(2)

  return { balance, formatted, isLoading, refetch }
}
