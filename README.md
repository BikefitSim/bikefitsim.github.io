# Geobike

Carries a bike fit from a reference bike to other frames. Everything sits on one grid:
the bottom bracket centre is (0, 0), X points forward, Y points up, lengths in mm.

1. **Reference bikes**: a frame that fits you plus the fit measured on it.
2. **Target bikes**: frames to set up like the reference selected in step 1.
3. **Changes**: saddle height along the new seat tube, setback, rail position, stem and spacers.

## Folders

| Path | What it holds |
|---|---|
| `src/engine.js` | All the maths: stack and reach from the tubes, fit points, stem and spacer search, saddle position. No DOM, runs in Node. |
| `src/draw.js` | Side view and close-up drawings (SVG). |
| `src/app.js` | Page logic: inputs, results, summary, saving, dark mode. |
| `src/base.css`, `src/body.html` | Styles and page layout. |
| `test/engine.test.js` | Checks for the engine. |
| `docs/model.md` | The calculation model and its formulas. |
| `build.py` | Joins the sources into one page. |
| `dist/` | Built pages (generated, don't edit). |

## Build and test

```
python3 build.py            # writes dist/geobike.html and dist/geobike-local.html
node test/engine.test.js    # runs the engine checks
```

Open `dist/geobike-local.html` in a browser to try changes. It saves in that browser only.

`dist/geobike.html` is the version published as the Claude artifact (the host adds `<html>` and `<head>`).
To publish a change, ask Claude in the linked chat to republish from this folder; the link stays the same.

## Saved data

The published page saves your bikes in your Claude account (`data/users/<you>/garage3`) and in the browser.
A local copy starts with the example numbers and keeps its own data in that browser.
The saved shape is version 3 and only ever gains fields, so older saves keep loading.
