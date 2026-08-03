export enum NetMsgType {
  // Client → Server
  Queue = 'queue',
  InputState = 'input_state',
  ActionTrigger = 'action_trigger',
  Ping = 'ping',
  Leave = 'leave',

  // Server → Client
  Queued = 'queued',
  MatchFound = 'match_found',
  Countdown = 'countdown',
  FightStart = 'fight_start',
  StateUpdate = 'state_update',
  HitConfirm = 'hit_confirm',
  RoundEnd = 'round_end',
  MatchEnd = 'match_end',
  OpponentLeft = 'opponent_left',
  Pong = 'pong',
}

// Client → Server messages

export interface InputStateMsg {
  type: NetMsgType.InputState;
  seq: number;
  timestamp: number;
  moveX: number;
  moveY: number;
  rotation: number;
  actions: string[];
}

export interface ActionTriggerMsg {
  type: NetMsgType.ActionTrigger;
  seq: number;
  action: string;
  position: [number, number, number];
  rotation: number;
  timestamp: number;
}

export interface PingMsg {
  type: NetMsgType.Ping;
  clientTime: number;
}

// Server → Client messages

export interface StateUpdateMsg {
  type: NetMsgType.StateUpdate;
  seq: number;
  serverTime: number;
  players: {
    id: string;
    position: [number, number, number];
    rotation: number;
    velocity: [number, number, number];
    health: number;
    stamina: number;
    animState: string;
    isBlocking: boolean;
    isDodging: boolean;
  }[];
}

export interface HitConfirmMsg {
  type: NetMsgType.HitConfirm;
  attackerId: string;
  defenderId: string;
  damage: number;
  blocked: boolean;
  critical: boolean;
  hitType: 'light' | 'heavy' | 'special';
  hitPosition: [number, number, number];
  knockbackDir: [number, number, number];
  knockbackForce: number;
  defenderHealth: number;
  killed: boolean;
}

export interface MatchFoundMsg {
  type: NetMsgType.MatchFound;
  roomId: string;
  opponent: {
    wallet: string;
    name: string;
    class: string;
  };
  stageId: string;
  countdown: number;
}

export interface RoundEndMsg {
  type: NetMsgType.RoundEnd;
  winnerId: string;
  loserId: string;
  round: number;
  scores: Record<string, number>;
}

export interface MatchEndMsg {
  type: NetMsgType.MatchEnd;
  winnerId: string;
  loserId: string;
  winnerXP: number;
  loserXP: number;
  winnerGold: number;
  loserGold: number;
  stats: {
    totalDamageDealt: Record<string, number>;
    longestCombo: Record<string, number>;
    perfectRounds: string[];
  };
}

export interface PongMsg {
  type: NetMsgType.Pong;
  clientTime: number;
  serverTime: number;
}

export type ClientMessage = InputStateMsg | ActionTriggerMsg | PingMsg;
export type ServerMessage =
  | StateUpdateMsg
  | HitConfirmMsg
  | MatchFoundMsg
  | RoundEndMsg
  | MatchEndMsg
  | PongMsg;

export function encodeMessage(msg: ClientMessage | { type: string; [key: string]: any }): string {
  return JSON.stringify(msg);
}

export function decodeServerMessage(data: string): ServerMessage | null {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Network quality estimation
export class LatencyTracker {
  private samples: number[] = [];
  private maxSamples = 20;

  addSample(rttMs: number) {
    this.samples.push(rttMs);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  get averageMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  get jitterMs(): number {
    if (this.samples.length < 2) return 0;
    const avg = this.averageMs;
    const variance = this.samples.reduce((sum, s) => sum + (s - avg) ** 2, 0) / this.samples.length;
    return Math.sqrt(variance);
  }

  get quality(): 'excellent' | 'good' | 'fair' | 'poor' {
    const avg = this.averageMs;
    if (avg < 50) return 'excellent';
    if (avg < 100) return 'good';
    if (avg < 200) return 'fair';
    return 'poor';
  }
}
