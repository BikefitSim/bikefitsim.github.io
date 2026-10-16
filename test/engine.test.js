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
  const hand = { x: B.x + 80, y: B.y + GB.BAR_R };
  const ys = 745 * Math.sin(GB.rad(73.5)); const xs = -65; const half = 200;
  const drop = ys - hand.y;
  const riderReach = Math.sqrt((hand.x - xs) ** 2 + drop ** 2 + half ** 2); // tape runs out to the side
  const fp = GB.fitPoints(ref, { saddleHeight: 745, setback: 65, riderReach, drop, barWidth: 400, spacers: 20, barReach: 80 });
  near(fp.stem.length, 110, 1e-6, 'stem length');
  near(fp.stem.angle, -6, 1e-6, 'stem angle');
});

const fit = { saddleHeight: 745, setback: 65, riderReach: 654, drop: 58, barWidth: 400, spacers: 20, barReach: 80 };

test('an identical target bike needs no changes', () => {
  const rb = Object.assign({}, ref, GB.frameGeometry(ref));
  const B = GB.barFor(rb, -6, 110, 20).B;
  const hand = { x: B.x + 80, y: B.y + GB.BAR_R };
  const ys = 745 * Math.sin(GB.rad(73.5));
  const f = Object.assign({}, fit, { drop: ys - hand.y, riderReach: Math.sqrt((hand.x + 65) ** 2 + (ys - hand.y) ** 2 + 200 ** 2) });
  const fp = GB.fitPoints(ref, f);
  const r = GB.solveBike(Object.assign({}, ref, { barReach: 80 }), fp, f, opts);
  near(r.heightAlong, 745, 1e-9, 'saddle height');
  near(r.railMove, 0, 1e-9, 'rail move');
  assert.deepStrictEqual([r.cockpit.best.angle, r.cockpit.best.length, r.cockpit.best.spacers], [-6, 110, 20]);
});

test('more setback, shorter stem', () => {
  let last = Infinity;
  for (const setback of [55, 65, 75, 85]) {
    const fp = GB.fitPoints(ref, Object.assign({}, fit, { setback }));
    const len = GB.solveBike(Object.assign({}, ref, { barReach: 80 }), fp, Object.assign({}, fit, { setback }), opts).cockpit.exactFor(-6).length;
    assert.ok(len < last, `stem should shorten as setback grows (${setback} mm gave ${len})`);
    last = len;
  }
});

test('a steeper seat tube reads a shorter saddle height and moves the saddle back on its rails', () => {
  const fp = GB.fitPoints(ref, fit);
  const steep = Object.assign({}, ref, { sta: 75, barReach: 80 });
  const r = GB.solveBike(steep, fp, fit, opts);
  assert.ok(r.heightAlong < 745, 'saddle height along the tube should be shorter');
  assert.ok(r.railMove < 0, 'saddle should slide back');
  near(r.heightAlong * Math.sin(GB.rad(75)), fp.saddle.y, 1e-9, 'saddle top height unchanged');
});

test('a wider bar on the target bike puts the hands further back', () => {
  const fp = GB.fitPoints(ref, fit);
  const shift = (w) => GB.solveBike(Object.assign({}, ref, { barReach: 80, barWidth: w }), fp, fit, opts).handShift;
  near(shift(400), 0, 1e-9, 'same width');
  near(shift(440), -6.8, 0.1, '440 bar');
  assert.ok(shift(480) < shift(440), 'wider still, further back');
});

test('the stem fitted on the reference bike gives the same hand position as the tape', () => {
  const rb = Object.assign({}, ref, GB.frameGeometry(ref));
  const B = GB.barFor(rb, -6, 110, 20).B;
  const byStem = GB.fitPoints(ref, { saddleHeight: 745, setback: 65, handFrom: 'stem', stemLength: 110, stemAngle: -6, barWidth: 400, spacers: 20, barReach: 80 });
  near(byStem.hand.x, B.x + 80, 1e-9, 'hand x');
  near(byStem.hand.y, B.y + GB.BAR_R, 1e-9, 'hand y');
  const byTape = GB.fitPoints(ref, { saddleHeight: 745, setback: 65, riderReach: byStem.riderReach, drop: byStem.drop, barWidth: 400, spacers: 20, barReach: 80 });
  near(byTape.hand.x, byStem.hand.x, 1e-9, 'same hand x');
  near(byTape.stem.length, 110, 1e-9, 'stem length back');
  const r = GB.solveBike(Object.assign({}, ref, { barReach: 80, barWidth: 440 }), byStem, { barWidth: 400 }, opts);
  near(r.handShift, GB.solveBike(Object.assign({}, ref, { barReach: 80, barWidth: 440 }), byTape, { barWidth: 400 }, opts).handShift, 1e-9, 'bar width works the same');
});

test('a fit reference taken from a bike reference puts saddle and hands in the same place', () => {
  const bikeRef = Object.assign({ kind: 'bike' }, ref);
  const byStem = GB.fitPoints(bikeRef, { saddleHeight: 745, setback: 65, handFrom: 'stem', stemLength: 110, stemAngle: -6, barWidth: 400, spacers: 20, barReach: 80 });
  const body = { saddleLine: Math.hypot(byStem.saddle.x, byStem.saddle.y), setback: 65, riderReach: byStem.riderReach, drop: byStem.drop, barWidth: 400 };
  near(body.saddleLine, 717.3, 0.1, 'straight line to the tip reads less than along the seat tube');
  const fp = GB.fitPoints({ kind: 'fit' }, body);
  near(fp.saddle.y, byStem.saddle.y, 1e-9, 'saddle y');
  near(fp.hand.x, byStem.hand.x, 1e-9, 'hand x');
  near(fp.hand.y, byStem.hand.y, 1e-9, 'hand y');
  const target = Object.assign({}, ref, { sta: 74.5, hta: 73, barReach: 75 });
  const a = GB.solveBike(target, byStem, { barWidth: 400 }, opts);
  const b = GB.solveBike(target, fp, body, opts);
  near(b.heightAlong, a.heightAlong, 1e-9, 'saddle height');
  assert.strictEqual(b.railMove, null, 'no rail move without a reference seatpost');
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
  const both = GB.solveBike(Object.assign({}, ref, { reach: null, att: att + 30, seatTubeCC: 500, barReach: 80 }), fp, fit, opts);
  assert.ok(both.checks.some((c) => /effective top tube gives a reach/.test(c.text)), 'top tubes that disagree are flagged');
});

test('a seat tube c-c alone is enough', () => {
  const fp = GB.fitPoints(ref, fit);
  const a = GB.solveBike(Object.assign({}, ref, { barReach: 80 }), fp, fit, opts);
  const b = GB.solveBike(Object.assign({}, ref, { barReach: 80, seatTube: null, seatTubeCC: 500 }), fp, fit, opts);
  near(b.exposed, a.exposed, 1e-9, 'seatpost showing');
  near(b.drawing.stTop.y, a.drawing.stTop.y, 1e-9, 'seat tube top');
  assert.ok(b.drawing.ttRear.y < b.drawing.stTop.y, 'top tube meets the seat tube below its top');
  assert.strictEqual(a.drawing.ttRear, a.drawing.stTop, 'without a c-c the top tube is drawn to the seat tube top as before');
});

test('a saddle setback no seatpost can reach is flagged', () => {
  const fp = GB.bodyPoints({ saddleLine: 760, setback: 200, riderReach: 600, drop: 60, barWidth: 0 });
  const r = GB.solveBike(Object.assign({}, ref, { barReach: 80 }), fp, { barWidth: 0 }, opts);
  assert.ok(r.railPos < -r.railTravel / 2, 'saddle should be past the back of its rails');
  assert.ok(r.checks.some((c) => c.level === 'bad' && c.text.includes("can't be reached")), 'should say it cannot be reached');
});

test('an ordinary personal fit sits within the rails', () => {
  const fp = GB.bodyPoints({ saddleLine: 720, setback: 70, riderReach: 600, drop: 60, barWidth: 0 });
  const r = GB.solveBike(Object.assign({}, ref, { barReach: 80 }), fp, { barWidth: 0 }, opts);
  assert.ok(Math.abs(r.railPos) <= r.railTravel / 2, `rail position ${r.railPos}`);
  assert.ok(!r.checks.some((c) => c.level === 'bad'), 'no bad checks');
});

test('the app picks the post that keeps the saddle nearest the middle of its rails', () => {
  const fp = GB.fitPoints(ref, fit); // tip about 154 mm ahead of a 20 mm post's clamp
  assert.strictEqual(fp.rail.postOffset, 20);
  const back = GB.fitPoints(ref, Object.assign({}, fit, { setback: 45 })); // tip 20 mm further forward
  assert.strictEqual(back.rail.postOffset, 0, 'an inline post for a forward saddle');
  const r = GB.solveBike(Object.assign({}, ref, { barReach: 80 }), back, fit, opts);
  assert.ok(!r.checks.some((c) => c.level === 'bad'), 'fits');
});

test('a bike fit with a setback its own seatpost cannot carry is flagged, and so is every target', () => {
  const f = Object.assign({}, fit, { setback: 200, handFrom: 'stem', stemLength: 110, stemAngle: -6 });
  const fp = GB.fitPoints(ref, f);
  assert.ok(fp.rail.check && fp.rail.check.text.includes("can't be reached on this bike"), 'reference flagged');
  const r = GB.solveBike(Object.assign({}, ref, { barReach: 80 }), fp, f, opts);
  assert.ok(r.checks.some((c) => c.level === 'bad' && c.text.includes("can't be reached")), 'target flagged too');
});

console.log(`\n${passed} checks passed`);
