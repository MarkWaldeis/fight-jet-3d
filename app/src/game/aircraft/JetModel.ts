import * as THREE from 'three';

// Baut eine stilisierte, aber erkennbare F-16-Silhouette aus Primitiven.
// Rückgabe: Group mit nach vorn = -Z (Three.js-Konvention).
export function buildF16(options: { bodyColor: number; accentColor: number }): {
  group: THREE.Group;
  afterburner: THREE.Mesh;
  abLight: THREE.PointLight;
} {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: options.bodyColor, metalness: 0.55, roughness: 0.42,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x2e3138, metalness: 0.4, roughness: 0.6,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2633, metalness: 0.9, roughness: 0.08,
    transparent: true, opacity: 0.9,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: options.accentColor, metalness: 0.3, roughness: 0.5,
  });

  // Rumpf: längliche, leicht konische Kapsel (Länge ~15 m)
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 11, 6, 12), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.scale.set(0.85, 1, 0.75);
  g.add(fuselage);

  // Nase (Radom)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 3.2, 12), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -0.05, -7.2);
  nose.scale.set(0.9, 1, 0.8);
  g.add(nose);

  // Cockpit-Haube
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), canopyMat);
  canopy.position.set(0, 0.62, -3.4);
  canopy.scale.set(0.72, 0.6, 1.7);
  g.add(canopy);

  // Tragflächen (Delta-Trapez)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(4.6, 2.4);
  wingShape.lineTo(4.6, 4.4);
  wingShape.lineTo(0, 3.4);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2); // in XZ-Ebene legen, Spannweite entlang X
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.scale.x = side;
    wing.position.set(0, -0.1, -1.4);
    g.add(wing);
    // Flügelspitzen-Raketen (AIM-9) als Akzent
    const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.6, 4, 8), accentMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(side * 4.6, -0.05, -0.4);
    g.add(tip);
  }

  // Seitenleitwerk (F-16: einzelnes, groß)
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(0.0, 3.1);
  tailShape.lineTo(1.9, 1.2);
  tailShape.lineTo(2.1, 0);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.1, bevelEnabled: false });
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.position.set(-0.05, 0.3, 4.4);
  g.add(tail);
  // Leitwerks-Streifen
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.4), accentMat);
  stripe.position.set(0, 2.2, 4.9);
  g.add(stripe);

  // Höhenleitwerke
  const hTailGeo = new THREE.BoxGeometry(2.4, 0.09, 1.3);
  for (const side of [-1, 1]) {
    const ht = new THREE.Mesh(hTailGeo, bodyMat);
    ht.position.set(side * 1.25, 0.15, 5.4);
    ht.rotation.z = side * -0.06;
    g.add(ht);
  }

  // Lufteinlass (F-16: Baucheinlass)
  const intake = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 2.4), darkMat);
  intake.position.set(0, -0.72, -1.6);
  g.add(intake);

  // Triebwerksdüse
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 1.4, 12), darkMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0, 6.3);
  g.add(nozzle);

  // Nachbrenner-Flamme (Cone, skaliert bei AB)
  const abMat = new THREE.MeshBasicMaterial({
    color: 0x66aaff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const afterburner = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.4, 10, 1, true), abMat);
  afterburner.rotation.x = Math.PI / 2;
  afterburner.position.set(0, 0, 9.0);
  afterburner.visible = false;
  g.add(afterburner);
  const abLight = new THREE.PointLight(0x77aaff, 0, 30);
  abLight.position.set(0, 0, 7.5);
  g.add(abLight);

  return { group: g, afterburner, abLight };
}

// Wingtip-Contrails: zwei kurze Trails hinter den Flügelspitzen
export class Contrails {
  readonly group = new THREE.Group();
  private trails: { mesh: THREE.Mesh; positions: THREE.Vector3[]; tipOffset: THREE.Vector3 }[] = [];
  private jet: THREE.Object3D;

  constructor(jet: THREE.Object3D) {
    this.jet = jet;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false,
    });
    for (const side of [-4.6, 4.6]) {
      const geo = new THREE.CylinderGeometry(0.06, 0.5, 26, 6, 1, true);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, 13);
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.trails.push({ mesh, positions: [], tipOffset: new THREE.Vector3(side, 0, 0) });
    }
  }

  update(_dt: number, speed: number, gForce: number) {
    const visible = speed > 220 && gForce > 1.4;
    this.group.visible = visible;
    if (!visible) return;
    for (const t of this.trails) {
      const world = t.tipOffset.clone().applyMatrix4(this.jet.matrixWorld);
      t.mesh.position.copy(world);
      t.mesh.quaternion.copy(this.jet.quaternion);
    }
  }
}
