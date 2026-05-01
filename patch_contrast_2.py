#!/usr/bin/env python3
"""
TradePulse text contrast bump — round 2.

Bumps textMuted/textFaint/textFaintest in the JS theme object in page.tsx
to match the CSS variables we already updated. This fixes the Dashboard
and other components that read from the JS theme object instead of CSS vars.
"""

import sys
from pathlib import Path

PATH = Path("app/page.tsx")

if not PATH.exists():
    print(f"ERROR: {PATH} not found. Run from project root.", file=sys.stderr)
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

# Dark theme
replace_once(
    'text:"#e2e4ea", textSecondary:"#c8cad0", textMuted:"#8a8f9e", textFaint:"#5c6070", textFaintest:"#3d4150",',
    'text:"#e2e4ea", textSecondary:"#c8cad0", textMuted:"#a8acb8", textFaint:"#8f93a3", textFaintest:"#6c7081",',
    "dark theme JS object"
)

# Light theme
replace_once(
    'text:"#1a1a2e", textSecondary:"#374151", textMuted:"#6b7280", textFaint:"#9ca3af", textFaintest:"#d1d5db",',
    'text:"#1a1a2e", textSecondary:"#374151", textMuted:"#525866", textFaint:"#6b7280", textFaintest:"#9ca3af",',
    "light theme JS object"
)

PATH.write_text(src)
print("\nJS theme contrast patch applied.")
