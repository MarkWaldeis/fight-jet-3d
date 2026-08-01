// Katalog fliegbarer Jets: NATO & Russland/Sowjet, realistische relative Stats.
import * as THREE from 'three';

export type JetFaction = 'nato' | 'russia';

export type JetId =
  | 'f16'
  | 'f35'
  | 'elite'
  | 'f14'
  | 'l39'
  | 'su25'
  | 'su34'
  | 'su57';

/**
 * Visuelle Ankerpunkte am normalisierten Modell (lokal, Nase = -Z, Heck = +Z).
 * Werden zur Laufzeit per Bounding-Box nachkalibriert (FxAnchors).
 */
export interface JetFxSpec {
  nozzles: [number, number, number][];
  nozzleScale: number;
  muzzles: [number, number, number][];
  wingHalfSpan: number;
}

export interface JetDef {
  id: JetId;
  faction: JetFaction;
  name: string;
  callsign: string;
  role: string;
  description: string;
  modelUrl: string;
  traits: string[];
  stats: {
    hp: number;
    /** Multiplikator auf max/cruise/AB-Speed (1.0 = Basis F-16) */
    speedMult: number;
    /** Multiplikator auf Pitch/Roll/Yaw */
    turnMult: number;
    cannonDamage: number;
    cannonRPM: number;
    cannonSpread: number;
    missiles: number;
    lockRange: number;
    lockTime: number;
    lockAngleDeg: number;
    flareCount: number;
  };
  special: {
    id: string;
    label: string;
    detail: string;
  };
  fx: JetFxSpec;
}

const singleNozzle = (
  y = -0.4,
  z = 7.0,
  scale = 1,
  wing = 6.2
): JetFxSpec => ({
  nozzles: [[0, y, z]],
  nozzleScale: scale,
  muzzles: [[-0.5, -0.2, -6.8]],
  wingHalfSpan: wing,
});

const twinNozzle = (
  x = 0.9,
  y = -0.5,
  z = 7.0,
  scale = 0.9,
  wing = 7.0
): JetFxSpec => ({
  nozzles: [
    [-x, y, z],
    [x, y, z],
  ],
  nozzleScale: scale,
  muzzles: [
    [-0.55, -0.15, -6.5],
    [0.55, -0.15, -6.5],
  ],
  wingHalfSpan: wing,
});

export const JET_CATALOG: JetDef[] = [
  // ─── NATO ───────────────────────────────────────────────────────────────
  {
    id: 'f16',
    faction: 'nato',
    name: 'F-16 Fighting Falcon',
    callsign: 'VIPER 01',
    role: 'Multirole · Ausgewogen',
    description:
      'Der agile Multirole-Klassiker. Gute Wendigkeit, M61 Vulcan und Sidewinder. Ideal zum Einsteigen.',
    modelUrl: './models/player-jet.glb',
    traits: ['Wendig', 'Vulcan', '6× AIM-9'],
    stats: {
      hp: 100,
      speedMult: 1.0, // ~Mach 2 real, Basis
      turnMult: 1.1,
      cannonDamage: 4,
      cannonRPM: 3000,
      cannonSpread: 0.012,
      missiles: 6,
      lockRange: 2500,
      lockTime: 1.35,
      lockAngleDeg: 18,
      flareCount: 8,
    },
    special: {
      id: 'vulcan',
      label: 'M61 Vulcan',
      detail: 'Hohe Feuerrate, präzise Dogfight-Kanone',
    },
    fx: singleNozzle(-0.45, 6.5, 1.0, 6.5),
  },
  {
    id: 'f35',
    faction: 'nato',
    name: 'F-35 Lightning II',
    callsign: 'GHOST 07',
    role: 'Stealth · BVR',
    description:
      'Tarnkappen-Jäger der 5. Generation. Starke Sensoren und BVR-Raketen, in engen Kurven etwas träger.',
    modelUrl: './models/f35.glb',
    traits: ['Stealth', 'BVR-Lock', '8× AMRAAM'],
    stats: {
      hp: 130,
      speedMult: 1.02, // ~Mach 1.6
      turnMult: 0.9,
      cannonDamage: 3.5,
      cannonRPM: 2400,
      cannonSpread: 0.01,
      missiles: 8,
      lockRange: 3800,
      lockTime: 0.85,
      lockAngleDeg: 22,
      flareCount: 10,
    },
    special: {
      id: 'amraam',
      label: 'AMRAAM Suite',
      detail: 'Schneller Lock, große Reichweite',
    },
    fx: singleNozzle(-0.55, 7.1, 1.1, 6.3),
  },
  {
    id: 'f14',
    faction: 'nato',
    name: 'F-14B Tomcat',
    callsign: 'TOMCAT 2',
    role: 'Interceptor · Fleet Defense',
    description:
      'Navy-Legende mit Schwenkflügeln und AIM-54 Phoenix. Sehr schnell in gerader Linie, schwer und träge in engen Turns.',
    modelUrl: './models/f14.glb',
    traits: ['Phoenix BVR', 'Twin TF30', 'Carrier'],
    stats: {
      hp: 125,
      speedMult: 1.18, // ~Mach 2.3+
      turnMult: 0.78,
      cannonDamage: 4.2,
      cannonRPM: 2800,
      cannonSpread: 0.011,
      missiles: 6,
      lockRange: 4200,
      lockTime: 1.0,
      lockAngleDeg: 16,
      flareCount: 10,
    },
    special: {
      id: 'phoenix',
      label: 'AIM-54 Phoenix',
      detail: 'Lange BVR-Reichweite, starke Raketen',
    },
    fx: twinNozzle(1.1, -0.55, 7.2, 0.95, 8.5),
  },
  {
    id: 'l39',
    faction: 'nato',
    name: 'L-39ZA Albatros',
    callsign: 'ALBA 4',
    role: 'Trainer · Light Attack',
    description:
      'Leichter Trainer/Angriffsjet. Langsam, aber wendig und übersichtlich — gut für Anfänger und Bodenziele.',
    modelUrl: './models/l39.glb',
    traits: ['Wendig', 'Leicht', 'CAS-Light'],
    stats: {
      hp: 85,
      speedMult: 0.72, // ~Mach 0.8
      turnMult: 1.12,
      cannonDamage: 3.2,
      cannonRPM: 2200,
      cannonSpread: 0.014,
      missiles: 4,
      lockRange: 1800,
      lockTime: 1.5,
      lockAngleDeg: 20,
      flareCount: 6,
    },
    special: {
      id: 'trainer',
      label: 'Light Frame',
      detail: 'Sehr wendig, niedrige Stall-Geschwindigkeit',
    },
    fx: singleNozzle(-0.35, 6.6, 0.85, 5.4),
  },
  {
    id: 'elite',
    faction: 'nato',
    name: 'Elite-Jäger',
    callsign: 'RAZOR 9',
    role: 'Interceptor · Experimental',
    description:
      'Experimenteller High-Speed-Interceptor. Extrem schnell, Rail-Burst-Kanone, wenige aber schwere IR-Raketen.',
    modelUrl: './models/elite-jaeger.glb',
    traits: ['Top-Speed', 'Rail-Burst', '3× Heavy IR'],
    stats: {
      hp: 90,
      speedMult: 1.2,
      turnMult: 1.0,
      cannonDamage: 7.5,
      cannonRPM: 1800,
      cannonSpread: 0.006,
      missiles: 3,
      lockRange: 2200,
      lockTime: 1.1,
      lockAngleDeg: 14,
      flareCount: 6,
    },
    special: {
      id: 'railburst',
      label: 'Rail-Burst Kanone',
      detail: 'Wuchtige Schüsse, enge Streuung',
    },
    fx: twinNozzle(0.85, -0.7, 6.9, 0.85, 6.2),
  },

  // ─── RUSSLAND / SOWJET ──────────────────────────────────────────────────
  {
    id: 'su25',
    faction: 'russia',
    name: 'Su-25 Grach',
    callsign: 'FROG 11',
    role: 'CAS · Panzerjäger',
    description:
      'Gepanzerter Erdkampfflugzeug. Langsam, aber extrem robust — ideal gegen SAM und Bodenziele, im Dogfight im Nachteil.',
    modelUrl: './models/su25.glb',
    traits: ['Panzerung', 'CAS', '30mm GSh'],
    stats: {
      hp: 160,
      speedMult: 0.68, // ~Mach 0.8, langsam
      turnMult: 0.8,
      cannonDamage: 6.5,
      cannonRPM: 2000,
      cannonSpread: 0.015,
      missiles: 4,
      lockRange: 2000,
      lockTime: 1.6,
      lockAngleDeg: 20,
      flareCount: 12,
    },
    special: {
      id: 'armor',
      label: 'Titanwanne',
      detail: 'Sehr hohe Struktur-HP, stark gegen Bodenfeuer',
    },
    fx: twinNozzle(0.75, -0.6, 6.8, 0.9, 6.8),
  },
  {
    id: 'su34',
    faction: 'russia',
    name: 'Su-34 Fullback',
    callsign: 'PLATYPUS',
    role: 'Strike · Fighter-Bomber',
    description:
      'Schwerer Jagdbomber mit starker Bewaffnung. Solide Geschwindigkeit, mittlere Wendigkeit, viele Raketen.',
    modelUrl: './models/su34.glb',
    traits: ['Strike', 'Twin AL-31', '8× R-77'],
    stats: {
      hp: 140,
      speedMult: 0.98, // ~Mach 1.8
      turnMult: 0.86,
      cannonDamage: 4.5,
      cannonRPM: 2600,
      cannonSpread: 0.011,
      missiles: 8,
      lockRange: 3200,
      lockTime: 1.1,
      lockAngleDeg: 18,
      flareCount: 12,
    },
    special: {
      id: 'strike',
      label: 'Strike Loadout',
      detail: 'Viele Raketen, robuste Zelle',
    },
    fx: twinNozzle(1.0, -0.55, 7.1, 1.0, 7.8),
  },
  {
    id: 'su57',
    faction: 'russia',
    name: 'Su-57 Felon',
    callsign: 'FELON 1',
    role: 'Stealth · Air Superiority',
    description:
      'Russisches 5.-Gen-Jagdflugzeug. Schnell, wendig und mit starker Elektronik — Allround-Überlegenheit.',
    modelUrl: './models/su57.glb',
    traits: ['5th Gen', 'Supermaneuver', 'BVR'],
    stats: {
      hp: 120,
      speedMult: 1.16, // ~Mach 2+
      turnMult: 1.12,
      cannonDamage: 4.0,
      cannonRPM: 2800,
      cannonSpread: 0.01,
      missiles: 6,
      lockRange: 3600,
      lockTime: 0.9,
      lockAngleDeg: 20,
      flareCount: 10,
    },
    special: {
      id: 'supermaneuver',
      label: 'Supermaneuverability',
      detail: 'Hohe Wendigkeit bei hoher Speed',
    },
    fx: twinNozzle(0.95, -0.5, 7.0, 0.95, 7.2),
  },
];

export const FACTION_LABELS: Record<JetFaction, string> = {
  nato: 'NATO / West',
  russia: 'Russland / Sowjet',
};

export function getJetDef(id: JetId): JetDef {
  return JET_CATALOG.find((j) => j.id === id) ?? JET_CATALOG[0];
}

export function jetsByFaction(faction: JetFaction): JetDef[] {
  return JET_CATALOG.filter((j) => j.faction === faction);
}

/** FX-Tupel als THREE.Vector3-Arrays (frisch pro Aufruf). */
export function jetFxVectors(def: JetDef) {
  return {
    nozzles: def.fx.nozzles.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    nozzleScale: def.fx.nozzleScale,
    muzzles: def.fx.muzzles.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    wingHalfSpan: def.fx.wingHalfSpan,
  };
}
