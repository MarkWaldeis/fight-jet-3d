import { useEffect, useRef, useState } from 'react';
import { Game, type HudData } from './game/Game';
import { Hud } from './components/Hud';
import { Menus } from './components/Menus';

const initialHud: HudData = {
  state: 'menu',
  speedKnots: 0, altitudeFt: 0, headingDeg: 0, throttle: 0.6,
  afterburner: false, stalled: false, gForce: 1,
  hp: 100, maxHp: 100, score: 0, missiles: 6, enemiesAlive: 4,
  lockProgress: 0, lockedTargetName: null, lockScreen: null, warning: null, radar: [],
  waveIndex: 0, waveCount: 3, waveLabel: '', samsLeft: 0, waveBanner: null,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudData>(initialHud);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    (window as unknown as { __game: Game }).__game = game; // für Smoke-Tests/Debug
    game.onHud(setHud);
    return () => game.dispose();
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <Hud data={hud} />
      <Menus
        state={hud.state}
        score={hud.score}
        onStart={() => gameRef.current?.startGame()}
        onResume={() => gameRef.current?.togglePause()}
      />
    </div>
  );
}
