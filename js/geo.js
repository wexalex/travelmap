/* GPS, Reverse-/Forward-Geocoding (OpenStreetMap Nominatim) und Distanzen. */
window.TM = window.TM || {};
TM.geo = (function () {
  const BASE = 'https://nominatim.openstreetmap.org';
  const LANG = 'accept-language=de';

  function current() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Kein GPS verfügbar'));
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
        (e) => rej(e),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    });
  }

  function deriveCity(addr) {
    const a = addr || {};
    const city =
      a.city || a.town || a.village || a.municipality ||
      a.hamlet || a.suburb || a.county || a.state || '';
    return { city, country: a.country || '', cc: (a.country_code || '').toUpperCase() };
  }

  function makeLabel(city, cc, country, lat, lon) {
    const right = cc || country;
    return [city, right].filter(Boolean).join(', ') ||
      `${(+lat).toFixed(3)}, ${(+lon).toFixed(3)}`;
  }

  async function reverse(lat, lon) {
    const url = `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1&${LANG}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Geocoding fehlgeschlagen');
    const d = await r.json();
    const { city, country, cc } = deriveCity(d.address);
    return { lat: +lat, lon: +lon, city, country, cc, label: makeLabel(city, cc, country, lat, lon) };
  }

  async function search(q) {
    const url = `${BASE}/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&${LANG}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Suche fehlgeschlagen');
    const arr = await r.json();
    return arr.map((d) => {
      const { city, country, cc } = deriveCity(d.address);
      return {
        lat: +d.lat, lon: +d.lon, city, country, cc,
        label: makeLabel(city, cc, country, d.lat, d.lon),
        display: d.display_name,
      };
    });
  }

  function haversine(a, b) {
    const R = 6371, r = (x) => (x * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // ISO-3166 alpha-2 -> Flaggen-Emoji
  function flag(cc) {
    if (!cc || cc.length !== 2) return '🏳️';
    const A = 0x1f1e6;
    return String.fromCodePoint(
      A + cc.toUpperCase().charCodeAt(0) - 65,
      A + cc.toUpperCase().charCodeAt(1) - 65
    );
  }

  // Wiedererkennbares Icon pro Stadt (kuratiert) — sonst Landesflagge.
  const CITY_ICONS = {
    wien: '🎡', vienna: '🎡', salzburg: '🎼', graz: '🏰', innsbruck: '🏔️',
    klagenfurt: '🐉', bregenz: '⛵', linz: '🎨', villach: '🏔️', 'sankt anton': '🎿',
    münchen: '🍺', munchen: '🍺', munich: '🍺', berlin: '🐻', hamburg: '⚓',
    köln: '⛪', koln: '⛪', cologne: '⛪', frankfurt: '🏦', stuttgart: '🚗', düsseldorf: '👔', dusseldorf: '👔',
    zürich: '🏔️', zurich: '🏔️', genf: '⛲', geneva: '⛲', bern: '🐻', basel: '🎭', luzern: '🌉',
    paris: '🗼', lyon: '🦁', nizza: '🏖️', nice: '🏖️', marseille: '⛵', bordeaux: '🍷',
    barcelona: '⛪', madrid: '🥘', valencia: '🍊', sevilla: '💃', mallorca: '🏝️', palma: '🏝️',
    lissabon: '🚋', lisboa: '🚋', lisbon: '🚋', porto: '🍷',
    rom: '🏛️', rome: '🏛️', roma: '🏛️', mailand: '👗', milano: '👗', milan: '👗',
    venedig: '🛶', venezia: '🛶', venice: '🛶', florenz: '🎨', firenze: '🎨', neapel: '🍕', napoli: '🍕',
    amsterdam: '🚲', rotterdam: '🌉', 'den haag': '⚖️',
    brüssel: '🍫', brussel: '🍫', brussels: '🍫', bruxelles: '🍫', antwerpen: '💎',
    kopenhagen: '🧜', copenhagen: '🧜', stockholm: '🚢', oslo: '🎿', helsinki: '🌲',
    prag: '🕰️', prague: '🕰️', praha: '🕰️', budapest: '♨️', warschau: '🎹', warsaw: '🎹',
    krakau: '🐉', krakow: '🐉', bratislava: '🏰', ljubljana: '🐲', zagreb: '🎪',
    athen: '🏺', athens: '🏺', istanbul: '🕌', dublin: '🍀', edinburgh: '🏴',
    london: '💂', manchester: '⚽', birmingham: '🏭',
    'new york': '🗽', 'los angeles': '🌴', 'san francisco': '🌉', miami: '🏖️', chicago: '🌆',
    tokio: '🎌', tokyo: '🎌', kyoto: '⛩️', dubai: '🏙️', singapur: '🦁', singapore: '🦁',
    reykjavik: '🌋', reykjavík: '🌋', bangkok: '🛺', bali: '🌺', sydney: '🎭',
  };
  function cityIcon(city, cc) {
    if (city) {
      const key = city.toLowerCase().trim();
      if (CITY_ICONS[key]) return CITY_ICONS[key];
    }
    return flag(cc) !== '🏳️' ? flag(cc) : '📍';
  }

  return { current, reverse, search, haversine, flag, cityIcon };
})();
