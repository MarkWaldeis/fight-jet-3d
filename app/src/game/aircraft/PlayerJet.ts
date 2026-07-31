import * as THREE from 'three';
import { Aircraft } from './Aircraft';
import { CONFIG } from '../config';
import type { Input } from '../core/Input';
import type { Terrain } from '../world/Terrain';

// Spieler-F-16: liest Input, fährt das Flugmodell, Terrain-Kollision.
export class PlayerJet extends Aircraft {
  readonly isPlayer = true;
  missilesLeft = CONFIG.player.missileCount;
  flaresLeft = CONFIG.player.flareCount;
  cannonCooldown = 0;
  lockTarget: Aircraft | null = null;
  lockProgress = 0; // 0..1
  score = 0;
  crashed = false;

  constructor() {
    super('VIPER 01', { bodyColor: 0x8a929e, accentColor: 0xc8352e }, CONFIG.player.hp);
  }

  reset() {
    this.hp = CONFIG.player.hp;
    this.alive = true;
    this.crashed = false;
    this.missilesLeft = CONFIG.player.missileCount;
    this.flaresLeft = CONFIG.player.flareCount;
    this.score = 0;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.object.position.set(0, 600, 3000);
    this.object.rotation.set(0, 0, 0);
    this.object.quaternion.identity();
    this.flight.speed = CONFIG.flight.cruiseSpeed;
  }

  update(dt: number, input: Input, terrain: Terrain, onCrash: () => void) {
    if (!this.alive) return;
    this.flight.throttle = input.throttle;
    this.flight.update(dt, input, input.afterburner);
    this.setAfterburner(input.afterburner);
    this.contrails.update(dt, this.flight.speed, this.flight.gForce);

    // Weltgrenzen: sanft zurückdrehen (unsichtbare Wand über Warning)
    const half = CONFIG.world.size / 2 - 300;
    const p = this.position;
    if (Math.abs(p.x) > half || Math.abs(p.z) > half) {
      p.x = THREE.MathUtils.clamp(p.x, -half, half);
      p.z = THREE.MathUtils.clamp(p.z, -half, half);
    }

    // Terrain-Kollision
    const ground = terrain.getHeight(p.x, p.z);
    if (p.y <= ground + 4) {
      p.y = ground + 4;
      this.alive = false;
      this.crashed = true;
      onCrash();
    }
    // Decke
    if (p.y > 9000) p.y = 9000;

    this.cannonCooldown -= dt;
  }

  canFireCannon(): boolean {
    return this.cannonCooldown <= 0;
  }
  firedCannon() {
    this.cannonCooldown = 60 / CONFIG.player.cannonRPM;
  }
}
