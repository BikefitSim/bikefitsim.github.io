(() => {
  'use strict';
  // storage keys keep their old 'geobike' prefix so saved bikes survive the rename to BikefitSim
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

  const GEO_KEYS = ['sta', 'hta', 'htLength', 'ett', 'seatTube', 'bbDrop', 'forkA2C', 'forkOffset', 'stack', 'reach'];
  const BLANK_GEO = { sta: null, hta: null, htLength: null, ett: null, seatTube: null, bbDrop: null, forkA2C: null, forkOffset: null, stack: null, reach: null };
  /* Two kinds of reference, each with its own tab. A bike fit (kind 'bike') is a frame plus how
     it is set up (saddle, spacers, stem, bar); a personal fit (kind 'fit') is only the rider's
     numbers (saddle height as a straight line to the saddle centre, setback and personal reach
     from that centre, drop,
     bar width). Both keep their numbers in `fit`. There is always at least one of each. */
  const BLANK_FIT = () => ({
    saddleHeight: null, saddleLine: null, setback: null, handFrom: 'stem', riderReach: null, drop: null,
    stemLength: null, stemAngle: null, barWidth: null, spacers: null, barReach: null, saddleLength: null,
  });
  const blankRef = (kind, id, name) => Object.assign({ id, name, kind }, BLANK_GEO, { fit: BLANK_FIT() });
  const isFitRef = (r) => r.kind === 'fit';
  const KINDS = ['bike', 'fit'];
  const KIND_LABEL = { bike: 'Bike fit', fit: 'Personal fit' };
  const DEFAULT_NAME = { bike: 'Reference bike', fit: 'Personal fit' }; // new references are numbered from these
  const KIND_NOTE = {
    bike: 'A bike that fits you now: its geometry and how it is set up.',
    fit: 'Just your numbers, saddle and hands around the BB centre, with no bike. For when you know your fit but not the bike it came from.',
  };
  // default names from earlier versions, so they read like the new ones
  function newDefaultName(name, kind) {
    const m = /^(?:Bike reference|Reference bike|Fit reference|Bike fit|Personal fit) (\d+)$/.exec(String(name || ''));
    return m ? `${DEFAULT_NAME[kind]} ${m[1]}` : name;
  }
  const BLANK = () => ({
    v: 3,
    example: true, // nothing entered yet
    refs: [blankRef('bike', 'r1', 'Reference bike 1'), blankRef('fit', 'r2', 'Personal fit 1')],
    lastRef: { bike: 'r1', fit: 'r2' }, // the one last open in each tab
    opts: { stemLengths: '60, 70, 80, 90, 100, 110, 120, 130, 140', stemAngles: '-17, -10, -6, 6, 10, 17', spacerStep: 5, maxSpacers: 40 },
    bikes: [Object.assign({ id: 'b1', name: 'Target bike 1', refId: 'r1' }, BLANK_GEO, { barReach: null, barWidth: null, pick: '' })],
    selected: 'b1',
    selectedRef: 'r1',
  });

  /* Saved data keeps the v3 shape for good; fields are only ever added, with defaults
     filled in here. Saves made before several reference bikes existed hold a single
     `ref` plus `fit`; they load as the first reference bike. */
  function normalize(s) {
    const base = BLANK();
    if (!isObj(s) || s.v !== 3) return base;
    let refsIn = Array.isArray(s.refs) ? s.refs.filter(isObj) : null;
    if ((!refsIn || !refsIn.length) && isObj(s.ref) && isObj(s.fit)) refsIn = [Object.assign({}, s.ref, { id: 'r1', fit: s.fit })];
    if (!refsIn || !refsIn.length) return base;
    const refT = base.refs[0];
    const out = { v: 3, example: !!s.example, importV2Done: !!s.importV2Done };
    out.refs = refsIn.map((r) => {
      const fitIn = isObj(r.fit) ? r.fit : {};
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
    for (const k of KINDS) if (!out.refs.some((r) => r.kind === k)) out.refs.push(blankRef(k, uid('r'), `${DEFAULT_NAME[k]} 1`));
    out.opts = Object.assign({}, base.opts, isObj(s.opts) ? s.opts : {});
    const ids = new Set(out.refs.map((r) => r.id));
    const bikeT = Object.assign({}, base.bikes[0], { name: 'Target bike', pick: '' });
    out.bikes = (Array.isArray(s.bikes) ? s.bikes : []).filter(isObj).map((b) => {
      const o = Object.assign({}, bikeT, b, { id: String(b.id || uid()) });
      if (!ids.has(o.refId)) o.refId = out.refs[0].id;
      return o;
    });
    if (!out.bikes.length) out.bikes = [newBikeFrom(out.refs[0], 'Target bike 1')];
    out.selected = out.bikes.some((b) => b.id === s.selected) ? s.selected : out.bikes[0].id;
    out.selectedRef = ids.has(s.selectedRef) ? s.selectedRef : out.refs[0].id;
    const lastIn = isObj(s.lastRef) ? s.lastRef : {};
    out.lastRef = {};
    for (const k of KINDS) {
      const ok = out.refs.find((r) => r.kind === k && r.id === lastIn[k]);
      out.lastRef[k] = (ok || out.refs.find((r) => r.kind === k)).id;
    }
    out.lastRef[out.refs.find((r) => r.id === out.selectedRef).kind] = out.selectedRef;
    return out;
  }
  /* References saved before the two kinds existed are bike fits. Those that gave the hands
     by personal reach and drop get the stem those numbers imply on their frame (to 0.1 mm and
     0.1°, so the hands stay put), flagged until the stem actually fitted is entered. */
  function stemFromReach(o) {
    const f = o.fit;
    if (f.handFrom === 'stem') return;
    f.handFrom = 'stem';
    if (f.stemLength != null || f.stemAngle != null) return;
    const need = [o.sta, o.hta, f.saddleHeight, f.setback, f.riderReach, f.drop, f.spacers, f.barReach, f.barWidth];
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
    const b = { id: uid(), name, refId: ref.id, barReach: ref.fit.barReach, barWidth: null, pick: '' };
    for (const k of GEO_KEYS) b[k] = ref[k];
    return b;
  }

  // Opened from disk or a local server, or inside Claude: bikes are kept in this browser.
  // On the public web copy (GitHub Pages) every visit starts fresh; a data file keeps them.
  const isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.localhost');
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  const keepInBrowser = isLocal || inClaude;

  // Browser copy: { state, savedAt }. Earlier saves stored the bare state, which still loads.
  function loadLocal() {
    if (!keepInBrowser) return null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const j = JSON.parse(raw);
      if (j && j.state) return { state: normalize(j.state), at: Date.parse(j.savedAt) || 0 };
      return { state: normalize(j), at: 0 };
    } catch (e) { return null; }
  }
  function saveLocal() {
    if (!keepInBrowser) return false;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ state, savedAt: new Date(lastEdit).toISOString() })); return true; } catch (e) { return false; }
  }
  function loadOldLocal() {
    if (!keepInBrowser) return null;
    try { const raw = localStorage.getItem('geobike.v2'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  const localSnap = loadLocal();
  let state = localSnap ? localSnap.state : BLANK();
  let lastEdit = localSnap ? localSnap.at : 0; // time of the last change, saved with the data
  let loaded = false;                          // no edits or saves until saved data has been read
  let oldData = null;                          // bikes saved by the earlier hoods-based version
  let importNote = '';

  /* ---------- field definitions ---------- */
  const GEO_FIELDS = [
    { k: 'sta', l: 'Seat tube angle', u: '°' },
    { k: 'hta', l: 'Head tube angle', u: '°' },
    { k: 'htLength', l: 'Head tube length', u: 'mm' },
    { k: 'ett', l: 'Top tube (eff.)', u: 'mm', opt: true },
    { k: 'seatTube', l: 'Seat tube (c-t)', u: 'mm' },
    { k: 'bbDrop', l: 'BB drop', u: 'mm', neg: true },
    { k: 'forkA2C', l: 'Fork length', u: 'mm', h: 'Axle to crown, plus any lower headset cup' },
    { k: 'forkOffset', l: 'Fork offset', u: 'mm', h: 'Also called rake' },
    { k: 'stack', l: 'Stack', u: 'mm', opt: true, h: 'Optional, from the chart' },
    { k: 'reach', l: 'Reach', u: 'mm', opt: true, h: 'Optional, from the chart' },
  ];
  const FF = {
    saddleHeight: { k: 'saddleHeight', l: 'Saddle height', u: 'mm', h: 'BB centre to saddle top, along the seat tube' },
    saddleLine: { k: 'saddleLine', l: 'Saddle height', u: 'mm', h: 'Straight line from the BB centre to the top of the saddle at its centre, not along the seat tube' },
    setback: { k: 'setback', l: 'Saddle setback', u: 'mm', h: 'Plumb line from the saddle tip back to the BB centre', neg: true },
    setbackFit: { k: 'setback', l: 'Saddle setback', u: 'mm', h: 'Plumb line from the saddle centre back to the BB centre', neg: true },
    saddleLength: { k: 'saddleLength', l: 'Saddle length', u: 'mm', h: 'Optional. Tip to tail, to find the saddle centre a personal fit uses.' },
    riderReach: { k: 'riderReach', l: 'Personal reach', u: 'mm', h: 'Saddle centre to the base of the hoods, straight line. No hoods: to where your hands sit.' },
    drop: { k: 'drop', l: 'Handlebar drop', u: 'mm', h: 'Saddle top to top of the bar, vertical. Negative if the bar is higher.', neg: true },
    stemLength: { k: 'stemLength', l: 'Stem length', u: 'mm', h: 'The stem fitted on this bike' },
    stemAngle: { k: 'stemAngle', l: 'Stem angle', u: '°', h: 'Negative points down, for example −6', neg: true },
    spacers: { k: 'spacers', l: 'Spacers under stem', u: 'mm', h: 'Head tube top to stem, top cap included' },
    barReach: { k: 'barReach', l: 'Handlebar reach', u: 'mm', h: 'Of the bar on this bike. 0 for a flat bar.' },
    barWidthBike: { k: 'barWidth', l: 'Handlebar width', u: 'mm', h: 'Centre to centre at the hoods' },
    barWidthFit: { k: 'barWidth', l: 'Handlebar width', u: 'mm', h: 'Centre to centre at the hoods. 0 if you measured personal reach in side view.' },
  };
  const BIKE_FIT_FIELDS = [FF.saddleHeight, FF.setback, FF.saddleLength, FF.spacers, FF.stemLength, FF.stemAngle, FF.barReach, FF.barWidthBike];
  const FIT_SADDLE_FIELDS = [FF.saddleLine, FF.setbackFit];
  const FIT_HAND_FIELDS = [FF.riderReach, FF.drop, FF.barWidthFit];
  const OPT_FIELDS = [
    { k: 'stemLengths', l: 'Stem lengths', type: 'list', u: 'mm', h: 'Separate with commas' },
    { k: 'stemAngles', l: 'Stem angles', type: 'list', u: '°', h: 'Negative points down. Remove the positives if you won\'t flip a stem.' },
    { k: 'spacerStep', l: 'Spacer step', u: 'mm', h: 'Smallest spacer you have' },
    { k: 'maxSpacers', l: 'Max spacers', u: 'mm', h: 'Most you would run under a stem' },
  ];

  function fieldHTML(f, scope, obj, placeholder) {
    const id = `${scope}-${f.k}`;
    const v = obj[f.k];
    const hidden = f.hide && f.hide(obj) ? ' hidden' : '';
    const hint = typeof f.h === 'function' ? f.h(obj) : f.h;
    let control;
    if (f.type === 'select') {
      control = `<select id="${id}" data-bind="${scope}.${f.k}">${f.opts.map(([val, txt]) => `<option value="${esc(val)}"${String(v) === val ? ' selected' : ''}>${esc(txt)}</option>`).join('')}</select>`;
    } else {
      const numAttrs = f.type === 'list' ? '' : ` data-num="1" inputmode="${f.neg ? 'text' : 'decimal'}"${f.opt ? ' data-opt="1"' : ''}`;
      control = `<input id="${id}" data-bind="${scope}.${f.k}" type="text"${numAttrs} autocomplete="off" spellcheck="false" value="${esc(v ?? '')}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>`;
    }
    return `<label class="f" for="${id}"${hidden}><span class="f-l">${esc(f.l)}</span><span class="f-in">${control}${f.u ? `<span class="u">${esc(f.u)}</span>` : ''}</span>${hint ? `<span class="f-h">${esc(hint)}</span>` : ''}</label>`;
  }
  function nameHTML(scope, value) {
    return `<label class="f" for="${scope}-name"><span class="f-l">Name</span><span class="f-in"><input id="${scope}-name" data-bind="${scope}.name" type="text" autocomplete="off" value="${esc(value)}"></span></label>`;
  }
  function calcPlaceholders(b) {
    const g = GB.frameGeometry(Object.assign({}, b, { stack: null, reach: null }));
    return { stack: g.stackCalc != null ? `calc. ${Math.round(g.stackCalc)}` : '', reach: g.reachCalc != null ? `calc. ${Math.round(g.reachCalc)}` : '' };
  }
  function geoFieldsHTML(scope, b) {
    const ph = calcPlaceholders(b);
    return GEO_FIELDS.map((f) => fieldHTML(f, scope, b, ph[f.k])).join('');
  }
  function refreshPlaceholders(scope, b) {
    const ph = calcPlaceholders(b);
    for (const k of ['stack', 'reach']) { const el = $(`${scope}-${k}`); if (el) el.placeholder = ph[k]; }
  }

  /* ---------- rendering: inputs ---------- */
  const curRef = () => state.refs.find((r) => r.id === state.selectedRef) || state.refs[0];
  const curBike = () => state.bikes.find((b) => b.id === state.selected) || state.bikes[0];
  const refOf = (b) => state.refs.find((r) => r.id === b.refId) || state.refs[0];
  const refName = (r) => r.name || 'Untitled reference';

  const kindName = (r) => KIND_LABEL[r.kind].toLowerCase();
  const ofKind = (k) => state.refs.filter((r) => r.kind === k);
  function selectRef(id) {
    const r = state.refs.find((x) => x.id === id);
    if (!r) return;
    state.selectedRef = id;
    if (!isObj(state.lastRef)) state.lastRef = {};
    state.lastRef[r.kind] = id;
  }
  function renderRefTabs() {
    const kind = curRef().kind;
    $('refKinds').innerHTML = KINDS.map((k) => `<button class="kind-tab" role="tab" type="button" data-refkind="${k}" aria-selected="${k === kind}">${KIND_LABEL[k]}<span class="n">${ofKind(k).length}</span></button>`).join('');
    $('refKindNote').textContent = KIND_NOTE[kind];
    $('refTabs').setAttribute('aria-label', `${KIND_LABEL[kind]}s`);
    $('refTabs').innerHTML = ofKind(kind).map((r) => `<button class="tab" role="tab" type="button" data-reftab="${esc(r.id)}" aria-selected="${r.id === state.selectedRef}">${esc(refName(r))}</button>`).join('')
      + `<button class="tab add" type="button" id="addRef" data-kind="${kind}">+ Add ${kindName(curRef())}</button>`;
  }
  function renderRefForm() {
    const r = curRef();
    const fields = (list) => list.map((f) => fieldHTML(f, 'fit', r.fit)).join('');
    if (isFitRef(r)) {
      $('refName').innerHTML = nameHTML('ref', r.name);
      $('refForm').innerHTML = `
        <h4>Saddle</h4>
        <div class="fields two">${fields(FIT_SADDLE_FIELDS)}</div>`;
      $('fitHead').textContent = 'Hands';
      $('fitFields').innerHTML = fields(FIT_HAND_FIELDS);
    } else {
      $('refName').innerHTML = nameHTML('ref', r.name);
      $('refForm').innerHTML = `
        <h4>Frame</h4>
        <div class="fields two">${geoFieldsHTML('ref', r)}</div>
        <div class="frame-strip" id="refStrip"></div>`;
      $('fitHead').textContent = 'Saddle and cockpit on this bike';
      $('fitFields').innerHTML = fields(BIKE_FIT_FIELDS);
    }
    const last = ofKind(r.kind).length < 2;
    $('refActions').innerHTML = `
      <button class="btn" type="button" id="dupRef">Copy as new ${kindName(r)}</button>
      <button class="btn danger" type="button" id="delRef"${last ? ` disabled title="Keep at least one ${kindName(r)}"` : ''}>Delete ${kindName(r)}</button>`;
  }
  function renderOptFields() {
    $('optFields').innerHTML = OPT_FIELDS.map((f) => fieldHTML(f, 'opts', state.opts)).join('');
  }
  function renderTabs() {
    $('tabs').innerHTML = state.bikes.map((b) => `<button class="tab" role="tab" type="button" data-tab="${esc(b.id)}" aria-selected="${b.id === state.selected}">${esc(b.name || 'Untitled bike')}</button>`).join('')
      + '<button class="tab add" type="button" id="addBike">+ Add target bike</button>';
  }
  function renderBikeForm() {
    const b = curBike();
    $('bikeForm').innerHTML = `
      <div class="grp">${nameHTML('bike', b.name)}</div>
      <div class="grp"><h4>Frame geometry</h4><div class="fields two">${geoFieldsHTML('bike', b)}</div></div>
      <div class="grp"><h4>Handlebar</h4><div class="fields two">${fieldHTML({ k: 'barReach', l: 'Handlebar reach', u: 'mm', h: 'Of the bar this bike will use. 0 for a flat bar.' }, 'bike', b)}${fieldHTML({ k: 'barWidth', l: 'Handlebar width', u: 'mm', opt: true, h: 'Centre to centre at the hoods. Empty means the same as the reference.' }, 'bike', b, finite(curRef().fit.barWidth) && curRef().fit.barWidth > 0 ? `same: ${curRef().fit.barWidth}` : 'same as reference')}</div></div>
      <div class="row-actions">
        <button class="btn" type="button" id="dupBike">Copy as new target bike</button>
        <button class="btn danger" type="button" id="delBike"${state.bikes.length < 2 ? ' disabled title="Keep at least one target bike"' : ''}>Delete target bike</button>
      </div>`;
  }
  function renderInputs() {
    renderRefTabs(); renderRefForm(); renderOptFields(); renderTabs(); renderBikeForm();
    document.body.classList.toggle('loading', !loaded);
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
  function geoErrors(b, withBar) {
    const c = checker(b, 'The frame');
    c.chk('sta', 60, 85, 'Seat tube angle'); c.chk('hta', 60, 80, 'Head tube angle');
    c.chk('htLength', 50, 300, 'Head tube length'); c.chk('seatTube', 200, 750, 'Seat tube length');
    c.chk('bbDrop', -40, 110, 'BB drop'); c.chk('forkA2C', 300, 600, 'Fork length'); c.chk('forkOffset', 0, 80, 'Fork offset');
    const hasReach = finite(b.reach) && b.reach > 0;
    if (!hasReach) {
      if (b.ett == null) c.missing.push('top tube (or reach from the chart)');
      else if (!(finite(b.ett) && b.ett > 350)) c.wrong.push('Top tube should be over 350.');
    }
    if (finite(b.stack) && (b.stack < 300 || b.stack > 800)) c.wrong.push('Stack should be between 300 and 800.');
    if (hasReach && (b.reach < 250 || b.reach > 600)) c.wrong.push('Reach should be between 250 and 600.');
    if (withBar) c.chk('barReach', 0, 150, 'Handlebar reach');
    return c.done();
  }
  function fitErrors(r) {
    const f = r.fit;
    if (isFitRef(r)) {
      const c = checker(f, 'The fit');
      c.chk('saddleLine', 400, 1000, 'Saddle height', ' mm'); c.chk('setback', -100, 400, 'Saddle setback', ' mm');
      c.chk('riderReach', 300, 900, 'Personal reach', ' mm'); c.chk('drop', -300, 300, 'Handlebar drop', ' mm');
      c.chk('barWidth', 0, 600, 'Handlebar width', ' mm');
      return c.done();
    }
    const c = checker(f, 'The setup');
    c.chk('saddleHeight', 450, 1000, 'Saddle height', ' mm'); c.chk('setback', -100, 200, 'Saddle setback', ' mm');
    c.chk('spacers', 0, 120, 'Spacers', ' mm'); c.chk('stemLength', 20, 200, 'Stem length', ' mm'); c.chk('stemAngle', -45, 45, 'Stem angle', '°');
    c.chk('barReach', 0, 150, 'Handlebar reach', ' mm'); c.chk('barWidth', 0, 600, 'Handlebar width', ' mm');
    if (f.saddleLength != null && f.saddleLength !== '' && !(finite(f.saddleLength) && f.saddleLength >= 150 && f.saddleLength <= 350)) c.wrong.push('Saddle length should be between 150 and 350 mm.');
    return c.done();
  }
  function optErrors() {
    const o = state.opts; const e = [];
    if (!GB.parseList(o.stemLengths, { min: 20, max: 200 }).length) e.push('Add at least one stem length.');
    if (!GB.parseList(o.stemAngles, { min: -45, max: 45 }).length) e.push('Add at least one stem angle.');
    if (!finite(o.spacerStep) || o.spacerStep <= 0) e.push('Spacer step should be a positive number.');
    if (!finite(o.maxSpacers) || o.maxSpacers < 0) e.push('Max spacers should be 0 or more.');
    return e;
  }

  let model = null;
  function compute() {
    const oe = optErrors();
    const refs = {};
    for (const r of state.refs) {
      const errs = [...(isFitRef(r) ? [] : geoErrors(r)), ...fitErrors(r), ...oe];
      let fp = null;
      if (!errs.length) {
        fp = GB.fitPoints(r, isFitRef(r) ? r.fit : Object.assign({}, r.fit, { handFrom: 'stem' }));
        if (!fp.ok) { errs.push(fp.error); fp = null; }
      }
      refs[r.id] = { errs, fp };
    }
    const res = {};
    for (const b of state.bikes) {
      const ref = curRef();
      const rm = refs[ref.id];
      const be = geoErrors(b, true);
      if (b.barWidth != null && (!finite(b.barWidth) || b.barWidth < 250 || b.barWidth > 600)) be.push('Handlebar width should be between 250 and 600, or left empty.');
      if (!rm.fp) res[b.id] = { refErrors: rm.errs, ref };
      else if (be.length) res[b.id] = { errors: be, ref };
      else res[b.id] = Object.assign(GB.solveBike(b, rm.fp, ref.fit, state.opts), { ref, fp: rm.fp });
    }
    model = { refs, res };
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
  const railTxt = (m) => (Math.abs(m) < 0.5 ? 'same place on its rails as on the reference' : `${Math.abs(Math.round(m))} mm ${m > 0 ? 'further forward' : 'further back'} on its rails than on the reference`);
  const deltaTxt = (v, d = 0) => (Math.abs(v) < (d ? 0.05 : 0.5) ? 'same as reference' : `${sgn(v, d)} mm vs reference`);
  function stemChange(o, fp) {
    const rs = refStem(fp);
    const dl = o.length - rs.length;
    const sameAngle = Math.abs(o.angle - rs.angle) < 0.75;
    if (Math.abs(dl) < 1 && sameAngle) return 'Same as reference';
    const lenPart = Math.abs(dl) < 1 ? 'Same length' : `${Math.abs(dl)} mm ${dl > 0 ? 'longer' : 'shorter'}`;
    return `${lenPart}${sameAngle ? ', same angle' : `, ${angTxt(o.angle)} instead of ${angTxt(rs.angle)}`}`;
  }

  // The saddle point never moves; only its distance along a differently angled seat tube changes.
  function saddleWhy(r) {
    if (!r.fp.bike) {
      const f = r.ref.fit;
      return `Your saddle centre sits ${n0(r.fp.saddle.y)} mm above the BB (${n1(f.saddleLine)} mm in a straight line, ${n1(f.setback)} mm setback). Along this ${n1(r.bike.sta)}° seat tube, the saddle top reaches that height at ${n1(r.heightAlong)} mm.`;
    }
    const dA = r.bike.sta - r.fp.bike.sta;
    const pos = `Saddle top stays at the reference point, ${n0(r.fp.saddle.y)} mm above the BB.`;
    if (Math.abs(dA) < 0.05) return `${pos} Same seat angle, so the same reading along the tube.`;
    return `${pos} This seat tube is ${n1(Math.abs(dA))}° ${dA > 0 ? 'steeper' : 'slacker'}, so measured along it the same point reads ${n1(Math.abs(r.heightAlong - r.ref.fit.saddleHeight))} mm ${r.heightAlong < r.ref.fit.saddleHeight ? 'less' : 'more'}.`;
  }
  function railWhy(r) {
    if (r.railMove == null) return `Plumb line from the saddle centre, ${n1(r.ref.fit.setback)} mm behind the BB. On this frame that puts the centre ${n0(Math.abs(r.noseAhead))} mm ${r.noseAhead < 0 ? 'behind' : 'ahead of'} the seat tube line at saddle height.`;
    if (Math.abs(r.railMove) < 0.5) return 'Saddle sits in the same place on its rails, same seatpost.';
    const back = r.railMove < 0;
    return `Same point from the BB. At saddle height this seat tube sits ${n0(Math.abs(r.railMove))} mm ${back ? 'further forward' : 'further back'}, so slide the saddle ${n0(Math.abs(r.railMove))} mm ${back ? 'back' : 'forward'} on its rails (same seatpost)${Math.abs(r.railMove) > 15 ? ` or use a post with about ${n0(Math.abs(r.railMove))} mm ${back ? 'more' : 'less'} setback` : ''}.`;
  }
  /* ---------- rendering: outputs ---------- */
  function srcTag(src) { return `<span class="src${src === 'chart' ? ' chart' : ''}">${src === 'chart' ? 'chart' : 'from tubes'}</span>`; }

  function renderRefStrip() {
    const el = $('refStrip'); if (!el) return;
    const g = GB.frameGeometry(curRef());
    el.innerHTML = g.stack != null && g.reach != null
      ? `<span>Stack <b>${n0(g.stack)}</b> ${srcTag(g.stackSrc)}</span><span>Reach <b>${n0(g.reach)}</b> ${srcTag(g.reachSrc)}</span>`
      : '<span>Fill in the frame numbers to place the head tube.</span>';
  }

  function renderCP() {
    const el = $('cpCard');
    const r = curRef();
    const m = model.refs[r.id];
    const fitRef = isFitRef(r);
    if (!m.fp) {
      el.innerHTML = `<h3>Fit points</h3><p>The saddle ${fitRef ? 'centre' : 'tip'} and hand position appear here once ${fitRef ? 'your fit is' : 'this bike\'s frame and setup are'} filled in.</p>${m.errs.map((x) => `<p class="${x.includes('still needs:') ? 'need' : 'err'}">${esc(x)}</p>`).join('')}`;
      return;
    }
    const { saddle, hand, reachH, drop, riderReach } = m.fp;
    const halfW = m.fp.half;
    const f = r.fit;
    let text;
    if (fitRef) {
      text = `
      <p class="implied">Your saddle centre sits <b>${n0(Math.abs(saddle.x))} mm</b> ${saddle.x <= 0 ? 'behind' : 'ahead of'} and <b>${n0(saddle.y)} mm</b> above the BB.</p>
      <p>${halfW > 0 ? `Personal reach ${n1(riderReach)} mm, taped out to the side of a ${n0(f.barWidth)} mm bar, is <b>${n1(reachH)} mm</b> in side view` : `Handlebar width is 0, so personal reach is read as a side-view distance, <b>${n1(reachH)} mm</b>. If you taped it to your hand at the side of the bar, enter the bar width`}. With ${n1(drop)} mm of drop, that places your hands.</p>
      <p>No bike here, so each target bike gets its full setup rather than changes from another bike.</p>`;
    } else {
      const stem = m.fp.stem; const c = m.fp.centre;
      text = `
      <p class="implied">This ${n1(stem.length)} mm stem at ${angTxt(stem.angle)} with ${n1(f.spacers)} mm of spacers puts your hands <b>${n0(reachH)} mm</b> ahead of the saddle tip and <b>${n0(Math.abs(drop))} mm</b> ${drop >= 0 ? 'below' : 'above'} the saddle top.</p>
      ${c ? `<p>Your fit on this bike, measured from the saddle centre like a personal fit: saddle height <b>${n1(Math.hypot(c.x, c.y))} mm</b> in a straight line, setback <b>${n1(-c.x)} mm</b>, personal reach <b>${n1(m.fp.centreReach)} mm</b>${halfW > 0 ? ` to the side of a ${n0(f.barWidth)} mm bar` : ''} and handlebar drop <b>${n1(drop)} mm</b>.</p>`
        : `<p>Your fit on this bike: personal reach <b>${n1(riderReach)} mm</b> from the saddle tip${halfW > 0 ? ` to the side of a ${n0(f.barWidth)} mm bar` : ''} and handlebar drop <b>${n1(drop)} mm</b>. A personal fit measures from the saddle centre, so enter the saddle length to see it that way and copy it.</p>`}
      ${f.stemImplied ? '<p class="warn">This stem was worked out from the personal reach and drop saved earlier. Enter the stem actually fitted on this bike.</p>' : ''}
      <div class="row-actions"><button class="btn" type="button" id="toFitRef"${c ? '' : ' disabled title="Enter the saddle length first"'}>Copy as personal fit</button></div>`;
    }
    el.innerHTML = `
      <h3>Fit points</h3>
      <table>
        <thead><tr><th></th><th class="num">X fwd</th><th class="num">Y up</th></tr></thead>
        <tbody>
          <tr><td><span class="pt"></span>Saddle ${fitRef ? 'centre' : 'tip'}</td><td class="num">${n0(saddle.x)}</td><td class="num">${n0(saddle.y)}</td></tr>
          <tr><td><span class="pt"></span>Hand position</td><td class="num">${n0(hand.x)}</td><td class="num">${n0(hand.y)}</td></tr>
        </tbody>
      </table>
      ${text}
      <p>Selected: every target bike in step 2 is set up to match this one.</p>`;
  }

  function renderBikeOut() {
    const b = curBike();
    const r = model.res[b.id];
    $('outTitle').textContent = `Changes for ${b.name || 'this bike'}`;
    $('outSub').textContent = `To match ${refName(r.ref)}, the ${kindName(r.ref)} selected in step 1.`;
    const out = $('bikeOut');
    if (r.refErrors) {
      out.innerHTML = `<div class="empty"><b>Fill in ${esc(refName(r.ref))} in step 1 first.</b><br>${r.refErrors.map(esc).join('<br>')}</div>`;
      return;
    }
    if (r.errors) {
      out.innerHTML = `<div class="empty"><b>Fill in this target bike's frame and handlebar.</b><br>${r.errors.map(esc).join('<br>')}</div>`;
      return;
    }
    const fit = r.ref.fit;
    const o = chosenFor(b, r);
    const hasBike = !!r.fp.bike; // a personal fit has no bike to compare with
    const dH = hasBike ? r.heightAlong - fit.saddleHeight : 0;
    const checks = r.checks.slice();
    if (o && o.err <= 5 && !checks.some((c) => c.level === 'bad')) checks.unshift({ level: 'ok', text: `This frame can carry the fit of ${refName(r.ref)}. Hand position ${missTxt(o)}${o.err >= 1 ? ' of the target' : ''}.` });

    out.innerHTML = `
      <div class="frame-strip">
        <span>Stack <b>${n0(r.geo.stack)}</b> ${srcTag(r.geo.stackSrc)}</span>
        <span>Reach <b>${n0(r.geo.reach)}</b> ${srcTag(r.geo.reachSrc)}</span>
      </div>
      <div class="tiles">
        <div class="tile" data-hl="height"><span class="t-l">Saddle height</span><span class="t-v">${n1(r.heightAlong)}<small>mm</small></span>
          <span class="t-d${hasBike && Math.abs(dH) < 0.05 ? ' same' : ''}">${hasBike ? deltaTxt(dH, 1) : 'along this seat tube'}</span>
          <span class="t-s">${saddleWhy(r)}</span></div>
        <div class="tile" data-hl="setback"><span class="t-l">Saddle setback</span><span class="t-v">${n1(fit.setback)}<small>mm</small></span>
          <span class="t-d same">same as reference</span>
          <span class="t-s">${railWhy(r)}</span></div>
        <div class="tile" data-hl="stem"><span class="t-l">Stem</span><span class="t-v">${o ? `${o.length}<small>mm</small> ${angTxt(o.angle)}` : 'n/a'}</span>
          <span class="t-d${o && hasBike && stemChange(o, r.fp) === 'Same as reference' ? ' same' : ''}">${o && hasBike ? esc(stemChange(o, r.fp)) : o ? 'closest from your stems' : ''}</span>
          <span class="t-s">${o ? (() => { const ex = r.cockpit.exactFor(o.angle); return `Exact fit at ${angTxt(o.angle)}: <b>${n1(ex.length)} mm</b> with ${n1(ex.spacers)} mm spacers. `; })() : ''}${hasBike ? `Reference: ${esc(stemTxt(refStem(r.fp)))}` : ''}</span></div>
        <div class="tile" data-hl="spacers"><span class="t-l">Spacers</span><span class="t-v">${o ? n1(o.spacers) : 'n/a'}<small>mm</small></span>
          <span class="t-d${o && hasBike && Math.abs(o.spacers - fit.spacers) < 0.05 ? ' same' : ''}">${o && hasBike ? deltaTxt(o.spacers - fit.spacers, 1) : ''}</span>
          <span class="t-s">Hand position <b>${o ? missTxt(o) : 'n/a'}</b></span></div>
      </div>
      <ul class="checks">${checks.map((c) => `<li class="${c.level}">${esc(c.text)}</li>`).join('')}</ul>
      <div>
        <div class="sub-h"><h4>Stem and spacer options</h4><p>Closest combinations from your stems. Pick one to see it drawn.</p></div>
        <div class="tbl-wrap">
          <table class="data" id="optTable">
            <thead><tr><th></th><th>Stem</th><th class="num">Spacers</th><th class="num">Hand fwd</th><th class="num">Hand up</th><th class="num">Miss</th></tr></thead>
            <tbody>${r.cockpit.options.concat(o && !r.cockpit.options.includes(o) ? [o] : []).map((x, i) => {
              const sel = o && optKey(x) === optKey(o);
              return `<tr class="opt${sel ? ' pick' : ''}" data-opt="${esc(optKey(x))}">
                <td><input type="radio" name="opt" id="opt-${i}" aria-label="Use ${esc(stemTxt(x))} with ${n1(x.spacers)} mm spacers" ${sel ? 'checked' : ''}></td>
                <td>${esc(stemTxt(x))}</td><td class="num">${n1(x.spacers)}</td>
                <td class="num">${sgn(x.dx, 1)}</td><td class="num">${sgn(x.dy, 1)}</td><td class="num">${n1(x.err)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderCompare() {
    const el = $('cmp');
    const mark = (src) => (src === 'chart' ? '' : '<span class="calc-mark">calc</span>');
    const na = 'n/a';
    // reference column: the selected reference as set up today
    const refCols = [curRef()].map((ref) => {
      const fp = model.refs[ref.id].fp;
      const f = ref.fit;
      return {
        id: ref.id, name: refName(ref), isRef: true,
        vals: fp && !fp.bike ? {
          match: 'reference', sta: na, stack: na, height: `${n1(f.saddleLine)} mm, straight to centre`, setback: `${n1(f.setback)} mm`, rails: na,
          stem: na, spacers: na, bar: na, width: f.barWidth > 0 ? `${n0(f.barWidth)} mm` : 'not entered', hand: 'target',
        } : fp ? {
          match: 'reference', sta: `${n1(ref.sta)}°`, stack: `${n0(fp.geo.stack)}${mark(fp.geo.stackSrc)} / ${n0(fp.geo.reach)}${mark(fp.geo.reachSrc)}`,
          height: `${n1(f.saddleHeight)} mm`, setback: `${n1(f.setback)} mm`, rails: 'as measured',
          stem: esc(stemTxt(refStem(fp))), spacers: `${n1(f.spacers)} mm`, bar: `${n1(f.barReach)} mm`, width: f.barWidth > 0 ? `${n0(f.barWidth)} mm` : 'not entered', hand: 'target',
        } : null,
      };
    });
    const bikeCols = state.bikes.map((b) => {
      const r = model.res[b.id];
      if (!r.fp || r.errors) return { id: b.id, name: b.name || 'Untitled bike', vals: null, refName: refName(r.ref) };
      const o = chosenFor(b, r); const f = r.ref.fit;
      return {
        id: b.id, name: b.name || 'Untitled bike',
        vals: {
          match: esc(refName(r.ref)), sta: `${n1(b.sta)}°${r.fp.bike ? ` <span class="calc-mark">${sgn(b.sta - r.fp.bike.sta, 1)}</span>` : ''}`, stack: `${n0(r.geo.stack)}${mark(r.geo.stackSrc)} / ${n0(r.geo.reach)}${mark(r.geo.reachSrc)}`,
          height: `${n1(r.heightAlong)} mm${r.fp.bike ? ` <span class="calc-mark">${sgn(r.heightAlong - f.saddleHeight, 1)}</span>` : ''}`,
          setback: `${n1(f.setback)} mm`,
          rails: r.railMove == null ? `centre ${n0(Math.abs(r.noseAhead))} mm ${r.noseAhead < 0 ? 'behind' : 'ahead of'} seat tube` : Math.abs(r.railMove) < 0.5 ? 'same' : `${Math.abs(Math.round(r.railMove))} mm ${r.railMove > 0 ? 'forward' : 'back'}`,
          stem: o ? esc(stemTxt(o)) : na,
          spacers: o ? `${n1(o.spacers)} mm${r.fp.bike ? ` <span class="calc-mark">${sgn(o.spacers - f.spacers, 1)}</span>` : ''}` : na,
          bar: `${n1(b.barReach)} mm`, width: r.barWidth > 0 ? `${n0(r.barWidth)} mm${Math.abs(r.handShift) >= 0.5 ? ` <span class="calc-mark">hands ${sgn(r.handShift, 1)}</span>` : ''}` : na,
          hand: o ? `<span class="${o.err > 5 ? 'miss-bad' : 'miss-ok'}">${esc(missTxt(o))}</span>` : na,
        },
      };
    });
    const cols = refCols.concat(bikeCols);
    const rows = [
      ['match', 'Matched to'], ['sta', 'Seat tube angle'], ['stack', 'Stack / reach'], ['height', 'Saddle height (along seat tube)'], ['setback', 'Saddle setback'],
      ['rails', 'Saddle on rails'], ['stem', 'Stem'], ['spacers', 'Spacers'], ['bar', 'Handlebar reach'], ['width', 'Handlebar width'], ['hand', 'Hand position'],
    ];
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
  function renderViz() {
    const el = $('vizWrap');
    const b = curBike();
    const r = model.res[b.id];
    if (!r || !r.fp || r.errors) { el.innerHTML = '<div class="empty">The side view appears once the reference and this frame are complete.</div>'; return; }
    const o = chosenFor(b, r);
    const hasBike = !!r.fp.bike;
    const svg = GBDraw.render({ r, o, show: layers, names: { bike: b.name || 'This bike', ref: refName(r.ref) } });
    const tog = (k, label) => `<label class="tog"><input type="checkbox" data-layer="${k}" id="lay-${k}"${layers[k] ? ' checked' : ''}> ${label}</label>`;
    el.innerHTML = `
      <div class="viz-bar">
        <div class="legend">
          <span class="lg"><i class="sw bk"></i>${esc(b.name || 'This bike')}</span>
          <span class="lg"><i class="sw rf"></i>${esc(refName(r.ref))}${hasBike ? ', reference' : ': BB to saddle centre'}</span>
          <span class="lg"><i class="tg"></i>Saddle ${hasBike ? 'tip' : 'centre'} and hand position</span>
        </div>
        <div class="toggles">${hasBike ? tog('ref', 'Reference bike') : ''}${tog('dims', 'Dimensions')}${tog('grid', 'Grid')}</div>
      </div>
      <div class="viz">
        <figure class="draw">${svg.main}<figcaption>Side view on the BB grid. Squares are 50 mm; labels every 200 mm.</figcaption></figure>
        <div class="viz-side">
          <figure class="draw">${svg.front}<figcaption>Front end close-up, 10 mm squares</figcaption></figure>
          <figure class="draw">${svg.saddle}<figcaption>Saddle close-up, 10 mm squares</figcaption></figure>
        </div>
      </div>`;
  }
  // a result tile lights up its dimension in the drawings
  function highlight(key, on) {
    document.querySelectorAll(`#vizWrap [data-dim="${key}"]`).forEach((n) => n.classList.toggle('hl', on));
  }
  document.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-hl]'); if (t) highlight(t.dataset.hl, true); });
  document.addEventListener('mouseout', (e) => { const t = e.target.closest && e.target.closest('[data-hl]'); if (t && !t.contains(e.relatedTarget)) highlight(t.dataset.hl, false); });
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
    renderRefStrip(); renderCP(); renderBikeOut(); renderViz(); renderCompare();
  }
  function renderAll() { renderInputs(); renderOutputs(); }

  /* ---------- saving ---------- */
  const saveEl = $('saveState');
  function setSave(kind) {
    const text = {
      loading: 'Loading saved bikes…', example: 'Nothing saved yet', saving: 'Saving…', saved: 'Saved',
      local: 'Saved in this browser', file: 'Saved to your data file', web: 'Not kept on this site', error: 'Not saved yet, retrying',
    }[kind] || '';
    saveEl.dataset.state = kind; saveEl.textContent = text;
  }
  // what the save chip says when the account copy isn't in play
  function idleSave(localOk) {
    if (!keepInBrowser) return fileState === 'linked' ? 'file' : 'web';
    return localOk ? 'local' : 'error';
  }

  let docRef = null; let remote = 'pending';
  let saveTimer = null; let writing = false; let again = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function scheduleSave() {
    if (!loaded) return;
    lastEdit = Date.now();
    if (state.example) state.example = false;
    setSave('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  async function flush() {
    if (!loaded) return;
    const localOk = saveLocal();
    writeFile();
    if (!docRef || remote !== 'on') { setSave(idleSave(localOk)); return; }
    if (writing) { again = true; return; }
    writing = true;
    try {
      await docRef.set({ state: clone(state), savedAt: new Date(lastEdit).toISOString() });
      setSave('saved');
    } catch (e) {
      const code = e && e.code;
      if (code === 'unavailable' || code === 'resource_exhausted') { setSave('error'); setTimeout(flush, 2000 + Math.random() * 2000); }
      else { remote = 'off'; setSave(idleSave(localOk)); }
    } finally {
      writing = false;
      if (again) { again = false; flush(); }
    }
  }
  async function getWithRetry(ref) {
    try { return await ref.get(); } catch (e) {
      if (e && e.code === 'unavailable') { await sleep(1200); return ref.get(); }
      throw e;
    }
  }
  // Reads the account copy and any data saved by the earlier version. Resolves null when
  // there is no account storage in this view.
  async function openStore() {
    if (!window.claude || typeof window.claude.use !== 'function') return null;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return null;
    const id = await user.id();
    if (!id) return null;
    const canWrite = await user.can('data.write').catch(() => null);
    if (canWrite === false) return null;
    const ref = db.doc(`data/users/${id}/garage3`);
    const snap = await getWithRetry(ref);
    let old = null;
    try { const s2 = await db.doc(`data/users/${id}/garage`).get(); if (s2.exists && s2.data()) old = s2.data().state || null; } catch (e) { /* earlier data is optional */ }
    return { ref, body: snap.exists ? snap.data() : null, old };
  }
  async function connect() {
    setSave('loading');
    let store = null;
    try { store = await Promise.race([openStore(), sleep(9000).then(() => null)]); } catch (e) { store = null; }
    let push = false;
    if (store) {
      docRef = store.ref; remote = 'on';
      const body = store.body;
      const remoteAt = body && body.savedAt ? Date.parse(body.savedAt) || 0 : 0;
      const localAt = localSnap ? localSnap.at : 0;
      if (body && body.state && (!localSnap || localSnap.state.example || remoteAt >= localAt)) {
        // the account copy is the newest: use it
        state = normalize(body.state); lastEdit = remoteAt; saveLocal();
      } else if (localSnap && !localSnap.state.example) {
        // this browser holds newer changes than the account copy: keep them and send them up
        push = true;
      }
      oldData = store.old;
    } else {
      remote = 'off';
    }
    if (!oldData) oldData = loadOldLocal();
    if (oldData && (oldData.example || !Array.isArray(oldData.bikes) || !oldData.bikes.length)) oldData = null;
    loaded = true;
    renderAll();
    renderImport();
    if (push) flush();
    else setSave(state.example ? 'example' : remote === 'on' ? 'saved' : idleSave(true));
    initFile();
  }


  /* ---------- data file on this computer ---------- */
  let fileState = 'none'; // none | linked | prompt
  let fileMsg = '';
  let pendingOpen = null; // a file picked to open, waiting for the replace confirmation
  let fileWriting = false; let fileAgain = false;
  const timeNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function summarize(s) {
    const n = normalize(s);
    const filled = (r) => Object.values(r.fit).some(finite) || GEO_KEYS.some((k) => finite(r[k]));
    const count = (k, word) => { const c = n.refs.filter((r) => r.kind === k && filled(r)).length; return `${c} ${word}${c === 1 ? '' : 's'}`; };
    return `${count('bike', 'bike fit')}, ${count('fit', 'personal fit')} and ${n.bikes.length} target bike${n.bikes.length === 1 ? '' : 's'}`;
  }
  async function writeFile() {
    if (fileState !== 'linked') return;
    if (fileWriting) { fileAgain = true; return; }
    fileWriting = true;
    try { await GBFile.write(state, lastEdit || Date.now()); fileMsg = `saved ${timeNow()}`; }
    catch (e) { fileState = 'prompt'; fileMsg = 'Could not write to the file.'; }
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
        renderAll(); renderImport();
        fileMsg = `loaded ${timeNow()}`;
        flush();
      } else {
        await GBFile.write(state, lastEdit || Date.now());
        fileMsg = `saved ${timeNow()}`;
      }
    } catch (e) { fileMsg = (e && e.message) || 'Could not read the file.'; }
  }
  async function initFile() {
    let st = 'none';
    try { st = await GBFile.restore(); } catch (e) { st = 'none'; }
    if (st === 'granted') { fileState = 'linked'; await syncWithFile(); }
    else if (st === 'prompt') fileState = 'prompt';
    renderFileBar();
  }
  async function downloadData() {
    const text = GBFile.pack(state, lastEdit || Date.now());
    const name = 'bikefit-data.json';
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await window.claude.use('downloads');
      if (!dl) { fileMsg = 'Downloads are not available here.'; return; }
      try { await dl.save({ filename: name, data: text }); fileMsg = `Downloaded ${name}.`; }
      catch (err) { fileMsg = err && err.code === 'declined' ? 'Download cancelled.' : 'The download could not start here.'; }
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    fileMsg = `Downloaded ${name}.`;
  }
  function renderFileBar() {
    const el = $('fileBar');
    if (!el) return;
    if (!loaded) { el.innerHTML = ''; return; }
    const btn = (id, label) => `<button class="btn" type="button" id="${id}">${label}</button>`;
    let html;
    if (pendingOpen) {
      html = `<span class="file-status"><b>${esc(pendingOpen.name)}</b> holds ${esc(pendingOpen.summary)}. Replace what is on this page with it?</span>${btn('fileReplace', 'Replace')}${btn('fileCancel', 'Cancel')}`;
    } else if (GBFile.canLink() && fileState === 'linked') {
      html = `<span class="file-status ok">Saving to <b>${esc(GBFile.name)}</b>${fileMsg ? `, ${esc(fileMsg)}` : ''}</span>${btn('fileOpen', 'Open another file')}${btn('fileUnlink', 'Stop saving to file')}`;
    } else if (GBFile.canLink() && fileState === 'prompt') {
      html = `<span class="file-status warn">${fileMsg ? `${esc(fileMsg)} ` : ''}<b>${esc(GBFile.name)}</b> needs your permission again to keep saving.</span>${btn('fileReconnect', 'Reconnect')}${btn('fileUnlink', 'Forget this file')}`;
    } else if (GBFile.canLink()) {
      html = `<span class="file-status">${fileMsg ? esc(fileMsg) : (keepInBrowser ? 'Keep your bikes in a file on this computer as well.' : 'This site does not keep your bikes between visits. Save them to a file to keep them.')}</span>${btn('fileCreate', 'Save to a file')}${btn('fileOpen', 'Open data file')}`;
    } else {
      html = `<span class="file-status">${fileMsg ? esc(fileMsg) : (keepInBrowser ? 'Keep a copy of your bikes in a file on this computer.' : 'This site does not keep your bikes between visits. Download them to a file to keep them.')}</span>${btn('fileDownload', 'Download data file')}${btn('fileOpen', 'Open data file')}`;
    }
    el.innerHTML = html;
  }
  async function fileAction(id) {
    try {
      if (id === 'fileCreate') {
        await GBFile.create('bikefit-data.json');
        fileState = 'linked';
        await GBFile.write(state, lastEdit || Date.now());
        fileMsg = `saved ${timeNow()}`;
      } else if (id === 'fileReconnect') {
        if (await GBFile.reconnect()) { fileState = 'linked'; fileMsg = ''; await syncWithFile(); }
        else fileMsg = 'Permission was not given, so the file is not being updated.';
      } else if (id === 'fileUnlink') {
        await GBFile.unlink(); fileState = 'none';
        fileMsg = 'No longer saving to a file. Your bikes are still saved on this page.';
      } else if (id === 'fileOpen') {
        if (!GBFile.canLink()) { $('fileInput').click(); return; }
        const pk = await GBFile.pick();
        if (!pk.data) { // an empty file: start saving to it
          await GBFile.adopt(pk.handle); fileState = 'linked';
          await GBFile.write(state, lastEdit || Date.now());
          fileMsg = `saved ${timeNow()}`;
        } else pendingOpen = { name: pk.name, handle: pk.handle, data: pk.data, summary: summarize(pk.data.state) };
      } else if (id === 'fileReplace' && pendingOpen) {
        const po = pendingOpen; pendingOpen = null;
        if (po.handle) { await GBFile.adopt(po.handle); fileState = 'linked'; }
        state = normalize(po.data.state);
        renderAll(); renderImport();
        scheduleSave(); // the opened data is now the newest copy everywhere
        fileMsg = `opened ${po.name}`;
      } else if (id === 'fileCancel') {
        pendingOpen = null; fileMsg = '';
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

  /* ---------- bikes saved by the earlier hoods-based version ---------- */
  function mapOldBike(b) {
    const num = (v) => (finite(v) ? v : null);
    return {
      name: b.name || 'Bike', sta: num(b.sta), hta: num(b.hta), htLength: num(b.htLength), ett: num(b.ett),
      seatTube: num(b.seatTube), bbDrop: num(b.bbDrop),
      forkA2C: finite(b.forkA2C) ? b.forkA2C + (finite(b.lowerStack) ? b.lowerStack : 0) : null,
      forkOffset: num(b.forkOffset), stack: num(b.stack), reach: num(b.reach),
    };
  }
  function convertOldFit(old, refB, newRef) {
    const f = old.fit || {}; const p = old.parts || {};
    const staRef = f.measuredOn === 'custom' && finite(f.customSTA) ? f.customSTA : refB.sta;
    const S = GB.rad(staRef);
    const yS = f.saddleHeight * Math.sin(S);
    let xNose = -f.setback;
    if (f.setbackMode === 'post') {
      const yR = yS - (finite(p.saddleRailHeight) ? p.saddleRailHeight : 45);
      xNose = -yR / Math.tan(S) - (f.refPostOffset || 0) + (f.refRailShift || 0) + (finite(p.noseToRail) ? p.noseToRail : 135);
    }
    const reachH = f.reachMode === 'direct' ? Math.sqrt(Math.max(0, f.reach ** 2 - f.drop ** 2)) : f.reach;
    const drop = f.drop + (finite(refB.hoodHeight) ? refB.hoodHeight : 30) - GB.BAR_R;
    const fit = {
      saddleHeight: r1(yS / Math.sin(GB.rad(newRef.sta))), setback: r1(-xNose),
      riderReach: r1(Math.hypot(reachH, drop)), drop: r1(drop),
      barReach: finite(refB.barReach) ? refB.barReach : 80, spacers: newRef.fit.spacers, barWidth: 0,
    };
    if (!Object.values(fit).every(finite)) return null;
    const geo = GB.frameGeometry(newRef);
    const refBike = Object.assign({}, newRef, { stack: geo.stack, reach: geo.reach });
    const hand = { x: -fit.setback + Math.sqrt(fit.riderReach ** 2 - fit.drop ** 2 - (fit.barWidth / 2) ** 2), y: fit.saddleHeight * Math.sin(GB.rad(newRef.sta)) - fit.drop };
    const target = { x: hand.x - fit.barReach, y: hand.y - GB.BAR_R };
    const best = GB.solveCockpit(refBike, Object.assign({}, state.opts, { maxSpacers: 80 }), target, -6).best;
    if (best) fit.spacers = best.spacers;
    return fit;
  }
  function importOld(replace) {
    const old = oldData; const notes = [];
    const oldBikes = old.bikes.filter(isObj);
    const f = old.fit || {}; const p = old.parts || {};
    const refB = oldBikes.find((b) => b.id === f.measuredOn) || oldBikes[0];
    const newRef = Object.assign({ id: uid('r'), kind: 'bike', fit: BLANK_FIT() }, mapOldBike(refB));
    let fit = null;
    try { fit = convertOldFit(old, refB, newRef); } catch (e) { fit = null; }
    if (fit) {
      newRef.fit = Object.assign(BLANK_FIT(), fit, { handFrom: 'reach' });
      stemFromReach(newRef);
      const nf = newRef.fit;
      notes.push(`${newRef.name} is now a bike fit. Its hand position was converted from the old hood measurements into ${n1(nf.spacers)} mm of spacers${nf.stemLength != null ? ` and a ${n1(nf.stemLength)} mm stem at ${angTxt(nf.stemAngle)}` : ''}. Replace them with what is fitted on the bike.`);
    } else notes.push(`${newRef.name} is now a bike fit, but its setup could not be converted. Enter it again in step 1.`);
    const rest = oldBikes.filter((b) => b !== refB).map((b) => Object.assign(mapOldBike(b), { id: uid(), refId: newRef.id, barReach: finite(b.barReach) ? b.barReach : newRef.fit.barReach, pick: '' }));
    if (replace) {
      state.refs = [newRef];
      state.bikes = rest.length ? rest : [newBikeFrom(newRef, 'Bike 2')];
      if (p.stemLengths) state.opts.stemLengths = p.stemLengths;
      if (p.stemAngles) state.opts.stemAngles = p.stemAngles;
      if (finite(p.spacerStep)) state.opts.spacerStep = p.spacerStep;
      if (finite(refB.maxSpacers)) state.opts.maxSpacers = refB.maxSpacers + (finite(refB.headsetCap) ? refB.headsetCap : 0);
    } else {
      state.refs.push(newRef);
      state.bikes.push(...rest);
      if (rest.length) notes.push(`${rest.length} target bike${rest.length === 1 ? '' : 's'} added to step 2.`);
    }
    selectRef(newRef.id);
    if (rest.length) state.selected = rest[0].id;
    else if (!state.bikes.some((b) => b.id === state.selected)) state.selected = state.bikes[0].id;
    state.importV2Done = true;
    importNote = notes.join(' ');
    renderAll(); renderImport(); scheduleSave();
  }
  function renderImport() {
    const el = $('importBanner');
    if (importNote) {
      el.innerHTML = `<span><strong>Brought in from the earlier version.</strong> ${esc(importNote)}</span><div class="row-actions"><button class="btn" type="button" data-import="ok">OK</button></div>`;
      el.hidden = false; return;
    }
    if (!oldData || state.importV2Done) { el.hidden = true; return; }
    const names = oldData.bikes.map((b) => b && b.name).filter(Boolean);
    el.innerHTML = `<span><strong>Bikes saved by the earlier version were found:</strong> ${esc(names.join(', '))}.</span>
      <div class="row-actions">
        ${state.example ? '<button class="btn" type="button" data-import="replace">Use them</button>' : '<button class="btn" type="button" data-import="add">Add them</button>'}
        <button class="btn" type="button" data-import="dismiss">Dismiss</button>
      </div>`;
    el.hidden = false;
  }

  /* ---------- dark mode ---------- */
  const THEME_KEY = 'geobike.theme';
  const root = document.documentElement;
  const isDark = () => { const t = root.getAttribute('data-theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  function syncThemeBtn() { const b = $('themeBtn'); if (b) b.setAttribute('aria-pressed', String(isDark())); }
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t); } catch (e) { /* follow the system */ }
  syncThemeBtn();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeBtn); } catch (e) { /* older browsers */ }
  $('themeBtn').addEventListener('click', () => {
    const t = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* this visit only */ }
    syncThemeBtn();
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
  const objFor = (scope) => (scope === 'bike' ? curBike() : scope === 'ref' ? curRef() : scope === 'fit' ? curRef().fit : state[scope]);
  document.addEventListener('input', (e) => {
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
    obj[key] = v;
    if (scope === 'bike' && key === 'name') renderTabs();
    if (scope === 'ref' && key === 'name') {
      renderRefTabs();
      const sel = $('bike-refId');
      if (sel) { const opt = [...sel.options].find((x) => x.value === obj.id); if (opt) opt.textContent = v || 'Untitled reference'; }
    }
    if (scope === 'bike' || scope === 'ref') refreshPlaceholders(scope, obj);
    if (scope === 'fit' && (key === 'stemLength' || key === 'stemAngle')) delete obj.stemImplied;
    if (scope === 'fit' && key === 'barWidth') { const w = $('bike-barWidth'); if (w) w.placeholder = finite(v) && v > 0 ? `same: ${v}` : 'same as reference'; }
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
    if (fb) { fileAction(fb.id); return; }
    const imp = e.target.closest('[data-import]');
    if (imp) {
      const act = imp.dataset.import;
      if (act === 'replace') importOld(true);
      else if (act === 'add') importOld(false);
      else if (act === 'dismiss') { state.importV2Done = true; renderImport(); scheduleSave(); }
      else { importNote = ''; renderImport(); }
      return;
    }
    const rtab = e.target.closest('[data-reftab]');
    const rkind = e.target.closest('[data-refkind]');
    if (rtab || rkind) {
      // a kind tab opens the one last used in it; every target bike follows what is open
      if (rtab) selectRef(rtab.dataset.reftab);
      else {
        const k = rkind.dataset.refkind;
        selectRef(ofKind(k).some((r) => r.id === state.lastRef[k]) ? state.lastRef[k] : ofKind(k)[0].id);
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
    if (addKind || dupR || toFit) {
      const src = curRef();
      let made;
      if (addKind) {
        made = blankRef(addKind, uid('r'), `${DEFAULT_NAME[addKind]} ${ofKind(addKind).length + 1}`);
      } else if (dupR) {
        made = Object.assign(clone(src), { id: uid('r'), name: `${refName(src)} copy` });
      } else {
        // the fit this bike gives, kept as the rider's own numbers
        // a personal fit is taken at the saddle centre, which needs the saddle length
        const fp = model && model.refs[src.id] && model.refs[src.id].fp;
        if (!fp || !fp.centre) return;
        made = blankRef('fit', uid('r'), `From ${refName(src)}`);
        Object.assign(made.fit, { saddleLine: r1(Math.hypot(fp.centre.x, fp.centre.y)), setback: r1(-fp.centre.x), riderReach: r1(fp.centreReach), drop: r1(fp.drop), barWidth: src.fit.barWidth });
      }
      state.refs.push(made); selectRef(made.id);
      renderAll(); scheduleSave();
      $('ref-name').focus(); $('ref-name').select();
      return;
    }
    const delR = e.target.closest('#delRef');
    if (delR && ofKind(curRef().kind).length > 1) {
      if (!armed(delR, 'Click again to delete', `Delete ${kindName(curRef())}`)) return;
      const gone = state.selectedRef; const kind = curRef().kind;
      state.refs = state.refs.filter((r) => r.id !== gone);
      for (const b of state.bikes) if (b.refId === gone) b.refId = state.refs[0].id;
      selectRef(ofKind(kind)[0].id);
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
    if (del && state.bikes.length > 1) {
      if (!armed(del, 'Click again to delete', 'Delete target bike')) return;
      state.bikes = state.bikes.filter((b) => b.id !== state.selected);
      state.selected = state.bikes[0].id;
      renderAll(); scheduleSave();
      return;
    }
    const row = e.target.closest('tr.opt');
    if (row) {
      const b = curBike(); const r = model.res[b.id];
      b.pick = r && r.cockpit && r.cockpit.best && row.dataset.opt === optKey(r.cockpit.best) ? '' : row.dataset.opt;
      renderOutputs(); scheduleSave();
      const radio = document.querySelector(`tr.opt[data-opt="${CSS.escape(row.dataset.opt)}"] input`);
      if (radio) radio.focus({ preventScroll: true });
    }
  });

  renderAll();
  connect();
})();
