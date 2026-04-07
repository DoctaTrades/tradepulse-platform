'use client';

/**
 * PlayBuilderModule — Session 2
 *
 * Standalone module for designing options strategies before placing them.
 * Live ticker → chain load → strategy auto-pick → editable legs → real-time metrics + payoff chart.
 *
 * Session 1:
 *  - Ticker input + live chain loading via /api/schwab/options
 *  - Editable leg table, metrics panel (Greeks, max P/L, breakevens, RoR, POP)
 *  - 4 strategies wired: CSP, Covered Call, Bull Put, Bear Call
 *  - Save to Journal stubbed
 *
 * Session 2 adds:
 *  - Canvas payoff-at-expiration chart (±30% auto-widen, breakeven lines, current price marker)
 *  - 1σ / 2σ expected-move bands overlaid on the chart
 *  - 4 more strategies wired: Iron Condor, Iron Butterfly, PMCC, Straddle (under "Custom" chip)
 *  - Layout restructure: chart sits full-width below the legs/metrics row
 *
 * Session 3 will add: P&L heat map, theta decay projection, Diagonal,
 * Calendar Press (custom logic), Screener / SPX Radar / Journal event wiring.
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
  { id:'diagonal',      name:'Diagonal Spread',        shortName:'Diagonal',    category:'leveraged',   legs:2, enabled:false, description:'Different strikes + different expiries' },
  { id:'calendar_press',name:'Calendar Press',         shortName:'CalPress',    category:'custom',      legs:2, enabled:false, description:'Long-dated put + weekly short puts (custom)' },
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

// ─── UTIL: math ──────────────────────────────────────────────────────────────
const mid = (bid: number, ask: number) => {
  if (!bid && !ask) return 0;
  if (!bid) return ask;
  if (!ask) return bid;
  return (bid + ask) / 2;
};

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
  const m = mid(leg.bid, leg.ask);
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
  let netCredit = 0;
  let nDelta = 0, nGamma = 0, nTheta = 0, nVega = 0;
  for (const l of legs) {
    const m = mid(l.bid, l.ask);
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
      capitalRequired = isFinite(maxLoss) ? maxLoss : Math.abs(Math.min(netCredit, 0));
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

// ─── PAYOFF CHART ────────────────────────────────────────────────────────────
type PayoffChartProps = {
  samples: PayoffSample[];
  underlying: number;
  breakevens: number[];
  expectedMove: { sigma1: number; sigma2: number } | null;
  legs: Leg[];
  height?: number;
};

function PayoffChart({ samples, underlying, breakevens, expectedMove, legs, height = 320 }: PayoffChartProps) {
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

    // ─── Payoff curve ──
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
  }, [samples, width, height, underlying, breakevens, expectedMove, legs, hover]);

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

  // Underlying price (fall back to underlying.last if needed)
  const underlying = useMemo(() => {
    if (!chain) return 0;
    return chain.underlyingPrice || chain.underlying?.last || 0;
  }, [chain]);

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

  // Available expirations & strike lists for dropdowns
  const expirations = useMemo(() => uniqueExpirations(contracts), [contracts]);

  // Save to Journal — STUBBED for Session 1
  const saveToJournal = useCallback(() => {
    if (!legs.length) {
      showToast('No legs to save');
      return;
    }
    const payload = {
      ticker,
      strategy,
      strategyName: STRATEGIES.find(s => s.id === strategy)?.name || 'Custom',
      underlying,
      legs,
      metrics: {
        netCredit: metrics.netCredit,
        maxProfit: metrics.maxProfit,
        maxLoss: metrics.maxLoss,
        breakevens: metrics.breakevens,
        pop: metrics.pop,
        ror: metrics.ror,
        capitalRequired: metrics.capitalRequired,
      },
      timestamp: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.log('[PlayBuilder] Save to Journal payload:', payload);
    showToast('Save to Journal — stubbed (logged to console). Wiring in a later session.');
  }, [legs, ticker, strategy, underlying, metrics, showToast]);

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
                    <th style={thStyle}>Δ</th>
                    <th style={thStyle}>Θ</th>
                    <th style={thStyle}>IV</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map(leg => {
                    const strikeOptions = strikesForExp(contracts, leg.expiration, leg.type);
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
                              <option key={exp} value={exp}>{exp} ({dte}d)</option>
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
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#a5b4fc' }}>{fmtNum(mid(leg.bid, leg.ask))}</td>
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
          <div style={label}>Metrics</div>
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
              <LegendDot color="#a5b4fc" label="P/L curve" />
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
            underlying={underlying}
            breakevens={metrics.breakevens}
            expectedMove={expectedMove}
            legs={legs}
            height={340}
          />
        </div>
      )}

      {/* ACTIONS */}
      <div style={{ ...panel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim, #8a8f9e)' }}>
          Coming in Session 3: P&amp;L heat map, theta decay projection, Diagonal &amp; Calendar Press, Save-to-Journal wiring.
        </div>
        <button
          onClick={saveToJournal}
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
          Save to Journal (stub)
        </button>
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
