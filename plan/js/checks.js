/* Logic checks: rules an input must meet (errors) and results worth a second look (warnings).
   check(A, R) -> [{ level: "error" | "warn", path, msg }] */
(function (root) {
  "use strict";
  const pctTxt = (v) => (Math.round(v * 1000) / 10).toLocaleString("en-GB") + "%";
  const isInt = (v) => Math.abs(v - Math.round(v)) < 1e-9;
  const PKG = ["Annual · Standard", "Annual · Premium", "Summer–Winter · Standard", "Summer–Winter · Premium", "Seasonal · Standard", "Seasonal · Premium"];

  // percentage inputs and the range they must stay in (default 0–100%)
  const PCT_RANGE = {
    "prices.listIncrease": [-0.5, 1], "finance.inflation": [-0.5, 1], "prices.renewalPrice": [0, 1.5],
  };

  function check(A, R, schema) {
    const out = [];
    const err = (path, msg) => out.push({ level: "error", path, msg });
    const warn = (path, msg) => out.push({ level: "warn", path, msg });
    const get = root.APModel.getPath;

    // field rules from the schema: kind and range
    for (const sec of schema) for (const f of sec.fields) {
      if (f.kind === "bool") continue;
      const v = get(A, f.path);
      const vals = Array.isArray(v) ? v : [v];
      vals.forEach((x, i) => {
        const p = Array.isArray(v) ? `${f.path}.${i}` : f.path;
        const lab = f.label + (Array.isArray(v) ? ` (${f.shape === "pair" ? ["Standard", "Premium"][i] : f.shape === "years" ? "Y" + (i + 1) : i + 1})` : "");
        if (typeof x !== "number" || !isFinite(x)) { err(p, `${lab} must be a number.`); return; }
        if (f.kind === "pct") {
          const [lo, hi] = PCT_RANGE[f.path] || [0, 1];
          if (x < lo || x > hi) err(p, `${lab} must be between ${pctTxt(lo)} and ${pctTxt(hi)}.`);
        } else if (x < 0) err(p, `${lab} cannot be negative.`);
        if (f.kind === "int" && !isInt(x)) err(p, `${lab} must be a whole number.`);
      });
    }

    // package mix
    const mixSum = A.mix.annual + A.mix.summerWinter + A.mix.seasonal;
    if (Math.abs(mixSum - 1) > 0.0005) err("mix.seasonal", `Package shares add up to ${pctTxt(mixSum)}; they must total 100%.`);

    // divisions and impossible shares
    if (A.funnel.conversion <= 0) err("funnel.conversion", "Lead-to-client conversion must be above 0%.");
    if (A.funnel.referralShare >= 1) err("funnel.referralShare", "Referral share must be below 100%: some clients must come from marketing.");
    if (A.funnel.cancelBeforeVisit >= 1) err("funnel.cancelBeforeVisit", "Cancellations before the first visit must be below 100%.");
    if (A.prices.companionShare >= 1) err("prices.companionShare", "Companions must be below 100% of new clients.");

    // visits and draws
    A.delivery.visits.forEach((v, i) => { if (v < 1) err(`delivery.visits.${i}`, "Every package needs at least one visit."); });
    const maxVisits = Math.max(...A.delivery.visits);
    if (A.delivery.homeDrawsPerYear < maxVisits) err("delivery.homeDrawsPerYear", `Home-country draws per year (${A.delivery.homeDrawsPerYear}) are fewer than the visits in the largest package (${maxVisits}), which gives negative draws.`);

    // prices: premium above standard, longer packages above shorter
    for (const k of ["annual", "summerWinter", "seasonal"]) {
      if (A.prices[k][1] < A.prices[k][0]) warn(`prices.${k}.1`, `The Premium price of the ${k === "summerWinter" ? "Summer–Winter" : k} package is below its Standard price.`);
    }
    for (let l = 0; l < 2; l++) {
      if (A.prices.summerWinter[l] < A.prices.annual[l] || A.prices.seasonal[l] < A.prices.summerWinter[l])
        warn(`prices.seasonal.${l}`, `${["Standard", "Premium"][l]} prices do not rise with the number of visits.`);
    }

    // team
    for (const t of A.team) {
      if (t.cost < 0) err(`team.${t.id}.cost`, `${t.name}: monthly cost cannot be negative.`);
      if (!isInt(t.min) || t.min < 0) err(`team.${t.id}.min`, `${t.name}: minimum FTE must be a whole number of people.`);
      if (t.driver !== "fixed" && !(t.ratio > 0)) err(`team.${t.id}.ratio`, `${t.name}: clients per FTE must be above 0.`);
      if (t.y1 < 0 || t.y1 > 1) err(`team.${t.id}.y1`, `${t.name}: the pilot-year factor must be between 0% and 100%.`);
    }

    // scenarios
    for (const [s, v] of Object.entries(A.scenarios)) {
      for (const k of ["volume", "cac", "price", "partnerCost"]) if (!(v[k] > 0)) err(`scenarios.${s}.${k}`, `${s} scenario: multipliers must be above 0.`);
      if (v.renewal < 0 || v.renewal > 1) err(`scenarios.${s}.renewal`, `${s} scenario: renewal must be between 0% and 100%.`);
    }
    if (A.scenarios.downside.volume > A.scenarios.base.volume || A.scenarios.upside.volume < A.scenarios.base.volume)
      warn("scenarios.downside.volume", "Volume multipliers are not ordered downside ≤ base ≤ upside.");

    // partners
    if (A.partners.revenueShare < 0 || A.partners.revenueShare > 1) err("partners.revenueShare", "Partner revenue share must be between 0% and 100%.");

    // pilot timing
    const coh = A.monthly.y1Cohorts, cohSum = coh.reduce((a, b) => a + b, 0);
    if (Math.abs(cohSum - 1) > 0.0005) err("monthly.y1Cohorts.0", `Pilot cohorts add up to ${pctTxt(cohSum)} of year-1 clients; they must total 100%.`);
    coh.forEach((c, i) => { if (c < 0 || c > 1) err(`monthly.y1Cohorts.${i}`, `Cohort share in month ${i + 1} must be between 0% and 100%.`); });
    const sm = A.monthly.setupMonths;
    if (!isInt(sm) || sm < 0 || sm > 11) err("monthly.setupMonths", "Set-up months must be a whole number from 0 to 11.");
    const firstCohort = coh.findIndex((c) => c > 0) + 1;
    if (firstCohort && firstCohort <= sm) err("monthly.setupMonths", `Clients enrol in month ${firstCohort}, before set-up ends in month ${sm}.`);

    // results worth a second look
    if (R) {
      const B = R.scen.base, Y = B.years;
      R.UE.cols.forEach((c, i) => { if (c.contribution < 0) warn("prices", `${PKG[i]} loses money on every client before acquisition (${Math.round(c.contribution).toLocaleString("en-GB")} USD).`); });
      if (Y[4].ebitda < 0) warn("", "The base case is still loss-making in year 5.");
      if (Y.slice(1).some((y) => y.grossMargin < 0)) warn("", "Gross margin is negative after the pilot year.");
      if (R.monthly.lowAfterMonth >= 36 && R.monthly.lowAfter > 0) warn("", "Cash is still falling in month 36, so the raise may be understated.");
      Y.forEach((y, i) => {
        if (y.newClients < 1) warn("funnel.leads." + i, `Year ${i + 1} has no new clients.`);
        if (y.programYears > 0 && y.newClients > 0 && y.marketing < 0) err("funnel.referralShare", `Year ${i + 1}: more referred clients than acquired clients.`);
      });
    }
    return out;
  }

  root.APChecks = { check };
})(typeof window !== "undefined" ? window : globalThis);
