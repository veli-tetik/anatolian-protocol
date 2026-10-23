// Regression check: the engine must reproduce the v5 Excel model.
//   node plan/tools/check.js
const path = require("path");
const M = require(path.join(__dirname, "../js/model.js"));
const A = require(path.join(__dirname, "../data/v5.json"));
// Excel works with fractional clients; compare with whole-client rounding switched off.
A.logic = { wholeClients: false };
const X = require(path.join(__dirname, "excel_v5_values.json"));

const R = M.compute(A);
let worst = 0;
const bad = [];
const chk = (lbl, a, b) => {
  const d = Math.abs(a - b) / Math.max(1, Math.abs(b));
  worst = Math.max(worst, d);
  if (d > 1e-6) bad.push(`${lbl}: engine ${a}, Excel ${b}`);
};
for (const s of M.SCEN) {
  for (const [k, v] of Object.entries(X[s])) {
    if (Array.isArray(v)) v.forEach((x, i) => chk(`${s}.${k}[Y${i + 1}]`, R.scen[s].years[i][k], x));
    else chk(`${s}.${k}`, R.scen[s][k], v);
  }
}
X.monthly.cum.forEach((v, i) => chk(`monthly.cum[M${i + 1}]`, R.monthly.rows[i].cum, v));
X.monthly.cumAfter.forEach((v, i) => chk(`monthly.cumAfter[M${i + 1}]`, R.monthly.rows[i].cumAfter, v));
for (const k of ["lowAfter", "raise", "lowAfterMonth"]) chk(`monthly.${k}`, R.monthly[k], X.monthly[k]);
for (const [k, v] of Object.entries(X.ue)) chk(`unit.${k}`, R.UE.w[k], v);

if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
console.log(`OK: engine matches Excel v5 (worst relative difference ${worst.toExponential(1)}). Funding to raise $${Math.round(R.funding).toLocaleString("en-US")}.`);
