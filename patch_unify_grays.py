#!/usr/bin/env python3
"""
TradePulse theme unification — Category 2.

Migrates System A (--text, --text-mid, --text-dim, --border, --border2)
to use the same gray values as System B/C. This makes Screener,
PlayBuilder, DeepDive, Sectors, Calendar, MarketPulse visually
consistent with the Journal module.

Changes are value-only in globals.css — no JS or JSX is touched.
"""

import sys
from pathlib import Path

CSS_PATH = Path("app/globals.css")

if not CSS_PATH.exists():
    print(f"ERROR: {CSS_PATH} not found. Run from project root.", file=sys.stderr)
    sys.exit(1)

src = CSS_PATH.read_text()

def replace_once(needle, replacement, label):
    global src
    count = src.count(needle)
    if count != 1:
        print(f"FAIL [{label}]: expected 1 match, found {count}", file=sys.stderr)
        sys.exit(1)
    src = src.replace(needle, replacement)
    print(f"OK   [{label}]")

# ============================================================
#   DARK MODE — :root, [data-theme="dark"]
# ============================================================
# Border alphas: 0.07 → 0.06 (match System B)
replace_once(
    '  --border: rgba(255, 255, 255, 0.07);\n'
    '  --border2: rgba(255, 255, 255, 0.12);',
    '  --border: rgba(255, 255, 255, 0.06);\n'
    '  --border2: rgba(255, 255, 255, 0.10);',
    "dark borders → System B alphas"
)

# Primary text: #e2e8f0 (Tailwind slate-200) → #e2e4ea (System B's warm white)
replace_once(
    '  --text: #e2e8f0;\n  --text-dim: #64748b;\n  --text-mid: #94a3b8;',
    '  --text: #e2e4ea;\n  --text-dim: #a8acb8;\n  --text-mid: #c8cad0;',
    "dark text shades → System B warm grays"
)

# ============================================================
#   LIGHT MODE — [data-theme="light"]
# ============================================================
# Light mode is mostly already aligned. Only --text-dim differs:
# System A: #6b7280, System B (post-bump): #525866
# Bring System A in line with the post-bump System B value.
replace_once(
    '  --text: #1a1a2e;\n  --text-dim: #6b7280;\n  --text-mid: #374151;',
    '  --text: #1a1a2e;\n  --text-dim: #525866;\n  --text-mid: #374151;',
    "light text-dim → System B post-bump value"
)

# Light borders are already identical, no change needed.

CSS_PATH.write_text(src)
print("\nDONE. System A grays now match System B/C.")
