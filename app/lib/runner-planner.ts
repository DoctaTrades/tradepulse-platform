// Runner Planner math — pure functions, no UI.
// Used by RiskCalculator's partial-exit planning tool.
//
// Concept:
//   You take a trade with N contracts (or shares) and a stop. You want to
//   close X contracts at a T1 target such that realized profit covers your
//   total dollar risk, leaving (N - X) as risk-free runners.
//
// All math here is unit-agnostic: pass `pointValue = 1` for stocks (where
// price moves are in dollars), or pass real point values for futures
// (e.g. MES = $5/point).

export type ScenarioRow = {
  t1Distance: number;        // points (or dollars for stocks)
  rMultiple: number;         // T1 distance in R units (T1 / stop)
  t1Price: number;           // entry ± t1Distance
  contractsToClose: number;  // 0 = insufficient, else # to close at T1
  runners: number;           // contracts remaining after T1
  runnerPct: number;         // runners / N (0..1)
  insufficient: boolean;     // true when X >= N (can't recover risk)
  isMin: boolean;            // first row where runners >= 1
  isIdeal: boolean;          // first row where 0.30 <= runnerPct <= 0.60
};

export type RunnerPlannerInput = {
  contracts: number;
  stopDistance: number;       // points or dollars
  pointValue: number;         // 1 for stocks, e.g. 5 for MES
  commissionPerContract: number;  // round-trip dollars
  entry: number;
  direction: 'Long' | 'Short';
  tickSize?: number;          // optional — snaps t1Price to tick increments (e.g. 0.25 for MES)
};

// Default T1 multipliers as fractions of stop distance (R-multiples).
// 16 candidates, balanced between aggressive and conservative scale-outs.
export const DEFAULT_T1_MULTIPLIERS = [
  0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25,
  2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0, 5.0
];

export function totalRisk(input: RunnerPlannerInput): number {
  const { contracts, stopDistance, pointValue, commissionPerContract } = input;
  const stopRisk = stopDistance * pointValue * contracts;
  const commissions = commissionPerContract * contracts;
  return stopRisk + commissions;
}

export function buildScenarios(input: RunnerPlannerInput, multipliers: number[] = DEFAULT_T1_MULTIPLIERS): ScenarioRow[] {
  const { contracts, stopDistance, pointValue, entry, direction } = input;
  const R = totalRisk(input);

  const rows: ScenarioRow[] = multipliers.map(mult => {
    const t1Distance = stopDistance * mult;
    const profitPerContract = t1Distance * pointValue;
    let contractsToClose = 0;
    let insufficient = false;

    if (profitPerContract <= 0) {
      insufficient = true;
    } else {
      const xMin = Math.ceil(R / profitPerContract);
      if (xMin >= contracts) {
        insufficient = true;
      } else {
        contractsToClose = xMin;
      }
    }

    const runners = insufficient ? 0 : contracts - contractsToClose;
    const runnerPct = contracts > 0 ? runners / contracts : 0;
    let t1Price = direction === 'Long' ? entry + t1Distance : entry - t1Distance;
    if (input.tickSize && input.tickSize > 0) {
      t1Price = Math.round(t1Price / input.tickSize) * input.tickSize;
    }

    return {
      t1Distance,
      rMultiple: mult,
      t1Price,
      contractsToClose,
      runners,
      runnerPct,
      insufficient,
      isMin: false,
      isIdeal: false,
    };
  });

  // Tag first row with at least 1 runner as "Min"
  const minIdx = rows.findIndex(r => !r.insufficient && r.runners >= 1);
  if (minIdx >= 0) rows[minIdx].isMin = true;

  // Tag first row where runners are 30-60% of position as "Ideal"
  const idealIdx = rows.findIndex(r => !r.insufficient && r.runnerPct >= 0.30 && r.runnerPct <= 0.60);
  if (idealIdx >= 0) rows[idealIdx].isIdeal = true;

  return rows;
}

// ─── EV Analysis ─────────────────────────────────────────────────────────────

export type EVResult = {
  fullWinProfit: number;     // T1 hit + runners reach T2
  partialWinProfit: number;  // T1 hit, runners scratch (entry exit)
  fullLossAmount: number;    // stopped before T1 (always negative)
  perWinRate: { winRate: number; ev: number; per100: number }[];
};

export type EVOptions = {
  runnerFollowthroughRate?: number;  // default 0.5 — % of T1 hits where runners reach T2
  winRates?: number[];                // default [0.3, 0.4, 0.5, 0.6, 0.7]
  t2Multiple?: number;                // default 2 — T2 = T1 distance × this
};

export function evAnalysis(row: ScenarioRow, input: RunnerPlannerInput, opts: EVOptions = {}): EVResult {
  const followThrough = opts.runnerFollowthroughRate ?? 0.5;
  const winRates = opts.winRates ?? [0.3, 0.4, 0.5, 0.6, 0.7];
  const t2Mult = opts.t2Multiple ?? 2;

  const { pointValue, commissionPerContract } = input;
  const totalCommission = commissionPerContract * input.contracts;

  // Profit when both T1 and T2 hit:
  // closed contracts × T1 distance × point value
  // + runners × (T1 distance × t2Mult) × point value
  // - all commissions
  const t1Profit = row.contractsToClose * row.t1Distance * pointValue;
  const t2Distance = row.t1Distance * t2Mult;
  const runnerProfit = row.runners * t2Distance * pointValue;
  const fullWinProfit = t1Profit + runnerProfit - totalCommission;

  // Partial: T1 hits, runners exit at scratch
  const partialWinProfit = t1Profit - totalCommission;

  // Full loss: entire position stopped
  const fullLossAmount = -totalRisk(input);

  const perWinRate = winRates.map(wr => {
    const pFullWin = wr * followThrough;
    const pPartial = wr * (1 - followThrough);
    const pLoss = 1 - wr;
    const ev = pFullWin * fullWinProfit + pPartial * partialWinProfit + pLoss * fullLossAmount;
    return { winRate: wr, ev, per100: ev * 100 };
  });

  return { fullWinProfit, partialWinProfit, fullLossAmount, perWinRate };
}
