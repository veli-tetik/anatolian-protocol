# Anatolian Protocol — business plan tool

The five-year forecast, funding need and scenarios as a web tool, replacing the Excel workbook.
Published with GitHub Pages at `/plan/` next to the presentation.

## Pages

| Page | What it is for |
|---|---|
| Overview | Funding to raise, first profitable year, year-5 results, scenario comparison, and the plan without growth investment |
| Funding | Levers that lower the funding to raise, with a waterfall from the current plan to the minimum |
| Rounds | Pre-seed sized to the seed month, seed amount and month as inputs, cash after both rounds, growth options and risk cases the rounds carry |
| Scenarios | Business scenarios: collection, conversion, lead cost, referrals and companions, renewal; each case computed in full, with a same-client-plan / same-marketing-budget switch where it matters |
| Sensitivity | Which inputs move the funding need or five-year profit most |
| Assumptions | Every input (sections A–L and the team), changes highlighted against v5 |
| Unit economics | One client per package and the weighted average |
| P&L | Five-year P&L, cash and funding per scenario; CSV export |
| Monthly cash | First 36 months, the low point that sets the raise; pilot cohort timing |
| Partners | Operator + hospital and physician network switches, what each takes off, and the staff and costs Plus International carries in kind |
| Checks | Model rules every input must meet (errors) and results worth a second look (warnings) |
| Versions | Starting points, saved versions, JSON export/import, share links, change list |

## Rules

- Clients, renewals, companions, visits, leads and team members are whole numbers, split over the six packages. Assumptions, section I can switch this off to reproduce Excel v5 exactly.
- Numbers use UK format: `12,500.5`, percentages as `15%`, dates as dd/mm/yyyy. A decimal comma (`0,5`) is rejected.
- Errors (for example package shares not totalling 100%, or clients enrolling before set-up ends) are flagged on the field, in the rail and on the Checks page.

## How to work with it

1. Open the tool and change inputs on any page. Every number updates at once; the draft stays in your browser.
2. **Save version** keeps a named copy in your browser. **Copy share link** sends the plan to someone else: the link carries only the inputs that differ from v5.
3. To make a plan official, **Export JSON** and commit the file to `plan/data/`. Git keeps the history; the commit message says what changed and why.
4. Funding levers are defined in `plan/data/levers.json` (label, explanation and the input changes). Add or edit levers there.

## Files

- `data/v6.json` — the current plan (v6.3), loaded by default and the reference that changes are shown against: v6.2 with payment per visit (a $500 deposit at sale, then before each visit the share for that visit, front-loaded: Annual 100%, Summer–Winter 60/40, Seasonal 50/25/25 of the rest) and funding in two rounds only: a $200k pre-seed and a $500k seed at the end of month 9. The Excel workbook for v6.3 is not built yet; `tools/v62_inputs.json` keeps the v6.2 inputs for the regression check
- `data/v5.json` — the v5 Excel model as data (all assumptions), kept for history and the regression check
- `data/levers.json` — funding levers
- `data/scenarios.json` — business scenarios: groups of cases, each a set of input changes on the plan
- `js/model.js` — the calculation engine, a line-for-line port of the Excel formulas, with whole-client rounding
- `js/checks.js` — the logic checks
- `js/app.js`, `js/charts.js`, `js/schema.js`, `css/app.css` — the interface
- `tools/check.js` — regression check: `node plan/tools/check.js` must print OK twice. With whole-client rounding off, the engine reproduces Excel v5 and Excel v6.2 (`Anatolian_Protocol_PL_Feasibility_v6.2.xlsx`) to within 0.000002%; the tool itself rounds people to whole numbers, so its headline figures differ slightly from the workbook

## Run locally

The tool loads its JSON with `fetch`, so open it through a web server, not as a file:

```
python -m http.server 8000
```

then go to `http://localhost:8000/plan/`.

## Lead cost benchmark (v6)

The v6 lead cost comes from a comparable health-tourism business (benchmark; ~€4.3k per sale), October 2025 – March 2026:
lead counts and lead-to-treatment cohorts from its CRM, ad spend from its books.

| Benchmark, Oct 2025 – Mar 2026 | |
|---|---|
| Ad spend | €622k |
| New leads | 41,323 |
| Cost per lead | €15 |
| Lead → deposit / → operation (cohorts) | 3.4% / 2.4% |
| Ad spend per operation | €503 (~12% of the sale) |

Anatolian Protocol sells a $20k program to a wealthier, harder-to-reach audience. At 2% conversion, the benchmark's 12% would mean ~$50 a lead;
v6 uses $75 ($3,750 per client, ~19% of first-year price). Stress case: $150 a lead ($7,500 per client) raises the single-round funding from $434k to $619k.

## Funding rounds, payment schedule and funnel

The Rounds page splits the funding into a pre-seed and a seed. The pre-seed is either a set amount (`rounds.preSeedAmount`) or, at 0,
sized to the lowest cash point up to the seed month plus the buffer; the page shows the month it lasts to and the cash left before the seed; the seed covers the rest of the plan's need, and the remainder is surplus. Growth options scale leads from the first year whose
marketing is paid after the seed. Risks: the hardest case of each business scenario group and the plan without growth investment, each
checked against both rounds (funding covered, and the pre-seed still reaching the seed month).

Cash timing in v6 follows the benchmark (completed treatments Oct 2025 – Jun 2026):

| Step | Benchmark | v6 |
|---|---|---|
| Lead to deposit | median 15 days, 81% within 90 days | marketing paid 3 months before the first visit |
| Deposit | median €300 (8% of the sale) | $500 at sale |
| Deposit to operation / first visit | median 61 days | 2 months |
| Balance | 98% of online payments on the operation day | 70% of the rest at the first visit, 30% in 6 monthly instalments |

With the funnel in stages (`logic.funnelStages`), conversion is lead to deposit and cancellations remove deposits, so lead spend equals
leads × cost per lead. In v5 the spend was leads × cost ÷ (1 − cancellations), 5% above the leads it bought. Cancelled deposits are kept
and shown as forfeited deposits.

Because most of the price is paid at the first visit, the visit costs are covered on the day and growth after the pilot does not eat
cash: in v6.2 a seed at month 9 needs ~$159k of a $500k seed, and up to three times the client plan stays covered. What needs the funding
is the set-up, the fixed team and the months before the first clients arrive. The schedule matters: spreading the rest over 12 months
(25% at the first visit) raises the single-round funding to ~$742k.

## Business scenarios

The base / downside / upside multipliers of the Excel model stay in the engine (the v5 check needs them) but are no longer shown.
The Scenarios page uses business cases from `data/scenarios.json` instead, one group at a time, each computed in full:

- **Collection** — paid in full at the first visit (as the benchmark), 50/50, 25% and 12 months, first visit 4 months after the deposit
- **Conversion** — lead to deposit 1.8% / 2.7% / 3.4% (benchmark); 40% of deposits cancelling
- **Lead cost** — $50 / $75 / $110 / $150
- **Referrals and companions** — 35% from year 1 (an earlier assumption), a slower build-up 10 → 30%, no referral partners (as the benchmark), companions 5%
- **Renewal** — 30% / 45% / 60% into year 2
- **Launch timing** — set-up 5 or 6 months instead of 3 (pilot cohorts later), and 6 months with 20 instead of 30 pilot clients
- **Sales cycle** — leads paid 5 or 7 months before the first visit instead of 3
- **Marketing support** — 40% after 18 or 24 months, 20% after 18 months, none (the benchmark received about 14% of its ad spend in 15 months)
- **Withdrawals and refunds** — 6% or 10% of clients withdrawing, half or fully refunded

Launch timing and sales cycle act on the monthly cash, and so on the funding and the pre-seed; the annual P&L keeps its mid-year
convention, so its year-1 figures do not move with the cohort months. Pre-launch marketing and deposits that would fall before month 1
are paid in month 1.

Conversion and referral cases can be read as the same client plan (leads re-solved, lead spend moves) or the same marketing budget
(clients move). Referral share is now a Y1–Y5 input.

The benchmark has almost no partner referrals (5 affiliate referrals, 0.8% of operations through influencers, 2.2% repeat patients); 87% of
its trips are for two or more people, but companions buying their own treatment are not recorded. v6 therefore lets referrals build up:
15% → 20% → 25% → 30% → 35% of new clients, with the same client plan (30 → 180), so it buys more leads early on (1,070 instead of 819
in year 1; 15,260 instead of 13,915 over five years). Without referral partners at all, v6.2 needs $454k instead of $434k with the same
client plan.

## v6.3: payment per visit, two rounds ($200k + $500k)

There is no single-round raise any more: the plan is funded by a $200k pre-seed and a $500k seed at the end of month 9. The cash
need (lowest cash after the reserve plus the 25% buffer) is what both rounds must cover; the pre-seed must also reach the seed month.

| Tool figures (whole clients) | |
|---|---|
| Cash need | $460k, covered by $700k ($240k seed surplus) |
| Lowest cash before the seed (month 9) | $245k; with the buffer the pre-seed would need $306k |
| $200k pre-seed | runs out in month 6, three months before the seed |

Ways to make the $200k pre-seed reach month 9 (still open): a 5% founding discount and the ATRON fee waived in year 1 (reaches it
without the buffer); plus Plus International's partner rates (reaches it with the buffer); or the seed at the end of month 5.

Collection is the assumption the funding is most sensitive to: paid in full at the first visit $379k, the v6.2 schedule $441k,
per visit front-loaded $460k, per visit in equal shares $512k, 25% and 12 months $754k, monthly over the year $876k.

## v6.2 rounds: $275k pre-seed + $500k seed

v6.1 put the general manager on full cost from month 1 and raised the pre-seed from $250k to $275k. v6.2 keeps both and corrects
the model (below). Workbook figures (fractional clients):

| | |
|---|---|
| Single-round funding | $434k |
| Pre-seed needed to month 9 with buffer | $253k (of $275k); it lasts to month 11 |
| Seed the plan needs | $159k of $500k; $341k surplus |
| First positive EBITDA / five-year net profit | Y3 / $1.35M |

The pre-seed reaches the seed with two months to spare: a seed later than month 11 needs a larger pre-seed. Business cases the two
rounds do not carry, all because the pre-seed would run out before month 9: collection 50/50 or 25% with 12 months, lead to deposit
1.8%, $110 or $150 a lead, a launch 2–3 months late, and a 7-month sales cycle.

## v6.2 corrections

| Area | v6.1 | v6.2 |
|---|---|---|
| Operator lead cost | $60 a lead with the operator (v5's −20% carried over) | $75, the same as the plan: the benchmark already runs ad accounts and a call centre |
| Plus International | its in-kind staff and set-up were in the plan, yet the operator switch changed the same items again | the switch (now "partner rates") leaves items carried in kind; it adds hospital, physician, hotel and legal rates only |
| Add-on cash, monthly | this year's bookings less the cost recognised (half last year's) | bookings less the cost of delivering them |
| Marketing support | lost when the lag is under 12 months; launch brand not eligible | same-year share counted; launch brand ($20k) eligible |
| Prepayment reserve | deposits of clients who cancel stayed in it | forfeited deposits leave the reserve |
| Payment processing, monthly | on add-on cash net of its cost | on gross client cash |
| Referral commission | on the price after the companion discount | on the price before it (referred clients are not companions) |
| Sensitivity, Standard box | applied to every client | applied to Standard clients only |
| Wording | deposit "as the benchmark", "set-up" in kind, Gulf launch, FTE | corrected to match the numbers |

Together these raise the single-round funding from $426k to $434k and the pre-seed needed to month 9 from $250k to $253k.
The partner-rates switch now saves $110k (v6.1's operator switch: $147k, of which $37k came from the unfounded lead-cost discount).
Not changed, noted in the workbook: Türkiye cost inflation is applied to the few US-dollar costs too (conservative), contingency
applies to lead spend, and Plus International's in-kind costs grow with volume to about $360k a year by year 5 at a 0% revenue share.

