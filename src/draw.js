/* BikefitSim drawings: technical side view of a bike over its reference, on the BB grid.
   All geometry in mm (BB at 0,0, X forward, Y up); SVG y is flipped. Strokes don't scale
   with zoom (vector-effect), text is sized from the screen width the view is designed for. */
const GBDraw = (() => {
  const RAIL_DROP = 45;   // saddle top to rails
  const POST_HEAD = 18;   // rails to top of the post shaft
  const SADDLE_L = 265;   // saddle drawn tip to tail
  const TYRE_R = 340;
  const RIM_R = 311;

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
  function View(vb, designW) {
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
      return `<g class="target">${circle(p, s * 0.55, 'tg')}${line({ x: p.x - s, y: p.y }, { x: p.x + s, y: p.y }, 'tg')}${line({ x: p.x, y: p.y - s }, { x: p.x, y: p.y + s }, 'tg')}${circle(p, 1.8 * k, 'tgdot')}</g>`;
    };
    const open = (cls, extra = '') => `<svg class="geo ${cls}" viewBox="${f1(vb.x)} ${f1(-(vb.y + vb.h))} ${f1(vb.w)} ${f1(vb.h)}" style="--k:${k.toFixed(4)}" ${extra}>`;
    return { k, vb, P, line, circle, path, poly, text, dim, target, open };
  }

  /* Points for one bike set up with a given stem, spacers and bar reach. */
  function bikeParts(bike, frame, sad, cockpit) {
    const S = bike.sta * Math.PI / 180;
    const H = bike.hta * Math.PI / 180;
    const d = { x: -Math.cos(H), y: Math.sin(H) };
    const n = { x: Math.sin(H), y: Math.cos(H) };
    const T = frame.T;
    const railY = sad.y - RAIL_DROP;
    const axisAt = (y) => ({ x: -y / Math.tan(S), y });
    const spTop = add(T, d, cockpit.spacers);
    const stemTop = add(T, d, cockpit.spacers + 40);
    return { S, H, d, n, T, railY, axisAt, spTop, stemTop, clamp: axisAt(railY), postTop: axisAt(railY - POST_HEAD), Q: cockpit.Q, B: cockpit.B, barReach: cockpit.barReach, spacers: cockpit.spacers };
  }

  function drawBike(v, cls, frame, p, sad, { wheels = true, saddle = true } = {}) {
    const g = frame;
    let s = `<g class="bike ${cls}">`;
    if (wheels) {
      for (const w of [g.rear, g.front]) s += v.circle(w, TYRE_R, 'tyre') + v.circle(w, RIM_R, 'rim') + v.circle(w, 3.2 * v.k, 'hub');
    }
    const ttEnd = add(g.T, p.d, -18);
    const dtEnd = add(g.htBottom, p.d, 25);
    s += v.line(g.rear, { x: 0, y: 0 }, 'tube cs');
    s += v.line(g.rear, g.ssJoin, 'tube ss');
    s += v.line(g.htBottom, g.front, 'tube fork');
    s += v.line({ x: 0, y: 0 }, dtEnd, 'tube');
    s += v.line({ x: 0, y: 0 }, g.stTop, 'tube');
    s += v.line(g.stTop, ttEnd, 'tube');
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
      const sx = sad.x; const sy = sad.y; const L = SADDLE_L;
      const sh = (dx, dy) => v.P({ x: sx + dx, y: sy + dy });
      s += v.path(`M ${sh(2, -7)} Q ${sh(-6, 1)} ${sh(-50, 0)} L ${sh(-L + 45, 5)} Q ${sh(-L + 2, 8)} ${sh(-L, -10)} L ${sh(-L + 28, -26)} L ${sh(-60, -17)} Z`, 'saddle');
      s += v.path(`M ${sh(-48, -15)} L ${v.P({ x: sx - 185, y: p.railY })} L ${v.P({ x: sx - 85, y: p.railY })} Z`, 'rail');
      s += v.poly([{ x: p.clamp.x - 14, y: p.railY + 4 }, { x: p.clamp.x + 14, y: p.railY + 4 }, { x: p.clamp.x + 14, y: p.railY - 6 }, { x: p.clamp.x - 14, y: p.railY - 6 }], 'clamp');
    }
    // joints
    for (const j of [{ x: 0, y: 0 }, g.stTop, g.T, g.htBottom]) s += v.circle(j, 2.6 * v.k, 'joint');
    return s + '</g>';
  }

  function grid(v, step = 50) {
    const { x, y, w, h } = v.vb;
    let s = '<g class="grid">';
    const x0 = Math.ceil(x / step) * step; const y0 = Math.ceil(y / step) * step;
    for (let gx = x0; gx <= x + w; gx += step) s += v.line({ x: gx, y }, { x: gx, y: y + h }, gx === 0 ? 'axis0' : (gx % (step * 2) === 0 ? 'major' : 'minor'));
    for (let gy = y0; gy <= y + h; gy += step) s += v.line({ x, y: gy }, { x: x + w, y: gy }, gy === 0 ? 'axis0' : (gy % (step * 2) === 0 ? 'major' : 'minor'));
    const lab = step * 4;
    for (let gx = Math.ceil(x / lab) * lab; gx <= x + w; gx += lab) s += v.text({ x: gx, y }, n0(gx), 'gl', { dy: -5 });
    for (let gy = Math.ceil(y / lab) * lab; gy <= y + h; gy += lab) if (gy > y + 20 * v.k) s += v.text({ x, y: gy }, n0(gy), 'gl', { dx: 5, dy: 4, anchor: 'start' });
    return s + '</g>';
  }

  /* data: { r (solveBike result + ref, fp), o (chosen option), names: {bike, ref}, show: {ref, dims, grid} } */
  function render(data) {
    const { r, o, show, names } = data;
    const fp = r.fp; const bike = r.bike; const ref = fp.bike; // no ref bike for a personal fit
    const showRef = !!ref && show.ref;
    const sad = fp.saddle; const hand = r.hand || fp.hand;
    // the saddle is drawn from its tip; a personal fit's point is the saddle centre, so the tip sits
    // half a typical saddle ahead of it (drawing only, no number depends on it)
    const centred = fp.saddleAt === 'centre';
    const nose = centred ? { x: sad.x + SADDLE_L / 2, y: sad.y } : sad;
    const sadName = centred ? 'Saddle centre' : 'Saddle tip';
    const g = r.drawing; const rg = ref ? GB.frameDrawing(ref) : null;
    const bikeCock = o ? Object.assign(GB.barFor(bike, o.angle, o.length, o.spacers), { spacers: o.spacers, barReach: bike.barReach })
      : { Q: add(g.T, GB.steerer(bike.hta).d, 20), B: r.target, spacers: 0, barReach: bike.barReach };
    const pb = bikeParts(bike, g, sad, bikeCock);
    const pr = ref ? bikeParts(ref, rg, sad, { Q: fp.stem.Q, B: fp.stem.B, spacers: fp.spacers, barReach: r.ref.fit.barReach }) : null;

    /* ---------- main view ---------- */
    const frames = rg ? [g, rg] : [g];
    const minX = Math.min(...frames.map((q) => q.rear.x)) - TYRE_R - 40;
    const maxX = Math.max(...frames.map((q) => q.front.x)) + TYRE_R + 40;
    const minY = g.groundY - 40;
    const maxY = Math.max(sad.y, hand.y) + 110;
    const vb = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const v = View(vb, 860);
    let m = v.open('main', `role="img" aria-label="${esc(names.bike)} drawn over ${esc(names.ref)} on a millimetre grid centred on the bottom bracket"`);
    if (show.grid) m += grid(v, 50);
    m += v.line({ x: minX + 10, y: g.groundY }, { x: maxX - 10, y: g.groundY }, 'ground');
    m += `<g class="axes">${v.line({ x: 0, y: 0 }, pb.axisAt(sad.y + 60), 'saxis')}${v.line(add(g.htBottom, pb.d, -(bike.forkA2C + 30)), add(pb.stemTop, pb.d, 50), 'saxis')}</g>`;
    if (showRef) m += drawBike(v, 'rf', rg, pr, nose);
    m += drawBike(v, 'bk', g, pb, nose);
    // a personal fit's saddle height: the straight line from the BB to the saddle centre
    if (!ref) m += v.dim({ x: 0, y: 0 }, sad, 0, `BB to saddle centre ${n0(Math.hypot(sad.x, sad.y))}`, { key: 'height', cls: 'dim rfd', ext: false, labelOff: 8 });
    m += v.target(sad) + v.target(hand);
    if (show.dims) {
      const hl = fp.half > 0 ? ` (${n0(r.reachH)} side view)` : '';
      m += `<g class="dim reachline" data-dim="reach">${v.line(sad, hand, 'rr')}${v.text({ x: (sad.x + hand.x) / 2, y: (sad.y + hand.y) / 2 }, `Personal reach ${n0(fp.riderReach)}${hl}`, 'dt', { dy: -7, rot: Math.atan2(hand.y - sad.y, hand.x - sad.x) * 180 / Math.PI })}</g>`;
      // saddle height along this bike's seat tube, offset behind it
      m += v.dim({ x: 0, y: 0 }, pb.axisAt(sad.y), 30, `Saddle height ${n0(r.heightAlong)}`, { key: 'height' });
      // setback: plumb line from the saddle point, measured at BB height
      m += `<g class="dim" data-dim="setback">${v.line(sad, { x: sad.x, y: -44 * v.k }, 'plumb')}</g>`;
      m += v.dim({ x: sad.x, y: 0 }, { x: 0, y: 0 }, -40, `Setback ${n0(-sad.x)}`, { key: 'setback', ext: false });
      // hand position on the grid
      m += `<g class="dim" data-dim="hand">${v.line(hand, { x: hand.x, y: -44 * v.k }, 'plumb')}</g>`;
      m += v.dim({ x: 0, y: 0 }, { x: hand.x, y: 0 }, -40, `Hand X ${n0(hand.x)}`, { key: 'hand', ext: false });
      m += v.dim({ x: hand.x, y: 0 }, hand, -40, `Hand Y ${n0(hand.y)}`, { key: 'hand' });
      // drop from saddle top to the top of the bar
      m += v.dim({ x: hand.x + 70, y: sad.y }, { x: hand.x + 70, y: hand.y }, 0, `Drop ${n0(sad.y - hand.y)}`, { key: 'drop', anchor: 'middle', labelOff: 14 });
      m += `<g class="dim" data-dim="drop">${v.line({ x: sad.x + 10, y: sad.y }, { x: hand.x + 80, y: sad.y }, 'ext lvl')}</g>`;
    }
    m += v.text({ x: 0, y: 0 }, 'BB 0, 0', 'bbl', { dx: 12, dy: 17, anchor: 'start' });
    m += '</svg>';

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
      s += vv.line(tt0, add(tt0, unit(sub(frame.stTop, tt0)), 140), 'tube');
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
      f += fv.text(hand, 'Hand', 'dt tl', { dy: -16 });
      f += fv.text(pb.T, 'HT top', 'dt', { dx: 10, dy: 14, anchor: 'start' });
    }
    f += '</svg>';

    /* ---------- saddle close-up ---------- */
    const sx0 = nose.x - 300; const sx1 = nose.x + 70;
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
      const L = SADDLE_L; const sh = (dx, dy) => sv.P({ x: nose.x + dx, y: nose.y + dy });
      s += `<g class="bike sdl">${sv.path(`M ${sh(2, -7)} Q ${sh(-6, 1)} ${sh(-50, 0)} L ${sh(-L + 45, 5)} Q ${sh(-L + 2, 8)} ${sh(-L, -10)} L ${sh(-L + 28, -26)} L ${sh(-60, -17)} Z`, 'saddle')}${sv.path(`M ${sh(-48, -15)} L ${sv.P({ x: nose.x - 185, y: pb.railY })} L ${sv.P({ x: nose.x - 85, y: pb.railY })} Z`, 'rail')}</g>`;
    }
    if (showRef) s += saddleOnly(sv, 'rf', pr);
    s += saddleOnly(sv, 'bk', pb);
    s += sv.target(sad, 12);
    if (show.dims) {
      if (showRef && r.railMove != null && Math.abs(r.railMove) >= 0.5) {
        const a = { x: pr.clamp.x, y: pb.railY }; const b = { x: pb.clamp.x, y: pb.railY };
        s += sv.dim(a.x < b.x ? a : b, a.x < b.x ? b : a, -28, `${n0(Math.abs(r.railMove))} mm ${r.railMove > 0 ? 'forward' : 'back'} on rails`, { key: 'setback' });
      }
      s += sv.dim(pb.axisAt(sad.y), sad, 18, `${n0(Math.abs(r.noseAhead))} ${centred && r.noseAhead < 0 ? 'behind' : 'to'} seat-tube line`, { key: 'setback' });
      s += sv.text(sad, sadName, 'dt tl', { dy: centred ? 26 : -16 });
    }
    s += '</svg>';
    return { main: m, front: f, saddle: s };
  }

  return { render };
})();
