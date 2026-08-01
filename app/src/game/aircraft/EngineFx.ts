import * as THREE from 'three';

interface NozzleFx {
  group: THREE.Group;
  core: THREE.Mesh;
  outer: THREE.Mesh;
  glow: THREE.Mesh;
  disc: THREE.Mesh;
}

/**
 * Nachbrenner-FX exakt an den Düsen-Ankern (Aircraft-lokal).
 * group ist Kind von Aircraft.object → bewegt und rotiert mit dem Jet.
 * Jede Düse: Glow-Scheibe am Austritt + Flammenkegel nur nach +Z (Heck).
 */
export class EngineFx {
  readonly group = new THREE.Group();
  private nozzles: NozzleFx[] = [];
  private light = new THREE.PointLight(0x77aaff, 0, 40);
  private time = 0;
  private level = 0;
  private fxScale = 1;

  constructor(nozzles: THREE.Vector3[] = [new THREE.Vector3(0, -0.05, 7.4)], scale = 1) {
    this.configure(nozzles, scale);
  }

  configure(nozzles: THREE.Vector3[], scale = 1) {
    this.fxScale = scale;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.nozzles = [];

    // Kegel-Geometrie: Basis bei z=0 (Düse), Spitze bei z=+1 (Heck/Abgas)
    const makeCone = (r: number) => {
      const geo = new THREE.ConeGeometry(r, 1, 14, 1, true);
      geo.rotateX(Math.PI / 2); // Y-Höhe → +Z
      geo.translate(0, 0, 0.5); // Basis bei 0, Spitze bei +1
      return geo;
    };

    for (const pos of nozzles) {
      const g = new THREE.Group();
      g.position.copy(pos);

      // Helle Austrittsscheibe sitzt IN der Düse
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.42, 18),
        new THREE.MeshBasicMaterial({
          color: 0xaaccff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      disc.position.z = 0.02;
      g.add(disc);

      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 16),
        new THREE.MeshBasicMaterial({
          color: 0x66aaff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.z = 0.04;
      g.add(glow);

      const core = new THREE.Mesh(
        makeCone(0.22),
        new THREE.MeshBasicMaterial({
          color: 0xfff2cc,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      g.add(core);

      const outer = new THREE.Mesh(
        makeCone(0.4),
        new THREE.MeshBasicMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      g.add(outer);

      this.group.add(g);
      this.nozzles.push({ group: g, core, outer, glow, disc });
    }

    const centroid = new THREE.Vector3();
    for (const p of nozzles) centroid.add(p);
    if (nozzles.length) centroid.divideScalar(nozzles.length);
    this.light.position.copy(centroid);
    this.group.add(this.light);
  }

  update(dt: number, throttle: number, afterburner: boolean) {
    this.time += dt;
    const target = afterburner ? 1 : THREE.MathUtils.clamp(throttle * 0.5, 0.06, 0.5);
    this.level += (target - this.level) * Math.min(1, dt * 7);

    const flicker = 0.88 + 0.12 * Math.sin(this.time * 32 + Math.sin(this.time * 9) * 2);
    const abFlicker = afterburner
      ? 0.78 + 0.22 * Math.sin(this.time * 48) * Math.sin(this.time * 13)
      : flicker;
    const L = this.level * abFlicker;
    const s = this.fxScale;

    for (const nz of this.nozzles) {
      const discMat = nz.disc.material as THREE.MeshBasicMaterial;
      discMat.opacity = L * (afterburner ? 0.95 : 0.4);
      discMat.color.setHex(afterburner ? 0xfff0dd : 0x88bbff);
      nz.disc.scale.setScalar((0.55 + L * 0.55) * s);
      nz.disc.visible = L > 0.04;

      const glowMat = nz.glow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = L * (afterburner ? 0.55 : 0.25);
      glowMat.color.setHex(afterburner ? 0xaaccff : 0x4477cc);
      nz.glow.scale.setScalar((0.7 + L * (afterburner ? 1.1 : 0.5)) * s);
      nz.glow.visible = L > 0.04;

      // Kern: Länge entlang +Z, Basis bleibt an Düse (scale.z = Länge nach translate)
      const coreLen = (afterburner ? 2.8 + Math.sin(this.time * 30) * 0.35 : 0.9 + L * 0.7) * s;
      const coreW = (0.75 + L * 0.35) * s;
      nz.core.scale.set(coreW, coreW, coreLen);
      (nz.core.material as THREE.MeshBasicMaterial).opacity = L * (afterburner ? 0.9 : 0.4);
      (nz.core.material as THREE.MeshBasicMaterial).color.setHex(afterburner ? 0xfff0cc : 0xaaccff);
      nz.core.visible = L > 0.05;

      const outerLen = (afterburner ? 4.8 + Math.sin(this.time * 22) * 0.55 : 1.4 + L * 1.2) * s;
      const outerW = (0.85 + L * 0.45) * s;
      nz.outer.scale.set(outerW, outerW, outerLen);
      (nz.outer.material as THREE.MeshBasicMaterial).opacity = L * (afterburner ? 0.65 : 0.28);
      (nz.outer.material as THREE.MeshBasicMaterial).color.setHex(afterburner ? 0x66aaff : 0x3366aa);
      nz.outer.visible = L > 0.05;
    }

    this.light.intensity = L * (afterburner ? 12 : 3.5) * Math.max(1, this.nozzles.length * 0.7);
    this.light.distance = (afterburner ? 45 : 22) * s;
    this.light.color.setHex(afterburner ? 0x88ccff : 0x5577aa);
  }

  setAfterburner(on: boolean) {
    if (on) this.level = Math.max(this.level, 0.9);
  }
}
