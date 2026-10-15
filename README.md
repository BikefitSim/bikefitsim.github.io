<img src="assets/logo.svg" alt="BikefitSim logo: B and S in the wheels of a bike" width="112">

# BikefitSim

Carries a bike fit from a reference to other frames. Everything sits on one grid:
the bottom bracket centre is (0, 0), X points forward, Y points up, lengths in mm.

1. **Reference**, in two tabs, each holding as many as you need:
   - **Bike fit**: a frame that fits you and how it is set up (saddle height and setback, spacers, stem length and angle, handlebar reach and width). Personal reach and drop are worked out from it.
   - **Personal fit**: just your numbers, with no bike: saddle height (straight line from the BB centre to the saddle tip), setback, personal reach, handlebar drop and bar width.
2. **Target bikes**: frames to set up like the bike fit or personal fit open in step 1.
3. **Changes**: saddle height along the new seat tube, setback, rail position, stem and spacers.

## Limitations

- The hand position is the base of the hoods, level with the top of the bar. Measure personal reach to there, or to where your hands sit on a bar without hoods.
- Handlebar reach 0 is read as a flat bar, with the hands over the bar centre.
- Handlebar rise and drop are not calculated yet: the base of the hoods is taken as level with the top of the bar at the clamp.
- Everything is measured to the saddle tip, so the results assume the same saddle on every bike. A saddle of a different length moves where you sit by the difference (20 mm shorter with the tip in the same place puts you 20 mm further forward).

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
python3 build.py            # writes dist/bikefitsim.html and dist/bikefitsim-local.html
node test/engine.test.js    # runs the engine checks
```

Open `dist/bikefitsim-local.html` in a browser to try changes. It saves in that browser only.

`dist/bikefitsim.html` is the version published as the Claude artifact (the host adds `<html>` and `<head>`).
To publish a change, ask Claude in the linked chat to republish from this folder; the link stays the same.

## GitHub Pages

Branches: `dev` is where work happens; `master` holds releases.

The repository lives in the `bikefitsim` organization as `bikefitsim.github.io`, so the site sits at the root of that address.
Every push to `master` runs `.github/workflows/pages.yml`: it runs the engine checks, builds the page and publishes it at
**https://bikefitsim.github.io/**.

One-time setup on GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
Pages is free for public repositories; a private one needs a paid plan.

The Pages copy keeps nothing between visits. In Chrome or Edge it can save to a linked data file; elsewhere,
download and open one. The same file moves your bikes between it, a local copy and the published Claude page.

## Where your data is saved

The app starts with one empty bike fit, one empty personal fit and one empty target bike. What happens to your numbers depends on where it runs:

- **Opened from your computer** (`dist/bikefitsim-local.html`, or a local server): every change is saved in this browser and comes back next time.
- **The Claude page:** saved in this browser and in your Claude account.
- **The public web copy** (GitHub Pages): nothing is kept between visits, so each visitor starts empty. Use the data file to keep your bikes.

The bar under the header handles the data file, a plain JSON file such as `data/bikefit-data.json`:

- **Chrome or Edge:** "Save to a file" links a file once and every change is written to it. On the next visit, one click on "Reconnect" picks it up again. "Open data file" loads another file after asking to replace what is on screen.
- **Other browsers:** "Download data file" saves a copy and "Open data file" loads one.

When more than one copy exists, the newest wins on load.

`data/` and `*.bikefitsim.json` (and the older `*.geobike.json`) are in `.gitignore`, so your own measurements stay out of the repository.

The saved shape is version 3 and only ever gains fields, so older saves and files keep loading.

## Credits and contact

Made by José Miguel Moreira, under the MIT License. Type: IBM Plex Sans, IBM Plex Mono and Saira Condensed (SIL Open Font License).

Questions, wrong numbers or ideas: zmdmoreira@gmail.com
