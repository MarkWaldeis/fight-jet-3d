import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Ziel‑Länge des Jets in Welt‑Metern (passt zum Flight‑Model / Chase‑Cam). */
const DEFAULT_TARGET_LENGTH = 15.5;

/** Per‑Jet Korrektur nach Auto‑Ausrichtung (Nase = local −Z). */
export type ModelOrient = {
  /** Zusätzlicher Yaw in Grad (positiv = links um Welt‑Y / local Y) */
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  /** Standard‑180°‑Flip (+Z→−Z) überspringen — Asset schaut schon Richtung −Z */
  skipDefaultYawFlip?: boolean;
  /**
   * Auto‑Align: Rumpf = längste Horizontalachse (moderne Jets).
   * Default false: Spannweite = längste Horizontalachse (WWII‑Props).
   */
  lengthIsLargest?: boolean;
};

export interface LoadJetOptions {
  orient?: ModelOrient;
  /** Ziel‑Rumpflänge in Metern (Props ~9–11 m, Jets ~15 m) */
  targetLength?: number;
}

export interface LoadedJetVisual {
  group: THREE.Group;
  /** Bounding box nach Normalisierung (lokal) */
  size: THREE.Vector3;
}

/**
 * Lädt ein externes GLB/GLTF‑Jet‑Modell, skaliert es auf Spielgröße und
 * richtet die Nase auf local ‑Z aus (Three.js / FlightModel‑Konvention).
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

  // Der Aufrufer (Game.ts) übergibt bereits die individuelle Rumpflänge;
  // als Fallback dient die Default‑Länge.
  const targetLength = opts.targetLength ?? DEFAULT_TARGET_LENGTH;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const rawRoot = gltf.scene;

  // Lichter entfernen, Fahrwerk ausblenden, Material feinjustieren
  const gearRe = /gear|wheel|tire|tyre|landing|baydoor|bay_door|strut|oleo/i;
  rawRoot.traverse((obj) => {
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
        std.needsUpdate = true;
      }
    }
  });

  // Sketchfab/FBX: Freirotationen an Mesh‑Parents neutralisieren
  // (z. B. Spitfire Object001 r=-111,-29,-38) — Geometrie selbst ist oft korrekt.
  neutralizeFreeformPose(rawRoot);

  // Hierarchie flach backen — eliminiert Rest‑Node‑Transforms zuverlässig
  const baked = bakeMeshesToFlatGroup(rawRoot);

  const wrap = new THREE.Group();
  wrap.name = 'glbJet';
  const root = new THREE.Group();
  root.name = 'glbJetRoot';
  // Explizit Identity — keine vererbten GLB‑Root‑Transforms
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.add(baked);
  wrap.add(root);

  // Bounding box messen + zentrieren
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  let center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());

  // Vorläufig skalieren (längste Kante → targetLength)
  const longest = Math.max(size.x, size.y, size.z);
  const scale = targetLength / Math.max(longest, 0.001);
  wrap.scale.setScalar(scale);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  root.position.sub(center.clone().divideScalar(scale));

  // Achsen: Up=+Y, Span=+X, Nase=−Z
  alignAircraftAxes(wrap, root, orient);

  // Nach Align: Rumpflänge (Z) auf targetLength
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

  // Final: nur leichte Feinkorrektur wenn Höhe bereits gut
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const finalHRatio = size.y / Math.max(size.x, size.z, 0.01);
  if (finalHRatio > 0.5) {
    for (let i = 0; i < 3; i++) autoLevelWingsAndPitch(wrap, root, 0.5);
  } else {
    for (let i = 0; i < 2; i++) autoLevelWingsAndPitch(wrap, root, 0.1);
  }

  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  return { group: wrap, size };
}

/**
 * Sketchfab/FBX‑Exports speichern oft eine "Präsentationspose" als freie
 * Multi‑Achsen‑Euler‑Rotation am Mesh‑Parent (z. B. Spitfire Object001
 * r=−111,−29,−38). Die Mesh‑Geometrie selbst ist dann oft korrekt.
 *
 * Wir setzen nur Multi‑Achsen‑Freirotationen zurück.
 * Einzelne ~90°/Y‑up‑Konvertierungen (Sketchfab_model) bleiben erhalten.
 */
function neutralizeFreeformPose(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (obj === root) return;
    // Sketchfab‑Y‑up‑Konvertierung nie anfassen
    if (/sketchfab/i.test(obj.name)) return;

    const hasMeshChild = obj.children.some((c) => (c as THREE.Mesh).isMesh);
    const isMesh = (obj as THREE.Mesh).isMesh;
    if (!hasMeshChild && !isMesh) return;

    const degs = [obj.rotation.x, obj.rotation.y, obj.rotation.z].map((r) =>
      Math.abs(THREE.MathUtils.radToDeg(r))
    );
    const freeCount = degs.filter((d) => {
      const m = d % 90;
      return m > 8 && m < 82;
    }).length;

    // Nur echte Display‑Poses mit ≥2 freien Achsen (Spitfire Object001 etc.)
    if (freeCount >= 2) {
      obj.rotation.set(0, 0, 0);
      obj.position.set(0, 0, 0);
      obj.scale.set(
        Math.abs(obj.scale.x) < 1e-6 ? 1 : obj.scale.x,
        Math.abs(obj.scale.y) < 1e-6 ? 1 : obj.scale.y,
        Math.abs(obj.scale.z) < 1e-6 ? 1 : obj.scale.z
      );
      obj.updateMatrix();
    }
  });
  root.updateMatrixWorld(true);
}

/**
 * Backt matrixWorld jedes sichtbaren Meshes in die Geometrie und legt
 * flache Meshes mit Identity‑Transform an.
 */
function bakeMeshesToFlatGroup(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);
  const flat = new THREE.Group();
  flat.name = 'bakedMeshes';

  source.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;

    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    if (geom.attributes.normal) {
      geom.computeVertexNormals();
    }

    const baked = new THREE.Mesh(geom, mesh.material);
    baked.name = mesh.name || 'mesh';
    baked.castShadow = false;
    baked.receiveShadow = false;
    baked.frustumCulled = true;
    flat.add(baked);
  });

  return flat;
}

/**
 * Richtet Flugzeuge so aus:
 *  - +Y = oben (kleinste Achse / Höhe)
 *  - +X = rechts (Spannweite)
 *  - −Z = Nase / Flugrichtung
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

  // D) Auto‑Level: bei guter Höhe nur Feintuning + AABB‑Höhen‑Min (Roll)
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const hRatio = size.y / Math.max(size.x, size.z, 0.01);
  if (hRatio > 0.5) {
    for (let i = 0; i < 4; i++) autoLevelWingsAndPitch(wrap, root, 0.7);
  } else {
    // AABB‑Höhe über Roll minimieren (robuster als Vertex‑Sampling)
    minimizeRollByHeight(wrap, root, THREE.MathUtils.degToRad(25));
    for (let i = 0; i < 2; i++) autoLevelWingsAndPitch(wrap, root, 0.1);
  }

  // E) Manuelle Feinkorrektur aus Katalog
  const yaw = THREE.MathUtils.degToRad(orient?.yawDeg ?? 0);
  const pitch = THREE.MathUtils.degToRad(orient?.pitchDeg ?? 0);
  const roll = THREE.MathUtils.degToRad(orient?.rollDeg ?? 0);
  if (Math.abs(yaw) > 1e-6) root.rotateY(yaw);
  if (Math.abs(pitch) > 1e-6) root.rotateX(pitch);
  if (Math.abs(roll) > 1e-6) root.rotateZ(roll);

  // Zentrieren
  wrap.updateMatrixWorld(true);
  let box2 = new THREE.Box3().setFromObject(wrap);
  let c = box2.getCenter(new THREE.Vector3());
  root.position.sub(c);

  // Auf dem Kopf?
  wrap.updateMatrixWorld(true);
  if (detectUpsideDown(wrap)) {
    root.rotateZ(Math.PI);
    wrap.updateMatrixWorld(true);
    box2 = new THREE.Box3().setFromObject(wrap);
    c = box2.getCenter(new THREE.Vector3());
    root.position.sub(c);
  }

  wrap.updateMatrixWorld(true);
  box2 = new THREE.Box3().setFromObject(wrap);
  c = box2.getCenter(new THREE.Vector3());
  root.position.sub(c);
}

function detectUpsideDown(wrap: THREE.Object3D): boolean {
  const box = new THREE.Box3().setFromObject(wrap);
  if (box.max.y < Math.abs(box.min.y) * 0.55 && box.min.y < -0.5) return true;

  const midY = (box.min.y + box.max.y) * 0.5;
  let above = 0,
    below = 0;
  const v = new THREE.Vector3();
  wrap.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      wrap.worldToLocal(v);
      if (v.y > midY) above++;
      else below++;
    }
  });
  return below > above * 1.25 && Math.abs(box.min.y) > box.max.y * 1.1;
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

/**
 * Feiner Roll‑Suchlauf: wählt den Winkel mit minimaler AABB‑Höhe.
 * Bei bereits grob korrekter Lage (Flügel ≈ horizontal) eliminiert das
 * Rest‑Schräglage ohne riskantes Vertex‑Sampling.
 */
function minimizeRollByHeight(wrap: THREE.Group, root: THREE.Object3D, maxRad: number) {
  wrap.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  let bestR = 0;
  let bestH = size.y;
  const steps = 20;
  for (let i = -steps; i <= steps; i++) {
    const r = (i / steps) * maxRad;
    root.rotateZ(r);
    wrap.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrap);
    size = box.getSize(new THREE.Vector3());
    // Prefer low height + keep span on X
    const score = size.y - size.x * 0.01;
    if (score < bestH - size.x * 0.01 || (Math.abs(score - (bestH - 0)) < 1e-6 && size.x > 0)) {
      if (size.y < bestH) {
        bestH = size.y;
        bestR = r;
      }
    }
    root.rotateZ(-r);
  }
  if (Math.abs(bestR) > 1e-4) root.rotateZ(bestR);

  // 1°‑Feinraster ±5°
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  bestH = size.y;
  bestR = 0;
  const fine = THREE.MathUtils.degToRad(1);
  for (let i = -5; i <= 5; i++) {
    const r = i * fine;
    root.rotateZ(r);
    wrap.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrap);
    size = box.getSize(new THREE.Vector3());
    if (size.y < bestH) {
      bestH = size.y;
      bestR = r;
    }
    root.rotateZ(-r);
  }
  if (Math.abs(bestR) > 1e-4) root.rotateZ(bestR);
}

function autoLevelWingsAndPitch(wrap: THREE.Group, root: THREE.Object3D, maxRad = 0.8) {
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  if (size.x < 0.5 || size.z < 0.5) return;
  if (size.x < size.y * 0.85) return;

  // Roll: Flügelspitzen auf gleiche Höhe
  const sample = sampleWingAndNose(wrap, size, box);
  if (sample.leftN > 8 && sample.rightN > 8) {
    const dy = sample.rightY - sample.leftY;
    const span = Math.max(0.5, sample.rightX - sample.leftX);
    let roll = Math.atan2(dy, span);
    roll = THREE.MathUtils.clamp(roll, -maxRad, maxRad);
    if (Math.abs(roll) > 0.008) root.rotateZ(-roll);
  }

  // Pitch: nur sehr vorsichtig — falsches Sampling (Leitwerk/Prop) kippt
  // sonst das ganze Modell um 45°+ und bläht die Höhe auf.
  const maxPitch = Math.min(maxRad * 0.35, 0.18); // max ~10°
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const size2 = box2.getSize(new THREE.Vector3());
  // Nur pitchen wenn Höhe noch klein bleibt
  if (size2.y > size2.x * 0.55) return;
  const sample2 = sampleWingAndNose(wrap, size2, box2);
  if (sample2.noseN > 8 && sample2.tailN > 8) {
    const dy = sample2.noseY - sample2.tailY;
    const len = Math.max(0.5, Math.abs(sample2.tailZ - sample2.noseZ));
    let pitch = Math.atan2(dy, len);
    pitch = THREE.MathUtils.clamp(pitch, -maxPitch, maxPitch);
    if (Math.abs(pitch) > 0.01) root.rotateX(-pitch);
  }
}

function sampleWingAndNose(wrap: THREE.Object3D, size: THREE.Vector3, box: THREE.Box3) {
  // Flügelspitzen: Vertices mit max |x| (äußerste 12 % der Spannweite)
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
  const xTip = size.x * 0.38; // nur äußere Flügel
  const zNose = box.min.z + size.z * 0.12;
  const zTail = box.max.z - size.z * 0.12;
  const zWingMin = box.min.z + size.z * 0.22;
  const zWingMax = box.max.z - size.z * 0.22;

  wrap.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 2200));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      wrap.worldToLocal(v);

      if (v.x < -xTip && v.z >= zWingMin && v.z <= zWingMax) {
        leftY += v.y;
        leftX += v.x;
        leftN++;
      } else if (v.x > xTip && v.z >= zWingMin && v.z <= zWingMax) {
        rightY += v.y;
        rightX += v.x;
        rightN++;
      }
      if (Math.abs(v.x) < size.x * 0.16) {
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
