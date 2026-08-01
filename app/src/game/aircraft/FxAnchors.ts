import * as THREE from 'three';

/** Ankerpunkte im lokalen Raum des Aircraft-Objekts (Nase −Z, Heck +Z). */
export interface FxAnchors {
  nozzles: THREE.Vector3[];
  muzzles: THREE.Vector3[];
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

  return {
    nozzles,
    muzzles,
    wingHalfSpan: width * 0.48,
    nozzleScale: THREE.MathUtils.clamp(width / 11, 0.55, 1.25),
  };
}
