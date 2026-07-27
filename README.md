# TravelMap

Eine kleine, private Progressive Web App, um Reisen und Check-ins festzuhalten und als
3D-Globus mit Routen (Hub = Homebase) darzustellen. Mit Statistik, Monats-/Jahresrückblick,
teilbarem Bild, Stempelpass und optionalem Drehteam-Tagebuch.

- **Offline-fähig** (Service Worker), Daten liegen zu 100 % lokal im Browser (IndexedDB).
- Keine Server, keine Cloud, kein Tracking.
- Reine statische Seite — läuft über GitHub Pages.

## Nutzung

Seite am iPhone öffnen und über *Teilen → Zum Home-Bildschirm* installieren.
Check-in per GPS oder Ortssuche (auch rückwirkend mit Zeitraum). Daten lassen sich
über das Menü als JSON exportieren/importieren.

## Technik

Vanilla JS, [globe.gl](https://github.com/vasturiano/globe.gl) für den Globus,
OpenStreetMap Nominatim fürs Geocoding. Kein Build-Step.
