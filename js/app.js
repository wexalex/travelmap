/* App-Logik: Navigation, Check-in, Filter, Rückblick, Backup. */
(function () {
  const TM = window.TM;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

  const state = {
    all: [],
    trips: [],           // benannte Multiday-Reisen { id, name, fromHome }
    filter: { category: 'all', year: null, month: null },
    gapHours: 48,
    pending: null,       // gewählter Ort für neuen Check-in
    pendingPhoto: null,  // Blob
    globe: null,
    mapView: null,       // MapLibre-Detailkarte (lazy)
    currentMap: 'globe', // 'globe' | 'map'
    persisted: false,
    listUrls: [],
    home: { lat: 48.3069, lon: 14.2858, city: 'Linz', cc: 'AT', label: 'Linz, AT' }, // Homebase fix
  };
  function tripsById() { const o = {}; for (const t of state.trips) o[t.id] = t; return o; }

  // ---------- Helpers ----------
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 2400);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toLocalInput(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  function fmtRange(a, b) {
    return fmtDate(a) === fmtDate(b) ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;
  }
  function fmtWhen(c) {
    if (c.tsEnd && fmtDate(c.tsEnd) !== fmtDate(c.ts)) return `${fmtDate(c.ts)} – ${fmtDate(c.tsEnd)}`;
    const d = new Date(c.ts);
    return `${fmtDate(c.ts)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtKm(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n); }

  // ---------- Navigation ----------
  function showView(id) {
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === id));
    $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === id));
    $('#fab').style.display = id === 'view-checkin' ? 'none' : '';
    if (id === 'view-globe' && state.globe) state.globe.resize();
    if (id === 'view-pass') renderPass();
    if (id === 'view-review') renderReview();
    if (id === 'view-list') renderList();
  }

  // ---------- Filter / Zeitraum ----------
  function currentList() { return TM.stats.filter(state.all, state.filter); }

  function periodLabel() {
    const f = state.filter;
    if (f.year == null) return 'Gesamt';
    if (f.month == null) return String(f.year);
    return `${MONTHS[f.month]} ${f.year}`;
  }

  function encodePeriod() {
    const f = state.filter;
    if (f.year == null) return 'all';
    if (f.month == null) return 'y:' + f.year;
    return 'm:' + f.year + ':' + f.month;
  }
  function applyPeriod(val) {
    if (val === 'all') { state.filter.year = null; state.filter.month = null; }
    else if (val.startsWith('y:')) { state.filter.year = +val.slice(2); state.filter.month = null; }
    else if (val.startsWith('m:')) { const [, y, m] = val.split(':'); state.filter.year = +y; state.filter.month = +m; }
    rebuildPeriodSelects();
    render();
  }

  function rebuildPeriodSelects() {
    const byYear = {};
    state.all.forEach((c) => {
      const d = new Date(c.ts);
      (byYear[d.getFullYear()] = byYear[d.getFullYear()] || new Set()).add(d.getMonth());
    });
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    let html = '<option value="all">Gesamt</option>';
    years.forEach((y) => {
      html += `<optgroup label="${y}">`;
      html += `<option value="y:${y}">Ganzes Jahr ${y}</option>`;
      [...byYear[y]].sort((a, b) => b - a).forEach((m) => {
        html += `<option value="m:${y}:${m}">${MONTHS[m]} ${y}</option>`;
      });
      html += '</optgroup>';
    });
    const val = encodePeriod();
    ['#period-globe', '#period-review'].forEach((sel) => {
      const el = $(sel); el.innerHTML = html; el.value = val;
    });
  }

  // ---------- Render ----------
  function homePoint() {
    return { lat: state.home.lat, lon: state.home.lon, label: state.home.city, cc: state.home.cc, count: 0, business: 0, private: 0, isHome: true };
  }

  function render() {
    const list = currentList();
    const tb = tripsById();
    const pts = [homePoint(), ...TM.stats.points(list)];
    const legsData = TM.stats.legs(list, state.home, tb);
    if (state.globe) state.globe.setData(pts, legsData);
    if (state.mapView) state.mapView.setData(pts, legsData);
    $('#empty-globe').hidden = state.all.length > 0;
    // Statbar
    const s = TM.stats.summary(list, state.home, state.gapHours, tb);
    $('#s-countries').textContent = s.countries;
    $('#s-cities').textContent = s.places;
    $('#s-km').textContent = fmtKm(s.km);
    $('#s-checkins').textContent = s.checkins;
    // Aktive Views
    if ($('#view-pass').classList.contains('is-active')) renderPass();
    if ($('#view-review').classList.contains('is-active')) renderReview();
    if ($('#view-list').classList.contains('is-active')) renderList();
  }

  // Umschalten Globus <-> Detailkarte
  function setMapMode(mode) {
    state.currentMap = mode;
    $$('#view-toggle .seg').forEach((b) => b.classList.toggle('is-active', b.dataset.map === mode));
    const showMap = mode === 'map';
    $('#globe').hidden = showMap;
    $('#map').hidden = !showMap;
    if (showMap) {
      if (!state.mapView && window.maplibregl) state.mapView = new TM.MapView($('#map'));
      render();
      setTimeout(() => { if (state.mapView) state.mapView.resize(); }, 80);
    } else if (state.globe) {
      state.globe.resize();
    }
  }

  function renderPass() {
    const list = currentList();
    const stamps = TM.stats.stamps(list);
    const s = TM.stats.summary(list, state.home, state.gapHours, tripsById());
    $('#pass-sub').textContent = list.length
      ? `${s.countries} Länder · ${s.places} Orte gestempelt`
      : 'Deine Stempelsammlung';
    const css = getComputedStyle(document.documentElement);
    const inks = [css.getPropertyValue('--accent').trim() || '#7ea6c9', css.getPropertyValue('--priv').trim() || '#d8dce3'];
    const grid = $('#stamp-grid');
    if (!stamps.length) {
      grid.innerHTML = '<p class="empty-note" style="grid-column:1/-1">Noch keine Stempel.<br>Setz deinen ersten Check-in.</p>';
      return;
    }
    grid.innerHTML = stamps.map((st, i) => {
      const ink = inks[i % inks.length];
      const rot = ((i * 37) % 9) - 4;
      return `<div class="stamp" style="--ink:${ink};--rot:${rot}deg">
        <span class="ring"></span><span class="ring dashed"></span>
        <span class="count">${st.count}×</span>
        <span class="emoji">${st.icon}</span>
        <span class="name">${escapeHtml(st.city)}</span>
        <span class="meta">${TM.geo.flag(st.cc)} ${fmtDate(st.last)}</span>
      </div>`;
    }).join('');
  }

  function renderReview() {
    const list = currentList();
    const tb = tripsById();
    const s = TM.stats.summary(list, state.home, state.gapHours, tb);
    const grid = $('#review-stats');
    const top = s.topPlace ? `${TM.geo.flag(s.topPlace.cc)} ${s.topPlace.label} (${s.topPlace.n}×)` : '–';
    grid.innerHTML = `
      <div class="stat-card"><b>${s.countries}</b><span>Länder</span></div>
      <div class="stat-card"><b>${s.places}</b><span>Orte</span></div>
      <div class="stat-card"><b>${fmtKm(s.km)}</b><span>Kilometer</span></div>
      <div class="stat-card"><b>${s.checkins}</b><span>Check-ins</span></div>
      <div class="stat-card wide"><span>Meistbesuchter Ort</span><div class="sub">${top}</div></div>
      <div class="stat-card wide"><span>Länder</span><div class="sub">${s.countryList.map((cc) => TM.geo.flag(cc)).join(' ') || '–'}</div></div>`;

    const trips = TM.stats.trips(list, state.gapHours, state.home, tb);
    $('#trip-list').innerHTML = trips.length ? trips.map((t) => `
      <div class="trip">
        <div class="t-top"><span class="t-title">${t.isTrip ? '🧭 ' : ''}${escapeHtml(t.title)}</span><span class="t-date">${fmtRange(t.start, t.end)}</span></div>
        <div class="t-meta">${t.countries.map((cc) => `<span class="flag">${TM.geo.flag(cc)}</span>`).join('')}
          ${t.cities.length} Orte · ${fmtKm(t.km)} km · ${t.items.length} Check-ins</div>
        ${t.isTrip ? `<button class="trip-add" data-add-pin="${t.id}">+ Stopp hinzufügen</button>` : ''}
      </div>`).join('') : '<p class="empty-note">Keine Einträge in diesem Zeitraum.</p>';
  }

  async function renderList() {
    state.listUrls.forEach((u) => URL.revokeObjectURL(u));
    state.listUrls = [];
    const list = [...currentList()].reverse();
    const tb = tripsById();
    const box = $('#checkin-list');
    if (!list.length) { box.innerHTML = '<p class="empty-note">Noch keine Check-ins.</p>'; return; }
    box.innerHTML = list.map((c) => {
      const trip = c.tripId && tb[c.tripId] ? ' · 🧭 ' + escapeHtml(tb[c.tripId].name) : '';
      return `<div class="ci" data-id="${c.id}">
        <div class="ci-thumb placeholder" data-ph="${c.id}">📍</div>
        <div class="ci-body">
          <div class="ci-title">${c.dreh ? '🎬 ' : ''}${TM.geo.flag(c.cc)} ${escapeHtml(c.label)} <span class="tag ${c.category}">${c.category === 'private' ? 'Privat' : 'Business'}</span></div>
          <div class="ci-sub">${fmtWhen(c)}${trip}</div>
          ${c.note ? `<div class="ci-note">${escapeHtml(c.note)}</div>` : ''}
        </div>
        <button class="ci-del" data-del="${c.id}" aria-label="Löschen">🗑</button>
      </div>`;
    }).join('');
    // Fotos laden
    for (const c of list) {
      if (!c.hasPhoto) continue;
      const blob = await TM.db.getPhoto(c.id);
      if (!blob) continue;
      const url = URL.createObjectURL(blob); state.listUrls.push(url);
      const ph = box.querySelector(`[data-ph="${c.id}"]`);
      if (ph) { ph.outerHTML = `<img class="ci-thumb" src="${url}" alt="">`; }
    }
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---------- Check-in-Flow ----------
  // Nur die Ort-/Pin-Felder leeren (Reise-Kontext bleibt für weitere Pins bestehen).
  function resetPinFields() {
    state.pending = null;
    state.pendingPhoto = null;
    $('#picked').hidden = true;
    $('#gps-status').textContent = '';
    $('#search-input').value = '';
    $('#search-results').innerHTML = '';
    $('#loc-note').value = '';
    $('#photo-preview').hidden = true;
    $('#photo-img').removeAttribute('src');
    setCat('business');
    setWhen('point');
  }
  function resetCheckinForm() {
    resetPinFields();
    $('#trip-name').value = '';
    $('#trip-fromhome').checked = false;
    setTripType('day');
    populateTripSelect();
    $$('#mode-seg .seg').forEach((x) => x.classList.toggle('is-active', x.dataset.mode === 'gps'));
    $('#panel-gps').hidden = false;
    $('#panel-search').hidden = true;
  }

  function setTripType(tt) {
    $$('#triptype-seg .seg').forEach((b) => b.classList.toggle('is-active', b.dataset.tt === tt));
    $('#triptype-seg').dataset.value = tt;
    const multi = tt === 'multi';
    $('#trip-block').hidden = !multi;
    $('#when-seg').style.display = multi ? '' : 'none'; // Daytrip = nur ein Tag
    if (!multi) setWhen('point');
    $('#btn-save').textContent = multi ? 'Pin zur Reise hinzufügen' : 'Check-in speichern';
  }
  function getTripType() { return $('#triptype-seg').dataset.value || 'day'; }

  function populateTripSelect() {
    const sel = $('#trip-select');
    const opts = ['<option value="__new">+ Neue Reise…</option>'];
    for (const t of state.trips) opts.push(`<option value="${t.id}">${escapeHtml(t.name)}</option>`);
    sel.innerHTML = opts.join('');
    onTripSelectChange();
  }
  function onTripSelectChange() {
    const v = $('#trip-select').value;
    const isNew = v === '__new';
    $('#trip-name-row').hidden = !isNew;
    const t = state.trips.find((x) => x.id === v);
    $('#trip-fromhome').checked = isNew ? false : !!(t && t.fromHome);
    renderTripPins(isNew ? null : v);
  }
  function renderTripPins(tripId) {
    const el = $('#trip-pins');
    if (!tripId) { el.innerHTML = ''; return; }
    const pins = state.all.filter((c) => c.tripId === tripId).sort((a, b) => a.ts - b.ts);
    el.innerHTML = pins.length
      ? '<div class="tp-title">Stopps dieser Reise</div>' + pins.map((p, i) => `<span class="tp">${i + 1}. ${escapeHtml(p.city || p.label)}</span>`).join('')
      : '<div class="tp-title">Noch keine Stopps – setz den ersten.</div>';
  }
  // Check-in direkt für eine bestehende Reise öffnen (fügt zuverlässig einen Stopp hinzu).
  function openCheckinForTrip(tripId) {
    resetCheckinForm();
    setTripType('multi');
    populateTripSelect();
    $('#trip-select').value = tripId;
    onTripSelectChange();
    showView('view-checkin');
  }

  function setWhen(mode) {
    $$('#when-seg .seg').forEach((b) => b.classList.toggle('is-active', b.dataset.when === mode));
    $('#when-seg').dataset.value = mode;
    const range = mode === 'range';
    $('#row-point').hidden = range;
    $('#row-from').hidden = !range;
    $('#row-to').hidden = !range;
  }
  function getWhen() { return $('#when-seg').dataset.value || 'point'; }

  function setCat(cat) {
    $$('#cat-seg .seg').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === cat));
    $('#cat-seg').dataset.value = cat;
  }
  function getCat() { return $('#cat-seg').dataset.value || 'business'; }

  function showPicked(loc) {
    state.pending = loc;
    const now = loc.ts || Date.now();
    $('#loc-label').value = loc.label;
    $('#loc-date').value = toLocalInput(now);
    const day = toLocalInput(now).slice(0, 10);
    $('#loc-from').value = day;
    $('#loc-to').value = day;
    setWhen('point');
    $('#picked').hidden = false;
    $('#picked').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function locate() {
    const st = $('#gps-status');
    st.textContent = 'Standort wird ermittelt…';
    try {
      const pos = await TM.geo.current();
      st.textContent = 'Ort wird bestimmt…';
      let loc;
      try { loc = await TM.geo.reverse(pos.lat, pos.lon); }
      catch { loc = { lat: pos.lat, lon: pos.lon, city: '', country: '', cc: '', label: `${pos.lat.toFixed(3)}, ${pos.lon.toFixed(3)}` }; }
      st.textContent = `Genauigkeit ±${Math.round(pos.acc)} m`;
      showPicked(loc);
    } catch (e) {
      st.textContent = 'GPS nicht möglich' + (e && e.message ? ' – ' + e.message : '') + '. Nutze „Ort suchen".';
    }
  }

  let searchTimer = null;
  function onSearchInput(e) {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 3) { $('#search-results').innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
      try {
        const res = await TM.geo.search(q);
        $('#search-results').innerHTML = res.map((r, i) =>
          `<li data-i="${i}"><b>${escapeHtml(r.label)}</b><span>${escapeHtml(r.display)}</span></li>`).join('');
        $('#search-results')._data = res;
      } catch { $('#search-results').innerHTML = '<li><span>Suche fehlgeschlagen</span></li>'; }
    }, 450);
  }

  async function save() {
    if (!state.pending) return;
    const label = $('#loc-label').value.trim() || state.pending.label;
    let ts, tsEnd = null;
    if (getWhen() === 'range') {
      const from = $('#loc-from').value, to = $('#loc-to').value;
      if (!from || !to) { toast('Bitte Von und Bis wählen'); return; }
      ts = new Date(from + 'T12:00').getTime();
      tsEnd = new Date(to + 'T12:00').getTime();
      if (tsEnd < ts) { const t = ts; ts = tsEnd; tsEnd = t; }
    } else {
      ts = new Date($('#loc-date').value || Date.now()).getTime();
    }
    // Multiday-Reise: Trip anlegen/wählen
    let tripId = null;
    const multi = getTripType() === 'multi';
    if (multi) {
      const sel = $('#trip-select').value;
      if (sel === '__new') {
        const name = $('#trip-name').value.trim() || 'Reise';
        tripId = crypto.randomUUID ? crypto.randomUUID() : 'trip-' + Date.now();
        const trip = { id: tripId, name, fromHome: $('#trip-fromhome').checked };
        await TM.db.putTrip(trip); state.trips.push(trip);
      } else {
        tripId = sel;
        const t = state.trips.find((x) => x.id === sel);
        if (t && t.fromHome !== $('#trip-fromhome').checked) { t.fromHome = $('#trip-fromhome').checked; await TM.db.putTrip(t); }
      }
    }
    const id = (crypto.randomUUID ? crypto.randomUUID() : 'id-' + ts + '-' + Math.round(Math.random() * 1e6));
    // Stadt/Land aus evtl. bearbeitetem Label übernehmen, Rest aus pending
    const c = {
      id, ts, tsEnd, tripId,
      lat: state.pending.lat, lon: state.pending.lon,
      city: state.pending.city || label.split(',')[0].trim(),
      country: state.pending.country || '',
      cc: state.pending.cc || '',
      label,
      note: $('#loc-note').value.trim(),
      category: getCat(),
      hasPhoto: !!state.pendingPhoto,
    };
    await TM.db.putCheckin(c);
    if (state.pendingPhoto) await TM.db.savePhoto(id, state.pendingPhoto);
    state.all = await TM.db.allCheckins();
    rebuildPeriodSelects();
    render();
    if (multi) {
      // Im Reise-Kontext bleiben, nur Pin-Felder leeren -> nächsten Pin setzen
      resetPinFields();
      populateTripSelect();
      $('#trip-select').value = tripId; onTripSelectChange();
      setTripType('multi');
      if (state.globe) state.globe.focus(c.lat, c.lon);
      if (state.mapView && state.currentMap === 'map') state.mapView.focus(c.lat, c.lon);
      toast('Pin hinzugefügt ✓ – nächsten setzen');
    } else {
      resetCheckinForm();
      showView('view-globe');
      if (state.globe) state.globe.focus(c.lat, c.lon);
      if (state.mapView && state.currentMap === 'map') state.mapView.focus(c.lat, c.lon);
      toast('Check-in gespeichert ✓');
    }
  }

  // ---------- Foto ----------
  function onPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    state.pendingPhoto = file;
    const url = URL.createObjectURL(file);
    const img = $('#photo-img');
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
    $('#photo-preview').hidden = false;
  }

  // ---------- Rückblick teilen ----------
  async function shareImage() {
    if (!currentList().length) { toast('Keine Daten in diesem Zeitraum'); return; }
    toast('Bild wird erstellt…');
    await new Promise((r) => setTimeout(r, 250)); // Globus rendern lassen
    const s = TM.stats.summary(currentList(), state.home, state.gapHours, tripsById());
    const info = {
      title: periodLabel(),
      subtitle: state.filter.category === 'business' ? 'Business' : state.filter.category === 'private' ? 'Privat' : 'Meine Reisen',
      stats: [
        { v: s.countries, l: 'Länder' },
        { v: s.places, l: 'Orte' },
        { v: fmtKm(s.km), l: 'km' },
        { v: s.checkins, l: 'Check-ins' },
      ],
    };
    try {
      const blob = await TM.share.build(state.globe, info);
      const fname = 'travelmap-' + encodePeriod().replace(/:/g, '-') + '.png';
      const r = await TM.share.shareOrDownload(blob, fname);
      if (r === 'downloaded') toast('Bild gespeichert ✓');
    } catch (e) {
      toast('Bild-Export fehlgeschlagen');
      console.error(e);
    }
  }

  // ---------- Backup ----------
  async function exportBackup() {
    const photos = await TM.db.allPhotos();
    const photoMap = {};
    for (const p of photos) photoMap[p.id] = await blobToDataURL(p.blob);
    const data = { version: 2, exported: new Date().toISOString(), checkins: state.all, trips: state.trips, photos: photoMap };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'travelmap-backup-' + fmtDate(Date.now()).replace(/\./g, '-') + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    await TM.db.setSetting('lastBackupTs', Date.now());
    toast('Backup exportiert ✓');
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data.checkins) throw new Error('Ungültige Datei');
      if (data.trips) for (const t of data.trips) await TM.db.putTrip(t);
      for (const c of data.checkins) await TM.db.putCheckin(c);
      if (data.photos) {
        for (const id of Object.keys(data.photos)) {
          const blob = await dataURLToBlob(data.photos[id]);
          await TM.db.savePhoto(id, blob);
        }
      }
      state.all = await TM.db.allCheckins();
      state.trips = await TM.db.allTrips();
      rebuildPeriodSelects(); render();
      toast(`${data.checkins.length} Check-ins importiert ✓`);
    } catch (e) { toast('Import fehlgeschlagen'); console.error(e); }
  }
  function blobToDataURL(blob) {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  }
  async function dataURLToBlob(u) { return (await fetch(u)).blob(); }

  // ---------- Speicher / Persistenz ----------
  async function ensurePersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        state.persisted = await navigator.storage.persisted();
        if (!state.persisted) state.persisted = await navigator.storage.persist();
      }
    } catch (e) { /* ignore */ }
  }
  async function updateStorageInfo() {
    const el = $('#storage-status'), btn = $('#btn-persist');
    if (!(navigator.storage && navigator.storage.persisted)) { el.textContent = 'Speicher: lokal (Gerät)'; btn.hidden = true; return; }
    let persisted = false, usage = '';
    try { persisted = await navigator.storage.persisted(); } catch (e) {}
    try { const est = await navigator.storage.estimate(); if (est && est.usage) usage = ' · ' + (est.usage / 1048576).toFixed(1).replace('.', ',') + ' MB'; } catch (e) {}
    el.textContent = (persisted ? 'Speicher: dauerhaft ✓' : 'Speicher: nicht dauerhaft') + usage;
    btn.hidden = persisted;
  }
  async function maybeShowInstallHint() {
    const standalone = matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const dismissed = await TM.db.getSetting('installHintDismissed', false);
    if (!standalone && !dismissed) $('#install-hint').hidden = false;
  }

  // ---------- Menü ----------
  function openMenu(open) { $('#menu-backdrop').hidden = !open; if (open) updateStorageInfo(); }

  // ---------- Wiring ----------
  function wire() {
    $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
    $('#fab').addEventListener('click', () => { resetCheckinForm(); showView('view-checkin'); });
    $('#btn-cancel').addEventListener('click', () => { resetCheckinForm(); showView('view-globe'); });

    // Globus / Karte
    $$('#view-toggle .seg').forEach((b) => b.addEventListener('click', () => setMapMode(b.dataset.map)));

    // Check-in: Daytrip / Multiday-Reise + Reise-Auswahl
    $$('#triptype-seg .seg').forEach((b) => b.addEventListener('click', () => setTripType(b.dataset.tt)));
    $('#trip-select').addEventListener('change', onTripSelectChange);

    // Speicher / Install
    $('#btn-persist').addEventListener('click', async () => {
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
      updateStorageInfo(); toast('Speicher geprüft');
    });
    $('#install-dismiss').addEventListener('click', async () => {
      $('#install-hint').hidden = true; await TM.db.setSetting('installHintDismissed', true);
    });

    // Kategorie-Filter (Globus, iOS-Segmented-Control)
    $$('#cat-filter .seg').forEach((ch) => ch.addEventListener('click', () => {
      $$('#cat-filter .seg').forEach((c) => c.classList.remove('is-active'));
      ch.classList.add('is-active');
      state.filter.category = ch.dataset.cat;
      render();
    }));

    // Zeitraum
    $('#period-globe').addEventListener('change', (e) => applyPeriod(e.target.value));
    $('#period-review').addEventListener('change', (e) => applyPeriod(e.target.value));

    // Modus GPS / Suche
    $$('#mode-seg .seg').forEach((b) => b.addEventListener('click', () => {
      $$('#mode-seg .seg').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      const gps = b.dataset.mode === 'gps';
      $('#panel-gps').hidden = !gps;
      $('#panel-search').hidden = gps;
    }));
    $('#btn-locate').addEventListener('click', locate);
    $('#search-input').addEventListener('input', onSearchInput);
    $('#search-results').addEventListener('click', (e) => {
      const li = e.target.closest('li'); if (!li || li.dataset.i == null) return;
      const r = $('#search-results')._data[+li.dataset.i];
      showPicked({ ...r, ts: Date.now() });
    });

    // Kategorie im Formular
    $$('#cat-seg .seg').forEach((b) => b.addEventListener('click', () => setCat(b.dataset.cat)));
    // Zeitpunkt / Zeitraum
    $$('#when-seg .seg').forEach((b) => b.addEventListener('click', () => setWhen(b.dataset.when)));

    // Foto
    $('#btn-photo').addEventListener('click', () => $('#loc-photo').click());
    $('#loc-photo').addEventListener('change', onPhoto);

    $('#btn-save').addEventListener('click', save);
    $('#btn-share').addEventListener('click', shareImage);

    // Rückblick: Stopp zu bestehender Reise hinzufügen
    $('#trip-list').addEventListener('click', (e) => {
      const id = e.target.dataset && e.target.dataset.addPin;
      if (id) openCheckinForTrip(id);
    });

    // Menü
    $('#btn-menu').addEventListener('click', () => openMenu(true));
    $('#btn-menu-close').addEventListener('click', () => openMenu(false));
    $('#menu-backdrop').addEventListener('click', (e) => { if (e.target.id === 'menu-backdrop') openMenu(false); });
    $('#btn-export').addEventListener('click', exportBackup);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); openMenu(false); });
    $('#gap-select').addEventListener('change', async (e) => {
      state.gapHours = +e.target.value;
      await TM.db.setSetting('gapHours', state.gapHours);
      if ($('#view-review').classList.contains('is-active')) renderReview();
    });

    // Liste: löschen
    $('#checkin-list').addEventListener('click', async (e) => {
      const id = e.target.dataset && e.target.dataset.del; if (!id) return;
      if (!confirm('Diesen Check-in löschen?')) return;
      await TM.db.deleteCheckin(id);
      state.all = await TM.db.allCheckins();
      rebuildPeriodSelects(); render(); renderList();
      toast('Gelöscht');
    });
  }

  // Für Tests aus der Konsole erreichbar
  window.TMApp = {
    async seed(arr) {
      for (const c of arr) {
        const id = crypto.randomUUID();
        await TM.db.putCheckin({ hasPhoto: false, note: '', category: 'business', ...c, id });
      }
      state.all = await TM.db.allCheckins();
      rebuildPeriodSelects(); render();
      return state.all.length;
    },
    async clear() {
      for (const c of state.all) await TM.db.deleteCheckin(c.id);
      for (const t of state.trips) await TM.db.deleteTrip(t.id);
      state.all = []; state.trips = []; rebuildPeriodSelects(); render(); renderList();
    },
    state,
  };

  // ---------- Boot ----------
  async function boot() {
    wire();
    await ensurePersistence();
    state.globe = new TM.GlobeView($('#globe'));
    state.gapHours = await TM.db.getSetting('gapHours', 48);
    $('#gap-select').value = String(state.gapHours);
    state.all = await TM.db.allCheckins();
    state.trips = await TM.db.allTrips();
    resetCheckinForm();
    rebuildPeriodSelects();
    render();
    maybeShowInstallHint();
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* offline ok */ }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
