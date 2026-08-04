import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudData } from './game/Game';
import { Hud } from './components/Hud';
import { Menus } from './components/Menus';
import type { JetId } from './game/aircraft/JetCatalog';
import type { MapId } from './game/world/MapCatalog';
import { loadSettings, saveSettings, purchaseJet } from './lib/gameSettings';

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
  selectedMapId: 'islands', mapName: 'Stormbreak Archipelago',
  killPopup: null,
};

type AppPhase = 'menu' | 'loading' | 'playing';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudData>(initialHud);
  const [phase, setPhase] = useState<AppPhase>('menu');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initialisiere...');
  const [credits, setCredits] = useState(() => loadSettings().aeroCredits);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    (window as unknown as { __game: Game }).__game = game;
    game.onHud((d) => {
      setHud(d);
      if (d.state === 'playing') setPhase('playing');
      if ((d.state === 'gameover' || d.state === 'victory') && phase === 'playing') {
        // Award credits on mission end
        const reward = d.state === 'victory' ? 1000 : Math.floor(d.score * 0.5);
        const s = loadSettings();
        s.aeroCredits += reward;
        saveSettings(s);
        setCredits(s.aeroCredits);
        setPhase('menu');
      }
      if (d.state === 'menu') {
        setPhase('menu');
        setCredits(loadSettings().aeroCredits);
      }
    });

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

  const onStart = useCallback(async (id: JetId) => {
    setPhase('loading');
    setLoadingProgress(0);
    setLoadingText('Lade Welt...');
    const stages = [
      { p: 15, t: 'Lade Jet-Modell...', d: 400 },
      { p: 30, t: 'Bewaffnung kalibrieren...', d: 500 },
      { p: 55, t: 'Terrain generieren...', d: 700 },
      { p: 75, t: 'Gegner platzieren...', d: 500 },
      { p: 90, t: 'Systeme hochfahren...', d: 600 },
      { p: 100, t: 'Startbereit!', d: 400 },
    ];
    for (const stage of stages) {
      setLoadingProgress(stage.p);
      setLoadingText(stage.t);
      await new Promise(r => setTimeout(r, stage.d));
    }
    await gameRef.current?.startGame(id);
    setPhase('playing');
  }, []);

  const onPurchaseJet = useCallback((jetId: string, price: number) => {
    const ok = purchaseJet(jetId, price);
    if (ok) setCredits(loadSettings().aeroCredits);
    return ok;
  }, []);

  const isMenu = phase === 'menu';
  const isLoading = phase === 'loading';

  return (
    <div className="liquid-ui-root relative h-screen w-screen overflow-hidden bg-black">
      {isMenu && (
        <div className="fixed inset-0 z-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 35%, #0d1f3c 0%, #06101e 45%, #020810 100%)' }}>
          <div className="absolute inset-0 opacity-[0.025]"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
          <div className="absolute top-[15%] left-[20%] w-[40vw] h-[40vw] rounded-full opacity-[0.06] animate-pulse"
            style={{ background: 'radial-gradient(circle, #0a84ff 0%, transparent 70%)' }} />
          <div className="absolute bottom-[25%] right-[15%] w-[35vw] h-[35vw] rounded-full opacity-[0.05] animate-pulse"
            style={{ background: 'radial-gradient(circle, #00f2ff 0%, transparent 70%)' }} />
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 35%, #0d1f3c 0%, #020810 100%)' }}>
          <svg width="100" height="100" viewBox="0 0 100 100" className="animate-spin" style={{ animationDuration: '2.5s' }}>
            <defs>
              <linearGradient id="loadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0a84ff" /><stop offset="100%" stopColor="#00f2ff" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#loadGrad)" strokeWidth="2.5"
              strokeDasharray={`${loadingProgress * 2.64} 264`} strokeLinecap="round" transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
          </svg>
          <span className="text-2xl font-bold text-white/85 tabular-nums">{loadingProgress}%</span>
          <p className="text-white/50 text-xs tracking-[0.22em] uppercase animate-pulse">{loadingText}</p>
          <div className="w-56 h-[3px] rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${loadingProgress}%`, background: 'linear-gradient(90deg, #0a84ff, #00f2ff)', boxShadow: '0 0 10px rgba(0,242,255,0.4)' }} />
          </div>
        </div>
      )}

      <canvas ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-500`} />

      <Hud data={hud} />

      {phase !== 'loading' && (
        <Menus
          state={hud.state}
          score={hud.score}
          selectedJetId={hud.selectedJetId}
          selectedMapId={hud.selectedMapId}
          onSelectJet={(id: JetId) => { void gameRef.current?.selectJet(id); }}
          onSelectMap={(id: MapId) => gameRef.current?.selectMap(id) ?? Promise.resolve()}
          onStart={onStart}
          onResume={() => gameRef.current?.togglePause()}
          onMenu={() => gameRef.current?.returnToMenu()}
          onSoundChange={onSoundChange}
          aeroCredits={credits}
          onPurchaseJet={onPurchaseJet}
        />
      )}
    </div>
  );
}
