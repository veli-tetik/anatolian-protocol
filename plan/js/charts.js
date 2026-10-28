/* Small SVG chart kit: bars (grouped, signed), lines (crosshair tooltip), waterfall, tornado.
   Colours come from CSS roles (.s1/.l1 …); text stays in text tokens. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };

  function niceTicks(min, max, count = 5) {
    if (min === max) { max = min + 1; }
    const span = max - min, step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const t = []; for (let v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v / step) * step);
    return t;
  }

  // a rounded-top bar anchored to the baseline (4px data-end radius)
  function barPath(x, w, y0, y1) {
    const up = y1 < y0, h = Math.abs(y1 - y0), r = Math.min(4, w / 2, h);
    if (h < 0.5) return `M${x},${y0}h${w}`;
    if (up) return `M${x},${y0}V${y1 + r}q0,-${r} ${r},-${r}h${w - 2 * r}q${r},0 ${r},${r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}q0,${r} ${r},${r}h${w - 2 * r}q${r},0 ${r},-${r}V${y0}Z`;
  }

  function frame(host, height) {
    host.innerHTML = "";
    host.classList.add("viz");
    const W = Math.max(280, host.clientWidth || 600), H = height;
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img" }, host);
    const tip = document.createElement("div"); tip.className = "viz-tip"; tip.hidden = true; host.appendChild(tip);
    return { svg, tip, W, H };
  }
  function showTip(host, tip, html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const hw = host.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(0, x + 12), hw - tw) + "px";
    tip.style.top = Math.max(0, y - 10) + "px";
  }
  function legend(host, items) {
    const lg = document.createElement("div"); lg.className = "viz-legend";
    lg.innerHTML = items.map((i) => `<span><i class="${i.line ? "l" : ""} ${i.dash ? "dash" : ""}" style="background:var(--viz-${i.c})"></i>${i.name}</span>`).join("");
    host.prepend(lg);
  }
  function yAxis(svg, ticks, y, left, right, fmt) {
    for (const t of ticks) {
      el("line", { x1: left, x2: right, y1: y(t), y2: y(t), class: t === 0 ? "zero" : "grid" }, svg);
      el("text", { x: left - 6, y: y(t) + 4, "text-anchor": "end" }, svg).textContent = fmt(t);
    }
  }

  // ---------------------------------------------------------- grouped bars
  function bars(host, { labels, series, fmt, height = 240 }) {
    const { svg, tip, W, H } = frame(host, height);
    legend(host, series.map((s) => ({ name: s.name, c: s.c })));
    const pad = { l: 56, r: 8, t: 8, b: 24 };
    const all = series.flatMap((s) => s.values).concat([0]);
    const ticks = niceTicks(Math.min(...all), Math.max(...all));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = (v) => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
    yAxis(svg, ticks, y, pad.l, W - pad.r, fmt);
    const gw = (W - pad.l - pad.r) / labels.length;
    const bw = Math.min(28, (gw * 0.6) / series.length);
    labels.forEach((lab, i) => {
      const gx = pad.l + i * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
      series.forEach((s, j) => {
        el("path", { d: barPath(gx + j * (bw + 2), bw, y(0), y(s.values[i])), class: "s" + s.c }, svg);
      });
      el("text", { x: pad.l + i * gw + gw / 2, y: H - 6, "text-anchor": "middle" }, svg).textContent = lab;
      const hit = el("rect", { x: pad.l + i * gw, y: pad.t, width: gw, height: H - pad.t - pad.b, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => {
        const r = host.getBoundingClientRect();
        showTip(host, tip, `<b>${lab}</b>` + series.map((s) => `<div class="r"><span><i style="background:var(--viz-${s.c})"></i>${s.name}</span><span>${fmt(s.values[i], true)}</span></div>`).join(""), e.clientX - r.left, e.clientY - r.top);
      });
      hit.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  }

  // ---------------------------------------------------------- lines with crosshair
  function lines(host, { labels, series, fmt, height = 240, mark, every = 1 }) {
    const { svg, tip, W, H } = frame(host, height);
    legend(host, series.map((s) => ({ name: s.name, c: s.c, line: true, dash: s.dash })));
    const pad = { l: 56, r: 12, t: 10, b: 24 };
    const all = series.flatMap((s) => s.values).concat([0]);
    const ticks = niceTicks(Math.min(...all), Math.max(...all));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = (v) => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
    const n = labels.length, step = (W - pad.l - pad.r) / Math.max(1, n - 1);
    const x = (i) => pad.l + i * step;
    yAxis(svg, ticks, y, pad.l, W - pad.r, fmt);
    labels.forEach((lab, i) => { if (i % every === 0 || i === n - 1) el("text", { x: x(i), y: H - 6, "text-anchor": "middle" }, svg).textContent = lab; });
    for (const s of series) {
      el("path", { d: s.values.map((v, i) => (i ? "L" : "M") + x(i) + "," + y(v)).join(""), class: `line l${s.c}${s.dash ? " dash" : ""}` }, svg);
    }
    if (mark) {
      el("circle", { cx: x(mark.i), cy: y(mark.v), r: 5, class: "mark-low" }, svg);
      const t = el("text", { x: x(mark.i), y: y(mark.v) + 18, "text-anchor": "middle", class: "lbl" }, svg); t.textContent = mark.label;
    }
    const cross = el("line", { y1: pad.t, y2: H - pad.b, class: "cross", visibility: "hidden" }, svg);
    const dots = series.map((s) => el("circle", { r: 4, class: `dot s${s.c}`, visibility: "hidden" }, svg));
    const hit = el("rect", { x: pad.l - step / 2, y: 0, width: W - pad.l - pad.r + step, height: H, class: "hit" }, svg);
    hit.addEventListener("mousemove", (e) => {
      const r = host.getBoundingClientRect(), mx = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round((mx - pad.l) / step)));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      series.forEach((s, j) => { dots[j].setAttribute("cx", x(i)); dots[j].setAttribute("cy", y(s.values[i])); dots[j].setAttribute("visibility", "visible"); });
      showTip(host, tip, `<b>${labels[i]}</b>` + series.map((s) => `<div class="r"><span><i style="background:var(--viz-${s.c})"></i>${s.name}</span><span>${fmt(s.values[i], true)}</span></div>`).join(""), x(i) * (r.width / W), e.clientY - r.top);
    });
    hit.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); });
  }

  // ---------------------------------------------------------- waterfall: start, steps down/up, end
  function waterfall(host, { start, steps, endLabel, fmt, height = 260 }) {
    const { svg, tip, W, H } = frame(host, height);
    const items = [{ name: start.name, from: 0, to: start.value, total: true }];
    let run = start.value;
    for (const s of steps) { items.push({ name: s.name, from: run, to: run + s.delta, detail: s.detail }); run += s.delta; }
    items.push({ name: endLabel, from: 0, to: run, total: true });
    const pad = { l: 56, r: 8, t: 18, b: 52 };
    const all = items.flatMap((i) => [i.from, i.to]).concat([0]);
    const ticks = niceTicks(Math.min(...all), Math.max(...all));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = (v) => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
    yAxis(svg, ticks, y, pad.l, W - pad.r, fmt);
    const gw = (W - pad.l - pad.r) / items.length, bw = Math.min(44, gw * 0.62);
    items.forEach((it, i) => {
      const bx = pad.l + i * gw + (gw - bw) / 2;
      const top = Math.min(y(it.from), y(it.to)), h = Math.max(1, Math.abs(y(it.from) - y(it.to)));
      if (it.total) el("path", { d: barPath(bx, bw, y(0), y(it.to)), class: i === 0 ? "sn" : "s1" }, svg);
      else el("rect", { x: bx, y: top, width: bw, height: h, rx: 2, class: it.to < it.from ? "s3" : "s2" }, svg);
      if (i < items.length - 1) el("line", { x1: bx + bw, x2: bx + gw, y1: y(it.to), y2: y(it.to), class: "grid" }, svg);
      const val = it.total ? it.to : it.to - it.from;
      el("text", { x: bx + bw / 2, y: top - 5, "text-anchor": "middle", class: "lbl" }, svg).textContent = fmt(val);
      const words = it.name.split(" "); let line = "", ln = 0;
      const txt = el("text", { x: bx + bw / 2, y: H - pad.b + 14, "text-anchor": "middle" }, svg);
      const flush = () => { const t = el("tspan", { x: bx + bw / 2, dy: ln ? 12 : 0 }, txt); t.textContent = line; ln++; line = ""; };
      for (const w of words) { if ((line + " " + w).trim().length > Math.max(8, gw / 6.2) && line) flush(); line = (line + " " + w).trim(); if (ln > 2) break; }
      if (line && ln < 3) flush();
      const hit = el("rect", { x: pad.l + i * gw, y: pad.t, width: gw, height: H - pad.t, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => {
        const r = host.getBoundingClientRect();
        showTip(host, tip, `<b>${it.name}</b><div class="r"><span>${it.total ? "Funding to raise" : "Change"}</span><span>${fmt(val, true)}</span></div>` + (it.total ? "" : `<div class="r"><span>After this step</span><span>${fmt(it.to, true)}</span></div>`), e.clientX - r.left, e.clientY - r.top);
      });
      hit.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  }

  // ---------------------------------------------------------- tornado: low/high around a centre
  function tornado(host, { rows, centre, fmt, lowName, highName }) {
    const rowH = 30, pad = { l: 220, r: 64, t: 4, b: 22 };
    const { svg, tip, W, H } = frame(host, pad.t + pad.b + rows.length * rowH);
    legend(host, [{ name: lowName, c: 3 }, { name: highName, c: 2 }]);
    const all = rows.flatMap((r) => [r.low, r.high]).concat([centre]);
    const ticks = niceTicks(Math.min(...all), Math.max(...all), 4);
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const x = (v) => pad.l + (v - lo) / (hi - lo) * (W - pad.l - pad.r);
    for (const t of ticks) { el("line", { x1: x(t), x2: x(t), y1: pad.t, y2: H - pad.b, class: "grid" }, svg); el("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, svg).textContent = fmt(t); }
    el("line", { x1: x(centre), x2: x(centre), y1: pad.t, y2: H - pad.b, class: "zero" }, svg);
    rows.forEach((r, i) => {
      const cy = pad.t + i * rowH + rowH / 2;
      el("text", { x: pad.l - 8, y: cy + 4, "text-anchor": "end", class: "lbl" }, svg).textContent = r.name;
      for (const [v, c] of [[r.low, 3], [r.high, 2]]) {
        const a = Math.min(x(v), x(centre)), w = Math.max(1, Math.abs(x(v) - x(centre)));
        el("rect", { x: a, y: cy - 9, width: w, height: 18, rx: 2, class: "s" + c }, svg);
      }
      const hit = el("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => {
        const b = host.getBoundingClientRect();
        showTip(host, tip, `<b>${r.name}</b><div class="r"><span>${r.lowLabel}</span><span>${fmt(r.low, true)}</span></div><div class="r"><span>${r.highLabel}</span><span>${fmt(r.high, true)}</span></div>`, e.clientX - b.left, e.clientY - b.top);
      });
      hit.addEventListener("mouseleave", () => { tip.hidden = true; });
    });
  }

  // ---------------------------------------------------------- monthly balance: one bar per month, shaded by year,
  // the lowest month marked and labelled, an optional reference line (e.g. the year-end view) and month marker
  function monthBars(host, { values, labels, fmt, lowLabel, ref, marker, tip, height = 260 }) {
    const { svg, tip: tp, W, H } = frame(host, height);
    const nY = Math.ceil(values.length / 12);
    legend(host, Array.from({ length: nY }, (_, k) => ({ name: "Year " + (k + 1), c: "y" + (k + 1) })).concat([{ name: "Lowest month", c: "low" }]));
    const pad = { l: 56, r: 8, t: 18, b: 24 };
    const all = values.concat([0], ref ? [ref.value] : []);
    const ticks = niceTicks(Math.min(...all), Math.max(...all));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const y = (v) => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
    yAxis(svg, ticks, y, pad.l, W - pad.r, fmt);
    const n = values.length, cw = (W - pad.l - pad.r) / n, bw = Math.max(2, cw - 2);
    const low = values.indexOf(Math.min(...values));
    values.forEach((v, i) => {
      const x = pad.l + i * cw + (cw - bw) / 2;
      el("path", { d: barPath(x, bw, y(0), y(v)), class: i === low && v < 0 ? "mlow" : "my" + (Math.floor(i / 12) + 1) }, svg);
      if (i === 0 || (i + 1) % 6 === 0) el("text", { x: x + bw / 2, y: H - 6, "text-anchor": "middle" }, svg).textContent = labels[i];
      const hit = el("rect", { x: pad.l + i * cw, y: pad.t, width: cw, height: H - pad.t - pad.b, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => {
        const r = host.getBoundingClientRect();
        showTip(host, tp, tip(i), e.clientX - r.left, e.clientY - r.top);
      });
      hit.addEventListener("mouseleave", () => { tp.hidden = true; });
    });
    if (values[low] < 0) {
      const x = pad.l + low * cw + cw / 2;
      el("text", { x, y: y(values[low]) + 14, "text-anchor": "middle", class: "lbl mlow-t" }, svg).textContent = lowLabel || fmt(values[low]);
    }
    if (ref) {
      el("line", { x1: pad.l, x2: W - pad.r, y1: y(ref.value), y2: y(ref.value), class: "refline" }, svg);
      el("text", { x: pad.l + 6, y: y(ref.value) - 5, class: "lbl" }, svg).textContent = ref.label;
    }
    if (marker) {
      const x = pad.l + (marker.i + 1) * cw;
      el("line", { x1: x, x2: x, y1: pad.t - 6, y2: H - pad.b, class: "refline" }, svg);
      el("text", { x: x + 4, y: pad.t - 6, class: "lbl" }, svg).textContent = marker.label;
    }
  }

  window.APCharts = { bars, lines, waterfall, tornado, monthBars };
})();
