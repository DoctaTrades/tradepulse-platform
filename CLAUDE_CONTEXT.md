# TradePulse — Context for Claude Code

This document brings you up to speed on TradePulse so you can be productive immediately. Read all of it before responding to my first task.

## Who I am

Patrick (DoctaTrades). I'm a chiropractor and active options/futures trader, building TradePulse as a solo developer but I'm not a professional coder. I execute all terminal commands myself but rely on you for code work.

## What TradePulse is

A Next.js 14 options trading journal and market scanning platform. Deployed on Vercel (Hobby plan). Supabase as DB/auth. I trade Wheel, PMCC, Calendar Press, diagonals, iron condors, and futures. Schwab API for market data, Finnhub and FMP for fundamentals.

## How I work

- I run all commands myself. You produce commands/edits/scripts; I execute them.
- I prefer plain English confirmation before any change. **READ before WRITE. CONFIRM before CHANGING. SANITY CHECK before DEPLOYING.**
- I want surgical focused changes over broad rewrites.
- I want to understand calculations before accepting them. P&L math must be verified explicitly.
- I'm direct. I dislike rambling, hedging, over-theorizing, or speculative rabbit holes. Tight focused responses preferred.

## Standing rules for code changes

1. **Review related existing code first** — find reusable helpers, CSS vars, patterns before writing new code.
2. **Flag opportunities to consolidate repeated logic.**
3. **Favor scalable patterns over shortest-path** (CSS vars over hex literals, `app/lib/` helpers over inline duplication, separate files over adding to giant ones).
4. **REGROUP RULE:** When scope grows or unexpected findings arise mid-task, STOP, surface findings, decide together. Don't just power through.
5. Tell me what to run when info is needed. Don't guess at file state — check.

## Stack & deployment

- Repo: `DoctaTrades/tradepulse-platform`, local path `~/Desktop/tradepulse-platform/`
- Supabase project ref: `odpgrgyiivbcbbqcdkxm`
- Brand kit ID: `kAFnTWFe1l0`
- Admin email: `rivethediver@gmail.com`
- External APIs: Schwab (market data), Finnhub, FMP, SnapTrade (broker imports)
- **Deploy method:** `git add . && git commit -m "..." && git push origin main` → Vercel auto-deploys from GitHub.
- CLI fallback: `npx vercel --prod` (avoid — see "Play Builder loss lesson" below)

## Key learnings & gotchas

- **Next.js 14 Data Cache gotcha:** Supabase JS client calls inside server-side functions are CACHED above the library layer. Any server route needing fresh DB reads (especially credentials/tokens) must use raw `fetch()` with `cache: 'no-store'` or the `supabaseFreshRead` helper in `app/lib/supabase.ts` — NOT the standard Supabase client.
- **Vercel Hobby plan:** Cron jobs restricted to once-daily schedules (`0 6 * * *` works; sub-daily expressions cause build failures).
- **Preview URLs are impractical for auth testing.** Production is the real test environment.
- **Direct `npx vercel --prod` deploys bypass git** — anything deployed that way will be silently rolled back on the next GitHub-triggered deploy. Everything must go through git.
- **Canvas API doesn't speak CSS variables.** `ctx.fillStyle = 'var(--foo)'` silently fails. Bridge via `getComputedStyle()` (pattern in PlayBuilderModule).
- **iOS auto-zoom:** iOS Safari zooms inputs with font-size < 16px on focus. Globals CSS now sets `font-size: 16px` on inputs at mobile breakpoint to prevent this.
- **HTML number inputs step from `min`:** `min=0.1 step=0.5` produces 0.1/0.6/1.1. Set min to match desired alignment.
- **Schwab connection indicator is misleading:** Currently shows "connected" when credentials exist, even if the refresh token is silently broken. The error path now surfaces "Reconnect Schwab" in scan logs when API calls fail with 401.

## Architecture notes

- **System B (`--tp-*` CSS vars)** is canonical — defined at `:root` in `app/globals.css`.
- **System A (`--text`, `--navy`, `--shell-*` etc.)** still exists for Screener/PlayBuilder. Values match System B grays.
- **System C (JS theme prop) is GONE.** Don't reintroduce it.
- Mobile breakpoints: `@media (max-width: 768px)` (tablet/phone) and `@media (max-width: 480px)` (very narrow phones).
- Most mobile fixes are CSS-only via existing class hooks. When a section overflows on mobile, first check if a class exists — many do but have no media rule.

## Key files

- `app/modules/journal/JournalModule.jsx` (~12,200 lines) — Journal, RiskCalculator, TradeModal, Settings, Goals, Wheel, RollRow, CalendarLegRow, TradeHistoryRow, Timeline.
- `app/modules/playbuilder/PlayBuilderModule.tsx` — payoff chart + heatmap (canvas, uses `getComputedStyle` bridge).
- `app/modules/sectors/SectorExplorerModule.tsx`
- `app/modules/screener/ScreenerModule.tsx`
- `app/modules/research/MarketPulseModule.tsx`
- `app/modules/calendar/MarketCalendarModule.tsx`
- `app/lib/runner-planner.ts` — pure math for runner planner.
- `app/lib/auth-helpers.ts`, `auth-fetch.ts`, `supabase.ts` — `verifyAuth()`, `supabaseFreshRead`.
- `app/api/scan/equity/route.ts` — equity scan, Schwab error handling at line ~329.
- `app/page.tsx` — auth, top-level routing.
- `app/globals.css` — all CSS variables, mobile media queries.

## Data shape notes

- `cashFlows` items: `{ id, date, type ('deposit'|'withdrawal'), amount }`. Date format YYYY-MM-DD.
- Wheel `trade.rolls` is an array of `{ id, date, sellPremium, buybackPremium, contracts, fee, newStrike, newExpiration, netAmount }`. Net P&L: `(parseFloat(sellPremium) - parseFloat(buybackPremium)) * contracts * 100 - fee`, OR if `netAmount` is set, use `parseFloat(netAmount) * contracts * 100 - fee`.

## Recent state (as of last session)

The following are deployed and working in production:

- Schwab token refresh bug fix (Next.js Data Cache root cause; uses `supabaseFreshRead`)
- Auth hardening: JWT-based `verifyAuth()` across all 12 API routes
- JournalModule refactor: `PREMIUM_SUB_TABS` config-driven, three new strategy tabs (Condors, Butterflies, Straddle/Strangle)
- Phase 1 data model: per-roll fee fields, `linkedTradeIds: []`, `groupId: null` scaffolding
- Timezone fix: `currentLocalDateString()` helper used in 6 user-facing places
- Risk Calculator: futures auto-fill fees (hybrid Option C with AUTO badge), futures manual mode rework (no Risk %, contracts input added, Risk % of Account output card), Runner Planner with EV analysis, stop-distance linked input pattern
- Mobile UI Phase 1 + 2a-g: 7+ mobile layout fixes including Settings menu, Holdings overflow, Premium acct buttons, Calendar 5-col→1-col, Market Pulse grids, trade modal date/time, iOS zoom prevention, sector rows stack, Risk Calc grid collapse, Settings tabs scroll, Goals daily log scroll
- Tech debt cleanup: removed `tp-next/` and `src/` (~26,747 lines deleted), stale Vite-era artifacts
- Goals tab: chart now correctly reflects deposits/withdrawals (cash-flow-aware running balance), daily log collapsible (last 7 days default)
- Schwab error handling: scan/equity now logs actual error message + detects auth issues and surfaces "Reconnect Schwab" once per scan
- Wheel roll display: rolls show as expandable rows in Trades tab with "↻ N rolls (+$X)" pill, AND as separate dots in Timeline tab; Close Premium placeholder fixed (`0.10` → `0.00`)

## In-flight / queue

**Active issue (mobile, last touched):**
- **Calendar Press roll section mobile cleanup.** When editing an open Calendar Press trade on mobile, the roll section's inputs overlap and feel cluttered. Two issues identified:
  1. **Mobile cramming** — 10 input fields per roll on a narrow screen.
  2. **Header columns don't match the actual data rows** even on desktop. The header at `JournalModule.jsx` line 1136 says `Date | Qty | Buyback $ | Sell $ | Net | (X)` but RollRow's top grid (line 1029) is `Date | Qty | Net amount | Fee | Total | (X)`. Buyback $ and Sell $ are actually in the BOTTOM grid (line 1039) of RollRow. The header is misleading regardless of screen size.
- Decided approach: A — fix both (header alignment + mobile collapse). Need to:
  1. Fix the header to match the actual RollRow structure (or restructure RollRow to match a cleaner header)
  2. Add class hooks to both grids in RollRow
  3. Mobile CSS: collapse the 6-col top grid and the 4-col bottom grid into something readable

**Other queue items:**
- **Allocation tool idea (still in design phase):** I want to plan one account: 70-80% long-term dividend stocks, 20-30% speculative (equity/options). I want a tool that calculates $ amounts for each bucket and lets me link stocks to which bucket they belong (growth vs speculative). I want to talk through the approach before building. This is a NEW feature, not a bug fix.
- Old `tradepulse` repo cleanup (different from `tradepulse-platform`) — archive on GitHub, delete local. Live at https://tradepulse-alpha.vercel.app/, not used anymore.
- Phase 2 wheel data merge — merging `wheel_trades` into the unified `trades` model. Planning doc was delivered; my answers: Option A for CSP field mapping (top-level optional fields), auto-match with disambiguation for CC-to-shares matching, Approach 3 for migration (background migration with verification window), keep wheel-specific entry modal.
- Calendar Press negative slope filter (-2% to +8%)
- Schwab secret rotation
- `getWeekStart` line ~462 timezone bug (identified but deferred)
- Stock Screener feature additions (distance-from-EMAs filters, performance filters, additional fundamentals, short interest/float)
- Stripe (or Whop) subscription integration — future
- Snapshot system: SnapTrade import filter and FIFO pairing fixes
- Proactive Schwab connection check on app load (so misleading "connected" indicator gets fixed)
- Mobile polish remaining: Trade list view, Premium sub-tabs (Wheel/Diagonals/Spreads), Stock Screener result rows
- Strat summary badges on equity scanner result cards
- SPX scan empty data issue (verify during market hours)

## What I want from Claude Code

- Help me execute the queue items efficiently.
- When I ask for a fix, follow the standing rules above. Audit related code first. Surface findings if scope grows. Don't just power through.
- For risky changes (like the Phase 2 wheel data merge), use a branch.
- After making changes, give me a one-line commit message and the deploy command.

## Workflow patterns I've used

- **Patch script approach:** I'd describe what I wanted, you'd write a Python script that did surgical `str_replace`-style edits with anchor matching, I'd run it. With Claude Code's direct file access, you can skip the script step and just edit files directly. Faster.
- **Branching:** For riskier changes (e.g., refactors, data migrations), create a feature branch, work there, merge back to main when verified.
- **Pre-deploy verification:** For non-trivial changes, brace-balance check on edited JS/TSX files (matched braces and parens). Catches syntax errors before deploy.
- **Math verification:** When changing P&L logic, run a quick mental or actual test on a known scenario before accepting it. I once caught a Calendar Press tracker missing $171.90 because we didn't verify.

---

End of context doc. Ask me anything you need clarified, then we can start work.
