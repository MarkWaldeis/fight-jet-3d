import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Ziel-Länge des Jets in Welt-Metern (passt zum Flight-Model / Chase-Cam). */
const TARGET_LENGTH = 15.5;

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
export async function loadJetGlb(url: string): Promise<LoadedJetVisual> {
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

  // 3) Längste Achse ≈ Rumpflänge → auf TARGET_LENGTH skalieren
  const longest = Math.max(size.x, size.y, size.z);
  const scale = TARGET_LENGTH / Math.max(longest, 0.001);
  wrap.scale.setScalar(scale);

  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  center = box.getCenter(new THREE.Vector3());
  // Nochmal zentrieren nach Scale (falls nötig)
  root.position.sub(center.clone().divideScalar(scale));

  // 4) Orientierung: FlightModel fliegt local -Z.
  // Viele Assets schauen nach +Z oder +Y. Heuristik:
  // - Längste horizontale Achse als Rumpf
  // - Nase soll -Z werden
  alignNoseToNegZ(wrap, root);

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
 * und die Nase (vermutlich spitzeres Ende / vorher +Z) auf -Z zeigt.
 */
function alignNoseToNegZ(wrap: THREE.Group, root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());

  // Welche Achse ist die Länge?
  // Nach dem ersten Zentrieren steckt die Länge oft noch in X oder Z.
  if (size.x > size.z * 1.15 && size.x > size.y) {
    // Länge lag auf X → 90° um Y, sodass X → -Z
    root.rotateY(-Math.PI / 2);
  } else if (size.y > size.z * 1.15 && size.y > size.x) {
    // Länge lag auf Y (selten) → -90° um X
    root.rotateX(-Math.PI / 2);
  }

  // Viele GLBs schauen nach +Z; unser Forward ist -Z → 180° um Y
  // (kann per CONFIG umgedreht werden, falls das Modell schon -Z ist)
  // Default: +Z → -Z
  root.rotateY(Math.PI);

  // Neu zentrieren nach Rotation
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c = box2.getCenter(new THREE.Vector3());
  root.position.sub(c);
}
