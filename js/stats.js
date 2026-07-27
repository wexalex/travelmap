/* Auswertung: Filter, Kennzahlen, Reisegruppierung, Globus-Daten. */
window.TM = window.TM || {};
TM.stats = (function () {
  const H = TM.geo.haversine;

  // Ortsschlüssel: gleiche Stadt = ein Hub; sonst gerundete Koordinaten.
  function pkey(c) {
    if (c.city) return (c.cc || '') + '|' + c.city;
    return c.lat.toFixed(1) + ',' + c.lon.toFixed(1);
  }

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

  // Kilometer: mit Homebase = Summe der Hin-/Rückwege je Reise (immer von/nach Home).
  function totalKm(list, home, gapHours) {
    if (home) return trips(list, gapHours, home).reduce((s, t) => s + t.km, 0);
    return legsKm([...list].sort((a, b) => a.ts - b.ts));
  }

  function summary(list, home, gapHours) {
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
      km: Math.round(totalKm(sorted, home, gapHours)),
      topPlace: topPlace ? { label: topPlace.city || topPlace.label, cc: topPlace.cc, n: topN } : null,
      first: sorted[0] ? sorted[0].ts : null,
      last: sorted.length ? sorted[sorted.length - 1].ts : null,
    };
  }

  function trips(list, gapHours, home) {
    const gap = (gapHours || 48) * 3600e3;
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const out = [];
    let cur = null;
    for (const c of sorted) {
      const endTs = c.tsEnd || c.ts; // Zeitraum-Ende berücksichtigen
      if (!cur || c.ts - cur._last > gap) {
        cur = { items: [c], start: c.ts, end: endTs, _last: endTs };
        out.push(cur);
      } else {
        cur.items.push(c); cur.end = Math.max(cur.end, endTs); cur._last = endTs;
      }
    }
    return out.map((t) => {
      const countries = [...new Set(t.items.map((c) => c.cc).filter(Boolean))];
      const cities = [...new Set(t.items.filter((c) => c.city).map((c) => c.city))];
      // Mit Homebase: Weg von Home -> Orte -> Home
      const path = home ? [home, ...t.items, home] : t.items;
      return {
        start: t.start, end: t.end, items: t.items,
        countries, cities,
        km: Math.round(legsKm(path)),
        title: cities.slice(0, 3).join(' · ') || 'Reise',
      };
    }).reverse(); // neueste zuerst
  }

  // ---- Globus-Daten ----
  function points(list) {
    const m = new Map();
    for (const c of list) {
      const k = pkey(c);
      let e = m.get(k);
      if (!e) { e = { key: k, lat: c.lat, lon: c.lon, label: c.city || c.label, cc: c.cc, count: 0, business: 0, private: 0 }; m.set(k, e); }
      e.count++; e[c.category] = (e[c.category] || 0) + 1;
      e.lat = c.lat; e.lon = c.lon;
    }
    return [...m.values()];
  }

  function legs(list, home) {
    // Mit Homebase: Nabe-Speiche — jede Strecke geht von Home zum Ort (und zurück).
    if (home) {
      const hk = pkey(home);
      return points(list)
        .filter((p) => p.key !== hk)
        .map((p) => ({
          startLat: home.lat, startLng: home.lon, endLat: p.lat, endLng: p.lon,
          count: p.count, category: p.private > p.business ? 'private' : 'business',
        }));
    }
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const m = new Map();
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      const ka = pkey(a), kb = pkey(b);
      if (ka === kb) continue;
      const key = [ka, kb].sort().join('~');
      let e = m.get(key);
      if (!e) {
        e = { startLat: a.lat, startLng: a.lon, endLat: b.lat, endLng: b.lon, count: 0, category: b.category };
        m.set(key, e);
      }
      e.count++; e.category = b.category;
    }
    return [...m.values()];
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
