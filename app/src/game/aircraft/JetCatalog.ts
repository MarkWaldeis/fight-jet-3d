// Katalog fliegbarer Jets: NATO & Russland/Sowjet, inkl. WWII-Propeller & Early Jets.
import * as THREE from 'three';
import type { ModelOrient } from './GlbJetLoader';

export type JetFaction = 'nato' | 'russia';

export type JetId =
  | 'f16'
  | 'f35'
  | 'elite'
  | 'f14'
  | 'l39'
  | 'su25'
  | 'su34'
  | 'su57'
  | 'p51'
  | 'p40'
  | 'spitfire'
  | 'mig3'
  | 'mig15';

/** Antrieb / Epoche — steuert Sound, Nachbrenner, Propeller-FX, Windanfälligkeit. */
export type EngineType = 'jet' | 'piston';
export type AircraftEra = 'modern' | 'early_jet' | 'propeller';

/**
 * Visuelle Ankerpunkte am normalisierten Modell (lokal, Nase = -Z, Heck = +Z).
 * Werden zur Laufzeit per Bounding-Box nachkalibriert (FxAnchors).
 */
export interface JetFxSpec {
  nozzles: [number, number, number][];
  nozzleScale: number;
  muzzles: [number, number, number][];
  /** Sichtbare Waffenstationen, exakt im normalisierten GLB-Raum kalibriert. */
  hardpoints: [number, number, number][];
  wingHalfSpan: number;
}

/**
 * Differenziertes Flugmodell (relativ zu CONFIG.flight).
 * Propeller & Early Jets: träger, mehr Drag, Stall, Torque, Wind.
 */
export interface FlightPhysicsProfile {
  /** Parasitärer Widerstand (1 = F-16) */
  dragMult: number;
  /** Induzierter Widerstand / Energy Bleed in Kurven */
  inducedDragMult: number;
  /** Schub / Beschleunigung */
  thrustMult: number;
  /** Nachbrenner / WEP erlaubt */
  hasAfterburner: boolean;
  /** Propeller-Drehmoment: Roll-Tendenz bei Vollgas (rad/s @ throttle 1) */
  torqueRoll: number;
  /** P-Faktor: leichter Yaw-Zug bei Vollgas (rad/s) */
  pFactorYaw: number;
  /** 0 = modern stabil, 1–2 = leichte Propellerzelle (Wind + Flutter) */
  windSusceptibility: number;
  /** Stall-Schwelle relativ (höher = früher Stall) */
  stallSpeedMult: number;
  /** Stärkerer Nase-Drop im Stall */
  stallDropMult: number;
  /** Ziel-Rumpflänge beim Laden (m) — Props sind kleiner */
  modelLengthM?: number;
}

export interface JetDef {
  id: JetId;
  faction: JetFaction;
  name: string;
  callsign: string;
  role: string;
  description: string;
  modelUrl: string;
  /**
   * GLB-Orientierungskorrektur (Nase = local −Z).
   * z. B. Su-57: Asset schaut nach Auto-Align falsch herum → yawDeg: 180
   */
  modelOrient?: ModelOrient;
  traits: string[];
  era: AircraftEra;
  engineType: EngineType;
  physics: FlightPhysicsProfile;
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

/** Standard-Physik moderner Jets */
export const MODERN_JET_PHYSICS: FlightPhysicsProfile = {
  dragMult: 1,
  inducedDragMult: 1,
  thrustMult: 1,
  hasAfterburner: true,
  torqueRoll: 0,
  pFactorYaw: 0,
  windSusceptibility: 0.25,
  stallSpeedMult: 1,
  stallDropMult: 1,
  modelLengthM: 15.5,
};

const PROP_FX = (
  wing = 5.5,
  hardpoints: [number, number, number][] = []
): JetFxSpec => ({
  // Kein echter Jet-Nozzle — EngineFx bleibt schwach / unsichtbar
  nozzles: [[0, -0.2, 6.2]],
  nozzleScale: 0.01,
  muzzles: [
    [-0.45, -0.15, -5.8],
    [0.45, -0.15, -5.8],
  ],
  hardpoints,
  wingHalfSpan: wing,
});

const singleNozzle = (
  y = -0.4,
  z = 7.0,
  scale = 1,
  wing = 6.2,
  hardpoints: [number, number, number][] = []
): JetFxSpec => ({
  nozzles: [[0, y, z]],
  nozzleScale: scale,
  muzzles: [[-0.5, -0.2, -6.8]],
  hardpoints,
  wingHalfSpan: wing,
});

const twinNozzle = (
  x = 0.9,
  y = -0.5,
  z = 7.0,
  scale = 0.9,
  wing = 7.0,
  hardpoints: [number, number, number][] = []
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
  hardpoints,
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
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS },
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
    fx: singleNozzle(4.99, 7.42, 0.95, 6.5, [
      [-5.45, 4.48, -1.15], [5.45, 4.48, -1.15],
      [-3.85, 4.34, -0.45], [3.85, 4.34, -0.45],
      [-2.45, 4.18, 0.25], [2.45, 4.18, 0.25],
    ]),
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
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, windSusceptibility: 0.2 },
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
    fx: singleNozzle(3.90, 7.00, 1.0, 6.3, [
      [-5.45, 3.30, -1.55], [5.25, 3.30, -1.55],
      [-4.10, 3.18, -0.85], [3.90, 3.18, -0.85],
      [-2.95, 3.08, -0.10], [2.75, 3.08, -0.10],
      [-1.85, 2.98, 0.55], [1.65, 2.98, 0.55],
    ]),
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
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, modelLengthM: 18.5 },
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
    fx: twinNozzle(1.05, -0.48, 6.72, 0.9, 8.5, [
      [-6.55, -0.72, -1.75], [6.55, -0.72, -1.75],
      [-4.55, -0.98, -0.85], [4.55, -0.98, -0.85],
      [-2.85, -1.12, 0.05], [2.85, -1.12, 0.05],
    ]),
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
    era: 'modern',
    engineType: 'jet',
    physics: {
      ...MODERN_JET_PHYSICS,
      hasAfterburner: false,
      thrustMult: 0.85,
      dragMult: 1.1,
      windSusceptibility: 0.55,
      modelLengthM: 12.2,
    },
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
    fx: singleNozzle(-0.32, 7.70, 0.78, 5.4, [
      [-5.15, -1.24, -0.90], [5.15, -1.24, -0.90],
      [-3.35, -1.48, -0.08], [3.35, -1.48, -0.08],
    ]),
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
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, windSusceptibility: 0.18 },
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
    fx: twinNozzle(0.72, 3.92, 7.35, 0.78, 6.2, [
      [-4.85, 3.16, -0.75], [4.85, 3.16, -0.75],
      [0, 2.88, 0.45],
    ]),
  },

  // ─── NATO · WWII Propeller ──────────────────────────────────────────────
  {
    id: 'p51',
    faction: 'nato',
    name: 'P-51D Mustang',
    callsign: 'MUSTANG 1',
    role: 'WWII · Langstreckenjäger',
    description:
      'Legendärer Propellerjäger. Max. ~700 km/h, kein Nachbrenner, starkes Propeller-Drehmoment. Nur Bordwaffen — kein AIM-9.',
    modelUrl: './models/p51-mustang.glb',
    traits: ['Propeller', 'MG/Kanone', 'Torque'],
    era: 'propeller',
    engineType: 'piston',
    physics: {
      dragMult: 1.55,
      inducedDragMult: 1.65,
      thrustMult: 0.55,
      hasAfterburner: false,
      torqueRoll: 0.42,
      pFactorYaw: 0.18,
      windSusceptibility: 1.55,
      stallSpeedMult: 1.15,
      stallDropMult: 1.35,
      modelLengthM: 9.8,
    },
    stats: {
      hp: 72,
      speedMult: 0.55, // ~700 km/h vs Jet-Basis
      turnMult: 0.92,
      cannonDamage: 3.4,
      cannonRPM: 750,
      cannonSpread: 0.028,
      missiles: 0,
      lockRange: 0,
      lockTime: 99,
      lockAngleDeg: 8,
      flareCount: 0,
    },
    special: {
      id: 'merlin',
      label: 'Packard Merlin V-1650',
      detail: 'Kolbenmotor + Propeller-Torque & P-Faktor bei Vollgas',
    },
    fx: PROP_FX(5.6, []),
  },
  {
    id: 'p40',
    faction: 'nato',
    name: 'P-40 Warhawk',
    callsign: 'WARHAWK',
    role: 'WWII · Frontjäger',
    description:
      'Robuster, aber langsamerer Propellerjäger (~580 km/h). Schwerfällig, starker Luftwiderstand, ideale Einstiegs-Prop-Maschine.',
    modelUrl: './models/p40.glb',
    traits: ['Propeller', 'Robust', 'Langsam'],
    era: 'propeller',
    engineType: 'piston',
    physics: {
      dragMult: 1.75,
      inducedDragMult: 1.8,
      thrustMult: 0.48,
      hasAfterburner: false,
      torqueRoll: 0.48,
      pFactorYaw: 0.22,
      windSusceptibility: 1.7,
      stallSpeedMult: 1.2,
      stallDropMult: 1.4,
      modelLengthM: 9.7,
    },
    stats: {
      hp: 80,
      speedMult: 0.46,
      turnMult: 0.82,
      cannonDamage: 3.0,
      cannonRPM: 700,
      cannonSpread: 0.032,
      missiles: 0,
      lockRange: 0,
      lockTime: 99,
      lockAngleDeg: 8,
      flareCount: 0,
    },
    special: {
      id: 'allison',
      label: 'Allison V-1710',
      detail: 'Stärkeres Torque-Roll, spürbar träger als Mustang',
    },
    fx: PROP_FX(5.4, []),
  },
  {
    id: 'spitfire',
    faction: 'nato',
    name: 'Supermarine Spitfire',
    callsign: 'SPIT 9',
    role: 'WWII · Dogfighter',
    description:
      'Wendigster der Propeller-Klassiker. Geringere Top-Speed als die Mustang, aber engste Kurven — und empfindlich gegen Windböen.',
    modelUrl: './models/spitfire.glb',
    traits: ['Propeller', 'Wendig', 'Ellipsenflügel'],
    era: 'propeller',
    engineType: 'piston',
    physics: {
      dragMult: 1.45,
      inducedDragMult: 1.5,
      thrustMult: 0.52,
      hasAfterburner: false,
      torqueRoll: 0.38,
      pFactorYaw: 0.16,
      windSusceptibility: 1.85,
      stallSpeedMult: 1.08,
      stallDropMult: 1.25,
      modelLengthM: 9.1,
    },
    stats: {
      hp: 65,
      speedMult: 0.52,
      turnMult: 1.08,
      cannonDamage: 3.6,
      cannonRPM: 800,
      cannonSpread: 0.026,
      missiles: 0,
      lockRange: 0,
      lockTime: 99,
      lockAngleDeg: 8,
      flareCount: 0,
    },
    special: {
      id: 'elliptical',
      label: 'Elliptical Wing',
      detail: 'Beste Prop-Wendigkeit, höchstes Flutter-Risiko',
    },
    fx: PROP_FX(5.5, []),
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
    era: 'modern',
    engineType: 'jet',
    physics: {
      ...MODERN_JET_PHYSICS,
      hasAfterburner: false,
      thrustMult: 0.75,
      dragMult: 1.2,
      windSusceptibility: 0.4,
      modelLengthM: 15.5,
    },
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
    fx: twinNozzle(0.65, -0.62, 6.38, 0.78, 6.8, [
      [-5.70, -1.28, -0.62], [5.70, -1.28, -0.62],
      [-3.55, -1.50, 0.18], [3.55, -1.50, 0.18],
    ]),
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
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, modelLengthM: 23 },
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
    fx: twinNozzle(1.0, -0.38, 4.78, 0.88, 7.8, [
      [-4.25, -0.92, -1.70], [4.25, -0.92, -1.70],
      [-3.30, -1.00, -0.92], [3.30, -1.00, -0.92],
      [-2.45, -1.08, -0.12], [2.45, -1.08, -0.12],
      [-1.72, -1.14, 0.68], [1.72, -1.14, 0.68],
    ]),
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
    // GLB zeigt nach Standard-Align mit dem Heck nach vorn — 180° Yaw korrigiert Nase/−Z
    modelOrient: { yawDeg: 180 },
    traits: ['5th Gen', 'Supermaneuver', 'BVR'],
    era: 'modern',
    engineType: 'jet',
    physics: { ...MODERN_JET_PHYSICS, windSusceptibility: 0.22, modelLengthM: 20 },
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
    // Dieses GLB besitzt einen asymmetrischen Modell-Pivot; die Duesen liegen
    // deshalb bewusst nicht symmetrisch um x=0.
    fx: {
      nozzles: [[0.18, 0.05, 6.30], [2.12, 0.05, 6.30]],
      nozzleScale: 0.84,
      muzzles: [[0.65, -0.15, -7.4]],
      hardpoints: [
        [-3.45, -0.72, -2.20], [5.65, -0.72, -2.20],
        [-2.48, -0.84, -1.35], [4.68, -0.84, -1.35],
        [-1.52, -0.94, -0.45], [3.72, -0.94, -0.45],
      ],
      wingHalfSpan: 7.2,
    },
  },

  // ─── RUSSLAND · WWII Prop + Early Jet ───────────────────────────────────
  {
    id: 'mig3',
    faction: 'russia',
    name: 'MiG-3',
    callsign: 'SOKOL 3',
    role: 'WWII · Höhenjäger',
    description:
      'Sowjetischer Hochgeschwindigkeits-Propellerjäger. In großer Höhe stark, in engen Turns und bei Turbulenz unnachgiebig.',
    modelUrl: './models/mig3.glb',
    traits: ['Propeller', 'Höhe', 'MG'],
    era: 'propeller',
    engineType: 'piston',
    physics: {
      dragMult: 1.6,
      inducedDragMult: 1.7,
      thrustMult: 0.5,
      hasAfterburner: false,
      torqueRoll: 0.4,
      pFactorYaw: 0.2,
      windSusceptibility: 1.6,
      stallSpeedMult: 1.18,
      stallDropMult: 1.38,
      modelLengthM: 8.3,
    },
    stats: {
      hp: 68,
      speedMult: 0.5,
      turnMult: 0.86,
      cannonDamage: 3.2,
      cannonRPM: 720,
      cannonSpread: 0.03,
      missiles: 0,
      lockRange: 0,
      lockTime: 99,
      lockAngleDeg: 8,
      flareCount: 0,
    },
    special: {
      id: 'am35',
      label: 'Mikulin AM-35A',
      detail: 'Kolbenmotor, spürbares P-Faktor-Gieren',
    },
    fx: PROP_FX(5.1, []),
  },
  {
    id: 'mig15',
    faction: 'russia',
    name: 'MiG-15bis',
    callsign: 'FAGOT 15',
    role: 'Early Jet · Korea-Krieg',
    description:
      'Früher Cold-War-Strahljäger. Schneller als WWII-Props (~1050 km/h), aber ohne moderne Nachbrenner-Power und mit steilem Kurvenverlust.',
    modelUrl: './models/mig15.glb',
    traits: ['Early Jet', '23/37mm', 'Kein AB'],
    era: 'early_jet',
    engineType: 'jet',
    physics: {
      dragMult: 1.35,
      inducedDragMult: 1.55,
      thrustMult: 0.62,
      hasAfterburner: false,
      torqueRoll: 0,
      pFactorYaw: 0,
      windSusceptibility: 1.15,
      stallSpeedMult: 1.25,
      stallDropMult: 1.45,
      modelLengthM: 10.1,
    },
    stats: {
      hp: 88,
      speedMult: 0.7, // ~Mach 0.9 early jet
      turnMult: 0.88,
      cannonDamage: 5.5,
      cannonRPM: 450,
      cannonSpread: 0.022,
      missiles: 0,
      lockRange: 0,
      lockTime: 99,
      lockAngleDeg: 10,
      flareCount: 2,
    },
    special: {
      id: 'n37',
      label: 'N-37 + NR-23',
      detail: 'Schwere Bordkanonen, langsame Feuerrate, kein Lenkwaffen-Loadout',
    },
    fx: singleNozzle(-0.35, 6.5, 0.55, 5.0, []),
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

/** Legacy / schwächere Maschinen für frühe Wellen */
export function legacyJetIds(): JetId[] {
  return JET_CATALOG.filter((j) => j.era === 'propeller' || j.era === 'early_jet').map((j) => j.id);
}

export function isLegacyAircraft(id: JetId): boolean {
  const d = getJetDef(id);
  return d.era === 'propeller' || d.era === 'early_jet';
}

export function hasGuidedMissiles(def: JetDef): boolean {
  return def.stats.missiles > 0 && def.stats.lockRange > 0;
}

/** FX-Tupel als THREE.Vector3-Arrays (frisch pro Aufruf). */
export function jetFxVectors(def: JetDef) {
  return {
    nozzles: def.fx.nozzles.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    nozzleScale: def.fx.nozzleScale,
    muzzles: def.fx.muzzles.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    hardpoints: def.fx.hardpoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    wingHalfSpan: def.fx.wingHalfSpan,
  };
}
