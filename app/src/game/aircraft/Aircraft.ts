import * as THREE from 'three';
import { FlightModel } from './FlightModel';
import { buildF16, Contrails } from './JetModel';
import { EngineFx } from './EngineFx';

// Basis-Klasse für alle Jets (Spieler & KI).
export abstract class Aircraft {
  readonly object = new THREE.Group();
  readonly flight: FlightModel;
  contrails: Contrails;
  hp: number;
  alive = true;
  abstract readonly isPlayer: boolean;
  readonly name: string;
  /** Animiertes Triebwerks-FX (Idle + Nachbrenner). */
  readonly engineFx: EngineFx;
  private deathTimer = 0;
  /** Prozedurales oder GLB-Visual (Kind von object). */
  private visual: THREE.Object3D;

  // Legacy-Felder für Code, der noch afterburnerMesh erwartet — map auf engineFx
  protected get afterburnerMesh(): THREE.Mesh {
    return this.engineFx.group.children[1] as THREE.Mesh;
  }
  protected get abLight(): THREE.PointLight {
    return this.engineFx.group.children.find((c) => (c as THREE.PointLight).isLight) as THREE.PointLight;
  }

  constructor(
    name: string,
    colors: { bodyColor: number; accentColor: number },
    hp: number,
    nation: 'us' | 'enemy' = 'us',
    withCockpit = false
  ) {
    this.name = name;
    this.hp = hp;
    const { group, afterburner, abLight } = buildF16({
      bodyColor: colors.bodyColor,
      accentColor: colors.accentColor,
      nation,
      withCockpit,
    });
    // Prozedurales AB-Mesh ausblenden — EngineFx übernimmt
    afterburner.visible = false;
    abLight.intensity = 0;

    this.visual = group;
    this.object.add(group);
    this.engineFx = new EngineFx(new THREE.Vector3(0, -0.05, 7.3));
    group.add(this.engineFx.group);

    this.flight = new FlightModel(this.object);
    this.contrails = new Contrails(group);
    this.object.add(this.contrails.group);
  }

  /**
   * Ersetzt das prozedurale Modell durch ein externes GLB-Visual (Test).
   */
  applyExternalVisual(visual: THREE.Object3D) {
    if (this.visual.parent === this.object) {
      this.object.remove(this.visual);
    }
    if (this.contrails.group.parent === this.object) {
      this.object.remove(this.contrails.group);
    }

    this.visual = visual;
    this.object.add(visual);

    // EngineFx ans GLB-Heck hängen
    visual.add(this.engineFx.group);
    this.engineFx.group.position.set(0, -0.05, 7.5);

    this.contrails = new Contrails(visual);
    this.object.add(this.contrails.group);
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }
  get forward(): THREE.Vector3 {
    return this.flight.forward;
  }

  /** Schub + Nachbrenner animieren (jeder Frame). */
  updateEngineFx(dt: number, throttle: number, afterburner: boolean) {
    this.engineFx.update(dt, throttle, afterburner);
  }

  setAfterburner(on: boolean) {
    this.engineFx.setAfterburner(on);
  }

  takeDamage(dmg: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  updateDeath(dt: number): boolean {
    this.deathTimer += dt;
    this.object.rotateZ(dt * 4);
    this.object.rotateX(dt * 1.5);
    this.object.position.y -= (60 + this.deathTimer * 80) * dt;
    this.object.translateZ(this.flight.speed * dt * 0.6);
    this.flight.speed = Math.max(0, this.flight.speed - dt * 60);
    this.engineFx.update(dt, 0.2, false);
    return this.deathTimer > 8;
  }

  get headingDeg(): number {
    const f = this.forward;
    return ((Math.atan2(-f.x, -f.z) * 180) / Math.PI + 360) % 360;
  }
  get speedKnots(): number {
    return this.flight.speed * 1.944;
  }
}
