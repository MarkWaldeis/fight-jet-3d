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
    rollRate: 2.15,        // etwas gemächlicher, mit Trägheit wirkt knackig
    yawRate: 0.5,
    /** Roll-Winkelbeschleunigung (rad/s²) — Anlauf wie echte Querruder */
    rollAccel: 9.5,
    /** Roll-Dämpfung ohne Eingabe (1/s) — weiches Auslaufen */
    rollDamping: 4.2,

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

    // A/D nur reines Rollen — kein Heading aus Bank (Kurven = Roll + Pitch/S)
    rollYawCoupling: 0,
    bankTurnRate: 0,
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
    // Nah von hinten-oben auf den Jet schauen (dicht am Rumpf)
    // y = Höhe über Jet (m), z = Distanz hinter der Nase (m)
    chaseOffset: { x: 0, y: 4.8, z: 7.5 },
    chaseLookAhead: 140,
    chaseLookY: 0,
    chaseLookZ: 0,
    /** Look-down: Blick von schräg oben auf den Jet + Ziel vor der Nase */
    lookDownAngle: 0.18,
    /** Basis-Roll-Kopplung (ruhig) — Horizont bleibt weitgehend stabil */
    chaseRollFollow: 0.14,
    /** Max. Roll-Kopplung bei aktivem A/D-Rollen */
    chaseRollFollowMax: 0.42,
    /** Wie schnell die Kamera-Bank der Jet-Bank folgt (1/s) */
    rollCamResponse: 6.5,
    /** Seitlicher Versatz der Kamera bei Bank (m bei 90°) — fühlt sich „mit“ dem Jet */
    rollLateralOffset: 1.35,
    /** Position spring-damper (höher = enger) */
    lerpPos: 9.5,
    /** Rotation / Bank der Chase-Cam — etwas träger als Position */
    lerpRot: 6.5,
    /** Free-Look Rückschwenk-Dauer (s) */
    freeLookReturnTime: 0.3,
    /** Speed Pull-Back: nur leicht weiter bei WEP */
    speedPullBack: 1.8,
    /** High-G / Airbrake: Kamera rückt näher */
    highGPullIn: 1.5,
    baseFov: 60,
    maxFovBoost: 18,       // → ~78° bei Max-Speed/WEP
    freeLookDistance: 12,
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
