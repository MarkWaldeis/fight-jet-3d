import * as THREE from 'three';
import { CONFIG } from '../config';

// Arcade-Flugmodell: Quaternion-basierte Rotation (Pitch/Roll/Yaw in
// lokalen Achsen), Geschwindigkeit entlang der Nase, sanfter Stall,
// geschwindigkeitsabhängige Wendigkeit. Inspiriert von jakobmaiers F-16-Sim.
export class FlightModel {
  readonly object: THREE.Object3D;
  speed: number = CONFIG.flight.cruiseSpeed;
  throttle = 0.6;
  gForce = 1;
  stalled = false;
  /** Jet-spezifisch (Hangar) */
  speedMult = 1;
  turnMult = 1;

  private qDelta = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private prevVel = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);

  constructor(object: THREE.Object3D) {
    this.object = object;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.object.quaternion);
  }

  update(dt: number, input: { pitch: number; roll: number; yaw: number }, afterburner: boolean) {
    const F = CONFIG.flight;
    const sm = this.speedMult;
    const tm = this.turnMult;

    // --- Geschwindigkeit ---
    const targetMax = (afterburner ? F.afterburnerSpeed : F.maxSpeed) * sm;
    const accel = (afterburner ? F.afterburnerAccel : F.thrustAccel) * this.throttle * sm;
    const drag = F.dragBase * this.speed * (this.speed / (F.maxSpeed * sm));
    // Steigen bremst, Sinken beschleunigt
    const climbEffect = -this.forward.y * 22;
    this.speed += (accel - drag + climbEffect) * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, 30, targetMax);

    // --- Stall ---
    this.stalled = this.speed < F.minSpeed;

    // --- Rotation (Wendigkeit skaliert mit Speed, fällt im Stall ab) ---
    const agility = THREE.MathUtils.clamp(
      (this.speed - 30) / (F.cruiseSpeed * sm - 30), 0.15, 1.15
    ) * tm;
    let pitchRate = input.pitch * F.pitchRate * agility;
    let rollRate = input.roll * F.rollRate * agility;
    // Q/E = reines Seitenruder (lokal)
    const yawRate = input.yaw * F.yawRate * agility;

    // Schräglage messen (+bank = rechts eingerollt, ≈ sin(Bankwinkel))
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion);
    const bank = THREE.MathUtils.clamp(-this._right.y, -1, 1);

    // Auto-Level: ohne A/D flacht die Bank sanft ab (Arcade)
    const autoLevel = F.autoLevelRate ?? 1.5;
    if (Math.abs(input.roll) < 0.08) {
      rollRate += -bank * autoLevel * agility;
    } else {
      // Weiches Bank-Limit ~55° — verhindert Dauer-Tonne, A/D bleibt Kurve
      const maxBank = 0.82;
      if (input.roll * bank > 0 && Math.abs(bank) > maxBank) {
        rollRate *= 0.08;
      }
    }

    if (this.stalled) {
      // Nase fällt durch
      pitchRate -= F.stallPitchDrop * (1 - this.speed / F.minSpeed);
    }

    // Lokale Achsen: Pitch / Rudder / Roll (Bank)
    this.rotateLocal(new THREE.Vector3(1, 0, 0), pitchRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 1, 0), yawRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 0, 1), -rollRate * dt);

    // Arcade-Kurvenflug: A/D und Schräglage drehen den Kurs in der WELTEBENE.
    // → Nase + Fadenkreuz wandern seitlich, ohne Spiralsturz über Body-Yaw.
    const rollYaw = F.rollYawCoupling ?? 1.0;
    const bankTurn = F.bankTurnRate ?? 0.75;
    // bank nach dem Roll-Schritt neu messen
    this._right.set(1, 0, 0).applyQuaternion(this.object.quaternion);
    const bankAfter = THREE.MathUtils.clamp(-this._right.y, -1, 1);
    const headingRate =
      (-input.roll * rollYaw - bankAfter * bankTurn) * agility;
    if (Math.abs(headingRate) > 1e-6) {
      this.object.rotateOnWorldAxis(this._worldUp, headingRate * dt);
      this.object.quaternion.normalize();
    }

    // --- Position ---
    const vel = this.forward.multiplyScalar(this.speed);
    // Gravitation: bei niedriger Speed zieht sie stärker nach unten
    const gravityFactor = THREE.MathUtils.clamp(1.3 - this.speed / F.cruiseSpeed, 0, 1);
    vel.y -= F.gravityPull * gravityFactor * dt * 8;
    this.object.position.addScaledVector(vel, dt);

    // --- G-Kraft (aus Geschwindigkeitsänderung, geglättet & begrenzt) ---
    const dv = vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-4)).length();
    const rawG = THREE.MathUtils.clamp(1 + dv / 19.6, 0.2, 12);
    this.gForce += (rawG - this.gForce) * Math.min(1, dt * 6);
    this.prevVel.copy(vel);
  }

  private rotateLocal(axis: THREE.Vector3, angle: number) {
    if (Math.abs(angle) < 1e-7) return;
    this.axis.copy(axis);
    this.qDelta.setFromAxisAngle(this.axis, angle);
    this.object.quaternion.multiply(this.qDelta).normalize();
  }
}
