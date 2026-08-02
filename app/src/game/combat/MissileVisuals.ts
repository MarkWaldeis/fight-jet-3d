import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Welche Rakete aus welchem Pack */
export type MissileVisualId = 'aim9' | 'aim120' | 'r77';

const SPECS: Record<
  MissileVisualId,
  { pack: string; match: RegExp; targetLength: number }
> = {
  aim9: {
    pack: './weapons/missile-collection.glb',
    match: /AIM-9_Sidewinder/i,
    targetLength: 2.9,
  },
  aim120: {
    pack: './weapons/us-weapon-pack.glb',
    match: /aim-120/i,
    targetLength: 3.5,
  },
  r77: {
    pack: './weapons/missile-collection.glb',
    match: /R-77/i,
    targetLength: 3.4,
  },
};

const packCache = new Map<string, Promise<THREE.Group>>();
const visualCache = new Map<MissileVisualId, THREE.Object3D | null>();

async function loadPack(url: string): Promise<THREE.Group> {
  let p = packCache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((gltf) => {
      const root = gltf.scene;
      root.traverse((obj) => {
        if ((obj as THREE.Light).isLight) obj.parent?.remove(obj);
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if (!m) continue;
            const std = m as THREE.MeshStandardMaterial;
            if ('envMapIntensity' in std) std.envMapIntensity = 0.5;
            if ('map' in std && std.map == null) std.map = null;
            std.needsUpdate = true;
          }
        }
      });
      return root;
    });
    packCache.set(url, p);
  }
  return p;
}

/**
 * Extrahiert ein einzelnes Waffen-Mesh aus dem Pack, zentriert und skaliert es,
 * und richtet die Längsachse auf local −Z (Flugrichtung) aus.
 */
function extractMissile(packRoot: THREE.Object3D, match: RegExp, targetLength: number): THREE.Group | null {
  let found: THREE.Object3D | undefined;
  packRoot.traverse((o) => {
    if (found) return;
    if (match.test(o.name)) found = o;
  });
  if (!found) return null;

  // Parent-Gruppe mit allen Kind-Meshes clonen
  const source = found;
  const clone = source.clone(true);
  const wrap = new THREE.Group();
  wrap.name = `missile_${source.name}`;
  wrap.add(clone);

  // Zentrieren
  const box = new THREE.Box3().setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  clone.position.sub(center);

  // Längste Achse auf −Z bringen
  wrap.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(wrap).getSize(new THREE.Vector3());
  if (size.x > size.z * 1.15 && size.x > size.y) {
    clone.rotateY(-Math.PI / 2);
  } else if (size.y > size.z * 1.15 && size.y > size.x) {
    clone.rotateX(-Math.PI / 2);
  }
  // Viele Assets: Nase +Z → 180° auf −Z
  clone.rotateY(Math.PI);

  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  const c2 = box2.getCenter(new THREE.Vector3());
  clone.position.sub(c2);
  const size2 = box2.getSize(new THREE.Vector3());
  const longest = Math.max(size2.x, size2.y, size2.z, 0.01);
  wrap.scale.setScalar(targetLength / longest);

  return wrap;
}

/** Vorbereiten (Menü/Start) — cache Templates */
export async function preloadMissileVisual(id: MissileVisualId): Promise<void> {
  if (visualCache.has(id)) return;
  const spec = SPECS[id];
  try {
    const pack = await loadPack(spec.pack);
    const extracted = extractMissile(pack, spec.match, spec.targetLength);
    visualCache.set(id, extracted);
    if (extracted) {
      console.info(`[FightJet] Missile visual ${id} ready (${spec.match})`);
    } else {
      console.warn(`[FightJet] Missile visual ${id}: node not found in pack`);
    }
  } catch (e) {
    console.warn(`[FightJet] Missile visual ${id} load failed:`, e);
    visualCache.set(id, null);
  }
}

/** Frische Kopie für eine fliegende Rakete (oder null → Procedural-Fallback) */
export function cloneMissileVisual(id: MissileVisualId): THREE.Object3D | null {
  const t = visualCache.get(id);
  if (!t) return null;
  return t.clone(true);
}

export function missileIdForJet(jetId: string): MissileVisualId {
  if (jetId === 'su57' || jetId === 'su34' || jetId === 'su25') return 'r77';
  if (jetId === 'f35' || jetId === 'f14') return 'aim120';
  return 'aim9';
}
