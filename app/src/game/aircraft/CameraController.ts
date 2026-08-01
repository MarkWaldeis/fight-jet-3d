import * as THREE from 'three';
import { CONFIG } from '../config';

// Verfolger- & Cockpit-Kamera mit Trägheit und Speed-FOV.
export class CameraController {
  mode: 'chase' | 'cockpit' = 'chase';
  private currentPos = new THREE.Vector3(0, 620, 3200);
  private lookTarget = new THREE.Vector3();

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
      // Sitzposition: Pilotenkopf, Blick leicht nach unten (Panel sichtbar).
      // Position aus position+quaternion (nicht matrixWorld — der kann einen Frame alt sein)
      const offset = new THREE.Vector3(0, 1.02, -3.42).applyQuaternion(jet.quaternion).add(jet.position);
      camera.position.copy(offset);
      camera.quaternion.copy(jet.quaternion);
      camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
      camera.rotateX(-0.11);
      return;
    }

    // Chase: Zielposition hinter dem Jet
    const off = C.chaseOffset;
    const desired = new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(jet.quaternion).add(jet.position);
    const k = 1 - Math.exp(-C.lerpPos * dt);
    this.currentPos.lerp(desired, k);
    camera.position.copy(this.currentPos);

    // Blickpunkt leicht vor dem Jet
    const ahead = new THREE.Vector3(0, 1.2, -30).applyQuaternion(jet.quaternion).add(jet.position);
    const kr = 1 - Math.exp(-C.lerpRot * dt);
    this.lookTarget.lerp(ahead, kr);
    camera.lookAt(this.lookTarget);

    // Kamera rollt leicht mit dem Jet
    const jetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(jet.quaternion);
    camera.up.lerp(jetUp, Math.min(1, dt * 3)).normalize();
  }

  snapBehind(jet: THREE.Object3D) {
    const off = CONFIG.camera.chaseOffset;
    this.currentPos.copy(new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(jet.quaternion).add(jet.position));
    this.lookTarget.copy(new THREE.Vector3(0, 1.2, -30).applyQuaternion(jet.quaternion).add(jet.position));
  }
}
