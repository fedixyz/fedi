#!/usr/bin/env bash
# Self-audit a rendered bug report before handing it to the reader. Checks the
# mechanical failures and writes screenshots for the parts no script can judge.
#
# Usage: check-report.sh <report.html> [screenshot-dir]

set -uo pipefail

REPORT="${1:?usage: check-report.sh <report.html> [screenshot-dir]}"
SHOTS="${2:-$(dirname "$(dirname "$REPORT")")/screenshots}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fail=0

[ -f "$REPORT" ] || { echo "FAIL  no such file: $REPORT"; exit 1; }
dir=$(cd "$(dirname "$REPORT")" && pwd)
base=$(basename "${REPORT%.html}")

size_kb=$(( $(wc -c < "$REPORT") / 1024 ))
if [ "$size_kb" -gt 150 ]; then
  echo "FAIL  ${size_kb}KB, something heavy got inlined; a report is tens of KB"
  fail=1
else
  echo "ok    ${size_kb}KB"
fi

# Match fetched assets only. The report is required to link out to the real
# issues, so don't broaden this to catch <a href>.
assets='<script[^>]+src=|<img[^>]+src=|<link[^>]+rel="stylesheet"|@import|url\((https?:)?//'
if grep -Eqi "$assets" "$REPORT"; then
  echo "FAIL  external asset reference:"
  grep -Eoi "${assets}[^\"')]*" "$REPORT" | sort -u | sed 's/^/      /'
  fail=1
else
  echo "ok    no external assets"
fi

# Built from hex so this file stays free of the characters it is checking for.
emdash=$(printf '\xe2\x80\x94')
endash=$(printf '\xe2\x80\x93')
if grep -q -e "$emdash" -e "$endash" "$REPORT"; then
  echo "FAIL  long dash in the output, normalize it to a plain hyphen"
  fail=1
else
  echo "ok    no long dashes"
fi

# Every item has to offer a way down to the real engineering discussion.
links=$(grep -o 'github.com/[^"]*/issues/[0-9]*' "$REPORT" | wc -l | tr -d ' ')
cards=$(grep -o 'class="card"' "$REPORT" | wc -l | tr -d ' ')
if [ "$cards" -gt 0 ] && [ "$links" -lt "$cards" ]; then
  echo "FAIL  $cards cards but only $links issue links, some item has no source"
  fail=1
else
  echo "ok    $cards cards, $links issue links"
fi

# A card outside every bucket is dropped from the by-status view silently.
slots=$(grep -o 'class="slot" data-bucket' "$REPORT" | wc -l | tr -d ' ')
if [ "$cards" -gt 0 ] && [ "$slots" -eq 0 ]; then
  echo "FAIL  no status buckets rendered, the by-status view will be empty"
  fail=1
else
  echo "ok    $slots status buckets"
fi

if [ ! -x "$CHROME" ]; then
  echo "skip  Chrome not found, no screenshots or overflow check"
  exit $fail
fi

# Don't judge overflow from a screenshot. Headless Chrome floors its layout at
# 500px and crops narrower shots, which looks identical to a page overflowing.
probe="$dir/.check-probe.html"
python3 - "$REPORT" "$probe" <<'PY'
import sys
src = open(sys.argv[1], encoding="utf-8").read()
tag = ("<script>window.addEventListener('load',function(){document.title="
       "'PROBE '+document.documentElement.clientWidth+' '"
       "+document.documentElement.scrollWidth;});</script></body>")
open(sys.argv[2], "w", encoding="utf-8").write(src.replace("</body>", tag))
PY
read -r _ client scroll <<<"$("$CHROME" --headless --disable-gpu --window-size=500,900 \
  --virtual-time-budget=2000 --dump-dom "file://$probe" 2>/dev/null \
  | grep -o 'PROBE [0-9]* [0-9]*' | head -1)"
rm -f "$probe"
if [ -n "${scroll:-}" ] && [ "$scroll" -gt "$((client + 1))" ]; then
  echo "FAIL  page scrolls sideways at ${client}px (content is ${scroll}px)"
  fail=1
else
  echo "ok    no sideways scroll at ${client:-?}px"
fi

mkdir -p "$SHOTS"

# Pin the theme via the page's data-theme hook. Headless Chrome ignores the
# flags that claim to override the host OS preference.
shot() { # <theme> <width> <height> <suffix> [url-hash]
  tmp="$dir/.check-$1.html"
  sed "s|<html lang=\"en\">|<html lang=\"en\" data-theme=\"$1\">|" "$REPORT" > "$tmp"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --window-size="$2,$3" \
    --virtual-time-budget=2000 \
    --screenshot="$SHOTS/$base-$4.png" "file://$tmp${5:-}" >/dev/null 2>&1
  rm -f "$tmp"
}

shot light 1100 1700 light
shot dark  1100 1700 dark
# 500 is the narrowest layout headless will actually render, and it is below
# the report's 560px breakpoint, so this does exercise the small-screen branch.
shot light  500 1500 narrow
# The by-status view is the half of the report a default screenshot never sees.
shot light 1100 1700 status '#status'

echo "shots $SHOTS/$base-{light,dark,narrow,status}.png"
echo
echo "Now READ the screenshots. The script cannot tell you whether a chip is"
echo "legible, whether the status buckets read as buckets, or whether the"
echo "by-status view actually separates finished work from work still to do."
exit $fail
