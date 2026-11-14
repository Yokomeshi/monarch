# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Privacy — read first

Juuri models **real personal finances**: full net worth, account numbers, and raw
statement files. Treat that data as radioactive.

- **Never commit real financial data.** Statements, balances, the local store, and any
  exported reports are gitignored (`/data/**`, `*.pdf`, `*.csv`, `*.sqlite`, `exports/`).
  Commit *schema and code only* — never a real value.
- **This repo is private and local-first.** Don't push it to a public remote. *Personal
  data* — balances, account numbers, statements, any derived financial figure — never
  leaves this machine. Outbound requests that carry **no personal data** are fine:
  fetching static assets (web fonts, CSS/JS libraries), FX rates, or other public
  reference data doesn't violate local-first. The rule is about what you *send*, not
  whether a request is made — never put a real financial value in an outbound request.
- **Remote access is gated, not open** (2026-08-23, user decision). The API may serve
  your own phone over a **Tailscale** tailnet. Personal data still never reaches a third
  party — it goes to another device you own, over a WireGuard link, after a password.
  Loopback is trusted and skips the gate (a process on this Mac can read `data/`
  anyway); every other address needs a signed session cookie, and is refused outright
  until `scripts/set_password.py` has been run. Never bind wider on an open LAN: the
  password and every figure would cross the wire in the clear. See Remote access.
- **One carve-out: the advisor** (2026-07-26, user decision). `juuri/agent.py` sends
  view-model figures, plan notes, and ledger flows to the **Anthropic API** so the chat
  surface can answer questions about them. That is a deliberate exception to the rule
  above and the *only* one. It is bounded by construction:
  - **`juuri/llm.py` is the only module on the advisor's path that opens a socket.**
    Nothing else on that path may import an HTTP client. A privacy audit of the advisor
    is that one file. If a second module ever needs the network, that is a decision to
    re-take, not a refactor to wave through. *(One module outside that path does hold an
    HTTP client: `juuri/schwab.py`, a read-only Schwab Trader API client, wired in
    deliberately 2026-09-02. It is **inbound-only** — it fetches your positions from
    Schwab and never sends a figure anywhere — and it is a CLI: nothing on the api or
    advisor path imports it. Schwab expires the refresh token after 7 days, so each
    pull more than a week after the last `login` needs a browser login first; the
    pull prints a reconciliation against the store before anything is written.)*
  - **Two independent keys.** A provider (`JUURI_LLM_PROVIDER`) *and*
    `JUURI_LLM_ALLOW_EGRESS=1`. Neither alone sends anything; unset either to revert to
    the inert default, which replays recorded fixtures. **Verified working 2026-08-23.**
  - **Every payload is logged first** to `data/llm_audit.jsonl` (gitignored), whether or
    not it is then sent. That log is the record of what actually left. **Verified working
    2026-08-23** — live turns are recorded with `egress: true`, tool results included.
  - **Figures leave in the clear. Nothing is redacted.** `llm.Redactor` exists and is
    unit-tested, but **no production code calls it** (checked 2026-08-23) — `agent.py`
    builds tool results and `llm.complete()` dispatches them verbatim. An earlier version
    of this file claimed account keys and digit runs were tokenised on the way out; that
    was never true. What actually goes to Anthropic is every figure the tools return:
    net worth, per-account balances, spend, flows. Account *keys* are already pseudonyms
    (Donatello, Raphael, Michelangelo…), but institution names are not. **Accepted by the
    user 2026-08-23** — sending reconciled figures is the point of the carve-out, and the
    Redactor could not have covered the money anyway (`scrub_prose` is explicitly banned
    from view models because it would eat any figure over $100k).
  - Statements themselves still never leave — only reconciled figures the engine
    produced. The `data/inbox/` originals stay put.
- **Source statements are the audit trail** but live *outside* git, under `data/inbox/`.
- **Secrets via env vars, never in code** (e.g. `ANTHROPIC_API_KEY`, any institution
  credentials). `.env` is gitignored.

## Project

Juuri ("root" in Finnish) is a single-user, local-first personal financial-planning web
app. It ingests monthly/annual account statements, reconciles them into a balances +
flows ledger, and projects net worth forward — deterministically and via Monte Carlo —
to answer: *am I spending to budget, and are my investments ahead or behind plan?*

It is the successor to a sophisticated Excel workbook (`Financial Workbook`) whose
numbers are the regression target for the engine (see Tests). It is **not** related to
the InvestA stock screener — different domain, different data sensitivity; kept separate
on purpose.

## Environment

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # numpy, pandas, fastapi, pytest
```

## Tests

```bash
python3 -m pytest tests/                  # engine math, FX, reconciliation
```

Tests focus on the pure logic — the projection engine, FX conversion, and the statement
reconciliation invariant. Network/LLM extraction is not in the suite. **The acceptance
gate for the engine is reproducing the Excel workbook's known projection numbers** —
add those as regression tests as the engine reaches fidelity.

## Commands

```bash
# React UI — API + dev server together (the launcher derives the API port from Vite's)
python3 -m uvicorn api:app --host 127.0.0.1 --port 5174 &
npm --prefix web run dev

python3 -m pytest tests/
```

The dev pair binds 127.0.0.1 only. The API may be bound wider **only** over Tailscale,
and only with a password set — see Remote access.

**`.env` needs no sourcing.** `api.py` calls `config.load_env_file()` at startup, so the
advisor's config reaches the process however it was launched. A real
environment variable always wins, so `JUURI_LLM_PROVIDER=stub python3 -m uvicorn api:app`
still forces the advisor inert. **Libraries must never call it** — `juuri.*` imports stay
free of it on purpose, or every pytest run would carry the credentials and be capable of
egress; there is a test pinning that.

This replaced a `set -a; . ./.env; set +a` step in the launcher, which failed silently:
macOS grants file-read per binary, and `/bin/sh` is denied files under `~/Documents` that
the Python process opens fine — `ls .env` listed, `cat .env` returned *Operation not
permitted*, and the `2>/dev/null` swallowed it. The advisor sat on the stub while the
config said `anthropic`, with the UI banner telling you to set variables that were
already set. If you see that banner again, check `/api/chat/status` before editing `.env`.

## Remote access

The phone talks to **one process on one port**: `npm run build` writes `web/dist`, and
`api.py` mounts it alongside `/api`, so the gate in `juuri/auth.py` covers the shell and
the data together.

```bash
python3 scripts/set_password.py            # once; run it yourself, prompts without echo
npm --prefix web run build                 # after any frontend change — the phone gets dist/
```

Serving is a **LaunchAgent**, `~/Library/LaunchAgents/com.juuri.api.plist`, which runs
`scripts/serve_remote.py` at login and keeps it up. Port **5180** (deliberately not the
dev API's 5174 — the two should never be confused). Reach it at
`http://<mac>.<tailnet>.ts.net:5180`; logs at `~/Library/Logs/juuri.api.{out,err}.log`.

```bash
python3 scripts/reload_remote.py    # rebuild dist + bounce the agent + health-check
launchctl unload ~/Library/LaunchAgents/com.juuri.api.plist   # stop serving remotely
launchctl load   ~/Library/LaunchAgents/com.juuri.api.plist   # start again
```

- **A second agent, `com.juuri.schwab`, pulls Schwab every morning at 08:00** (local,
  America/New_York) via `scripts/pull_schwab.py`; log at `~/Library/Logs/juuri.schwab.log`.
  Eight because the Trader API marks the *previous nightly posting* at live prices — bank
  transfers and money-fund purchases post overnight, so a daytime pull misses that day's
  cash (2026-09-02: a same-week $293k transfer showed on schwab.com and not in the API).
  It fails closed and raises a macOS notification: no credentials in `.env`, the 7-day
  refresh token expired (you run `python3 -m juuri.schwab login`), or an account with no
  alias — nothing is written in any of those cases. Credentials are `SCHWAB_CLIENT_ID` and
  `SCHWAB_CLIENT_SECRET` in `.env`; launchd never sees your shell's environment.

- **The agent has no reload, and the staleness is silent.** It imports `juuri/*` once at
  startup, so a Python change is invisible to the phone until the agent is bounced —
  while `npm run build` refreshes the bundle independently. A current bundle in front of a
  three-day-old engine looks right and reports pre-change numbers; that is exactly what
  happened on 2026-08-26. `scripts/reload_remote.py` does both halves and health-checks
  the result.

- **Never expose the Vite dev server instead.** Its `/api` proxy runs server-side on
  this Mac, so every proxied request would reach the API from `127.0.0.1` — the phone's
  traffic would arrive wearing a local return address and sail straight through the
  gate. Vite dev also serves raw TypeScript over an HMR socket it was never hardened
  for. Dev stays on loopback; the built bundle is what travels.
- **The desktop loop is unchanged.** Vite on loopback, proxying to the API on loopback,
  no login.
- **One env var**, `JUURI_AUTH_PASSWORD_HASH` (scrypt, salted, in `.env` at 0600). The
  cookie-signing secret is *derived* from it, so re-running `set_password.py` revokes
  every live session — that is the lost-phone procedure.
- **Fail closed, twice.** No password hash configured → remote requests get a 503,
  never data. No Tailscale → `serve_remote.py` refuses to start rather than falling back
  to a wider bind. It binds the **tailnet interface only**, never `0.0.0.0`, so the LAN
  is never offered the login form at all. `KeepAlive` retries each minute, so installing
  or reconnecting Tailscale brings it up on its own.
- **Nothing on the serve path may route through a shell.** `serve_remote.py` is Python,
  not a shell script, because launchd's `/bin/sh` is denied paths under `~/Documents` by
  TCC — a shell wrapper dies with a bare `Operation not permitted` before running a
  line. Same trap that broke `.env` loading (see Commands). `caffeinate` is spawned with
  `-w <pid>` rather than wrapping the server, so no system binary ever has to exec our
  interpreter out of `~/Documents`.
- **A sleeping Mac serves nothing.** The agent holds an idle+system sleep assertion, but
  macOS honours system-sleep blocks on AC power only — a closed lid on battery sleeps
  regardless, and the phone finds nothing home.
- `juuri/auth.py` opens no socket and touches no figure; it decides yes or no about a
  request. It does not weaken the "only `llm.py` reaches the network" rule above.
- **Any new server binds loopback explicitly, or it isn't merged.** The Streamlit
  parity app (removed 2026-08-23) ran from a LaunchAgent with no `--server.address`,
  and Streamlit's default is every interface — so it served real balances to the whole
  LAN, unauthenticated, from login onward, for as long as that agent existed. Nothing
  announced it. The default is the danger: state the interface, never inherit it.

## Architecture — the things worth knowing

**1. One engine, two modes.** `juuri/engine.py` owns a single `project(state,
assumptions, return_path)` function that walks the years applying flows then growth.
The deterministic plan calls it once with expected returns; Monte Carlo calls it N times
with sampled return paths. The deterministic plan is the **`vol_mult=0`** case — so the plan is
the degenerate case of the sampler, not a second implementation of it. Never fork this
logic per-mode. (It used to be the σ=0 case; since `juuri/regimes.py`, the regime chain is
stochastic independently of the per-class sigmas, so `vol_mult=0` is the one switch that
turns off asset vol, the chain and its crashes together. With volatility *on*, the MC
median sits well below the plan — that is volatility drag on compounding, not a bug: the
plan compounds the arithmetic mean.)

**1c. Returns are regime-switching and correlated** (`juuri/regimes.py`, ported from the
workbook's `Monte Carlo Code` sheet). A 3-state Markov chain scales volatility and fires
crash jumps at the four risk assets together; correlation comes from a Cholesky factor.
Three things it is careful about, each of which silently reverts if touched: the crash
process is **re-centred** so it fattens the left tail without lowering the mean (the
workbook's did lower it, by −0.92%/yr); the regime **scales** the stated vol rather than
stacking a factor on top of it (stacking realised 21% where config says 16%); and CASH and
VEHICLE take **zero market beta**, because a money-market balance and a parked car do not
fall 40% in a crisis.

**1b. The sleeve rebalances annually; the rest does not.** `project()` takes an optional
`{class: weight}` policy applied at each year-end, and `seed.sleeve_policy()` derives it as
the seed's *own* relative mix of US_EQUITY / SWEDISH / PE. Without it every class compounds
independently for forty years and the highest-return one wins by arithmetic — PE reached
17% of the portfolio with nobody choosing to hold that much. CASH is excluded (what remains
after the glide is the TIPS ladder and the SEK pile, held rather than deployable) as are RE
and VEHICLE. Note
rebalancing *into* PE is not freely possible — it is illiquid and capacity-constrained by
the Menlo call schedule, so read its weight as a ceiling, not a target. The policy is
omitted by default so callers projecting raw buckets — the workbook regression fixture maps
its own series onto class slots — are untouched.

**1d. Spending is capped at a share of the portfolio, not just budgeted.**
`project()` takes an optional `DrawCap`; the plan sets 4%. A fixed inflating spend line
against a portfolio that has halved is not what a household does, and it is what produced
ruin here — 83% of ruins fell in 2046-55, still working, spending fixed and income no
longer covering it. The cap is on the year's **net** flow, so offsetting legs (a
residence purchase, the deployment glide) are not mistaken for spending. It binds only
when the portfolio is small relative to the draw.

The cap is a **schedule**, because the binding constraint changes: **0% from 2027** —
"I do not expect to spend more than I earn" (user, 2026-08-24), so the portfolio funds no
lifestyle while there is earned income — then **4% from 2056**, once that rule is vacuous
because there are no earnings. Spending *below* income still accumulates; this caps the
draw, it does not force spending up to it.

**2. `juuri/config.py` is the single source of truth for assumptions** — returns per
asset class, inflation, FX base, tax rate, horizon. Defaults are seeded from the Excel
workbook. The module validates ranges at import (fails fast on a typo).

**3b. The projection seed is derived, not typed.** `juuri/seed.py` folds the cash
runway's bucket balances (built from the store by `cashflow.derive_state`) into engine
asset classes and carries them to the end of the seed year through the deployment
schedule that is actually planned. It reconciles to captured net worth **to the dollar**
at the as-of month — a test asserts that, because an unmapped bucket would otherwise
shrink the projection silently rather than fail. This is not a back-edge: the runway is a
sibling input built from the store, not a downstream artifact of the engine.
*A derived seed already contains the seed year's realized flows*, so `Plan.derived_seed`
zeroes the contribution step carrying that year's income, and one-offs marked
`seed_year_event` (the car, the first revest tranche) are dropped at load. Without both,
the projection counts a whole year twice.
**The plan-vs-actual target is the typed plan, not the derived one** (user decision
2026-09-07). `plan_vs_actual_view` builds its comparison line from `plan_inputs.json`
directly, because a derived seed carries the latest capture to year-end and so moves the
target with every pull — a $293k tax refund raised actual and target together and the
variance never showed it. The year-end target changes only when the plan is edited. The
projection pages keep the derived seed; only the variance read is frozen.
The runway's horizon is 15 months and the projection's is decades, so `seed.glide()`
carries the deployment programme past it as paired CASH→US_EQUITY one-offs at the
schedule's *median* month (a mean would redeploy the TIPS lump every year). Only liquid
above the runway's reserve glides — the TIPS ladder and the SEK pile are held positions,
and selling them is a decision the plan records as a scheduled conversion, not something
the glide assumes. Without the glide the leftover cash compounds at cash returns for forty
years, which is the old typed seed's error pointed the other way.
A scheduled outflow tagged with a destination bucket (the Dec 2026 residence, the Menlo
calls) is a conversion: the seed moves it into that bucket, as the cash-flow matrix does,
rather than letting it fall out of liquid into nothing — that was a live bug until
2026-09-07, and it quietly dropped the Menlo calls from PE.

**3. Data flows one direction via on-disk artifacts; downstream treats upstream as
immutable.** `statements → extract → reconcile → store → engine → reports`. No back-edges.
The store holds snapshots (balances), flows, and — where an export itemizes holdings
(Schwab positions CSV) — per-position asset-class detail behind the snapshot. Positions
are kept only when they sum to the account's stated total (±$1); the snapshot stays the
authoritative balance.

**4. The UI renders; it does not compute.** `juuri/views.py` is the last stage of that
flow — it assembles every figure the UI shows (asset-class grouping, budget pacing, the
cash-flow matrix pivot) and returns JSON-ready dicts. `api.py` is a thin FastAPI layer
over it and computes nothing; `web/` renders what it is given. **Never reimplement a
financial calculation in TypeScript** — it belongs in a view builder, where it sits next
to the engine and is testable in the pytest suite. Money crosses the boundary as plain
floats in whole units; genuinely-absent values are `null`, never `0`.

## Conventions and gotchas

- **Run from repo root.** Paths resolve via `juuri/config.py:BASE_DIR`.
- **`DESIGN.md` is the design system's source of truth and must stay in sync.** Any
  change that adds or alters a color, type style, or UI pattern (a new table
  treatment, interaction mechanism, chart convention…) updates `DESIGN.md` in the
  same change — it documents what is actually in use, never aspirations.
- **Reconciliation invariant.** A statement must satisfy `opening + Σ(flows) == closing`
  (within tolerance); inter-account transfers must net to zero. Mismatches go to a review
  queue — **never silently loaded**. See `juuri/reconcile.py`, and
  `juuri/ingest.py` for the gate that enforces it.
  *This was documentation only until 2026-08-23*: `summarize_inbox` computed the
  reconcile result to print a status string and then persisted every statement
  regardless, and `transfers_balanced` was imported but never called. Both halves are
  enforced now, and **one failure holds the whole batch** rather than skipping the bad
  file — transfer matching runs across statements, so dropping one account's flows can
  leave the far leg of a pair looking like external money and inflate household spend.
  `python3 -m juuri.ingest` exits non-zero when anything is held.
- **Currency: store native, convert late.** Every amount is stored in its native currency
  + ISO code. Convert to base USD **only at compute/display time** via the dated
  `fx_rates` table (`juuri/fx.py`). Never pre-convert on entry — you'd bake in a stale
  rate and hide FX gain/loss.
- **Prices: hold shares, mark late.** The sibling of the currency rule, and it exists
  because the same failure happened. Concentrated single-stock holdings (RSU grants,
  the Equiniti revest) are stored as **share counts** and valued at compute time from
  the store's dated `prices` table (`juuri/prices.py`, modelled on `fx.py`) — never as
  a dollar amount with a price already applied. `cashflow_inputs.json` held vests
  struck at WDAY $135.40 while `plan_inputs.json` had been repriced to $200.01; both
  files stored dollars, so nothing could see the 48% disagreement, and the estimated-tax
  line silently kept using the old price it was derived from. The *price* is an
  observation and lives in the store; the *policy* (`SELL_TO_COVER`, `VEST_TAX_GAP`) is
  an assumption and lives in `config.py`. Re-marking is one row in `prices`, and both
  `plan_inputs.json` and `cashflow_inputs.json` move with it.
  **Settled history is the exception and must never re-mark**: vests that already
  happened are held in `rsu_vesting_settled` at the FMV they actually settled at.
  Re-pricing those to today would rewrite what was paid, and the figure would move
  every time the stock did.
- **Nominal vs real.** The engine's native unit is **nominal**; deflate for display with
  one inflation series. Don't track both in parallel.
- **Human review is required** for low-confidence or unreconciled statement extractions
  before they hit the store.
- **Money is float + tolerance** in the ledger for now (planning is inherently
  approximate). Revisit `Decimal` if exact statement reconciliation demands it.

## Branch + PR workflow

Develop on a feature branch; don't push to a public remote. End commit messages with the
`Co-Authored-By` trailer.

---

Behavioral guidelines (Think Before Coding · Simplicity First · Surgical Changes ·
Goal-Driven Execution) are inherited from the global `~/.claude/CLAUDE.md` and are not
duplicated here.
