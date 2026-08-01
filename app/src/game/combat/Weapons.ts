import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Damageable } from './GroundTarget';
import type { Effects } from './Effects';

// Tracer: starten an den Mündungen VOR dem Jet, fliegen nur nach vorne.
const MAX_TRACERS = 100;
const TRACER_LEN = 12;
const TRACER_SPEED = 980;
const TRACER_LIFE = 0.18;

// Mündungen am Bug (local -Z = Nase/Flugrichtung) — links & rechts
const MUZZLES_LOCAL = [
  new THREE.Vector3(-1.05, 0.0, -8.2), // links vorne
  new THREE.Vector3(1.05, 0.0, -8.2),  // rechts vorne
  new THREE.Vector3(-0.75, -0.12, -7.9),
  new THREE.Vector3(0.75, -0.12, -7.9),
];

const _zAxis = new THREE.Vector3(0, 0, 1);
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const _flashPos = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

export class CannonSystem {
  private tracers: {
    mesh: THREE.Mesh;
    life: number;
    dir: THREE.Vector3;
    speed: number;
  }[] = [];
  private flashes: {
    mesh: THREE.Mesh;
    life: number;
  }[] = [];
  private group = new THREE.Group();
  private cursor = 0;
  private flashCursor = 0;
  private barrel = 0;

  constructor(scene: THREE.Scene) {
    // Box von z=0 (Heck/Mündung) bis z=+LEN (Spitze) — nur nach vorne, nie hinter die Mündung
    const geo = new THREE.BoxGeometry(0.07, 0.07, TRACER_LEN);
    geo.translate(0, 0, TRACER_LEN / 2);

    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffdd66,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.tracers.push({
        mesh: m,
        life: 0,
        dir: new THREE.Vector3(0, 0, -1),
        speed: TRACER_SPEED,
      });
    }

    const flashGeo = new THREE.SphereGeometry(0.28, 8, 6);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffee88,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const m = new THREE.Mesh(flashGeo, mat);
      m.visible = false;
      this.group.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }

    scene.add(this.group);
  }

  /** Richtet lokale +Z des Tracers auf world-dir (Schussrichtung). */
  private orientAlong(dir: THREE.Vector3): THREE.Quaternion {
    // Stabil auch bei dir ≈ (0,0,-1)
    if (Math.abs(dir.z + 1) < 1e-4 && Math.abs(dir.x) < 1e-4 && Math.abs(dir.y) < 1e-4) {
      _quat.setFromAxisAngle(_yAxis, Math.PI);
      return _quat;
    }
    if (Math.abs(dir.z - 1) < 1e-4 && Math.abs(dir.x) < 1e-4 && Math.abs(dir.y) < 1e-4) {
      _quat.identity();
      return _quat;
    }
    _quat.setFromUnitVectors(_zAxis, dir);
    return _quat;
  }

  private spawnFlash(worldPos: THREE.Vector3) {
    const f = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    f.mesh.visible = true;
    f.mesh.position.copy(worldPos);
    f.mesh.scale.setScalar(0.5 + Math.random() * 0.6);
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
    f.life = 0.035 + Math.random() * 0.025;
  }

  private spawnTracer(origin: THREE.Vector3, dir: THREE.Vector3) {
    const t = this.tracers[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_TRACERS;
    t.mesh.visible = true;
    // Heck des Tracers = Mündung, Körper nur entlang dir (nach vorne)
    t.mesh.position.copy(origin);
    t.mesh.quaternion.copy(this.orientAlong(dir));
    t.dir.copy(dir);
    t.speed = TRACER_SPEED + (Math.random() - 0.5) * 80;
    t.life = TRACER_LIFE * (0.9 + Math.random() * 0.2);
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
    // knappe Mündung vorn freimachen (nur nach vorne, nie nach hinten)
    t.mesh.position.addScaledVector(dir, 1.5);
  }

  /**
   * Salve aus linken/rechten Mündungen. Visuell nur VOR dem Jet.
   * Hitscan entlang Boresight (Flugrichtung = Fadenkreuz).
   */
  fire(
    shooter: Damageable & { forward: import('three').Vector3 },
    target: Damageable | null,
    effects: Effects,
    onHit: (victim: Damageable, damage: number) => void
  ) {
    const q = shooter.object.quaternion;
    const pos = shooter.object.position;
    const spread = CONFIG.player.cannonSpread;

    const dual = Math.random() > 0.2;
    const sides = dual
      ? [this.barrel % 2, (this.barrel + 1) % 2]
      : [this.barrel % 2];
    this.barrel++;

    let hitOnce = false;

    for (const side of sides) {
      const muzzleIdx = side + (Math.random() > 0.5 ? 2 : 0);
      const local = MUZZLES_LOCAL[muzzleIdx];
      // Weltposition der Mündung am Bug
      _muzzle.copy(local).applyQuaternion(q).add(pos);

      _dir.copy(shooter.forward);
      _dir.x += (Math.random() - 0.5) * spread;
      _dir.y += (Math.random() - 0.5) * spread;
      _dir.z += (Math.random() - 0.5) * spread;
      _dir.normalize();

      // Sicherheit: nur wenn dir grob nach vorne (relativ Jet) zeigt
      // (forward ist bereits Jet-Nase; hier nur normalisieren)
      this.spawnFlash(_flashPos.copy(_muzzle).addScaledVector(_dir, 0.4));
      this.spawnTracer(_muzzle, _dir);

      if (!hitOnce && target && target.alive) {
        hitOnce = true;
        const range = shooter.isPlayer ? CONFIG.player.cannonRange : CONFIG.enemy.fireRange;
        // Boresight-Hitscan (gleich Fadenkreuz / Jet-forward)
        const origin = pos.clone().addScaledVector(shooter.forward, 8);
        const toTarget = _tmp.copy(target.object.position).sub(origin);
        const along = toTarget.dot(shooter.forward);
        if (along > 0 && along < range) {
          const closest = origin.clone().addScaledVector(shooter.forward, along);
          const dist = closest.distanceTo(target.object.position);
          const baseRadius = target.isPlayer ? 6 : (target.name.startsWith('SAM') ? 14 : 6);
          const hitRadius = baseRadius + along * spread * 2;
          if (dist < hitRadius) {
            effects.hitSparks(closest);
            const dmg = shooter.isPlayer ? CONFIG.player.cannonDamage : CONFIG.enemy.cannonDamage;
            onHit(target, dual ? dmg * 1.15 : dmg);
          }
        }
      }
    }
  }

  update(dt: number) {
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        continue;
      }
      t.mesh.position.addScaledVector(t.dir, t.speed * dt);
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.95 * Math.max(0, t.life / TRACER_LIFE);
    }
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        continue;
      }
      f.mesh.scale.multiplyScalar(1 + dt * 8);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.05);
    }
  }
}

// Lenkrakete mit Sucherkopf: verfolgt Ziel, Rauchspur, Näherungszünder.
export class Missile {
  readonly object = new THREE.Group();
  alive = true;
  private vel: THREE.Vector3;
  private life: number;
  private target: Damageable | null;
  private effects: Effects;
  private body: THREE.Mesh;

  constructor(
    target: Damageable,
    start: THREE.Vector3,
    startDir: THREE.Vector3,
    _owner: Damageable,
    effects: Effects
  ) {
    this.target = target;
    this.effects = effects;
    this.object.position.copy(start);
    this.vel = startDir.clone().multiplyScalar(CONFIG.missile.speed * 0.6);
    this.life = CONFIG.missile.life;

    const mat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.4, roughness: 0.4 });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 2.2, 4, 8), mat);
    this.body.rotation.x = Math.PI / 2;
    this.object.add(this.body);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 1.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa33, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.z = 1.9;
    this.object.add(flame);
  }

  targetIs(t: Damageable): boolean {
    return this.target === t;
  }

  update(dt: number): { hit: Damageable | null; expired: boolean } {
    const M = CONFIG.missile;
    this.life -= dt;
    if (this.life <= 0 || !this.alive) {
      this.effects.explosion(this.object.position, false);
      return { hit: null, expired: true };
    }
    this.vel.setLength(Math.min(M.speed, this.vel.length() + 400 * dt));

    if (this.target && this.target.alive) {
      const toTarget = this.target.object.position.clone().sub(this.object.position).normalize();
      const dir = this.vel.clone().normalize();
      const angle = dir.angleTo(toTarget);
      if (angle > THREE.MathUtils.degToRad(M.lockLoseAngleDeg) && this.life < M.life - 1) {
        this.target = null;
      } else {
        const maxTurn = M.turnRate * dt;
        const turn = Math.min(angle, maxTurn);
        const axis = new THREE.Vector3().crossVectors(dir, toTarget);
        if (axis.lengthSq() > 1e-6) {
          axis.normalize();
          dir.applyAxisAngle(axis, turn);
          this.vel.copy(dir.multiplyScalar(this.vel.length()));
        }
      }
      if (this.target && this.object.position.distanceTo(this.target.object.position) < M.proximityRadius) {
        this.effects.explosion(this.object.position, true);
        return { hit: this.target, expired: true };
      }
    }

    this.object.position.addScaledVector(this.vel, dt);
    this.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.vel.clone().normalize());
    this.effects.missileSmoke(this.object.position);
    return { hit: null, expired: false };
  }
}
