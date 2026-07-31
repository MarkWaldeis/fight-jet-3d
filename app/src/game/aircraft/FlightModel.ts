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

  private qDelta = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private prevVel = new THREE.Vector3();

  constructor(object: THREE.Object3D) {
    this.object = object;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.object.quaternion);
  }

  update(dt: number, input: { pitch: number; roll: number; yaw: number }, afterburner: boolean) {
    const F = CONFIG.flight;

    // --- Geschwindigkeit ---
    const targetMax = afterburner ? F.afterburnerSpeed : F.maxSpeed;
    const accel = (afterburner ? F.afterburnerAccel : F.thrustAccel) * this.throttle;
    const drag = F.dragBase * this.speed * (this.speed / F.maxSpeed);
    // Steigen bremst, Sinken beschleunigt
    const climbEffect = -this.forward.y * 22;
    this.speed += (accel - drag + climbEffect) * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, 30, targetMax);

    // --- Stall ---
    this.stalled = this.speed < F.minSpeed;

    // --- Rotation (Wendigkeit skaliert mit Speed, fällt im Stall ab) ---
    const agility = THREE.MathUtils.clamp(
      (this.speed - 30) / (F.cruiseSpeed - 30), 0.15, 1.15
    );
    let pitchRate = input.pitch * F.pitchRate * agility;
    const rollRate = input.roll * F.rollRate * agility;
    const yawRate = input.yaw * F.yawRate * agility;
    if (this.stalled) {
      // Nase fällt durch
      pitchRate -= F.stallPitchDrop * (1 - this.speed / F.minSpeed);
    }

    this.rotateLocal(new THREE.Vector3(1, 0, 0), pitchRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 1, 0), yawRate * dt);
    this.rotateLocal(new THREE.Vector3(0, 0, 1), -rollRate * dt);

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
