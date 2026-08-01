import type { HudData } from '../game/Game';
import { CONFIG } from '../game/config';

// Avionik-HUD im F-16-Stil: grüne Symbologie auf transparentem Glas.
export function Hud({ data }: { data: HudData }) {
  const hudColor = '#4dff6a';
  const warnColor = '#ff4444';
  const lockPct = Math.round(data.lockProgress * 100);

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-mono" style={{ color: hudColor, textShadow: `0 0 6px ${hudColor}66` }}>
      {/* Fadenkreuz / Boresight */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="26" fill="none" stroke={hudColor} strokeWidth="1.5" opacity="0.9" />
          <line x1="60" y1="20" x2="60" y2="34" stroke={hudColor} strokeWidth="1.5" />
          <line x1="60" y1="86" x2="60" y2="100" stroke={hudColor} strokeWidth="1.5" />
          <line x1="20" y1="60" x2="34" y2="60" stroke={hudColor} strokeWidth="1.5" />
          <line x1="86" y1="60" x2="100" y2="60" stroke={hudColor} strokeWidth="1.5" />
          <circle cx="60" cy="60" r="2.5" fill={hudColor} />
        </svg>
      </div>

      {/* Lock-On-Raute (wandert zum Ziel) */}
      {data.lockProgress > 0 && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{
          left: data.lockScreen ? `${data.lockScreen.x}%` : '50%',
          top: data.lockScreen ? `${data.lockScreen.y}%` : '50%',
          transform: `translate(-50%, -50%) scale(${1.6 - data.lockProgress * 0.6})`,
        }}>
          <svg width="150" height="150" viewBox="0 0 150 150">
            <rect x="45" y="45" width="60" height="60" fill="none"
              stroke={data.lockProgress >= 1 ? warnColor : hudColor} strokeWidth="2"
              transform="rotate(45 75 75)" />
          </svg>
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-sm font-bold whitespace-nowrap"
            style={{ color: data.lockProgress >= 1 ? warnColor : hudColor }}>
            {data.lockProgress >= 1 ? `◆ LOCK — ${data.lockedTargetName}` : `LOCKING ${lockPct}%`}
          </div>
        </div>
      )}

      {/* Speed (links) */}
      <div className="absolute left-[6%] top-1/2 -translate-y-1/2 text-center">
        <div className="text-xs opacity-70">KNOTS</div>
        <div className="text-4xl font-bold">{data.speedKnots}</div>
        <div className="mt-2 text-xs opacity-70">MACH {(data.speedKnots / 661.7).toFixed(2)}</div>
        <div className="mt-3 text-xs opacity-70">THR</div>
        <div className="mx-auto h-24 w-2 border border-current opacity-80">
          <div className="w-full bg-current transition-all" style={{ height: `${data.throttle * 100}%`, marginTop: `${(1 - data.throttle) * 96}px` }} />
        </div>
        {data.afterburner && <div className="mt-1 text-xs font-bold" style={{ color: '#ffaa33' }}>AB</div>}
      </div>

      {/* Altitude + Heading (rechts) */}
      <div className="absolute right-[6%] top-1/2 -translate-y-1/2 text-center">
        <div className="text-xs opacity-70">ALT FT</div>
        <div className="text-4xl font-bold">{data.altitudeFt.toLocaleString()}</div>
        <div className="mt-2 text-xs opacity-70">HDG</div>
        <div className="text-2xl font-bold">{String(data.headingDeg).padStart(3, '0')}°</div>
        <div className="mt-3 text-xs opacity-70">G</div>
        <div className="text-xl font-bold" style={{ color: data.gForce > 6 ? warnColor : hudColor }}>
          {data.gForce.toFixed(1)}
        </div>
      </div>

      {/* Heading-Tape (oben) */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="text-lg font-bold tracking-[0.4em]">{String(data.headingDeg).padStart(3, '0')}</div>
        <div className="text-xs opacity-60">— N — E — S — W —</div>
      </div>

      {/* Missions-Anzeige (oben links) */}
      <div className="absolute left-6 top-6">
        <div className="text-xs opacity-70">MISSION</div>
        <div className="text-lg font-bold">WELLE {Math.min(data.waveIndex + 1, data.waveCount)}/{data.waveCount}</div>
        <div className="text-sm">BANDITS: {data.enemiesAlive}{data.samsLeft > 0 ? ` · SAM: ${data.samsLeft}` : ''}</div>
      </div>

      {/* Wellen-Banner */}
      {data.waveBanner && (
        <div className="absolute left-1/2 top-[22%] -translate-x-1/2 text-center">
          <div className="text-3xl font-black tracking-widest animate-pulse" style={{ textShadow: `0 0 16px ${hudColor}` }}>
            {data.waveBanner}
          </div>
        </div>
      )}

      {/* Free-Look Hinweis */}
      {data.freeLook && (
        <div className="absolute left-1/2 top-[18%] -translate-x-1/2 text-center">
          <div className="text-sm font-bold tracking-[0.35em] opacity-90">FREE LOOK</div>
          <div className="mt-1 text-xs opacity-60">Maus / Pfeile · V zum Beenden · Jet fliegt weiter</div>
        </div>
      )}

      {/* Warnung */}
      {data.warning && (
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 animate-pulse text-3xl font-black tracking-widest" style={{ color: warnColor, textShadow: '0 0 12px #ff444488' }}>
          ⚠ {data.warning}
        </div>
      )}

      {/* Radar (links unten) */}
      <div className="absolute bottom-6 left-6">
        <svg width={CONFIG.hud.radarSize} height={CONFIG.hud.radarSize} viewBox="-100 -100 200 200">
          <circle cx="0" cy="0" r="98" fill="rgba(0,20,8,0.55)" stroke={hudColor} strokeWidth="1.5" />
          <circle cx="0" cy="0" r="60" fill="none" stroke={hudColor} strokeWidth="0.5" opacity="0.4" />
          <circle cx="0" cy="0" r="30" fill="none" stroke={hudColor} strokeWidth="0.5" opacity="0.4" />
          <line x1="-98" y1="0" x2="98" y2="0" stroke={hudColor} strokeWidth="0.5" opacity="0.4" />
          <line x1="0" y1="-98" x2="0" y2="98" stroke={hudColor} strokeWidth="0.5" opacity="0.4" />
          {/* eigener Jet */}
          <polygon points="0,-6 4,5 -4,5" fill={hudColor} />
          {data.radar.map((r, i) => (
            <g key={i}>
              {r.locked
                ? <rect x={r.x * 90 - 4} y={r.y * 90 - 4} width="8" height="8" fill="none" stroke={warnColor} strokeWidth="1.5" transform={`rotate(45 ${r.x * 90} ${r.y * 90})`} />
                : r.isEnemy
                  ? <circle cx={r.x * 90} cy={r.y * 90} r="3.5" fill={warnColor} />
                  : <rect x={r.x * 90 - 3} y={r.y * 90 - 3} width="6" height="6" fill="#ffaa33" />}
            </g>
          ))}
        </svg>
        <div className="mt-1 text-center text-xs opacity-70">TWS {CONFIG.hud.radarRange / 1000}km</div>
      </div>

      {/* Status (rechts unten) */}
      <div className="absolute bottom-6 right-6 text-right">
        <div className="text-xs opacity-70">SCORE</div>
        <div className="text-3xl font-bold">{data.score}</div>
        <div className="mt-2 text-sm">AIM-9 × {data.missiles}</div>
        <div className="text-sm">BANDITS: {data.enemiesAlive}</div>
        <div className="mt-2 text-xs opacity-70">HULL</div>
        <div className="ml-auto h-2 w-32 border border-current">
          <div className="h-full transition-all" style={{
            width: `${(data.hp / data.maxHp) * 100}%`,
            background: data.hp > 50 ? hudColor : data.hp > 25 ? '#ffaa33' : warnColor,
          }} />
        </div>
      </div>
    </div>
  );
}
