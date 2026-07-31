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
      .globeImageUrl('assets/earth-dark.jpg')
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
      .labelsData([]).labelLat('lat').labelLng('lon').labelText('label')
      .labelSize(0.85).labelDotRadius(0.26).labelResolution(2)
      .labelColor(() => 'rgba(242,243,245,0.82)');

    const c = this.g.controls();
    c.autoRotate = true; c.autoRotateSpeed = 0.42; c.enableZoom = true;
    c.minDistance = 101;   // sehr nah heranzoombar (Globusradius = 100)
    c.maxDistance = 700;   // nicht ins Leere zoomen
    el.addEventListener('pointerdown', () => { c.autoRotate = false; });

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.g.pointOfView({ lat: 48, lng: 12, altitude: 1.8 }, 0); // Europa-Fokus
  }

  onPoint(fn) { this._onPoint = fn; }

  resize() {
    this.g.width(this.el.clientWidth || window.innerWidth);
    this.g.height(this.el.clientHeight || window.innerHeight);
  }

  setData(points, legs) {
    const home = points.find((p) => p.isHome);
    const rest = points.filter((p) => !p.isHome);
    // Nur Mehrfach-Orte beschriften (sonst überlappen dicht beieinander liegende Orte).
    const sorted = [...rest].sort((a, b) => b.count - a.count);
    let top = sorted.filter((p) => p.count >= 2).slice(0, 6);
    if (!top.length) top = sorted.slice(0, 5);
    const labels = home ? [home, ...top] : top;
    const rings = home ? [home] : rest.filter((p) => p.count >= 3);
    this.g.pointsData(points).arcsData(legs).ringsData(rings).labelsData(labels);
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
