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
  // months from marketing spend to the support payment (v5/v6 default: a year)
  const supportLag = (SP) => Math.max(0, Math.round(SP && SP.lagMonths != null ? SP.lagMonths : SP && SP.lagYears != null ? SP.lagYears * 12 : 12));
  // a per-year input given either as one value or as Y1–Y5 (the last value carries on)
  const atYear = (x, i) => (Array.isArray(x) ? x[Math.min(i, x.length - 1)] : x);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const roundUp = (v) => Math.ceil(v - 1e-9);

  // Split a whole number over weights so the parts are whole and add up (largest remainder).
  function allocate(total, weights) {
    const w = sum(weights);
    if (w <= 0 || total <= 0) return weights.map(() => 0);
    const raw = weights.map((x) => total * x / w);
    const out = raw.map(Math.floor);
    let left = Math.round(total - sum(out));
    const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
    return out;
  }

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
      if (!Array.isArray(o) && o[k] == null) o[k] = {};
      o = Array.isArray(o) && !/^\d+$/.test(k) ? o.find((x) => x.id === k) : o[k];
    }
    const last = parts[parts.length - 1];
    if (last === "*") { for (let i = 0; i < o.length; i++) o[i] = value; }
    else o[last] = value;
  }

  // Payment profile: the share of what a client owes after the deposit that is paid k months after the first
  // visit (index k). Per visit (finance.payment.byVisit): each package pays its visit shares before each visit,
  // visits spread evenly over the programme year, packages weighted by their share of programme value.
  // Otherwise: startShare at the first visit and the rest in balanceMonths equal monthly instalments.
  function payProfile(PAY, UE) {
    const p = Array(25).fill(0);
    if (PAY.byVisit) {
      let tot = 0;
      for (const c of UE.cols) {
        const n = Math.max(1, Math.round(c.visits)), w = c.share * c.price;
        let sh = PAY.byVisit[c.pkg];
        if (!Array.isArray(sh) || sh.length !== n) sh = Array(n).fill(1 / n);
        const t = sh.reduce((a, b) => a + b, 0) || 1;
        sh.forEach((x, j) => { p[Math.round(j * 12 / n)] += w * x / t; });
        tot += w;
      }
      return p.map((x) => (tot ? x / tot : 0));
    }
    const B = PAY.balanceMonths || 0, a = B ? PAY.startShare : 1;
    p[0] = a;
    for (let k = 1; k <= B; k++) p[k] = (1 - a) / B;
    return p;
  }

  // Partner volumes for a year's programme years by package: counts (hospital days, hotel nights, physician hours…)
  // and what they cost, at the year's cost level (k = cost index × partner cost multiplier × refund factor).
  // The USD lines add up to the year's partner delivery on a booked basis (programme years started in the year).
  function partnerVolumes(E, UE, py, k, kAtron) {
    const D = E.delivery, hd = 1 - D.hotelDiscount;
    const v = { hospitalDays: 0, hotelNights: 0, regionalBlocks: 0, visits: 0, physicianHours: 0, homeDraws: 0, boxMonths: 0 };
    const usd = { hospital: 0, hotels: 0, regional: 0, experiences: 0, transfers: 0, insurance: 0, physicians: 0, draws: 0, telehealth: 0, box: 0, platform: 0, support: 0, other: 0 };
    UE.cols.forEach((c, j) => {
      const n = py[j], l = j % 2, later = c.visits - 1;
      if (!n) return;
      v.hospitalDays += n; v.visits += n * c.visits; v.regionalBlocks += n * later;
      v.hotelNights += n * (D.firstNights[l] + later * D.laterNights[l]);
      v.physicianHours += n * D.physicianHours[l]; v.homeDraws += n * (D.homeDrawsPerYear - c.visits); v.boxMonths += n * 12;
      usd.hospital += n * D.hospitalDay[l];
      usd.hotels += n * (D.firstNights[l] * D.firstRate[l] + later * D.laterNights[l] * D.laterRate[l]) * hd;
      usd.regional += n * later * D.laterBlock[l];
      usd.experiences += n * (D.firstExperiences[l] + later * D.laterExperiences[l]);
      usd.transfers += n * (D.firstTransfers[l] + later * D.laterTransfers[l]);
      usd.insurance += n * c.visits * D.insurance[l];
      usd.physicians += n * c.physician; usd.draws += n * c.draws; usd.telehealth += n * c.tele; usd.box += n * c.box;
      usd.platform += n * c.platform; usd.support += n * c.support; usd.other += n * (c.report + c.wear);
    });
    for (const key of Object.keys(usd)) usd[key] *= key === "platform" ? kAtron : k;
    return { volumes: v, usd, total: sum(Object.values(usd)) };
  }

  // Monthly hiring (logic.monthlyStaff): every role starts in its start month and, once started, is sized month by month:
  // fixed roles at their minimum; the others by the month's active clients, the year's acquired clients, or the visits of the
  // last twelve months. Clients by month follow the pilot cohorts in year 1 and an even spread after; renewals come twelve
  // months after a start. Returns 60 months of headcount by role, and the drivers.
  function staffPlan(E, UE, S, newY, n, whole) {
    const team = E.team, base = E.scenarios.base.renewal, M60 = YEARS * 12;
    const comp = newY.map((v) => n(v * E.prices.companionShare)), acq = newY.map((v, i) => v - comp[i]);
    const nw = [];
    for (let y = 0; y < YEARS; y++) {
      const w = y === 0 ? E.monthly.y1Cohorts : Array(12).fill(1 / 12);
      nw.push(...(whole ? allocate(newY[y], w) : w.map((x) => x * newY[y])));
    }
    const r2 = [], r3 = [], r4 = [], started = [], active = [], visits = [], fte = [];
    for (let m = 0; m < M60; m++) {
      const back = m - 12;
      r2.push(back >= 0 ? nw[back] * S.renewal : 0);
      r3.push(back >= 0 ? r2[back] * E.retention.y3 * S.renewal / base : 0);
      r4.push(back >= 0 ? (r3[back] + r4[back]) * E.retention.y4 * S.renewal / base : 0);
      started.push(nw[m] + r2[m] + r3[m] + r4[m]);
      let a = 0; for (let k = Math.max(0, m - 11); k <= m; k++) a += started[k];
      active.push(a);
      let v = started[m];
      UE.cols.forEach((c) => { for (let q = 1; q < c.visits; q++) { const b = m - Math.round(q * 12 / c.visits); if (b >= 0) v += c.share * started[b]; } });
      visits.push(v);
      let v12 = 0; for (let k = Math.max(0, m - 11); k <= m; k++) v12 += visits[k];
      const y = Math.floor(m / 12), f = {};
      for (const t of team) {
        if (m + 1 < (t.start || 1)) { f[t.id] = 0; continue; }
        const need = t.driver === "new" ? acq[y] / t.ratio : t.driver === "active" ? active[m] / t.ratio : t.driver === "visits" ? v12 / t.ratio : 0;
        f[t.id] = t.driver === "fixed" ? t.min : Math.max(t.min, roundUp(need));
      }
      fte.push(f);
    }
    return { fte, active, visits, started };
  }

  // Partner case: switch groups in, apply their lever values ("Used now" column).
  function resolve(A) {
    const E = clone(A);
    const P = A.partners;
    const alone = { conversion: A.funnel.conversion, referralShare: A.funnel.referralShare };
    const IK = A.inKind || {};
    const inKind = new Set([...(IK.items || []), ...(IK.team || []).flatMap((id) => [`team.${id}.cost`, `team.${id}.y1`])]);
    for (const lv of P.levers) {
      if (P[lv.group] === 1 && !inKind.has(lv.path)) setPath(E, lv.path, lv.with);
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
        const ref3 = atYear(E.funnel.referralShare, 2);           // unit economics use year 3, like cost per lead
        const referral = ref3 * E.addons.referralCommission * price;
        const contribution = price - delivery - processing - referral;
        const cacY3 = E.funnel.costPerLead[2] / E.funnel.conversion;
        const acquisition = (1 - ref3) * cacY3 / (1 - E.funnel.cancelBeforeVisit);
        const afterAcq = contribution - acquisition;
        const renewPrice = price * pr.renewalPrice;
        const renewContribution = renewPrice * (1 - E.addons.processing) - delivery;
        const twoYear = afterAcq + E.scenarios.base.renewal * renewContribution;
        cols.push({
          pkg: p.id, name: p.name + (lvl ? " · Premium" : " · Standard"), share, visits, price,
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
    // Funnel stages (logic.funnelStages): conversion is lead -> deposit and cancelBeforeVisit the share of
    // deposits that never start, so started clients = leads x conversion x (1 - cancel) and lead spend =
    // leads x cost per lead exactly. Off (v5): conversion is lead -> started client.
    const stages = !!(E.logic && E.logic.funnelStages);
    const keep = stages ? 1 - fn.cancelBeforeVisit : 1;
    const plan = fn.leads.map((l, i) => l * al.conversion * keep / (1 - atYear(al.referralShare, i)) / (1 - E.prices.companionShare));
    // Whole clients: every count of people is a whole number, split over the six packages.
    const whole = !(E.logic && E.logic.wholeClients === false);
    const n = (v) => (whole ? Math.round(v + 1e-9) : v);
    const shares = UE.cols.map((c) => c.share);
    const split = (total) => (whole ? allocate(total, shares) : shares.map((x) => total * x));
    const dot = (counts, k) => sum(counts.map((c, j) => c * UE.cols[j][k]));
    let activeCountries = 0;
    const staff = E.logic && E.logic.monthlyStaff ? staffPlan(E, UE, S, plan.map((x) => n(x * S.volume)), n, whole) : null;
    // Costs carried by a partner in kind (Plus International): worked out in full, kept out of the P&L.
    const IK = E.inKind || {};
    const ikTeam = new Set(IK.team || []), ikItems = new Set(IK.items || []);
    // Ministry of Trade marketing support: a share of eligible marketing spend, received a year later.
    const SP = E.support || { marketingShare: 0 };
    // Payment schedule (finance.payment): deposit at sale, a share of the rest at the first visit, the remainder
    // in monthly instalments. Absent (v5): finance.upfront at enrolment, the balance six months later.
    const PAY = F.payment || null;
    // v6.2 corrections: referral commission on the undiscounted price, support also on the launch brand
    // and on same-year spend when the lag is under a year
    const fix = !!(E.logic && E.logic.corrections62);

    for (let i = 0; i < YEARS; i++) {
      const r = {};
      const yr = i + 1, pilot = yr === 1 ? 1 : 0;
      r.pilot = pilot;
      r.newClients = n(plan[i] * S.volume);
      r.companions = n(r.newClients * E.prices.companionShare);
      r.acquired = r.newClients - r.companions;
      r.referred = n(r.acquired * atYear(fn.referralShare, i));
      r.marketing = r.acquired - r.referred;
      r.deposits = stages ? r.marketing / (1 - fn.cancelBeforeVisit) : r.marketing;   // from marketing leads
      r.cancelled = r.deposits - r.marketing;
      if (i > 0) {
        const n2 = n(prev.newClients * S.renewal);
        const n3 = n(c2 * E.retention.y3 * S.renewal / baseRenew);
        const n4 = n((c3 + c4) * E.retention.y4 * S.renewal / baseRenew);
        c2 = n2; c3 = n3; c4 = n4;
      }
      r.renewing = c2 + c3 + c4;
      r.renew2 = c2; r.renew3 = c3; r.renew4 = c4;
      r.programYears = r.newClients + r.renewing;
      r.newByPkg = split(r.newClients);
      r.renewByPkg = split(r.renewing);
      r.pyByPkg = r.newByPkg.map((x, j) => x + r.renewByPkg[j]);
      r.active = mid * r.programYears + (1 - mid) * (prev ? prev.programYears : 0);
      r.visits = dot(r.pyByPkg, "visits");
      r.deliveryBase = dot(r.pyByPkg, "delivery");          // partner delivery at year-1 prices
      r.firstAvg = r.programYears ? dot(r.pyByPkg, "first") / r.programYears : W.first;
      r.deliveryAvg = r.programYears ? r.deliveryBase / r.programYears : W.delivery;
      r.platformBase = dot(r.pyByPkg, "platform");          // ATRON per-client fees inside partner delivery
      r.addonBuyers = n(r.programYears * E.addons.buyShare);
      r.expCompanions = n(r.visits * E.addons.expCompanionsPerVisit);
      r.priceIdx = Math.pow(1 + E.prices.listIncrease, yr - 1);
      r.costIdx = prev ? prev.costIdx * (1 + F.inflation[i]) : 1;
      r.atronIdx = E.atron ? Math.pow(1 + (E.atron.increase || 0), yr - 1) : r.costIdx;
      // partner delivery at this year's prices: the ATRON per-client fee at its own index, the rest at the cost index
      r.deliveryAt = (r.deliveryBase - r.platformBase) * r.costIdx + r.platformBase * r.atronIdx;
      r.partners = partnerVolumes(E, UE, r.pyByPkg, r.costIdx * S.partnerCost * wr, r.atronIdx * S.partnerCost * wr);

      // bookings
      const compShare = r.newClients ? r.companions / r.newClients : 0;
      r.bNew = dot(r.newByPkg, "price") * (1 - compShare * E.prices.companionDiscount) * S.price * r.priceIdx * (1 - pilot * E.prices.foundingDiscount);
      r.bRenew = dot(r.renewByPkg, "price") * E.prices.renewalPrice * S.price * r.priceIdx;
      r.bAddon = r.addonBuyers * E.addons.spend * r.priceIdx;
      r.bExpComp = r.expCompanions * E.addons.expCompanionPrice * r.priceIdx;
      r.bookings = r.bNew + r.bRenew + r.bAddon + r.bExpComp;
      r.refunds = -fn.withdraw * fn.refund * (r.bNew + r.bRenew);

      const p = prev || { bNew: 0, bRenew: 0, refunds: 0, bAddon: 0, bExpComp: 0, programYears: 0, costIdx: 0, visits: 0, deliveryBase: 0, deliveryAt: 0, expCompanions: 0 };
      r.progRevenue = mid * (r.bNew + r.bRenew + r.refunds) + (1 - mid) * (p.bNew + p.bRenew + p.refunds);
      r.addonRevenue = mid * (r.bAddon + r.bExpComp) + (1 - mid) * (p.bAddon + p.bExpComp);
      // deposits of clients who cancel before the first visit are kept
      r.forfeitRevenue = PAY && stages ? r.marketing * fn.cancelBeforeVisit / (1 - fn.cancelBeforeVisit) * PAY.deposit * r.priceIdx : 0;
      r.revenue = r.progRevenue + r.addonRevenue + r.forfeitRevenue;
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
      // with monthly hiring: year-end headcount, and cost month by month (the pilot-year factor no longer applies)
      const months = staff ? staff.fte.slice(i * 12, i * 12 + 12) : null;
      if (months) for (const t of team) fte[t.id] = months[11][t.id];
      r.fte = fte;
      r.fteTotal = sum(Object.values(fte));
      r.fteMonthly = months;
      const pay = (t) => (months ? sum(months.map((f) => f[t.id])) * t.cost * r.costIdx : fte[t.id] * t.cost * 12 * r.costIdx * (pilot * t.y1 + (1 - pilot)));
      r.salaryByMonth = months ? months.map((f) => sum(team.filter((t) => !ikTeam.has(t.id)).map((t) => f[t.id] * t.cost * r.costIdx))) : null;
      r.teamCost = {};
      r.inKindTeam = {};
      for (const t of team) {
        if (ikTeam.has(t.id)) { r.inKindTeam[t.id] = pay(t); r.teamCost[t.id] = 0; }
        else r.teamCost[t.id] = pay(t);
      }

      // cost of service
      r.partnerDelivery = (mid * r.deliveryAt + (1 - mid) * p.deliveryAt) * S.partnerCost * wr;
      r.addonDelivery = mid * (r.bAddon * (1 - E.addons.margin) + r.expCompanions * E.addons.expCompanionCost * r.costIdx)
        + (1 - mid) * (p.bAddon * (1 - E.addons.margin) + p.expCompanions * E.addons.expCompanionCost * p.costIdx);
      r.processing = r.revenue * E.addons.processing;
      r.referral = r.referred * E.addons.referralCommission * r.bNew / Math.max(r.newClients, 0.0001)
        / (fix ? 1 - compShare * E.prices.companionDiscount : 1);
      r.careTeam = sum(team.filter((t) => t.group === "care").map((t) => r.teamCost[t.id]));
      r.costOfService = r.partnerDelivery + r.addonDelivery + r.processing + r.referral + r.careTeam;
      r.grossProfit = r.revenue - r.costOfService;
      r.grossMargin = r.revenue ? r.grossProfit / r.revenue : 0;

      // opex
      const cac = fn.costPerLead[i] / fn.conversion;
      r.acquisition = r.marketing * cac * S.cac / (1 - fn.cancelBeforeVisit);
      r.brand = E.overheads.brand * 12 * r.costIdx;
      r.advisors = sum(team.filter((t) => t.group === "sales").map((t) => r.teamCost[t.id]));
      r.leadership = sum(team.filter((t) => t.group === "ga").map((t) => r.teamCost[t.id]));
      activeCountries += E.countries.opened[i];
      const O = E.overheads;
      r.office = O.office * 12 * r.costIdx;
      r.legal = O.legal * r.costIdx + Math.max(0, activeCountries - 1) * E.countries.running * r.costIdx;
      r.insurance = O.insurance * r.costIdx;
      r.accounting = O.accounting * r.costIdx;
      r.platformFee = O.platformFee * 12 * r.atronIdx * (pilot ? O.platformFeeY1 : 1);
      r.travel = O.travel * r.costIdx;
      r.inKindItems = {};
      for (const k of ["office", "legal", "insurance", "accounting", "platformFee", "travel", "brand"]) {
        if (ikItems.has("overheads." + k)) { r.inKindItems["overheads." + k] = r[k]; r[k] = 0; }
      }
      r.salesMarketing = r.acquisition + r.brand + r.advisors;
      r.ga = r.leadership + r.office + r.legal + r.insurance + r.accounting + r.platformFee + r.travel;
      const su = E.setup;
      const setupKeys = ["legal", "brand", "platform", "clinical", "recruitment", "contracting"];
      for (const k of setupKeys) if (pilot && ikItems.has("setup." + k)) r.inKindItems["setup." + k] = su[k];
      r.setup = pilot * sum(setupKeys.filter((k) => !ikItems.has("setup." + k)).map((k) => su[k]))
        + (yr > 1 ? E.countries.opened[i] * E.countries.oneOff * r.costIdx : 0)
        + (yr === 2 ? su.platformBalanceY2 : 0);
      r.contingency = (r.salesMarketing + r.ga + r.setup) * O.contingency;
      r.opex = r.salesMarketing + r.ga + r.setup + r.contingency;
      r.inKind = sum(Object.values(r.inKindTeam)) + sum(Object.values(r.inKindItems));
      r.mktEligible = r.acquisition + r.brand + (fix && pilot && !ikItems.has("setup.brand") ? su.brand : 0);
      // support arrives lag months after the spend; with spend even over its year, a lag of 12k + q months
      // brings (12 - q)/12 of year i-k's spend and q/12 of year i-k-1's
      const lag = supportLag(SP), lk = Math.floor(lag / 12), lq = lag % 12;
      const elig = (j) => (j >= 0 && j < i ? y[j].mktEligible : fix && j === i ? r.mktEligible : 0);
      r.marketingSupport = (SP.marketingShare || 0) * (elig(i - lk) * (12 - lq) / 12 + elig(i - lk - 1) * lq / 12);
      r.ebitda = r.grossProfit - r.opex + r.marketingSupport;
      r.ebitdaMargin = r.revenue ? r.ebitda / r.revenue : 0;
      r.pbt = r.ebitda;
      r.taxable = Math.max(0, r.pbt - lossCF);
      lossCF = Math.max(0, lossCF - r.pbt);
      r.lossCF = lossCF;
      r.tax = r.taxable * F.tax;
      r.netProfit = r.pbt - r.tax;

      // cash
      const up = F.upfront;
      if (PAY) {
        // share of a year's programme value collected in that year: deposit and first-visit payment in the
        // start year; instalments over B months after the first visit, of which 1 - B/24 fall in-year on average
        // per visit: a payment k months after a start spread evenly over the year falls in that year (12 - k)/12 of the time
        const prof = PAY.byVisit ? payProfile(PAY, UE) : null;
        const inYear = prof
          ? (dep) => dep + (1 - dep) * prof.reduce((a, x, k) => a + x * Math.max(0, (12 - k) / 12), 0)
          : (dep) => dep + (1 - dep) * (PAY.startShare + (1 - PAY.startShare) * Math.max(0, 1 - PAY.balanceMonths / 24));
        const depShare = r.newClients ? Math.min(1, PAY.deposit * r.priceIdx / (r.bNew / r.newClients)) : 0;
        const uN = inYear(depShare), uR = inYear(0);
        const wrY = (b) => b * (1 + (r.bNew + r.bRenew ? r.refunds / (r.bNew + r.bRenew) : 0));
        const pwr = (b) => b * (1 + (p.bNew + p.bRenew ? p.refunds / (p.bNew + p.bRenew) : 0));
        r.forfeited = r.forfeitRevenue;
        r.cashIn = wrY(r.bNew) * uN + wrY(r.bRenew) * uR + (prev ? pwr(p.bNew) * (1 - p.uN) + pwr(p.bRenew) * (1 - p.uR) : 0)
          + r.addonRevenue + r.forfeited;
        r.uN = uN; r.uR = uR;
      } else
      r.cashIn = (r.bookings + r.refunds) * (up + (1 - up) * mid) + (p.bookings !== undefined ? (p.bookings + p.refunds) : 0) * (1 - up) * (1 - mid);
      r.timing = (F.partnerUpfront - mid) * (r.deliveryAt - p.deliveryAt) * S.partnerCost * wr;
      // what ATRON receives: base fee, per-client fees (booked), set-up; the set-up balance converted to equity is not cash
      r.atron = { base: r.platformFee, perClient: r.partners.usd.platform, setup: pilot && !ikItems.has("setup.platform") ? E.setup.platform : 0,
        equity: yr === 2 && E.atron ? E.atron.setupToEquity || 0 : 0 };
      r.atron.total = r.atron.base + r.atron.perClient + r.atron.setup;
      r.cashOut = r.revenue - r.netProfit + r.timing;
      r.netCash = r.cashIn - r.cashOut;
      cumCash += r.netCash;
      r.cumCash = cumCash;
      unearned = Math.max(0, unearned + r.cashIn - r.revenue);
      r.unearned = unearned;
      r.cumAfterReserve = r.cumCash - unearned * F.reserve[i];
      // leads needed for the same client plan once partners lift conversion and referrals
      r.leads = fn.leads[i] * (al.conversion / fn.conversion) * (1 - atYear(fn.referralShare, i)) / (1 - atYear(al.referralShare, i));
      if (whole) r.leads = Math.ceil(r.leads - 1e-9);
      y.push(r);
      prev = r;
    }
    // Marketing paid L months before the clients it brings enrol: a year pays L/12 of next year's
    // acquisition and the rest of its own (year 1 pays all of its own). Year 5's next year is taken flat.
    const L = (E.monthly && E.monthly.marketingLeadMonths) || 0;
    if (L) {
      let cum = 0;
      y.forEach((r, i) => {
        const next = i < YEARS - 1 ? y[i + 1].acquisition : r.acquisition;
        r.mktTiming = L / 12 * (next - (i ? r.acquisition : 0));
        r.cashOut += r.mktTiming;
        r.netCash = r.cashIn - r.cashOut;
        cum += r.netCash; r.cumCash = cum;
        r.cumAfterReserve = r.cumCash - r.unearned * F.reserve[i];
      });
    }
    const out = { years: y, staff };
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
    const whole = !(E.logic && E.logic.wholeClients === false);
    // new clients per month: the year's total spread over its months (whole clients if set)
    const newM = [];
    const L = E.monthly.marketingLeadMonths || 0;
    const PAY = F.payment || null, SL = PAY ? PAY.saleToStartMonths || 0 : 0;
    const prof = PAY ? payProfile(PAY, UE) : null;
    const stages = !!(E.logic && E.logic.funnelStages);
    const fix = !!(E.logic && E.logic.corrections62);
    for (let yi = 0; yi < (L || SL ? 4 : 3); yi++) {
      const w = yi === 0 ? E.monthly.y1Cohorts : Array(12).fill(1 / 12);
      newM.push(...(whole ? allocate(Y[yi].newClients, w) : w.map((x) => x * Y[yi].newClients)));
    }
    const rows = [];
    let ren = [];
    let cum = 0, cumPaid = 0, cumEarned = 0;
    for (let m = 0; m < MONTHS; m++) {
      const yi = Math.floor(m / 12), yr = Y[yi];
      const r = { m: m + 1, year: yi + 1 };
      r.newC = newM[m];
      r.renewC = m < 12 ? 0 : rows[m - 12].newC * S.renewal + (m >= 24 ? rows[m - 12].renewC * E.retention.y3 : 0);
      if (whole && m >= 12) {
        if (m % 12 === 0) {
          // the year's renewing clients, spread like the cohorts they come from
          const w = [];
          for (let k = m; k < m + 12; k++) w.push(rows[k - 12].newC * S.renewal + (k >= 24 ? rows[k - 12].renewC * E.retention.y3 : 0));
          ren = allocate(yr.renewing, w);
        }
        r.renewC = ren[m % 12];
      }
      r.started = r.newC + r.renewC;
      r.priceNew = yr.bNew / Math.max(yr.newClients, 0.0001);
      r.priceRenew = yi === 0 ? 0 : yr.bRenew / Math.max(yr.renewing, 0.0001);
      r.value = r.newC * r.priceNew + r.renewC * r.priceRenew;
      if (PAY) {
        // deposit at sale, SL months before the first visit; marketing clients who cancel leave theirs behind
        const ys = Y[Math.floor((m + SL) / 12)];
        const cancelRate = stages ? (ys.marketing / Math.max(ys.newClients, 0.0001)) * E.funnel.cancelBeforeVisit / (1 - E.funnel.cancelBeforeVisit) : 0;
        // month 1 also takes the deposits of clients who start within the deposit lead time
        const starting = m === 0 ? newM.slice(0, SL + 1).reduce((x, v) => x + v, 0) : newM[m + SL];
        r.enrolPay = starting * (1 + cancelRate) * PAY.deposit * ys.priceIdx;
        r.forfeitPaid = starting * cancelRate * PAY.deposit * ys.priceIdx;   // never delivered, so never held back
        const owed = (r.newC * (r.priceNew - PAY.deposit * yr.priceIdx) + r.renewC * r.priceRenew) * wr;
        r.owed = owed;
        r.balance = owed * prof[0];
        r.instal = 0; for (let k = 1; k < prof.length; k++) if (m - k >= 0 && prof[k]) r.instal += rows[m - k].owed * prof[k];
      } else {
        r.enrolPay = r.value * F.upfront * wr;
        r.balance = m >= 6 ? rows[m - 6].value * (1 - F.upfront) * wr : 0;
        r.instal = 0;
      }
      const setupM = E.monthly.setupMonths;
      const months = yi === 0 ? (m >= setupM ? 12 - setupM : 0) : 12;
      // add-on and companion cash: this year's bookings less the cost of delivering them (fix), or v5's
      // bookings less the recognised cost
      const addonCost = fix ? yr.bAddon * (1 - E.addons.margin) + yr.expCompanions * E.addons.expCompanionCost * yr.costIdx : yr.addonDelivery;
      r.addonsGross = months ? (yr.bAddon + yr.bExpComp) / months : 0;
      r.addons = months ? (yr.bAddon + yr.bExpComp - addonCost) / months : 0;
      r.cashIn = r.enrolPay + r.balance + r.instal + r.addons;
      const pc = yr.costIdx * S.partnerCost * wr;
      r.firstVisit = r.started * yr.firstAvg * pc;
      // visit load: a package with v visits comes back every 12 / v months; the mix gives the share of each package
      r.firstVisits = r.started; r.laterVisits = 0; r.hotelNights = 0;
      UE.cols.forEach((c, j) => {
        const l = j % 2, D = E.delivery;
        r.hotelNights += c.share * r.started * D.firstNights[l];
        for (let q = 1; q < c.visits; q++) {
          const back = m - Math.round(q * 12 / c.visits), from = back >= 0 ? rows[back].started : 0;
          r.laterVisits += c.share * from; r.hotelNights += c.share * from * D.laterNights[l];
        }
      });
      r.visits = r.firstVisits + r.laterVisits;
      let win = 0; for (let k = Math.max(0, m - 11); k < m; k++) win += rows[k].started;
      win += r.started;
      const platAvg = yr.programYears ? yr.platformBase / yr.programYears : 0;
      r.restYear = win * ((yr.deliveryAvg - yr.firstAvg - platAvg) * yr.costIdx + platAvg * yr.atronIdx) / 12 * S.partnerCost * wr;
      // lead spend is paid L months before the clients it brings enrol; referral commission at enrolment
      const ahead = Y[Math.floor((m + L) / 12)];
      const perLead = ahead.acquisition / Math.max(ahead.newClients, 0.0001);
      // month 1 also pays for clients who start within the lead time (their marketing would fall before month 1)
      r.leadSpend = (m === 0 ? newM.slice(0, L + 1).reduce((a, x) => a + x, 0) * Y[0].acquisition / Math.max(Y[0].newClients, 0.0001) : newM[m + L] * perLead);
      r.acq = r.leadSpend + r.newC * yr.referral / Math.max(yr.newClients, 0.0001);
      r.processing = (fix ? r.enrolPay + r.balance + r.instal + r.addonsGross : r.cashIn) * E.addons.processing;
      r.salaries = yr.salaryByMonth ? yr.salaryByMonth[m % 12] : (yr.careTeam + yr.advisors + yr.leadership) / 12;
      r.overheads = (yr.brand + yr.office + yr.legal + yr.insurance + yr.accounting + yr.platformFee + yr.travel + yr.contingency) / 12;
      r.setup = m < setupM ? Y[0].setup / setupM : (m === 12 ? Y[1].setup : (m === 24 ? Y[2].setup : 0));
      r.cashOut = r.firstVisit + r.restYear + r.acq + r.processing + r.salaries + r.overheads + r.setup;
      // marketing support: a share of the month's eligible spend comes back twelve months later
      r.mktSpend = r.leadSpend + yr.brand / 12
        + (fix && m < setupM && !((E.inKind || {}).items || []).includes("setup.brand") ? E.setup.brand / setupM : 0);
      const sl = supportLag(E.support);
      r.support = m >= sl ? ((E.support && E.support.marketingShare) || 0) * rows[m - sl].mktSpend : 0;
      r.cashIn += r.support;
      r.net = r.cashIn - r.cashOut;
      cum += r.net; r.cum = cum;
      // reserve on unearned client cash
      r.progStarted = r.value * wr;
      let ew = 0; for (let k = Math.max(0, m - 11); k < m; k++) ew += rows[k].progStarted;
      ew += r.progStarted;
      r.earned = ew / 12;
      cumPaid += r.enrolPay + r.balance + r.instal - (fix ? r.forfeitPaid || 0 : 0); cumEarned += r.earned;
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
  // No growth investment: new clients held at the chosen year's level (leads and marketing
  // flat from then on), no further source countries.
  function noGrowthPlan(A) {
    const B = clone(A);
    const h = Math.min(YEARS, Math.max(1, (A.noGrowth && A.noGrowth.holdYear) || 1)) - 1;
    for (let i = h + 1; i < YEARS; i++) {
      B.funnel.leads[i] = A.funnel.leads[h];
      B.countries.opened[i] = 0;
    }
    return B;
  }
  function core(A) {
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
  // Pre-seed + seed: the pre-seed carries the plan to the seed month (low point plus buffer); the seed
  // covers the rest of the funding need, and anything above that is surplus.
  function rounds(A, res) {
    const Rd = A.rounds || {};
    const X = Math.min(MONTHS - 1, Math.max(1, Math.round(Rd.seedMonth || 9))), seed = Math.max(0, Rd.seedAmount || 0);
    const buf = 1 + A.finance.buffer;
    // pre-seed: a fixed amount when set, otherwise sized to the low point up to the seed month plus the buffer
    const preNeeded = lowTo(res.monthly, X) * buf;
    const fixed = Rd.preSeedAmount > 0;
    const pre = fixed ? Rd.preSeedAmount : preNeeded;
    const out = { seedMonth: X, seed, pre, fixed, preNeeded, total: pre + seed, single: res.funding };
    // the month the pre-seed alone runs out (cash after the reserve below zero), and what is left at the low point before the seed
    const out1 = res.monthly.rows.findIndex((r) => r.cumAfter + pre < -0.5);
    out.preLasts = out1 < 0 ? MONTHS : out1;
    out.cushion = pre - lowTo(res.monthly, X);
    out.seedNeeded = Math.max(0, res.funding - pre);
    out.surplus = seed - out.seedNeeded;
    out.cash = roundsPath(res.monthly, out);
    out.low = Math.min(...out.cash);
    out.lowMonth = out.cash.indexOf(out.low) + 1;
    return out;
  }
  const lowTo = (mo, k) => -Math.min(0, ...mo.rows.slice(0, k).map((r) => r.cumAfter));
  const roundsPath = (mo, rd) => mo.rows.map((r) => r.cumAfter + rd.pre + (r.m > rd.seedMonth ? rd.seed : 0));
  // A plan is carried by the rounds when they cover its funding need and the pre-seed still reaches the seed month.
  function carried(A, rd, r) {
    return r.funding <= rd.total + 0.5 && lowTo(r.monthly, rd.seedMonth) * (1 + A.finance.buffer) <= rd.pre + 0.5;
  }

  // Growth options after the seed: leads scaled from the first year whose marketing is paid after it.
  const GROWTH = [1, 1.5, 2, 3];
  function growthOptions(A, res) {
    const rd = res.rounds, L = (A.monthly && A.monthly.marketingLeadMonths) || 0;
    const fromYear = Math.floor((rd.seedMonth + L - 1) / 12) + 2;
    const options = fromYear > YEARS ? [] : GROWTH.map((g) => {
      const B = clone(A);
      for (let i = fromYear - 1; i < YEARS; i++) B.funnel.leads[i] = Math.round(A.funnel.leads[i] * g);
      const r = g === 1 ? res : core(B);
      return { g, plan: r.scen.base, need: r.funding, covered: carried(A, rd, r), cash: roundsPath(r.monthly, rd) };
    });
    const ok = options.filter((o) => o.covered);
    return { fromYear, options, growth: ok.length ? ok[ok.length - 1] : null };
  }

  // ------------------------------------------------------------ business scenarios
  // Each case is a set of input changes on the plan, computed in full (P&L, monthly cash, funding).
  // hold "plan": leads re-solved so the new-client plan stays as set (more or fewer leads to buy);
  // hold "budget": leads as set, so the client plan moves instead.
  const clientsPerLead = (A, i) => {
    const f = A.funnel, keep = A.logic && A.logic.funnelStages ? 1 - f.cancelBeforeVisit : 1;
    return f.conversion * keep / (1 - atYear(f.referralShare, i)) / (1 - A.prices.companionShare);
  };
  function applyCase(A, cs, hold) {
    const B = clone(A);
    for (const c of cs.changes || []) setPath(B, c.path, clone(c.value));
    if (hold === "plan") B.funnel.leads = A.funnel.leads.map((l, i) => Math.round(l * clientsPerLead(A, i) / clientsPerLead(B, i)));
    return B;
  }
  function scenarioCase(A, res, cs, hold) {
    const B = applyCase(A, cs, hold);
    const r = cs.changes && cs.changes.length ? core(B) : res, P = r.scen.base;
    const rd = rounds(B, r);
    return {
      id: cs.id, label: cs.label, note: cs.note, plan: !(cs.changes && cs.changes.length),
      funding: r.funding, lowMonth: r.monthly.lowAfterMonth, preNeeded: rd.preNeeded, carried: carried(A, res.rounds, r),
      years: P.years, firstEbitda: P.firstEbitda, netProfit5: P.netProfit5,
      leads5: B.funnel.leads.reduce((a, v) => a + v, 0), spend5: P.years.reduce((a, y) => a + y.acquisition, 0),
    };
  }
  function scenarios(A, res, defs, holds) {
    return (defs.groups || []).map((g) => {
      const hold = g.holdable ? (holds && holds[g.id]) || "plan" : null;
      return { id: g.id, title: g.title, note: g.note, holdable: !!g.holdable, hold, cases: g.cases.map((cs) => scenarioCase(A, res, cs, hold)) };
    });
  }

  function compute(A) {
    const res = core(A);
    const ng = core(noGrowthPlan(A));
    res.noGrowth = Object.assign(ng.scen.base, { monthly: ng.monthly, funding: ng.funding });
    res.rounds = rounds(A, res);
    // the plan is funded by the two rounds: its year-5 cash includes both
    res.scen.base.cashEnd = res.scen.base.years[4].cumCash + res.rounds.total;
    return res;
  }

  const api = { payProfile, atYear, compute, growthOptions, scenarios, applyCase, carried, noGrowthPlan, resolve, getPath, setPath, clone, SCEN, YEARS, MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.APModel = api;
})(typeof window !== "undefined" ? window : globalThis);
