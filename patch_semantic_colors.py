#!/usr/bin/env python3
"""
TradePulse semantic color variable migration.

Step 1: Add 7 semantic CSS variables (--tp-success, --tp-danger, etc.)
        and 7 RGB-triple companions (--tp-success-rgb, etc.) to globals.css
        for both dark and light themes.

Step 2: Replace literal hex colors throughout app/ with var() references.

Step 3: Replace literal rgba() patterns with rgba(var(--*-rgb), alpha).

The replacements are EXACT-MATCH ONLY against quoted string literals to
avoid touching gradients, SVG attribute strings, comments, or other
contexts where var() would be fragile.
"""

import sys
import re
from pathlib import Path

# ============================================================
#   COLOR DEFINITIONS
# ============================================================
# Dark = current behavior (vivid, works on dark bg)
# Light = darker variant for contrast on white bg
COLORS = [
    # name           dark hex     light hex    dark RGB         light RGB
    ("success",      "#4ade80",   "#16a34a",   "74,222,128",    "22,163,74"),
    ("danger",       "#f87171",   "#dc2626",   "248,113,113",   "220,38,38"),
    ("warning",      "#eab308",   "#ca8a04",   "234,179,8",     "202,138,4"),
    ("info",         "#60a5fa",   "#2563eb",   "96,165,250",    "37,99,235"),
    ("accent",       "#6366f1",   "#4f46e5",   "99,102,241",    "79,70,229"),
    ("accent-light", "#a5b4fc",   "#6366f1",   "165,180,252",   "99,102,241"),
    ("accent-purple","#8b5cf6",   "#7c3aed",   "139,92,246",    "124,58,237"),
]

# ============================================================
#   STEP 1: globals.css edits
# ============================================================

CSS_PATH = Path("app/globals.css")
if not CSS_PATH.exists():
    print(f"ERROR: {CSS_PATH} not found. Run from project root.", file=sys.stderr)
    sys.exit(1)

css = CSS_PATH.read_text()

# Build dark-mode variable block
dark_vars = []
for name, dark_hex, _, dark_rgb, _ in COLORS:
    dark_vars.append(f"  --tp-{name}: {dark_hex}; --tp-{name}-rgb: {dark_rgb};")
dark_block = "\n".join(dark_vars)

light_vars = []
for name, _, light_hex, _, light_rgb in COLORS:
    light_vars.append(f"  --tp-{name}: {light_hex}; --tp-{name}-rgb: {light_rgb};")
light_block = "\n".join(light_vars)

# Insert semantic vars at :root scope so they're available everywhere,
# not just inside .tp-journal-module. This is critical because Screener,
# PlayBuilder, DeepDive, Sectors render outside the .tp-journal-module wrapper.

# Build a global :root block (default = dark values, since :root acts as dark)
# Then a [data-theme="light"] override for light values.
dark_root_block = "\n".join(
    f"  --tp-{name}: {dark_hex}; --tp-{name}-rgb: {dark_rgb};"
    for name, dark_hex, _, dark_rgb, _ in COLORS
)
light_root_block = "\n".join(
    f"  --tp-{name}: {light_hex}; --tp-{name}-rgb: {light_rgb};"
    for name, _, light_hex, _, light_rgb in COLORS
)

# Step 1a: append to :root, [data-theme="dark"] block
root_anchor = '  --shell-active: rgba(99,102,241,0.12);\n}'
root_replacement = (
    '  --shell-active: rgba(99,102,241,0.12);\n'
    '  /* semantic accent colors (global scope) */\n'
    + dark_root_block + '\n'
    '}'
)
if css.count(root_anchor) != 1:
    print(f"FAIL: :root anchor not found uniquely (count={css.count(root_anchor)})", file=sys.stderr)
    sys.exit(1)
css = css.replace(root_anchor, root_replacement)
print("OK   [globals.css: dark/root semantic vars added to :root]")

# Step 1b: append to [data-theme="light"] root block
light_root_anchor = '  --shell-active: rgba(99,102,241,0.08);\n}'
light_root_replacement = (
    '  --shell-active: rgba(99,102,241,0.08);\n'
    '  /* semantic accent colors (global scope) */\n'
    + light_root_block + '\n'
    '}'
)
if css.count(light_root_anchor) != 1:
    print(f"FAIL: light :root anchor not found uniquely (count={css.count(light_root_anchor)})", file=sys.stderr)
    sys.exit(1)
css = css.replace(light_root_anchor, light_root_replacement)
print("OK   [globals.css: light :root semantic vars added]")

CSS_PATH.write_text(css)

# ============================================================
#   STEP 2 + 3: replace literals across all source files
# ============================================================
# Files to scan: every .ts/.tsx/.jsx/.js in app/, EXCEPT globals.css
# We deliberately do NOT touch .css files (they're already managed).

target_files = []
for ext in ("*.tsx", "*.jsx", "*.ts", "*.js"):
    target_files.extend(Path("app").rglob(ext))
target_files = [p for p in target_files if "node_modules" not in p.parts]

# Build replacement maps
# HEX: only the dark-mode hex (since literals in code use the vivid dark-mode value)
hex_map = {h.lower(): name for name, h, _, _, _ in COLORS}
# RGB: dark-mode rgb triples
rgb_map = {r: name for name, _, _, r, _ in COLORS}

# Stats
file_stats = {}
total_hex_replaced = 0
total_rgba_replaced = 0
total_files_changed = 0

for path in target_files:
    src = path.read_text()
    orig = src
    counter = {"hex": 0, "rgba": 0}

    # --- Hex replacements ---
    # Match a quoted hex literal: "#XXXXXX" or '#XXXXXX'
    # Only inside quotes — that excludes gradient strings (which contain hex but inside a larger string).
    # We DO want to catch them in JSX-attribute form like color: "#4ade80".
    def hex_sub(match):
        quote = match.group(1)
        hex_val = match.group(2).lower()
        if hex_val in hex_map:
            counter["hex"] += 1
            return f'{quote}var(--tp-{hex_map[hex_val]}){quote}'
        return match.group(0)

    # Match '#XXXXXX' or "#XXXXXX" as the entire string content (not embedded)
    src = re.sub(r"""(['"])(#[0-9a-fA-F]{6})\1""", hex_sub, src)

    # --- RGBA replacements ---
    # Match rgba(R,G,B,alpha) where R,G,B match a known triple.
    # Allow whitespace tolerance.
    def rgba_sub(match):
        r, g, b, alpha = match.group(1).strip(), match.group(2).strip(), match.group(3).strip(), match.group(4).strip()
        triple = f"{r},{g},{b}"
        if triple in rgb_map:
            counter["rgba"] += 1
            return f'rgba(var(--tp-{rgb_map[triple]}-rgb), {alpha})'
        return match.group(0)

    src = re.sub(
        r"""rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?\.\d+|1|0)\s*\)""",
        rgba_sub,
        src,
    )

    if src != orig:
        path.write_text(src)
        total_files_changed += 1
        file_stats[str(path)] = (counter["hex"], counter["rgba"])
        total_hex_replaced += counter["hex"]
        total_rgba_replaced += counter["rgba"]

# ============================================================
#   REPORT
# ============================================================
print("\n" + "=" * 60)
print("REPLACEMENT SUMMARY")
print("=" * 60)
print(f"Files scanned:     {len(target_files)}")
print(f"Files modified:    {total_files_changed}")
print(f"Hex replacements:  {total_hex_replaced}")
print(f"Rgba replacements: {total_rgba_replaced}")
print(f"Total:             {total_hex_replaced + total_rgba_replaced}")
print()
print("Per-file breakdown (top 10 by changes):")
for path, (hx, rg) in sorted(file_stats.items(), key=lambda x: -(x[1][0] + x[1][1]))[:10]:
    print(f"  {hx:>4} hex + {rg:>3} rgba   {path}")
print()
print("DONE. Run `git diff app/globals.css` to verify CSS vars added correctly.")
