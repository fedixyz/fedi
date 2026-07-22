#!/usr/bin/env python3
"""Render a product activity report from synthesized JSON.

Takes one JSON file describing the report (see schema below) and:
  1. writes a self-contained HTML file (the rich, browser-viewable version with
     collapsible technical detail per item), and
  2. prints the plain-language inline briefing (markdown) to stdout, so the
     caller can relay it straight into the chat.

Both outputs are rendered from the SAME data, so the quick list and the rich
report can never disagree. The model's only job is to produce good JSON; all the
fiddly, repetitive formatting lives here.

Usage:
  python3 render_report.py <report.json> <out.html>

JSON schema:
{
  "generated_at": "2026-06-26",
  "title": "What's moving in the product right now",   # optional, drives <title> and the h1
  "repo": "fedibtc/fedi",       # a string, or a list when the report spans repos
  "intro": "One friendly sentence framing the report.",
  "items": [
    {
      "headline": "Plain-English, user-facing one-liner",
      "kind": "New feature",       # New feature | Improvement | Fix
      "status": "Shipped",          # Shipped | In progress | Planned | Being looked into | Fixed, pending release
      "repo": "fedibtc/fedi",      # optional; shown only when the report spans repos
      "who": "Who this is for",     # e.g. "Anyone who receives a Lightning payment"
      "last_active": "2026-06-25",  # most recent activity across the grouped work
      "summary": "1-2 plain sentences a non-technical reader understands.",
      "detail": "Richer but still plain explanation for the expandable section.",
      "links": [
        {"number": 11567, "title": "feat: add manual lightning receive reclaim",
         "url": "https://github.com/fedibtc/fedi/pull/11567", "type": "pr"}
      ]
    }
  ]
}
"""
import html
import json
import re
import sys

# "kind" answers what changed; "status" answers how far along it is. Each gets
# its own colored chip. Unrecognized values still render in a neutral color, so
# a new label never breaks the page.
KIND_COLORS = {
    "new feature": "#7048e8",
    "new": "#7048e8",
    "feature": "#7048e8",
    "improvement": "#0c8599",
    "fix": "#e8590c",
}
DEFAULT_KIND_COLOR = "#495057"

STATUS_COLORS = {
    "shipped": "#2b8a3e",
    "merged, pending release": "#2b8a3e",
    # keep: reports written against the older fix-shaped label still render
    "fixed, pending release": "#2b8a3e",
    "in progress": "#1971c2",
    "being looked into": "#1971c2",
    "planned": "#868e96",
}
DEFAULT_STATUS_COLOR = "#868e96"


DEFAULT_TITLE = "What's moving in the product right now"


def color_for(value, table, default):
    return table.get((value or "").strip().lower(), default)


def repo_list(data):
    """`repo` may be one string or several. Normalize to a list."""
    repo = data.get("repo")
    if not repo:
        return []
    return [repo] if isinstance(repo, str) else list(repo)


def short_repo(name):
    """`fedibtc/decentralized-federations` down to its repo name; a list joins."""
    if isinstance(name, (list, tuple)):
        return " + ".join(short_repo(n) for n in name)
    return str(name or "").split("/")[-1]


def repo_of_url(url):
    """Repo name from a GitHub URL, to qualify a reference as `repo#number`.

    Across repos a bare `#84` next to `#11748` reads as the same project's.
    """
    m = re.search(r"github\.com/[^/]+/([^/]+)/", str(url or ""))
    return m.group(1) if m else ""


# Raw GitHub titles often carry em/en dashes. Normalize them to a plain hyphen
# so the rendered report stays consistent and dash-clean.
_DASHES = {0x2014: "-", 0x2013: "-"}


def esc(text):
    return html.escape(str(text if text is not None else "").translate(_DASHES))


def link_label(link, qualify):
    num = link.get("number")
    prefix = repo_of_url(link.get("url")) if qualify else ""
    return f"{prefix}#{num}" if prefix else f"#{num}"


def links_md(links, qualify=False):
    parts = []
    for it in links or []:
        url = it.get("url", "")
        label = link_label(it, qualify)
        parts.append(f"[{label}]({url})" if url else label)
    return ", ".join(parts)


def render_markdown(data):
    """The quick, scannable briefing that lands in the chat."""
    lines = []
    intro = data.get("intro") or "Here's what's moving in the product right now, in plain language, most recently active first."
    when = data.get("generated_at", "")
    multi_repo = len(repo_list(data)) > 1
    lines.append(f"{intro}" + (f" _(as of {when})_" if when else ""))
    lines.append("")
    for i, item in enumerate(data.get("items", []), 1):
        lines.append(f"{i}. **{item.get('headline','').strip()}**")
        summary = (item.get("summary") or "").strip()
        if summary:
            lines.append(f"   {summary}")
        meta = []
        kind = item.get("kind")
        status = item.get("status")
        if kind and status:
            meta.append(f"{kind}, {status}")
        elif kind or status:
            meta.append(kind or status)
        if multi_repo and item.get("repo"):
            meta.append(f"In: {short_repo(item['repo'])}")
        if item.get("who"):
            meta.append(f"For: {item['who']}")
        links = links_md(item.get("links"), qualify=multi_repo)
        if links:
            meta.append(f"More detail: {links}")
        if meta:
            lines.append(f"   _{' · '.join(meta)}_")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_item_html(item, multi_repo=False):
    kind = item.get("kind", "")
    status = item.get("status", "")
    kind_chip = (
        f'<span class="chip" style="background:{color_for(kind, KIND_COLORS, DEFAULT_KIND_COLOR)}">{esc(kind)}</span>'
        if kind else ""
    )
    status_chip = (
        f'<span class="chip" style="background:{color_for(status, STATUS_COLORS, DEFAULT_STATUS_COLOR)}">{esc(status)}</span>'
        if status else ""
    )
    repo_chip = (
        f'<span class="chip repo-chip">{esc(short_repo(item.get("repo")))}</span>'
        if multi_repo and item.get("repo") else ""
    )
    last_active = (
        f'<span class="when">last active {esc(item.get("last_active"))}</span>'
        if item.get("last_active") else ""
    )

    link_rows = ""
    for it in item.get("links", []) or []:
        label = esc(link_label(it, multi_repo))
        url = esc(it.get("url", ""))
        title = esc(it.get("title", ""))
        link_rows += (
            f'<li><a href="{url}" target="_blank" rel="noopener">{label}</a> '
            f'<span class="link-title">{title}</span></li>'
        )
    links_block = f'<ul class="links">{link_rows}</ul>' if link_rows else ""

    detail = esc(item.get("detail", "")).replace("\n", "<br>")
    who = (
        f'<p class="who"><strong>Who this is for:</strong> {esc(item.get("who"))}</p>'
        if item.get("who") else ""
    )

    return f"""
    <article class="card">
      <div class="card-head">
        <h2>{esc(item.get('headline',''))}</h2>
        <div class="chips">{kind_chip}{status_chip}{repo_chip}{last_active}</div>
      </div>
      <p class="summary">{esc(item.get('summary',''))}</p>
      <details>
        <summary>More technical detail</summary>
        <div class="detail-body">
          {who}
          <p>{detail}</p>
          <p class="src-label">Related work on GitHub:</p>
          {links_block}
        </div>
      </details>
    </article>"""


def render_html(data):
    repos = repo_list(data)
    multi_repo = len(repos) > 1
    items_html = "\n".join(render_item_html(i, multi_repo) for i in data.get("items", []))
    generated = esc(data.get("generated_at", ""))
    repo = esc(", ".join(repos))
    title = esc(data.get("title") or DEFAULT_TITLE)
    count = len(data.get("items", []))
    intro = esc(data.get("intro", ""))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; background: #f6f7f9; margin: 0; line-height: 1.5;
  }}
  .wrap {{ max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }}
  header h1 {{ font-size: 26px; margin: 0 0 6px; }}
  header .sub {{ color: #6b7280; font-size: 14px; margin: 0 0 4px; }}
  header .intro {{ color: #374151; font-size: 16px; margin: 14px 0 28px; }}
  .card {{
    background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
    padding: 18px 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04);
  }}
  .card-head {{ display: flex; flex-direction: column; gap: 8px; }}
  .card-head h2 {{ font-size: 18px; margin: 0; line-height: 1.35; }}
  .chips {{ display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }}
  .chip {{
    color: #fff; font-size: 11px; font-weight: 600; letter-spacing: .02em;
    padding: 3px 9px; border-radius: 999px; text-transform: uppercase;
  }}
  .repo-chip {{ background: #f1f3f5; color: #495057; text-transform: none; letter-spacing: 0; }}
  .when {{ color: #9095a0; font-size: 12px; }}
  .summary {{ margin: 12px 0 8px; font-size: 15.5px; color: #1f2933; }}
  details {{ margin-top: 6px; border-top: 1px dashed #e5e7eb; padding-top: 8px; }}
  summary {{ cursor: pointer; color: #1971c2; font-size: 14px; font-weight: 500; user-select: none; }}
  summary:hover {{ text-decoration: underline; }}
  .detail-body {{ padding: 10px 2px 2px; font-size: 14.5px; color: #374151; }}
  .detail-body p {{ margin: 8px 0; }}
  .who {{ color: #1f2933; }}
  .src-label {{ color: #6b7280; font-size: 13px; margin-bottom: 4px !important; }}
  ul.links {{ margin: 4px 0 0; padding-left: 18px; }}
  ul.links li {{ margin: 2px 0; font-size: 14px; }}
  ul.links a {{ color: #1971c2; text-decoration: none; font-weight: 600; }}
  ul.links a:hover {{ text-decoration: underline; }}
  .link-title {{ color: #6b7280; }}
  footer {{ margin-top: 28px; color: #9095a0; font-size: 12.5px; text-align: center; }}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>{title}</h1>
      <p class="sub">{count} item{'s' if count != 1 else ''} - ranked by recent activity{f' - generated {generated}' if generated else ''}{f' - {repo}' if repo else ''}</p>
      <p class="intro">{intro}</p>
    </header>
    {items_html}
    <footer>
      Auto-generated from live GitHub activity. Each item links to the underlying work for the full engineering discussion.
    </footer>
  </div>
</body>
</html>
"""


def main():
    if len(sys.argv) != 3:
        print("usage: render_report.py <report.json> <out.html>", file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(render_html(data))
    # The inline briefing goes to stdout for the caller to relay into chat.
    sys.stdout.write(render_markdown(data))


if __name__ == "__main__":
    main()
