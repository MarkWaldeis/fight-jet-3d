import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Chase-Kamera: näher am Jet, folgt der Flugrichtung (Heading),
 * rollt/nickt aber NICHT mit dem Flugzeug mit — Horizont bleibt gerade.
 * Free-Look: Orbit. Cockpit: Sitz (mit Jet-Attitude).
 */
export class CameraController {
  mode: 'chase' | 'cockpit' | 'free' = 'chase';
  private modeBeforeFree: 'chase' | 'cockpit' = 'chase';

  private currentPos = new THREE.Vector3(0, 620, 3200);
  private currentLook = new THREE.Vector3(0, 620, 2900);
  private ready = false;
  private trackBlend = 0;

  private freeYaw = 0;
  private freePitch = 0.25;
  private freeDist = 28;

  // temporäre Vektoren
  private _flatFwd = new THREE.Vector3();
  private _desired = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);

  update(
    dt: number,
    jet: THREE.Object3D,
    speed: number,
    camera: THREE.PerspectiveCamera,
    lookDelta?: { x: number; y: number },
    trackTargetWorld?: THREE.Vector3 | null
  ) {
    const C = CONFIG.camera;

    const fovTarget =
      C.baseFov +
      THREE.MathUtils.clamp(
        (speed - CONFIG.flight.cruiseSpeed) /
          (CONFIG.flight.afterburnerSpeed - CONFIG.flight.cruiseSpeed),
        0,
        1
      ) *
        C.maxFovBoost;
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();

    if (this.mode === 'free') {
      this.updateFree(dt, jet, camera, lookDelta);
      this.trackBlend = 0;
      return;
    }

    if (this.mode === 'cockpit') {
      // Cockpit: bleibt an die Jet-Attitude gebunden (Pilotensicht)
      const offset = new THREE.Vector3(0, 0.95, -2.55)
        .applyQuaternion(jet.quaternion)
        .add(jet.position);
      camera.position.copy(offset);
      const want = trackTargetWorld ? 0.55 : 0;
      this.trackBlend += (want - this.trackBlend) * Math.min(1, dt * 4);
      if (this.trackBlend > 0.02 && trackTargetWorld) {
        camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
        const bore = jet.position
          .clone()
          .add(new THREE.Vector3(0, 0, -40).applyQuaternion(jet.quaternion));
        camera.lookAt(bore.lerp(trackTargetWorld, this.trackBlend));
      } else {
        camera.quaternion.copy(jet.quaternion);
        camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
        camera.rotateX(-0.08);
      }
      this.ready = false;
      return;
    }

    // ─── Chase: horizon-stabil ───────────────────────────────────────────
    // Flugrichtung nur horizontal (Yaw/Heading) — Roll und Pitch des Jets
    // beeinflussen die Kamera-Orientierung nicht.
    this._flatFwd.set(0, 0, -1).applyQuaternion(jet.quaternion);
    this._flatFwd.y = 0;
    if (this._flatFwd.lengthSq() < 1e-6) {
      // senkrecht steigen/sinken: letzte horizontale Richtung behalten
      this._flatFwd.set(0, 0, -1);
    } else {
      this._flatFwd.normalize();
    }

    const off = C.chaseOffset;
    // hinter dem Jet entlang flatFwd, plus Höhe über dem Jet
    this._desired
      .copy(jet.position)
      .addScaledVector(this._flatFwd, -off.z) // z-Config = Distanz hinter dem Jet
      .addScaledVector(this._worldUp, off.y);

    // Blickpunkt: vor dem Jet auf gleicher Flughöhe (Horizont gerade)
    this._look
      .copy(jet.position)
      .addScaledVector(this._flatFwd, 40)
      .addScaledVector(this._worldUp, 1.5);

    const kPos = 1 - Math.exp(-C.lerpPos * dt);
    if (!this.ready) {
      this.currentPos.copy(this._desired);
      this.currentLook.copy(this._look);
      this.ready = true;
    } else {
      this.currentPos.lerp(this._desired, kPos);
      this.currentLook.lerp(this._look, kPos);
    }

    // Auto-Track mischt Blickpunkt zum gelockten Ziel (Horizont bleibt up)
    const wantTrack = trackTargetWorld ? 0.75 : 0;
    this.trackBlend += (wantTrack - this.trackBlend) * Math.min(1, dt * 3.5);
    if (this.trackBlend > 0.02 && trackTargetWorld) {
      this._look.copy(this.currentLook).lerp(trackTargetWorld, this.trackBlend);
    } else {
      this._look.copy(this.currentLook);
    }

    camera.position.copy(this.currentPos);
    camera.up.copy(this._worldUp); // immer gerade — kein Mitrollen
    camera.lookAt(this._look);
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

    // Orbit um den Jet, Horizont gerade (Welt-Up)
    this._flatFwd.set(0, 0, -1).applyQuaternion(jet.quaternion);
    this._flatFwd.y = 0;
    if (this._flatFwd.lengthSq() < 1e-6) this._flatFwd.set(0, 0, -1);
    else this._flatFwd.normalize();

    // freeYaw=0 = hinter dem Jet
    const behind = this._flatFwd.clone().negate();
    const right = new THREE.Vector3().crossVectors(this._worldUp, behind).normalize();
    const worldOff = new THREE.Vector3()
      .addScaledVector(behind, Math.cos(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist)
      .addScaledVector(right, Math.sin(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist)
      .addScaledVector(this._worldUp, Math.sin(this.freePitch) * this.freeDist);

    const desired = jet.position.clone().add(worldOff);
    const k = 1 - Math.exp(-14 * dt);
    this.currentPos.lerp(desired, this.ready ? k : 1);
    this.ready = true;

    camera.position.copy(this.currentPos);
    camera.up.copy(this._worldUp);
    camera.lookAt(jet.position.x, jet.position.y + 1.2, jet.position.z);
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

  get isTracking() {
    return this.trackBlend > 0.35;
  }

  snapBehind(jet: THREE.Object3D) {
    const off = CONFIG.camera.chaseOffset;
    this._flatFwd.set(0, 0, -1).applyQuaternion(jet.quaternion);
    this._flatFwd.y = 0;
    if (this._flatFwd.lengthSq() < 1e-6) this._flatFwd.set(0, 0, -1);
    else this._flatFwd.normalize();

    this.currentPos
      .copy(jet.position)
      .addScaledVector(this._flatFwd, -off.z)
      .addScaledVector(this._worldUp, off.y);
    this.currentLook
      .copy(jet.position)
      .addScaledVector(this._flatFwd, 40)
      .addScaledVector(this._worldUp, 1.5);
    this.ready = true;
    this.trackBlend = 0;
    if (this.mode === 'free') {
      this.freeYaw = 0;
      this.freePitch = 0.28;
    }
  }
}
