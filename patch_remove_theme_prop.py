#!/usr/bin/env python3
"""
TradePulse theme prop removal — eliminate System C entirely.

Step 1: Add 2 new CSS vars (--tp-active-bg, --tp-header-bg) to globals.css
        in both dark and light theme blocks.

Step 2: In JournalModule.jsx:
        - Replace all theme.X property accesses with var(--tp-X) equivalents
        - Fix 3 properties that were broken (theme.accentPrimary,
          theme.borderFaint, theme.tooltipBg)
        - Remove `theme` from 12 component destructured-props signatures
        - Remove `theme={theme}` from 14 child component call sites

Step 3: In page.tsx:
        - Delete the entire theme={isDark ? {...} : {...}} prop being passed
          to <JournalModule>

After this patch, JournalModule and all its sub-components use CSS variables
exclusively. The JS theme object no longer exists.
"""

import sys
import re
from pathlib import Path

JM_PATH = Path("app/modules/journal/JournalModule.jsx")
PAGE_PATH = Path("app/page.tsx")
CSS_PATH = Path("app/globals.css")

for p in (JM_PATH, PAGE_PATH, CSS_PATH):
    if not p.exists():
        print(f"ERROR: {p} not found. Run from project root.", file=sys.stderr)
        sys.exit(1)

# ============================================================
#   PROPERTY MAPPING
# ============================================================
# Maps theme.X → CSS variable name (just the var, not full var(...) syntax)
PROP_MAP = {
    "bg":             "--tp-bg",
    "bgSecondary":    "--tp-bg2",
    "bgTertiary":     "--tp-bg3",
    "panelBg":        "--tp-panel",
    "panelBorder":    "--tp-panel-b",
    "text":           "--tp-text",
    "textSecondary":  "--tp-text2",
    "textMuted":      "--tp-muted",
    "textFaint":      "--tp-faint",
    "textFaintest":   "--tp-faintest",
    "border":         "--tp-border",
    "borderLight":    "--tp-border-l",
    "inputBg":        "--tp-input",
    "cardBg":         "--tp-card",
    "activeBg":       "--tp-active-bg",       # NEW VAR
    "headerBg":       "--tp-header-bg",       # NEW VAR
    "headerBorder":   "--tp-border",          # alias
    "selectOptionBg": "--tp-sel-bg",
    # Three broken-in-prod properties — map to sensible defaults
    "accentPrimary":  "--tp-accent",          # was undefined
    "borderFaint":    "--tp-border",          # was undefined
    "tooltipBg":      "--tp-panel",           # was undefined
}

# ============================================================
#   STEP 1: globals.css — add 2 new vars
# ============================================================
css = CSS_PATH.read_text()

dark_anchor = ('  --tp-input: #1e2028; --tp-card: rgba(255,255,255,0.02);\n'
               '  --tp-sel-bg: #1e2028;')
dark_replacement = ('  --tp-input: #1e2028; --tp-card: rgba(255,255,255,0.02);\n'
                    '  --tp-sel-bg: #1e2028;\n'
                    '  --tp-active-bg: rgba(99,102,241,0.12);\n'
                    '  --tp-header-bg: rgba(13,15,20,0.85);')
if css.count(dark_anchor) != 1:
    print(f"FAIL [globals.css dark]: anchor not found uniquely (count={css.count(dark_anchor)})", file=sys.stderr)
    sys.exit(1)
css = css.replace(dark_anchor, dark_replacement)
print("OK   [globals.css: dark active-bg + header-bg added]")

light_anchor = ('  --tp-input: #f3f4f6; --tp-card: rgba(0,0,0,0.02);\n'
                '  --tp-sel-bg: #ffffff;')
light_replacement = ('  --tp-input: #f3f4f6; --tp-card: rgba(0,0,0,0.02);\n'
                     '  --tp-sel-bg: #ffffff;\n'
                     '  --tp-active-bg: rgba(99,102,241,0.08);\n'
                     '  --tp-header-bg: rgba(255,255,255,0.9);')
if css.count(light_anchor) != 1:
    print(f"FAIL [globals.css light]: anchor not found uniquely (count={css.count(light_anchor)})", file=sys.stderr)
    sys.exit(1)
css = css.replace(light_anchor, light_replacement)
print("OK   [globals.css: light active-bg + header-bg added]")

CSS_PATH.write_text(css)

# ============================================================
#   STEP 2: JournalModule.jsx
# ============================================================
src = JM_PATH.read_text()
orig_src = src

# 2a. Replace all theme.X property accesses
# We need to handle TWO contexts:
#   - inside template literals: ${theme.borderLight}    → var(--tp-border-l)
#   - everywhere else:           theme.text             → "var(--tp-text)"
#
# In template literals, the result needs to be a bare value (no quotes).
# Outside template literals, theme.X appears in JS expressions where the
# replacement should be a string literal (with quotes).
#
# The safe way: replace theme.X uniformly with `"var(--tp-X)"` (quoted),
# but handle template-literal contexts separately first because there
# the quotes would break the syntax.

prop_access_count = 0
template_count = 0

# Pass 1: template literals — convert ${theme.X} → var(--tp-X)
def template_sub(match):
    global template_count
    prop = match.group(1)
    if prop not in PROP_MAP:
        return match.group(0)  # leave unknown props alone
    template_count += 1
    return f"var({PROP_MAP[prop]})"

# Match ${theme.X} where X is a word
src = re.sub(r'\$\{theme\.(\w+)\}', template_sub, src)

# Pass 2: bare theme.X (in JS expression context) → "var(--tp-X)"
def bare_sub(match):
    global prop_access_count
    prop = match.group(1)
    if prop not in PROP_MAP:
        return match.group(0)
    prop_access_count += 1
    return f'"var({PROP_MAP[prop]})"'

# Match theme.X but NOT inside ${...} (already handled).
# We use a negative lookbehind for `${` to avoid touching template-literal
# patterns that survived (shouldn't happen but defensive).
src = re.sub(r'(?<!\$\{)\btheme\.(\w+)\b', bare_sub, src)

print(f"OK   [JournalModule: {template_count} template-literal accesses replaced]")
print(f"OK   [JournalModule: {prop_access_count} bare property accesses replaced]")

# 2b. Remove `theme` from component destructured props
# Pattern: function FooBar({ ..., theme, ... }) {
# We need to handle theme as first, middle, or last item in the destructured list

components_updated = 0
def strip_theme_from_destructure(match):
    global components_updated
    func_name = match.group(1)
    props = match.group(2)
    # Split props by comma, strip whitespace, filter out 'theme'
    items = [p.strip() for p in props.split(',')]
    items = [p for p in items if p and p != 'theme' and not p.startswith('theme=')]
    new_props = ', '.join(items)
    components_updated += 1
    return f'function {func_name}({{ {new_props} }})'

src = re.sub(
    r'function\s+(\w+)\s*\(\s*\{\s*([^}]*\btheme\b[^}]*)\s*\}\s*\)',
    strip_theme_from_destructure,
    src
)
print(f"OK   [JournalModule: {components_updated} component signatures cleaned]")

# 2c. Remove `theme={theme}` from JSX call sites
# Pattern: theme={theme} (inside a JSX tag)
call_sites_removed = src.count('theme={theme}')
src = src.replace(' theme={theme}', '')
src = src.replace('theme={theme} ', '')
src = src.replace('theme={theme}', '')  # any remaining edge cases
print(f"OK   [JournalModule: {call_sites_removed} call sites cleaned]")

# Save
JM_PATH.write_text(src)

# ============================================================
#   STEP 3: page.tsx — remove the JS theme object entirely
# ============================================================
page = PAGE_PATH.read_text()

# We need to find: theme={isDark ? { ... dark ... } : { ... light ... }}
# and remove the whole thing including the prop.
# The pattern is multi-line, so we need DOTALL.

# Match the full prop with the conditional and both objects
pattern = re.compile(
    r'\s*theme=\{isDark \? \{[^}]+\} : \{[^}]+\}\}',
    re.DOTALL
)
matches = pattern.findall(page)
if len(matches) != 1:
    print(f"FAIL [page.tsx]: expected 1 theme prop match, found {len(matches)}", file=sys.stderr)
    sys.exit(1)

page = pattern.sub('', page)
print("OK   [page.tsx: JS theme object removed entirely]")

PAGE_PATH.write_text(page)

# ============================================================
#   VERIFICATION
# ============================================================
print("\n" + "=" * 60)
print("VERIFICATION")
print("=" * 60)

# Re-read for verification
final_jm = JM_PATH.read_text()
final_page = PAGE_PATH.read_text()

# Check no remaining theme.X accesses
remaining_props = re.findall(r'\btheme\.(\w+)\b', final_jm)
if remaining_props:
    print(f"⚠ {len(remaining_props)} theme.X accesses still in JournalModule:")
    for p in set(remaining_props):
        print(f"    theme.{p}")
else:
    print("✓ No theme.X property accesses remain in JournalModule")

# Check no remaining theme={theme} prop passes
remaining_calls = final_jm.count('theme={theme}')
if remaining_calls:
    print(f"⚠ {remaining_calls} theme={{theme}} call sites still in JournalModule")
else:
    print("✓ No theme={theme} prop passes remain in JournalModule")

# Check theme prop removed from page.tsx
if 'theme={isDark' in final_page:
    print("⚠ theme prop still present in page.tsx")
else:
    print("✓ theme prop removed from page.tsx")

# Check no orphaned theme references
orphan_refs = re.findall(r'\btheme\b', final_jm)
print(f"  Total remaining 'theme' word occurrences in JournalModule: {len(orphan_refs)}")
print(f"  (Most should be 'currentTheme' or unrelated — review if surprising)")

print("\nDONE.")
