/* Geobike calculation engine.
   Grid: BB centre at (0, 0), X forward, Y up. Lengths in mm, angles in degrees. */
const GB = (() => {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const STEM_CLAMP = 40;  // stem height on the steerer; its centre sits 20 mm above the spacers
  const BAR_R = 15.9;     // 31.8 mm bar
  const RAIL_H = 45;      // saddle top to rails, for the seatpost check only
  const WHEEL_R = 340;    // drawing only
  const CHAINSTAY = 410;  // drawing only
  const ANGLE_COST = 0.15; // mm of miss traded per degree away from the reference stem angle

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

  /* Stack and reach: from the chart when given, otherwise from head tube, fork and BB drop. */
  function frameGeometry(b) {
    const H = rad(b.hta);
    const S = rad(b.sta);
    const tubesOk = [b.htLength, b.forkA2C, b.forkOffset, b.bbDrop].every(fin);
    const stackCalc = tubesOk ? b.bbDrop + (b.forkA2C + b.htLength) * Math.sin(H) - b.forkOffset * Math.cos(H) : null;
    const hasStack = fin(b.stack) && b.stack > 0;
    const hasReach = fin(b.reach) && b.reach > 0;
    const stack = hasStack ? b.stack : stackCalc;
    const reachCalc = fin(b.ett) && b.ett > 0 && stack != null ? b.ett - stack / Math.tan(S) : null;
    const reach = hasReach ? b.reach : reachCalc;
    return { stack, reach, stackCalc, reachCalc, stackSrc: hasStack ? 'chart' : 'tubes', reachSrc: hasReach ? 'chart' : 'tubes' };
  }

  /* Bar centre for a stem on a bike that carries resolved stack and reach. */
  function barFor(bike, angle, length, spacers) {
    const { d } = steerer(bike.hta);
    const k = spacers + STEM_CLAMP / 2;
    const th = rad(90 - bike.hta + angle);
    const Q = { x: bike.reach + k * d.x, y: bike.stack + k * d.y };
    return { Q, B: { x: Q.x + length * Math.cos(th), y: Q.y + length * Math.sin(th) } };
  }

  /* Fit on the reference bike: saddle tip, hand position, and the stem the numbers imply. */
  function fitPoints(ref, fit) {
    const geo = frameGeometry(ref);
    const S = rad(ref.sta);
    const ys = fit.saddleHeight * Math.sin(S);
    const xs = -fit.setback;
    // The tape from the saddle tip to the hand runs out to the side of the bar, so take away
    // the sideways part (half the bar width) and the drop to get the side-view distance.
    const half = fin(fit.barWidth) ? fit.barWidth / 2 : 0;
    const sq = fit.riderReach ** 2 - fit.drop ** 2 - half ** 2;
    if (sq <= 0) return { ok: false, error: 'Rider reach is too short for this drop and handlebar width. Check the three numbers.' };
    const reachH = Math.sqrt(sq);
    const hand = { x: xs + reachH, y: ys - fit.drop }; // at the bar's reach point, level with the top of the bar
    const bike = Object.assign({}, ref, { stack: geo.stack, reach: geo.reach });
    const B = { x: hand.x - fit.barReach, y: hand.y - BAR_R };
    const { d } = steerer(ref.hta);
    const k = fit.spacers + STEM_CLAMP / 2;
    const Q = { x: bike.reach + k * d.x, y: bike.stack + k * d.y };
    const vx = B.x - Q.x;
    const vy = B.y - Q.y;
    const stem = { length: Math.hypot(vx, vy), angle: deg(Math.atan2(vy, vx)) - (90 - ref.hta), Q, B };
    return {
      ok: true,
      bike, geo, stem, reachH, half,
      saddle: { x: xs, y: ys },
      hand,
      noseAhead: xs + ys / Math.tan(S), // saddle tip ahead of the seat-tube line at saddle height
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
    // Rank by miss distance, with a small cost for moving away from the reference stem angle
    // (0.15 mm per degree), so the angle only changes when another one is clearly closer.
    for (const c of bestPerStem.values()) c.score = c.err + ANGLE_COST * Math.abs(c.angle - prefAngle);
    const ranked = [...bestPerStem.values()].sort((p, q) => {
      const sp = Math.round(p.score * 2) / 2;
      const sq = Math.round(q.score * 2) / 2;
      if (sp !== sq) return sp - sq;
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
      options: ranked.slice(0, 6),
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
    const csH = Math.sqrt(CHAINSTAY ** 2 - bike.bbDrop ** 2);
    const rear = { x: -csH, y: bike.bbDrop };
    const along = (t) => ({ x: T.x + t * d.x, y: T.y + t * d.y });
    const htBottom = along(-bike.htLength);
    const axisFoot = along(-(bike.htLength + bike.forkA2C));
    const front = { x: axisFoot.x + bike.forkOffset * n.x, y: axisFoot.y + bike.forkOffset * n.y };
    const stTop = { x: -bike.seatTube * Math.cos(S), y: bike.seatTube * Math.sin(S) };
    const ssJoin = { x: -(bike.seatTube - 25) * Math.cos(S), y: (bike.seatTube - 25) * Math.sin(S) };
    return { T, rear, front, htBottom, crown: htBottom, stTop, ssJoin, wheelR: WHEEL_R, groundY: bike.bbDrop - WHEEL_R };
  }

  /* One target bike: what to change so saddle tip and hand position match the reference. */
  function solveBike(bikeIn, fp, fit, opts) {
    const geo = frameGeometry(bikeIn);
    const bike = Object.assign({}, bikeIn, { stack: geo.stack, reach: geo.reach });
    const S = rad(bike.sta);
    const { y, x } = fp.saddle;
    // Rider reach is the tape length to keep. A different bar width on this bike changes how
    // much of that tape runs sideways, so the hands move forward or back in side view.
    const wRef = fin(fit.barWidth) ? fit.barWidth : 0;
    const wBike = fin(bikeIn.barWidth) && bikeIn.barWidth > 0 ? bikeIn.barWidth : wRef;
    let hand = fp.hand;
    let reachH = fp.reachH;
    if (wRef > 0 && wBike !== wRef) {
      const sq = fit.riderReach ** 2 - fit.drop ** 2 - (wBike / 2) ** 2;
      if (sq > 0) { reachH = Math.sqrt(sq); hand = { x: x + reachH, y: fp.hand.y }; }
    }
    const handShift = hand.x - fp.hand.x;
    const heightAlong = y / Math.sin(S);
    const noseAhead = x + y / Math.tan(S);
    const railMove = noseAhead - fp.noseAhead; // + = saddle further forward on its rails than on the reference
    const exposed = (y - RAIL_H) / Math.sin(S) - bike.seatTube;
    const target = { x: hand.x - bike.barReach, y: hand.y - BAR_R };
    const cockpit = solveCockpit(bike, opts, target, fp.stem.angle);
    const checks = [];

    if (geo.stackSrc === 'chart' && geo.stackCalc != null && Math.abs(geo.stackCalc - geo.stack) > 8) {
      checks.push({ level: 'warn', text: `Head tube, fork and BB drop give a stack of ${geo.stackCalc.toFixed(0)} mm, but the chart says ${geo.stack} mm. Check the fork length. The chart value is used.` });
    }
    if (geo.reachSrc === 'chart' && geo.reachCalc != null && Math.abs(geo.reachCalc - geo.reach) > 8) {
      checks.push({ level: 'warn', text: `Top tube and seat angle give a reach of ${geo.reachCalc.toFixed(0)} mm, but the chart says ${geo.reach} mm. The chart value is used.` });
    }
    if (Math.abs(handShift) >= 0.5) {
      checks.push({ level: 'info', text: `The bar is ${Math.abs(wBike - wRef).toFixed(0)} mm ${wBike > wRef ? 'wider' : 'narrower'} than on the reference. With the arms angled ${wBike > wRef ? 'further out' : 'less'}, the same rider reach puts the hands ${Math.abs(handShift).toFixed(1)} mm ${handShift < 0 ? 'further back' : 'further forward'}.` });
    }
    if (wRef === 0 && fin(bikeIn.barWidth) && bikeIn.barWidth > 0) {
      checks.push({ level: 'warn', text: 'Enter the reference bike\'s handlebar width in step 1, so this bar width can be compared with it.' });
    }
    if (Math.abs(railMove) > 15) {
      checks.push({ level: 'warn', text: `Moving the saddle ${Math.abs(railMove).toFixed(0)} mm on its rails is more than most saddles allow. Use a seatpost with about ${Math.abs(railMove).toFixed(0)} mm ${railMove > 0 ? 'less' : 'more'} offset than the reference bike's.` });
    }
    if (exposed < 40) {
      checks.push({ level: 'bad', text: `Only about ${exposed.toFixed(0)} mm of seatpost would show. The saddle may not go this low on this frame.` });
    } else if (exposed > 280) {
      checks.push({ level: 'warn', text: `About ${exposed.toFixed(0)} mm of seatpost would show. Check post length and minimum insertion.` });
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
    return { bike, geo, heightAlong, noseAhead, railMove, exposed, target, hand, reachH, handShift, barWidth: wBike, cockpit, checks, drawing: frameDrawing(bike) };
  }

  return { fitPoints, frameGeometry, solveBike, solveCockpit, barFor, parseList, frameDrawing, steerer, rad, STEM_CLAMP, BAR_R };
})();
if (typeof module !== 'undefined') module.exports = GB;
