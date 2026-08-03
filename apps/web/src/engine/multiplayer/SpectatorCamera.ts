import * as THREE from 'three';

export enum SpectatorMode {
  Auto = 'auto',
  Free = 'free',
  Player1 = 'player1',
  Player2 = 'player2',
}

export class SpectatorCamera {
  private camera: THREE.PerspectiveCamera;
  private mode: SpectatorMode = SpectatorMode.Auto;
  private currentPosition = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private orbitAngle = 0;
  private orbitSpeed = 0.3;
  private freeYaw = 0;
  private freePitch = 0.4;
  private freeDistance = 10;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
  }

  get currentMode(): SpectatorMode {
    return this.mode;
  }

  setMode(mode: SpectatorMode) {
    this.mode = mode;
  }

  cycleMode() {
    const modes = [SpectatorMode.Auto, SpectatorMode.Player1, SpectatorMode.Player2, SpectatorMode.Free];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
  }

  rotateFree(dx: number, dy: number) {
    if (this.mode !== SpectatorMode.Free) return;
    this.freeYaw -= dx * 0.003;
    this.freePitch = Math.max(-0.3, Math.min(1.2, this.freePitch - dy * 0.003));
  }

  zoomFree(delta: number) {
    if (this.mode !== SpectatorMode.Free) return;
    this.freeDistance = Math.max(3, Math.min(25, this.freeDistance + delta * 0.01));
  }

  update(
    dt: number,
    p1Pos: THREE.Vector3,
    p2Pos: THREE.Vector3,
    actionIntensity = 0
  ) {
    const midpoint = new THREE.Vector3().addVectors(p1Pos, p2Pos).multiplyScalar(0.5);
    const separation = p1Pos.distanceTo(p2Pos);

    let targetPos: THREE.Vector3;
    let targetLook: THREE.Vector3;

    switch (this.mode) {
      case SpectatorMode.Auto:
        targetPos = this.getAutoPosition(dt, midpoint, separation, p1Pos, p2Pos, actionIntensity);
        targetLook = midpoint.clone();
        targetLook.y += 0.8;
        break;

      case SpectatorMode.Player1:
        targetPos = this.getFollowPosition(p1Pos, p2Pos);
        targetLook = p1Pos.clone();
        targetLook.y += 1.2;
        break;

      case SpectatorMode.Player2:
        targetPos = this.getFollowPosition(p2Pos, p1Pos);
        targetLook = p2Pos.clone();
        targetLook.y += 1.2;
        break;

      case SpectatorMode.Free:
        targetPos = this.getFreePosition(midpoint);
        targetLook = midpoint.clone();
        targetLook.y += 1;
        break;

      default:
        return;
    }

    const smoothing = this.mode === SpectatorMode.Auto ? 3 : 5;
    const t = 1 - Math.exp(-smoothing * dt);
    this.currentPosition.lerp(targetPos, t);
    this.currentLookAt.lerp(targetLook, t);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);

    const targetFov = this.mode === SpectatorMode.Auto
      ? 45 + separation * 1.5 + actionIntensity * 5
      : 50;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 3);
    this.camera.updateProjectionMatrix();
  }

  private getAutoPosition(
    dt: number,
    midpoint: THREE.Vector3,
    separation: number,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    intensity: number
  ): THREE.Vector3 {
    this.orbitAngle += this.orbitSpeed * dt * (1 - intensity * 0.5);

    const fightDir = new THREE.Vector3().subVectors(p2, p1).setY(0).normalize();
    const perpendicular = new THREE.Vector3(-fightDir.z, 0, fightDir.x);

    const orbitInfluence = Math.sin(this.orbitAngle) * 0.3;
    const cameraDir = perpendicular.clone()
      .add(fightDir.clone().multiplyScalar(orbitInfluence))
      .normalize();

    const dist = Math.max(8, separation * 0.9 + 4);
    const height = 2.5 + separation * 0.2;

    return midpoint.clone()
      .addScaledVector(cameraDir, dist)
      .setY(midpoint.y + height);
  }

  private getFollowPosition(target: THREE.Vector3, opponent: THREE.Vector3): THREE.Vector3 {
    const behind = new THREE.Vector3()
      .subVectors(target, opponent)
      .setY(0)
      .normalize();

    return target.clone()
      .addScaledVector(behind, 5)
      .setY(target.y + 3);
  }

  private getFreePosition(center: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      center.x + Math.sin(this.freeYaw) * Math.cos(this.freePitch) * this.freeDistance,
      center.y + 2 + Math.sin(this.freePitch) * this.freeDistance * 0.5,
      center.z + Math.cos(this.freeYaw) * Math.cos(this.freePitch) * this.freeDistance
    );
  }
}
