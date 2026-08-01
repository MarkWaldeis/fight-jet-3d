import * as THREE from 'three';

interface NozzleFx {
  group: THREE.Group;
  core: THREE.Mesh;
  outer: THREE.Mesh;
  glow: THREE.Mesh;
}

/**
 * Animierte Triebwerks-/Nachbrenner-FX an den Düsen (Heck, +Z).
 * Unterstützt mehrere Düsen pro Jet (z. B. Elite-Jäger: links & rechts).
 * Idle-Glut bei Schub, hell/lang bei Afterburner, flackert mit der Zeit.
 */
export class EngineFx {
  readonly group = new THREE.Group();
  private nozzles: NozzleFx[] = [];
  private light = new THREE.PointLight(0x77aaff, 0, 40);
  private time = 0;
  private level = 0; // 0..1 geglättet
  private fxScale = 1;

  constructor(nozzles: THREE.Vector3[] = [new THREE.Vector3(0, -0.05, 7.4)], scale = 1) {
    this.configure(nozzles, scale);
  }

  /** Baut die Düsen-FX neu auf (z. B. nach Jet-Wechsel). */
  configure(nozzles: THREE.Vector3[], scale = 1) {
    this.fxScale = scale;
    for (const child of [...this.group.children]) this.group.remove(child);
    this.nozzles = [];

    for (const pos of nozzles) {
      const g = new THREE.Group();
      g.position.copy(pos);

      // Innerer heißer Kern (weiß-blau)
      const core = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 1, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xaaddff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      core.rotation.x = Math.PI / 2;
      core.position.z = 0.6;
      g.add(core);

      // Äußerer Flammenkegel
      const outer = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 1, 14, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      outer.rotation.x = Math.PI / 2;
      outer.position.z = 1.2;
      g.add(outer);

      // Weicher Glow (Scheibe direkt an der Düse — lässt sie aufglühen)
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.7, 16),
        new THREE.MeshBasicMaterial({
          color: 0x66aaff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.z = 0.15;
      g.add(glow);

      this.group.add(g);
      this.nozzles.push({ group: g, core, outer, glow });
    }

    // Ein Licht am Düsen-Schwerpunkt reicht (Performance)
    const centroid = new THREE.Vector3();
    for (const p of nozzles) centroid.add(p);
    centroid.divideScalar(Math.max(1, nozzles.length));
    this.light.position.copy(centroid).add(new THREE.Vector3(0, 0, 1.5));
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
    const s = this.fxScale;

    for (const nz of this.nozzles) {
      // ACHTUNG: Scale wirkt vor der Rotation — die Kegel-Achse ist lokal Y,
      // also geht die Länge in scale.y (x/z = Breite), nicht in scale.z.
      // Kern: kurz & hell
      const coreMat = nz.core.material as THREE.MeshBasicMaterial;
      coreMat.opacity = L * (afterburner ? 0.95 : 0.45);
      coreMat.color.setHex(afterburner ? 0xfff0cc : 0xaaccff);
      const coreLen = (afterburner ? 3.2 + Math.sin(this.time * 30) * 0.4 : 1.1 + L * 0.8) * s;
      const coreW = (0.9 + L * 0.3) * s;
      nz.core.scale.set(coreW, coreLen, coreW);
      nz.core.position.z = coreLen * 0.45;
      nz.core.visible = L > 0.05;

      // Outer plume
      const outerMat = nz.outer.material as THREE.MeshBasicMaterial;
      outerMat.opacity = L * (afterburner ? 0.75 : 0.35);
      outerMat.color.setHex(afterburner ? 0x66aaff : 0x3366aa);
      const outerLen = (afterburner ? 5.5 + Math.sin(this.time * 22) * 0.7 : 1.6 + L * 1.4) * s;
      const outerW = (0.85 + L * 0.5) * s;
      nz.outer.scale.set(outerW, outerLen, outerW);
      nz.outer.position.z = outerLen * 0.42;
      nz.outer.visible = L > 0.05;

      // Düsen-Glow (die Düse selbst glüht auf)
      const glowMat = nz.glow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = L * (afterburner ? 0.7 : 0.35);
      glowMat.color.setHex(afterburner ? 0xaaccff : 0x4488cc);
      const gs = (0.6 + L * (afterburner ? 1.4 : 0.6)) * s;
      nz.glow.scale.setScalar(gs);
    }

    this.light.intensity = L * (afterburner ? 14 : 4) * this.nozzles.length * 0.75;
    this.light.distance = (afterburner ? 50 : 25) * s;
    this.light.color.setHex(afterburner ? 0x88ccff : 0x5577aa);
  }

  /** Für Legacy-API (nur an/aus AB) */
  setAfterburner(on: boolean) {
    // wird über update() gesteuert; hier nur Soft-Boost
    if (on) this.level = Math.max(this.level, 0.9);
  }
}
