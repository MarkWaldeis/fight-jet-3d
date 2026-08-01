import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Chase-Kamera: näher am Jet.
 * - Folgt Pitch (hoch/runter) und Heading (seitwärts)
 * - Rollt NICHT mit (kein Mitdrehen um die Längsachse)
 * Free-Look: Orbit. Cockpit: volle Pilotensicht.
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

  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _desired = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);

  /**
   * Roll-freie Basis aus Jet-Vorwärtsrichtung:
   * forward = echte Flugrichtung (inkl. Pitch),
   * right = Welt-Up × forward (kein Jet-Roll),
   * up = forward × right.
   */
  private buildNoRollBasis(jet: THREE.Object3D) {
    this._fwd.set(0, 0, -1).applyQuaternion(jet.quaternion);
    if (this._fwd.lengthSq() < 1e-8) this._fwd.set(0, 0, -1);
    else this._fwd.normalize();

    // Bei fast senkrechtem Flug: right aus letzter horizontaler Komponente
    this._right.crossVectors(this._worldUp, this._fwd);
    if (this._right.lengthSq() < 1e-6) {
      // looking nearly straight up/down — use world +X as fallback right
      this._right.set(1, 0, 0);
    } else {
      this._right.normalize();
    }
    this._up.crossVectors(this._fwd, this._right).normalize();
  }

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

    // ─── Chase: Pitch + Heading mit, Roll ohne ───────────────────────────
    this.buildNoRollBasis(jet);
    const off = C.chaseOffset;

    // hinter dem Jet (entlang Flugrichtung inkl. Pitch), etwas „über“ dem Jet (roll-freies Up)
    this._desired
      .copy(jet.position)
      .addScaledVector(this._fwd, -off.z)
      .addScaledVector(this._up, off.y);

    // Blick voraus entlang der Flugrichtung
    this._look
      .copy(jet.position)
      .addScaledVector(this._fwd, 50)
      .addScaledVector(this._up, 1.0);

    const kPos = 1 - Math.exp(-C.lerpPos * dt);
    if (!this.ready) {
      this.currentPos.copy(this._desired);
      this.currentLook.copy(this._look);
      this.ready = true;
    } else {
      this.currentPos.lerp(this._desired, kPos);
      this.currentLook.lerp(this._look, kPos);
    }

    const wantTrack = trackTargetWorld ? 0.75 : 0;
    this.trackBlend += (wantTrack - this.trackBlend) * Math.min(1, dt * 3.5);
    if (this.trackBlend > 0.02 && trackTargetWorld) {
      this._look.copy(this.currentLook).lerp(trackTargetWorld, this.trackBlend);
    } else {
      this._look.copy(this.currentLook);
    }

    camera.position.copy(this.currentPos);
    // Up ohne Roll → Horizon kippt mit Pitch, aber nicht mit Bank
    camera.up.copy(this._up);
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

    this.buildNoRollBasis(jet);
    // freeYaw=0 = hinter dem Jet (entgegen forward)
    const behind = this._fwd.clone().negate();
    const worldOff = new THREE.Vector3()
      .addScaledVector(behind, Math.cos(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist)
      .addScaledVector(this._right, Math.sin(this.freeYaw) * Math.cos(this.freePitch) * this.freeDist)
      .addScaledVector(this._up, Math.sin(this.freePitch) * this.freeDist);

    const desired = jet.position.clone().add(worldOff);
    const k = 1 - Math.exp(-14 * dt);
    this.currentPos.lerp(desired, this.ready ? k : 1);
    this.ready = true;

    camera.position.copy(this.currentPos);
    camera.up.copy(this._up);
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
    this.buildNoRollBasis(jet);
    this.currentPos
      .copy(jet.position)
      .addScaledVector(this._fwd, -off.z)
      .addScaledVector(this._up, off.y);
    this.currentLook
      .copy(jet.position)
      .addScaledVector(this._fwd, 50)
      .addScaledVector(this._up, 1.0);
    this.ready = true;
    this.trackBlend = 0;
    if (this.mode === 'free') {
      this.freeYaw = 0;
      this.freePitch = 0.28;
    }
  }
}
