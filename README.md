# 🛩️ Fight Jet 3D

Browserbasiertes 3D-Kampfjet-Spiel: F-16 „Viper" fliegen, Dogfights gegen KI-Bandits,
Bordkanone + AIM-9-Sidewinder mit Lock-On, Nachbrenner, Avionik-HUD.

**Live spielen:** https://markwaldeis.github.io/fight-jet-3d/

## Steuerung

| Taste | Aktion |
|---|---|
| W / S (oder Pfeile) | Pitch — Nase hoch / runter |
| A / D | Rollen |
| Q / E | Gieren |
| Shift / Strg | Schub hoch / runter |
| Tab (oder Vollschub) | Nachbrenner |
| Leertaste | Bordkanone (M61 Vulcan) |
| F oder M | AIM-9-Rakete abfeuern (nach Lock-On) |
| C | Cockpit- / Verfolgerkamera |
| P / Esc | Pause |
| Enter | Start / Neustart |

**Lock-On:** Feind im Fadenkreuz-Kegel halten, bis „LOCK" erscheint (Dauerton), dann F drücken.

## Entwicklung

```bash
cd app
npm install
npm run dev      # http://localhost:3000
npm run build    # Produktions-Build → app/dist
```

## Tech

- **Three.js** (WebGL) — 3D-Engine, Jets aus Primitiven (keine externen Assets)
- **Vite + React + TypeScript** — React rendert HUD/Menüs, Three.js die Welt
- Prozedurales Terrain (FBM-Heightmap), animiertes Meer, Wolken, Himmels-Shader
- Arcade-Flugmodell (Quaternion-Rotation, Stall, Speed-FOV)
- KI-Gegner mit Zustandsautomat (Patrouille / Verfolgung / Angriff / Ausweichen)
- Prozedurales WebAudio (Triebwerk, Lock-On, Kanone, Explosionen)
- Deployment: GitHub Actions → GitHub Pages

Siehe [GAME_PLAN.md](../GAME_PLAN.md) für Architektur & Roadmap.
