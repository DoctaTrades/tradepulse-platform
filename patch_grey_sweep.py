#!/usr/bin/env python3
"""
TradePulse Category A grey sweep.

Replaces 132 hardcoded grey/background hex literals across the codebase
with the appropriate CSS variable. This makes those colors theme-aware
(automatically switching between dark/light mode) and consolidates all
gray decisions into globals.css.

Replaces only EXACT-MATCH quoted hex literals — does not touch:
  - Hex codes inside gradient strings
  - Hex codes inside SVG fill="..." / stroke="..." attributes (some)
  - Semantic accent colors (pink, purple, cyan markers — intentional)
  - PDF export white backgrounds
  - Sector chart palettes
"""

import sys
import re
from pathlib import Path

# ============================================================
#   REPLACEMENT MAP
# ============================================================
# hex_literal → var() target
REPLACEMENTS = {
    # Gray dark — old pre-bump values
    "#5c6070": "var(--tp-faint)",
    "#8a8f9e": "var(--tp-muted)",
    "#9ca3af": "var(--tp-faint)",
    "#6b7080": "var(--tp-faint)",
    "#6b7280": "var(--tp-muted)",
    # Gray medium / light
    "#b0b5c4": "var(--tp-text2)",
    "#374151": "var(--tp-text2)",
    "#cdd1dc": "var(--tp-text2)",
    "#d1d5db": "var(--tp-faintest)",
    "#4b5563": "var(--tp-muted)",
    # Primary text shade hardcodes
    "#1a1a2e": "var(--tp-text)",
    "#e2e4ea": "var(--tp-text)",
    "#e2e8f0": "var(--tp-text)",
    # Dark backgrounds (input/panel-ish)
    "#3a3e4a": "var(--tp-input)",
    "#4a4e5a": "var(--tp-input)",
    "#1a1d28": "var(--tp-input)",
    "#1a1b23": "var(--tp-input)",
    "#2a2e3a": "var(--tp-input)",
    "#0f1014": "var(--tp-bg)",
    # Light backgrounds
    "#f4f5f7": "var(--tp-bg3)",
}

# Files to scan
files = []
for ext in ("*.tsx", "*.jsx", "*.ts"):
    files.extend(Path("app").rglob(ext))
files = [f for f in files if "node_modules" not in f.parts]

# Stats
file_stats = {}
total_replaced = 0
total_files_changed = 0

for path in files:
    src = path.read_text()
    orig = src
    counter = {"n": 0}

    # Match a quoted hex literal: "#XXXXXX" or '#XXXXXX'
    # Only inside quotes — that excludes gradient strings (which contain
    # hex but inside a larger string).
    def hex_sub(match):
        quote = match.group(1)
        hex_val = match.group(2).lower()
        if hex_val in REPLACEMENTS:
            counter["n"] += 1
            return f'{quote}{REPLACEMENTS[hex_val]}{quote}'
        return match.group(0)

    src = re.sub(r"""(['"])(#[0-9a-fA-F]{6})\1""", hex_sub, src)

    if src != orig:
        path.write_text(src)
        total_files_changed += 1
        file_stats[str(path)] = counter["n"]
        total_replaced += counter["n"]

# ============================================================
#   REPORT
# ============================================================
print("=" * 60)
print("CATEGORY A GREY SWEEP — RESULTS")
print("=" * 60)
print(f"Files scanned:    {len(files)}")
print(f"Files modified:   {total_files_changed}")
print(f"Total replaced:   {total_replaced}")
print()
print("Per-file breakdown:")
for path, n in sorted(file_stats.items(), key=lambda x: -x[1]):
    print(f"  {n:>4}   {path}")
print()
print("DONE.")
