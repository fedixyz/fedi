#!/usr/bin/env python3
"""Render a product bug report from synthesized JSON.

Takes one JSON file describing the report (see schema below) and:
  1. writes a self-contained HTML file (the rich, browser-viewable version with
     two views and collapsible technical detail per item), and
  2. prints the plain-language inline briefing (markdown) to stdout, so the
     caller can relay it straight into the chat.

Both outputs are rendered from the SAME data, so the quick list and the rich
report can never disagree. The model's only job is to produce good JSON; all the
fiddly, repetitive formatting lives here.

The summary strip, the icons and the by-status view all derive from the schema
below. A presentation change must never add a required field.

Usage:
  python3 render_report.py <report.json> <out.html>

JSON schema:
{
  "generated_at": "2026-06-26",
  "repo": "fedibtc/fedi",
  "intro": "One friendly sentence framing the report.",
  "items": [
    {
      "headline": "Plain-English, user-facing one-liner",
      "impact": "Crash",          # drives the icon + color of the first chip
      "who": "Who feels this",     # e.g. "A small number of users on older iPhones"
      "status": "Fix in progress", # Open | Being looked into | Fix in progress | Fixed, pending release
      "last_active": "2026-06-25", # most recent activity across the grouped issues
      "summary": "1-2 plain sentences a non-technical reader understands.",
      "detail": "Richer but still plain explanation for the expandable section.",
      "issues": [
        {"number": 11601, "title": "App crashes for iOS 15 versions",
         "url": "https://github.com/fedibtc/fedi/issues/11601"}
      ]
    }
  ]
}

`status` and `impact` are vocabularies, not free text. `status` decides which
bucket an item lands in in the by-status view, and `impact` picks the icon. Both
degrade gracefully (unknown values render in a neutral style) but the script
warns on stderr, because a typo silently dumping an item into "Other" is the
kind of thing nobody notices until the reader does.
"""
import html
import json
import sys

# currentColor so one definition works on any chip background and either theme.
ICONS = {
    "alert": "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
    "money": "M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    "card": "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M2 10h20",
    "chat": "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z",
    "sync": "M23 4v6h-6 M1 20v-6h6 M3.5 9a9 9 0 0 1 14.9-3.4L23 10 M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
    "archive": "M3 8h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z M2 4h20v4H2z M10 12h4",
    "undo": "M1 4v6h6 M3.5 15a9 9 0 1 0 2.1-9.4L1 10",
    "bell": "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",
    "eye": "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    "dot": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01",
    # status icons
    "clock": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
    "search": "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
    "wrench": "M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3z",
    "check": "M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14.1l-3-3",
}

# White text at 11px needs 4.5:1, so these run darker than the brand hues.
# Never pair an impact with color alone; a colorblind reader loses the category.
IMPACT_STYLE = {
    "crash": ("#c92a2a", "alert"),
    "funds": ("#c2410c", "money"),
    "money": ("#c2410c", "money"),
    "payments": ("#c2410c", "card"),
    "chat": ("#6741d9", "chat"),
    "messaging": ("#6741d9", "chat"),
    "sync": ("#1971c2", "sync"),
    "backup": ("#1971c2", "archive"),
    "recovery": ("#1971c2", "undo"),
    "notifications": ("#0b7285", "bell"),
    "display": ("#5c677d", "eye"),
    "polish": ("#5c677d", "eye"),
    "ui": ("#5c677d", "eye"),
}
DEFAULT_IMPACT = ("#495057", "dot")

# Keep most-work-remaining first, and keep green for done alone. A second green
# on "in progress" erases the distinction this view exists to make.
BUCKETS = [
    ("open", "Open", "clock", "#64748b",
     "Nobody has picked these up yet."),
    ("being looked into", "Being looked into", "search", "#1971c2",
     "Understood or under investigation, but no fix has been written yet."),
    ("fix in progress", "Fix in progress", "wrench", "#b45309",
     "Someone is actively on it, or a fix is written and waiting on review."),
    ("fixed, pending release", "Done, waiting on a release", "check", "#2b8a3e",
     "No more engineering needed. These only have to go out in the next release."),
]
BUCKET_BY_KEY = {k: (label, icon, color, blurb) for k, label, icon, color, blurb in BUCKETS}
OTHER_BUCKET = ("Other", "dot", "#64748b", "Status did not match one of the four standard values.")


def norm(value):
    return (value or "").strip().lower()


def bucket_key(status):
    return norm(status) if norm(status) in BUCKET_BY_KEY else "other"


def slug(key):
    """Bucket keys carry commas and spaces, which are not legal in a URL
    fragment."""
    out = "".join(c if c.isalnum() else "-" for c in key)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tint(hex_color, alpha):
    r, g, b = hex_to_rgb(hex_color)
    return f"rgba({r},{g},{b},{alpha})"


# Raw GitHub titles often carry em/en dashes. Normalize them to a plain hyphen
# so the rendered report stays consistent and dash-clean.
_DASHES = {0x2014: "-", 0x2013: "-"}


def esc(text):
    return html.escape(str(text if text is not None else "").translate(_DASHES))


def icon_svg(name, cls="ic"):
    # Round caps are what turn the one-unit strokes into the dots some glyphs
    # need, so don't split the multi-M paths or drop the linecap.
    d = f'<path d="{ICONS.get(name, ICONS["dot"])}"/>'
    return (
        f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" '
        f'aria-hidden="true">{d}</svg>'
    )


def issue_links_md(issues):
    parts = []
    for it in issues or []:
        num = it.get("number")
        url = it.get("url", "")
        parts.append(f"[#{num}]({url})" if url else f"#{num}")
    return ", ".join(parts)


def tally(items):
    """Counts per bucket, plus the buckets in fixed order with their styling."""
    counts = {}
    for item in items:
        key = bucket_key(item.get("status"))
        counts[key] = counts.get(key, 0) + 1
    ordered = [(key, label, icon, color, counts.get(key, 0))
               for key, label, icon, color, _ in BUCKETS]
    if counts.get("other"):
        label, icon, color, _ = OTHER_BUCKET
        ordered.append(("other", label, icon, color, counts["other"]))
    return counts, ordered


def shape_sentence(items):
    """How much of the list still costs engineering time, for a reader who gets
    no further than the first line."""
    if not items:
        return "Nothing user-facing is currently open."
    counts, _ = tally(items)
    total = len(items)
    done = counts.get("fixed, pending release", 0)
    outstanding = total - done
    noun = "item" if total == 1 else "items"
    if done and outstanding:
        return (f"{total} {noun}. {outstanding} still need engineering work; "
                f"{done} {'is' if done == 1 else 'are'} already fixed and only waiting on a release.")
    if done and not outstanding:
        return f"All {total} {noun} are already fixed and only waiting on a release."
    return f"{total} {noun}, all still needing engineering work."


def render_markdown(data):
    """The quick, scannable briefing that lands in the chat."""
    items = data.get("items", [])
    lines = []
    intro = data.get("intro") or "Here's what's currently affecting people in the app, in plain language, most recently active first."
    when = data.get("generated_at", "")
    lines.append(f"{intro}" + (f" _(as of {when})_" if when else ""))
    lines.append("")
    lines.append(shape_sentence(items))
    lines.append("")
    for i, item in enumerate(items, 1):
        lines.append(f"{i}. **{item.get('headline','').strip()}**")
        summary = (item.get("summary") or "").strip()
        if summary:
            lines.append(f"   {summary}")
        meta = []
        if item.get("who"):
            meta.append(f"Affects: {item['who']}")
        if item.get("status"):
            meta.append(f"Status: {item['status']}")
        links = issue_links_md(item.get("issues"))
        if links:
            meta.append(f"More detail: {links}")
        if meta:
            lines.append(f"   _{' · '.join(meta)}_")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_item_html(item, rank):
    impact = item.get("impact", "")
    color, icon = IMPACT_STYLE.get(norm(impact), DEFAULT_IMPACT)
    status = item.get("status", "")
    bkey = bucket_key(status)
    blabel, bicon, bcolor, _ = BUCKET_BY_KEY.get(bkey, OTHER_BUCKET)

    impact_chip = (
        f'<span class="chip impact" style="background:{color}">{icon_svg(icon)}{esc(impact)}</span>'
        if impact else ""
    )
    status_chip = (
        f'<span class="chip status" style="color:{bcolor};background:{tint(bcolor, .10)};'
        f'border-color:{tint(bcolor, .35)}">{icon_svg(bicon)}{esc(status)}</span>'
        if status else ""
    )
    last_active = (
        f'<span class="when">last active {esc(item.get("last_active"))}</span>'
        if item.get("last_active") else ""
    )

    issue_rows = ""
    for it in item.get("issues", []) or []:
        num = esc(it.get("number"))
        url = esc(it.get("url", ""))
        title = esc(it.get("title", ""))
        issue_rows += (
            f'<li><a href="{url}" target="_blank" rel="noopener">#{num}</a> '
            f'<span class="issue-title">{title}</span></li>'
        )
    issues_block = f'<ul class="issues">{issue_rows}</ul>' if issue_rows else ""

    detail = esc(item.get("detail", "")).replace("\n", "<br>")
    who = (
        f'<p class="who"><span class="who-label">Affects</span>{esc(item.get("who"))}</p>'
        if item.get("who") else ""
    )
    plural = "s" if len(item.get("issues", []) or []) != 1 else ""

    return f"""
    <article class="card" data-bucket="{esc(bkey)}">
      <div class="card-head">
        <span class="rank" aria-label="rank {rank} by recent activity">{rank}</span>
        <h2>{esc(item.get('headline',''))}</h2>
      </div>
      <div class="chips">{impact_chip}{status_chip}{last_active}</div>
      <p class="summary">{esc(item.get('summary',''))}</p>
      {who}
      <details>
        <summary>More technical detail</summary>
        <div class="detail-body">
          <p>{detail}</p>
          <p class="src-label">Underlying issue{plural}:</p>
          {issues_block}
        </div>
      </details>
    </article>"""


# Interpolated into both selectors so they cannot drift. The data-theme hook
# looks unused, but check-report.sh needs it to pin a theme for screenshots.
DARK_VARS = (
    "--bg:#0f1115; --card:#171a21; --line:#272c36; --ink:#e9ebef; --ink-2:#c3c8d2; "
    "--muted:#98a0ae; --faint:#78808e; --link:#6aa9f0; --tile:#171a21; --rank:#232833;"
)


def render_html(data):
    items = data.get("items", [])
    cards = "\n".join(render_item_html(item, i) for i, item in enumerate(items, 1))
    generated = esc(data.get("generated_at", ""))
    repo = esc(data.get("repo", ""))
    count = len(items)
    intro = esc(data.get("intro", ""))
    counts, ordered = tally(items)

    tiles = ""
    for key, label, icon, color, n in ordered:
        dim = "" if n else " dim"
        tiles += (
            f'<button class="tile{dim}" data-jump="{esc(slug(key))}" style="--c:{color}"'
            f'{" disabled" if not n else ""}>'
            f'<span class="tile-n">{n}</span>'
            f'<span class="tile-l">{icon_svg(icon, "ic sm")}{esc(label)}</span></button>'
        )

    groups = ""
    for key, label, icon, color, n in ordered:
        if not n:
            continue
        blurb = BUCKET_BY_KEY.get(key, OTHER_BUCKET)[3]
        groups += (
            f'<section class="group" id="g-{esc(slug(key))}" style="--c:{color}">'
            f'<div class="group-head">{icon_svg(icon, "ic lg")}'
            f'<h2>{esc(label)}</h2><span class="group-n">{n}</span></div>'
            f'<p class="group-blurb">{esc(blurb)}</p>'
            f'<div class="slot" data-bucket="{esc(key)}"></div></section>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>What's affecting people in the app{f' - {generated}' if generated else ''}</title>
<style>
  :root {{
    color-scheme: light dark;
    --bg: #f6f7f9; --card: #fff; --line: #e5e7eb; --ink: #17191d; --ink-2: #374151;
    --muted: #6b7280; --faint: #9095a0; --link: #1667b8; --tile: #fff; --rank: #eef0f3;
  }}
  @media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ {DARK_VARS} }} }}
  :root[data-theme="dark"] {{ {DARK_VARS} }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink); background: var(--bg); margin: 0; line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }}
  .wrap {{ max-width: 780px; margin: 0 auto; padding: 34px 20px 72px; }}
  header h1 {{ font-size: 27px; line-height: 1.25; margin: 0 0 10px; letter-spacing: -.01em; }}
  .shape {{ font-size: 16.5px; color: var(--ink-2); margin: 0 0 6px; font-weight: 500; }}
  .sub {{ color: var(--faint); font-size: 13px; margin: 0; }}
  .intro {{ color: var(--muted); font-size: 15px; margin: 16px 0 0; }}

  .tiles {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 22px 0 6px; }}
  .tile {{
    font: inherit; text-align: left; cursor: pointer; background: var(--tile);
    border: 1px solid var(--line); border-left: 3px solid var(--c);
    border-radius: 10px; padding: 11px 13px; display: flex; flex-direction: column; gap: 3px;
  }}
  .tile:hover:not(.dim) {{ border-color: var(--c); }}
  .tile.dim {{ opacity: .45; cursor: default; }}
  .tile-n {{ font-size: 22px; font-weight: 650; color: var(--ink); line-height: 1.1; }}
  .tile-l {{ font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 5px; }}
  .tile-l .ic {{ color: var(--c); }}

  .views {{ display: flex; gap: 6px; margin: 22px 0 18px; border-bottom: 1px solid var(--line); }}
  .views button {{
    font: inherit; font-size: 14px; font-weight: 550; cursor: pointer; background: none;
    border: 0; border-bottom: 2px solid transparent; color: var(--muted);
    padding: 8px 3px; margin-right: 16px;
  }}
  .views button[aria-pressed="true"] {{ color: var(--ink); border-bottom-color: var(--ink); }}

  .card {{
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 17px 19px 15px; margin-bottom: 14px;
  }}
  .card-head {{ display: flex; gap: 10px; align-items: baseline; }}
  .card-head h2 {{ font-size: 17.5px; margin: 0; line-height: 1.35; letter-spacing: -.005em; }}
  .rank {{
    flex: none; font-size: 11.5px; font-weight: 650; color: var(--muted); background: var(--rank);
    border-radius: 6px; min-width: 21px; height: 21px; display: inline-flex;
    align-items: center; justify-content: center; padding: 0 5px;
  }}
  .chips {{ display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 10px 0 0 31px; }}
  .chip {{
    display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 650;
    letter-spacing: .03em; padding: 3px 9px 3px 7px; border-radius: 999px; text-transform: uppercase;
    border: 1px solid transparent; white-space: nowrap;
  }}
  .chip.impact {{ color: #fff; }}
  .chip.status {{ background: transparent; }}
  .ic {{ width: 12px; height: 12px; flex: none; }}
  .ic.sm {{ width: 13px; height: 13px; }}
  .ic.lg {{ width: 17px; height: 17px; }}
  .when {{ color: var(--faint); font-size: 12px; }}
  .summary {{ margin: 11px 0 0 31px; font-size: 15.5px; color: var(--ink-2); }}
  .who {{ margin: 8px 0 0 31px; font-size: 13.5px; color: var(--muted); }}
  .who-label {{
    text-transform: uppercase; font-size: 10.5px; font-weight: 650; letter-spacing: .05em;
    color: var(--faint); margin-right: 7px;
  }}
  details {{ margin: 13px 0 0 31px; border-top: 1px dashed var(--line); padding-top: 9px; }}
  summary {{ cursor: pointer; color: var(--link); font-size: 13.5px; font-weight: 550; user-select: none; }}
  summary:hover {{ text-decoration: underline; }}
  .detail-body {{ padding: 9px 2px 2px; font-size: 14.5px; color: var(--ink-2); }}
  .detail-body p {{ margin: 8px 0; }}
  .src-label {{ color: var(--muted); font-size: 12.5px; margin-bottom: 4px !important; }}
  ul.issues {{ margin: 4px 0 0; padding-left: 18px; }}
  ul.issues li {{ margin: 3px 0; font-size: 13.5px; }}
  ul.issues a {{ color: var(--link); text-decoration: none; font-weight: 650; }}
  ul.issues a:hover {{ text-decoration: underline; }}
  .issue-title {{ color: var(--muted); }}

  .group {{ margin: 0 0 26px; }}
  .group-head {{ display: flex; align-items: center; gap: 8px; }}
  .group-head .ic {{ color: var(--c); }}
  .group-head h2 {{ font-size: 16px; margin: 0; letter-spacing: -.005em; }}
  .group-n {{
    font-size: 11.5px; font-weight: 650; color: var(--c); background: var(--bg);
    border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px;
  }}
  .group-blurb {{ color: var(--muted); font-size: 13.5px; margin: 5px 0 12px 25px; }}
  .group .card {{ border-left: 3px solid var(--c); }}
  #by-status {{ display: none; }}
  footer {{ margin-top: 30px; color: var(--faint); font-size: 12.5px; text-align: center; }}
  @media (max-width: 560px) {{
    .chips, .summary, .who, details {{ margin-left: 0; }}
    .card-head {{ align-items: flex-start; }}
  }}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>What's affecting people in the app right now</h1>
      <p class="shape">{esc(shape_sentence(items))}</p>
      <p class="sub">{f'Generated {generated}' if generated else 'Generated'}{f' from the {repo} backlog' if repo else ''}, ranked by recent activity.</p>
      <p class="intro">{intro}</p>
    </header>

    <div class="tiles">{tiles}</div>

    <nav class="views">
      <button id="v-recency" aria-pressed="true">By recent activity</button>
      <button id="v-status" aria-pressed="false">By status</button>
    </nav>

    <div id="by-recency">{cards}</div>
    <div id="by-status">{groups}</div>

    <footer>
      Generated from the live GitHub backlog{f' on {generated}' if generated else ''}. Each item links to the underlying issue{'s' if count != 1 else ''} for the full engineering discussion.
    </footer>
  </div>
<script>
(function () {{
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var recency = document.getElementById('by-recency');
  var status = document.getElementById('by-status');
  var bRec = document.getElementById('v-recency');
  var bSta = document.getElementById('v-status');

  function show(view, jump, quiet) {{
    var toStatus = view === 'status';
    cards.forEach(function (c) {{
      (toStatus ? document.querySelector('.slot[data-bucket="' + c.dataset.bucket + '"]') : recency)
        .appendChild(c);
    }});
    // Set both explicitly. Clearing to '' would fall back to the stylesheet,
    // which hides #by-status by default, so the view would never appear.
    recency.style.display = toStatus ? 'none' : 'block';
    status.style.display = toStatus ? 'block' : 'none';
    bRec.setAttribute('aria-pressed', String(!toStatus));
    bSta.setAttribute('aria-pressed', String(toStatus));
    // Mirror the view into the URL so a bucket can be linked to, and so
    // check-report.sh can screenshot the status view without a click.
    if (!quiet) history.replaceState(null, '', toStatus ? ('#' + (jump ? 'g-' + jump : 'status')) : '#');
    if (jump) {{
      var t = document.getElementById('g-' + jump);
      if (t) t.scrollIntoView({{ behavior: 'smooth', block: 'start' }});
    }}
  }}

  bRec.addEventListener('click', function () {{ show('recency'); }});
  bSta.addEventListener('click', function () {{ show('status'); }});
  document.querySelectorAll('.tile[data-jump]').forEach(function (t) {{
    if (t.disabled) return;
    t.addEventListener('click', function () {{ show('status', t.dataset.jump); }});
  }});

  var h = location.hash;
  if (h === '#status') show('status', null, true);
  else if (h.indexOf('#g-') === 0) show('status', h.slice(3), true);
}})();
</script>
</body>
</html>
"""


def warn_vocabulary(items):
    """Nudge on off-vocabulary values, because they degrade silently."""
    for item in items:
        head = (item.get("headline") or "")[:48]
        if item.get("status") and bucket_key(item["status"]) == "other":
            print(f'warn: status "{item["status"]}" is not one of the four standard values, '
                  f'so "{head}" lands in the Other bucket', file=sys.stderr)
        if item.get("impact") and norm(item["impact"]) not in IMPACT_STYLE:
            print(f'warn: impact "{item["impact"]}" has no icon, so "{head}" gets the neutral one',
                  file=sys.stderr)


def main():
    if len(sys.argv) != 3:
        print("usage: render_report.py <report.json> <out.html>", file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    warn_vocabulary(data.get("items", []))
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(render_html(data))
    # The inline briefing goes to stdout for the caller to relay into chat.
    sys.stdout.write(render_markdown(data))


if __name__ == "__main__":
    main()
