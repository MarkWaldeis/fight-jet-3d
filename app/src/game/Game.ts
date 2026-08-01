import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine } from './core/Engine';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { Terrain, Sea } from './world/Terrain';
import { Sky } from './world/Sky';
import { PlayerJet } from './aircraft/PlayerJet';
import { EnemyJet } from './aircraft/EnemyJet';
import { CameraController } from './aircraft/CameraController';
import { CannonSystem, Missile } from './combat/Weapons';
import { Effects } from './combat/Effects';
import { SamSite, type Damageable } from './combat/GroundTarget';
import { SoundManager } from './audio/SoundManager';
import { loadJetGlb } from './aircraft/GlbJetLoader';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory';

/** Test: externes GLB als Spieler-Jet (Vite public/). Leerer String = prozedurales F-16. */
const PLAYER_GLB_URL = './models/player-jet.glb';

// Daten, die das React-HUD jede Frame (gedrosselt) bekommt.
export interface HudData {
  state: GameState;
  speedKnots: number;
  altitudeFt: number;
  headingDeg: number;
  throttle: number;
  afterburner: boolean;
  stalled: boolean;
  gForce: number;
  hp: number;
  maxHp: number;
  score: number;
  missiles: number;
  enemiesAlive: number;
  lockProgress: number; // 0=kein, 0..1 suchend, 1=lock
  lockedTargetName: string | null;
  lockScreen: { x: number; y: number } | null;
  warning: string | null;
  freeLook: boolean;
  radar: { x: number; y: number; isEnemy: boolean; locked: boolean }[];
  // Mission
  waveIndex: number;      // 0-basiert
  waveCount: number;
  waveLabel: string;
  samsLeft: number;
  waveBanner: string | null; // großer Einblendetext (neue Welle)
}

export class Game {
  private engine: Engine;
  private loop: GameLoop;
  private input = new Input();
  private terrain: Terrain;
  private sea: Sea;
  private sky: Sky;
  private player = new PlayerJet();
  private enemies: EnemyJet[] = [];
  private sams: SamSite[] = [];
  private cam = new CameraController();
  private cannons: CannonSystem;
  private effects = new Effects();
  private sound = new SoundManager();
  private missiles: Missile[] = [];
  private state: GameState = 'menu';
  private hudListeners: ((d: HudData) => void)[] = [];
  private hudTimer = 0;
  private time = 0;
  private enemyFireTimers: Map<EnemyJet, number> = new Map();
  // Mission
  private waveIndex = 0;
  private waveDelay = 0;
  private waveBanner = '';
  private waveBannerTimer = 0;
  private enemyCounter = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    this.terrain = new Terrain();
    this.sea = new Sea();
    this.sky = new Sky();
    this.engine.scene.add(this.terrain.mesh, this.sea.mesh, this.sky.group, this.effects.group);

    this.engine.scene.add(this.player.object);
    this.player.reset();

    // Startaufstellung für das Menü (ruhige Szene)
    this.spawnWave(0, true);

    this.cannons = new CannonSystem(this.engine.scene);
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();

    // Test: externes GLB als Spieler-Modell (async, Fallback bleibt prozedural)
    if (PLAYER_GLB_URL) {
      void this.loadPlayerGlb(PLAYER_GLB_URL);
    }
  }

  private async loadPlayerGlb(url: string) {
    try {
      const { group, size } = await loadJetGlb(url);
      this.player.applyExternalVisual(group);
      this.cam.snapBehind(this.player.object);
      console.info(
        `[FightJet] Player-GLB geladen (${url}) size≈` +
          `${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m`
      );
    } catch (err) {
      console.warn('[FightJet] Player-GLB konnte nicht geladen werden — prozedurales F-16 bleibt:', err);
    }
  }

  onHud(cb: (d: HudData) => void) {
    this.hudListeners.push(cb);
  }

  startGame() {
    this.sound.init();
    this.player.reset();
    this.clearActors();
    this.waveIndex = 0;
    this.waveDelay = 0;
    this.spawnWave(0);
    this.cam.snapBehind(this.player.object);
    this.state = 'playing';
    this.emitHud();
  }

  togglePause() {
    if (this.state === 'playing') {
      // Free-Look beenden bei Pause
      if (this.cam.isFreeLook) {
        this.cam.toggleFreeLook();
        if (document.pointerLockElement) document.exitPointerLock?.();
      }
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = 'playing';
    }
    this.emitHud();
  }

  /** Test/Debug: springt zur angegebenen Welle (0-basiert). */
  debugGotoWave(index: number) {
    this.clearActors();
    this.waveIndex = Math.max(0, Math.min(index, CONFIG.mission.waves.length - 1));
    this.waveDelay = 0;
    this.spawnWave(this.waveIndex);
    this.state = 'playing';
    this.emitHud();
  }

  get missionWaveIndex() {
    return this.waveIndex;
  }

  private clearActors() {
    for (const e of this.enemies) this.engine.scene.remove(e.object);
    this.enemies = [];
    for (const s of this.sams) this.engine.scene.remove(s.object);
    this.sams = [];
    for (const m of this.missiles) this.engine.scene.remove(m.object);
    this.missiles = [];
    this.enemyFireTimers.clear();
  }

  private spawnWave(index: number, forMenu = false) {
    const wave = CONFIG.mission.waves[index];
    if (!wave) return;

    // Tote Actor aus vorheriger Welle entfernen (Array + Szene sauber halten)
    for (const e of this.enemies) {
      if (!e.alive) this.engine.scene.remove(e.object);
    }
    this.enemies = this.enemies.filter((e) => e.alive);
    for (const s of this.sams) {
      if (!s.alive) this.engine.scene.remove(s.object);
    }
    this.sams = this.sams.filter((s) => s.alive);

    // Bandits
    for (let i = 0; i < wave.bandits; i++) {
      const e = new EnemyJet(this.enemyCounter++);
      e.spawn(this.player.position);
      this.enemies.push(e);
      this.engine.scene.add(e.object);
    }

    // SAM-Stellungen auf das Terrain setzen (mind. 1,5 km vom Spieler weg)
    for (let i = 0; i < wave.sams; i++) {
      let pos = new THREE.Vector3(
        this.player.position.x + 2000 + i * 400,
        50,
        this.player.position.z - 2500 - i * 300
      );
      for (let tries = 0; tries < 40; tries++) {
        const x = (Math.random() * 2 - 1) * 7000;
        const z = (Math.random() * 2 - 1) * 7000;
        const y = this.terrain.getHeight(x, z);
        if (y > 10 && y < 500 && this.player.position.distanceTo(new THREE.Vector3(x, y, z)) > 1500) {
          pos.set(x, y, z);
          break;
        }
      }
      // Terrain-Höhe final setzen (Fallback-Pos ebenfalls)
      pos.y = this.terrain.getHeight(pos.x, pos.z);
      const sam = new SamSite(i, pos);
      this.sams.push(sam);
      this.engine.scene.add(sam.object);
    }

    if (!forMenu) {
      this.waveBanner = wave.label;
      this.waveBannerTimer = 4;
    }
  }

  private update = (dt: number) => {
    this.time += dt;

    // Globale Tasten
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.togglePause();
    if (this.input.wasPressed('KeyC')) {
      this.cam.toggleCockpit();
    }
    // V = Free-Look (Orbit um Jet, Jet fliegt geradeaus weiter)
    if (this.input.wasPressed('KeyV') && this.state === 'playing') {
      this.cam.toggleFreeLook();
      // Pointer-Lock für flüssiges Maus-Orbit (ESC löst, V beendet Free-Look)
      if (this.cam.isFreeLook) {
        this.engine.renderer.domElement.requestPointerLock?.();
      } else if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
    if (this.input.wasPressed('Enter') &&
        (this.state === 'menu' || this.state === 'gameover' || this.state === 'victory')) {
      this.startGame();
    }
    this.input.update(dt);

    if (this.state === 'playing') {
      this.updatePlaying(dt);
    }

    // Welt läuft immer weiter
    this.sky.update(dt, this.player.position);
    this.sea.update(this.time);
    this.effects.update(dt);
    this.cannons.update(dt);
    if (this.waveBannerTimer > 0) this.waveBannerTimer -= dt;

    if (this.state === 'menu' || this.state === 'gameover' || this.state === 'victory') {
      // langsame Orbit-Kamera
      const t = this.time * 0.1;
      const p = this.player.position;
      this.engine.camera.position.set(p.x + Math.cos(t) * 40, p.y + 8, p.z + Math.sin(t) * 40);
      this.engine.camera.lookAt(p);
      this.engine.camera.up.set(0, 1, 0);
    }

    this.input.endFrame();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 30;
      this.emitHud();
    }
  };

  private updatePlaying(dt: number) {
    const player = this.player;

    // Free-Look: Jet behält Kurs (keine Stick-Eingabe), Kamera orbitet frei
    const free = this.cam.isFreeLook;
    const savedPitch = this.input.pitch;
    const savedRoll = this.input.roll;
    const savedYaw = this.input.yaw;
    if (free) {
      this.input.pitch = 0;
      this.input.roll = 0;
      this.input.yaw = 0;
    }

    // --- Spieler ---
    player.update(dt, this.input, this.terrain, () => {
      this.effects.explosion(player.position, true);
      this.sound.explosion(true);
      this.state = 'gameover';
    });

    if (free) {
      this.input.pitch = savedPitch;
      this.input.roll = savedRoll;
      this.input.yaw = savedYaw;
    }

    // --- Lock-On (Luft + Boden) ---
    this.updateLock(dt);

    // --- Spieler-Waffen ---
    if (player.alive) {
      if (this.input.cannon && player.canFireCannon()) {
        player.firedCannon();
        const target = this.pickCannonTarget();
        this.cannons.fire(player, target, this.effects, (victim, dmg) => this.onHit(victim, dmg, player));
        this.sound.cannonShot();
      }
      if (this.input.wasPressed('KeyM') || this.input.wasPressed('KeyF')) {
        if (player.missilesLeft > 0 && player.lockTarget && player.lockProgress >= 1) {
          player.missilesLeft--;
          const m = new Missile(
            player.lockTarget,
            player.position.clone().addScaledVector(player.forward, 8),
            player.forward,
            player,
            this.effects
          );
          this.missiles.push(m);
          this.engine.scene.add(m.object);
          this.sound.missileLaunch();
        }
      }
    }

    // --- Gegner ---
    for (const e of this.enemies) {
      if (e.alive) {
        e.update(dt, player, this.terrain);
        if (e.wantsToFire() && player.alive) {
          const timer = (this.enemyFireTimers.get(e) ?? 0) - dt;
          if (timer <= 0) {
            this.cannons.fire(e, player, this.effects, (victim, dmg) => this.onHit(victim, dmg, e));
            this.enemyFireTimers.set(e, 60 / CONFIG.player.cannonRPM);
          } else {
            this.enemyFireTimers.set(e, timer);
          }
        }
      } else {
        const done = e.updateDeath(dt);
        if (Math.random() < dt * 20) this.effects.damageSmoke(e.position);
        if (done) {
          // Wrack entfernen (kein Respawn im Missionsmodus)
          e.position.y = -9999;
        }
      }
    }

    // --- SAM-Stellungen ---
    for (const sam of this.sams) {
      sam.update(dt, player, (site) => {
        // SAM-Rakete auf den Spieler
        const m = new Missile(
          player,
          site.position.clone().add(new THREE.Vector3(0, 8, 0)),
          new THREE.Vector3(0, 1, 0),
          site,
          this.effects
        );
        this.missiles.push(m);
        this.engine.scene.add(m.object);
        this.sound.missileLaunch();
      });
      if (!sam.alive && Math.random() < dt * 6) {
        this.effects.damageSmoke(sam.position.clone().add(new THREE.Vector3(0, 4, 0)));
      }
    }

    // --- Raketen ---
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      const res = m.update(dt);
      if (res.expired) {
        if (res.hit) {
          const victim = res.hit;
          const isSam = this.sams.includes(victim as SamSite);
          const killed = victim.takeDamage(isSam ? CONFIG.missile.damage : CONFIG.missile.damage);
          if (victim.isPlayer) {
            if (killed) this.onPlayerKilled();
          } else if (isSam) {
            if (killed) {
              this.player.score += CONFIG.score.samKill;
              if (this.player.lockTarget === victim) this.clearLock();
            }
          } else if (killed) {
            this.onEnemyKilled(victim as unknown as EnemyJet);
          }
        }
        this.engine.scene.remove(m.object);
        this.missiles.splice(i, 1);
      }
    }

    // --- Spieler-Schadensrauch ---
    if (player.alive && player.hp < 40 && Math.random() < dt * 8) {
      this.effects.damageSmoke(player.position);
    }

    // --- Missions-Fortschritt ---
    this.updateMission(dt);

    // --- Kamera & Sound ---
    const lookDelta = free ? this.input.freeLookDelta(dt) : undefined;
    this.cam.update(dt, player.object, player.flight.speed, this.engine.camera, lookDelta);
    this.sound.updateEngine(
      player.flight.speed / CONFIG.flight.afterburnerSpeed,
      this.input.throttle,
      this.input.afterburner && player.alive,
      dt
    );
    this.sound.setLockTone(player.alive ? player.lockProgress : 0);
    if (player.flight.stalled && player.alive) this.sound.stallWarning(true);
  }

  private updateMission(dt: number) {
    const banditsLeft = this.enemies.filter((e) => e.alive).length;
    const samsLeft = this.sams.filter((s) => s.alive).length;

    if (banditsLeft > 0 || samsLeft > 0) {
      this.waveDelay = 0;
      return;
    }

    // Welle geschafft
    this.waveDelay += dt;
    if (this.waveDelay >= CONFIG.mission.waveDelay) {
      this.waveDelay = 0;
      this.waveIndex++;
      if (this.waveIndex >= CONFIG.mission.waves.length) {
        this.state = 'victory';
        this.emitHud();
      } else {
        this.spawnWave(this.waveIndex);
      }
    }
  }

  private clearLock() {
    this.player.lockTarget = null;
    this.player.lockProgress = 0;
  }

  private pickCannonTarget(): Damageable | null {
    let best: Damageable | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(this.player.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const s of this.sams) {
      if (!s.alive) continue;
      const d = s.position.distanceTo(this.player.position);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  private updateLock(dt: number) {
    const P = CONFIG.player;
    const player = this.player;
    const cone = THREE.MathUtils.degToRad(P.lockAngleDeg);

    const targets: Damageable[] = [
      ...this.enemies.filter((e) => e.alive),
      ...this.sams.filter((s) => s.alive),
    ];

    const valid = (t: Damageable | null): t is Damageable =>
      !!t && t.alive &&
      t.object.position.distanceTo(player.position) < P.lockRange &&
      player.forward.angleTo(t.object.position.clone().sub(player.position).normalize()) < cone;

    let target = player.lockTarget;
    if (!valid(target)) {
      target = null;
      let bestAngle = cone;
      for (const t of targets) {
        if (!valid(t)) continue;
        const a = player.forward.angleTo(t.object.position.clone().sub(player.position).normalize());
        if (a < bestAngle) { bestAngle = a; target = t; }
      }
      player.lockProgress = 0;
    }

    player.lockTarget = target;
    if (target) {
      player.lockProgress = Math.min(1, player.lockProgress + dt / P.lockTime);
    } else {
      player.lockProgress = 0;
    }
  }

  private onHit(victim: Damageable, dmg: number, shooter: Damageable) {
    const killed = victim.takeDamage(dmg);
    if (victim.isPlayer) {
      if (killed) this.onPlayerKilled();
      return;
    }
    const isSam = this.sams.includes(victim as SamSite);
    if (shooter.isPlayer) this.player.score += CONFIG.score.hitBonus;
    if (killed) {
      if (isSam) {
        this.effects.explosion((victim as SamSite).position.clone().add(new THREE.Vector3(0, 4, 0)), true);
        this.sound.explosion(true);
        this.player.score += CONFIG.score.samKill;
        if (this.player.lockTarget === victim) this.clearLock();
      } else {
        this.onEnemyKilled(victim as unknown as EnemyJet);
      }
    }
  }

  private onEnemyKilled(e: EnemyJet) {
    this.effects.explosion(e.position, true);
    this.sound.explosion(true);
    this.player.score += CONFIG.score.kill;
    if (this.player.lockTarget === (e as unknown as Damageable)) this.clearLock();
  }

  private onPlayerKilled() {
    this.effects.explosion(this.player.position, true);
    this.sound.explosion(true);
    this.state = 'gameover';
    this.emitHud();
  }

  private emitHud() {
    const p = this.player;
    const range = CONFIG.hud.radarRange;
    const radar: HudData['radar'] = [];
    const invQ = p.object.quaternion.clone().invert();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const rel = e.position.clone().sub(p.position).applyQuaternion(invQ);
      radar.push({
        x: THREE.MathUtils.clamp(rel.x / range, -1, 1),
        y: THREE.MathUtils.clamp(rel.z / range, -1, 1),
        isEnemy: true,
        locked: p.lockTarget === (e as unknown as Damageable) && p.lockProgress >= 1,
      });
    }
    for (const s of this.sams) {
      if (!s.alive) continue;
      const rel = s.position.clone().sub(p.position).applyQuaternion(invQ);
      radar.push({
        x: THREE.MathUtils.clamp(rel.x / range, -1, 1),
        y: THREE.MathUtils.clamp(rel.z / range, -1, 1),
        isEnemy: false, // Bodenziel = anderes Symbol
        locked: p.lockTarget === (s as unknown as Damageable) && p.lockProgress >= 1,
      });
    }

    let warning: string | null = null;
    if (p.flight.stalled && p.alive) warning = 'STALL';
    else if (p.hp < 30 && p.alive) warning = 'DAMAGE';
    const missileThreat = this.missiles.some((m) => m.targetIs(p));
    if (missileThreat) warning = 'MISSILE';

    // Lock-Ziel auf Bildschirm projizieren
    let lockScreen: HudData['lockScreen'] = null;
    if (p.lockTarget && p.lockTarget.alive) {
      const ndc = p.lockTarget.object.position.clone().project(this.engine.camera);
      if (ndc.z < 1) {
        lockScreen = {
          x: THREE.MathUtils.clamp((ndc.x * 0.5 + 0.5) * 100, 2, 98),
          y: THREE.MathUtils.clamp((-ndc.y * 0.5 + 0.5) * 100, 2, 98),
        };
      }
    }

    const wave = CONFIG.mission.waves[Math.min(this.waveIndex, CONFIG.mission.waves.length - 1)];
    const data: HudData = {
      state: this.state,
      speedKnots: Math.round(p.speedKnots),
      altitudeFt: Math.round(p.position.y * 3.281),
      headingDeg: Math.round(p.headingDeg),
      throttle: this.input.throttle,
      afterburner: this.input.afterburner,
      stalled: p.flight.stalled,
      freeLook: this.cam.isFreeLook,
      gForce: p.flight.gForce,
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: CONFIG.player.hp,
      score: p.score,
      missiles: p.missilesLeft,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
      lockProgress: p.lockProgress,
      lockedTargetName: p.lockProgress >= 1 && p.lockTarget ? p.lockTarget.name : null,
      lockScreen,
      warning,
      radar,
      waveIndex: this.waveIndex,
      waveCount: CONFIG.mission.waves.length,
      waveLabel: wave.label,
      samsLeft: this.sams.filter((s) => s.alive).length,
      waveBanner: this.waveBannerTimer > 0 ? this.waveBanner : null,
    };
    for (const cb of this.hudListeners) cb(data);
  }

  private render = () => {
    this.engine.render();
  };

  dispose() {
    this.loop.stop();
    this.input.dispose();
    this.engine.dispose();
  }
}
