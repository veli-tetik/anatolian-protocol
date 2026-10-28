// Regression check: the engine must reproduce the Excel workbooks.
//   node plan/tools/check.js
// v5: Anatolian_Protocol_PL_Feasibility_v5.xlsx; v6.2: …_v6.2.xlsx (inputs in v62_inputs.json); v6.3: …_v6.3.xlsx (the current plan, data/v6.json).
// Both workbooks work with fractional clients, so whole-client rounding is switched off here.
const path = require("path");
const M = require(path.join(__dirname, "../js/model.js"));

function run(name, dataFile, valuesFile, compare) {
  const A = JSON.parse(JSON.stringify(require(path.join(__dirname, dataFile))));
  A.logic = Object.assign({}, A.logic, { wholeClients: false });
  const X = require(path.join(__dirname, valuesFile));
  const R = M.compute(A);
  let worst = 0;
  const bad = [];
  const chk = (lbl, a, b) => {
    const d = Math.abs(a - b) / Math.max(1, Math.abs(b));
    worst = Math.max(worst, d);
    if (!(d <= 1e-6)) bad.push(`${lbl}: engine ${a}, Excel ${b}`);
  };
  compare(R, X, chk);
  if (bad.length) { console.error(`${name}: FAILED\n` + bad.join("\n")); return false; }
  console.log(`OK: engine matches Excel ${name} (worst relative difference ${worst.toExponential(1)}). Funding to raise $${Math.round(R.funding).toLocaleString("en-GB")}.`);
  return true;
}

const ok5 = run("v5", "../data/v5.json", "excel_v5_values.json", (R, X, chk) => {
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
});

const ok62 = run("v6.2", "v62_inputs.json", "excel_v62_values.json", (R, X, chk) => {
  const B = R.scen.base;
  for (const [k, v] of Object.entries(X.years)) v.forEach((x, i) => chk(`${k}[Y${i + 1}]`, B.years[i][k], x));
  chk("funding", R.funding, X.funding);
  chk("monthly.raise", R.monthly.raise, X.raiseM);
  chk("monthly.lowAfterMonth", R.monthly.lowAfterMonth, X.lowMonth);
  chk("rounds.preNeeded", R.rounds.preNeeded, X.preNeeded);
  X.cum.forEach((v, i) => chk(`monthly.cum[M${i + 1}]`, R.monthly.rows[i].cum, v));
  X.cumAfter.forEach((v, i) => chk(`monthly.cumAfter[M${i + 1}]`, R.monthly.rows[i].cumAfter, v));
});

const ok63 = run("v6.3", "../data/v6.json", "excel_v63_values.json", (R, X, chk) => {
  const B = R.scen.base;
  for (const [k, v] of Object.entries(X.years)) v.forEach((x, i) => chk(`${k}[Y${i + 1}]`, B.years[i][k], x));
  chk("cash need", R.funding, X.funding);
  chk("monthly.raise", R.monthly.raise, X.raiseM);
  chk("monthly.lowAfterMonth", R.monthly.lowAfterMonth, X.lowMonth);
  chk("rounds.preNeeded", R.rounds.preNeeded, X.preNeeded);
  X.cum.forEach((v, i) => chk(`monthly.cum[M${i + 1}]`, R.monthly.rows[i].cum, v));
  X.cumAfter.forEach((v, i) => chk(`monthly.cumAfter[M${i + 1}]`, R.monthly.rows[i].cumAfter, v));
});

if (!ok5 || !ok62 || !ok63) process.exit(1);
