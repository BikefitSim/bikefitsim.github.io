// Checks for the calculation engine. Run: node test/engine.test.js
const assert = require('assert');
const GB = require('../src/engine.js');

const opts = { stemLengths: '60,70,80,90,100,110,120,130,140', stemAngles: '-17,-10,-6,6,10,17', spacerStep: 5, maxSpacers: 40 };
const ref = { sta: 73.5, hta: 72.5, htLength: 163, ett: 552, seatTube: 520, bbDrop: 72, forkA2C: 385, forkOffset: 50, stack: 580, reach: 380 };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} ±${tol}`);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };

test('stack and reach from the tubes', () => {
  const g = GB.frameGeometry(Object.assign({}, ref, { stack: null, reach: null }));
  near(g.stackCalc, 579.6, 0.1, 'stack');
  near(g.reachCalc, 380.3, 0.2, 'reach');
});

test('a known stem on the reference bike comes back from the fit numbers', () => {
  const rb = Object.assign({}, ref, GB.frameGeometry(ref));
  const B = GB.barFor(rb, -6, 110, 20).B;
  const hand = { x: B.x + 50, y: B.y + GB.STEM_H / 2 + GB.HAND_Y }; // the default hand position: 50 mm ahead of the top of the bar clamp, 4 mm below it
  const ys = 745 * Math.sin(GB.rad(73.5)); const xs = -65; const half = 200;
  const drop = ys - hand.y;
  const riderReach = Math.sqrt((hand.x - xs) ** 2 + drop ** 2 + half ** 2); // tape runs out to the side
  const fp = GB.fitPoints(ref, { saddleHeight: 745, setback: 65, riderReach, drop, barWidth: 400, spacers: 20, handX: 50, handY: -4 });
  near(fp.stem.length, 110, 1e-6, 'stem length');
  near(fp.stem.angle, -6, 1e-6, 'stem angle');
});

const fit = { saddleHeight: 745, setback: 65, riderReach: 654, drop: 58, barWidth: 400, spacers: 20, handX: 50, handY: -4 };

test('an identical target bike needs no changes', () => {
  const rb = Object.assign({}, ref, GB.frameGeometry(ref));
  const B = GB.barFor(rb, -6, 110, 20).B;
  const hand = { x: B.x + 50, y: B.y + GB.STEM_H / 2 + GB.HAND_Y }; // the default hand position: 50 mm ahead of the top of the bar clamp, 4 mm below it
  const ys = 745 * Math.sin(GB.rad(73.5));
  const f = Object.assign({}, fit, { drop: ys - hand.y, riderReach: Math.sqrt((hand.x + 65) ** 2 + (ys - hand.y) ** 2 + 200 ** 2) });
  const fp = GB.fitPoints(ref, f);
  const r = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, f, opts);
  near(r.heightAlong, 745, 1e-9, 'saddle height');
  near(r.railMove, 0, 1e-9, 'rail move');
  assert.deepStrictEqual([r.cockpit.best.angle, r.cockpit.best.length, r.cockpit.best.spacers], [-6, 110, 20]);
});

test('more setback, shorter stem', () => {
  let last = Infinity;
  for (const setback of [55, 65, 75, 85]) {
    const fp = GB.fitPoints(ref, Object.assign({}, fit, { setback }));
    const len = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, Object.assign({}, fit, { setback }), opts).cockpit.exactFor(-6).length;
    assert.ok(len < last, `stem should shorten as setback grows (${setback} mm gave ${len})`);
    last = len;
  }
});

test('a steeper seat tube reads a shorter saddle height and moves the saddle back on its rails', () => {
  const fp = GB.fitPoints(ref, fit);
  const steep = Object.assign({}, ref, { sta: 75, handX: 50, handY: -4 });
  const r = GB.solveBike(steep, fp, fit, opts);
  assert.ok(r.heightAlong < 745, 'saddle height along the tube should be shorter');
  assert.ok(r.railMove < 0, 'saddle should slide back');
  near(r.heightAlong * Math.sin(GB.rad(75)), fp.saddle.y, 1e-9, 'saddle top height unchanged');
});

test('a target bike keeps personal reach and drop, with the hand position and width of its own saved cockpit', () => {
  const fp = GB.fitPoints(ref, fit);
  const a = GB.solveBike(Object.assign({}, ref), fp, fit, opts);
  const sizes = GB.solveBike(Object.assign({}, ref, { hbReach: 90, hbDrop: 130, hbDiam: 35 }), fp, fit, opts);
  assert.deepStrictEqual(sizes.target, a.target, 'handlebar sizes alone change nothing');
  const own = GB.solveBike(Object.assign({}, ref, { handX: 120, handY: 40, barWidth: 440 }), fp, fit, opts);
  near(own.target.x, own.hand.x - 120, 1e-9, 'bar centre 120 mm behind the hands');
  near(own.target.y, own.hand.y - 40 - GB.STEM_H / 2, 1e-9, 'and 40 mm plus half the stem height below them');
  near(own.hand.y, fp.hand.y, 1e-9, 'the hands stay at the same drop');
  near(Math.hypot(own.hand.x - fp.saddle.x, fp.saddle.y - own.hand.y, 220), fp.riderReach, 1e-9, 'and the same personal reach with the wider hands');
  assert.ok(own.hand.x < fp.hand.x, 'so wider hands sit a little further back');
  assert.ok(own.checks.some((c) => c.level === 'warn' && c.text.includes('different hand widths (400 and 440 mm)')), 'and a note says so');
  assert.ok(!a.checks.some((c) => c.text.includes('hand width')), 'no note with the same hand width');
  const same = GB.solveBike(Object.assign({}, ref, { handX: 120, handY: 40, barWidth: fit.barWidth }), fp, fit, opts);
  assert.deepStrictEqual(same.hand, fp.hand, 'the same hand width: the hands stay where they are');
});

test('the stem fitted on the reference bike gives the same hand position as the tape', () => {
  const rb = Object.assign({}, ref, GB.frameGeometry(ref));
  const B = GB.barFor(rb, -6, 110, 20).B;
  const byStem = GB.fitPoints(ref, { saddleHeight: 745, setback: 65, handFrom: 'stem', stemLength: 110, stemAngle: -6, barWidth: 400, spacers: 20, handX: 50, handY: -4 });
  near(byStem.hand.x, B.x + 50, 1e-9, 'hand x');
  near(byStem.hand.y, B.y + GB.STEM_H / 2 + GB.HAND_Y, 1e-9, 'hand y');
  const byTape = GB.fitPoints(ref, { saddleHeight: 745, setback: 65, riderReach: byStem.riderReach, drop: byStem.drop, barWidth: 400, spacers: 20, handX: 50, handY: -4 });
  near(byTape.hand.x, byStem.hand.x, 1e-9, 'same hand x');
  near(byTape.stem.length, 110, 1e-9, 'stem length back');
});

test('a fit reference taken from a bike reference puts saddle and hands in the same place', () => {
  const bikeRef = Object.assign({ kind: 'bike' }, ref);
  const byStem = GB.fitPoints(bikeRef, { saddleHeight: 745, setback: 65, handFrom: 'stem', stemLength: 110, stemAngle: -6, barWidth: 400, spacers: 20, handX: 50, handY: -4 });
  const body = { saddleLine: Math.hypot(byStem.saddle.x, byStem.saddle.y), setback: 65, riderReach: byStem.riderReach, drop: byStem.drop, barWidth: 400 };
  near(body.saddleLine, 717.3, 0.1, 'straight line to the tip reads less than along the seat tube');
  const fp = GB.fitPoints({ kind: 'fit' }, body);
  near(fp.saddle.y, byStem.saddle.y, 1e-9, 'saddle y');
  near(fp.hand.x, byStem.hand.x, 1e-9, 'hand x');
  near(fp.hand.y, byStem.hand.y, 1e-9, 'hand y');
  const target = Object.assign({}, ref, { sta: 74.5, hta: 73, handX: 45, handY: -4 });
  const a = GB.solveBike(target, byStem, { barWidth: 400 }, opts);
  const b = GB.solveBike(target, fp, body, opts);
  near(b.heightAlong, a.heightAlong, 1e-9, 'saddle height');
  assert.deepStrictEqual([b.cockpit.best.angle, b.cockpit.best.length, b.cockpit.best.spacers], [a.cockpit.best.angle, a.cockpit.best.length, a.cockpit.best.spacers]);
});

test('a fit reference with more setback than saddle height is refused', () => {
  const fp = GB.fitPoints({ kind: 'fit' }, { saddleLine: 60, setback: 65, riderReach: 650, drop: 60, barWidth: 400 });
  assert.strictEqual(fp.ok, false);
});

test('the actual top tube gives the same reach as the effective one', () => {
  // an actual top tube for the reference frame: seat tube c-c 500 mm to 18 mm below the head tube top
  const S = GB.rad(ref.sta); const H = GB.rad(ref.hta);
  const P = { x: -500 * Math.cos(S), y: 500 * Math.sin(S) };
  const J = { x: 380 + 18 * Math.cos(H), y: 580 - 18 * Math.sin(H) };
  const att = Math.hypot(J.x - P.x, J.y - P.y);
  const b = Object.assign({}, ref, { ett: null, att, seatTube: null, seatTubeCC: 500, reach: null });
  const g = GB.frameGeometry(b);
  near(g.reach, 380, 1e-9, 'reach');
  assert.strictEqual(g.reachFrom, 'att');
  assert.strictEqual(g.ccEst, false);
  const est = GB.frameGeometry(Object.assign({}, b, { seatTube: 520, seatTubeCC: null }));
  near(est.reach, 380, 1e-9, 'reach with the c-c taken as c-t minus 20');
  assert.strictEqual(est.ccEst, true);
  const fp = GB.fitPoints(ref, fit);
  const both = GB.solveBike(Object.assign({}, ref, { reach: null, att: att + 30, seatTubeCC: 500, handX: 50, handY: -4 }), fp, fit, opts);
  assert.ok(both.checks.some((c) => /effective top tube gives a reach/.test(c.text)), 'top tubes that disagree are flagged');
});

test('a seat tube c-c alone is enough', () => {
  const fp = GB.fitPoints(ref, fit);
  const a = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, fit, opts);
  const b = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4, seatTube: null, seatTubeCC: 500 }), fp, fit, opts);
  near(b.exposed, a.exposed, 1e-9, 'seatpost showing');
  near(b.drawing.stTop.y, a.drawing.stTop.y, 1e-9, 'seat tube top');
  assert.ok(b.drawing.ttRear.y < b.drawing.stTop.y, 'top tube meets the seat tube below its top');
  assert.strictEqual(a.drawing.ttRear, a.drawing.stTop, 'without a c-c the top tube is drawn to the seat tube top as before');
});

test('a saddle setback no seatpost can reach is flagged', () => {
  const fp = GB.bodyPoints({ saddleLine: 760, setback: 200, riderReach: 600, drop: 60, barWidth: 0 });
  const r = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, { barWidth: 0 }, opts);
  assert.ok(r.railPos < -r.railHalf, 'saddle should be past the back of its rails');
  assert.ok(r.checks.some((c) => c.level === 'bad' && c.text.includes("can't be reached")), 'should say it cannot be reached');
});

test('an ordinary personal fit sits within the rails', () => {
  const fp = GB.bodyPoints({ saddleLine: 720, setback: 70, riderReach: 600, drop: 60, barWidth: 0 });
  const r = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, { barWidth: 0 }, opts);
  assert.ok(Math.abs(r.railPos) <= r.railHalf, `rail position ${r.railPos}`);
  assert.ok(!r.checks.some((c) => c.level === 'bad'), 'no bad checks');
});

// the rail check a target bike with this frame and saddle gets
const railOf = (b, f, posts) => GB.railFit(GB.fitPoints(b, f).noseAhead, GB.rad(b.sta), f, 'this frame', posts);

test('a target bike can carry its own saddle', () => {
  const fp = GB.fitPoints(ref, fit);
  const same = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, fit, opts);
  assert.ok(same.sameSaddle, 'empty saddle fields mean the reference saddle');
  near(same.tipToRails, fp.rail.tipToRails, 1e-9, 'tip to rails from the reference');
  const own = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4, tipToRails: fp.rail.tipToRails + 10, railTravel: 40 }), fp, fit, opts);
  assert.ok(!own.sameSaddle, 'another saddle');
  near(own.tipToRails, fp.rail.tipToRails + 10, 1e-9, 'its own tip to rails');
  near(own.railTravel, 40, 1e-9, 'its own rail length');
  // same length, so the tip stays put and the rail centre sits 10 mm further back from it: saddle 10 mm further back on its rails
  near(own.postOffset, same.postOffset, 1e-9, 'same post');
  near(own.railPos - same.railPos, -10, 1e-9, 'rail position from the middle of the rails');
  near(own.setback, same.setback, 1e-9, 'same setback');
  const short = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4, tipToRails: fp.rail.tipToRails + 60, railTravel: 30 }), fp, fit, opts);
  assert.ok(short.checks.some((c) => c.level === 'bad' && c.text.includes('30 mm rails allow with a 35 mm seatpost clamp')), 'its own rails are checked');
});

test('a saddle 30 mm shorter gets 30 mm more setback, the hands staying put', () => {
  const rf = Object.assign({}, fit, { saddleLen: 275, tipToRails: 160, railTravel: 70 });
  const fp = GB.fitPoints(ref, Object.assign({}, rf, { handFrom: 'stem', stemLength: 110, stemAngle: -6 }));
  const same = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, rf, opts);
  const b = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4, saddleLen: 245, tipToRails: 130 }), fp, rf, opts);
  near(b.setback, 65 + 30, 1e-9, 'setback');
  near(b.tipShift, -30, 1e-9, 'tip shift');
  near(b.saddle.y, fp.saddle.y, 1e-9, 'saddle top at the same height');
  near(b.hand.x, same.hand.x, 1e-9, 'hands stay put');
  near(b.railPos - same.railPos, 0, 1e-9, 'rail centre 30 mm nearer the tip: same place on the rails');
  assert.ok(b.checks.some((c) => c.level === 'warn' && c.text.includes('personal reach')), 'warns that personal reach reads differently');
  assert.ok(!same.checks.some((c) => c.text.includes('saddle is')), 'no warning with the same saddle');
});

test('the seatpost clamp has to fit inside the rail markings', () => {
  // 70 mm rails and a 30 mm clamp: the clamp centre stays within 20 mm of their middle, so the tip is 140 to 180 mm ahead of it
  const saddle = { tipToRails: 160, railTravel: 70, clampLen: 30 };
  const ok = railOf(ref, Object.assign({}, fit, saddle, { saddleHeight: 700, setback: 15, handFrom: 'stem', stemLength: 110, stemAngle: -6 }));
  near(ok.railHalf, 20, 1e-9, 'clamp centre travel each way');
  assert.ok(!ok.check, `15 mm setback at 700 mm should fit (rail position ${ok.railPos})`);
  const no = railOf(ref, Object.assign({}, fit, saddle, { saddleHeight: 760, setback: 15, handFrom: 'stem', stemLength: 110, stemAngle: -6 }));
  assert.ok(no.check && no.tipClamp > 180, `15 mm setback at 760 mm needs the tip ${no.tipClamp} mm ahead of the clamp`);
});

test('the app picks the post that keeps the saddle nearest the middle of its rails', () => {
  const fp = GB.fitPoints(ref, fit); // tip about 154 mm ahead of a 20 mm post's clamp
  assert.strictEqual(GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, fit, opts).postOffset, 20);
  const back = GB.fitPoints(ref, Object.assign({}, fit, { setback: 45, riderReach: 624 })); // tip 20 mm further forward, hands where the 140 mm stem reaches
  const r = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), back, fit, opts);
  assert.strictEqual(r.postOffset, 0, 'an inline post for a forward saddle');
  assert.ok(!r.checks.some((c) => c.level === 'bad'), 'fits');
});

test('a bike fit with a setback neither seatpost carries is flagged, and so is every target', () => {
  const f = Object.assign({}, fit, { setback: 200, handFrom: 'stem', stemLength: 110, stemAngle: -6 });
  const fp = GB.fitPoints(ref, f);
  assert.ok(fp.rail.check && fp.rail.check.level === 'bad' && fp.rail.check.over > 5, 'reference flagged');
  assert.ok([0, 20].includes(fp.rail.postOffset), 'reference on an inline or 20 mm post');
  const r = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, f, opts);
  assert.ok(r.checks.some((c) => c.level === 'bad' && c.text.includes("can't be reached")), 'target flagged too');
  assert.strictEqual(r.railMove, null, 'no rail move against a reference off its rails');
});

test('a chainstay places the rear axle; without one the drawing keeps its default', () => {
  const plain = GB.frameDrawing(Object.assign({}, ref));
  assert.strictEqual(plain.csKnown, false);
  near(Math.hypot(plain.rear.x, plain.rear.y), 410, 1e-9, 'default chainstay');
  const d = GB.frameDrawing(Object.assign({}, ref, { chainstay: 420 }));
  assert.strictEqual(d.csKnown, true);
  near(Math.hypot(d.rear.x, d.rear.y), 420, 1e-9, 'chainstay');
  near(d.rear.y, ref.bbDrop, 1e-9, 'axle BB drop above the BB');
});

test('the front axle sits level with the rear one, even when the chart stack disagrees with the tubes', () => {
  // a chart where fork and head tube give 4 mm less stack than the chart (size 1 of a real chart)
  const b = { sta: 74.5, hta: 72.5, htLength: 115, ett: 535, seatTube: 490, bbDrop: 45, forkA2C: 370, forkOffset: 45, chainstay: 401, stack: 498, reach: 396 };
  const d = GB.frameDrawing(b);
  near(d.front.y, 45, 1e-9, 'front axle height');
  near(d.front.x - d.rear.x, 984.5, 0.1, 'wheelbase (chart says 985)');
  // stack from the tubes: the fork length is used as it is
  const t = Object.assign({}, ref, GB.frameGeometry(Object.assign({}, ref, { stack: null, reach: null })));
  const dt = GB.frameDrawing(t);
  const foot = { x: dt.front.x - 50 * Math.sin(GB.rad(72.5)), y: dt.front.y - 50 * Math.cos(GB.rad(72.5)) };
  near(Math.hypot(foot.x - dt.T.x, foot.y - dt.T.y), 163 + 385, 1e-6, 'head tube plus fork down the axis');
  near(dt.trail, (341 * Math.cos(GB.rad(72.5)) - 50) / Math.sin(GB.rad(72.5)), 1e-6, 'trail, 30 mm tyre');
});

test('a chart wheelbase places the front axle exactly, and a far-off one is flagged', () => {
  // size S of a real chart: its own numbers give 963.7 mm, the chart says 963
  const b = { sta: 75, hta: 73.5, htLength: 125, ett: 535, seatTube: 535, bbDrop: 57, forkA2C: 370, forkOffset: 40, chainstay: 393, stack: 520, reach: 396 };
  near(GB.frameDrawing(b).front.x - GB.frameDrawing(b).rear.x, 963.7, 0.05, 'from the frame');
  const d = GB.frameDrawing(Object.assign({}, b, { wheelbase: 963 }));
  near(d.front.x - d.rear.x, 963, 1e-9, 'from the chart');
  near(d.front.y, 57, 1e-9, 'front axle level');
  const noCs = GB.frameDrawing(Object.assign({}, b, { chainstay: null, wheelbase: 963 }));
  assert.strictEqual(noCs.wbKnown, false, 'wheelbase needs the chainstay');
  const fp = GB.fitPoints(ref, fit);
  const far = GB.solveBike(Object.assign({}, b, { wheelbase: 990, handX: 50, handY: -4 }), fp, fit, opts);
  assert.ok(far.checks.some((c) => c.level === 'warn' && c.text.includes('wheelbase')), 'flagged');
  const close = GB.solveBike(Object.assign({}, b, { wheelbase: 963, handX: 50, handY: -4 }), fp, fit, opts);
  assert.ok(!close.checks.some((c) => c.text.includes('wheelbase')), 'not flagged');
});

test('the first stem option is the closest one, and the list runs from closest to furthest', () => {
  for (const [bike, setback] of [[ref, 65], [Object.assign({}, ref, { sta: 75, hta: 73 }), 85], [Object.assign({}, ref, { stack: 600, reach: 370 }), 50]]) {
    const f = Object.assign({}, fit, { setback });
    const c = GB.solveBike(Object.assign({}, bike, { handX: 50, handY: -4 }), GB.fitPoints(ref, f), f, opts).cockpit;
    const tenths = (o) => Math.round(o.err * 10);
    assert.strictEqual(c.best, c.options[0], 'best is first');
    assert.ok(c.all.every((o) => tenths(o) >= tenths(c.best)), 'nothing closer than the best');
    c.options.forEach((o, i) => i && assert.ok(tenths(o) >= tenths(c.options[i - 1]), 'sorted by miss'));
  }
});

test('the tyre width sets the wheel size, and with it BB height and trail', () => {
  const b = { sta: 74.5, hta: 72.5, htLength: 115, ett: 535, seatTube: 490, bbDrop: 70, forkA2C: 370, forkOffset: 45, chainstay: 405, stack: 498, reach: 396 };
  const plain = GB.frameDrawing(b);
  near(plain.wheelR, 311 + 30, 1e-9, 'default tyre');
  const t25 = GB.frameDrawing(Object.assign({}, b, { tyre: 25 }));
  const t32 = GB.frameDrawing(Object.assign({}, b, { tyre: 32 }));
  near(-t25.groundY, 311 + 25 - 70, 1e-9, 'BB height with 25 mm tyres');
  near(-t32.groundY, 311 + 32 - 70, 1e-9, 'BB height with 32 mm tyres');
  assert.ok(t32.trail > t25.trail, 'a bigger wheel has more trail');
  near(t32.front.x - t32.rear.x, t25.front.x - t25.rear.x, 1e-9, 'wheelbase unchanged');
});

test('the hands sit where Hand X and Hand Y put them from the top centre of the stem\'s bar clamp', () => {
  assert.deepStrictEqual(GB.handOff({}), { x: 50, y: -4 }, 'empty: on top of an 80 mm reach bar, just before the drop');
  assert.deepStrictEqual(GB.handOff({ handX: 0, handY: 0 }), { x: 0, y: 0 }, '0 is a value, not empty');
  assert.deepStrictEqual(GB.handOff({ handX: -20, handY: -110 }), { x: -20, y: -110 }, 'behind and below the clamp');
  // a bikefit's hands: its stem, half its stem height up to the top of the bar clamp, then the hand position
  const byStem = GB.fitPoints(ref, Object.assign({}, fit, { handFrom: 'stem', stemLength: 110, stemAngle: -6, handX: 120, handY: 40, stemH: 45 }));
  const B = GB.barFor(Object.assign({}, ref, GB.frameGeometry(ref), { stemH: 45 }), -6, 110, 20).B;
  near(byStem.hand.x - B.x, 120, 1e-9, 'hand x'); near(byStem.hand.y - B.y, 22.5 + 40, 1e-9, 'hand y');
  const B40 = GB.barFor(Object.assign({}, ref, GB.frameGeometry(ref)), -6, 110, 20).B;
  near(Math.hypot(B.x - B40.x, B.y - B40.y), 2.5, 1e-9, 'a 5 mm taller stem clamps the steerer 2.5 mm higher');
  // the target's bar centre sits Hand X, Hand Y and half its own stem height from the hands
  const fp = GB.fitPoints(ref, fit);
  const a = GB.solveBike(Object.assign({}, ref), fp, fit, opts);
  near(a.target.x, fp.hand.x - 50, 1e-9, 'bar centre 50 mm behind the hands');
  near(a.target.y, fp.hand.y - 16, 1e-9, 'and 16 mm below them with a 40 mm stem');
  const tall = GB.solveBike(Object.assign({}, ref, { stemH: 50 }), fp, fit, opts);
  near(a.target.y - tall.target.y, 5, 1e-9, 'a 10 mm taller stem: bar centre 5 mm lower');
});

test('stem options never use fewer spacers than the minimum; empty means 0', () => {
  const fp = GB.fitPoints(ref, fit);
  const bike = Object.assign({}, ref, { handX: 50, handY: -4 });
  const none = GB.solveBike(bike, fp, fit, opts).cockpit;
  assert.ok(none.all.some((o) => o.spacers < 15), 'some options under 15 mm without a minimum');
  assert.strictEqual(none.minSpacers, 0);
  for (const minSpacers of [15, 12.5]) {
    const c = GB.solveBike(bike, fp, fit, Object.assign({}, opts, { minSpacers })).cockpit;
    assert.ok(c.all.every((o) => o.spacers >= minSpacers && o.spacers <= 40), `all between ${minSpacers} and 40 mm`);
  }
  const empty = GB.solveBike(bike, fp, fit, Object.assign({}, opts, { minSpacers: null })).cockpit;
  assert.deepStrictEqual(empty.all.map((o) => o.spacers), none.all.map((o) => o.spacers), 'empty is the same as 0');
  // a tall front end is judged against the minimum, not a slammed stem
  const tall = Object.assign({}, ref, { stack: 640, handX: 50, handY: -4 });
  const t = GB.solveBike(tall, fp, fit, Object.assign({}, opts, { minSpacers: 20 }));
  assert.ok(t.checks.some((ch) => ch.text.includes('minimum 20 mm of spacers')), 'tall front end flagged with the minimum');
});

test('fork length from the chart stack when it is empty', () => {
  near(GB.forkFromStack(ref), 385.4, 0.1, 'fork from stack');
  const noFork = Object.assign({}, ref, { forkA2C: null });
  assert.strictEqual(GB.forkLength(ref), 385, 'an entered fork length is kept');
  near(GB.forkLength(noFork), 385.4, 0.1, 'empty fork length is worked out');
  assert.strictEqual(GB.forkFromStack(Object.assign({}, ref, { stack: null })), null, 'no stack, no fork length');
  // the bike solves without a fork length, the same as with one
  const fp = GB.fitPoints(ref, fit);
  const a = GB.solveBike(Object.assign({}, ref, { handX: 50, handY: -4 }), fp, fit, opts);
  const b = GB.solveBike(Object.assign({}, noFork, { handX: 50, handY: -4 }), fp, fit, opts);
  near(b.cockpit.best.err, a.cockpit.best.err, 1e-9, 'same stem miss');
  assert.ok(!b.checks.some((ch) => ch.text.includes('Check the fork length')), 'no fork warning without a fork length');
});

test('rail height moves the clamp down the seat tube', () => {
  // 745 mm saddle height on 73.5 degrees, tip 20 mm behind the BB, 155 mm tip to rail centre, 70 mm rails, 35 mm clamp
  const r735 = Object.assign({}, ref, { sta: 73.5 });
  const f = Object.assign({}, fit, { handFrom: 'stem', saddleHeight: 745, setback: 20, stemLength: 110, stemAngle: -6, tipToRails: 155, railTravel: 70, clampLen: 35 });
  near(GB.fitPoints(r735, f).rail.railH, 40, 1e-9, 'default rail height');
  const low = railOf(r735, Object.assign({}, f, { railH: 45 }));
  near(low.tipClamp, 178.3, 0.1, 'tip ahead of the clamp with 45 mm');
  assert.ok(low.check, 'flagged with 45 mm');
  const tall = railOf(r735, Object.assign({}, f, { railH: 56 }));
  near(tall.tipClamp, 175.0, 0.1, 'tip ahead of the clamp with 56 mm');
  assert.strictEqual(low.check.level, 'bad', 'about 6 mm past the markings is an error');
  assert.strictEqual(tall.check.level, 'warn', 'about 2.5 mm past the markings is a warning');
  assert.ok(/overlaps the back end of the 70 mm rail markings by about [23] mm/.test(tall.check.text), tall.check.text);
  near(low.tipClamp - tall.tipClamp, 11 / Math.tan(GB.rad(73.5)), 1e-9, 'each mm of rail height moves the clamp 1/tan(seat angle) forward');
  // a target bike takes its own rail height, else the reference's
  const fp = GB.fitPoints(r735, Object.assign({}, f, { railH: 56 }));
  const same = GB.solveBike(Object.assign({}, r735, { handX: 50, handY: -4 }), fp, Object.assign({}, f, { railH: 56 }), opts);
  near(same.railH, 56, 1e-9, 'target uses the reference rail height');
  const own = GB.solveBike(Object.assign({}, r735, { handX: 50, handY: -4, railH: 45 }), fp, Object.assign({}, f, { railH: 56 }), opts);
  near(own.railPos - same.railPos, 11 / Math.tan(GB.rad(73.5)), 1e-9, 'own rail height');
});

test('the rail check tries each seatpost it is given', () => {
  const r735 = Object.assign({}, ref, { sta: 73.5 });
  const f = Object.assign({}, fit, { handFrom: 'stem', saddleHeight: 745, setback: 20, stemLength: 110, stemAngle: -6, tipToRails: 155, railTravel: 70, clampLen: 35, railH: 45 });
  const dflt = railOf(r735, f);
  const same = railOf(r735, f, [0, 20]);
  assert.strictEqual(dflt.postOffset, same.postOffset, 'by default inline and 20 mm');
  near(dflt.railPos, same.railPos, 1e-9, 'same rail position');
  // the saddle sits forward on an inline post here, so any setback post only makes it worse
  const only = railOf(r735, f, [25]);
  assert.strictEqual(only.postOffset, 25, 'a single post is used');
  near(only.railPos - same.railPos, 25 / Math.sin(GB.rad(73.5)), 1e-9, 'a 25 mm post moves the clamp back by 25 / sin(seat angle)');
  // both posts are tried and reported
  assert.deepStrictEqual(dflt.tries.map((t) => t.postOffset).sort((a, b) => a - b), [0, 20], 'inline and 20 mm tried');
  // a target bike tries inline and 20 mm
  const fp = GB.fitPoints(r735, Object.assign({}, f, { setback: 70 }));
  const b = GB.solveBike(Object.assign({}, r735, { handX: 50, handY: -4 }), fp, Object.assign({}, f, { setback: 70 }), opts);
  assert.ok([0, 20].includes(b.postOffset), 'inline or 20 mm');
});

console.log(`\n${passed} checks passed`);
