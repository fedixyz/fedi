#!/usr/bin/env python3
"""Render a next-release report from synthesized JSON.

Takes one JSON file describing the report (schema below) and:
  1. writes a self-contained HTML file with two tabs - a condensed product
     "Summary" (default) for a non-technical reader, and a detailed "Full report"
     with the PR-by-PR breakdown and milestone hygiene, and
  2. prints a short markdown briefing to stdout for the caller to relay in chat.

Both outputs come from the SAME JSON, so the quick briefing and the rich report
can never disagree. The model's only job is to produce good JSON; all the fiddly,
repetitive HTML formatting lives here.

Usage:
  python3 render_report.py <report.json> <out.html>

Design choices that matter (learned the hard way, keep them):
  - THE TWO TABS ARE DIFFERENT ALTITUDES, enforced here rather than trusted to
    the prose. Every sha, tag, baseline, merge-base, day count and PR number
    belongs on Full report. Summary gets a scope line (which apps, anything
    unusual about this release), the store release notes, and the cards.
  - DARK BY DEFAULT, with a light toggle that persists to localStorage. Do not
    hardcode a hex outside the two :root blocks, or one theme breaks.
  - Two release tracks, always. Native and web have different "already released"
    baselines, so a single current version is always wrong for one of them.
    That state is Full report's. The Summary says which apps a release
    updates and never where the release is in the pipeline.
  - MERGED IS THE LINE BETWEEN THE TWO CARD SECTIONS. "In this release"
    holds only work on master and its cards carry no status chip, because the
    section is the status. Milestone work that has not merged renders in a
    collapsed "Not in this release yet" section with an In progress or Planned
    chip. The renderer warns when a card sits on the wrong side.
  - THE SUMMARY SPEAKS PRODUCT, NEVER WORKFLOW. Its reader does not know what
    a PR, a merge or a cut is. The renderer scans that tab for workflow
    vocabulary and warns on every hit.
  - Nothing says "Shipped". Merged to master is not released. "Shipped"/live
    means a production flag is on, which this report does not assert.
  - No em or en dashes anywhere in output. Use a regular hyphen. (Repo rule.)
  - Chips never wrap mid-word (white-space:nowrap); the chip row wraps whole
    pills instead.
  - A feature flag's column, and whether it is going live, come from its now
    and next values, so a chip cannot claim a change the values do not show.

See SKILL.md for the JSON schema and how to fill it.
"""
import html
import json
import re
import sys

SITE = "https://release-notes.apps.fedibtc.com"

# ---- chip vocab -> color class -------------------------------------------
KIND_CLS = {"New feature": "k-feat", "Improvement": "k-imp", "Fix": "k-fix"}
STATUS_CLS = {"Pending release": "s-ship", "In progress": "s-prog", "Planned": "s-plan"}

# Milestone-issue status -> badge. "done" = a merged window PR addresses it;
# "inprogress" = an open PR ready for review; "pending" = a draft PR or no PR;
# "backport" = its fix ships in the patch, not the next major.
STATUS_BADGE = {
    "done": '<span class="badge ok">on master</span>',
    "pending": '<span class="badge wait">no PR, or only a draft</span>',
    "backport": '<span class="badge bp">ships in the backport</span>',
    "inprogress": '<span class="badge prog">open PR, not merged</span>',
    "closed": '<span class="badge ok">closed / done</span>',
}

# "All Issues" is the QA board's default bucket, so it means nobody triaged the issue,
# not that it failed.
QA_PASSED = "Passed Test"
QA_UNTRIAGED = {"All Issues", "(not on the board)", "NOT FOUND", ""}
QA_TROUBLE = {"Failed Test", "Testing Blocked", "Unable to Test", "Not Tested"}
DEV_DONE = "Ready for Prod"
DEV_MOVING = {"In Progress", "Code Review", "QA"}
DEV_BLOCKED = {"Blocked", "Blocked by Design"}


WARNINGS = []


def warn(msg):
    if msg not in WARNINGS:
        WARNINGS.append(msg)


def budget(text, limit, field):
    """Summary-tab copy is a glance, so overruns are a defect in the JSON rather
    than something to silently render."""
    if text and len(text) > limit:
        warn(f"{field} is {len(text)} chars, over {limit}. Trim it or move it to the full report.")


def esc(text):
    return html.escape(str(text if text is not None else ""))


def pr_url(repo, n):
    return f"https://github.com/{repo}/pull/{n}"


def iss_url(repo, n):
    return f"https://github.com/{repo}/issues/{n}"


def board_of(row):
    return row.get("board") or {}


def has_board(rows):
    return any(board_of(r) for r in rows or [])


def board_chip(name, which):
    if not name:
        return '<span class="badge none">no board record</span>'
    if which == "qa":
        cls = "ok" if name == QA_PASSED else "wait" if name in QA_TROUBLE else "none"
    else:
        cls = "ok" if name == DEV_DONE else "prog" if name in DEV_MOVING else "wait" if name in DEV_BLOCKED else "none"
    return f'<span class="badge {cls}">{esc(name)}</span>'


def qa_split(rows):
    """Untriaged is the big bucket and the one that gets misread as a failure, so it never
    merges into either of the others."""
    passed, flagged, untriaged = [], [], []
    for r in rows or []:
        q = board_of(r).get("qa")
        if q == QA_PASSED:
            passed.append(r)
        elif q in QA_TROUBLE:
            flagged.append(r)
        else:
            untriaged.append(r)
    return passed, flagged, untriaged


def review_url(repo, rows):
    """Bare issue numbers are indexed as search terms, so a space-joined list of them
    resolves to exactly those issues. Rewriting this into a tidier-looking query breaks it."""
    if not rows:
        return ""
    nums = "+".join(str(r["number"]) for r in rows)
    return f"https://github.com/{repo}/issues?q=is%3Aissue+{nums}"


# --------------------------------------------------------------------------
# Release scope (Summary) and release tracks (Full report).
# --------------------------------------------------------------------------
# Fixed slot order, so android-only and ios-only read off the same positions.
PLATFORM_ORDER = ("ios", "android", "web")
PLATFORM_LABEL = {"ios": "iOS", "android": "Android", "web": "Web app"}
PLATFORM_SVG = {
    "ios": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.4 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z"/></svg>',
    "android": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5h12v7.2a1 1 0 0 1-1 1h-.9v2.6a1.2 1.2 0 1 1-2.4 0v-2.6h-1.5v2.6a1.2 1.2 0 1 1-2.4 0v-2.6H9a1 1 0 0 1-1-1V9.5H6zm-1.6 0a1.2 1.2 0 0 1 1.2 1.2v4.1a1.2 1.2 0 1 1-2.4 0v-4.1a1.2 1.2 0 0 1 1.2-1.2zm15.2 0a1.2 1.2 0 0 1 1.2 1.2v4.1a1.2 1.2 0 1 1-2.4 0v-4.1a1.2 1.2 0 0 1 1.2-1.2zM8.1 8.4a4.4 4.4 0 0 1 7.8 0zM9.6 5.9a.55.55 0 1 0 0-1.1.55.55 0 0 0 0 1.1zm4.8 0a.55.55 0 1 0 0-1.1.55.55 0 0 0 0 1.1zM8.7 3.3l-.9-1.5a.3.3 0 0 1 .5-.3l.9 1.6zm6.6 0-.5-.2.9-1.6a.3.3 0 0 1 .5.3z"/></svg>',
    "web": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.7A8 8 0 0 1 18.9 8zM12 4.1c.7 1 1.3 2.3 1.7 3.9h-3.4c.4-1.6 1-2.9 1.7-3.9zM4.3 14a8 8 0 0 1 0-4h3.3a17.6 17.6 0 0 0 0 4zm.8 2h2.9c.3 1.4.8 2.6 1.4 3.7A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.7A15.6 15.6 0 0 0 8 8zM12 19.9c-.7-1-1.3-2.3-1.7-3.9h3.4c-.4 1.6-1 2.9-1.7 3.9zm2.1-5.9H9.9a15.5 15.5 0 0 1 0-4h4.2a15.5 15.5 0 0 1 0 4zm.5 5.7c.6-1.1 1.1-2.3 1.4-3.7h2.9a8 8 0 0 1-4.3 3.7zm1.8-5.7a17.6 17.6 0 0 0 0-4h3.3a8 8 0 0 1 0 4z"/></svg>',
}

PLATFORM_JS = json.dumps({"order": list(PLATFORM_ORDER), "label": PLATFORM_LABEL})
SCOPE_WORDS = {
    ("ios", "android", "web"): "native app and web app",
    ("ios", "android"): "native app, iPhone and Android",
    ("ios",): "native app, iPhone only",
    ("android",): "native app, Android only",
    ("web",): "web app only",
    ("ios", "web"): "iPhone and the web app",
    ("android", "web"): "Android and the web app",
}
PROGRESS_WORDS = (
    r"\bnot out\b", r"\bbeing built\b", r"\bin (app store |store )?review\b", r"\bwould carry\b",
    r"\bwaiting\b", r"\bpending\b", r"\bawaiting\b", r"\bsubmitted\b", r"\bin flight\b",
    r"\bnot started\b", r"\bnot cut\b", r"\bnot yet\b",
)

LAYOUTS = (("all", "All"), ("status", "Status"), ("platform", "Platform"))
# Every merged card has the same status, so grouping on it yields one panel.
MERGED_LAYOUTS = tuple(l for l in LAYOUTS if l[0] != "status")
NOT_MERGED_STATUSES = ("In progress", "Planned")

SUMMARY_JARGON = (
    r"\bPRs?\b", r"\bpull requests?\b", r"\bmerged?s?\b", r"\bmaster\b", r"\bbranch(es)?\b",
    r"\bcommits?\b", r"\btags?\b", r"\btagged\b", r"\bcut\b", r"\bmilestones?\b",
    r"\bbackports?\b", r"\bcherry-pick", r"\bdeploy(ed|s|ment)?\b", r"\b(code|under|in) review\b",
    r"\bCI\b", r"\bnightly\b", r"\bQA\b", r"\bzenhub\b", r"\bboards?\b", r"\bupstream\b",
    r"\bcrates?\b", r"\bwasm\b", r"\bbridge\b", r"\bsha\b", r"#\d{3,}", r"\b[0-9a-f]{7,40}\b",
)


def scan_summary_jargon(summary_html):
    text = html.unescape(re.sub(r"<[^>]+>", " ", summary_html))
    for pat in SUMMARY_JARGON:
        for m in re.finditer(pat, text, re.I):
            s, e = max(0, m.start() - 40), min(len(text), m.end() + 40)
            snippet = re.sub(r"\s+", " ", text[s:e]).strip()
            warn(f"summary tab says {m.group(0)!r} in \"...{snippet}...\". That is workflow "
                 "vocabulary. Rewrite the sentence for a reader who does not know the release process.")


def summary_platforms(summary):
    """Explicit summary.platforms wins. Otherwise the union of what the merged
    cards land on, so an iOS-only release reads iOS-only without being told."""
    p = summary.get("platforms")
    if p:
        return [x for x in PLATFORM_ORDER if x in p]
    cards = merged_cards(summary)
    return [x for x in PLATFORM_ORDER if any(x in card_platforms(it) for it in cards)]


def merged_cards(summary):
    """Every card that is on master: the main grids plus the audience sections."""
    cards = [it for key in ("features", "fixes") for it in summary.get(key) or []]
    for sec in summary.get("sections") or []:
        cards += [it for key in ("features", "fixes") for it in sec.get(key) or []]
    return cards


def scope_words(plats):
    return SCOPE_WORDS.get(tuple(plats)) or " and ".join(PLATFORM_LABEL[p] for p in plats)


def summary_quirks(data):
    """The patch headline is a quirk too. Its fallback sentence is generated only
    for a report about a different release: on a report about the patch itself
    the scope line already says what the patch is."""
    s = data.get("summary") or {}
    quirks = [q for q in (s.get("quirks") or []) if q]
    bp = data.get("backport") or {}
    if bp.get("in_progress"):
        headline = bp.get("headline")
        if not headline and bp.get("version") != data.get("next_release"):
            n = len(bp.get("items", []))
            headline = f'{bp.get("version", "A patch")} goes out first with {n} fix{"es" if n != 1 else ""}, not counted here.'
            warn("backport has no 'headline', so the quirk line is generated. Write one sentence "
                 "a non-technical reader gets. See SKILL.md step 8.")
        if headline:
            quirks.append(headline)
    for q in quirks:
        budget(q, 140, "summary quirk")
        for pat in PROGRESS_WORDS:
            m = re.search(pat, q, re.I)
            if m:
                warn(f"summary quirk says {m.group(0)!r} in \"{q}\". The scope line describes the "
                     "release, not its progress. Drop the clause, or move it to the tracks block on Full report.")
                break
    return quirks


def release_scope(data):
    """Nothing here about where the release is in the pipeline. That is
    track_cards() on Full report."""
    s = data.get("summary") or {}
    plats = summary_platforms(s)
    if not plats:
        warn("summary.platforms is empty and no merged card names a platform, so the scope line "
             "cannot say which apps this release updates. Set summary.platforms.")
    ver = data.get("next_release") or ""
    row = [f'<div class="scope-row"><span class="scope-ver">{esc(ver)}</span>']
    if plats:
        row.append(platform_marks(plats, "pmarks scope-marks"))
        row.append(f'<span class="scope-words">{esc(scope_words(plats))}</span>')
    row.append('</div>')
    quirks = "".join(f'<div class="quirk">{esc(q)}</div>' for q in summary_quirks(data))
    return f'<div class="scope">{"".join(row)}{quirks}</div>'


def store_notes_block(summary):
    """The store text sits on the Summary so the people who sign it off read it
    next to the cards it was written from."""
    rn = summary.get("release_notes") or {}
    store = rn.get("store")
    if not store:
        if not {"ios", "android"} & set(summary_platforms(summary)):
            return ""
        warn("summary.release_notes.store is missing, so the Summary carries no store release notes. "
             "Write it from the cards by references/release-notes-copy.md. See SKILL.md step 7.")
        return ""
    budget(store, 500, "summary.release_notes.store")
    out = ['<section class="notes"><div class="notes-label">Public release notes</div>',
           f'<p class="notes-store">{esc(store)}</p>']
    out.append('</section>')
    return "\n".join(out)


def track_cards(tracks):
    """Full-report detail. Native and web are cut and deployed independently, so keep
    both rows even when one track has nothing queued."""
    if not tracks:
        return ""
    out = ['<div class="tracks">']
    for key, label in (("native", "Native app"), ("web", "Web app")):
        t = tracks.get(key)
        if not t:
            continue
        rows = []
        for field, lbl in (("current", "In production"), ("next", "Next up"),
                           ("baseline", "Released baseline"), ("in_window", "Queued since then"),
                           ("milestone", "Milestone")):
            if t.get(field):
                rows.append(f'<div class="trow"><span class="tk">{lbl}</span>'
                            f'<span class="tv">{esc(t[field])}</span></div>')
        note = f'<p class="tnote">{esc(t["note"])}</p>' if t.get("note") else ""
        out.append(f'<div class="track"><div class="thead">{label}</div>'
                   + "".join(rows) + note + '</div>')
    out.append('</div>')
    return "\n".join(out)


# --------------------------------------------------------------------------
# Summary tab (condensed, product voice)
# --------------------------------------------------------------------------
def card_platforms(it):
    """Explicit `platforms` wins, so a card can say android-only. Otherwise fall
    back to the coarse `track`, where Native means both phone platforms."""
    p = it.get("platforms")
    if p:
        return [x for x in PLATFORM_ORDER if x in p]
    track = (it.get("track") or "").lower()
    if "native" in track and "web" in track:
        return ["ios", "android", "web"]
    if "native" in track:
        return ["ios", "android"]
    if "web" in track:
        return ["web"]
    return []


def platform_marks(active, cls="pmarks"):
    """Emits all three slots every time; inactive ones render dimmed in place."""
    if not active:
        return ""
    cells = []
    for p in PLATFORM_ORDER:
        on = p in active
        cells.append(f'<span class="pm{"" if on else " off"}" data-p="{p}" '
                     f'title="{PLATFORM_LABEL[p]}{"" if on else " (not affected)"}">'
                     f'{PLATFORM_SVG[p]}</span>')
    label = " and ".join(PLATFORM_LABEL[p] for p in active)
    return f'<span class="{cls}" aria-label="{esc(label)}">{"".join(cells)}</span>'


def summary_cards(items, section, with_status):
    """`with_status` is on for the not-merged grid only. Every card in "What users
    will get" is on master, so a status chip there would restate the section."""
    out = []
    for it in items:
        name = f'summary.{section} card "{it.get("headline","")}"'
        budget(it.get("summary"), 300, name)
        kind, status = it.get("kind", ""), it.get("status", "")
        if with_status and status not in NOT_MERGED_STATUSES:
            warn(f"{name} has status {status!r}. A not-merged card is 'In progress' (an open PR "
                 "ready for review) or 'Planned' (a draft or no PR). Merged work goes in features or fixes.")
        elif not with_status and status and status != "Pending release":
            warn(f"{name} has status {status!r} in a merged-only section. Move it to "
                 "summary.not_merged, or drop the status if it is on master.")
        badge = it.get("badge") or ""
        badge_html = f'<span class="flagbadge">{esc(badge)}</span>' if badge else ""
        tag = it.get("tag") or ""
        badge_html = (f'<span class="tagchip">{esc(tag)}</span>' if tag else "") + badge_html
        status_html = (f'<span class="chip {STATUS_CLS.get(status,"")}">{esc(status)}</span>'
                       if with_status else "")
        plats = card_platforms(it)
        body = it.get("summary") or ""
        body_html = f'<p class="ssum">{esc(body)}</p>' if body else ""
        out.append(
            f'<article class="scard" data-plat="{" ".join(plats)}" '
            f'data-status="{esc(status)}" data-kind="{esc(kind)}">'
            f'<div class="schips"><span class="chip {KIND_CLS.get(kind,"")}">{esc(kind)}</span>'
            f'{status_html}{badge_html}{platform_marks(plats)}</div>'
            f'<h3 class="shead">{esc(it.get("headline",""))}</h3>'
            f'{body_html}</article>'
        )
    return "\n".join(out)


def not_merged_section(summary):
    """Collapsed under the merged cards, so a reader who stops at "What users will
    get" has only read things that are on master."""
    for old in ("planned_keep", "planned_park"):
        if summary.get(old):
            warn(f"summary.{old} is no longer rendered. Write each item as a card in "
                 "summary.not_merged with status 'Planned'.")
    items = summary.get("not_merged") or []
    if not items:
        return ""
    prog = sum(1 for it in items if it.get("status") == "In progress")
    plan = len(items) - prog
    bits = [f"{n} {label}" for n, label in ((prog, "in progress"), (plan, "planned")) if n]
    return "\n".join([
        '<details class="cardsec tucked" id="notmerged">',
        '<summary><span class="chev" aria-hidden="true"></span><span>Not in this release yet</span>'
        f'<span class="cnt">{len(items)}</span><span class="tknote">{esc(", ".join(bits))}</span></summary>',
        '<div class="tbody">',
        f'<div class="h2row thead2"><p class="sub">Planned for this release and not in it. In progress means a fix '
        f'exists and is being checked. Planned means no fix exists yet.</p>{layout_switch(LAYOUTS)}</div>',
        f'<div class="scards" data-grid>{summary_cards(items, "not_merged", True)}</div>',
        '</div></details>'])


FLAG_STATES = ("on", "off", "edge")
FLAG_COLS = ("go", "stop", "off", "live")
FLAG_SVG = {
    "flag": '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4 2.5 4H5"/>',
    "group": '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .3 5.5 2.8 5.5 5.8"/>',
    "bank": '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
    "key": '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
    "shield": '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    "smile": '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><path d="M9 10h.01M15 10h.01" stroke-width="2.6"/>',
    "lock": '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    "dollar": '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.6c-.4-1-1.4-1.6-2.6-1.6-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.2 0-2.2-.6-2.6-1.6M12 6.5v11"/>',
    "update": '<circle cx="12" cy="12" r="9"/><path d="M12 16.5V8M8.5 11.5L12 8l3.5 3.5"/>',
    "restart": '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
    "chat": '<path d="M4 5h16v11H9l-5 4z"/>',
    "send": '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
}
FLAG_INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6h.01" stroke-width="2.6"/>'
FLAG_ONLY = {
    ("ios", "android"): "Native app", ("web",): "Web app", ("ios",): "iPhone only",
    ("android",): "Android only", ("ios", "web"): "iPhone and the web app",
    ("android", "web"): "Android and the web app",
}
FLAG_TIP = ("Unreleased", "In the app and switched off in production. It is on in Nightly, Fedi's internal test build.")


def flag_svg(path, cls):
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{path}</svg>')


def flag_column(f):
    """go turns on with this release, stop turns off, off stays off, live was already on.
    Fedi Edge follows master rather than releases, so Edge only counts as off."""
    if f.get("next") == "on":
        return "live" if f.get("now") == "on" else "go"
    return "stop" if f.get("now") == "on" else "off"


def flag_plats(f):
    return [p for p in PLATFORM_ORDER if p in (f.get("platforms") or PLATFORM_ORDER)]


def flag_touch(f):
    return [t if isinstance(t, list) else [t] for t in f.get("touch") or [] if t]


def flag_order(items):
    newest = sorted(items, key=lambda f: (f.get("added") or "", f.get("order", -1)), reverse=True)
    return sorted(newest, key=lambda f: FLAG_COLS.index(flag_column(f)) if f.get("next") else len(FLAG_COLS))


def flag_items(data):
    items = [f for f in (data.get("flags") or {}).get("items") or [] if f.get("key")]
    for f in items:
        name = f'flags item "{f["key"]}"'
        for field in ("now", "next", "after"):
            if f.get(field) not in (None, *FLAG_STATES):
                warn(f"{name} has {field} {f.get(field)!r}. Use on, off, edge, or null when the flag does not exist.")
        if f.get("next") is None:
            if f.get("now") is not None and f.get("after") not in ("on", "off"):
                warn(f"{name} is removed in this release with no 'after'. Set after to on when the feature "
                     "stays, or off when it goes with the switch.")
            continue
        if not f.get("name") or not f.get("does"):
            warn(f"{name} has no name or does. Name the feature the way a person would, and say in one "
                 "sentence what it lets them do. See SKILL.md, Feature flags.")
        if not flag_touch(f):
            warn(f"{name} has no touch list, so its details do not say what the flag changes in the app. "
                 "Write one line per place a person sees a difference. See SKILL.md, Feature flags.")
        if f.get("icon") and f["icon"] not in FLAG_SVG:
            warn(f"{name} has icon {f['icon']!r}. Use one of {', '.join(FLAG_SVG)}.")
        if f.get("off_note"):
            warn(f"{name} has an off_note, which is no longer rendered. Put what a person keeps while the "
                 "flag is off into its touch lines.")
        budget(f.get("does"), 140, f"{name} does")
    return items


def flag_chip(f):
    col = flag_column(f)
    icon = FLAG_SVG.get(f.get("icon")) or FLAG_SVG["flag"]
    group = "u" if col in ("off", "stop") else "g" if col == "go" else "p"
    return (f'<div class="fchip {col}" tabindex="0" role="button" aria-haspopup="dialog" '
            f'data-f="{esc(f["key"])}" data-col="{group}" data-plat="{" ".join(flag_plats(f))}">'
            f'{flag_svg(icon, "fic")}<span class="fn">{esc(f.get("name") or f["key"])}</span>'
            f'{flag_svg(FLAG_INFO, "finfo")}</div>')


def flag_pop(f, repo):
    update = "Changes only with an app update" if f.get("control") == "app" else None
    meta = " · ".join(x for x in (f.get("who"), FLAG_ONLY.get(tuple(flag_plats(f))), update) if x)
    rows = []
    for t in flag_touch(f):
        where = f'<span class="w">{esc(t[1])}</span>' if len(t) > 1 and t[1] else ""
        rows.append(f"<li>{esc(t[0])}{where}</li>")
    pr = f.get("pr") or f.get("added_pr")
    ref = [f'Flag <code>{esc(f["key"])}</code>']
    if pr:
        ref.append(f'<a href="{pr_url(repo, pr)}" target="_blank" rel="noopener">#{esc(pr)}</a>')
    body = (f'<div class="pn">{esc(f.get("name") or f["key"])}</div><div class="pd">{esc(f.get("does", ""))}</div>'
            + (f'<div class="pm">{esc(meta)}</div>' if meta else "")
            + '<details><summary>Details</summary>'
            + (f'<div class="tl">What the flag changes in the app</div><ul>{"".join(rows)}</ul>' if rows else "")
            + f'<div class="pf">{" · ".join(ref)}</div></details>')
    return f'<template id="fp-{esc(f["key"])}">{body}</template>'


def flags_section(data):
    """Open only when a feature goes live with this release."""
    if "flags" not in data:
        warn("no 'flags' block, so the Summary cannot say which features are live. "
             "Copy it from window.json. See SKILL.md, Feature flags.")
    shown = [f for f in flag_order(flag_items(data)) if f.get("next")]
    if not shown:
        return ""
    rel = esc(data.get("next_release") or "this release")
    by = {c: [f for f in shown if flag_column(f) == c] for c in FLAG_COLS}

    def group(fs, label=""):
        if not fs:
            return ""
        head = f'<div class="flbl">{label}</div>' if label else ""
        return f'<div class="fgrp">{head}{"".join(flag_chip(f) for f in fs)}</div>'

    def badge(cls, label, of, n):
        return (f'<span class="fbadge {cls}"{"" if n else " hidden"}><span class="fdot"></span>{label}'
                f'<b class="fcount" data-of="{of}">{n}</b></span>')

    unreleased = by["stop"] + by["off"]
    live = by["live"]
    live_html = ""
    if live:
        live_html = ('<details class="flive fgrp"><summary class="flbl"><span class="chev" aria-hidden="true"></span>'
                     f'Live features<b class="fcount" data-of="p">{len(live)}</b></summary>'
                     f'{"".join(flag_chip(f) for f in live)}</details>')
    tip = flag_svg(FLAG_INFO, "finfo")
    out = [f'<details class="tucked flags" id="flags"{" open" if by["go"] else ""}>',
           '<summary><span class="chev" aria-hidden="true"></span><span>Feature flags</span><span class="fbadges">',
           badge("b-u", "Unreleased", "u", len(unreleased)), badge("b-g", "Going live", "g", len(by["go"])),
           badge("b-p", "Live", "p", len(live)), '</span></summary>',
           '<div class="fbody"><div class="fline">',
           '<div class="fst fu"><div class="fsth"><span class="fdot2"></span>'
           f'<span class="ftip" tabindex="0" role="button" aria-haspopup="dialog" data-tip="unreleased">Unreleased{tip}</span></div>'
           f'<div class="fstb">{group(by["stop"], f"Switching off in {rel}")}{group(by["off"])}</div></div>',
           '<div class="fst fp"><div class="fsth"><span class="fdot2"></span>Production</div>'
           f'<div class="fstb">{group(by["go"], f"Going live in {rel}")}{live_html}</div></div>',
           '</div></div></details>']
    repo = data.get("repo", "")
    out.append(f'<template id="fp-unreleased"><div class="pn">{esc(FLAG_TIP[0])}</div>'
               f'<div class="pd">{esc(FLAG_TIP[1])}</div></template>')
    out.extend(flag_pop(f, repo) for f in shown)
    return "\n".join(out)


def pending_counts(data):
    """Milestone issues with an open fix vs no code at all. Two different trades, so
    they are never summed. The web milestone ships on its own schedule, so it never counts here."""
    ms = data.get("milestones") or {}
    pend = prog = 0
    for i in (ms.get("next_major") or {}).get("issues") or []:
        if i.get("status") == "pending":
            pend += 1
        elif i.get("status") == "inprogress":
            prog += 1
    return pend, prog


def decision_exit(data):
    """Counts and the trade only, on Full report. It is an ask of the release owner,
    so it stays off the Summary."""
    pend, prog = pending_counts(data)
    items = []
    if prog or pend:
        line = "Whether to release now. "
        if prog:
            line += (f"{prog} item{'s' if prog != 1 else ''} in progress would make it if the release "
                     f"waits for {'their' if prog != 1 else 'its'} fix. ")
        if pend:
            many = pend != 1
            line += (f"{pend} ha{'ve' if many else 's'} no fix ready, so waiting does nothing for "
                     f"{'them' if many else 'it'}: {'they' if many else 'it'} either hold{'' if many else 's'} "
                     f"the release or move{'' if many else 's'} to the next one.")
        items.append(f"<li>{line.strip()}</li>")
    qa = qa_exit_line(data)
    if qa:
        items.append(qa)
    if not items:
        return ""
    return ('<div class="exit"><div class="exit-label">What needs a decision</div><ul>'
            + "\n".join(items) + '</ul></div>')


def qa_exit_line(data):
    """Counts only. The issue lists are in the milestone tables."""
    uniq = release_issues(data)
    if not has_board(uniq):
        return ""
    passed, flagged, untriaged = qa_split(uniq)
    line = f"Whether to release with {len(passed)} of {len(uniq)} changes signed off by a tester. "
    if untriaged:
        line += f"{len(untriaged)} get their first test on the release build. "
    if flagged:
        line += f"{len(flagged)} came back failed or blocked and need a call first."
    return f"<li>{line.strip()}</li>"


def layout_switch(layouts):
    btns = "".join(
        f'<button class="lbtn{" active" if key == "all" else ""}" data-layout="{key}">{esc(lbl)}</button>'
        for key, lbl in layouts)
    return (f'<div class="lswitch"><span class="lswitch-l">Layout</span>{btns}'
            '<button class="lbtn lall" hidden>Expand all</button></div>')


def audience_section(sec):
    """A section for one audience, such as federation creators on Manifold, drawn as a tinted panel after the main grids."""
    feats, fixes = sec.get("features") or [], sec.get("fixes") or []
    tag = sec.get("tag") or ""
    if tag:
        feats = [dict(it, tag=it.get("tag", tag)) for it in feats]
        fixes = [dict(it, tag=it.get("tag", tag)) for it in fixes]
    sid = esc(sec.get("id") or tag.lower() or "audience")
    cls = "cardsec tagsec" if tag else "cardsec"
    tag_html = f'<span class="sectag">{esc(tag)}</span>' if tag else ""
    out = [f'<section class="{cls}" id="{sid}">',
           f'<div class="h2row"><h2>{tag_html}{esc(sec.get("title", ""))}</h2></div>']
    if sec.get("note"):
        budget(sec["note"], 240, f"summary.sections {sid} note")
        out.append(f'<p class="secnote">{esc(sec["note"])}</p>')
    if feats:
        if fixes:
            out.append('<div class="subhead" data-sub>New features and improvements</div>')
        out.append(f'<div class="scards" data-grid>{summary_cards(feats, sid, False)}</div>')
    if fixes:
        if feats:
            out.append('<div class="subhead" data-sub>Fixes</div>')
        out.append(f'<div class="scards" data-grid>{summary_cards(fixes, sid, False)}</div>')
    out.append('</section>')
    return "\n".join(out)


def platform_filter(summary):
    """`?platform=web` in the URL preselects a button, so a release can link its own view."""
    cards = merged_cards(summary) + list(summary.get("not_merged") or [])
    present = [p for p in PLATFORM_ORDER if any(p in card_platforms(it) for it in cards)]
    if len(present) < 2:
        return ""
    btns = ['<button class="lbtn active" data-p="">All</button>']
    btns += [f'<button class="lbtn" data-p="{p}">{PLATFORM_LABEL[p]}</button>' for p in present]
    return ('<div class="lswitch pfilter" role="group" aria-label="Show changes for">'
            '<span class="lswitch-l">Show changes for</span>' + "".join(btns) + '</div>')


def render_summary(data):
    s = data.get("summary", {})
    budget(s.get("title"), 90, "summary.title")
    budget(s.get("lede"), 240, "summary.lede")
    parts = [f'<h1>{esc(s.get("title","At a glance"))}</h1>']
    if s.get("lede"):
        parts.append(f'<p class="lede">{esc(s["lede"])}</p>')
    tracks = data.get("tracks") or {}
    if tracks.get("focus") or any(isinstance(tracks.get(k), dict) and tracks[k].get("glance") for k in ("native", "web")):
        warn("tracks.focus and tracks.*.glance are no longer read. The Summary describes the release "
             "through summary.platforms and summary.quirks, and the pipeline state stays on Full report.")
    parts.append(release_scope(data))
    parts.append(store_notes_block(s))
    parts.append(platform_filter(s))
    parts.append(flags_section(data))
    main_cards = [it for key in ("features", "fixes") for it in s.get(key) or []]
    if main_cards:
        sw = layout_switch(MERGED_LAYOUTS) if len({tuple(card_platforms(it)) for it in main_cards}) > 1 else ""
        merged = ['<section class="cardsec" id="merged">',
                  f'<div class="h2row"><h2>In this release</h2>{sw}</div>']
        if s.get("features"):
            merged.append('<div class="subhead" data-sub>New features and improvements</div>')
            merged.append(f'<div class="scards" data-grid>{summary_cards(s["features"], "features", False)}</div>')
        if s.get("fixes"):
            merged.append('<div class="subhead" data-sub>Fixes</div>')
            merged.append(f'<div class="scards" data-grid>{summary_cards(s["fixes"], "fixes", False)}</div>')
        merged.append('</section>')
        parts.append("\n".join(merged))
    parts.extend(audience_section(sec) for sec in s.get("sections") or [])
    parts.append(not_merged_section(s))
    parts.append('<p class="sub" style="margin-top:22px">Every change in full is on the <b>Full report</b> tab.</p>')
    out = "\n".join(p for p in parts if p)
    # flag footers name the key and PR, and the Unreleased tip names Nightly, so the scan skips both.
    scan_summary_jargon(re.sub(r'<div class="pf">.*?</div>|<template id="fp-unreleased">.*?</template>', "", out, flags=re.S))
    return out


# --------------------------------------------------------------------------
# Full report tab
# --------------------------------------------------------------------------
def theme_groups(groups, repo):
    out = []
    for g in groups or []:
        prs = g.get("prs", [])
        out.append(f'<h4>{esc(g.get("theme",""))} <span class="cnt">{len(prs)}</span></h4>')
        out.append('<ul class="prlist">')
        for p in prs:
            iss = p.get("issue")
            iss_html = f' <span class="iss">{esc(iss)}</span>' if iss and iss != "-" else ""
            meta = " ".join(x for x in [esc(p.get("author", "")), esc(p.get("date", ""))] if x)
            out.append(f'<li><a href="{pr_url(repo, p["number"])}">#{esc(p["number"])}</a> '
                       f'{esc(p.get("title",""))}{iss_html} <span class="meta">{meta}</span></li>')
        out.append('</ul>')
    return "\n".join(out)


def full_pr_table(all_prs, repo):
    rows = []
    for p in sorted(all_prs or [], key=lambda x: x.get("date", "")):
        cat = p.get("category", "")
        catcls = "uf" if cat == "user" else "nf"
        catlabel = "User-facing" if cat == "user" else "Internal"
        iss = p.get("issue", "")
        iss = "" if iss in ("-", None) else esc(iss)
        rows.append(
            f'<tr><td><a href="{pr_url(repo, p["number"])}">#{esc(p["number"])}</a></td>'
            f'<td>{esc(p.get("title",""))}</td>'
            f'<td><span class="pill {catcls}">{catlabel}</span></td>'
            f'<td>{esc(p.get("theme",""))}</td><td>{iss}</td>'
            f'<td class="nowrap">{esc(p.get("author",""))}</td>'
            f'<td class="nowrap">{esc(p.get("date",""))}</td></tr>'
        )
    return "\n".join(rows)


def milestone_table(issues, repo):
    board = has_board(issues)
    head = '<tr><th>Issue</th><th>Title</th><th>Status on master</th>'
    head += '<th>Dev board</th><th>QA board</th>' if board else ''
    out = [f'<thead>{head}</tr></thead><tbody>']
    for it in issues or []:
        badge = STATUS_BADGE.get(it.get("status", ""), esc(it.get("status", "")))
        cells = ""
        if board:
            b = board_of(it)
            cells = f'<td>{board_chip(b.get("dev"), "dev")}</td><td>{board_chip(b.get("qa"), "qa")}</td>'
        out.append(f'<tr><td><a href="{iss_url(repo, it["number"])}">#{esc(it["number"])}</a></td>'
                   f'<td>{esc(it.get("title",""))}</td><td>{badge}</td>{cells}</tr>')
    out.append('</tbody>')
    return "\n".join(out)


def needs_table(rows, repo):
    board = has_board(rows)
    head = '<tr><th>Issue</th><th>Title</th><th>Resolved by</th><th>Suggested</th>'
    head += '<th>QA board</th>' if board else ''
    out = [f'<thead>{head}</tr></thead><tbody>']
    for r in rows or []:
        prs = ", ".join(f'<a href="{pr_url(repo, n)}">#{esc(n)}</a>' for n in r.get("resolved_by", []))
        qa = f'<td>{board_chip(board_of(r).get("qa"), "qa")}</td>' if board else ""
        out.append(f'<tr><td><a href="{iss_url(repo, r["number"])}">#{esc(r["number"])}</a></td>'
                   f'<td>{esc(r.get("title",""))}</td><td>{prs}</td>'
                   f'<td><span class="pill sug">{esc(r.get("suggested",""))}</span></td>{qa}</tr>')
    out.append('</tbody>')
    return "\n".join(out)


def release_issues(data):
    """Milestone issues and untagged-but-resolved issues overlap, and counting one twice
    inflates the QA numbers. The web milestone ships on its own schedule, so it is left out."""
    ms = data.get("milestones") or {}
    rows = list((ms.get("next_major") or {}).get("issues") or [])
    rows += data.get("needs_milestone") or []
    seen, uniq = set(), []
    for r in rows:
        if r["number"] not in seen:
            seen.add(r["number"])
            uniq.append(r)
    return uniq


def qa_section(data):
    """With no board data this is omitted rather than rendered empty, which would read as
    a clean bill."""
    uniq = release_issues(data)
    if not has_board(uniq):
        return ""
    repo = data.get("repo", "")
    passed, flagged, untriaged = qa_split(uniq)
    out = ['<h2>QA sign-off <span class="cnt">' + str(len(passed)) + ' of ' + str(len(uniq)) + '</span></h2>',
           '<p class="sub">Read from the Zenhub QA board. GitHub open/closed and the pass labels answer '
           'different questions, so neither is used here.</p>']
    out.append('<div class="grid">')
    out.append(f'<div class="stat"><div class="n">{len(passed)}</div><div class="l">passed test</div></div>')
    out.append(f'<div class="stat"><div class="n">{len(flagged)}</div><div class="l">failed or blocked</div></div>')
    out.append(f'<div class="stat"><div class="n">{len(untriaged)}</div><div class="l">no QA verdict yet</div></div>')
    out.append('</div>')
    if flagged:
        out.append('<div class="note flag"><b>Flagged by QA and still riding this release.</b> '
                   'These sit in a failing or blocked column, so they need a call before the cut.</div>')
        out.append('<div class="card"><ul class="prlist">')
        for r in flagged:
            out.append(f'<li><a href="{iss_url(repo, r["number"])}">#{esc(r["number"])}</a> '
                       f'{esc(r.get("title",""))} {board_chip(board_of(r).get("qa"), "qa")}</li>')
        out.append('</ul></div>')
    if untriaged:
        out.append(f'<h3>No QA verdict yet <span class="cnt">{len(untriaged)}</span></h3>')
        out.append('<p class="sub">Sitting in the QA board default column, which means nobody has triaged them '
                   'into a test state. That is an absence of a record, not a failure. Post-cut QA on the release '
                   'build is the first look at these.</p>')
        out.append('<div class="card"><ul class="prlist">')
        for r in untriaged:
            out.append(f'<li><a href="{iss_url(repo, r["number"])}">#{esc(r["number"])}</a> '
                       f'{esc(r.get("title",""))} {board_chip(board_of(r).get("dev"), "dev")}</li>')
        out.append('</ul></div>')
    return "\n".join(out)


def earlier_table(rows, repo):
    out = []
    for r in rows or []:
        prs = ", ".join(f'<a href="{pr_url(repo, n)}">#{esc(n)}</a>' for n in r.get("resolved_by", []))
        out.append(f'<tr><td><a href="{iss_url(repo, r["number"])}">#{esc(r["number"])}</a></td>'
                   f'<td>{esc(r.get("title",""))}</td><td>{prs}</td>'
                   f'<td>{esc(r.get("milestone",""))}</td></tr>')
    return "\n".join(out)


def backport_full(bp, repo):
    if not bp:
        return ""
    if not bp.get("in_progress"):
        note = esc(bp.get("note", "No backport branch or open backport PR was found off the last release branch."))
        return f'<h2>Backport check</h2><div class="note">{note}</div>'
    ver = esc(bp.get("version", ""))
    prnum = bp.get("pr")
    head = f'<h2>Excluded - shipping in the {ver} backport</h2>'
    sub = f'<p class="sub">'
    if prnum:
        sub += f'PR <a href="{pr_url(repo, prnum)}">#{esc(prnum)}</a> cherry-picks these onto <code>{esc(bp.get("base_branch",""))}</code>. '
    sub += 'They are on master too, but counted as the patch, not new in this release.</p>'
    if bp.get("note"):
        sub += f'<div class="note">{esc(bp["note"])}</div>'
    items = ['<div class="card"><ul class="prlist">']
    for it in bp.get("items", []):
        items.append(f'<li><a href="{pr_url(repo, it["number"])}">#{esc(it["number"])}</a> {esc(it.get("title",""))}</li>')
    items.append('</ul></div>')
    return head + sub + "\n".join(items)


def release_notes_full(data):
    """Ready to paste. The Built from commit line is CI's, so the GitHub body
    here starts after it."""
    s = data.get("summary") or {}
    rn = s.get("release_notes") or {}
    if not rn:
        return ""
    repo = data.get("repo", "")
    parts = ['<h2>Release notes</h2>',
             '<p class="sub">The store text, then the GitHub release body that follows the Built from commit line CI writes.</p>',
             '<div class="card">']
    if rn.get("store"):
        parts.append(f'<h4>App Store and Google Play</h4><p>{esc(rn["store"])}</p>')
    parts.append('<h4>GitHub release</h4>')
    version = str(data.get("next_release", ""))
    if version:
        url = f'{SITE}/{version if version.count(".") >= 2 else version + ".0"}/'
        parts.append(f'<p>Release notes: <a href="{esc(url)}">{esc(url)}</a></p>')
    bullets = rn.get("bullets") or []
    if bullets:
        parts.append('<ul class="prlist">')
        for b in bullets:
            n = b.get("number")
            link = f'<a href="{pr_url(repo, n)}">#{esc(n)}</a> - ' if n else ""
            parts.append(f'<li>{link}{esc(b.get("text", ""))}</li>')
        parts.append('</ul>')
    parts.append('</div>')
    return "\n".join(parts)


FLAG_BADGE = {"on": '<span class="badge ok">on</span>', "off": '<span class="badge none">off</span>',
              "edge": '<span class="badge bp">Edge only</span>', None: '<span class="badge none">absent</span>'}


def flags_full(data):
    items = flag_items(data)
    if not items:
        return ""
    repo = data.get("repo", "")
    fl = data.get("flags") or {}
    served = fl.get("served") or {}
    where = f'web {esc(served["version"])}' if served.get("version") else "the live endpoint"
    next_ref = fl.get("next_ref", "master")
    sub = (f'Now is what the app built from <code>{esc(fl.get("native_ref", "the release branch"))}</code> gets: '
           f'the value <code>{esc(served.get("url", "app.fedi.xyz/api/features"))}</code> served from {where} '
           f'when this report was generated, or its built-in value for a flag that app does not take from the server. '
           f'After is the same for the app built from <code>{esc(fl.get("app_ref") or next_ref)}</code>, '
           f'with the values served at <code>{esc(next_ref)}</code>.')
    if served and not served.get("live"):
        sub += ' The live endpoint did not answer, so Now comes from the web baseline.'
    rows = []
    for f in flag_order(items):
        pr = f.get("pr") or f.get("added_pr")
        added = esc(f.get("added") or "") + (f' <a href="{pr_url(repo, pr)}">#{esc(pr)}</a>' if pr else "")
        control = "built in" if f.get("control") == "app" else "remote"
        after = FLAG_BADGE.get(f.get("next"), "")
        if f.get("next") is None and f.get("now") is not None:
            after = f'<span class="badge none">removed, {"stays on" if f.get("after") == "on" else "off"}</span>'
        rows.append(f'<tr><td><code>{esc(f["key"])}</code></td><td>{esc(f.get("name", ""))}</td>'
                    f'<td>{FLAG_BADGE.get(f.get("now"), "")}</td><td>{after}</td>'
                    f'<td>{control}</td><td class="nowrap">{added}</td></tr>')
    return "\n".join([f'<h2 id="flag-table">Feature flags <span class="cnt">{len(items)}</span></h2>',
                      f'<p class="sub">{sub}</p>',
                      '<table class="ftable"><thead><tr><th>Flag</th><th>Feature</th><th>Now</th><th>After</th>'
                      '<th>Control</th><th>Added</th></tr></thead><tbody>',
                      "\n".join(rows), '</tbody></table>'])


def render_full(data):
    repo = data.get("repo", "")
    w = data.get("window", {})
    ms = data.get("milestones", {})
    nfeat = sum(len(g.get("prs", [])) for g in data.get("user_facing", []))
    nnon = sum(len(g.get("prs", [])) for g in data.get("non_user_facing", []))
    ntot = len(data.get("all_prs", [])) or (nfeat + nnon)
    needs = data.get("needs_milestone", [])
    cmds = "\n".join(data.get("prepared_commands", []))

    parts = []
    parts.append('<h1>' + esc(data.get("full_title", f'{data.get("next_release","")} release report')) + '</h1>')
    win_txt = f'window <code>{esc(w.get("from_sha","") or w.get("from_tag",""))}..{esc(w.get("to","master"))}</code>'
    parts.append(f'<p class="sub">Everything on <b>master</b> queued for the next release, as of {esc(data.get("generated_at",""))}. {win_txt}.</p>')

    parts.append('<div class="grid">')
    parts.append(f'<div class="stat"><div class="n">{ntot}</div><div class="l">PRs new to this release</div></div>')
    parts.append(f'<div class="stat"><div class="n">{nfeat}</div><div class="l">user-facing</div></div>')
    parts.append(f'<div class="stat"><div class="n">{nnon}</div><div class="l">internal</div></div>')
    parts.append(f'<div class="stat"><div class="n">{len(needs)}</div><div class="l">issues missing a milestone</div></div>')
    parts.append('</div>')

    parts.append(track_cards(data.get("tracks")))
    parts.append(decision_exit(data))

    if data.get("intro"):
        parts.append(f'<div class="note">{esc(data["intro"])}</div>')

    parts.append(release_notes_full(data))
    parts.append(flags_full(data))

    parts.append(f'<h2>User-facing changes <span class="cnt">{nfeat}</span></h2>')
    if data.get("titles_note"):
        parts.append(f'<p class="sub">{esc(data["titles_note"])}</p>')
    parts.append(f'<div class="card">{theme_groups(data.get("user_facing"), repo)}</div>')
    parts.append(f'<h2>Internal / non-user-facing <span class="cnt">{nnon}</span></h2>')
    parts.append('<p class="sub">Tests, build/CI, developer tooling, and refactors. No user-visible change.</p>')
    parts.append(f'<div class="card">{theme_groups(data.get("non_user_facing"), repo)}</div>')

    nm = ms.get("next_major")
    if nm:
        parts.append(f'<h2>Milestone status - {esc(nm.get("name",""))}</h2>')
        pend, prog = pending_counts(data)
        if pend or prog:
            parts.append('<div class="note flag"><b>The cut is a judgement call.</b> '
                         f'{prog} issue(s) have a PR open for review but not merged, so holding the cut would buy those. '
                         f'{pend} have no PR or only a draft, and holding does nothing for them: they either stay and delay the release, or roll to the next milestone. '
                         'Milestones record intent until a release is live, so these are still promises rather than mistakes. '
                         'QA is manual and runs after the cut alongside store review, so this decides what gets submitted, not what ships.</div>')
        parts.append(f'<table>{milestone_table(nm.get("issues"), repo)}</table>')
    nw = ms.get("next_web")
    if nw:
        parts.append(f'<h3>{esc(nw.get("name",""))}</h3>')
        parts.append(f'<table>{milestone_table(nw.get("issues"), repo)}</table>')

    if needs:
        parts.append(f'<h2>Milestone hygiene - issues to add <span class="cnt">{len(needs)}</span></h2>')
        parts.append('<div class="note flag"><b>One decision:</b> these issues are resolved by PRs already on master, so they ride the next cut whether or not anyone tags them. Tagging is what stops them being missed in the release notes. Nothing has been applied.'
                     f' <a href="{review_url(repo, needs)}"><b>Review all {len(needs)} on GitHub</b></a></div>')
        parts.append(f'<table>{needs_table(needs, repo)}</table>')
        if cmds:
            parts.append('<details><summary>Prepared <code>gh</code> commands (not yet run)</summary>'
                         f'<pre>{esc(cmds)}</pre></details>')
    earlier = data.get("earlier_milestone")
    if earlier:
        parts.append('<h3>Already milestoned to an earlier release</h3>')
        parts.append('<p class="sub">Resolved on master and riding into this release, but already tagged to a prior milestone. No action needed.</p>')
        parts.append('<table><thead><tr><th>Issue</th><th>Title</th><th>Resolved by</th><th>Milestone</th></tr></thead><tbody>')
        parts.append(earlier_table(earlier, repo))
        parts.append('</tbody></table>')

    parts.append(qa_section(data))

    parts.append(backport_full(data.get("backport"), repo))

    parts.append(f'<h2>Full PR-by-PR list <span class="cnt">{ntot}</span></h2>')
    parts.append('<p class="sub">Every PR merged to master in the window, oldest first.</p>')
    parts.append('<table><thead><tr><th>PR</th><th>Title</th><th>Type</th><th>Theme</th><th>Issue</th><th>Author</th><th>Merged</th></tr></thead><tbody>')
    parts.append(full_pr_table(data.get("all_prs"), repo))
    parts.append('</tbody></table>')

    parts.append(f'<div class="foot">Generated {esc(data.get("generated_at",""))} for {esc(repo)}. '
                 'Issue links read from PR bodies, since GitHub\'s closing-issue field is unset across this set.</div>')
    return "\n".join(p for p in parts if p)


# --------------------------------------------------------------------------
# Every colour lives in these two blocks. A hardcoded hex below them renders in
# only one theme.
CSS_VARS = """
:root{color-scheme:dark;
 --bg:#0f0f13;--card:#1c1c22;--card2:#25252d;--line:#3d3d4a;
 --tx:#f2f2f5;--tx2:#d0d0d9;--mut:#a4a9b5;
 --acc:#7ea2f5;--ok:#69db7c;--wait:#f5a524;--bp:#a98eff;--prog:#7ea2f5;
 --uf:#2f9e44;--nf:#4d525c;--sug:#3b5bdb;
 --tabbg:rgba(22,22,26,.92);--hover:rgba(126,162,245,.09);
 --pre-bg:#101014;--pre-tx:#d8d8de;
 --k-feat:#7048e8;--k-imp:#0b7285;--k-fix:#b54708;
 --s-ship:#2b7a3b;--s-prog:#1971c2;--s-plan:#5f6570;
 --ok-bg:rgba(105,219,124,.14);--ok-bd:rgba(105,219,124,.4);
 --wait-bg:rgba(245,165,36,.14);--wait-bd:rgba(245,165,36,.4);
 --bp-bg:rgba(169,142,255,.14);--bp-bd:rgba(169,142,255,.42);--on-bp:#15111f;
 --prog-bg:rgba(126,162,245,.14);--prog-bd:rgba(126,162,245,.4);
 --acc-bg:rgba(126,162,245,.1);--acc-bd:rgba(126,162,245,.32);
 --p-ios:#e9ebf2;--p-android:#4fe08a;--p-web:#7cb2ff;--p-off:#4d525f;
 --pop:#24242c;--shadow:0 12px 32px rgba(0,0,0,.5);}
html[data-theme="light"]{color-scheme:light;
 --bg:#f6f7f9;--card:#fff;--card2:#f0f2f5;--line:#e2e5ea;
 --tx:#1a1d23;--tx2:#3f4651;--mut:#5c6470;
 --acc:#1971c2;--ok:#2b8a3e;--wait:#9a6700;--bp:#6741d9;--prog:#1971c2;
 --uf:#2b8a3e;--nf:#868e96;--sug:#1f6feb;
 --tabbg:rgba(246,247,249,.92);--hover:rgba(25,113,194,.05);
 --pre-bg:#f3f4f6;--pre-tx:#1f2937;
 --k-feat:#7048e8;--k-imp:#0b7285;--k-fix:#b54708;
 --s-ship:#2b7a3b;--s-prog:#1971c2;--s-plan:#5c6370;
 --ok-bg:rgba(43,138,62,.12);--ok-bd:rgba(43,138,62,.35);
 --wait-bg:rgba(154,103,0,.12);--wait-bd:rgba(154,103,0,.35);
 --bp-bg:rgba(103,65,217,.1);--bp-bd:rgba(103,65,217,.35);--on-bp:#fff;
 --prog-bg:rgba(25,113,194,.1);--prog-bd:rgba(25,113,194,.35);
 --acc-bg:rgba(25,113,194,.07);--acc-bd:rgba(25,113,194,.3);
 --p-ios:#1b1e25;--p-android:#0b8043;--p-web:#1a73e8;--p-off:#bcc2cc;
 --pop:#fff;--shadow:0 12px 32px rgba(20,30,50,.16);}
"""


def render_html(data):
    return f"""<!DOCTYPE html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(data.get("next_release",""))} release report</title>
<script>
// Applied before first paint so a light-mode reader never sees a dark flash.
try{{var t=localStorage.getItem('rnr-theme');if(t)document.documentElement.dataset.theme=t;}}catch(e){{}}
</script>
<style>
{CSS_VARS}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--tx);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}}
.wrap{{max-width:1080px;margin:0 auto;padding:28px 22px 80px}}
h1{{font-size:30px;margin:0 0 6px;letter-spacing:-.4px}}
h2{{font-size:21px;margin:40px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line)}}
h3{{font-size:17px;margin:24px 0 10px}}
h4{{font-size:15px;margin:18px 0 7px;color:var(--acc);font-weight:600}}
a{{color:var(--acc);text-decoration:none}} a:hover{{text-decoration:underline}}
code{{background:var(--card2);border-radius:5px;padding:1px 5px;font-size:.88em;font-family:ui-monospace,"SF Mono",Menlo,monospace}}
.sub{{color:var(--mut);font-size:14px;margin:0 0 4px}}
.lede{{font-size:16px;margin:2px 0 18px;color:var(--tx2)}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:14px 0}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}}
.stat{{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:14px 16px}}
.stat .n{{font-size:26px;font-weight:700}} .stat .l{{color:var(--mut);font-size:12.5px;margin-top:2px}}
.cnt{{display:inline-block;background:var(--card2);color:var(--mut);border:1px solid var(--line);border-radius:20px;padding:0 8px;font-size:12px;margin-left:4px}}
.tracks{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin:18px 0 22px}}
.track{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}}
.thead{{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--acc);font-weight:700;margin-bottom:9px}}
.trow{{display:flex;gap:10px;padding:4px 0;border-bottom:1px dashed var(--line);font-size:13.5px}}
.track .trow:last-of-type{{border-bottom:none}}
.tk{{color:var(--mut);flex:0 0 128px}} .tv{{color:var(--tx);flex:1}}
.tnote{{color:var(--mut);font-size:12.5px;margin:9px 0 0;line-height:1.5}}
ul.prlist{{list-style:none;margin:0 0 6px;padding:0}}
ul.prlist li{{padding:5px 0;border-bottom:1px dashed var(--line)}} ul.prlist li:last-child{{border-bottom:none}}
.meta{{color:var(--mut);font-size:12px;white-space:nowrap}}
.iss{{color:var(--bp);font-size:12px;background:var(--bp-bg);border:1px solid var(--bp-bd);border-radius:6px;padding:0 6px}}
table{{width:100%;border-collapse:collapse;font-size:13.5px;margin:10px 0}}
th,td{{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top}}
th{{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px;position:sticky;top:0;background:var(--bg)}}
tr:hover td{{background:var(--hover)}}
.nowrap{{white-space:nowrap;color:var(--mut)}}
.pill{{display:inline-block;white-space:nowrap;border-radius:20px;padding:1px 9px;font-size:11.5px;font-weight:600;color:#fff}}
.pill.uf{{background:var(--uf)}} .pill.nf{{background:var(--nf)}} .pill.sug{{background:var(--sug)}}
.badge{{display:inline-block;border-radius:6px;padding:1px 8px;font-size:11.5px;font-weight:600}}
.badge.ok{{background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok-bd)}}
.badge.wait{{background:var(--wait-bg);color:var(--wait);border:1px solid var(--wait-bd)}}
.badge.bp{{background:var(--bp-bg);color:var(--bp);border:1px solid var(--bp-bd)}}
.badge.prog{{background:var(--prog-bg);color:var(--prog);border:1px solid var(--prog-bd)}}
.badge.none{{background:var(--card2);color:var(--mut);border:1px solid var(--line)}}
.note{{background:var(--card2);border-left:3px solid var(--acc);border-radius:0 8px 8px 0;padding:12px 16px;margin:14px 0}}
.note.flag{{border-left-color:var(--wait)}}
pre{{background:var(--pre-bg);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;font-size:12.5px;line-height:1.5;color:var(--pre-tx)}}
.foot{{color:var(--mut);font-size:12px;margin-top:50px;border-top:1px solid var(--line);padding-top:14px}}
details summary{{cursor:pointer;color:var(--acc);font-weight:600;margin:8px 0}}
.tabbar{{position:sticky;top:0;z-index:10;display:flex;background:var(--tabbg);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:10px 22px 0}}
.tabbar .inner{{max-width:1080px;margin:0 auto;width:100%;display:flex;gap:4px;align-items:center}}
.tab{{appearance:none;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--mut);font:600 14px/1 inherit;padding:11px 16px 12px;cursor:pointer;border-radius:8px 8px 0 0}}
.tab:hover{{color:var(--tx)}} .tab.active{{color:var(--tx);border-bottom-color:var(--acc)}}
.themebtn{{margin-left:auto;margin-bottom:8px;appearance:none;background:var(--card2);border:1px solid var(--line);color:var(--mut);font:600 12px/1 inherit;padding:7px 12px;border-radius:20px;cursor:pointer}}
.themebtn:hover{{color:var(--tx);border-color:var(--acc)}}
.tabpane{{display:none}} .tabpane.active{{display:block}}
.scope{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 16px;margin:16px 0 12px;font-size:14px;color:var(--tx2)}}
.scope-row{{display:flex;align-items:center;flex-wrap:wrap;gap:10px}}
.scope-ver{{font-weight:700;font-size:16px;color:var(--tx)}}
.scope-marks{{margin-left:0}}
.scope-marks .pm svg{{width:18px;height:18px}}
.quirk{{color:var(--tx2);font-size:13.5px;margin-top:6px;line-height:1.5}}
.notes{{background:var(--acc-bg);border:1px solid var(--acc-bd);border-radius:12px;padding:14px 18px;margin:0 0 18px}}
.notes-label{{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--acc);font-weight:700;margin-bottom:6px}}
.notes-store{{margin:0;font-size:16px;line-height:1.5;color:var(--tx)}}
.notes-meta{{color:var(--mut);font-size:12.5px;margin-top:4px}}
.exit{{background:var(--acc-bg);border:1px solid var(--acc-bd);border-radius:12px;padding:14px 18px;margin:26px 0 4px}}
.exit-label{{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--acc);font-weight:700;margin-bottom:6px}}
.exit ul{{margin:0;padding-left:18px}} .exit li{{margin:5px 0;font-size:14px;line-height:1.5}}
.scards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;margin:8px 0 6px}}
.scard{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}}
.pmarks{{margin-left:auto;display:flex;gap:8px;align-items:center}}
.pm svg{{width:20px;height:20px;display:block}}
.pm[data-p="ios"] svg{{fill:var(--p-ios)}}
.pm[data-p="android"] svg{{fill:var(--p-android)}}
.pm[data-p="web"] svg{{fill:var(--p-web)}}
.pm.off svg{{fill:var(--p-off);opacity:.5}}
.h2row{{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:40px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line)}}
.h2row h2{{margin:0;padding:0;border:none;flex:0 0 auto}}
.lswitch{{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:0 0 2px}}
.lswitch-l{{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:700;margin-right:5px}}
.lbtn{{appearance:none;background:var(--card2);border:1px solid var(--line);color:var(--mut);font:600 11.5px/1 inherit;padding:6px 11px;border-radius:999px;cursor:pointer}}
.lbtn:hover{{color:var(--tx);border-color:var(--acc-bd)}}
.lbtn.active{{color:var(--tx);background:var(--acc-bg);border-color:var(--acc)}}
.lall{{margin-left:10px;border-style:dashed}}
.lall[hidden]{{display:none}}
.pfilter{{margin:18px 0 0}}
.tabpane [hidden]{{display:none!important}}
details.gwrap>summary .gcount{{color:var(--acc)}}
/* in a group summary the marks lead the label, so undo the card row's margin-left:auto */
details.gwrap>summary>.pmarks{{margin-left:0;display:inline-flex}}
details.gwrap{{grid-column:1/-1;border:1px solid var(--line);border-radius:12px;background:var(--card2);overflow:hidden}}
details.gwrap>summary{{display:flex;align-items:center;gap:10px;padding:15px 18px;font-size:12.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--tx2);cursor:pointer;user-select:none;list-style:none}}
details.gwrap>summary::-webkit-details-marker{{display:none}}
details.gwrap>summary:hover{{color:var(--tx);background:var(--hover)}}
details.gwrap>summary:focus-visible{{outline:2px solid var(--acc);outline-offset:-2px}}
.chev{{flex:0 0 auto;width:9px;height:9px;border-right:2px solid var(--acc);border-bottom:2px solid var(--acc);transform:rotate(-45deg);transition:transform .15s;margin:0 2px 3px 0}}
details.gwrap[open]>summary .chev{{transform:rotate(45deg);margin:0 2px 0 0}}
details.gwrap>summary .gsuffix{{margin-left:auto;font-weight:600;letter-spacing:.03em;text-transform:none;color:var(--mut)}}
details.gwrap[open]>summary{{border-bottom:1px solid var(--line)}}
details.gwrap[open]>summary .gsuffix{{visibility:hidden}}
details.gwrap>summary>.pmarks .pm svg{{width:16px;height:16px}}
details.gwrap .scards{{margin:14px 18px 18px}}
.schips{{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}}
.chip{{display:inline-block;white-space:nowrap;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:3px 9px;border-radius:999px}}
.k-feat{{background:var(--k-feat)}} .k-imp{{background:var(--k-imp)}} .k-fix{{background:var(--k-fix)}}
.s-ship{{background:var(--s-ship)}} .s-prog{{background:var(--s-prog)}} .s-plan{{background:var(--s-plan)}}
.shead{{font-size:16.5px;margin:0 0 6px;line-height:1.3}}
.ssum{{margin:0;color:var(--tx2);font-size:14px;line-height:1.5}}
.flagbadge,.trackchip{{display:inline-block;white-space:nowrap;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:3px 9px;border-radius:999px}}
.flagbadge{{color:var(--bp);background:var(--bp-bg);border:1px solid var(--bp-bd)}}
.tagchip{{display:inline-block;white-space:nowrap;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:999px;color:var(--on-bp);background:var(--bp)}}
.tagsec{{background:var(--bp-bg);border:1px solid var(--bp-bd);border-radius:16px;padding:2px 20px 18px;margin:40px 0 0}}
.tagsec .h2row{{margin-top:16px;border-bottom-color:var(--bp-bd)}}
.tagsec h2{{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1 1 auto;min-width:0}}
.tagsec .scards{{grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr))}}
@media (max-width:560px){{.tagsec{{padding:2px 12px 14px}}}}
.sectag{{display:inline-block;font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:5px 12px;border-radius:999px;color:var(--on-bp);background:var(--bp)}}
.secnote{{color:var(--tx2);font-size:14.5px;line-height:1.5;margin:0 0 4px;max-width:760px}}
.trackchip{{color:var(--mut);background:var(--card2);border:1px solid var(--line)}}
.subhead{{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:24px 0 10px;font-weight:700}}
details.tucked{{margin:34px 0 0;border:1px dashed var(--line);border-radius:12px}}
details.tucked>summary{{display:flex;align-items:center;gap:10px;padding:13px 18px;cursor:pointer;list-style:none;user-select:none;color:var(--mut);font-size:13px;text-transform:uppercase;letter-spacing:.06em;font-weight:700}}
details.tucked>summary::-webkit-details-marker{{display:none}}
details.tucked>summary:hover{{color:var(--tx);background:var(--hover);border-radius:12px}}
details.tucked>summary .chev{{border-color:var(--mut)}}
details.tucked[open]>summary{{border-bottom:1px dashed var(--line);border-radius:12px 12px 0 0;color:var(--tx2)}}
details.tucked[open]>summary .chev{{transform:rotate(45deg);margin:0 2px 0 0}}
.tknote{{margin-left:auto;text-transform:none;letter-spacing:0;font-weight:600}}
.tbody{{padding:4px 18px 18px}}
.thead2{{margin:10px 0 4px;padding-bottom:0;border-bottom:none}}
.thead2 .sub{{flex:1 1 320px;margin:0}}
details.flags{{margin:16px 0 0}}
details.flags>summary{{flex-wrap:wrap;row-gap:6px;padding:11px 18px}}
.fbadges{{display:inline-flex;flex-wrap:wrap;gap:6px;text-transform:none;letter-spacing:0}}
.fbadge{{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;font-weight:600;color:var(--tx2);background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:2px 9px 2px 8px}}
.fbadge[hidden]{{display:none}}
.fbadge b{{font-weight:800;color:var(--tx)}}
.fdot{{width:8px;height:8px;border-radius:50%;flex:none}}
.b-u .fdot{{background:var(--acc)}} .b-p .fdot{{background:var(--ok)}}
.b-g{{color:var(--ok);background:var(--ok-bg);border-color:var(--ok-bd)}} .b-g b{{color:var(--ok)}} .b-g .fdot{{background:var(--ok)}}
.fbody{{padding:6px 18px 18px;container-type:inline-size}}
.fline{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}}
.fst{{position:relative;min-width:0}}
.fu::after{{content:"";position:absolute;top:7px;left:16px;right:-20px;height:2px;background:var(--line)}}
.fsth{{position:relative;padding-top:26px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tx2)}}
.fdot2{{position:absolute;left:0;top:0;width:16px;height:16px;border-radius:50%;z-index:1;box-shadow:0 0 0 4px var(--bg)}}
.fu .fdot2{{background:var(--acc)}} .fp .fdot2{{background:var(--ok)}}
.ftip{{display:inline-flex;align-items:center;gap:6px;cursor:help;outline:none}}
.flbl{{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}}
.fgrp:first-child>.flbl{{margin-top:8px}}
.flbl b{{font-weight:800;color:var(--tx2);background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:0 7px;letter-spacing:0}}
details.flive{{margin-top:10px}}
details.flive>summary{{cursor:pointer;list-style:none;user-select:none;padding:4px 0;margin:0}}
details.flive>summary::-webkit-details-marker{{display:none}}
details.flive>summary .chev{{border-color:var(--mut)}}
details.flive[open]>summary .chev{{transform:rotate(45deg);margin:0 2px 0 0}}
details.flive>summary:hover,details.flive>summary:focus-visible{{color:var(--tx);outline:none}}
.fchip{{display:flex;align-items:center;gap:8px;padding:7px 10px;margin-top:6px;border-radius:9px;background:var(--card2);border:1px solid transparent;font-size:14px;color:var(--tx);cursor:help;outline:none;transition:border-color .12s}}
.fchip:hover,.fchip:focus-visible{{border-color:var(--acc-bd)}}
.fchip.go{{background:var(--ok-bg);border-color:var(--ok-bd)}} .fchip.go:hover,.fchip.go:focus-visible{{border-color:var(--ok)}}
.fchip.stop{{background:var(--wait-bg);border-color:var(--wait-bd)}} .fchip.stop:hover,.fchip.stop:focus-visible{{border-color:var(--wait)}}
.fn{{min-width:0}}
.fic{{width:16px;height:16px;flex:none;color:var(--mut)}}
.fchip.go .fic{{color:var(--ok)}} .fchip.stop .fic{{color:var(--wait)}}
.finfo{{width:15px;height:15px;flex:none;color:var(--mut);opacity:.75;transition:color .12s,opacity .12s}}
.fchip .finfo{{margin-left:auto}}
.ftip .finfo{{width:14px;height:14px}}
.fchip:hover .finfo,.fchip:focus-visible .finfo,.ftip:hover .finfo,.ftip:focus-visible .finfo{{color:var(--acc);opacity:1}}
@container (max-width:560px){{
  .fline{{grid-template-columns:1fr;gap:18px}}
  .fu::after{{top:16px;left:7px;right:auto;bottom:-18px;width:2px;height:auto}}
  .fsth{{padding-top:0;padding-left:26px}} .fdot2{{top:50%;margin-top:-8px}} .fstb{{padding-left:26px}}
}}
#fpop{{position:absolute;z-index:30;width:360px;max-width:calc(100vw - 20px);background:var(--pop);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:12px 14px;font-size:13.5px;line-height:1.5}}
#fpop[hidden]{{display:none}}
#fpop .pn{{font-weight:700;font-size:14.5px}}
#fpop .pd{{margin-top:4px;color:var(--tx2)}}
#fpop .pm{{margin-top:6px;color:var(--mut);font-size:12.5px}}
#fpop details{{margin-top:8px;font-size:13px;border-top:1px solid var(--card2);padding-top:6px}}
#fpop summary{{cursor:pointer;color:var(--acc);font-size:12.5px;font-weight:600;margin:0}}
#fpop .tl{{margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}}
#fpop ul{{margin:4px 0 0;padding:0;list-style:none}}
#fpop li{{position:relative;padding:4px 0 4px 14px;color:var(--tx2);line-height:1.45}}
#fpop li::before{{content:"";position:absolute;left:2px;top:12px;width:5px;height:5px;border-radius:50%;background:var(--mut)}}
#fpop li .w{{display:block;color:var(--mut);font-size:11.5px}}
#fpop .pf{{margin-top:8px;color:var(--mut);font-size:12.5px}}
@media (max-width:640px){{.ftable{{display:block;overflow-x:auto}}}}
@media print{{html{{color-scheme:light}} .tabbar{{display:none}} .tabpane{{display:block!important}}}}
</style></head>
<body>
<div class="tabbar"><div class="inner">
  <button class="tab active" data-pane="summary">Summary</button>
  <button class="tab" data-pane="full">Full report</button>
  <button class="themebtn" id="themebtn">Light</button>
</div></div>
<div class="wrap">
<div id="summary" class="tabpane active">
{render_summary(data)}
</div>
<div id="full" class="tabpane">
{render_full(data)}
</div>
</div>
<div id="fpop" role="dialog" hidden></div>
<script>
document.querySelectorAll('.tab').forEach(function(t){{
  t.addEventListener('click', function(){{
    document.querySelectorAll('.tab').forEach(function(x){{x.classList.remove('active')}});
    document.querySelectorAll('.tabpane').forEach(function(p){{p.classList.remove('active')}});
    t.classList.add('active');
    document.getElementById(t.dataset.pane).classList.add('active');
    window.scrollTo(0,0);
  }});
}});
(function(){{
  var PLAT = {PLATFORM_JS};
  var STATUS_ORDER = ['In progress','Planned','Pending release'];

  function cards(g){{ return [].slice.call(g.querySelectorAll('.scard')); }}
  // The grid is emptied before groups are built, so only a group's own cards
  // are still reachable.
  function marksFor(card){{
    var c = card && card.querySelector('.pmarks');
    return c ? '<span class="pmarks">'+c.innerHTML+'</span>' : '';
  }}

  // Group on the whole platform set. Grouping per platform puts every
  // cross-platform card, which is most of them, into three groups at once.
  function setLabel(keys){{
    if (keys.length === PLAT.order.length) return 'Everywhere';
    if (keys.length === 2 && keys.indexOf('ios') > -1 && keys.indexOf('android') > -1) return 'Native apps';
    if (keys.length === 1) return PLAT.label[keys[0]] + (keys[0] === 'web' ? '' : ' only');
    return keys.map(function(k){{ return PLAT.label[k]; }}).join(' + ');
  }}
  function byPlatform(list){{
    var seen = [], map = {{}};
    list.forEach(function(c){{
      var key = (c.dataset.plat || '').trim();
      if (!map[key]) {{ map[key] = []; seen.push(key); }}
      map[key].push(c);
    }});
    seen.sort(function(a, b){{
      var ka = a ? a.split(' ') : [], kb = b ? b.split(' ') : [];
      if (ka.length !== kb.length) return kb.length - ka.length;
      return PLAT.order.indexOf(ka[0]) - PLAT.order.indexOf(kb[0]);
    }});
    return seen.map(function(key){{
      var keys = key ? key.split(' ') : [];
      return {{keys:keys, label:keys.length ? setLabel(keys) : 'Unspecified', items:map[key]}};
    }});
  }}
  function byStatus(list){{
    var seen = STATUS_ORDER.filter(function(s){{
      return list.some(function(c){{ return c.dataset.status === s; }}); }});
    list.forEach(function(c){{ if (seen.indexOf(c.dataset.status) < 0) seen.push(c.dataset.status); }});
    return seen.map(function(s){{
      return {{key:'', label:s || 'Unlabelled', items:list.filter(function(c){{
        return c.dataset.status === s; }})}};
    }});
  }}
  function group(mode, list){{
    return mode === 'status' ? byStatus(list) : byPlatform(list);
  }}

  // Each card section owns its switch, grids and expand-all control, so
  // regrouping the merged cards leaves the not-merged ones alone.
  function wire(sec){{
    var grids = [].slice.call(sec.querySelectorAll('[data-grid]'));
    if (!grids.length) return;
    grids.forEach(function(g){{ g.dataset.orig = g.innerHTML; }});
    var allBtn = sec.querySelector('.lall');
    function panels(){{ return [].slice.call(sec.querySelectorAll('details.gwrap')); }}
    function syncAll(){{
      if (!allBtn || allBtn.hidden) return;
      var open = panels().some(function(d){{ return d.open; }});
      allBtn.textContent = open ? 'Collapse all' : 'Expand all';
      allBtn.dataset.next = open ? 'close' : 'open';
    }}
    sec.syncAll = syncAll;
    function paint(mode){{
      grids.forEach(function(g){{
        g.innerHTML = g.dataset.orig;
        if (mode === 'all') return;
        var groups = group(mode, cards(g));
        g.innerHTML = '';
        groups.forEach(function(gr){{
          var inner = document.createElement('div');
          inner.className = 'scards';
          // Status groups carry no marks: a status set spans every platform.
          var marks = mode === 'platform' ? marksFor(gr.items[0]) : '';
          gr.items.forEach(function(c){{ inner.appendChild(c); }});
          var d = document.createElement('details');
          d.className = 'gwrap';
          d.innerHTML = '<summary><span class="chev" aria-hidden="true"></span>'+marks
                      + '<span>'+gr.label+'</span>'
                      + '<span class="gcount">'+gr.items.length+'</span>'
                      + '<span class="gsuffix">show</span></summary>';
          d.appendChild(inner);
          g.appendChild(d);
        }});
      }});
      if (allBtn) allBtn.hidden = mode === 'all';
      syncAll();
      if (window.rnrFilter) window.rnrFilter();
    }}
    if (allBtn) {{
      allBtn.addEventListener('click', function(){{
        var open = allBtn.dataset.next === 'open';
        panels().forEach(function(d){{ d.open = open; }});
        syncAll();
      }});
    }}
    // [data-layout], not .lbtn: the expand-all control shares the button styling
    // and would otherwise repaint the grid and undo itself.
    sec.querySelectorAll('.lbtn[data-layout]').forEach(function(b){{
      b.addEventListener('click', function(){{
        sec.querySelectorAll('.lbtn[data-layout]').forEach(function(x){{ x.classList.remove('active'); }});
        b.classList.add('active');
        paint(b.dataset.layout);
      }});
    }});
  }}
  [].slice.call(document.querySelectorAll('.cardsec')).forEach(wire);
  // toggle does not bubble, so catch it on the way down.
  document.addEventListener('toggle', function(e){{
    var t = e.target;
    if (!(t.classList && t.classList.contains('gwrap'))) return;
    var sec = t.closest('.cardsec');
    if (sec && sec.syncAll) sec.syncAll();
  }}, true);
}})();
(function(){{
  var bar = document.querySelector('.pfilter');
  if (!bar) return;
  var btns = [].slice.call(bar.querySelectorAll('button[data-p]'));
  var valid = btns.map(function(b){{ return b.dataset.p; }});
  var current = '';
  function has(el, p){{ return (' ' + (el.dataset.plat || '') + ' ').indexOf(' ' + p + ' ') > -1; }}
  function apply(){{
    var p = current;
    btns.forEach(function(b){{ b.classList.toggle('active', b.dataset.p === p); }});
    document.querySelectorAll('.scard, .fchip').forEach(function(el){{
      el.hidden = !!p && !has(el, p);
    }});
    document.querySelectorAll('.scards, details.gwrap, .cardsec, .fgrp, details.flags').forEach(function(box){{
      var all = box.querySelectorAll('.scard, .fchip');
      if (!all.length) return;
      var n = [].filter.call(all, function(c){{ return !c.hidden; }}).length;
      box.hidden = !n;
      var prev = box.previousElementSibling;
      if (prev && prev.hasAttribute('data-sub')) prev.hidden = !n;
      var count = box.querySelector(':scope > summary .gcount, :scope > summary .cnt');
      if (count) count.textContent = n;
      var note = box.querySelector(':scope > summary .tknote');
      if (note) note.hidden = !!p;
    }});
    document.querySelectorAll('.fcount').forEach(function(c){{
      var n = document.querySelectorAll('.fchip[data-col="' + c.dataset.of + '"]:not([hidden])').length;
      c.textContent = n;
      var badge = c.closest('.fbadge');
      if (badge) badge.hidden = !n;
    }});
  }}
  window.rnrFilter = apply;
  btns.forEach(function(b){{
    b.addEventListener('click', function(){{
      current = b.dataset.p;
      apply();
      var u = new URL(location.href);
      if (current) u.searchParams.set('platform', current); else u.searchParams.delete('platform');
      history.replaceState(null, '', u);
    }});
  }});
  var q = new URLSearchParams(location.search).get('platform');
  current = valid.indexOf(q) > 0 ? q : '';
  apply();
}})();
(function(){{
  var pop = document.getElementById('fpop');
  var TRIG = '[data-f],[data-tip]';
  var hideT = null, pinned = false, anchor = null;
  function show(el, pin){{
    clearTimeout(hideT);
    if (pin) pinned = true;
    if (anchor !== el || pop.hidden) {{
      var t = document.getElementById('fp-' + (el.dataset.f || el.dataset.tip));
      pop.innerHTML = t ? t.innerHTML : '';
    }}
    anchor = el;
    pop.hidden = false;
    var r = el.getBoundingClientRect(), w = pop.offsetWidth;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - w - 10;
    pop.style.left = Math.max(10, Math.min(window.scrollX + r.left, maxLeft)) + 'px';
    pop.style.top = (window.scrollY + r.bottom + 6) + 'px';
  }}
  function hide(force){{
    if (force) {{ pinned = false; anchor = null; pop.hidden = true; return; }}
    if (pinned) return;
    hideT = setTimeout(function(){{ pop.hidden = true; anchor = null; }}, 220);
  }}
  document.addEventListener('click', function(e){{
    if (e.target.closest('#fpop')) return;
    var t = e.target.closest(TRIG);
    if (t) {{ show(t, true); return; }}
    hide(true);
  }});
  document.addEventListener('mouseover', function(e){{
    if (e.target.closest('#fpop')) {{ clearTimeout(hideT); return; }}
    var t = e.target.closest(TRIG);
    if (t && !pinned) show(t, false);
  }});
  document.addEventListener('mouseout', function(e){{
    if (e.target.closest(TRIG) || e.target.closest('#fpop')) hide(false);
  }});
  document.addEventListener('focusin', function(e){{
    var t = e.target.closest(TRIG);
    if (t && !pinned) show(t, false);
  }});
  document.addEventListener('keydown', function(e){{
    if (e.key === 'Escape') hide(true);
    var t = e.target.closest && e.target.closest(TRIG);
    if (t && (e.key === 'Enter' || e.key === ' ')) {{ e.preventDefault(); show(t, true); }}
  }});
  var key = new URLSearchParams(location.search).get('flag');
  var el = key && document.querySelector('.fchip[data-f="' + CSS.escape(key) + '"]');
  if (el) {{
    var sec = el.closest('details.flags'), live = el.closest('details.flive');
    if (sec) sec.open = true;
    if (live) live.open = true;
    el.scrollIntoView({{block: 'center'}});
    show(el, true);
    var d = pop.querySelector('details');
    if (d) d.open = true;
  }}
}})();
var btn = document.getElementById('themebtn');
function paintBtn(){{ btn.textContent = document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark'; }}
paintBtn();
btn.addEventListener('click', function(){{
  var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try{{ localStorage.setItem('rnr-theme', next); }}catch(e){{}}
  paintBtn();
}});
</script>
</body></html>
"""


def render_briefing(data):
    """Short markdown for the caller to relay in chat."""
    s = data.get("summary", {})
    rel = data.get("next_release", "the next release")
    lines = [f"**{rel} at a glance** (as of {data.get('generated_at','')})", ""]
    plats = summary_platforms(s)
    quirks = " ".join(summary_quirks(data))
    scope = f"- Scope: {rel} for the {scope_words(plats)}." if plats else f"- Scope: {rel}."
    lines.append(scope + (f" {quirks}" if quirks else ""))
    store = (s.get("release_notes") or {}).get("store")
    if store:
        lines.append(f"- Store release notes: {store}")
    tracks = data.get("tracks") or {}
    for key, label in (("native", "Native"), ("web", "Web")):
        t = tracks.get(key)
        if t and t.get("current"):
            queued = f" Queued since: {t['in_window']}." if t.get("in_window") else ""
            lines.append(f"- {label} in production: {t['current']}.{queued}")
    bp = data.get("backport")
    if bp:
        if bp.get("in_progress"):
            lines.append(f"- Backport {bp.get('version','')} in progress: {len(bp.get('items',[]))} fixes excluded from this release.")
        else:
            lines.append(f"- No backport in progress. {bp.get('note','')}")
    nfeat = sum(len(g.get('prs', [])) for g in data.get('user_facing', []))
    nnon = sum(len(g.get('prs', [])) for g in data.get('non_user_facing', []))
    lines.append(f"- {len(data.get('all_prs', []))} PRs new to {rel}: {nfeat} user-facing, {nnon} internal.")
    needs = data.get("needs_milestone", [])
    if needs:
        lines.append(f"- {len(needs)} resolved issues carry no milestone. Nothing applied, see the ask below.")
    lines.append("")
    for it in merged_cards(s):
        meta = " / ".join(x for x in [it.get("kind"), it.get("track")] if x)
        lines.append(f"- **{it.get('headline','')}** ({meta})")
    not_merged = s.get("not_merged") or []
    if not_merged:
        lines += ["", "Not in this release yet:"]
        for it in not_merged:
            meta = " / ".join(x for x in [it.get("status"), it.get("kind"), it.get("track")] if x)
            lines.append(f"- **{it.get('headline','')}** ({meta})")
    words = {"go": "goes live", "stop": "switches off"}
    changing = [f for f in flag_order(flag_items(data))
                if (flag_column(f) in words if f.get("next") else f.get("now") is not None)]
    if changing:
        lines += ["", "Feature flags changing in this release:"]
        for f in changing:
            what = words.get(flag_column(f)) if f.get("next") else "flag removed"
            lines.append(f"- **{f.get('name') or f['key']}** (`{f['key']}`): {what}")
    lines.append(cut_decision(data))
    lines.append(milestone_ask(data))
    return "\n".join(lines) + "\n"


def cut_decision(data):
    """The roll-or-delay ask. Delay only ever buys the in-progress work, never the
    untouched work, so the two counts have to be separated or the trade looks better
    than it is."""
    ms = (data.get("milestones") or {})
    rows = []
    for key in ("next_major",):
        m = ms.get(key)
        if not m:
            continue
        pend = [i for i in m.get("issues", []) if i.get("status") == "pending"]
        prog = [i for i in m.get("issues", []) if i.get("status") == "inprogress"]
        if pend or prog:
            rows.append((m.get("name", ""), pend, prog))
    if not rows:
        return ""
    repo = data.get("repo", "")
    out = ["", "---", "", "**The cut is a judgement call, and it is yours.**"]
    for name, pend, prog in rows:
        out.append("")
        out.append(f"`{name}`: {len(prog)} in progress, {len(pend)} not started.")
        for i in prog:
            out.append(f"- in progress, would land if you hold the cut: "
                       f"[#{i['number']}]({iss_url(repo, i['number'])}) {i.get('title','')}")
        for i in pend:
            out.append(f"- nothing ready to merge: [#{i['number']}]({iss_url(repo, i['number'])}) {i.get('title','')}")
    out += ["",
            "Holding the cut only ever buys the in-progress work. The not-started items need a decision either way: "
            "keep them and delay, or roll without them and move them to the next milestone."]
    uniq = release_issues(data)
    if has_board(uniq):
        passed, flagged, untriaged = qa_split(uniq)
        out += ["", f"On the Zenhub QA board, {len(passed)} of {len(uniq)} have passed test."]
        if flagged:
            out.append("Failed or blocked, and still riding this release: "
                       + ", ".join(f"[#{r['number']}]({iss_url(repo, r['number'])})" for r in flagged) + ".")
        if untriaged:
            out.append(f"{len(untriaged)} sit in the QA board's default column, so nobody has triaged them into a "
                       "test state. That is a missing record rather than a failure.")
    out += ["",
            "Cutting is not the end of the line. QA is manual and runs after the cut, alongside app store review, "
            "and a QA failure is fixed by cherry-picking onto the release branch. So this decides what gets *submitted*, "
            "not what is final.",
            "",
            "Tell me which to move and I will re-milestone them."]
    return "\n".join(out)


def milestone_ask(data):
    """Built here rather than by the caller so the counts and links cannot drift from
    what the report shows. Meant to be relayed verbatim."""
    repo = data.get("repo", "")
    needs = data.get("needs_milestone", [])
    if not needs:
        return ""
    out = ["", "---", "",
           f"**{len(needs)} issues look resolved by PRs already on master but carry no milestone.** "
           "They ship in the next cut either way. Tagging is what keeps them out of the release-notes blind spot.",
           "", f"Review all {len(needs)} together: {review_url(repo, needs)}", ""]
    for r in needs:
        by = ", ".join(f"#{n}" for n in r.get("resolved_by", []))
        out.append(f"- [#{r['number']}]({iss_url(repo, r['number'])}) {r.get('title','')} "
                   f"-> `{r.get('suggested','')}` (resolved by {by})")
    out += ["", "Nothing has been applied. Say go and I will run the `gh issue edit` commands and report what changed."]
    return "\n".join(out)


def main():
    if len(sys.argv) != 3:
        print("usage: render_report.py <report.json> <out.html>", file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    html_out = render_html(data)
    # Guard the repo rule: no em/en dashes in the artifact.
    bad = html_out.count(chr(0x2014)) + html_out.count(chr(0x2013))
    if bad:
        warn(f"{bad} em/en dash(es) in output - fix the JSON text")
    if not data.get("tracks"):
        warn("no 'tracks' block - the report will not say what is in production "
             "on native vs web. See SKILL.md step 1.")
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(html_out)
    sys.stdout.write(render_briefing(data))
    for w in WARNINGS:
        print(f"warning: {w}", file=sys.stderr)


if __name__ == "__main__":
    main()
