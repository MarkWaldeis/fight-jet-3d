import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Chase-Kamera (Standard):
 * - Position: immer hinter + leicht über dem Jet
 * - Folgt Heading & Pitch; Bank nur teilweise (chaseRollFollow)
 * - Blick PARALLEL zur Nase → Fadenkreuz vor dem Flugzeug
 *
 * Free-Look: Orbit. Cockpit: Pilotensicht.
 */
export class CameraController {
  mode: 'chase' | 'cockpit' | 'free' = 'chase';
  private modeBeforeFree: 'chase' | 'cockpit' = 'chase';

  private currentPos = new THREE.Vector3(0, 620, 3200);
  private currentFwd = new THREE.Vector3(0, 0, -1);
  private currentUp = new THREE.Vector3(0, 1, 0);
  private ready = false;
  private trackBlend = 0;

  private freeYaw = 0;
  private freePitch = 0.25;
  private freeDist = 28;

  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _jetUp = new THREE.Vector3();
  private _desired = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);

  /**
   * Basis aus der Jet-Nase:
   * - forward = echte Flug-/Schussrichtung (Pitch + Heading)
   * - up = roll-frei, dann leicht mit Jet-Bank gemischt (chaseRollFollow)
   */
  private buildChaseBasis(jet: THREE.Object3D, rollFollow: number) {
    this._fwd.set(0, 0, -1).applyQuaternion(jet.quaternion);
    if (this._fwd.lengthSq() < 1e-8) this._fwd.set(0, 0, -1);
    else this._fwd.normalize();

    // Roll-freie Right/Up
    this._right.crossVectors(this._worldUp, this._fwd);
    if (this._right.lengthSq() < 1e-6) {
      this._right.set(1, 0, 0);
    } else {
      this._right.normalize();
    }
    this._up.crossVectors(this._fwd, this._right).normalize();

    // Leicht mit der Bank mitkippen (nicht voll mitdrehen)
    if (rollFollow > 0.001) {
      this._jetUp.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
      this._up.lerp(this._jetUp, THREE.MathUtils.clamp(rollFollow, 0, 1)).normalize();
      // orthogonal halten
      this._right.crossVectors(this._up, this._fwd).normalize();
      this._up.crossVectors(this._fwd, this._right).normalize();
    }
  }

  /** Free-Look / Cockpit: weiterhin roll-freie Basis */
  private buildNoRollBasis(jet: THREE.Object3D) {
    this.buildChaseBasis(jet, 0);
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
        this.buildNoRollBasis(jet);
        camera.up.copy(this._up);
        const bore = camera.position.clone().addScaledVector(this._fwd, 80);
        camera.lookAt(bore.lerp(trackTargetWorld, this.trackBlend));
      } else {
        camera.quaternion.copy(jet.quaternion);
        camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
        camera.rotateX(-0.05);
      }
      this.ready = false;
      return;
    }

    // ─── Chase: hinter + über dem Jet, Blick parallel zur Nase ────────────
    const rollFollow = C.chaseRollFollow ?? 0.28;
    this.buildChaseBasis(jet, rollFollow);
    const off = C.chaseOffset;
    const lookDist = C.chaseLookAhead ?? 200;

    // Position: immer hinter dem Jet (entlang der Nase), leicht darüber
    // → auch beim Drehen bleibt die Kamera hinter dem Flugzeug
    this._desired
      .copy(jet.position)
      .addScaledVector(this._fwd, -off.z)
      .addScaledVector(this._up, off.y);

    const k = 1 - Math.exp(-C.lerpPos * dt);
    if (!this.ready) {
      this.currentPos.copy(this._desired);
      this.currentFwd.copy(this._fwd);
      this.currentUp.copy(this._up);
      this.ready = true;
    } else {
      this.currentPos.lerp(this._desired, k);
      // Richtungen weich nachziehen — Bank nur teilweise (rollFollow)
      this.currentFwd.lerp(this._fwd, k).normalize();
      this.currentUp.lerp(this._up, k).normalize();
      // Orthogonal halten
      this._right.crossVectors(this.currentUp, this.currentFwd).normalize();
      this.currentUp.crossVectors(this.currentFwd, this._right).normalize();
    }

    // Blick PARALLEL zur Nase von der Kamera aus:
    // → Bildschirmmitte / Fadenkreuz liegt VOR dem Flugzeug (nicht auf dem Rumpf)
    this._look
      .copy(this.currentPos)
      .addScaledVector(this.currentFwd, lookDist);

    // Auto-Track: Blickpunkt mischt zur Zielposition (Kamera bleibt hinter dem Jet)
    const wantTrack = trackTargetWorld ? 0.72 : 0;
    this.trackBlend += (wantTrack - this.trackBlend) * Math.min(1, dt * 3.5);
    if (this.trackBlend > 0.02 && trackTargetWorld) {
      this._look.lerp(trackTargetWorld, this.trackBlend);
    }

    camera.position.copy(this.currentPos);
    camera.up.copy(this.currentUp); // leichte Bank, kein Voll-Mitrollen
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
    const rollFollow = CONFIG.camera.chaseRollFollow ?? 0.28;
    this.buildChaseBasis(jet, this.mode === 'chase' ? rollFollow : 0);
    this.currentPos
      .copy(jet.position)
      .addScaledVector(this._fwd, -off.z)
      .addScaledVector(this._up, off.y);
    this.currentFwd.copy(this._fwd);
    this.currentUp.copy(this._up);
    this.ready = true;
    this.trackBlend = 0;
    if (this.mode === 'free') {
      this.freeYaw = 0;
      this.freePitch = 0.28;
    }
  }
}
