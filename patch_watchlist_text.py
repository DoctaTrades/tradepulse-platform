#!/usr/bin/env python3
"""
TradePulse watchlist text fix.

The body text on watchlist cards (Bullish Thesis, Bearish Thesis,
Entry, Exit) was hardcoded to #c0c4cf — readable in dark mode but
nearly invisible on light mode's white background.

Replaces all 4 instances with var(--tp-text2), which resolves to:
  - Dark mode: #c8cad0 (basically the same as before, slightly lighter)
  - Light mode: #374151 (proper dark-on-white contrast)
"""

import sys
from pathlib import Path

PATH = Path("app/modules/journal/JournalModule.jsx")

if not PATH.exists():
    print(f"ERROR: {PATH} not found. Run from project root.", file=sys.stderr)
    sys.exit(1)

src = PATH.read_text()

# Count before
before_count = src.count('"#c0c4cf"')
if before_count == 0:
    print("FAIL: no instances of #c0c4cf found — patch already applied?", file=sys.stderr)
    sys.exit(1)

# Replace ALL instances of the quoted hex literal
new_src = src.replace('"#c0c4cf"', '"var(--tp-text2)"')
after_count = new_src.count('"#c0c4cf"')

PATH.write_text(new_src)

print(f"OK   Replaced {before_count - after_count} instance(s) of #c0c4cf with var(--tp-text2)")
print(f"     Remaining: {after_count} (should be 0)")

if after_count != 0:
    print("FAIL: some instances were not replaced", file=sys.stderr)
    sys.exit(1)

print("\nDONE.")
