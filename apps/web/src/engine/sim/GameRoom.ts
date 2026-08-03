import { CombatSim, FIXED_DT, type FighterId, type ClassId, type SimEvent, type SimSnapshot } from './CombatSim';
import { InputSystem, Action } from '../input/InputSystem';
import {
  NetMsgType,
  type InputStateMsg,
  type ActionTriggerMsg,
  type StateUpdateMsg,
  type HitConfirmMsg,
  type MatchEndMsg,
} from '../multiplayer/CombatProtocol';

/**
 * Authoritative match room — the server-side fight (docs/PVP_NETCODE.md option C).
 *
 * Wraps the headless CombatSim and speaks CombatProtocol: it ingests each
 * player's InputState / ActionTrigger, advances the sim at a fixed tick, and
 * produces StateUpdate / HitConfirm / MatchEnd messages to broadcast. The server
 * is the single authority — clients send only inputs; the room computes all
 * positions, hits, and outcomes. Transport-agnostic: a ws host calls
 * `applyInput` as messages arrive and `step` on a fixed timer, then broadcasts
 * the result. No AI here (two humans), which is why this builds cleanly on the
 * sim ahead of the GameScene/EnemyAI migration.
 */

export interface RoomPlayer {
  id: FighterId;
  wallet: string;
  name: string;
  classId: ClassId;
}

// Network action strings → engine actions. Attacks/dodge/jump are buffered
// (one-shot ActionTrigger); block is held (carried in InputState.actions).
const ACTION_MAP: Record<string, Action> = {
  fire: Action.Fire,
  light: Action.LightAttack,
  heavy: Action.HeavyAttack,
  special: Action.Special,
  block: Action.Block,
  dodge: Action.Dodge,
  jump: Action.Jump,
};
// Held across frames (carried in InputState.actions): guard + auto-fire trigger.
const HELD_ACTIONS = new Set<Action>([Action.Block, Action.Fire]);

// Base XP; the authoritative award is applied server-side via the API's
// finalize_fight path when MatchEnd is persisted (wired in a later step).
const XP_WIN = 100;
const XP_LOSS = 30;
const MATCH_TIMEOUT_SECS = 90;

export interface RoomStepResult {
  state: StateUpdateMsg;
  hits: HitConfirmMsg[];
  matchEnd: MatchEndMsg | null;
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export class GameRoom {
  readonly id: string;
  private sim: CombatSim;
  private inputs: Record<FighterId, InputSystem>;
  private players: Record<FighterId, RoomPlayer>;
  private seq = 0;
  private elapsed = 0;
  private phase: 'countdown' | 'active' | 'ended' = 'countdown';
  private totalDamage: Record<FighterId, number> = { p1: 0, p2: 0 };
  private longestCombo: Record<FighterId, number> = { p1: 0, p2: 0 };

  constructor(id: string, p1: RoomPlayer, p2: RoomPlayer) {
    this.id = id;
    this.players = { p1, p2 };
    this.sim = new CombatSim(p1.classId, p2.classId);
    this.inputs = { p1: new InputSystem(), p2: new InputSystem() };
  }

  /** Flip to active once matchmaking + countdown (handled by the host) are done. */
  start() {
    this.phase = 'active';
  }

  get isOver(): boolean {
    return this.phase === 'ended';
  }

  /** The underlying authoritative controller for a fighter (inspection/tests). */
  controller(id: FighterId) {
    return this.sim.controller(id);
  }

  /** Apply an inbound network message to a player's input. */
  applyInput(id: FighterId, msg: InputStateMsg | ActionTriggerMsg) {
    const input = this.inputs[id];
    if (msg.type === NetMsgType.InputState) {
      input.setStick(clamp1(msg.moveX), clamp1(msg.moveY));
      // Reconcile held actions (block): held iff present in this frame's actions.
      for (const [str, act] of Object.entries(ACTION_MAP)) {
        if (!HELD_ACTIONS.has(act)) continue;
        if (msg.actions.includes(str)) input.triggerAction(act);
        else input.releaseAction(act);
      }
    } else if (msg.type === NetMsgType.ActionTrigger) {
      const act = ACTION_MAP[msg.action];
      if (act) input.triggerAction(act); // buffers attacks/dodge/jump
    }
  }

  /** Advance one authoritative tick. Host calls this at the sim rate (FIXED_DT). */
  step(): RoomStepResult {
    let events: SimEvent[] = [];
    if (this.phase === 'active') {
      this.elapsed += FIXED_DT;
      events = this.sim.step(FIXED_DT, this.inputs);
    }

    const snap = this.sim.snapshot();
    this.seq++;

    const hits: HitConfirmMsg[] = [];
    let matchEnd: MatchEndMsg | null = null;

    for (const e of events) {
      if (e.kind === 'hit') {
        if (!e.event.blocked) this.totalDamage[e.event.attackerId as FighterId] += e.event.finalDamage;
        this.longestCombo[e.event.attackerId as FighterId] = Math.max(
          this.longestCombo[e.event.attackerId as FighterId],
          e.comboCount
        );
        hits.push(this.buildHitConfirm(e, snap));
      } else if (e.kind === 'ko') {
        this.phase = 'ended';
        matchEnd = this.buildMatchEnd(e.winner, e.loser);
      }
    }

    // Timeout — most HP wins, the standard fighting-game decision.
    if (this.phase === 'active' && this.elapsed >= MATCH_TIMEOUT_SECS) {
      const p1hp = snap.fighters.p1.health;
      const p2hp = snap.fighters.p2.health;
      const winner: FighterId = p1hp >= p2hp ? 'p1' : 'p2';
      const loser: FighterId = winner === 'p1' ? 'p2' : 'p1';
      this.phase = 'ended';
      matchEnd = this.buildMatchEnd(winner, loser);
    }

    return { state: this.buildStateUpdate(snap), hits, matchEnd };
  }

  // ── Message builders ──────────────────────────────────────────────────────

  private buildStateUpdate(snap: SimSnapshot): StateUpdateMsg {
    const players = (['p1', 'p2'] as FighterId[]).map((fid) => {
      const f = snap.fighters[fid];
      return {
        id: this.players[fid].wallet,
        position: f.position,
        rotation: f.rotation,
        velocity: f.velocity,
        health: f.health,
        stamina: f.stamina,
        animState: f.animState as string,
        isBlocking: f.isBlocking,
        isDodging: f.isDodging,
      };
    });
    return { type: NetMsgType.StateUpdate, seq: this.seq, serverTime: Date.now(), players };
  }

  private buildHitConfirm(e: Extract<SimEvent, { kind: 'hit' }>, snap: SimSnapshot): HitConfirmMsg {
    const ev = e.event;
    const defFid = ev.defenderId as FighterId;
    return {
      type: NetMsgType.HitConfirm,
      attackerId: this.players[ev.attackerId as FighterId].wallet,
      defenderId: this.players[defFid].wallet,
      damage: ev.finalDamage,
      blocked: ev.blocked,
      critical: ev.critical,
      hitType: ev.hitType,
      hitPosition: [ev.hitPosition.x, ev.hitPosition.y, ev.hitPosition.z],
      knockbackDir: [ev.knockbackDir.x, ev.knockbackDir.y, ev.knockbackDir.z],
      knockbackForce: ev.knockbackForce,
      defenderHealth: snap.fighters[defFid].health,
      killed: ev.killed,
    };
  }

  private buildMatchEnd(winner: FighterId, loser: FighterId): MatchEndMsg {
    return {
      type: NetMsgType.MatchEnd,
      winnerId: this.players[winner].wallet,
      loserId: this.players[loser].wallet,
      winnerXP: XP_WIN,
      loserXP: XP_LOSS,
      winnerGold: 0,
      loserGold: 0,
      stats: {
        totalDamageDealt: {
          [this.players.p1.wallet]: this.totalDamage.p1,
          [this.players.p2.wallet]: this.totalDamage.p2,
        },
        longestCombo: {
          [this.players.p1.wallet]: this.longestCombo.p1,
          [this.players.p2.wallet]: this.longestCombo.p2,
        },
        perfectRounds: [],
      },
    };
  }
}
