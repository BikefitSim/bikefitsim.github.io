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

console.log(`\n${passed} checks passed`);
