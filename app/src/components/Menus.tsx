import type { GameState } from '../game/Game';

const key = (k: string, label: string) => (
  <div key={k} className="flex items-center gap-3">
    <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 font-mono text-emerald-300">{k}</span>
    <span className="text-slate-300">{label}</span>
  </div>
);

export function Menus({ state, score, onStart, onResume }: {
  state: GameState;
  score: number;
  onStart: () => void;
  onResume: () => void;
}) {
  if (state === 'playing') return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-b from-slate-950/70 via-slate-900/60 to-slate-950/80 backdrop-blur-[2px]">
      <div className="mx-4 max-w-xl rounded-2xl border border-emerald-400/20 bg-slate-950/80 p-8 shadow-[0_0_60px_rgba(16,185,129,0.15)]">
        {state === 'menu' && (
          <>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.5em] text-emerald-400">Air Combat Simulator</div>
            <h1 className="mb-2 bg-gradient-to-r from-emerald-300 via-white to-sky-300 bg-clip-text text-5xl font-black tracking-tight text-transparent">
              FIGHT JET 3D
            </h1>
            <p className="mb-6 text-slate-400">
              Steig in deine F-16 „Viper", jage feindliche Bandits über den Bergen
              und erfülle die 3-Wellen-Mission inkl. SEAD gegen SAM-Stellungen —
              Bordkanone, AIM-9 Sidewinder, Nachbrenner, Cockpit-View.
            </p>
            <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {key('W/S', 'Pitch (Nase hoch/runter)')}
              {key('A/D', 'Rollen')}
              {key('Q/E', 'Gieren')}
              {key('Shift/Ctrl', 'Schub hoch/runter')}
              {key('Tab', 'Nachbrenner')}
              {key('Leertaste', 'Bordkanone')}
              {key('F / M', 'Rakete (nach Lock)')}
              {key('C', 'Cockpit-/Chase-Kamera')}
              {key('V', 'Free-Look (Orbit, Jet fliegt weiter)')}
              {key('P / Esc', 'Pause')}
              {key('Enter', 'Start')}
            </div>
            <button onClick={onStart}
              className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(52,211,153,0.5)]">
              ▶ Take Off
            </button>
          </>
        )}

        {state === 'paused' && (
          <>
            <h2 className="mb-4 text-4xl font-black text-emerald-300">PAUSE</h2>
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
            <p className="mb-1 text-slate-400">Deine Viper ist abgestürzt.</p>
            <p className="mb-6 text-2xl font-bold text-white">Final Score: <span className="font-mono text-emerald-300">{score}</span></p>
            <button onClick={onStart}
              className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400">
              ↻ Erneut fliegen (Enter)
            </button>
          </>
        )}

        {state === 'victory' && (
          <>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.5em] text-emerald-400">Alle Wellen abgeschlossen</div>
            <h2 className="mb-2 bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-4xl font-black text-transparent">
              MISSION ERFÜLLT
            </h2>
            <p className="mb-1 text-slate-400">Der Himmel gehört dir, Viper 01.</p>
            <p className="mb-6 text-2xl font-bold text-white">Final Score: <span className="font-mono text-emerald-300">{score}</span></p>
            <button onClick={onStart}
              className="w-full rounded-lg bg-emerald-500 py-3 text-lg font-black uppercase tracking-widest text-slate-950 transition hover:bg-emerald-400">
              ↻ Neue Mission (Enter)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
