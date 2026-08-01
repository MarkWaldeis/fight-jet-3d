// Input: Tastatur-Abstraktion mit kontinuierlichen Achsen und Einmal-Events.
export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();

  // Achsenwerte -1..1
  pitch = 0;
  roll = 0;
  yaw = 0;
  throttle = 0.6; // 0..1
  afterburner = false;
  cannon = false;

  // Maus-Delta (Pixel/Frame) für Free-Look — wird in endFrame genullt
  mouseDX = 0;
  mouseDY = 0;
  private accumMX = 0;
  private accumMY = 0;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.pressedThisFrame.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  private onMouseMove = (e: MouseEvent) => {
    this.accumMX += e.movementX;
    this.accumMY += e.movementY;
  };

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  // Muss am Ende jedes Frames aufgerufen werden.
  endFrame() {
    this.pressedThisFrame.clear();
    this.accumMX = 0;
    this.accumMY = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  update(dt: number) {
    const k = this.keys;
    this.pitch =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    this.roll =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.yaw = (k.has('KeyQ') ? 1 : 0) - (k.has('KeyE') ? 1 : 0);

    const throttleUp = k.has('ShiftLeft') || k.has('ShiftRight');
    const throttleDown = k.has('ControlLeft') || k.has('ControlRight');
    if (throttleUp) this.throttle = Math.min(1, this.throttle + dt * 0.7);
    if (throttleDown) this.throttle = Math.max(0, this.throttle - dt * 0.7);

    this.afterburner = k.has('Tab') || (this.throttle >= 0.99);
    this.cannon = k.has('Space');

    // Maus-Delta dieses Frames (auch Tastatur-Pfeile als Free-Look-Hilfe)
    this.mouseDX = this.accumMX;
    this.mouseDY = this.accumMY;
    this.accumMX = 0;
    this.accumMY = 0;
  }

  /** Free-Look: Maus + optional Pfeiltasten / IJKL zum Orbit. */
  freeLookDelta(dt: number): { x: number; y: number } {
    const keySpeed = 1.8;
    let x = this.mouseDX;
    let y = this.mouseDY;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyJ')) x -= keySpeed * 60 * dt * 16;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyL')) x += keySpeed * 60 * dt * 16;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyI')) y -= keySpeed * 60 * dt * 16;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyK')) y += keySpeed * 60 * dt * 16;
    return { x, y };
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
  }
}
