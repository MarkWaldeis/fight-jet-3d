import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Damageable } from './GroundTarget';
import type { Effects } from './Effects';

// Tracer: gepoolte leuchtende Geschoss-Linien (visuell), Treffer per Hitscan.
const MAX_TRACERS = 60;

export class CannonSystem {
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private group = new THREE.Group();
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc55, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const geo = new THREE.CylinderGeometry(0.12, 0.12, 14, 4, 1, true);
    geo.rotateX(Math.PI / 2);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    scene.add(this.group);
  }

  // Feuert eine Salve: Hitscan gegen Ziel + visueller Tracer
  fire(
    shooter: Damageable & { forward: import('three').Vector3 },
    target: Damageable | null,
    effects: Effects,
    onHit: (victim: Damageable, damage: number) => void
  ) {
    const origin = shooter.object.position.clone();
    const dir = shooter.forward.clone();
    // Streuung
    const spread = CONFIG.player.cannonSpread;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    // Tracer-Visual
    const t = this.tracers[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_TRACERS;
    t.mesh.visible = true;
    t.mesh.position.copy(origin).addScaledVector(dir, 10);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate());
    t.life = 0.12;

    // Hitscan: Kugel-Test entlang des Strahls
    if (target && target.alive) {
      const range = shooter.isPlayer ? CONFIG.player.cannonRange : CONFIG.enemy.fireRange;
      const toTarget = target.object.position.clone().sub(origin);
      const along = toTarget.dot(dir);
      if (along > 0 && along < range) {
        const closest = origin.clone().addScaledVector(dir, along);
        const dist = closest.distanceTo(target.object.position);
        // Bodenziele (SAM) sind größer → großzügigerer Trefferradius
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
      if (t.life <= 0) t.mesh.visible = false;
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
