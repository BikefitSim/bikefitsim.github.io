/* BikefitSim data file: a copy of your bikes and fits in a JSON file on your computer.
   Where the browser allows it (Chrome or Edge opening the page directly), a file is linked
   once and every change is written to it; the link is remembered and reconnected with one
   click on the next visit. Elsewhere the page offers a download and an open-file button. */
const GBFile = (() => {
  const DB = 'geobike-files'; // name kept so a data file you already linked stays linked
  const STORE = 'handles';
  const KEY = 'data';
  const TYPES = [{ description: 'BikefitSim data', accept: { 'application/json': ['.json'] } }];
  let handle = null;

  const topLevel = () => { try { return window.self === window.top; } catch (e) { return false; } };
  const canLink = () => typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function' && topLevel();

  // the linked file's handle is kept in IndexedDB so it survives a reload
  function idb(mode, op) {
    return new Promise((resolve, reject) => {
      let open;
      try { open = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        let tx; let req;
        try {
          tx = db.transaction(STORE, mode);
          req = op(tx.objectStore(STORE));
        } catch (e) { db.close(); reject(e); return; } // e.g. a handle that can't be stored
        tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }
  const keepHandle = (h) => idb('readwrite', (s) => s.put(h, KEY)).catch(() => {});
  const loadHandle = () => idb('readonly', (s) => s.get(KEY)).catch(() => null);
  const dropHandle = () => idb('readwrite', (s) => s.delete(KEY)).catch(() => {});

  async function allowed(h, ask) {
    const opts = { mode: 'readwrite' };
    try { if ((await h.queryPermission(opts)) === 'granted') return true; } catch (e) { return false; }
    if (!ask) return false;
    try { return (await h.requestPermission(opts)) === 'granted'; } catch (e) { return false; }
  }

  function pack(state, savedAt) {
    return JSON.stringify({ app: 'bikefitsim', format: 3, savedAt: new Date(savedAt || Date.now()).toISOString(), state }, null, 2) + '\n';
  }
  function unpack(text) {
    let j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (j && (j.app === 'bikefitsim' || j.app === 'geobike') && j.state) return { state: j.state, savedAt: Date.parse(j.savedAt) || 0 };
    if (j && j.v === 3 && (j.refs || j.ref)) return { state: j, savedAt: 0 };
    throw new Error('That file is not a BikefitSim data file.');
  }
  async function readFrom(h) {
    const f = await h.getFile();
    if (!f.size) return null; // a new, empty file
    return unpack(await f.text());
  }

  return {
    canLink,
    pack,
    unpack,
    get name() { return handle ? handle.name : ''; },
    get linked() { return !!handle; },
    /* On load: is a file linked from last time, and may we still write to it? */
    async restore() {
      if (!canLink()) return 'none';
      const h = await loadHandle();
      if (!h) return 'none';
      handle = h;
      return (await allowed(h, false)) ? 'granted' : 'prompt';
    },
    /* Must run from a click: asks again for permission on the remembered file. */
    reconnect() { return handle ? allowed(handle, true) : Promise.resolve(false); },
    /* Must run from a click: choose where to create the file. */
    async create(suggestedName) {
      const h = await window.showSaveFilePicker({ suggestedName, types: TYPES });
      handle = h;
      await keepHandle(h);
      return h.name;
    },
    /* Must run from a click: pick an existing file. Returns its contents and the handle,
       which only becomes the linked file once adopt() is called. */
    async pick() {
      const [h] = await window.showOpenFilePicker({ types: TYPES, multiple: false });
      const data = await readFrom(h);
      return { handle: h, name: h.name, data };
    },
    async adopt(h) {
      if (!(await allowed(h, true))) throw new Error('Permission to save to that file was not given.');
      handle = h;
      await keepHandle(h);
    },
    read() { return handle ? readFrom(handle) : Promise.resolve(null); },
    async write(state, savedAt) {
      if (!handle) return false;
      const w = await handle.createWritable();
      await w.write(pack(state, savedAt));
      await w.close();
      return true;
    },
    async unlink() { handle = null; await dropHandle(); },
  };
})();
