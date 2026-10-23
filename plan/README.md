# Anatolian Protocol — business plan tool

The five-year forecast, funding need and scenarios as a web tool, replacing the Excel workbook.
Published with GitHub Pages at `/plan/` next to the presentation.

## Pages

| Page | What it is for |
|---|---|
| Overview | Funding to raise, first profitable year, year-5 results, scenario comparison |
| Funding | Levers that lower the funding to raise, with a waterfall from the current plan to the minimum |
| Scenarios | Base / downside / upside levers and results |
| Sensitivity | Which inputs move the funding need or five-year profit most |
| Assumptions | Every input (sections A–L and the team), changes highlighted against v5 |
| Unit economics | One client per package and the weighted average |
| P&L | Five-year P&L, cash and funding per scenario; CSV export |
| Monthly cash | First 36 months, the low point that sets the raise; pilot cohort timing |
| Partners | Operator + hospital and physician network switches, and what each takes off |
| Versions | Starting points, saved versions, JSON export/import, share links, change list |

## How to work with it

1. Open the tool and change inputs on any page. Every number updates at once; the draft stays in your browser.
2. **Save version** keeps a named copy in your browser. **Copy share link** sends the plan to someone else: the link carries only the inputs that differ from v5.
3. To make a plan official, **Export JSON** and commit the file to `plan/data/`. Git keeps the history; the commit message says what changed and why.
4. Funding levers are defined in `plan/data/levers.json` (label, explanation and the input changes). Add or edit levers there.

## Files

- `data/v5.json` — the v5 Excel model as data (all assumptions)
- `data/levers.json` — funding levers
- `js/model.js` — the calculation engine, a line-for-line port of the Excel formulas
- `js/app.js`, `js/charts.js`, `js/schema.js`, `css/app.css` — the interface
- `tools/check.js` — regression check: `node plan/tools/check.js` must print OK (the engine reproduces Excel v5 to within 0.000002%)

## Run locally

The tool loads its JSON with `fetch`, so open it through a web server, not as a file:

```
python -m http.server 8000
```

then go to `http://localhost:8000/plan/`.
