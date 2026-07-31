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
    rollRate: 2.8,
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
    speed: 620,
    life: 9,               // s
    turnRate: 3.2,
    damage: 70,
    proximityRadius: 18,
    lockLoseAngleDeg: 60,
  },
  camera: {
    chaseOffset: { x: 0, y: 3.2, z: 11 },
    lerpPos: 6.5,
    lerpRot: 8.0,
    baseFov: 68,
    maxFovBoost: 18,       // FOV wächst mit Speed
  },
  hud: {
    radarRange: 4000,
    radarSize: 180,
  },
  score: {
    kill: 500,
    hitBonus: 25,
  },
} as const;

export type Config = typeof CONFIG;
