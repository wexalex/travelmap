/* IndexedDB wrapper — alles bleibt lokal am Gerät. */
window.TM = window.TM || {};
TM.db = (function () {
  const NAME = 'travelmap', VERSION = 2;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('checkins')) {
          const s = db.createObjectStore('checkins', { keyPath: 'id' });
          s.createIndex('ts', 'ts');
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('trips')) {
          db.createObjectStore('trips', { keyPath: 'id' }); // { id, name, fromHome }
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  function store(name, mode) {
    return open().then((db) => db.transaction(name, mode).objectStore(name));
  }
  function P(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  return {
    async allCheckins() {
      const s = await store('checkins', 'readonly');
      const list = await P(s.getAll());
      return list.sort((a, b) => a.ts - b.ts);
    },
    async putCheckin(c) {
      const s = await store('checkins', 'readwrite');
      return P(s.put(c));
    },
    async deleteCheckin(id) {
      const s = await store('checkins', 'readwrite');
      await P(s.delete(id));
      const p = await store('photos', 'readwrite');
      return P(p.delete(id));
    },
    async savePhoto(id, blob) {
      const s = await store('photos', 'readwrite');
      return P(s.put({ id, blob }));
    },
    async getPhoto(id) {
      const s = await store('photos', 'readonly');
      const r = await P(s.get(id));
      return r ? r.blob : null;
    },
    async allPhotos() {
      const s = await store('photos', 'readonly');
      return P(s.getAll());
    },
    async getSetting(key, def) {
      const s = await store('settings', 'readonly');
      const r = await P(s.get(key));
      return r ? r.value : def;
    },
    async setSetting(key, value) {
      const s = await store('settings', 'readwrite');
      return P(s.put({ key, value }));
    },
    async allTrips() {
      const s = await store('trips', 'readonly');
      return P(s.getAll());
    },
    async putTrip(t) {
      const s = await store('trips', 'readwrite');
      return P(s.put(t));
    },
    async deleteTrip(id) {
      // Trip löschen; zugehörige Pins wieder eigenständig machen (tripId = null)
      const cs = await store('checkins', 'readwrite');
      const all = await P(cs.getAll());
      for (const c of all) {
        if (c.tripId === id) { c.tripId = null; await P(cs.put(c)); }
      }
      const ts = await store('trips', 'readwrite');
      return P(ts.delete(id));
    },
  };
})();
