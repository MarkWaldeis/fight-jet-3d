// Zentrale Balance- und Konstanten-Datei für Fight Jet 3D.
// Alle Gameplay-Werte sind hier an einer Stelle einstellbar.

export const CONFIG = {
  world: {
    size: 20000,           // Terrain-Kantenlänge in m (20 x 20 km)
    segments: 256,         // Heightmap-Auflösung
    maxHeight: 900,        // max. Berggipfel in m
    seaLevel: 0,
    fogNear: 2000,
    fogFar: 16000,
  },
  flight: {
    minSpeed: 55,          // m/s, darunter Stall
    cruiseSpeed: 140,      // langsamer → Auto-Track greift besser
    maxSpeed: 260,
    afterburnerSpeed: 320,
    thrustAccel: 42,       // m/s^2
    afterburnerAccel: 70,
    dragBase: 0.014,
    pitchRate: 1.45,       // rad/s
    rollRate: 2.0,
    yawRate: 0.55,
    // Arcade: A/D bankt + dreht Kurs (Welt-Yaw) → Fadenkreuz wandert seitlich
    rollYawCoupling: 1.15, // Heading-Rate bei vollem A/D (rad/s)
    bankTurnRate: 0.7,     // zusätzliche Kurve aus Schräglage
    autoLevelRate: 1.6,    // Bank flacht ohne A/D ab
    stallPitchDrop: 0.9,
    gravityPull: 9.81,     // wirkt bei langsamer Flucht stärker
  },
  player: {
    hp: 100,
    cannonDamage: 4,
    cannonRange: 900,
    cannonSpread: 0.012,
    cannonRPM: 3000,       // M61 Vulcan
    missileCount: 6,
    lockRange: 2500,
    lockAngleDeg: 18,      // Sucher-Kegel
    lockTime: 1.4,         // Sekunden bis Lock
    flareCount: 8,
  },
  enemy: {
    count: 4,
    hp: 60,
    speed: 135,            // langsamer als Spieler-Cruise → leichter zu verfolgen
    turnRate: 0.75,        // rad/s Begrenzung der KI
    cannonDamage: 2,
    fireRange: 750,
    fireConeDeg: 8,
    burstLength: 0.5,
    thinkInterval: 0.25,
    respawnDelay: 6,
    skillEvasionChance: 0.28,
    /** Multiplikator auf Jet-speedMult der Banditen (zusätzlich zu 0.95) */
    speedScale: 0.72,
  },
  missile: {
    speed: 700,
    life: 9,               // s
    turnRate: 4.5,
    damage: 70,
    proximityRadius: 26,
    lockLoseAngleDeg: 75,
  },
  camera: {
    // Hinter + leicht ÜBER dem Jet (Chase).
    // y = Höhe über dem Jet, z = Distanz hinter der Nase.
    // lookAhead = Blickdistanz parallel zur Nase (Boresight) → Fadenkreuz vor dem Flugzeug.
    chaseOffset: { x: 0, y: 7.0, z: 14 },
    chaseLookAhead: 200,
    chaseLookY: 0,
    chaseLookZ: 0,
    // Anteil der Jet-Bank, den die Chase-Cam mitnimmt (0 = nie, 1 = voll mitrollen)
    chaseRollFollow: 0.28,
    lerpPos: 12.0,
    lerpRot: 10.0,
    baseFov: 68,
    maxFovBoost: 12,
    freeLookDistance: 18,
    freeLookSensitivity: 0.004,
  },
  hud: {
    radarRange: 4000,
    radarSize: 180,
  },
  score: {
    kill: 500,
    hitBonus: 25,
    samKill: 300,
  },
  mission: {
    waves: [
      { bandits: 3, sams: 0, label: 'WELLE 1 — Luftüberlegenheit' },
      { bandits: 5, sams: 0, label: 'WELLE 2 — Banditen-Schwarm' },
      { bandits: 4, sams: 4, label: 'WELLE 3 — SEAD: Zerstöre die SAM-Stellungen' },
    ],
    waveDelay: 3.5,        // s bis zur nächsten Welle
    samHp: 40,
    samRange: 3500,
    samFireInterval: 9,
    samMissileDamage: 35,
  },
} as const;

export type Config = typeof CONFIG;
