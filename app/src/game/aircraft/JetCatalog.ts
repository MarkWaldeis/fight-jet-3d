// Katalog fliegbarer Jets: Modelle, Stats, besondere Fähigkeiten.

export type JetId = 'f16' | 'f35' | 'elite';

export interface JetDef {
  id: JetId;
  name: string;
  callsign: string;
  role: string;
  description: string;
  /** GLB unter public/models (leer = prozedurales F-16) */
  modelUrl: string;
  /** Kurz-Tags fürs Menü */
  traits: string[];
  stats: {
    hp: number;
    /** Multiplikator auf max/cruise/AB-Speed */
    speedMult: number;
    /** Multiplikator auf Pitch/Roll/Yaw-Raten */
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
  /** Spezialfähigkeit (nur Info + Gameplay-Hook) */
  special: {
    id: 'vulcan' | 'amraam' | 'railburst';
    label: string;
    detail: string;
  };
}

export const JET_CATALOG: JetDef[] = [
  {
    id: 'f16',
    name: 'F-16 Fighting Falcon',
    callsign: 'VIPER 01',
    role: 'Multirole · Ausgewogen',
    description:
      'Der Klassiker. Gute Wendigkeit, zuverlässige Vulcan und Sidewinder. Ideal zum Einsteigen.',
    modelUrl: './models/player-jet.glb',
    traits: ['Wendig', 'Dual-Vulcan', '6× AIM-9'],
    stats: {
      hp: 100,
      speedMult: 1.0,
      turnMult: 1.08,
      cannonDamage: 4,
      cannonRPM: 3000,
      cannonSpread: 0.012,
      missiles: 6,
      lockRange: 2500,
      lockTime: 1.4,
      lockAngleDeg: 18,
      flareCount: 8,
    },
    special: {
      id: 'vulcan',
      label: 'M61 Vulcan',
      detail: 'Hohe Feuerrate, Twin-Mündungen links/rechts',
    },
  },
  {
    id: 'f35',
    name: 'F-35 Lightning II',
    callsign: 'GHOST 07',
    role: 'Stealth · BVR',
    description:
      'Tarnkappen-Jäger. Mehr Lebenspunkte, längere Radar-Reichweite und schnelle AMRAAM-Locks. Etwas träger in der Kurve.',
    modelUrl: './models/f35.glb',
    traits: ['Panzerung', 'BVR-Lock', '8× AIM-120'],
    stats: {
      hp: 130,
      speedMult: 1.05,
      turnMult: 0.88,
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
      detail: 'Schneller Lock, große Reichweite, mehr Raketen',
    },
  },
  {
    id: 'elite',
    name: 'Elite-Jäger',
    callsign: 'RAZOR 9',
    role: 'Interceptor · Speed',
    description:
      'Der schnellste Vogel im Hangar. Brutal starkes Rail-Burst-Geschütz, aber wenige Raketen und engerer Suchkegel.',
    modelUrl: './models/elite-jaeger.glb',
    traits: ['Top-Speed', 'Rail-Burst', '3× Heavy IR'],
    stats: {
      hp: 90,
      speedMult: 1.22,
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
      detail: 'Wuchtige Schüsse, enge Streuung, hoher Schaden',
    },
  },
];

export function getJetDef(id: JetId): JetDef {
  return JET_CATALOG.find((j) => j.id === id) ?? JET_CATALOG[0];
}
