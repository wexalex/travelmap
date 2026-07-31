/* Auswertung: Filter, Kennzahlen, Reisegruppierung, Globus-Daten. */
window.TM = window.TM || {};
TM.stats = (function () {
  const H = TM.geo.haversine;

  // Ortsschlüssel: gleiche Stadt = ein Hub; sonst gerundete Koordinaten.
  function pkey(c) {
    if (c.city) return (c.cc || '') + '|' + c.city;
    return c.lat.toFixed(1) + ',' + c.lon.toFixed(1);
  }
  // tripsById kann ein Objekt {id: trip} oder eine Map sein.
  function getTrip(tb, id) { if (!tb) return null; return tb.get ? tb.get(id) : tb[id]; }

  function filter(list, f) {
    f = f || {};
    return list.filter((c) => {
      if (f.category && f.category !== 'all' && c.category !== f.category) return false;
      if (f.year != null) {
        const d = new Date(c.ts);
        if (d.getFullYear() !== f.year) return false;
        if (f.month != null && d.getMonth() !== f.month) return false;
      }
      return true;
    });
  }

  function legsKm(sorted) {
    let km = 0;
    for (let i = 1; i < sorted.length; i++) km += H(sorted[i - 1], sorted[i]);
    return km;
  }

  // Kilometer: Daytrips = Rundweg von/nach Home, Multiday-Reisen = Kettenpfad.
  function totalKm(list, home, gapHours, tripsById) {
    if (home) return trips(list, gapHours, home, tripsById).reduce((s, t) => s + t.km, 0);
    return legsKm([...list].sort((a, b) => a.ts - b.ts));
  }

  function summary(list, home, gapHours, tripsById) {
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const countries = new Set(sorted.map((c) => c.cc).filter(Boolean));
    const places = new Set(sorted.map(pkey));
    const cityPlaces = new Set(sorted.filter((c) => c.city).map(pkey));

    const placeCount = {};
    sorted.forEach((c) => { const k = pkey(c); placeCount[k] = (placeCount[k] || 0) + 1; });
    let topPlace = null, topN = 0;
    sorted.forEach((c) => { const k = pkey(c); if (placeCount[k] > topN) { topN = placeCount[k]; topPlace = c; } });

    return {
      checkins: sorted.length,
      countries: countries.size,
      countryList: [...countries],
      places: places.size,
      cities: cityPlaces.size,
      km: Math.round(totalKm(sorted, home, gapHours, tripsById)),
      topPlace: topPlace ? { label: topPlace.city || topPlace.label, cc: topPlace.cc, n: topN } : null,
      first: sorted[0] ? sorted[0].ts : null,
      last: sorted.length ? sorted[sorted.length - 1].ts : null,
    };
  }

  function trips(list, gapHours, home, tripsById) {
    // Pins nach expliziter Reise (tripId) bzw. eigenständig aufteilen.
    const explicit = new Map();
    const standalone = [];
    for (const c of list) {
      if (c.tripId) { if (!explicit.has(c.tripId)) explicit.set(c.tripId, []); explicit.get(c.tripId).push(c); }
      else standalone.push(c);
    }
    const result = [];
    // Multiday-Reisen: mehrere Pins als echte Kette (optional mit Home-Enden)
    for (const [tid, items] of explicit) {
      const trip = getTrip(tripsById, tid);
      const s = [...items].sort((a, b) => a.ts - b.ts);
      const countries = [...new Set(s.map((c) => c.cc).filter(Boolean))];
      const cities = [...new Set(s.filter((c) => c.city).map((c) => c.city))];
      const path = (trip && trip.fromHome && home) ? [home, ...s, home] : s;
      result.push({
        id: tid, isTrip: true, fromHome: !!(trip && trip.fromHome),
        start: s[0].ts, end: Math.max(...s.map((c) => c.tsEnd || c.ts)),
        items: s, countries, cities,
        km: Math.round(legsKm(path)),
        title: (trip && trip.name) || cities.slice(0, 3).join(' · ') || 'Reise',
      });
    }
    // Eigenständige Daytrips: nach Zeitlücke gruppieren, Rundweg von/nach Home
    const gap = (gapHours || 48) * 3600e3;
    const s2 = [...standalone].sort((a, b) => a.ts - b.ts);
    let cur = null; const groups = [];
    for (const c of s2) {
      const endTs = c.tsEnd || c.ts;
      if (!cur || c.ts - cur._last > gap) { cur = { items: [c], start: c.ts, end: endTs, _last: endTs }; groups.push(cur); }
      else { cur.items.push(c); cur.end = Math.max(cur.end, endTs); cur._last = endTs; }
    }
    for (const t of groups) {
      const countries = [...new Set(t.items.map((c) => c.cc).filter(Boolean))];
      const cities = [...new Set(t.items.filter((c) => c.city).map((c) => c.city))];
      const path = home ? [home, ...t.items, home] : t.items;
      result.push({
        isTrip: false, start: t.start, end: t.end, items: t.items,
        countries, cities, km: Math.round(legsKm(path)),
        title: cities.slice(0, 3).join(' · ') || 'Reise',
      });
    }
    return result.sort((a, b) => b.start - a.start); // neueste zuerst
  }

  // ---- Globus-Daten ----
  function points(list) {
    const m = new Map();
    for (const c of list) {
      const k = pkey(c);
      let e = m.get(k);
      if (!e) { e = { key: k, lat: c.lat, lon: c.lon, label: c.city || c.label, cc: c.cc, count: 0, business: 0, private: 0, car: 0, flight: 0 }; m.set(k, e); }
      e.count++; e[c.category] = (e[c.category] || 0) + 1; e[c.mode === 'flight' ? 'flight' : 'car']++;
      e.lat = c.lat; e.lon = c.lon;
    }
    return [...m.values()];
  }

  function legs(list, home, tripsById) {
    const out = [];
    const standalone = [];
    const byTrip = new Map();
    for (const c of list) {
      if (c.tripId) { if (!byTrip.has(c.tripId)) byTrip.set(c.tripId, []); byTrip.get(c.tripId).push(c); }
      else standalone.push(c);
    }
    // Daytrips: Nabe-Speiche — jede Strecke geht von Home zum Ort (und zurück).
    if (home) {
      const hk = pkey(home);
      for (const p of points(standalone)) {
        if (p.key === hk) continue;
        out.push({ startLat: home.lat, startLng: home.lon, endLat: p.lat, endLng: p.lon, count: p.count, category: p.private > p.business ? 'private' : 'business', mode: p.flight > p.car ? 'flight' : 'car', dist: H(home, p), kind: 'spoke' });
      }
    } else {
      const sorted = [...standalone].sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1], b = sorted[i];
        if (pkey(a) === pkey(b)) continue;
        out.push({ startLat: a.lat, startLng: a.lon, endLat: b.lat, endLng: b.lon, count: 1, category: b.category, mode: b.mode === 'flight' ? 'flight' : 'car', dist: H(a, b), kind: 'spoke' });
      }
    }
    // Multiday-Reisen: Kette der eigenen Pins (optional mit Home-Enden)
    for (const [tid, items] of byTrip) {
      const trip = getTrip(tripsById, tid);
      const sorted = [...items].sort((a, b) => a.ts - b.ts);
      const seq = [];
      for (const c of sorted) { if (!seq.length || pkey(seq[seq.length - 1]) !== pkey(c)) seq.push(c); }
      let chain = seq.map((c) => ({ lat: c.lat, lon: c.lon, category: c.category, mode: c.mode }));
      if (trip && trip.fromHome && home) chain = [{ lat: home.lat, lon: home.lon }, ...chain, { lat: home.lat, lon: home.lon }];
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1], b = chain[i];
        out.push({ startLat: a.lat, startLng: a.lon, endLat: b.lat, endLng: b.lon, count: 1, category: b.category || a.category || 'private', mode: (b.mode || a.mode) === 'flight' ? 'flight' : 'car', dist: H(a, b), kind: 'trip' });
      }
    }
    return out;
  }

  // Stempelpass: ein Stempel je Ort (Stadt), mit Anzahl, Zeitraum, Icon.
  function stamps(list) {
    const m = new Map();
    for (const c of list) {
      const k = pkey(c);
      let e = m.get(k);
      if (!e) { e = { key: k, city: c.city || c.label, cc: c.cc, count: 0, first: c.ts, last: c.ts }; m.set(k, e); }
      e.count++;
      if (c.ts < e.first) e.first = c.ts;
      if (c.ts > e.last) e.last = c.ts;
    }
    return [...m.values()]
      .map((s) => ({ ...s, icon: TM.geo.cityIcon(s.city, s.cc) }))
      .sort((a, b) => b.count - a.count || b.last - a.last);
  }

  return { pkey, filter, summary, trips, points, legs, legsKm, stamps };
})();
