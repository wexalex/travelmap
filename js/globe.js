/* 3D-Globus mit Routen (globe.gl) — dunkel, monochrom + dezenter Akzent. */
window.TM = window.TM || {};
TM.GlobeView = class {
  constructor(el) {
    this.el = el;
    this._onPoint = null;
    const css = getComputedStyle(document.documentElement);
    const biz = (css.getPropertyValue('--biz').trim() || '#7ea6c9');
    const priv = (css.getPropertyValue('--priv').trim() || '#d8dce3');
    this.colorPair = (cat) => (cat === 'private' ? [priv, priv] : [biz, biz]);
    this.dotColor = (p) => (p.private > p.business ? priv : biz);

    // Zoom-Skalierung: Punkte/Bögen/Ringe behalten beim Zoomen ~konstante Bildschirmgröße
    // (sonst werden sie beim Reinzoomen zu riesigen Blobs).
    this._k = 1;
    this._pr = (d) => (d.isHome ? 0.5 : 0.2 + Math.min(d.count, 12) * 0.03) * this._k;
    this._as = (d) => (0.28 + Math.min(d.count, 8) * 0.1) * this._k;
    // Bogenhöhe skaliert mit dem Zoom: nah flach (schießt nicht ins Leere), weit gewölbt.
    this._aa = (d) => (d.mode === 'flight' ? Math.max(0.006, Math.min(0.28, 0.18 * this._k)) : 0.004);

    this.g = new Globe(el, { rendererConfig: { antialias: true, alpha: true, preserveDrawingBuffer: true } })
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl('assets/earth-dark-hi.jpg')
      .bumpImageUrl('assets/earth-topology.png')
      .showAtmosphere(true)
      .atmosphereColor('#43607f')
      .atmosphereAltitude(0.15)
      .pointsData([]).pointLat('lat').pointLng('lon')
      .pointAltitude((d) => (d.isHome ? 0.02 : 0.012))
      .pointRadius(this._pr)
      .pointColor((d) => (d.isHome ? '#ffffff' : this.dotColor(d)))
      .pointLabel(() => '')
      .onPointClick((d) => { if (this._onPoint && d && !d.isHome) this._onPoint(d); })
      .arcsData([]).arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng')
      .arcColor((d) => this.colorPair(d.category))
      .arcStroke(this._as)
      // Flug = hoher Bogen (mit fließenden Strichen), Auto = flache Bodenlinie (durchgezogen)
      .arcAltitude(this._aa)
      .arcDashLength((d) => (d.mode === 'flight' ? 0.45 : 1))
      .arcDashGap((d) => (d.mode === 'flight' ? 0.22 : 0))
      .arcDashInitialGap(() => Math.random())
      .arcDashAnimateTime((d) => (d.mode === 'flight' ? 2600 : 0))
      .arcsTransitionDuration(0)
      .pointsTransitionDuration(0)
      .ringsData([]).ringLat('lat').ringLng('lon')
      .ringColor(() => (t) => `rgba(126,166,201,${1 - t})`)
      .ringMaxRadius(3.2).ringPropagationSpeed(1.6).ringRepeatPeriod(1400)
      // Labels als HTML (gestochen scharf bei jedem Zoom, statt unscharfer Bitmap-Sprites)
      .htmlElementsData([]).htmlLat('lat').htmlLng('lon').htmlAltitude(0.02)
      .htmlElement((d) => {
        const w = document.createElement('div');
        w.className = 'glabel-wrap';
        const s = document.createElement('span');
        s.className = 'glabel-text' + (d.isHome ? ' home' : '');
        s.textContent = d.isHome ? '🏠 ' + d.label : d.label;
        s.dataset.prio = d._prio != null ? d._prio : 99; // für Entzerrung
        w.appendChild(s);
        return w;
      });

    const c = this.g.controls();
    c.autoRotate = true; c.autoRotateSpeed = 0.42; c.enableZoom = true;
    c.minDistance = 101;   // sehr nah heranzoombar (Globusradius = 100)
    c.maxDistance = 700;   // nicht ins Leere zoomen
    el.addEventListener('pointerdown', () => { c.autoRotate = false; });
    c.addEventListener('change', () => this._scheduleScale()); // beim Zoomen Größen anpassen

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.g.pointOfView({ lat: 48, lng: 12, altitude: 1.8 }, 0); // Europa-Fokus
    this._startDeclutter();
  }

  onPoint(fn) { this._onPoint = fn; }

  // Automatische Entzerrung: überlappende Labels ausblenden (niedrigere Priorität weicht).
  _startDeclutter() {
    let last = 0;
    const loop = (ts) => {
      if (ts - last > 90) { last = ts; try { this._declutter(); } catch (e) { /* ignore */ } }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  // Punkte/Bögen/Ringe an den Zoom anpassen (konstante Bildschirmgröße), damit sie
  // beim Reinzoomen nicht zu Blobs werden. Erst wenn der Zoom sich beruhigt (debounced),
  // sonst ständiges Neu-Aufbauen der Geometrie.
  _scheduleScale() { clearTimeout(this._scaleTimer); this._scaleTimer = setTimeout(() => this._applyScale(), 140); }
  _applyScale() {
    if (!this.el) return;
    const pov = this.g.pointOfView();
    const alt = (pov && pov.altitude) ? pov.altitude : 1.8;
    const k = Math.max(0.012, Math.min(2.0, alt / 1.7));
    if (this._k && Math.abs(k - this._k) / this._k < 0.05) return; // kaum Änderung -> kein Rebuild
    this._k = k;
    this.g.pointRadius((d) => this._pr(d)).arcStroke((d) => this._as(d)).arcAltitude((d) => this._aa(d)).ringMaxRadius(Math.max(0.15, 2.6 * k));
    // Rebuild erzwingen (nur so greift die neue Größe auf bestehende Geometrie)
    this.g.pointsData(this.g.pointsData());
    this.g.arcsData(this.g.arcsData());
  }
  _declutter() {
    if (!this.el || this.el.offsetParent === null) return; // Globus nicht sichtbar
    const texts = [...this.el.querySelectorAll('.glabel-text')];
    if (!texts.length) return;
    const gr = this.el.getBoundingClientRect();
    const active = [];
    for (const t of texts) {
      const wrap = t.parentElement;
      const op = wrap ? parseFloat(getComputedStyle(wrap).opacity || '1') : 1;
      const r = t.getBoundingClientRect();
      const onScreen = r.width && r.right > gr.left && r.left < gr.right && r.bottom > gr.top && r.top < gr.bottom;
      if (op >= 0.2 && onScreen) active.push({ t, r, prio: +(t.dataset.prio || 99) });
    }
    active.sort((a, b) => a.prio - b.prio);
    const kept = [], pad = 3, hide = new Set();
    for (const it of active) {
      const clash = kept.some((k) => it.r.left < k.right + pad && it.r.right > k.left - pad && it.r.top < k.bottom + pad && it.r.bottom > k.top - pad);
      if (clash) hide.add(it.t); else kept.push(it.r);
    }
    for (const it of active) {
      const should = hide.has(it.t);
      if (should !== it.t.classList.contains('label-hidden')) it.t.classList.toggle('label-hidden', should);
    }
  }

  resize() {
    this.g.width(this.el.clientWidth || window.innerWidth);
    this.g.height(this.el.clientHeight || window.innerHeight);
  }

  setData(points, legs) {
    const home = points.find((p) => p.isHome);
    const rest = points.filter((p) => !p.isHome).sort((a, b) => b.count - a.count);
    // Alle Orte beschriften; die Entzerrung (_declutter) blendet Überlappungen aus.
    // Priorität: Homebase zuerst, dann meistbesucht -> _prio nach Reihenfolge.
    const labels = home ? [home, ...rest] : rest;
    labels.forEach((d, i) => { d._prio = i; });
    const rings = home ? [home] : rest.filter((p) => p.count >= 3);
    this.g.pointsData(points).arcsData(legs).ringsData(rings).htmlElementsData(labels);
  }

  focus(lat, lon, ms) {
    this.g.pointOfView({ lat, lng: lon, altitude: 1.7 }, ms == null ? 1200 : ms);
  }

  dataURL() {
    const r = this.g.renderer();
    r.render(this.g.scene(), this.g.camera());
    return r.domElement.toDataURL('image/png');
  }
};
