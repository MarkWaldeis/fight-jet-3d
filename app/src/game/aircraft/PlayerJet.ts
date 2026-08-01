import * as THREE from 'three';
import { Aircraft } from './Aircraft';
import { CONFIG } from '../config';
import type { Input } from '../core/Input';
import type { Terrain } from '../world/Terrain';
import type { Damageable } from '../combat/GroundTarget';
import { getJetDef, jetFxVectors, type JetDef, type JetId } from './JetCatalog';

// Spieler-Jet: Stats & Loadout kommen aus dem Hangar (JetDef).
export class PlayerJet extends Aircraft {
  readonly isPlayer = true;
  jetId: JetId = 'f16';
  loadout: JetDef = getJetDef('f16');
  missilesLeft: number = CONFIG.player.missileCount;
  flaresLeft: number = CONFIG.player.flareCount;
  cannonCooldown = 0;
  lockTarget: Damageable | null = null;
  lockProgress = 0;
  score = 0;
  crashed = false;
  /** Kanonen-Mündungen des gewählten Jets (lokal, aus dem Katalog). */
  private muzzleCache: THREE.Vector3[] = jetFxVectors(getJetDef('f16')).muzzles;

  constructor() {
    super('VIPER 01', { bodyColor: 0x9aa4ae, accentColor: 0xc8352e }, CONFIG.player.hp, 'us', true);
    this.applyLoadout(getJetDef('f16'));
  }

  applyLoadout(def: JetDef) {
    this.jetId = def.id;
    this.loadout = def;
    // name is readonly on Aircraft — we store callsign in loadout for HUD
    this.hp = def.stats.hp;
    this.missilesLeft = def.stats.missiles;
    this.flaresLeft = def.stats.flareCount;
    this.flight.speedMult = def.stats.speedMult;
    this.flight.turnMult = def.stats.turnMult;
    this.muzzleCache = jetFxVectors(def).muzzles;
  }

  /** Mündungen der Bordkanone(n) in Jet-lokalen Koordinaten. */
  getMuzzles(): THREE.Vector3[] {
    return this.muzzleCache;
  }

  reset() {
    const s = this.loadout.stats;
    this.hp = s.hp;
    this.alive = true;
    this.crashed = false;
    this.missilesLeft = s.missiles;
    this.flaresLeft = s.flareCount;
    this.score = 0;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.flight.speedMult = s.speedMult;
    this.flight.turnMult = s.turnMult;
    this.object.position.set(0, 900, 3000);
    this.object.rotation.set(0, 0, 0);
    this.object.quaternion.identity();
    this.flight.speed = CONFIG.flight.cruiseSpeed * s.speedMult;
  }

  get maxHp() {
    return this.loadout.stats.hp;
  }
  get cannonDamage() {
    return this.loadout.stats.cannonDamage;
  }
  get lockRange() {
    return this.loadout.stats.lockRange;
  }
  get lockTime() {
    return this.loadout.stats.lockTime;
  }
  get lockAngleDeg() {
    return this.loadout.stats.lockAngleDeg;
  }

  update(dt: number, input: Input, terrain: Terrain, onCrash: () => void) {
    if (!this.alive) return;
    this.flight.throttle = input.throttle;
    this.flight.update(dt, input, input.afterburner);
    this.updateEngineFx(dt, input.throttle, input.afterburner);
    this.contrails.update(dt, this.flight.speed, this.flight.gForce);

    const half = CONFIG.world.size / 2 - 300;
    const p = this.position;
    if (Math.abs(p.x) > half || Math.abs(p.z) > half) {
      p.x = THREE.MathUtils.clamp(p.x, -half, half);
      p.z = THREE.MathUtils.clamp(p.z, -half, half);
    }

    const ground = terrain.getHeight(p.x, p.z);
    if (p.y <= ground + 4) {
      p.y = ground + 4;
      this.alive = false;
      this.crashed = true;
      onCrash();
    }
    if (p.y > 9000) p.y = 9000;

    this.cannonCooldown -= dt;
  }

  canFireCannon(): boolean {
    return this.cannonCooldown <= 0;
  }
  firedCannon() {
    this.cannonCooldown = 60 / this.loadout.stats.cannonRPM;
  }
}
