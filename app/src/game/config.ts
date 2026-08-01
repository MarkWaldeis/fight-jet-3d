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
    minSpeed: 60,          // m/s, darunter Stall
    cruiseSpeed: 180,
    maxSpeed: 340,         // ~Mach 1
    afterburnerSpeed: 430,
    thrustAccel: 55,       // m/s^2
    afterburnerAccel: 95,
    dragBase: 0.012,
    pitchRate: 1.5,        // rad/s
    rollRate: 2.2,
    yawRate: 0.45,
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
    speed: 200,
    turnRate: 0.9,         // rad/s Begrenzung der KI
    cannonDamage: 1.5,
    fireRange: 700,
    fireConeDeg: 6,
    burstLength: 0.4,
    thinkInterval: 0.25,
    respawnDelay: 6,
    skillEvasionChance: 0.35,
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
    // Näher + darüber: hinter dem Jet ( +Z ), erhöht ( +Y ).
    // Orientierung = Jet-Quaternion → Fadenkreuz = Schussrichtung (vor der Nase).
    chaseOffset: { x: 0, y: 9.0, z: 12 },
    chaseLookY: 0,   // ungenutzt im Boresight-Modus (Quaternion-Match)
    chaseLookZ: 0,
    lerpPos: 12.0,
    lerpRot: 11.0,
    baseFov: 68,
    maxFovBoost: 14,
    freeLookDistance: 20,
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
