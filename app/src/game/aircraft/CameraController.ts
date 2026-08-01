import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Chase-Kamera:
 * - Leicht hinter + über dem Jet
 * - Blick exakt parallel zur Flug-/Schussrichtung → Fadenkreuz vor der Nase
 * - Pitch/Heading mit, Roll ohne (roll-freie Up-Achse)
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
  private _desired = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _worldUp = new THREE.Vector3(0, 1, 0);

  /**
   * Roll-freie Basis:
   * forward = echte Nase/Schussrichtung (inkl. Pitch),
   * right = Welt-Up × forward (kein Jet-Roll),
   * up = forward × right.
   */
  private buildNoRollBasis(jet: THREE.Object3D) {
    this._fwd.set(0, 0, -1).applyQuaternion(jet.quaternion);
    if (this._fwd.lengthSq() < 1e-8) this._fwd.set(0, 0, -1);
    else this._fwd.normalize();

    this._right.crossVectors(this._worldUp, this._fwd);
    if (this._right.lengthSq() < 1e-6) {
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
        // Cockpit: Blick leicht zum Ziel, aber Up roll-frei angenähert
        this.buildNoRollBasis(jet);
        camera.up.copy(this._up);
        const bore = camera.position.clone().addScaledVector(this._fwd, 80);
        camera.lookAt(bore.lerp(trackTargetWorld, this.trackBlend));
      } else {
        // Reiner Boresight im Cockpit: exakt Jet-Nase
        camera.quaternion.copy(jet.quaternion);
        camera.up.set(0, 1, 0).applyQuaternion(jet.quaternion).normalize();
        // leichter Nick nur für Instrumente — minimal
        camera.rotateX(-0.04);
      }
      this.ready = false;
      return;
    }

    // ─── Chase ───────────────────────────────────────────────────────────
    // Position: hinter + leicht ÜBER dem Jet (roll-freies Up).
    // Blick: PARALLEL zur Nase/Schussrichtung → Fadenkreuz vor dem Jet, nicht darauf.
    this.buildNoRollBasis(jet);
    const off = C.chaseOffset;

    this._desired
      .copy(jet.position)
      .addScaledVector(this._fwd, -off.z) // hinter der Nase
      .addScaledVector(this._up, off.y); // leicht darüber

    // Zielpunkt weit voraus entlang der Schussachse (von der Kamera aus parallel)
    // lookAt(camPos + fwd) ⇒ Blickrichtung = Jet-Forward = Kanonen
    this._look.copy(this._desired).addScaledVector(this._fwd, 200);

    const k = 1 - Math.exp(-C.lerpPos * dt);
    if (!this.ready) {
      this.currentPos.copy(this._desired);
      this.currentFwd.copy(this._fwd);
      this.currentUp.copy(this._up);
      this.ready = true;
    } else {
      this.currentPos.lerp(this._desired, k);
      // Richtungen weich nachziehen (ohne Quaternion des Jets zu kopieren)
      this.currentFwd.lerp(this._fwd, k).normalize();
      this.currentUp.lerp(this._up, k).normalize();
      // Orthogonal halten
      this._right.crossVectors(this.currentUp, this.currentFwd).normalize();
      this.currentUp.crossVectors(this.currentFwd, this._right).normalize();
    }

    // Auto-Track: Blick leicht zum gelockten Ziel, aber Start = Schussachse
    const wantTrack = trackTargetWorld ? 0.7 : 0;
    this.trackBlend += (wantTrack - this.trackBlend) * Math.min(1, dt * 3.5);

    camera.position.copy(this.currentPos);
    camera.up.copy(this.currentUp);

    if (this.trackBlend > 0.02 && trackTargetWorld) {
      // Mischung: Schussachse-Punkt vor der Kamera ↔ Ziel
      const borePoint = this.currentPos.clone().addScaledVector(this.currentFwd, 200);
      this._look.copy(borePoint).lerp(trackTargetWorld, this.trackBlend);
      camera.lookAt(this._look);
    } else {
      // Exakt parallel zur Nase → Fadenkreuz = wohin geschossen wird
      camera.lookAt(
        this.currentPos.x + this.currentFwd.x * 200,
        this.currentPos.y + this.currentFwd.y * 200,
        this.currentPos.z + this.currentFwd.z * 200
      );
    }
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
    this.buildNoRollBasis(jet);
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
