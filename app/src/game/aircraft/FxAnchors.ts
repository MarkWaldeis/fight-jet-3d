import * as THREE from 'three';

/** Ankerpunkte im lokalen Raum des Aircraft-Objekts (Nase −Z, Heck +Z). */
export interface FxAnchors {
  nozzles: THREE.Vector3[];
  muzzles: THREE.Vector3[];
  /** Raketen-Hardpoints (Wingtip / Underwing) */
  hardpoints: THREE.Vector3[];
  wingHalfSpan: number;
  nozzleScale: number;
}

/**
 * Misst die Bounding-Box des Visuals im lokalen Raum von `parent`
 * und leitet realistische Düsen- und Mündungspositionen ab.
 * So kleben FX am Modell, auch wenn Katalog-Werte ungenau sind.
 */
export function computeFxAnchors(
  visual: THREE.Object3D,
  parent: THREE.Object3D,
  opts: { twinNozzles?: boolean; twinMuzzles?: boolean } = {}
): FxAnchors {
  parent.updateMatrixWorld(true);
  visual.updateMatrixWorld(true);

  const worldBox = new THREE.Box3().setFromObject(visual);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();

  const corners = [
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z),
  ];

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of corners) {
    c.applyMatrix4(inv);
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
  }

  const length = Math.max(0.1, maxZ - minZ);
  const width = Math.max(0.1, maxX - minX);
  const height = Math.max(0.1, maxY - minY);
  const midY = (minY + maxY) * 0.5;

  // Düse: am hinteren Ende (+Z), leicht unter der Rumpfmitte (typisch F-16/F-35)
  const aftZ = maxZ - length * 0.015;
  const nozzleY = minY + height * 0.36;
  // Mündung: vorne (−Z), etwas über der Mitte
  const noseZ = minZ + length * 0.06;
  const muzzleY = midY + height * 0.02;

  const twinN = opts.twinNozzles ?? width > length * 0.52;
  const twinM = opts.twinMuzzles ?? twinN;
  const nx = width * 0.11;
  const mx = width * 0.07;

  const nozzles = twinN
    ? [new THREE.Vector3(-nx, nozzleY, aftZ), new THREE.Vector3(nx, nozzleY, aftZ)]
    : [new THREE.Vector3(0, nozzleY, aftZ)];

  const muzzles = twinM
    ? [new THREE.Vector3(-mx, muzzleY, noseZ), new THREE.Vector3(mx, muzzleY, noseZ)]
    : [new THREE.Vector3(-mx * 0.6, muzzleY, noseZ)];

  // Hardpoints: Wingtip-Rails + Mid-Wing + Inner-Wing + Belly (8 Stationen fuer volle Raketen-Beladung)
  // Positionen werden an der tatsaechlichen Fluegel-Unterseite (Wing Skin) verankert
  
  // Sample wing Z position from actual vertices (where |x| is max → Fluegel)
  let wingZcomputed = minZ + length * 0.40;
  let wingSampleN = 0;
  const vWing = new THREE.Vector3();
  visual.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 800));
    for (let i = 0; i < pos.count; i += step) {
      vWing.fromBufferAttribute(pos, i);
      mesh.localToWorld(vWing);
      visual.worldToLocal(vWing);
      // Nur aeussere 30% der Spannweite → Fluegelspitzen
      if (Math.abs(vWing.x) > width * 0.30) {
        wingZcomputed += vWing.z;
        wingSampleN++;
      }
    }
  });
  const wingZ = wingSampleN > 10 ? wingZcomputed / wingSampleN : (minZ + length * 0.40);
  
  const tipX = width * 0.46;
  const midX = width * 0.34;
  const innerX = width * 0.22;
  const bellyX = width * 0.11;

  // Sample die Fluegel-Unterseite an jeder Hardpoint-Position
  const hpCandidates = [
    { x: -tipX, z: wingZ },
    { x: tipX, z: wingZ },
    { x: -midX, z: wingZ + length * 0.03 },
    { x: midX, z: wingZ + length * 0.03 },
    { x: -innerX, z: wingZ + length * 0.06 },
    { x: innerX, z: wingZ + length * 0.06 },
    { x: -bellyX, z: wingZ + length * 0.08 },
    { x: bellyX, z: wingZ + length * 0.08 },
  ];

  // Wing-Skin-Sampling: Finde niedrigsten Vertex in der Naehe jedes Hardpoints
  // Erweiterter Suchradius fuer bessere Erkennung
  const hardpoints = hpCandidates.map((hp) => {
    const skinY = sampleWingSkinY(visual, hp.x, hp.z, width * 0.10, midY);
    const fallbackY = midY - height * (0.08 + Math.abs(hp.x) / width * 0.30);
    return new THREE.Vector3(hp.x, skinY ?? fallbackY, hp.z);
  });

  return {
    nozzles,
    muzzles,
    hardpoints,
    wingHalfSpan: width * 0.48,
    nozzleScale: THREE.MathUtils.clamp(width / 11, 0.55, 1.25),
  };
}

/**
 * Sucht die unterste Vertex-Y-Position in der Naehe eines Hardpoints,
 * um die Rakete exakt an der Fluegel-Unterseite zu platzieren.
 * Gibt null zurueck wenn keine Vertices in der Suchregion gefunden werden.
 */
function sampleWingSkinY(
  visual: THREE.Object3D,
  targetX: number,
  targetZ: number,
  searchRadius: number,
  midY: number
): number | null {
  let bestY: number | null = null;
  const v = new THREE.Vector3();

  visual.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 1200));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      visual.worldToLocal(v);

      // Nur Vertices in der Naehe des Hardpoints (XZ-Radius)
      const dx = v.x - targetX;
      const dz = v.z - targetZ;
      if (Math.abs(dx) > searchRadius || Math.abs(dz) > searchRadius * 1.5) continue;

      // Nur untere Haelfte des Fluegels (unter midY)
      if (v.y > midY) continue;

      // Niedrigster Y = Fluegel-Unterseite
      if (bestY === null || v.y < bestY) {
        bestY = v.y;
      }
    }
  });

  return bestY;
}
