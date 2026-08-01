import { useState } from 'react';
import type { GameState } from '../game/Game';
import { JET_CATALOG, type JetId } from '../game/aircraft/JetCatalog';

const key = (k: string, label: string) => (
  <div key={k} className="flex items-center gap-3">
    <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 font-mono text-emerald-300">{k}</span>
    <span className="text-slate-300">{label}</span>
  </div>
);

export function Menus({
  state,
  score,
  selectedJetId,
  onSelectJet,
  onStart,
  onResume,
  onMenu,
}: {
  state: GameState;
  score: number;
  selectedJetId: JetId;
  onSelectJet: (id: JetId) => void;
  onStart: (jetId: JetId) => void;
  onResume: () => void;
  onMenu: () => void;
}) {
  const [screen, setScreen] = useState<'main' | 'hangar'>('main');
  const selected = JET_CATALOG.find((j) => j.id === selectedJetId) ?? JET_CATALOG[0];

  if (state === 'playing') return null;

  const showHangar = state === 'menu' && screen === 'hangar';

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-b from-slate-950/70 via-slate-900/60 to-slate-950/80 backdrop-blur-[2px]">
      <div className={`mx-4 rounded-2xl border border-emerald-400/20 bg-slate-950/85 p-6 shadow-[0_0_60px_rgba(16,185,129,0.15)] ${showHangar ? 'max-w-3xl w-full' : 'max-w-xl'}`}>
        {state === 'menu' && !showHangar && (
          <>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.5em] text-emerald-400">Air Combat Simulator</div>
            <h1 className="mb-2 bg-gradient-to-r from-emerald-300 via-white to-sky-300 bg-clip-text text-5xl font-black tracking-tight text-transparent">
              FIGHT JET 3D
            </h1>
            <p className="mb-4 text-slate-400">
              Wähle deinen Jet im Hangar, jage Bandits und erfülle die 3-Wellen-Mission inkl. SEAD.
            </p>

            <div className="mb-5 rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-emerald-400/80">Ausgewählt</div>
              <div className="text-lg font-bold text-white">{selected.name}</div>
              <div className="text-sm text-slate-400">{selected.callsign} · {selected.role}</div>
              <div className="mt-1 text-xs text-emerald-300/90">{selected.special.label}: {selected.special.detail}</div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {key('W/S', 'Pitch')}
              {key('A/D', 'Rollen')}
              {key('Shift/Ctrl', 'Schub')}
              {key('Tab', 'Nachbrenner')}
              {key('Leertaste', 'Kanone')}
              {key('F / M', 'Rakete')}
              {key('C', 'Cockpit')}
              {key('V', 'Free-Look')}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setScreen('hangar')}
                className="w-full rounded-lg border border-emerald-400/40 bg-slate-900 py-3 text-lg font-bold uppercase tracking-widest text-emerald-300 transition hover:bg-emerald-500/10"
              >
                ✈ Hangar — Jet wählen
              </button>
              <button
                onClick={() => onStart(selectedJetId)}
                className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(52,211,153,0.5)]"
              >
                ▶ Take Off mit {selected.callsign}
              </button>
            </div>
          </>
        )}

        {showHangar && (
          <>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-[0.4em] text-emerald-400">Hangar</div>
              <button
                onClick={() => setScreen('main')}
                className="text-sm text-slate-400 hover:text-white"
              >
                ← Zurück
              </button>
            </div>
            <h2 className="mb-1 text-3xl font-black text-white">Jet wählen</h2>
            <p className="mb-5 text-sm text-slate-400">Kamera & Fadenkreuz sind bei allen Jets gleich (Chase von hinten/oben, Boresight).</p>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              {JET_CATALOG.map((jet) => {
                const active = jet.id === selectedJetId;
                return (
                  <button
                    key={jet.id}
                    onClick={() => onSelectJet(jet.id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      active
                        ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_24px_rgba(16,185,129,0.2)]'
                        : 'border-slate-700 bg-slate-900/60 hover:border-emerald-400/40'
                    }`}
                  >
                    <div className="text-xs uppercase tracking-wider text-emerald-400/80">{jet.role}</div>
                    <div className="mt-1 font-bold text-white leading-tight">{jet.name}</div>
                    <div className="text-xs font-mono text-slate-400">{jet.callsign}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {jet.traits.map((t) => (
                        <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-emerald-200/90">
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mb-5 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
              <div className="text-lg font-bold text-emerald-300">{selected.name}</div>
              <p className="mt-1 text-sm text-slate-300">{selected.description}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
                <div><span className="text-slate-500">HP</span> <span className="font-mono text-white">{selected.stats.hp}</span></div>
                <div><span className="text-slate-500">Speed</span> <span className="font-mono text-white">×{selected.stats.speedMult.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Turn</span> <span className="font-mono text-white">×{selected.stats.turnMult.toFixed(2)}</span></div>
                <div><span className="text-slate-500">Raketen</span> <span className="font-mono text-white">{selected.stats.missiles}</span></div>
                <div><span className="text-slate-500">Kanone</span> <span className="font-mono text-white">{selected.stats.cannonDamage} dmg</span></div>
                <div><span className="text-slate-500">RPM</span> <span className="font-mono text-white">{selected.stats.cannonRPM}</span></div>
                <div><span className="text-slate-500">Lock</span> <span className="font-mono text-white">{selected.stats.lockRange} m</span></div>
                <div><span className="text-slate-500">Spezial</span> <span className="font-mono text-emerald-300">{selected.special.label}</span></div>
              </div>
              <p className="mt-2 text-xs text-emerald-200/80">{selected.special.detail}</p>
            </div>

            <button
              onClick={() => onStart(selectedJetId)}
              className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(52,211,153,0.5)]"
            >
              ▶ Start mit {selected.callsign}
            </button>
          </>
        )}

        {state === 'paused' && (
          <>
            <h2 className="mb-4 text-4xl font-black text-emerald-300">PAUSE</h2>
            <p className="mb-2 text-slate-400">Jet: <span className="text-white">{selected.name}</span></p>
            <p className="mb-6 text-slate-400">Score: <span className="font-mono text-white">{score}</span></p>
            <button onClick={onResume}
              className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400">
              Weiterfliegen (P)
            </button>
          </>
        )}

        {state === 'gameover' && (
          <>
            <h2 className="mb-2 text-4xl font-black text-red-400">SHOT DOWN</h2>
            <p className="mb-1 text-slate-400">{selected.callsign} ist abgestürzt.</p>
            <p className="mb-6 text-2xl font-bold text-white">Final Score: <span className="font-mono text-emerald-300">{score}</span></p>
            <div className="flex flex-col gap-2">
              <button onClick={() => onStart(selectedJetId)}
                className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400">
                ↻ Erneut fliegen (Enter)
              </button>
              <button onClick={() => { onMenu(); setScreen('hangar'); }}
                className="w-full rounded-lg border border-slate-600 py-2 text-sm text-slate-300 hover:border-emerald-400/50">
                Hangar öffnen
              </button>
            </div>
          </>
        )}

        {state === 'victory' && (
          <>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.5em] text-emerald-400">Alle Wellen abgeschlossen</div>
            <h2 className="mb-2 bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-4xl font-black text-transparent">
              MISSION ERFÜLLT
            </h2>
            <p className="mb-1 text-slate-400">Der Himmel gehört {selected.callsign}.</p>
            <p className="mb-6 text-2xl font-bold text-white">Final Score: <span className="font-mono text-emerald-300">{score}</span></p>
            <button onClick={() => onStart(selectedJetId)}
              className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400">
              ↻ Neue Mission (Enter)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
