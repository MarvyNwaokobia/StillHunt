import * as THREE from 'three';

interface TrailPoint {
  position: THREE.Vector3;
  age: number;
}

export class TrailRenderer {
  private points: TrailPoint[] = [];
  private maxPoints: number;
  private lifetime: number;
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshBasicMaterial;
  private active = false;
  private posArray: Float32Array;
  private colorArray: Float32Array;
  private width: number;
  private baseColor: THREE.Color;

  constructor(
    color: string = '#ffffff',
    maxPoints = 30,
    lifetime = 0.15,
    width = 0.3
  ) {
    this.maxPoints = maxPoints;
    this.lifetime = lifetime;
    this.width = width;
    this.baseColor = new THREE.Color(color);

    const vertCount = maxPoints * 2;
    this.posArray = new Float32Array(vertCount * 3);
    this.colorArray = new Float32Array(vertCount * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.posArray, 3));
    // Per-vertex colour carries the fade — MeshBasicMaterial ignores a custom
    // 'alpha' attribute, so the taper has to live in vertexColors instead.
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 3));

    const indices: number[] = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
    this.geometry.setIndex(indices);

    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  get object3d(): THREE.Mesh {
    return this.mesh;
  }

  setColor(color: string) {
    this.baseColor.set(color);
  }

  start() {
    this.active = true;
    this.points = [];
    this.mesh.visible = true;
  }

  stop() {
    this.active = false;
  }

  addPoint(position: THREE.Vector3) {
    if (!this.active && this.points.length === 0) return;

    this.points.unshift({
      position: position.clone(),
      age: 0,
    });

    if (this.points.length > this.maxPoints) {
      this.points.pop();
    }
  }

  update(dt: number, cameraPosition?: THREE.Vector3) {
    for (let i = this.points.length - 1; i >= 0; i--) {
      this.points[i].age += dt;
      if (this.points[i].age > this.lifetime) {
        this.points.splice(i, 1);
      }
    }

    if (this.points.length < 2) {
      this.mesh.visible = false;
      if (!this.active) return;
    }

    this.mesh.visible = this.points.length >= 2;
    this.buildGeometry(cameraPosition);
  }

  private buildGeometry(cameraPosition?: THREE.Vector3) {
    const cam = cameraPosition ?? new THREE.Vector3(0, 5, 10);

    for (let i = 0; i < this.maxPoints; i++) {
      if (i >= this.points.length) {
        this.posArray[i * 6] = 0;
        this.posArray[i * 6 + 1] = 0;
        this.posArray[i * 6 + 2] = 0;
        this.posArray[i * 6 + 3] = 0;
        this.posArray[i * 6 + 4] = 0;
        this.posArray[i * 6 + 5] = 0;
        for (let k = 0; k < 6; k++) this.colorArray[i * 6 + k] = 0;
        continue;
      }

      const p = this.points[i];
      // Fade out toward the tail, and taper the leading edge in too so the head
      // is a fine point rather than a blunt slab.
      const headTaper = Math.min(1, (i + 1) / 4);
      const alpha = (1 - p.age / this.lifetime) * headTaper;

      let tangent: THREE.Vector3;
      if (i < this.points.length - 1) {
        tangent = new THREE.Vector3()
          .subVectors(this.points[i + 1].position, p.position)
          .normalize();
      } else if (i > 0) {
        tangent = new THREE.Vector3()
          .subVectors(p.position, this.points[i - 1].position)
          .normalize();
      } else {
        tangent = new THREE.Vector3(0, 0, 1);
      }

      const toCamera = new THREE.Vector3()
        .subVectors(cam, p.position)
        .normalize();
      const side = new THREE.Vector3()
        .crossVectors(tangent, toCamera)
        .normalize()
        .multiplyScalar(this.width * (0.35 + alpha * 0.65));

      const p1 = p.position.clone().add(side);
      const p2 = p.position.clone().sub(side);

      this.posArray[i * 6] = p1.x;
      this.posArray[i * 6 + 1] = p1.y;
      this.posArray[i * 6 + 2] = p1.z;
      this.posArray[i * 6 + 3] = p2.x;
      this.posArray[i * 6 + 4] = p2.y;
      this.posArray[i * 6 + 5] = p2.z;

      // Brightness carries the fade (additive blend → alpha reads as glow).
      const r = this.baseColor.r * alpha;
      const g = this.baseColor.g * alpha;
      const b = this.baseColor.b * alpha;
      this.colorArray[i * 6] = r;
      this.colorArray[i * 6 + 1] = g;
      this.colorArray[i * 6 + 2] = b;
      this.colorArray[i * 6 + 3] = r;
      this.colorArray[i * 6 + 4] = g;
      this.colorArray[i * 6 + 5] = b;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, (this.points.length - 1)) * 6);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
