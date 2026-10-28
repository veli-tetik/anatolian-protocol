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

- `data/v6.json` — the current plan, loaded by default: a staged funnel (2.7% of leads pay a deposit, 75% of deposits start) at $75 a lead (stress case: $150 a lead, funding $736k), referrals building up from 15% of new clients in year 1 to 35% in year 5, a payment schedule modelled on the benchmark ($500 deposit, 70% of the rest at the first visit, 30% over 6 months), 30 → 180 new clients a year, a $250k pre-seed and a $500k seed at month 9 with a lean pilot year, 40% Ministry of Trade marketing support received a year later, staff and infrastructure carried by Plus International (memo on the P&L page, kept out of the P&L)
- `data/v5.json` — the v5 Excel model as data (all assumptions); still the reference that changes are shown against
- `data/levers.json` — funding levers
- `data/scenarios.json` — business scenarios: groups of cases, each a set of input changes on the plan
- `js/model.js` — the calculation engine, a line-for-line port of the Excel formulas, with whole-client rounding
- `js/checks.js` — the logic checks
- `js/app.js`, `js/charts.js`, `js/schema.js`, `css/app.css` — the interface
- `tools/check.js` — regression check: `node plan/tools/check.js` must print OK (with whole-client rounding off, the engine reproduces Excel v5 to within 0.000002%)

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
v6 uses $75 ($3,750 per client, ~19% of first-year price). Stress case: $150 a lead ($7,500 per client) raises the funding from $538k to $736k
and moves the first positive-EBITDA year from Y3 to Y4; the plan without growth investment still turns EBITDA-positive in Y3.

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
cash: in v6 a seed at month 9 needs ~$230k of a $500k seed, and up to three times the client plan stays covered. What needs the funding
is the set-up, the fixed team and the months before the first clients arrive. The schedule matters: spreading the rest over 12 months
(25% at the first visit) raises the single-round funding to ~$850k, and monthly payments over the year to ~$1.17M.

## Business scenarios

The base / downside / upside multipliers of the Excel model stay in the engine (the v5 check needs them) but are no longer shown.
The Scenarios page uses business cases from `data/scenarios.json` instead, one group at a time, each computed in full:

- **Collection** — paid in full at the first visit (as the benchmark), 50/50, 25% and 12 months, first visit 4 months after the deposit
- **Conversion** — lead to deposit 1.8% / 2.7% / 3.4% (benchmark); 40% of deposits cancelling
- **Lead cost** — $50 / $75 / $110 / $150
- **Referrals and companions** — 35% from year 1 (the earlier v6), a slower build-up 10 → 30%, no referral partners (as the benchmark), companions 5%
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
in year 1; 15,260 instead of 13,915 over five years). Single-round funding goes from $519k to $538k; the pre-seed for a seed at month 9
from $297k to $309k. Without referral partners at all, v6 would need $560k with the same client plan, or reach 117 instead of 180 new
clients in year 5 on the same marketing budget.

## v6 rounds: $250k pre-seed + $500k seed

v6 raises a $250k pre-seed and a $500k seed at the end of month 9. Without changes the plan needs $309k to reach month 9 with the 25%
buffer, so the pilot year runs lean, using two levers from the Funding page: the general manager and client advisors at half cost in
year 1, and lean pilot spending (launch brand $20k, team travel $20k a year, brand and content $1.5k a month). With them:

| | |
|---|---|
| Single-round funding | $385k |
| Pre-seed needed to month 9 with buffer | $226k (of $250k); it lasts to month 12 |
| Seed the plan needs | $135k of $500k; $365k surplus |
| First positive EBITDA / five-year net profit | Y3 / $1.39M |

Business cases that the two rounds do not carry, all because the pre-seed would run out before month 9: collection 50/50 or 25% with 12
months, lead to deposit 1.8%, $110 or $150 a lead, a launch 2–3 months late, and a 7-month sales cycle.

