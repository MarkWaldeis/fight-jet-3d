import * as THREE from 'three';
import { CONFIG } from '../config';

export type FlightInput = {
  pitch: number;
  roll: number;
  yaw: number;
};

export type FlightControlOpts = {
  /** Welt-Richtungsvektor zum Mouse-Aim-Punkt (unit). Null = reiner Stick. */
  aimDir?: THREE.Vector3 | null;
  /** Mouse-Aim / FBW aktiv */
  mouseAim?: boolean;
  /** 0..1 Blend nach Manual-Override (Smooth Recapture) */
  fbwBlend?: number;
  /** Airbrake aktiv */
  airbrake?: boolean;
};

/**
 * War Thunder–inspiriertes Arcade-Flugmodell:
 * - Nase (Heading) ≠ Velocity Vector (AoA / Sideslip)
 * - Roll-to-Turn FBW zum Mouse-Aim-Punkt
 * - Energy Bleed durch Induced Drag bei High-G
 * - Geschwindigkeitsabhängige Ruderwirkung + Stall
 */
export class FlightModel {
  readonly object: THREE.Object3D;
  speed: number = CONFIG.flight.cruiseSpeed;
  throttle = 0.6;
  gForce = 1;
  stalled = false;
  /** Anstellwinkel (rad) zwischen Nase und Velocity */
  aoa = 0;
  /** Schiebewinkel (rad) */
  sideslip = 0;
  speedMult = 1;
  turnMult = 1;

  /** Tatsächliche Flugrichtung (unit, Welt) */
  readonly velocityDir = new THREE.Vector3(0, 0, -1);

  private qDelta = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private prevVel = new THREE.Vector3();
  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);
  private _localAim = new THREE.Vector3();
  private _tmp = new THREE.Vector3();
  private _tmp2 = new THREE.Vector3();
  private _qInv = new THREE.Quaternion();

  /** Geglättete Ruder-Befehle (Smooth Recapture) */
  private cmdPitch = 0;
  private cmdRoll = 0;
  private cmdYaw = 0;

  constructor(object: THREE.Object3D) {
    this.object = object;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.object.quaternion);
  }

  /** Velocity als Vektor (Welt, m/s) */
  get velocity(): THREE.Vector3 {
    return this.velocityDir.clone().multiplyScalar(this.speed);
  }

  update(
    dt: number,
    input: FlightInput,
    afterburner: boolean,
    opts: FlightControlOpts = {}
  ) {
    const F = CONFIG.flight;
    const sm = this.speedMult;
    const tm = this.turnMult;

    // --- Basisvektoren ---
    this._fwd.set(0, 0, -1).applyQuaternion(this.object.quaternion).normalize();
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion).normalize();
    this._up.set(0, 1, 0).applyQuaternion(this.object.quaternion).normalize();

    // --- Ruder-Befehle: Manual vs FBW ---
    let wantPitch = input.pitch;
    let wantRoll = input.roll;
    let wantYaw = input.yaw;

    const useFbw =
      !!opts.mouseAim &&
      !!opts.aimDir &&
      opts.aimDir.lengthSq() > 0.5 &&
      (opts.fbwBlend ?? 1) > 0.01;

    if (useFbw && opts.aimDir) {
      const fbw = this.computeFbwCommands(opts.aimDir);
      const b = THREE.MathUtils.clamp(opts.fbwBlend ?? 1, 0, 1);
      // Manual hat volle Priorität wenn Override; sonst FBW
      if (Math.abs(input.pitch) < 0.05 && Math.abs(input.roll) < 0.05 && Math.abs(input.yaw) < 0.05) {
        wantPitch = fbw.pitch;
        wantRoll = fbw.roll;
        wantYaw = fbw.yaw;
      } else {
        // Teil-Override möglich, aber Manual gewinnt
        wantPitch = input.pitch;
        wantRoll = input.roll;
        wantYaw = input.yaw;
      }
      // Smooth recapture: gleite Befehle
      const recapture = 1 - Math.exp(-F.fbwRecaptureRate * dt);
      const smooth = b * recapture + (1 - b);
      this.cmdPitch += (wantPitch - this.cmdPitch) * Math.min(1, smooth + 0.5);
      this.cmdRoll += (wantRoll - this.cmdRoll) * Math.min(1, smooth + 0.5);
      this.cmdYaw += (wantYaw - this.cmdYaw) * Math.min(1, smooth + 0.5);
    } else {
      // Manual: snappy, aber mit leichter Filterung gegen Ruckler
      const k = 1 - Math.exp(-18 * dt);
      this.cmdPitch += (wantPitch - this.cmdPitch) * k;
      this.cmdRoll += (wantRoll - this.cmdRoll) * k;
      this.cmdYaw += (wantYaw - this.cmdYaw) * k;
    }

    // --- Agility (Speed + Stall) ---
    const agility = THREE.MathUtils.clamp(
      (this.speed - 30) / (F.cruiseSpeed * sm - 30),
      0.12,
      1.2
    ) * tm;

    let pitchRate = this.cmdPitch * F.pitchRate * agility;
    let rollRate = this.cmdRoll * F.rollRate * agility;
    let yawRate = this.cmdYaw * F.yawRate * agility;

    // Bank messen
    const bank = THREE.MathUtils.clamp(-this._right.y, -1, 1);

    // Auto-Level nur im Manual ohne starken Roll-Input und ohne FBW
    if (!useFbw && Math.abs(this.cmdRoll) < 0.08) {
      rollRate += -bank * (F.autoLevelRate ?? 1.2) * agility * 0.7;
    }

    // Stall: Nase fällt, Ruder weich
    this.stalled = this.speed < F.minSpeed;
    if (this.stalled) {
      const stallFactor = 1 - this.speed / F.minSpeed;
      pitchRate -= F.stallPitchDrop * stallFactor;
      pitchRate *= 0.45;
      rollRate *= 0.4;
      yawRate *= 0.35;
    }

    // --- Rotation (lokale Achsen) ---
    this.rotateLocal(new THREE.Vector3(1, 0, 0), pitchRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 1, 0), yawRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 0, 1), -rollRate * dt);

    // Arcade: Bank erzeugt Heading-Änderung in der Weltebene (Manual + FBW)
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion);
    const bankAfter = THREE.MathUtils.clamp(-this._right.y, -1, 1);
    const headingRate =
      (-this.cmdRoll * (F.rollYawCoupling ?? 0.85) - bankAfter * (F.bankTurnRate ?? 0.65)) *
      agility *
      0.85;
    if (Math.abs(headingRate) > 1e-6) {
      this.object.rotateOnWorldAxis(this._worldUp, headingRate * dt);
      this.object.quaternion.normalize();
    }

    // Angular damping wenn fast keine Eingabe
    const stickMag = Math.abs(this.cmdPitch) + Math.abs(this.cmdRoll) + Math.abs(this.cmdYaw);
    if (stickMag < 0.05 && !this.stalled) {
      // leichte Bank-Stabilisierung
      this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion);
      const b2 = THREE.MathUtils.clamp(-this._right.y, -1, 1);
      this.rotateLocal(new THREE.Vector3(0, 0, 1), b2 * F.angularDamping * 0.15 * dt);
    }

    // Forward nach Rotation aktualisieren
    this._fwd.set(0, 0, -1).applyQuaternion(this.object.quaternion).normalize();

    // --- Velocity Vector folgt Nase mit Verzögerung (AoA) ---
    // Bei niedriger Speed / hartem Pull größerer AoA
    const pull = Math.abs(this.cmdPitch);
    const alignBase = F.velocityAlignRate * (0.55 + agility * 0.55);
    // High-G / Pull → Velocity hinkt hinterher (Nase schert ein)
    const align = alignBase / (1 + pull * 1.4 + (this.stalled ? 1.5 : 0));
    const aK = 1 - Math.exp(-align * dt);
    this.velocityDir.lerp(this._fwd, aK).normalize();

    // AoA / Sideslip messen
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion).normalize();
    this._up.set(0, 1, 0).applyQuaternion(this.object.quaternion).normalize();
    // pitch AoA: angle in forward-up plane
    const velOnPitch = this._tmp.copy(this.velocityDir).addScaledVector(this._right, -this.velocityDir.dot(this._right));
    if (velOnPitch.lengthSq() > 1e-8) {
      velOnPitch.normalize();
      this.aoa = Math.atan2(velOnPitch.dot(this._up), velOnPitch.dot(this._fwd));
    } else {
      this.aoa = 0;
    }
    this.sideslip = Math.asin(
      THREE.MathUtils.clamp(this.velocityDir.dot(this._right), -1, 1)
    );

    // --- Energie / Drag ---
    const targetMax = (afterburner ? F.afterburnerSpeed : F.maxSpeed) * sm;
    let accel = (afterburner ? F.afterburnerAccel : F.thrustAccel) * this.throttle * sm;
    if (opts.airbrake) accel -= 55;

    // Parasite drag
    let drag = F.dragBase * this.speed * (this.speed / (F.maxSpeed * sm));

    // Induced drag ~ G² und AoA (Energy Bleed in Kurven)
    const loadApprox = 1 + Math.abs(this.cmdPitch) * 5.5 * (this.speed / F.cruiseSpeed);
    drag += F.inducedDrag * Math.max(0, loadApprox - 1) * this.speed * 0.35;
    drag += F.aoaDrag * Math.abs(this.aoa) * this.speed;

    // Steigen bremst, Sinken beschleunigt (entlang Velocity)
    const climbEffect = -this.velocityDir.y * 22;
    this.speed += (accel - drag + climbEffect) * dt;
    const minSpd = opts.airbrake ? 35 : 30;
    this.speed = THREE.MathUtils.clamp(this.speed, minSpd, targetMax * (opts.airbrake ? 0.92 : 1));

    // --- Position entlang Velocity Vector (nicht Nase!) ---
    const vel = this._tmp2.copy(this.velocityDir).multiplyScalar(this.speed);
    const gravityFactor = THREE.MathUtils.clamp(1.3 - this.speed / F.cruiseSpeed, 0, 1);
    vel.y -= F.gravityPull * gravityFactor * dt * 8;
    // Gravity zieht Velocity-Dir leicht nach unten bei niedriger Speed
    if (gravityFactor > 0.05) {
      this.velocityDir.y -= gravityFactor * 0.35 * dt;
      this.velocityDir.normalize();
    }
    this.object.position.addScaledVector(vel, dt);

    // --- G-Force ---
    const dv = vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-4)).length();
    const rawG = THREE.MathUtils.clamp(1 + dv / 19.6 + Math.abs(this.cmdPitch) * 4.2, 0.2, 12);
    this.gForce += (rawG - this.gForce) * Math.min(1, dt * 6);
    this.prevVel.copy(vel);
  }

  /**
   * Roll-to-Turn FBW: zuerst Bank, dann Pitch-Up in die Zielrichtung.
   * aimDir = Welt-Unit-Vektor zum Virtual Aim Point.
   */
  private computeFbwCommands(aimDir: THREE.Vector3): FlightInput {
    const F = CONFIG.flight;
    this._qInv.copy(this.object.quaternion).invert();
    this._localAim.copy(aimDir).applyQuaternion(this._qInv);

    // Body: +X right, +Y up, -Z forward
    // Ziel vor uns: local.z < 0
    const lx = this._localAim.x;
    const ly = this._localAim.y;
    const lz = this._localAim.z;

    // Winkel-Fehler
    const horiz = Math.sqrt(lx * lx + lz * lz) + 1e-6;
    const pitchErr = Math.atan2(ly, horiz); // + = Ziel über Nase
    const yawErr = Math.atan2(lx, -lz);    // + = Ziel rechts

    // Roll-to-Turn: Lift-Vektor auf Ziel ausrichten
    // Gewünschte Bank ≈ yaw-Fehler (seitliches Ziel → rollen)
    // Zusätzlich: pure roll um Ziel in die Pitch-Ebene zu bringen
    const rollToAlign = Math.atan2(lx, Math.max(0.05, ly * 0.15 + Math.abs(lz) * 0.4 + 0.2));
    let rollCmd = THREE.MathUtils.clamp(
      rollToAlign * F.fbwRollGain + yawErr * 0.65,
      -1,
      1
    );

    // Pitch: ziehen/drücken zum Ziel
    let pitchCmd = THREE.MathUtils.clamp(pitchErr * F.fbwPitchGain, -1, 1);

    // Priorität: bei großem seitlichem Fehler erst rollen, Pitch drosseln
    const lateral = Math.min(1, Math.abs(lx) / Math.max(0.15, Math.hypot(lx, ly, -lz)));
    if (lateral > F.fbwRollPriority) {
      const damp = THREE.MathUtils.smoothstep(F.fbwRollPriority, 0.85, lateral);
      pitchCmd *= 1 - damp * 0.75;
      rollCmd = THREE.MathUtils.clamp(rollCmd * (1 + damp * 0.4), -1, 1);
    }

    // Yaw nur Feinkorrektur / Sideslip-Ausgleich (nicht primäre Kurve)
    const yawCmd = THREE.MathUtils.clamp(
      yawErr * F.fbwYawGain * (1 - Math.min(1, Math.abs(rollCmd))),
      -1,
      1
    );

    // Totzone: wenn fast auf dem Ziel, ruhig halten
    if (Math.abs(pitchErr) < 0.02 && Math.abs(yawErr) < 0.02) {
      return { pitch: 0, roll: rollCmd * 0.15, yaw: 0 };
    }

    return {
      pitch: pitchCmd,
      roll: rollCmd,
      yaw: yawCmd,
    };
  }

  private rotateLocal(axis: THREE.Vector3, angle: number) {
    if (Math.abs(angle) < 1e-7) return;
    this.axis.copy(axis);
    this.qDelta.setFromAxisAngle(this.axis, angle);
    this.object.quaternion.multiply(this.qDelta).normalize();
  }

  /** Velocity-Dir an aktuelle Nase koppeln (Spawn/Reset) */
  snapVelocityToNose() {
    this.velocityDir.copy(this.forward);
    this.aoa = 0;
    this.sideslip = 0;
    this.cmdPitch = 0;
    this.cmdRoll = 0;
    this.cmdYaw = 0;
    this.prevVel.copy(this.velocityDir).multiplyScalar(this.speed);
  }
}
