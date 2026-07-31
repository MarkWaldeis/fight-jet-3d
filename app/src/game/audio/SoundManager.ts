// Prozeduraler Sound via WebAudio — keine Audiodateien nötig.
// Triebwerks-Loop (Pitch = Speed), Afterburner, Kanone, Lock-On, Explosionen, Warner.
export class SoundManager {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private abNoise: AudioBufferSourceNode | null = null;
  private abGain: GainNode | null = null;
  private lockOsc: OscillatorNode | null = null;
  private lockGain: GainNode | null = null;
  private muted = false;

  // Muss nach User-Geste aufgerufen werden (Browser-Autoplay-Policy)
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();

    // Rausch-Buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Triebwerk: zwei Sägezähne, leicht verstimmt
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 63;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Afterburner-Rauschen
    this.abGain = this.ctx.createGain();
    this.abGain.gain.value = 0;
    const abFilter = this.ctx.createBiquadFilter();
    abFilter.type = 'bandpass';
    abFilter.frequency.value = 900;
    this.abNoise = this.ctx.createBufferSource();
    this.abNoise.buffer = this.noiseBuffer;
    this.abNoise.loop = true;
    this.abNoise.connect(abFilter);
    abFilter.connect(this.abGain);
    this.abGain.connect(this.ctx.destination);
    this.abNoise.start();

    // Lock-Ton
    this.lockGain = this.ctx.createGain();
    this.lockGain.gain.value = 0;
    this.lockOsc = this.ctx.createOscillator();
    this.lockOsc.type = 'square';
    this.lockOsc.frequency.value = 1100;
    this.lockOsc.connect(this.lockGain);
    this.lockGain.connect(this.ctx.destination);
    this.lockOsc.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.disconnect();
    if (this.ctx && !m) {
      // neu verbinden
    }
  }

  updateEngine(speedNorm: number, throttle: number, afterburner: boolean, dt: number) {
    if (!this.ctx || !this.engineGain || this.muted) return;
    const g = this.engineGain.gain;
    const target = 0.05 + throttle * 0.1;
    g.value += (target - g.value) * Math.min(1, dt * 5);
    const freq = 45 + speedNorm * 120 + throttle * 30;
    this.engineOsc!.frequency.value = freq;
    this.engineOsc2!.frequency.value = freq * 1.03;
    if (this.abGain) {
      const ab = this.abGain.gain;
      const t = afterburner ? 0.16 : 0;
      ab.value += (t - ab.value) * Math.min(1, dt * 6);
    }
  }

  cannonShot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + 0.1);
  }

  missileLaunch() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + 0.65);
  }

  explosion(big = false) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 900 : 1400, t);
    f.frequency.exponentialRampToValueAtTime(60, t + (big ? 1.4 : 0.7));
    g.gain.setValueAtTime(big ? 0.5 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 1.5 : 0.8));
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + (big ? 1.6 : 0.9));
  }

  setLockTone(progress: number) {
    // 0 = aus, 0<x<1 = suchend (Piep-Intervall), 1 = LOCK (Dauerton)
    if (!this.ctx || !this.lockGain || this.muted) return;
    if (progress <= 0) { this.lockGain.gain.value = 0; return; }
    if (progress >= 1) {
      this.lockGain.gain.value = 0.06;
      this.lockOsc!.frequency.value = 1400;
      return;
    }
    // gepulst
    const t = this.ctx.currentTime;
    const interval = 0.3 - progress * 0.2;
    this.lockGain.gain.value = (t % interval) < interval * 0.4 ? 0.05 : 0;
    this.lockOsc!.frequency.value = 1000 + progress * 300;
  }

  stallWarning(on: boolean) {
    if (!this.ctx || this.muted) return;
    // einfacher Dauerton über lockGain würde kollidieren — eigener kurzer Beep
    if (!on) return;
    const t = this.ctx.currentTime;
    if (this._lastStallBeep && t - this._lastStallBeep < 0.5) return;
    this._lastStallBeep = t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 700;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.32);
  }
  private _lastStallBeep = 0;
}
