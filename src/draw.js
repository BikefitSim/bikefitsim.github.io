/* BikefitSim drawings: technical side view of a bike over its reference, on the BB grid.
   All geometry in mm (BB at 0,0, X forward, Y up); SVG y is flipped. Strokes don't scale
   with zoom (vector-effect), text is sized from the screen width the view is designed for. */
const GBDraw = (() => {
  const RAIL_DROP = 45;   // saddle top to rails
  const POST_HEAD = 18;   // rails to top of the post shaft
  const RIM_R = 311;
  const ZOOM_PX = 1.5;   // screen px per mm on the zoomed ground view: 10 mm squares are 15 px

  const f1 = (v) => v.toFixed(1);
  const MINUS = '−';
  const n0 = (v) => { const r = Math.round(v); return (r < 0 ? MINUS : '') + Math.abs(r); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const add = (a, b, t = 1) => ({ x: a.x + t * b.x, y: a.y + t * b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const len = (v) => Math.hypot(v.x, v.y);
  const unit = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; };
  const perp = (v) => ({ x: -v.y, y: v.x }); // 90° counter-clockwise in mm space

  /* One renderer per view: knows its user units per screen pixel (k). */
  function View(vb, designW, fixed = false) {
    const k = vb.w / designW;
    const P = (p) => `${f1(p.x)},${f1(-p.y)}`;
    const attrs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([a, v]) => ` ${a}="${v}"`).join('');
    const line = (a, b, cls, extra = {}) => `<line class="${cls}" x1="${f1(a.x)}" y1="${f1(-a.y)}" x2="${f1(b.x)}" y2="${f1(-b.y)}"${attrs(extra)}></line>`;
    const circle = (c, r, cls, extra = {}) => `<circle class="${cls}" cx="${f1(c.x)}" cy="${f1(-c.y)}" r="${f1(r)}"${attrs(extra)}></circle>`;
    const path = (d, cls, extra = {}) => `<path class="${cls}" d="${d}"${attrs(extra)}></path>`;
    const poly = (pts, cls, extra = {}) => `<polygon class="${cls}" points="${pts.map(P).join(' ')}"${attrs(extra)}></polygon>`;
    // text at a point, offset in screen px, optional rotation in degrees (mm space, counter-clockwise)
    const text = (p, str, cls, { dx = 0, dy = 0, anchor = 'middle', rot = 0, key } = {}) => {
      const x = p.x + dx * k; const y = -p.y + dy * k;
      const tr = rot ? ` transform="rotate(${f1(-rot)} ${f1(x)} ${f1(y)})"` : '';
      return `<text class="${cls}" x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}"${tr}${key ? ` data-dim="${key}"` : ''}>${esc(str)}</text>`;
    };
    /* Linear dimension between a and b, drawn offset by `off` px along the left normal of a→b. */
    const dim = (a, b, off, label, { key, cls = 'dim', ext = true, anchor = 'middle', labelOff = -5 } = {}) => {
      const u = unit(sub(b, a));
      const nrm = perp(u);
      const o = off * k;
      const a2 = add(a, nrm, o); const b2 = add(b, nrm, o);
      const tick = 4 * k;
      const td = { x: (u.x + nrm.x) * tick * 0.7, y: (u.y + nrm.y) * tick * 0.7 };
      let s = `<g class="${cls}"${key ? ` data-dim="${key}"` : ''}>`;
      if (ext && Math.abs(off) > 2) {
        s += line(add(a, nrm, Math.sign(off) * 3 * k), add(a2, nrm, Math.sign(off) * 4 * k), 'ext');
        s += line(add(b, nrm, Math.sign(off) * 3 * k), add(b2, nrm, Math.sign(off) * 4 * k), 'ext');
      }
      s += line(a2, b2, 'dl');
      s += line({ x: a2.x - td.x, y: a2.y - td.y }, { x: a2.x + td.x, y: a2.y + td.y }, 'tk');
      s += line({ x: b2.x - td.x, y: b2.y - td.y }, { x: b2.x + td.x, y: b2.y + td.y }, 'tk');
      let ang = Math.atan2(u.y, u.x) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
      const lift = add(mid, perp(unit({ x: Math.cos(ang * Math.PI / 180), y: Math.sin(ang * Math.PI / 180) })), -labelOff * k);
      s += text(lift, label, 'dt', { rot: ang, anchor });
      return s + '</g>';
    };
    const target = (p, size = 14) => {
      const s = size * k;
      const d = s * 0.55; // a red X
      return `<g class="target">${line({ x: p.x - d, y: p.y - d }, { x: p.x + d, y: p.y + d }, 'tg')}${line({ x: p.x - d, y: p.y + d }, { x: p.x + d, y: p.y - d }, 'tg')}</g>`;
    };
    // zoomed views are drawn at a fixed size and scroll in their frame
    const size = fixed ? `width:${Math.round(designW)}px;max-width:none;` : '';
    const open = (cls, extra = '') => `<svg class="geo ${cls}" viewBox="${f1(vb.x)} ${f1(-(vb.y + vb.h))} ${f1(vb.w)} ${f1(vb.h)}" style="${size}--k:${k.toFixed(4)}" ${extra}>`;
    // a point's position in screen px from the top left of the drawing
    const px = (p) => ({ x: (p.x - vb.x) / k, y: (vb.y + vb.h - p.y) / k });
    return { k, vb, P, line, circle, path, poly, text, dim, target, open, px };
  }

  /* Points for one bike set up with a given stem, spacers and bar reach. */
  function bikeParts(bike, frame, sad, cockpit, seat) {
    const S = bike.sta * Math.PI / 180;
    const H = bike.hta * Math.PI / 180;
    const d = { x: -Math.cos(H), y: Math.sin(H) };
    const n = { x: Math.sin(H), y: Math.cos(H) };
    const T = frame.T;
    const railY = sad.y - RAIL_DROP;
    const axisAt = (y) => ({ x: -y / Math.tan(S), y });
    const spTop = add(T, d, cockpit.spacers);
    const stemTop = add(T, d, cockpit.spacers + 40);
    // the post's head sets the clamp back from the seat tube line by its offset
    const clamp = { x: axisAt(railY).x - seat.postOffset / Math.sin(S), y: railY };
    const railMid = sad.x - seat.tipToRails; // middle of the saddle's rails, from its tip
    return { S, H, d, n, T, railY, axisAt, spTop, stemTop, clamp, railMid, postTop: axisAt(railY - POST_HEAD), Q: cockpit.Q, B: cockpit.B, barReach: cockpit.barReach, spacers: cockpit.spacers };
  }

  // a tyre: the ring between the rim and the wheel's outside
  function tyreRing(c, r1, r2) {
    const ring = (r) => `M${f1(c.x + r)},${f1(-c.y)}a${f1(r)},${f1(r)} 0 1 0 ${f1(-2 * r)},0a${f1(r)},${f1(r)} 0 1 0 ${f1(2 * r)},0Z`;
    return `<path class="tyre" d="${ring(r2)}${ring(r1)}"></path>`;
  }

  function drawBike(v, cls, frame, p, sad, { wheels = true, saddle = true } = {}) {
    const g = frame;
    let s = `<g class="bike ${cls}">`;
    if (wheels) {
      for (const w of [g.rear, g.front]) s += tyreRing(w, RIM_R, g.wheelR) + v.circle(w, RIM_R, 'rim');
    }
    const ttEnd = add(g.T, p.d, -18);
    const dtEnd = add(g.htBottom, p.d, 25);
    s += v.line(g.rear, { x: 0, y: 0 }, 'tube cs');
    s += v.line(g.rear, g.ssJoin, 'tube ss');
    s += v.line(g.htBottom, g.front, 'tube fork');
    s += v.line({ x: 0, y: 0 }, dtEnd, 'tube');
    s += v.line({ x: 0, y: 0 }, g.stTop, 'tube');
    s += v.line(g.ttRear, ttEnd, 'tube');
    s += v.line(g.htBottom, g.T, 'tube ht');
    // cockpit: spacer stack, stem clamp, stem, bar
    const w = 17;
    const sq = (a, b, half) => [add(a, p.n, half), add(b, p.n, half), add(b, p.n, -half), add(a, p.n, -half)];
    if (p.spacers > 0.5) s += v.poly(sq(g.T, p.spTop, w), 'spacer');
    s += v.poly(sq(p.spTop, p.stemTop, w + 1), 'part');
    s += v.line(p.Q, p.B, 'stem');
    const B = p.B; const br = Math.max(30, p.barReach);
    const rb = (dx, dy) => v.P({ x: B.x + dx, y: B.y + dy });
    const barD = `M ${v.P(B)} L ${rb(br - 30, 0)} C ${rb(br + 6, 1)} ${rb(br + 14, -38)} ${rb(br + 2, -78)} C ${rb(br - 8, -110)} ${rb(br - 32, -126)} ${rb(br - 66, -124)}`;
    if (p.barReach >= 1) s += v.path(barD, 'barbody') + v.path(barD, 'bar'); // reach 0: a flat bar, seen end-on
    s += v.circle(B, 15.9, 'barc');
    // seatpost and saddle
    if (saddle) {
      s += v.line(g.stTop, p.postTop, 'post');
      s += v.line(p.postTop, p.clamp, 'post');
      const sx = sad.x; const sy = sad.y; const L = 265;
      const sh = (dx, dy) => v.P({ x: sx + dx, y: sy + dy });
      s += v.path(`M ${sh(2, -7)} Q ${sh(-6, 1)} ${sh(-50, 0)} L ${sh(-L + 45, 5)} Q ${sh(-L + 2, 8)} ${sh(-L, -10)} L ${sh(-L + 28, -26)} L ${sh(-60, -17)} Z`, 'saddle');
      s += v.path(`M ${sh(-48, -15)} L ${v.P({ x: p.railMid - 50, y: p.railY })} L ${v.P({ x: p.railMid + 50, y: p.railY })} Z`, 'rail');
      s += v.poly([{ x: p.clamp.x - 14, y: p.railY + 4 }, { x: p.clamp.x + 14, y: p.railY + 4 }, { x: p.clamp.x + 14, y: p.railY - 6 }, { x: p.clamp.x - 14, y: p.railY - 6 }], 'clamp');
    }
    // joints
    for (const j of [{ x: 0, y: 0 }, g.stTop, g.T, g.htBottom]) s += v.circle(j, 2.6 * v.k, 'joint');
    return s + '</g>';
  }

  /* Squares of `step` mm, heavier every `major` mm, values every `lab` mm along the bottom and left
     edges. A zoomed drawing scrolls, so its values repeat every `rep` mm across it as well. */
  function grid(v, step = 50, { lab = step * 4, major = step * 2, rep = 0 } = {}) {
    const { x, y, w, h } = v.vb;
    let s = '<g class="grid">';
    const x0 = Math.ceil(x / step) * step; const y0 = Math.ceil(y / step) * step;
    for (let gx = x0; gx <= x + w; gx += step) s += v.line({ x: gx, y }, { x: gx, y: y + h }, gx === 0 ? 'axis0' : (gx % major === 0 ? 'major' : 'minor'));
    for (let gy = y0; gy <= y + h; gy += step) s += v.line({ x, y: gy }, { x: x + w, y: gy }, gy === 0 ? 'axis0' : (gy % major === 0 ? 'major' : 'minor'));
    const across = (lo, len) => { const out = [lo]; if (rep) for (let r = Math.ceil(lo / rep) * rep; r < lo + len; r += rep) if (r > lo + 40 * v.k) out.push(r); return out; };
    for (const ly of across(y, h)) for (let gx = Math.ceil(x / lab) * lab; gx <= x + w; gx += lab) s += v.text({ x: gx, y: ly }, n0(gx), 'gl', { dy: -5 });
    for (const lx of across(x, w)) for (let gy = Math.ceil(y / lab) * lab; gy <= y + h; gy += lab) if (gy > y + 20 * v.k) s += v.text({ x: lx, y: gy }, n0(gy), 'gl', { dx: 5, dy: 4, anchor: 'start' });
    return s + '</g>';
  }
  const ZOOM_GRID = { lab: 50, major: 50, rep: 250 };

  /* data: { r (solveBike result + ref, fp), o (chosen option), names: {bike, ref}, show: {ref, dims, grid} } */
  function render(data) {
    const { r, o, show, names } = data;
    const fp = r.fp; const bike = r.bike; const ref = fp.bike; // no ref bike for a personal fit
    const showRef = !!ref && show.ref;
    const sad = fp.saddle; const hand = r.hand || fp.hand;
    const g = r.drawing; const rg = ref ? GB.frameDrawing(ref) : null;
    const bikeCock = o ? Object.assign(GB.barFor(bike, o.angle, o.length, o.spacers), { spacers: o.spacers, barReach: bike.barReach })
      : { Q: add(g.T, GB.steerer(bike.hta).d, 20), B: r.target, spacers: 0, barReach: bike.barReach };
    const pb = bikeParts(bike, g, sad, bikeCock, r);
    const pr = ref ? bikeParts(ref, rg, sad, { Q: fp.stem.Q, B: fp.stem.B, spacers: fp.spacers, barReach: r.ref.fit.barReach }, { postOffset: fp.rail.postOffset, tipToRails: r.tipToRails }) : null;

    /* ---------- main view ---------- */
    const frames = rg ? [g, rg] : [g];
    const minX = Math.min(...frames.map((q) => q.rear.x - q.wheelR)) - 40;
    const maxX = Math.max(...frames.map((q) => q.front.x + q.wheelR)) + 40;
    const minY = g.groundY - 40;
    const maxY = Math.max(sad.y, hand.y) + 110;
    const vb = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const v = View(vb, 860);
    let m = v.open('main', `role="img" aria-label="${esc(names.bike)} drawn over ${esc(names.ref)} on a millimetre grid centred on the bottom bracket"`);
    if (show.grid) m += grid(v, 50);
    m += v.line({ x: minX + 10, y: g.groundY }, { x: maxX - 10, y: g.groundY }, 'ground');
    m += `<g class="axes">${v.line({ x: 0, y: 0 }, pb.axisAt(sad.y + 60), 'saxis')}${v.line(add(g.htBottom, pb.d, -(bike.forkA2C + 30)), add(pb.stemTop, pb.d, 50), 'saxis')}</g>`;
    if (showRef) m += drawBike(v, 'rf', rg, pr, sad);
    m += drawBike(v, 'bk', g, pb, sad);
    // a personal fit's saddle height: the straight line from the BB to the saddle tip
    if (!ref) m += v.dim({ x: 0, y: 0 }, sad, 0, `BB to saddle tip ${n0(Math.hypot(sad.x, sad.y))}`, { key: 'height', cls: 'dim rfd', ext: false, labelOff: 8 });
    m += v.target(sad) + v.target(hand);
    if (show.dims) {
      const hl = fp.half > 0 ? ` (${n0(r.reachH)} side view)` : '';
      m += `<g class="dim reachline" data-dim="reach">${v.line(sad, hand, 'rr')}${v.text({ x: (sad.x + hand.x) / 2, y: (sad.y + hand.y) / 2 }, `Personal reach ${n0(fp.riderReach)}${hl}`, 'dt', { dy: -7, rot: Math.atan2(hand.y - sad.y, hand.x - sad.x) * 180 / Math.PI })}</g>`;
      // saddle height along this bike's seat tube, offset behind it
      m += v.dim({ x: 0, y: 0 }, pb.axisAt(sad.y), 30, `Saddle height ${n0(r.heightAlong)}`, { key: 'height' });
      // setback: plumb line from the saddle tip, measured at BB height
      m += `<g class="dim" data-dim="setback">${v.line(sad, { x: sad.x, y: -44 * v.k }, 'plumb')}</g>`;
      m += v.dim({ x: sad.x, y: 0 }, { x: 0, y: 0 }, -40, `Setback ${n0(-sad.x)}`, { key: 'setback', ext: false });
      // hand position on the grid, next to its X
      m += v.text(hand, `Hand ${n0(hand.x)}, ${n0(hand.y)}`, 'dt', { dx: 12, dy: 18, anchor: 'start', key: 'hand' });
      m += v.text(sad, `Saddle tip ${n0(sad.x)}, ${n0(sad.y)}`, 'dt', { dx: -14, dy: -14, anchor: 'end' });
      // drop from saddle top to the top of the bar
      m += v.dim({ x: hand.x + 70, y: sad.y }, { x: hand.x + 70, y: hand.y }, 0, `Drop ${n0(sad.y - hand.y)}`, { key: 'drop', anchor: 'middle', labelOff: 14 });
      m += `<g class="dim" data-dim="drop">${v.line({ x: sad.x + 10, y: sad.y }, { x: hand.x + 80, y: sad.y }, 'ext lvl')}</g>`;
    }
    m += v.text({ x: 0, y: 0 }, 'BB 0, 0', 'bbl', { dx: 12, dy: 17, anchor: 'start' });
    m += '</svg>';

    /* ---------- both frames on level ground ---------- */
    // Only with a reference bike and a chainstay on both frames: the rear wheel has to be in place.
    // Each bike on its own wheel size (rim plus its tyre), the backs of the rear wheels at x = 0,
    // ground at y = 0, where the tyres touch it. Drawn small, with the
    // measurements around the bikes: centres, trail and wheelbase under the ground, reach above,
    // heights to the sides.
    // zoomAt: a point on the ground grid (mm) to zoom in on, from a click on the drawing
    let gr = null; let groundFocus = null;
    if (pr && g.csKnown && rg.csKnown) {
      const zoom = !!data.zoomAt;
      // each frame moved from its BB grid onto the ground grid
      const place = (q, p) => {
        const dx = q.wheelR - q.rear.x; const h = -q.groundY; // rear axle one wheel radius from x = 0; BB height
        const at = (pt) => ({ x: pt.x + dx, y: pt.y + h });
        // S: top of the spacers this bike is set up with, where its reach and stack are measured
        return { dx, h, rear: at(q.rear), bb: at({ x: 0, y: 0 }), front: at(q.front), T: at(q.T), S: at(p.spTop), sp: p.spacers, axis: at(q.axisGround), trail: q.trail, wR: q.wheelR };
      };
      const both = [place(g, pb), place(rg, pr)]; // target, then reference
      const DW = 1200;     // design width in px: the full width of the drawings area
      const ROW = 22;      // px between rows of dimensions
      const top = Math.max(sad.y + both[0].h, hand.y + both[0].h, sad.y + both[1].h, fp.hand.y + both[1].h);
      const right = Math.max(...both.map((P) => Math.max(P.front.x, P.axis.x) + P.wR));
      // margins in px around the bikes: left for nothing but air, right for two height columns,
      // under the ground for four rows, above for two reach rows
      const M = { l: 40, r: 140, b: 4 * ROW + 40, t: 2 * ROW + 30 };
      const x0 = 0; const span = right - x0;
      const k = zoom ? 1 / ZOOM_PX : span / (DW - M.l - M.r);
      const gw = zoom ? span * ZOOM_PX + M.l + M.r : DW; // drawing width in px
      const gvb = { x: x0 - M.l * k, y: -M.b * k, w: gw * k, h: top + (M.t + M.b) * k };
      const gv = View(gvb, gw, zoom);
      if (zoom) groundFocus = gv.px(data.zoomAt === true ? both[0].bb : data.zoomAt);
      const lift = (P, body) => `<g transform="translate(${f1(P.dx)} ${f1(-P.h)})">${body}</g>`;
      gr = gv.open('ground', `role="img" aria-label="${esc(names.bike)} and ${esc(names.ref)} standing on level ground, the backs of their rear wheels at the same point"`);
      if (show.grid) gr += zoom ? grid(gv, 10, ZOOM_GRID) : grid(gv, 50);
      gr += gv.line({ x: gvb.x + 6 * k, y: 0 }, { x: gvb.x + gvb.w - 6 * k, y: 0 }, 'ground');
      // steering axes down to the ground
      gr += `<g class="axes">${both.map((P, i) => gv.line(P.T, P.axis, i ? 'saxis rfa' : 'saxis')).join('')}</g>`;
      gr += lift(both[1], drawBike(gv, 'rf', rg, pr, sad));
      gr += lift(both[0], drawBike(gv, 'bk', g, pb, sad));
      if (show.dims) {
        const rowY = (n) => -(18 + n * ROW) * k;     // rows under the ground, n = 0 first
        const rowTop = (n) => top + (14 + n * ROW) * k; // rows above everything
        both.forEach((P, i) => {
          const cls = i ? 'dim rfd' : 'dim bkd'; // reference yellow, target blue
          const r1 = rowY(i); const r2 = rowY(2 + i); const rt = rowTop(i);
          const ext = (pt, y) => gv.line(pt, { x: pt.x, y: y + (y < pt.y ? -4 : 4) * k }, 'ext');
          // extension lines: axles and BB down to the rows under the ground, BB and head tube top up to the reach row
          gr += `<g class="${cls}">${ext(P.rear, r2)}${ext(P.bb, r1)}${ext({ x: P.front.x, y: P.front.y }, r2)}${ext(P.axis, r1)}${ext(P.bb, rt)}${ext(P.S, rt)}</g>`;
          const flat = (xa, xb, y, label) => gv.dim({ x: xa, y }, { x: xb, y }, 0, label, { cls, ext: false });
          gr += flat(P.rear.x, P.bb.x, r1, `Rear centre ${n0(P.bb.x - P.rear.x)}`);
          gr += flat(P.bb.x, P.front.x, r1, `Front centre ${n0(P.front.x - P.bb.x)}`);
          gr += flat(P.front.x, P.axis.x, r1, `Trail ${n0(P.trail)}`);
          gr += flat(P.rear.x, P.front.x, r2, `Wheelbase ${n0(P.front.x - P.rear.x)}`);
          const withSp = P.sp >= 0.5 ? ` with ${n0(P.sp)} mm spacers` : '';
          gr += flat(P.bb.x, P.S.x, rt, `Reach ${n0(P.S.x - P.bb.x)}${withSp}`);
          // BB height beside the BB, the target's behind it and the reference's ahead
          gr += gv.dim({ x: P.bb.x, y: 0 }, P.bb, i ? -30 : 30, `BB height ${n0(P.h)}`, { cls, ext: false });
          // head tube top: height above the ground, and stack above the BB, out past the front wheels
          const xh = right + (24 + i * 34) * k;
          const xs = right + (92 + i * 34) * k;
          gr += `<g class="${cls}">${gv.line(P.T, { x: xh + 4 * k, y: P.T.y }, 'ext lvl')}${gv.line(P.S, { x: xs + 4 * k, y: P.S.y }, 'ext lvl')}${gv.line(P.bb, { x: xs + 4 * k, y: P.bb.y }, 'ext lvl')}</g>`;
          gr += gv.dim({ x: xh, y: 0 }, { x: xh, y: P.T.y }, 0, `HT top ${n0(P.T.y)}`, { cls, ext: false, labelOff: 11 });
          gr += gv.dim({ x: xs, y: P.bb.y }, { x: xs, y: P.S.y }, 0, `Stack ${n0(P.S.y - P.bb.y)}${withSp}`, { cls, ext: false, labelOff: 11 });
        });
      }
      gr += '</svg>';
    }

    /* ---------- front end close-up ---------- */
    const fpts = [pb.T, pb.stemTop, pb.B, hand, { x: pb.B.x + pb.barReach, y: pb.B.y }];
    if (pr) fpts.push(pr.T, pr.stemTop, pr.B, { x: pr.B.x + pr.barReach, y: pr.B.y });
    const fx0 = Math.min(...fpts.map((q) => q.x)) - 70; const fx1 = Math.max(...fpts.map((q) => q.x)) + 45;
    const fy0 = Math.min(...fpts.map((q) => q.y)) - 70; const fy1 = Math.max(...fpts.map((q) => q.y)) + 50;
    const fw = Math.max(fx1 - fx0, (fy1 - fy0) * 1.25);
    const fvb = { x: (fx0 + fx1) / 2 - fw / 2, y: fy0, w: fw, h: Math.max(fy1 - fy0, fw * 0.62) };
    const fv = View(fvb, 400);
    let f = fv.open('inset', `role="img" aria-label="Close-up of the front end: spacers, stem and bar on both bikes"`);
    if (show.grid) f += grid(fv, 10);
    f += `<g class="axes">${fv.line(add(pb.T, pb.d, -80), add(pb.stemTop, pb.d, 40), 'saxis')}</g>`;
    const frontOnly = (vv, cls, frame, p) => {
      let s = `<g class="bike ${cls}">`;
      s += vv.line(add(frame.T, p.d, -120), frame.T, 'tube ht');
      const tt0 = add(frame.T, p.d, -18);
      s += vv.line(tt0, add(tt0, unit(sub(frame.ttRear, tt0)), 140), 'tube');
      const sq = (a, b, half) => [add(a, p.n, half), add(b, p.n, half), add(b, p.n, -half), add(a, p.n, -half)];
      if (p.spacers > 0.5) s += vv.poly(sq(frame.T, p.spTop, 17), 'spacer');
      s += vv.poly(sq(p.spTop, p.stemTop, 18), 'part');
      s += vv.line(p.Q, p.B, 'stem');
      const B = p.B; const br = Math.max(30, p.barReach);
      const rb = (dx, dy) => vv.P({ x: B.x + dx, y: B.y + dy });
      const barD = `M ${vv.P(B)} L ${rb(br - 30, 0)} C ${rb(br + 6, 1)} ${rb(br + 14, -38)} ${rb(br + 2, -78)}`;
      if (p.barReach >= 1) s += vv.path(barD, 'barbody') + vv.path(barD, 'bar');
      s += vv.circle(B, 15.9, 'barc') + vv.circle(frame.T, 2.4 * vv.k, 'joint');
      return s + '</g>';
    };
    if (showRef) f += frontOnly(fv, 'rf', rg, pr);
    f += frontOnly(fv, 'bk', g, pb);
    f += fv.target(hand, 12);
    if (show.dims) {
      if (showRef && pr.spacers > 0.5) f += fv.dim(pr.T, pr.spTop, 26, `${n0(pr.spacers)}`, { key: 'spacers', cls: 'dim rfd' });
      if (pb.spacers > 0.5) f += fv.dim(pb.T, pb.spTop, showRef ? 46 : 26, `${n0(pb.spacers)}`, { key: 'spacers' });
      const stemLbl = (p, opt, cls, dyPx) => fv.text({ x: (p.Q.x + p.B.x) / 2, y: (p.Q.y + p.B.y) / 2 }, opt, `dt ${cls}`, { dy: dyPx, key: 'stem' });
      if (o) f += stemLbl(pb, `${o.length} mm ${o.angle > 0 ? '+' : o.angle < 0 ? MINUS : ''}${Math.abs(o.angle)}°`, 'bkt', -12);
      if (showRef) {
        const rs = { length: Math.round(fp.stem.length), angle: Math.round(fp.stem.angle * 2) / 2 };
        f += stemLbl(pr, `${rs.length} mm ${rs.angle > 0 ? '+' : rs.angle < 0 ? MINUS : ''}${Math.abs(rs.angle)}°`, 'rft', 20);
      }
      f += fv.text(hand, 'Hand', 'dt', { dy: -16 });
      f += fv.text(pb.T, 'HT top', 'dt', { dx: 10, dy: 14, anchor: 'start' });
    }
    f += '</svg>';

    /* ---------- saddle close-up ---------- */
    const sx0 = sad.x - 300; const sx1 = sad.x + 70;
    const sy0 = pb.railY - 110; const sy1 = sad.y + 55;
    const sw = Math.max(sx1 - sx0, (sy1 - sy0) * 1.25);
    const svb = { x: (sx0 + sx1) / 2 - sw / 2, y: sy0, w: sw, h: Math.max(sy1 - sy0, sw * 0.62) };
    const sv = View(svb, 400);
    let s = sv.open('inset', `role="img" aria-label="Close-up of the saddle: seat tube lines and clamp positions on both bikes"`);
    if (show.grid) s += grid(sv, 10);
    const saddleOnly = (vv, cls, p) => {
      let t = `<g class="bike ${cls}">`;
      t += vv.line(p.axisAt(p.railY - 140), p.postTop, 'post');
      t += vv.line(p.postTop, p.clamp, 'post');
      t += vv.poly([{ x: p.clamp.x - 14, y: p.railY + 4 }, { x: p.clamp.x + 14, y: p.railY + 4 }, { x: p.clamp.x + 14, y: p.railY - 6 }, { x: p.clamp.x - 14, y: p.railY - 6 }], 'clamp');
      return t + '</g>';
    };
    s += `<g class="axes">${sv.line(pb.axisAt(pb.railY - 140), pb.axisAt(sad.y + 40), 'saxis')}${showRef ? sv.line(pr.axisAt(pr.railY - 140), pr.axisAt(sad.y + 40), 'saxis rfa') : ''}</g>`;
    {
      const L = 265; const sh = (dx, dy) => sv.P({ x: sad.x + dx, y: sad.y + dy });
      s += `<g class="bike sdl">${sv.path(`M ${sh(2, -7)} Q ${sh(-6, 1)} ${sh(-50, 0)} L ${sh(-L + 45, 5)} Q ${sh(-L + 2, 8)} ${sh(-L, -10)} L ${sh(-L + 28, -26)} L ${sh(-60, -17)} Z`, 'saddle')}${sv.path(`M ${sh(-48, -15)} L ${sv.P({ x: pb.railMid - 50, y: pb.railY })} L ${sv.P({ x: pb.railMid + 50, y: pb.railY })} Z`, 'rail')}</g>`;
    }
    if (showRef) s += saddleOnly(sv, 'rf', pr);
    s += saddleOnly(sv, 'bk', pb);
    s += sv.target(sad, 12);
    if (show.dims) {
      if (showRef && r.railMove != null && Math.abs(r.railMove) >= 0.5) {
        const a = { x: pr.clamp.x, y: pb.railY }; const b = { x: pb.clamp.x, y: pb.railY };
        s += sv.dim(a.x < b.x ? a : b, a.x < b.x ? b : a, -28, `${n0(Math.abs(r.railMove))} mm ${r.railMove > 0 ? 'forward' : 'back'} on rails`, { key: 'setback' });
      }
      s += sv.dim(pb.axisAt(sad.y), sad, 18, `${n0(Math.abs(r.noseAhead))} to seat-tube line`, { key: 'setback' });
      s += sv.text(sad, 'Saddle tip', 'dt', { dy: -16 });
    }
    s += '</svg>';
    // groundFocus: where the zoomed-in point is on the zoomed ground view, in px
    return { main: m, front: f, saddle: s, ground: gr, groundFocus };
  }

  return { render };
})();
