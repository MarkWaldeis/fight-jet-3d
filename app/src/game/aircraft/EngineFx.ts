import * as THREE from 'three';

/**
 * Animiertes Triebwerks-/Nachbrenner-FX am Heck (+Z).
 * Idle-Glut bei Schub, hell/lang bei Afterburner, flackert mit der Zeit.
 */
export class EngineFx {
  readonly group = new THREE.Group();
  private core: THREE.Mesh;
  private outer: THREE.Mesh;
  private glow: THREE.Mesh;
  private light: THREE.PointLight;
  private time = 0;
  private level = 0; // 0..1 geglättet

  constructor(nozzleLocal = new THREE.Vector3(0, -0.05, 7.4)) {
    this.group.position.copy(nozzleLocal);

    // Innerer heißer Kern (weiß-blau)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.core = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1, 12, 1, true), coreMat);
    this.core.rotation.x = Math.PI / 2;
    this.core.position.z = 0.6;
    this.group.add(this.core);

    // Äußerer Flammenkegel
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.outer = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 14, 1, true), outerMat);
    this.outer.rotation.x = Math.PI / 2;
    this.outer.position.z = 1.2;
    this.group.add(this.outer);

    // Weicher Glow-Sprite (Scheibe)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x66aaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), glowMat);
    this.glow.position.z = 0.15;
    this.group.add(this.glow);

    this.light = new THREE.PointLight(0x77aaff, 0, 40);
    this.light.position.z = 1.5;
    this.group.add(this.light);
  }

  /**
   * @param throttle 0..1
   * @param afterburner Tab / max thrust
   */
  update(dt: number, throttle: number, afterburner: boolean) {
    this.time += dt;
    const target = afterburner ? 1 : THREE.MathUtils.clamp(throttle * 0.55, 0.08, 0.55);
    this.level += (target - this.level) * Math.min(1, dt * 6);

    const flicker = 0.85 + 0.15 * Math.sin(this.time * 28 + Math.sin(this.time * 7) * 2);
    const abFlicker = afterburner
      ? 0.75 + 0.25 * Math.sin(this.time * 45) * Math.sin(this.time * 11)
      : flicker;

    const L = this.level * abFlicker;

    // Kern: kurz & hell
    const coreMat = this.core.material as THREE.MeshBasicMaterial;
    coreMat.opacity = L * (afterburner ? 0.95 : 0.45);
    coreMat.color.setHex(afterburner ? 0xfff0cc : 0xaaccff);
    const coreLen = afterburner ? 3.2 + Math.sin(this.time * 30) * 0.4 : 1.1 + L * 0.8;
    this.core.scale.set(0.9 + L * 0.3, 0.9 + L * 0.3, coreLen);
    this.core.position.z = coreLen * 0.45;
    this.core.visible = L > 0.05;

    // Outer plume
    const outerMat = this.outer.material as THREE.MeshBasicMaterial;
    outerMat.opacity = L * (afterburner ? 0.75 : 0.35);
    outerMat.color.setHex(afterburner ? 0x66aaff : 0x3366aa);
    const outerLen = afterburner ? 5.5 + Math.sin(this.time * 22) * 0.7 : 1.6 + L * 1.4;
    this.outer.scale.set(0.85 + L * 0.5, 0.85 + L * 0.5, outerLen);
    this.outer.position.z = outerLen * 0.42;
    this.outer.rotation.z = this.time * (afterburner ? 4 : 1.2);
    this.outer.visible = L > 0.05;

    // Düsen-Glow
    const glowMat = this.glow.material as THREE.MeshBasicMaterial;
    glowMat.opacity = L * (afterburner ? 0.7 : 0.35);
    glowMat.color.setHex(afterburner ? 0xaaccff : 0x4488cc);
    const gs = 0.6 + L * (afterburner ? 1.4 : 0.6);
    this.glow.scale.setScalar(gs);

    this.light.intensity = L * (afterburner ? 14 : 4);
    this.light.distance = afterburner ? 50 : 25;
    this.light.color.setHex(afterburner ? 0x88ccff : 0x5577aa);
  }

  /** Für Legacy-API (nur an/aus AB) */
  setAfterburner(on: boolean) {
    // wird über update() gesteuert; hier nur Soft-Boost
    if (on) this.level = Math.max(this.level, 0.9);
  }
}
