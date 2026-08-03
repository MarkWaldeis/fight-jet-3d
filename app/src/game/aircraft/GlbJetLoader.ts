import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Ziel-Länge des Jets in Welt-Metern (passt zum Flight-Model / Chase-Cam). */
const DEFAULT_TARGET_LENGTH = 15.5;

/** Per-Jet Korrektur nach Auto-Ausrichtung (Nase = local −Z). */
export type ModelOrient = {
  /** Zusätzlicher Yaw in Grad (positiv = links um Welt-Y / local Y) */
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  /** Standard-180°-Flip (+Z→−Z) überspringen — Asset schaut schon Richtung −Z */
  skipDefaultYawFlip?: boolean;
  /**
   * Auto-Align: Rumpf = längste Horizontalachse (moderne Jets).
   * Default false: Spannweite = längste Horizontalachse (WWII-Props).
   */
  lengthIsLargest?: boolean;
};

export interface LoadJetOptions {
  orient?: ModelOrient;
  /** Ziel-Rumpflänge in Metern (Props ~9–11 m, Jets ~15 m) */
  targetLength?: number;
}

export interface LoadedJetVisual {
  group: THREE.Group;
  /** Bounding box nach Normalisierung (lokal) */
  size: THREE.Vector3;
}

/**
 * Lädt ein externes GLB/GLTF-Jet-Modell, skaliert es auf Spielgröße und
 * richtet die Nase auf local -Z aus (Three.js / FlightModel-Konvention).
 */
export async function loadJetGlb(
  url: string,
  orientOrOpts?: ModelOrient | LoadJetOptions
): Promise<LoadedJetVisual> {
  const opts: LoadJetOptions =
    orientOrOpts && ('orient' in orientOrOpts || 'targetLength' in orientOrOpts)
      ? (orientOrOpts as LoadJetOptions)
      : { orient: orientOrOpts as ModelOrient | undefined };
  const orient = opts.orient;
  const targetLength = opts.targetLength ?? DEFAULT_TARGET_LENGTH;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;

  const gearRe = /gear|wheel|tire|tyre|landing|baydoor|bay_door|strut|oleo/i;
  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) {
      obj.parent?.remove(obj);
      return;
    }
    if (gearRe.test(obj.name)) {
      obj.visible = false;
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if ('envMapIntensity' in std) std.envMapIntensity = 0.4;
        if ('metalness' in std && std.metalness > 0.85) std.metalness = 0.55;
        if ('roughness' in std && std.roughness < 0.15) std.roughness = 0.25;
        if ('map' in std && std.map == null) std.map = null;
        std.needsUpdate = true;
      }
    }
  });

  const wrap = new THREE.Group();
  wrap.name = 'glbJet';
  wrap.add(root);

  // 1) Bounding box messen + zentrieren
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  let center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());

  // 2) Vorläufig skalieren (längste Kante → targetLength)
  const longest = Math.max(size.x, size.y, size.z);
  const scale = targetLength / Math.max(longest, 0.001);
  wrap.scale.setScalar(scale);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  root.position.sub(center.clone().divideScalar(scale));

  // 3) Achsen: Up=+Y, Span=+X, Nase=−Z
  alignAircraftAxes(wrap, root, orient);

  // 4) Nach Align: Rumpflänge (Z) auf targetLength — nur wenn plausibel
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const fuselageLen = Math.max(size.z, 0.001);
  const span = Math.max(size.x, 0.001);
  const zPlausible =
    fuselageLen > span * 0.35 &&
    fuselageLen < span * 2.8 &&
    fuselageLen < targetLength * 2.5 &&
    size.y < span * 1.2;
  if (zPlausible && Math.abs(fuselageLen - targetLength) / targetLength > 0.12) {
    const fix = targetLength / fuselageLen;
    wrap.scale.multiplyScalar(fix);
    wrap.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrap);
    center = box.getCenter(new THREE.Vector3());
    root.position.sub(center.clone().divideScalar(wrap.scale.x));
  }

  // Final
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const minY = box.min.y;
  if (minY < -0.5) {
    root.position.y -= minY * 0.15;
  }

  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  return { group: wrap, size };
}

/**
 * Richtet Flugzeuge so aus:
 *  - +Y = oben (kleinste Achse / Höhe)
 *  - +X = rechts (Spannweite)
 *  - −Z = Nase / Flugrichtung
 *
 * WWII-Props: Spannweite oft > Rumpf → nicht die längste Achse als Rumpf nehmen.
 */
function alignAircraftAxes(wrap: THREE.Group, root: THREE.Object3D, orient?: ModelOrient) {
  wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());

  // A) Kleinste Dimension → Up (+Y)
  const dims: { axis: 0 | 1 | 2; s: number }[] = [
    { axis: 0, s: size.x },
    { axis: 1, s: size.y },
    { axis: 2, s: size.z },
  ];
  dims.sort((a, b) => a.s - b.s);
  const heightAxis = dims[0].axis;

  if (heightAxis === 0) {
    root.rotateZ(Math.PI / 2);
  } else if (heightAxis === 2) {
    root.rotateX(-Math.PI / 2);
  }

  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());

  // B) Horizontal: Span → X, Rumpf → Z
  const lengthIsLargest = orient?.lengthIsLargest === true;
  if (lengthIsLargest) {
    if (size.x > size.z * 1.08) {
      root.rotateY(-Math.PI / 2);
    }
  } else if (size.z > size.x * 1.08) {
    root.rotateY(Math.PI / 2);
  }

  wrap.updateMatrixWorld(true);

  // C) Nase auf −Z
  const noseTowardNegZ = detectNoseTowardNegZ(wrap, root);
  if (!orient?.skipDefaultYawFlip) {
    if (!noseTowardNegZ) {
      root.rotateY(Math.PI);
    }
  }

  // D) Sanftes Auto-Level (streng geklemmt)
  autoLevelWingsAndPitch(wrap, root);

  // E) Manuelle Feinkorrektur
  const yaw = THREE.MathUtils.degToRad(orient?.yawDeg ?? 0);
  const pitch = THREE.MathUtils.degToRad(orient?.pitchDeg ?? 0);
  const roll = THREE.MathUtils.degToRad(orient?.rollDeg ?? 0);
  if (Math.abs(yaw) > 1e-6) root.rotateY(yaw);
  if (Math.abs(pitch) > 1e-6) root.rotateX(pitch);
  if (Math.abs(roll) > 1e-6) root.rotateZ(roll);

  // Zentrieren
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c = box2.getCenter(new THREE.Vector3());
  root.position.sub(c);

  // Auf dem Kopf? → 180° Roll
  wrap.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(wrap);
  if (box3.max.y < Math.abs(box3.min.y) * 0.55 && box3.min.y < -0.5) {
    root.rotateZ(Math.PI);
    wrap.updateMatrixWorld(true);
    const box4 = new THREE.Box3().setFromObject(wrap);
    const c2 = box4.getCenter(new THREE.Vector3());
    root.position.sub(c2);
  }
}

function detectNoseTowardNegZ(wrap: THREE.Object3D, root: THREE.Object3D): boolean {
  const propRe = /prop(?!ulsion)|blade|spinner|airscrew|rotor/i;
  const propTips: THREE.Vector3[] = [];
  const tmp = new THREE.Vector3();

  root.traverse((obj) => {
    if (!obj.name || !propRe.test(obj.name)) return;
    obj.getWorldPosition(tmp);
    wrap.worldToLocal(tmp);
    propTips.push(tmp.clone());
  });

  if (propTips.length > 0) {
    const avgZ = propTips.reduce((s, v) => s + v.z, 0) / propTips.length;
    return avgZ < 0;
  }

  const box = new THREE.Box3().setFromObject(wrap);
  const zMin = box.min.z;
  const zMax = box.max.z;
  const zLen = Math.max(0.001, zMax - zMin);
  const band = zLen * 0.12;

  let rMin = 0,
    nMin = 0,
    rMax = 0,
    nMax = 0;
  const v = new THREE.Vector3();
  wrap.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 2500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      wrap.worldToLocal(v);
      const rad = Math.hypot(v.x, v.y);
      if (v.z <= zMin + band) {
        rMin += rad;
        nMin++;
      } else if (v.z >= zMax - band) {
        rMax += rad;
        nMax++;
      }
    }
  });

  if (nMin < 5 || nMax < 5) return false;
  return rMin / nMin <= rMax / nMax;
}

function autoLevelWingsAndPitch(wrap: THREE.Group, root: THREE.Object3D) {
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  if (size.x < 0.5 || size.z < 0.5) return;
  if (size.x < size.y * 0.9) return; // keine klare Spannweite

  const sample = sampleWingAndNose(wrap, size, box);
  if (sample.leftN > 12 && sample.rightN > 12) {
    const dy = sample.rightY - sample.leftY;
    const span = Math.max(0.5, sample.rightX - sample.leftX);
    let roll = Math.atan2(dy, span);
    roll = THREE.MathUtils.clamp(roll, -0.4, 0.4);
    if (Math.abs(roll) > 0.02) root.rotateZ(-roll);
  }

  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const size2 = box2.getSize(new THREE.Vector3());
  const sample2 = sampleWingAndNose(wrap, size2, box2);
  if (sample2.noseN > 12 && sample2.tailN > 12) {
    const dy = sample2.noseY - sample2.tailY;
    const len = Math.max(0.5, sample2.tailZ - sample2.noseZ);
    let pitch = Math.atan2(dy, len);
    pitch = THREE.MathUtils.clamp(pitch, -0.3, 0.3);
    if (Math.abs(pitch) > 0.02) root.rotateX(-pitch);
  }
}

function sampleWingAndNose(wrap: THREE.Object3D, size: THREE.Vector3, box: THREE.Box3) {
  let leftY = 0,
    leftX = 0,
    leftN = 0;
  let rightY = 0,
    rightX = 0,
    rightN = 0;
  let noseY = 0,
    noseZ = 0,
    noseN = 0;
  let tailY = 0,
    tailZ = 0,
    tailN = 0;
  const v = new THREE.Vector3();
  const xWing = size.x * 0.32;
  const yMid = (box.min.y + box.max.y) * 0.5;
  const yBand = size.y * 0.35;
  const zNose = box.min.z + size.z * 0.12;
  const zTail = box.max.z - size.z * 0.12;
  const zWingMin = box.min.z + size.z * 0.2;
  const zWingMax = box.max.z - size.z * 0.2;

  wrap.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 2200));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      wrap.worldToLocal(v);
      if (Math.abs(v.y - yMid) > yBand) continue;

      if (v.x < -xWing && v.z >= zWingMin && v.z <= zWingMax) {
        leftY += v.y;
        leftX += v.x;
        leftN++;
      } else if (v.x > xWing && v.z >= zWingMin && v.z <= zWingMax) {
        rightY += v.y;
        rightX += v.x;
        rightN++;
      }
      if (Math.abs(v.x) < size.x * 0.15) {
        if (v.z <= zNose) {
          noseY += v.y;
          noseZ += v.z;
          noseN++;
        } else if (v.z >= zTail) {
          tailY += v.y;
          tailZ += v.z;
          tailN++;
        }
      }
    }
  });

  return {
    leftY: leftN ? leftY / leftN : 0,
    leftX: leftN ? leftX / leftN : -size.x * 0.4,
    leftN,
    rightY: rightN ? rightY / rightN : 0,
    rightX: rightN ? rightX / rightN : size.x * 0.4,
    rightN,
    noseY: noseN ? noseY / noseN : 0,
    noseZ: noseN ? noseZ / noseN : box.min.z,
    noseN,
    tailY: tailN ? tailY / tailN : 0,
    tailZ: tailN ? tailZ / tailN : box.max.z,
    tailN,
  };
}
