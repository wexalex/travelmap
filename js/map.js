/* 2D-Detailkarte (MapLibre GL + OpenFreeMap dark) — zoombar bis Ortsebene. */
window.TM = window.TM || {};

TM.MapView = class {
  constructor(el) {
    this.el = el;
    const css = getComputedStyle(document.documentElement);
    this.BIZ = (css.getPropertyValue('--biz').trim() || '#7ea6c9');
    this.PRIV = (css.getPropertyValue('--priv').trim() || '#d8dce3');
    this.ready = false;
    this._pending = null;
    this._onPoint = null;
    this._withLabels = true;  // eigene Ortslabels (Vektor-Style hat Glyphen)
    this._fellBack = false;

    this.map = new maplibregl.Map({
      container: el,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [12, 48],       // Europa
      zoom: 3.4,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    // Layer initialisieren, sobald der Style geladen ist (nicht auf 'load' warten —
    // das feuert erst, wenn alle Kacheln fertig sind, was bei langsamem Netz hängen kann).
    // Robust: bei jedem styledata versuchen zu initialisieren; solange der Style
    // noch nicht bereit ist, wirft addSource und wir versuchen es beim nächsten Event.
    const tryInit = () => {
      if (this.ready) return;
      try { this._initLayers(this._withLabels); } catch (e) { return; }
      this.ready = true;
      clearTimeout(this._fbTimer);
      if (this._pending) { this.setData(this._pending[0], this._pending[1]); this._pending = null; }
    };
    this.map.on('load', tryInit);
    this.map.on('styledata', tryInit);
    // Falls OpenFreeMap nicht lädt (Ausfall/Überlast) -> auf CARTO dark umschalten.
    this.map.on('error', () => { if (!this.ready) this._fallback(); });
    this._fbTimer = setTimeout(() => { if (!this.ready) this._fallback(); }, 7000);
  }

  _fallback() {
    if (this._fellBack) return;
    this._fellBack = true;
    this._withLabels = false; // Raster-Kacheln haben Beschriftung schon eingebrannt
    this.ready = false;
    this.map.setStyle({
      version: 8,
      sources: {
        carto: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap, © CARTO',
        },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0b0d10' } },
        { id: 'carto', type: 'raster', source: 'carto' },
      ],
    });
  }

  _fc(features) { return { type: 'FeatureCollection', features }; }

  // Großkreis-Interpolation, damit Strecken schön gebogen sind (wie am Globus).
  _gc(a, b, n) {
    const R = Math.PI / 180, D = 180 / Math.PI;
    const la1 = a[1] * R, lo1 = a[0] * R, la2 = b[1] * R, lo2 = b[0] * R;
    const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
    if (!isFinite(d) || d === 0) return [a, b];
    const out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      const z = A * Math.sin(la1) + B * Math.sin(la2);
      out.push([Math.atan2(y, x) * D, Math.atan2(z, Math.sqrt(x * x + y * y)) * D]);
    }
    return out;
  }

  _pointsFC(points) {
    return this._fc(points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { key: p.key || '', label: p.label || '', count: p.count || 0, isHome: !!p.isHome, dom: (p.private > p.business) ? 'private' : 'business' },
    })));
  }
  _legsFC(legs) {
    return this._fc(legs.map((l) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: this._gc([l.startLng, l.startLat], [l.endLng, l.endLat], 48) },
      properties: { category: l.category || 'business', kind: l.kind || 'spoke', mode: l.mode || 'car' },
    })));
  }

  _initLayers(withLabels) {
    const m = this.map, BIZ = this.BIZ, PRIV = this.PRIV;
    if (m.getSource('tm-routes')) return; // schon initialisiert
    const catColor = ['case', ['==', ['get', 'category'], 'private'], PRIV, BIZ];
    m.addSource('tm-routes', { type: 'geojson', data: this._fc([]) });
    m.addSource('tm-points', { type: 'geojson', data: this._fc([]) });

    m.addLayer({ id: 'tm-routes-glow', type: 'line', source: 'tm-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': catColor, 'line-width': 6, 'line-blur': 6, 'line-opacity': 0.3 } });
    // Auto = durchgezogen, Flug = gestrichelt
    m.addLayer({ id: 'tm-routes-car', type: 'line', source: 'tm-routes', filter: ['!=', ['get', 'mode'], 'flight'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': catColor, 'line-width': 1.8, 'line-opacity': 0.95 } });
    m.addLayer({ id: 'tm-routes-flight', type: 'line', source: 'tm-routes', filter: ['==', ['get', 'mode'], 'flight'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': catColor, 'line-width': 1.6, 'line-opacity': 0.95, 'line-dasharray': [1.6, 1.6] } });

    m.addLayer({
      id: 'tm-points-circle', type: 'circle', source: 'tm-points',
      paint: {
        'circle-radius': ['case', ['get', 'isHome'], 8, ['interpolate', ['linear'], ['get', 'count'], 1, 4, 20, 11]],
        'circle-color': ['case', ['get', 'isHome'], '#ffffff', ['==', ['get', 'dom'], 'private'], PRIV, BIZ],
        'circle-stroke-width': 1.2, 'circle-stroke-color': 'rgba(8,10,14,0.7)',
      },
    });
    if (withLabels !== false) {
      m.addLayer({
        id: 'tm-points-label', type: 'symbol', source: 'tm-points',
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true, 'text-allow-overlap': false },
        paint: { 'text-color': '#eceef2', 'text-halo-color': 'rgba(8,10,14,0.9)', 'text-halo-width': 1.3 },
      });
    }
    // Pin antippen -> Detail
    m.on('click', 'tm-points-circle', (e) => {
      const f = e.features && e.features[0];
      if (f && !f.properties.isHome && this._onPoint) this._onPoint(f.properties);
    });
    m.on('mouseenter', 'tm-points-circle', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'tm-points-circle', () => { m.getCanvas().style.cursor = ''; });
  }

  onPoint(fn) { this._onPoint = fn; }

  setData(points, legs) {
    if (!this.ready) { this._pending = [points, legs]; return; }
    this.map.getSource('tm-points').setData(this._pointsFC(points));
    this.map.getSource('tm-routes').setData(this._legsFC(legs));
  }

  focus(lat, lon) {
    if (!this.map) return;
    this.map.flyTo({ center: [lon, lat], zoom: 7, duration: 900 });
  }

  resize() { if (this.map) this.map.resize(); }
};
