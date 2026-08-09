/**
 * @module fps/contracts
 * @description Standing contracts — a new compound every time, from a seed.
 *
 * THE PROBLEM. The campaign is fifteen hand-authored compounds, and there are three
 * layouts between them. Once you have cleared the Ledger there is nothing left to
 * play but the same rooms again, and "repeatable work" built on those rooms is
 * repeatable in the worst sense: the same corners, the same angles, the same fight.
 *
 * THE MATERIAL ALREADY EXISTED. fps/endless.ts generates rooms deterministically
 * from a seed — five interior cover archetypes, varying depth, doorways punched at
 * varying offsets, defenders held to the far half so every breach gives you a beat
 * to read the room. It has only ever been used for the ENDLESS chain, which streams
 * forever and therefore has no objectives and no way to finish.
 *
 * This turns that generator into a finite compound: build N rooms up front, cap the
 * back, and synthesise the objective chain the campaign machinery already knows how
 * to run. The result is an ordinary Mission, so everything downstream — the walk in,
 * the dormant compound, the road dressing, the HUD, breach/clear/extract — works on
 * it unchanged. Nothing in the scene needs to know a contract was generated.
 *
 * EXTRACTION IS THE WAY YOU CAME. A generated compound has no authored extract
 * point, and inventing one deep in the chain would end the contract at its furthest
 * corner. Instead the last objective walks you back out through rooms you have
 * already cleared, to the gate you entered by. That is the beat the design has been
 * missing: you have the payout on you, and you still have to leave with it.
 *
 * Deterministic in the seed: the same contract id builds the same compound for every
 * player, which is what lets a contract be shared, leaderboarded, or re-run fairly.
 */

import type { Mission } from './campaign';
import type { CoverBox, EnemySpec } from './FpsSim';
import {
  buildChain, entryCap, spawnPointFor, seedFromString, mulberry32,
  CHAIN_START_Z, ROOM_W, WALL_T, type GeneratedRoom,
} from './endless';

/** How many rooms a standing contract runs. Short — this is a six-minute job. */
export const CONTRACT_ROOMS_MIN = 2;
export const CONTRACT_ROOMS_MAX = 4;

/** Zones a contract can be set in. Each carries its own lighting, fog and tint
 *  (campaign.ZONE_THEMES), so the same generated layout reads as a different place. */
export const CONTRACT_ZONES = ['ASHFALL', 'PROVING GROUND', 'THE RIFT'] as const;
export type ContractZone = (typeof CONTRACT_ZONES)[number];

export interface ContractSpec {
  /** Stable id. The compound is a pure function of this, so the same id is the
   *  same job for everybody. */
  id: string;
  /** Override the room count. Otherwise derived from the seed. */
  rooms?: number;
  /** Override the zone. Otherwise derived from the seed. */
  zone?: ContractZone;
}

/** How many rooms this contract runs, from its seed. */
export function roomCountFor(seed: number): number {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const span = CONTRACT_ROOMS_MAX - CONTRACT_ROOMS_MIN + 1;
  return CONTRACT_ROOMS_MIN + Math.floor(rng() * span);
}

/** Which zone this contract is set in, from its seed. */
export function zoneFor(seed: number): ContractZone {
  const rng = mulberry32(seed ^ 0x85ebca6b);
  return CONTRACT_ZONES[Math.floor(rng() * CONTRACT_ZONES.length)];
}

/**
 * The objective chain for a generated compound.
 *
 * It mirrors the authored `twoRoom()` shape — breach, then clear/push per room —
 * and closes with a walk back out rather than a push deeper. `activateRoom` is what
 * keeps the compound asleep ahead of the player: each room wakes only as the
 * objective that reaches it completes, which is the same mechanism the approach
 * relies on to let you walk in unseen.
 */
export function objectivesFor(rooms: GeneratedRoom[], gateZ: number): Mission['objectives'] {
  const out: Mission['objectives'] = [];
  rooms.forEach((room, i) => {
    // Sim rooms are 1-based (0 means "untagged"), matching GeneratedRoom.index + 1.
    const simRoom = i + 1;
    const mid: [number, number] = [0, (room.zNear + room.zFar) / 2];
    if (i === 0) {
      out.push({
        text: 'BREACH THE COMPOUND',
        kind: 'reach',
        pos: [0, room.zNear - 1.2],
        activateRoom: simRoom,
      });
    } else {
      out.push({
        text: 'PUSH TO THE NEXT ROOM',
        kind: 'reach',
        pos: rooms[i - 1].exitPos,
        activateRoom: simRoom,
      });
    }
    out.push({
      text: i === rooms.length - 1 ? 'CLEAR THE LAST ROOM' : 'CLEAR THE ROOM',
      kind: 'clear',
      room: simRoom,
      pos: mid,
    });
  });
  // Out the way you came, carrying it.
  out.push({ text: 'EXTRACT — BACK THE WAY YOU CAME', kind: 'reach', pos: [0, gateZ + 1.5] });
  return out;
}

/**
 * Build a playable Mission from a contract spec. The returned object is an ordinary
 * Mission and is not marked as generated anywhere, because nothing downstream should
 * branch on it — a contract is just another compound.
 */
export function generateContract(spec: ContractSpec): Mission {
  const seed = seedFromString(spec.id);
  const roomCount = spec.rooms ?? roomCountFor(seed);
  const zone = spec.zone ?? zoneFor(seed);

  const rooms = buildChain(0, roomCount, CHAIN_START_Z, seed);
  const cap = entryCap(CHAIN_START_Z);
  const gateZ = CHAIN_START_Z + WALL_T / 2;

  const walls: CoverBox[] = [...cap];
  const cover: CoverBox[] = [];
  const enemies: EnemySpec[] = [];
  for (const room of rooms) {
    walls.push(...room.walls);
    cover.push(...room.cover);
    enemies.push(...room.enemies);
  }

  const deepest = rooms[rooms.length - 1].zFar;
  const half = ROOM_W / 2;

  return {
    id: `contract-${spec.id}`,
    zone,
    op: 'STANDING CONTRACT',
    name: 'STANDING CONTRACT',
    brief: `clear the compound · ${roomCount} rooms · walk back out`,
    gun: 'assault_rifle',
    secondary: 'smg',
    start: spawnPointFor(CHAIN_START_Z),
    approach: { line: 'Nobody is expecting you. Walk it in.' },
    // A generated chain is far deeper than the authored arena, so it states its own
    // extent rather than inheriting a clamp tuned for a different compound.
    bounds: {
      minX: -(half - 0.6),
      maxX: half - 0.6,
      minZ: deepest + 1.2,
      maxZ: CHAIN_START_Z + 1,
    },
    walls,
    cover,
    enemies,
    objectives: objectivesFor(rooms, gateZ),
  };
}
