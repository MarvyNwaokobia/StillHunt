import * as THREE from 'three';
import type { StateUpdateMsg } from './CombatProtocol';

interface PredictedState {
  seq: number;
  position: THREE.Vector3;
  rotation: number;
  velocity: THREE.Vector3;
  timestamp: number;
}

interface InterpolationTarget {
  position: THREE.Vector3;
  rotation: number;
  velocity: THREE.Vector3;
  health: number;
  animState: string;
  isBlocking: boolean;
  isDodging: boolean;
  timestamp: number;
}

const INTERPOLATION_DELAY = 100; // ms — buffer for smooth remote player rendering
const MAX_PREDICTION_BUFFER = 60;
const RECONCILIATION_THRESHOLD = 0.5; // units — snap if too far off

export class ClientPrediction {
  private localPlayerId: string = '';
  private predictionBuffer: PredictedState[] = [];


  private remoteStates: Map<string, InterpolationTarget[]> = new Map();
  private interpolatedPositions: Map<string, {
    position: THREE.Vector3;
    rotation: number;
    health: number;
    animState: string;
    isBlocking: boolean;
    isDodging: boolean;
  }> = new Map();

  setLocalPlayer(id: string) {
    this.localPlayerId = id;
  }

  recordPrediction(seq: number, position: THREE.Vector3, rotation: number, velocity: THREE.Vector3) {
    this.predictionBuffer.push({
      seq,
      position: position.clone(),
      rotation,
      velocity: velocity.clone(),
      timestamp: performance.now(),
    });

    if (this.predictionBuffer.length > MAX_PREDICTION_BUFFER) {
      this.predictionBuffer.shift();
    }
  }

  reconcile(
    serverUpdate: StateUpdateMsg,
    currentPosition: THREE.Vector3
  ): { correctedPosition: THREE.Vector3 | null; correctedRotation: number | null } {
    const localPlayer = serverUpdate.players.find((p) => p.id === this.localPlayerId);
    if (!localPlayer) return { correctedPosition: null, correctedRotation: null };

    const serverPos = new THREE.Vector3(...localPlayer.position);
    const serverSeq = serverUpdate.seq;


    this.predictionBuffer = this.predictionBuffer.filter((p) => p.seq > serverSeq);

    let replayedPos = serverPos.clone();
    for (const predicted of this.predictionBuffer) {
      replayedPos.add(predicted.velocity.clone().multiplyScalar(1 / 60));
    }

    const error = replayedPos.distanceTo(currentPosition);

    if (error > RECONCILIATION_THRESHOLD) {
      return {
        correctedPosition: replayedPos,
        correctedRotation: localPlayer.rotation,
      };
    }

    return { correctedPosition: null, correctedRotation: null };
  }

  processRemotePlayers(serverUpdate: StateUpdateMsg) {
    const now = performance.now();

    for (const player of serverUpdate.players) {
      if (player.id === this.localPlayerId) continue;

      let buffer = this.remoteStates.get(player.id);
      if (!buffer) {
        buffer = [];
        this.remoteStates.set(player.id, buffer);
      }

      buffer.push({
        position: new THREE.Vector3(...player.position),
        rotation: player.rotation,
        velocity: new THREE.Vector3(...player.velocity),
        health: player.health,
        animState: player.animState,
        isBlocking: player.isBlocking,
        isDodging: player.isDodging,
        timestamp: now,
      });

      if (buffer.length > 30) {
        buffer.splice(0, buffer.length - 30);
      }
    }
  }

  getInterpolatedRemote(playerId: string): {
    position: THREE.Vector3;
    rotation: number;
    health: number;
    animState: string;
    isBlocking: boolean;
    isDodging: boolean;
  } | null {
    const buffer = this.remoteStates.get(playerId);
    if (!buffer || buffer.length < 2) {
      return this.interpolatedPositions.get(playerId) ?? null;
    }

    const renderTime = performance.now() - INTERPOLATION_DELAY;

    let from: InterpolationTarget | null = null;
    let to: InterpolationTarget | null = null;

    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
        from = buffer[i];
        to = buffer[i + 1];
        break;
      }
    }

    if (!from || !to) {
      const latest = buffer[buffer.length - 1];
      const result = {
        position: latest.position.clone(),
        rotation: latest.rotation,
        health: latest.health,
        animState: latest.animState,
        isBlocking: latest.isBlocking,
        isDodging: latest.isDodging,
      };
      this.interpolatedPositions.set(playerId, result);
      return result;
    }

    const range = to.timestamp - from.timestamp;
    const t = range > 0 ? (renderTime - from.timestamp) / range : 0;

    const position = from.position.clone().lerp(to.position, t);
    const rotation = lerpAngle(from.rotation, to.rotation, t);

    const result = {
      position,
      rotation,
      health: to.health,
      animState: to.animState,
      isBlocking: to.isBlocking,
      isDodging: to.isDodging,
    };

    this.interpolatedPositions.set(playerId, result);
    return result;
  }

  reset() {
    this.predictionBuffer = [];
    this.remoteStates.clear();
    this.interpolatedPositions.clear();

  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
