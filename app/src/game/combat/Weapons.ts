import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Damageable } from './GroundTarget';
import type { Effects } from './Effects';

// Tracer: gepoolte Leuchtspuren — Pivot an der Mündung, nur nach VORNE,
// animiert entlang der Schussrichtung (nie hinter dem Jet).
const MAX_TRACERS = 80;
const TRACER_LEN = 18;       // sichtbare Strichlänge (m)
const TRACER_SPEED = 900;    // m/s Flug der Leuchtspur
const TRACER_LIFE = 0.22;    // s
// Mündung relativ zum Jet (links vorne, nahe Nase / M61-Port)
const MUZZLE_LOCAL = new THREE.Vector3(-0.55, 0.15, -7.2);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

export class CannonSystem {
  private tracers: {
    mesh: THREE.Mesh;
    life: number;
    dir: THREE.Vector3;
    speed: number;
  }[] = [];
  private group = new THREE.Group();
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    // Zylinder entlang +Z, Pivot am HECK des Tracers (z=0), Spitze bei +Z = vorne
    const geo = new THREE.CylinderGeometry(0.06, 0.14, TRACER_LEN, 5, 1, true);
    geo.rotateX(Math.PI / 2);           // Y-Achse → Z-Achse
    geo.translate(0, 0, TRACER_LEN / 2); // Heck bei lokal z=0, Spitze bei +TRACER_LEN
    for (let i = 0; i < MAX_TRACERS; i++) {
      // Eigenes Material pro Tracer (Opacity-Fade darf sich nicht teilen)
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffcc55, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
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
    scene.add(this.group);
  }

  /** Richtet local +Z auf world-dir (auch bei exakt entgegengesetzten Vektoren stabil). */
  private orientAlong(dir: THREE.Vector3): THREE.Quaternion {
    const d = Math.abs(dir.dot(_zAxis));
    if (d > 0.9995) {
      // parallel oder anti-parallel zu +Z
      if (dir.z > 0) _quat.identity();
      else _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    } else {
      _quat.setFromUnitVectors(_zAxis, dir);
    }
    return _quat;
  }

  // Feuert eine Salve: Hitscan entlang Boresight + Tracer nur VOR der Mündung.
  fire(
    shooter: Damageable & { forward: import('three').Vector3 },
    target: Damageable | null,
    effects: Effects,
    onHit: (victim: Damageable, damage: number) => void
  ) {
    // Mündung in Weltkoordinaten (mit Jet-Rotation)
    _muzzle.copy(MUZZLE_LOCAL).applyQuaternion(shooter.object.quaternion).add(shooter.object.position);

    // Schussrichtung = Flugrichtung (+ leichte Streuung)
    _dir.copy(shooter.forward);
    const spread = CONFIG.player.cannonSpread;
    _dir.x += (Math.random() - 0.5) * spread;
    _dir.y += (Math.random() - 0.5) * spread;
    _dir.z += (Math.random() - 0.5) * spread;
    _dir.normalize();

    // Tracer: Heck an der Mündung, Körper nur nach vorne entlang _dir
    const t = this.tracers[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_TRACERS;
    t.mesh.visible = true;
    t.mesh.position.copy(_muzzle);
    t.mesh.quaternion.copy(this.orientAlong(_dir));
    t.dir.copy(_dir);
    t.speed = TRACER_SPEED + (Math.random() - 0.5) * 80;
    t.life = TRACER_LIFE;
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
    // sofort etwas vor die Mündung schieben, damit der Strich klar vor dem Jet startet
    t.mesh.position.addScaledVector(_dir, 1.2);

    // Hitscan: nur vor der Mündung
    if (target && target.alive) {
      const range = shooter.isPlayer ? CONFIG.player.cannonRange : CONFIG.enemy.fireRange;
      const toTarget = _tmp.copy(target.object.position).sub(_muzzle);
      const along = toTarget.dot(_dir);
      if (along > 0 && along < range) {
        const closest = _muzzle.clone().addScaledVector(_dir, along);
        const dist = closest.distanceTo(target.object.position);
        const baseRadius = target.isPlayer ? 6 : (target.name.startsWith('SAM') ? 14 : 6);
        const hitRadius = baseRadius + along * spread * 2;
        if (dist < hitRadius) {
          effects.hitSparks(closest);
          const dmg = shooter.isPlayer ? CONFIG.player.cannonDamage : CONFIG.enemy.cannonDamage;
          onHit(target, dmg);
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
      // Leuchtspur fliegt nur nach vorne (nie zurück hinter den Jet)
      t.mesh.position.addScaledVector(t.dir, t.speed * dt);
      // Ausfaden
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.95 * Math.max(0, t.life / TRACER_LIFE);
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

  // true = getroffen/zerstört
  update(dt: number): { hit: Damageable | null; expired: boolean } {
    const M = CONFIG.missile;
    this.life -= dt;
    if (this.life <= 0 || !this.alive) {
      this.effects.explosion(this.object.position, false);
      return { hit: null, expired: true };
    }
    this.vel.setLength(Math.min(M.speed, this.vel.length() + 400 * dt));

    if (this.target && this.target.alive) {
      // Proportional-Navigation (vereinfacht): Richtung zum Ziel drehen
      const toTarget = this.target.object.position.clone().sub(this.object.position).normalize();
      const dir = this.vel.clone().normalize();
      const angle = dir.angleTo(toTarget);
      // Ziel verloren?
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
      // Näherungszünder
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
