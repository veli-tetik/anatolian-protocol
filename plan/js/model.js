/* The Anatolian Protocol — forecast engine.
   A line-for-line port of Anatolian_Protocol_PL_Feasibility_v5.xlsx
   (Unit Economics, P&L Base/Downside/Upside, Cash monthly, Partner case).
   Pure functions: compute(assumptions) -> results. Runs in the browser and in node. */
(function (root) {
  "use strict";

  const YEARS = 5, MONTHS = 36;
  const SCEN = ["base", "downside", "upside"];
  const PKGS = [
    { id: "annual",       name: "Annual",        visitsIdx: 0 },
    { id: "summerWinter", name: "Summer–Winter", visitsIdx: 1 },
    { id: "seasonal",     name: "Seasonal",      visitsIdx: 2 },
  ];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const roundUp = (v) => Math.ceil(v - 1e-9);

  // ------------------------------------------------------------ paths
  function getPath(obj, path) {
    const parts = path.split(".");
    let o = obj;
    for (let i = 0; i < parts.length; i++) {
      if (o == null) return undefined;
      const k = parts[i];
      if (Array.isArray(o) && !/^\d+$/.test(k) && k !== "*") o = o.find((x) => x.id === k);
      else if (k === "*") return o[0];
      else o = o[k];
    }
    return o;
  }
  function setPath(obj, path, value) {
    const parts = path.split(".");
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      o = Array.isArray(o) && !/^\d+$/.test(k) ? o.find((x) => x.id === k) : o[k];
    }
    const last = parts[parts.length - 1];
    if (last === "*") { for (let i = 0; i < o.length; i++) o[i] = value; }
    else o[last] = value;
  }

  // Partner case: switch groups in, apply their lever values ("Used now" column).
  function resolve(A) {
    const E = clone(A);
    const P = A.partners;
    const alone = { conversion: A.funnel.conversion, referralShare: A.funnel.referralShare };
    for (const lv of P.levers) {
      if (P[lv.group] === 1) setPath(E, lv.path, lv.with);
    }
    if (Math.max(P.operator, P.physicians) === 1) E.addons.processing = A.addons.processing + P.revenueShare;
    E._alone = alone;
    return E;
  }

  // ------------------------------------------------------------ unit economics (one new client, list price)
  function unitEconomics(E) {
    const D = E.delivery, M = E.mix, pr = E.prices;
    const cols = [];
    for (const p of PKGS) {
      for (let lvl = 0; lvl < 2; lvl++) {
        const share = M[p.id] * (lvl ? M.premium : 1 - M.premium);
        const visits = D.visits[p.visitsIdx];
        const price = pr[p.id][lvl];
        const hd = 1 - D.hotelDiscount;
        const first = D.hospitalDay[lvl] + D.firstNights[lvl] * D.firstRate[lvl] * hd + D.firstExperiences[lvl] + D.firstTransfers[lvl] + D.insurance[lvl];
        const later = (visits - 1) * (D.laterBlock[lvl] + D.laterNights[lvl] * D.laterRate[lvl] * hd + D.laterExperiences[lvl] + D.laterTransfers[lvl] + D.insurance[lvl]);
        const physician = D.physicianHours[lvl] * D.physicianRate[lvl];
        const draws = (D.homeDrawsPerYear - visits) * D.homeDraw[lvl];
        const tele = D.telehealth[lvl];
        const box = 12 * D.monthlyBox[lvl] + D.starterPack[lvl];
        const support = (visits - 1) * D.teamTravel[lvl] + visits * D.interpreters[lvl];
        const report = D.yearEndReport[lvl];
        const platform = D.platformPerClient[lvl];
        const wear = D.wearables[lvl];
        const delivery = first + later + physician + draws + tele + box + support + report + platform + wear;
        const processing = E.addons.processing * price;
        const referral = E.funnel.referralShare * E.addons.referralCommission * price;
        const contribution = price - delivery - processing - referral;
        const cacY3 = E.funnel.costPerLead[2] / E.funnel.conversion;
        const acquisition = (1 - E.funnel.referralShare) * cacY3 / (1 - E.funnel.cancelBeforeVisit);
        const afterAcq = contribution - acquisition;
        const renewPrice = price * pr.renewalPrice;
        const renewContribution = renewPrice * (1 - E.addons.processing) - delivery;
        const twoYear = afterAcq + E.scenarios.base.renewal * renewContribution;
        cols.push({
          name: p.name + (lvl ? " · Premium" : " · Standard"), share, visits, price,
          first, later, physician, draws, tele, box, support, report, platform, wear, delivery,
          processing, referral, contribution, contributionPct: price ? contribution / price : 0,
          acquisition, afterAcq, renewPrice, renewContribution, twoYear,
          payback: contribution <= 0 ? 0 : acquisition / (contribution / 12),
        });
      }
    }
    const w = {};
    for (const k of Object.keys(cols[0])) {
      if (typeof cols[0][k] === "number") w[k] = sum(cols.map((c) => c.share * c[k]));
    }
    w.name = "Weighted average";
    w.share = sum(cols.map((c) => c.share));
    w.contributionPct = w.price ? w.contribution / w.price : 0;
    w.payback = w.contribution <= 0 ? 0 : w.acquisition / (w.contribution / 12);
    return { cols, w };
  }

  // ------------------------------------------------------------ annual P&L for one scenario
  function annual(E, UE, sIdx) {
    const S = E.scenarios[SCEN[sIdx]];
    const W = UE.w, F = E.finance, mid = F.midYear;
    const fn = E.funnel, al = E._alone;
    const wr = 1 - fn.withdraw * fn.refund;
    const team = E.team;
    const y = [];
    let prev = null;
    let lossCF = 0, cumCash = 0, unearned = 0;
    let c2 = 0, c3 = 0, c4 = 0;           // clients in 2nd, 3rd, 4th+ program year (rows 106–108)
    const baseRenew = E.scenarios.base.renewal;
    const plan = fn.leads.map((l) => l * al.conversion / (1 - al.referralShare) / (1 - E.prices.companionShare));
    let activeCountries = 0;

    for (let i = 0; i < YEARS; i++) {
      const r = {};
      const yr = i + 1, pilot = yr === 1 ? 1 : 0;
      r.pilot = pilot;
      r.newClients = plan[i] * S.volume;
      r.companions = r.newClients * E.prices.companionShare;
      r.acquired = r.newClients - r.companions;
      if (i > 0) {
        const n2 = prev.newClients * S.renewal;
        const n3 = c2 * E.retention.y3 * S.renewal / baseRenew;
        const n4 = (c3 + c4) * E.retention.y4 * S.renewal / baseRenew;
        c2 = n2; c3 = n3; c4 = n4;
      }
      r.renewing = c2 + c3 + c4;
      r.programYears = r.newClients + r.renewing;
      r.active = mid * r.programYears + (1 - mid) * (prev ? prev.programYears : 0);
      r.visits = r.programYears * W.visits;
      r.priceIdx = Math.pow(1 + E.prices.listIncrease, yr - 1);
      r.costIdx = prev ? prev.costIdx * (1 + F.inflation[i]) : 1;

      // bookings
      r.bNew = r.newClients * W.price * (1 - E.prices.companionShare * E.prices.companionDiscount) * S.price * r.priceIdx * (1 - pilot * E.prices.foundingDiscount);
      r.bRenew = r.renewing * W.price * E.prices.renewalPrice * S.price * r.priceIdx;
      r.bAddon = r.programYears * E.addons.buyShare * E.addons.spend * r.priceIdx;
      r.bExpComp = r.visits * E.addons.expCompanionsPerVisit * E.addons.expCompanionPrice * r.priceIdx;
      r.bookings = r.bNew + r.bRenew + r.bAddon + r.bExpComp;
      r.refunds = -fn.withdraw * fn.refund * (r.bNew + r.bRenew);

      const p = prev || { bNew: 0, bRenew: 0, refunds: 0, bAddon: 0, bExpComp: 0, programYears: 0, costIdx: 0, visits: 0 };
      r.progRevenue = mid * (r.bNew + r.bRenew + r.refunds) + (1 - mid) * (p.bNew + p.bRenew + p.refunds);
      r.addonRevenue = mid * (r.bAddon + r.bExpComp) + (1 - mid) * (p.bAddon + p.bExpComp);
      r.revenue = r.progRevenue + r.addonRevenue;
      r.growth = prev && prev.revenue ? r.revenue / prev.revenue - 1 : 0;

      // FTE
      const fte = {};
      for (const t of team) {
        let need = 0;
        if (t.driver === "new") need = r.acquired / t.ratio;
        else if (t.driver === "active") need = r.active / t.ratio;
        else if (t.driver === "visits") need = r.visits / t.ratio;
        fte[t.id] = t.driver === "fixed" ? t.min : Math.max(t.min, roundUp(need));
      }
      r.fte = fte;
      r.fteTotal = sum(Object.values(fte));
      const pay = (t) => fte[t.id] * t.cost * 12 * r.costIdx * (pilot * t.y1 + (1 - pilot));
      r.teamCost = {};
      for (const t of team) r.teamCost[t.id] = pay(t);

      // cost of service
      r.partnerDelivery = (mid * r.programYears * W.delivery * r.costIdx + (1 - mid) * p.programYears * W.delivery * p.costIdx) * S.partnerCost * wr;
      r.addonDelivery = mid * (r.bAddon * (1 - E.addons.margin) + r.visits * E.addons.expCompanionsPerVisit * E.addons.expCompanionCost * r.costIdx)
        + (1 - mid) * (p.bAddon * (1 - E.addons.margin) + p.visits * E.addons.expCompanionsPerVisit * E.addons.expCompanionCost * p.costIdx);
      r.processing = r.revenue * E.addons.processing;
      r.referral = r.acquired * fn.referralShare * E.addons.referralCommission * r.bNew / Math.max(r.newClients, 0.0001);
      r.careTeam = sum(team.filter((t) => t.group === "care").map((t) => r.teamCost[t.id]));
      r.costOfService = r.partnerDelivery + r.addonDelivery + r.processing + r.referral + r.careTeam;
      r.grossProfit = r.revenue - r.costOfService;
      r.grossMargin = r.revenue ? r.grossProfit / r.revenue : 0;

      // opex
      const cac = fn.costPerLead[i] / fn.conversion;
      r.acquisition = r.acquired * (1 - fn.referralShare) * cac * S.cac / (1 - fn.cancelBeforeVisit);
      r.brand = E.overheads.brand * 12 * r.costIdx;
      r.advisors = sum(team.filter((t) => t.group === "sales").map((t) => r.teamCost[t.id]));
      r.salesMarketing = r.acquisition + r.brand + r.advisors;
      r.leadership = sum(team.filter((t) => t.group === "ga").map((t) => r.teamCost[t.id]));
      activeCountries += E.countries.opened[i];
      const O = E.overheads;
      r.office = O.office * 12 * r.costIdx;
      r.legal = O.legal * r.costIdx + Math.max(0, activeCountries - 1) * E.countries.running * r.costIdx;
      r.insurance = O.insurance * r.costIdx;
      r.accounting = O.accounting * r.costIdx;
      r.platformFee = O.platformFee * 12 * r.costIdx * (pilot ? O.platformFeeY1 : 1);
      r.travel = O.travel * r.costIdx;
      r.ga = r.leadership + r.office + r.legal + r.insurance + r.accounting + r.platformFee + r.travel;
      const su = E.setup;
      r.setup = pilot * (su.legal + su.brand + su.platform + su.clinical + su.recruitment + su.contracting)
        + (yr > 1 ? E.countries.opened[i] * E.countries.oneOff * r.costIdx : 0)
        + (yr === 2 ? su.platformBalanceY2 : 0);
      r.contingency = (r.salesMarketing + r.ga + r.setup) * O.contingency;
      r.opex = r.salesMarketing + r.ga + r.setup + r.contingency;
      r.ebitda = r.grossProfit - r.opex;
      r.ebitdaMargin = r.revenue ? r.ebitda / r.revenue : 0;
      r.pbt = r.ebitda;
      r.taxable = Math.max(0, r.pbt - lossCF);
      lossCF = Math.max(0, lossCF - r.pbt);
      r.lossCF = lossCF;
      r.tax = r.taxable * F.tax;
      r.netProfit = r.pbt - r.tax;

      // cash
      const up = F.upfront;
      r.cashIn = (r.bookings + r.refunds) * (up + (1 - up) * mid) + (p.bookings !== undefined ? (p.bookings + p.refunds) : 0) * (1 - up) * (1 - mid);
      r.timing = (F.partnerUpfront - mid) * (r.programYears * W.delivery * r.costIdx - p.programYears * W.delivery * p.costIdx) * S.partnerCost * wr;
      r.cashOut = r.revenue - r.netProfit + r.timing;
      r.netCash = r.cashIn - r.cashOut;
      cumCash += r.netCash;
      r.cumCash = cumCash;
      unearned = Math.max(0, unearned + r.cashIn - r.revenue);
      r.unearned = unearned;
      r.cumAfterReserve = r.cumCash - unearned * F.reserve[i];
      // leads needed for the same client plan once partners lift conversion and referrals
      r.leads = fn.leads[i] * (al.conversion / fn.conversion) * (1 - fn.referralShare) / (1 - al.referralShare);
      y.push(r);
      prev = r;
    }
    const out = { years: y };
    out.peakBeforeReserve = -Math.min(0, ...y.map((r) => r.cumCash));
    out.peakAfterReserve = -Math.min(0, ...y.map((r) => r.cumAfterReserve));
    out.firstEbitda = (y.findIndex((r) => r.ebitda > 0) + 1) || null;
    out.firstCash = (y.findIndex((r) => r.netCash > 0) + 1) || null;
    out.netProfit5 = sum(y.map((r) => r.netProfit));
    return out;
  }

  // ------------------------------------------------------------ monthly cash, first 36 months (base case)
  function monthly(E, UE, P) {
    const F = E.finance, fn = E.funnel, S = E.scenarios.base;
    const Y = P.years, W = UE.w;
    const wr = 1 - fn.withdraw * fn.refund;
    const share = [];
    for (let m = 0; m < MONTHS; m++) share.push(m < 12 ? E.monthly.y1Cohorts[m] : 1 / 12);
    const rows = [];
    let cum = 0, cumPaid = 0, cumEarned = 0;
    for (let m = 0; m < MONTHS; m++) {
      const yi = Math.floor(m / 12), yr = Y[yi];
      const r = { m: m + 1, year: yi + 1 };
      r.newC = share[m] * yr.newClients;
      r.renewC = m < 12 ? 0 : rows[m - 12].newC * S.renewal + (m >= 24 ? rows[m - 12].renewC * E.retention.y3 : 0);
      r.started = r.newC + r.renewC;
      r.priceNew = yr.bNew / Math.max(yr.newClients, 0.0001);
      r.priceRenew = yi === 0 ? 0 : yr.bRenew / Math.max(yr.renewing, 0.0001);
      r.value = r.newC * r.priceNew + r.renewC * r.priceRenew;
      r.enrolPay = r.value * F.upfront * wr;
      r.balance = m >= 6 ? rows[m - 6].value * (1 - F.upfront) * wr : 0;
      const setupM = E.monthly.setupMonths;
      r.addons = yi === 0 ? (m >= setupM ? (yr.bAddon + yr.bExpComp - yr.addonDelivery) / (12 - setupM) : 0) : (yr.bAddon + yr.bExpComp - yr.addonDelivery) / 12;
      r.cashIn = r.enrolPay + r.balance + r.addons;
      const pc = yr.costIdx * S.partnerCost * wr;
      r.firstVisit = r.started * W.first * pc;
      let win = 0; for (let k = Math.max(0, m - 11); k < m; k++) win += rows[k].started;
      win += r.started;
      r.restYear = win * (W.delivery - W.first) / 12 * pc;
      r.acq = r.newC * (yr.acquisition + yr.referral) / Math.max(yr.newClients, 0.0001);
      r.processing = r.cashIn * E.addons.processing;
      r.salaries = (yr.careTeam + yr.advisors + yr.leadership) / 12;
      r.overheads = (yr.brand + yr.office + yr.legal + yr.insurance + yr.accounting + yr.platformFee + yr.travel + yr.contingency) / 12;
      r.setup = m < setupM ? Y[0].setup / setupM : (m === 12 ? Y[1].setup : (m === 24 ? Y[2].setup : 0));
      r.cashOut = r.firstVisit + r.restYear + r.acq + r.processing + r.salaries + r.overheads + r.setup;
      r.net = r.cashIn - r.cashOut;
      cum += r.net; r.cum = cum;
      // reserve on unearned client cash
      r.progStarted = r.value * wr;
      let ew = 0; for (let k = Math.max(0, m - 11); k < m; k++) ew += rows[k].progStarted;
      ew += r.progStarted;
      r.earned = ew / 12;
      cumPaid += r.enrolPay + r.balance; cumEarned += r.earned;
      r.unearned = Math.max(0, cumPaid - cumEarned);
      r.held = r.unearned * F.reserve[yi];
      r.cumAfter = r.cum - r.held;
      rows.push(r);
    }
    const low = Math.min(...rows.map((r) => r.cum));
    const lowA = Math.min(...rows.map((r) => r.cumAfter));
    return {
      rows,
      lowBefore: -Math.min(0, low),
      lowMonth: rows.findIndex((r) => r.cum === low) + 1,
      lowAfter: -Math.min(0, lowA),
      lowAfterMonth: rows.findIndex((r) => r.cumAfter === lowA) + 1,
      raise: -Math.min(0, lowA) * (1 + F.buffer),
    };
  }

  // ------------------------------------------------------------ everything
  function compute(A) {
    const E = resolve(A);
    const UE = unitEconomics(E);
    const res = { E, UE, scen: {} };
    SCEN.forEach((s, i) => { res.scen[s] = annual(E, UE, i); });
    const base = res.scen.base;
    res.monthly = monthly(E, UE, base);
    SCEN.forEach((s) => {
      const P = res.scen[s];
      P.raise = Math.max(P.peakAfterReserve * (1 + E.finance.buffer), s === "base" ? res.monthly.raise : 0);
      P.cashEnd = P.years[4].cumCash + P.raise;
    });
    res.funding = base.raise;
    return res;
  }

  const api = { compute, resolve, getPath, setPath, clone, SCEN, YEARS, MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.APModel = api;
})(typeof window !== "undefined" ? window : globalThis);
