#!/usr/bin/env python3
"""
TradePulse text contrast bump.

Bumps --tp-muted, --tp-faint, --tp-faintest in both dark and light themes
to WCAG AA-compliant values. Text hierarchy preserved. Backgrounds and
accent colors untouched.
"""

import sys
from pathlib import Path

PATH = Path("app/globals.css")

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

# Dark theme: muted/faint/faintest
replace_once(
    '  --tp-text: #e2e4ea; --tp-text2: #c8cad0; --tp-muted: #8a8f9e;\n  --tp-faint: #5c6070; --tp-faintest: #3d4150;',
    '  --tp-text: #e2e4ea; --tp-text2: #c8cad0; --tp-muted: #a8acb8;\n  --tp-faint: #8f93a3; --tp-faintest: #6c7081;',
    "dark theme text shades"
)

# Light theme: muted/faint/faintest
replace_once(
    '  --tp-text: #1a1a2e; --tp-text2: #374151; --tp-muted: #6b7280;\n  --tp-faint: #9ca3af; --tp-faintest: #d1d5db;',
    '  --tp-text: #1a1a2e; --tp-text2: #374151; --tp-muted: #525866;\n  --tp-faint: #6b7280; --tp-faintest: #9ca3af;',
    "light theme text shades"
)

PATH.write_text(src)
print("\nText contrast patch applied.")
