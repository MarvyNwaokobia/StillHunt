import {
  NetMsgType,
  encodeMessage,
  decodeServerMessage,
  LatencyTracker,
  type MatchFoundMsg,
  type StateUpdateMsg,
  type HitConfirmMsg,
  type MatchEndMsg,
  type PongMsg,
} from './CombatProtocol';
import { ClientPrediction } from './ClientPrediction';

export enum PvPState {
  Idle = 'idle',
  Queuing = 'queuing',
  MatchFound = 'matchFound',
  Countdown = 'countdown',
  Fighting = 'fighting',
  RoundEnd = 'roundEnd',
  MatchEnd = 'matchEnd',
  Disconnected = 'disconnected',
}

export interface PvPMatchInfo {
  roomId: string;
  opponentWallet: string;
  opponentName: string;
  opponentClass: string;
  stageId: string;
}

export type PvPEventListener = (event: string, data: any) => void;

export class PvPManager {
  private ws: WebSocket | null = null;
  private state: PvPState = PvPState.Idle;
  private matchInfo: PvPMatchInfo | null = null;
  private inputSeq = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  readonly latency = new LatencyTracker();
  readonly prediction = new ClientPrediction();

  private listeners: PvPEventListener[] = [];

  get currentState(): PvPState {
    return this.state;
  }

  get match(): PvPMatchInfo | null {
    return this.matchInfo;
  }

  onEvent(listener: PvPEventListener) {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  connect(wsUrl: string) {
    if (this.ws) this.disconnect();

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      const msg = decodeServerMessage(event.data);
      if (!msg) return;
      this.handleMessage(msg as any);
    };

    this.ws.onclose = () => {
      this.setState(PvPState.Disconnected);
      this.stopPing();
    };

    this.ws.onerror = () => {
      this.setState(PvPState.Disconnected);
    };
  }

  disconnect() {
    this.stopPing();
    if (this.ws) {
      this.send({ type: NetMsgType.Leave });
      this.ws.close();
      this.ws = null;
    }
    this.setState(PvPState.Idle);
    this.matchInfo = null;
    this.prediction.reset();
  }

  queue(wallet: string) {
    this.send({ type: 'queue', wallet });
    this.setState(PvPState.Queuing);
  }

  sendInputState(moveX: number, moveY: number, rotation: number, actions: string[]) {
    this.inputSeq++;
    this.send({
      type: NetMsgType.InputState,
      seq: this.inputSeq,
      timestamp: performance.now(),
      moveX,
      moveY,
      rotation,
      actions,
    });
  }

  sendAction(action: string, position: [number, number, number], rotation: number) {
    this.inputSeq++;
    this.send({
      type: NetMsgType.ActionTrigger,
      seq: this.inputSeq,
      action,
      position,
      rotation,
      timestamp: performance.now(),
    });
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'queued':
      case NetMsgType.Queued:
        this.setState(PvPState.Queuing);
        this.emit('queued', msg);
        break;

      case 'match_found':
      case NetMsgType.MatchFound: {
        const m = msg as MatchFoundMsg;
        this.matchInfo = {
          roomId: m.roomId,
          opponentWallet: m.opponent.wallet,
          opponentName: m.opponent.name,
          opponentClass: m.opponent.class,
          stageId: m.stageId ?? 'battle_arena',
        };
        this.setState(PvPState.MatchFound);
        this.emit('matchFound', this.matchInfo);
        break;
      }

      case 'countdown':
      case NetMsgType.Countdown:
        this.setState(PvPState.Countdown);
        this.emit('countdown', msg);
        break;

      case 'fight_start':
      case NetMsgType.FightStart:
        this.setState(PvPState.Fighting);
        this.emit('fightStart', msg);
        break;

      case NetMsgType.StateUpdate: {
        const update = msg as StateUpdateMsg;
        this.prediction.processRemotePlayers(update);
        this.emit('stateUpdate', update);
        break;
      }

      case NetMsgType.HitConfirm: {
        const hit = msg as HitConfirmMsg;
        this.emit('hitConfirm', hit);
        break;
      }

      case 'round_result':
      case NetMsgType.RoundEnd:
        this.setState(PvPState.RoundEnd);
        this.emit('roundEnd', msg);
        break;

      case 'match_result':
      case NetMsgType.MatchEnd: {
        const result = msg as MatchEndMsg;
        this.setState(PvPState.MatchEnd);
        this.emit('matchEnd', result);
        break;
      }

      case 'opponent_left':
      case NetMsgType.OpponentLeft:
        this.emit('opponentLeft', msg);
        this.setState(PvPState.MatchEnd);
        break;

      case NetMsgType.Pong: {
        const pong = msg as PongMsg;
        const rtt = performance.now() - pong.clientTime;
        this.latency.addSample(rtt);
        this.emit('latencyUpdate', {
          rttMs: rtt,
          averageMs: this.latency.averageMs,
          quality: this.latency.quality,
        });
        break;
      }
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send({
        type: NetMsgType.Ping,
        clientTime: performance.now(),
      });
    }, 2000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMessage(msg));
    }
  }

  private setState(state: PvPState) {
    this.state = state;
    this.emit('stateChange', state);
  }

  private emit(event: string, data: any) {
    for (const listener of this.listeners) {
      listener(event, data);
    }
  }
}
