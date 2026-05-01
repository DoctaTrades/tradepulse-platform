#!/usr/bin/env python3
"""
TradePulse: PlayBuilder canvas theme-awareness fix (rebuilt for post-grey-sweep state).

Canvas's fillStyle/strokeStyle do NOT understand CSS variables. The earlier
semantic colors and grey sweep patches transformed values to var() syntax,
which broke canvas rendering (silent fallback to nothing visible).

This patch adds a small helper at the top of each canvas render effect that
reads CSS variable values into local JS strings via getComputedStyle.
Then every canvas style assignment uses those resolved strings.

Verified all 21 needle strings are unique in the current source before applying.
"""

import sys
from pathlib import Path

PATH = Path("app/modules/playbuilder/PlayBuilderModule.tsx")
if not PATH.exists():
    print(f"ERROR: {PATH} not found.", file=sys.stderr)
    sys.exit(1)

src = PATH.read_text()

def replace_once(needle, replacement, label):
    global src
    count = src.count(needle)
    if count != 1:
        print(f"FAIL [{label}]: expected 1 match, found {count}", file=sys.stderr)
        sys.exit(1)
    src = src.replace(needle, replacement)
    print(f"OK   [{label}]")

# Theme-aware helper inserted at the top of each canvas render
HELPER = '''    // Theme-aware colors for canvas (CSS vars don't work in fillStyle/strokeStyle)
    const cs = getComputedStyle(document.documentElement);
    const isDark = (document.documentElement.dataset.theme || 'dark') !== 'light';
    const successRgb = (cs.getPropertyValue('--tp-success-rgb') || '74,222,128').trim();
    const dangerRgb  = (cs.getPropertyValue('--tp-danger-rgb')  || '248,113,113').trim();
    const accentRgb  = (cs.getPropertyValue('--tp-accent-rgb')  || '99,102,241').trim();
    const successHex = (cs.getPropertyValue('--tp-success')     || '#4ade80').trim();
    const dangerHex  = (cs.getPropertyValue('--tp-danger')      || '#f87171').trim();
    const warningHex = (cs.getPropertyValue('--tp-warning')     || '#eab308').trim();
    const accentLightHex = (cs.getPropertyValue('--tp-accent-light') || '#a5b4fc').trim();
    const textHex    = (cs.getPropertyValue('--tp-text')        || '#e2e4ea').trim();
    const mutedHex   = (cs.getPropertyValue('--tp-muted')       || '#a8acb8').trim();
    // Theme-aware tooltip + gridline colors
    const tooltipBg     = isDark ? 'rgba(20,22,30,0.95)' : 'rgba(255,255,255,0.97)';
    const tooltipBorder = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
    const gridlineFaint = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const crosshairLine = isDark ? 'rgba(255,255,255,0.3)'  : 'rgba(0,0,0,0.25)';
    const hoverBoxLine  = isDark ? 'rgba(255,255,255,0.4)'  : 'rgba(0,0,0,0.3)';
    const currentPriceLine = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
    const payoffStrokeFaint = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
'''

# ============================================================
#   STEP 1 — Insert helper at top of payoff render effect
# ============================================================
payoff_anchor = '''    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Padding for axes
    const padL = 56, padR = 16, padT = 14, padB = 28;'''

payoff_replacement = f'''    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

{HELPER}
    // Padding for axes
    const padL = 56, padR = 16, padT = 14, padB = 28;'''

replace_once(payoff_anchor, payoff_replacement, "payoff helper insert")

# ============================================================
#   STEP 2 — Insert helper at top of heatmap render effect
# ============================================================
heatmap_anchor = '''    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padL = 56, padR = 16, padT = 14, padB = 28;
    const W = width - padL - padR;
    const H = height - padT - padB;
    const { cells, rows, cols, absMax } = grid;'''

heatmap_replacement = f'''    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

{HELPER}
    const padL = 56, padR = 16, padT = 14, padB = 28;
    const W = width - padL - padR;
    const H = height - padT - padB;
    const {{ cells, rows, cols, absMax }} = grid;'''

replace_once(heatmap_anchor, heatmap_replacement, "heatmap helper insert")

# ============================================================
#   STEP 3 — Replace all 21 broken canvas styles
# ============================================================

# --- Payoff: 1σ/2σ bands ---
replace_once(
    "        ctx.fillStyle = 'rgba(var(--tp-accent-rgb), 0.05)';",
    "        ctx.fillStyle = `rgba(${accentRgb}, 0.05)`;",
    "payoff: 2σ band fill"
)
replace_once(
    "        ctx.fillStyle = 'rgba(var(--tp-accent-rgb), 0.08)';",
    "        ctx.fillStyle = `rgba(${accentRgb}, 0.08)`;",
    "payoff: 1σ band fill"
)
replace_once(
    "      ctx.strokeStyle = 'rgba(var(--tp-accent-rgb), 0.35)';",
    "      ctx.strokeStyle = `rgba(${accentRgb}, 0.35)`;",
    "payoff: sigma boundary"
)

# --- Payoff: profit/loss fills ---
replace_once(
    "    drawFill(true,  'rgba(var(--tp-success-rgb), 0.18)');   // profit (green)",
    "    drawFill(true,  `rgba(${successRgb}, 0.18)`);   // profit (green)",
    "payoff: profit fill"
)
replace_once(
    "    drawFill(false, 'rgba(var(--tp-danger-rgb), 0.18)');  // loss (red)",
    "    drawFill(false, `rgba(${dangerRgb}, 0.18)`);  // loss (red)",
    "payoff: loss fill"
)

# --- Payoff: zero line (uses comment for unique match) ---
replace_once(
    "    // ─── Zero line ──\n    const yZero = yFor(0);\n    ctx.strokeStyle = 'rgba(255,255,255,0.18)';",
    "    // ─── Zero line ──\n    const yZero = yFor(0);\n    ctx.strokeStyle = payoffStrokeFaint;",
    "payoff: zero line"
)

# --- Payoff: payoff curve, strike markers, breakevens ---
replace_once(
    "    ctx.strokeStyle = 'var(--tp-accent-light)';",
    "    ctx.strokeStyle = accentLightHex;",
    "payoff: curve stroke"
)
replace_once(
    "      ctx.strokeStyle = leg.side === 'SELL' ? 'rgba(var(--tp-success-rgb), 0.5)' : 'rgba(var(--tp-danger-rgb), 0.5)';",
    "      ctx.strokeStyle = leg.side === 'SELL' ? `rgba(${successRgb}, 0.5)` : `rgba(${dangerRgb}, 0.5)`;",
    "payoff: strike markers"
)
replace_once(
    "      ctx.strokeStyle = 'var(--tp-warning)';",
    "      ctx.strokeStyle = warningHex;",
    "payoff: BE line stroke"
)
replace_once(
    "      ctx.fillStyle = 'var(--tp-warning)';",
    "      ctx.fillStyle = warningHex;",
    "payoff: BE label fill"
)

# --- Payoff: current price marker (block replacement) ---
replace_once(
    "      ctx.strokeStyle = '#ffffff';\n      ctx.lineWidth = 1.5;\n      ctx.beginPath();\n      ctx.moveTo(xCur, padT);\n      ctx.lineTo(xCur, padT + H);\n      ctx.stroke();\n      ctx.fillStyle = '#ffffff';",
    "      ctx.strokeStyle = textHex;\n      ctx.lineWidth = 1.5;\n      ctx.beginPath();\n      ctx.moveTo(xCur, padT);\n      ctx.lineTo(xCur, padT + H);\n      ctx.stroke();\n      ctx.fillStyle = textHex;",
    "payoff: current price marker"
)

# --- Payoff: Y-axis labels (uses comment for unique match) ---
replace_once(
    "    // ─── Y-axis labels (P/L) ──\n    ctx.fillStyle = 'var(--tp-muted)';",
    "    // ─── Y-axis labels (P/L) ──\n    ctx.fillStyle = mutedHex;",
    "payoff: Y-axis labels"
)

# --- Payoff: gridline ---
replace_once(
    "      ctx.strokeStyle = 'rgba(255,255,255,0.04)';",
    "      ctx.strokeStyle = gridlineFaint;",
    "payoff: gridline"
)

# --- Payoff: hover crosshair (block) ---
replace_once(
    "      ctx.strokeStyle = 'rgba(255,255,255,0.3)';\n      ctx.lineWidth = 1;\n      ctx.setLineDash([2, 2]);\n      ctx.beginPath();\n      ctx.moveTo(hover.x, padT);\n      ctx.lineTo(hover.x, padT + H);",
    "      ctx.strokeStyle = crosshairLine;\n      ctx.lineWidth = 1;\n      ctx.setLineDash([2, 2]);\n      ctx.beginPath();\n      ctx.moveTo(hover.x, padT);\n      ctx.lineTo(hover.x, padT + H);",
    "payoff: hover crosshair"
)

# --- Payoff: hover tooltip block ---
replace_once(
    "      ctx.fillStyle = 'rgba(20,22,30,0.95)';\n      ctx.strokeStyle = 'rgba(255,255,255,0.18)';\n      ctx.lineWidth = 1;\n      ctx.beginPath();\n      ctx.rect(tx, ty, tw, 36);\n      ctx.fill();\n      ctx.stroke();\n      ctx.fillStyle = 'var(--tp-text)';\n      ctx.textAlign = 'left';\n      ctx.fillText(txt1, tx + 8, ty + 14);\n      ctx.fillStyle = hover.pnl >= 0 ? 'var(--tp-success)' : 'var(--tp-danger)';\n      ctx.fillText(txt2, tx + 8, ty + 28);",
    "      ctx.fillStyle = tooltipBg;\n      ctx.strokeStyle = tooltipBorder;\n      ctx.lineWidth = 1;\n      ctx.beginPath();\n      ctx.rect(tx, ty, tw, 36);\n      ctx.fill();\n      ctx.stroke();\n      ctx.fillStyle = textHex;\n      ctx.textAlign = 'left';\n      ctx.fillText(txt1, tx + 8, ty + 14);\n      ctx.fillStyle = hover.pnl >= 0 ? successHex : dangerHex;\n      ctx.fillText(txt2, tx + 8, ty + 28);",
    "payoff: hover tooltip"
)

# --- Heatmap: cell fills ---
replace_once(
    "        if (v >= 0) {\n          ctx.fillStyle = `rgba(74,222,128,${intensity})`;\n        } else {\n          ctx.fillStyle = `rgba(248,113,113,${intensity})`;\n        }",
    "        if (v >= 0) {\n          ctx.fillStyle = `rgba(${successRgb},${intensity})`;\n        } else {\n          ctx.fillStyle = `rgba(${dangerRgb},${intensity})`;\n        }",
    "heatmap: cell fills"
)

# --- Heatmap: axis labels (uses comment for unique match) ---
replace_once(
    "    // Axes\n    ctx.fillStyle = 'var(--tp-muted)';",
    "    // Axes\n    ctx.fillStyle = mutedHex;",
    "heatmap: axis labels"
)

# --- Heatmap: current-price guide ---
replace_once(
    "      ctx.strokeStyle = 'rgba(255,255,255,0.5)';",
    "      ctx.strokeStyle = currentPriceLine;",
    "heatmap: price guide"
)

# --- Heatmap: today label (uses comment for unique match) ---
replace_once(
    "    // \"Today\" label on the top edge\n    ctx.fillStyle = 'var(--tp-accent-light)';",
    "    // \"Today\" label on the top edge\n    ctx.fillStyle = accentLightHex;",
    "heatmap: today label"
)

# --- Heatmap: hover crosshair ---
replace_once(
    "      ctx.strokeStyle = 'rgba(255,255,255,0.4)';",
    "      ctx.strokeStyle = hoverBoxLine;",
    "heatmap: hover crosshair"
)

# --- Heatmap: hover tooltip block ---
replace_once(
    "      ctx.fillStyle = 'rgba(20,22,30,0.95)';\n      ctx.strokeStyle = 'rgba(255,255,255,0.18)';\n      ctx.lineWidth = 1;\n      ctx.beginPath();\n      ctx.rect(tx, ty, tw, 36);\n      ctx.fill();\n      ctx.stroke();\n      ctx.fillStyle = 'var(--tp-text)';\n      ctx.textAlign = 'left';\n      ctx.fillText(t1, tx + 8, ty + 14);\n      ctx.fillStyle = hover.pnl >= 0 ? 'var(--tp-success)' : 'var(--tp-danger)';\n      ctx.fillText(t2, tx + 8, ty + 28);",
    "      ctx.fillStyle = tooltipBg;\n      ctx.strokeStyle = tooltipBorder;\n      ctx.lineWidth = 1;\n      ctx.beginPath();\n      ctx.rect(tx, ty, tw, 36);\n      ctx.fill();\n      ctx.stroke();\n      ctx.fillStyle = textHex;\n      ctx.textAlign = 'left';\n      ctx.fillText(t1, tx + 8, ty + 14);\n      ctx.fillStyle = hover.pnl >= 0 ? successHex : dangerHex;\n      ctx.fillText(t2, tx + 8, ty + 28);",
    "heatmap: hover tooltip"
)

# ============================================================
#   VERIFICATION
# ============================================================
print()
print("=" * 60)
print("VERIFICATION")
print("=" * 60)

import re
broken = re.findall(r"ctx\.(fillStyle|strokeStyle)\s*=\s*'[^']*var\(--[^']*'", src)
if broken:
    print(f"⚠ {len(broken)} canvas styles still using var() syntax")
else:
    print("✓ Zero canvas styles still using var() syntax")

PATH.write_text(src)
print("\nDONE.")
