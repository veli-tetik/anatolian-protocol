/* The Anatolian Protocol — the investor report (P&L feasibility), generated from the loaded plan.
   A port of web/build.py: the same pages, slides, components and charts, but every number, chart and
   sentence comes from the plan and the engine. Three readings: A4 pages, a phone column, 16:9 slides.
   APReport.render(ctx) -> { meta, actions, html, after }. */
(function () {
  "use strict";
  const YRS = ["Y1", "Y2", "Y3", "Y4", "Y5"];
  const YEARW = ["year one", "year two", "year three", "year four", "year five"];
  const PKG_IDS = ["annual", "summerWinter", "seasonal"];
  const PKG_NAMES = ["Annual", "Summer–Winter", "Seasonal"];
  const st = { view: null, picked: false, slide: 0 };   // kept across renders (the app re-renders on resize)
  let cache = null;                                     // engine runs for the sensitivity pieces, per plan

  // ---------------------------------------------------------------- formatting (UK, USD)
  const r0 = (v) => Math.round(v);
  const gb = (v, d = 0) => v.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
  const usd = (v) => (v < -0.5 ? "−" : "") + "$" + gb(Math.abs(r0(v)));
  const k1 = (v) => "$" + gb(Math.abs(v) / 1000, 1) + "k";
  const musd = (v, d = 1) => (v < 0 ? "−" : "") + "$" + gb(Math.abs(v) / 1e6, d) + "M";
  const pc = (v) => r0(v * 100) + "%";
  const n0 = (v) => gb(r0(v));
  // table cells carry no currency sign; the header names the unit once, negatives in brackets
  const neg = (s, v) => (v < -0.5 ? "(" + s + ")" : s);
  const tk = (v) => neg(gb(Math.abs(r0(v / 1000))), v);
  const tu = (v) => neg(gb(Math.abs(r0(v))), v);
  const cost = (v) => (Math.abs(v) >= 0.5 ? tk(-v) : "–");
  const yearOf = (n) => (n ? YEARW[n - 1] : "after year five");
  const Yof = (n) => (n ? "Year " + n : "After Y5");
  const today = () => { const d = new Date(), p = (x) => String(x).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const shareList = (a) => a.map((x) => r0(x * 100)).join("/") + (a.length === 1 ? "%" : "");

  // ---------------------------------------------------------------- building blocks
  function table(head, rows, cls = "") {
    const h = head.map((c) => `<th>${c}</th>`).join("");
    const body = rows.map((r) => {
      const rc = r.cells ? r.cls || "" : "", cells = r.cells || r;
      const tds = cells.map((c, i) => (typeof c === "object" && c !== null
        ? `<td class="${c.cls || ""}" style="${c.style || ""}">${c.v}</td>`
        : `<td${i && String(c).startsWith("(") ? ' class="neg"' : ""}>${c}</td>`)).join("");
      return (rc ? `<tr class="${rc}">` : "<tr>") + tds + "</tr>";
    }).join("");
    return `<div class="tw"><table class="t ${cls}"><thead><tr>${h}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const kpi = (label, value, text = "", cls = "") => `<div class="kpi ${cls}"><small>${label}</small><strong>${value}</strong>${text ? `<p>${text}</p>` : ""}</div>`;
  const pts = (items, cls = "") => `<ul class="pts ${cls}">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const card = (k, h, p, cls = "") => `<div class="card ${cls}">${k ? `<p class="k">${k}</p>` : ""}<h4>${h}</h4>${p ? `<p>${p}</p>` : ""}</div>`;
  const sec = (title, small = "") => `<div class="sec-h"><h3>${title}</h3>${small ? `<small>${small}</small>` : ""}</div>`;
  const legend = (items) => `<div class="legend">${items.map(([lab, kind, color]) => `<span><i class="${kind}" style="${kind === "dash" ? "" : "background:" + color}"></i>${lab}</span>`).join("")}</div>`;
  const top = (right, n, total) => `<div class="top"><span class="mark"><i></i>The Anatolian Protocol</span><span class="pg"><span>${right}</span><b>${n} / ${total}</b></span></div><div class="rule-top"></div>`;
  const FOOT = '<footer class="foot"><b>AI FOR PEOPLE × ATRON</b><span>The Anatolian Protocol · P&amp;L feasibility</span></footer>';
  const svg = (w, h, inner, label) => `<svg class="ch" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${inner}</svg>`;
  const f1 = (v) => v.toFixed(1);
  // scale chart text for slide reading distance
  const S = (s, k = 1.22) => s.replace(/font-size="([\d.]+)"/g, (m, v) => `font-size="${(v * k).toFixed(1)}"`);

  // a tidy axis: ticks covering [lo, hi] in steps of 1, 2, 2.5 or 5 × 10^n
  function ticks(lo, hi, count = 5) {
    if (hi <= lo) hi = lo + 1;
    const s0 = (hi - lo) / count, mag = Math.pow(10, Math.floor(Math.log10(s0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= s0);
    const out = [];
    for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) out.push(Math.round(v / step) * step);
    return out;
  }
  const axisM = (t) => (t < 0 ? "−" : "") + "$" + +(Math.abs(t) / 1e6).toFixed(2) + "M";

  // ---------------------------------------------------------------- charts (inline SVG, as build.py)
  // One client's first-year price split into what it pays for.
  function clientBar(w) {
    const fees = w.processing + w.referral;
    const segs = [["Delivery cost: hospital, hotels, doctors, labs, box", w.delivery, "f-cost", "val"],
      [`Payment fees, referral commission (${k1(fees)})`, fees, "f-cost2", "val"],
      ["Acquisition", w.acquisition, "f-soft", "val"],
      ["Profit after acquisition", Math.max(0, w.afterAcq), "f-deep", "wval"]];
    const total = w.price, Wd = 680, H = 122, y = 48, h = 46;
    const out = [`<text class="val" x="0" y="16" font-size="15">Client pays ${usd(total)} in year one</text>`];
    let x = 0;
    segs.forEach(([lab, v, c, tc], i) => {
      const wd = Wd * v / total;
      out.push(`<rect class="${c}" x="${f1(x)}" y="${y}" width="${f1(Math.max(0, wd - 2))}" height="${h}" rx="3"/>`);
      if (wd >= 52) out.push(`<text class="${tc}" x="${f1(x + 8)}" y="${y + 29}" font-size="15">${wd < 110 ? k1(v) : usd(v)}</text>`);
      const last = i === segs.length - 1, lx = last ? x + wd - 2 : x + 1, ly = i === 1 ? y - 8 : y + h + 20;
      out.push(`<text class="lbl" x="${f1(lx)}" y="${ly}" font-size="12.5" text-anchor="${last ? "end" : "start"}">${lab}</text>`);
      x += wd;
    });
    return svg(Wd, H, out.join(""), "How one client's first-year price is split");
  }

  // Price, cost and profit after acquisition for each package.
  function pkgBars(cols) {
    const Wd = 680, row = 44, x0 = 185, H = cols.length * row + 4;
    const sc = (Wd - x0 - 70) / (Math.max(...cols.map((c) => c.price)) * 1.13);
    const out = [];
    cols.forEach((c, i) => {
      const y = 4 + i * row;
      const parts = [[c.delivery, "f-cost"], [c.processing + c.referral, "f-cost2"], [c.acquisition, "f-soft"], [Math.max(0, c.afterAcq), "f-tb"]];
      out.push(`<text class="lbl" x="${x0 - 10}" y="${y + 22}" text-anchor="end" font-size="13">${pkgShort(c)}</text>`);
      let x = x0;
      for (const [v, cl] of parts) { const wd = v * sc; out.push(`<rect class="${cl}" x="${f1(x)}" y="${y + 6}" width="${f1(Math.max(wd - 1.5, 0))}" height="${row - 16}" rx="2"/>`); x += wd; }
      if (c.afterAcq * sc >= 52) {
        out.push(`<text class="wval" x="${f1(x - 6)}" y="${y + 23}" text-anchor="end" font-size="12">${k1(c.afterAcq)}</text>`);
        out.push(`<text class="val" x="${f1(x + 6)}" y="${y + 23}" font-size="12.5">${usd(c.price)}</text>`);
      } else {   // segment too narrow for its label: put it outside, in the segment colour
        out.push(`<text x="${f1(x + 6)}" y="${y + 23}" font-size="12" font-weight="700" style="fill:var(--tb)">${c.afterAcq < 0 ? "−" : ""}${k1(c.afterAcq)}</text>`);
        out.push(`<text class="val" x="${f1(x + 48)}" y="${y + 23}" font-size="12.5">${usd(c.price)}</text>`);
      }
    });
    return svg(Wd, H, out.join(""), "Price, cost and profit after acquisition for each package");
  }
  const pkgShort = (c) => c.name.replace(" · Standard", " · Std").replace(" · Premium", " · Prem");

  // Where the weighted client's first-year price goes.
  function waterfall(u) {
    const steps = [["Price", u.price, "start"], ["Istanbul", -u.first], ["Later\nvisits", -u.later], ["Doctors", -(u.physician + u.tele)],
      ["Labs", -u.draws], ["Box", -u.box], ["Support", -u.support], ["Platform", -(u.platform + u.wear + u.report)],
      ["Fees", -(u.processing + u.referral)], ["Acquis.", -u.acquisition, "acq"], ["Profit", u.afterAcq, "end"]];
    const Wd = 680, H = 260, top_ = 28, base = 212, sc = (base - top_) / u.price, bw = 42, gap = 17;
    const out = [`<line class="axis" x1="10" x2="${Wd - 6}" y1="${base}" y2="${base}"/>`];
    let x = 14, level = 0;
    for (const [lab, v, kind] of steps) {
      let y0, y1, c;
      if (kind === "start") { y0 = 0; y1 = v; c = "f-ink"; level = v; }
      else if (kind === "end") { y0 = Math.min(0, v); y1 = Math.max(0, v); c = v < 0 ? "f-red" : "f-deep"; }
      else { y0 = level + v; y1 = level; level += v; c = kind === "acq" ? "f-soft" : "f-cost"; }
      const ytop = base - y1 * sc, h = Math.max(1.5, (y1 - y0) * sc);
      out.push(`<rect class="${c}" x="${x}" y="${f1(ytop)}" width="${bw}" height="${f1(h)}" rx="2"/>`);
      const txt = kind === "start" || kind === "end" ? (v < 0 ? "−" : "") + k1(v) : "−" + k1(v).slice(1);
      out.push(`<text class="val" x="${x + bw / 2}" y="${f1(ytop - 6)}" text-anchor="middle" font-size="14.5">${txt}</text>`);
      lab.split("\n").forEach((part, j) => out.push(`<text class="lbl" x="${x + bw / 2}" y="${base + 19 + j * 15}" text-anchor="middle" font-size="13.5">${part}</text>`));
      x += bw + gap;
    }
    return svg(Wd, H, out.join(""), "Where the weighted client's first-year price goes");
  }

  // Published prices compared with the plan's prices.
  function priceChart(A, bench) {
    const own = [["Anatolian · Annual Std", A.prices.annual[0]], ["Anatolian · Annual Prem", A.prices.annual[1]],
      ["Anatolian · Seasonal Std", A.prices.seasonal[0]], ["Anatolian · Seasonal Prem", A.prices.seasonal[1]]];
    const items = bench.map((b) => [b.label, b.price, b.per === "stay" ? "s" : "y"]).concat(own.map(([l, v]) => [l, v, "a"])).sort((a, b) => a[1] - b[1]);
    const Wd = 680, row = 22, x0 = 200, xmax = 600, H = items.length * row + 4;
    const vmax = Math.max(...items.map((i) => i[1])) * 1.29;
    const out = [];
    items.forEach(([lab, v, k], i) => {
      const y = 2 + i * row, wd = Math.max(2, (xmax - x0) * v / vmax);
      const c = { y: "f-cost", s: "f-cost2", a: "f-tb" }[k];
      out.push(`<text class="lbl" x="${x0 - 10}" y="${y + 14}" text-anchor="end" font-size="12.5"${k === "a" ? ' font-weight="700"' : ""}>${lab}</text>`);
      out.push(`<rect class="${c}" x="${x0}" y="${y + 3}" width="${f1(wd)}" height="${row - 8}" rx="2"/>`);
      out.push(`<text class="val" x="${f1(x0 + wd + 7)}" y="${y + 14}" font-size="12">${usd(v)}${k === "s" ? " / stay" : ""}</text>`);
    });
    return svg(Wd, H, out.join(""), "Published prices compared with proposed Anatolian prices");
  }

  // Stacked bars by year (program years sold, team).
  function stackChart(stacks, totals, label) {
    const Wd = 330, H = 230, l = 10, bot = 196, top_ = 24;
    const t = ticks(0, Math.max(...totals) * 1.12, 4), vmax = t[t.length - 1];
    const sy = (v) => (bot - top_) * v / vmax, cw = (Wd - l * 2) / 5;
    const out = [`<line class="axis" x1="0" x2="${Wd}" y1="${bot}" y2="${bot}"/>`];
    for (let i = 0; i < 5; i++) {
      const cx = l + cw * i + cw / 2;
      let y = bot;
      for (const [vals, c] of stacks) {
        const h = sy(vals[i]);
        if (h > 0.5) out.push(`<rect class="${c}" x="${f1(cx - 17)}" y="${f1(y - h)}" width="34" height="${f1(Math.max(h - 1, 0))}" rx="2"/>`);
        y -= h;
      }
      out.push(`<text class="val" x="${f1(cx)}" y="${f1(y - 6)}" text-anchor="middle" font-size="12.5">${n0(totals[i])}</text>`);
      out.push(`<text class="lbl" x="${f1(cx)}" y="${bot + 18}" text-anchor="middle" font-size="12.5">${YRS[i]}</text>`);
    }
    return svg(Wd, H, out.join(""), label);
  }
  const clientsChart = (Y) => stackChart([[Y.map((y) => y.newClients), "f-tb"], [Y.map((y) => y.renewing), "f-tl"]], Y.map((y) => y.programYears), "Program years sold: new and renewing clients");
  function teamChart(Y, team) {
    const grp = (g) => Y.map((y) => team.filter((t) => t.group === g || (g === "care" && !["ga", "sales"].includes(t.group))).reduce((a, t) => a + (y.fte[t.id] || 0), 0));
    return stackChart([[grp("ga"), "f-ink"], [grp("sales"), "f-tl"], [grp("care"), "f-tb"]], Y.map((y) => y.fteTotal), "Team size in full-time equivalents");
  }

  // Revenue and EBITDA by year.
  function revEbitda(Y, Wd = 380, H = 250) {
    const rev = Y.map((y) => y.revenue), eb = Y.map((y) => y.ebitda);
    const l = 46, r = 6, top_ = 18, bot = H - 34;
    const t = ticks(Math.min(0, ...eb), Math.max(...rev) * 1.08, 5), vmin = t[0], vmax = t[t.length - 1];
    const sy = (v) => top_ + (vmax - v) / (vmax - vmin) * (bot - top_);
    const out = [];
    for (const v of t) {
      out.push(`<line class="${v === 0 ? "axis" : "grid"}" x1="${l}" x2="${Wd - r}" y1="${f1(sy(v))}" y2="${f1(sy(v))}"/>`);
      out.push(`<text x="${l - 6}" y="${f1(sy(v) + 4)}" text-anchor="end" font-size="11">${axisM(v)}</text>`);
    }
    const cw = (Wd - l - r) / 5;
    for (let i = 0; i < 5; i++) {
      const cx = l + cw * i + cw / 2;
      for (const [v, c, dx] of [[rev[i], "f-ink", -21], [eb[i], eb[i] >= 0 ? "f-tb" : "f-red", 1]]) {
        const y0 = sy(Math.max(v, 0)), y1 = sy(Math.min(v, 0));
        out.push(`<rect class="${c}" x="${f1(cx + dx)}" y="${f1(y0)}" width="20" height="${f1(Math.max(1.5, y1 - y0))}" rx="2"/>`);
      }
      out.push(`<text class="val" x="${f1(cx - 11)}" y="${f1(sy(rev[i]) - 5)}" text-anchor="middle" font-size="10.5">${rev[i] >= 1e6 ? musd(rev[i]) : "$" + r0(rev[i] / 1000) + "k"}</text>`);
      out.push(`<text class="lbl" x="${f1(cx)}" y="${bot + 18}" text-anchor="middle" font-size="12">${YRS[i]}</text>`);
    }
    return svg(Wd, H, out.join(""), "Revenue and EBITDA by year");
  }

  // Cumulative cash before funding by year: the plan, the plan without growth investment and the hardest business case.
  function cashLines(series, Wd = 460, H = 270) {
    const l = 50, r = 170, top_ = 12, bot = H - 30;
    const all = series.flatMap((s) => s.values).concat([0]);
    const t = ticks(Math.min(...all), Math.max(...all), 6), vmin = t[0], vmax = t[t.length - 1];
    const sy = (v) => top_ + (vmax - v) / (vmax - vmin) * (bot - top_), sx = (i) => l + i * (Wd - l - r) / 4;
    const out = [];
    for (const v of t) {
      out.push(`<line class="${v === 0 ? "axis" : "grid"}" x1="${l}" x2="${Wd - r}" y1="${f1(sy(v))}" y2="${f1(sy(v))}"/>`);
      out.push(`<text x="${l - 6}" y="${f1(sy(v) + 4)}" text-anchor="end" font-size="11">${axisM(v)}</text>`);
    }
    YRS.forEach((y, i) => out.push(`<text class="lbl" x="${f1(sx(i))}" y="${bot + 19}" text-anchor="middle" font-size="12">${y}</text>`));
    const ends = [];
    for (const s of series) {
      out.push(`<polyline class="${s.c}" points="${s.values.map((v, i) => f1(sx(i)) + "," + f1(sy(v))).join(" ")}" fill="none" stroke-width="3" stroke-linejoin="round"/>`);
      ends.push([sy(s.values[4]), `${s.name} ${musd(s.values[4])}`]);
    }
    ends.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ends.length; i++) ends[i][0] = Math.max(ends[i][0], ends[i - 1][0] + 16);
    for (const [y, name] of ends) out.push(`<text class="lbl" x="${Wd - r + 10}" y="${f1(y + 4)}" font-size="12">${name}</text>`);
    return svg(Wd, H, out.join(""), "Cumulative cash before funding by year");
  }

  // Year one: where the money goes, down to the cash position at the end of the year.
  function y1Bars(y) {
    const rows = [["Partners, fees, commissions", y.partnerDelivery + y.addonDelivery + y.processing + y.referral, "f-cost"],
      ["Care team (pilot minimum)", y.careTeam, "f-cost"],
      ["Sales and marketing", y.salesMarketing, "f-cost"],
      ["Leadership and overheads", y.ga, "f-cost"],
      ["One-off set-up", y.setup, "f-cost"],
      ["Contingency, tax and timing", y.contingency + y.tax + y.timing + (y.mktTiming || 0), "f-cost"],
      [y.marketingSupport ? "Cash in: pilot clients, marketing support" : "Cash in from pilot clients", -(y.cashIn + y.marketingSupport), "f-tb"],
      [y.cumCash < 0 ? "Net cash need, end of year one" : "Net cash, end of year one", y.cumCash, y.cumCash < 0 ? "f-red" : "f-tb"]];
    const Wd = 330, row = 28, H = rows.length * row + 4, vmax = Math.max(...rows.map((r) => Math.abs(r[1])));
    const out = [];
    rows.forEach(([lab, v, c], j) => {
      const yy = 2 + j * row, wd = (Wd - 70) * Math.abs(v) / vmax;
      out.push(`<rect class="${c}" x="0" y="${yy + 15}" width="${f1(wd)}" height="9" rx="2"/>`);
      out.push(`<text class="lbl" x="0" y="${yy + 11}" font-size="11.5">${lab}</text>`);
      out.push(`<text class="val" x="${Wd}" y="${yy + 11}" text-anchor="end" font-size="11.5">${"$" + gb(r0(Math.abs(v) / 1000)) + "k"}</text>`);
    });
    return svg(Wd, H, out.join(""), "Year one: where the money goes");
  }

  // Two-way table: rows are acquisition cost per new client, columns the weighted first-year price; plan in the middle.
  function heat(g, fmt, colour, rowTitle, colTitle) {
    const head = `<tr><th class="corner" colspan="2" rowspan="2"></th><th class="axis-h" colspan="5">${colTitle}</th></tr><tr>`
      + g.cols.map((p, i) => `<th class="${i === 2 ? "base" : ""}">${gb(p / 1000, 1)}</th>`).join("") + "</tr>";
    const body = g.rows.map((rl, ri) => {
      let tr = ri === 0 ? `<th class="axis-v" rowspan="5"><span>${rowTitle}</span></th>` : "";
      tr += `<th class="rowh ${ri === 2 ? "base" : ""}">${n0(rl)}</th>`;
      tr += g.data[ri].map((v, ci) => `<td class="${ri === 2 && ci === 2 ? "base" : ""}" style="${colour(v)}">${fmt(v)}</td>`).join("");
      return `<tr>${tr}</tr>`;
    }).join("");
    return `<div class="tw"><table class="t heat compact"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  const shade = (good) => (good > 0.8 ? "background:var(--deep);color:#fff" : good > 0.6 ? "background:var(--tb);color:#fff"
    : good > 0.4 ? "background:var(--blue-soft);color:var(--ink)" : good > 0.2 ? "background:var(--soft);color:var(--ink)" : "background:var(--red-soft);color:var(--red)");

  // ---------------------------------------------------------------- engine runs (cached per plan)
  // Break-even and limits are found with the engine on modified copies of the plan, never by scaling a result.
  function extras(ctx) {
    const { A, R, M } = ctx, key = JSON.stringify(A);
    if (cache && cache.key === key) return cache.x;
    const w = R.UE.w, y3 = (B) => M.compute(B).scen.base.years[2];
    const withBase = (f) => { const B = M.clone(A); f(B.scenarios.base, B); return B; };
    const PF = [0.8, 0.9, 1, 1.1, 1.2], CF = [0.5, 0.75, 1, 1.25, 1.5];
    // year-3 new clients at which year-3 EBITDA is nil, at a price and acquisition-cost multiplier (volume bisected)
    const breakEven = (pf, cf) => {
      const at = (v) => y3(withBase((s) => { s.volume = v * A.scenarios.base.volume; s.price = pf * A.scenarios.base.price; s.cac = cf * A.scenarios.base.cac; }));
      let lo = 0.02, hi = 8;
      if (at(hi).ebitda < 0) return null;
      for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (at(m).ebitda >= 0) hi = m; else lo = m; }
      return at(hi).newClients;
    };
    // profit after acquisition per new client, from the unit economics: contribution moves with price, acquisition with its cost
    const perClient = (pf, cf) => pf * (w.price - w.processing - w.referral) - w.delivery - cf * w.acquisition;
    const grid = (f) => ({ cols: PF.map((p) => w.price * p), rows: CF.map((c) => w.acquisition * c), data: CF.map((c) => PF.map((p) => f(p, c))) });
    // the acquisition-cost multiplier at which year-3 EBITDA of the plan is nil
    const cacAt = (cf) => y3(withBase((s) => { s.cac = cf * A.scenarios.base.cac; })).ebitda;
    let cacLimit = null;
    if (cacAt(1) >= 0) {
      let lo = 1, hi = 1;
      while (cacAt(hi) >= 0 && hi < 20) hi *= 1.5;
      if (hi < 20) { for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (cacAt(m) >= 0) lo = m; else hi = m; } cacLimit = lo; }
    }
    const partner10 = M.compute(withBase((s) => { s.partnerCost *= 1.1; }));
    const sw = (op, ph) => { const B = M.clone(A); B.partners.operator = op; B.partners.physicians = ph; return M.compute(B).funding; };
    const x = { be: grid(breakEven), acq: grid(perClient), cacLimit, partner10, switches: { none: sw(0, 0), rates: sw(1, 0), physicians: sw(0, 1) } };
    cache = { key, x };
    return x;
  }

  // ---------------------------------------------------------------- prose from the inputs
  // payment schedule in words: the deposit, then what is paid at or before the visits
  function payDeposit(A, short) {
    const P = A.finance.payment;
    return `a ${usd(P.deposit)} deposit at sale` + (short ? "" : `, ${P.saleToStartMonths} months before the first visit`);
  }
  function payRest(A) {
    const P = A.finance.payment;
    if (P.byVisit) {
      const sh = PKG_IDS.map((id) => P.byVisit[id] || [1]);
      const even = sh.every((a) => a.every((x) => Math.abs(x - a[0]) < 1e-6));
      return `before each visit its share of the rest, ${even ? "in equal shares" : "front-loaded"} (${PKG_NAMES.map((n, i) => n + " " + shareList(sh[i])).join(", ")})`;
    }
    if (P.startShare >= 1 || !P.balanceMonths) return "the rest at the first visit";
    return `${pc(P.startShare)} of the rest at the first visit and the remainder over ${P.balanceMonths} months`;
  }
  function payText(A, short) {
    const P = A.finance.payment;
    if (!P) return `${pc(A.finance.upfront)} at enrolment, the rest six months later`;
    return `${payDeposit(A, short)}, then ${payRest(A)}`;
  }
  const listText = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

  // ---------------------------------------------------------------- the report
  function build(ctx) {
    const { A, R, esc } = ctx, D = ctx.data || {}, kusd = ctx.kusd;
    const B = R.scen.base, Y = B.years, U = R.UE, w = U.w, Rd = R.rounds, mo = R.monthly, F = A.finance, fn = A.funnel;
    const X = extras(ctx), status = ctx.roundsStatus(), G = ctx.scen();
    const worst = (g) => g.cases.reduce((a, c) => (c.funding > a.funding ? c : a), g.cases[0]);
    const allCases = G.flatMap((g) => g.cases.filter((c) => !c.plan).map((c) => Object.assign({ group: g.title }, c)));
    const hardest = allCases.length ? allCases.reduce((a, c) => (c.funding > a.funding ? c : a)) : null;
    const grp = (id) => G.find((g) => g.id === id);
    const IK = A.inKind || {}, ikBy = IK.by || "Plus International";
    const ikTeam = (IK.team || []).map((id) => (A.team.find((t) => t.id === id) || { name: id }).name.replace(/ \(.*\)$/, "").toLowerCase());
    const ikItems = (IK.items || []).map((k) => (ctx.IK_ITEMS[k] || k).replace(/^Set-up: /, "set-up ").replace(/^./, (c) => c.toLowerCase()));
    const ik5 = Y[4].inKind, buf = pc(F.buffer), short = Rd.preLasts < Rd.seedMonth;
    const lowBefore = Rd.preNeeded / (1 + F.buffer);
    const FE = yearOf(B.firstEbitda), ref = (i) => ctx.M.atYear(fn.referralShare, i);
    const PAGES = [], SLIDES = [];
    const page = (right, body) => PAGES.push([right, body]), slide = (right, body) => SLIDES.push([right, body]);

    // shared pieces
    const FACTS = `<div class="facts">
<div><small>Two rounds · need ${kusd(R.funding)}</small><strong>${kusd(Rd.total)}</strong><p>${short ? `Pre-seed runs out in month ${Rd.preLasts + 1}` : status.ok ? `${kusd(Rd.pre)} pre-seed + ${kusd(Rd.seed)} seed` : esc(status.text)}</p></div>
<div><small>EBITDA positive</small><strong>${Yof(B.firstEbitda)}</strong><p>Net cash positive in ${yearOf(B.firstCash)}</p></div>
<div><small>Year-5 revenue</small><strong>${musd(Y[4].revenue)}</strong><p>${pc(Y[4].ebitdaMargin)} EBITDA margin</p></div></div>`;
    const CLIENT_KPIS = '<div class="kpis">'
      + kpi("Client contribution", k1(w.contribution), `${pc(w.contributionPct)} of price, after partners and fees`)
      + kpi("Profit after acquisition", k1(w.afterAcq), "per client, before team and overheads", "dark")
      + kpi("Payback", `${gb(w.payback, 1)}<span> months</span>`, "to repay acquisition")
      + kpi("Renewing client", k1(w.renewContribution), "contribution; no acquisition, no referral") + "</div>";
    const Dl = A.delivery, hrs = Dl.physicianHours;
    const CLIENT_YEAR = '<div class="cards c4">'
      + card("Stays", `${Math.min(...Dl.visits)}–${Math.max(...Dl.visits)} visits to Türkiye`, `Istanbul first, then Cappadocia or the Aegean. ${Dl.firstNights[0]} nights each.`, "soft")
      + card("Care", "A named team for 12 months", `Coordinator, dietitian, coach; ${hrs[0]}–${hrs[1]} physician hours.`, "soft")
      + card("Measurement", `${Dl.homeDrawsPerYear} blood panels a year`, "At the hospital on visits, at home in between. Year-end report.", "soft")
      + card("At home", "A monthly box", "Supplements and pantry foods, plus an app and devices.", "soft") + "</div>";
    const PKG_CARDS = '<div class="cards c3">' + PKG_IDS.map((id, i) => {
      const v = Dl.visits[i], dots = [0, 1, 2].map((j) => (j < v ? "<i></i>" : '<i class="off"></i>')).join(""), share = A.mix[id];
      return `<div class="pkg"><div class="dots">${dots}</div><h4>${PKG_NAMES[i]}</h4><p class="vis">${v} visit${v > 1 ? "s" : ""} a year</p>
<div class="prices"><div><small>Standard</small><strong>${usd(A.prices[id][0])}</strong></div><div><small>Premium</small><strong>${usd(A.prices[id][1])}</strong></div></div>
<p>${esc((D.packages || {})[id] || "")}</p><div class="share"><i style="width:${r0(share * 60)}%"></i>${pc(share)} of clients</div></div>`;
    }).join("") + "</div>";
    const chip = (k, v, t) => `<div class="chip"><small>${k}</small><b>${v}</b>${t}</div>`;
    const Pr = A.prices, inf = F.inflation, Pay = F.payment;
    const CHIPS = '<div class="chips c4">'
      + chip("Service level", `${pc(A.mix.premium)} choose Premium`, "Luxury hotels, private experiences and longer physician sessions, at a higher price.")
      + chip("Founding cohort", `−${pc(Pr.foundingDiscount)} in year one`, "Pilot clients pay less in return for feedback and anonymised case data.")
      + chip("Renewal", `${pc(Pr.renewalPrice)} of list price`, "Clients who stay a second year pay less; year two starts with a full re-measurement.")
      + chip("Companions", `${pc(Pr.companionShare)} of clients, −${pc(Pr.companionDiscount)}`, `Partners who join with their own protocol pay ${pc(1 - Pr.companionDiscount)} of list and cost nothing to acquire.`)
      + chip("Clinical add-ons", `${pc(A.addons.buyShare)} buy, ${usd(A.addons.spend)} each`, "Sleep program, glucose sensor, mole mapping, therapy; delivered by partners.")
      + chip("Price increases", `+${pc(Pr.listIncrease)} a year`, `List prices rise from year two; Türkiye costs in dollars rise ${pc(inf[1])} easing to ${pc(inf[4])} a year.`)
      + (Pay ? chip("Deposit", `${usd(Pay.deposit)} at sale`, `${Pay.saleToStartMonths} months before the first visit; ${pc(fn.cancelBeforeVisit)} of deposits cancel and are kept.`)
        + chip("Payment", Pay.byVisit ? "Per visit" : Pay.startShare >= 1 ? "At the first visit" : `${pc(Pay.startShare)} at the first visit`, Pay.byVisit ? `${PKG_NAMES.map((n, i) => n + " " + shareList(Pay.byVisit[PKG_IDS[i]] || [1])).join(", ")} of the rest, before each visit.` : payRest(A).replace(/^./, (c) => c.toUpperCase()) + ".")
        : chip("Payment", `${pc(F.upfront)} at enrolment`, "The rest six months later."))
      + "</div>";
    const PKG_LEGEND = legend([["Partner delivery", "", "var(--cost)"], ["Fees and referral", "", "var(--cost2)"], ["Acquisition", "", "var(--blue-line)"], ["Profit after acquisition", "", "var(--tb)"]]);
    const weak = U.cols.reduce((a, c) => (c.afterAcq < a.afterAcq ? c : a));
    const c0 = U.cols[0], c2 = U.cols[2];   // Annual and Summer–Winter, Standard: one visit apart
    const nonVisit = [["The monthly box", w.box], ["Program physician time", w.physician], ["Home blood draws", w.draws], ["The technology platform", w.platform]].sort((a, b) => b[1] - a[1])[0];
    const UE_POINTS = pts([`<b>${pkgShort(weak).replace(" · Std", " Standard").replace(" · Prem", " Premium")} is the weakest:</b> ${weak.afterAcq < 0 ? "−" : ""}${k1(weak.afterAcq)} profit after acquisition, ${gb(weak.payback, 1)} months to repay. An entry product.`,
      `<b>Extra visits pay:</b> a second visit adds ${usd(c2.price - c0.price)} of price for ${usd(c2.delivery - c0.delivery)} of cost.`,
      `<b>${nonVisit[0]}</b> is the biggest cost outside visits (${usd(nonVisit[1])} per client)` + (nonVisit[0] === "The monthly box" ? ". $20 less a month adds $240 per client." : "."),
      `<b>Renewals drive profit:</b> ${usd(w.renewContribution)} per renewing client.`]);
    const keep = A.logic && A.logic.funnelStages ? 1 - fn.cancelBeforeVisit : 1;
    const GROWTH_KPIS = '<div class="kpis">'
      + kpi("Qualified leads, Y5", n0(Y[4].leads), `${gb(Y[4].leads / 52)} a week (${gb(Y[2].leads / 52)} in Y3)`)
      + kpi("Lead to client", gb(fn.conversion * keep * 100, 1) + "%", keep < 1 ? `${gb(fn.conversion * 100, 1)}% leave a deposit; ${pc(fn.cancelBeforeVisit)} of deposits cancel` : "of qualified leads buy")
      + kpi("Cost per lead", usd(fn.costPerLead[4]), fn.costPerLead[0] === fn.costPerLead[4] ? "the same in every year" : `from ${usd(fn.costPerLead[0])} in the pilot`)
      + kpi("New clients, Y5", n0(Y[4].newClients), `incl. ${n0(Y[4].referred)} via referral partners and ${n0(Y[4].companions)} companions`) + "</div>";
    const nk = (v) => (v < 0 ? "−" : "") + "$" + gb(Math.abs(r0(v / 1000))) + "k";
    const PL_POINTS = pts([Y[0].ebitda < 0 ? `<b>Pilot year loses ${kusd(-Y[0].ebitda)},</b> incl. ${kusd(Y[0].setup)} set-up.` : `<b>The pilot year earns ${kusd(Y[0].ebitda)}</b> after ${kusd(Y[0].setup)} set-up.`,
      B.firstEbitda > 1 ? `<b>EBITDA turns positive in ${FE}</b> (${nk(Y[B.firstEbitda - 1].ebitda)}); ${musd(Y[4].ebitda)} in year five.` : `<b>EBITDA is ${B.firstEbitda ? "positive from year one" : "not positive within five years"};</b> ${musd(Y[4].ebitda)} in year five.`,
      `<b>No clinic to carry:</b> overheads are ${pc(Y[4].ga / Y[4].revenue)} of revenue in year five.`,
      ...(ik5 ? [`<b>${esc(ikBy)} carries ${kusd(ik5)} a year in kind by year five</b> (${listText(ikTeam.slice(0, 3))}${ikItems.length ? ", " + ikItems.length + " cost items" : ""}): a memo, not in the P&amp;L.`] : [])]);

    // funding: the two rounds
    const preKpi = short
      ? kpi("Pre-seed lasts", `${Rd.preLasts}<span> months</span>`, `runs out in month ${Rd.preLasts + 1}, before the seed at the end of month ${Rd.seedMonth}`, "red")
      : kpi("Pre-seed lasts", Rd.preLasts >= 36 ? "36+<span> months</span>" : `${Rd.preLasts}<span> months</span>`, Rd.cushion >= 0 ? `${kusd(Rd.cushion)} left at the low point before the seed` : `${kusd(-Rd.cushion)} short before the seed`);
    const FUND_KPIS = '<div class="kpis">'
      + kpi("Raised in two rounds", kusd(Rd.total), `${kusd(Rd.pre)} pre-seed on day one, ${kusd(Rd.seed)} seed at the end of month ${Rd.seedMonth}`, "dark")
      + kpi("Cash need", kusd(R.funding), `lowest cash ${kusd(-mo.lowAfter)} in month ${mo.lowAfterMonth}, plus the ${buf} buffer`)
      + preKpi
      + kpi(Rd.surplus < -0.5 ? "Seed shortfall" : "Seed surplus", kusd(Math.abs(Rd.surplus)), `the plan needs ${kusd(Rd.seedNeeded)} of the ${kusd(Rd.seed)} seed`) + "</div>";
    const months = (n) => (["", "one month", "two months", "three months", "four months", "five months", "six months"][n] || n + " months");
    const ROUNDS_NOTE = short
      ? `<div class="note red"><b>The ${kusd(Rd.pre)} pre-seed runs out in month ${Rd.preLasts + 1}, ${months(Rd.seedMonth - Rd.preLasts - 1)} before the seed at the end of month ${Rd.seedMonth}.</b> Up to the seed, cash after the reserve falls to ${kusd(-lowBefore)}; with the ${buf} buffer the pre-seed would need ${kusd(Rd.preNeeded)}. ${R.funding <= Rd.total + 0.5 ? `Both rounds together cover the ${kusd(R.funding)} cash need, with ${kusd(Rd.surplus)} of the seed to spare.` : `Both rounds together are ${kusd(R.funding - Rd.total)} short of the ${kusd(R.funding)} cash need.`}</div>`
      : `<div class="note"><b>${esc(status.text)}.</b> ${R.funding <= Rd.total + 0.5 ? `The seed leaves ${kusd(Rd.surplus)} for growth and risk.` : ""}</div>`;
    const yearEndView = B.peakAfterReserve;
    const FUND_PTS = pts([`<b>The monthly view goes deeper:</b> cash after the reserve bottoms out in month ${mo.lowAfterMonth} at ${kusd(-mo.lowAfter)}` + (mo.lowAfter > yearEndView + 500 ? `, ${kusd(mo.lowAfter - yearEndView)} below the year-end figure.` : "."),
      `<b>${Pay && Pay.byVisit ? "Clients pay per visit" : "Payment"}:</b> ${payText(A)}. The visit costs are covered on the day; the set-up, the fixed team and the months before the first clients need the funding.`,
      `<b>New countries are a marketing step:</b> clients travel to Türkiye, so a new source country needs only ${usd(A.countries.oneOff)} for translation and claims review; ad spend sits in the cost per lead.`,
      `<b>Part of client prepayments is held back</b> for refunds: ${pc(F.reserve[0])} of undelivered client cash in year one, ${pc(F.reserve[1])} in year two, then ${pc(F.reserve[2])}.`]);
    const CASH_CAP = `<p class="cap">Year-end figures, before funding and before the reserve. The lowest point inside a year is in the monthly chart: ${kusd(-mo.lowAfter)} in month ${mo.lowAfterMonth}, after the reserve.</p>`;
    const NG = R.noGrowth, hy = (A.noGrowth && A.noGrowth.holdYear) || 1;
    const cashSeries = [{ name: "Plan", values: Y.map((y) => y.cumCash), c: "s-tb" }, { name: "No growth", values: NG.years.map((y) => y.cumCash), c: "s-tl" }]
      .concat(hardest ? [{ name: "Hardest case", values: hardest.years.map((y) => y.cumCash), c: "s-cost" }] : []);
    const CASH_LEGEND = legend([["Plan", "ln", "var(--tb)"], [`No growth investment after Y${hy}`, "ln", "var(--tl)"]].concat(hardest ? [[`Hardest case: ${esc(hardest.label)}`, "ln", "#9a9ea5"]] : []));
    const reserveY5 = (yy) => yy[4].unearned * F.reserve[4];
    const cmp = [["No growth", NG.years, NG], ["Plan", Y, B]].concat(hardest ? [["Hardest", hardest.years, hardest]] : []);
    const CMP_TABLE = table(["USD M", ...cmp.map((c) => c[0])], [
      ["New clients, Y5", ...cmp.map(([, yy]) => n0(yy[4].newClients))],
      ["Revenue, Y5", ...cmp.map(([, yy]) => gb(yy[4].revenue / 1e6, 1))],
      ["EBITDA, Y5", ...cmp.map(([, yy]) => neg(gb(Math.abs(yy[4].ebitda) / 1e6, 2), yy[4].ebitda))],
      ["EBITDA positive from", ...cmp.map(([, , p]) => (p.firstEbitda ? "Y" + p.firstEbitda : "–"))],
      ["Five-year net profit", ...cmp.map(([, , p]) => neg(gb(Math.abs(p.netProfit5) / 1e6, 2), p.netProfit5))],
      ["+ Prepayments and payment timing", ...cmp.map(([, yy, p]) => neg(gb(Math.abs(yy[4].cumCash - p.netProfit5) / 1e6, 2), yy[4].cumCash - p.netProfit5))],
      { cls: "tot", cells: ["= Five-year net cash flow", ...cmp.map(([, yy]) => neg(gb(Math.abs(yy[4].cumCash) / 1e6, 2), yy[4].cumCash))] },
      ["+ Raised in both rounds", ...cmp.map(() => gb(Rd.total / 1e6, 2))],
      { cls: "tot", cells: ["= Cash at end of year five", ...cmp.map(([, yy]) => neg(gb(Math.abs(yy[4].cumCash + Rd.total) / 1e6, 2), yy[4].cumCash + Rd.total))] },
      ["of which held in reserve", ...cmp.map(([, yy]) => gb(reserveY5(yy) / 1e6, 2))],
      { cls: "sm", cells: ["Cash need (low point + buffer)", ...cmp.map(([, , p]) => gb((p.funding != null ? p.funding : p.raise) / 1e6, 2))] },
    ], "compact");
    const CMP_CAP = `<p class="cap">No growth: new clients held at the year-${hy} level from Y${Math.min(5, hy + 1)} on, no new source countries.${hardest ? ` Hardest case: the business case with the highest cash need (${esc(hardest.group)}: ${esc(hardest.label)}).` : ""}</p>`;
    const SCEN_TABLE = G.length ? table(["Business cases", "Cash need, USD k", "Hardest case", "Carried"], G.map((g) => {
      const f = g.cases.map((c) => c.funding), wc = worst(g);
      return [g.title, `${tk(Math.min(...f))} – ${tk(Math.max(...f))}`, { v: `${esc(wc.label)} <span class="dim">(${tk(wc.funding)})</span>`, cls: "l" }, `${g.cases.filter((c) => c.carried).length} of ${g.cases.length}`];
    }).concat([{ cls: "tot", cells: ["Plan", tk(R.funding), { v: "–", cls: "l" }, status.ok ? "Yes" : "No"] }]), "compact scen")
      + `<p class="cap">Each case changes one group of inputs on the plan and is computed in full. Carried: both rounds (${kusd(Rd.pre)} + ${kusd(Rd.seed)}) cover its cash need and the pre-seed still reaches month ${Rd.seedMonth}.${status.ok ? "" : " The plan itself is not carried, so no case is: " + esc(status.text.charAt(0).toLowerCase() + status.text.slice(1)) + "."}</p>` : "";

    // what must be true
    const be = X.be.data, beBase = be[2][2], N3 = Y[2].newClients;
    const must = (k, base, baseLbl, h, limLbl, lim, p) => `<div class="card must"><p class="k">${k}</p><span class="big">${base}</span><p class="bl">${baseLbl}</p><h4>${h}</h4><div class="lim"><small>${limLbl}</small><b>${lim}</b></div><p class="note-s">${p}</p></div>`;
    const cpc = fn.costPerLead[2] / fn.conversion / (fn.cancelBeforeVisit < 1 && keep < 1 ? 1 - fn.cancelBeforeVisit : 1);
    const rg = grp("renewal"), rw = rg && rg.cases.reduce((a, c) => (c.netProfit5 < a.netProfit5 ? c : a));
    const p10 = X.partner10;
    const MUST = '<div class="cards c4">'
      + must("Demand", n0(N3), "plan: new clients in year three", "Enough clients to cover fixed costs", "Year-3 break-even", beBase == null ? "not reached" : `~${n0(beBase)} a year`, `From ${n0(Y[2].leads)} qualified leads at ${gb(fn.conversion * 100, 1)}% to a deposit, plus referrals and companions.`)
      + must("Acquisition cost", usd(fn.costPerLead[2]), `plan: per lead, ${usd(cpc)} per client from marketing`, "Cost of winning a client stays in range", "Year-3 EBITDA stays positive up to",
        X.cacLimit == null ? (Y[2].ebitda < 0 ? "negative at plan" : "any cost tested") : `~${usd(fn.costPerLead[2] * X.cacLimit)} a lead`, fn.costPerLead[0] === fn.costPerLead[4] ? "Held flat from year one to year five." : `From ${usd(fn.costPerLead[0])} in year one to ${usd(fn.costPerLead[4])} in year five.`)
      + must("Renewal", pc(A.scenarios.base.renewal), "plan: renew into year two", "Clients come back for a second year", rw && !rw.plan ? `At ${esc(rw.label.replace(/ renew$/, ""))} renewal` : "Five-year net profit",
        rw && !rw.plan ? `${kusd(rw.netProfit5)} profit in 5 years` : kusd(B.netProfit5), `Of 100 clients, ${r0(A.scenarios.base.renewal * 100)} start year two, ${r0(A.scenarios.base.renewal * A.retention.y3 * 100)} year three.`)
      + must("Partner rates", usd(w.delivery), "plan: partner cost per client a year", "Hospital and hotel rates hold", "If rates rise 10%", `+${usd(w.delivery * 0.1)} a client`,
        `Cash need ${kusd(p10.funding)} instead of ${kusd(R.funding)}; year-5 EBITDA ${kusd(p10.scen.base.years[4].ebitda)}. Each 10% rise weighs like a ${pc(w.delivery * 0.1 / w.price)} price cut.`)
      + "</div>";
    const beColour = (v) => (v == null ? "background:var(--red-soft);color:var(--red)" : shade(v <= 0.6 * N3 ? 1 : v <= 0.8 * N3 ? 0.7 : v <= N3 ? 0.5 : v <= 1.5 * N3 ? 0.3 : 0));
    const acqFlat = X.acq.data.flat(), aLo = Math.min(...acqFlat), aHi = Math.max(...acqFlat);
    const acqColour = (v) => (v < 0 ? shade(0) : shade(aHi > aLo ? (v - aLo) / (aHi - aLo) : 0.5));
    const HEAT_BE = heat(X.be, (v) => (v == null ? "never" : n0(v)), beColour, "Acquisition per new client, USD", "Weighted first-year price, USD k");
    const HEAT_ACQ = heat(X.acq, (v) => (v < 0 ? "−" : "") + gb(Math.abs(v) / 1000, 1), acqColour, "Acquisition per new client, USD", "Weighted first-year price, USD k");
    const HEAT_CAP = `<p class="cap">Plan in the middle (acquisition ${usd(w.acquisition)} per new client in year 3, price ${usd(w.price)}); price −20% to +20%, acquisition ×0.5 to ×1.5. Break-even: year-3 EBITDA nil, every other input as planned. Blue good, red weak.</p>`;
    const cg = grp("conversion"), cw = cg && worst(cg), colg = grp("collection"), launch = grp("launch");
    const fund = (g) => g.cases.map((c) => c.funding);
    const RISKS = '<div class="cards c3">'
      + card("Demand", "Clients come slower", cw ? `At ${esc(cw.label.replace(/^Lead to deposit /, "").toLowerCase())} lead to deposit the cash need is ${kusd(cw.funding)} and EBITDA turns positive in ${yearOf(cw.firstEbitda)}; the pilot measures real conversion first.` : "The pilot measures real conversion first.")
      + card("Collection", "When clients pay", colg ? `The assumption the cash need is most sensitive to: ${kusd(Math.min(...fund(colg)))} to ${kusd(Math.max(...fund(colg)))} across the payment schedules tested.` : `Plan: ${payText(A, true)}.`)
      + card("Launch", "Pilot cohorts start later", launch ? `A later launch raises the cash need to up to ${kusd(Math.max(...fund(launch)))}; the pre-seed has to reach the seed either way.` : "Set-up and the first cohorts set the low point.")
      + card("Partner costs", "Hotel and hospital prices in dollars", `Türkiye costs rise faster than the lira weakens (plan: +${pc(inf[1])} in year two). Fix partner rates in dollars per program year.`)
      + card("Product mix", `Too many ${pkgShort(weak).replace(" · Std", " Standard").replace(" · Prem", " Premium")} clients`, "The lowest-value product. Upgrades at the year-end review are the fix.")
      + card("Regulation", "Claims, supplements, telehealth", esc(D.regulation || "")) + "</div>";
    const swTxt = A.partners.operator || A.partners.physicians ? "Partner switches are on in this plan." : `Options, not in the plan: Plus International's partner rates would take ${kusd(X.switches.none - X.switches.rates)} off the cash need, a physician network ${kusd(X.switches.none - X.switches.physicians)}.`;
    const SP = A.support || {};
    const UPSIDE = `<div class="note"><b>In the numbers:</b> ${SP.marketingShare ? `Ministry of Trade marketing support, ${pc(SP.marketingShare)} of eligible marketing ${SP.lagMonths || 12} months after the spend` : "no marketing support"}${ik5 ? `; staff and costs ${esc(ikBy)} carries in kind are a memo outside the P&amp;L` : ""}. <b>Not in the numbers (upside):</b> ${esc(listText(D.notInNumbers || []))}. ${swTxt}</div>`;

    // appendix tables
    const ucols = [...U.cols, w];
    const ur = (label, f, cls = "", fmt = tu) => ({ cls, cells: [label, ...ucols.map((c) => fmt(f(c)))] });
    const UE_TABLE = table(["Per client, year one · USD", "Ann. Std", "Ann. Prem", "S–W Std", "S–W Prem", "Seas. Std", "Seas. Prem", "Weighted"], [
      ur("List price", (c) => c.price, "tot"), ur("First visit, Istanbul", (c) => c.first, "in"), ur("Later visits", (c) => c.later, "in"),
      ur("Physicians, telehealth", (c) => c.physician + c.tele, "in"), ur("Home blood draws", (c) => c.draws, "in"), ur("Monthly box, starter pack", (c) => c.box, "in"),
      ur("Team travel, interpreters", (c) => c.support, "in"), ur("Platform, devices, report", (c) => c.platform + c.wear + c.report, "in"),
      ur("Delivery cost", (c) => c.delivery, "tot"), ur("Fees and referral", (c) => c.processing + c.referral, "in"), ur("Client contribution", (c) => c.contribution, "tot"),
      ur("Contribution, % of price", (c) => c.contributionPct, "sm", pc), ur("Acquisition, expected", (c) => c.acquisition, "in"), ur("Profit after acquisition", (c) => c.afterAcq, "tot hl"),
      ur("Renewing client, year two", (c) => c.renewContribution), ur("Months to repay acquisition", (c) => c.payback, "", (v) => gb(v, 1)),
    ], "compact wide dense");
    const yr = (label, f, cls = "", fmt = tk) => ({ cls, cells: [label, ...Y.map((y) => fmt(f(y)))] });
    const PL_FULL = table(["Plan · USD k", ...YRS], [
      yr("Bookings (programs sold)", (y) => y.bookings), yr("Refunds to withdrawing clients", (y) => -y.refunds, "in", cost),
      ...(Y.some((y) => y.forfeitRevenue) ? [yr("Forfeited deposits", (y) => y.forfeitRevenue, "in")] : []),
      yr("Revenue", (y) => y.revenue, "tot"), yr("Partner delivery", (y) => y.partnerDelivery, "in", cost),
      yr("Add-ons, fees, referral", (y) => y.addonDelivery + y.processing + y.referral, "in", cost), yr("Care team", (y) => y.careTeam, "in", cost),
      yr("Gross profit", (y) => y.grossProfit, "tot"), yr("Sales and marketing", (y) => y.salesMarketing, "in", cost),
      yr("General and administrative", (y) => y.ga, "in", cost), yr("Set-up and contingency", (y) => y.setup + y.contingency, "in", cost),
      ...(Y.some((y) => y.marketingSupport) ? [yr("Marketing support received", (y) => y.marketingSupport, "in")] : []),
      yr("EBITDA", (y) => y.ebitda, "tot hl"), yr("Tax (after loss carry-forward)", (y) => y.tax, "in", cost), yr("Net profit", (y) => y.netProfit, "tot"),
      yr("Cumulative cash before funding", (y) => y.cumCash), yr("Team (FTE)", (y) => y.fteTotal, "", n0),
      ...(Y.some((y) => y.inKind) ? [yr(`Carried in kind by ${esc(ikBy)} (memo)`, (y) => y.inKind, "sm")] : []),
    ], "compact dense");
    const cohorts = A.monthly.y1Cohorts.map((v, i) => [v, i + 1]).filter(([v]) => v > 0).map(([, m]) => m);
    const ASSUM = [
      ["Istanbul measurement day", `${usd(Dl.hospitalDay[0])}` + (Dl.hospitalDay[1] !== Dl.hospitalDay[0] ? ` / ${usd(Dl.hospitalDay[1])}` : ""), "hospitalDay"],
      ["Hotels, Istanbul · regions (Std / Prem)", `${usd(Dl.firstRate[0])} / ${usd(Dl.firstRate[1])} · ${usd(Dl.laterRate[0])} / ${usd(Dl.laterRate[1])} list, −${pc(Dl.hotelDiscount)}`, "hotels"],
      ["Physician time", `${hrs[0]}–${hrs[1]} h at ${usd(Dl.physicianRate[0])}`, "physician"],
      ["Home blood draw", usd(Dl.homeDraw[0]), "homeDraw"],
      ["Monthly box", `${usd(Dl.monthlyBox[0])} / ${usd(Dl.monthlyBox[1])}`, "box"],
      ["Technology platform", `${usd(Dl.platformPerClient[0])}/client + ${usd(A.overheads.platformFee)}/month`, "platform"],
      ["Qualified leads and conversion", `${n0(fn.leads[0])} → ${n0(fn.leads[4])} a year; ${gb(fn.conversion * 100, 1)}% to a deposit`, "leads"],
      ["Cost per qualified lead", fn.costPerLead[0] === fn.costPerLead[4] ? `${usd(fn.costPerLead[0])} in every year` : `${usd(fn.costPerLead[0])} → ${usd(fn.costPerLead[4])}`, "costPerLead"],
      ["Cancellations · withdrawals", `${pc(fn.cancelBeforeVisit)} of deposits before visit 1 · ${pc(fn.withdraw)} mid-program, ${pc(fn.refund)} refunded`, "cancel"],
      ["Referral partners", `${pc(ref(0))} → ${pc(ref(4))} of new clients at ${pc(A.addons.referralCommission)}`, "referral"],
      ["Renewal by program year", `${pc(A.scenarios.base.renewal)} · ${pc(A.retention.y3)} · ${pc(A.retention.y4)}`, "renewal"],
      ["Payment", Pay ? `${usd(Pay.deposit)} deposit at sale; then ${payRest(A)}` : payText(A), "payment"],
      ["Marketing support", SP.marketingShare ? `${pc(SP.marketingShare)} of eligible marketing, ${SP.lagMonths || 12} months later` : "None", "support"],
      ...(ik5 ? [[`Carried in kind by ${esc(ikBy)}`, `${listText(ikTeam)}${ikItems.length ? "; " + ikItems.join(" · ") : ""}`, "inKind"]] : []),
      ["One-off set-up, year one", usd(Y[0].setup) + (ikItems.some((i) => i.startsWith("set-up")) ? " (rest in kind)" : ""), "setup"],
      ["Source countries", `${A.countries.opened.reduce((a, v) => a + v, 0)} by year five; ${usd(A.countries.oneOff)} to open each after the first`, "countries"],
      ["Cost inflation", "+" + inf.slice(1).map((v) => pc(v)).join(", +") + " in years 2–5", "inflation"],
      ["Funding", `${kusd(Rd.pre)} pre-seed, ${kusd(Rd.seed)} seed at the end of month ${Rd.seedMonth}; buffer ${buf}`, "rounds"],
    ];
    const ASSUM_TABLE = table(["Assumption", "Value · USD", "Basis"], ASSUM.map(([a, v, k]) => [a, v.replace(/\$/g, ""), esc((D.basis || {})[k] || "")]), "compact assum dense");
    const METHOD = pts(["<b>Scope:</b> the program company only. It sells the program, employs the care team and pays partners; it owns no clinic.",
      `<b>Timing:</b> each program runs 12 months, ${F.midYear === 0.5 ? "half" : pc(F.midYear)} recognised in the enrolment year, the rest in the next.`,
      `<b>Demand:</b> qualified leads × ${gb(fn.conversion * 100, 1)}% to a deposit; ${pc(fn.cancelBeforeVisit)} of deposits cancel before the first visit and are kept. Plus referral clients and companions; ${pc(fn.withdraw)} withdraw mid-program with a pro-rata refund. People are counted in whole numbers.`,
      `<b>Months:</b> the first 36 months are modelled monthly: set-up in months 1–${A.monthly.setupMonths}, pilot cohorts in month${cohorts.length > 1 ? "s" : ""} ${listText(cohorts.map(String))}, marketing paid ${A.monthly.marketingLeadMonths || 0} months before the first visit.`,
      `<b>Cash:</b> ${payText(A)}; ${pc(F.partnerUpfront)} of partner costs paid in the enrolment year.`,
      `<b>Funding:</b> the cash need is the lowest cash after the prepayment reserve plus a ${buf} buffer; the ${kusd(Rd.pre)} pre-seed comes on day one, the ${kusd(Rd.seed)} seed at the end of month ${Rd.seedMonth}.`,
      `<b>Currency and tax:</b> USD excl. VAT and flights; ${pc(F.tax)} tax after loss carry-forward${SP.marketingShare ? `; marketing support ${pc(SP.marketingShare)} of eligible spend` : "; no grants"}.`]);
    const SOURCES = `<p class="cap">Sources: ${esc(D.sources || "")}</p>`;
    const MONTHLY = (h) => `<div class="fig mbars" data-mchart data-h="${h}"></div>`;
    const MONTHLY_CAP = `<p class="cap">Cash after the prepayment reserve, with the ${kusd(Rd.pre)} pre-seed on day one and the ${kusd(Rd.seed)} seed at the end of month ${Rd.seedMonth}. ${esc(status.text)}.</p>`;
    const H2_FUND = `${kusd(Rd.pre)} pre-seed and ${kusd(Rd.seed)} seed <em>for a ${kusd(R.funding)} cash need</em>`;
    const priceW = w.price, delivW = w.delivery;
    const COVER_H = `A client pays ${k1(priceW)} and costs ${k1(delivW)} to serve.<em>EBITDA turns positive in ${FE}.</em>`.replace("turns positive in after year five", "is not positive within five years");
    const TEAM_LEGEND = legend([["Care team", "", "var(--tb)"], ["Advisors", "", "var(--tl)"], ["Leadership", "", "var(--ink)"]]);
    const CLIENT_LEGEND = legend([["New", "", "var(--tb)"], ["Renewing", "", "var(--tl)"]]);
    const PL_LEGEND = legend([["Revenue", "", "var(--ink)"], ["EBITDA", "", "var(--tb)"], ["Loss", "", "var(--red)"]]);
    const PL_MINI = table(["USD k", ...YRS], [{ cls: "tot", cells: ["Revenue", ...Y.map((y) => tk(y.revenue))] }, ["Gross profit", ...Y.map((y) => tk(y.grossProfit))],
      { cls: "tot hl", cells: ["EBITDA", ...Y.map((y) => tk(y.ebitda))] }, { cls: "sm", cells: ["EBITDA margin", ...Y.map((y) => (y.ebitdaMargin < -1 ? "n/m" : neg(pc(Math.abs(y.ebitdaMargin)), y.ebitdaMargin * 100)))] },
      ["Net profit", ...Y.map((y) => tk(y.netProfit))]], "compact");
    const TEAM_CAP = `<p class="cap">Team, full-time equivalents${ikTeam.length ? `, incl. ${listText(ikTeam)} carried in kind by ${esc(ikBy)}` : ""}.</p>`;

    // ---------------------------------------------------------------- A4 pages
    page(`${esc(ctx.name)} · ${today()}`, `
<p class="kicker">P&amp;L feasibility · Program company · Five years</p>
<h1 class="cover-h">${COVER_H}</h1>
<p class="cover-sub">A year of measured, physician-signed care with one to three stays in Türkiye. Partners are paid per client, so the cost of each client is known.</p>
${FACTS}
<div class="sec">${sec("Where one client's money goes", "weighted client, first year")}<div class="fig">${clientBar(w)}</div>
<p class="cap"><b>Contribution</b> = price − partners − fees. <b>Profit after acquisition</b> = contribution − acquisition. P&amp;L gross profit also deducts the care team.</p></div>
<div class="sec">${CLIENT_KPIS}</div>
<div class="sec">${sec("What the client buys", "one program year")}${CLIENT_YEAR}</div>`);
    page("01 · Packages and price", `
<p class="kicker">01 / Packages and price</p><h2 class="h">Three packages, <em>two service levels</em></h2>
<div class="sec">${PKG_CARDS}</div>
<div class="sec">${sec("Pricing and payment rules in the model")}${CHIPS}</div>
<div class="sec">${sec("Above remote programs, below destination clinics", "published prices")}<div class="fig">${priceChart(A, D.benchmarks || [])}</div>
<p class="cap">Grey: competitors per year. Light grey: per stay. Blue: proposed Anatolian prices.</p></div>`);
    page("02 · Unit economics", `
<p class="kicker">02 / Unit economics</p><h2 class="h">${weak.afterAcq > 0 ? "Every package pays back" : "Not every package pays back"} <em>its acquisition cost</em></h2>
<p class="sub">What each package leaves after partners, fees and acquisition.</p>
<div class="sec">${PKG_LEGEND}<div class="fig">${pkgBars(U.cols)}</div></div>
<div class="sec">${sec("The weighted client, step by step", "first year, USD")}<div class="fig">${waterfall(w)}</div></div>
<div class="sec">${UE_POINTS}</div>`);
    page("03 · Growth and profit", `
<p class="kicker">03 / Growth and profit</p><h2 class="h">From ${n0(Y[0].newClients)} pilot clients to <em>${n0(Y[4].newClients)} a year</em></h2>
<div class="sec">${GROWTH_KPIS}</div>
<div class="sec split even"><div>${CLIENT_LEGEND}<div class="fig">${clientsChart(Y)}</div><p class="cap">Program years sold.</p></div>
<div>${TEAM_LEGEND}<div class="fig">${teamChart(Y, A.team)}</div>${TEAM_CAP}</div></div>
<div class="sec">${sec("Profit and loss", "plan")}<div class="split even"><div>${PL_LEGEND}<div class="fig">${revEbitda(Y)}</div></div><div>${PL_MINI}<div style="margin-top:4mm">${PL_POINTS}</div></div></div></div>`);
    page("04 · Cash and funding", `
<p class="kicker">04 / Cash and funding</p><h2 class="h">${H2_FUND}</h2>
<p class="sub">The cash need is the lowest cash point after holding back part of client prepayments as a refund reserve, plus a ${buf} buffer.</p>
<div class="sec">${FUND_KPIS}</div>${ROUNDS_NOTE}
<div class="sec">${sec("Cash balance, month by month", "first 36 months, after the reserve, with the rounds")}${MONTHLY(190)}</div>
<div class="sec">${FUND_PTS}</div>`);
    page("04 · Business cases", `
<p class="kicker">04 / Cash and funding</p><h2 class="h">Business cases <em>against the two rounds</em></h2>
<div class="sec">${sec("Cash need by group of cases", "each computed in full")}${SCEN_TABLE}</div>
<div class="sec split even"><div>${sec("Cumulative cash", "before funding")}${CASH_LEGEND}<div class="fig">${cashLines(cashSeries, 460, 250)}</div></div><div>${CMP_TABLE}${CMP_CAP}</div></div>
${UPSIDE}`);
    page("05 · What must be true", `
<p class="kicker">05 / What must be true</p><h2 class="h">Four things <em>must hold</em></h2>
<div class="sec">${MUST}</div>
<div class="sec split even"><div>${sec("Clients a year to break even", "year-3 new clients")}${HEAT_BE}</div><div>${sec("Profit per new client", "USD k, after acquisition")}${HEAT_ACQ}</div></div>${HEAT_CAP}
<div class="sec">${sec("Risks to the numbers")}${RISKS}</div>`);
    page("Appendix A", `
<p class="kicker">Appendix A / Detail tables</p><h2 class="h">Unit economics and P&amp;L in full</h2>
<div class="sec">${sec("Per client, by package")}${UE_TABLE}</div>
<div class="sec">${sec("Five-year P&amp;L", "plan")}${PL_FULL}</div>`);
    page("Appendix B", `
<p class="kicker">Appendix B / Assumptions</p><h2 class="h">Key assumptions of the plan</h2>
<div class="sec">${ASSUM_TABLE}</div>
<div class="sec">${SOURCES}</div>`);
    page("Appendix C", `
<p class="kicker">Appendix C / Method</p><h2 class="h">How the model is built</h2>
<div class="sec">${METHOD}</div>`);

    // ---------------------------------------------------------------- slides
    slide("P&amp;L feasibility", `<p class="kicker">P&amp;L feasibility · Program company · Five years</p><h1 class="cover-h">${COVER_H}</h1>${FACTS}`);
    slide("One client", `<p class="kicker">One client</p><h2 class="h">Where one client's money goes</h2><div class="fill"><div class="fig">${clientBar(w)}</div><div class="mt">${CLIENT_KPIS}</div></div>`);
    slide("01 · Packages", `<p class="kicker">01 / Packages and price</p><h2 class="h">Three packages, <em>two service levels</em></h2><div class="fill">${PKG_CARDS}</div>`);
    slide("01 · Price", `<p class="kicker">01 / Packages and price</p><h2 class="h">Above remote programs, <em>below destination clinics</em></h2>
<div class="fill"><div class="fig" style="max-width:980px">${S(priceChart(A, D.benchmarks || []), 1.1)}</div><p class="cap">Grey: competitors per year. Light grey: per stay. Blue: proposed Anatolian prices.</p></div>`);
    slide("01 · Pricing rules", `<p class="kicker">01 / Packages and price</p><h2 class="h">Pricing and payment rules in the model</h2><div class="fill">${CHIPS}</div>`);
    slide("02 · Unit economics", `<p class="kicker">02 / Unit economics</p><h2 class="h">${weak.afterAcq > 0 ? "Every package pays back" : "Not every package pays back"} <em>its acquisition cost</em></h2><div class="fill">${PKG_LEGEND}<div class="fig" style="max-width:1000px">${S(pkgBars(U.cols))}</div></div>`);
    slide("02 · Unit economics", `<p class="kicker">02 / Unit economics</p><h2 class="h">The weighted client, step by step</h2><div class="fill"><div class="fig" style="width:660px;margin:0 auto">${waterfall(w)}</div><div style="margin-top:18px">${UE_POINTS}</div></div>`);
    slide("03 · Growth", `<p class="kicker">03 / Growth</p><h2 class="h">From ${n0(Y[0].newClients)} pilot clients to <em>${n0(Y[4].newClients)} a year</em></h2>
<div class="fill">${GROWTH_KPIS}<div class="split even mt"><div>${CLIENT_LEGEND}<div class="fig" style="max-width:330px">${S(clientsChart(Y))}</div></div><div>${TEAM_LEGEND}<div class="fig" style="max-width:330px">${S(teamChart(Y, A.team))}</div></div></div></div>`);
    slide("03 · Profit and loss", `<p class="kicker">03 / Profit and loss</p><h2 class="h">EBITDA ${B.firstEbitda ? "turns positive in" : "is not positive within"} <em>${B.firstEbitda ? FE : "five years"}</em></h2>
<div class="fill"><div class="split even" style="align-items:center"><div>${PL_LEGEND}<div class="fig">${S(revEbitda(Y))}</div></div><div>${PL_MINI}<div class="mt">${PL_POINTS}</div></div></div></div>`);
    slide("04 · Cash and funding", `<p class="kicker">04 / Cash and funding</p><h2 class="h">${H2_FUND}</h2><div class="fill">${FUND_KPIS}<div class="mt">${MONTHLY(200)}${MONTHLY_CAP}</div></div>`);
    slide("04 · Cash and funding", `<p class="kicker">04 / Cash and funding</p><h2 class="h">Cumulative cash: <em>plan, no growth, hardest case</em></h2>
<div class="fill"><div class="split even" style="align-items:center"><div>${CASH_LEGEND}<div class="fig">${S(cashLines(cashSeries), 1.1)}</div>${CASH_CAP}</div><div>${CMP_TABLE}${CMP_CAP}</div></div></div>`);
    slide("04 · Cash and funding", `<p class="kicker">04 / Cash and funding</p><h2 class="h">Business cases <em>against the two rounds</em></h2><div class="fill">${SCEN_TABLE}</div>`);
    slide("04 · Cash and funding", `<p class="kicker">04 / Cash and funding</p><h2 class="h">Year one, and what drives the need</h2>
<div class="fill"><div class="split even" style="align-items:center"><div>${sec("Year one: where the money goes")}<div class="fig">${S(y1Bars(Y[0]))}</div></div><div>${FUND_PTS}</div></div></div>`);
    slide("05 · What must be true", `<p class="kicker">05 / What must be true</p><h2 class="h">Four things <em>must hold</em></h2><div class="fill">${MUST}</div>`);
    slide("05 · Sensitivity", `<p class="kicker">05 / Sensitivity</p><h2 class="h">Price and acquisition cost decide the volume needed</h2>
<div class="fill"><div class="split even"><div>${sec("Clients a year to break even", "year-3 new clients")}${HEAT_BE}</div><div>${sec("Profit per new client", "USD k, after acquisition")}${HEAT_ACQ}</div></div>${HEAT_CAP}</div>`);
    slide("05 · Risks", `<p class="kicker">05 / Risks</p><h2 class="h">What could break the plan</h2><div class="fill">${RISKS}${UPSIDE}</div>`);
    slide("Method", `<p class="kicker">Method</p><h2 class="h">How the model is built</h2><div class="fill">${METHOD}</div>`);

    // ---------------------------------------------------------------- app screens (Report section): the same blocks as panels
    const fig = (svgStr, legendHtml = "") => `${legendHtml}<div class="fig">${svgStr}</div>`;
    const panel = (title, sub, body, wide) => ({ title, sub, body, wide: !!wide });
    const screens = [
      { id: "rpackages", title: "Packages and price", meta: `Three packages, two service levels · weighted list price ${usd(w.price)} in year one`,
        kpis: CLIENT_KPIS, panels: [
          panel("What the client buys", "one program year", CLIENT_YEAR, true),
          panel("Three packages, two service levels", "list price, year one", PKG_CARDS, true),
          panel("Pricing and payment rules", "in the model", CHIPS, true),
          panel("Above remote programs, below destination clinics", "published prices", fig(priceChart(A, D.benchmarks || [])) + `<p class="cap">Grey: competitors per year. Light grey: per stay. Blue: proposed Anatolian prices.</p>`, true)] },
      { id: "reconomics", title: "Client economics", meta: `Weighted client, year one · contribution ${usd(w.contribution)} · profit after acquisition ${usd(w.afterAcq)}`,
        kpis: CLIENT_KPIS, panels: [
          panel("Where one client's money goes", "weighted client, first year", fig(clientBar(w)) + `<p class="cap"><b>Contribution</b> = price − partners − fees. <b>Profit after acquisition</b> = contribution − acquisition. P&amp;L gross profit also deducts the care team.</p>`, true),
          panel(weak.afterAcq > 0 ? "Every package pays back its acquisition cost" : "Not every package pays back its acquisition cost", "what each package leaves after partners, fees and acquisition", fig(pkgBars(U.cols), PKG_LEGEND)),
          panel("The weighted client, step by step", "first year, USD", fig(waterfall(w))),
          panel("What the numbers say", "", UE_POINTS),
          panel("Per client, by package", "year one, USD", UE_TABLE, true)] },
      { id: "rgrowth", title: "Growth and profit", meta: `From ${n0(Y[0].newClients)} pilot clients to ${n0(Y[4].newClients)} a year · EBITDA positive from ${Yof(B.firstEbitda)}`,
        kpis: GROWTH_KPIS, panels: [
          panel("Program years sold", "new and renewing clients", fig(clientsChart(Y), CLIENT_LEGEND)),
          panel("Team", "full-time equivalents", fig(teamChart(Y, A.team), TEAM_LEGEND) + TEAM_CAP),
          panel("Revenue and EBITDA", "plan, USD", fig(revEbitda(Y), PL_LEGEND)),
          panel("Profit and loss", "plan, USD k", PL_MINI + `<div style="margin-top:12px">${PL_POINTS}</div>`),
          panel("Five-year P&amp;L", "plan, USD k", PL_FULL, true)] },
      { id: "rcash", title: "Cash and funding", meta: `${kusd(Rd.pre)} pre-seed and ${kusd(Rd.seed)} seed for a ${kusd(R.funding)} cash need · ${esc(status.text)}`,
        kpis: FUND_KPIS + ROUNDS_NOTE, panels: [
          panel("Cash balance, month by month", "first 36 months, after the reserve, with the rounds", MONTHLY(240) + MONTHLY_CAP, true),
          panel("Year one, and what drives the need", "pilot year, USD", fig(y1Bars(Y[0]))),
          panel("What sets the cash need", "", FUND_PTS)] },
      { id: "rcases", title: "Business cases", meta: `Each group of cases computed in full against the ${kusd(Rd.total)} raised in two rounds`,
        kpis: "", panels: [
          panel("Cash need by group of cases", "each computed in full", SCEN_TABLE, true),
          panel("Cumulative cash", "before funding", fig(cashLines(cashSeries, 460, 250), CASH_LEGEND) + CASH_CAP),
          panel("Plan, no growth and the hardest case", "USD M", CMP_TABLE + CMP_CAP),
          panel("In and out of the numbers", "", UPSIDE, true)] },
      { id: "rmust", title: "What must be true", meta: "Four things must hold · break-even and profit per client recomputed with the engine",
        kpis: "", panels: [
          panel("Four things must hold", "", MUST, true),
          panel("Clients a year to break even", "year-3 new clients", HEAT_BE),
          panel("Profit per new client", "USD k, after acquisition", HEAT_ACQ),
          panel("How to read the tables", "", HEAT_CAP, true),
          panel("Risks to the numbers", "", RISKS, true)] },
    ];

    const np = PAGES.length, ns = SLIDES.length;
    const doc = PAGES.map(([right, body], i) => `<article class="page" aria-label="Page ${i + 1}">${top(right, i + 1, np)}${body}${FOOT}</article>`).join("");
    const deck = SLIDES.map(([right, body], i) => `<div class="slide-frame"><article class="slide" aria-label="Slide ${i + 1}">${top(right, i + 1, ns)}${body}${FOOT}</article></div>`).join("");
    return { doc, deck, np, ns, screens };
  }

  // ---------------------------------------------------------------- views: A4 pages, phone column, slides
  const autoView = (root) => (root.clientWidth < 760 ? "phone" : "a4");
  function setView(root, v) {
    st.view = v;
    root.classList.remove("view-a4", "view-phone", "view-slides");
    root.classList.add("view-" + v);
    document.querySelectorAll("[data-rview]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rview === v)));
    layout(root);
  }
  function layout(root) {
    const doc = root.querySelector(".ap-doc"), deck = root.querySelector(".ap-deck"), nav = root.querySelector(".ap-deck-nav");
    const cw = root.clientWidth;
    doc.style.zoom = st.view === "a4" && cw - 32 < 794 ? String((cw - 32) / 794) : "";
    if (st.view === "slides") {
      const frames = [...deck.querySelectorAll(".slide-frame")], single = cw >= 760;
      st.slide = Math.max(0, Math.min(frames.length - 1, st.slide));
      deck.classList.toggle("single", single);
      nav.classList.toggle("on", single);
      const scale = single ? Math.max(0.2, Math.min((cw - 48) / 1280, (innerHeight - 190) / 720)) : (cw - 24) / 1280;
      frames.forEach((f, i) => {
        f.style.width = 1280 * scale + "px"; f.style.height = 720 * scale + "px";
        f.firstElementChild.style.transform = `scale(${scale})`;
        f.classList.toggle("on", i === st.slide);
      });
      nav.querySelector(".count").textContent = `${st.slide + 1} / ${frames.length}`;
      nav.querySelector("[data-deck='-1']").disabled = st.slide === 0;
      nav.querySelector("[data-deck='1']").disabled = st.slide === frames.length - 1;
    }
    drawCharts(root);
  }
  function go(root, d) { st.slide += d; layout(root); }

  // The month-by-month cash balance is the tool's own chart (C.monthBars), drawn into each visible host at its width;
  // hidden hosts are drawn once at the default width so that printing from any view still has the chart.
  let drawCtx = null;
  function drawCharts(root) {
    if (!drawCtx) return;
    const { R, C, kusd, usd: u } = drawCtx, Rd = R.rounds, rows = R.monthly.rows, values = Rd.cash;
    const low = values.indexOf(Math.min(...values));
    root.querySelectorAll("[data-mchart]").forEach((host) => {
      const wd = host.clientWidth;
      if (host.dataset.w && (!wd || host.dataset.w === String(wd))) return;
      host.dataset.w = String(wd || "hidden");
      C.monthBars(host, {
        values, labels: rows.map((r) => "M" + r.m), fmt: (v, full) => (full ? u(v) : kusd(v)), height: +host.dataset.h,
        lowLabel: `${kusd(values[low])} · M${low + 1}`,
        marker: { i: Rd.seedMonth - 1, label: `Seed ${kusd(Rd.seed)}` },
        tip: (i) => `<b>Month ${i + 1} · year ${Math.floor(i / 12) + 1}</b><div class="r"><span>Cash balance</span><span>${u(values[i])}</span></div>`
          + `<div class="r"><span>Net cash flow in the month</span><span>${u(rows[i].net)}</span></div>`
          + `<div class="r"><span>Held in reserve</span><span>${u(rows[i].held)}</span></div>`,
      });
      // let the SVG scale with its box (zoomed A4 pages, scaled slides, print)
      const s = host.querySelector("svg");
      if (s) { s.removeAttribute("width"); s.removeAttribute("height"); s.style.width = "100%"; s.style.height = "auto"; }
    });
  }

  function render(ctx) {
    const R = ctx.R, built = build(ctx);
    drawCtx = ctx;
    const views = [["a4", "A4"], ["phone", "Phone"], ["slides", "Slides"]];
    const actions = `<div class="ui-seg" role="group" aria-label="Report view">${views.map(([v, t]) => `<button data-rview="${v}" aria-pressed="${st.view === v}">${t}</button>`).join("")}</div><button class="ui-btn" data-rprint>Print</button>`;
    const html = `<div class="ap-report view-${st.view || "a4"}"><main class="ap-doc">${built.doc}</main><section class="ap-deck" aria-label="Slides">${built.deck}</section>
      <div class="ap-deck-nav"><button type="button" data-deck="-1" aria-label="Previous slide">‹</button><span class="count">1 / ${built.ns}</span><button type="button" data-deck="1" aria-label="Next slide">›</button></div></div>`;
    const meta = `${ctx.esc(ctx.name)} · ${built.np} A4 pages, ${built.ns} slides · cash need ${ctx.kusd(R.funding)} · generated from the plan`;
    const after = () => {
      const root = document.querySelector(".ap-report");
      if (!root) return;
      setView(root, st.picked && st.view ? st.view : autoView(root));
      document.querySelectorAll("[data-rview]").forEach((b) => (b.onclick = () => { st.picked = true; setView(root, b.dataset.rview); window.scrollTo(0, 0); }));
      document.querySelector("[data-rprint]").onclick = () => {
        const prev = st.view;
        setView(root, "a4");
        window.print();
        setView(root, prev);
      };
      root.querySelectorAll("[data-deck]").forEach((b) => (b.onclick = () => go(root, +b.dataset.deck)));
      root.querySelector(".ap-deck").onclick = (e) => {
        const deck = e.currentTarget;
        if (!deck.classList.contains("single") || e.target.closest("a,button")) return;
        const r = deck.querySelector(".slide-frame.on").getBoundingClientRect();
        go(root, e.clientX > r.left + r.width / 3 ? 1 : -1);
      };
    };
    return { meta, actions, html, after };
  }

  // slide keys: arrows, Page Up/Down, space, Home, End (only while the report shows single slides)
  document.addEventListener("keydown", (e) => {
    const root = document.querySelector(".ap-report.view-slides");
    if (!root || !root.querySelector(".ap-deck.single") || (e.target.closest && e.target.closest("input, textarea, select"))) return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(root, 1); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(root, -1); }
    else if (e.key === "Home") { st.slide = 0; layout(root); }
    else if (e.key === "End") { st.slide = 1e9; layout(root); }
  });

  function screens(ctx) {
    drawCtx = ctx;
    return build(ctx).screens;
  }

  window.APReport = { render, screens, draw: drawCharts };
})();
