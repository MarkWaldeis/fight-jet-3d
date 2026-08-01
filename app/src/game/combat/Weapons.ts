import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Damageable } from './GroundTarget';
import type { Effects } from './Effects';

// Tracer: gepoolte Leuchtspuren — aus linken/rechten Mündungen, nur nach vorne.
const MAX_TRACERS = 100;
const TRACER_LEN = 16;
const TRACER_SPEED = 950;
const TRACER_LIFE = 0.2;

// Dual-Mündungen (links/rechts am Bug / Wing-Root) — Arcade-Vulcan-Look
const MUZZLES_LOCAL = [
  new THREE.Vector3(-1.15, 0.05, -6.8), // links
  new THREE.Vector3(1.15, 0.05, -6.8),  // rechts
  new THREE.Vector3(-0.7, -0.15, -6.5), // links etwas tiefer (Wechsel)
  new THREE.Vector3(0.7, -0.15, -6.5),  // rechts etwas tiefer
];

const _zAxis = new THREE.Vector3(0, 0, 1);
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const _flashPos = new THREE.Vector3();

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
  private barrel = 0; // wechselt links/rechts

  constructor(scene: THREE.Scene) {
    // Tracer-Geometrie: Pivot am Heck, erstreckt sich nur nach +Z (= vorne nach Orient)
    const geo = new THREE.CylinderGeometry(0.05, 0.12, TRACER_LEN, 5, 1, true);
    geo.rotateX(Math.PI / 2);
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
      this.group.add(m);
      this.tracers.push({
        mesh: m,
        life: 0,
        dir: new THREE.Vector3(0, 0, -1),
        speed: TRACER_SPEED,
      });
    }

    // Mündungsfeuer (kurze Blitze an der Kanone)
    const flashGeo = new THREE.SphereGeometry(0.35, 8, 6);
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

  private orientAlong(dir: THREE.Vector3): THREE.Quaternion {
    const d = Math.abs(dir.dot(_zAxis));
    if (d > 0.9995) {
      if (dir.z > 0) _quat.identity();
      else _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    } else {
      _quat.setFromUnitVectors(_zAxis, dir);
    }
    return _quat;
  }

  private spawnFlash(worldPos: THREE.Vector3) {
    const f = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    f.mesh.visible = true;
    f.mesh.position.copy(worldPos);
    const s = 0.6 + Math.random() * 0.8;
    f.mesh.scale.setScalar(s);
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
    f.life = 0.04 + Math.random() * 0.03;
  }

  private spawnTracer(origin: THREE.Vector3, dir: THREE.Vector3) {
    const t = this.tracers[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_TRACERS;
    t.mesh.visible = true;
    t.mesh.position.copy(origin);
    t.mesh.quaternion.copy(this.orientAlong(dir));
    t.dir.copy(dir);
    t.speed = TRACER_SPEED + (Math.random() - 0.5) * 100;
    t.life = TRACER_LIFE * (0.85 + Math.random() * 0.3);
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
    // leicht vor die Mündung, damit der Strich klar am Jet beginnt
    t.mesh.position.addScaledVector(dir, 0.8);
  }

  /**
   * Feuert eine Salve: 1–2 Tracer aus linken/rechten Mündungen + Hitscan.
   * Schussrichtung = Flugrichtung (Boresight).
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

    // Pro Schuss: oft beide Seiten (links + rechts), manchmal nur eine (Vulcan-Burst)
    const dual = Math.random() > 0.25;
    const sides = dual
      ? [this.barrel % 2, (this.barrel + 1) % 2]
      : [this.barrel % 2];
    this.barrel++;

    let hitOnce = false;

    for (const side of sides) {
      // Wechsle zwischen vorderen/hinteren Mündungs-Offsets pro Seite
      const muzzleIdx = side + (Math.random() > 0.5 ? 2 : 0);
      const local = MUZZLES_LOCAL[muzzleIdx];
      _muzzle.copy(local).applyQuaternion(q).add(pos);

      _dir.copy(shooter.forward);
      _dir.x += (Math.random() - 0.5) * spread;
      _dir.y += (Math.random() - 0.5) * spread;
      _dir.z += (Math.random() - 0.5) * spread;
      _dir.normalize();

      this.spawnFlash(_flashPos.copy(_muzzle));
      this.spawnTracer(_muzzle, _dir);

      // Hitscan einmal pro Salve reicht (gleiche Boresight)
      if (!hitOnce && target && target.alive) {
        hitOnce = true;
        const range = shooter.isPlayer ? CONFIG.player.cannonRange : CONFIG.enemy.fireRange;
        // Hitscan vom Jet-Zentrum / Boresight (fair), Visuell von den Mündungen
        const origin = pos.clone().addScaledVector(shooter.forward, 6);
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
            // Dual = etwas mehr Schaden
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
