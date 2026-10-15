# BikefitSim calculation model

Grid: BB centre at (0, 0), X forward, Y up. Lengths in mm, angles in degrees.

Workflow: 1. references, as many as needed (e.g. a road and a gravel position), each either a bike fit (a frame and how it is set up) or a personal fit (only the rider's numbers, no bike), each kind in its own tab with at least one always present. 2. target bikes' geometry. Every target bike is matched to the bike fit or personal fit open in step 1. 3. changes for each target bike so the saddle tip and hand position match that reference.

Code: `src/engine.js` holds everything below; `test/engine.test.js` checks it.

## Inputs
- Frame (each reference and each target bike): seat tube angle, head tube angle, head tube length, effective top tube, seat tube length, BB drop, fork length (axle to crown, plus any lower headset cup), fork offset. Stack and reach from the chart are optional overrides.
- Bike fit, besides its frame: saddle height (BB centre to saddle top along the seat tube), saddle setback (horizontal, BB centre to a plumb line from the saddle tip), spacers under the stem (head tube top to stem, top cap included), stem length and angle, handlebar reach (0 = flat bar) and handlebar width (centre to centre at the hoods).
- Personal fit: saddle height as the straight line from the BB centre to the saddle tip, saddle setback, personal reach (straight tape line, saddle tip to the base of the hoods, or to where the hands sit on a bar without hoods), handlebar drop (vertical, saddle top to top of bar), handlebar width.
- Each target bike: handlebar reach and handlebar width of the bar it will use (width empty = same as the reference).
- Fixed assumptions: stem 40 mm tall (clamp centre 20 mm above the spacers), bar 31.8 mm (radius 15.9).

## Frame
- Stack = BB drop + (fork length + head tube length) × sin(HTA) − fork offset × cos(HTA)
- Reach = top tube − stack ÷ tan(STA)
- Head tube top T = (reach, stack). Steering axis direction d = (−cos HTA, sin HTA).
- Calculated stack and reach rarely match a chart exactly: a lower headset cup missing from fork length (10 mm of cup ≈ 9.5 mm of stack), rounded angles (0.5° of seat angle ≈ 5.5 mm of reach) and brand-specific definitions of seat angle and top tube. Chart values, when entered, are used directly.

## Fit points (per reference)
- Hand position H: the base of the hoods, i.e. the front of the handlebar's reach, level with the top of the bar. Bar centre on a bike with bar reach r: B = H − (r, 15.9). Reach 0 = flat bar, hands over the bar centre.
- Bike fit: saddle tip S = (−setback, saddle height × sin(STA_ref)). Stem clamp Q = T_ref + (spacers + 20) × d; bar centre B = Q + length × (cos θ, sin θ), θ = 90° − HTA + stem angle; H = B + (bar reach, 15.9). Then drop = S.y − H.y, side-view reach h = H.x − S.x and personal reach = √(h² + drop² + (bar width ÷ 2)²). These are used for target bikes exactly as if they had been measured. "Copy as personal fit" stores them with the straight line |S| as saddle height.
- Personal fit: S = (−setback, √(saddle line² − setback²)), where the saddle line is the straight tape from the BB centre to the saddle tip. It reads about 30 mm less than a saddle height along the seat tube, because the tip sits ahead of the seat tube. The tape from the saddle tip (on the centreline) to the hand runs out to the side of the bar, so h = √(personal reach² − drop² − (bar width ÷ 2)²), and H = (S.x + h, S.y − drop). Ignoring width with a 400 mm bar overstates h by about 31 mm on a 654 mm tape, roughly a whole stem size.
- Because personal reach is measured from the saddle tip, more setback moves H back by the same amount, so the stem gets shorter (about 1 mm per 1 mm of setback).

## Changes for each target bike
- Personal reach (the tape length) and drop are kept. With a different bar width w_t the side-view reach becomes √(personal reach² − drop² − (w_t ÷ 2)²): wider bars angle the arms out, so the hands sit further back (about 3.3 mm for 420 vs 400, 6.8 mm for 440, 14 mm for 480, at a 654 mm tape). If the reference width is not entered (0), widths are not compared.
- The saddle tip point S never moves. What changes is how it is read on a different frame.
- Saddle height along its seat tube = S.y ÷ sin(STA); a steeper seat tube reads less for the same point (e.g. 735 → 729.6 mm for about 1.4° steeper).
- Setback from BB: unchanged.
- Saddle on rails: (S.x + S.y ÷ tan STA) − (same on the reference bike); + = slide forward, same seatpost. A steeper seat tube sits further forward at saddle height, so the saddle slides back (about 20 mm for 1.4° at ~700 mm saddle height). Over 15 mm suggests a seatpost with different setback. A personal fit has no seatpost to compare with, so only the tip's distance ahead of the seat tube line at saddle height is given.
- Stem and spacers: bar centre target B = H_t − (bar reach, 15.9). Bar centre for a stem = T + (spacers + 20) × d + length × (cos θ, sin θ), θ = 90° − HTA + stem angle. Every stem length and angle on hand is tried, spacers rounded to the spacer step within 0..max.
- Ranking: miss distance + 0.15 mm per degree away from the reference stem angle (−6° for a personal fit, which has no stem), so the angle only changes when another one is clearly closer. The exact (unrounded) length and spacers for the chosen angle are shown too.
- With a personal fit there is no reference bike, so results are the full setup, without "vs reference" differences.

## Limitations
- Hands only at the base of the hoods (level with the top of the bar); the drops and the tops are not modelled.
- Handlebar rise and drop are not calculated yet: the base of the hoods is taken as level with the top of the bar at the clamp, so a riser bar or a bar whose hoods sit higher or lower puts the hands off by that much.
- Handlebar reach 0 is read as a flat bar.

## Drawings
- Side view of the target bike (blue, solid) over the reference bike (yellow, dashed), aligned at the BB on a 50 mm grid; fit points in red. A personal fit has no bike to draw; its BB to saddle tip line is drawn in yellow instead. A flat bar (reach 0) is drawn end-on. Dimensions: saddle height along the seat tube, setback, hand X/Y, drop, personal reach. Close-ups of the front end and saddle on 10 mm grids. Layers for reference, dimensions and grid.

## Saving
- Saved shape stays v3; new fields are only added with defaults, so older saves keep loading. References are a list (`refs`, each with `kind` 'bike' (bike fit) or 'fit' (personal fit) and its own `fit`; a personal fit's saddle line is `fit.saddleLine`; `lastRef` remembers the one last open in each tab, and a missing kind gets an empty one on load). A reference without `kind` is a bike fit; default names from earlier versions ("Reference bike 2", "Fit reference 1") are renamed to "Bike fit 2", "Personal fit 1"; if it gave the hands by personal reach and drop, the stem those imply is filled in (0.1 mm, 0.1°) and flagged until edited. a save from before that held a single `ref` + `fit` loads as the first reference. Target bikes may still carry an old `refId`; it is ignored. A target bike without `barWidth` uses the reference width.
- `fit.barWidth` missing in older saves is loaded as 0 (personal reach read in side view), so their results don't shift; the page asks for the width.
- Start: one empty bike fit ("Reference bike 1"), one empty personal fit ("Personal fit 1") and one empty target bike ("Target bike 1"). Opened from disk or localhost, and inside Claude, bikes are kept in the browser; on any other web address (GitHub Pages) nothing is kept between visits unless a data file is used.
- Edits are locked until saved data has loaded. Copies: browser, account (published page) and an optional data file on the computer (`{app: 'bikefitsim', format: 3, savedAt, state}`); each carries the time of the last edit and the newest wins.
- Data from the earlier hoods-based version can be brought in from a banner: frames map directly (lower headset added to fork length); personal reach and drop are converted from the hood measurements; spacers are estimated and flagged for checking.
