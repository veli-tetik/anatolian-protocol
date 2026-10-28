/* The Anatolian Protocol — forecast tool: state, routing and pages. */
(function () {
  "use strict";
  const M = window.APModel, C = window.APCharts, SCHEMA = window.APSchema;
  const $ = (s, r = document) => r.querySelector(s);
  const YRS = ["Y1", "Y2", "Y3", "Y4", "Y5"];
  const SC = { base: "Base", downside: "Downside", upside: "Upside" };
  const LS_DRAFT = "ap.plan.draft.diff", LS_VERSIONS = "ap.plan.versions";

  // ---------------------------------------------------------------- formatting
  const r0 = (v) => Math.round(v);
  const usd = (v) => (v < -0.5 ? "−" : "") + "$" + Math.abs(r0(v)).toLocaleString("en-GB");
  const kusd = (v) => {
    const a = Math.abs(v), s = v < -0.5 ? "−" : "";
    if (a >= 999500) return s + "$" + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
    if (a >= 1000) return s + "$" + Math.round(a / 1000) + "k";
    return s + "$" + Math.round(a);
  };
  const axis = (v, full) => (full ? usd(v) : kusd(v));
  const pct = (v, d = 0) => (v * 100).toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d }) + "%";
  const num = (v, d = 0) => v.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
  const pad2 = (x) => String(x).padStart(2, "0");
  const fmtDate = (t) => { const d = new Date(t); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  // input fields: UK style (12,500.5 and 15%); parsing accepts the same and rejects a decimal comma
  const fmtInput = (v, kind) => {
    if (kind === "pct") return (+(v * 100).toFixed(4)).toLocaleString("en-GB", { maximumFractionDigits: 4 }) + "%";
    return (+v).toLocaleString("en-GB", { maximumFractionDigits: 6 });
  };
  function parseInput(text, kind) {
    let t = String(text).trim().replace(/\s/g, "").replace(/^\$/, "").replace(/%$/, "");
    if (t.includes(",")) {
      if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return { error: "Use a full stop for decimals, for example 0.5." };
      t = t.replace(/,/g, "");
    }
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { error: "Enter a number, for example 12,500 or 0.5." };
    const v = parseFloat(t);
    return { value: kind === "pct" ? v / 100 : v };
  }
  const yearOf = (n) => (n ? "Y" + n : "After Y5");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------------------------------------------------------------- state
  const S = { balMode: "rounds", issues: [], ref: null, v6: null, scenDefs: { groups: [] }, holds: { conversion: "plan", referral: "plan" }, scenCache: null, A: null, name: "v6.3 plan", levers: [], pick: null, scen: "base", metric: "funding", changedOnly: false, R: null, refR: null };

  function flatten(A) {
    const out = {};
    const walk = (o, p) => {
      if (Array.isArray(o) && o.length && typeof o[0] === "object") {
        for (const it of o) for (const [k, v] of Object.entries(it)) if (typeof v === "number") out[`${p}.${it.id}.${k}`] = v;
        return;
      }
      if (Array.isArray(o) || typeof o !== "object" || o === null) { out[p] = o; return; }
      for (const [k, v] of Object.entries(o)) walk(v, p ? p + "." + k : k);
    };
    for (const [k, v] of Object.entries(A)) if (k !== "meta" && k !== "_alone") {
      if (k === "partners") { out["partners.operator"] = v.operator; out["partners.physicians"] = v.physicians; out["partners.revenueShare"] = v.revenueShare; }
      else walk(v, k);
    }
    return out;
  }
  function diff(A, B) {
    const fa = flatten(A), fb = flatten(B), d = [];
    for (const k of Object.keys(fa)) if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) d.push([k, fa[k], fb[k]]);
    return d;
  }
  const LABELS = (() => {
    const m = {};
    for (const s of SCHEMA) for (const f of s.fields) m[f.path] = f.label;
    m["partners.operator"] = "Partner switch: partner rates (Plus International)";
    m["partners.physicians"] = "Partner switch: physician network";
    m["partners.revenueShare"] = "Partner revenue share";
    m["monthly.y1Cohorts"] = "Pilot cohorts by month (year 1)";
    m["monthly.setupMonths"] = "Set-up months before launch";
    m["logic.funnelStages"] = "Funnel in stages";
    m["rounds.seedMonth"] = "Seed closes at the end of month";
    m["rounds.seedAmount"] = "Seed amount";
    m["rounds.preSeedAmount"] = "Pre-seed amount";
    m["monthly.marketingLeadMonths"] = "Marketing paid ahead of enrolment, months";
    m["inKind.team"] = "Team carried by Plus International in kind";
    m["inKind.items"] = "Costs carried by Plus International in kind";
    return m;
  })();
  const labelOf = (p) => {
    if (LABELS[p]) return LABELS[p];
    const t = p.match(/^team\.(\w+)\.(\w+)$/);
    if (t) { const r = S.A.team.find((x) => x.id === t[1]); return `${r ? r.name : t[1]}: ${{ cost: "monthly cost", ratio: "clients per FTE", min: "minimum FTE", y1: "pilot-year factor" }[t[2]] || t[2]}`; }
    const s = p.match(/^scenarios\.(\w+)\.(\w+)$/);
    if (s) return `${SC[s[1]]} scenario: ${{ volume: "volume multiplier", cac: "acquisition cost multiplier", price: "price realisation", renewal: "renewal into year 2", partnerCost: "partner cost multiplier" }[s[2]]}`;
    return p;
  };
  const fmtVal = (p, v) => {
    if (p === "inKind.team") return v.map((id) => (S.A.team.find((t) => t.id === id) || { name: id }).name).join(" · ") || "None";
    if (p === "inKind.items") return v.map((k) => IK_ITEMS[k] || k).join(" · ") || "None";
    if (Array.isArray(v)) return v.map((x) => fmtVal(p, x)).join(" · ");
    const f = SCHEMA.flatMap((s) => s.fields).find((x) => x.path === p);
    if (typeof v === "boolean") return v ? "On" : "Off";
    if (f && f.kind === "pct") return pct(v, 1).replace(".0%", "%");
    if (f && f.kind === "usd") return usd(v);
    return num(v, 3);
  };

  function recompute() {
    S.R = M.compute(S.A);
    S.issues = window.APChecks.check(S.A, S.R, SCHEMA);
    // the draft keeps only the inputs that differ from the reference plan, so a newer plan file shows through
    try { localStorage.setItem(LS_DRAFT, JSON.stringify({ name: S.name, d: diff(S.A, S.ref).map(([k, v]) => [k, v]) })); } catch (e) { /* storage unavailable */ }
    renderFoot();
  }
  // business scenarios, computed in full; cached until the plan or a hold choice changes
  function scen() {
    const key = JSON.stringify([S.A, S.holds]);
    if (!S.scenCache || S.scenCache.key !== key) S.scenCache = { key, groups: M.scenarios(S.A, S.R, S.scenDefs, S.holds) };
    return S.scenCache.groups;
  }
  const worst = (g) => g.cases.reduce((a, c) => (c.funding > a.funding ? c : a), g.cases[0]);
  function setA(A, name) { S.A = M.clone(A); if (name) S.name = name; S.pick = null; recompute(); }
  function versions() { try { return JSON.parse(localStorage.getItem(LS_VERSIONS) || "[]"); } catch (e) { return []; } }
  function saveVersions(v) { try { localStorage.setItem(LS_VERSIONS, JSON.stringify(v)); } catch (e) { toast("This browser does not allow saving. Export the plan as JSON instead."); } }
  function applyLevers(A, ids) {
    const B = M.clone(A);
    for (const lv of S.levers) if (ids.includes(lv.id)) for (const c of lv.changes) M.setPath(B, c.path, M.clone(c.value));
    return B;
  }

  // share link: only the inputs that differ from the reference plan (v6.3)
  function shareURL() {
    const d = diff(S.A, S.ref).map(([k, v]) => [k, v]);
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ n: S.name, d })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return location.href.split("#")[0] + "#/overview?plan=" + payload;
  }
  // the reference plan with a list of [path, value] changes applied
  function withChanges(d) {
    const A = M.clone(S.ref);
    for (const [k, v] of d || []) {
      const t = k.match(/^team\.(\w+)\.(\w+)$/);
      if (t) { const row = A.team.find((x) => x.id === t[1]); if (row) row[t[2]] = v; }
      else if (k === "inKind.team" || k === "inKind.items") { A.inKind = A.inKind || {}; A.inKind[k.split(".")[1]] = v; }
      else M.setPath(A, k, v);
    }
    return A;
  }
  function readShare() {
    const m = location.hash.match(/[?&]plan=([^&]+)/);
    if (!m) return false;
    try {
      const s = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")))));
      S.A = withChanges(s.d); S.name = (s.n || "Shared plan") + " (shared link)";
      history.replaceState(null, "", location.hash.replace(/[?&]plan=[^&]+/, ""));
      return true;
    } catch (e) { return false; }
  }

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------------------------------------------------------------- shell
  const PAGES = [
    { group: "Plan", items: [["overview", "Overview"], ["rounds", "Funding rounds"], ["funding", "Cash levers"], ["scenarios", "Scenarios"], ["sensitivity", "Sensitivity"]] },
    { group: "Report", items: [["rpackages", "Packages and price"], ["reconomics", "Client economics"], ["rgrowth", "Growth and profit"], ["rcash", "Cash and funding"], ["rcases", "Business cases"], ["rmust", "What must be true"], ["report", "Document"]] },
    { group: "Model", items: [["assumptions", "Assumptions"], ["unit", "Unit economics"], ["pnl", "P&L"], ["cash", "Monthly cash"], ["partners", "Partners"], ["checks", "Checks"]] },
    { group: "Work", items: [["versions", "Versions"]] },
  ];
  function route() { return (location.hash.match(/^#\/(\w+)/) || [])[1] || "overview"; }
  function renderNav() {
    const cur = route();
    const ne = S.issues.filter((i) => i.level === "error").length, nw = S.issues.length - ne;
    const badge = (id) => (id !== "checks" || !S.issues.length ? "" : `<span class="ui-count ${ne ? "bad" : "warn"}">${ne || nw}</span>`);
    $("#nav").innerHTML = PAGES.map((g) => `<div class="ui-nav-label">${g.group}</div>` + g.items.map(([id, t]) => `<a href="#/${id}"${id === cur ? ' aria-current="page"' : ""}>${t}${badge(id)}</a>`).join("")).join("");
  }
  function renderFoot() {
    const n = diff(S.A, S.ref).length;
    $("#foot").innerHTML = `<div class="row"><span>Version</span><b>${esc(S.name)}</b></div>
      <div class="row"><span>Changed from v6.3</span><b>${n} input${n === 1 ? "" : "s"}</b></div>
      <div class="row"><span>Checks</span><b class="${errCount() ? "delta-bad" : ""}">${checksTxt()}</b></div>
      <div class="row"><span>Rounds</span><b>${kusd(S.R.rounds.pre)} + ${kusd(S.R.rounds.seed)}</b></div>
      <div class="row"><span>Rounds carry the plan</span><b class="${roundsStatus().ok ? "" : "delta-bad"}">${roundsStatus().ok ? "Yes" : "No"}</b></div>
      <div>Draft kept in this browser.</div>`;
  }
  const errCount = () => S.issues.filter((i) => i.level === "error").length;
  // what the two rounds do for the plan: carried with the buffer, carried without it, or short
  function roundsStatus(R = S.R) {
    const Rd = R.rounds;
    if (Rd.preLasts < Rd.seedMonth) return { ok: false, text: `Pre-seed runs out in month ${Rd.preLasts + 1}, before the seed in month ${Rd.seedMonth}` };
    if (R.funding > Rd.total + 0.5) return { ok: false, text: `Both rounds ${kusd(R.funding - Rd.total)} short of the cash need` };
    if (Rd.preNeeded > Rd.pre + 0.5) return { ok: true, text: `Covered, but the pre-seed reaches month ${Rd.seedMonth} without the ${pct(S.A.finance.buffer)} buffer` };
    return { ok: true, text: `Covered with the ${pct(S.A.finance.buffer)} buffer; the pre-seed lasts to month ${Rd.preLasts >= 36 ? "36+" : Rd.preLasts}` };
  }
  function checksTxt() {
    const e = errCount(), w = S.issues.length - e;
    if (!e && !w) return "All passed";
    return [e ? `${e} error${e === 1 ? "" : "s"}` : "", w ? `${w} warning${w === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  }
  function checksBanner() {
    const e = errCount();
    if (!e) return "";
    return `<div class="ui-banner" role="alert">${e} input${e === 1 ? " breaks" : "s break"} a model rule, so some results are not reliable. <a href="#/checks">Review the checks</a>.</div>`;
  }
  const issuesFor = (path) => S.issues.filter((i) => i.path && (i.path === path || i.path.startsWith(path + ".")));
  function header(title, meta, actions = "") {
    return `<header class="ui-header"><div><h1>${title}</h1><div class="meta">${meta}</div></div><div class="ui-actions">${actions}</div></header>`;
  }
  const tile = (k, v, d = "", cls = "") => `<div class="ui-tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const deltaTxt = (now, was, lowerIsGood = false) => {
    const d = now - was;
    if (Math.abs(d) < 0.5) return "Same as v6.3";
    const good = lowerIsGood ? d < 0 : d > 0;
    return `<span class="${good ? "delta-good" : "delta-bad"}">${d > 0 ? "+" : "−"}${kusd(Math.abs(d))}</span> against v6.3`;
  };
  function table(head, rows) {
    return `<div class="ui-table-wrap"><table class="ui-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => {
      if (r.group) return `<tr class="group"><td colspan="${head.length}">${r.group}</td></tr>`;
      return `<tr class="${r.cls || ""}">${r.cells.map((c, i) => `<td class="${i && typeof c === "string" && c.startsWith("−") ? "neg" : ""}">${c}</td>`).join("")}</tr>`;
    }).join("")}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- pages
  const P = {};

  P.overview = () => {
    const R = S.R, B = R.scen.base, RF = S.refR, y5 = B.years[4];
    const html = header("Overview", `Base case · ${esc(S.name)} · USD, excl. VAT`, `<button class="ui-btn" data-go="funding">Lower the cash need</button>`)
      + checksBanner() + `<div class="ui-tiles">
        ${tile("Pre-seed + seed", `${kusd(R.rounds.pre)} + ${kusd(R.rounds.seed)}`, `<span class="${roundsStatus().ok ? "" : "delta-bad"}">${roundsStatus().text}</span>`, "focus")}
        ${tile("Cash need (low point + buffer)", kusd(R.funding), deltaTxt(R.funding, RF.funding, true))}
        ${tile("Lowest cash point", "Month " + R.monthly.lowAfterMonth, "After the prepayment reserve")}
        ${tile("First year with positive EBITDA", yearOf(B.firstEbitda), "Net cash positive: " + yearOf(B.firstCash))}
        ${tile("Year-5 revenue", kusd(y5.revenue), deltaTxt(y5.revenue, RF.scen.base.years[4].revenue))}
        ${tile("Year-5 EBITDA", kusd(y5.ebitda), pct(y5.ebitdaMargin) + " margin")}
        ${tile("Five-year net profit", kusd(B.netProfit5), deltaTxt(B.netProfit5, RF.scen.base.netProfit5))}
      </div>
      <div class="ui-grid">
        <section class="ui-panel"><h2>Revenue and EBITDA</h2><div class="sub">Base case, by year</div><div class="body"><div id="ch-rev"></div></div></section>
        ${balancePanel("ch-cash")}
      </div>
      <section class="ui-panel" style="margin-top:16px"><h2>Business scenarios</h2><div class="sub">Funding each group of cases needs, against the plan. Details and the cases themselves on the Scenarios page.</div><div class="body">${scenarioSummary()}</div></section>
      ${noGrowthPanel()}`;
    return [html, () => {
      C.bars($("#ch-rev"), { labels: YRS, series: [{ name: "Revenue", c: 2, values: B.years.map((y) => y.revenue) }, { name: "EBITDA", c: 1, negRed: true, values: B.years.map((y) => y.ebitda) }], fmt: axis });
      balanceChart($("#ch-cash"));
      C.bars($("#ch-ng"), { labels: YRS, series: [{ name: "Growth plan", c: 1, values: B.years.map((y) => y.ebitda) }, { name: "No growth investment", c: 2, values: R.noGrowth.years.map((y) => y.ebitda) }], fmt: axis });
    }];
  };
  // Monthly cash balance, one bar per month, shaded by year; the lowest month in red. "rounds": with the pre-seed on
  // day one and the seed after its month; "before": before funding, with the year-end view's low as a dashed line.
  function balancePanel(id) {
    const m = S.balMode;
    return `<section class="ui-panel"><div class="ui-panel-head"><h2>Cash balance, month by month</h2>
      <div class="ui-seg" role="group" aria-label="Cash balance view"><button data-bal="rounds" aria-pressed="${m === "rounds"}">With the rounds</button><button data-bal="before" aria-pressed="${m === "before"}">Before funding</button></div></div>
      <div class="sub">${m === "rounds"
        ? `Cumulative cash after the prepayment reserve, with the ${kusd(S.R.rounds.pre)} pre-seed on day one and the ${kusd(S.R.rounds.seed)} seed at the end of month ${S.R.rounds.seedMonth}. ${esc(roundsStatus().text)}.`
        : `Cumulative cash after the prepayment reserve, before any funding. The lowest month plus the ${pct(S.A.finance.buffer)} buffer is the cash need (${kusd(S.R.funding)}).`}</div>
      <div class="body"><div id="${id}"></div></div></section>`;
  }
  function balanceChart(host) {
    const R = S.R, mo = R.monthly, Rd = R.rounds, rows = mo.rows, withRounds = S.balMode === "rounds";
    const values = withRounds ? Rd.cash : rows.map((r) => r.cumAfter);
    const low = values.indexOf(Math.min(...values));
    const yearEnd = -R.scen.base.peakAfterReserve;
    C.monthBars(host, {
      values, labels: rows.map((r) => "M" + r.m), fmt: axis,
      lowLabel: `${kusd(values[low])} · M${low + 1}`,
      ref: withRounds ? null : (yearEnd < 0 ? { value: yearEnd, label: `Year-end view: ${kusd(yearEnd)}` } : null),
      marker: withRounds ? { i: Rd.seedMonth - 1, label: `Seed ${kusd(Rd.seed)}` } : null,
      tip: (i) => `<b>Month ${i + 1} · year ${Math.floor(i / 12) + 1}</b><div class="r"><span>Cash balance</span><span>${usd(values[i])}</span></div>`
        + `<div class="r"><span>Net cash flow in the month</span><span>${usd(rows[i].net)}</span></div>`
        + `<div class="r"><span>Held in reserve</span><span>${usd(rows[i].held)}</span></div>`
        + (withRounds && i === Rd.seedMonth ? `<div class="r"><span>Seed received</span><span>${usd(Rd.seed)}</span></div>` : ""),
    });
    document.querySelectorAll("[data-bal]").forEach((b) => (b.onclick = () => { S.balMode = b.dataset.bal; render(true); }));
  }
  function cashChart(host, mo, compare) {
    const rows = mo.rows;
    const series = [{ name: compare ? "Current plan" : "After reserve", c: 1, values: rows.map((r) => r.cumAfter) }];
    if (compare) series.push({ name: "With selected levers", c: 2, values: compare.rows.map((r) => r.cumAfter), dash: true });
    else series.push({ name: "Before reserve", c: 2, values: rows.map((r) => r.cum), dash: true });
    const lowSrc = compare || mo;
    const i = lowSrc.lowAfterMonth - 1;
    C.lines(host, { labels: rows.map((r) => "M" + r.m), series, fmt: axis, every: 6, mark: { i, v: lowSrc.rows[i].cumAfter, label: "Low " + kusd(-lowSrc.lowAfter) + " · M" + (i + 1) } });
  }
  // Base case against the same plan with new clients held flat (no growth investment).
  function noGrowthPanel() {
    const R = S.R, G = R.scen.base, N = R.noGrowth, h = (S.A.noGrowth && S.A.noGrowth.holdYear) || 1;
    const row = (lab, f, cls) => ({ cells: [lab, ...G.years.map((y, i) => f(y, i))], cls });
    const both = (k, fmt) => [row(`${k[0]}, growth plan`, (y) => fmt(y[k[1]])), row(`${k[0]}, no growth`, (y, i) => fmt(N.years[i][k[1]]), "minor")];
    return `<section class="ui-panel" style="margin-top:16px"><h2>Without growth investment</h2>
      <div class="sub">New clients held at the year-${h} level from Y${Math.min(5, h + 1)} on: marketing stays flat, no new source countries. Base case. EBITDA positive from ${yearOf(N.firstEbitda)}; five-year net profit ${kusd(N.netProfit5)}; funding ${kusd(N.funding)}.</div>
      <div class="ui-grid"><div class="body"><div id="ch-ng"></div></div><div class="body">${table(["Base case", ...YRS], [
        ...both(["New clients", "newClients"], (v) => num(v)),
        ...both(["Revenue", "revenue"], kusd),
        ...both(["EBITDA", "ebitda"], kusd),
        ...both(["Net profit", "netProfit"], kusd),
        ...both(["Cumulative cash", "cumCash"], kusd),
      ])}</div></div></section>`;
  }
  function scenarioSummary() {
    const G = scen(), base = S.R;
    if (!G.length) return `<div class="ui-empty">No business scenarios defined (data/scenarios.json).</div>`;
    return table(["Group", "Cash need: lowest", "Cash need: highest", "Hardest case", "Year-5 EBITDA range", "Cases carried by the rounds"], G.map((g) => {
      const f = g.cases.map((c) => c.funding), e = g.cases.map((c) => c.years[4].ebitda), w = worst(g);
      return { cells: [esc(g.title) + (g.hold ? `<br><small style="color:var(--ui-muted)">${g.hold === "plan" ? "same client plan" : "same marketing budget"}</small>` : ""), kusd(Math.min(...f)), kusd(Math.max(...f)), esc(w.label), `${kusd(Math.min(...e))} – ${kusd(Math.max(...e))}`, `${g.cases.filter((c) => c.carried).length} of ${g.cases.length}`] };
    }).concat([{ cells: ["Plan", kusd(base.funding), kusd(base.funding), "–", kusd(base.scen.base.years[4].ebitda), "–"], cls: "minor" }]));
  }

  P.rounds = () => {
    const Rd = S.R.rounds, mo = S.R.monthly, X = Rd.seedMonth, buf = pct(S.A.finance.buffer);
    const GO = M.growthOptions(S.A, S.R);
    const risks = [{ label: "Plan as set", funding: S.R.funding, carried: true }]
      .concat(scen().map((g) => { const w = worst(g); return { label: `${g.title}: ${w.label}`, funding: w.funding, carried: w.carried }; }))
      .concat([{ label: "No growth investment", funding: S.R.noGrowth.funding, carried: S.R.noGrowth.funding <= Rd.total + 0.5 }]);
    const short = Rd.surplus < -0.5;
    const html = header("Funding rounds", `Pre-seed to month ${X}, then a ${kusd(Rd.seed)} seed · base case · USD`)
      + checksBanner()
      + `<section class="ui-panel"><h2>Rounds</h2><div class="sub">Set a pre-seed amount, or leave it at 0 to size it to the lowest cash point up to the seed month plus the ${buf} buffer. The seed covers the rest of the plan's cash need; anything above that is surplus.</div><div class="body">
        <div class="ui-field"><div class="lbl">Seed closes at the end of month</div><div class="inputs">${inputHTML("rounds.seedMonth", "int", "narrow")}</div></div>
        <div class="ui-field"><div class="lbl">Pre-seed amount<small>0 = sized automatically</small></div><div class="inputs">${inputHTML("rounds.preSeedAmount", "usd")}</div></div>
        <div class="ui-field"><div class="lbl">Seed amount</div><div class="inputs">${inputHTML("rounds.seedAmount", "usd")}</div></div>
        ${issuesFor("rounds").map((m) => `<small class="ui-msg ${m.level}">${esc(m.msg)}</small>`).join("")}</div></section>
      <div class="ui-tiles">
        ${tile("Pre-seed", kusd(Rd.pre), Rd.fixed ? `Sized for month ${X} with ${buf} buffer: ${kusd(Rd.preNeeded)}` : `Carries the plan to month ${X}, incl. ${buf} buffer`, "focus")}
        ${tile("Pre-seed lasts", Rd.preLasts >= 36 ? "36+ months" : "To month " + Rd.preLasts, Rd.cushion >= 0 ? `${kusd(Rd.cushion)} left at the low point before the seed` : `${kusd(-Rd.cushion)} short before the seed`)}
        ${tile("Seed the plan needs", kusd(Rd.seedNeeded), `Of a ${kusd(Rd.seed)} seed`)}
        ${tile(short ? "Seed shortfall" : "Seed surplus", kusd(Math.abs(Rd.surplus)), short ? "Raise more or close later" : "Free for growth and risk")}
        ${tile("Raised in both rounds", kusd(Rd.total), `Cash need ${kusd(S.R.funding)} (low point + buffer)`)}
        ${tile("Lowest cash after both rounds", kusd(Rd.low), "Month " + Rd.lowMonth)}
      </div>
      <section class="ui-panel"><h2>Cash after the rounds</h2><div class="sub">First 36 months, after the prepayment reserve: the pre-seed on day one, the seed at the end of month ${X}. ${esc(roundsStatus().text)}.</div><div class="body"><div id="ch-rounds"></div></div></section>
      ${growthPanel(GO)}
      <section class="ui-panel"><h2>Risks the two rounds carry</h2><div class="sub">The hardest case of each business scenario group (Scenarios page) against the ${kusd(Rd.total)} raised. Carried means both rounds cover its funding need and the ${kusd(Rd.pre)} pre-seed still reaches month ${X}.</div><div class="body">${table(["Case", "Cash need", "Raised", "Carried"], risks.map((x) => ({
        cells: [esc(x.label), kusd(x.funding), kusd(Rd.total), x.carried ? "Yes" : x.funding > Rd.total ? `No, ${kusd(x.funding - Rd.total)} short` : "No: the pre-seed runs out before the seed"],
      })))}</div></section>`;
    return [html, () => {
      const months = mo.rows.map((r) => "M" + r.m);
      const series = [{ name: "Pre-seed + seed", c: 1, values: Rd.cash }, { name: "Before funding", c: 2, values: mo.rows.map((r) => r.cumAfter), dash: true }];
      if (GO.growth && GO.growth.g > 1) series.push({ name: `Growth ×${GO.growth.g}`, c: 3, values: GO.growth.cash });
      C.lines($("#ch-rounds"), { labels: months, series, fmt: axis, every: 6, mark: { i: X - 1, v: Rd.cash[X - 1], label: "Seed · M" + X } });
      bindInputs();
    }];
  };
  // Growth options after the seed: leads scaled from the first year whose marketing starts after it.
  function growthPanel(Rd) {
    if (!Rd.options.length) return `<section class="ui-panel"><h2>Growth the rounds can carry</h2><div class="body"><div class="ui-empty">The seed closes too late for any plan year to start after it.</div></div></section>`;
    const O = Rd.options, fy = Rd.fromYear;
    const row = (lab, f, cls) => ({ cells: [lab, ...O.map(f)], cls });
    const allOk = O.every((o) => o.covered);
    const note = allOk
      ? `Every option is covered by the two rounds. The surplus also buys speed (team, countries, brand ahead of demand) and safety (risk cases below); the other limits are lead supply at this cost and delivery capacity.`
      : `Largest option covered: ${Rd.growth ? "×" + Rd.growth.g : "none"}.`;
    return `<section class="ui-panel"><h2>Growth the rounds can carry</h2><div class="sub">Leads × the multiplier from Y${fy}, the first year whose marketing is paid after the seed. ${note}</div><div class="body">${table(["Base case", ...O.map((o) => (o.g === 1 ? "Plan" : "×" + o.g))], [
      row("New clients by year", (o) => o.plan.years.map((y) => num(y.newClients)).join(" / ")),
      row("Revenue, Y5", (o) => kusd(o.plan.years[4].revenue)),
      row("EBITDA, Y5", (o) => kusd(o.plan.years[4].ebitda), "key"),
      row("Five-year net profit", (o) => kusd(o.plan.netProfit5)),
      row("First year with positive EBITDA", (o) => yearOf(o.plan.firstEbitda)),
      row("Funding needed", (o) => kusd(o.need)),
      row("Lowest cash after both rounds", (o) => kusd(Math.min(...o.cash))),
      row("Covered by the two rounds", (o) => (o.covered ? "Yes" : "No"), "total"),
    ])}</div></section>`;
  }

  P.funding = () => {
    if (!S.pick) S.pick = S.levers.map((l) => l.id);
    const base = S.R;
    // apply the picked levers one by one, in list order, to see what each takes off
    let A = M.clone(S.A), prev = base.funding;
    const steps = [];
    for (const lv of S.levers) {
      const on = S.pick.includes(lv.id);
      const B = applyLevers(A, [lv.id]);
      const Rb = M.compute(B);
      const delta = Rb.funding - prev;
      if (on) { steps.push({ lv, delta, R: Rb }); A = B; prev = Rb.funding; }
      else steps.push({ lv, delta, off: true, R: Rb });
    }
    const final = M.compute(A);
    const already = (lv) => lv.changes.every((c) => JSON.stringify(M.getPath(S.A, c.path)) === JSON.stringify(c.value) || (c.path.endsWith("*") && M.getPath(S.A, c.path) === c.value));
    const html = header("Cash levers", "Cash need = lowest cumulative cash after the prepayment reserve, plus the " + pct(S.A.finance.buffer) + " buffer · base case",
      `<button class="ui-btn ghost" id="pick-none">Clear</button><button class="ui-btn ghost" id="pick-all">Select all</button><button class="ui-btn primary" id="apply">Apply to plan</button>`)
      + `<div class="ui-tiles">
        ${tile("Current plan", kusd(base.funding), "Low point in month " + base.monthly.lowAfterMonth)}
        ${tile("With selected levers", kusd(final.funding), "Low point in month " + final.monthly.lowAfterMonth, "focus")}
        ${tile("Taken off", kusd(base.funding - final.funding), base.funding ? pct((base.funding - final.funding) / base.funding) + " lower" : "")}
        ${tile("First year with positive EBITDA", yearOf(final.scen.base.firstEbitda), "Five-year net profit " + kusd(final.scen.base.netProfit5))}
      </div>
      <section class="ui-panel"><h2>From the current plan to the minimum</h2><div class="sub">Each step is one lever, applied in order. Hover a bar for the amounts.</div><div class="body"><div id="ch-wf"></div></div></section>
      <div class="ui-grid">
        <section class="ui-panel"><h2>Levers</h2><div class="sub">Tick a lever to include it. The amount is what it takes off after the levers above it.</div><div class="body">${steps.map((s) => `
          <label class="ui-check"><input type="checkbox" data-lever="${s.lv.id}"${s.off ? "" : " checked"}>
            <span><span class="g">${esc(s.lv.group)}</span><br><span class="t">${esc(s.lv.label)}</span>${already(s.lv) ? '<span class="ui-tag active">In plan</span>' : ""}</span>
            <span class="amt ${s.delta < -0.5 ? "delta-good" : ""}">${s.off ? "<span style='color:var(--ui-muted)'>" + (Math.abs(s.delta) < 0.5 ? "–" : kusd(s.delta)) + "</span>" : Math.abs(s.delta) < 0.5 ? "–" : kusd(s.delta)}</span>
            <span class="x">${esc(s.lv.detail)}</span></label>`).join("")}
        </div><div class="ui-note">Not used as levers: the prepayment reserve (${S.A.finance.reserve.map((r) => pct(r)).join(" → ")}) and the funding buffer stay as they are, so the figure stays prudent. Edit or add levers in <code>data/levers.json</code>.</div></section>
        <section class="ui-panel"><h2>Cash, month by month</h2><div class="sub">Cumulative cash after the reserve: current plan against the selected levers</div><div class="body"><div id="ch-cash2"></div></div>
          <div class="body" style="padding-top:0">${table(["", "Current", "With levers"], [
            { cells: ["Cash need", kusd(base.funding), kusd(final.funding)], cls: "key" },
            { cells: ["EBITDA, Y1", kusd(base.scen.base.years[0].ebitda), kusd(final.scen.base.years[0].ebitda)] },
            { cells: ["EBITDA, Y2", kusd(base.scen.base.years[1].ebitda), kusd(final.scen.base.years[1].ebitda)] },
            { cells: ["Team in year 1 (FTE)", num(base.scen.base.years[0].fteTotal), num(final.scen.base.years[0].fteTotal)] },
            { cells: ["Year-5 EBITDA", kusd(base.scen.base.years[4].ebitda), kusd(final.scen.base.years[4].ebitda)] },
          ])}</div></section>
      </div>`;
    return [html, () => {
      C.waterfall($("#ch-wf"), { start: { name: "Current plan", value: base.funding }, steps: steps.filter((s) => !s.off && Math.abs(s.delta) >= 0.5).map((s) => ({ name: s.lv.short || s.lv.label, delta: s.delta })), endLabel: "With levers", fmt: axis });
      cashChart($("#ch-cash2"), base.monthly, final.monthly);
      document.querySelectorAll("[data-lever]").forEach((cb) => cb.addEventListener("change", () => {
        S.pick = [...document.querySelectorAll("[data-lever]:checked")].map((x) => x.dataset.lever); render();
      }));
      $("#pick-all").onclick = () => { S.pick = S.levers.map((l) => l.id); render(); };
      $("#pick-none").onclick = () => { S.pick = []; render(); };
      $("#apply").onclick = () => {
        if (!S.pick.length) { toast("Select at least one lever first."); return; }
        S.A = applyLevers(S.A, S.pick); if (!/levers/.test(S.name)) S.name = S.name + " + levers";
        recompute(); render(); toast("Levers applied. Save the plan on the Versions page to keep it.");
      };
    }];
  };

  P.scenarios = () => {
    const G = scen(), Rd = S.R.rounds;
    const groupHTML = (g) => {
      const C2 = g.cases;
      const row = (lab, f, cls) => ({ cells: [lab, ...C2.map(f)], cls });
      const hold = g.holdable ? `<div class="ui-seg" role="group" aria-label="Hold">${[["plan", "Same client plan"], ["budget", "Same marketing budget"]].map(([h, t]) => `<button data-hold="${g.id}:${h}" aria-pressed="${g.hold === h}">${t}</button>`).join("")}</div>` : "";
      const holdNote = !g.holdable ? "" : g.hold === "plan" ? " Same client plan: leads are re-solved so the new-client plan stays as set; lead spend moves." : " Same marketing budget: leads as set; the number of clients moves.";
      return `<section class="ui-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2>${esc(g.title)}</h2>${hold}</div><div class="sub">${esc(g.note || "")}${holdNote}</div><div class="body">${table(["", ...C2.map((c) => (c.plan ? "<b>" + esc(c.label) + "</b>" : esc(c.label)))], [
        row("Cash need (low point + buffer)", (c) => kusd(c.funding), "key"),
        row("Pre-seed needed / seed needed", (c) => `${kusd(c.preNeeded)} / ${kusd(Math.max(0, c.funding - c.preNeeded))}`),
        row(`Carried by the planned rounds (${kusd(Rd.pre)} + ${kusd(Rd.seed)})`, (c) => (c.carried ? "Yes" : c.funding > Rd.total + 0.5 ? `No, ${kusd(c.funding - Rd.total)} short` : `Pre-seed ${kusd(c.preNeeded - Rd.pre)} short`)),
        row("Lowest cash month", (c) => "M" + c.lowMonth, "minor"),
        row("New clients by year", (c) => c.years.map((y) => num(y.newClients)).join(" / ")),
        row("Leads bought, five years", (c) => num(c.leads5)),
        row("Lead spend, five years", (c) => kusd(c.spend5)),
        row("Revenue, Y5", (c) => kusd(c.years[4].revenue)),
        row("EBITDA, Y5", (c) => kusd(c.years[4].ebitda), "key"),
        row("First year with positive EBITDA", (c) => yearOf(c.firstEbitda)),
        row("Five-year net profit", (c) => kusd(c.netProfit5), "total"),
      ])}</div></section>`;
    };
    const html = header("Scenarios", "Business cases, one group at a time; every other input is the plan · computed in full, monthly cash included")
      + (G.length ? `<section class="ui-panel"><h2>Cash need by case</h2><div class="sub">Plan: ${kusd(S.R.funding)}. Lowest and highest case in each group.</div><div class="body">${scenarioSummary()}</div></section>` + G.map(groupHTML).join("")
        : `<div class="ui-empty">No business scenarios defined. Add them to <code>data/scenarios.json</code>.</div>`)
      + `<div class="ui-note">Cases are defined in <code>data/scenarios.json</code>: each is a set of input changes on the plan. Benchmarks come from a comparable health-tourism business.</div>`;
    return [html, () => {
      document.querySelectorAll("[data-hold]").forEach((b) => (b.onclick = () => { const [g, h] = b.dataset.hold.split(":"); S.holds[g] = h; render(true); }));
    }];
  };

  P.sensitivity = () => {
    const metric = S.metric;
    const val = (R) => (metric === "funding" ? R.funding : R.scen.base.netProfit5);
    const centre = val(S.R);
    const scale = (paths, f) => (A) => { for (const p of paths) { const v = M.getPath(A, p); M.setPath(A, p, Array.isArray(v) ? v.map((x) => x * f) : v * f); } };
    const tests = [
      ["New-client volume", 0.8, 1.2, (f) => (A) => { A.scenarios.base.volume *= f; }],
      ["List prices", 0.9, 1.1, (f) => (A) => { A.scenarios.base.price *= f; }],
      ["Acquisition cost", 0.8, 1.2, (f) => (A) => { A.scenarios.base.cac *= f; }],
      ["Partner delivery cost", 0.9, 1.1, (f) => (A) => { A.scenarios.base.partnerCost *= f; }],
      ["Renewal into year 2", 0.8, 1.2, (f) => (A) => { A.scenarios.base.renewal *= f; }],
      ["Team salaries", 0.8, 1.2, (f) => (A) => { for (const t of A.team) t.cost *= f; }],
      ["Overheads", 0.8, 1.2, (f) => scale(["overheads.office", "overheads.legal", "overheads.insurance", "overheads.accounting", "overheads.platformFee", "overheads.travel", "overheads.brand"], f)],
      ["One-off set-up", 0.8, 1.2, (f) => scale(["setup.legal", "setup.brand", "setup.platform", "setup.clinical", "setup.recruitment", "setup.contracting", "setup.platformBalanceY2"], f)],
      S.A.finance.payment
        ? ["Paid at the first visit", 0.8, 1.2, (f) => (A) => { A.finance.payment.startShare = Math.min(1, A.finance.payment.startShare * f); }]
        : ["Paid at enrolment", 0.9, 1.1, (f) => (A) => { A.finance.upfront = Math.min(1, A.finance.upfront * f); }],
      ["Founding discount", 0.5, 1.5, (f) => (A) => { A.prices.foundingDiscount *= f; }],
    ];
    const rows = tests.map(([name, lo, hi, mk]) => {
      const run = (f) => { const A = M.clone(S.A); mk(f)(A); return val(M.compute(A)); };
      const a = run(lo), b = run(hi);
      return { name, low: a, high: b, lowLabel: `${name} ×${lo}`, highLabel: `${name} ×${hi}`, span: Math.abs(b - a) };
    }).sort((x, y) => y.span - x.span);
    const html = header("Sensitivity", "One input at a time, the rest of the current plan held · base case",
      `<div class="ui-seg" role="group" aria-label="Metric"><button data-metric="funding" aria-pressed="${metric === "funding"}">Cash need</button><button data-metric="np" aria-pressed="${metric === "np"}">Five-year net profit</button></div>`)
      + `<section class="ui-panel"><h2>${metric === "funding" ? "Cash need" : "Five-year net profit"}: ${kusd(centre)} now</h2><div class="sub">Bars show the result with the input lower (green) and higher (orange). Largest swing first.</div><div class="body"><div id="ch-t"></div></div></section>
      <section class="ui-panel"><h2>Table view</h2><div class="body">${table(["Input", "Lower", "Result", "Higher", "Result", "Swing"], rows.map((r) => ({ cells: [r.name, r.lowLabel.split("×")[1] ? "×" + r.lowLabel.split("×")[1] : "", kusd(r.low), "×" + r.highLabel.split("×")[1], kusd(r.high), kusd(r.span)] })))}</div></section>`;
    return [html, () => {
      C.tornado($("#ch-t"), { rows, centre, fmt: axis, lowName: "Input lower", highName: "Input higher" });
      document.querySelectorAll("[data-metric]").forEach((b) => (b.onclick = () => { S.metric = b.dataset.metric; render(); }));
    }];
  };

  // The investor report (js/report.js): A4 pages, phone column and slides, generated from the current plan.
  const reportCtx = () => ({ A: S.A, R: S.R, name: S.name, data: S.report, M, C, kusd, usd, esc, roundsStatus, scen, IK_ITEMS });
  P.report = () => {
    const rp = window.APReport.render(reportCtx());
    return [header("Report document", rp.meta, rp.actions) + checksBanner() + rp.html, rp.after];
  };
  // The report's charts and tables as screens of the app: one screen per report section, each block a panel.
  for (const id of ["rpackages", "reconomics", "rgrowth", "rcash", "rcases", "rmust"]) {
    P[id] = () => {
      const sc = window.APReport.screens(reportCtx()).find((x) => x.id === id);
      const panels = sc.panels.map((p) => `<section class="ui-panel${p.wide ? " span-all" : ""}"><h2>${p.title}</h2>${p.sub ? `<div class="sub">${p.sub}</div>` : ""}<div class="body ap-fig">${p.body}</div></section>`).join("");
      const html = header(sc.title, sc.meta, `<button class="ui-btn" data-go="report">Open the document</button>`) + checksBanner()
        + (sc.kpis ? `<div class="ap-fig ap-top">${sc.kpis}</div>` : "") + `<div class="ui-grid ap-screen">${panels}</div>`;
      return [html, () => window.APReport.draw($("#main"))];
    };
  }

  // ---------------------------------------------------------------- inputs
  function inputHTML(path, kind, cls = "") {
    const v = M.getPath(S.A, path), r = M.getPath(S.ref, path);
    const changed = JSON.stringify(v) !== JSON.stringify(r);
    const bad = S.issues.some((i) => i.level === "error" && i.path === path);
    const title = changed && r !== undefined ? `v6.3: ${fmtInput(r, kind)}` : "";
    return `<input class="ui-input ${cls}${changed ? " changed" : ""}${bad ? " invalid" : ""}" type="text" inputmode="decimal" autocomplete="off" id="in-${path.replace(/\./g, "-")}" data-path="${path}" data-kind="${kind}" value="${fmtInput(v, kind)}" title="${title}"${bad ? ' aria-invalid="true"' : ""} aria-label="${esc(labelOf(path.replace(/\.\d+$/, "")))}">`;
  }
  function fieldHTML(f) {
    const v = M.getPath(S.A, f.path);
    if (v === undefined || v === null) return "";
    let inputs;
    if (f.shape === "pair") inputs = ["Standard", "Premium"].map((c, i) => `<label class="ui-input-cap"><span>${c}</span>${inputHTML(f.path + "." + i, f.kind)}</label>`).join("");
    else if (f.shape === "years") inputs = YRS.map((c, i) => `<label class="ui-input-cap"><span>${c}</span>${inputHTML(f.path + "." + i, f.kind, "narrow")}</label>`).join("");
    else if (f.shape === "visits") inputs = v.map((_, i) => `<label class="ui-input-cap"><span>Visit ${i + 1}</span>${inputHTML(f.path + "." + i, f.kind, "narrow")}</label>`).join("");
    else if (Array.isArray(v)) inputs = v.map((_, i) => `<label class="ui-input-cap"><span>${["Annual", "Summer–Winter", "Seasonal"][i] || i + 1}</span>${inputHTML(f.path + "." + i, f.kind, "narrow")}</label>`).join("");
    else if (f.kind === "bool") inputs = `<label class="ui-switch"><input type="checkbox" data-bool="${f.path}"${v !== false ? " checked" : ""}> ${v !== false ? "On" : "Off"}</label>`;
    else inputs = inputHTML(f.path, f.kind);
    const changed = JSON.stringify(v) !== JSON.stringify(M.getPath(S.ref, f.path));
    const unit = { usd: "USD" }[f.kind];
    const msgs = issuesFor(f.path);
    return `<div class="ui-field" data-field="${f.path}"><div class="lbl">${esc(f.label)}${unit ? ` <small style="display:inline">· ${unit}</small>` : ""}${f.note ? `<small>${esc(f.note)}</small>` : ""}${f.partner && (S.A.partners.operator || S.A.partners.physicians) ? "<small>A partner switch may override this value.</small>" : ""}
      <button class="ui-reset" data-reset="${f.path}"${changed ? "" : " hidden"}>Reset to v6.3</button>${msgs.map((m) => `<small class="ui-msg ${m.level}">${esc(m.msg)}</small>`).join("")}</div><div class="inputs">${inputs}</div></div>`;
  }
  function bindInputs() {
    document.querySelectorAll("input[data-path]").forEach((inp) => inp.addEventListener("change", () => {
      const r = parseInput(inp.value, inp.dataset.kind);
      if (r.error) { toast(r.error); inp.value = fmtInput(M.getPath(S.A, inp.dataset.path), inp.dataset.kind); return; }
      const v = r.value;
      M.setPath(S.A, inp.dataset.path, v);
      recompute();
      setTimeout(() => render(true), 0);   // let focus land on the next field first, then restore it
    }));
    document.querySelectorAll("[data-bool]").forEach((cb) => (cb.onchange = () => { M.setPath(S.A, cb.dataset.bool, cb.checked); recompute(); render(true); }));
    document.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () => {
      M.setPath(S.A, b.dataset.reset, M.clone(M.getPath(S.ref, b.dataset.reset))); recompute(); render(true);
    }));
  }
  function liveStrip() {
    const R = S.R, B = R.scen.base;
    return `<div class="ui-tiles">${tile("Cash need", kusd(R.funding), deltaTxt(R.funding, S.refR.funding, true), "focus")}${tile("First year with positive EBITDA", yearOf(B.firstEbitda))}${tile("Year-5 EBITDA", kusd(B.years[4].ebitda), pct(B.years[4].ebitdaMargin) + " margin")}${tile("Five-year net profit", kusd(B.netProfit5), deltaTxt(B.netProfit5, S.refR.scen.base.netProfit5))}</div>`;
  }

  P.assumptions = () => {
    const changed = new Set(diff(S.A, S.ref).map((d) => d[0]));
    const isCh = (p) => [...changed].some((c) => c === p || c.startsWith(p + "."));
    const secs = SCHEMA.map((s) => {
      const fields = s.fields.filter((f) => !S.changedOnly || isCh(f.path));
      if (!fields.length) return "";
      return `<section class="ui-panel"><h2>${s.title}</h2><div class="body">${fields.map(fieldHTML).join("")}</div></section>`;
    }).join("");
    const teamRows = S.A.team.filter((t) => !S.changedOnly || isCh("team." + t.id)).map((t) => ({ cells: [esc(t.name) + `<br><small style="color:var(--ui-muted)">${{ fixed: "Fixed", new: "per new clients", active: "per active clients", visits: "per visits" }[t.driver]}</small>`, inputHTML(`team.${t.id}.cost`, "usd", "narrow"), t.driver === "fixed" ? "–" : inputHTML(`team.${t.id}.ratio`, "num", "narrow"), inputHTML(`team.${t.id}.min`, "int", "narrow"), inputHTML(`team.${t.id}.y1`, "pct", "narrow")] }));
    const html = header("Assumptions", `${changed.size} input${changed.size === 1 ? "" : "s"} changed from v6.3 · highlighted · results update when you leave a field`,
      `<label class="ui-btn ghost" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="only"${S.changedOnly ? " checked" : ""}> Changed only</label><button class="ui-btn" id="reset-all">Reset all to v6.3</button>`)
      + checksBanner() + liveStrip()
      + `<div class="ui-cols">${secs}</div>`
      + (teamRows.length ? `<section class="ui-panel" style="margin-top:16px"><h2>F · Team</h2><div class="sub">Monthly cost to company. Headcount = max(minimum, clients ÷ ratio). The pilot-year factor is the share of year 1 on payroll.</div><div class="body">${table(["Role", "Monthly cost", "Clients per FTE", "Minimum FTE", "Pilot-year factor"], teamRows)}</div></section>` : "")
      + (S.changedOnly && !changed.size ? `<div class="ui-empty">No inputs differ from v6.3. Clear "Changed only" to see every input.</div>` : "");
    return [html, () => {
      bindInputs();
      $("#only").onchange = (e) => { S.changedOnly = e.target.checked; render(); };
      $("#reset-all").onclick = () => { setA(S.ref, "v6.3 plan"); render(); toast("All inputs reset to v6.3."); };
    }];
  };

  P.unit = () => {
    const U = S.R.UE, cols = [...U.cols, U.w];
    const r = (lab, k, f = usd, cls) => ({ cells: [lab, ...cols.map((c) => f(c[k]))], cls });
    const html = header("Unit economics", "One new client, first program year, at list price · before team, marketing and overheads")
      + `<section class="ui-panel"><div class="body">${table(["Line", ...cols.map((c) => c.name.replace(" · ", "<br>"))], [
        r("Share of clients", "share", (v) => pct(v, 1)), r("Visits to Türkiye", "visits", (v) => num(v, 2)), r("List price", "price", usd, "total"),
        { group: "Delivery costs" },
        r("First visit: measurement, hotel, experiences, transfers, insurance", "first"), r("Later visits", "later"), r("Program physician time", "physician"),
        r("Home-country blood draws", "draws"), r("Home-country physician / telehealth", "tele"), r("Monthly box and starter pack", "box"),
        r("Team travel and interpreters", "support"), r("Year-end report", "report"), r("Technology platform", "platform"), r("Loaner wearables", "wear"),
        r("Delivery cost", "delivery", usd, "total"),
        { group: "Contribution" },
        r("Payment processing", "processing"), r("Referral commission (expected)", "referral"),
        r("Client contribution", "contribution", usd, "total"), r("Client contribution, % of price", "contributionPct", (v) => pct(v, 1)),
        r("Acquisition cost, expected (Y3)", "acquisition"), r("Profit after acquisition", "afterAcq", usd, "key"),
        { group: "Renewing client" },
        r("Renewal price", "renewPrice"), r("Contribution of a renewing client", "renewContribution"),
        r("Two-year value of a new client", "twoYear", usd, "key"), r("Months to repay acquisition cost", "payback", (v) => num(v, 1)),
      ])}</div></section>`;
    return [html, () => {}];
  };

  function pnlRows(p) {
    const Y = p.years, row = (lab, f, cls) => ({ cells: [lab, ...Y.map(f)], cls });
    const u = (k) => (y) => usd(y[k]);
    return [
      { group: "Clients and activity" },
      row("New clients enrolled", (y) => num(y.newClients, 0)), row("Renewing clients", (y) => num(y.renewing, 0)), row("Program years sold", (y) => num(y.programYears, 0)),
      row("Active clients (average in care)", (y) => num(y.active, 0)), row("Visits to Türkiye", (y) => num(y.visits, 0)), row("Leads from paid marketing", (y) => num(y.leads, 0), "minor"),
      ...(S.A.logic && S.A.logic.funnelStages ? [row("Deposits from those leads", (y) => num(y.deposits, 0), "minor"), row("Deposits cancelled before the first visit", (y) => num(y.cancelled, 0), "minor"),
        row("Clients started from marketing", (y) => num(y.marketing, 0), "minor"), row("Clients through referral partners", (y) => num(y.referred, 0), "minor"), row("Companions with own protocol", (y) => num(y.companions, 0), "minor"),
        row("Lead spend per started marketing client", (y) => usd(y.marketing ? y.acquisition / y.marketing : 0), "minor")] : []),
      { group: "Bookings" },
      row("New-client programs", u("bNew")), row("Renewals", u("bRenew")), row("Clinical add-ons", u("bAddon")), row("Experience-only companions", u("bExpComp")),
      row("Total bookings", u("bookings"), "total"), row("Refunds to withdrawing clients", u("refunds")),
      { group: "Profit and loss" },
      row("Program revenue", u("progRevenue")), row("Add-on and companion revenue", u("addonRevenue")),
      ...(Y.some((y) => y.forfeitRevenue) ? [row("Forfeited deposits", u("forfeitRevenue"))] : []), row("Revenue", u("revenue"), "total"),
      row("Growth", (y, i) => (i ? pct(y.growth) : "–"), "minor"),
      row("Partner delivery", (y) => usd(-y.partnerDelivery)), row("Add-on and companion delivery", (y) => usd(-y.addonDelivery)), row("Payment processing", (y) => usd(-y.processing)),
      row("Referral commissions", (y) => usd(-y.referral)), row("Care team", (y) => usd(-y.careTeam)), row("Gross profit", u("grossProfit"), "total"), row("Gross margin", (y) => pct(y.grossMargin), "minor"),
      row("Client acquisition", (y) => usd(-y.acquisition)), row("Brand and content", (y) => usd(-y.brand)), row("Client advisors", (y) => usd(-y.advisors)),
      row("Leadership team", (y) => usd(-y.leadership)), row("Office, legal, insurance, accounting", (y) => usd(-(y.office + y.legal + y.insurance + y.accounting))),
      row("Technology platform base fee", (y) => usd(-y.platformFee)), row("Team travel, audits, events", (y) => usd(-y.travel)),
      row("One-off set-up and new countries", (y) => usd(-y.setup)), row("Contingency", (y) => usd(-y.contingency)), row("Operating expenses", (y) => usd(-y.opex), "total"),
      ...(Y.some((y) => y.marketingSupport) ? [row("Marketing support received (Ministry of Trade)", u("marketingSupport"))] : []),
      row("EBITDA", u("ebitda"), "key"), row("EBITDA margin", (y) => pct(y.ebitdaMargin), "minor"), row("Corporate tax", (y) => usd(-y.tax)), row("Net profit", u("netProfit"), "total"),
      { group: "Team" },
      row("Total team (FTE)", (y) => num(y.fteTotal)),
      ...inKindRows(p),
      { group: "Cash and funding" },
      row("Cash collected from clients", u("cashIn")), row("Cash paid out", (y) => usd(-y.cashOut)), row("Net cash flow", u("netCash"), "total"),
      row("Cumulative cash before funding", u("cumCash")), row("Client cash for service not yet delivered", u("unearned"), "minor"),
      row("Cumulative cash after the reserve", u("cumAfterReserve"), "total"),
    ];
  }
  // Memo: costs a partner carries in kind, worked out in full but kept out of the P&L.
  const IK_ITEMS = { "overheads.office": "Office and coworking", "overheads.legal": "Legal, regulatory, compliance", "overheads.insurance": "Liability insurance",
    "overheads.accounting": "Accounting, audit and admin", "overheads.platformFee": "Technology platform base fee", "overheads.travel": "Team travel, audits, events",
    "overheads.brand": "Brand and content", "setup.legal": "Set-up: legal, authorisations, US entity", "setup.brand": "Set-up: brand, website, launch content",
    "setup.platform": "Set-up: platform configuration", "setup.clinical": "Set-up: clinical method, mock journey", "setup.recruitment": "Set-up: recruitment and training",
    "setup.contracting": "Set-up: partner contracting and site audits" };
  function inKindRows(p) {
    const Y = p.years, IK = S.A.inKind || {};
    if (!Y.some((y) => y.inKind)) return [];
    const row = (lab, f, cls) => ({ cells: [lab, ...Y.map(f)], cls });
    return [
      { group: `Carried by ${IK.by || "partner"} in kind (memo, not in the P&L)` },
      ...(IK.team || []).map((id) => { const t = S.A.team.find((x) => x.id === id); return row(`${t ? t.name : id} (${Y.map((y) => num(y.fte[id] || 0)).join("/")} FTE)`, (y) => usd(y.inKindTeam[id] || 0)); }),
      ...(IK.items || []).map((k) => row(IK_ITEMS[k] || k, (y) => usd(y.inKindItems[k] || 0))),
      row("Total carried in kind", (y) => usd(y.inKind), "total"),
    ];
  }
  P.pnl = () => {
    const p = S.R.scen.base;
    const html = header("P&L", "Plan · five years · USD · business scenarios on the Scenarios page",
      `<button class="ui-btn" id="csv">Export CSV</button>`)
      + `<div class="ui-tiles">${tile("Cash need", kusd(p.raise), "Monthly cash view")}${tile("First year with positive EBITDA", yearOf(p.firstEbitda))}${tile("Five-year net profit", kusd(p.netProfit5))}${tile("Cash at end of year 5", kusd(p.cashEnd), "After funding")}</div>`
      + `<section class="ui-panel"><div class="body">${table(["Line", ...YRS], pnlRows(p))}</div></section>`;
    return [html, () => {
      $("#csv").onclick = () => {
        const lines = [["Line", ...YRS].join(",")];
        for (const r of pnlRows(p)) if (r.cells) lines.push(r.cells.map((c) => `"${String(c).replace(/[$,]/g, "").replace("−", "-")}"`).join(","));
        download(`anatolian-protocol-pnl.csv`, lines.join("\n"), "text/csv");
      };
    }];
  };

  P.cash = () => {
    const mo = S.R.monthly, rows = mo.rows;
    const months = rows.map((r) => "M" + r.m);
    const rr = (lab, k, cls) => ({ cells: [lab, ...rows.map((r) => usd(r[k]))], cls });
    const coh = S.A.monthly.y1Cohorts;
    const html = header("Monthly cash", `Base case · first 36 months · low point month ${mo.lowAfterMonth} · cash need ${kusd(mo.raise)} incl. buffer`)
      + checksBanner() + `<div class="ui-tiles">${tile("Lowest cash, after reserve", kusd(mo.lowAfter), "Month " + mo.lowAfterMonth, "focus")}${tile("Lowest cash, before reserve", kusd(mo.lowBefore), "Month " + mo.lowMonth)}${tile("Cash need, monthly view", kusd(mo.raise), "Incl. " + pct(S.A.finance.buffer) + " buffer")}${tile("Cash need, year-end view", kusd(S.R.scen.base.peakAfterReserve * (1 + S.A.finance.buffer)), "Base case uses the larger")}</div>
      ${balancePanel("ch-m")}
      <section class="ui-panel"><h2>Pilot cohorts</h2><div class="sub">Share of year-1 new clients enrolling in each month (total ${pct(coh.reduce((a, b) => a + b, 0))}). Set-up is paid in months 1–${S.A.monthly.setupMonths}. Years 2–3 enrol evenly.</div>
        <div class="body"><div class="ui-field"><div class="lbl">Year 1, by month · %</div><div class="inputs">${coh.map((_, i) => `<label class="ui-input-cap"><span>M${i + 1}</span>${inputHTML("monthly.y1Cohorts." + i, "pct", "narrow")}</label>`).join("")}</div></div>
        <div class="ui-field"><div class="lbl">Set-up months before launch</div><div class="inputs">${inputHTML("monthly.setupMonths", "int", "narrow")}</div></div>
        ${issuesFor("monthly").map((m) => `<small class="ui-msg ${m.level}">${esc(m.msg)}</small>`).join("")}</div></section>
      <section class="ui-panel"><h2>Month by month</h2><div class="body">${table(["Line", ...months], [
        { cells: ["New clients", ...rows.map((r) => num(r.newC, Number.isInteger(r.newC) ? 0 : 1))] }, { cells: ["Renewing clients", ...rows.map((r) => num(r.renewC, Number.isInteger(r.renewC) ? 0 : 1))] },
        { group: "Cash in" }, ...(S.A.finance.payment
          ? [rr("Deposits at sale", "enrolPay"), rr("Paid at the first visit", "balance"), rr(S.A.finance.payment.byVisit ? "Paid before later visits" : "Instalments", "instal")]
          : [rr("Payments at enrolment", "enrolPay"), rr("Balances six months later", "balance")]), rr("Add-ons and companions, net", "addons"), ...(rows.some((r) => r.support) ? [rr("Marketing support received", "support")] : []), rr("Cash in", "cashIn", "total"),
        { group: "Cash out" }, rr("Partners: first visit", "firstVisit"), rr("Partners: rest of the program year", "restYear"), rr("Acquisition and referral", "acq"),
        rr("Payment processing", "processing"), rr("Team salaries", "salaries"), rr("Brand, overheads, contingency", "overheads"), rr("Set-up and new countries", "setup"), rr("Cash out", "cashOut", "total"),
        { group: "Result" }, rr("Net cash flow", "net", "total"), rr("Cumulative cash before funding", "cum"), rr("Held in reserve", "held", "minor"), rr("Cumulative cash after the reserve", "cumAfter", "key"),
      ])}</div></section>`;
    return [html, () => { balanceChart($("#ch-m")); bindInputs(); }];
  };

  P.partners = () => {
    const Pn = S.A.partners;
    const variant = (op, ph) => { const A = M.clone(S.A); A.partners.operator = op; A.partners.physicians = ph; return M.compute(A); };
    const V = [["Plan (in-kind support only)", variant(0, 0)], ["+ Partner rates", variant(1, 0)], ["+ Physician network", variant(0, 1)], ["Both", variant(1, 1)]];
    const fmtL = (lv, v) => (Math.abs(v) < 1 && v !== 0 ? pct(v) : usd(v));
    const html = header("Partners", "Plus International's in-kind support is part of the plan; two switches add partner rates and a physician network · paid in shares unless a revenue share is set")
      + `<section class="ui-panel"><h2>Switches</h2><div class="body">
        <label class="ui-check"><input type="checkbox" data-sw="operator"${Pn.operator ? " checked" : ""}><span class="t">Partner rates from Plus International and its partner hospital</span><span></span><span class="x">Measurement day, programme physicians, clinical lead and governance, hotel volume rates and health-tourism counsel at partner rates. The staff, office and set-up Plus International carries in kind are already in the plan (below); this switch adds only the rates.</span></label>
        <label class="ui-check"><input type="checkbox" data-sw="physicians"${Pn.physicians ? " checked" : ""}><span class="t">Physician network in the US and target countries</span><span></span><span class="x">Referring physicians in the US and target countries; local licensed follow-up; credibility that lifts lead conversion.</span></label>
        <div class="ui-field"><div class="lbl">Partner revenue share, % of revenue<small>0% = paid in shares only. Applies when either group is in.</small></div><div class="inputs">${inputHTML("partners.revenueShare", "pct", "narrow")}</div></div>
      </div></section>
      <section class="ui-panel"><h2>Carried by ${esc((S.A.inKind && S.A.inKind.by) || "Plus International")} in kind</h2><div class="sub">Ticked staff and infrastructure are provided by the partner: worked out in full on the P&L page as a memo, but not in the P&L, cash or funding. Five-year value now ${kusd(S.R.scen.base.years.reduce((a, y) => a + y.inKind, 0))}.</div><div class="body ui-grid">
        <div>${S.A.team.map((t) => `<label class="ui-check"><input type="checkbox" data-ik="team:${t.id}"${((S.A.inKind || {}).team || []).includes(t.id) ? " checked" : ""}><span class="t">${esc(t.name)}</span><span></span><span class="x">${kusd(S.R.scen.base.years.reduce((a, y) => a + y.fte[t.id] * t.cost * 12 * y.costIdx * (y.pilot ? t.y1 : 1), 0))} over five years</span></label>`).join("")}</div>
        <div>${Object.entries(IK_ITEMS).map(([k, lab]) => `<label class="ui-check"><input type="checkbox" data-ik="items:${k}"${((S.A.inKind || {}).items || []).includes(k) ? " checked" : ""}><span class="t">${esc(lab)}</span></label>`).join("")}</div>
      </div></section>
      <section class="ui-panel"><h2>Effect of each group</h2><div class="sub">Computed live on the current plan</div><div class="body">${table(["Result (base case)", ...V.map((v) => v[0])], [
        { cells: ["Cash need", ...V.map((v) => kusd(v[1].funding))], cls: "key" },
        { cells: ["Saved against the plan", ...V.map((v) => kusd(V[0][1].funding - v[1].funding))] },
        { cells: ["Month of the lowest cash point", ...V.map((v) => "M" + v[1].monthly.lowAfterMonth)] },
        { cells: ["EBITDA, Y1", ...V.map((v) => kusd(v[1].scen.base.years[0].ebitda))] },
        { cells: ["First year with positive EBITDA", ...V.map((v) => yearOf(v[1].scen.base.firstEbitda))] },
        { cells: ["EBITDA, Y5", ...V.map((v) => kusd(v[1].scen.base.years[4].ebitda))] },
        { cells: ["Five-year net profit", ...V.map((v) => kusd(v[1].scen.base.netProfit5))] },
      ])}</div></section>
      <section class="ui-panel"><h2>Levers the partners change</h2><div class="body">${table(["Lever", "Group", "In the plan", "With partner", "Used now"], Pn.levers.map((lv) => {
        const alone = M.getPath(S.A, lv.path), used = M.getPath(S.R.E, lv.path);
        return { cells: [esc(lv.label) + `<br><small style="color:var(--ui-muted)">${esc(lv.basis)}</small>`, lv.group === "operator" ? "Partner rates" : "Physician network", fmtL(lv, alone), fmtL(lv, lv.with), fmtL(lv, used)] };
      }))}</div></section>`;
    return [html, () => {
      document.querySelectorAll("[data-sw]").forEach((cb) => (cb.onchange = () => { S.A.partners[cb.dataset.sw] = cb.checked ? 1 : 0; recompute(); render(true); }));
      document.querySelectorAll("[data-ik]").forEach((cb) => (cb.onchange = () => {
        const [list, id] = cb.dataset.ik.split(":");
        S.A.inKind = S.A.inKind || { by: "Plus International", team: [], items: [] };
        const cur = new Set(S.A.inKind[list] || []);
        if (cb.checked) cur.add(id); else cur.delete(id);
        S.A.inKind[list] = (list === "team" ? S.A.team.map((t) => t.id) : Object.keys(IK_ITEMS)).filter((x) => cur.has(x));
        recompute(); render(true);
      }));
      bindInputs();
    }];
  };

  P.checks = () => {
    const where = (p) => (!p ? null : p.startsWith("scenarios") ? "scenarios" : p.startsWith("partners") ? "partners" : p.startsWith("monthly") ? "cash" : "assumptions");
    const row = (i) => {
      const pg = where(i.path), id = i.path ? "in-" + i.path.replace(/\./g, "-") : "";
      return `<div class="ui-list-row"><div><span class="ui-tag ${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "Error" : "Warning"}</span> ${esc(i.msg)}</div>${pg ? `<button class="ui-btn small" data-fix="${pg}" data-id="${id}">Open</button>` : ""}</div>`;
    };
    const errs = S.issues.filter((i) => i.level === "error"), warns = S.issues.filter((i) => i.level !== "error");
    const html = header("Checks", "Model rules every input must meet, and results worth a second look · " + checksTxt())
      + `<section class="ui-panel"><h2>Errors</h2><div class="sub">An error means the result is not reliable until the input is fixed.</div><div class="body">${errs.length ? errs.map(row).join("") : `<div class="ui-empty">No input breaks a model rule.</div>`}</div></section>
      <section class="ui-panel"><h2>Warnings</h2><div class="sub">Allowed, but worth checking.</div><div class="body">${warns.length ? warns.map(row).join("") : `<div class="ui-empty">Nothing to review.</div>`}</div></section>
      <section class="ui-panel"><h2>Rules checked</h2><div class="body" style="display:grid;gap:4px">
        <div>Clients, renewals, companions, visits, leads and team members are whole numbers${S.A.logic && S.A.logic.wholeClients === false ? " (switched off in Assumptions, section I)" : ""}.</div>
        <div>Percentages stay between 0% and 100% (price and cost increases may be negative).</div>
        <div>Package shares and pilot cohorts each total 100%; nights, visits, countries and minimum team are whole numbers.</div>
        <div>No negative prices or costs; conversion above 0%; referral, companion and cancellation shares below 100%.</div>
        <div>Home blood draws per year cover every visit; no client enrols before set-up ends.</div>
        <div>Premium above Standard, longer packages above shorter ones; every package earns money before acquisition.</div>
      </div></section>`;
    return [html, () => {
      document.querySelectorAll("[data-fix]").forEach((b) => (b.onclick = () => {
        const id = b.dataset.id; location.hash = "#/" + b.dataset.fix;
        setTimeout(() => { const n = document.getElementById(id); if (n) { n.scrollIntoView({ block: "center" }); n.focus(); } }, 50);
      }));
    }];
  };

  P.versions = () => {
    const vs = versions(), d = diff(S.A, S.ref);
    const presets = [
      ["v6.3 plan", () => S.v6, "2% of leads become clients at $75 a lead (benchmark; stress $150), 30 → 180 new clients a year, 40% marketing support a year later, staff and infrastructure carried in kind by Plus International, payment per visit (front-loaded), a $200k pre-seed and a $500k seed at month 9."],
      ["v5 baseline", () => S.v5, "The Excel model v5, converted 1:1."],
      ["v6.3 plan with every funding lever", () => applyLevers(S.v6, S.levers.map((l) => l.id)), "v6.3 with partner rates, the physician network, payment in full at the first visit, a 5% founding discount and the ATRON fee waived."],
    ];
    const html = header("Versions", "Plans are JSON files: save them here, export them to the repository, share them as a link",
      `<button class="ui-btn" id="share">Copy share link</button><button class="ui-btn" id="export">Export JSON</button><label class="ui-btn" style="display:inline-flex;align-items:center">Import JSON<input type="file" id="import" accept="application/json,.json" hidden></label><button class="ui-btn primary" id="save">Save version</button>`)
      + `<div class="ui-grid" style="align-items:start"><div class="ui-stack">
        <section class="ui-panel"><h2>Starting points</h2><div class="body">${presets.map(([n, , note], i) => `<div class="ui-list-row"><div>${esc(n)}<div class="meta">${esc(note)} Funding ${kusd(M.compute(presets[i][1]()).funding)}.</div></div><button class="ui-btn small" data-preset="${i}">Load</button></div>`).join("")}</div></section>
        <section class="ui-panel"><h2>Saved in this browser</h2><div class="body">${vs.length ? vs.map((v, i) => `<div class="ui-list-row"><div>${esc(v.name)}<div class="meta">${fmtDate(v.at)} · funding ${kusd(M.compute(v.A).funding)}</div></div><div class="ui-actions"><button class="ui-btn small" data-load="${i}">Load</button><button class="ui-btn small ghost" data-del="${i}">Delete</button></div></div>`).join("") : `<div class="ui-empty">No saved versions yet. Save version keeps the current plan in this browser.</div>`}</div></section>
        <section class="ui-panel"><h2>How to work with plans</h2><div class="body" style="display:grid;gap:6px">
          <div>1. Change inputs on any page; results update everywhere. The draft stays in this browser.</div>
          <div>2. Save version to keep a named copy here, or Copy share link to send the plan: the link carries only the inputs that differ from v6.3.</div>
          <div>3. To make a plan official for everyone, Export JSON and commit it to <code>plan/data/</code> in the repository; git keeps the history.</div>
          <div>4. Levers for the Funding page live in <code>plan/data/levers.json</code>.</div>
        </div></section>
      </div>
      <section class="ui-panel"><h2>Changes from v6.3</h2><div class="sub">${esc(S.name)} · ${d.length} input${d.length === 1 ? "" : "s"}</div><div class="body">${d.length ? table(["Input", "v5", "Now"], d.map(([k, now, was]) => ({ cells: [esc(labelOf(k)), fmtVal(k, was), fmtVal(k, now)] }))) : `<div class="ui-empty">The current plan is the v6.3 plan.</div>`}</div></section></div>`;
    return [html, () => {
      document.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => { const p = presets[+b.dataset.preset]; setA(p[1](), p[0]); render(); toast(p[0] + " loaded."); }));
      document.querySelectorAll("[data-load]").forEach((b) => (b.onclick = () => { const v = versions()[+b.dataset.load]; setA(v.A, v.name); render(); toast(v.name + " loaded."); }));
      document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { const v = versions(); v.splice(+b.dataset.del, 1); saveVersions(v); render(); }));
      $("#save").onclick = () => {
        const name = prompt("Name for this version", S.name.replace(/ \(shared link\)$/, ""));
        if (!name) return;
        const v = versions().filter((x) => x.name !== name); v.unshift({ name, at: Date.now(), A: S.A }); saveVersions(v); S.name = name; recompute(); render(); toast("Saved as " + name + ".");
      };
      $("#export").onclick = () => {
        const out = M.clone(S.A); out.meta = { name: S.name, exported: fmtDate(Date.now()), funding: Math.round(S.R.funding) };
        download(S.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json", JSON.stringify(out, null, 2), "application/json");
      };
      $("#import").onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        f.text().then((t) => { const A = JSON.parse(t); M.compute(A); setA(A, (A.meta && A.meta.name) || f.name.replace(/\.json$/, "")); render(); toast("Plan imported."); })
          .catch(() => toast("The file could not be read as a plan. Export a plan from this tool and try again."));
      };
      $("#share").onclick = () => {
        const url = shareURL();
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("Share link copied."), () => prompt("Copy this link", url));
      };
    }];
  };

  // ---------------------------------------------------------------- render
  function render(keepFocus) {
    const page = P[route()] ? route() : "overview";
    renderNav();
    const scroll = window.scrollY, focusId = document.activeElement && document.activeElement.id;
    const [html, after] = P[page]();
    const main = $("#main");
    main.innerHTML = html;
    after();
    document.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { location.hash = "#/" + b.dataset.go; }));
    if (keepFocus) {
      window.scrollTo(0, scroll);
      const n = focusId && document.getElementById(focusId);
      if (n) n.focus({ preventScroll: true });
    } else window.scrollTo(0, 0);
    document.title = (PAGES.flatMap((g) => g.items).find((x) => x[0] === page) || [0, "Overview"])[1] + " · Anatolian Protocol plan";
  }

  let resizeT;
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => render(true), 150); });
  window.addEventListener("hashchange", () => render());

  Promise.all(["data/v5.json", "data/v6.json", "data/levers.json", "data/scenarios.json", "data/report.json"].map((u) => fetch(u + "?v=68").then((r) => r.json())))
    .then(([v5, v6, lv, sc, rp]) => {
      S.ref = v6; S.v5 = v5; S.v6 = v6; S.scenDefs = sc; S.levers = lv.levers; S.report = rp; S.refR = M.compute(v6);
      if (!readShare()) {
        let draft = null;
        try { draft = JSON.parse(localStorage.getItem(LS_DRAFT) || "null"); } catch (e) { draft = null; }
        if (draft && draft.d) { S.A = withChanges(draft.d); S.name = draft.name; } else { S.A = M.clone(v6); S.name = "v6.3 plan"; }
      }
      try { recompute(); } catch (e) { S.A = M.clone(v6); S.name = "v6.3 plan"; recompute(); }
      render();
    })
    .catch(() => {
      $("#main").innerHTML = `<div class="ui-banner" role="alert">The plan data could not be loaded. Open the tool through a web server (GitHub Pages, or <code>python -m http.server</code> in the plan folder), not as a local file.</div>`;
    });
})();
