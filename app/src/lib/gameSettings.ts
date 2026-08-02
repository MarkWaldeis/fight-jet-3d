/** Persistente Spiel-Einstellungen (Liquid Glass Settings Modal) */

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface GameSettings {
  graphicsQuality: GraphicsQuality;
  showHud: boolean;
  masterVolume: number; // 0..1
  muted: boolean;
}

const KEY = 'fightjet3d.settings.v1';

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsQuality: 'high',
  showHud: true,
  masterVolume: 0.85,
  muted: false,
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      masterVolume: Math.max(0, Math.min(1, parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume)),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Stats 0–100 für Glass-Progress-Balken aus Jet-Def */
export function jetStatBars(stats: {
  speedMult: number;
  turnMult: number;
  hp: number;
  missiles: number;
  cannonDamage: number;
  lockRange: number;
}) {
  return {
    speed: Math.round(Math.min(100, ((stats.speedMult - 0.55) / 0.75) * 100)),
    maneuver: Math.round(Math.min(100, ((stats.turnMult - 0.55) / 0.7) * 100)),
    armor: Math.round(Math.min(100, (stats.hp / 160) * 100)),
    weapons: Math.round(
      Math.min(
        100,
        (stats.missiles / 8) * 35 +
          (stats.cannonDamage / 8) * 35 +
          (stats.lockRange / 4200) * 30
      )
    ),
  };
}
