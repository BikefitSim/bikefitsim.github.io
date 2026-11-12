(() => {
  'use strict';
  // storage keys keep their old 'geobike' prefix so saved bikes survive the renames (Geobike, BikefitSim, Trindade Bikefit, Bikefit Simulator)
  const LS_KEY = 'geobike.v3';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MINUS = '−';
  const n0 = (v) => { const r = Math.round(v); return (r < 0 ? MINUS : '') + Math.abs(r); };
  const n1 = (v) => { const r = Math.round(v * 10) / 10; return (r < 0 ? MINUS : '') + Math.abs(r).toFixed(1).replace(/\.0$/, ''); };
  const sgn = (v, d = 0) => { const f = d ? 10 : 1; const r = Math.round(v * f) / f; if (r === 0) return '0'; return (r > 0 ? '+' : MINUS) + Math.abs(r).toFixed(d).replace(/\.0$/, ''); };
  const half = (v) => Math.round(v * 2) / 2;
  const r1 = (v) => Math.round(v * 10) / 10;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = (p = 'b') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const isObj = (o) => o && typeof o === 'object';

  const GEO_KEYS = ['sta', 'hta', 'htLength', 'ett', 'att', 'seatTube', 'seatTubeCC', 'bbDrop', 'forkA2C', 'forkOffset', 'stack', 'reach', 'chainstay', 'wheelbase', 'tyre', 'wheel'];
  const BLANK_GEO = { sta: null, hta: null, htLength: null, ett: null, att: null, seatTube: null, seatTubeCC: null, bbDrop: null, forkA2C: null, forkOffset: null, stack: null, reach: null, chainstay: null, wheelbase: null, tyre: null, wheel: null };
  /* Two kinds of reference, each with its own tab. A bikefit (kind 'bike') is a frame plus how
     it is set up (saddle, spacers, stem, hand position, handlebar); a personal fit (kind 'fit') is only the rider's
     numbers (saddle height as a straight line to the saddle tip, setback, personal reach, drop,
     hand width). Both keep their numbers in `fit`. There is always at least one of each. */
  const BLANK_FIT = () => ({
    saddleHeight: null, saddleLine: null, setback: null, handFrom: 'stem', riderReach: null, drop: null,
    stemLength: null, stemAngle: null, barWidth: null, spacers: null, stemH: null, handX: null, handY: null, hbDrop: null, hbReach: null, hbDiam: null, hbRise: null, tipToRails: null, railTravel: null, clampLen: null, saddleLen: null, saddleId: null, barId: null, railH: null,
  });
  /* Saved frames, saddles and cockpits: each has a name and the sizes below. References and
     target bikes only pick them (Z, 2026-11-12): a reference adds its saddle height, setback,
     spacers, stem length and angle; a personal fit its saddle height, setback, personal reach
     and drop. A picked frame's sizes are copied onto the bike that uses it (syncFrames), so the
     rest of the page reads them there. A handlebar's sizes are only used to draw it: the hand
     position, measured from the stem's bar clamp, sets the fit. */
  const PART_KINDS = ['saddle', 'bar'];
  const LIB_KINDS = ['frame', 'saddle', 'bar'];
  const PART_KEYS = { frame: GEO_KEYS, saddle: ['saddleLen', 'tipToRails', 'railTravel', 'railH', 'clampLen'], bar: ['stemH', 'handX', 'handY', 'barWidth', 'hbDrop', 'hbReach', 'hbDiam', 'hbRise'] }; // 'bar' is a saved cockpit
  const PART_WORD = { frame: 'frame', saddle: 'saddle', bar: 'cockpit' };
  const PART_LIST = { frame: 'frames', saddle: 'saddles', bar: 'bars' };
  const HAND_KEYS = ['handX', 'handY', 'barWidth'];
  const BAR_SIZE_KEYS = ['hbDrop', 'hbReach', 'hbDiam', 'hbRise'];
  /* Built-in sizes. A frame's empty tyre and wheel take these (only the ground view and the
     drawings use them). Saddles and cockpits have no defaults (Z, 2026-11-12): their empty sizes
     count as missing. Saves from before that used these for empty sizes, so fillBuiltins writes
     them into those saves. */
  const DEF_BUILTIN = { tipToRails: 125, railTravel: 60, clampLen: 35, saddleLen: 265, stemH: 40, handX: 50, handY: -4, barWidth: 380, tyre: 30, railH: 40, hbDiam: 31.8, wheel: 622 };
  // the sizes a saved saddle or cockpit must have (a cockpit's bar sizes are only drawn)
  const REQ_KEYS = { saddle: ['saddleLen', 'tipToRails', 'railTravel', 'railH', 'clampLen'], bar: ['stemH', 'handX', 'handY', 'barWidth'] };
  // what the Default references section held until 2026-11-11, when Z removed it (saddle and cockpit
  // sizes come from the saved saddles and cockpits, the seatpost clamp with the saddle); an empty field now
  // takes the built-in value
  const OLD_DEF_KEYS = ['saddleLen', 'tipToRails', 'railTravel', 'railH', 'clampLen', 'stemH', 'handX', 'handY', 'barWidth', 'tyre', 'wheel'];
  const blankRef = (kind, id, name) => Object.assign({ id, name, kind }, BLANK_GEO, { frameId: null, fit: BLANK_FIT() });
  const isFitRef = (r) => r.kind === 'fit';
  const KINDS = ['bike', 'fit'];
  const KIND_LABEL = { bike: 'Bikefit', fit: 'Personal fit' };
  const DEFAULT_NAME = { bike: 'Reference bike', fit: 'Personal fit' }; // new references are numbered from these
  // default names from earlier versions, so they read like the new ones
  function newDefaultName(name, kind) {
    const m = /^(?:Bike reference|Reference bike|Fit reference|Bike fit|Bikefit|Personal fit) (\d+)$/.exec(String(name || ''));
    return m ? `${DEFAULT_NAME[kind]} ${m[1]}` : name;
  }
  // the next free default name for a new reference: one more than the highest number in use
  function nextDefaultName(kind) {
    const re = new RegExp(`^${DEFAULT_NAME[kind]} (\\d+)$`);
    const nums = state.refs.filter((r) => r.kind === kind).map((r) => { const m = re.exec(r.name || ''); return m ? +m[1] : 0; });
    return `${DEFAULT_NAME[kind]} ${Math.max(nums.length, ...nums) + 1}`;
  }
  const BLANK = () => ({
    v: 3,
    example: true, // nothing entered yet
    sizes: 1, // saved saddles and cockpits carry all their sizes (see fillBuiltins)
    refs: [blankRef('bike', 'r1', 'Reference bike 1'), blankRef('fit', 'r2', 'Personal fit 1')],
    lastRef: { bike: 'r1', fit: 'r2' }, // the one last open in each tab
    defaults: {}, // no longer used (Default references was removed); kept so older saves and links read the same
    opts: { stemLengths: '60, 70, 80, 90, 100, 110, 120, 130, 140', stemAngles: '-25, -17, -10, -8, -6, 0, 6, 8, 10, 17, 25', spacerStep: 5, minSpacers: 0, maxSpacers: 40 }, // minSpacers empty: 0
    bikes: [Object.assign({ id: 'b1', name: 'Target bike 1', refId: 'r1' }, BLANK_GEO, { frameId: null, stemH: null, hbDrop: null, hbReach: null, hbDiam: null, hbRise: null, tipToRails: null, railTravel: null, clampLen: null, saddleLen: null, railH: null, saddleId: null, barId: null, pick: '' })],
    selected: 'b1',
    selectedRef: 'r1', refKind: 'bike',
    frames: [], saddles: [], bars: [], selPart: { frame: null, saddle: null, bar: null }, // saved frames, saddles and cockpits
  });

  /* Saves from before the hand position held a handlebar reach and width, which also set where
     the hands sat: on top of the bar, 30 mm behind its reach point, and 4 mm below the top of a
     40 mm stem's bar clamp. A reference gets that hand position (from its picked handlebar when it
     had one) and keeps the width as its hand width; the reach also stays as the handlebar's
     reach, which is now only drawn. An empty reach stays empty. */
  const handFromReach = (r) => (finite(r) ? { handX: r1(Math.max(0, r - 30)), handY: -4 } : {});
  function oldBar(o, kind, parts) { // kind: 'ref', 'def' (Default references), 'bike' or 'part'
    if (!isObj(o) || !('barReach' in o)) return o;
    const c = Object.assign({}, o); delete c.barReach;
    if (kind === 'def') { if (c.handX == null && c.handY == null) Object.assign(c, handFromReach(o.barReach)); return c; }
    if (kind === 'ref') {
      // a picked handlebar's sizes were used instead of the reference's own; an empty reach used
      // the Default references', which now give the hand position in the same way
      const pick = c.barId && Array.isArray(parts) ? parts.find((p) => isObj(p) && p.id === c.barId && 'barReach' in p) : null;
      const r = pick ? pick.barReach : o.barReach;
      if (c.handX == null && c.handY == null) Object.assign(c, handFromReach(r));
      if (pick) c.barWidth = finite(pick.barWidth) ? pick.barWidth : null;
    } else {
      // a saved handlebar keeps its width as the hand width too, and its reach gives it a hand position
      if (kind === 'part') { if (c.handX == null && c.handY == null) Object.assign(c, handFromReach(o.barReach)); } else delete c.barWidth;
    }
    if (c.hbReach == null && finite(o.barReach)) c.hbReach = o.barReach;
    return c;
  }
  /* Saved data keeps the v3 shape for good; fields are only ever added, with defaults
     filled in here. Saves made before several reference bikes existed hold a single
     `ref` plus `fit`; they load as the first reference bike. */
  function normalize(s) {
    const base = BLANK();
    if (!isObj(s) || s.v !== 3) return base;
    let refsIn = Array.isArray(s.refs) ? s.refs.filter(isObj) : null;
    if ((!refsIn || !refsIn.length) && isObj(s.ref) && isObj(s.fit)) refsIn = [Object.assign({}, s.ref, { id: 'r1', fit: s.fit })];
    if (!refsIn) return base;
    const refT = base.refs[0];
    const out = { v: 3, example: !!s.example, sizes: 1 };
    out.refs = refsIn.map((r) => {
      const fitIn = isObj(r.fit) ? oldBar(r.fit, 'ref', s.bars) : {};
      const fit = Object.assign(BLANK_FIT(), fitIn);
      // saves made before handlebar width existed read personal reach as a side-view distance
      if (!('barWidth' in fitIn)) fit.barWidth = 0;
      // and before the stem could be entered, the hands always came from personal reach and drop
      if (!('handFrom' in fitIn)) fit.handFrom = 'reach';
      const known = r.kind === 'bike' || r.kind === 'fit';
      const kind = known ? r.kind : 'bike';
      const o = Object.assign({}, refT, r, { id: String(r.id || uid('r')), kind, name: newDefaultName(r.name || refT.name, kind), fit });
      if (!known) stemFromReach(o);
      return o;
    });
    out.opts = Object.assign({}, base.opts, isObj(s.opts) ? s.opts : {});
    delete out.opts.posts; // a seatpost list from an earlier preview: the app tries inline and 20 mm itself
    out.defaults = Object.assign({}, base.defaults, isObj(s.defaults) ? oldBar(s.defaults, 'def') : {});
    const ids = new Set(out.refs.map((r) => r.id));
    const bikeT = Object.assign({}, base.bikes[0], { name: 'Target bike', pick: '' });
    out.bikes = (Array.isArray(s.bikes) ? s.bikes : []).filter(isObj).map((b) => {
      const o = Object.assign({}, bikeT, oldBar(b, 'bike'), { id: String(b.id || uid()) });
      if (!ids.has(o.refId)) o.refId = out.refs.length ? out.refs[0].id : null;
      return o;
    });
    // no target bike at all is allowed (Z); only a save without a bike list gets an empty one
    if (!out.bikes.length && !Array.isArray(s.bikes)) out.bikes = [newBikeFrom(out.refs[0] || null, 'Target bike 1')];
    out.selected = out.bikes.some((b) => b.id === s.selected) ? s.selected : out.bikes.length ? out.bikes[0].id : null;
    // the step 1 tab open (bike fit or personal fit); it can have no reference in it (Z: the last one can be deleted)
    out.refKind = KINDS.includes(s.refKind) ? s.refKind : (out.refs.find((r) => r.id === s.selectedRef) || out.refs[0] || { kind: 'bike' }).kind;
    const inKind = out.refs.filter((r) => r.kind === out.refKind);
    out.selectedRef = inKind.some((r) => r.id === s.selectedRef) ? s.selectedRef : inKind.length ? inKind[0].id : null;
    const lastIn = isObj(s.lastRef) ? s.lastRef : {};
    out.lastRef = {};
    for (const k of KINDS) {
      const ok = out.refs.find((r) => r.kind === k && r.id === lastIn[k]);
      const first = ok || out.refs.find((r) => r.kind === k);
      if (first) out.lastRef[k] = first.id;
    }
    if (out.selectedRef) out.lastRef[out.refKind] = out.selectedRef;
    // saved saddles and handlebars; a pick whose part is gone falls back to the fields
    const selIn = isObj(s.selPart) ? s.selPart : {};
    out.selPart = {};
    for (const kind of PART_KINDS) {
      const list = (Array.isArray(s[PART_LIST[kind]]) ? s[PART_LIST[kind]] : []).filter(isObj).map((p0) => {
        const p = kind === 'bar' ? oldBar(p0, 'part') : p0;
        const o = { id: String(p.id || uid(kind[0])), name: typeof p.name === 'string' ? p.name : '' };
        for (const k of PART_KEYS[kind]) o[k] = finite(p[k]) ? p[k] : null;
        return o;
      });
      out[PART_LIST[kind]] = list;
      const have = new Set(list.map((p) => p.id));
      out.selPart[kind] = have.has(selIn[kind]) ? selIn[kind] : null;
      const key = `${kind}Id`;
      for (const r of out.refs) if (!have.has(r.fit[key])) r.fit[key] = null;
      for (const b of out.bikes) if (!have.has(b[key])) b[key] = null;
    }
    // a save from when there were Default references keeps its results: their values go into the
    // empty fields of the saved parts and of the references that used them
    const moved = {};
    for (const k of OLD_DEF_KEYS) if (finite(out.defaults[k])) moved[k] = out.defaults[k];
    out.defaults = {};
    const empty = (v) => v == null || v === '';
    // the seatpost clamp was a bike field until it moved into saved saddles: a saddle without one
    // takes it from the first reference or target bike that picked it
    for (const p of out.saddles) {
      if (p.clampLen != null) continue;
      const user = [...out.refs.map((r) => r.fit), ...out.bikes].find((o) => o.saddleId === p.id && finite(o.clampLen));
      if (user) p.clampLen = user.clampLen;
    }
    for (const kind of PART_KINDS) {
      const keys = PART_KEYS[kind].filter((k) => k in moved);
      for (const p of out[PART_LIST[kind]]) for (const k of keys) if (p[k] == null) p[k] = moved[k];
      for (const r of out.refs) if (!r.fit[`${kind}Id`]) for (const k of keys) if (empty(r.fit[k])) r.fit[k] = moved[k];
    }
    for (const r of out.refs) for (const k of ['tyre', 'wheel']) if (k in moved && empty(r[k])) r[k] = moved[k];
    // saved frames; a pick whose frame is gone has no frame
    out.frames = (Array.isArray(s.frames) ? s.frames : []).filter(isObj).map((p) => {
      const o = { id: String(p.id || uid('f')), name: typeof p.name === 'string' ? p.name : '' };
      for (const k of GEO_KEYS) o[k] = finite(p[k]) ? p[k] : null;
      return o;
    });
    const haveF = new Set(out.frames.map((p) => p.id));
    out.selPart.frame = haveF.has(selIn.frame) ? selIn.frame : null;
    for (const o of [...out.refs, ...out.bikes]) if (o.kind === 'fit' || !haveF.has(o.frameId)) o.frameId = null;
    toLibrary(out);
    if (s.sizes !== 1) fillBuiltins(out);
    out.sizes = 1;
    syncFrames(out);
    return out;
  }
  /* Until 2026-11-12 references and target bikes could also take their frame, saddle and cockpit
     sizes in their own fields. Those sizes become saved frames, saddles and cockpits (one for each
     set of sizes, reusing a saved one with the same sizes) that the bikes then pick, so results stay
     the same. A target bike's empty fields meant its reference's values, so those are filled in. */
  const isSet = (v) => v != null && v !== '';
  function toLibrary(s) {
    const same = (a, b, keys) => keys.every((k) => (isSet(a[k]) ? a[k] : null) === (isSet(b[k]) ? b[k] : null));
    const numbered = (kind) => {
      const word = kind === 'saddle' ? 'Saddle' : 'Cockpit'; const re = new RegExp(`^${word} (\\d+)$`);
      const nums = s[PART_LIST[kind]].map((p) => { const m = re.exec(p.name || ''); return m ? +m[1] : 0; });
      return `${word} ${Math.max(nums.length, ...nums, 0) + 1}`;
    };
    const save = (kind, vals, name) => {
      const keys = PART_KEYS[kind];
      const hit = s[PART_LIST[kind]].find((p) => same(p, vals, keys));
      if (hit) return hit.id;
      const o = { id: uid(kind[0]), name: name || numbered(kind) };
      for (const k of keys) o[k] = isSet(vals[k]) ? vals[k] : null;
      s[PART_LIST[kind]].push(o);
      return o.id;
    };
    // a reference's saddle or cockpit sizes: its picked one's, else its own fields (empty = built in)
    const partVals = (kind, o) => {
      const p = o[`${kind}Id`] ? s[PART_LIST[kind]].find((x) => x.id === o[`${kind}Id`]) : null;
      const v = {}; for (const k of PART_KEYS[kind]) v[k] = p ? p[k] : o[k]; return v;
    };
    const ref = s.refs.find((r) => r.id === s.selectedRef) || s.refs[0] || null; // target bikes follow the reference open in step 1
    const rs = ref ? partVals('saddle', ref.fit) : {}; const rb = ref ? partVals('bar', ref.fit) : {};
    // references first, so their frames and parts get the first names
    for (const r of s.refs) {
      if (r.kind === 'bike' && !r.frameId && GEO_KEYS.some((k) => finite(r[k]))) r.frameId = save('frame', r, r.name || 'Reference bike');
      for (const kind of PART_KINDS) {
        const key = `${kind}Id`;
        const keys = kind === 'bar' && r.kind === 'fit' ? ['stemH', 'handX', 'handY', 'barWidth'] : PART_KEYS[kind];
        if (!r.fit[key] && keys.some((k) => isSet(r.fit[k]))) { const v = {}; for (const k of keys) v[k] = r.fit[k]; r.fit[key] = save(kind, v); }
        for (const k of PART_KEYS[kind]) r.fit[k] = null;
      }
    }
    for (const b of s.bikes) {
      if (!b.frameId && GEO_KEYS.some((k) => finite(b[k]))) {
        const v = {}; for (const k of GEO_KEYS) v[k] = b[k];
        if (ref && !isSet(v.tyre)) v.tyre = ref.tyre;
        if (ref && !isSet(v.wheel)) v.wheel = ref.wheel;
        b.frameId = save('frame', v, b.name || 'Target bike');
      }
      if (!b.saddleId && PART_KEYS.saddle.some((k) => isSet(b[k]))) {
        const v = {}; for (const k of PART_KEYS.saddle) v[k] = isSet(b[k]) ? b[k] : rs[k];
        b.saddleId = save('saddle', v);
      }
      if (!b.barId && ['stemH', ...BAR_SIZE_KEYS].some((k) => isSet(b[k]))) {
        const own = BAR_SIZE_KEYS.some((k) => isSet(b[k]));
        const v = { handX: rb.handX, handY: rb.handY, barWidth: rb.barWidth, stemH: isSet(b.stemH) ? b.stemH : rb.stemH };
        for (const k of BAR_SIZE_KEYS) v[k] = own ? b[k] : rb[k];
        b.barId = save('bar', v);
      }
      for (const kind of PART_KINDS) for (const k of PART_KEYS[kind]) b[k] = null;
    }
  }
  /* Saves and links from before 2026-11-12 used the built-in sizes for a saddle's or cockpit's
     empty sizes, and for a reference that picked no saddle or cockpit. Those sizes are written
     in, so results stay the same now that empty sizes count as missing. */
  const FIT_OWN = ['saddleHeight', 'saddleLine', 'setback', 'riderReach', 'drop', 'stemLength', 'stemAngle', 'spacers'];
  function fillBuiltins(s) {
    for (const kind of PART_KINDS) {
      const req = REQ_KEYS[kind]; const list = s[PART_LIST[kind]];
      for (const p of list) for (const k of req) if (!isSet(p[k])) p[k] = DEF_BUILTIN[k];
      const key = `${kind}Id`;
      const users = s.refs.filter((r) => !r.fit[key] && FIT_OWN.some((k) => isSet(r.fit[k])));
      if (!users.length) continue;
      let d = list.find((p) => PART_KEYS[kind].every((k) => (req.includes(k) ? p[k] === DEF_BUILTIN[k] : !isSet(p[k]))));
      if (!d) {
        d = { id: uid(kind[0]), name: `Default ${PART_WORD[kind]}` };
        for (const k of PART_KEYS[kind]) d[k] = req.includes(k) ? DEF_BUILTIN[k] : null;
        list.push(d);
      }
      for (const r of users) r.fit[key] = d.id;
    }
  }
  // a picked frame's sizes on every bike that uses it; no frame, no sizes
  function syncFrames(s = state) {
    const byId = new Map((s.frames || []).map((f) => [f.id, f]));
    for (const o of [...s.refs, ...s.bikes]) {
      const f = o.kind === 'fit' ? null : byId.get(o.frameId) || null;
      if (!f) o.frameId = null;
      for (const k of GEO_KEYS) o[k] = f ? f[k] : null;
    }
  }
  /* References saved before the two kinds existed are bikefits. Those that gave the hands
     by personal reach and drop get the stem those numbers imply on their frame (to 0.1 mm and
     0.1°, so the hands stay put), flagged until the stem actually fitted is entered. */
  function stemFromReach(o) {
    const f = o.fit;
    if (f.handFrom === 'stem') return;
    f.handFrom = 'stem';
    if (f.stemLength != null || f.stemAngle != null) return;
    const need = [o.sta, o.hta, f.saddleHeight, f.setback, f.riderReach, f.drop, f.spacers, f.barWidth];
    if (!need.every(finite)) return;
    try {
      const g = GB.frameGeometry(o);
      if (!finite(g.stack) || !finite(g.reach)) return;
      const fp = GB.fitPoints(Object.assign({}, o, { kind: 'bike' }), Object.assign({}, f, { handFrom: 'reach' }));
      if (fp.ok && finite(fp.stem.length) && finite(fp.stem.angle)) {
        f.stemLength = r1(fp.stem.length); f.stemAngle = r1(fp.stem.angle); f.stemImplied = true;
      }
    } catch (e) { /* left empty for the user to fill in */ }
  }
  function newBikeFrom(ref, name) {
    const b = { id: uid(), name, refId: ref ? ref.id : null, frameId: ref && ref.kind === 'bike' ? ref.frameId || null : null, stemH: null, hbDrop: null, hbReach: null, hbDiam: null, hbRise: null, tipToRails: null, railTravel: null, clampLen: null, saddleLen: null, railH: null, saddleId: null, barId: null, pick: '' };
    for (const k of GEO_KEYS) b[k] = ref ? ref[k] : null;
    return b;
  }

  // Bikes are kept in this browser. A data file or a share link carries them to another browser.
  const isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.localhost');

  // Browser copy: { state, savedAt }. Earlier saves stored the bare state, which still loads.
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (j && j.state) return { state: normalize(j.state), at: Date.parse(j.savedAt) || 0 };
      return { state: normalize(j), at: 0 };
    } catch (e) { return null; }
  }
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ state, savedAt: new Date(lastEdit).toISOString() })); return true; } catch (e) { return false; }
  }

  const localSnap = loadLocal();
  let state = localSnap ? localSnap.state : BLANK();
  let lastEdit = localSnap ? localSnap.at : 0; // time of the last change, saved with the data
  let loaded = false;                          // no saves until the page has started

  /* ---------- field definitions ---------- */
  const GEO_FIELDS = [
    { k: 'sta', l: 'Seat tube angle', u: '°' },
    { k: 'hta', l: 'Head tube angle', u: '°' },
    { k: 'htLength', l: 'Head tube length', u: 'mm' },
    { k: 'bbDrop', l: 'BB drop', u: 'mm', neg: true },
    { k: 'ett', l: 'Top tube (eff.)', u: 'mm', opt: true },
    { k: 'att', l: 'Top tube (actual)', u: 'mm', opt: true },
    { k: 'seatTube', l: 'Seat tube (c-t)', u: 'mm', opt: true },
    { k: 'seatTubeCC', l: 'Seat tube (c-c)', u: 'mm', opt: true },
    { k: 'forkA2C', l: 'Fork length', u: 'mm', opt: true },
    { k: 'forkOffset', l: 'Fork offset', u: 'mm' },
    { k: 'stack', l: 'Stack', u: 'mm', opt: true },
    { k: 'reach', l: 'Reach', u: 'mm', opt: true },
    { k: 'chainstay', l: 'Chainstay', u: 'mm', opt: true },
    { k: 'wheelbase', l: 'Wheelbase', u: 'mm', opt: true },
    { k: 'tyre', l: 'Tyre width', u: 'mm', opt: true },
    { k: 'wheel', l: 'Wheel size', type: 'select', opt: true }, // options: wheelField
  ];
  // wheel sizes by rim bead seat diameter; only the drawings use them (Z)
  const WHEELS = [[622, '700c / 29"'], [584, '650b / 27.5"'], [571, '650c'], [559, '26"']];
  // one entry per size (Z)
  // no size shown until one is picked (Z: no default values in a new frame); empty draws 700c
  const wheelField = Object.assign({}, GEO_FIELDS.find((f) => f.k === 'wheel'), { opts: [['', ''], ...WHEELS.map(([d, t]) => [String(d), t])] });
  const wheelHTML = (scope, obj) => fieldHTML(wheelField, scope, obj);
  const orDef = (v, k) => (v == null || v === '' ? DEF_BUILTIN[k] : v);
  // a reference with its picked saddle's and cockpit's sizes, for the calculation
  const partList = (kind) => state[PART_LIST[kind]] || [];
  const partOf = (kind, id) => (id ? partList(kind).find((p) => p.id === id) || null : null);
  const partName = (kind, p) => p.name || `Untitled ${PART_WORD[kind]}`;
  function effRef(r) {
    const fit = Object.assign({}, r.fit);
    for (const kind of PART_KINDS) { const p = partOf(kind, fit[`${kind}Id`]); if (p) for (const k of PART_KEYS[kind]) fit[k] = p[k]; }
    return Object.assign({}, r, { fit, tyre: orDef(r.tyre, 'tyre'), wheel: orDef(r.wheel, 'wheel') });
  }
  // a target bike with its reference's values (defaults included) where it leaves them empty;
  // its hand width and saddle are filled in by the engine, from the reference's fit
  const orRef = (v, rv) => (v == null || v === '' ? rv : v);
  // a picked saddle or cockpit gives its sizes; a target bike with no cockpit of its own keeps
  // its reference's stem height and hand position and is drawn with its reference's bar
  function effBike(b, ref) {
    const o = Object.assign({}, b);
    for (const kind of PART_KINDS) { const p = partOf(kind, b[`${kind}Id`]); if (p) for (const k of PART_KEYS[kind]) o[k] = p[k]; }
    if (!partOf('bar', b.barId) && BAR_SIZE_KEYS.every((k) => o[k] == null)) for (const k of BAR_SIZE_KEYS) o[k] = ref.fit[k];
    if (!partOf('bar', b.barId)) for (const k of HAND_KEYS) o[k] = ref.fit[k]; // no saved handlebar: the reference's hand position
    return Object.assign(o, { stemH: orRef(o.stemH, ref.fit.stemH), tyre: orDef(o.tyre, 'tyre'), wheel: orDef(o.wheel, 'wheel') });
  }
  const FF = {
    saddleHeight: { k: 'saddleHeight', l: 'Saddle height', u: 'mm' },
    saddleLine: { k: 'saddleLine', l: 'Saddle height', u: 'mm' },
    setback: { k: 'setback', l: 'Saddle setback', u: 'mm', neg: true },
    riderReach: { k: 'riderReach', l: 'Personal reach', u: 'mm' },
    drop: { k: 'drop', l: 'Hand drop', u: 'mm', neg: true },
    stemLength: { k: 'stemLength', l: 'Stem length', u: 'mm' },
    stemAngle: { k: 'stemAngle', l: 'Stem angle', u: '°', neg: true },
    spacers: { k: 'spacers', l: 'Spacers', u: 'mm' }, // short so the three stem fields fit on one line
  };
  /* A group title with its saved frame, saddle or cockpit picker beside it (Z). An empty pick is
     missing, except a target bike's saddle or cockpit, which then is the reference's. */
  const PICK_LABEL = { frame: 'Frame', saddle: 'Saddle', bar: 'Cockpit' };
  const pickNone = (kind, scope) => (kind !== 'frame' && scope === 'bike' ? 'Same as reference'
    : partList(kind).length ? `Choose a ${PART_WORD[kind]}` : `No ${PART_WORD[kind]}s saved yet`);
  const pickTitle = (kind, scope, obj) => {
    const f = { k: `${kind}Id`, l: PICK_LABEL[kind], type: 'select', opts: [['', pickNone(kind, scope)], ...partList(kind).map((p) => [p.id, partName(kind, p)])] };
    const id = `${scope}-${f.k}`;
    return `<h4 class="h-pick" data-m="${f.k}"><label for="${id}">${f.l}</label><span class="f-in">${fieldHTML(f, scope, obj).match(/<select[\s\S]*<\/select>/)[0]}</span></h4>`;
  };
  // the sizes of a saved saddle or cockpit, all needed but the bar's (only drawn); a frame's are GEO_FIELDS
  const PART_FIELDS = {
    saddle: [[
      { k: 'saddleLen', l: 'Saddle length', u: 'mm' },
      { k: 'tipToRails', l: 'Tip to rail centre', u: 'mm' },
      { k: 'railTravel', l: 'Saddle rail length', u: 'mm' },
      { k: 'railH', l: 'Rail height', u: 'mm' },
      { k: 'clampLen', l: 'Seatpost clamp', u: 'mm' },
    ]],
    // the hand position on one line, the bar's own sizes (only drawn) on the next (Z)
    bar: [[
      { k: 'stemH', l: 'Stem height', u: 'mm' },
      { k: 'handX', l: 'Hand X', u: 'mm', neg: true },
      { k: 'handY', l: 'Hand Y', u: 'mm', neg: true },
      { k: 'barWidth', l: 'Hand width', u: 'mm' },
    ], [
      { k: 'hbDrop', l: 'Bar drop', u: 'mm', opt: true },
      { k: 'hbReach', l: 'Bar reach', u: 'mm', opt: true },
      { k: 'hbDiam', l: 'Bar diameter', u: 'mm', opt: true },
      { k: 'hbRise', l: 'Bar rise', u: 'mm', opt: true },
    ]],
  };
  const OPT_FIELDS = [
    { k: 'stemLengths', l: 'Stem lengths', type: 'list', u: 'mm' },
    { k: 'stemAngles', l: 'Stem angles', type: 'list', u: '°' },
    { k: 'spacerStep', l: 'Spacer step', u: 'mm' },
    { k: 'minSpacers', l: 'Min spacers', u: 'mm', opt: true, ph: '0' },
    { k: 'maxSpacers', l: 'Max spacers', u: 'mm' },
  ];


  /* Fields where either one will do: each turns grey (optional) only once its partner, or the stack or reach
     value that replaces it, is filled in and it is itself empty. */
  const EITHER = { ett: ['att', 'reach'], att: ['ett', 'reach'], seatTube: ['seatTubeCC'], seatTubeCC: ['seatTube'], forkA2C: ['stack'] };
  const given = (v) => finite(v) && v > 0;
  const isOpt = (f, obj) => (EITHER[f.k] ? !given(obj[f.k]) && EITHER[f.k].some((k) => given(obj[k])) : !!f.opt);
  function refreshOptional(scope, obj) {
    for (const k of Object.keys(EITHER)) {
      const el = $(`${scope}-${k}`);
      if (el) el.closest('.f').classList.toggle('opt', isOpt({ k }, obj));
    }
  }
  function fieldHTML(f, scope, obj, placeholder = f.ph) {
    const id = `${scope}-${f.k}`;
    const v = obj[f.k];
    const hidden = f.hide && f.hide(obj) ? ' hidden' : '';
    let control;
    if (f.type === 'select') {
      control = `<select id="${id}" data-bind="${scope}.${f.k}">${f.opts.map(([val, txt]) => `<option value="${esc(val)}"${String(v) === val ? ' selected' : ''}>${esc(txt)}</option>`).join('')}</select>`;
    } else {
      const numAttrs = f.ro ? ' readonly aria-readonly="true" tabindex="-1"' : f.type === 'list' ? '' : ` data-num="1" inputmode="${f.neg ? 'text' : 'decimal'}"${f.opt ? ' data-opt="1"' : ''}`;
      control = `<input id="${id}"${f.ro ? '' : ` data-bind="${scope}.${f.k}"`} type="text"${numAttrs} autocomplete="off" spellcheck="false" value="${esc(v ?? '')}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>`;
    }
    return `<label class="f${f.ro ? ' ro' : ''}${isOpt(f, obj) ? ' opt' : ''}" for="${id}" data-m="${esc(f.k)}"${hidden}><span class="f-l">${esc(f.l)}</span><span class="f-in">${control}${f.u ? `<span class="u">${esc(f.u)}</span>` : ''}</span></label>`;
  }
  function nameHTML(scope, value) {
    return `<label class="f" for="${scope}-name"><span class="f-l">Name</span><span class="f-in"><input id="${scope}-name" data-bind="${scope}.name" type="text" autocomplete="off" value="${esc(value)}"></span></label>`;
  }
  function calcPlaceholders(b) {
    const g = GB.frameGeometry(Object.assign({}, b, { stack: null, reach: null }));
    const fork = GB.forkFromStack(b);
    return { stack: g.stackCalc != null ? `calc. ${Math.round(g.stackCalc)}` : '', reach: g.reachCalc != null ? `calc. ${Math.round(g.reachCalc)}` : '', forkA2C: fork != null ? `calc. ${Math.round(fork)}` : '' };
  }
  function geoFieldsHTML(scope, b) {
    const ph = calcPlaceholders(b);
    return GEO_FIELDS.map((f) => (f.k === 'wheel' ? wheelHTML(scope, b) : fieldHTML(f, scope, b, ph[f.k]))).join('');
  }
  function refreshPlaceholders(scope, b) {
    const ph = calcPlaceholders(b);
    for (const k of ['stack', 'reach', 'forkA2C']) { const el = $(`${scope}-${k}`); if (el) el.placeholder = ph[k]; }
  }

  /* ---------- rendering: inputs ---------- */
  // the reference open in step 1; none when its tab (bike fit or personal fit) is empty
  const curRef = () => state.refs.find((r) => r.id === state.selectedRef && r.kind === viewKind()) || null;
  const viewKind = () => (KINDS.includes(state.refKind) ? state.refKind : 'bike');
  const curBike = () => state.bikes.find((b) => b.id === state.selected) || state.bikes[0];
  const refName = (r) => r.name || 'Untitled reference';

  const kindName = (r) => KIND_LABEL[r.kind].toLowerCase();
  const ofKind = (k) => state.refs.filter((r) => r.kind === k);
  function selectRef(id) {
    const r = state.refs.find((x) => x.id === id);
    if (!r) return;
    state.selectedRef = id; state.refKind = r.kind;
    if (!isObj(state.lastRef)) state.lastRef = {};
    state.lastRef[r.kind] = id;
  }
  function renderRefTabs() {
    const kind = viewKind();
    $('refKinds').innerHTML = KINDS.map((k) => `<button class="kind-tab" role="tab" type="button" data-refkind="${k}" aria-selected="${k === kind}">${KIND_LABEL[k]}<span class="n">${ofKind(k).length}</span></button>`).join('');
    $('refTabs').setAttribute('aria-label', `${KIND_LABEL[kind]}s`);
    $('refTabs').innerHTML = ofKind(kind).map((r) => `<button class="tab" role="tab" type="button" data-reftab="${esc(r.id)}" aria-selected="${r.id === state.selectedRef}">${esc(refName(r))}</button>`).join('')
      + `<button class="tab add" type="button" id="addRef" data-kind="${kind}">+ Add ${KIND_LABEL[kind].toLowerCase()}</button>`;
  }
  function renderRefForm() {
    const r = curRef();
    if (!r) {
      const w = KIND_LABEL[viewKind()].toLowerCase();
      $('refName').innerHTML = ''; $('refActions').innerHTML = '';
      $('refForm').innerHTML = `<div class="empty">No ${w}. Add one with + Add ${w}.</div>`;
      return;
    }
    // three columns, pickers on one line (Z): a reference only picks its parts, then adds how they are set up
    const fields = (list) => `<div class="fields">${list.map((f) => fieldHTML(f, 'fit', r.fit)).join('')}</div>`;
    $('refName').innerHTML = nameHTML('ref', r.name);
    $('refForm').innerHTML = isFitRef(r)
      ? `<div class="grp">${pickTitle('saddle', 'fit', r.fit)}${fields([FF.saddleLine, FF.setback])}</div>
        <div class="grp">${pickTitle('bar', 'fit', r.fit)}${fields([FF.riderReach, FF.drop])}</div>`
      : `<div class="grp">${pickTitle('frame', 'ref', r)}</div>
        <div class="grp">${pickTitle('saddle', 'fit', r.fit)}${fields([FF.saddleHeight, FF.setback])}</div>
        <div class="grp">${pickTitle('bar', 'fit', r.fit)}${fields([FF.spacers, FF.stemLength, FF.stemAngle])}</div>`;
    const ready = !!(model && model.refs && model.refs[r.id] && model.refs[r.id].fp); // renderCP keeps this up to date
    $('refActions').innerHTML = `
      <button class="btn" type="button" id="dupRef">Copy as new ${kindName(r)}</button>
      ${isFitRef(r) ? '' : `<button class="btn" type="button" id="toFitRef"${ready ? '' : ' hidden'}>Copy as personal fit</button>`}
      <button class="btn danger" type="button" id="delRef">Delete ${kindName(r)}</button>`;
  }
  function renderOptFields() {
    // the stem lists on one wide line, the spacer fields under them (Z)
    const row = (fs, cls) => `<div class="fields${cls}">${fs.map((f) => fieldHTML(f, 'opts', state.opts)).join('')}</div>`;
    $('optFields').innerHTML = row(OPT_FIELDS.filter((f) => f.type === 'list'), ' lists') + row(OPT_FIELDS.filter((f) => f.type !== 'list'), '');
  }
  function renderTabs() {
    $('tabs').innerHTML = state.bikes.map((b) => `<button class="tab" role="tab" type="button" data-tab="${esc(b.id)}" aria-selected="${b.id === state.selected}">${esc(b.name || 'Untitled bike')}</button>`).join('')
      + '<button class="tab add" type="button" id="addBike">+ Add target bike</button>';
  }
  function renderBikeForm() {
    const b = curBike();
    if (!b) { $('bikeForm').innerHTML = '<div class="empty">No target bike. Add one with + Add target bike.</div>'; return; }
    $('bikeForm').innerHTML = `
      <div class="ref-name">${nameHTML('bike', b.name)}</div>
      <div class="pick-grid">
        <div class="grp">${pickTitle('frame', 'bike', b)}</div>
        <div class="grp">${pickTitle('saddle', 'bike', b)}</div>
        <div class="grp">${pickTitle('bar', 'bike', b)}</div>
      </div>
      <div class="ref-checks" id="bikeCard" aria-live="polite" hidden></div>
      <div class="row-actions">
        <button class="btn" type="button" id="dupBike">Copy as new target bike</button>
        <button class="btn danger" type="button" id="delBike">Delete target bike</button>
      </div>`;
    renderBikeCP();
  }
  /* ---------- saved frames, saddles and cockpits ---------- */
  const curPart = (kind) => partOf(kind, state.selPart && state.selPart[kind]) || partList(kind)[0] || null;
  function nextPartName(kind) {
    const word = PICK_LABEL[kind];
    const re = new RegExp(`^${word} (\\d+)$`);
    const nums = partList(kind).map((p) => { const m = re.exec(p.name || ''); return m ? +m[1] : 0; });
    return `${word} ${Math.max(nums.length, ...nums, 0) + 1}`;
  }
  function renderParts() {
    for (const kind of LIB_KINDS) {
      const list = partList(kind); const cur = curPart(kind); const word = PART_WORD[kind];
      $(`${kind}Tabs`).innerHTML = list.map((p) => `<button class="tab" role="tab" type="button" data-parttab="${kind}" data-id="${esc(p.id)}" aria-selected="${!!cur && p.id === cur.id}">${esc(partName(kind, p))}</button>`).join('')
        + `<button class="tab add" type="button" data-addpart="${kind}">+ Add ${word}</button>`;
      $(`${kind}Form`).innerHTML = cur ? `
        <div class="ref-name">${nameHTML(kind, cur.name)}</div>
        ${kind === 'frame' ? `<div class="fields">${geoFieldsHTML('frame', cur)}</div>` : PART_FIELDS[kind].map((row) => `<div class="fields">${row.map((f) => fieldHTML(f, kind, cur)).join('')}</div>`).join('')}
        <div class="ref-checks" id="${kind}Card" aria-live="polite" hidden></div>
        <div class="row-actions">
          <button class="btn" type="button" data-duppart="${kind}">Copy as new ${word}</button>
          <button class="btn danger" type="button" data-delpart="${kind}">Delete ${word}</button>
        </div>` : '';
    }
    renderPartChecks();
  }
  // what a saved frame, saddle or cockpit still needs, under its sizes
  function renderPartChecks() {
    for (const kind of LIB_KINDS) {
      const el = $(`${kind}Card`); const cur = curPart(kind);
      if (el) showChecks(el, cur ? errItems(partErrors(kind, cur)) : []);
    }
  }
  function renderInputs() {
    renderParts(); renderRefTabs(); renderRefForm(); renderOptFields(); renderTabs(); renderBikeForm();
    if (!loaded) document.querySelectorAll('[data-bind]').forEach((el) => { if (el.tagName === 'SELECT') el.disabled = true; else el.readOnly = true; });
  }

  /* ---------- validation and calculation ---------- */
  const lc = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  function checker(obj, what) {
    const missing = []; const wrong = [];
    const chk = (k, lo, hi, name, unit = '') => {
      if (obj[k] == null || obj[k] === '') { missing.push(lc(name)); return; }
      if (!finite(obj[k]) || obj[k] < lo || obj[k] > hi) wrong.push(`${name} should be between ${lo} and ${hi}${unit}.`);
    };
    const done = () => (missing.length ? [`${what} still needs: ${missing.join(', ')}.`] : []).concat(wrong);
    return { chk, missing, wrong, done };
  }
  function geoErrors(b, what = 'The frame') {
    const c = checker(b, what);
    c.chk('sta', 60, 85, 'Seat tube angle'); c.chk('hta', 60, 80, 'Head tube angle');
    c.chk('htLength', 50, 300, 'Head tube length');
    if (b.seatTube == null && b.seatTubeCC == null) c.missing.push('seat tube, c-t or c-c');
    if (b.seatTube != null) c.chk('seatTube', 200, 750, 'Seat tube (c-t)');
    if (b.seatTubeCC != null) c.chk('seatTubeCC', 200, 750, 'Seat tube (c-c)');
    c.chk('bbDrop', -40, 110, 'BB drop'); c.chk('forkOffset', 0, 80, 'Fork offset');
    const hasStack = finite(b.stack) && b.stack > 0;
    if (b.forkA2C != null && b.forkA2C !== '') c.chk('forkA2C', 300, 600, 'Fork length');
    else if (!hasStack) c.missing.push('fork length (or stack)');
    else if (finite(b.htLength) && finite(b.forkOffset) && finite(b.bbDrop) && finite(b.hta)) {
      const fork = GB.forkFromStack(b);
      if (fork < 300 || fork > 600) c.wrong.push(`The stack gives a fork length of ${Math.round(fork)} mm, outside 300 to 600. Check the stack, head tube length and BB drop.`);
    }
    const hasReach = finite(b.reach) && b.reach > 0;
    if (!hasReach) {
      if (b.ett == null && b.att == null) c.missing.push('top tube, effective or actual (or reach)');
      if (b.ett != null && !(finite(b.ett) && b.ett > 350)) c.wrong.push('Effective top tube should be over 350.');
      if (b.att != null && !(finite(b.att) && b.att > 350)) c.wrong.push('Actual top tube should be over 350.');
      if (b.ett == null && b.att != null && !c.missing.length && !c.wrong.length && GB.frameGeometry(b).reach == null) {
        c.wrong.push('The actual top tube is too short to reach the head tube from this seat tube. Check both.');
      }
    }
    if (finite(b.stack) && (b.stack < 300 || b.stack > 800)) c.wrong.push('Stack should be between 300 and 800.');
    if (hasReach && (b.reach < 250 || b.reach > 600)) c.wrong.push('Reach should be between 250 and 600.');
    if (b.chainstay != null && b.chainstay !== '' && !(finite(b.chainstay) && b.chainstay >= 350 && b.chainstay <= 500)) c.wrong.push('Chainstay should be between 350 and 500.');
    if (b.wheelbase != null && b.wheelbase !== '' && !(finite(b.wheelbase) && b.wheelbase >= 850 && b.wheelbase <= 1300)) c.wrong.push('Wheelbase should be between 850 and 1300.');
    if (b.tyre != null && b.tyre !== '' && !(finite(b.tyre) && b.tyre >= 18 && b.tyre <= 60)) c.wrong.push('Tyre width should be between 18 and 60.');
    return c.done();
  }
  // a handlebar's sizes, only drawn: each one checked when it is given
  function barChk(c, f) {
    if (f.hbDrop != null) c.chk('hbDrop', 0, 200, 'Bar drop', ' mm');
    if (f.hbReach != null) c.chk('hbReach', 0, 150, 'Bar reach', ' mm');
    if (f.hbDiam != null) c.chk('hbDiam', 20, 40, 'Bar diameter', ' mm');
    if (f.hbRise != null) c.chk('hbRise', 0, 100, 'Bar rise', ' mm');
  }
  // a saved frame's, saddle's or cockpit's missing or wrong sizes
  const partLabel = (kind, p) => `The ${PART_WORD[kind]} "${partName(kind, p)}"`;
  function partErrors(kind, p) {
    if (kind === 'frame') return geoErrors(p, partLabel(kind, p));
    const c = checker(p, partLabel(kind, p));
    if (kind === 'saddle') {
      c.chk('saddleLen', 150, 350, 'Saddle length', ' mm'); c.chk('tipToRails', 50, 300, 'Tip to rail centre', ' mm');
      c.chk('railTravel', 20, 120, 'Saddle rail length', ' mm'); c.chk('railH', 20, 100, 'Rail height', ' mm');
      c.chk('clampLen', 10, 80, 'Seatpost clamp', ' mm');
      if (finite(p.clampLen) && finite(p.railTravel) && p.clampLen >= p.railTravel) c.wrong.push('The seatpost clamp has to be shorter than the saddle rail length.');
    } else {
      c.chk('stemH', 20, 80, 'Stem height', ' mm'); c.chk('handX', -150, 300, 'Hand X', ' mm');
      c.chk('handY', -200, 200, 'Hand Y', ' mm'); c.chk('barWidth', 0, 900, 'Hand width', ' mm');
      barChk(c, p);
    }
    return c.done();
  }
  // a reference's own numbers (its frame, saddle and cockpit are checked with partErrors)
  function fitErrors(r) {
    const f = r.fit;
    if (isFitRef(r)) {
      const c = checker(f, 'The fit');
      c.chk('saddleLine', 400, 1000, 'Saddle height', ' mm'); c.chk('setback', -100, 200, 'Saddle setback', ' mm');
      c.chk('riderReach', 300, 900, 'Personal reach', ' mm'); c.chk('drop', -300, 300, 'Hand drop', ' mm');
      return c.done();
    }
    const c = checker(f, 'The setup');
    c.chk('saddleHeight', 450, 1000, 'Saddle height', ' mm'); c.chk('setback', -100, 200, 'Saddle setback', ' mm');
    c.chk('spacers', 0, 120, 'Spacers', ' mm'); c.chk('stemLength', 20, 200, 'Stem length', ' mm'); c.chk('stemAngle', -45, 45, 'Stem angle', '°');
    return c.done();
  }
  function optErrors() {
    const o = state.opts; const e = [];
    const blank = (v) => v == null || String(v).trim() === '';
    const missing = [['stemLengths', 'stem lengths'], ['stemAngles', 'stem angles'], ['spacerStep', 'spacer step'], ['maxSpacers', 'max spacers']].filter(([k]) => blank(o[k])).map(([, l]) => l);
    if (missing.length) e.push(`Component options still needs: ${missing.join(', ')}.`);
    if (!blank(o.stemLengths) && !GB.parseList(o.stemLengths, { min: 20, max: 200 }).length) e.push('Add at least one stem length.');
    if (!blank(o.stemAngles) && !GB.parseList(o.stemAngles, { min: -45, max: 45 }).length) e.push('Add at least one stem angle.');
    if (!blank(o.spacerStep) && (!finite(o.spacerStep) || o.spacerStep <= 0)) e.push('Spacer step should be a positive number.');
    if (!blank(o.maxSpacers) && (!finite(o.maxSpacers) || o.maxSpacers < 0)) e.push('Max spacers should be 0 or more.');
    if (finite(o.minSpacers) && o.minSpacers < 0) e.push('Min spacers should be 0 or more.');
    else if (finite(o.minSpacers) && finite(o.maxSpacers) && o.minSpacers > o.maxSpacers) e.push('Min spacers should not be more than max spacers.');
    return e;
  }

  let model = null;
  // what a reference or target bike hasn't picked yet
  const NEEDS = (what, list) => `This ${what} still needs: ${list.join(', ')}. Pick ${list.length > 1 ? 'them' : 'it'} from Library.`;
  function compute() {
    syncFrames();
    const oe = optErrors();
    const refs = {};
    for (const r0 of state.refs) {
      const r = effRef(r0);
      const need = []; const pe = [];
      const fr = isFitRef(r) ? null : partOf('frame', r.frameId);
      if (!isFitRef(r)) { if (fr) pe.push(...partErrors('frame', fr)); else need.push('a frame'); }
      const frameOk = !!fr && !pe.length;
      for (const kind of PART_KINDS) {
        const p = partOf(kind, r.fit[`${kind}Id`]);
        if (p) pe.push(...partErrors(kind, p)); else need.push(`a ${PART_WORD[kind]}`);
      }
      const errs = [...(need.length ? [NEEDS(isFitRef(r) ? 'personal fit' : 'bikefit', need)] : []), ...pe, ...fitErrors(r)];
      let fp = null;
      if (!errs.length) {
        fp = GB.fitPoints(r, isFitRef(r) ? r.fit : Object.assign({}, r.fit, { handFrom: 'stem' }));
        if (!fp.ok) { errs.push(fp.error); fp = null; }
      }
      // a bikefit has to carry its own setback: when neither an inline nor a 20 mm offset seatpost
      // puts its saddle on its rails (beyond the 5 mm tolerance), that is an error, not a note
      let railBad = false;
      if (fp && fp.rail && fp.rail.check && fp.rail.check.level === 'bad') {
        errs.push(refRailTxt(fp.rail));
        fp = null; railBad = true;
      }
      // stack, reach or wheelbase that disagree with the tubes: shown with the frame in step 1
      const frame = frameOk ? GB.frameChecks(r) : [];
      refs[r.id] = { errs, fp, eff: r, railBad, frame };
    }
    const res = {};
    for (const b0 of state.bikes) {
      const rm = curRef() ? refs[curRef().id] : null;
      const ref = rm ? rm.eff : effRef(blankRef('bike', 'none', '')); // with no reference, only the bike's own numbers are checked
      const b = effBike(b0, ref);
      const fr = partOf('frame', b.frameId);
      const be = fr ? partErrors('frame', fr) : [NEEDS('target bike', ['a frame'])];
      const frameOk = !be.length;
      for (const kind of PART_KINDS) { const p = partOf(kind, b0[`${kind}Id`]); if (p) be.push(...partErrors(kind, p)); }
      // what step 2 shows under the target bike's fields: its own missing or wrong numbers, then the frame checks
      const own = { bikeErrors: be, frame: frameOk ? GB.frameChecks(b) : [] };
      if (!rm) res[b.id] = Object.assign({ refErrors: [], noRef: true, ref }, own);
      else if (!rm.fp) res[b.id] = Object.assign({ refErrors: rm.errs, ref }, own);
      else if (be.length) res[b.id] = Object.assign({ errors: be, ref }, own);
      else if (oe.length) res[b.id] = Object.assign({ optErrors: oe, ref }, own); // shown under Component options (Z)
      else {
        const sol = GB.solveBike(b, rm.fp, ref.fit, state.opts);
        // a Problem line (saddle off its rails, too little seatpost): step 3 shows only the checks,
        // with no results, drawings or summary column. No stem reaching the hands is a Problem line
        // too, but the closest options, results and drawings still show (Z)
        res[b.id] = Object.assign(sol, { ref, fp: rm.fp, problems: sol.checks.some((c) => c.level === 'bad' && !c.hand) }, own);
      }
    }
    model = { refs, res, optErrors: oe };
  }
  const optKey = (o) => `${o.angle}|${o.length}`;
  function chosenFor(b, r) {
    if (!r || !r.cockpit || !r.cockpit.best) return null;
    return r.cockpit.all.find((o) => optKey(o) === b.pick) || r.cockpit.best;
  }
  const angTxt = (a) => `${a > 0 ? '+' : a < 0 ? MINUS : ''}${String(Math.abs(a)).replace(/\.0$/, '')}°`;
  const stemTxt = (o) => `${o.length} mm ${angTxt(o.angle)}`;
  const refStem = (fp) => ({ length: Math.round(fp.stem.length), angle: half(fp.stem.angle) });
  const missTxt = (o) => {
    if (o.err < 1) return 'on target';
    const bits = [];
    if (Math.abs(o.dx) >= 0.5) bits.push(`${Math.abs(Math.round(o.dx))} mm ${o.dx > 0 ? 'long' : 'short'}`);
    if (Math.abs(o.dy) >= 0.5) bits.push(`${Math.abs(Math.round(o.dy))} mm ${o.dy > 0 ? 'high' : 'low'}`);
    return bits.join(', ') || 'on target';
  };
  const deltaTxt = (v, d = 0) => (Math.abs(v) < (d ? 0.05 : 0.5) ? 'same as reference' : `${sgn(v, d)} mm vs reference`);
  function stemChange(o, fp) {
    const rs = refStem(fp);
    const dl = o.length - rs.length;
    const sameAngle = Math.abs(o.angle - rs.angle) < 0.75;
    if (Math.abs(dl) < 1 && sameAngle) return 'Same as reference';
    const lenPart = Math.abs(dl) < 1 ? 'Same length' : `${Math.abs(dl)} mm ${dl > 0 ? 'longer' : 'shorter'}`;
    return `${lenPart}${sameAngle ? ', same angle' : `, ${angTxt(o.angle)} instead of ${angTxt(rs.angle)}`}`;
  }

  // the seatpost the app picks and where the saddle then sits on its rails
  const railPosTxt = (p) => (Math.abs(p) < 0.5 ? 'centred on its rails' : `${n0(Math.abs(p))} mm ${p > 0 ? 'forward' : 'back'} of the middle of its rails`);
  const postTxt = (o, art) => `${art ? (o && !/^(8|1[18])(\D|$)/.test(n0(o)) ? 'a ' : 'an ') : ''}${o ? `${n0(o)} mm offset seatpost` : 'inline seatpost'}`;
  // a bikefit whose setback neither seatpost reaches: an error
  function refRailTxt(rail) {
    const c = rail.check;
    const nums = "the setback and the saddle's tip to rail centre, rail length and rail height";
    const next = c.need > 0.5 && c.need <= 40
      ? ` It would take a seatpost with about ${Math.ceil(c.need / 5) * 5} mm offset. Check ${nums}.`
      : ` Check ${nums}.`;
    return `Neither an inline nor a 20 mm offset seatpost puts this saddle on its rails at this setback. With ${postTxt(rail.postOffset, true)}, the saddle would have to sit about ${n0(c.over)} mm further ${c.fwd ? 'forward' : 'back'} than its ${n0(rail.railTravel)} mm rail markings allow with the ${n0(rail.clampLen)} mm clamp.${next}`;
  }
  // the seatposts (inline, 20 mm offset) that keep the clamp within the rail markings
  const postsThatFit = (r) => r.postTries.filter((t) => t.railOver <= 0.5).map((t) => t.postOffset).sort((a, b) => a - b);
  const fitTxt = (fits) => (fits.length > 1 ? 'inline or 20 mm offset seatpost' : postTxt(fits[0]));
  /* ---------- rendering: outputs ---------- */

  function renderCP() {
    const el = $('cpCard');
    const r = curRef();
    if (!r) { showChecks(el, []); return; }
    const m = model.refs[r.id];
    const fitRef = isFitRef(r);
    const sb = $('fit-setback'); if (sb && !fitRef) markField(sb, !!m.railBad);
    const tf = $('toFitRef'); if (tf) tf.hidden = !m.fp; // beside Copy as new bikefit, once the fit can be worked out
    // the same Check / Problem lines as step 3, under the fields; nothing when all is well
    const items = errItems(m.errs);
    if (m.fp && !fitRef) {
      const f = m.eff.fit;
      if (m.fp.rail.check) items.push([m.fp.rail.check.level || 'warn', m.fp.rail.check.text]);
      if (f.stemImplied) items.push(['warn', 'This stem was worked out from the personal reach and drop saved earlier. Enter the stem actually fitted on this bike.']);
    }
    for (const c of m.frame) items.push([c.level, c.text]);
    showChecks(el, items);
  }
  // step 2: the target bike's missing or wrong numbers and the frame checks
  function renderBikeCP() {
    const el = $('bikeCard');
    if (!el || !model || !curBike()) return;
    const r = model.res[curBike().id];
    showChecks(el, r ? errItems(r.bikeErrors).concat(r.frame.map((c) => [c.level, c.text])) : []);
  }
  const errItems = (errs) => errs.map((x) => [x.includes('still needs:') ? 'warn' : 'bad', x]);
  function showChecks(el, items) {
    el.innerHTML = items.length ? `<ul class="checks">${items.map(([lv, t]) => `<li class="${lv}">${esc(t)}</li>`).join('')}</ul>` : '';
    el.hidden = !items.length;
  }

  /* Order of the stem and spacer options in Component options: by how close the bar gets (always the default),
     or by how far forward or how high it ends up. Clicking a sort button again flips it
     (closest/furthest, most/least first). */
  const OPT_SORTS = [['miss', 'Closest', 'Furthest'], ['reach', 'Most reach', 'Least reach'], ['stack', 'Most stack', 'Least stack']];
  let optSort = 'miss';
  let optLeast = false; // the flipped order: furthest, least reach or least stack first
  // how many of the closest options the list shows; a per-browser view setting, like the drawing layers
  const OPT_COUNT_KEY = 'geobike.optCount';
  let optCount = 10;
  try { const v = parseInt(localStorage.getItem(OPT_COUNT_KEY), 10); if (v >= 1 && v <= 500) optCount = v; } catch (err) { /* default */ }
  function sortOpts(list) {
    if (optSort === 'miss') return optLeast ? list.slice().reverse() : list;
    const by = optSort === 'stack' ? (x) => x.dy : (x) => x.dx;
    const dir = optLeast ? -1 : 1;
    return list.slice().sort((p, q) => dir * (by(q) - by(p)) || p.err - q.err);
  }

  function renderBikeOut() {
    const b = curBike();
    const out = $('bikeOut');
    if (!b) {
      $('optList').innerHTML = '';
      out.innerHTML = '<div class="empty"><b>Add a target bike in step 2 to see the changes.</b></div>';
      return;
    }
    const r = model.res[b.id];
    // the stems and spacers you can use stay put at the top of the options box; only the list is redrawn
    const list = $('optList');
    if (r.refErrors || r.errors || r.optErrors || r.problems) list.innerHTML = '';
    if (r.refErrors) {
      out.innerHTML = r.noRef ? '<div class="empty"><b>Add a reference in step 2 first.</b></div>' : `<div class="empty"><b>Fill in ${esc(refName(r.ref))} in step 2 first.</b></div>`;
      return;
    }
    if (r.errors) {
      out.innerHTML = `<div class="empty"><b>Fill in this target bike in step 2 first.</b></div>`;
      return;
    }
    if (r.optErrors) {
      out.innerHTML = '<div class="empty"><b>Fill in the component options above first.</b></div>';
      return;
    }
    if (r.problems) {
      out.innerHTML = `<ul class="checks">${r.checks.filter((c) => !c.frame).map((c) => `<li class="${c.level}">${esc(c.text)}</li>`).join('')}</ul>`;
      return;
    }
    const fit = r.ref.fit;
    const o = chosenFor(b, r);
    const hasBike = !!r.fp.bike; // a personal fit has no bike to compare with
    const dH = hasBike ? r.heightAlong - fit.saddleHeight : 0;
    const checks = r.checks.filter((c) => !c.frame); // the frame's own checks are in step 2
    if (o && o.err <= GB.HAND_TOL && !checks.some((c) => c.level === 'bad')) checks.unshift({ level: 'ok', text: `This frame can carry the fit of ${refName(r.ref)}. Hand position ${missTxt(o)}${o.err >= 1 ? ' of the target' : ''}.` });

    out.innerHTML = `
      <div class="tiles">
        <div class="tile"><span class="t-l">Saddle height</span><span class="t-v">${n1(r.heightAlong)}<small>mm</small></span>
          <span class="t-d${hasBike && Math.abs(dH) < 0.05 ? ' same' : ''}">${hasBike ? deltaTxt(dH, 1) : 'along this seat tube'}</span></div>
        <div class="tile"><span class="t-l">Saddle setback</span><span class="t-v">${n1(r.setback)}<small>mm</small></span>
          <span class="t-d${r.railOver > GB.RAIL_TOL ? ' over' : ''}">${r.railOver > GB.RAIL_TOL ? 'past the saddle rails' : r.railOver > 0.5 || !postsThatFit(r).length ? `${postTxt(r.postOffset)}, at the rail ends` : fitTxt(postsThatFit(r))}</span></div>
        <div class="tile"><span class="t-l">Stem</span><span class="t-v">${o ? `${o.length}<small>mm</small> ${angTxt(o.angle)}` : 'n/a'}</span>
          <span class="t-d${o && hasBike && stemChange(o, r.fp) === 'Same as reference' ? ' same' : ''}">${o && hasBike ? esc(stemChange(o, r.fp)) : o ? 'closest from your stems' : ''}</span></div>
        <div class="tile"><span class="t-l">Spacers</span><span class="t-v">${o ? n1(o.spacers) : 'n/a'}<small>mm</small></span>
          <span class="t-d${o && hasBike && Math.abs(o.spacers - fit.spacers) < 0.05 ? ' same' : ''}">${o && hasBike ? deltaTxt(o.spacers - fit.spacers, 1) : ''}</span></div>
      </div>
      <ul class="checks">${checks.map((c) => `<li class="${c.level}">${esc(c.text)}</li>`).join('')}</ul>
      ${o ? `<div class="row-actions"><button class="btn" type="button" id="toRefBike" title="A new bikefit in step 2: this frame with the saddle, stem and spacers above">Copy as reference bike</button></div>` : ''}`;
    list.innerHTML = `
        <div class="sub-h">
          <div class="sort" role="group" aria-label="Sort options">Sort by ${OPT_SORTS.map(([k, most, least]) => `<button type="button" class="sort-btn" data-optsort="${k}" aria-pressed="${optSort === k}" title="Click again for ${optSort === k && !optLeast ? least.toLowerCase() : most.toLowerCase()} first">${optSort === k && optLeast ? least : most}</button>`).join('')}</div>
          <label class="opt-count" for="optCount">Show <input type="number" id="optCount" min="1" max="${r.cockpit.all.length}" step="1" value="${Math.min(optCount, r.cockpit.all.length)}"> of ${r.cockpit.all.length}</label></div>
        <div class="tbl-wrap" id="optWrap">${optTableHTML(r, o)}</div>`;
  }
  // the options table alone, so changing how many it shows leaves the Show field (and its caret) alone
  function optTableHTML(r, o) {
    const top = r.cockpit.all.slice(0, optCount);
    return `
          <table class="data" id="optTable">
            <thead><tr><th></th><th>Stem</th><th class="num">Spacers mm</th><th class="num">Hand fwd mm</th><th class="num">Hand up mm</th><th class="num">Miss mm</th></tr></thead>
            <tbody>${sortOpts(top.concat(o && !top.includes(o) ? [o] : [])).map((x, i) => {
              const sel = o && optKey(x) === optKey(o);
              return `<tr class="opt${sel ? ' pick' : ''}" data-opt="${esc(optKey(x))}">
                <td><input type="radio" name="opt" id="opt-${i}" aria-label="Use ${esc(stemTxt(x))} with ${n1(x.spacers)} mm spacers" ${sel ? 'checked' : ''}></td>
                <td>${esc(stemTxt(x))}</td><td class="num">${n1(x.spacers)}</td>
                <td class="num">${sgn(x.dx, 1)}</td><td class="num">${sgn(x.dy, 1)}</td><td class="num">${n1(x.err)}</td></tr>`;
            }).join('')}</tbody>
          </table>`;
  }

  function renderCompare() {
    const el = $('cmp');
    const mark = (src) => (src === 'chart' ? '' : '<span class="calc-mark">calc</span>');
    const na = 'n/a';
    // reference column: the selected reference as set up today
    const handTxt = (o) => `${n1(o.handX)}, ${n1(o.handY)} mm`;
    const refCols = (curRef() ? [curRef()] : []).map((ref) => {
      const fp = model.refs[ref.id].fp;
      const f = model.refs[ref.id].eff.fit;
      return {
        id: ref.id, name: refName(ref), isRef: true,
        vals: fp && !fp.bike ? {
          match: 'reference', sta: na, stack: na, height: `${n1(f.saddleLine)} mm, straight to tip`, setback: `${n1(f.setback)} mm`, rails: na,
          stem: na, stemh: na, spacers: na, bar: handTxt(f), width: f.barWidth > 0 ? `${n0(f.barWidth)} mm` : 'not entered', hand: 'target',
        } : fp ? {
          match: 'reference', sta: `${n1(ref.sta)}°`, stack: `${n0(fp.geo.stack)}${mark(fp.geo.stackSrc)} / ${n0(fp.geo.reach)}${mark(fp.geo.reachSrc)}`,
          height: `${n1(f.saddleHeight)} mm`, setback: `${n1(f.setback)} mm`, rails: fp.rail.check && fp.rail.check.level === 'bad' ? '<span class="miss-bad">past the rails</span>' : `${esc(postTxt(fp.rail.postOffset))}, ${railPosTxt(fp.rail.railPos).replace(' of the middle of its rails', ' of centre').replace(' on its rails', '')}`,
          stem: esc(stemTxt(refStem(fp))), stemh: `${n1(f.stemH)} mm`, spacers: `${n1(f.spacers)} mm`, bar: handTxt(f), width: f.barWidth > 0 ? `${n0(f.barWidth)} mm` : 'not entered', hand: 'target',
        } : null,
      };
    });
    const bikeCols = state.bikes.map((b) => {
      const r = model.res[b.id];
      if (!r.fp || r.errors || r.problems) return { id: b.id, name: b.name || 'Untitled bike', vals: null, refName: refName(r.ref) };
      const o = chosenFor(b, r); const f = r.ref.fit;
      return {
        id: b.id, name: b.name || 'Untitled bike',
        vals: {
          match: esc(refName(r.ref)), sta: `${n1(b.sta)}°${r.fp.bike ? ` <span class="calc-mark">${sgn(b.sta - r.fp.bike.sta, 1)}</span>` : ''}`, stack: `${n0(r.geo.stack)}${mark(r.geo.stackSrc)} / ${n0(r.geo.reach)}${mark(r.geo.reachSrc)}`,
          height: `${n1(r.heightAlong)} mm${r.fp.bike ? ` <span class="calc-mark">${sgn(r.heightAlong - f.saddleHeight, 1)}</span>` : ''}`,
          setback: `${n1(r.setback)} mm${Math.abs(r.tipShift) >= 0.05 ? ` <span class="calc-mark">${sgn(r.setback - f.setback, 1)}</span>` : ''}`,
          rails: r.railOver > GB.RAIL_TOL ? '<span class="miss-bad">past the rails</span>' : `${esc(postTxt(r.postOffset))}, ${railPosTxt(r.railPos).replace(' of the middle of its rails', ' of centre').replace(' on its rails', '')}`,
          stem: o ? esc(stemTxt(o)) : na,
          spacers: o ? `${n1(o.spacers)} mm${r.fp.bike ? ` <span class="calc-mark">${sgn(o.spacers - f.spacers, 1)}</span>` : ''}` : na,
          stemh: `${n1(effBike(b, r.ref).stemH)} mm`, bar: handTxt(effBike(b, r.ref)), width: r.barWidth > 0 ? `${n0(r.barWidth)} mm` : na,
          hand: o ? `<span class="${o.err > GB.HAND_TOL ? 'miss-bad' : 'miss-ok'}">${esc(missTxt(o))}</span>` : na,
        },
      };
    });
    const cols = refCols.concat(bikeCols);
    // nothing worked out yet: no Summary section at all (Z)
    const shown = cols.some((c) => c.vals);
    el.closest('section').hidden = !shown;
    if (!shown) { el.innerHTML = ''; return; }
    // the saved saddle and handlebar each column uses
    const partCell = (kind, obj, target) => {
      const p = partOf(kind, obj[`${kind}Id`]);
      if (p) return esc(partName(kind, p));
      if (target && !PART_KEYS[kind].some((k) => obj[k] != null)) return 'same as reference';
      return 'sizes entered';
    };
    const anyParts = PART_KINDS.some((k) => partList(k).length);
    for (const c of cols) {
      if (!c.vals || !anyParts) continue;
      const obj = c.isRef ? state.refs.find((x) => x.id === c.id).fit : state.bikes.find((x) => x.id === c.id);
      c.vals.saddle = partCell('saddle', obj, !c.isRef); c.vals.handlebar = partCell('bar', obj, !c.isRef);
    }
    const rows = [
      ['match', 'Matched to'], ['sta', 'Seat tube angle'], ['stack', 'Stack / reach'], ['height', 'Saddle height (along seat tube)'], ['setback', 'Saddle setback'],
      ['rails', 'Saddle on rails'], ['stem', 'Stem'], ['stemh', 'Stem height'], ['spacers', 'Spacers'], ['bar', 'Hand X, Y'], ['width', 'Hand width'], ['hand', 'Hands reached'],
    ];
    if (anyParts) rows.splice(3, 0, ['saddle', 'Saddle']), rows.push(['handlebar', 'Cockpit']);
    const head = (c) => c.isRef
      ? `<th class="refcol${c.id === state.selectedRef ? ' sel' : ''}"><button class="tab" type="button" data-reftab="${esc(c.id)}" style="padding:0;border:0;font-size:15px">${esc(c.name)}</button></th>`
      : `<th class="bikecol${c.id === state.selected ? ' sel' : ''}"><button class="tab" type="button" data-tab="${esc(c.id)}" style="padding:0;border:0;font-size:15px">${esc(c.name)}</button></th>`;
    const cls = (c) => `${c.isRef ? 'refcol' : ''}${(c.isRef ? c.id === state.selectedRef : c.id === state.selected) ? ' sel' : ''}`;
    el.innerHTML = `<table class="data cmp">
      <thead><tr><th></th>${cols.map(head).join('')}</tr></thead>
      <tbody>${rows.map(([k, label]) => `<tr${k === 'match' ? ' class="match"' : ''}><td>${label}</td>${cols.map((c) => `<td class="${cls(c)}">${c.vals ? c.vals[k] : (k === 'match' && c.refName ? esc(c.refName) : na)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  }

  /* ---------- drawings ---------- */
  const LAYER_KEY = 'geobike.layers';
  let layers = { ref: true, dims: true, grid: true };
  try { const l = JSON.parse(localStorage.getItem(LAYER_KEY) || 'null'); if (l && typeof l === 'object') layers = Object.assign(layers, l); } catch (e) { /* defaults */ }
  // the ground view zooms in where it is clicked (or on the BB, from its button) and out on the next click
  let groundZoom = null; // null, or { at: point on the ground grid in mm, or true for the BB; off: click position in the drawing, px }
  // drawing title bar: the name only (Z), with any button on the right
  const figT = (t, extra = '') => `<div class="fig-t"><span>${t}</span>${extra}</div>`;
  function renderViz() {
    const el = $('vizWrap');
    const b = curBike();
    if (!b) { el.innerHTML = ''; return; }
    const r = model.res[b.id];
    if (r && r.optErrors) { el.innerHTML = '<div class="empty">The drawings appear once the component options are filled in.</div>'; return; }
    if (!r || !r.fp || r.errors) { el.innerHTML = '<div class="empty">The drawings appear once the reference and this frame are complete.</div>'; return; }
    if (r.problems) { el.innerHTML = '<div class="empty">The drawings appear once the problems above are fixed.</div>'; return; }
    const o = chosenFor(b, r);
    const hasBike = !!r.fp.bike;
    const svg = GBDraw.render({ r, o, show: layers, zoomAt: groundZoom && groundZoom.at, names: { bike: b.name || 'This bike', ref: refName(r.ref) } });
    if (!svg.ground) groundZoom = null;
    // the zoomed ground view scrolls in a frame; keep where it was scrolled to across redraws
    const was = el.querySelector('.zoomwrap');
    const kept = was ? [was.scrollLeft, was.scrollTop] : null;
    const tog = (k, label) => `<label class="tog"><input type="checkbox" data-layer="${k}" id="lay-${k}"${layers[k] ? ' checked' : ''}> ${label}</label>`;
    el.innerHTML = `
      <div class="viz-bar">
        <div class="legend">
          <span class="lg" data-solid="bk"><i class="sw bk"></i>${esc(b.name || 'This bike')}, target</span>
          <span class="lg" data-solid="rf"><i class="sw rf"></i>${esc(refName(r.ref))}${hasBike ? ', reference' : ': BB to saddle tip'}</span>
          ${svg.expHand ? '<span class="lg"><i class="mkx"></i>Expected hand position on target cockpit</span>' : ''}
        </div>
        <div class="toggles">${hasBike ? tog('ref', 'Reference bike') : ''}${tog('dims', 'Dimensions')}${tog('grid', 'Grid')}</div>
      </div>
      <div class="viz">
        <figure class="draw">${figT('BB aligned')}${svg.main}</figure>
        <div class="viz-side">
          <figure class="draw">${figT('Cockpit close-up')}${svg.front}</figure>
          <figure class="draw">${figT('Saddle close-up')}${svg.saddle}</figure>
        </div>${groundHTML(svg.ground, r, b)}
      </div>`;
    // zooming in keeps the clicked point under the pointer; after that the frame stays where it was scrolled to
    const w = el.querySelector('.zoomwrap');
    if (w && svg.groundFocus) {
      const off = (groundZoom && groundZoom.off) || [w.clientWidth / 2, w.clientHeight / 2];
      [w.scrollLeft, w.scrollTop] = kept || [svg.groundFocus.x - off[0], svg.groundFocus.y - off[1]];
    }
  }
  // Ground aligned: the frames on level ground, last; needs a bikefit reference and a chainstay
  // on both frames. Without them, the reason takes its place.
  function groundHTML(svg, r, b) {
    if (svg) {
      const z = !!groundZoom;
      const zoomBtn = `<button class="sort-btn" type="button" data-gzoom title="${z ? 'Or click the drawing' : 'Or click the drawing where you want to zoom in'}">${z ? 'Zoom out' : 'Zoom in'}</button>`;
      // the button sits inside the drawing, top right, and stays put while the zoomed drawing scrolls
      return `<div class="viz-ground"><figure class="draw gzoom${z ? ' in' : ''}">${figT('Ground aligned')}<div class="gz-pane">${z ? `<div class="zoomwrap">${svg}</div>` : svg}${zoomBtn}</div></figure></div>`;
    }
    let why;
    if (!r.fp.bike) {
      why = 'A personal fit has no frame to compare this one with. Use a bikefit as the reference in step 2, and enter the chainstay of both frames.';
    } else {
      const missing = [];
      const frameName = (o) => { const f = partOf('frame', o.frameId); return f ? partName('frame', f) : 'its frame'; };
      if (!GB.frameDrawing(r.fp.bike).csKnown) missing.push(esc(frameName(r.ref)));
      if (!r.drawing.csKnown && !missing.includes(esc(frameName(b)))) missing.push(esc(frameName(b)));
      why = `It needs the chainstay of both frames. Enter it for ${missing.join(' and ')} under Frames in step 1.`;
    }
    return `<div class="viz-ground"><div class="ground-off"><b>No Ground aligned drawing</b><span>${why}</span></div></div>`;
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-gzoom]');
    const pic = !btn && e.target.closest && e.target.closest('#vizWrap svg.ground');
    if (!btn && !pic) return;
    if (groundZoom) groundZoom = null;
    else if (btn) groundZoom = { at: true };
    else {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(pic.getScreenCTM().inverse()); // SVG y runs down
      const box = pic.getBoundingClientRect();
      groundZoom = { at: { x: p.x, y: -p.y }, off: [e.clientX - box.left, e.clientY - box.top] };
    }
    renderViz();
    if (btn) { const again = document.querySelector('[data-gzoom]'); if (again) again.focus(); }
  });
  // hovering a bike, or its name in the legend, brings it in front of the other one, solid, and
  // fades the other (Z). Otherwise the target bike is in front. Each bike carries a wide
  // see-through copy of its lines, so the pointer doesn't have to land exactly on one.
  function raise(svg, cls) {
    const top = (n) => { while (n.parentNode !== svg) n = n.parentNode; return n; };
    const mine = [...svg.querySelectorAll(`.bike.${cls}`)].map(top);
    const theirs = [...svg.querySelectorAll(`.bike.${cls === 'rf' ? 'bk' : 'rf'}`)].map(top);
    if (!mine.length || !theirs.length) return;
    const last = theirs[theirs.length - 1];
    if (mine.every((n) => last.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
    const at = last.nextSibling;
    mine.forEach((n) => svg.insertBefore(n, at));
  }
  function hoverBike(svgs, cls) {
    svgs.forEach((svg) => {
      svg.classList.remove('hov-bk', 'hov-rf');
      if (cls) svg.classList.add(`hov-${cls}`);
      raise(svg, cls || 'bk');
    });
  }
  const bikeAt = (n) => {
    const g = n && n.closest && n.closest('svg.geo .bike.bk, svg.geo .bike.rf');
    return g ? { svg: g.closest('svg.geo'), cls: g.classList.contains('rf') ? 'rf' : 'bk' } : null;
  };
  const allSvgs = () => document.querySelectorAll('#vizWrap svg.geo');
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('[data-solid]');
    if (t) { hoverBike(allSvgs(), t.dataset.solid); return; }
    const b = bikeAt(e.target);
    if (b && !b.svg.classList.contains(`hov-${b.cls}`)) hoverBike([b.svg], b.cls);
  });
  document.addEventListener('mouseout', (e) => {
    const t = e.target.closest && e.target.closest('[data-solid]');
    if (t) { if (!t.contains(e.relatedTarget)) hoverBike(allSvgs(), null); return; }
    const b = bikeAt(e.target);
    if (!b) return;
    const to = bikeAt(e.relatedTarget);
    if (!to || to.svg !== b.svg || to.cls !== b.cls) hoverBike([b.svg], to && to.svg === b.svg ? to.cls : null);
  });
  document.addEventListener('change', (e) => {
    const box = e.target.closest && e.target.closest('[data-layer]');
    if (!box) return;
    layers[box.dataset.layer] = box.checked;
    try { localStorage.setItem(LAYER_KEY, JSON.stringify(layers)); } catch (err) { /* per-browser only */ }
    renderViz();
    const again = $(`lay-${box.dataset.layer}`); if (again) again.focus();
  });

  function renderOutputs() {
    compute();
    renderCP(); renderBikeCP(); renderPartChecks(); showChecks($('optCard'), errItems(model.optErrors)); renderBikeOut(); renderViz(); renderCompare();
  }
  function renderAll() { renderInputs(); renderOutputs(); }

  /* ---------- saving: to this browser, and to a linked data file ---------- */
  let saveTimer = null;
  function scheduleSave() {
    if (!loaded) return;
    lastEdit = Date.now();
    if (state.example) state.example = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  async function flush() {
    if (!loaded) return;
    saveLocal();
    writeFile();
  }


  /* ---------- data file on this computer ---------- */
  let fileState = 'none'; // none | linked | prompt
  let fileMsg = '';
  let pendingOpen = null; // a file picked to open, waiting for the replace confirmation
  let fileWriting = false; let fileAgain = false;
  const timeNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // a message that goes back to the bar's usual line after a few seconds
  function flash(msg) {
    fileMsg = msg;
    setTimeout(() => { if (fileMsg === msg) { fileMsg = ''; renderFileBar(); } }, 6000);
  }
  function summarize(s) {
    const n = normalize(s);
    const filled = (r) => Object.values(r.fit).some(finite) || GEO_KEYS.some((k) => finite(r[k]));
    const word = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`;
    const parts = [];
    for (const [k, w] of [['bike', 'bikefit'], ['fit', 'personal fit']]) { const c = n.refs.filter((r) => r.kind === k && filled(r)).length; if (c) parts.push(word(c, w)); }
    for (const [k, w] of [['bikes', 'target bike'], ['frames', 'frame'], ['saddles', 'saddle'], ['bars', 'cockpit']]) if (n[k].length) parts.push(word(n[k].length, w));
    if (!parts.length) return 'no bikes yet';
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }
  async function writeFile() {
    if (fileState !== 'linked') return;
    if (fileWriting) { fileAgain = true; return; }
    fileWriting = true;
    try { await GBFile.write(state, lastEdit || Date.now()); fileMsg = `Last saved at ${timeNow()}.`; }
    catch (e) { fileState = 'prompt'; fileMsg = 'The last change could not be saved to the file.'; }
    finally {
      fileWriting = false; renderFileBar();
      if (fileAgain) { fileAgain = false; writeFile(); }
    }
  }
  // the newest copy wins between this page and the linked file
  async function syncWithFile() {
    try {
      const d = await GBFile.read();
      if (d && d.savedAt > (state.example ? 0 : lastEdit)) {
        state = normalize(d.state); lastEdit = d.savedAt;
        renderAll();
        fileMsg = `Loaded the newer copy from the file at ${timeNow()}.`;
        flush();
      } else {
        await GBFile.write(state, lastEdit || Date.now());
        fileMsg = `Last saved at ${timeNow()}.`;
      }
    } catch (e) { fileMsg = (e && e.message) || 'The file could not be read.'; }
  }
  async function initFile() {
    let st = 'none';
    try { st = await GBFile.restore(); } catch (e) { st = 'none'; }
    if (st === 'granted') { fileState = 'linked'; await syncWithFile(); }
    else if (st === 'prompt') fileState = 'prompt';
    renderFileBar();
  }
  /* ---------- share link: everything on the page, packed into the address ---------- */
  const SHARE_BASE = 'https://bikefitsim.github.io/';
  const shareBase = () => (isLocal || !/^https?:$/.test(location.protocol) ? SHARE_BASE : location.origin + location.pathname);
  const b64url = (bytes) => {
    let t = '';
    for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64url = (t) => { const b = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
  const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  /* The link holds the values by position, not by name, to keep it short: each list below
     only ever gets new keys at the end (barReach, and barWidth on target bikes and handlebars: links
     from before the hand position, read and converted). Saved frames, saddles and cockpits are their place in
     the list (1 = first), and default names ("Target bike 2") just their number. Saved frames came last
     (2026-11-12): a bike that picks one leaves its own frame sizes out and gives the frame's place at the
     end of its row; older links carry the sizes, which become saved frames as they open. */
  const LINK_GEO = ['sta', 'hta', 'htLength', 'ett', 'att', 'seatTube', 'seatTubeCC', 'bbDrop', 'forkA2C', 'forkOffset', 'stack', 'reach', 'chainstay', 'wheelbase', 'tyre', 'wheel'];
  // hbRamp: a removed field, kept so older share links still line up by position
  const LINK_FIT = ['saddleHeight', 'saddleLine', 'setback', 'riderReach', 'drop', 'stemLength', 'stemAngle', 'barWidth', 'spacers', 'barReach', 'tipToRails', 'railTravel', 'clampLen', 'saddleLen', 'saddleId', 'barId', 'handFrom', 'stemImplied', 'railH', 'handX', 'handY', 'stemH', 'hbWidth', 'hbDrop', 'hbReach', 'hbDiam', 'hbRamp', 'hbRise'];
  const LINK_BIKE = ['barReach', 'barWidth', 'tipToRails', 'railTravel', 'clampLen', 'saddleLen', 'saddleId', 'barId', 'pick', 'railH', 'stemH', 'hbWidth', 'hbDrop', 'hbReach', 'hbDiam', 'hbRamp', 'hbRise'];
  const LINK_PART = { saddle: ['saddleLen', 'tipToRails', 'railTravel', 'railH', 'clampLen'], bar: ['barReach', 'barWidth', 'hbWidth', 'hbDrop', 'hbReach', 'hbDiam', 'hbRamp', 'handX', 'handY', 'stemH', 'hbRise'] }; // a handlebar's barWidth is its hand width
  const LINK_DEF = ['tipToRails', 'railTravel', 'clampLen', 'saddleLen', 'barWidth', 'barReach', 'tyre', 'railH', 'handX', 'handY', 'stemH', 'wheel'];
  const LINK_OPTS = ['stemLengths', 'stemAngles', 'spacerStep', 'minSpacers', 'maxSpacers'];
  const LINK_NAME = { bike: 'Reference bike', fit: 'Personal fit', target: 'Target bike', frame: 'Frame', saddle: 'Saddle', bar: 'Cockpit' };
  const LINK_PID = { frame: 'fr', saddle: 'sd', bar: 'hb' };
  const nameOut = (name, word) => { const m = new RegExp(`^${word} ([1-9]\\d{0,5})$`).exec(name || ''); return m ? +m[1] : name || ''; };
  const nameIn = (v, word) => (typeof v === 'number' ? `${word} ${v}` : typeof v === 'string' ? v : '');
  function packState(s) {
    const trim = (a) => { while (a.length && (a[a.length - 1] == null || a[a.length - 1] === '')) a.pop(); return a; };
    const parts = (kind) => s[PART_LIST[kind]] || [];
    const at = (kind, id) => { const i = parts(kind).findIndex((p) => p.id === id); return i < 0 ? null : i + 1; };
    const val = (o, k) => (k === 'saddleId' ? at('saddle', o[k]) : k === 'barId' ? at('bar', o[k])
      : k === 'handFrom' ? (o[k] === 'stem' ? null : o[k]) : k === 'stemImplied' ? (o[k] ? 1 : null) : o[k] == null ? null : o[k]);
    const row = (o, keys) => trim(keys.map((k) => val(o, k)));
    const geo = (o) => (at('frame', o.frameId) ? [] : row(o, LINK_GEO));
    return [1,
      s.refs.map((r) => trim([nameOut(r.name, LINK_NAME[r.kind]), r.kind === 'fit' ? 1 : 0, geo(r), row(r.fit, LINK_FIT), at('frame', r.frameId)])),
      s.bikes.map((b) => trim([nameOut(b.name, LINK_NAME.target), geo(b), row(b, LINK_BIKE), at('frame', b.frameId)])),
      ...PART_KINDS.map((kind) => parts(kind).map((p) => trim([nameOut(p.name, LINK_NAME[kind]), ...LINK_PART[kind].map((k) => val(p, k))]))),
      row(s.defaults, LINK_DEF),
      row(s.opts, LINK_OPTS),
      Math.max(0, s.refs.findIndex((r) => r.id === s.selectedRef)),
      Math.max(0, s.bikes.findIndex((b) => b.id === s.selected)),
      parts('frame').map((p) => trim([nameOut(p.name, LINK_NAME.frame), ...LINK_GEO.map((k) => val(p, k))])),
      1, // empty saddle and cockpit sizes are missing, not built in (see fillBuiltins)
    ];
  }
  // links made while the component options started filled in send 0 for those starting values
  const OLD_OPTS = { stemLengths: '60, 70, 80, 90, 100, 110, 120, 130, 140', stemAngles: '-17, -10, -6, 6, 10, 17', spacerStep: 5, minSpacers: null, maxSpacers: 40 };
  function unpackState(a) {
    if (!Array.isArray(a) || a[0] !== 1) throw new Error('bad');
    const list = (v) => (Array.isArray(v) ? v : []);
    const get = (row, i) => (Array.isArray(row) && row[i] != null ? row[i] : null);
    const obj = (row, keys, o = {}) => { keys.forEach((k, i) => { o[k] = get(row, i); }); return o; };
    const ids = (o) => { for (const kind of PART_KINDS) { const k = `${kind}Id`; o[k] = o[k] ? LINK_PID[kind] + o[k] : null; } return o; };
    const frameId = (v) => (v ? LINK_PID.frame + v : null);
    const s = { v: 3, example: false, defaults: obj(a[5], LINK_DEF), opts: a[6] ? obj(a[6], LINK_OPTS) : OLD_OPTS };
    s.refs = list(a[1]).map((r, i) => {
      const kind = get(r, 1) === 1 ? 'fit' : 'bike';
      const fit = ids(obj(get(r, 3), LINK_FIT, BLANK_FIT()));
      fit.handFrom = fit.handFrom || 'stem';
      if (fit.stemImplied) fit.stemImplied = true; else delete fit.stemImplied;
      return Object.assign({ id: `r${i + 1}`, kind, name: nameIn(get(r, 0), LINK_NAME[kind]) }, obj(get(r, 2), LINK_GEO), { frameId: frameId(get(r, 4)), fit });
    });
    s.bikes = list(a[2]).map((b, i) => {
      const o = Object.assign({ id: `b${i + 1}`, name: nameIn(get(b, 0), LINK_NAME.target) }, obj(get(b, 1), LINK_GEO), ids(obj(get(b, 2), LINK_BIKE)), { frameId: frameId(get(b, 3)) });
      o.pick = o.pick || '';
      return o;
    });
    PART_KINDS.forEach((kind, j) => {
      s[PART_LIST[kind]] = list(a[3 + j]).map((p, i) => {
        const o = obj(list(p).slice(1), LINK_PART[kind], { id: LINK_PID[kind] + (i + 1), name: nameIn(get(p, 0), LINK_NAME[kind]) });
        if (o.barReach == null) delete o.barReach; // only links made before the hand position have one
        return o;
      });
    });
    s.frames = list(a[9]).map((p, i) => obj(list(p).slice(1), LINK_GEO, { id: LINK_PID.frame + (i + 1), name: nameIn(get(p, 0), LINK_NAME.frame) }));
    if (a[10] === 1) s.sizes = 1;
    s.selectedRef = `r${(+a[7] || 0) + 1}`; s.selected = `b${(+a[8] || 0) + 1}`;
    return s;
  }
  // 'c' + the packed values deflated where the browser can compress, else 'p' + plain
  async function packLink(s) {
    const json = new TextEncoder().encode(JSON.stringify(packState(s)));
    if (typeof CompressionStream === 'function') { try { return 'c' + b64url(await through(json, new CompressionStream('deflate-raw'))); } catch (e) { /* plain below */ } }
    return 'p' + b64url(json);
  }
  // unpacks a link, giving up past LINK_MAX bytes so a crafted link can't fill the memory
  const LINK_MAX = 1 << 20;
  async function inflate(bytes) {
    const rd = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const out = new Uint8Array(LINK_MAX); let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) return out.slice(0, n);
      if (n + value.length > LINK_MAX) { rd.cancel(); throw new Error('This share link is too large.'); }
      out.set(value, n); n += value.length;
    }
  }
  async function unpackLink(t) {
    const bytes = unb64url(t.slice(1));
    const raw = t[0] === 'c' && typeof DecompressionStream === 'function' ? await inflate(bytes) : t[0] === 'p' ? bytes : null;
    if (!raw) throw new Error('This link can\'t be read in this browser.');
    return unpackState(JSON.parse(new TextDecoder().decode(raw)));
  }
  const LINK_HASH = /^#s=([A-Za-z0-9_-]+)/;
  const clearLinkHash = () => { if (LINK_HASH.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); };
  const shareLink = async () => `${shareBase()}#s=${await packLink(state)}`;
  // Copies text that is still being made. The clipboard is asked during the click itself
  // (some browsers refuse it later), with older ways to copy as fallbacks.
  async function copyText(textP) {
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textP.then((t) => new Blob([t], { type: 'text/plain' })) })]);
        return true;
      }
    } catch (e) { /* next way */ }
    const text = await textP;
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* next way */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  // a page opened from a share link: show it straight away over the example, else ask first
  async function initLink() {
    const m = LINK_HASH.exec(location.hash);
    if (!m) return;
    try {
      const s = await unpackLink(m[1]);
      if (!s || !Array.isArray(s.refs)) throw new Error('bad');
      if (state.example && fileState !== 'linked') {
        state = normalize(s); renderAll();
        scheduleSave(); clearLinkHash();
        flash('Opened the bikes from the share link.');
      } else pendingOpen = { name: 'This share link', handle: null, data: { state: s }, summary: summarize(s), link: true };
    } catch (e) { fileMsg = 'This share link could not be read. Part of it may have been lost when it was copied.'; clearLinkHash(); }
    renderFileBar();
  }
  window.addEventListener('hashchange', () => { if (loaded) initLink(); });
  async function downloadData() {
    const text = GBFile.pack(state, lastEdit || Date.now());
    const name = 'bikefit-data.json';
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    flash(`Downloaded ${name}. Open it later with Open data file.`);
  }
  function renderFileBar() {
    const el = $('fileBar');
    if (!el) return;
    if (!loaded) { el.innerHTML = ''; return; }
    const btn = (id, label) => `<button class="btn" type="button" id="${id}">${label}</button>`;
    let html;
    // Clear all: red, and asks for a second click like the delete buttons
    const share = btn('fileShare', 'Copy share link') + '<button class="btn danger" type="button" id="fileClear" title="Remove every bike, reference, frame, saddle and cockpit and empty every field on this page">Clear all</button>';
    // the message on the left, the buttons on the right
    const bar = (cls, text, buttons) => `<span class="file-status${cls}">${text}</span><span class="file-btns">${buttons}</span>`;
    if (pendingOpen) {
      html = bar('', `<b>${esc(pendingOpen.name)}</b> has ${esc(pendingOpen.summary)}. Replace the bikes on this page with them?`, btn('fileReplace', 'Replace') + btn('fileCancel', 'Cancel'));
    } else if (GBFile.canLink() && fileState === 'linked') {
      html = bar(' ok', `Every change is saved to <b>${esc(GBFile.name)}</b>.${fileMsg ? ` ${esc(fileMsg)}` : ''}`, btn('fileOpen', 'Open another file') + btn('fileUnlink', 'Stop saving to file') + share);
    } else if (GBFile.canLink() && fileState === 'prompt') {
      html = bar(' warn', `${fileMsg ? `${esc(fileMsg)} ` : ''}Changes are not being saved to <b>${esc(GBFile.name)}</b>. Reconnect to allow it again.`, btn('fileReconnect', 'Reconnect') + btn('fileUnlink', 'Forget this file') + share);
    } else {
      html = bar('', fileMsg ? esc(fileMsg) : 'Share or save this simulation, or open a saved one.', GBFile.canLink()
        ? btn('fileCreate', 'Save to a file') + btn('fileOpen', 'Open data file') + share
        : btn('fileDownload', 'Download data file') + btn('fileOpen', 'Open data file') + share);
    }
    el.innerHTML = html;
  }
  async function fileAction(id) {
    try {
      if (id === 'fileCreate') {
        await GBFile.create('bikefit-data.json');
        fileState = 'linked';
        await GBFile.write(state, lastEdit || Date.now());
        fileMsg = `Last saved at ${timeNow()}.`;
      } else if (id === 'fileReconnect') {
        if (await GBFile.reconnect()) { fileState = 'linked'; fileMsg = ''; await syncWithFile(); }
        else fileMsg = 'Permission was not given.';
      } else if (id === 'fileUnlink') {
        const was = GBFile.name; await GBFile.unlink(); fileState = 'none';
        flash(`Stopped saving to ${was}. Your bikes stay saved in this browser.`);
      } else if (id === 'fileOpen') {
        if (!GBFile.canLink()) { $('fileInput').click(); return; }
        const pk = await GBFile.pick();
        if (!pk.data) { // an empty file: start saving to it
          await GBFile.adopt(pk.handle); fileState = 'linked';
          await GBFile.write(state, lastEdit || Date.now());
          fileMsg = `Last saved at ${timeNow()}.`;
        } else pendingOpen = { name: pk.name, handle: pk.handle, data: pk.data, summary: summarize(pk.data.state) };
      } else if (id === 'fileReplace' && pendingOpen) {
        const po = pendingOpen; pendingOpen = null;
        let note = po.handle ? `Opened at ${timeNow()}.` : `Opened ${po.name}.`;
        if (po.link) {
          clearLinkHash(); note = 'Opened the bikes from the share link.';
          // a linked data file keeps the bikes it holds: stop writing the link's data into it
          if (fileState === 'linked') { const was = GBFile.name; await GBFile.unlink(); fileState = 'none'; note = `Opened the bikes from the share link. ${was} keeps your earlier bikes and is no longer updated.`; }
        }
        if (po.handle) { await GBFile.adopt(po.handle); fileState = 'linked'; }
        state = normalize(po.data.state);
        renderAll();
        scheduleSave(); // the opened data is now the newest copy everywhere
        if (fileState === 'linked') fileMsg = note; else flash(note);
      } else if (id === 'fileCancel') {
        if (pendingOpen && pendingOpen.link) clearLinkHash();
        pendingOpen = null; fileMsg = '';
      } else if (id === 'fileClear') {
        // back to a fresh page; a linked data file keeps the bikes it holds and is no longer written to
        let note = 'Cleared. Everything is back to empty.';
        if (fileState !== 'none') { const was = GBFile.name; await GBFile.unlink(); fileState = 'none'; note = `Cleared. ${was} keeps your earlier bikes and is no longer updated.`; }
        clearLinkHash();
        // no target bike or reference left either (Z); each tab offers to add one
        state = Object.assign(BLANK(), { refs: [], bikes: [], lastRef: {}, selected: null, selectedRef: null, refKind: 'bike' });
        lastEdit = Date.now(); groundZoom = null;
        renderAll();
        clearTimeout(saveTimer); await flush(); // saved as a fresh page, so a share link opens straight away
        flash(note);
      } else if (id === 'fileShare') {
        flash((await copyText(shareLink())) ? 'Share link copied to clipboard. Anyone who opens it sees these bikes.' : 'The share link could not be copied in this browser.');
      } else if (id === 'fileDownload') {
        await downloadData();
      }
    } catch (err) {
      if (!(err && err.name === 'AbortError')) fileMsg = (err && err.message) || 'Something went wrong with the file.';
    }
    renderFileBar();
  }
  document.addEventListener('change', (e) => {
    if (!e.target || e.target.id !== 'fileInput') return;
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.text().then((t) => {
      try { const d = GBFile.unpack(t); pendingOpen = { name: f.name, handle: null, data: d, summary: summarize(d.state) }; }
      catch (err) { fileMsg = err.message; }
      renderFileBar();
    });
  });

  /* ---------- events ---------- */
  function parseNum(str) {
    const t = String(str).trim().replace(',', '.').replace(/−/g, '-');
    if (t === '' || t === '-' || t === '.') return NaN;
    return /^-?\d*\.?\d+$|^-?\d+\.$/.test(t) ? parseFloat(t) : NaN;
  }
  function markField(el, bad) {
    el.setAttribute('aria-invalid', bad ? 'true' : 'false');
    const f = el.closest('.f'); if (f) f.classList.toggle('bad', bad);
  }
  const objFor = (scope) => (scope === 'bike' ? curBike() : scope === 'ref' ? curRef() : scope === 'fit' ? curRef().fit
    : LIB_KINDS.includes(scope) ? curPart(scope) : state[scope]);
  document.addEventListener('input', (e) => {
    if (e.target.id === 'optCount') {
      const v = parseInt(e.target.value, 10);
      if (!(v >= 1)) return; // empty while typing: keep the list as it is
      optCount = Math.min(v, 500);
      try { localStorage.setItem(OPT_COUNT_KEY, String(optCount)); } catch (err) { /* per-browser only */ }
      const b = curBike(); if (!b) return; const r = model.res[b.id]; const wrap = $('optWrap');
      if (wrap && r && r.cockpit) wrap.innerHTML = optTableHTML(r, chosenFor(b, r));
      return;
    }
    const el = e.target.closest && e.target.closest('[data-bind]');
    if (!el || !loaded) return;
    const [scope, key] = el.dataset.bind.split('.');
    const obj = objFor(scope);
    let v = el.value;
    if (el.dataset.num) {
      if (v.trim() === '') { v = null; markField(el, false); }
      else {
        v = parseNum(v);
        const bad = !Number.isFinite(v);
        markField(el, bad);
        if (bad) return;
      }
    }
    if (key === 'wheel') v = v === '' ? null : Number(v);
    obj[key] = v;
    if (scope === 'bike' && key === 'name') renderTabs();
    if (scope === 'ref' && key === 'name') renderRefTabs();
    if (scope === 'frame') { refreshPlaceholders(scope, obj); refreshOptional(scope, obj); }
    if (scope === 'fit' && (key === 'stemLength' || key === 'stemAngle')) delete obj.stemImplied;
    if ((key === 'frameId' || key === 'saddleId' || key === 'barId') && !v) obj[key] = null; // nothing picked
    if (LIB_KINDS.includes(scope) && key === 'name') {
      const t = document.querySelector(`[data-parttab="${scope}"][data-id="${CSS.escape(obj.id)}"]`);
      if (t) t.textContent = partName(scope, obj);
      renderRefForm(); renderBikeForm(); // their pickers show the name
    }
    if (scope === 'frame' || key === 'frameId') syncFrames(); // the bikes that use it read its sizes
    renderOutputs();
    scheduleSave();
  });
  // an entry that can't be read returns to the stored value when the field is left
  document.addEventListener('focusout', (e) => {
    const el = e.target.closest && e.target.closest('[data-bind][data-num]');
    if (!el || el.getAttribute('aria-invalid') !== 'true') return;
    const [scope, key] = el.dataset.bind.split('.');
    el.value = objFor(scope)[key] ?? '';
    markField(el, false);
  });

  const armTimers = new WeakMap();
  function armed(btn, label, idle) {
    if (btn.classList.contains('armed')) return true;
    btn.classList.add('armed'); btn.textContent = label;
    clearTimeout(armTimers.get(btn));
    armTimers.set(btn, setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = idle; } }, 4000));
    return false;
  }
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

  document.addEventListener('click', (e) => {
    if (!loaded) return;
    const fb = e.target.closest('#fileBar button');
    if (fb) {
      if (fb.id === 'fileClear' && !armed(fb, 'Click again to clear', 'Clear all')) return;
      fileAction(fb.id); return;
    }
    const ptab = e.target.closest('[data-parttab]');
    if (ptab) {
      state.selPart[ptab.dataset.parttab] = ptab.dataset.id;
      renderParts(); saveLocal();
      return;
    }
    const addP = e.target.closest('[data-addpart]'); const dupP = e.target.closest('[data-duppart]');
    if (addP || dupP) {
      const kind = (addP || dupP).dataset[addP ? 'addpart' : 'duppart'];
      const src = curPart(kind);
      const made = { id: uid(kind[0]), name: '' };
      for (const k of PART_KEYS[kind]) made[k] = dupP && src ? src[k] : null;
      made.name = dupP && src ? `${partName(kind, src)} copy` : nextPartName(kind);
      state[PART_LIST[kind]].push(made); state.selPart[kind] = made.id;
      renderParts(); renderRefForm(); renderBikeForm(); scheduleSave();
      const nm = $(`${kind}-name`); if (nm) { nm.focus(); nm.select(); }
      return;
    }
    const delP = e.target.closest('[data-delpart]');
    if (delP) {
      const kind = delP.dataset.delpart; const p = curPart(kind);
      if (!p || !armed(delP, 'Click again to delete', `Delete ${PART_WORD[kind]}`)) return;
      // whatever picked it picks nothing: no frame, the default saddle or cockpit, or on a target bike the reference's
      const key = `${kind}Id`;
      for (const o of [...state.refs.map((r) => (kind === 'frame' ? r : r.fit)), ...state.bikes]) if (o[key] === p.id) o[key] = null;
      state[PART_LIST[kind]] = partList(kind).filter((x) => x.id !== p.id);
      state.selPart[kind] = partList(kind).length ? partList(kind)[0].id : null;
      syncFrames();
      renderAll(); scheduleSave();
      return;
    }
    const rtab = e.target.closest('[data-reftab]');
    const rkind = e.target.closest('[data-refkind]');
    if (rtab || rkind) {
      // a kind tab opens the one last used in it; every target bike follows what is open
      if (rtab) selectRef(rtab.dataset.reftab);
      else {
        const k = rkind.dataset.refkind;
        if (ofKind(k).length) selectRef(ofKind(k).some((r) => r.id === state.lastRef[k]) ? state.lastRef[k] : ofKind(k)[0].id);
        else { state.refKind = k; state.selectedRef = null; } // an empty tab: add one there
      }
      renderRefTabs(); renderRefForm(); renderOutputs();
      if (rtab && rtab.closest('#cmp')) $('refKinds').scrollIntoView({ behavior: smooth(), block: 'start' });
      saveLocal();
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      state.selected = tab.dataset.tab;
      renderTabs(); renderBikeForm(); renderOutputs();
      if (tab.closest('#cmp')) $('tabs').scrollIntoView({ behavior: smooth(), block: 'start' });
      saveLocal();
      return;
    }
    const addR = e.target.closest('#addRef'); const addKind = addR ? addR.dataset.kind : '';
    const dupR = e.target.closest('#dupRef'); const toFit = e.target.closest('#toFitRef');
    const toRef = e.target.closest('#toRefBike');
    if (addKind || dupR || toFit || toRef) {
      const src = curRef();
      let made;
      if (addKind) {
        made = blankRef(addKind, uid('r'), nextDefaultName(addKind));
      } else if (toRef) {
        // the target bike as the results set it up, kept as a new bikefit; the reference it came from stays as it is
        const b = curBike(); if (!b) return; const r = model && model.res[b.id]; const o = chosenFor(b, r);
        if (!o) return;
        made = blankRef('bike', uid('r'), nextDefaultName('bike'));
        // the target's frame, saddle and cockpit (its reference's where it picks none)
        made.frameId = b.frameId;
        Object.assign(made.fit, {
          saddleHeight: r1(r.heightAlong), setback: r1(r.setback), spacers: o.spacers, stemLength: o.length, stemAngle: o.angle,
          saddleId: b.saddleId || src.fit.saddleId, barId: b.barId || src.fit.barId,
        });
        syncFrames({ frames: state.frames, refs: [made], bikes: [] });
      } else if (dupR) {
        made = Object.assign(clone(src), { id: uid('r'), name: `${refName(src)} copy` });
      } else {
        // the fit this bike gives, kept as the rider's own numbers
        const fp = model && model.refs[src.id] && model.refs[src.id].fp;
        if (!fp) return;
        made = blankRef('fit', uid('r'), `From ${refName(src)}`);
        Object.assign(made.fit, { saddleLine: r1(Math.hypot(fp.saddle.x, fp.saddle.y)), setback: src.fit.setback, riderReach: r1(fp.riderReach), drop: r1(fp.drop), saddleId: src.fit.saddleId, barId: src.fit.barId });
      }
      state.refs.push(made); selectRef(made.id);
      renderAll(); scheduleSave();
      $('ref-name').focus(); $('ref-name').select();
      return;
    }
    const delR = e.target.closest('#delRef');
    if (delR) {
      if (!armed(delR, 'Click again to delete', `Delete ${kindName(curRef())}`)) return;
      const gone = state.selectedRef; const kind = curRef().kind;
      state.refs = state.refs.filter((r) => r.id !== gone);
      for (const b of state.bikes) if (b.refId === gone) b.refId = state.refs.length ? state.refs[0].id : null;
      // the last one can go too (Z): the tab then stays empty until one is added
      if (ofKind(kind).length) selectRef(ofKind(kind)[0].id); else { state.refKind = kind; state.selectedRef = null; }
      renderAll(); scheduleSave();
      return;
    }
    if (e.target.closest('#addBike') || e.target.closest('#dupBike')) {
      const isDup = !!e.target.closest('#dupBike');
      const copy = isDup
        ? Object.assign(clone(curBike()), { id: uid(), pick: '', name: `${curBike().name} copy` })
        : newBikeFrom(curRef(), `Target bike ${state.bikes.length + 1}`);
      state.bikes.push(copy); state.selected = copy.id;
      renderAll(); scheduleSave();
      $('bike-name').focus(); $('bike-name').select();
      return;
    }
    const del = e.target.closest('#delBike');
    if (del) {
      if (!armed(del, 'Click again to delete', 'Delete target bike')) return;
      state.bikes = state.bikes.filter((b) => b.id !== state.selected);
      state.selected = state.bikes.length ? state.bikes[0].id : null; // the last one can go too (Z)
      renderAll(); scheduleSave();
      return;
    }
    const sortBtn = e.target.closest('[data-optsort]');
    if (sortBtn) {
      const k = sortBtn.dataset.optsort;
      optLeast = k === optSort ? !optLeast : false;
      optSort = k;
      renderBikeOut();
      const again = document.querySelector(`[data-optsort="${optSort}"]`); if (again) again.focus();
      return;
    }
    const row = e.target.closest('tr.opt');
    if (row) {
      const b = curBike(); if (!b) return; const r = model.res[b.id];
      b.pick = r && r.cockpit && r.cockpit.best && row.dataset.opt === optKey(r.cockpit.best) ? '' : row.dataset.opt;
      renderOutputs(); scheduleSave();
      const radio = document.querySelector(`tr.opt[data-opt="${CSS.escape(row.dataset.opt)}"] input`);
      if (radio) radio.focus({ preventScroll: true });
    }
  });

  /* Step buttons: back to the top, or jump to step 1, 2 or 3, and light up the step you are in.
     Any other [data-goto] link jumps the same way. */
  const stepSecs = () => [...document.querySelectorAll('.stepnav [data-goto]')].map((b) => [b, $(b.dataset.goto) && $(b.dataset.goto).closest('section')]);
  document.addEventListener('click', (e) => {
    if (e.target.closest('.stepnav [data-top]')) { scrollTo({ top: 0, behavior: smooth() }); return; }
    const go = e.target.closest('[data-goto]');
    if (!go) return;
    const sec = $(go.dataset.goto) && $(go.dataset.goto).closest('section');
    if (sec) { e.preventDefault(); sec.scrollIntoView({ behavior: smooth(), block: 'start' }); } // no #hash, so share links stay intact
  });
  // keys 1, 2 and 3 press the step buttons too, unless you are typing in a field (Z)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !/^[123]$/.test(e.key)) return;
    const at = e.target;
    if (at && at.closest && at.closest('input, textarea, select, [contenteditable]')) return;
    const btn = document.querySelectorAll('.stepnav [data-goto]')[+e.key - 1];
    if (btn) { e.preventDefault(); btn.click(); }
  });
  /* Field help on hover: a field's text from the hidden how-data section, shown after a short
     pause over the field, or when it gets focus (phones have no hover). */
  const tip = $('tip');
  let tipFor = null; let tipNext = null; let tipTimer = 0;
  function placeTip() {
    if (!tipFor || !tipFor.isConnected) { hideTip(); return; }
    const box = tipFor.getBoundingClientRect();
    const w = tip.offsetWidth; const h = tip.offsetHeight;
    const top = box.top - h - 6 >= 8 ? box.top - h - 6 : box.bottom + 6;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(Math.max(8, Math.min(box.left, innerWidth - w - 8)))}px`;
  }
  function showTip(f) {
    tipNext = null;
    const entry = $(`m-${f.dataset.m}`);
    if (!entry) return;
    tip.innerHTML = `<b>${entry.querySelector('h4').innerHTML}</b>${entry.querySelector('p').innerHTML}`;
    tip.hidden = false; tipFor = f;
    placeTip();
  }
  function hideTip() { clearTimeout(tipTimer); tipFor = null; tipNext = null; tip.hidden = true; }
  document.addEventListener('mouseover', (e) => {
    const f = e.target.closest && e.target.closest('[data-m]');
    if (f && (f === tipFor || f === tipNext)) return;
    if (tipFor || tipNext) hideTip();
    if (f && $(`m-${f.dataset.m}`)) { tipNext = f; tipTimer = setTimeout(() => showTip(f), 350); }
  });
  document.addEventListener('focusin', (e) => {
    const f = e.target.closest && e.target.closest('[data-m]');
    if (f === tipFor) return;
    hideTip(); if (f) showTip(f);
  });
  document.addEventListener('focusout', hideTip);
  addEventListener('scroll', () => { if (tipFor) placeTip(); }, { passive: true });

  let stepTick = 0;
  function markStep() {
    stepTick = 0;
    const line = innerHeight * 0.35; // the step whose section crosses this line is the one you are in
    for (const [b, sec] of stepSecs()) {
      const box = sec && sec.getBoundingClientRect();
      if (box && box.top <= line && box.bottom > line) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    }
  }
  addEventListener('scroll', () => { if (!stepTick) stepTick = requestAnimationFrame(markStep); }, { passive: true });
  addEventListener('resize', markStep);

  loaded = true;
  renderAll();
  markStep();
  initFile().then(initLink);
})();
