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
 *
 * url: z. B. './models/player-jet.glb' (Vite public/)
 */
export async function loadJetGlb(
  url: string,
  orientOrOpts?: ModelOrient | LoadJetOptions
): Promise<LoadedJetVisual> {
  // Rückwärtskompatibel: zweites Arg war früher nur ModelOrient
  const opts: LoadJetOptions =
    orientOrOpts && ('orient' in orientOrOpts || 'targetLength' in orientOrOpts)
      ? (orientOrOpts as LoadJetOptions)
      : { orient: orientOrOpts as ModelOrient | undefined };
  const orient = opts.orient;
  const targetLength = opts.targetLength ?? DEFAULT_TARGET_LENGTH;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;

  // Schatten/Lights aus dem Asset nicht übernehmen — wir nutzen Scene-Lights
  const gearRe = /gear|wheel|tire|tyre|landing|baydoor|bay_door|strut|oleo/i;
  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) {
      obj.parent?.remove(obj);
      return;
    }
    // Fahrwerk im Flug ausblenden (viele Assets haben Gear down)
    if (gearRe.test(obj.name)) {
      obj.visible = false;
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // Materials etwas robuster für ACES ohne Env-Map
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if ('envMapIntensity' in std) std.envMapIntensity = 0.4;
        if ('metalness' in std && std.metalness > 0.85) std.metalness = 0.55;
        if ('roughness' in std && std.roughness < 0.15) std.roughness = 0.25;
        // kaputte map:undefined-Warnungen vermeiden
        if ('map' in std && std.map == null) std.map = null;
        std.needsUpdate = true;
      }
    }
  });

  // In Zwischengruppe packen für Pivot/Rotation
  const wrap = new THREE.Group();
  wrap.name = 'glbJet';
  wrap.add(root);

  // 1) Bounding box messen
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  let center = box.getCenter(new THREE.Vector3());

  // 2) Zentrum auf Origin
  root.position.sub(center);

  // Neu messen nach Zentrierung
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());

  // 3) Längste Achse ≈ Rumpflänge → auf targetLength skalieren
  const longest = Math.max(size.x, size.y, size.z);
  const scale = targetLength / Math.max(longest, 0.001);
  wrap.scale.setScalar(scale);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  // Nochmal zentrieren nach Scale (falls nötig)
  root.position.sub(center.clone().divideScalar(scale));

  // 4) Orientierung: FlightModel fliegt local -Z.
  alignNoseToNegZ(wrap, root, orient);

  // Final messen
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  // Boden-Offset: leicht anheben, damit Flügel nicht unter Pivot hängen
  const minY = box.min.y;
  if (minY < -0.5) {
    root.position.y -= minY * 0.15; // minimal anheben, nicht auf Boden setzen
  }

  wrap.updateMatrixWorld(true);
  return { group: wrap, size };
}

/**
 * Richtet das Modell so aus, dass die Rumpflängsachse auf Z liegt
 * und die Nase auf -Z zeigt. Per-Jet-Korrekturen über `orient`.
 */
function alignNoseToNegZ(wrap: THREE.Group, root: THREE.Object3D, orient?: ModelOrient) {
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());

  // Welche Achse ist die Länge?
  if (size.x > size.z * 1.15 && size.x > size.y) {
    // Länge lag auf X → 90° um Y, sodass X → -Z
    root.rotateY(-Math.PI / 2);
  } else if (size.y > size.z * 1.15 && size.y > size.x) {
    // Länge lag auf Y (selten) → -90° um X
    root.rotateX(-Math.PI / 2);
  }

  // Viele GLBs schauen nach +Z; unser Forward ist -Z → 180° um Y
  // Assets die schon −Z haben: skipDefaultYawFlip
  if (!orient?.skipDefaultYawFlip) {
    root.rotateY(Math.PI);
  }

  // Per-Jet Feinkorrektur (z. B. Su-57 flog rückwärts)
  const yaw = THREE.MathUtils.degToRad(orient?.yawDeg ?? 0);
  const pitch = THREE.MathUtils.degToRad(orient?.pitchDeg ?? 0);
  const roll = THREE.MathUtils.degToRad(orient?.rollDeg ?? 0);
  if (Math.abs(yaw) > 1e-6) root.rotateY(yaw);
  if (Math.abs(pitch) > 1e-6) root.rotateX(pitch);
  if (Math.abs(roll) > 1e-6) root.rotateZ(roll);

  // Neu zentrieren nach Rotation
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c = box2.getCenter(new THREE.Vector3());
  root.position.sub(c);
}
