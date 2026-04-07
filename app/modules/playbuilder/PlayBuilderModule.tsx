'use client';

/**
 * PlayBuilderModule — Session 4
 *
 * Standalone module for designing options strategies before placing them.
 * Live ticker → chain load → strategy auto-pick → editable legs → real-time metrics + visualizations.
 *
 * Session 1: chain load, 4 strategies, metrics, stub Save.
 * Session 2: payoff chart, expected-move bands, IC/IB/PMCC/Straddle.
 * Session 3: BS engine, theta overlay, heat map, Diagonal/CalPress, Journal handoff.
 *
 * Session 4 adds:
 *  - Manual underlying-price override (editable input in the header) — drives all
 *    metrics, charts, and BS-recomputed Greeks for "what-if my play moves" analysis
 *  - Black-Scholes Greeks recompute when underlying is overridden (no stale Greeks)
 *  - Strike comparison cards for single-leg strategies — 5 cards (2 lower, selected,
 *    2 higher) with click-to-swap, driven by price + date sliders for scenario planning
 *  - Date format polish: mm-dd within current calendar year, mm-dd-yy beyond
 *  - Calendar Press metrics panel shows expiration dates alongside DTE
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { authFetch } from '../../lib/auth-fetch';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type OptionContract = {
  symbol: string;
  strikePrice: number;
  strike?: number;
  bid: number;
  ask: number;
  last: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  volatility: number;       // IV (percent on Schwab side, fraction on Tradier — we normalize)
  daysToExpiration: number;
  expirationDate: string;
  openInterest?: number;
  totalVolume?: number;
};

type ChainResponse = {
  putExpDateMap: Record<string, Record<string, OptionContract[]>>;
  callExpDateMap: Record<string, Record<string, OptionContract[]>>;
  underlyingPrice: number;
  underlying?: { last?: number };
};

type LegSide = 'BUY' | 'SELL';
type LegType = 'CALL' | 'PUT';

type Leg = {
  id: string;
  side: LegSide;
  type: LegType;
  strike: number;
  expiration: string;     // "YYYY-MM-DD"
  dte: number;
  qty: number;
  // Snapshot of contract data at time of selection — refreshed on edits
  bid: number;
  ask: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;             // stored as fraction (0.32 = 32%)
  // Manual fill-price override — when set, this is the per-share cost basis used
  // by all P&L math instead of mid(bid, ask). Null/undefined = use mid.
  // Cleared automatically when strike, expiration, or type change.
  entryOverride?: number | null;
};

type StrategyId =
  | 'csp' | 'cc' | 'bullput' | 'bearcall'
  | 'iron_condor' | 'iron_butterfly' | 'pmcc' | 'diagonal'
  | 'calendar_press' | 'custom';

type StrategyDef = {
  id: StrategyId;
  name: string;
  shortName: string;
  category: 'income' | 'directional' | 'neutral' | 'leveraged' | 'custom';
  legs: number;
  description: string;
  enabled: boolean;        // false = chip visible but auto-build disabled this session
};

const STRATEGIES: StrategyDef[] = [
  { id:'csp',           name:'Cash-Secured Put',       shortName:'CSP',         category:'income',      legs:1, enabled:true,  description:'Sell put, collect premium, willing to own at strike' },
  { id:'cc',            name:'Covered Call',           shortName:'CC',          category:'income',      legs:1, enabled:true,  description:'Sell call against owned shares for premium' },
  { id:'bullput',       name:'Bull Put Credit Spread', shortName:'Bull Put',    category:'directional', legs:2, enabled:true,  description:'Sell put, buy lower put — bullish, defined risk' },
  { id:'bearcall',      name:'Bear Call Credit Spread',shortName:'Bear Call',   category:'directional', legs:2, enabled:true,  description:'Sell call, buy higher call — bearish, defined risk' },
  { id:'iron_condor',   name:'Iron Condor',            shortName:'IC',          category:'neutral',     legs:4, enabled:true,  description:'Bull put + bear call — range-bound profit' },
  { id:'iron_butterfly',name:'Iron Butterfly',         shortName:'IB',          category:'neutral',     legs:4, enabled:true,  description:'Tighter IC centered at the money' },
  { id:'pmcc',          name:"Poor Man's Covered Call",shortName:'PMCC',        category:'leveraged',   legs:2, enabled:true,  description:'Long LEAP call + short near-term call' },
  { id:'diagonal',      name:'Diagonal Spread',        shortName:'Diagonal',    category:'leveraged',   legs:2, enabled:true,  description:'Different strikes + different expiries' },
  { id:'calendar_press',name:'Calendar Press',         shortName:'CalPress',    category:'custom',      legs:2, enabled:true,  description:'Long-dated put + weekly short puts (custom)' },
  { id:'custom',        name:'Long Straddle',          shortName:'Straddle',    category:'custom',      legs:2, enabled:true,  description:'Long ATM call + long ATM put — volatility play' },
];

// ─── DEFAULTS (from spec) ────────────────────────────────────────────────────
const TARGET_SHORT_DELTA = 0.30;
const TARGET_DTE_MIN = 25;
const TARGET_DTE_MAX = 45;
const SPREAD_WIDTH_HIGH = 10;   // for stocks > $100
const SPREAD_WIDTH_LOW  = 5;    // for stocks <= $100
const PMCC_LEAP_DELTA = 0.70;
const PMCC_LEAP_DTE_MIN = 180;
const PMCC_LEAP_DTE_MAX = 730;
// Diagonal: tighter LEAP window than PMCC, oriented for rolls
const DIAGONAL_LONG_DELTA = 0.70;
const DIAGONAL_LONG_DTE_MIN = 60;
const DIAGONAL_LONG_DTE_MAX = 180;
// Calendar Press (custom strategy)
const CALPRESS_LONG_DTE_MIN = 60;
const CALPRESS_LONG_DTE_MAX = 150;
const CALPRESS_SHORT_DTE_MIN = 3;
const CALPRESS_SHORT_DTE_MAX = 21;
const CALPRESS_COST_RATIO_IDEAL = 2.5;
const CALPRESS_COST_RATIO_MAX = 3.0;

// ─── UTIL: math ──────────────────────────────────────────────────────────────
const mid = (bid: number, ask: number) => {
  if (!bid && !ask) return 0;
  if (!bid) return ask;
  if (!ask) return bid;
  return (bid + ask) / 2;
};

// Per-share entry price for a leg — respects manual override when set, otherwise mid.
// This is the cost basis used by ALL P&L math (payoff, BS, metrics, breakevens).
const legEntryPrice = (leg: Leg): number =>
  (leg.entryOverride != null && isFinite(leg.entryOverride) && leg.entryOverride >= 0)
    ? leg.entryOverride
    : mid(leg.bid, leg.ask);

// Normal CDF (Abramowitz & Stegun 7.1.26)
const ncdf = (x: number) => {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-ax*ax);
  return 0.5 * (1.0 + sign * y);
};

const fmtMoney = (n: number, decimals = 2) => {
  if (!isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(decimals)}`;
};
const fmtPct = (n: number, decimals = 1) => isFinite(n) ? `${(n * 100).toFixed(decimals)}%` : '—';
const fmtNum = (n: number, decimals = 2) => isFinite(n) ? n.toFixed(decimals) : '—';

// Format an expiration date string ("YYYY-MM-DD") for display.
// Within the current calendar year → "MM-DD". In a later year → "MM-DD-YY".
const fmtExpiry = (iso: string): string => {
  if (!iso || iso.length < 10) return iso || '';
  const yyyy = iso.slice(0, 4);
  const mm = iso.slice(5, 7);
  const dd = iso.slice(8, 10);
  const currentYear = new Date().getFullYear();
  const expYear = parseInt(yyyy, 10);
  if (expYear === currentYear) return `${mm}-${dd}`;
  return `${mm}-${dd}-${yyyy.slice(2)}`;
};

// Normalize IV — Schwab returns percent (32.5), Tradier returns fraction (0.325).
// Heuristic: if value > 5 we assume percent.
const normIV = (iv: number) => (iv > 5 ? iv / 100 : iv);

// ─── UTIL: chain flattening ──────────────────────────────────────────────────
type FlatContract = OptionContract & { type: LegType };

function flattenChain(chain: ChainResponse): FlatContract[] {
  const out: FlatContract[] = [];
  const walk = (map: Record<string, Record<string, OptionContract[]>>, type: LegType) => {
    for (const expKey in map) {
      for (const strikeKey in map[expKey]) {
        for (const c of map[expKey][strikeKey]) {
          out.push({ ...c, type });
        }
      }
    }
  };
  walk(chain.putExpDateMap || {}, 'PUT');
  walk(chain.callExpDateMap || {}, 'CALL');
  return out;
}

function uniqueExpirations(contracts: FlatContract[]): { exp: string; dte: number }[] {
  const seen = new Map<string, number>();
  for (const c of contracts) {
    if (!seen.has(c.expirationDate)) seen.set(c.expirationDate, c.daysToExpiration);
  }
  return Array.from(seen.entries())
    .map(([exp, dte]) => ({ exp, dte }))
    .sort((a, b) => a.dte - b.dte);
}

function strikesForExp(contracts: FlatContract[], exp: string, type: LegType): number[] {
  const set = new Set<number>();
  for (const c of contracts) {
    if (c.expirationDate === exp && c.type === type) {
      set.add(c.strikePrice ?? c.strike ?? 0);
    }
  }
  return Array.from(set).filter(s => s > 0).sort((a, b) => a - b);
}

function findContract(
  contracts: FlatContract[],
  exp: string,
  strike: number,
  type: LegType
): FlatContract | undefined {
  return contracts.find(c =>
    c.expirationDate === exp &&
    (c.strikePrice ?? c.strike) === strike &&
    c.type === type
  );
}

// ─── AUTO-LEG SELECTION ──────────────────────────────────────────────────────
// Pick the expiration whose DTE is closest to target (25–45 default)
function pickExpiration(contracts: FlatContract[], minDTE = TARGET_DTE_MIN, maxDTE = TARGET_DTE_MAX): string | null {
  const exps = uniqueExpirations(contracts);
  if (!exps.length) return null;
  // Prefer expirations inside the window
  const inWindow = exps.filter(e => e.dte >= minDTE && e.dte <= maxDTE);
  if (inWindow.length) {
    // Closest to midpoint
    const target = (minDTE + maxDTE) / 2;
    return inWindow.sort((a, b) => Math.abs(a.dte - target) - Math.abs(b.dte - target))[0].exp;
  }
  // Else closest to window edges
  return exps.sort((a, b) => {
    const da = a.dte < minDTE ? minDTE - a.dte : a.dte - maxDTE;
    const db = b.dte < minDTE ? minDTE - b.dte : b.dte - maxDTE;
    return da - db;
  })[0].exp;
}

// Find contract closest to a target absolute delta
function pickByDelta(
  contracts: FlatContract[],
  exp: string,
  type: LegType,
  targetAbsDelta: number
): FlatContract | undefined {
  const candidates = contracts.filter(c =>
    c.expirationDate === exp && c.type === type && c.delta != null
  );
  if (!candidates.length) return undefined;
  return candidates.sort((a, b) =>
    Math.abs(Math.abs(a.delta) - targetAbsDelta) - Math.abs(Math.abs(b.delta) - targetAbsDelta)
  )[0];
}

const contractToLeg = (c: FlatContract, side: LegSide, qty = 1): Leg => ({
  id: `${c.expirationDate}-${c.strikePrice}-${c.type}-${side}-${Math.random().toString(36).slice(2, 7)}`,
  side,
  type: c.type,
  strike: c.strikePrice ?? c.strike ?? 0,
  expiration: c.expirationDate,
  dte: c.daysToExpiration,
  qty,
  bid: c.bid || 0,
  ask: c.ask || 0,
  delta: c.delta || 0,
  gamma: c.gamma || 0,
  theta: c.theta || 0,
  vega: c.vega || 0,
  iv: normIV(c.volatility || 0),
});

function buildStrategy(
  strategy: StrategyId,
  contracts: FlatContract[],
  underlying: number
): Leg[] {
  const exp = pickExpiration(contracts);
  if (!exp) return [];

  const width = underlying > 100 ? SPREAD_WIDTH_HIGH : SPREAD_WIDTH_LOW;

  switch (strategy) {
    case 'csp': {
      const shortPut = pickByDelta(contracts, exp, 'PUT', TARGET_SHORT_DELTA);
      return shortPut ? [contractToLeg(shortPut, 'SELL')] : [];
    }
    case 'cc': {
      const shortCall = pickByDelta(contracts, exp, 'CALL', TARGET_SHORT_DELTA);
      return shortCall ? [contractToLeg(shortCall, 'SELL')] : [];
    }
    case 'bullput': {
      const shortPut = pickByDelta(contracts, exp, 'PUT', TARGET_SHORT_DELTA);
      if (!shortPut) return [];
      const strikes = strikesForExp(contracts, exp, 'PUT');
      const longStrikeTarget = (shortPut.strikePrice ?? 0) - width;
      // Find the strike closest to (short - width), but strictly lower than short
      const lowerStrikes = strikes.filter(s => s < (shortPut.strikePrice ?? 0));
      if (!lowerStrikes.length) return [contractToLeg(shortPut, 'SELL')];
      const longStrike = lowerStrikes.sort((a, b) =>
        Math.abs(a - longStrikeTarget) - Math.abs(b - longStrikeTarget)
      )[0];
      const longPut = findContract(contracts, exp, longStrike, 'PUT');
      return longPut
        ? [contractToLeg(shortPut, 'SELL'), contractToLeg(longPut, 'BUY')]
        : [contractToLeg(shortPut, 'SELL')];
    }
    case 'bearcall': {
      const shortCall = pickByDelta(contracts, exp, 'CALL', TARGET_SHORT_DELTA);
      if (!shortCall) return [];
      const strikes = strikesForExp(contracts, exp, 'CALL');
      const longStrikeTarget = (shortCall.strikePrice ?? 0) + width;
      const upperStrikes = strikes.filter(s => s > (shortCall.strikePrice ?? 0));
      if (!upperStrikes.length) return [contractToLeg(shortCall, 'SELL')];
      const longStrike = upperStrikes.sort((a, b) =>
        Math.abs(a - longStrikeTarget) - Math.abs(b - longStrikeTarget)
      )[0];
      const longCall = findContract(contracts, exp, longStrike, 'CALL');
      return longCall
        ? [contractToLeg(shortCall, 'SELL'), contractToLeg(longCall, 'BUY')]
        : [contractToLeg(shortCall, 'SELL')];
    }
    case 'iron_condor': {
      // Bull put + bear call, both shorts at ~0.30 delta, both spreads same width
      const shortPut  = pickByDelta(contracts, exp, 'PUT',  TARGET_SHORT_DELTA);
      const shortCall = pickByDelta(contracts, exp, 'CALL', TARGET_SHORT_DELTA);
      if (!shortPut || !shortCall) return [];
      const putStrikes  = strikesForExp(contracts, exp, 'PUT');
      const callStrikes = strikesForExp(contracts, exp, 'CALL');
      const lowerPuts  = putStrikes.filter(s => s < (shortPut.strikePrice ?? 0));
      const upperCalls = callStrikes.filter(s => s > (shortCall.strikePrice ?? 0));
      if (!lowerPuts.length || !upperCalls.length) return [];
      const longPutTarget  = (shortPut.strikePrice  ?? 0) - width;
      const longCallTarget = (shortCall.strikePrice ?? 0) + width;
      const longPutStrike  = lowerPuts.sort((a, b) =>
        Math.abs(a - longPutTarget) - Math.abs(b - longPutTarget))[0];
      const longCallStrike = upperCalls.sort((a, b) =>
        Math.abs(a - longCallTarget) - Math.abs(b - longCallTarget))[0];
      const longPut  = findContract(contracts, exp, longPutStrike,  'PUT');
      const longCall = findContract(contracts, exp, longCallStrike, 'CALL');
      if (!longPut || !longCall) return [];
      return [
        contractToLeg(shortPut,  'SELL'),
        contractToLeg(longPut,   'BUY'),
        contractToLeg(shortCall, 'SELL'),
        contractToLeg(longCall,  'BUY'),
      ];
    }
    case 'iron_butterfly': {
      // Both shorts at the SAME strike (closest to ATM), wings at ±width
      const atmCall = pickByDelta(contracts, exp, 'CALL', 0.50);
      if (!atmCall) return [];
      const centerStrike = atmCall.strikePrice ?? 0;
      // Use the same center strike for the put side
      const shortPut = findContract(contracts, exp, centerStrike, 'PUT');
      const shortCall = atmCall;
      if (!shortPut) return [];
      const putStrikes  = strikesForExp(contracts, exp, 'PUT');
      const callStrikes = strikesForExp(contracts, exp, 'CALL');
      const lowerPuts  = putStrikes.filter(s => s < centerStrike);
      const upperCalls = callStrikes.filter(s => s > centerStrike);
      if (!lowerPuts.length || !upperCalls.length) return [];
      const longPutTarget  = centerStrike - width;
      const longCallTarget = centerStrike + width;
      const longPutStrike  = lowerPuts.sort((a, b) =>
        Math.abs(a - longPutTarget) - Math.abs(b - longPutTarget))[0];
      const longCallStrike = upperCalls.sort((a, b) =>
        Math.abs(a - longCallTarget) - Math.abs(b - longCallTarget))[0];
      const longPut  = findContract(contracts, exp, longPutStrike,  'PUT');
      const longCall = findContract(contracts, exp, longCallStrike, 'CALL');
      if (!longPut || !longCall) return [];
      return [
        contractToLeg(shortPut,  'SELL'),
        contractToLeg(longPut,   'BUY'),
        contractToLeg(shortCall, 'SELL'),
        contractToLeg(longCall,  'BUY'),
      ];
    }
    case 'pmcc': {
      // Long LEAP call (~0.70 delta, 180–730 DTE) + short near-term call (~0.30 delta, 25–45 DTE)
      const leapExp = pickExpiration(contracts, PMCC_LEAP_DTE_MIN, PMCC_LEAP_DTE_MAX);
      if (!leapExp) return [];
      const longLeap   = pickByDelta(contracts, leapExp, 'CALL', PMCC_LEAP_DELTA);
      const shortFront = pickByDelta(contracts, exp,     'CALL', TARGET_SHORT_DELTA);
      if (!longLeap || !shortFront) return [];
      // Make sure short strike > long strike (defines the spread as net debit with upside cap)
      if ((shortFront.strikePrice ?? 0) <= (longLeap.strikePrice ?? 0)) {
        // Pick the lowest call strike strictly above the LEAP strike
        const callStrikes = strikesForExp(contracts, exp, 'CALL').filter(s => s > (longLeap.strikePrice ?? 0));
        if (!callStrikes.length) return [contractToLeg(longLeap, 'BUY')];
        const altStrike = callStrikes[0];
        const altShort = findContract(contracts, exp, altStrike, 'CALL');
        if (!altShort) return [contractToLeg(longLeap, 'BUY')];
        return [contractToLeg(longLeap, 'BUY'), contractToLeg(altShort, 'SELL')];
      }
      return [contractToLeg(longLeap, 'BUY'), contractToLeg(shortFront, 'SELL')];
    }
    case 'custom': {
      // Long Straddle: long ATM call + long ATM put at same strike
      const atmCall = pickByDelta(contracts, exp, 'CALL', 0.50);
      if (!atmCall) return [];
      const strike = atmCall.strikePrice ?? 0;
      const atmPut = findContract(contracts, exp, strike, 'PUT');
      if (!atmPut) return [contractToLeg(atmCall, 'BUY')];
      return [contractToLeg(atmCall, 'BUY'), contractToLeg(atmPut, 'BUY')];
    }
    case 'diagonal': {
      // Long longer-dated call (~0.70 delta, 60–180 DTE) + short shorter-dated call (~0.30 delta)
      // Different strikes AND different expiries (vs PMCC which is same).
      const longExp = pickExpiration(contracts, DIAGONAL_LONG_DTE_MIN, DIAGONAL_LONG_DTE_MAX);
      if (!longExp) return [];
      const longCall  = pickByDelta(contracts, longExp, 'CALL', DIAGONAL_LONG_DELTA);
      const shortCall = pickByDelta(contracts, exp,     'CALL', TARGET_SHORT_DELTA);
      if (!longCall || !shortCall) return [];
      // Ensure short strike strictly above long strike
      if ((shortCall.strikePrice ?? 0) <= (longCall.strikePrice ?? 0)) {
        const callStrikes = strikesForExp(contracts, exp, 'CALL').filter(s => s > (longCall.strikePrice ?? 0));
        if (!callStrikes.length) return [contractToLeg(longCall, 'BUY')];
        const altShort = findContract(contracts, exp, callStrikes[0], 'CALL');
        if (!altShort) return [contractToLeg(longCall, 'BUY')];
        return [contractToLeg(longCall, 'BUY'), contractToLeg(altShort, 'SELL')];
      }
      return [contractToLeg(longCall, 'BUY'), contractToLeg(shortCall, 'SELL')];
    }
    case 'calendar_press': {
      // Custom strategy:
      //   Buy a longer-dated put (60–150 DTE)
      //   Sell a near-term weekly put (3–21 DTE) at the SAME strike (tightest spread first)
      // Capital required = spread width × 100; for same-strike calendar, width is 0,
      // so capital is special-cased downstream (= 1 contract × 100 nominal slot).
      const longExp  = pickExpiration(contracts, CALPRESS_LONG_DTE_MIN,  CALPRESS_LONG_DTE_MAX);
      const shortExp = pickExpiration(contracts, CALPRESS_SHORT_DTE_MIN, CALPRESS_SHORT_DTE_MAX);
      if (!longExp || !shortExp) return [];
      // Anchor on the long put closest to ATM (highest |delta| put nearest 0.50)
      const longPut = pickByDelta(contracts, longExp, 'PUT', 0.50);
      if (!longPut) return [];
      const targetStrike = longPut.strikePrice ?? 0;
      // Try same strike on the short side first (tightest spread)
      let shortPut = findContract(contracts, shortExp, targetStrike, 'PUT');
      if (!shortPut) {
        // Fall back to closest-strike short put on the same expiry
        const shortStrikes = strikesForExp(contracts, shortExp, 'PUT');
        if (!shortStrikes.length) return [contractToLeg(longPut, 'BUY')];
        const closest = shortStrikes.sort((a, b) =>
          Math.abs(a - targetStrike) - Math.abs(b - targetStrike)
        )[0];
        shortPut = findContract(contracts, shortExp, closest, 'PUT');
      }
      if (!shortPut) return [contractToLeg(longPut, 'BUY')];
      return [contractToLeg(longPut, 'BUY'), contractToLeg(shortPut, 'SELL')];
    }
    default:
      return [];
  }
}

// ─── METRICS ─────────────────────────────────────────────────────────────────
type PayoffSample = { S: number; pnl: number };

type Metrics = {
  netCredit: number;          // positive = credit received, negative = debit paid
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  maxProfit: number;          // Infinity if unlimited
  maxLoss: number;            // Infinity if unlimited (positive number = loss magnitude)
  breakevens: number[];
  ror: number;                // return on risk (decimal)
  pop: number;                // probability of profit (decimal)
  capitalRequired: number;    // for sizing/RoR
  // Chart support
  samples: PayoffSample[];    // payoff curve across price range
  priceLo: number;            // X-axis low
  priceHi: number;            // X-axis high
};

// Compute payoff at a given underlying price at expiration
// Each leg is per-share; multiply by 100 for contract value at end
function legPayoffAtExpiry(leg: Leg, S: number): number {
  const intrinsic = leg.type === 'CALL'
    ? Math.max(0, S - leg.strike)
    : Math.max(0, leg.strike - S);
  const m = legEntryPrice(leg);
  // SELL: collected premium m, owe intrinsic
  // BUY:  paid premium m, receive intrinsic
  const perShare = leg.side === 'SELL' ? (m - intrinsic) : (intrinsic - m);
  return perShare * 100 * leg.qty;
}

function totalPayoffAtExpiry(legs: Leg[], S: number): number {
  return legs.reduce((sum, l) => sum + legPayoffAtExpiry(l, S), 0);
}

// Try to detect a vertical spread's width from a 2-leg group
function detectVerticalWidth(group: Leg[]): number | null {
  if (group.length !== 2) return null;
  if (group[0].type !== group[1].type) return null;
  if (group[0].expiration !== group[1].expiration) return null;
  if (group[0].side === group[1].side) return null;
  return Math.abs(group[0].strike - group[1].strike);
}

function computeMetrics(legs: Leg[], underlying: number): Metrics {
  const empty: Metrics = {
    netCredit: 0, netDelta: 0, netGamma: 0, netTheta: 0, netVega: 0,
    maxProfit: 0, maxLoss: 0, breakevens: [], ror: 0, pop: 0, capitalRequired: 0,
    samples: [], priceLo: 0, priceHi: 0,
  };
  if (!legs.length) return empty;

  // Net credit (positive) / debit (negative). Per spread, ×100.
  // Uses the leg's entryOverride if set (real fill), otherwise mid(bid, ask).
  let netCredit = 0;
  let nDelta = 0, nGamma = 0, nTheta = 0, nVega = 0;
  for (const l of legs) {
    const m = legEntryPrice(l);
    const sign = l.side === 'SELL' ? 1 : -1;
    netCredit += sign * m * 100 * l.qty;
    nDelta += sign * l.delta * l.qty;
    nGamma += sign * l.gamma * l.qty;
    nTheta += sign * l.theta * l.qty;
    nVega  += sign * l.vega  * l.qty;
  }

  // ─── AUTO-WIDEN PRICE RANGE ──
  // Default ±30% from underlying, but expand to include all strikes with margin
  // and (after computing) any breakevens.
  const baseLo = underlying * 0.7;
  const baseHi = underlying * 1.3;
  const strikeLo = Math.min(...legs.map(l => l.strike));
  const strikeHi = Math.max(...legs.map(l => l.strike));
  // Pad strikes by 15% of the underlying so the strike marker isn't on the chart edge
  const pad = underlying * 0.15;
  let lo = Math.max(0.01, Math.min(baseLo, strikeLo - pad));
  let hi = Math.max(baseHi, strikeHi + pad);

  // ─── SAMPLE PAYOFF ──
  const sample = (rangeLo: number, rangeHi: number, steps: number): PayoffSample[] => {
    const out: PayoffSample[] = [];
    const step = (rangeHi - rangeLo) / steps;
    for (let i = 0; i <= steps; i++) {
      const S = rangeLo + i * step;
      out.push({ S, pnl: totalPayoffAtExpiry(legs, S) });
    }
    return out;
  };

  let samples = sample(lo, hi, 400);
  let maxP = -Infinity, maxL = Infinity;
  for (const s of samples) {
    if (s.pnl > maxP) maxP = s.pnl;
    if (s.pnl < maxL) maxL = s.pnl;
  }

  // ─── BREAKEVENS (linear-interpolate zero crossings) ──
  const findBreakevens = (data: PayoffSample[]): number[] => {
    const bes: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const a = data[i - 1], b = data[i];
      if ((a.pnl <= 0 && b.pnl >= 0) || (a.pnl >= 0 && b.pnl <= 0)) {
        const t = a.pnl === b.pnl ? 0 : -a.pnl / (b.pnl - a.pnl);
        bes.push(a.S + t * (b.S - a.S));
      }
    }
    return bes;
  };
  let breakevens = findBreakevens(samples);

  // If any breakeven is too close to the chart edge, widen and re-sample once
  const margin = (hi - lo) * 0.08;
  const beOutside = breakevens.some(be => be < lo + margin || be > hi - margin);
  if (beOutside) {
    if (breakevens.length) {
      lo = Math.max(0.01, Math.min(lo, Math.min(...breakevens) - pad));
      hi = Math.max(hi, Math.max(...breakevens) + pad);
    }
    samples = sample(lo, hi, 400);
    maxP = -Infinity; maxL = Infinity;
    for (const s of samples) {
      if (s.pnl > maxP) maxP = s.pnl;
      if (s.pnl < maxL) maxL = s.pnl;
    }
    breakevens = findBreakevens(samples);
  }

  // ─── UNLIMITED-RISK DETECTION ──
  // Test deep tails to see if payoff continues changing past the sampled range
  const tailLeft  = totalPayoffAtExpiry(legs, lo * 0.5);
  const tailRight = totalPayoffAtExpiry(legs, hi * 1.5);
  const unlimitedDownside = tailLeft  < maxL - 1;
  const unlimitedUpside   = tailRight < maxL - 1;
  const unlimitedProfitDn = tailLeft  > maxP + 1;
  const unlimitedProfitUp = tailRight > maxP + 1;

  const maxProfit = (unlimitedProfitDn || unlimitedProfitUp) ? Infinity : maxP;
  const maxLoss   = (unlimitedDownside || unlimitedUpside)   ? Infinity : Math.abs(Math.min(0, maxL));

  // ─── CAPITAL REQUIRED ──
  // Single short put (CSP): strike × 100 × qty
  // Single short call: max loss (covered call basis)
  // Vertical spread: width × 100 × qty
  // Iron Condor / Butterfly: max(put-side width, call-side width) × 100 × qty
  // Otherwise: max loss if finite, else net debit
  let capitalRequired = 0;
  if (legs.length === 1) {
    const l = legs[0];
    if (l.side === 'SELL' && l.type === 'PUT') {
      capitalRequired = l.strike * 100 * l.qty;
    } else if (l.side === 'SELL' && l.type === 'CALL') {
      capitalRequired = isFinite(maxLoss) ? maxLoss : 0;
    } else {
      capitalRequired = Math.abs(Math.min(netCredit, 0));
    }
  } else if (legs.length === 2) {
    const w = detectVerticalWidth(legs);
    if (w != null) {
      capitalRequired = w * 100 * Math.min(legs[0].qty, legs[1].qty);
    } else {
      // Could be a calendar / diagonal: same type, different expirations
      // Per Calendar Press spec: capital = strike-spread width × 100 (NOT long put cost)
      const sameType = legs[0].type === legs[1].type;
      const oppSides = legs[0].side !== legs[1].side;
      const diffExp  = legs[0].expiration !== legs[1].expiration;
      if (sameType && oppSides && diffExp) {
        const strikeDiff = Math.abs(legs[0].strike - legs[1].strike);
        if (strikeDiff > 0) {
          // Diagonal calendar: width × 100
          capitalRequired = strikeDiff * 100 * Math.min(legs[0].qty, legs[1].qty);
        } else {
          // Same-strike calendar: long-leg cost is the max possible loss
          const longLeg = legs.find(l => l.side === 'BUY');
          capitalRequired = longLeg
            ? legEntryPrice(longLeg) * 100 * longLeg.qty
            : (isFinite(maxLoss) ? maxLoss : Math.abs(Math.min(netCredit, 0)));
        }
      } else {
        capitalRequired = isFinite(maxLoss) ? maxLoss : Math.abs(Math.min(netCredit, 0));
      }
    }
  } else if (legs.length === 4) {
    // Iron Condor / Butterfly: split into put-side and call-side, take the larger width
    const puts  = legs.filter(l => l.type === 'PUT');
    const calls = legs.filter(l => l.type === 'CALL');
    const wPut  = detectVerticalWidth(puts)  || 0;
    const wCall = detectVerticalWidth(calls) || 0;
    const widerWidth = Math.max(wPut, wCall);
    if (widerWidth > 0) {
      const minQty = Math.min(...legs.map(l => l.qty));
      capitalRequired = widerWidth * 100 * minQty;
    } else {
      capitalRequired = isFinite(maxLoss) ? maxLoss : 0;
    }
  } else {
    capitalRequired = isFinite(maxLoss) ? maxLoss : Math.abs(Math.min(netCredit, 0));
  }

  // ─── RETURN ON RISK ──
  const ror = capitalRequired > 0 && isFinite(maxProfit)
    ? maxProfit / capitalRequired
    : 0;

  // ─── PROBABILITY OF PROFIT ──
  let pop = 0;
  const shorts = legs.filter(l => l.side === 'SELL');
  if (netCredit > 0 && shorts.length) {
    // Credit strategy: POP ≈ 1 - |dominant short delta|
    // For multi-short structures (IC, IB), use the average of max-delta per side
    if (shorts.length >= 2) {
      const maxAbs = (group: Leg[]) => group.length ? Math.max(...group.map(l => Math.abs(l.delta))) : 0;
      const sPuts  = shorts.filter(l => l.type === 'PUT');
      const sCalls = shorts.filter(l => l.type === 'CALL');
      // Probability of getting tagged on either side ≈ sum of tail deltas
      const tagProb = maxAbs(sPuts) + maxAbs(sCalls);
      pop = Math.max(0, Math.min(1, 1 - tagProb));
    } else {
      pop = Math.max(0, Math.min(1, 1 - Math.abs(shorts[0].delta)));
    }
  } else if (netCredit < 0) {
    pop = Math.max(0, Math.min(1, Math.abs(nDelta)));
  } else {
    pop = 0.5;
  }

  return {
    netCredit,
    netDelta: nDelta,
    netGamma: nGamma,
    netTheta: nTheta,
    netVega: nVega,
    maxProfit,
    maxLoss,
    breakevens: breakevens.sort((a, b) => a - b),
    ror,
    pop,
    capitalRequired,
    samples,
    priceLo: lo,
    priceHi: hi,
  };
}

// ─── EXPECTED MOVE ───────────────────────────────────────────────────────────
// σ = S × IV × √(DTE/365). 1σ ≈ 68% probability cone, 2σ ≈ 95%.
// Use the dominant short leg's IV+DTE, falling back to the leg closest to ATM.
function computeExpectedMove(legs: Leg[], underlying: number): { sigma1: number; sigma2: number; iv: number; dte: number } | null {
  if (!legs.length || !underlying) return null;
  // Prefer short legs (they're the structural anchor of credit plays)
  const shorts = legs.filter(l => l.side === 'SELL');
  const pool = shorts.length ? shorts : legs;
  // Pick leg closest to ATM by strike distance
  const anchor = pool.reduce((best, l) =>
    Math.abs(l.strike - underlying) < Math.abs(best.strike - underlying) ? l : best
  );
  if (!anchor.iv || !anchor.dte) return null;
  const sigma = underlying * anchor.iv * Math.sqrt(anchor.dte / 365);
  return { sigma1: sigma, sigma2: sigma * 2, iv: anchor.iv, dte: anchor.dte };
}

// ─── BLACK-SCHOLES PRICING ───────────────────────────────────────────────────
// Standard European-option pricing. Risk-free rate hardcoded to 4.5% (close enough
// for short-dated relative valuations); dividends ignored.
const RISK_FREE_RATE = 0.045;

function bsPrice(
  S: number,        // spot
  K: number,        // strike
  T: number,        // time to expiry in years
  iv: number,       // implied vol as fraction (0.32 = 32%)
  type: LegType
): number {
  if (T <= 0) {
    // At/after expiry, value = intrinsic
    return type === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  if (iv <= 0 || S <= 0 || K <= 0) {
    return type === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RISK_FREE_RATE + 0.5 * iv * iv) * T) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  if (type === 'CALL') {
    return S * ncdf(d1) - K * Math.exp(-RISK_FREE_RATE * T) * ncdf(d2);
  } else {
    return K * Math.exp(-RISK_FREE_RATE * T) * ncdf(-d2) - S * ncdf(-d1);
  }
}

// Standard-normal probability density function — needed for Greeks
const npdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

// Black-Scholes Greeks. Returns delta, gamma, theta (per day), vega (per 1% IV).
// Theta is the standard "per calendar day" convention used by retail platforms.
// Vega is per 1 vol-point (so 0.32 → 0.33 = +1).
type BSGreeks = { price: number; delta: number; gamma: number; theta: number; vega: number };

function bsGreeks(S: number, K: number, T: number, iv: number, type: LegType): BSGreeks {
  // Degenerate cases — return intrinsic value with zero Greeks
  if (T <= 0 || iv <= 0 || S <= 0 || K <= 0) {
    const intrinsic = type === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: type === 'CALL' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RISK_FREE_RATE + 0.5 * iv * iv) * T) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const Nd1 = ncdf(d1);
  const Nd2 = ncdf(d2);
  const nd1 = npdf(d1);
  const discount = Math.exp(-RISK_FREE_RATE * T);

  const price = type === 'CALL'
    ? S * Nd1 - K * discount * Nd2
    : K * discount * ncdf(-d2) - S * ncdf(-d1);

  const delta = type === 'CALL' ? Nd1 : Nd1 - 1;
  const gamma = nd1 / (S * iv * sqrtT);
  // Theta is annualized in standard BS — divide by 365 for "per day"
  const thetaAnnual = type === 'CALL'
    ? -(S * nd1 * iv) / (2 * sqrtT) - RISK_FREE_RATE * K * discount * Nd2
    : -(S * nd1 * iv) / (2 * sqrtT) + RISK_FREE_RATE * K * discount * ncdf(-d2);
  const theta = thetaAnnual / 365;
  // Vega is per "1.0" of vol in standard BS — divide by 100 for "per 1 vol-point"
  const vega = (S * nd1 * sqrtT) / 100;

  return { price, delta, gamma, theta, vega };
}

// Recompute a leg's Greeks (delta/gamma/theta/vega) at a new spot price using BS.
// IV and DTE are taken from the leg itself (we trust the chain's IV).
// Returns a NEW leg object with the adjusted Greeks; bid/ask/iv/strike/expiration unchanged.
function recomputeLegGreeks(leg: Leg, S: number): Leg {
  const T = Math.max(0, leg.dte) / 365;
  if (T <= 0 || leg.iv <= 0) return leg;
  const g = bsGreeks(S, leg.strike, T, leg.iv, leg.type);
  return {
    ...leg,
    delta: g.delta,
    gamma: g.gamma,
    theta: g.theta,
    vega: g.vega,
  };
}

// Compute the position's *current* theoretical P&L if held until `daysForward` from now,
// at underlying price S. Each leg's value is its current BS price minus its entry mid.
// daysForward = 0 → "if I closed it right now". daysForward = leg.dte → expiration.
function positionTheoreticalPnL(legs: Leg[], S: number, daysForward: number): number {
  let total = 0;
  for (const leg of legs) {
    const remainingDays = Math.max(0, leg.dte - daysForward);
    const T = remainingDays / 365;
    const theo = bsPrice(S, leg.strike, T, leg.iv, leg.type);
    const entry = legEntryPrice(leg);
    if (leg.side === 'SELL') {
      // Sold at entry, must buy back at theo to close. P&L = (entry - theo) × 100 × qty
      total += (entry - theo) * 100 * leg.qty;
    } else {
      // Bought at entry, can sell at theo. P&L = (theo - entry) × 100 × qty
      total += (theo - entry) * 100 * leg.qty;
    }
  }
  return total;
}

// ─── RISK PROFILE CLASSIFIER ─────────────────────────────────────────────────
type RiskProfile = 'cash-secured' | 'share-covered' | 'defined' | 'undefined';

function classifyRisk(legs: Leg[], maxLoss: number): RiskProfile {
  if (!legs.length) return 'defined';
  // Single leg
  if (legs.length === 1) {
    const l = legs[0];
    if (l.side === 'SELL' && l.type === 'PUT')  return 'cash-secured';   // CSP
    if (l.side === 'SELL' && l.type === 'CALL') return 'share-covered';  // CC (assumes covered)
    return 'defined'; // long single — defined risk = premium paid
  }
  // Any structure where loss is finite (computed from sampled payoff) is "defined"
  if (isFinite(maxLoss)) return 'defined';
  return 'undefined';
}

// ─── CALENDAR PRESS METRICS ──────────────────────────────────────────────────
type CalendarPressMetrics = {
  longCost: number;          // dollars paid for the long put (per contract × 100)
  weeklyCredit: number;      // dollars collected for the weekly short (per contract × 100)
  costRatio: number;         // longCost / weeklyCredit
  costRatioGrade: 'ideal' | 'acceptable' | 'too-high';
  weeksToBreakeven: number;  // ceil(longCost / weeklyCredit)
  weeklyROC: number;         // weeklyCredit / capital, as decimal (0.0X)
  totalProjectedCredits: number; // weeklyCredit × (longDTE / 7)
  longDTE: number;
  shortDTE: number;
};

function computeCalendarPressMetrics(legs: Leg[], capitalRequired: number): CalendarPressMetrics | null {
  if (legs.length !== 2) return null;
  // Identify long (longer DTE) and short (shorter DTE) — both should be puts
  const sorted = [...legs].sort((a, b) => b.dte - a.dte);
  const longLeg  = sorted[0];
  const shortLeg = sorted[1];
  if (longLeg.side !== 'BUY' || shortLeg.side !== 'SELL') return null;

  const longCost     = legEntryPrice(longLeg)  * 100 * longLeg.qty;
  const weeklyCredit = legEntryPrice(shortLeg) * 100 * shortLeg.qty;
  if (weeklyCredit <= 0) {
    return {
      longCost, weeklyCredit, costRatio: Infinity, costRatioGrade: 'too-high',
      weeksToBreakeven: Infinity, weeklyROC: 0, totalProjectedCredits: 0,
      longDTE: longLeg.dte, shortDTE: shortLeg.dte,
    };
  }
  const costRatio = longCost / weeklyCredit;
  const grade: CalendarPressMetrics['costRatioGrade'] =
    costRatio <= CALPRESS_COST_RATIO_IDEAL ? 'ideal'
    : costRatio <= CALPRESS_COST_RATIO_MAX ? 'acceptable'
    : 'too-high';
  const weeksToBreakeven = Math.ceil(costRatio);
  const weeklyROC = capitalRequired > 0 ? weeklyCredit / capitalRequired : 0;
  const totalProjectedCredits = weeklyCredit * (longLeg.dte / 7);
  return {
    longCost, weeklyCredit, costRatio, costRatioGrade: grade,
    weeksToBreakeven, weeklyROC, totalProjectedCredits,
    longDTE: longLeg.dte, shortDTE: shortLeg.dte,
  };
}

// ─── PAYOFF CHART ────────────────────────────────────────────────────────────
type PayoffChartProps = {
  samples: PayoffSample[];
  todaySamples?: PayoffSample[];   // optional "P&L if held to today" curve (BS-driven)
  underlying: number;
  breakevens: number[];
  expectedMove: { sigma1: number; sigma2: number } | null;
  legs: Leg[];
  height?: number;
};

function PayoffChart({ samples, todaySamples, underlying, breakevens, expectedMove, legs, height = 320 }: PayoffChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; y: number; S: number; pnl: number } | null>(null);

  // Track container width responsively
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !samples.length) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Padding for axes
    const padL = 56, padR = 16, padT = 14, padB = 28;
    const W = width - padL - padR;
    const H = height - padT - padB;

    // Bounds
    const sLo = samples[0].S;
    const sHi = samples[samples.length - 1].S;
    let pMin = Infinity, pMax = -Infinity;
    for (const s of samples) {
      if (s.pnl < pMin) pMin = s.pnl;
      if (s.pnl > pMax) pMax = s.pnl;
    }
    // Also include today-curve range if present, so the dotted line never clips
    if (todaySamples) {
      for (const s of todaySamples) {
        if (s.pnl < pMin) pMin = s.pnl;
        if (s.pnl > pMax) pMax = s.pnl;
      }
    }
    // Add 10% headroom; ensure zero is always visible
    const pRange = Math.max(1, pMax - pMin);
    pMin = Math.min(pMin - pRange * 0.1, 0);
    pMax = Math.max(pMax + pRange * 0.1, 0);

    const xFor = (S: number) => padL + ((S - sLo) / (sHi - sLo)) * W;
    const yFor = (pnl: number) => padT + (1 - (pnl - pMin) / (pMax - pMin)) * H;

    // ─── 2σ band (lighter) ──
    if (expectedMove) {
      const lo2 = underlying - expectedMove.sigma2;
      const hi2 = underlying + expectedMove.sigma2;
      const x1 = Math.max(padL, xFor(lo2));
      const x2 = Math.min(padL + W, xFor(hi2));
      if (x2 > x1) {
        ctx.fillStyle = 'rgba(99,102,241,0.05)';
        ctx.fillRect(x1, padT, x2 - x1, H);
      }
      // 1σ band (slightly more visible)
      const lo1 = underlying - expectedMove.sigma1;
      const hi1 = underlying + expectedMove.sigma1;
      const x3 = Math.max(padL, xFor(lo1));
      const x4 = Math.min(padL + W, xFor(hi1));
      if (x4 > x3) {
        ctx.fillStyle = 'rgba(99,102,241,0.08)';
        ctx.fillRect(x3, padT, x4 - x3, H);
      }
      // Sigma boundary lines (subtle)
      ctx.strokeStyle = 'rgba(99,102,241,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      [lo2, lo1, hi1, hi2].forEach(s => {
        const x = xFor(s);
        if (x > padL && x < padL + W) {
          ctx.beginPath();
          ctx.moveTo(x, padT);
          ctx.lineTo(x, padT + H);
          ctx.stroke();
        }
      });
      ctx.setLineDash([]);
    }

    // ─── Zero line ──
    const yZero = yFor(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, yZero);
    ctx.lineTo(padL + W, yZero);
    ctx.stroke();

    // ─── Profit / loss filled regions ──
    // Build a polygon for profit (above zero, clipped to zero) and loss (below zero)
    const drawFill = (above: boolean, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(xFor(samples[0].S), yZero);
      for (const s of samples) {
        const y = above ? Math.min(yFor(s.pnl), yZero) : Math.max(yFor(s.pnl), yZero);
        ctx.lineTo(xFor(s.S), y);
      }
      ctx.lineTo(xFor(samples[samples.length - 1].S), yZero);
      ctx.closePath();
      ctx.fill();
    };
    drawFill(true,  'rgba(74,222,128,0.18)');   // profit (green)
    drawFill(false, 'rgba(248,113,113,0.18)');  // loss (red)

    // ─── "Held to today" curve (theta decay overlay) — purple dotted ──
    if (todaySamples && todaySamples.length) {
      ctx.strokeStyle = '#c4b5fd';   // soft purple
      ctx.lineWidth = 1.75;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      todaySamples.forEach((s, i) => {
        const x = xFor(s.S), y = yFor(s.pnl);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ─── Payoff curve (at expiration) ──
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = xFor(s.S), y = yFor(s.pnl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // ─── Strike markers ──
    legs.forEach(leg => {
      const x = xFor(leg.strike);
      if (x < padL || x > padL + W) return;
      ctx.strokeStyle = leg.side === 'SELL' ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + H);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ─── Breakeven lines ──
    breakevens.forEach(be => {
      const x = xFor(be);
      if (x < padL || x > padL + W) return;
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + H);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = '#eab308';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`BE $${be.toFixed(2)}`, x, padT - 4);
    });

    // ─── Current price marker ──
    const xCur = xFor(underlying);
    if (xCur >= padL && xCur <= padL + W) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xCur, padT);
      ctx.lineTo(xCur, padT + H);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`$${underlying.toFixed(2)}`, xCur, padT + H + 16);
    }

    // ─── Y-axis labels (P/L) ──
    ctx.fillStyle = '#8a8f9e';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = pMin + ((pMax - pMin) * i) / yTicks;
      const y = yFor(v);
      ctx.fillText(`$${v >= 0 ? '' : '-'}${Math.abs(Math.round(v))}`, padL - 6, y + 3);
      // Faint horizontal gridline
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + W, y);
      ctx.stroke();
    }

    // ─── X-axis labels (price) ──
    ctx.textAlign = 'center';
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const v = sLo + ((sHi - sLo) * i) / xTicks;
      const x = xFor(v);
      ctx.fillText(`$${v.toFixed(0)}`, x, padT + H + 16);
    }

    // ─── Hover crosshair + tooltip ──
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hover.x, padT);
      ctx.lineTo(hover.x, padT + H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tooltip box
      const txt1 = `$${hover.S.toFixed(2)}`;
      const txt2 = `${hover.pnl >= 0 ? '+' : ''}$${hover.pnl.toFixed(0)}`;
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      const tw = Math.max(ctx.measureText(txt1).width, ctx.measureText(txt2).width) + 16;
      const tx = Math.min(padL + W - tw, Math.max(padL, hover.x - tw / 2));
      const ty = padT + 6;
      ctx.fillStyle = 'rgba(20,22,30,0.95)';
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(tx, ty, tw, 36);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e2e4ea';
      ctx.textAlign = 'left';
      ctx.fillText(txt1, tx + 8, ty + 14);
      ctx.fillStyle = hover.pnl >= 0 ? '#4ade80' : '#f87171';
      ctx.fillText(txt2, tx + 8, ty + 28);
    }
  }, [samples, todaySamples, width, height, underlying, breakevens, expectedMove, legs, hover]);

  // Mouse handlers — convert mouse X back to S, find nearest sample
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!samples.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const padL = 56, padR = 16;
    const W = width - padL - padR;
    if (mx < padL || mx > padL + W) { setHover(null); return; }
    const sLo = samples[0].S;
    const sHi = samples[samples.length - 1].S;
    const S = sLo + ((mx - padL) / W) * (sHi - sLo);
    // Find closest sample
    let best = samples[0], bestD = Math.abs(samples[0].S - S);
    for (const s of samples) {
      const d = Math.abs(s.S - S);
      if (d < bestD) { best = s; bestD = d; }
    }
    setHover({ x: mx, y: e.clientY - rect.top, S: best.S, pnl: best.pnl });
  };
  const onMouseLeave = () => setHover(null);

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block', cursor: 'crosshair' }}
      />
    </div>
  );
}

// ─── HEAT MAP ────────────────────────────────────────────────────────────────
type HeatMapProps = {
  legs: Leg[];
  priceLo: number;
  priceHi: number;
  underlying: number;
  height?: number;
};

function HeatMap({ legs, priceLo, priceHi, underlying, height = 240 }: HeatMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; y: number; S: number; days: number; pnl: number } | null>(null);

  // Max DTE from legs (heat map runs from now to last expiration)
  const maxDTE = useMemo(() => {
    if (!legs.length) return 30;
    return Math.max(...legs.map(l => l.dte));
  }, [legs]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build the grid once per legs/price-range change
  const grid = useMemo(() => {
    if (!legs.length || maxDTE <= 0) return null;
    const cols = 60;  // price granularity
    const rows = Math.min(60, Math.max(8, maxDTE)); // day granularity capped
    const cells: number[][] = [];
    let absMax = 0;
    for (let r = 0; r < rows; r++) {
      const daysForward = (r / (rows - 1)) * maxDTE;
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const S = priceLo + ((priceHi - priceLo) * c) / (cols - 1);
        const pnl = positionTheoreticalPnL(legs, S, daysForward);
        row.push(pnl);
        const a = Math.abs(pnl);
        if (a > absMax) absMax = a;
      }
      cells.push(row);
    }
    return { cells, rows, cols, absMax };
  }, [legs, priceLo, priceHi, maxDTE]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 56, padR = 16, padT = 14, padB = 28;
    const W = width - padL - padR;
    const H = height - padT - padB;
    const { cells, rows, cols, absMax } = grid;
    const cellW = W / cols;
    const cellH = H / rows;

    // Color: green for profit, red for loss, intensity by |pnl|/absMax
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = cells[r][c];
        const t = absMax > 0 ? Math.abs(v) / absMax : 0;
        const intensity = Math.min(1, t * 1.2);   // gentle saturation curve
        const x = padL + c * cellW;
        // Row 0 = today (top), row rows-1 = expiration (bottom)
        const y = padT + r * cellH;
        if (v >= 0) {
          ctx.fillStyle = `rgba(74,222,128,${intensity})`;
        } else {
          ctx.fillStyle = `rgba(248,113,113,${intensity})`;
        }
        ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
      }
    }

    // Axes
    ctx.fillStyle = '#8a8f9e';
    ctx.font = '10px Inter, system-ui, sans-serif';

    // Y-axis: days forward labels
    ctx.textAlign = 'right';
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const days = (i / yTicks) * maxDTE;
      const y = padT + (i / yTicks) * H;
      ctx.fillText(`${Math.round(days)}d`, padL - 6, y + 3);
    }

    // X-axis: price labels
    ctx.textAlign = 'center';
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const v = priceLo + ((priceHi - priceLo) * i) / xTicks;
      const x = padL + (i / xTicks) * W;
      ctx.fillText(`$${v.toFixed(0)}`, x, padT + H + 16);
    }

    // Current-price vertical guide
    const xCur = padL + ((underlying - priceLo) / (priceHi - priceLo)) * W;
    if (xCur >= padL && xCur <= padL + W) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(xCur, padT);
      ctx.lineTo(xCur, padT + H);
      ctx.stroke();
    }

    // "Today" label on the top edge
    ctx.fillStyle = '#a5b4fc';
    ctx.textAlign = 'left';
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillText('TODAY →', padL + 3, padT - 3);
    ctx.textAlign = 'right';
    ctx.fillText('EXPIRY ↓', padL + W - 3, padT + H + 16);

    // Hover crosshair + tooltip
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(hover.x - cellW / 2, hover.y - cellH / 2, cellW, cellH);
      ctx.setLineDash([]);

      const t1 = `$${hover.S.toFixed(2)} · ${Math.round(hover.days)}d`;
      const t2 = `${hover.pnl >= 0 ? '+' : ''}$${hover.pnl.toFixed(0)}`;
      ctx.font = 'bold 11px Inter, system-ui, sans-serif';
      const tw = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 16;
      const tx = Math.min(padL + W - tw, Math.max(padL, hover.x - tw / 2));
      const ty = Math.max(padT, hover.y - 44);
      ctx.fillStyle = 'rgba(20,22,30,0.95)';
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(tx, ty, tw, 36);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e2e4ea';
      ctx.textAlign = 'left';
      ctx.fillText(t1, tx + 8, ty + 14);
      ctx.fillStyle = hover.pnl >= 0 ? '#4ade80' : '#f87171';
      ctx.fillText(t2, tx + 8, ty + 28);
    }
  }, [grid, width, height, priceLo, priceHi, underlying, hover]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!grid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const padL = 56, padR = 16, padT = 14, padB = 28;
    const W = width - padL - padR;
    const H = height - padT - padB;
    if (mx < padL || mx > padL + W || my < padT || my > padT + H) {
      setHover(null);
      return;
    }
    const cellW = W / grid.cols;
    const cellH = H / grid.rows;
    const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((mx - padL) / cellW)));
    const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((my - padT) / cellH)));
    const S = priceLo + ((priceHi - priceLo) * c) / (grid.cols - 1);
    const days = (r / (grid.rows - 1)) * maxDTE;
    setHover({
      x: padL + c * cellW + cellW / 2,
      y: padT + r * cellH + cellH / 2,
      S, days, pnl: grid.cells[r][c],
    });
  };
  const onMouseLeave = () => setHover(null);

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ display: 'block', cursor: 'crosshair' }}
      />
    </div>
  );
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function PlayBuilderModule({ user }: { user?: any }) {
  const [ticker, setTicker] = useState('');
  const [tickerInput, setTickerInput] = useState('');
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [contracts, setContracts] = useState<FlatContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<StrategyId | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // Load chain for a ticker
  const loadChain = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoading(true);
    setError(null);
    setChain(null);
    setContracts([]);
    setLegs([]);
    setStrategy(null);
    try {
      // strikeCount=30 gives a wide enough window for spread building
      const res = await authFetch(`/api/schwab/options?symbol=${encodeURIComponent(sym)}&contractType=ALL&strikeCount=30`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data: ChainResponse = await res.json();
      if (!data.putExpDateMap && !data.callExpDateMap) {
        throw new Error('Empty option chain');
      }
      setChain(data);
      setContracts(flattenChain(data));
      setTicker(sym);
    } catch (e: any) {
      setError(e?.message || 'Failed to load chain');
    } finally {
      setLoading(false);
    }
  }, []);
  // Underlying price — read-only, straight from the live chain
  const underlying = useMemo(() => {
    if (!chain) return 0;
    return chain.underlyingPrice || chain.underlying?.last || 0;
  }, [chain]);
  const liveUnderlying = underlying;  // alias kept for StrikeComparison props


  // ── Strike comparison sliders (cards-only, never affect main view) ──
  // All three default to "no shift" so the cards show live chain values until the
  // user moves a slider. As soon as ANY slider is off default, cards switch to
  // BS-projected values.
  const [scenarioPrice, setScenarioPrice] = useState<number | null>(null);  // null = use live
  const [scenarioIvShift, setScenarioIvShift] = useState(0);               // % shift, 0 = no shift
  const [scenarioDaysFwd, setScenarioDaysFwd] = useState(0);               // days forward, 0 = today

  // Reset all sliders whenever a new ticker loads or legs are cleared
  useEffect(() => {
    setScenarioPrice(null);
    setScenarioIvShift(0);
    setScenarioDaysFwd(0);
  }, [ticker]);

  const scenarioActive = scenarioPrice != null || scenarioIvShift !== 0 || scenarioDaysFwd !== 0;
  const scenarioEffectivePrice = scenarioPrice != null ? scenarioPrice : liveUnderlying;

  const resetScenario = useCallback(() => {
    setScenarioPrice(null);
    setScenarioIvShift(0);
    setScenarioDaysFwd(0);
  }, []);

  // When user picks a strategy, auto-build legs
  const onPickStrategy = useCallback((id: StrategyId) => {
    const def = STRATEGIES.find(s => s.id === id);
    if (!def) return;
    setStrategy(id);
    if (!def.enabled) {
      setLegs([]);
      showToast(`${def.name} — auto-build coming in a later session`);
      return;
    }
    if (!contracts.length) {
      showToast('Load a ticker first');
      return;
    }
    const built = buildStrategy(id, contracts, underlying);
    if (!built.length) {
      showToast(`Could not auto-build ${def.shortName} — try a different ticker or expiry`);
      return;
    }
    setLegs(built);
    showToast(`${def.name} built — ${built.length} leg${built.length > 1 ? 's' : ''}`);
  }, [contracts, underlying, showToast]);

  // Edit a leg field
  const updateLeg = useCallback((id: string, patch: Partial<Leg>) => {
    setLegs(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next: Leg = { ...l, ...patch };
      // If strike or expiration or type changed, re-snapshot from contract data
      // AND clear any manual entry-price override (old fill no longer applies to a new contract)
      if (patch.strike != null || patch.expiration != null || patch.type != null) {
        const c = findContract(contracts, next.expiration, next.strike, next.type);
        if (c) {
          next.bid = c.bid || 0;
          next.ask = c.ask || 0;
          next.delta = c.delta || 0;
          next.gamma = c.gamma || 0;
          next.theta = c.theta || 0;
          next.vega = c.vega || 0;
          next.iv = normIV(c.volatility || 0);
          next.dte = c.daysToExpiration;
        }
        next.entryOverride = null;
      }
      return next;
    }));
  }, [contracts]);

  const removeLeg = useCallback((id: string) => {
    setLegs(prev => prev.filter(l => l.id !== id));
  }, []);

  const addBlankLeg = useCallback(() => {
    if (!contracts.length) {
      showToast('Load a ticker first');
      return;
    }
    const exp = pickExpiration(contracts) || contracts[0]?.expirationDate;
    if (!exp) return;
    const atm = pickByDelta(contracts, exp, 'PUT', 0.50);
    if (!atm) return;
    setLegs(prev => [...prev, contractToLeg(atm, 'SELL')]);
  }, [contracts, showToast]);

  // Live metrics
  const metrics = useMemo(() => computeMetrics(legs, underlying), [legs, underlying]);

  // Expected move for chart bands
  const expectedMove = useMemo(() => computeExpectedMove(legs, underlying), [legs, underlying]);

  // "Held to today" curve — Black-Scholes valuation across the same price range
  // as the at-expiration curve, with daysForward = 0
  const todaySamples = useMemo(() => {
    if (!legs.length || !metrics.samples.length) return undefined;
    return metrics.samples.map(s => ({
      S: s.S,
      pnl: positionTheoreticalPnL(legs, s.S, 0),
    }));
  }, [legs, metrics.samples]);

  // Calendar Press metrics (only meaningful when that strategy is active)
  const calPressMetrics = useMemo(() => {
    if (strategy !== 'calendar_press') return null;
    return computeCalendarPressMetrics(legs, metrics.capitalRequired);
  }, [strategy, legs, metrics.capitalRequired]);

  // Risk profile classification — drives the badge in the metrics panel
  const riskProfile = useMemo(
    () => classifyRisk(legs, metrics.maxLoss),
    [legs, metrics.maxLoss]
  );

  // Swap a leg's strike (used by strike comparison cards)
  const swapLegStrike = useCallback((legId: string, newStrike: number) => {
    setLegs(prev => prev.map(l => {
      if (l.id !== legId) return l;
      const c = findContract(contracts, l.expiration, newStrike, l.type);
      if (!c) return l;
      return {
        ...l,
        strike: newStrike,
        bid: c.bid || 0,
        ask: c.ask || 0,
        delta: c.delta || 0,
        gamma: c.gamma || 0,
        theta: c.theta || 0,
        vega: c.vega || 0,
        iv: normIV(c.volatility || 0),
        dte: c.daysToExpiration,
        entryOverride: null,  // fresh contract → fresh fill price
      };
    }));
  }, [contracts]);

  // Available expirations & strike lists for dropdowns
  const expirations = useMemo(() => uniqueExpirations(contracts), [contracts]);

  // ─── SAVE FLOW STATE ──────────────────────────────────────────────────────
  // Two-step Save: idle → reviewing → (Send) → dispatched
  const [saveStage, setSaveStage] = useState<'idle' | 'reviewing'>('idle');
  const [useMidPrices, setUseMidPrices] = useState(true);
  // Per-leg fill price overrides (string-keyed by leg.id)
  const [fillOverrides, setFillOverrides] = useState<Record<string, string>>({});
  const [saveNote, setSaveNote] = useState('');

  // Reset save state whenever the legs change so stale overrides don't carry over
  useEffect(() => {
    setSaveStage('idle');
    setFillOverrides({});
    setUseMidPrices(true);
    setSaveNote('');
  }, [legs]);

  // ─── INBOUND EVENT LISTENER (Screener / SPX Radar handoff) ───────────────
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail || {};
      const sym = (detail.ticker || '').toUpperCase().trim();
      const reqStrategy: StrategyId | undefined = detail.strategy;
      if (!sym) return;
      // Stash the requested strategy so onPickStrategy can fire after the chain loads
      setTickerInput(sym);
      loadChain(sym).then(() => {
        if (reqStrategy && STRATEGIES.find(s => s.id === reqStrategy)) {
          // onPickStrategy reads `contracts` from state, which has just been set
          // by loadChain — but state updates are async, so we wrap in a microtask
          // and re-derive via the latest state inside a setter pattern:
          setTimeout(() => {
            // We re-call buildStrategy directly here to avoid any race with useCallback
            // closures that captured stale `contracts`. This mirrors onPickStrategy's
            // logic.
            setContracts(prevContracts => {
              const built = prevContracts.length
                ? buildStrategy(reqStrategy, prevContracts, underlying || 0)
                : [];
              if (built.length) {
                setLegs(built);
                setStrategy(reqStrategy);
                showToast(`${STRATEGIES.find(s => s.id === reqStrategy)?.name} built from ${sym}`);
              }
              return prevContracts;
            });
          }, 0);
        }
      });
    };
    window.addEventListener('tp-open-playbuilder', handler);
    return () => window.removeEventListener('tp-open-playbuilder', handler);
  }, [loadChain, underlying, showToast]);

  // ─── STRATEGY MAPPING (Play Builder → Journal) ───────────────────────────
  const STRATEGY_TO_JOURNAL: Record<StrategyId, string> = {
    csp: 'Single Leg',
    cc: 'Single Leg',
    bullput: 'Vertical Spread',
    bearcall: 'Vertical Spread',
    iron_condor: 'Iron Condor',
    iron_butterfly: 'Iron Butterfly',
    pmcc: 'PMCC / Diagonal',
    diagonal: 'PMCC / Diagonal',
    calendar_press: 'Calendar Press',
    custom: 'Straddle / Strangle',
  };

  // Convert a Play Builder leg → Journal leg shape (matches emptyLeg() in JournalModule.jsx)
  // Journal expects all string values; action/type are title-cased.
  const toJournalLeg = useCallback((leg: Leg, fillPriceOverride?: number) => {
    const fillPrice = fillPriceOverride != null ? fillPriceOverride : mid(leg.bid, leg.ask);
    return {
      id: Date.now() + Math.random(),
      action: leg.side === 'SELL' ? 'Sell' : 'Buy',
      type: leg.type === 'CALL' ? 'Call' : 'Put',
      strike: String(leg.strike),
      expiration: leg.expiration,
      contracts: String(leg.qty),
      entryPremium: fillPrice.toFixed(2),
      exitPremium: '',
      partialCloses: [],
      rolls: [],
    };
  }, []);

  // Reorder Iron Butterfly legs to match Journal's expected order
  // Journal: [Buy-Put, Sell-Put, Sell-Call, Buy-Call]
  // Play Builder builds: [Sell-Put, Buy-Put, Sell-Call, Buy-Call]
  const reorderForJournal = useCallback((strategyId: StrategyId, builderLegs: Leg[]): Leg[] => {
    if (strategyId !== 'iron_butterfly' || builderLegs.length !== 4) return builderLegs;
    const buyPut   = builderLegs.find(l => l.side === 'BUY'  && l.type === 'PUT');
    const sellPut  = builderLegs.find(l => l.side === 'SELL' && l.type === 'PUT');
    const sellCall = builderLegs.find(l => l.side === 'SELL' && l.type === 'CALL');
    const buyCall  = builderLegs.find(l => l.side === 'BUY'  && l.type === 'CALL');
    if (buyPut && sellPut && sellCall && buyCall) {
      return [buyPut, sellPut, sellCall, buyCall];
    }
    return builderLegs;
  }, []);

  // Begin save flow — opens the inline review panel
  const beginSave = useCallback(() => {
    if (!legs.length) {
      showToast('No legs to save');
      return;
    }
    // Pre-populate fill inputs — use the leg's entryOverride if set (real fill),
    // otherwise mid. Also default to "actual fills" mode if ANY leg has an override,
    // so the user sees their entered values instead of the mid-price disabled state.
    const initial: Record<string, string> = {};
    let anyOverride = false;
    for (const l of legs) {
      initial[l.id] = legEntryPrice(l).toFixed(2);
      if (l.entryOverride != null) anyOverride = true;
    }
    setFillOverrides(initial);
    setUseMidPrices(!anyOverride);
    setSaveStage('reviewing');
  }, [legs, showToast]);

  // Cancel review — back to idle
  const cancelSave = useCallback(() => {
    setSaveStage('idle');
  }, []);

  // Send to Journal — dispatches `tp-add-trade` event with full prefill payload
  const sendToJournal = useCallback(() => {
    if (!legs.length) return;
    const journalStrategyType = strategy ? STRATEGY_TO_JOURNAL[strategy] : 'Single Leg';
    const orderedLegs = strategy ? reorderForJournal(strategy, legs) : legs;

    // Build journal-shape legs with appropriate fill prices
    const journalLegs = orderedLegs.map(leg => {
      if (useMidPrices) return toJournalLeg(leg);
      const override = parseFloat(fillOverrides[leg.id]);
      return toJournalLeg(leg, isFinite(override) ? override : undefined);
    });

    // Auto-generated note + user's optional note
    const sName = STRATEGIES.find(s => s.id === strategy)?.name || 'Custom';
    const autoNote = [
      `Built in Play Builder · ${sName}`,
      `POP ${(metrics.pop * 100).toFixed(0)}%`,
      `Max Profit ${isFinite(metrics.maxProfit) ? '$' + metrics.maxProfit.toFixed(0) : 'Unlimited'}`,
      `Max Loss ${isFinite(metrics.maxLoss) ? '$' + metrics.maxLoss.toFixed(0) : 'Unlimited'}`,
      metrics.breakevens.length ? `BE ${metrics.breakevens.map(b => '$' + b.toFixed(2)).join(' / ')}` : '',
    ].filter(Boolean).join(' · ');
    const fullNote = saveNote.trim() ? `${autoNote}\n${saveNote.trim()}` : autoNote;

    // Build the prefill payload that emptyTrade(prefill) will spread over defaults
    const prefill = {
      ticker,
      assetType: 'Options',
      optionsStrategyType: journalStrategyType,
      legs: journalLegs,
      notes: fullNote,
      status: 'Open',
      date: new Date().toISOString().split('T')[0],
    };

    // Dispatch the event — JournalModule's listener picks it up
    try {
      window.dispatchEvent(new CustomEvent('tp-add-trade', { detail: prefill }));
      showToast(`Sent to Journal — opening Trade Log…`);
      setSaveStage('idle');
    } catch (err) {
      console.error('[PlayBuilder] Failed to dispatch tp-add-trade:', err);
      showToast('Failed to send to Journal — see console');
    }
  }, [legs, strategy, ticker, useMidPrices, fillOverrides, saveNote, metrics, toJournalLeg, reorderForJournal, showToast]);

  // Legacy stub kept for the disabled state (replaced by beginSave/sendToJournal)
  const saveToJournal = beginSave;

  // ─── STYLES ──
  const panel: React.CSSProperties = {
    background: 'var(--panel-bg, #161922)',
    border: '1px solid var(--border, rgba(255,255,255,0.07))',
    borderRadius: 12,
    padding: 18,
  };
  const label: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #8a8f9e)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  };
  const inputStyle: React.CSSProperties = {
    background: 'var(--input-bg, #1e2028)',
    border: '1px solid var(--border, rgba(255,255,255,0.08))',
    color: 'var(--text, #e2e4ea)',
    borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', minWidth: 0,
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', color: 'var(--text, #e2e4ea)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Play Builder</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim, #8a8f9e)', marginTop: 4 }}>
            Design strategies live — pick a ticker, choose a strategy, fine-tune the legs.
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim, #8a8f9e)', padding: '4px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
          SESSION 1 BUILD
        </div>
      </div>

      {/* TICKER + CHAIN STATUS */}
      <div style={{ ...panel, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto' }}>
            <div style={label}>Ticker</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={tickerInput}
                onChange={e => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') loadChain(tickerInput.trim()); }}
                placeholder="SNOW"
                style={{ ...inputStyle, width: 120, fontWeight: 600, letterSpacing: 1 }}
              />
              <button
                onClick={() => loadChain(tickerInput.trim())}
                disabled={loading || !tickerInput.trim()}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none', cursor: loading ? 'wait' : 'pointer',
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
                  fontSize: 12, fontWeight: 600, opacity: (loading || !tickerInput.trim()) ? 0.5 : 1,
                }}
              >
                {loading ? 'Loading…' : 'Load Chain'}
              </button>
            </div>
          </div>

          {ticker && chain && (
            <div style={{ display: 'flex', gap: 24, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <div>
                <div style={label}>Symbol</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{ticker}</div>
              </div>
              <div>
                <div style={label}>Underlying</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#a5b4fc' }}>{fmtMoney(underlying)}</div>
              </div>
              <div>
                <div style={label}>Expirations</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{expirations.length}</div>
              </div>
              <div>
                <div style={label}>Contracts</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{contracts.length}</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>

      {/* STRATEGY CHIPS */}
      <div style={{ ...panel, marginBottom: 16 }}>
        <div style={label}>Strategy Templates</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {STRATEGIES.map(s => {
            const active = strategy === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onPickStrategy(s.id)}
                title={s.description}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: active ? '1px solid rgba(99,102,241,0.6)' : '1px solid var(--border, rgba(255,255,255,0.08))',
                  background: active ? 'rgba(99,102,241,0.15)' : 'var(--input-bg, rgba(255,255,255,0.03))',
                  color: active ? '#a5b4fc' : (s.enabled ? 'var(--text, #e2e4ea)' : 'var(--text-dim, #8a8f9e)'),
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 8,
                  position: 'relative',
                }}
              >
                {s.shortName}
                {!s.enabled && (
                  <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                    SOON
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN GRID: LEGS + METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
        {/* LEGS PANEL */}
        <div style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={label}>Legs</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={addBlankLeg}
                disabled={!contracts.length}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  background: 'transparent', color: 'var(--text-dim, #8a8f9e)', cursor: contracts.length ? 'pointer' : 'not-allowed',
                  fontSize: 11, fontWeight: 600, opacity: contracts.length ? 1 : 0.5,
                }}
              >
                + Add Leg
              </button>
              <button
                onClick={() => setLegs([])}
                disabled={!legs.length}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  background: 'transparent', color: 'var(--text-dim, #8a8f9e)', cursor: legs.length ? 'pointer' : 'not-allowed',
                  fontSize: 11, fontWeight: 600, opacity: legs.length ? 1 : 0.5,
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {!legs.length ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim, #8a8f9e)', fontSize: 12 }}>
              {ticker ? 'Pick a strategy template above, or add a blank leg.' : 'Load a ticker to begin.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: 'var(--text-dim, #8a8f9e)', textTransform: 'uppercase', fontSize: 9, letterSpacing: 1 }}>
                    <th style={thStyle}>Side</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Expiry</th>
                    <th style={thStyle}>Strike</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Bid</th>
                    <th style={thStyle}>Ask</th>
                    <th style={thStyle}>Mid</th>
                    <th style={thStyle} title="Your actual fill price — overrides mid for all P&L math">Entry $</th>
                    <th style={thStyle}>Δ</th>
                    <th style={thStyle}>Θ</th>
                    <th style={thStyle}>IV</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map(leg => {
                    const strikeOptions = strikesForExp(contracts, leg.expiration, leg.type);
                    const midPrice = mid(leg.bid, leg.ask);
                    return (
                      <tr key={leg.id} style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.06))' }}>
                        <td style={tdStyle}>
                          <select
                            value={leg.side}
                            onChange={e => updateLeg(leg.id, { side: e.target.value as LegSide })}
                            style={{ ...selectStyle, color: leg.side === 'SELL' ? '#4ade80' : '#f87171', fontWeight: 700 }}
                          >
                            <option value="SELL">SELL</option>
                            <option value="BUY">BUY</option>
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={leg.type}
                            onChange={e => updateLeg(leg.id, { type: e.target.value as LegType })}
                            style={selectStyle}
                          >
                            <option value="PUT">PUT</option>
                            <option value="CALL">CALL</option>
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={leg.expiration}
                            onChange={e => updateLeg(leg.id, { expiration: e.target.value })}
                            style={selectStyle}
                          >
                            {expirations.map(({ exp, dte }) => (
                              <option key={exp} value={exp}>{fmtExpiry(exp)} ({dte}d)</option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={leg.strike}
                            onChange={e => updateLeg(leg.id, { strike: parseFloat(e.target.value) })}
                            style={selectStyle}
                          >
                            {strikeOptions.length ? strikeOptions.map(s => (
                              <option key={s} value={s}>{s.toFixed(2)}</option>
                            )) : <option value={leg.strike}>{leg.strike.toFixed(2)}</option>}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <input
                            type="number"
                            min="1"
                            value={leg.qty}
                            onChange={e => updateLeg(leg.id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                            style={{ ...selectStyle, width: 50, textAlign: 'center' }}
                          />
                        </td>
                        <td style={tdStyle}>{fmtNum(leg.bid)}</td>
                        <td style={tdStyle}>{fmtNum(leg.ask)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#a5b4fc' }}>{fmtNum(midPrice)}</td>
                        <td style={tdStyle}>
                          <EntryPriceInput
                            legId={leg.id}
                            midPrice={midPrice}
                            entryOverride={leg.entryOverride}
                            onChange={(v) => updateLeg(leg.id, { entryOverride: v })}
                          />
                        </td>
                        <td style={tdStyle}>{fmtNum(leg.delta, 3)}</td>
                        <td style={tdStyle}>{fmtNum(leg.theta, 3)}</td>
                        <td style={tdStyle}>{fmtPct(leg.iv, 1)}</td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => removeLeg(leg.id)}
                            style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 11 }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* METRICS PANEL */}
        <div style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={label}>Metrics</div>
            {legs.length > 0 && <RiskBadge profile={riskProfile} />}
          </div>
          {!legs.length ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim, #8a8f9e)', fontSize: 12 }}>
              No legs yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MetricRow label={metrics.netCredit >= 0 ? 'Credit Received' : 'Debit Paid'}
                value={fmtMoney(Math.abs(metrics.netCredit))}
                color={metrics.netCredit >= 0 ? '#4ade80' : '#f87171'}
                bold />
              <MetricRow label="Max Profit"
                value={isFinite(metrics.maxProfit) ? fmtMoney(metrics.maxProfit) : 'Unlimited'}
                color="#4ade80" />
              <MetricRow label="Max Loss"
                value={isFinite(metrics.maxLoss) ? fmtMoney(-metrics.maxLoss) : 'Unlimited'}
                color="#f87171" />
              <MetricRow label="Capital Required"
                value={fmtMoney(metrics.capitalRequired, 0)} />
              <MetricRow label="Return on Risk"
                value={fmtPct(metrics.ror)}
                color={metrics.ror > 0 ? '#a5b4fc' : 'var(--text-dim, #8a8f9e)'} />
              <MetricRow label="Probability of Profit"
                value={fmtPct(metrics.pop)} />
              <MetricRow label="Breakevens"
                value={metrics.breakevens.length
                  ? metrics.breakevens.map(b => `$${b.toFixed(2)}`).join(', ')
                  : '—'} />

              <div style={{ height: 1, background: 'var(--border, rgba(255,255,255,0.06))', margin: '6px 0' }}/>
              <div style={{ ...label, marginBottom: 2 }}>Net Greeks</div>
              <MetricRow label="Δ Delta" value={fmtNum(metrics.netDelta, 3)} />
              <MetricRow label="Γ Gamma" value={fmtNum(metrics.netGamma, 4)} />
              <MetricRow label="Θ Theta" value={fmtNum(metrics.netTheta, 3)} />
              <MetricRow label="V Vega"  value={fmtNum(metrics.netVega, 3)} />
            </div>
          )}
        </div>
      </div>

      {/* PAYOFF CHART */}
      {legs.length > 0 && metrics.samples.length > 0 && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={label}>Payoff at Expiration</div>
            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-dim, #8a8f9e)', alignItems: 'center', flexWrap: 'wrap' }}>
              <LegendDot color="#a5b4fc" label="At expiration" />
              <LegendDot color="#c4b5fd" label="If held to today" dashed />
              <LegendDot color="#ffffff" label="Current price" />
              <LegendDot color="#eab308" label="Breakeven" dashed />
              <LegendDot color="rgba(74,222,128,0.7)" label="Short strike" dashed />
              <LegendDot color="rgba(248,113,113,0.7)" label="Long strike" dashed />
              {expectedMove && (
                <LegendDot color="rgba(99,102,241,0.5)" label={`Exp. move (1σ/2σ, IV ${(expectedMove.iv * 100).toFixed(0)}%, ${expectedMove.dte}d)`} />
              )}
            </div>
          </div>
          <PayoffChart
            samples={metrics.samples}
            todaySamples={todaySamples}
            underlying={underlying}
            breakevens={metrics.breakevens}
            expectedMove={expectedMove}
            legs={legs}
            height={340}
          />
        </div>
      )}

      {/* HEAT MAP — P&L over price × time */}
      {legs.length > 0 && metrics.priceHi > metrics.priceLo && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={label}>P&amp;L Heat Map (price × days forward)</div>
            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-dim, #8a8f9e)', alignItems: 'center', flexWrap: 'wrap' }}>
              <LegendDot color="rgba(74,222,128,0.7)" label="Profit" />
              <LegendDot color="rgba(248,113,113,0.7)" label="Loss" />
              <span style={{ color: 'var(--text-dim, #8a8f9e)' }}>Intensity = magnitude · Black-Scholes valued</span>
            </div>
          </div>
          <HeatMap
            legs={legs}
            priceLo={metrics.priceLo}
            priceHi={metrics.priceHi}
            underlying={underlying}
            height={260}
          />
        </div>
      )}

      {/* STRIKE COMPARISON CARDS — single-leg only */}
      {legs.length === 1 && contracts.length > 0 && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <StrikeComparison
            leg={legs[0]}
            contracts={contracts}
            liveUnderlying={liveUnderlying}
            scenarioPrice={scenarioPrice}
            scenarioIvShift={scenarioIvShift}
            scenarioDaysFwd={scenarioDaysFwd}
            scenarioActive={scenarioActive}
            setScenarioPrice={setScenarioPrice}
            setScenarioIvShift={setScenarioIvShift}
            setScenarioDaysFwd={setScenarioDaysFwd}
            resetScenario={resetScenario}
            onPickStrike={(newStrike) => swapLegStrike(legs[0].id, newStrike)}
          />
        </div>
      )}

      {/* CALENDAR PRESS METRICS PANEL — only when that strategy is active */}
      {strategy === 'calendar_press' && calPressMetrics && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={label}>Calendar Press Metrics</div>
            <CostRatioBadge grade={calPressMetrics.costRatioGrade} ratio={calPressMetrics.costRatio} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <CalPressStat label="Long Cost" value={fmtMoney(calPressMetrics.longCost, 0)} sub={`${calPressMetrics.longDTE} DTE`} />
            <CalPressStat label="Weekly Credit" value={fmtMoney(calPressMetrics.weeklyCredit, 0)} sub={`${calPressMetrics.shortDTE} DTE short`} />
            <CalPressStat label="Cost Ratio" value={isFinite(calPressMetrics.costRatio) ? `${calPressMetrics.costRatio.toFixed(2)}x` : '∞'} sub={`Ideal ≤${CALPRESS_COST_RATIO_IDEAL}x · Max ≤${CALPRESS_COST_RATIO_MAX}x`} />
            <CalPressStat label="Weeks to Breakeven" value={isFinite(calPressMetrics.weeksToBreakeven) ? `${calPressMetrics.weeksToBreakeven}w` : '—'} sub={`@ ${fmtMoney(calPressMetrics.weeklyCredit, 0)}/wk pace`} />
            <CalPressStat label="Weekly ROC" value={fmtPct(calPressMetrics.weeklyROC, 2)} sub="vs capital required" />
            <CalPressStat label="Total Projected Credits" value={fmtMoney(calPressMetrics.totalProjectedCredits, 0)} sub={`Over ${Math.floor(calPressMetrics.longDTE / 7)} weeks`} />
          </div>
        </div>
      )}

      {/* SAVE TO JOURNAL — two-step inline flow */}
      <div style={{ ...panel }}>
        {saveStage === 'idle' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim, #8a8f9e)' }}>
              Click Save to Journal to review fills and send this play to your Trade Log.
            </div>
            <button
              onClick={beginSave}
              disabled={!legs.length}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: legs.length ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--input-bg, #1e2028)',
                color: legs.length ? '#fff' : 'var(--text-dim, #8a8f9e)',
                cursor: legs.length ? 'pointer' : 'not-allowed',
                fontSize: 12, fontWeight: 600,
                opacity: legs.length ? 1 : 0.5,
              }}
            >
              Save to Journal
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={label}>Review Fills</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim, #8a8f9e)' }}>
                Step 2 of 2 — confirm prices then send
              </div>
            </div>

            {/* Mid vs Actual radio toggle */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: useMidPrices ? '#a5b4fc' : 'var(--text-dim, #8a8f9e)' }}>
                <input type="radio" checked={useMidPrices} onChange={() => setUseMidPrices(true)} />
                Use mid prices (theoretical)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: !useMidPrices ? '#a5b4fc' : 'var(--text-dim, #8a8f9e)' }}>
                <input type="radio" checked={!useMidPrices} onChange={() => setUseMidPrices(false)} />
                Enter actual fills (per leg)
              </label>
            </div>

            {/* Per-leg fills table */}
            <div style={{ background: 'var(--input-bg, rgba(255,255,255,0.02))', borderRadius: 8, padding: '10px 12px', marginBottom: 14, border: '1px solid var(--border, rgba(255,255,255,0.06))' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--text-dim, #8a8f9e)', textTransform: 'uppercase', fontSize: 9, letterSpacing: 1 }}>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Side</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Type</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Strike</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Expiry</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Qty</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Mid</th>
                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>Fill $</th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map(leg => {
                    const m = mid(leg.bid, leg.ask);
                    return (
                      <tr key={leg.id} style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.04))' }}>
                        <td style={{ padding: '6px 4px', color: leg.side === 'SELL' ? '#4ade80' : '#f87171', fontWeight: 700 }}>{leg.side}</td>
                        <td style={{ padding: '6px 4px' }}>{leg.type}</td>
                        <td style={{ padding: '6px 4px' }}>{leg.strike.toFixed(2)}</td>
                        <td style={{ padding: '6px 4px' }}>{fmtExpiry(leg.expiration)}</td>
                        <td style={{ padding: '6px 4px' }}>{leg.qty}</td>
                        <td style={{ padding: '6px 4px', color: 'var(--text-dim, #8a8f9e)' }}>${m.toFixed(2)}</td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={fillOverrides[leg.id] ?? m.toFixed(2)}
                            disabled={useMidPrices}
                            onChange={e => setFillOverrides(prev => ({ ...prev, [leg.id]: e.target.value }))}
                            style={{
                              width: 70,
                              background: useMidPrices ? 'transparent' : 'var(--input-bg, #1e2028)',
                              border: '1px solid var(--border, rgba(255,255,255,0.08))',
                              color: useMidPrices ? 'var(--text-dim, #8a8f9e)' : 'var(--text, #e2e4ea)',
                              borderRadius: 4, padding: '4px 6px', fontSize: 11, outline: 'none',
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Optional note */}
            <div style={{ marginBottom: 14 }}>
              <div style={label}>Note (optional)</div>
              <input
                type="text"
                value={saveNote}
                onChange={e => setSaveNote(e.target.value)}
                placeholder="e.g. Earnings play, IV crush thesis"
                style={{
                  width: '100%',
                  background: 'var(--input-bg, #1e2028)',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  color: 'var(--text, #e2e4ea)',
                  borderRadius: 6, padding: '8px 10px', fontSize: 12, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelSave}
                style={{
                  padding: '9px 18px', borderRadius: 8,
                  border: '1px solid var(--border, rgba(255,255,255,0.12))',
                  background: 'transparent', color: 'var(--text-dim, #8a8f9e)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={sendToJournal}
                style={{
                  padding: '9px 22px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                }}
              >
                Send to Journal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 22px', borderRadius: 10,
          background: 'rgba(99,102,241,0.95)', color: '#fff',
          fontSize: 12, fontWeight: 600,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 1000,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── SUB-COMPONENTS / STYLES ─────────────────────────────────────────────────
const thStyle: React.CSSProperties = { padding: '8px 6px', textAlign: 'left', fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'middle' };
const selectStyle: React.CSSProperties = {
  background: 'var(--input-bg, #1e2028)',
  border: '1px solid var(--border, rgba(255,255,255,0.08))',
  color: 'var(--text, #e2e4ea)',
  borderRadius: 6, padding: '4px 6px', fontSize: 11, outline: 'none',
};

function MetricRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim, #8a8f9e)' }}>{label}</span>
      <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 600, color: color || 'var(--text, #e2e4ea)', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        display: 'inline-block', width: 14, height: 0,
        borderTop: dashed ? `2px dashed ${color}` : `2px solid ${color}`,
      }}/>
      <span>{label}</span>
    </span>
  );
}

function CostRatioBadge({ grade, ratio }: { grade: 'ideal' | 'acceptable' | 'too-high'; ratio: number }) {
  const config = {
    'ideal':      { bg: 'rgba(74,222,128,0.15)',  color: '#4ade80', label: 'IDEAL' },
    'acceptable': { bg: 'rgba(234,179,8,0.15)',   color: '#eab308', label: 'ACCEPTABLE' },
    'too-high':   { bg: 'rgba(248,113,113,0.15)', color: '#f87171', label: 'TOO HIGH' },
  }[grade];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 12px', borderRadius: 6,
      background: config.bg,
      border: `1px solid ${config.color}40`,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: config.color, letterSpacing: 1 }}>{config.label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: config.color }}>
        {isFinite(ratio) ? `${ratio.toFixed(2)}x` : '∞'}
      </span>
    </div>
  );
}

function CalPressStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--input-bg, rgba(255,255,255,0.02))',
      border: '1px solid var(--border, rgba(255,255,255,0.06))',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim, #8a8f9e)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #e2e4ea)', marginBottom: sub ? 3 : 0 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-dim, #8a8f9e)' }}>{sub}</div>}
    </div>
  );
}

// ─── RISK PROFILE BADGE ──────────────────────────────────────────────────────
function RiskBadge({ profile }: { profile: RiskProfile }) {
  const config = {
    'cash-secured':  { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', label: 'CASH-SECURED' },
    'share-covered': { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', label: 'SHARE-COVERED' },
    'defined':       { bg: 'rgba(99,102,241,0.12)',  color: '#a5b4fc', label: 'DEFINED RISK' },
    'undefined':     { bg: 'rgba(248,113,113,0.12)', color: '#f87171', label: 'UNDEFINED RISK' },
  }[profile];
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 10px', borderRadius: 6,
      background: config.bg,
      border: `1px solid ${config.color}40`,
      fontSize: 9, fontWeight: 700, color: config.color, letterSpacing: 1,
    }}>
      {config.label}
    </span>
  );
}

// ─── STRIKE COMPARISON CARDS ─────────────────────────────────────────────────
// Single-leg only. Shows 5 strike cards (2 below, current, 2 above) with live
// premiums and Greeks. Three sliders (price / IV shift / days forward) let the
// user explore "what would these strikes look like under this scenario." When
// any slider is off default, cards switch from live chain values to BS-projected.

type StrikeComparisonProps = {
  leg: Leg;
  contracts: FlatContract[];
  liveUnderlying: number;
  scenarioPrice: number | null;
  scenarioIvShift: number;          // percent, 0 = no shift
  scenarioDaysFwd: number;
  scenarioActive: boolean;
  setScenarioPrice: (n: number | null) => void;
  setScenarioIvShift: (n: number) => void;
  setScenarioDaysFwd: (n: number) => void;
  resetScenario: () => void;
  onPickStrike: (newStrike: number) => void;
};

function StrikeComparison({
  leg, contracts, liveUnderlying,
  scenarioPrice, scenarioIvShift, scenarioDaysFwd, scenarioActive,
  setScenarioPrice, setScenarioIvShift, setScenarioDaysFwd, resetScenario,
  onPickStrike,
}: StrikeComparisonProps) {
  // ─── Build the 5-strike window centered on the current leg's strike ──
  const windowContracts = useMemo(() => {
    const allStrikes = strikesForExp(contracts, leg.expiration, leg.type);
    if (!allStrikes.length) return [];
    // Find the index of the current strike (or closest if it's not in the list)
    let centerIdx = allStrikes.findIndex(s => Math.abs(s - leg.strike) < 0.005);
    if (centerIdx < 0) {
      centerIdx = allStrikes.reduce((bi, s, i) =>
        Math.abs(s - leg.strike) < Math.abs(allStrikes[bi] - leg.strike) ? i : bi, 0
      );
    }
    // Take 2 below + center + 2 above, with edge fallback
    const start = Math.max(0, Math.min(allStrikes.length - 5, centerIdx - 2));
    const end = Math.min(allStrikes.length, start + 5);
    const slice = allStrikes.slice(start, end);
    return slice.map(strike => {
      const c = findContract(contracts, leg.expiration, strike, leg.type);
      return { strike, contract: c };
    });
  }, [contracts, leg.expiration, leg.type, leg.strike]);

  // ─── Effective scenario price for slider display ──
  const effectivePrice = scenarioPrice != null ? scenarioPrice : liveUnderlying;

  // ─── Slider bounds ──
  // Price: ±25% from live price
  const priceMin = useMemo(() => liveUnderlying * 0.75, [liveUnderlying]);
  const priceMax = useMemo(() => liveUnderlying * 1.25, [liveUnderlying]);
  const priceStep = useMemo(() => Math.max(0.01, liveUnderlying * 0.001), [liveUnderlying]);
  // Days forward: 0 to leg's DTE
  const daysMax = useMemo(() => Math.max(1, leg.dte), [leg.dte]);

  // ─── Compute card values ──
  // When scenario is OFF: use live chain values from each contract
  // When scenario is ON: BS-compute price + Greeks at the scenario inputs
  const cards = useMemo(() => {
    return windowContracts.map(({ strike, contract }) => {
      const isCurrent = Math.abs(strike - leg.strike) < 0.005;
      if (!contract) {
        return {
          strike, isCurrent, available: false,
          bid: 0, ask: 0, theo: 0, delta: 0, theta: 0, iv: 0, pop: 0,
        };
      }
      if (!scenarioActive) {
        // Live values straight from chain
        const liveBid = contract.bid || 0;
        const liveAsk = contract.ask || 0;
        const liveMid = mid(liveBid, liveAsk);
        const liveDelta = contract.delta || 0;
        const liveIV = normIV(contract.volatility || 0);
        return {
          strike, isCurrent, available: true,
          bid: liveBid, ask: liveAsk, theo: liveMid,
          delta: liveDelta,
          theta: contract.theta || 0,
          iv: liveIV,
          pop: Math.max(0, Math.min(1, 1 - Math.abs(liveDelta))),
        };
      }
      // Scenario mode — BS-compute everything
      const baseIV = normIV(contract.volatility || 0);
      const shiftedIV = Math.max(0.0001, baseIV * (1 + scenarioIvShift / 100));
      const remainingDTE = Math.max(0, contract.daysToExpiration - scenarioDaysFwd);
      const T = remainingDTE / 365;
      const theoPrice = bsPrice(effectivePrice, strike, T, shiftedIV, leg.type);
      const greeks = bsGreeks(effectivePrice, strike, T, shiftedIV, leg.type);
      return {
        strike, isCurrent, available: true,
        bid: 0, ask: 0, theo: theoPrice,
        delta: greeks.delta,
        theta: greeks.theta,
        iv: shiftedIV,
        pop: Math.max(0, Math.min(1, 1 - Math.abs(greeks.delta))),
      };
    });
  }, [windowContracts, leg.strike, leg.type, scenarioActive, scenarioIvShift, scenarioDaysFwd, effectivePrice]);

  // ─── Styles ──
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #8a8f9e)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  };
  const sliderRow: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '120px 1fr 110px', gap: 12, alignItems: 'center', marginBottom: 10,
  };
  const sliderLabel: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-dim, #8a8f9e)', fontWeight: 600,
  };
  const sliderValue: React.CSSProperties = {
    fontSize: 12, color: scenarioActive ? '#c4b5fd' : 'var(--text, #e2e4ea)', fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace", textAlign: 'right',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={labelStyle}>
          Strike Comparison · {leg.side === 'SELL' ? 'Short' : 'Long'} {leg.type} · {leg.expiration} ({leg.dte}d)
        </div>
        {scenarioActive && (
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            background: 'rgba(196,181,253,0.12)', border: '1px solid rgba(196,181,253,0.3)',
            fontSize: 9, fontWeight: 700, color: '#c4b5fd', letterSpacing: 1,
          }}>
            THEO · BS-PROJECTED
          </span>
        )}
      </div>

      {/* Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 10, marginBottom: 18,
      }}>
        {cards.map(card => {
          if (!card.available) {
            return (
              <div key={card.strike} style={{
                background: 'var(--input-bg, rgba(255,255,255,0.02))',
                border: '1px dashed var(--border, rgba(255,255,255,0.08))',
                borderRadius: 10, padding: '14px 12px',
                opacity: 0.45, textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-dim, #8a8f9e)', marginBottom: 8 }}>
                  ${card.strike.toFixed(2)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim, #8a8f9e)' }}>No contract</div>
              </div>
            );
          }
          return (
            <button
              key={card.strike}
              onClick={() => onPickStrike(card.strike)}
              style={{
                background: card.isCurrent ? 'rgba(99,102,241,0.10)' : 'var(--input-bg, rgba(255,255,255,0.02))',
                border: card.isCurrent ? '1.5px solid rgba(99,102,241,0.6)' : '1px solid var(--border, rgba(255,255,255,0.08))',
                borderRadius: 10, padding: '14px 12px',
                cursor: card.isCurrent ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                color: 'inherit',
                position: 'relative',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!card.isCurrent) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!card.isCurrent) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border, rgba(255,255,255,0.08))';
                }
              }}
            >
              {card.isCurrent && (
                <div style={{
                  position: 'absolute', top: 6, right: 6,
                  fontSize: 8, fontWeight: 700, color: '#a5b4fc',
                  background: 'rgba(99,102,241,0.15)',
                  padding: '2px 6px', borderRadius: 4, letterSpacing: 0.8,
                }}>
                  SEL
                </div>
              )}
              {/* Strike */}
              <div style={{
                fontSize: 17, fontWeight: 700,
                color: card.isCurrent ? '#a5b4fc' : 'var(--text, #e2e4ea)',
                marginBottom: 10,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                ${card.strike.toFixed(2)}
              </div>
              {/* Premium block */}
              <div style={{ marginBottom: 10 }}>
                {scenarioActive ? (
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-dim, #8a8f9e)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Theo</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#c4b5fd', fontFamily: "'JetBrains Mono', monospace" }}>
                      ${card.theo.toFixed(2)}
                    </div>
                  </div>
                ) : (
                  <>
                    <CardLine label="Bid" value={`$${card.bid.toFixed(2)}`} />
                    <CardLine label="Ask" value={`$${card.ask.toFixed(2)}`} />
                    <CardLine label="Mid" value={`$${card.theo.toFixed(2)}`} accent />
                  </>
                )}
              </div>
              {/* Greeks block */}
              <div style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.06))', paddingTop: 8 }}>
                <CardLine label="Δ" value={card.delta.toFixed(3)} />
                <CardLine label="Θ" value={card.theta.toFixed(3)} />
                <CardLine label="IV" value={`${(card.iv * 100).toFixed(1)}%`} />
                <CardLine label="POP" value={`${(card.pop * 100).toFixed(0)}%`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Sliders */}
      <div style={{
        background: 'var(--input-bg, rgba(255,255,255,0.02))',
        border: '1px solid var(--border, rgba(255,255,255,0.06))',
        borderRadius: 10, padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={labelStyle}>
            Scenario Sliders {scenarioActive && <span style={{ color: '#c4b5fd', fontWeight: 700 }}>· ACTIVE</span>}
          </div>
          {scenarioActive && (
            <button
              onClick={resetScenario}
              style={{
                padding: '5px 12px', borderRadius: 6,
                border: '1px solid var(--border, rgba(255,255,255,0.12))',
                background: 'transparent', color: 'var(--text-dim, #8a8f9e)',
                cursor: 'pointer', fontSize: 10, fontWeight: 600,
              }}
            >
              ↻ Reset all
            </button>
          )}
        </div>

        {/* Underlying price slider */}
        <div style={sliderRow}>
          <span style={sliderLabel}>Underlying</span>
          <input
            type="range"
            min={priceMin}
            max={priceMax}
            step={priceStep}
            value={effectivePrice}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (Math.abs(v - liveUnderlying) < 0.005) {
                setScenarioPrice(null);
              } else {
                setScenarioPrice(v);
              }
            }}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#8b5cf6' }}
          />
          <span style={sliderValue}>${effectivePrice.toFixed(2)}</span>
        </div>

        {/* IV shift slider */}
        <div style={sliderRow}>
          <span style={sliderLabel}>IV shift</span>
          <input
            type="range"
            min={-50}
            max={50}
            step={1}
            value={scenarioIvShift}
            onChange={e => setScenarioIvShift(parseInt(e.target.value, 10))}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#8b5cf6' }}
          />
          <span style={sliderValue}>{scenarioIvShift > 0 ? '+' : ''}{scenarioIvShift}%</span>
        </div>

        {/* Days forward slider */}
        <div style={{ ...sliderRow, marginBottom: 0 }}>
          <span style={sliderLabel}>Days forward</span>
          <input
            type="range"
            min={0}
            max={daysMax}
            step={1}
            value={scenarioDaysFwd}
            onChange={e => setScenarioDaysFwd(parseInt(e.target.value, 10))}
            style={{ width: '100%', cursor: 'pointer', accentColor: '#8b5cf6' }}
          />
          <span style={sliderValue}>+{scenarioDaysFwd}d</span>
        </div>

        {/* Helper text */}
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-dim, #8a8f9e)', lineHeight: 1.5 }}>
          Defaults: live price · 0% IV shift · 0 days forward.
          Cards switch to Black-Scholes projections when any slider is off default.
          Sliders affect <em>cards only</em>; chart, heat map, and metrics stay anchored to the real position.
        </div>
      </div>
    </div>
  );
}

function CardLine({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
      <span style={{ color: 'var(--text-dim, #8a8f9e)' }}>{label}</span>
      <span style={{
        color: accent ? '#a5b4fc' : 'var(--text, #e2e4ea)',
        fontWeight: accent ? 700 : 600,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}
      </span>
    </div>
  );
}

// ─── ENTRY PRICE INPUT ───────────────────────────────────────────────────────
// Per-leg editable fill price. Keeps its own local string state so the user can
// freely delete, retype, use decimals, etc. without the parent clobbering it on
// every keystroke. Commits to parent `onChange` only when parse succeeds AND the
// value is actually different from mid; blur clears the override if the field is
// empty or matches mid.
function EntryPriceInput({
  legId, midPrice, entryOverride, onChange,
}: {
  legId: string;
  midPrice: number;
  entryOverride: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  const hasOverride = entryOverride != null;
  const canonical = hasOverride ? (entryOverride as number).toFixed(2) : midPrice.toFixed(2);

  // Local text state — starts from canonical, syncs when canonical changes from
  // outside (new leg, override cleared, strike swap, etc).
  const [text, setText] = useState(canonical);

  // Re-sync local text when canonical changes AND the user isn't actively editing
  // (we detect that by comparing the parsed local value to canonical — if they
  // match, there's no in-flight edit).
  useEffect(() => {
    const parsed = parseFloat(text);
    // Only overwrite local text if canonical changed and local doesn't already
    // represent the same number — this protects the user's typing.
    if (!isFinite(parsed) || Math.abs(parsed - parseFloat(canonical)) > 0.005) {
      // Canonical changed out from under us — if we're not mid-edit, take it
      setText(canonical);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId, canonical]);

  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (!isFinite(v) || v < 0) {
      // Empty / invalid → clear override, snap back to mid
      onChange(null);
      setText(midPrice.toFixed(2));
      return;
    }
    if (Math.abs(v - midPrice) < 0.005) {
      // Matches mid → clear override (no point storing it)
      onChange(null);
      return;
    }
    onChange(v);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={e => {
          const raw = e.target.value;
          setText(raw);
          // Commit live only if the string parses to a valid number. Empty,
          // trailing dot ("3."), or mid-edit states just update local text.
          if (raw === '' || raw === '.' || raw.endsWith('.')) return;
          const v = parseFloat(raw);
          if (isFinite(v) && v >= 0) {
            if (Math.abs(v - midPrice) < 0.005) {
              onChange(null);
            } else {
              onChange(v);
            }
          }
        }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        style={{
          background: hasOverride ? 'rgba(234,179,8,0.06)' : 'var(--input-bg, #1e2028)',
          border: hasOverride ? '1px solid rgba(234,179,8,0.35)' : '1px solid var(--border, rgba(255,255,255,0.08))',
          color: hasOverride ? '#eab308' : '#a5b4fc',
          borderRadius: 6, padding: '4px 6px', fontSize: 11,
          fontWeight: 700, outline: 'none', width: 62, textAlign: 'right',
          fontFamily: 'inherit',
        }}
        title={hasOverride ? 'Manual fill — click ↻ to reset to mid' : 'Defaults to mid · edit to set your actual fill'}
      />
      {hasOverride && (
        <button
          onClick={() => { onChange(null); setText(midPrice.toFixed(2)); }}
          title="Reset to mid"
          style={{
            padding: '2px 5px', borderRadius: 4, border: 'none',
            background: 'rgba(234,179,8,0.12)', color: '#eab308',
            cursor: 'pointer', fontSize: 10, lineHeight: 1,
          }}
        >
          ↻
        </button>
      )}
    </div>
  );
}
