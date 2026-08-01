import * as THREE from 'three';
import { CONFIG } from '../config';

// Sky: Himmels-Gradient (Shader-Dome), Sonne mit Glow, bewegte Wolken-Billboards,
// Licht-Setup (Sonne + Hemisphärenlicht).
export class Sky {
  readonly group = new THREE.Group();
  private clouds: THREE.Mesh[] = [];
  private sunLight: THREE.DirectionalLight;

  constructor() {
    // Himmelskuppel mit Gradient
    const skyGeo = new THREE.SphereGeometry(30000, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2a5d9e) },
        midColor: { value: new THREE.Color(0x7fa8d0) },
        bottomColor: { value: new THREE.Color(0xd9e4ee) },
        sunDir: { value: new THREE.Vector3(0.5, 0.55, 0.4).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.05, 1.0);
          vec3 col = h < 0.12
            ? mix(bottomColor, midColor, smoothstep(-0.05, 0.12, h))
            : mix(midColor, topColor, smoothstep(0.12, 0.7, h));
          float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 350.0);
          float glow = pow(max(dot(normalize(vDir), sunDir), 0.0), 8.0);
          col += vec3(1.0, 0.9, 0.7) * sun * 1.4 + vec3(1.0, 0.85, 0.6) * glow * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.group.add(new THREE.Mesh(skyGeo, skyMat));

    // Licht — kräftig genug, dass MeshStandardMaterial ohne Env-Map hell bleibt
    this.sunLight = new THREE.DirectionalLight(0xfff2dd, 3.4);
    this.sunLight.position.set(5000, 7000, 4000);
    this.group.add(this.sunLight);
    // Target muss im Scene-Graph hängen, sonst zeigt die Sonne dauerhaft auf (0,0,0)
    this.group.add(this.sunLight.target);
    this.group.add(new THREE.HemisphereLight(0xd0e4f8, 0x6a7a58, 1.15));
    this.group.add(new THREE.AmbientLight(0xffffff, 0.55));
    // Fülllicht von vorne unten — verhindert Silhouetten-Schwarz
    const fill = new THREE.DirectionalLight(0xc8daf0, 0.85);
    fill.position.set(-3000, 2000, -4000);
    this.group.add(fill);

    // Wolken: weiche Sprite-Cluster auf 800–1400 m
    const cloudTex = Sky.makeCloudTexture();
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: true,
    });
    const half = CONFIG.world.size / 2 - 500;
    for (let i = 0; i < 46; i++) {
      const w = 300 + Math.random() * 700;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.42), cloudMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        (Math.random() * 2 - 1) * half,
        800 + Math.random() * 650,
        (Math.random() * 2 - 1) * half
      );
      m.renderOrder = 1;
      this.clouds.push(m);
      this.group.add(m);
    }
  }

  private static makeCloudTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < 26; i++) {
      const x = 20 + Math.random() * 88, y = 40 + Math.random() * 48;
      const r = 12 + Math.random() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  update(dt: number, playerPos: THREE.Vector3) {
    // Kuppel folgt dem Spieler, Wolken driften
    this.group.position.set(playerPos.x, 0, playerPos.z);
    // Sonne bleibt relativ zur Gruppe (Gruppe sitzt schon auf playerPos)
    this.sunLight.position.set(5000, 7000, 4000);
    this.sunLight.target.position.set(0, 0, 0);

    for (const c of this.clouds) {
      c.position.x += dt * 6;
      if (c.position.x - playerPos.x > CONFIG.world.size / 2) {
        c.position.x -= CONFIG.world.size;
      }
    }
  }
}
