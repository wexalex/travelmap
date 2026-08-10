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

    this.g = new Globe(el, { rendererConfig: { antialias: true, alpha: true, preserveDrawingBuffer: true } })
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl('assets/earth-dark-hi.jpg')
      .bumpImageUrl('assets/earth-topology.png')
      .showAtmosphere(true)
      .atmosphereColor('#43607f')
      .atmosphereAltitude(0.15)
      .pointsData([]).pointLat('lat').pointLng('lon')
      .pointAltitude((d) => (d.isHome ? 0.02 : 0.012))
      .pointRadius((d) => (d.isHome ? 0.55 : 0.24 + Math.min(d.count, 12) * 0.045))
      .pointColor((d) => (d.isHome ? '#ffffff' : this.dotColor(d)))
      .pointLabel((d) => `<div class="glabel">${d.isHome ? '🏠 ' + d.label + ' · Homebase' : d.label + ' · ' + d.count + '×'}</div>`)
      .onPointClick((d) => { if (this._onPoint && d && !d.isHome) this._onPoint(d); })
      .arcsData([]).arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng')
      .arcColor((d) => this.colorPair(d.category))
      .arcStroke((d) => 0.32 + Math.min(d.count, 8) * 0.12)
      // Flug = hoher Bogen (mit fließenden Strichen), Auto = flache Bodenlinie (durchgezogen)
      .arcAltitude((d) => (d.mode === 'flight' ? Math.min(0.5, 0.08 + (d.dist || 0) / 16000) : 0.004))
      .arcDashLength((d) => (d.mode === 'flight' ? 0.45 : 1))
      .arcDashGap((d) => (d.mode === 'flight' ? 0.22 : 0))
      .arcDashInitialGap(() => Math.random())
      .arcDashAnimateTime((d) => (d.mode === 'flight' ? 2600 : 0))
      .arcsTransitionDuration(300)
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
