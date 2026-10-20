/* BikefitSim calculation engine.
   Grid: BB centre at (0, 0), X forward, Y up. Lengths in mm, angles in degrees. */
const GB = (() => {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const STEM_CLAMP = 40;  // stem height on the steerer; its centre sits 20 mm above the spacers
  const BAR_R = 15.9;     // 31.8 mm bar
  const RAIL_H = 45;      // saddle top to rails, for the seatpost check only
  const POSTS = [20, 0];   // seatpost offsets the app chooses from: 20 mm setback or inline
  const RAIL_TRAVEL = 60;  // adjusting area marked on saddle rails, end to end
  const TIP_TO_RAILS = 150; // saddle tip to the middle of its rails, horizontally, when none is passed (the app passes its Defaults)
  const MAX_OFFSET = 40;   // most offset a seatpost is sold with, for the hint when neither fits
  const WHEEL_R = 340;    // drawing only
  const CHAINSTAY = 410;  // drawing only, when the frame has no chainstay length
  const PLAIN_ANGLE = -6;  // stem angle preferred when the reference has no stem (a personal fit)
  const TT_DROP = 18;     // top tube centre below the head tube top, where an actual top tube ends
  const ST_EXT = 20;      // seat tube top above the top tube centre, when only one seat tube length is given

  /* How far the saddle tip sits ahead of the seatpost clamp. The clamp is RAIL_H below the
     saddle top, on a post whose offset is measured square to the seat tube. */
  function tipAheadOfClamp(noseAhead, S, offset) {
    return noseAhead - RAIL_H / Math.tan(S) + offset / Math.sin(S);
  }

  /* Which seatpost carries the saddle tip on a frame, and where the saddle sits on its rails
     (+ forward of their middle). The app picks between an inline post and a 20 mm offset
     one: whichever leaves the saddle nearer the middle of its rails. The saddle's tip to
     rail centre comes from the reference: the same saddle on every bike. Returns a 'bad'
     check when neither post keeps the saddle within its rails. */
  function railFit(noseAhead, S, fit, onWhat) {
    const tipToRails = fin(fit.tipToRails) && fit.tipToRails > 0 ? fit.tipToRails : TIP_TO_RAILS;
    const half = RAIL_TRAVEL / 2;
    const tries = POSTS.map((postOffset) => {
      const tipClamp = tipAheadOfClamp(noseAhead, S, postOffset);
      const railPos = tipClamp - tipToRails;
      return { postOffset, tipClamp, railPos, railOver: Math.abs(railPos) - half }; // railOver > 0: past the end of the rails
    });
    const best = tries.reduce((p, q) => (Math.abs(q.railPos) < Math.abs(p.railPos) - 0.01 ? q : p));
    let check = null;
    if (best.railOver > 0.5) {
      // A post with less offset moves the clamp forward, so the saddle sits further back on it.
      const fwd = best.railPos > 0;
      const need = best.postOffset + (fwd ? -1 : 1) * best.railOver * Math.sin(S);
      const post = best.postOffset ? `a ${best.postOffset} mm offset seatpost` : 'an inline seatpost';
      const hint = need > 0.5 && need <= MAX_OFFSET ? ` It would take a seatpost with about ${Math.ceil(need / 5) * 5} mm offset.` : '';
      check = { level: 'bad', text: `This saddle setback can't be reached on ${onWhat}. Even with ${post}, the saddle would have to sit ${best.railOver.toFixed(0)} mm further ${fwd ? 'forward' : 'back'} than its ${RAIL_TRAVEL} mm of rail adjustment allows.${hint}` };
    }
    return Object.assign({ railTravel: RAIL_TRAVEL, tipToRails, check }, best);
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

  /* Bar centre for a stem on a bike that carries resolved stack and reach. */
  function barFor(bike, angle, length, spacers) {
    const { d } = steerer(bike.hta);
    const k = spacers + STEM_CLAMP / 2;
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
    if (sq <= 0) return { ok: false, error: 'Personal reach is too short for this drop and handlebar width. Check the three numbers.' };
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
     A bike fit places the hands from the stem fitted on it; personal reach and drop are
     worked out from that. Saves from before stems were entered gave personal reach and drop
     instead (handFrom 'reach'), and the stem is worked out from those. */
  function fitPoints(ref, fit) {
    if (ref.kind === 'fit') return bodyPoints(fit);
    const geo = frameGeometry(ref);
    const S = rad(ref.sta);
    const ys = fit.saddleHeight * Math.sin(S);
    const xs = -fit.setback;
    // The tape from the saddle tip to the hand runs out to the side of the bar, so half the
    // bar width is sideways and only the rest shows in side view.
    const half = fin(fit.barWidth) ? fit.barWidth / 2 : 0;
    const bike = Object.assign({}, ref, { stack: geo.stack, reach: geo.reach });
    const { d } = steerer(ref.hta);
    const k = fit.spacers + STEM_CLAMP / 2;
    const Q = { x: bike.reach + k * d.x, y: bike.stack + k * d.y };
    let hand; let reachH; let drop; let riderReach; let stem;
    if (fit.handFrom === 'stem') {
      const B = barFor(bike, fit.stemAngle, fit.stemLength, fit.spacers).B;
      hand = { x: B.x + fit.barReach, y: B.y + BAR_R }; // the bar's reach point, level with the top of the bar
      reachH = hand.x - xs;
      if (reachH <= 0) return { ok: false, error: 'With this stem the hands would sit behind the saddle tip. Check the stem and the setback.' };
      drop = ys - hand.y;
      riderReach = Math.sqrt(reachH ** 2 + drop ** 2 + half ** 2);
      stem = { length: fit.stemLength, angle: fit.stemAngle, Q, B };
    } else {
      const sq = fit.riderReach ** 2 - fit.drop ** 2 - half ** 2;
      if (sq <= 0) return { ok: false, error: 'Personal reach is too short for this drop and handlebar width. Check the three numbers.' };
      reachH = Math.sqrt(sq);
      drop = fit.drop;
      riderReach = fit.riderReach;
      hand = { x: xs + reachH, y: ys - drop };
      const B = { x: hand.x - fit.barReach, y: hand.y - BAR_R };
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
      // the reference bike has to carry its own setback too
      rail: railFit(xs + ys / Math.tan(S), S, fit, 'this bike'),
      spacers: fit.spacers,
    };
  }

  function solveCockpit(bike, opts, target, prefAngle) {
    const { d } = steerer(bike.hta);
    const angles = parseList(opts.stemAngles, { min: -45, max: 45 });
    const lengths = parseList(opts.stemLengths, { min: 20, max: 200 });
    const step = opts.spacerStep > 0 ? opts.spacerStep : 5;
    const maxS = Math.max(0, opts.maxSpacers);
    const k0 = STEM_CLAMP / 2;
    const bestPerStem = new Map();
    for (const a of angles) {
      const th = rad(90 - bike.hta + a);
      const e = { x: Math.cos(th), y: Math.sin(th) };
      for (const L of lengths) {
        const px = target.x - bike.reach - k0 * d.x - L * e.x;
        const py = target.y - bike.stack - k0 * d.y - L * e.y;
        const sStar = px * d.x + py * d.y;
        for (let s of [Math.floor(sStar / step) * step, Math.ceil(sStar / step) * step]) {
          s = Math.round(Math.min(maxS, Math.max(0, s)) * 10) / 10;
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
    // where the steering axis meets the ground, and the trail behind it
    const groundY = bike.bbDrop - WHEEL_R;
    const axisGround = along((groundY - T.y) / d.y);
    const st = seatTubes(bike);
    const onSeatTube = (l) => ({ x: -l * Math.cos(S), y: l * Math.sin(S) });
    const stTop = onSeatTube(st.ct);
    const ttRear = fin(bike.seatTubeCC) && bike.seatTubeCC > 0 ? onSeatTube(st.cc) : stTop; // top tube meets the seat tube
    const ssJoin = onSeatTube(st.ct - 25);
    return { T, rear, front, htBottom, crown: htBottom, stTop, ttRear, ssJoin, wheelR: WHEEL_R, groundY, axisGround, trail: axisGround.x - front.x, wbCalc: frontCalc.x - rear.x, wbKnown, csKnown };
  }

  /* One target bike: what to change so saddle tip and hand position match the reference. */
  function solveBike(bikeIn, fp, fit, opts) {
    const geo = frameGeometry(bikeIn);
    const bike = Object.assign({}, bikeIn, { stack: geo.stack, reach: geo.reach });
    const S = rad(bike.sta);
    const { y, x } = fp.saddle;
    // Personal reach is the tape length to keep. A different bar width on this bike changes how
    // much of that tape runs sideways, so the hands move forward or back in side view.
    const wRef = fin(fit.barWidth) ? fit.barWidth : 0;
    const wBike = fin(bikeIn.barWidth) && bikeIn.barWidth > 0 ? bikeIn.barWidth : wRef;
    let hand = fp.hand;
    let reachH = fp.reachH;
    if (wRef > 0 && wBike !== wRef) {
      const sq = fp.riderReach ** 2 - fp.drop ** 2 - (wBike / 2) ** 2;
      if (sq > 0) { reachH = Math.sqrt(sq); hand = { x: x + reachH, y: fp.hand.y }; }
    }
    const handShift = hand.x - fp.hand.x;
    const heightAlong = y / Math.sin(S);
    const noseAhead = x + y / Math.tan(S); // saddle tip ahead of this seat tube's line at saddle height
    const rail = railFit(noseAhead, S, fit, 'this frame');
    const { postOffset, railTravel, tipToRails, railPos, railOver } = rail;
    // + = saddle further forward on its rails than on the reference bike; none for a personal fit
    const railMove = fp.rail ? rail.tipClamp - fp.rail.tipClamp : null;
    const st = seatTubes(bike);
    const exposed = (y - RAIL_H) / Math.sin(S) - st.ct;
    const ctNote = st.ctEst ? ', taking the seat tube c-t as the c-c plus 20 mm' : '';
    const target = { x: hand.x - bike.barReach, y: hand.y - BAR_R };
    const cockpit = solveCockpit(bike, opts, target, fp.stem ? fp.stem.angle : PLAIN_ANGLE);
    const checks = [];

    if (geo.stackSrc === 'chart' && geo.stackCalc != null && Math.abs(geo.stackCalc - geo.stack) > 8) {
      checks.push({ level: 'warn', text: `Head tube, fork and BB drop give a stack of ${geo.stackCalc.toFixed(0)} mm, but the chart says ${geo.stack} mm. Check the fork length. The chart value is used.` });
    }
    if (geo.reachSrc === 'chart' && geo.reachCalc != null && Math.abs(geo.reachCalc - geo.reach) > 8) {
      checks.push({ level: 'warn', text: `${geo.reachFrom === 'att' ? 'The actual top tube and seat tube give' : 'Top tube and seat angle give'} a reach of ${geo.reachCalc.toFixed(0)} mm, but the chart says ${geo.reach} mm. The chart value is used.` });
    }
    if (geo.reachSrc === 'tubes' && geo.reachEtt != null && geo.reachAtt != null && Math.abs(geo.reachEtt - geo.reachAtt) > 8) {
      checks.push({ level: 'warn', text: `The effective top tube gives a reach of ${geo.reachEtt.toFixed(0)} mm and the actual top tube ${geo.reachAtt.toFixed(0)} mm. Check both. The effective top tube is used.` });
    }
    if (geo.reachSrc === 'tubes' && geo.ccEst) {
      checks.push({ level: 'info', text: 'Reach comes from the actual top tube, taking the seat tube c-c as 20 mm less than the c-t. Enter the c-c from the chart for an exact reach.' });
    }
    if (Math.abs(handShift) >= 0.5) {
      checks.push({ level: 'info', text: `The bar is ${Math.abs(wBike - wRef).toFixed(0)} mm ${wBike > wRef ? 'wider' : 'narrower'} than on the reference. With the arms angled ${wBike > wRef ? 'further out' : 'less'}, the same personal reach puts the hands ${Math.abs(handShift).toFixed(1)} mm ${handShift < 0 ? 'further back' : 'further forward'}.` });
    }
    if (wRef === 0 && fin(bikeIn.barWidth) && bikeIn.barWidth > 0) {
      checks.push({ level: 'warn', text: 'Enter the reference\'s handlebar width in step 1, so this bar width can be compared with it.' });
    }
    const fd = frameDrawing(bike);
    if (fd.wbKnown && Math.abs(fd.wbCalc - bike.wheelbase) > 8) {
      checks.push({ level: 'warn', text: `Chainstay, head tube, fork and reach give a wheelbase of ${fd.wbCalc.toFixed(0)} mm, but the chart says ${bike.wheelbase} mm. Check the fork length and chainstay. The chart value is used in the drawings.` });
    }
    if (rail.check) checks.push(rail.check);
    if (exposed < 40) {
      checks.push({ level: 'bad', text: `Only about ${exposed.toFixed(0)} mm of seatpost would show${ctNote}. The saddle may not go this low on this frame.` });
    } else if (exposed > 280) {
      checks.push({ level: 'warn', text: `About ${exposed.toFixed(0)} mm of seatpost would show${ctNote}. Check post length and minimum insertion.` });
    }
    if (cockpit.best && cockpit.best.err > 5) {
      const b = cockpit.best;
      const bits = [];
      if (Math.abs(b.dx) >= 1) bits.push(`${Math.abs(b.dx).toFixed(0)} mm ${b.dx > 0 ? 'too far forward' : 'too close'}`);
      if (Math.abs(b.dy) >= 1) bits.push(`${Math.abs(b.dy).toFixed(0)} mm ${b.dy > 0 ? 'too high' : 'too low'}`);
      checks.push({ level: 'bad', text: `No stem and spacer combination reaches the hand position. The closest leaves it ${bits.join(' and ')}.` });
    }
    if (cockpit.steepest && cockpit.steepest.spacers < -2) {
      checks.push({ level: 'warn', text: `The front end is tall for this fit. Even a slammed ${cockpit.steepest.angle}° stem leaves the bar about ${Math.abs(cockpit.steepest.spacers).toFixed(0)} mm higher than wanted.` });
    }
    return { bike, geo, heightAlong, noseAhead, railMove, railPos, railOver, railTravel, postOffset, tipToRails, exposed, target, hand, reachH, handShift, barWidth: wBike, cockpit, checks, drawing: fd };
  }

  return { fitPoints, bodyPoints, frameGeometry, seatTubes, solveBike, solveCockpit, barFor, parseList, frameDrawing, steerer, rad, STEM_CLAMP, BAR_R, PLAIN_ANGLE, RAIL_TRAVEL, TIP_TO_RAILS };
})();
if (typeof module !== 'undefined') module.exports = GB;
