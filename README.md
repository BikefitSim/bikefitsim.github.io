# Bikefit Simulator

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
| `src/datafile.js` | Saving to and opening a data file on your computer. |
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

## GitHub Pages

Branches: `dev` is where work happens; `master` holds releases.

Every push to `master` runs `.github/workflows/pages.yml`: it runs the engine checks, builds the page and publishes it at
**https://zemiguelmoreira.github.io/geobike/**.

One-time setup on GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
Pages is free for public repositories; a private one needs a paid plan.

The Pages copy saves in the browser and, in Chrome or Edge, to a linked data file. It has no account saving,
so use the data file to move your bikes between it and the published Claude page.

## Where your data is saved

The app starts with one empty reference bike and one empty target bike. What happens to your numbers depends on where it runs:

- **Opened from your computer** (`dist/geobike-local.html`, or a local server): every change is saved in this browser and comes back next time.
- **The Claude page:** saved in this browser and in your Claude account.
- **The public web copy** (GitHub Pages): nothing is kept between visits, so each visitor starts empty. Use the data file to keep your bikes.

The bar under the header handles the data file, a plain JSON file such as `data/bikefit-data.json`:

- **Chrome or Edge:** "Save to a file" links a file once and every change is written to it. On the next visit, one click on "Reconnect" picks it up again. "Open data file" loads another file after asking to replace what is on screen.
- **Other browsers:** "Download data file" saves a copy and "Open data file" loads one.

When more than one copy exists, the newest wins on load.

`data/` and `*.geobike.json` are in `.gitignore`, so your own measurements stay out of the repository.

The saved shape is version 3 and only ever gains fields, so older saves and files keep loading.
