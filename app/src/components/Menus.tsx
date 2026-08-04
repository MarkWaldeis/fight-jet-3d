import { useEffect, useState } from 'react';
import type { GameState } from '../game/Game';
import { CONFIG } from '../game/config';
import {
  JET_CATALOG,
  FACTION_LABELS,
  jetsSortedByPrice,
  type JetFaction,
  type JetId,
} from '../game/aircraft/JetCatalog';
import {
  loadSettings,
  saveSettings,
  isJetOwned,
  jetStatBars,
  type GameSettings,
  type GraphicsQuality,
} from '../lib/gameSettings';
import { MAP_CATALOG, getMapDef, type MapId } from '../game/world/MapCatalog';

type Screen = 'main' | 'hangar' | 'maps' | 'missions' | 'settings';
type SettingsTab = 'graphics' | 'sound' | 'controls';

const CONTROLS: { key: string; label: string }[] = [
  { key: 'Maus', label: 'Mouse-Aim (Fly-By-Wire)' },
  { key: 'S / W', label: 'Ziehen / Drücken' },
  { key: 'A / D', label: 'Rollen (eigene Achse)' },
  { key: 'Q / E', label: 'Seitenruder' },
  { key: 'Shift · Ctrl · Rad', label: 'Schub / WEP' },
  { key: 'B', label: 'Luftbremse' },
  { key: 'Leertaste', label: 'Bordkanone' },
  { key: 'F / M', label: 'Rakete (nach Lock)' },
  { key: 'C / RMB', label: 'Free-Look (halten)' },
  { key: 'V', label: 'Cockpit / Chase' },
  { key: 'P / Esc', label: 'Pause' },
];

function StatBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="tracking-[0.14em] text-white/55 uppercase">{label}</span>
        <span className="glass-mono text-white/80">{v}</span>
      </div>
      <div className="glass-progress-track">
        <div className="glass-progress-fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function Menus({
  state,
  score,
  selectedJetId,
  selectedMapId,
  onSelectJet,
  onSelectMap,
  onStart,
  onResume,
  onMenu,
  onSoundChange,
  aeroCredits,
  onPurchaseJet,
}: {
  state: GameState;
  score: number;
  selectedJetId: JetId;
  selectedMapId: MapId;
  onSelectJet: (id: JetId) => void;
  onSelectMap: (id: MapId) => void | Promise<void>;
  onStart: (jetId: JetId) => void;
  onResume: () => void;
  onMenu: () => void;
  onSoundChange?: (s: { muted: boolean; volume: number }) => void;
  aeroCredits: number;
  onPurchaseJet: (jetId: string, price: number) => boolean;
}) {
  const [screen, setScreen] = useState<Screen>('main');
  const [faction, setFaction] = useState<JetFaction>('nato');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('graphics');
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [exitConfirm, setExitConfirm] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const selected = JET_CATALOG.find((j) => j.id === selectedJetId) ?? JET_CATALOG[0];
  const selectedMap = getMapDef(selectedMapId);
  const sortedJets = jetsSortedByPrice();
  const bars = jetStatBars(selected.stats);

  const pickMap = async (id: MapId) => {
    setMapError(null);
    setMapLoading(true);
    try {
      await onSelectMap(id);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : 'Map konnte nicht geladen werden');
    } finally {
      setMapLoading(false);
    }
  };

  useEffect(() => {
    saveSettings(settings);
    onSoundChange?.({ muted: settings.muted, volume: settings.masterVolume });
  }, [settings, onSoundChange]);

  useEffect(() => {
    if (state === 'menu') setScreen('main');
  }, [state]);

  if (state === 'playing') return null;

  const patchSettings = (partial: Partial<GameSettings>) =>
    setSettings((s) => ({ ...s, ...partial }));

  const openHangar = () => {
    setFaction(selected.faction);
    setScreen('hangar');
  };

  const tryExit = () => {
    setExitConfirm(true);
  };

  const confirmExit = () => {
    // Browser kann Tabs nicht zuverlässig schließen — zurück zum Landing
    setExitConfirm(false);
    setScreen('main');
    if (state !== 'menu') onMenu();
  };

  // ─── Top Navigation ─────────────────────────────────────────────────────
  const TopNav = ({ active }: { active?: Screen }) => (
    <nav className="glass-nav pointer-events-auto absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-1 px-2 py-1.5">
      <button type="button" className={`glass-nav-item ${active === 'main' || (!active && screen === 'main') ? 'is-active' : ''}`} onClick={() => setScreen('main')}>Home</button>
      <button type="button" className={`glass-nav-item ${screen === 'hangar' ? 'is-active' : ''}`} onClick={openHangar}>Garage</button>
      <button type="button" className={`glass-nav-item ${screen === 'maps' ? 'is-active' : ''}`} onClick={() => setScreen('maps')}>Maps</button>
      <button type="button" className={`glass-nav-item ${screen === 'missions' ? 'is-active' : ''}`} onClick={() => setScreen('missions')}>Einsätze</button>
      <button type="button" className={`glass-nav-item ${screen === 'settings' ? 'is-active' : ''}`} onClick={() => setScreen('settings')}>Einstellungen</button>
      <button type="button" className="glass-nav-item" onClick={tryExit}>Beenden</button>
    </nav>
  );

  // ─── Credits Badge (always visible on menu) ─────────────────────────────
  const CreditsBadge = () => (
    <div className="pointer-events-none fixed right-5 top-5 z-30">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/15 bg-black/40 backdrop-blur-2xl px-4 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]">
        <div className="relative w-7 h-7 shrink-0">
          <img
            src="./aero_credits.jpg"
            alt="Aero Credits"
            className="w-full h-full rounded-full object-cover shadow-[0_0_12px_rgba(255,215,0,0.5),0_0_24px_rgba(255,180,0,0.2)]"
            style={{ animation: 'coin-spin 3s linear infinite' }}
          />
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-yellow-300/20 to-transparent pointer-events-none" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-bold text-amber-100 tracking-[0.06em] tabular-nums">{aeroCredits.toLocaleString()}</span>
          <span className="text-[9px] text-amber-300/50 tracking-[0.15em] uppercase">Aero Credits</span>
        </div>
      </div>
    </div>
  );

  // ─── Exit confirm ───────────────────────────────────────────────────────
  const ExitModal = () =>
    exitConfirm ? (
      <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="glass-panel mx-4 w-full max-w-md p-6 text-center">
          <div className="glass-eyebrow mb-2">System</div>
          <h3 className="glass-title mb-2 text-2xl">Sitzung beenden?</h3>
          <p className="glass-subtitle mb-6 text-sm">
            Du kehrst zum Hauptmenü zurück. Fortschritt in der laufenden Mission geht verloren.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" className="glass-button glass-button-ghost" onClick={() => setExitConfirm(false)}>
              Abbrechen
            </button>
            <button type="button" className="glass-button glass-button-danger" onClick={confirmExit}>
              Beenden
            </button>
          </div>
        </div>
      </div>
    ) : null;

  // ─── Settings content (shared pause + menu) ─────────────────────────────
  const SettingsBody = () => (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ['graphics', 'Grafik'],
          ['sound', 'Sound'],
          ['controls', 'Steuerung'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`glass-button ${settingsTab === id ? 'glass-button-primary' : 'glass-button-ghost'} !px-4 !py-2 !text-xs`}
            onClick={() => setSettingsTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {settingsTab === 'graphics' && (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs tracking-[0.16em] text-white/50 uppercase">Qualität</div>
            <div className="flex flex-wrap gap-2">
              {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`glass-button !px-4 !py-2 !text-xs ${
                    settings.graphicsQuality === q ? 'glass-button-primary' : 'glass-button-ghost'
                  }`}
                  onClick={() => patchSettings({ graphicsQuality: q })}
                >
                  {q === 'low' ? 'Niedrig' : q === 'medium' ? 'Mittel' : 'Hoch'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/40">
              Hoch empfiehlt sich für Desktop. Einstellungen werden lokal gespeichert.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Flug-HUD anzeigen</div>
              <div className="text-xs text-white/45">Speed, Radar, Reticle & Status</div>
            </div>
            <button
              type="button"
              className={`glass-toggle ${settings.showHud ? 'is-on' : ''}`}
              aria-label="HUD umschalten"
              onClick={() => patchSettings({ showHud: !settings.showHud })}
            />
          </div>
        </div>
      )}

      {settingsTab === 'sound' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Stumm</div>
              <div className="text-xs text-white/45">Triebwerk, Waffen, Warner</div>
            </div>
            <button
              type="button"
              className={`glass-toggle ${settings.muted ? 'is-on' : ''}`}
              aria-label="Stumm umschalten"
              onClick={() => patchSettings({ muted: !settings.muted })}
            />
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs tracking-[0.12em] text-white/50 uppercase">
              <span>Master-Lautstärke</span>
              <span className="glass-mono text-white/80">{Math.round(settings.masterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.masterVolume * 100)}
              className="glass-slider"
              disabled={settings.muted}
              onChange={(e) => patchSettings({ masterVolume: Number(e.target.value) / 100 })}
            />
          </div>
        </div>
      )}

      {settingsTab === 'controls' && (
        <div className="glass-scroll max-h-[42vh] space-y-2 overflow-y-auto pr-1">
          {CONTROLS.map((c) => (
            <div
              key={c.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
            >
              <span className="glass-mono rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-xs text-cyan-200">
                {c.key}
              </span>
              <span className="text-right text-sm text-white/70">{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ─── PAUSE ──────────────────────────────────────────────────────────────
  if (state === 'paused') {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="menu-vignette absolute inset-0" />
        <div className="glass-panel pointer-events-auto relative z-10 mx-4 w-full max-w-lg p-6 sm:p-8">
          <div className="glass-eyebrow mb-2">Mission pausiert</div>
          <h2 className="glass-title mb-1 text-4xl text-white">Pause</h2>
          <p className="glass-subtitle mb-1 text-sm">
            {selected.name} · <span className="text-cyan-300">{selected.callsign}</span>
          </p>
          <p className="mb-5 glass-mono text-sm text-white/50">
            Score <span className="text-white">{score}</span>
          </p>
          <SettingsBody />
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" className="glass-button glass-button-primary w-full py-3.5" onClick={onResume}>
              Weiterfliegen (P)
            </button>
            <button
              type="button"
              className="glass-button glass-button-ghost w-full"
              onClick={() => {
                onMenu();
                setScreen('main');
              }}
            >
              Zum Hauptmenü
            </button>
          </div>
        </div>
        <ExitModal />
      </div>
    );
  }

  // ─── GAME OVER / VICTORY ────────────────────────────────────────────────
  if (state === 'gameover' || state === 'victory') {
    const win = state === 'victory';
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="menu-vignette absolute inset-0" />
        <div className="glass-panel pointer-events-auto relative z-10 mx-4 w-full max-w-md p-8 text-center">
          <div className="glass-eyebrow mb-2" style={{ color: win ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
            {win ? 'Alle Wellen abgeschlossen' : 'Airframe lost'}
          </div>
          <h2 className="glass-title mb-2 text-4xl" style={{ color: win ? '#fff' : 'var(--accent-danger)' }}>
            {win ? 'Mission erfüllt' : 'Shot Down'}
          </h2>
          <p className="glass-subtitle mb-1 text-sm">
            {win ? `Der Himmel gehört ${selected.callsign}.` : `${selected.callsign} ist abgestürzt.`}
          </p>
          <p className="mb-6 text-2xl font-bold">
            Score{' '}
            <span className="glass-mono text-cyan-300">{score}</span>
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="glass-button glass-button-primary w-full py-3.5"
              onClick={() => onStart(selectedJetId)}
            >
              {win ? 'Neue Mission' : 'Erneut fliegen'} (Enter)
            </button>
            <button
              type="button"
              className="glass-button glass-button-ghost w-full"
              onClick={() => {
                onMenu();
                setScreen('hangar');
              }}
            >
              Garage öffnen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── MENU states (main / hangar / missions / settings) ──────────────────
  return (
    <div className="absolute inset-0 z-10">
      <div className="menu-vignette absolute inset-0" />
      <TopNav active={screen} />
      <CreditsBadge />

      {/* MAIN LANDING */}
      {screen === 'main' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end pb-10 pt-24 sm:justify-center sm:pb-0">
          <div className="pointer-events-auto mx-auto w-full max-w-xl px-4">
            <div className="glass-panel p-6 sm:p-8">
              <div className="glass-eyebrow mb-2">Air Combat · Liquid Glass</div>
              <h1 className="glass-title mb-2 text-4xl sm:text-5xl">
                Fight Jet{' '}
                <span className="bg-gradient-to-r from-[#0A84FF] via-[#00F2FF] to-white bg-clip-text text-transparent">
                  3D
                </span>
              </h1>
              <p className="glass-subtitle mb-5 text-sm">
                War-Thunder-Style Mouse-Aim. Verdiene Aero Credits, schalte neue Jets frei und dominiere die 3-Wellen-Mission.
              </p>

              <div className="mb-5 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-4">
                  <div className="text-[11px] tracking-[0.2em] text-cyan-300/80 uppercase">
                    {FACTION_LABELS[selected.faction]} · Jet
                  </div>
                  <div className="mt-1 text-lg font-bold text-white">{selected.name}</div>
                  <div className="text-sm text-white/50">
                    {selected.callsign} · {selected.role}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-4">
                  <div className="text-[11px] tracking-[0.2em] text-cyan-300/80 uppercase">Karte</div>
                  <div className="mt-1 text-lg font-bold text-white">{selectedMap.name}</div>
                  <div className="text-sm text-white/50">
                    {(selectedMap.worldSizeM / 1000).toFixed(0)} × {(selectedMap.worldSizeM / 1000).toFixed(0)} km
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="menu-btn-primary group relative overflow-hidden w-full py-4 text-base font-bold rounded-2xl border border-white/20 bg-white/[0.08] backdrop-blur-2xl text-white transition-all duration-500 hover:bg-white/[0.16] hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(0,242,255,0.25)]"
                  onClick={() => onStart(selectedJetId)}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform duration-300 group-hover:translate-x-1"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    Abheben mit {selected.callsign}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-400/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" className="menu-btn-glass group relative overflow-hidden w-full py-3.5 rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl text-white/85 font-semibold text-sm transition-all duration-300 hover:bg-white/[0.12] hover:border-white/25 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.08)]" onClick={openHangar}>
                    <span className="relative z-10">Garage</span>
                  </button>
                  <button type="button" className="menu-btn-glass group relative overflow-hidden w-full py-3.5 rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl text-white/85 font-semibold text-sm transition-all duration-300 hover:bg-white/[0.12] hover:border-white/25 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.08)]" onClick={() => setScreen('maps')}>
                    <span className="relative z-10">Maps</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" className="menu-btn-glass group relative overflow-hidden w-full py-3 rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-lg text-white/65 font-medium text-xs transition-all duration-300 hover:bg-white/[0.08] hover:border-white/18 hover:text-white/90" onClick={() => setScreen('missions')}>
                    <span className="relative z-10">Einsatze</span>
                  </button>
                  <button type="button" className="menu-btn-glass group relative overflow-hidden w-full py-3 rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-lg text-white/65 font-medium text-xs transition-all duration-300 hover:bg-white/[0.08] hover:border-white/18 hover:text-white/90" onClick={() => setScreen('settings')}>
                    <span className="relative z-10">Einstellungen</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HANGAR / GARAGE */}
      {screen === 'hangar' && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-y-auto px-3 pb-8 pt-20 sm:items-center sm:pt-24">
          <div className="glass-panel pointer-events-auto w-full max-w-5xl max-h-[min(90vh,920px)] overflow-hidden flex flex-col p-5 sm:p-7">
            <div className="mb-1 flex items-center justify-between gap-3 shrink-0">
              <div className="glass-eyebrow">Garage</div>
              <button type="button" className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs" onClick={() => setScreen('main')}>
                Zuruck
              </button>
            </div>
            <h2 className="glass-title mb-1 text-3xl text-white shrink-0">Flugzeug wahlen</h2>
            <p className="glass-subtitle mb-4 text-sm shrink-0">
              Moderne Jets, Early Jets und WWII-Propeller — jeweils eigene Physik, Waffen und Sound.
            </p>

            <div className="mb-4 flex flex-wrap gap-2 shrink-0">
              {(['nato', 'russia'] as JetFaction[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`glass-pill px-5 py-2 text-xs font-semibold tracking-[0.1em] uppercase transition-all duration-300 ${
                    faction === f
                      ? 'bg-white/[0.14] text-white border-white/30 shadow-[0_0_15px_rgba(0,242,255,0.15)]'
                      : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/75'
                  }`}
                  onClick={() => setFaction(f)}
                >
                  {FACTION_LABELS[f]} ({JET_CATALOG.filter(j => j.faction === f).length})
                </button>
              ))}
            </div>

            <div className="mb-5 overflow-x-auto pb-2 -mx-1 px-1 hide-scrollbar flex gap-3 snap-x snap-mandatory scroll-pl-1">
              {sortedJets
                .filter((j) => j.faction === faction)
                .map((jet) => {
                  const active = jet.id === selectedJetId;
                  const owned = isJetOwned(jet.id);
                  const locked = !owned && jet.price > 0;
                  const canAfford = aeroCredits >= jet.price;
                  const jBars = jetStatBars(jet.stats);
                  return (
                    <div
                      key={jet.id}
                      onClick={() => { if (owned) { onSelectJet(jet.id); } }}
                      className={`glass-card flex-shrink-0 w-[220px] sm:w-[240px] snap-start cursor-pointer text-left relative ${
                        active ? 'is-selected ring-1 ring-cyan-400/50' : ''
                      } ${locked ? 'opacity-70' : ''}`}
                    >
                      <div
                        className={`h-1 -mx-[18px] -mt-[16px] rounded-t-[20px] mb-3 ${
                          jet.faction === 'nato'
                            ? 'bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500'
                            : 'bg-gradient-to-r from-red-400 via-amber-400 to-red-500'
                        }`}
                      />
                      {/* Jet Name + Role */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{jet.faction === 'nato' ? '🛩️' : '✈️'}</span>
                        <div>
                          <div className="text-sm font-bold leading-tight text-white">{jet.name}</div>
                          <div className="text-[10px] text-white/35">{jet.role}</div>
                        </div>
                        {active && (
                          <div className="ml-auto w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,242,255,0.7)] animate-pulse" />
                        )}
                      </div>

                      {/* Neon-Blue Status Bars */}
                      <div className="space-y-2 mb-3">
                        {[['Speed', jBars.speed], ['Wendigkeit', jBars.maneuver], ['Panzerung', jBars.armor]].map(([label, val]) => (
                          <div key={label as string}>
                            <div className="flex justify-between text-[9px] mb-0.5">
                              <span className="text-white/40 uppercase tracking-[0.1em]">{label as string}</span>
                              <span className="font-mono text-white/50">{val as number}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{
                                  width: `${val as number}%`,
                                  background: locked
                                    ? 'linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.2))'
                                    : 'linear-gradient(90deg, #00f2ff, #0a84ff)',
                                  boxShadow: locked ? 'none' : '0 0 8px rgba(0,242,255,0.5)',
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Buy / Select Button */}
                      {locked ? (
                        <button
                          type="button"
                          className={`w-full py-2.5 rounded-xl font-bold text-[11px] tracking-[0.06em] uppercase flex items-center justify-center gap-2 transition-all duration-300 ${
                            canAfford
                              ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/30 text-amber-200 hover:from-amber-500/35 hover:to-yellow-500/35 hover:border-amber-300/50 hover:shadow-[0_0_20px_rgba(255,200,0,0.2)]'
                              : 'bg-white/[0.03] border border-white/[0.06] text-white/25 cursor-not-allowed'
                          }`}
                          disabled={!canAfford}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canAfford) {
                              const ok = onPurchaseJet(jet.id, jet.price);
                              if (ok) onSelectJet(jet.id);
                            }
                          }}
                        >
                          <img
                            src="./aero_credits.jpg"
                            alt="AC"
                            className="w-4 h-4 rounded-full object-cover shadow-[0_0_8px_rgba(255,215,0,0.5)]"
                            style={{ animation: 'coin-spin 4s linear infinite' }}
                          />
                          {jet.price.toLocaleString()} AC
                        </button>
                      ) : owned ? (
                        <button
                          type="button"
                          className={`w-full py-2.5 rounded-xl font-bold text-[11px] tracking-[0.06em] uppercase transition-all duration-300 ${
                            active
                              ? 'bg-gradient-to-r from-cyan-500/40 to-blue-500/40 border border-cyan-400/40 text-white shadow-[0_0_15px_rgba(0,242,255,0.2)]'
                              : 'bg-white/[0.05] border border-white/[0.08] text-white/60 hover:bg-white/[0.12] hover:text-white/90 hover:border-white/15'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectJet(jet.id);
                          }}
                        >
                          {active ? 'Ausgewahlt' : 'Auswahlen'}
                        </button>
                      ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mb-5 grid gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 lg:grid-cols-2 shrink-0">
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="text-xl font-bold text-white">{selected.name}</div>
                  <div
                    className="text-xs tracking-wider uppercase"
                    style={{ color: selected.faction === 'nato' ? '#7dd3fc' : '#fca5a5' }}
                  >
                    {FACTION_LABELS[selected.faction]}
                  </div>
                </div>
                <p className="mt-2 text-sm text-white/65">{selected.description}</p>
                <p className="mt-3 text-xs text-cyan-200/90">
                  <span className="font-semibold text-cyan-300">{selected.special.label}</span>
                  {' — '}
                  {selected.special.detail}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/45 sm:grid-cols-4">
                  <div>
                    HP <span className="glass-mono text-white">{selected.stats.hp}</span>
                  </div>
                  <div>
                    Raketen{' '}
                    <span className="glass-mono text-white">
                      {selected.stats.missiles > 0 ? selected.stats.missiles : '—'}
                    </span>
                  </div>
                  <div>
                    Kanone{' '}
                    <span className="glass-mono text-white">
                      {selected.stats.cannonDamage} · {selected.stats.cannonRPM} rpm
                    </span>
                  </div>
                  <div>
                    {selected.engineType === 'piston' ? (
                      <>
                        Motor <span className="glass-mono text-amber-200">Kolben</span>
                      </>
                    ) : (
                      <>
                        Lock{' '}
                        <span className="glass-mono text-white">
                          {selected.stats.lockRange > 0 ? `${selected.stats.lockRange} m` : '—'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {!selected.physics.hasAfterburner && (
                  <p className="mt-2 text-[11px] text-white/40">
                    Kein Nachbrenner
                    {selected.engineType === 'piston'
                      ? ' · Propeller-Torque & P-Faktor bei Vollgas'
                      : ' · Early-Jet-Schub'}
                    {selected.physics.windSusceptibility > 1
                      ? ' · windempfindlich / Wing Flutter'
                      : ''}
                  </p>
                )}
              </div>
              <div>
                <StatBar label="Geschwindigkeit" value={bars.speed} />
                <StatBar label="Manovrierfahigkeit" value={bars.maneuver} />
                <StatBar label="Panzerung" value={bars.armor} />
                <StatBar label="Bewaffnung" value={bars.weapons} />
              </div>
            </div>

            <button
              type="button"
              className={`w-full py-4 text-base font-bold rounded-2xl transition-all duration-300 shrink-0 ${
                isJetOwned(selectedJetId)
                  ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 border border-cyan-400/30 text-white hover:from-cyan-500/50 hover:to-blue-500/50 hover:border-cyan-300/50 hover:shadow-[0_0_30px_rgba(0,242,255,0.2)] backdrop-blur-xl'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/20 cursor-not-allowed'
              }`}
              disabled={!isJetOwned(selectedJetId)}
              onClick={() => onStart(selectedJetId)}
            >
              {isJetOwned(selectedJetId) ? `JET ABHEBEN · ${selected.callsign}` : 'JET NICHT FREIGESCHALTET'}
            </button>
          </div>
        </div>
      )}

      {/* MAPS */}
      {screen === 'maps' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pt-16">
          <div className="glass-panel pointer-events-auto w-full max-w-3xl p-6 sm:p-8">
            <div className="mb-1 flex items-center justify-between">
              <div className="glass-eyebrow">Operations Area</div>
              <button
                type="button"
                className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs"
                onClick={() => setScreen('main')}
              >
                ← Zurück
              </button>
            </div>
            <h2 className="glass-title mb-1 text-3xl">Map wählen</h2>
            <p className="glass-subtitle mb-4 text-sm">
              Große Einsatzgebiete — prozedural oder 3D-Assets (nur Maps mit großer Fläche).
            </p>

            {mapLoading && (
              <div className="mb-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                Karte wird geladen und skaliert…
              </div>
            )}
            {mapError && (
              <div className="mb-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {mapError}
              </div>
            )}

            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              {MAP_CATALOG.map((m) => {
                const active = m.id === selectedMapId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={mapLoading}
                    onClick={() => void pickMap(m.id)}
                    className={`glass-card text-left ${active ? 'is-selected' : ''}`}
                  >
                    <div className="text-[10px] tracking-[0.18em] text-cyan-300/80 uppercase">
                      {m.subtitle}
                    </div>
                    <div className="mt-1 font-bold leading-tight text-white">{m.name}</div>
                    <div className="mt-1 glass-mono text-xs text-white/45">
                      {(m.worldSizeM / 1000).toFixed(0)} km Welt
                      {m.kind === 'glb' ? ` · ~${(m.targetSpanM / 1000).toFixed(0)} km Asset` : ''}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-cyan-100/90"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-white/50">{m.description}</p>
                    {active && (
                      <div className="mt-2 text-[10px] font-bold tracking-[0.2em] text-cyan-300 uppercase">
                        Aktiv
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
              <div className="text-xs tracking-[0.16em] text-white/45 uppercase">Ausgewählt</div>
              <div className="mt-1 text-lg font-bold text-white">{selectedMap.name}</div>
              <p className="mt-1 text-sm text-white/60">{selectedMap.description}</p>
            </div>

            <button
              type="button"
              className="glass-button glass-button-primary mt-4 w-full py-3.5"
              disabled={mapLoading}
              onClick={() => onStart(selectedJetId)}
            >
              Mit dieser Map abheben
            </button>
          </div>
        </div>
      )}

      {/* MISSIONS */}
      {screen === 'missions' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pt-16">
          <div className="glass-panel pointer-events-auto w-full max-w-2xl p-6 sm:p-8">
            <div className="mb-1 flex items-center justify-between">
              <div className="glass-eyebrow">Einsätze</div>
              <button type="button" className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs" onClick={() => setScreen('main')}>
                ← Zurück
              </button>
            </div>
            <h2 className="glass-title mb-2 text-3xl">Kampagne</h2>
            <p className="glass-subtitle mb-5 text-sm">
              Drei Wellen — Luftüberlegenheit bis SEAD. Lock-On auf Luft- und Bodenziele.
            </p>
            <div className="mb-6 space-y-3">
              {CONFIG.mission.waves.map((w, i) => (
                <div
                  key={w.label}
                  className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3"
                >
                  <div className="text-[11px] tracking-[0.2em] text-cyan-300/80 uppercase">
                    Welle {i + 1}
                  </div>
                  <div className="mt-0.5 font-semibold text-white">{w.label}</div>
                  <div className="mt-1 text-xs text-white/45">
                    {w.bandits} Bandits
                    {w.sams > 0 ? ` · ${w.sams} SAM-Stellungen` : ''}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="glass-button glass-button-primary w-full py-3.5"
              onClick={() => onStart(selectedJetId)}
            >
              Mission starten · {selected.callsign}
            </button>
          </div>
        </div>
      )}

      {/* SETTINGS (from menu) */}
      {screen === 'settings' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pt-16">
          <div className="glass-panel pointer-events-auto w-full max-w-lg p-6 sm:p-8">
            <div className="mb-1 flex items-center justify-between">
              <div className="glass-eyebrow">System</div>
              <button type="button" className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs" onClick={() => setScreen('main')}>
                ← Zurück
              </button>
            </div>
            <h2 className="glass-title mb-4 text-3xl">Einstellungen</h2>
            <SettingsBody />
          </div>
        </div>
      )}

      <ExitModal />
    </div>
  );
}
