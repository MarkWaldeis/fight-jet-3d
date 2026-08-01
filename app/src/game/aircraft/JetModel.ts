import * as THREE from 'three';

// ============================================================================
// F-16 V2 — stark detailliertes Modell im USAF-Look, komplett aus Primitiven
// + Canvas-Texturen (Roundels, Panel-Lines, MFD-Screens). Keine externen Assets.
// ============================================================================

export interface F16Options {
  bodyColor: number;
  accentColor: number;
  nation: 'us' | 'enemy';
  withCockpit: boolean;
  tailCode?: string; // z. B. "SW" (Shaw AFB)
}

export interface F16Parts {
  group: THREE.Group;
  afterburner: THREE.Mesh;
  abLight: THREE.PointLight;
  cockpit?: THREE.Group;
}

// ---- Canvas-Texturen -------------------------------------------------------

// USAF-Roundel: weißer Stern auf blauem Kreis mit Seitenbalken
function roundelTexture(nation: 'us' | 'enemy'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const cx = 128, cy = 128;
  if (nation === 'us') {
    // Balken
    x.fillStyle = '#1c3d6e';
    x.fillRect(8, cy - 32, 240, 64);
    x.fillStyle = '#b5242c';
    x.fillRect(8, cy - 12, 70, 24);
    x.fillRect(178, cy - 12, 70, 24);
    x.fillStyle = '#f2f2f0';
    x.fillRect(70, cy - 32, 8, 64);
    x.fillRect(178, cy - 32, 8, 64);
    // Kreis
    x.fillStyle = '#1c3d6e';
    x.beginPath(); x.arc(cx, cy, 78, 0, Math.PI * 2); x.fill();
    // Stern
    x.fillStyle = '#f2f2f0';
    x.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const px = cx + Math.cos(a) * 58, py = cy + Math.sin(a) * 58;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill();
  } else {
    // Feind: roter Stern
    x.fillStyle = '#8c1f1f';
    x.beginPath(); x.arc(cx, cy, 80, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#e8c23a'; x.lineWidth = 6;
    x.beginPath(); x.arc(cx, cy, 74, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#e8c23a';
    x.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const px = cx + Math.cos(a) * 56, py = cy + Math.sin(a) * 56;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Panel-Lines + Nieten als dezente Textur für Rumpf/Flügel.
// Basis fast weiß — die Lackfarbe kommt vom Material (multiplikativ).
function panelTexture(base: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(0,0,0,0.10)';
  x.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i * 64); x.lineTo(512, i * 64); x.stroke();
  }
  x.fillStyle = 'rgba(0,0,0,0.07)';
  for (let i = 0; i < 300; i++) {
    x.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  // Wartungsklappen
  x.strokeStyle = 'rgba(0,0,0,0.14)';
  for (let i = 0; i < 6; i++) {
    x.strokeRect(30 + Math.random() * 380, 30 + Math.random() * 380, 40, 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tail-Art: Tailcode + Streifen
function tailTexture(code: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(0,0,0,0)';
  x.clearRect(0, 0, 256, 256);
  x.fillStyle = accent;
  x.fillRect(0, 0, 256, 60);
  x.fillStyle = '#f2f2f0';
  x.font = 'bold 90px Arial';
  x.textAlign = 'center';
  x.fillText(code, 128, 160);
  x.font = 'bold 34px Arial';
  x.fillText('USAF', 128, 215);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// MFD-Screen (Multi-Function Display) im Cockpit
function mfdTexture(kind: 'radar' | 'engine'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#03140a';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#2fe06a';
  x.fillStyle = '#2fe06a';
  x.lineWidth = 2;
  if (kind === 'radar') {
    x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(64, 8); x.lineTo(64, 120); x.stroke();
    x.beginPath(); x.moveTo(8, 64); x.lineTo(120, 64); x.stroke();
    // Sweep
    const g = x.createLinearGradient(64, 64, 120, 20);
    g.addColorStop(0, 'rgba(47,224,106,0.5)');
    g.addColorStop(1, 'rgba(47,224,106,0)');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 52, -0.7, -0.1); x.closePath(); x.fill();
    x.fillStyle = '#ff4444';
    x.fillRect(84, 40, 5, 5); x.fillRect(40, 80, 5, 5);
  } else {
    x.font = 'bold 16px monospace';
    const rows = ['RPM  98%', 'EGT  612', 'FUEL 7400', 'OIL   OK', 'HYD   OK'];
    rows.forEach((r, i) => x.fillText(r, 10, 26 + i * 22));
    x.strokeRect(4, 4, 120, 120);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- Modell ----------------------------------------------------------------

export function buildF16(opts: F16Options): F16Parts {
  const g = new THREE.Group();
  const isUS = opts.nation === 'us';

  const skin = panelTexture('#f2f3f5'); // fast weiß, Lackfarbe via Material-Color
  // Niedrige Metalness + leichte Emissive: ohne Env-Map bleiben Flächen hell (kein Silhouetten-Schwarz)
  const bodyMat = new THREE.MeshStandardMaterial({
    color: opts.bodyColor,
    map: skin,
    metalness: 0.08,
    roughness: 0.58,
    emissive: opts.bodyColor,
    emissiveIntensity: 0.06,
    side: THREE.DoubleSide, // dünne Extrude-Flügel/Leitwerke von beiden Seiten sichtbar
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x3a3e48, metalness: 0.25, roughness: 0.65, emissive: 0x111218, emissiveIntensity: 0.04,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a3a4e, metalness: 0.35, roughness: 0.12, transparent: true, opacity: 0.48,
    transmission: 0.15, thickness: 0.4,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: opts.accentColor, metalness: 0.15, roughness: 0.55,
    emissive: opts.accentColor, emissiveIntensity: 0.08,
  });

  // --- Rumpf ---
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 11, 6, 16), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.scale.set(0.85, 1, 0.75);
  g.add(fuselage);

  // Nase + Radom (F-16: dunkler Radom)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 3.2, 16), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -0.05, -7.2);
  nose.scale.set(0.9, 1, 0.8);
  g.add(nose);
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 16), darkMat);
  radome.rotation.x = -Math.PI / 2;
  radome.position.set(0, -0.05, -8.0);
  radome.scale.set(0.9, 1, 0.8);
  g.add(radome);
  // Pitotrohr
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), darkMat);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, -0.05, -9.2);
  g.add(pitot);

  // --- Blasenhaube mit Rahmen ---
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 14), canopyMat);
  canopy.position.set(0, 0.62, -3.4);
  canopy.scale.set(0.72, 0.62, 1.8);
  g.add(canopy);
  // Rahmen
  const frameMat = darkMat;
  const bowFront = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 16, Math.PI), frameMat);
  bowFront.position.set(0, 0.62, -4.55);
  bowFront.scale.set(0.95, 1.05, 1);
  g.add(bowFront);
  const bowRear = bowFront.clone();
  bowRear.position.z = -2.3;
  g.add(bowRear);

  // --- Pilot (Helm + Oberkörper) ---
  const pilot = new THREE.Group();
  const flightSuit = new THREE.MeshStandardMaterial({ color: isUS ? 0x3a4a38 : 0x4a3a3a, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 10), flightSuit);
  torso.position.y = 0.28;
  pilot.add(torso);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.35 })
  );
  helmet.position.y = 0.62;
  pilot.add(helmet);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 12, 8, -Math.PI / 3, Math.PI / 1.5, Math.PI / 4, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.1, metalness: 0.6 })
  );
  visor.position.set(0, 0.62, -0.03);
  visor.rotation.y = Math.PI;
  pilot.add(visor);
  pilot.position.set(0, 0.35, -3.2);
  g.add(pilot);

  // --- Tragflächen ---
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(4.6, 2.4);
  wingShape.lineTo(4.6, 4.4);
  wingShape.lineTo(0, 3.4);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);

  const roundel = roundelTexture(opts.nation);
  const decalMat = new THREE.MeshBasicMaterial({ map: roundel, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.scale.x = side;
    wing.position.set(0, -0.1, -1.4);
    g.add(wing);
    // Roundel auf Flügeloberseite
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), decalMat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(side * 2.9, 0.03, 0.6);
    g.add(decal);
    // Flügelspitzen-Schiene + AIM-9
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.8), darkMat);
    rail.position.set(side * 4.6, 0.02, -0.4);
    g.add(rail);
    const aim9 = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.6, 4, 10), accentMat);
    aim9.rotation.x = Math.PI / 2;
    aim9.position.set(side * 4.6, -0.12, -0.4);
    g.add(aim9);
    // Seeker-Kopf
    const seeker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), darkMat);
    seeker.position.set(side * 4.6, -0.12, -1.3);
    g.add(seeker);
    // Nav-Lights: links rot, rechts grün
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2222 : 0x22ff44 })
    );
    nav.position.set(side * 4.6, 0.02, 0.5);
    g.add(nav);
  }

  // --- Seitenleitwerk mit Tail-Art ---
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(0.0, 3.1);
  tailShape.lineTo(1.9, 1.2);
  tailShape.lineTo(2.1, 0);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.1, bevelEnabled: false });
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.position.set(-0.05, 0.3, 4.4);
  g.add(tail);
  if (isUS) {
    const tailArt = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: tailTexture(opts.tailCode ?? 'SW', '#b5242c'),
        transparent: true, polygonOffset: true, polygonOffsetFactor: -2,
      })
    );
    tailArt.position.set(0.12, 1.5, 5.15);
    tailArt.rotation.y = Math.PI / 2;
    g.add(tailArt);
    const tailArt2 = tailArt.clone();
    tailArt2.position.x = -0.12;
    tailArt2.rotation.y = -Math.PI / 2;
    g.add(tailArt2);
  }

  // --- Höhenleitwerke (F-16: leicht gepfeilt, Anhedral) ---
  const hTailGeo = new THREE.BoxGeometry(2.4, 0.09, 1.3);
  for (const side of [-1, 1]) {
    const ht = new THREE.Mesh(hTailGeo, bodyMat);
    ht.position.set(side * 1.25, 0.05, 5.4);
    ht.rotation.z = side * -0.12;
    g.add(ht);
  }

  // --- Baucheinlass + Fuselage-Details ---
  const intake = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 2.4), darkMat);
  intake.position.set(0, -0.72, -1.6);
  g.add(intake);
  const intakeLip = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 12, Math.PI), darkMat);
  intakeLip.position.set(0, -0.72, -2.8);
  intakeLip.rotation.z = Math.PI;
  g.add(intakeLip);
  // M61-Gun-Port (linke Strake)
  const gunPort = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), darkMat);
  gunPort.rotation.x = Math.PI / 2;
  gunPort.position.set(-0.72, 0.25, -2.6);
  g.add(gunPort);
  // Strakes
  for (const side of [-1, 1]) {
    const strake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 3.4), bodyMat);
    strake.position.set(side * 0.82, 0.05, -2.4);
    strake.rotation.z = side * 0.15;
    g.add(strake);
  }
  // Antennen
  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.35, 0.18), darkMat);
  blade1.position.set(0, 0.95, 1.2);
  g.add(blade1);
  const blade2 = blade1.clone();
  blade2.position.set(0, 0.9, 3.4);
  blade2.scale.set(0.8, 0.8, 0.8);
  g.add(blade2);
  // Ventrale Finnen (F-16-Merkmal!)
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 1.2), bodyMat);
    fin.position.set(side * 0.55, -0.75, 4.9);
    fin.rotation.z = side * 0.35;
    g.add(fin);
  }
  // Formation Lights (grünlich leuchtende Streifen)
  const formMat = new THREE.MeshBasicMaterial({ color: 0x9fe8b0 });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 2.2), formMat);
    strip.position.set(side * 0.88, 0.15, -1.8);
    g.add(strip);
  }

  // --- Triebwerk ---
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 1.4, 16), darkMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0, 6.3);
  g.add(nozzle);
  // Turkey-Feathers (Düsenlamellen)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const feather = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.6), darkMat);
    feather.position.set(Math.cos(a) * 0.68, Math.sin(a) * 0.68, 6.9);
    feather.rotation.z = a;
    g.add(feather);
  }

  // --- Nachbrenner ---
  const abMat = new THREE.MeshBasicMaterial({
    color: 0x66aaff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const afterburner = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.4, 12, 1, true), abMat);
  afterburner.rotation.x = Math.PI / 2;
  afterburner.position.set(0, 0, 9.0);
  afterburner.visible = false;
  g.add(afterburner);
  // Shock-Diamonds im AB-Strahl
  const diamonds = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.6, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  diamonds.rotation.x = Math.PI / 2;
  diamonds.position.set(0, 0, 8.2);
  diamonds.visible = false;
  diamonds.name = 'abDiamonds';
  afterburner.add(diamonds);
  diamonds.position.set(0, 0, -0.6);
  const abLight = new THREE.PointLight(0x77aaff, 0, 30);
  abLight.position.set(0, 0, 7.5);
  g.add(abLight);

  const parts: F16Parts = { group: g, afterburner, abLight };
  if (opts.withCockpit) parts.cockpit = buildCockpit();
  if (parts.cockpit) g.add(parts.cockpit);
  return parts;
}

// ---- Cockpit-Interior (sichtbar im Cockpit-View) ---------------------------

function buildCockpit(): THREE.Group {
  const c = new THREE.Group();
  const tubMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.85 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.7 });

  // Wanne
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.2), tubMat);
  tub.position.set(0, 0.12, -3.3);
  c.add(tub);

  // Ejection Seat (ACES II)
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x333539, roughness: 0.8 });
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.12), seatMat);
  seatBack.position.set(0, 0.42, -2.55);
  seatBack.rotation.x = 0.18;
  c.add(seatBack);
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.14), seatMat);
  headrest.position.set(0, 0.78, -2.5);
  c.add(headrest);

  // Instrumentenpanel (geneigt)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.55, 0.08), panelMat);
  panel.position.set(0, 0.48, -4.15);
  panel.rotation.x = -0.28;
  c.add(panel);

  // Zwei MFDs
  const mfdRadar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ map: mfdTexture('radar') })
  );
  mfdRadar.position.set(-0.28, 0.48, -4.10);
  mfdRadar.rotation.x = -0.28;
  c.add(mfdRadar);
  const mfdEngine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ map: mfdTexture('engine') })
  );
  mfdEngine.position.set(0.28, 0.48, -4.10);
  mfdEngine.rotation.x = -0.28;
  c.add(mfdEngine);

  // HUD-Projektor + Combiner-Glas
  const hudBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.14), panelMat);
  hudBox.position.set(0, 0.72, -4.05);
  c.add(hudBox);
  const hudGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.16),
    new THREE.MeshPhysicalMaterial({
      color: 0x88ffbb, transparent: true, opacity: 0.18, roughness: 0.05,
      side: THREE.DoubleSide,
    })
  );
  hudGlass.position.set(0, 0.86, -4.08);
  hudGlass.rotation.x = -0.15;
  c.add(hudGlass);

  // Glareshield
  const glare = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.3), tubMat);
  glare.position.set(0, 0.78, -4.0);
  glare.rotation.x = -0.2;
  c.add(glare);

  // Sidestick (F-16!)
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 8), panelMat);
  stick.position.set(0.42, 0.28, -3.3);
  stick.rotation.z = -0.15;
  c.add(stick);
  // Throttle links
  const throttle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), panelMat);
  throttle.position.set(-0.42, 0.3, -3.35);
  c.add(throttle);
  // Seitenkonsolen
  for (const side of [-1, 1]) {
    const console = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 1.4), panelMat);
    console.position.set(side * 0.44, 0.26, -3.4);
    c.add(console);
  }
  return c;
}

// Wingtip-Contrails (unverändert aus V1)
export class Contrails {
  readonly group = new THREE.Group();
  private trails: { mesh: THREE.Mesh; tipOffset: THREE.Vector3 }[] = [];
  private jet: THREE.Object3D;

  constructor(jet: THREE.Object3D) {
    this.jet = jet;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false,
    });
    for (const side of [-4.6, 4.6]) {
      const geo = new THREE.CylinderGeometry(0.06, 0.5, 26, 6, 1, true);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, 13);
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.trails.push({ mesh, tipOffset: new THREE.Vector3(side, 0, 0) });
    }
  }

  update(_dt: number, speed: number, gForce: number) {
    const visible = speed > 220 && gForce > 1.4;
    this.group.visible = visible;
    if (!visible) return;
    for (const t of this.trails) {
      const world = t.tipOffset.clone().applyMatrix4(this.jet.matrixWorld);
      t.mesh.position.copy(world);
      t.mesh.quaternion.copy(this.jet.quaternion);
    }
  }
}
