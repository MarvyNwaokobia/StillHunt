'use client';
import MarketplaceItem from '@/components/marketplace/MarketplaceItem';
import { GUN_ITEM_ID } from '@/lib/guns';
import { GUN_CATALOG } from '@/engine/combat/GunStats';
import type { Item } from '@/types';

/** Dev preview of the weapon CARDS, including the season-limited state. */
const PRICES: Record<string, number> = {
  smg: 450, assault_rifle: 1200, marksman: 2700, legendary: 6000,
  ashfall_carbine: 3000, warden_repeater: 4500, rift_lance: 6500, seraph_lmg: 8000, ember_halo: 10000,
};
const RARITY: Record<string, string> = {
  smg: 'common', assault_rifle: 'rare', marksman: 'epic', legendary: 'legendary',
  ashfall_carbine: 'epic', warden_repeater: 'epic', rift_lance: 'legendary',
  seraph_lmg: 'legendary', ember_halo: 'legendary',
};

function mk(gun: string, endsAt: string | null): Item {
  const g = GUN_CATALOG[gun as keyof typeof GUN_CATALOG];
  return {
    id: GUN_ITEM_ID[gun as keyof typeof GUN_ITEM_ID], name: g.name,
    description: `${g.damage} dmg · ${g.fireRate} rpm · ${g.magazine} rounds`,
    rarity: RARITY[gun], category: 'weapon', stat_boost: g.damage, price_g: PRICES[gun],
    image_url: '', total_supply: null, remaining_supply: null,
    weapon_stats: { slot: 'primary', tier: g.tier },
    ...(endsAt ? { sale_ends_at: endsAt } : {}),
  } as unknown as Item;
}
const ITEMS = Object.keys(PRICES).map((g) => mk(g, g === 'ember_halo' ? '2026-07-27T22:59:00Z' : null));

export default function DevShop() {
  return (
    <div style={{ minHeight: '100vh', background: '#04030c', padding: 20 }}>
      <p style={{ color: '#eab308', fontSize: 11, letterSpacing: 3, fontWeight: 700, marginBottom: 12 }}>WEAPON CARDS</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {ITEMS.map((i) => <MarketplaceItem key={i.id} item={i} walletAddress={undefined} />)}
      </div>
    </div>
  );
}
