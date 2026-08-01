# 🛩️ Fight Jet 3D

Browserbasiertes 3D-Kampfjet-Spiel: F-16 „Viper" im USAF-Look fliegen, 3-Wellen-Mission
mit KI-Bandits und SEAD gegen SAM-Stellungen, Bordkanone + AIM-9 mit Lock-On,
Nachbrenner, Cockpit-Interior und Avionik-HUD.

**Live spielen:** https://markwaldeis.github.io/fight-jet-3d/

## Mission (V2)

| Welle | Inhalt |
|---|---|
| 1 | Luftüberlegenheit — 3 Bandits |
| 2 | Banditen-Schwarm — 5 Bandits |
| 3 | SEAD — 4 Bandits + 4 SAM-Stellungen |

Lock-On funktioniert auf Luft- **und** Bodenziele. Sieg = alle Wellen geschafft.

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

- **Three.js** (WebGL) — detailliertes F-16 aus Primitiven + Canvas-Texturen (Roundels, Panels, MFDs)
- **Vite + React + TypeScript** — React rendert HUD/Menüs, Three.js die Welt
- Prozedurales Terrain (FBM-Heightmap), animiertes Meer, Wolken, Himmels-Shader
- Arcade-Flugmodell (Quaternion-Rotation, Stall, Speed-FOV)
- KI-Gegner mit Zustandsautomat (Patrouille / Verfolgung / Angriff / Ausweichen)
- Missionsmodus: Wellen, SAM-Sites mit Radar + Gegenfeuer
- Prozedurales WebAudio (Triebwerk, Lock-On, Kanone, Explosionen)
- Deployment: GitHub Actions → GitHub Pages

Siehe [GAME_PLAN.md](GAME_PLAN.md) für Architektur & Roadmap.
