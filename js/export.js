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

  async function build(globeView, info) {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#7ea6c9';
    const C = { bg1: '#101216', bg2: '#08090b', title: '#f2f3f5', sub: '#9a9ca3', card: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', num: accent, lbl: '#9a9ca3', brand: '#f2f3f5' };
    const W = 1080, Hgt = 1350;
    const img = await loadImg(globeView.dataURL());
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Hgt;
    const ctx = cv.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, Hgt);
    g.addColorStop(0, C.bg1); g.addColorStop(1, C.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hgt);

    // Globus mittig (transparenter Hintergrund -> Verlauf scheint durch)
    drawContain(ctx, img, W / 2, Hgt / 2 - 10, W * 1.02, Hgt * 0.72);

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
