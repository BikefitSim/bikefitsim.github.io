/* Bikefit Simulator drawings: technical side view of a bike over its reference, on the BB grid.
   All geometry in mm (BB at 0,0, X forward, Y up); SVG y is flipped. Strokes don't scale
   with zoom (vector-effect), text is sized from the screen width the view is designed for. */
const GBDraw = (() => {
  const RAIL_DROP = 40;   // rail height (saddle top to rails), when the saddle gives none
  const POST_HEAD = 18;   // rails to top of the post shaft
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
    const text = (p, str, cls, { dx = 0, dy = 0, anchor = 'middle', rot = 0 } = {}) => {
      const x = p.x + dx * k; const y = -p.y + dy * k;
      const tr = rot ? ` transform="rotate(${f1(-rot)} ${f1(x)} ${f1(y)})"` : '';
      return `<text class="${cls}" x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}"${tr}>${esc(str)}</text>`;
    };
    /* Linear dimension between a and b, drawn offset by `off` px along the left normal of a→b. */
    // tcls: the label's class (its bike's colour); at: where along the line the label sits (0 at a, 1 at b)
    const dim = (a, b, off, label, { cls = 'dim', ext = true, anchor = 'middle', labelOff = -5, tcls = 'dt', at = 0.5 } = {}) => {
      const u = unit(sub(b, a));
      const nrm = perp(u);
      const o = off * k;
      const a2 = add(a, nrm, o); const b2 = add(b, nrm, o);
      const tick = 4 * k;
      const td = { x: (u.x + nrm.x) * tick * 0.7, y: (u.y + nrm.y) * tick * 0.7 };
      let s = `<g class="${cls}">`;
      if (ext && Math.abs(off) > 2) {
        s += line(add(a, nrm, Math.sign(off) * 3 * k), add(a2, nrm, Math.sign(off) * 4 * k), 'ext');
        s += line(add(b, nrm, Math.sign(off) * 3 * k), add(b2, nrm, Math.sign(off) * 4 * k), 'ext');
      }
      s += line(a2, b2, 'dl');
      s += line({ x: a2.x - td.x, y: a2.y - td.y }, { x: a2.x + td.x, y: a2.y + td.y }, 'tk');
      s += line({ x: b2.x - td.x, y: b2.y - td.y }, { x: b2.x + td.x, y: b2.y + td.y }, 'tk');
      let ang = Math.atan2(u.y, u.x) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const mid = { x: a2.x + (b2.x - a2.x) * at, y: a2.y + (b2.y - a2.y) * at };
      const lift = add(mid, perp(unit({ x: Math.cos(ang * Math.PI / 180), y: Math.sin(ang * Math.PI / 180) })), -labelOff * k);
      if (label) s += text(lift, label, tcls, { rot: ang, anchor });
      return s + '</g>';
    };
    /* Fit point markers, after map location dots and CAD snap markers (Z asked for something more
       visible than thin Xs): a solid shape in its bike's colour with a white rim, on a soft halo of
       the same colour, so it stands out over any line. A hand point is a diamond, a saddle tip a disc. */
    const marker = (p, size, cls, shape) => {
      const s = size * k;
      const halo = circle(p, s * 0.95, 'mkh');
      const d = s * 0.62; // half the diamond's diagonal
      const body = shape === 'disc' ? circle(p, s * 0.46, 'mk')
        : poly([{ x: p.x, y: p.y + d }, { x: p.x + d, y: p.y }, { x: p.x, y: p.y - d }, { x: p.x - d, y: p.y }], 'mk');
      return `<g class="target${cls ? ` ${cls}` : ''}">${halo}${body}</g>`;
    };
    const target = (p, size = 14, cls = '') => marker(p, size, cls, 'diamond'); // a hand point
    // zoomed views are drawn at a fixed size and scroll in their frame
    const size = fixed ? `width:${Math.round(designW)}px;max-width:none;` : '';
    const open = (cls, extra = '') => `<svg class="geo ${cls}" viewBox="${f1(vb.x)} ${f1(-(vb.y + vb.h))} ${f1(vb.w)} ${f1(vb.h)}" style="${size}--k:${k.toFixed(4)}" ${extra}>`;
    // a point's position in screen px from the top left of the drawing
    const px = (p) => ({ x: (p.x - vb.x) / k, y: (vb.y + vb.h - p.y) / k });
    const ring = (p, size = 14, cls = '') => marker(p, size, cls, 'disc'); // a saddle tip
    return { k, vb, P, line, circle, path, poly, text, dim, target, ring, open, px };
  }

  // a handlebar's sizes once its reach and drop are given (they are only drawn, never calculated
  // with); the diameter 31.8 when empty
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const barOf = (o) => (o && (isNum(o.hbReach) || isNum(o.hbDrop) || o.hbRise > 0)
    ? { reach: Math.max(0, o.hbReach || 0), drop: Math.max(0, o.hbDrop || 0), diam: o.hbDiam > 0 ? o.hbDiam : 31.8, rise: Math.max(0, o.hbRise || 0) } : null);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  // a rounded corner: points from r before the corner (towards a) to r after it (towards b)
  const roundAt = (a, c, b, r) => {
    const p0 = add(c, unit(sub(a, c)), r); const p2 = add(c, unit(sub(b, c)), r); const out = [];
    for (let i = 0; i <= 4; i++) { const t = i / 4; out.push({ x: (1 - t) * (1 - t) * p0.x + 2 * t * (1 - t) * c.x + t * t * p2.x, y: (1 - t) * (1 - t) * p0.y + 2 * t * (1 - t) * c.y + t * t * p2.y }); }
    return out;
  };
  /* The stem (Z): a steerer clamp as tall as the stem height, a body that tapers from 80% of that
     height at the steerer to 60% where it meets the bar clamp, and a round bar clamp whose outside
     is the stem height (its top is where the hand position is measured from), with the faceplate
     split line and the bar's bore. One outline, so the see-through fill isn't doubled. */
  const STEERER = 28.6; // 1 1/8"
  function stemBody(vv, p, clampHalf) {
    const L = len(sub(p.B, p.Q)) || 1; const u = unit(sub(p.B, p.Q)); const m = { x: -u.y, y: u.x };
    const R = p.stemH / 2; const hf = 0.4 * p.stemH; const hr = 0.3 * p.stemH;
    const un = dot(u, p.n); const mn = dot(m, p.n); const sg = Math.sign(un || 1); const face = clampHalf * sg;
    const edge = (side) => {
      const k = side * (hr - hf) / L; const t0 = side * hf;
      const sF = (face - t0 * mn) / (un + k * mn || 1);
      const F = add(add(p.Q, u, sF), m, t0 + k * sF);
      // where this edge meets the bar clamp: (s - L)^2 + (t0 + k s)^2 = R^2, the root nearer the steerer
      const A = 1 + k * k; const Bq = 2 * t0 * k - 2 * L; const C = L * L + t0 * t0 - R * R;
      const sR = (-Bq - Math.sqrt(Math.max(0, Bq * Bq - 4 * A * C))) / (2 * A);
      return { F, th: Math.atan2(t0 + k * sR, sR - L), along: dot(sub(F, p.spTop), p.d) };
    };
    const e1 = edge(1); const e2 = edge(-1);
    const lo = e1.along < e2.along ? e1 : e2; const hi = lo === e1 ? e2 : e1;
    const fb = add(p.spTop, p.n, face); const ft = add(p.stemTop, p.n, face);
    const bt = add(p.stemTop, p.n, -face); const bb = add(p.spTop, p.n, -face);
    const arc = [];
    const up = lo.th < 0; // round the front of the bar clamp, from the lower edge to the upper one
    let t1 = lo.th; let t2 = hi.th;
    if (up && t2 < t1) t2 += 2 * Math.PI;
    if (!up && t2 > t1) t2 -= 2 * Math.PI;
    for (let i = 0; i <= 28; i++) { const t = t1 + (t2 - t1) * i / 28; arc.push(add(add(p.B, u, R * Math.cos(t)), m, R * Math.sin(t))); }
    const rc = 4;
    const pts = [
      ...roundAt(bt, bb, fb, rc), ...roundAt(bb, fb, lo.F, rc), lo.F, ...arc, hi.F,
      ...roundAt(hi.F, ft, bt, rc), ...roundAt(ft, bt, bb, rc),
    ];
    let s = vv.poly(pts, 'part stemb');
    // the steerer inside the clamp
    for (const side of [-1, 1]) s += vv.line(add(p.spTop, p.n, side * STEERER / 2), add(p.stemTop, p.n, side * STEERER / 2), 'stemln');
    // faceplate split, across the bar clamp outside the bar
    const rb = (p.bar ? p.bar.diam : 31.8) / 2;
    for (const side of [-1, 1]) s += vv.line(add(p.B, m, side * rb), add(p.B, m, side * R), 'stemln');
    return s;
  }
  /* The handlebar, only representative and drawn when its sizes are given (Z): a tube as thick as
     its diameter, coming out of the bar clamp. The drops are level and the bend turns 175° (a drop
     bar bends less than 180°), so the tops fall 5° from the clamp to where the bend starts; the
     front of the bend is at the reach, halfway down the drop; the drops run 40 mm back and end
     round. No hoods. A bar with rise climbs straight up out of the clamp (that part runs out to
     the sides, so from the side it looks vertical) and turns into the tops with a round bend; the
     tops, bend and drops sit that much higher. A flat bar with no reach is seen end on: its rise,
     then the grip as a circle. */
  const BAR_FALL = 5 * Math.PI / 180;
  function barTube(vv, p) {
    const hb = p.bar;
    if (!hb || !(hb.reach >= 1 || hb.drop >= 1 || hb.rise >= 1)) return '';
    const C = p.B; const B = { x: C.x, y: C.y + hb.rise }; const rb = hb.diam / 2; const R = p.stemH / 2;
    const line = []; const K = 0.5523;
    const cub = (P0, P1, P2, P3) => {
      for (let i = 1; i <= 14; i++) {
        const t = i / 14; const w = 1 - t;
        line.push({ x: w * w * w * P0.x + 3 * w * w * t * P1.x + 3 * w * t * t * P2.x + t * t * t * P3.x, y: w * w * w * P0.y + 3 * w * w * t * P1.y + 3 * w * t * t * P2.y + t * t * t * P3.y });
      }
    };
    // out of the clamp: straight up the rise, bending round into the way to `next` (none: it ends there)
    const outOfClamp = (next) => {
      line.push(C);
      if (hb.rise < 1) return;
      const dir = next ? unit(sub(next, B)) : null;
      const k = dir ? Math.min(hb.rise * 0.6, len(sub(next, B)) * 0.5, 1.5 * rb + 4) : 0;
      if (k < 1) { line.push(B); return; }
      const P0 = { x: C.x, y: B.y - k }; const P3 = add(B, dir, k);
      line.push(P0);
      cub(P0, { x: P0.x, y: P0.y + K * k }, add(P3, dir, -K * k), P3);
    };
    if (hb.drop >= 1) {
      // the bend: two elliptical quarters, forward to the reach at mid drop and back to the drops;
      // it starts far enough behind the reach that the tube's inside doesn't fold (at least 30 mm)
      const a = Math.min(hb.reach, Math.max(30, Math.sqrt(1.6 * rb * hb.drop / 2)));
      const c = Math.cos(BAR_FALL); const sn = Math.sin(BAR_FALL);
      const T = { x: B.x + hb.reach - a, y: B.y - (hb.reach - a) * sn / c }; // where the bend starts
      const D = { x: T.x, y: B.y - hb.drop }; // the drops, level, back from under it
      const M = { x: B.x + hb.reach, y: (T.y + D.y) / 2 }; // the front of the bend
      outOfClamp(T); line.push(T);
      cub(T, { x: T.x + K * a * c, y: T.y - K * a * sn }, { x: M.x, y: M.y + K * (T.y - M.y) }, M);
      cub(M, { x: M.x, y: M.y - K * (M.y - D.y) }, { x: D.x + K * a, y: D.y }, D);
      line.push({ x: D.x - 40, y: D.y });
    } else { // a flat bar: forward to its reach, or with none, ends at the top of its rise
      const F = hb.reach >= 1 ? { x: B.x + hb.reach, y: B.y } : null;
      outOfClamp(F); if (F) line.push(F);
    }
    if (line.length < 2) return '';
    // start where the tube's corners sit on the outside of the bar clamp
    const s0 = Math.sqrt(Math.max(0, R * R - rb * rb));
    const d0 = unit(sub(line[1], line[0]));
    if (len(sub(line[1], line[0])) > s0 + 1) line[0] = add(C, d0, s0);
    const nrm = (i) => { const a = line[Math.max(0, i - 1)]; const b = line[Math.min(line.length - 1, i + 1)]; const t = unit(sub(b, a)); return { x: -t.y, y: t.x }; };
    const left = line.map((q, i) => add(q, nrm(i), rb)); const right = line.map((q, i) => add(q, nrm(i), -rb));
    const end = line[line.length - 1]; const te = unit(sub(end, line[line.length - 2])); const ne = nrm(line.length - 1);
    const cap = [];
    for (let i = 1; i < 12; i++) { const t = Math.PI * i / 12; cap.push(add(add(end, ne, rb * Math.cos(t)), te, rb * Math.sin(t))); }
    const d = `M ${line.map((q) => vv.P(q)).join(' L ')}`;
    return vv.poly([...left, ...cap, ...right.reverse()], 'bartube') + vv.path(d, 'barcl');
  }
  function clampAndBar(vv, p) {
    let s = barTube(vv, p);
    s += vv.circle(p.B, (p.bar ? p.bar.diam : 31.8) / 2, 'barc');
    // a flat bar with no reach, seen end on: the grip at the top of its rise
    if (p.bar && p.bar.reach < 1 && p.bar.drop < 1 && p.bar.rise >= 1) s += vv.circle({ x: p.B.x, y: p.B.y + p.bar.rise }, p.bar.diam / 2, 'barc');
    s += vv.circle({ x: p.B.x, y: p.B.y + p.stemH / 2 }, 2.4 * vv.k, 'joint');
    return s;
  }

  /* Points for one bike set up with a given stem and spacers. */
  function bikeParts(bike, frame, sad, cockpit, seat) {
    const S = bike.sta * Math.PI / 180;
    const H = bike.hta * Math.PI / 180;
    const d = { x: -Math.cos(H), y: Math.sin(H) };
    const n = { x: Math.sin(H), y: Math.cos(H) };
    const T = frame.T;
    const railY = sad.y - (seat.railH || RAIL_DROP);
    const axisAt = (y) => ({ x: -y / Math.tan(S), y });
    const spTop = add(T, d, cockpit.spacers);
    const stemTop = add(T, d, cockpit.spacers + GB.stemH(cockpit));
    // the post's head sets the clamp back from the seat tube line by its offset
    const clamp = { x: axisAt(railY).x - seat.postOffset / Math.sin(S), y: railY };
    const railMid = sad.x - seat.tipToRails; // middle of the saddle's rails, from its tip
    // this bike's saddle: tip to rail centre, length of the rail markings, seatpost clamp length
    const saddle = { tipToRails: seat.tipToRails, railTravel: seat.railTravel || 60, clampLen: seat.clampLen || 35, saddleLen: seat.saddleLen || 265, railH: seat.railH || RAIL_DROP };
    return { S, H, d, n, T, railY, axisAt, spTop, stemTop, clamp, railMid, saddle, postTop: axisAt(railY - POST_HEAD), Q: cockpit.Q, B: cockpit.B, spacers: cockpit.spacers, stemH: GB.stemH(cockpit), bar: cockpit.bar || null };
  }

  // a tyre: the ring between the rim and the wheel's outside
  function tyreRing(c, r1, r2) {
    const ring = (r) => `M${f1(c.x + r)},${f1(-c.y)}a${f1(r)},${f1(r)} 0 1 0 ${f1(-2 * r)},0a${f1(r)},${f1(r)} 0 1 0 ${f1(2 * r)},0Z`;
    return `<path class="tyre" d="${ring(r2)}${ring(r1)}"></path>`;
  }

  /* A saddle drawn from its tip at its length; the rails run under it, and the thicker
     stretch on them is the adjustment markings. */
  function saddleShape(v, sad, p) {
    const sd = p.saddle; const L = Math.max(sd.saddleLen, sd.tipToRails + sd.railTravel / 2 + 60);
    const sh = (dx, dy) => v.P({ x: sad.x + dx, y: sad.y + dy });
    const ry = p.railY; const m = p.railMid; const h = sd.railTravel / 2;
    let t = v.path(`M ${sh(2, -7)} Q ${sh(-6, 1)} ${sh(-50, 0)} L ${sh(-L + 45, 5)} Q ${sh(-L + 2, 8)} ${sh(-L, -10)} L ${sh(-L + 28, -26)} L ${sh(-60, -17)} Z`, 'saddle');
    t += v.path(`M ${sh(-48, -15)} L ${v.P({ x: m + h + 12, y: ry })} L ${v.P({ x: m - h - 12, y: ry })} L ${sh(-L + 30, -24)}`, 'rail');
    t += v.line({ x: m - h, y: ry }, { x: m + h, y: ry }, 'railmk');
    return t;
  }
  const clampBox = (v, p) => { const c = p.saddle.clampLen / 2; return v.poly([{ x: p.clamp.x - c, y: p.railY + 4 }, { x: p.clamp.x + c, y: p.railY + 4 }, { x: p.clamp.x + c, y: p.railY - 6 }, { x: p.clamp.x - c, y: p.railY - 6 }], 'clamp'); };
  const sameSaddle = (a, b) => ['saddleLen', 'tipToRails', 'railTravel', 'railH'].every((k) => Math.abs(a.saddle[k] - b.saddle[k]) < 0.05);

  /* A bike's group, with a wide see-through copy of its lines on top: the pointer finds the
     bike without landing exactly on a line. */
  const bikeG = (cls, inner) => `<g class="bike ${cls}">${inner}<g class="hit">${inner.replace(/ class="[^"]*"/g, '')}</g></g>`;

  function drawBike(v, cls, frame, p, sad, { wheels = true, saddle = true } = {}) {
    const g = frame;
    let s = '';
    if (wheels) {
      for (const w of [g.rear, g.front]) s += tyreRing(w, g.rimR, g.wheelR) + v.circle(w, g.rimR, 'rim');
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
    // cockpit: spacer stack, stem clamp, stem, its bar clamp and the handlebar
    const w = 17;
    const sq = (a, b, half) => [add(a, p.n, half), add(b, p.n, half), add(b, p.n, -half), add(a, p.n, -half)];
    if (p.spacers > 0.5) s += v.poly(sq(g.T, p.spTop, w), 'spacer');
    s += v.poly(sq(p.spTop, p.stemTop, w + 1), 'part');
    s += stemBody(v, p, w + 1);
    s += clampAndBar(v, p);
    // seatpost and saddle
    if (saddle) {
      s += v.line(g.stTop, p.postTop, 'post');
      s += v.line(p.postTop, p.clamp, 'post');
      s += saddleShape(v, sad, p) + clampBox(v, p);
    }
    // joints
    for (const j of [{ x: 0, y: 0 }, g.stTop, g.T, g.htBottom]) s += v.circle(j, 2.6 * v.k, 'joint');
    return bikeG(cls, s);
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
    const sadR = fp.saddle; const sad = r.saddle || fp.saddle; const hand = r.hand || fp.hand; // saddle tips: reference, target
    const shifted = Math.abs(sad.x - sadR.x) >= 0.5;
    const g = r.drawing; const rg = ref ? GB.frameDrawing(ref) : null;
    const bikeCock = Object.assign(o ? Object.assign(GB.barFor(bike, o.angle, o.length, o.spacers), { spacers: o.spacers })
      : { Q: add(g.T, GB.steerer(bike.hta).d, 20), B: r.target, spacers: 0 }, { stemH: bike.stemH, bar: barOf(bike) });
    const pb = bikeParts(bike, g, sad, bikeCock, r);
    // the target's hands: where the picked stem and spacers put them, always marked (Z)
    const tHand = o ? { x: hand.x + o.dx, y: hand.y + o.dy } : hand;
    const handMoved = Math.hypot(tHand.x - fp.hand.x, tHand.y - fp.hand.y) >= 0.5;
    // the target's expected hand position (where its cockpit should put the hands to keep personal reach),
    // marked only when another hand width moves it off the reference's hands and no stem and spacers
    // come within GB.HAND_TOL of it (Z); otherwise it is the reference's hand position
    const exp = o && o.err > GB.HAND_TOL && Math.hypot(hand.x - fp.hand.x, hand.y - fp.hand.y) >= 0.5 ? hand : null;
    /* Labels, the same way on every drawing (Z): the legend window names the colours, so a label
       says what is measured and its colour says whose: reference yellow ('rft'), target blue ('bkt'),
       and next to a marker its colour (yellow reference, blue target). A value both
       bikes share (the same saddle tip, hand position or setback) is white. The close-ups give the
       target as a difference from the reference, the other drawings as a value. No label sits on a bike. */
    const handLbls = () => [['Hand', fp.hand, handMoved ? 'xr' : ''], ...(handMoved ? [['Hand', tHand, 'xg']] : []), ...(exp ? [['Expected hand', exp, 'xe']] : [])];
    const T_REF = 'dt rft'; const T_TGT = 'dt bkt';
    // a difference from the reference, forward and up, to 0.1 mm: the close-ups label the target this way
    const diff1 = (dx, dy) => `${dx >= -0.05 ? '+' : MINUS}${Math.abs(dx).toFixed(1)}, ${dy >= -0.05 ? '+' : MINUS}${Math.abs(dy).toFixed(1)}`;
    const pr = ref ? bikeParts(ref, rg, sadR, { Q: fp.stem.Q, B: fp.stem.B, spacers: fp.spacers, stemH: r.ref.fit.stemH, bar: barOf(r.ref.fit) }, Object.assign({}, fp.rail, { saddleLen: r.ref.fit.saddleLen })) : null;

    /* ---------- main view ---------- */
    const frames = rg ? [g, rg] : [g];
    const minX = Math.min(...frames.map((q) => q.rear.x - q.wheelR)) - 40;
    const maxX = Math.max(...frames.map((q) => q.front.x + q.wheelR)) + 40;
    const minY = g.groundY - 40;
    const maxY = Math.max(sad.y, hand.y) + 110;
    const vb = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const v = View(vb, 1200); // the same design width as the Ground aligned drawing, so the text is the same size
    let m = v.open('main', `role="img" aria-label="${esc(names.bike)} drawn over ${esc(names.ref)} on a millimetre grid centred on the bottom bracket"`);
    if (show.grid) m += grid(v, 50);
    m += v.line({ x: minX + 10, y: g.groundY }, { x: maxX - 10, y: g.groundY }, 'ground');
    m += `<g class="axes">${v.line({ x: 0, y: 0 }, pb.axisAt(sad.y + 60), 'saxis')}${v.line(add(g.htBottom, pb.d, -((GB.forkLength(bike) ?? 370) + 30)), add(pb.stemTop, pb.d, 50), 'saxis')}</g>`;
    if (showRef) m += drawBike(v, 'rf', rg, pr, sadR);
    m += drawBike(v, 'bk', g, pb, sad);
    // a personal fit's saddle height: the straight line from the BB to the saddle tip
    if (!ref) m += v.dim({ x: 0, y: 0 }, sad, 0, `BB to saddle tip ${n0(Math.hypot(sad.x, sad.y))}`, { cls: 'dim rfd', ext: false, labelOff: 8, tcls: T_REF, at: 0.8 });
    // each bike's Xs belong to that bike (Z): see-through like it, and solid and in front while it is hovered,
    // so an X sitting on the other bike's shows through it at the same size
    m += bikeG('rf', v.ring(sadR) + v.target(fp.hand)) + bikeG('bk', (exp ? v.target(exp, 14, 'exp') : '') + v.ring(sad, 14, 'got') + v.target(tHand, 14, 'got'));
    if (show.dims) {
      const mid = { x: (sadR.x + fp.hand.x) / 2, y: (sadR.y + fp.hand.y) / 2 };
      const rot = Math.atan2(fp.hand.y - sadR.y, fp.hand.x - sadR.x) * 180 / Math.PI;
      // the target bike's personal reach with the stem picked, where it puts the hands
      let tgt = '';
      if (o) {
        const th = { x: hand.x + o.dx, y: hand.y + o.dy };
        const tr = Math.hypot(th.x - sad.x, sad.y - th.y, fp.half > 0 ? r.barWidth / 2 : 0);
        if (shifted) {
          // another saddle: the target's reach runs from its own tip
          const mt = { x: (sad.x + hand.x) / 2, y: (sad.y + hand.y) / 2 };
          const rt = Math.atan2(hand.y - sad.y, hand.x - sad.x) * 180 / Math.PI;
          const dl = `saddle ${r.tipShift < 0 ? MINUS : '+'}${n0(Math.abs(r.tipShift))}`; // length difference that moved the tip
          tgt = v.line(sad, hand, 'rr') + v.text(mt, `Personal reach ${n0(tr)} (saddle ${dl.slice(7)})`, T_TGT, { dy: -7, rot: rt });
        } else tgt = v.text(mid, `Personal reach ${n0(tr)}`, T_TGT, { dy: -21, rot });
      }
      // both above the line, clear of the stems and handlebars under it
      m += `<g class="dim reachline">${v.line(sadR, fp.hand, 'rr')}${v.text(mid, `Personal reach ${n0(fp.riderReach)}`, o ? T_REF : 'dt', { dy: shifted && o ? 15 : -7, rot })}${tgt}</g>`;
      // saddle height along each bike's seat tube, behind it and up between the seat cluster and the
      // saddle, where nothing else is drawn: reference yellow, target blue (Z)
      if (showRef) {
        m += v.dim({ x: 0, y: 0 }, pr.axisAt(sadR.y), 44, `Saddle height ${n0(r.ref.fit.saddleHeight)}`, { cls: 'dim rfd', tcls: T_REF, at: 0.78 });
        m += v.dim({ x: 0, y: 0 }, pb.axisAt(sad.y), 76, `Saddle height ${n0(r.heightAlong)}`, { cls: 'dim bkd', tcls: T_TGT, at: 0.78 });
      } else m += v.dim({ x: 0, y: 0 }, pb.axisAt(sad.y), 44, `Saddle height ${n0(r.heightAlong)}`, { cls: 'dim bkd', tcls: T_TGT, at: 0.78 });
      // setback: plumb line from the saddle tip, measured at BB height; labelled right of the BB, past
      // the rear wheel. When another saddle moves the target's tip, each bike's setback from its own tip
      const setbacks = shifted ? [[sadR, -40, 'dim rfd', T_REF], [sad, -66, 'dim bkd', T_TGT]] : [[sad, -40, 'dim', 'dt']];
      for (const [pt, off, cls, tcls] of setbacks) {
        m += `<g class="dim">${v.line(pt, { x: pt.x, y: (off - 4) * v.k }, 'plumb')}</g>`;
        m += v.dim({ x: pt.x, y: 0 }, { x: 0, y: 0 }, off, '', { cls, ext: false });
        m += v.text({ x: 0, y: 0 }, `Setback ${n0(-pt.x)}`, tcls, { dx: 8, dy: -off + 4, anchor: 'start' });
      }
      // hand positions on the grid, in a column past the front of the handlebars
      const barFront = Math.max(fp.hand.x, ...[pb, showRef ? pr : null].filter(Boolean).map((q) => q.B.x + (q.bar ? q.bar.reach + q.bar.diam / 2 : 0)));
      handLbls().forEach(([l, pt, c], i) => { m += v.text({ x: barFront, y: fp.hand.y }, `${l} ${n0(pt.x)}, ${n0(pt.y)}`, `dt ${c}`, { dx: 12, dy: 18 + 14 * i, anchor: 'start' }); });
      // saddle tip on the grid, above and left of its X; when another saddle moves the target's tip, both tips (Z)
      if (shifted) {
        const at = sad.x < sadR.x ? sad : sadR; // left of both Xs
        m += v.text(at, `Saddle tip ${n0(sadR.x)}, ${n0(sadR.y)}`, 'dt xr', { dx: -14, dy: -28, anchor: 'end' });
        m += v.text(at, `Saddle tip ${n0(sad.x)}, ${n0(sad.y)}`, 'dt xg', { dx: -14, dy: -14, anchor: 'end' });
      } else m += v.text(sad, `Saddle tip ${n0(sad.x)}, ${n0(sad.y)}`, 'dt', { dx: -14, dy: -14, anchor: 'end' });
      // drop from saddle top to each hand position (Z): the reference's hands and where the picked stem
      // puts the target's, each its own line in its colour, side by side right of the hands, labels
      // stacked beside the last line. One white line when both bikes share the hands and the drop. The
      // expected hands get none: they only move level, so their drop is the reference's (Z)
      const refDrop = sadR.y - fp.hand.y;
      const drops = [];
      if (!o) drops.push([sadR, fp.hand, 'dim', 'dt', `Drop ${n0(refDrop)}`]);
      else {
        const tDrop = sad.y - tHand.y;
        if (!handMoved && Math.abs(tDrop - refDrop) < 0.5) drops.push([sadR, fp.hand, 'dim', 'dt', `Drop ${n0(refDrop)}`]);
        else drops.push([sadR, fp.hand, 'dim rfd', T_REF, `Drop ${n0(refDrop)}`], [sad, tHand, 'dim bkd', T_TGT, `Drop ${n0(tDrop)}`]);
      }
      const dx0 = Math.max(...drops.map(([, pt]) => pt.x)) + 60;
      const gap = 14 * v.k; // 14 px apart on screen
      const lastX = dx0 + gap * (drops.length - 1);
      const top = Math.max(sad.y, sadR.y);
      drops.forEach(([s0, pt, cls], i) => {
        const x = dx0 + gap * i;
        m += `<g class="dim">${v.line(pt, { x: x + 4 * v.k, y: pt.y }, 'ext lvl')}</g>`;
        m += v.dim({ x, y: s0.y }, { x, y: pt.y }, 0, '', { cls });
      });
      const dropAt = { x: lastX, y: (top + Math.min(...drops.map(([, pt]) => pt.y))) / 2 };
      m += `<g class="dim">${drops.map(([, , , tcls, txt], i) => v.text(dropAt, txt, tcls, { dx: 9, dy: 4 + 14 * (i - (drops.length - 1) / 2), anchor: 'start' })).join('')}</g>`;
      m += `<g class="dim">${v.line({ x: Math.min(sad.x, sadR.x) + 10, y: top }, { x: lastX + 10, y: top }, 'ext lvl')}</g>`;
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
      gr += lift(both[1], drawBike(gv, 'rf', rg, pr, sadR));
      gr += lift(both[0], drawBike(gv, 'bk', g, pb, sad));
      if (show.dims) {
        const rowY = (n) => -(18 + n * ROW) * k;     // rows under the ground, n = 0 first
        const rowTop = (n) => top + (14 + n * ROW) * k; // rows above everything
        both.forEach((P, i) => {
          const cls = i ? 'dim rfd' : 'dim bkd'; // reference yellow, target blue
          const tcls = i ? T_REF : T_TGT; // the label in its bike's colour (Z)
          const r1 = rowY(i); const r2 = rowY(2 + i); const rt = rowTop(i);
          const ext = (pt, y) => gv.line(pt, { x: pt.x, y: y + (y < pt.y ? -4 : 4) * k }, 'ext');
          // extension lines: axles and BB down to the rows under the ground, BB and head tube top up to the reach row
          gr += `<g class="${cls}">${ext(P.rear, r2)}${ext(P.bb, r1)}${ext({ x: P.front.x, y: P.front.y }, r2)}${ext(P.axis, r1)}${ext(P.bb, rt)}${ext(P.S, rt)}</g>`;
          const flat = (xa, xb, y, label) => gv.dim({ x: xa, y }, { x: xb, y }, 0, label, { cls, ext: false, tcls });
          gr += flat(P.rear.x, P.bb.x, r1, `Rear centre ${n0(P.bb.x - P.rear.x)}`);
          gr += flat(P.bb.x, P.front.x, r1, `Front centre ${n0(P.front.x - P.bb.x)}`);
          gr += flat(P.front.x, P.axis.x, r1, `Trail ${n0(P.trail)}`);
          gr += flat(P.rear.x, P.front.x, r2, `Wheelbase ${n0(P.front.x - P.rear.x)}`);
          const withSp = P.sp >= 0.5 ? ` with ${n0(P.sp)} mm spacers` : '';
          gr += flat(P.bb.x, P.S.x, rt, `Reach ${n0(P.S.x - P.bb.x)}${withSp}`);
          // BB height ahead of the BB, between the wheels: the target's nearer it
          gr += gv.dim({ x: P.bb.x, y: 0 }, P.bb, i ? -56 : -30, `BB height ${n0(P.h)}`, { cls, ext: false, tcls });
          // head tube top: height above the ground, and stack above the BB, out past the front wheels
          const xh = right + (24 + i * 34) * k;
          const xs = right + (92 + i * 34) * k;
          gr += `<g class="${cls}">${gv.line(P.T, { x: xh + 4 * k, y: P.T.y }, 'ext lvl')}${gv.line(P.S, { x: xs + 4 * k, y: P.S.y }, 'ext lvl')}${gv.line(P.bb, { x: xs + 4 * k, y: P.bb.y }, 'ext lvl')}</g>`;
          gr += gv.dim({ x: xh, y: 0 }, { x: xh, y: P.T.y }, 0, `HT top ${n0(P.T.y)}`, { cls, ext: false, labelOff: 11, tcls });
          gr += gv.dim({ x: xs, y: P.bb.y }, { x: xs, y: P.S.y }, 0, `Stack ${n0(P.S.y - P.bb.y)}${withSp}`, { cls, ext: false, labelOff: 11, tcls });
        });
      }
      gr += '</svg>';
    }

    /* ---------- front end close-up ---------- */
    const fpts = [pb.T, pb.stemTop, hand, fp.hand];
    for (const q of [pb, pr]) if (q) { fpts.push(q.T, q.stemTop, { x: q.B.x, y: q.B.y + q.stemH / 2 }); if (q.bar) fpts.push({ x: q.B.x + q.bar.reach, y: q.B.y + q.bar.rise - q.bar.drop }, { x: q.B.x, y: q.B.y + q.bar.rise + q.bar.diam }); }
    fpts.push(tHand); if (exp) fpts.push(exp);
    const fbox = (pts) => {
      const fx0 = Math.min(...pts.map((q) => q.x)) - 70; const fx1 = Math.max(...pts.map((q) => q.x)) + 45;
      const fy0 = Math.min(...pts.map((q) => q.y)) - 70; const fy1 = Math.max(...pts.map((q) => q.y)) + 50;
      const fw = Math.max(fx1 - fx0, (fy1 - fy0) / 0.62); // both close-ups the same shape
      return { x: (fx0 + fx1) / 2 - fw / 2, y: (fy0 + fy1) / 2 - fw * 0.31, w: fw, h: fw * 0.62 };
    };
    // stem and spacer labels: a column left of the stems, above the top tubes, each in its bike's colour
    const angTxt = (a) => `${a > 0 ? '+' : a < 0 ? MINUS : ''}${Math.abs(a)}°`;
    const frontCol = [];
    if (showRef) {
      const rs = { length: Math.round(fp.stem.length), angle: Math.round(fp.stem.angle * 2) / 2 };
      frontCol.push([`Stem ${rs.length} mm ${angTxt(rs.angle)}`, T_REF]);
      if (pr.spacers > 0.5) frontCol.push([`${n0(pr.spacers)} mm spacers`, T_REF]);
    }
    if (o) frontCol.push([`Stem ${o.length} mm ${angTxt(o.angle)}`, T_TGT]);
    if (pb.spacers > 0.5) frontCol.push([`${n0(pb.spacers)} mm spacers`, T_TGT]);
    const fparts = [pb, showRef ? pr : null].filter(Boolean);
    const colAt = { x: Math.min(...fparts.flatMap((q) => [q.T.x, q.spTop.x, q.stemTop.x, q.Q.x])) - 24, y: Math.max(...fparts.map((q) => q.stemTop.y)) };
    if (show.dims && frontCol.length) {
      // room for the column on the left: about 6.6 px per character
      const k0 = fbox(fpts).w / 590;
      fpts.push({ x: colAt.x - (Math.max(...frontCol.map(([l]) => l.length)) * 6.6 + 10) * k0, y: colAt.y });
    }
    const fvb = fbox(fpts);
    const fv = View(fvb, 590); // half the drawings area: the two close-ups sit side by side
    let f = fv.open('inset', `role="img" aria-label="Close-up of the front end: spacers, stem, handlebar and hand position on both bikes"`);
    if (show.grid) f += grid(fv, 10);
    f += `<g class="axes">${fv.line(add(pb.T, pb.d, -80), add(pb.stemTop, pb.d, 40), 'saxis')}</g>`;
    const frontOnly = (vv, cls, frame, p) => {
      let s = '';
      s += vv.line(add(frame.T, p.d, -120), frame.T, 'tube ht');
      const tt0 = add(frame.T, p.d, -18);
      s += vv.line(tt0, add(tt0, unit(sub(frame.ttRear, tt0)), 140), 'tube');
      const sq = (a, b, half) => [add(a, p.n, half), add(b, p.n, half), add(b, p.n, -half), add(a, p.n, -half)];
      if (p.spacers > 0.5) s += vv.poly(sq(frame.T, p.spTop, 17), 'spacer');
      s += vv.poly(sq(p.spTop, p.stemTop, 18), 'part');
      s += stemBody(vv, p, 18);
      s += clampAndBar(vv, p) + vv.circle(frame.T, 2.4 * vv.k, 'joint');
      return bikeG(cls, s);
    };
    if (showRef) f += frontOnly(fv, 'rf', rg, pr);
    f += frontOnly(fv, 'bk', g, pb);
    f += bikeG('rf', fv.target(fp.hand, 12)) + bikeG('bk', (exp ? fv.target(exp, 12, 'exp') : '') + fv.target(tHand, 12, 'got'));
    if (show.dims) {
      // the spacer stacks measured beside the steerer, their sizes in the column
      if (showRef && pr.spacers > 0.5) f += fv.dim(pr.T, pr.spTop, 50, '', { cls: 'dim rfd' });
      if (pb.spacers > 0.5) f += fv.dim(pb.T, pb.spTop, showRef ? 64 : 50, '', { cls: 'dim bkd' });
      frontCol.forEach(([l, c], i) => { f += fv.text(colAt, l, c, { dy: 4 + 15 * i, anchor: 'end' }); });
      // the target hands as a difference from the reference's (their positions are on BB aligned)
      const hl = handLbls();
      if (hl.length > 1) hl.forEach(([l, pt, c], i) => { f += fv.text(fp.hand, i ? `${l} ${diff1(pt.x - fp.hand.x, pt.y - fp.hand.y)}` : l, `dt ${c}`, { dx: 8, dy: -17 - 15 * (hl.length - 1 - i), anchor: 'end' }); });
      else f += fv.text(fp.hand, 'Hand', 'dt', { dy: -16 });
    }
    f += '</svg>';

    /* ---------- saddle close-up ---------- */
    const sx0 = Math.min(sad.x, sadR.x) - Math.max(300, ...[pb, pr].filter(Boolean).map((q) => q.saddle.saddleLen + 30)); const sx1 = Math.max(sad.x, sadR.x) + 70;
    const sy0 = pb.railY - 110; const sy1 = sad.y + 55;
    const sw = Math.max(sx1 - sx0, (sy1 - sy0) / 0.62); // both close-ups the same shape
    const svb = { x: (sx0 + sx1) / 2 - sw / 2, y: (sy0 + sy1) / 2 - sw * 0.31, w: sw, h: sw * 0.62 };
    const sv = View(svb, 590);
    let s = sv.open('inset', `role="img" aria-label="Close-up of the saddle: seat tube lines and clamp positions on both bikes"`);
    if (show.grid) s += grid(sv, 10);
    const saddleOnly = (vv, cls, p) => {
      let t = vv.line(p.axisAt(p.railY - 140), p.postTop, 'post');
      t += vv.line(p.postTop, p.clamp, 'post');
      t += clampBox(vv, p);
      return bikeG(cls, t);
    };
    s += `<g class="axes">${sv.line(pb.axisAt(pb.railY - 140), pb.axisAt(sad.y + 40), 'saxis')}${showRef ? sv.line(pr.axisAt(pr.railY - 140), pr.axisAt(sadR.y + 40), 'saxis rfa') : ''}</g>`;
    // one grey saddle when both bikes use the same one; otherwise each bike's own, in its colour
    if (showRef && !sameSaddle(pr, pb)) {
      s += bikeG('rf', saddleShape(sv, sadR, pr)) + bikeG('bk', saddleShape(sv, sad, pb));
    } else {
      s += `<g class="bike sdl">${saddleShape(sv, sad, pb)}</g>`;
    }
    if (showRef) s += saddleOnly(sv, 'rf', pr);
    s += saddleOnly(sv, 'bk', pb);
    s += bikeG('rf', sv.ring(sadR, 12)) + bikeG('bk', sv.ring(sad, 12, 'got'));
    if (show.dims) {
      // where each bike's clamp sits on its saddle's rails, right of the clamps and clear of the posts;
      // over the saddle tips, how far the tip moves
      const under = { x: Math.max(...[pb, showRef ? pr : null].filter(Boolean).map((q) => q.clamp.x + q.saddle.clampLen / 2)), y: pb.railY };
      const dy = 24; const at = { dx: 10, anchor: 'start' };
      const clampTxt = (q) => { const dx = q.clamp.x - q.railMid; return Math.abs(dx) < 0.5 ? 'centred on the rails' : `${n0(Math.abs(dx))} mm ${dx > 0 ? 'forward' : 'back'} of rail centre`; };
      if (showRef) {
        s += sv.text(under, `Clamp ${clampTxt(pr)}`, T_REF, { dy, ...at });
        s += sv.text(under, `Clamp ${clampTxt(pb)}`, T_TGT, { dy: dy + 14, ...at });
      } else s += sv.text(under, `Clamp ${clampTxt(pb)}`, T_TGT, { dy, ...at });
      if (shifted) {
        const over = { x: (sad.x + sadR.x) / 2, y: Math.max(sad.y, sadR.y) };
        s += sv.text(over, 'Saddle tip', 'dt xr', { dy: -32 }) + sv.text(over, `Saddle tip ${diff1(sad.x - sadR.x, sad.y - sadR.y)}`, 'dt xg', { dy: -17 });
      } else s += sv.text(sad, 'Saddle tip', 'dt', { dy: -16 });
    }
    s += '</svg>';
    // groundFocus: where the zoomed-in point is on the zoomed ground view, in px
    return { main: m, front: f, saddle: s, ground: gr, groundFocus, expHand: !!exp };
  }

  return { render };
})();
