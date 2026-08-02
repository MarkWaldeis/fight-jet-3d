import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudData } from './game/Game';
import { Hud } from './components/Hud';
import { Menus } from './components/Menus';
import type { JetId } from './game/aircraft/JetCatalog';
import type { MapId } from './game/world/MapCatalog';
import { loadSettings } from './lib/gameSettings';

const initialHud: HudData = {
  state: 'menu',
  speedKnots: 0, altitudeFt: 0, headingDeg: 0, throttle: 0.6,
  afterburner: false, stalled: false, freeLook: false, autoTrack: false, gForce: 1,
  hp: 100, maxHp: 100, score: 0, missiles: 6, enemiesAlive: 4,
  lockProgress: 0, lockedTargetName: null, lockScreen: null, warning: null, radar: [],
  mouseReticle: { x: 50, y: 50, visible: false },
  velocityVector: { x: 50, y: 50, visible: false },
  gunCrosshair: { x: 50, y: 50, visible: false },
  manualOverride: false,
  airbrake: false,
  worldMarkers: [],
  damage: {
    hullPct: 100,
    status: 'NOMINAL',
    systems: [
      { name: 'ENGINE', ok: true },
      { name: 'FLIGHT CTRL', ok: true },
      { name: 'RADAR', ok: true },
      { name: 'WEAPONS', ok: true },
      { name: 'HYDRAULICS', ok: true },
    ],
  },
  waveIndex: 0, waveCount: 3, waveLabel: '', samsLeft: 0, waveBanner: null,
  selectedJetId: 'f16', jetName: 'F-16 Fighting Falcon',
  selectedMapId: 'islands', mapName: 'Pacific Islands',
  killPopup: null,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudData>(initialHud);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    (window as unknown as { __game: Game }).__game = game;
    game.onHud(setHud);

    // Apply saved sound settings
    const s = loadSettings();
    game.setSoundMuted(s.muted);
    game.setSoundVolume(s.masterVolume);

    return () => game.dispose();
  }, []);

  const onSoundChange = useCallback((s: { muted: boolean; volume: number }) => {
    gameRef.current?.setSoundMuted(s.muted);
    gameRef.current?.setSoundVolume(s.volume);
  }, []);

  return (
    <div className="liquid-ui-root relative h-screen w-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <Hud data={hud} />
      <Menus
        state={hud.state}
        score={hud.score}
        selectedJetId={hud.selectedJetId}
        selectedMapId={hud.selectedMapId}
        onSelectJet={(id: JetId) => { void gameRef.current?.selectJet(id); }}
        onSelectMap={(id: MapId) => gameRef.current?.selectMap(id) ?? Promise.resolve()}
        onStart={(id: JetId) => { void gameRef.current?.startGame(id); }}
        onResume={() => gameRef.current?.togglePause()}
        onMenu={() => gameRef.current?.returnToMenu()}
        onSoundChange={onSoundChange}
      />
    </div>
  );
}
