import * as THREE from 'three';
import { CONFIG } from '../config';

// Chase (War-Thunder-artig: hoch & hinter dem Jet), Cockpit, Free-Look (Orbit).
export class CameraController {
  mode: 'chase' | 'cockpit' | 'free' = 'chase';
  /** Vor Free-Look, um dorthin zurückzukehren */
  private modeBeforeFree: 'chase' | 'cockpit' = 'chase';

  private currentPos = new THREE.Vector3(0, 620, 3200);
  private currentQuat = new THREE.Quaternion();
  private ready = false;

  // Free-Look: Kugelkoordinaten relativ zur Jet-Ausrichtung
  private freeYaw = 0;   // um Jet-Up, 0 = von hinten
  private freePitch = 0.25; // leicht von oben
  private freeDist = 28;

  update(
    dt: number,
    jet: THREE.Object3D,
    speed: number,
    camera: THREE.PerspectiveCamera,
    lookDelta?: { x: number; y: number }
  ) {
    const C = CONFIG.camera;

    // Speed-FOV
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

    // Chase: höher & weiter hinten (War-Thunder-Style), Blick leicht nach vorne/unten auf den Jet
    const off = C.chaseOffset;
    const desired = new THREE.Vector3(off.x, off.y, off.z)
      .applyQuaternion(jet.quaternion)
      .add(jet.position);

    // Blickpunkt: etwas vor dem Jet, niedriger als Kamera → Jet sitzt im unteren Drittel
    const lookLocal = new THREE.Vector3(0, C.chaseLookY, C.chaseLookZ);
    const lookWorld = lookLocal.applyQuaternion(jet.quaternion).add(jet.position);

    const kPos = 1 - Math.exp(-C.lerpPos * dt);
    if (!this.ready) {
      this.currentPos.copy(desired);
      this.ready = true;
    } else {
      this.currentPos.lerp(desired, kPos);
    }

    camera.position.copy(this.currentPos);
    // Sanftes lookAt: Jet unten im Bild, Horizon/Flugrichtung oben mittig
    const jetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(jet.quaternion);
    camera.up.lerp(jetUp, Math.min(1, dt * 5)).normalize();
    camera.lookAt(lookWorld);
    this.currentQuat.copy(camera.quaternion);
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
      // Pitch begrenzen, nicht durch den Boden/Jet klappen
      this.freePitch = THREE.MathUtils.clamp(this.freePitch, -1.2, 1.35);
    }

    // Orbit in Jet-Lokalraum: Start hinter dem Jet (+Z), dann yaw/pitch
    const offset = new THREE.Vector3(0, 0, this.freeDist);
    offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.freePitch);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.freeYaw);
    offset.applyQuaternion(jet.quaternion);

    const desired = jet.position.clone().add(offset);
    const k = 1 - Math.exp(-14 * dt);
    this.currentPos.lerp(desired, this.ready ? k : 1);
    this.ready = true;

    camera.position.copy(this.currentPos);
    // Immer auf den Jet schauen
    const aim = jet.position.clone().add(
      new THREE.Vector3(0, 1.2, 0).applyQuaternion(jet.quaternion)
    );
    const jetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(jet.quaternion);
    camera.up.copy(jetUp);
    camera.lookAt(aim);
    this.currentQuat.copy(camera.quaternion);
  }

  /** V: Free-Look ein/aus. Jet fliegt weiter, Kamera orbitet. */
  toggleFreeLook() {
    if (this.mode === 'free') {
      this.mode = this.modeBeforeFree;
      this.ready = false;
    } else {
      this.modeBeforeFree = this.mode === 'cockpit' ? 'cockpit' : 'chase';
      this.mode = 'free';
      // Start von hinten/oben
      this.freeYaw = 0;
      this.freePitch = 0.28;
      this.freeDist = CONFIG.camera.freeLookDistance;
      this.ready = false;
    }
  }

  /** C: Chase ↔ Cockpit (beendet Free-Look). */
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
