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
import { getJetDef, jetFxVectors, JET_CATALOG, type JetId } from './aircraft/JetCatalog';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory';

/** Bildschirmposition in Prozent (0–100), CSS left/top */
export type ScreenPos = { x: number; y: number; visible: boolean };

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
  autoTrack: boolean;
  /** War Thunder Dual/Triple-Reticle */
  mouseReticle: ScreenPos;   // Reticle 1: Maus-Zielkreuz
  velocityVector: ScreenPos; // Reticle 2: Velocity Vector
  gunCrosshair: ScreenPos;   // Reticle 3: Nase / Gun
  manualOverride: boolean;
  airbrake: boolean;
  radar: { x: number; y: number; isEnemy: boolean; locked: boolean }[];
  /** Welt→Bildschirm Marker über Gegnern (HP + Distanz) */
  worldMarkers: {
    x: number; // % Bildschirm
    y: number;
    name: string;
    hp: number;
    maxHp: number;
    distM: number;
    locked: boolean;
    visible: boolean;
  }[];
  /** Strukturierter Schaden für Damage-Panel */
  damage: {
    hullPct: number;
    status: string;
    systems: { name: string; ok: boolean }[];
  };
  // Mission
  waveIndex: number;      // 0-basiert
  waveCount: number;
  waveLabel: string;
  samsLeft: number;
  waveBanner: string | null; // großer Einblendetext (neue Welle)
  selectedJetId: JetId;
  jetName: string;
  /** Kill-Confirm-Popup (Gegner abgeschossen) */
  killPopup: {
    id: number;
    title: string;
    targetName: string;
    points: number;
    kind: 'air' | 'ground';
  } | null;
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
  private killPopup: HudData['killPopup'] = null;
  private killPopupTimer = 0;
  private killPopupSeq = 0;
  private selectedJetId: JetId = 'f16';
  /** Cache geladener Visuals pro Jet-Id */
  private visualCache = new Map<JetId, THREE.Object3D>();
  /** Laufende Lade-Promises pro Jet-Id (verhindert Doppel-Loads) */
  private visualPromises = new Map<JetId, Promise<THREE.Object3D | null>>();

  private aimDir = new THREE.Vector3(0, 0, -1);
  private _ndc = new THREE.Vector3();
  private _proj = new THREE.Vector3();
  private onContextMenu = (e: Event) => e.preventDefault();

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    this.input.setCanvas(canvas);
    canvas.addEventListener('contextmenu', this.onContextMenu);

    this.terrain = new Terrain();
    this.sea = new Sea();
    this.sky = new Sky();
    this.engine.scene.add(this.terrain.mesh, this.sea.mesh, this.sky.group, this.effects.group);

    this.engine.scene.add(this.player.object);
    this.player.applyLoadout(getJetDef(this.selectedJetId));
    this.player.reset();

    // Startaufstellung für das Menü (ruhige Szene)
    this.spawnWave(0, true);

    this.cannons = new CannonSystem(this.engine.scene);
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();

    // Default-Jet im Hangar vorladen + alle Katalog-Jets für die Gegner
    void this.ensureJetVisual(this.selectedJetId);
    for (const j of JET_CATALOG) void this.loadJetTemplate(j.id);
  }

  getSelectedJetId() {
    return this.selectedJetId;
  }

  /** Hangar: Jet wählen (lädt GLB, wendet Stats an). */
  async selectJet(id: JetId) {
    this.selectedJetId = id;
    const def = getJetDef(id);
    this.player.applyLoadout(def);
    this.player.reset();
    await this.ensureJetVisual(id);
    this.cam.snapBehind(this.player.object);
    this.emitHud();
  }

  /** Lädt (oder holt aus dem Cache) das GLB-Template eines Jets. */
  private loadJetTemplate(id: JetId): Promise<THREE.Object3D | null> {
    const cached = this.visualCache.get(id);
    if (cached) return Promise.resolve(cached);

    let p = this.visualPromises.get(id);
    if (!p) {
      const def = getJetDef(id);
      if (!def.modelUrl) return Promise.resolve(null);
      p = loadJetGlb(def.modelUrl, def.modelOrient)
        .then(({ group, size }) => {
          this.visualCache.set(id, group);
          console.info(
            `[FightJet] Jet ${id} geladen (${def.modelUrl}) size≈` +
              `${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m` +
              (def.modelOrient ? ` orient=${JSON.stringify(def.modelOrient)}` : '')
          );
          return group;
        })
        .catch((err) => {
          console.warn(`[FightJet] Jet ${id} konnte nicht geladen werden:`, err);
          return null;
        });
      this.visualPromises.set(id, p);
    }
    return p;
  }

  private async ensureJetVisual(id: JetId) {
    const template = await this.loadJetTemplate(id);
    if (!template) return;

    // Frische Kopie für den Spieler (Cache behält Template) + FX-Anker des Jets
    const instance = template.clone(true);
    this.player.applyExternalVisual(instance, jetFxVectors(getJetDef(id)));
    this.cam.snapBehind(this.player.object);
  }

  onHud(cb: (d: HudData) => void) {
    this.hudListeners.push(cb);
  }

  async startGame(jetId?: JetId) {
    if (jetId) await this.selectJet(jetId);
    else await this.ensureJetVisual(this.selectedJetId);

    this.sound.init();
    this.player.applyLoadout(getJetDef(this.selectedJetId));
    this.player.reset();
    this.clearActors();
    this.waveIndex = 0;
    this.waveDelay = 0;
    this.spawnWave(0);
    this.cam.snapBehind(this.player.object);
    this.state = 'playing';
    this.setPlayCursor(true);
    this.emitHud();
  }

  /** Zurück ins Hauptmenü (Hangar). */
  returnToMenu() {
    this.state = 'menu';
    this.clearActors();
    this.spawnWave(0, true);
    this.player.reset();
    this.cam.snapBehind(this.player.object);
    this.setPlayCursor(false);
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
      this.setPlayCursor(false);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.setPlayCursor(true);
    }
    this.emitHud();
  }

  /** System-Cursor ausblenden — Aim-Reticle ist der Cursor */
  private setPlayCursor(playing: boolean) {
    this.engine.renderer.domElement.style.cursor = playing ? 'none' : '';
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

    // Bandits — zufällige Jets aus dem Katalog (gleiche Assets wie der Hangar)
    for (let i = 0; i < wave.bandits; i++) {
      const jetId = JET_CATALOG[Math.floor(Math.random() * JET_CATALOG.length)].id;
      const e = new EnemyJet(this.enemyCounter++, jetId);
      e.spawn(this.player.position);
      this.enemies.push(e);
      this.engine.scene.add(e.object);
      this.applyEnemyVisual(e);
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

  /** Hängt das GLB-Visual des zugewiesenen Jets an einen Gegner (sobald geladen). */
  private applyEnemyVisual(e: EnemyJet) {
    void this.loadJetTemplate(e.jetId).then((template) => {
      if (template && e.alive) {
        e.applyExternalVisual(template.clone(true), jetFxVectors(e.loadout));
      }
    });
  }

  private update = (dt: number) => {
    this.time += dt;

    // Globale Tasten
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.togglePause();
    // V = Cockpit / Chase umschalten
    if (this.input.wasPressed('KeyV') && this.state === 'playing') {
      this.cam.toggleCockpit();
    }
    if (this.input.wasPressed('Enter') &&
        (this.state === 'menu' || this.state === 'gameover' || this.state === 'victory')) {
      this.startGame();
    }

    // Free-Look vor Input-Update lesen (C halten / RMB)
    const freeHeldPreview = this.input.isDown('KeyC') || this.input.rightMouse;
    this.input.update(dt, {
      freeLook: freeHeldPreview || this.cam.isFreeLook,
      playing: this.state === 'playing',
    });

    if (this.state === 'playing') {
      this.updatePlaying(dt);
    }

    // Welt läuft immer weiter
    this.sky.update(dt, this.player.position);
    this.sea.update(this.time);
    this.effects.update(dt);
    this.cannons.update(dt);
    if (this.waveBannerTimer > 0) this.waveBannerTimer -= dt;
    if (this.killPopupTimer > 0) {
      this.killPopupTimer -= dt;
      if (this.killPopupTimer <= 0) this.killPopup = null;
    }

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

    // Free-Look: C halten / RMB — Jet behält Kurs, Kamera orbitet
    const free = this.input.freeLookHeld || this.cam.isFreeLook;
    const savedPitch = this.input.pitch;
    const savedRoll = this.input.roll;
    const savedYaw = this.input.yaw;
    if (free) {
      this.input.pitch = 0;
      this.input.roll = 0;
      this.input.yaw = 0;
    }

    // Mouse-Aim: Strahl von Kamera durch Aim-Reticle → Welt-Richtung
    this.computeAimDir();

    // --- Spieler (FBW + Manual Override) ---
    player.update(
      dt,
      this.input,
      this.terrain,
      () => {
        this.effects.explosion(player.position, true);
        this.sound.explosion(true);
        this.state = 'gameover';
        this.setPlayCursor(false);
      },
      {
        aimDir: this.aimDir,
        mouseAim: !free && !this.input.manualOverride,
        freeLook: free,
      }
    );

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
        const assist =
          player.lockProgress >= 1 && player.lockTarget?.alive ? player.lockTarget : null;
        this.cannons.fire(
          player,
          target,
          this.effects,
          (victim, dmg) => this.onHit(victim, dmg, player),
          assist
        );
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
            this.enemyFireTimers.set(e, 60 / e.cannonRPM);
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
              this.showKillPopup((victim as SamSite).name ?? 'SAM SITE', CONFIG.score.samKill, 'ground');
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
    const trackPos =
      !free &&
      player.lockProgress >= 1 &&
      player.lockTarget?.alive
        ? player.lockTarget.object.position
        : null;
    this.cam.update(
      dt,
      player.object,
      player.flight.speed,
      this.engine.camera,
      lookDelta,
      trackPos,
      {
        freeLookHeld: this.input.freeLookHeld,
        gForce: player.flight.gForce,
        afterburner: this.input.afterburner && player.alive,
        firing: this.input.cannon && player.alive,
        stalled: player.flight.stalled && player.alive,
        airbrake: this.input.airbrake,
        camFit: player.camFit,
        rollRate: player.flight.rollRateActual,
        bank: player.flight.bankSigned,
      }
    );
    this.sound.updateEngine(
      player.flight.speed / CONFIG.flight.afterburnerSpeed,
      this.input.throttle,
      this.input.afterburner && player.alive,
      dt
    );
    this.sound.setLockTone(player.alive ? player.lockProgress : 0);
    if (player.flight.stalled && player.alive) this.sound.stallWarning(true);
  }

  /** Unproject Aim-NDC → Welt-Richtungsvektor für FBW */
  private computeAimDir() {
    const cam = this.engine.camera;
    const margin = CONFIG.flight.aimMargin;
    const ax = THREE.MathUtils.clamp(this.input.aimX, -margin, margin);
    const ay = THREE.MathUtils.clamp(this.input.aimY, -margin, margin);

    // Ray durch Near-Plane-Punkt
    this._ndc.set(ax, ay, 0.5);
    this._ndc.unproject(cam);
    this.aimDir.copy(this._ndc).sub(cam.position).normalize();

    // Fallback: wenn unproject degeneriert, Nase nutzen
    if (this.aimDir.lengthSq() < 0.5) {
      this.aimDir.copy(this.player.forward);
    }
  }

  /** Weltpunkt → HUD % Position */
  private projectToScreen(world: THREE.Vector3): ScreenPos {
    this._proj.copy(world).project(this.engine.camera);
    const inFront = this._proj.z < 1;
    const onScreen =
      inFront &&
      this._proj.x > -1.35 &&
      this._proj.x < 1.35 &&
      this._proj.y > -1.35 &&
      this._proj.y < 1.35;
    return {
      x: THREE.MathUtils.clamp((this._proj.x * 0.5 + 0.5) * 100, 0, 100),
      y: THREE.MathUtils.clamp((-this._proj.y * 0.5 + 0.5) * 100, 0, 100),
      visible: onScreen,
    };
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
        this.setPlayCursor(false);
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
    const player = this.player;
    const lockRange = player.lockRange;
    const lockTime = player.lockTime;
    const cone = THREE.MathUtils.degToRad(player.lockAngleDeg);

    const targets: Damageable[] = [
      ...this.enemies.filter((e) => e.alive),
      ...this.sams.filter((s) => s.alive),
    ];

    const valid = (t: Damageable | null): t is Damageable =>
      !!t && t.alive &&
      t.object.position.distanceTo(player.position) < lockRange &&
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
      player.lockProgress = Math.min(1, player.lockProgress + dt / lockTime);
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
        this.showKillPopup((victim as SamSite).name ?? 'SAM SITE', CONFIG.score.samKill, 'ground');
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
    this.showKillPopup(e.name, CONFIG.score.kill, 'air');
    if (this.player.lockTarget === (e as unknown as Damageable)) this.clearLock();
  }

  /** Kill-Confirm-Popup für HUD (Glass Splash) */
  private showKillPopup(targetName: string, points: number, kind: 'air' | 'ground') {
    this.killPopupSeq += 1;
    const titles =
      kind === 'air'
        ? ['SPLASH ONE', 'KILL CONFIRMED', 'BANDIT DOWN', 'TARGET DESTROYED']
        : ['SAM DESTROYED', 'GROUND KILL', 'SITE CLEARED'];
    this.killPopup = {
      id: this.killPopupSeq,
      title: titles[this.killPopupSeq % titles.length],
      targetName,
      points,
      kind,
    };
    this.killPopupTimer = 2.8;
    this.emitHud();
  }

  private onPlayerKilled() {
    this.effects.explosion(this.player.position, true);
    this.sound.explosion(true);
    this.state = 'gameover';
    this.setPlayCursor(false);
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

    // Gegner-Marker (Leiste über dem Jet + Distanz)
    const worldMarkers: HudData['worldMarkers'] = [];
    if (this.state === 'playing' || this.state === 'paused') {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        // Marker etwas über dem Jet
        const world = e.object.position.clone().add(new THREE.Vector3(0, 8, 0));
        const ndc = world.project(this.engine.camera);
        const inFront = ndc.z < 1 && ndc.x > -1.2 && ndc.x < 1.2 && ndc.y > -1.2 && ndc.y < 1.2;
        const distM = Math.round(e.position.distanceTo(p.position));
        worldMarkers.push({
          x: THREE.MathUtils.clamp((ndc.x * 0.5 + 0.5) * 100, 1, 99),
          y: THREE.MathUtils.clamp((-ndc.y * 0.5 + 0.5) * 100, 1, 99),
          name: e.name,
          hp: Math.max(0, Math.round(e.hp)),
          maxHp: e.maxHpPublic,
          distM,
          locked: p.lockTarget === (e as unknown as Damageable) && p.lockProgress >= 1,
          visible: inFront && distM < 6000,
        });
      }
    }

    const hullPct = Math.round((Math.max(0, p.hp) / Math.max(1, p.maxHp)) * 100);
    let dmgStatus = 'NOMINAL';
    if (hullPct <= 25) dmgStatus = 'CRITICAL';
    else if (hullPct <= 50) dmgStatus = 'HEAVY DAMAGE';
    else if (hullPct <= 75) dmgStatus = 'LIGHT DAMAGE';
    const damage: HudData['damage'] = {
      hullPct,
      status: dmgStatus,
      systems: [
        { name: 'ENGINE', ok: hullPct > 20 },
        { name: 'FLIGHT CTRL', ok: hullPct > 35 },
        { name: 'RADAR', ok: hullPct > 40 },
        { name: 'WEAPONS', ok: hullPct > 15 },
        { name: 'HYDRAULICS', ok: hullPct > 50 },
      ],
    };

    // Triple-Reticle — Gun-Boresight aus echten Mündungen (pro Jet kalibriert)
    const aimDist = 800;
    const gunWorld = p.getGunBoresight(aimDist);
    const velWorld = p.position
      .clone()
      .addScaledVector(p.flight.velocityDir, aimDist);
    const gunCrosshair = this.projectToScreen(gunWorld);
    const velocityVector = this.projectToScreen(velWorld);
    // Maus-Reticle: NDC → %
    const mouseReticle: ScreenPos = {
      x: (this.input.aimX * 0.5 + 0.5) * 100,
      y: (-this.input.aimY * 0.5 + 0.5) * 100,
      visible: this.state === 'playing' && !this.cam.isFreeLook,
    };

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
      autoTrack: this.cam.isTracking && p.lockProgress >= 1,
      mouseReticle,
      velocityVector,
      gunCrosshair,
      manualOverride: this.input.manualOverride,
      airbrake: this.input.airbrake,
      gForce: p.flight.gForce,
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: p.maxHp,
      score: p.score,
      missiles: p.missilesLeft,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
      lockProgress: p.lockProgress,
      lockedTargetName: p.lockProgress >= 1 && p.lockTarget ? p.lockTarget.name : null,
      lockScreen,
      warning,
      radar,
      worldMarkers,
      damage,
      waveIndex: this.waveIndex,
      waveCount: CONFIG.mission.waves.length,
      waveLabel: wave.label,
      samsLeft: this.sams.filter((s) => s.alive).length,
      waveBanner: this.waveBannerTimer > 0 ? this.waveBanner : null,
      selectedJetId: this.selectedJetId,
      jetName: this.player.loadout.name,
      killPopup: this.killPopup,
    };
    for (const cb of this.hudListeners) cb(data);
  }

  private render = () => {
    this.engine.render();
  };

  /** Einstellungen: Sound */
  setSoundMuted(muted: boolean) {
    this.sound.setMuted(muted);
  }

  setSoundVolume(volume: number) {
    this.sound.setMasterVolume(volume);
  }

  dispose() {
    this.loop.stop();
    this.input.dispose();
    this.engine.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.engine.dispose();
  }
}
