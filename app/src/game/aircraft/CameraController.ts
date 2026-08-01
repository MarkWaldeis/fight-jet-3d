import * as THREE from 'three';
import { CONFIG } from '../config';

// Verfolger- & Cockpit-Kamera.
// Chase: Kamera hinter/über dem Jet, Blick exakt entlang der Flugrichtung (-Z).
// Dadurch liegt das Fadenkreuz (Bildschirmmitte) auf der Boresight-/Kanonenachse.
export class CameraController {
  mode: 'chase' | 'cockpit' = 'chase';
  private currentPos = new THREE.Vector3(0, 620, 3200);
  private currentQuat = new THREE.Quaternion();
  private ready = false;

  update(dt: number, jet: THREE.Object3D, speed: number, camera: THREE.PerspectiveCamera) {
    const C = CONFIG.camera;

    // Speed-FOV
    const fovTarget = C.baseFov + THREE.MathUtils.clamp(
      (speed - CONFIG.flight.cruiseSpeed) / (CONFIG.flight.afterburnerSpeed - CONFIG.flight.cruiseSpeed),
      0, 1
    ) * C.maxFovBoost;
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();

    if (this.mode === 'cockpit') {
      // Pilotenkopf unter der Bubble-Canopy, Blick leicht nach unten (Panel)
      const offset = new THREE.Vector3(0, 0.95, -2.55).applyQuaternion(jet.quaternion).add(jet.position);
      camera.position.copy(offset);
      camera.quaternion.copy(jet.quaternion);
      camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
      // Leichter Nick nach unten für Instrumente — Schussachse bleibt nah an Mitte
      camera.rotateX(-0.08);
      this.ready = false; // chase neu snappen beim Umschalten
      return;
    }

    // Chase: Position hinter + leicht über dem Jet (lokale +Z = Heck)
    const off = C.chaseOffset;
    const desired = new THREE.Vector3(off.x, off.y, off.z)
      .applyQuaternion(jet.quaternion)
      .add(jet.position);

    const kPos = 1 - Math.exp(-C.lerpPos * dt);
    if (!this.ready) {
      this.currentPos.copy(desired);
      this.currentQuat.copy(jet.quaternion);
      this.ready = true;
    } else {
      this.currentPos.lerp(desired, kPos);
      // Orientierung glatt an Jet angleichen → Bildschirmmitte = Nase/Kanone
      this.currentQuat.slerp(jet.quaternion, 1 - Math.exp(-C.lerpRot * dt));
    }

    camera.position.copy(this.currentPos);
    camera.quaternion.copy(this.currentQuat);
    // up aus Quaternion (kein lookAt → kein Boresight-Versatz)
    camera.up.set(0, 1, 0).applyQuaternion(this.currentQuat).normalize();
  }

  snapBehind(jet: THREE.Object3D) {
    const off = CONFIG.camera.chaseOffset;
    this.currentPos.copy(
      new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(jet.quaternion).add(jet.position)
    );
    this.currentQuat.copy(jet.quaternion);
    this.ready = true;
  }
}
