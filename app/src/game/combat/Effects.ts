import * as THREE from 'three';

// Effekte mit Objekt-Pooling: Explosionen (Feuerball + Rauch), Tracer, Rauchspuren.
// Keine Allokation im Game-Loop — alles wird wiederverwendet.

const MAX_PARTICLES = 400;

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
  growth: number;
  fade: boolean;
}

class ParticlePool {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private geo: THREE.BufferGeometry;
  private cursor = 0;

  constructor() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ alive: false, life: 0, maxLife: 1, vel: new THREE.Vector3(), growth: 0, fade: true });
      this.positions[i * 3 + 1] = -99999;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: true,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color, size: number, life: number, growth = 0) {
    const p = this.particles[this.cursor];
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.alive = true; p.life = 0; p.maxLife = life; p.growth = growth;
    p.vel.copy(vel);
    this.positions[i * 3] = pos.x; this.positions[i * 3 + 1] = pos.y; this.positions[i * 3 + 2] = pos.z;
    this.colors[i * 3] = color.r; this.colors[i * 3 + 1] = color.g; this.colors[i * 3 + 2] = color.b;
    this.sizes[i] = size;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.positions[i * 3 + 1] = -99999;
        continue;
      }
      this.positions[i * 3] += p.vel.x * dt;
      this.positions[i * 3 + 1] += p.vel.y * dt;
      this.positions[i * 3 + 2] += p.vel.z * dt;
      p.vel.multiplyScalar(1 - dt * 0.8); // Luftwiderstand
      p.vel.y += dt * 3; // Rauch steigt
      this.sizes[i] += p.growth * dt;
      const fade = 1 - p.life / p.maxLife;
      this.colors[i * 3] *= (0.98 + fade * 0.02);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

export class Effects {
  readonly group = new THREE.Group();
  private pool = new ParticlePool();
  private cFire = new THREE.Color(1, 0.55, 0.15);
  private cFireBright = new THREE.Color(1, 0.9, 0.4);
  private cSmoke = new THREE.Color(0.25, 0.25, 0.27);
  private cSpark = new THREE.Color(1, 0.8, 0.3);

  constructor() {
    this.group.add(this.pool.points);
  }

  explosion(pos: THREE.Vector3, big = false) {
    const n = big ? 40 : 22;
    const spread = big ? 60 : 30;
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const speed = Math.random() * spread;
      const vel = dir.multiplyScalar(speed);
      const bright = Math.random() > 0.5;
      this.pool.spawn(
        pos, vel,
        bright ? this.cFireBright : this.cFire,
        (big ? 26 : 14) + Math.random() * 20,
        0.5 + Math.random() * 0.7,
        30
      );
    }
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * spread * 0.5);
      this.pool.spawn(pos, dir, this.cSmoke, 20 + Math.random() * 26, 1.6 + Math.random() * 2.2, 22);
    }
  }

  hitSparks(pos: THREE.Vector3) {
    for (let i = 0; i < 6; i++) {
      this.pool.spawn(
        pos,
        new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40),
        this.cSpark, 4 + Math.random() * 4, 0.3 + Math.random() * 0.25, -6
      );
    }
  }

  missileSmoke(pos: THREE.Vector3) {
    this.pool.spawn(
      pos,
      new THREE.Vector3((Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4),
      this.cSmoke, 6 + Math.random() * 4, 1.4 + Math.random(), 10
    );
  }

  damageSmoke(pos: THREE.Vector3) {
    this.pool.spawn(
      pos,
      new THREE.Vector3((Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3),
      this.cSmoke, 8 + Math.random() * 6, 0.8 + Math.random() * 0.6, 14
    );
  }

  update(dt: number) {
    this.pool.update(dt);
  }
}
