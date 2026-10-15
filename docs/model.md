# Geobike calculation model

Grid: BB centre at (0, 0), X forward, Y up. Lengths in mm, angles in degrees.

Workflow: 1. reference bikes, each with its geometry and the fit measured on it (one unit; as many as needed, e.g. a road and a gravel position). 2. target bikes' geometry. Every target bike is matched to the reference bike currently selected in step 1. 3. changes for each target bike so the saddle tip and hand position match that reference.

Code: `src/engine.js` holds everything below; `test/engine.test.js` checks it.

## Inputs
- Frame (each reference and each target bike): seat tube angle, head tube angle, head tube length, effective top tube, seat tube length, BB drop, fork length (axle to crown, plus any lower headset cup), fork offset. Stack and reach from the chart are optional overrides.
- Fit on each reference bike: saddle height (BB centre to saddle top along the seat tube), saddle setback (horizontal, BB centre to a plumb line from the saddle tip), rider reach (straight tape line, saddle tip to hand position), handlebar drop (vertical, saddle top to top of bar), handlebar width (centre to centre at the hoods), spacers under the stem (head tube top to stem, top cap included), handlebar reach of the reference bar.
- Each target bike: handlebar reach and handlebar width of the bar it will use (width empty = same as the reference).
- Fixed assumptions: stem 40 mm tall (clamp centre 20 mm above the spacers), bar 31.8 mm (radius 15.9).

## Frame
- Stack = BB drop + (fork length + head tube length) × sin(HTA) − fork offset × cos(HTA)
- Reach = top tube − stack ÷ tan(STA)
- Head tube top T = (reach, stack). Steering axis direction d = (−cos HTA, sin HTA).
- Calculated stack and reach rarely match a chart exactly: a lower headset cup missing from fork length (10 mm of cup ≈ 9.5 mm of stack), rounded angles (0.5° of seat angle ≈ 5.5 mm of reach) and brand-specific definitions of seat angle and top tube. Chart values, when entered, are used directly.

## Fit points (per reference bike)
- Saddle tip: S = (−setback, saddle height × sin(STA_ref))
- Side-view reach: the tape from the saddle tip (on the centreline) to the hand runs out to the side of the bar, so h = √(rider reach² − drop² − (bar width ÷ 2)²). Ignoring width with a 400 mm bar overstates h by about 31 mm on a 654 mm tape, roughly a whole stem size.
- Hand position: H = (S.x + h, S.y − drop). It sits at the front of the handlebar's reach, level with the top of the bar.
- Because rider reach is measured from the saddle tip, more setback moves H back by the same amount, so the stem gets shorter (about 1 mm per 1 mm of setback).
- Bar centre on a bike with bar reach r: B = H − (r, 15.9)
- Stem implied on the reference bike: Q = T_ref + (spacers + 20) × d; length = |B − Q|; angle = atan2(B − Q) − (90° − HTA). Shown as a check against the stem actually fitted.

## Changes for each target bike
- Rider reach (the tape length) and drop are kept. With a different bar width w_t the side-view reach becomes √(rider reach² − drop² − (w_t ÷ 2)²): wider bars angle the arms out, so the hands sit further back (about 3.3 mm for 420 vs 400, 6.8 mm for 440, 14 mm for 480, at a 654 mm tape). If the reference width is not entered (0), widths are not compared.
- The saddle tip point S never moves. What changes is how it is read on a different frame.
- Saddle height along its seat tube = S.y ÷ sin(STA); a steeper seat tube reads less for the same point (e.g. 735 → 729.6 mm for about 1.4° steeper).
- Setback from BB: unchanged.
- Saddle on rails: (S.x + S.y ÷ tan STA) − (same on the reference); + = slide forward, same seatpost. A steeper seat tube sits further forward at saddle height, so the saddle slides back (about 20 mm for 1.4° at ~700 mm saddle height). Over 15 mm suggests a seatpost with different setback.
- Stem and spacers: bar centre target B = H_t − (bar reach, 15.9). Bar centre for a stem = T + (spacers + 20) × d + length × (cos θ, sin θ), θ = 90° − HTA + stem angle. Every stem length and angle on hand is tried, spacers rounded to the spacer step within 0..max.
- Ranking: miss distance + 0.15 mm per degree away from the reference stem angle, so the angle only changes when another one is clearly closer. The exact (unrounded) length and spacers for the chosen angle are shown too.

## Drawings
- Side view of the target bike (blue, solid) over the reference bike (yellow, dashed), aligned at the BB on a 50 mm grid; fit points in red. Dimensions: saddle height along the seat tube, setback, hand X/Y, drop, rider reach. Close-ups of the front end and saddle on 10 mm grids. Layers for reference, dimensions and grid.

## Saving
- Saved shape stays v3; new fields are only added with defaults, so older saves keep loading. Reference bikes are a list (`refs`, each with its own `fit`); a save from before that held a single `ref` + `fit` loads as the first reference. Target bikes may still carry an old `refId`; it is ignored. A target bike without `barWidth` uses the reference width.
- `fit.barWidth` missing in older saves is loaded as 0 (rider reach read in side view), so their results don't shift; the page asks for the width.
- Edits are locked until saved data has loaded. The newer of the browser copy and the account copy wins (each carries the time of the last edit).
- Data from the earlier hoods-based version can be brought in from a banner: frames map directly (lower headset added to fork length); rider reach and drop are converted from the hood measurements; spacers are estimated and flagged for checking.
