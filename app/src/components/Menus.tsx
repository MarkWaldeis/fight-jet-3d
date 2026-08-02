import { useEffect, useState } from 'react';
import type { GameState } from '../game/Game';
import { CONFIG } from '../game/config';
import {
  JET_CATALOG,
  FACTION_LABELS,
  jetsByFaction,
  type JetFaction,
  type JetId,
} from '../game/aircraft/JetCatalog';
import {
  loadSettings,
  saveSettings,
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
  const list = jetsByFaction(faction);
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
      <button
        type="button"
        className={`glass-nav-item ${active === 'main' || (!active && screen === 'main') ? 'is-active' : ''}`}
        onClick={() => setScreen('main')}
      >
        Home
      </button>
      <button
        type="button"
        className={`glass-nav-item ${screen === 'hangar' ? 'is-active' : ''}`}
        onClick={openHangar}
      >
        Garage
      </button>
      <button
        type="button"
        className={`glass-nav-item ${screen === 'maps' ? 'is-active' : ''}`}
        onClick={() => setScreen('maps')}
      >
        Maps
      </button>
      <button
        type="button"
        className={`glass-nav-item ${screen === 'missions' ? 'is-active' : ''}`}
        onClick={() => setScreen('missions')}
      >
        Einsätze
      </button>
      <button
        type="button"
        className={`glass-nav-item ${screen === 'settings' ? 'is-active' : ''}`}
        onClick={() => setScreen('settings')}
      >
        Einstellungen
      </button>
      <button type="button" className="glass-nav-item" onClick={tryExit}>
        Beenden
      </button>
    </nav>
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
                War-Thunder-Style Mouse-Aim. Wähle deinen Jet in der Garage und fliege die
                3-Wellen-Mission.
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

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  className="glass-button glass-button-primary w-full py-3.5 text-base"
                  onClick={() => onStart(selectedJetId)}
                >
                  Abheben mit {selected.callsign}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="glass-button w-full py-3" onClick={openHangar}>
                    Garage
                  </button>
                  <button type="button" className="glass-button w-full py-3" onClick={() => setScreen('maps')}>
                    Maps
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="glass-button glass-button-ghost" onClick={() => setScreen('missions')}>
                    Einsätze
                  </button>
                  <button type="button" className="glass-button glass-button-ghost" onClick={() => setScreen('settings')}>
                    Einstellungen
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
          <div className="glass-panel glass-scroll pointer-events-auto w-full max-w-5xl max-h-[min(90vh,920px)] overflow-y-auto p-5 sm:p-7">
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="glass-eyebrow">Garage</div>
              <button type="button" className="glass-button glass-button-ghost !px-3 !py-1.5 !text-xs" onClick={() => setScreen('main')}>
                ← Zurück
              </button>
            </div>
            <h2 className="glass-title mb-1 text-3xl text-white">Jet wählen</h2>
            <p className="glass-subtitle mb-4 text-sm">
              NATO oder Russland — Stats, Spezial und 3D-Vorschau im Hintergrund.
            </p>

            <div className="mb-4 flex flex-wrap gap-2">
              {(['nato', 'russia'] as JetFaction[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`glass-button !px-4 !py-2 !text-xs ${
                    faction === f ? 'glass-button-primary' : 'glass-button-ghost'
                  }`}
                  onClick={() => setFaction(f)}
                >
                  {FACTION_LABELS[f]}
                  <span className="opacity-70">({jetsByFaction(f).length})</span>
                </button>
              ))}
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((jet) => {
                const active = jet.id === selectedJetId;
                return (
                  <button
                    key={jet.id}
                    type="button"
                    onClick={() => onSelectJet(jet.id)}
                    className={`glass-card text-left ${active ? 'is-selected' : ''}`}
                  >
                    <div
                      className="text-[10px] tracking-[0.18em] uppercase"
                      style={{ color: jet.faction === 'nato' ? '#7dd3fc' : '#fca5a5' }}
                    >
                      {jet.role}
                    </div>
                    <div className="mt-1 font-bold leading-tight text-white">{jet.name}</div>
                    <div className="glass-mono text-xs text-white/45">{jet.callsign}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {jet.traits.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-cyan-100/90"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-white/40">
                      <span>SPD ×{jet.stats.speedMult.toFixed(2)}</span>
                      <span>TRN ×{jet.stats.turnMult.toFixed(2)}</span>
                      <span>HP {jet.stats.hp}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mb-5 grid gap-5 rounded-2xl border border-white/12 bg-white/[0.04] p-4 lg:grid-cols-2">
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
                    Raketen <span className="glass-mono text-white">{selected.stats.missiles}</span>
                  </div>
                  <div>
                    Kanone <span className="glass-mono text-white">{selected.stats.cannonDamage}</span>
                  </div>
                  <div>
                    Lock <span className="glass-mono text-white">{selected.stats.lockRange} m</span>
                  </div>
                </div>
              </div>
              <div>
                <StatBar label="Geschwindigkeit" value={bars.speed} />
                <StatBar label="Manövrierfähigkeit" value={bars.maneuver} />
                <StatBar label="Panzerung" value={bars.armor} />
                <StatBar label="Bewaffnung" value={bars.weapons} />
              </div>
            </div>

            <button
              type="button"
              className="glass-button glass-button-primary w-full py-4 text-base"
              onClick={() => onStart(selectedJetId)}
            >
              Jet auswählen & Abheben
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

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
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
