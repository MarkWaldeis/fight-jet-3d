import * as THREE from 'three';
import { Aircraft } from './Aircraft';
import { CONFIG } from '../config';
import type { Terrain } from '../world/Terrain';
import { getJetDef, jetFxVectors, type JetDef, type JetId } from './JetCatalog';

type AIState = 'patrol' | 'pursue' | 'attack' | 'evade';

// KI-Gegner: nutzt dieselben Jet-Assets wie der Hangar (F-16/F-35/Elite).
// Zustandsautomat (Patrouille → Verfolgung → Angriff → Ausweichen),
// steuert den Jet über dieselben Achsen wie der Spieler.
export class EnemyJet extends Aircraft {
  readonly isPlayer = false;
  readonly jetId: JetId;
  /** Jet-Def aus dem Katalog (Mündungen, Streuung, RPM) */
  readonly loadout: JetDef;
  state: AIState = 'patrol';
  cannonCooldown = 0;
  respawnTimer = 0;
  private waypoint = new THREE.Vector3();
  private thinkTimer = Math.random();
  private evadeTimer = 0;
  private burstTimer = 0;
  private input = { pitch: 0, roll: 0, yaw: 0 };
  private muzzleCache: THREE.Vector3[];
  private readonly maxHp: number;

  constructor(index: number, jetId: JetId = 'f16') {
    const def = getJetDef(jetId);
    // Banditen-Version des Jets: etwas weniger HP als die Spieler-Variante
    const hp = Math.round(def.stats.hp * 0.55);
    super(`BANDIT ${index + 1} · ${def.name}`, { bodyColor: 0x8a6a52, accentColor: 0xd8c23a }, hp, 'enemy');
    this.jetId = jetId;
    this.loadout = def;
    this.maxHp = hp;
    this.muzzleCache = jetFxVectors(def).muzzles;
    // KI fliegt etwas unter den Spieler-Werten, behält aber den Jet-Charakter
    this.flight.speedMult = def.stats.speedMult * 0.95;
    this.flight.turnMult = def.stats.turnMult * 0.8;
    this.pickWaypoint();
  }

  /** Mündungen der Bordkanone(n) in Jet-lokalen Koordinaten. */
  getMuzzles(): THREE.Vector3[] {
    return this.muzzleCache;
  }

  get cannonRPM(): number {
    return this.loadout.stats.cannonRPM;
  }

  spawn(awayFrom: THREE.Vector3) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3000 + Math.random() * 3000;
    this.position.set(
      THREE.MathUtils.clamp(awayFrom.x + Math.cos(angle) * dist, -8000, 8000),
      700 + Math.random() * 800,
      THREE.MathUtils.clamp(awayFrom.z + Math.sin(angle) * dist, -8000, 8000)
    );
    this.object.quaternion.identity();
    this.flight.speed = CONFIG.enemy.speed * this.flight.speedMult;
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'patrol';
    this.pickWaypoint();
  }

  private pickWaypoint() {
    this.waypoint.set(
      (Math.random() * 2 - 1) * 7000,
      500 + Math.random() * 1200,
      (Math.random() * 2 - 1) * 7000
    );
  }

  wantsToFire(): boolean {
    return this.burstTimer > 0;
  }

  update(dt: number, player: Aircraft, terrain: Terrain) {
    if (!this.alive) return;
    const E = CONFIG.enemy;
    this.thinkTimer -= dt;
    this.cannonCooldown -= dt;
    this.burstTimer -= dt;

    // --- Denken (niedrige Frequenz) ---
    if (this.thinkTimer <= 0) {
      this.thinkTimer = E.thinkInterval;
      const distToPlayer = player.alive ? this.position.distanceTo(player.position) : Infinity;

      switch (this.state) {
        case 'patrol':
          if (distToPlayer < 2600) this.state = 'pursue';
          if (this.position.distanceTo(this.waypoint) < 400) this.pickWaypoint();
          break;
        case 'pursue':
          if (distToPlayer < 1100 && this.isTargetInFront(player, 30)) this.state = 'attack';
          if (distToPlayer > 4500) this.state = 'patrol';
          if (Math.random() < E.skillEvasionChance * 0.1) this.startEvade();
          break;
        case 'attack':
          if (distToPlayer > 1600) this.state = 'pursue';
          if (this.isTargetInFront(player, E.fireConeDeg) && distToPlayer < E.fireRange && this.cannonCooldown <= 0) {
            this.burstTimer = E.burstLength;
            this.cannonCooldown = 1.2 + Math.random();
          }
          if (Math.random() < E.skillEvasionChance * 0.06) this.startEvade();
          break;
        case 'evade':
          this.evadeTimer -= E.thinkInterval;
          if (this.evadeTimer <= 0) this.state = 'pursue';
          break;
      }
    }

    // --- Steuern (jede Iteration): Zielpunkt ansteuern ---
    let aimPoint: THREE.Vector3;
    switch (this.state) {
      case 'patrol': aimPoint = this.waypoint; break;
      case 'pursue': aimPoint = player.position; break;
      case 'attack': {
        // Vorhalt: auf den Punkt zielen, wo der Spieler sein wird
        const t = this.position.distanceTo(player.position) / 800;
        aimPoint = player.position.clone().addScaledVector(player.forward, player.flight.speed * t);
        break;
      }
      case 'evade': {
        // Weg vom Spieler + Richtungswechsel
        const away = this.position.clone().sub(player.position).normalize();
        aimPoint = this.position.clone().addScaledVector(away, 1000);
        aimPoint.y = this.position.y + (Math.random() - 0.3) * 600;
        break;
      }
    }

    this.steerTowards(aimPoint, dt, terrain);
    this.flight.throttle = this.state === 'attack' ? 0.95 : 0.75;
    this.flight.update(dt, this.input, this.state === 'pursue' && Math.random() > 0.5);
    const ab = this.state === 'pursue' && this.flight.speed > CONFIG.flight.maxSpeed * this.flight.speedMult - 40;
    this.updateEngineFx(dt, this.flight.throttle, ab);
    this.contrails.update(dt, this.flight.speed, this.flight.gForce);

    // Terrain-Vermeidung (Notfall-Pull-Up, positives Pitch = Nase hoch)
    const ground = terrain.getHeight(this.position.x, this.position.z);
    if (this.position.y < ground + 120) {
      this.input.pitch = 1;
    }
    if (this.position.y > 6000) this.position.y = 6000;
  }

  private startEvade() {
    this.state = 'evade';
    this.evadeTimer = 1.5 + Math.random() * 1.5;
  }

  private isTargetInFront(target: Aircraft, coneDeg: number): boolean {
    const to = target.position.clone().sub(this.position).normalize();
    return this.forward.angleTo(to) < THREE.MathUtils.degToRad(coneDeg);
  }

  // Dreht den Jet sanft Richtung aimPoint — Pitch/Roll aus lokalem Fehlervektor.
  // Vorzeichen wie im FlightModel: +Pitch = Nase hoch, +Roll = rechts einrollen,
  // +Yaw = Nase nach links.
  private steerTowards(aimPoint: THREE.Vector3, _dt: number, terrain: Terrain) {
    const local = this.object.worldToLocal(aimPoint.clone());
    // Pitch: Ziel über mir (local.y > 0) → Nase hoch (positiv)
    this.input.pitch = THREE.MathUtils.clamp(local.y / 120, -1, 1);
    // Roll: auf lokale X-Richtung einrollen
    const targetRoll = THREE.MathUtils.clamp(local.x / 200, -1, 1);
    // Schräglage nivellieren: lokale Rechts-Achse zeigt bei Rechts-Querlage
    // nach unten (right.y < 0) → gegenrollen
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.object.quaternion);
    const bankLevel = THREE.MathUtils.clamp(right.y * 1.5, -1, 1);
    this.input.roll = THREE.MathUtils.clamp(targetRoll * 1.6 + bankLevel, -1, 1);
    // Yaw: Ziel rechts (local.x > 0) → Nase nach rechts (negativ)
    this.input.yaw = THREE.MathUtils.clamp(-local.x / 600, -1, 1);

    // Mindesthöhe halten
    const ground = terrain.getHeight(this.position.x, this.position.z);
    if (this.position.y < ground + 200 && local.y < 2) {
      this.input.pitch = Math.max(this.input.pitch, 0.5);
    }
  }
}
