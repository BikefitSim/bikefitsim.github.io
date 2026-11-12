/* Bikefit Simulator calculation engine.
   Grid: BB centre at (0, 0), X forward, Y up. Lengths in mm, angles in degrees. */
const GB = (() => {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const STEM_H = 40;      // stem height when none is given: its steerer clamp centre sits half of it above
                          // the spacers, and the top of its bar clamp half of it above the bar centre
  const HAND_X = 50;      // hand position when none is given, from the top centre of the stem's bar clamp:
  const HAND_Y = -4;      // forward and up (on top of a 31.8 mm drop bar with 80 mm reach, before the drop)
  const RAIL_H = 40;      // rail height: saddle top to rails at the clamp, vertical, when none is passed
  const POSTS = [20, 0];   // seatpost offsets the app chooses from: 20 mm offset or inline
  const SADDLE_LEN = 265; // saddle length, tip to back, when none is passed
  const CLAMP_LEN = 35;    // seatpost clamp length along the rails, when none is passed: its centre can move the rail length less this
  const RAIL_TRAVEL = 60;  // adjusting area marked on saddle rails, end to end, when none is passed
  const TIP_TO_RAILS = 150; // saddle tip to the middle of its rails, horizontally, when none is passed (the app passes its Defaults)
  const HAND_TOL = 10;     // a stem and spacers that miss the hand position by more than this don't match it (Z: 10 mm)
  const RAIL_TOL = 5;      // a clamp up to this far past the rail markings is a warning to check on the bike; further, an error
  const MAX_OFFSET = 40;   // most offset a seatpost is sold with, for the hint when neither fits
  const RIM_R = 311;      // 700c rim, bead seat radius
  const TYRE = 30;        // tyre width when the frame has none; the wheel's radius is the rim's plus this
  const CHAINSTAY = 410;  // drawing only, when the frame has no chainstay length
  const PLAIN_ANGLE = -6;  // stem angle preferred when the reference has no stem (a personal fit)
  const TT_DROP = 18;     // top tube centre below the head tube top, where an actual top tube ends
  const ST_EXT = 20;      // seat tube top above the top tube centre, when only one seat tube length is given

  /* How far the saddle tip sits ahead of the seatpost clamp. The clamp is railH below the
     saddle top (the saddle's rail height), on a post whose offset is measured square to the
     seat tube. */
  function tipAheadOfClamp(noseAhead, S, offset, railH = RAIL_H) {
    return noseAhead - railH / Math.tan(S) + offset / Math.sin(S);
  }

  /* A saddle's sizes on one bike, with the built-in values for any left out. */
  function saddleSizes(fit) {
    const tipToRails = fin(fit.tipToRails) && fit.tipToRails > 0 ? fit.tipToRails : TIP_TO_RAILS;
    const railTravel = fin(fit.railTravel) && fit.railTravel > 0 ? fit.railTravel : RAIL_TRAVEL;
    const clampLen = fin(fit.clampLen) && fit.clampLen > 0 ? fit.clampLen : CLAMP_LEN;
    const railH = fin(fit.railH) && fit.railH > 0 ? fit.railH : RAIL_H;
    const half = Math.max(0, railTravel - clampLen) / 2; // clamp centre either way of the rails' middle
    return { tipToRails, railTravel, clampLen, railH, railHalf: half };
  }

  /* Which seatpost carries the saddle tip on a frame, and where the saddle sits on its
     rails (+ forward of their middle). The app picks between an inline post and a 20 mm offset
     one: whichever leaves the saddle nearer the middle of its rails. The saddle's tip to rail centre and rail length come from the saddle on
     that bike. Returns a 'bad' check when no post keeps the saddle within its rails. */
  function railFit(noseAhead, S, fit, onWhat, posts = POSTS) {
    const { tipToRails, railTravel, clampLen, railH, railHalf: half } = saddleSizes(fit);
    const tries = posts.map((postOffset) => {
      const tipClamp = tipAheadOfClamp(noseAhead, S, postOffset, railH);
      const railPos = tipClamp - tipToRails;
      return { postOffset, tipClamp, railPos, railOver: Math.abs(railPos) - half }; // railOver > 0: past the end of the rails
    });
    const best = tries.reduce((p, q) => (Math.abs(q.railPos) < Math.abs(p.railPos) - 0.01 ? q : p));
    let check = null;
    if (best.railOver > 0.5) {
      // A post with less offset moves the clamp forward, so the saddle sits further back on it.
      const fwd = best.railPos > 0;
      const need = best.postOffset + (fwd ? -1 : 1) * best.railOver * Math.sin(S);
      const post = best.postOffset ? `${/^(8|1[18])(\D|$)/.test(String(best.postOffset)) ? 'an' : 'a'} ${best.postOffset} mm offset seatpost` : 'an inline seatpost';
      const hint = need > 0.5 && need <= MAX_OFFSET ? ` It would take a seatpost with about ${Math.ceil(need / 5) * 5} mm offset.` : '';
      if (best.railOver <= RAIL_TOL) {
        check = { level: 'warn', text: `To reach this setback on ${onWhat} with ${post}, the saddle slides so far ${fwd ? 'forward' : 'back'} that the ${clampLen} mm clamp overlaps the ${fwd ? 'back' : 'front'} end of the ${railTravel} mm rail markings by about ${best.railOver.toFixed(0)} mm. Check on the bike that the clamp still grips the straight part of the rails.` };
      } else check = { level: 'bad', fwd, over: best.railOver, need, text: `This saddle setback can't be reached on ${onWhat}. Even with ${post}, the saddle would have to sit ${best.railOver.toFixed(0)} mm further ${fwd ? 'forward' : 'back'} than its ${railTravel} mm rails allow with a ${clampLen} mm seatpost clamp.${hint}` };
    }
    return Object.assign({ railTravel, clampLen, railH, railHalf: half, tipToRails, tries, check }, best);
  }

  function parseList(str, { min = -Infinity, max = Infinity } = {}) {
    const out = String(str || '')
      .split(/[,;\s]+/)
      .map((s) => s.replace(/−/g, '-').replace(/[^\d.+-]/g, ''))
      .filter((s) => s !== '' && s !== '+' && s !== '-')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= min && n <= max);
    return [...new Set(out)].sort((a, b) => a - b);
  }

  /* d points up the steerer, n is square to it pointing forward. */
  function steerer(hta) {
    const H = rad(hta);
    return { d: { x: -Math.cos(H), y: Math.sin(H) }, n: { x: Math.sin(H), y: Math.cos(H) } };
  }

  /* Seat tube c-t (BB centre to the top of the tube) and c-c (BB centre to the top tube centre).
     Either one will do; the other is taken as 20 mm different and flagged as estimated. */
  function seatTubes(b) {
    const ct = fin(b.seatTube) && b.seatTube > 0 ? b.seatTube : null;
    const cc = fin(b.seatTubeCC) && b.seatTubeCC > 0 ? b.seatTubeCC : null;
    return {
      ct: ct ?? (cc != null ? cc + ST_EXT : null),
      cc: cc ?? (ct != null ? ct - ST_EXT : null),
      ctEst: ct == null && cc != null,
      ccEst: cc == null && ct != null,
    };
  }

  /* Fork length (axle to crown plus any lower headset cup) that puts the head tube top at the
     chart stack, with the front axle BB drop above the BB on the fork's offset line. */
  function forkFromStack(b) {
    if (![b.stack, b.htLength, b.forkOffset, b.bbDrop, b.hta].every(fin) || !(b.stack > 0)) return null;
    const H = rad(b.hta);
    return (b.stack - b.bbDrop + b.forkOffset * Math.cos(H)) / Math.sin(H) - b.htLength;
  }
  // the fork length as entered or, when it is empty, worked out from the chart stack
  const forkLength = (b) => (fin(b.forkA2C) ? b.forkA2C : forkFromStack(b));

  /* Stack and reach: from the chart when given, otherwise from head tube, fork and BB drop, and
     the effective top tube or, without one, the actual top tube. The actual top tube runs centre
     to centre from the seat tube, at its c-c length, to the head tube, 18 mm below its top. */
  function frameGeometry(b) {
    const H = rad(b.hta);
    const S = rad(b.sta);
    const tubesOk = [b.htLength, b.forkA2C, b.forkOffset, b.bbDrop].every(fin);
    const stackCalc = tubesOk ? b.bbDrop + (b.forkA2C + b.htLength) * Math.sin(H) - b.forkOffset * Math.cos(H) : null;
    const hasStack = fin(b.stack) && b.stack > 0;
    const hasReach = fin(b.reach) && b.reach > 0;
    const stack = hasStack ? b.stack : stackCalc;
    const reachEtt = fin(b.ett) && b.ett > 0 && stack != null ? b.ett - stack / Math.tan(S) : null;
    const st = seatTubes(b);
    let reachAtt = null;
    if (fin(b.att) && b.att > 0 && stack != null && st.cc != null) {
      const P = { x: -st.cc * Math.cos(S), y: st.cc * Math.sin(S) }; // top tube centre at the seat tube
      const jy = stack - TT_DROP * Math.sin(H);                        // and at the head tube
      const sq = b.att ** 2 - (jy - P.y) ** 2;
      if (sq > 0) reachAtt = P.x + Math.sqrt(sq) - TT_DROP * Math.cos(H);
    }
    const reachCalc = reachEtt ?? reachAtt;
    const reachFrom = reachEtt != null ? 'ett' : reachAtt != null ? 'att' : null;
    const reach = hasReach ? b.reach : reachCalc;
    return {
      stack, reach, stackCalc, reachCalc, reachEtt, reachAtt, reachFrom,
      ccEst: reachFrom === 'att' && st.ccEst, // reach from the actual top tube with the c-c estimated
      stackSrc: hasStack ? 'chart' : 'tubes', reachSrc: hasReach ? 'chart' : 'tubes',
    };
  }

  /* Where the hands sit (the web between thumb and index finger on the bar) from the top centre of
     the stem's bar clamp, measured level: Hand X forward, Hand Y up. Any hand position works this
     way: tops, hoods, drops, a flat bar's grips. */
  const handOff = (o) => ({ x: fin(o && o.handX) ? o.handX : HAND_X, y: fin(o && o.handY) ? o.handY : HAND_Y });
  const stemH = (o) => (fin(o && o.stemH) && o.stemH > 0 ? o.stemH : STEM_H);
  // the top centre of a stem's bar clamp, from the bar centre: the clamp is as tall as the stem
  const clampTop = (B, o) => ({ x: B.x, y: B.y + stemH(o) / 2 });

  /* Bar centre for a stem on a bike that carries resolved stack and reach (and its stem height). */
  function barFor(bike, angle, length, spacers) {
    const { d } = steerer(bike.hta);
    const k = spacers + stemH(bike) / 2;
    const th = rad(90 - bike.hta + angle);
    const Q = { x: bike.reach + k * d.x, y: bike.stack + k * d.y };
    return { Q, B: { x: Q.x + length * Math.cos(th), y: Q.y + length * Math.sin(th) } };
  }

  /* Personal fit: no bike, only the rider's numbers. Saddle height is the straight line from
     the BB centre to the saddle tip, so with the setback it fixes the tip; personal reach and
     drop fix the hands from there. */
  function bodyPoints(fit) {
    const yy = fit.saddleLine ** 2 - fit.setback ** 2;
    if (!(yy > 0)) return { ok: false, error: 'Saddle setback has to be shorter than the saddle height line. Check both.' };
    const ys = Math.sqrt(yy);
    const xs = -fit.setback;
    const half = fin(fit.barWidth) ? fit.barWidth / 2 : 0;
    const sq = fit.riderReach ** 2 - fit.drop ** 2 - half ** 2;
    if (sq <= 0) return { ok: false, error: 'Personal reach is too short for this drop and hand width. Check the three numbers.' };
    const reachH = Math.sqrt(sq);
    return {
      ok: true, kind: 'fit',
      bike: null, geo: null, stem: null, reachH, half, riderReach: fit.riderReach, drop: fit.drop,
      saddle: { x: xs, y: ys },
      hand: { x: xs + reachH, y: ys - fit.drop },
      noseAhead: null, // no seat tube to measure from
      spacers: null,
    };
  }

  /* Saddle tip and hand position for a reference.
     A bikefit places the hands from the stem fitted on it; personal reach and drop are
     worked out from that. Saves from before stems were entered gave personal reach and drop
     instead (handFrom 'reach'), and the stem is worked out from those. */
  function fitPoints(ref, fit) {
    if (ref.kind === 'fit') return bodyPoints(fit);
    const geo = frameGeometry(ref);
    const S = rad(ref.sta);
    const ys = fit.saddleHeight * Math.sin(S);
    const xs = -fit.setback;
    // The tape from the saddle tip to the hand runs out to the side, so half the hand width is
    // sideways and only the rest shows in side view.
    const half = fin(fit.barWidth) ? fit.barWidth / 2 : 0;
    const bike = Object.assign({}, ref, { stack: geo.stack, reach: geo.reach, stemH: stemH(fit) });
    const { d } = steerer(ref.hta);
    const k = fit.spacers + stemH(fit) / 2;
    const Q = { x: bike.reach + k * d.x, y: bike.stack + k * d.y };
    let hand; let reachH; let drop; let riderReach; let stem;
    if (fit.handFrom === 'stem') {
      const B = barFor(bike, fit.stemAngle, fit.stemLength, fit.spacers).B;
      const h = handOff(fit); const top = clampTop(B, fit); hand = { x: top.x + h.x, y: top.y + h.y };
      reachH = hand.x - xs;
      if (reachH <= 0) return { ok: false, error: 'With this stem the hands would sit behind the saddle tip. Check the stem and the setback.' };
      drop = ys - hand.y;
      riderReach = Math.sqrt(reachH ** 2 + drop ** 2 + half ** 2);
      stem = { length: fit.stemLength, angle: fit.stemAngle, Q, B };
    } else {
      const sq = fit.riderReach ** 2 - fit.drop ** 2 - half ** 2;
      if (sq <= 0) return { ok: false, error: 'Personal reach is too short for this drop and hand width. Check the three numbers.' };
      reachH = Math.sqrt(sq);
      drop = fit.drop;
      riderReach = fit.riderReach;
      hand = { x: xs + reachH, y: ys - drop };
      const h = handOff(fit); const B = { x: hand.x - h.x, y: hand.y - h.y - stemH(fit) / 2 };
      const vx = B.x - Q.x;
      const vy = B.y - Q.y;
      stem = { length: Math.hypot(vx, vy), angle: deg(Math.atan2(vy, vx)) - (90 - ref.hta), Q, B };
    }
    return {
      ok: true, kind: 'bike',
      bike, geo, stem, reachH, half, riderReach, drop,
      saddle: { x: xs, y: ys },
      hand,
      noseAhead: xs + ys / Math.tan(S), // saddle tip ahead of the seat-tube line at saddle height
      // the reference bike has to carry its own setback too, on an inline or 20 mm offset seatpost
      rail: railFit(xs + ys / Math.tan(S), S, fit, 'this bike'),
      spacers: fit.spacers,
    };
  }

  function solveCockpit(bike, opts, target, prefAngle) {
    const { d } = steerer(bike.hta);
    const angles = parseList(opts.stemAngles, { min: -45, max: 45 });
    const lengths = parseList(opts.stemLengths, { min: 20, max: 200 });
    const step = opts.spacerStep > 0 ? opts.spacerStep : 5;
    const minS = fin(opts.minSpacers) && opts.minSpacers > 0 ? opts.minSpacers : 0; // empty means none
    const maxS = Math.max(minS, opts.maxSpacers);
    const k0 = stemH(bike) / 2;
    const bestPerStem = new Map();
    for (const a of angles) {
      const th = rad(90 - bike.hta + a);
      const e = { x: Math.cos(th), y: Math.sin(th) };
      for (const L of lengths) {
        const px = target.x - bike.reach - k0 * d.x - L * e.x;
        const py = target.y - bike.stack - k0 * d.y - L * e.y;
        const sStar = px * d.x + py * d.y;
        for (let s of [Math.floor(sStar / step) * step, Math.ceil(sStar / step) * step]) {
          s = Math.round(Math.min(maxS, Math.max(minS, s)) * 10) / 10;
          const { B, Q } = barFor(bike, a, L, s);
          const dx = B.x - target.x;
          const dy = B.y - target.y;
          const c = { angle: a, length: L, spacers: s, B, Q, dx, dy, err: Math.hypot(dx, dy) };
          const key = `${a}|${L}`;
          const prev = bestPerStem.get(key);
          if (!prev || c.err < prev.err) bestPerStem.set(key, c);
        }
      }
    }
    // Rank by miss distance as shown (0.1 mm), so the first option is always the closest;
    // ties go to the stem angle nearest the reference, then to fewer spacers.
    const ranked = [...bestPerStem.values()].sort((p, q) => {
      const ep = Math.round(p.err * 10);
      const eq = Math.round(q.err * 10);
      if (ep !== eq) return ep - eq;
      const ap = Math.abs(p.angle - prefAngle);
      const aq = Math.abs(q.angle - prefAngle);
      if (ap !== aq) return ap - aq;
      return p.spacers - q.spacers;
    });
    const exactFor = (a) => {
      const H = rad(bike.hta);
      const th = rad(90 - bike.hta + a);
      const dxp = target.x - bike.reach - k0 * d.x;
      const dyp = target.y - bike.stack - k0 * d.y;
      const ca = Math.cos(rad(a));
      return { angle: a, length: (Math.cos(H) * dyp + Math.sin(H) * dxp) / ca, spacers: (Math.cos(th) * dyp - Math.sin(th) * dxp) / ca };
    };
    return {
      options: ranked.slice(0, 12),
      all: ranked,
      best: ranked[0] || null,
      exactFor,
      steepest: angles.length ? exactFor(angles[0]) : null,
      minSpacers: minS,
    };
  }

  function frameDrawing(bike) {
    const { d, n } = steerer(bike.hta);
    const S = rad(bike.sta);
    const T = { x: bike.reach, y: bike.stack };
    // BB centre to rear axle, straight line; the axle sits BB drop above the BB
    const csKnown = fin(bike.chainstay) && bike.chainstay > Math.abs(bike.bbDrop) + 1;
    const cs = csKnown ? bike.chainstay : CHAINSTAY;
    const csH = Math.sqrt(cs ** 2 - bike.bbDrop ** 2);
    const rear = { x: -csH, y: bike.bbDrop };
    const along = (t) => ({ x: T.x + t * d.x, y: T.y + t * d.y });
    const htBottom = along(-bike.htLength);
    // Front axle level with the rear one, as a geometry chart has them: on the fork's offset line,
    // BB drop above the BB. With stack from the tubes that is head tube plus fork length down the
    // steering axis; a chart stack that disagrees with them changes the fork length here, rather
    // than tipping the bike with one wheel off the ground.
    const down = (T.y + bike.forkOffset * n.y - bike.bbDrop) / d.y;
    const axisFoot = along(-down);
    const frontCalc = { x: axisFoot.x + bike.forkOffset * n.x, y: axisFoot.y + bike.forkOffset * n.y };
    // a wheelbase from the chart places the front axle exactly, measured from a known rear axle
    const wbKnown = csKnown && fin(bike.wheelbase) && bike.wheelbase > csH;
    const front = wbKnown ? { x: rear.x + bike.wheelbase, y: bike.bbDrop } : frontCalc;
    // where the steering axis meets the ground, and the trail behind it; the wheel's outside is
    // the rim plus the tyre width, so the tyre sets the BB height and the trail
    const rimR = fin(bike.wheel) && bike.wheel > 0 ? bike.wheel / 2 : RIM_R; // wheel size: the rim's bead seat diameter
    const wheelR = rimR + (fin(bike.tyre) && bike.tyre > 0 ? bike.tyre : TYRE);
    const groundY = bike.bbDrop - wheelR;
    const axisGround = along((groundY - T.y) / d.y);
    const st = seatTubes(bike);
    const onSeatTube = (l) => ({ x: -l * Math.cos(S), y: l * Math.sin(S) });
    const stTop = onSeatTube(st.ct);
    const ttRear = fin(bike.seatTubeCC) && bike.seatTubeCC > 0 ? onSeatTube(st.cc) : stTop; // top tube meets the seat tube
    const ssJoin = onSeatTube(st.ct - 25);
    return { T, rear, front, htBottom, crown: htBottom, stTop, ttRear, ssJoin, rimR, wheelR, groundY, axisGround, trail: axisGround.x - front.x, wbCalc: frontCalc.x - rear.x, wbKnown, csKnown };
  }

  /* One target bike: what to change so saddle tip and hand position match the reference. */
  /* Checks on the frame numbers alone: a chart stack, reach or wheelbase that disagrees with the
     tubes, or a reach that rests on a guessed seat tube c-c. Each is marked frame: true, so the app
     can show them with the frame they belong to. */
  function frameChecks(bikeIn) {
    const geo = frameGeometry(bikeIn);
    const bike = Object.assign({}, bikeIn, { stack: geo.stack, reach: geo.reach });
    const checks = [];
    if (geo.stackSrc === 'chart' && geo.stackCalc != null && Math.abs(geo.stackCalc - geo.stack) > 8) {
      checks.push({ level: 'warn', text: `Head tube, fork and BB drop give a stack of ${geo.stackCalc.toFixed(0)} mm, but ${geo.stack} mm was entered. Check the fork length. The stack entered is used.` });
    }
    if (geo.reachSrc === 'chart' && geo.reachCalc != null && Math.abs(geo.reachCalc - geo.reach) > 8) {
      checks.push({ level: 'warn', text: `${geo.reachFrom === 'att' ? 'The actual top tube and seat tube give' : 'Top tube and seat angle give'} a reach of ${geo.reachCalc.toFixed(0)} mm, but ${geo.reach} mm was entered. The reach entered is used.` });
    }
    if (geo.reachSrc === 'tubes' && geo.reachEtt != null && geo.reachAtt != null && Math.abs(geo.reachEtt - geo.reachAtt) > 8) {
      checks.push({ level: 'warn', text: `The effective top tube gives a reach of ${geo.reachEtt.toFixed(0)} mm and the actual top tube ${geo.reachAtt.toFixed(0)} mm. Check both. The effective top tube is used.` });
    }
    if (geo.reachSrc === 'tubes' && geo.ccEst) {
      checks.push({ level: 'info', text: 'Reach comes from the actual top tube, taking the seat tube c-c as 20 mm less than the c-t. Enter the c-c for an exact reach.' });
    }
    const fd = frameDrawing(bike);
    if (fd.wbKnown && Math.abs(fd.wbCalc - bike.wheelbase) > 8) {
      checks.push({ level: 'warn', text: `Chainstay, head tube, fork and reach give a wheelbase of ${fd.wbCalc.toFixed(0)} mm, but ${bike.wheelbase} mm was entered. Check the fork length and chainstay. The wheelbase entered is used in the drawings.` });
    }
    return checks.map((c) => Object.assign(c, { frame: true }));
  }
  function solveBike(bikeIn, fp, fit, opts) {
    const geo = frameGeometry(bikeIn);
    const bike = Object.assign({}, bikeIn, { stack: geo.stack, reach: geo.reach });
    const S = rad(bike.sta);
    // this bike's own saddle; where it is left empty, the reference's
    const own = (k) => (fin(bikeIn[k]) && bikeIn[k] > 0 ? bikeIn[k] : fit[k]);
    const saddle = { tipToRails: own('tipToRails'), railTravel: own('railTravel'), clampLen: own('clampLen'), saddleLen: own('saddleLen'), railH: own('railH') };
    // You sit in the same place on the back of any saddle, so the back of the saddle stays put:
    // a shorter saddle has its tip further back (more setback).
    const len = (v) => (fin(v) && v > 0 ? v : SADDLE_LEN);
    const tipShift = len(saddle.saddleLen) - len(fit.saddleLen);
    const y = fp.saddle.y;
    const x = fp.saddle.x + tipShift;
    // Personal reach and drop are what has to match (Z, 2026-11-11), not the hand point itself:
    // the tape from the saddle tip runs out to the side to the hand, so with a different hand
    // width the hands move level, forward or back, until it reads the same personal reach. The
    // target's stem then has to put the top of its bar clamp where its hand position (the
    // reference's, or its own saved cockpit's) says, behind that point.
    const wRef = fin(bike.barWidth) ? bike.barWidth : fin(fit.barWidth) ? fit.barWidth : 0;
    const halfT = wRef / 2;
    const sqT = fp.riderReach ** 2 - fp.drop ** 2 - halfT ** 2;
    const hand = Math.abs(halfT - fp.half) < 0.05 || !(sqT > 0) ? fp.hand : { x: fp.saddle.x + Math.sqrt(sqT), y: fp.hand.y };
    const reachH = hand.x - fp.saddle.x;
    const heightAlong = y / Math.sin(S);
    const noseAhead = x + y / Math.tan(S); // saddle tip ahead of this seat tube's line at saddle height
    const rail = railFit(noseAhead, S, saddle, 'this frame');
    const { postOffset, railTravel, tipToRails, railPos, railOver } = rail;
    // + = saddle further forward of the middle of its rails than on the reference bike (with the
    // same saddle, that is how far it slides on the clamp); none for a personal fit, nor when
    // neither post puts the reference's saddle on its rails
    const railMove = fp.rail && !(fp.rail.check && fp.rail.check.level === 'bad') ? railPos - fp.rail.railPos : null;
    const sameSaddle = !fp.rail || Math.abs(tipToRails - fp.rail.tipToRails) < 0.05;
    const st = seatTubes(bike);
    const exposed = (y - rail.railH) / Math.sin(S) - st.ct;
    const ctNote = st.ctEst ? ', taking the seat tube c-t as the c-c plus 20 mm' : '';
    // a target bike with a saved handlebar of its own has that handlebar's hand position
    const ho = { x: fin(bike.handX) ? bike.handX : handOff(fit).x, y: fin(bike.handY) ? bike.handY : handOff(fit).y };
    const target = { x: hand.x - ho.x, y: hand.y - ho.y - stemH(bike) / 2 }; // the bar centre that puts the hands there
    const cockpit = solveCockpit(bike, opts, target, fp.stem ? fp.stem.angle : PLAIN_ANGLE);
    const checks = frameChecks(bikeIn);

    // another hand width moves the hands to keep personal reach: say so (Z)
    const dHand = hand.x - fp.hand.x;
    if (Math.abs(halfT - fp.half) >= 0.05) {
      const wT = (2 * halfT).toFixed(0); const wR = (2 * fp.half).toFixed(0);
      const moved = Math.abs(dHand) >= 0.5 ? `the hands sit about ${Math.abs(dHand).toFixed(0)} mm ${dHand < 0 ? 'closer' : 'further away'}` : 'the hands barely move';
      checks.push({ level: 'warn', text: `The reference and target cockpits have different hand widths (${wR} and ${wT} mm). Personal reach stays the same to keep your position, so ${moved}.` });
    }
    if (Math.abs(tipShift) >= 0.5) {
      // the hands stay put, but personal reach is taped from the saddle tip, which has moved
      const tapeHere = Math.hypot(hand.x - x, y - hand.y, wRef / 2);
      const dR = tapeHere - Math.hypot(hand.x - fp.saddle.x, y - hand.y, wRef / 2);
      checks.push({ level: 'warn', text: `This saddle is ${Math.abs(tipShift).toFixed(0)} mm ${tipShift < 0 ? 'shorter' : 'longer'} than the reference's, so its tip sits ${Math.abs(tipShift).toFixed(0)} mm further ${tipShift < 0 ? 'back' : 'forward'}. The hands stay where they were, but personal reach, measured from the saddle tip, reads about ${Math.abs(dR).toFixed(0)} mm ${dR > 0 ? 'more' : 'less'} on this bike (${tapeHere.toFixed(0)} mm). Compare personal reach only between bikes with the same saddle.` });
    }
    const fd = frameDrawing(bike);
    if (rail.check) checks.push(rail.check);
    if (exposed < 40) {
      checks.push({ level: 'bad', text: `Only about ${exposed.toFixed(0)} mm of seatpost would show${ctNote}. The saddle may not go this low on this frame.` });
    } else if (exposed > 280) {
      checks.push({ level: 'warn', text: `About ${exposed.toFixed(0)} mm of seatpost would show${ctNote}. Check post length and minimum insertion.` });
    }
    if (cockpit.best && cockpit.best.err > HAND_TOL) {
      const b = cockpit.best;
      const bits = [];
      if (Math.abs(b.dx) >= 1) bits.push(`${Math.abs(b.dx).toFixed(0)} mm ${b.dx > 0 ? 'too far forward' : 'too close'}`);
      if (Math.abs(b.dy) >= 1) bits.push(`${Math.abs(b.dy).toFixed(0)} mm ${b.dy > 0 ? 'too high' : 'too low'}`);
      checks.push({ level: 'bad', hand: true, text: `No stem and spacer combination reaches the hand position within a ${HAND_TOL} mm margin. The closest leaves it ${bits.join(' and ')}.` });
    }
    if (cockpit.steepest && cockpit.steepest.spacers < cockpit.minSpacers - 2) {
      const stemTxt = cockpit.minSpacers > 0 ? `${cockpit.steepest.angle}° stem on the minimum ${cockpit.minSpacers} mm of spacers` : `slammed ${cockpit.steepest.angle}° stem`;
      checks.push({ level: 'warn', text: `The front end is tall for this fit. Even a ${stemTxt} leaves the bar about ${(cockpit.minSpacers - cockpit.steepest.spacers).toFixed(0)} mm higher than wanted.` });
    }
    return { bike, geo, saddle: { x, y }, setback: -x, tipShift, saddleLen: len(saddle.saddleLen), heightAlong, noseAhead, railMove, sameSaddle, railPos, railOver, railTravel, railHalf: rail.railHalf, clampLen: rail.clampLen, railH: rail.railH, postTries: rail.tries, postOffset, tipToRails, exposed, target, hand, reachH, barWidth: wRef, cockpit, checks, drawing: fd };
  }

  return { fitPoints, bodyPoints, frameGeometry, forkFromStack, forkLength, solveBike, frameChecks, barFor, handOff, parseList, railFit, frameDrawing, steerer, rad, HAND_TOL, STEM_H, HAND_Y, stemH, RAIL_TOL };
})();
if (typeof module !== 'undefined') module.exports = GB;
