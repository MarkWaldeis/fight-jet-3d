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
import { SoundManager } from './audio/SoundManager';
import type { Aircraft } from './aircraft/Aircraft';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover';

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
  warning: string | null;
  radar: { x: number; y: number; isEnemy: boolean; locked: boolean }[]; // normiert -1..1
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

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas);
    this.terrain = new Terrain();
    this.sea = new Sea();
    this.sky = new Sky();
    this.engine.scene.add(this.terrain.mesh, this.sea.mesh, this.sky.group, this.effects.group);

    this.engine.scene.add(this.player.object);
    this.player.reset();

    for (let i = 0; i < CONFIG.enemy.count; i++) {
      const e = new EnemyJet(i);
      e.spawn(this.player.position);
      this.enemies.push(e);
      this.engine.scene.add(e.object);
    }

    this.cannons = new CannonSystem(this.engine.scene);
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  onHud(cb: (d: HudData) => void) {
    this.hudListeners.push(cb);
  }

  startGame() {
    this.sound.init();
    this.player.reset();
    for (const e of this.enemies) e.spawn(this.player.position);
    for (const m of this.missiles) this.engine.scene.remove(m.object);
    this.missiles = [];
    this.cam.snapBehind(this.player.object);
    this.state = 'playing';
    this.emitHud();
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    this.emitHud();
  }

  private update = (dt: number) => {
    this.time += dt;

    // Globale Tasten
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) this.togglePause();
    if (this.input.wasPressed('KeyC')) {
      this.cam.mode = this.cam.mode === 'chase' ? 'cockpit' : 'chase';
    }
    if (this.input.wasPressed('Enter') && (this.state === 'menu' || this.state === 'gameover')) {
      this.startGame();
    }
    this.input.update(dt);

    if (this.state === 'playing') {
      this.updatePlaying(dt);
    }

    // Welt läuft immer weiter (Menü = ruhige Kamerafahrt)
    this.sky.update(dt, this.player.position);
    this.sea.update(this.time);
    this.effects.update(dt);
    this.cannons.update(dt);

    if (this.state === 'menu' || this.state === 'gameover') {
      // langsame Orbit-Kamera um den geparkten Jet
      const t = this.time * 0.1;
      const p = this.player.position;
      this.engine.camera.position.set(p.x + Math.cos(t) * 40, p.y + 8, p.z + Math.sin(t) * 40);
      this.engine.camera.lookAt(p);
      this.engine.camera.up.set(0, 1, 0);
    }

    this.input.endFrame();

    // HUD gedrosselt (30 Hz)
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 30;
      this.emitHud();
    }
  };

  private updatePlaying(dt: number) {
    const player = this.player;

    // --- Spieler ---
    player.update(dt, this.input, this.terrain, () => {
      this.effects.explosion(player.position, true);
      this.sound.explosion(true);
      this.state = 'gameover';
    });

    // --- Lock-On ---
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
        // Feind feuert
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
        // Absturz-Animation, dann Respawn
        const done = e.updateDeath(dt);
        if (Math.random() < dt * 20) this.effects.damageSmoke(e.position);
        e.respawnTimer += dt;
        if (e.respawnTimer > CONFIG.enemy.respawnDelay || done) {
          e.respawnTimer = 0;
          e.spawn(player.position);
        }
      }
    }

    // --- Raketen ---
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      const res = m.update(dt);
      if (res.expired) {
        if (res.hit) {
          const killed = res.hit.takeDamage(CONFIG.missile.damage);
          if (res.hit.isPlayer) {
            if (killed) this.onPlayerKilled();
          } else if (killed) {
            this.onEnemyKilled(res.hit as EnemyJet);
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

    // --- Kamera & Sound ---
    this.cam.update(dt, player.object, player.flight.speed, this.engine.camera);
    this.sound.updateEngine(
      player.flight.speed / CONFIG.flight.afterburnerSpeed,
      this.input.throttle,
      this.input.afterburner && player.alive,
      dt
    );
    this.sound.setLockTone(player.alive ? player.lockProgress : 0);
    if (player.flight.stalled && player.alive) this.sound.stallWarning(true);
  }

  private pickCannonTarget(): Aircraft | null {
    // Nächster lebender Feind (Hitscan testet ohnehin Richtung/Reichweite)
    let best: Aircraft | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(this.player.position);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private updateLock(dt: number) {
    const P = CONFIG.player;
    const player = this.player;
    const cone = THREE.MathUtils.degToRad(P.lockAngleDeg);

    // bestätigt: aktuelles Ziel noch valide?
    let target = player.lockTarget;
    const valid = (t: Aircraft | null): t is Aircraft =>
      !!t && t.alive &&
      t.position.distanceTo(player.position) < P.lockRange &&
      player.forward.angleTo(t.position.clone().sub(player.position).normalize()) < cone;

    if (!valid(target)) {
      // neues bestes Ziel im Kegel suchen
      target = null;
      let bestAngle = cone;
      for (const e of this.enemies) {
        if (!valid(e)) continue;
        const a = player.forward.angleTo(e.position.clone().sub(player.position).normalize());
        if (a < bestAngle) { bestAngle = a; target = e; }
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

  private onHit(victim: Aircraft, dmg: number, shooter: Aircraft) {
    const killed = victim.takeDamage(dmg);
    if (victim.isPlayer) {
      if (killed) this.onPlayerKilled();
    } else {
      if (shooter.isPlayer) this.player.score += CONFIG.score.hitBonus;
      if (killed) this.onEnemyKilled(victim as EnemyJet);
    }
  }

  private onEnemyKilled(e: EnemyJet) {
    this.effects.explosion(e.position, true);
    this.sound.explosion(true);
    this.player.score += CONFIG.score.kill;
    e.respawnTimer = 0;
    if (this.player.lockTarget === e) {
      this.player.lockTarget = null;
      this.player.lockProgress = 0;
    }
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
    // Spieler-Relative Koordinaten: Feinde auf Radar
    const invQ = p.object.quaternion.clone().invert();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const rel = e.position.clone().sub(p.position).applyQuaternion(invQ);
      radar.push({
        x: THREE.MathUtils.clamp(rel.x / range, -1, 1),
        y: THREE.MathUtils.clamp(rel.z / range, -1, 1),
        isEnemy: true,
        locked: p.lockTarget === e && p.lockProgress >= 1,
      });
    }

    let warning: string | null = null;
    if (p.flight.stalled && p.alive) warning = 'STALL';
    else if (p.hp < 30 && p.alive) warning = 'DAMAGE';
    const missileThreat = this.missiles.some((m) => m['target'] === p);
    if (missileThreat) warning = 'MISSILE';

    const data: HudData = {
      state: this.state,
      speedKnots: Math.round(p.speedKnots),
      altitudeFt: Math.round(p.position.y * 3.281),
      headingDeg: Math.round(p.headingDeg),
      throttle: this.input.throttle,
      afterburner: this.input.afterburner,
      stalled: p.flight.stalled,
      gForce: p.flight.gForce,
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: CONFIG.player.hp,
      score: p.score,
      missiles: p.missilesLeft,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
      lockProgress: p.lockProgress,
      lockedTargetName: p.lockProgress >= 1 && p.lockTarget ? p.lockTarget.name : null,
      warning,
      radar,
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
