import * as THREE from 'three';
import { CONFIG } from '../config';

// Chase: hinter + über dem Jet, Blick = Flugrichtung → Fadenkreuz = Schussachse.
// Free-Look: Orbit. Cockpit: Sitz.
export class CameraController {
  mode: 'chase' | 'cockpit' | 'free' = 'chase';
  private modeBeforeFree: 'chase' | 'cockpit' = 'chase';

  private currentPos = new THREE.Vector3(0, 620, 3200);
  private currentQuat = new THREE.Quaternion();
  private ready = false;

  private freeYaw = 0;
  private freePitch = 0.25;
  private freeDist = 28;

  update(
    dt: number,
    jet: THREE.Object3D,
    speed: number,
    camera: THREE.PerspectiveCamera,
    lookDelta?: { x: number; y: number }
  ) {
    const C = CONFIG.camera;

    const fovTarget = C.baseFov + THREE.MathUtils.clamp(
      (speed - CONFIG.flight.cruiseSpeed) / (CONFIG.flight.afterburnerSpeed - CONFIG.flight.cruiseSpeed),
      0, 1
    ) * C.maxFovBoost;
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();

    if (this.mode === 'free') {
      this.updateFree(dt, jet, camera, lookDelta);
      return;
    }

    if (this.mode === 'cockpit') {
      const offset = new THREE.Vector3(0, 0.95, -2.55).applyQuaternion(jet.quaternion).add(jet.position);
      camera.position.copy(offset);
      camera.quaternion.copy(jet.quaternion);
      camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
      camera.rotateX(-0.08);
      this.ready = false;
      return;
    }

    // --- Chase (Boresight) ---
    // Position: hinter + über dem Jet. Orientierung = Jet → Bildschirmmitte = Nase/Kanone.
    // Der Jet liegt dadurch unter der Mitte, das Fadenkreuz zeigt vor die Nase (Schussrichtung).
    const off = C.chaseOffset;
    const desired = new THREE.Vector3(off.x, off.y, off.z)
      .applyQuaternion(jet.quaternion)
      .add(jet.position);

    const kPos = 1 - Math.exp(-C.lerpPos * dt);
    const kRot = 1 - Math.exp(-C.lerpRot * dt);

    if (!this.ready) {
      this.currentPos.copy(desired);
      this.currentQuat.copy(jet.quaternion);
      this.ready = true;
    } else {
      this.currentPos.lerp(desired, kPos);
      this.currentQuat.slerp(jet.quaternion, kRot);
    }

    camera.position.copy(this.currentPos);
    camera.quaternion.copy(this.currentQuat);
    camera.up.set(0, 1, 0).applyQuaternion(this.currentQuat).normalize();
  }

  private updateFree(
    dt: number,
    jet: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    lookDelta?: { x: number; y: number }
  ) {
    const sens = CONFIG.camera.freeLookSensitivity;
    if (lookDelta) {
      this.freeYaw -= lookDelta.x * sens;
      this.freePitch += lookDelta.y * sens;
      this.freePitch = THREE.MathUtils.clamp(this.freePitch, -1.2, 1.35);
    }

    const offset = new THREE.Vector3(0, 0, this.freeDist);
    offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.freePitch);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.freeYaw);
    offset.applyQuaternion(jet.quaternion);

    const desired = jet.position.clone().add(offset);
    const k = 1 - Math.exp(-14 * dt);
    this.currentPos.lerp(desired, this.ready ? k : 1);
    this.ready = true;

    camera.position.copy(this.currentPos);
    const aim = jet.position.clone().add(
      new THREE.Vector3(0, 1.2, 0).applyQuaternion(jet.quaternion)
    );
    const jetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(jet.quaternion);
    camera.up.copy(jetUp);
    camera.lookAt(aim);
    this.currentQuat.copy(camera.quaternion);
  }

  toggleFreeLook() {
    if (this.mode === 'free') {
      this.mode = this.modeBeforeFree;
      this.ready = false;
    } else {
      this.modeBeforeFree = this.mode === 'cockpit' ? 'cockpit' : 'chase';
      this.mode = 'free';
      this.freeYaw = 0;
      this.freePitch = 0.28;
      this.freeDist = CONFIG.camera.freeLookDistance;
      this.ready = false;
    }
  }

  toggleCockpit() {
    if (this.mode === 'free') {
      this.mode = 'cockpit';
      this.ready = false;
      return;
    }
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
    this.ready = false;
  }

  get isFreeLook() {
    return this.mode === 'free';
  }

  snapBehind(jet: THREE.Object3D) {
    const off = CONFIG.camera.chaseOffset;
    this.currentPos.copy(
      new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(jet.quaternion).add(jet.position)
    );
    this.currentQuat.copy(jet.quaternion);
    this.ready = true;
    if (this.mode === 'free') {
      this.freeYaw = 0;
      this.freePitch = 0.28;
    }
  }
}
