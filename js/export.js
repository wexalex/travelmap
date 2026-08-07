/* Baut aus dem aktuellen Globus ein teilbares Bild (LinkedIn-tauglich). */
window.TM = window.TM || {};
TM.share = (function () {
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  function drawContain(ctx, img, cx, cy, maxW, maxH) {
    const r = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * r, h = img.height * r;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Farbe #hex -> rgba(...) mit Alpha
  function hexA(hex, a) {
    const h = (hex || '').replace('#', '').trim();
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(f, 16); if (isNaN(n)) return `rgba(126,166,201,${a})`;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Der Globus für das Teil-Bild wird deterministisch in 2D gezeichnet
  // (orthografische Projektion), NICHT vom WebGL-Globus abgegriffen — das ist
  // zuverlässig und ergibt den minimalistischen Flightmap-Look.
  function drawGlobe(ctx, cx, cy, R, shareData, BIZ, PRIV) {
    const toR = Math.PI / 180;
    const pts = shareData.points || [];
    let clat = 48, clon = 12;
    if (pts.length) { clat = pts.reduce((s, p) => s + p.lat, 0) / pts.length; clon = pts.reduce((s, p) => s + p.lon, 0) / pts.length; }
    const p0 = clat * toR, l0 = clon * toR;
    function project(latDeg, lonDeg, lift) {
      const ph = latDeg * toR, la = lonDeg * toR;
      const cosc = Math.sin(p0) * Math.sin(ph) + Math.cos(p0) * Math.cos(ph) * Math.cos(la - l0);
      const x = Math.cos(ph) * Math.sin(la - l0);
      const y = Math.cos(p0) * Math.sin(ph) - Math.sin(p0) * Math.cos(ph) * Math.cos(la - l0);
      const rr = R * (1 + (lift || 0));
      return { x: cx + rr * x, y: cy - rr * y, vis: cosc >= -0.02 };
    }
    function llVec(lat, lon) { const ph = lat * toR, la = lon * toR; return [Math.cos(ph) * Math.cos(la), Math.cos(ph) * Math.sin(la), Math.sin(ph)]; }
    function vecLL(v) { return [Math.asin(Math.max(-1, Math.min(1, v[2]))) / toR, Math.atan2(v[1], v[0]) / toR]; }
    function slerp(a, b, t) {
      const va = llVec(a[0], a[1]), vb = llVec(b[0], b[1]);
      let d = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]; d = Math.max(-1, Math.min(1, d));
      const O = Math.acos(d); if (O < 1e-6) return a;
      const s1 = Math.sin((1 - t) * O) / Math.sin(O), s2 = Math.sin(t * O) / Math.sin(O);
      return vecLL([s1 * va[0] + s2 * vb[0], s1 * va[1] + s2 * vb[1], s1 * va[2] + s2 * vb[2]]);
    }
    function seg(path) { ctx.beginPath(); let on = false; for (const p of path) { if (p.vis) { if (!on) { ctx.moveTo(p.x, p.y); on = true; } else ctx.lineTo(p.x, p.y); } else on = false; } ctx.stroke(); }

    // Atmosphäre
    let atm = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.16);
    atm.addColorStop(0, 'rgba(120,150,200,0.20)'); atm.addColorStop(1, 'rgba(120,150,200,0)');
    ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, 7); ctx.fill();
    // Kugel
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    const gl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.2, cx, cy, R * 1.05);
    gl.addColorStop(0, '#1b212b'); gl.addColorStop(1, '#070a0e');
    ctx.fillStyle = gl; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // Gitternetz
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) { const path = []; for (let lon = -180; lon <= 180; lon += 4) path.push(project(lat, lon, 0)); seg(path); }
    for (let lon = -180; lon < 180; lon += 30) { const path = []; for (let lat = -90; lat <= 90; lat += 4) path.push(project(lat, lon, 0)); seg(path); }
    ctx.restore();
    // Rand
    ctx.strokeStyle = 'rgba(150,180,220,0.28)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

    // Routen
    ctx.lineCap = 'round';
    (shareData.legs || []).forEach((l) => {
      const col = l.category === 'private' ? PRIV : BIZ;
      const N = 64, path = [];
      for (let i = 0; i <= N; i++) { const t = i / N; const ll = slerp([l.startLat, l.startLng], [l.endLat, l.endLng], t); path.push(project(ll[0], ll[1], 0.16 * Math.sin(Math.PI * t))); }
      ctx.setLineDash([]); ctx.strokeStyle = hexA(col, 0.30); ctx.lineWidth = 9; seg(path);
      ctx.strokeStyle = col; ctx.lineWidth = 2.6; if (l.mode === 'flight') ctx.setLineDash([11, 11]); seg(path); ctx.setLineDash([]);
    });
    // Orte
    pts.forEach((p) => {
      const pr = project(p.lat, p.lon, 0); if (!pr.vis) return;
      const col = p.isHome ? '#ffffff' : (p.dom === 'private' ? PRIV : BIZ);
      const rad = p.isHome ? 9 : 5 + Math.min(p.count || 1, 10) * 0.6;
      if (p.isHome) { ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pr.x, pr.y, rad + 6, 0, 7); ctx.stroke(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pr.x, pr.y, rad, 0, 7); ctx.fill();
    });
  }

  async function build(shareData, info) {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#7ea6c9';
    const BIZ = css.getPropertyValue('--biz').trim() || '#7ea6c9';
    const PRIV = css.getPropertyValue('--priv').trim() || '#d8dce3';
    const C = { bg1: '#101216', bg2: '#08090b', title: '#f2f3f5', sub: '#9a9ca3', card: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', num: accent, lbl: '#9a9ca3', brand: '#f2f3f5' };
    const W = 1080, Hgt = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Hgt;
    const ctx = cv.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, Hgt);
    g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hgt);

    // Flightmap-Globus (2D, deterministisch)
    drawGlobe(ctx, W / 2, Hgt / 2 + 20, Math.min(W * 0.40, Hgt * 0.32), shareData, BIZ, PRIV);

    // Kopf
    ctx.textAlign = 'left';
    ctx.fillStyle = C.num;
    ctx.beginPath(); ctx.arc(70, 96, 9, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 34px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle = C.brand; ctx.fillText('TravelMap', 92, 107);

    ctx.font = '800 88px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.fillStyle = C.title; ctx.fillText(info.title, 64, 210);
    if (info.subtitle) {
      ctx.font = '500 32px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillStyle = C.sub; ctx.fillText(info.subtitle, 66, 262);
    }

    // Kennzahlen unten
    const stats = (info.stats || []).slice(0, 4);
    const n = stats.length || 1;
    const pad = 48, gapx = 20;
    const cardW = (W - pad * 2 - gapx * (n - 1)) / n;
    const cardH = 176, cardY = Hgt - cardH - 74;
    stats.forEach((s, i) => {
      const x = pad + i * (cardW + gapx);
      ctx.fillStyle = C.card; roundRect(ctx, x, cardY, cardW, cardH, 28); ctx.fill();
      ctx.strokeStyle = C.border; ctx.lineWidth = 1.5; roundRect(ctx, x, cardY, cardW, cardH, 28); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = C.num; ctx.font = '800 58px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText(String(s.v), x + cardW / 2, cardY + 86);
      ctx.fillStyle = C.lbl; ctx.font = '600 24px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText(s.l, x + cardW / 2, cardY + 132);
    });

    return await new Promise((res) => cv.toBlob((b) => res(b), 'image/png', 0.95));
  }

  async function shareOrDownload(blob, filename) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'TravelMap' }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  }

  return { build, shareOrDownload };
})();
