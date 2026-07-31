import * as THREE from 'three';
import { FlightModel } from './FlightModel';
import { buildF16, Contrails } from './JetModel';

// Basis-Klasse für alle Jets (Spieler & KI).
export abstract class Aircraft {
  readonly object = new THREE.Group();
  readonly flight: FlightModel;
  readonly contrails: Contrails;
  hp: number;
  alive = true;
  abstract readonly isPlayer: boolean;
  readonly name: string;
  protected afterburnerMesh: THREE.Mesh;
  protected abLight: THREE.PointLight;
  private deathTimer = 0;

  constructor(name: string, colors: { bodyColor: number; accentColor: number }, hp: number) {
    this.name = name;
    this.hp = hp;
    const { group, afterburner, abLight } = buildF16(colors);
    this.object.add(group);
    this.afterburnerMesh = afterburner;
    this.abLight = abLight;
    this.flight = new FlightModel(this.object);
    this.contrails = new Contrails(group);
    this.object.add(this.contrails.group);
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }
  get forward(): THREE.Vector3 {
    return this.flight.forward;
  }

  setAfterburner(on: boolean) {
    this.afterburnerMesh.visible = on;
    this.abLight.intensity = on ? 8 : 0;
    if (on) {
      const s = 0.9 + Math.random() * 0.3;
      this.afterburnerMesh.scale.set(s, s, 0.85 + Math.random() * 0.4);
    }
  }

  takeDamage(dmg: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      return true; // zerstört
    }
    return false;
  }

  updateDeath(dt: number): boolean {
    // Absturz: trudelnd nach unten
    this.deathTimer += dt;
    this.object.rotateZ(dt * 4);
    this.object.rotateX(dt * 1.5);
    this.object.position.y -= (60 + this.deathTimer * 80) * dt;
    this.object.translateZ(this.flight.speed * dt * 0.6);
    this.flight.speed = Math.max(0, this.flight.speed - dt * 60);
    return this.deathTimer > 8; // danach entfernen
  }

  get headingDeg(): number {
    const f = this.forward;
    return ((Math.atan2(-f.x, -f.z) * 180) / Math.PI + 360) % 360;
  }
  get speedKnots(): number {
    return this.flight.speed * 1.944;
  }
}
