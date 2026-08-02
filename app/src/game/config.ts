// Zentrale Balance- und Konstanten-Datei für Fight Jet 3D.
// War Thunder–inspiriertes Mouse-Aim / Arcade-Realistic Hybrid.

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
    // --- Geschwindigkeiten (m/s) ---
    minSpeed: 55,          // Stall-Schwelle (~200 km/h)
    cruiseSpeed: 140,
    maxSpeed: 260,
    afterburnerSpeed: 320, // WEP ~110%
    thrustAccel: 42,
    afterburnerAccel: 70,
    dragBase: 0.012,
    /** Induzierter Widerstand pro G über 1 (Energy Bleed in Kurven) */
    inducedDrag: 0.045,
    /** Geschwindigkeitsverlust bei hohem AoA (zusätzlich) */
    aoaDrag: 0.08,

    // --- Ruder-Raten (rad/s bei voller Autorität) ---
    pitchRate: 1.55,
    rollRate: 2.4,
    yawRate: 0.5,

    // --- Mouse-Aim Fly-By-Wire ---
    /** Wie aggressiv Roll-to-Turn den Lift-Vektor ausrichtet */
    fbwRollGain: 3.2,
    fbwPitchGain: 2.6,
    fbwYawGain: 0.55,
    /** Ab diesem lateralen Fehler (lokal X) wird Pitch gedrosselt → Roll first */
    fbwRollPriority: 0.35,
    /** Weiche Rückkehr nach Manual-Override (1/s) */
    fbwRecaptureRate: 4.5,
    /** Max. Aim-Reticle-Abstand vom Bildschirmrand (NDC, 0..1) */
    aimMargin: 0.92,
    /** Aim-Cursor-Geschwindigkeit im Pointer-Lock (NDC pro Pixel) */
    aimSensitivity: 0.00135,

    // --- Velocity / AoA ---
    /** Wie schnell Velocity-Vektor der Nase folgt (höher = knackiger) */
    velocityAlignRate: 2.8,
    /** Max. Anstellwinkel (rad) bevor Stall-Hinweis */
    maxAoa: 0.55,
    /** Angular damping (Ruder-Loslassen → weiches Auslaufen) */
    angularDamping: 3.5,

    // Arcade-Bank-Kurven (Manual-Mode / KI)
    rollYawCoupling: 0.85,
    bankTurnRate: 0.65,
    autoLevelRate: 1.2,
    stallPitchDrop: 0.95,
    gravityPull: 9.81,
  },
  player: {
    hp: 100,
    cannonDamage: 4,
    cannonRange: 900,
    cannonSpread: 0.012,
    cannonRPM: 3000,
    missileCount: 6,
    lockRange: 2500,
    lockAngleDeg: 18,
    lockTime: 1.4,
    flareCount: 8,
  },
  enemy: {
    count: 4,
    hp: 60,
    speed: 135,
    turnRate: 0.75,
    cannonDamage: 2,
    fireRange: 750,
    fireConeDeg: 8,
    burstLength: 0.5,
    thinkInterval: 0.25,
    respawnDelay: 6,
    skillEvasionChance: 0.28,
    speedScale: 0.72,
  },
  missile: {
    speed: 700,
    life: 9,
    turnRate: 4.5,
    damage: 70,
    proximityRadius: 26,
    lockLoseAngleDeg: 75,
  },
  camera: {
    // Hinter + leicht über der Heckflosse (War Thunder Chase)
    // y = Höhe über Jet (m), z = Distanz hinter der Nase (m)
    chaseOffset: { x: 0, y: 3.0, z: 12 },
    chaseLookAhead: 180,
    chaseLookY: 0,
    chaseLookZ: 0,
    /** Look-down ~7° damit Fadenkreuz vor der Nase liegt */
    lookDownAngle: 0.12,
    /** Roll-Kopplung 15–20 % — Horizont bleibt stabil */
    chaseRollFollow: 0.17,
    /** Position spring-damper (höher = enger) */
    lerpPos: 8.5,
    lerpRot: 7.5,
    /** Free-Look Rückschwenk-Dauer (s) */
    freeLookReturnTime: 0.3,
    /** Speed Pull-Back: zusätzliche Distanz bei WEP */
    speedPullBack: 3.5,
    /** High-G / Airbrake: Kamera rückt näher */
    highGPullIn: 2.2,
    baseFov: 60,
    maxFovBoost: 18,       // → ~78° bei Max-Speed/WEP
    freeLookDistance: 16,
    freeLookSensitivity: 0.004,
    /** Kamera-Shake Amplitude (m / rad) */
    shakeSpeed: 0.012,
    shakeFire: 0.035,
    shakeStall: 0.045,
    shakeWep: 0.02,
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
    waveDelay: 3.5,
    samHp: 40,
    samRange: 3500,
    samFireInterval: 9,
    samMissileDamage: 35,
  },
} as const;

export type Config = typeof CONFIG;
