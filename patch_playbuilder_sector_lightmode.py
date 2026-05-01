#!/usr/bin/env python3
"""
TradePulse: Fix PlayBuilder and Sector Explorer light-mode issues.

Issue 1 (Sector Explorer): Cards used hardcoded rgba and hex values that
were tuned for dark mode only. In light mode the tints became near-invisible.
Fix: migrate the color helpers to use theme-aware CSS variables.

Issue 2 (PlayBuilder): Used var() with hardcoded fallbacks pointing at
non-existent variable names (--panel-bg, --input-bg). The fallback values
silently took over, locking PlayBuilder to dark backgrounds in any mode.
Fix: rename to the actual variables (--shell-panel, --shell-input) and
remove fallbacks so future broken var names fail visibly.
"""

import sys
from pathlib import Path

# ============================================================
#   PART 1 — PlayBuilder
# ============================================================
PB_PATH = Path("app/modules/playbuilder/PlayBuilderModule.tsx")
if not PB_PATH.exists():
    print(f"ERROR: {PB_PATH} not found.", file=sys.stderr)
    sys.exit(1)

pb = PB_PATH.read_text()

# Critical fixes: rename broken var names AND remove fallbacks for ALL var(--X, ...) patterns.
# Strategy: regex-match `var(--name, anything)` and replace with `var(--correct-name)`.
# Map of var name → correct name (or same name if it just needs fallback removed).
import re

VAR_REWRITES = {
    "panel-bg":   "shell-panel",     # broken — points at non-existent var
    "input-bg":   "shell-input",     # broken — points at non-existent var
    "text":       "text",            # exists, just remove fallback
    "text-dim":   "text-dim",        # exists, just remove fallback
    "border":     "border",          # exists, just remove fallback
}

def rewrite_var(match):
    var_name = match.group(1)
    if var_name in VAR_REWRITES:
        return f"var(--{VAR_REWRITES[var_name]})"
    # Unknown var with fallback — leave alone
    return match.group(0)

# Match var(--NAME, any-fallback) — fallback can include nested parens
# We use a non-greedy approach: capture var name, then everything until matching close paren.
# Since fallbacks can contain rgba(...), we need to handle 1 level of nested parens.
def replace_vars_with_fallbacks(src):
    pattern = re.compile(r"var\(--([a-z][a-z0-9-]*)\s*,\s*(?:[^()]|\([^()]*\))*\)")
    return pattern.sub(rewrite_var, src)

before = pb
pb = replace_vars_with_fallbacks(pb)
pb_total = before.count("var(--") - pb.count("var(--, ")  # rough delta
# Actually just count fallback patterns before/after
before_falls = len(re.findall(r"var\(--[a-z-]+\s*,", before))
after_falls = len(re.findall(r"var\(--[a-z-]+\s*,", pb))
pb_total = before_falls - after_falls

print(f"OK   [PlayBuilder]: {pb_total} fallback-comma var() patterns rewritten")
print(f"     (panel-bg → shell-panel, input-bg → shell-input, others: fallback removed)")

PB_PATH.write_text(pb)
print(f"PlayBuilder: {pb_total} total replacements\n")

# ============================================================
#   PART 2 — Sector Explorer
# ============================================================
SE_PATH = Path("app/modules/sectors/SectorExplorerModule.tsx")
if not SE_PATH.exists():
    print(f"ERROR: {SE_PATH} not found.", file=sys.stderr)
    sys.exit(1)

se = SE_PATH.read_text()

# Replace the entire color helpers block with theme-aware versions.
old_block = '''function stratColor(s: string) {
  if (s === '2U') return 'var(--tp-success)';
  if (s === '2D') return 'var(--tp-danger)';
  if (s === '3') return '#facc15';
  if (s === '1') return '#94a3b8';
  return '#64748b';
}

function stratBg(s: string) {
  if (s === '2U') return 'rgba(var(--tp-success-rgb), 0.12)';
  if (s === '2D') return 'rgba(var(--tp-danger-rgb), 0.12)';
  if (s === '3') return 'rgba(250,204,21,0.12)';
  if (s === '1') return 'rgba(148,163,184,0.08)';
  return 'rgba(100,116,139,0.08)';
}

function perfColor(val: number) {
  if (val > 2) return '#22c55e';
  if (val > 0.5) return 'var(--tp-success)';
  if (val > 0) return '#86efac';
  if (val > -0.5) return '#fca5a5';
  if (val > -2) return 'var(--tp-danger)';
  return '#ef4444';
}

function perfBg(val: number, intensity = 1) {
  const abs = Math.min(Math.abs(val), 5);
  const alpha = Math.round((abs / 5) * 40 * intensity + 5);
  if (val >= 0) return `rgba(74,222,128,0.${String(alpha).padStart(2, '0')})`;
  return `rgba(248,113,113,0.${String(alpha).padStart(2, '0')})`;
}

function rsiColor(rsi: number) {
  if (rsi >= 70) return '#ef4444';
  if (rsi >= 60) return '#f59e0b';
  if (rsi <= 30) return '#22c55e';
  if (rsi <= 40) return 'var(--tp-success)';
  return 'var(--text-mid)';
}'''

new_block = '''function stratColor(s: string) {
  if (s === '2U') return 'var(--tp-success)';
  if (s === '2D') return 'var(--tp-danger)';
  if (s === '3') return 'var(--tp-warning)';
  if (s === '1') return 'var(--text-dim)';
  return 'var(--text-dim)';
}

function stratBg(s: string) {
  if (s === '2U') return 'rgba(var(--tp-success-rgb), 0.14)';
  if (s === '2D') return 'rgba(var(--tp-danger-rgb), 0.14)';
  if (s === '3') return 'rgba(var(--tp-warning-rgb), 0.14)';
  if (s === '1') return 'var(--shell-card)';
  return 'var(--shell-card)';
}

function perfColor(val: number) {
  // Strong moves use full saturation; weak moves use the same color at lower alpha.
  // Both theme-aware. Light/dark modes get appropriate base color via the var.
  if (val > 2) return 'var(--tp-success)';
  if (val > 0.5) return 'var(--tp-success)';
  if (val > 0) return 'rgba(var(--tp-success-rgb), 0.65)';
  if (val > -0.5) return 'rgba(var(--tp-danger-rgb), 0.65)';
  if (val > -2) return 'var(--tp-danger)';
  return 'var(--tp-danger)';
}

function perfBg(val: number, intensity = 1) {
  // Alpha scales 0.08 → 0.40 with magnitude (max at 5%+).
  // Bumped from old 0.05–0.45 range to ensure visibility on white in light mode.
  const abs = Math.min(Math.abs(val), 5);
  const alpha = (0.08 + (abs / 5) * 0.32 * intensity).toFixed(2);
  if (val >= 0) return `rgba(var(--tp-success-rgb), ${alpha})`;
  return `rgba(var(--tp-danger-rgb), ${alpha})`;
}

function rsiColor(rsi: number) {
  if (rsi >= 70) return 'var(--tp-danger)';
  if (rsi >= 60) return 'var(--tp-warning)';
  if (rsi <= 30) return 'var(--tp-success)';
  if (rsi <= 40) return 'var(--tp-success)';
  return 'var(--text-mid)';
}'''

if old_block not in se:
    print("FAIL [Sector Explorer]: helper block not found verbatim — file may have been modified", file=sys.stderr)
    sys.exit(1)

se = se.replace(old_block, new_block)
print("OK   [Sector Explorer]: 5 color helpers refactored to theme-aware")

# Also update the drillColor fallback near line 124 (was '#3b82f6')
old_drill = "setDrillColor(data.color || '#3b82f6');"
new_drill = "setDrillColor(data.color || 'var(--tp-info)');"
if old_drill in se:
    se = se.replace(old_drill, new_drill)
    print("OK   [Sector Explorer]: drillColor fallback themed")
else:
    print("SKIP [Sector Explorer]: drillColor fallback not found verbatim")

SE_PATH.write_text(se)

print("\nDONE.")
