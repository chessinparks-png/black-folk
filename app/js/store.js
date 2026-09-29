// Local persistence. IndexedDB for player progress and the in-progress
// session; localStorage as a fallback; memory as a last resort.
(function (BF) {
  'use strict';

  const DB_NAME = 'black-folk';
  const STORE = 'state';
  const LS_PREFIX = 'black-folk:';
  const memory = {};

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (!globalThis.indexedDB) return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  function lsGet(key) {
    try {
      const v = localStorage.getItem(LS_PREFIX + key);
      return v == null ? undefined : JSON.parse(v);
    } catch (e) {
      return memory[key];
    }
  }
  function lsSet(key, value) {
    try {
      if (value === undefined) localStorage.removeItem(LS_PREFIX + key);
      else localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      memory[key] = value;
    }
  }

  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function get(key) {
    const db = await openDb();
    if (!db) return lsGet(key);
    try {
      return await tx(db, 'readonly', (s) => s.get(key));
    } catch (e) {
      return lsGet(key);
    }
  }

  async function set(key, value) {
    const db = await openDb();
    if (!db) return lsSet(key, value);
    try {
      // Store plain JSON copies so later in-memory mutation can't race the write.
      const copy = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      if (copy === undefined) await tx(db, 'readwrite', (s) => s.delete(key));
      else await tx(db, 'readwrite', (s) => s.put(copy, key));
    } catch (e) {
      lsSet(key, value);
    }
  }

  async function clearAll() {
    const db = await openDb();
    if (db) {
      try {
        await tx(db, 'readwrite', (s) => s.clear());
      } catch (e) {}
    }
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    for (const k of Object.keys(memory)) delete memory[k];
  }

  // Small settings live in localStorage (read synchronously at startup).
  const settings = {
    get() {
      return Object.assign({ theme: 'dark' }, lsGet('settings') || {});
    },
    set(s) {
      lsSet('settings', s);
    },
  };

  BF.store = { get, set, clearAll, settings };
})((globalThis.BF = globalThis.BF || {}));
