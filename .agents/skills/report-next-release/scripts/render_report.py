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
    belongs on Full report. Summary gets the lane and one line on the patch.
  - DARK BY DEFAULT, with a light toggle that persists to localStorage. Do not
    hardcode a hex outside the two :root blocks, or one theme breaks.
  - Two release tracks, always. Native and web have different "already released"
    baselines, so a single current version is always wrong for one of them.
  - Status says "Pending release", never "Shipped". Merged to master is not
    released. "Shipped"/live means a production flag is on, which this report
    does not assert.
  - No em or en dashes anywhere in output. Use a regular hyphen. (Repo rule.)
  - Chips never wrap mid-word (white-space:nowrap); the chip row wraps whole
    pills instead.

See SKILL.md for the JSON schema and how to fill it.
"""
import html
import json
import sys

# ---- chip vocab -> color class -------------------------------------------
KIND_CLS = {"New feature": "k-feat", "Improvement": "k-imp", "Fix": "k-fix"}
STATUS_CLS = {"Pending release": "s-ship", "In progress": "s-prog", "Planned": "s-plan"}

# Milestone-issue status -> badge. "done" = a merged window PR addresses it;
# "pending" = milestoned but no code yet; "backport" = its fix ships in the
# patch, not the next major; "inprogress" = open PR, not on master yet.
STATUS_BADGE = {
    "done": '<span class="badge ok">on master</span>',
    "pending": '<span class="badge wait">not yet on master</span>',
    "backport": '<span class="badge bp">ships in the backport</span>',
    "inprogress": '<span class="badge prog">fix in progress</span>',
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
# Release tracks (native and web). Two renderers, one per altitude.
# --------------------------------------------------------------------------
# Keep chronological: a cut build is ahead of anything still queued on master.
STOPS = (("live", "Live now"), ("in_flight", "In flight"),
         ("waiting", "Waiting to go out"), ("next", "Next"))
STOP_FIELDS = tuple(f for f, _ in STOPS)

# Fixed slot order, so android-only and ios-only read off the same positions.
PLATFORM_ORDER = ("ios", "android", "web")
PLATFORM_LABEL = {"ios": "iOS", "android": "Android", "web": "Web app"}
PLATFORM_SVG = {
    "ios": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.7 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.4 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3z"/></svg>',
    "android": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5h12v7.2a1 1 0 0 1-1 1h-.9v2.6a1.2 1.2 0 1 1-2.4 0v-2.6h-1.5v2.6a1.2 1.2 0 1 1-2.4 0v-2.6H9a1 1 0 0 1-1-1V9.5H6zm-1.6 0a1.2 1.2 0 0 1 1.2 1.2v4.1a1.2 1.2 0 1 1-2.4 0v-4.1a1.2 1.2 0 0 1 1.2-1.2zm15.2 0a1.2 1.2 0 0 1 1.2 1.2v4.1a1.2 1.2 0 1 1-2.4 0v-4.1a1.2 1.2 0 0 1 1.2-1.2zM8.1 8.4a4.4 4.4 0 0 1 7.8 0zM9.6 5.9a.55.55 0 1 0 0-1.1.55.55 0 0 0 0 1.1zm4.8 0a.55.55 0 1 0 0-1.1.55.55 0 0 0 0 1.1zM8.7 3.3l-.9-1.5a.3.3 0 0 1 .5-.3l.9 1.6zm6.6 0-.5-.2.9-1.6a.3.3 0 0 1 .5.3z"/></svg>',
    "web": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.6 15.6 0 0 0-1.4-3.7A8 8 0 0 1 18.9 8zM12 4.1c.7 1 1.3 2.3 1.7 3.9h-3.4c.4-1.6 1-2.9 1.7-3.9zM4.3 14a8 8 0 0 1 0-4h3.3a17.6 17.6 0 0 0 0 4zm.8 2h2.9c.3 1.4.8 2.6 1.4 3.7A8 8 0 0 1 5.1 16zm2.9-8H5.1a8 8 0 0 1 4.3-3.7A15.6 15.6 0 0 0 8 8zM12 19.9c-.7-1-1.3-2.3-1.7-3.9h3.4c-.4 1.6-1 2.9-1.7 3.9zm2.1-5.9H9.9a15.5 15.5 0 0 1 0-4h4.2a15.5 15.5 0 0 1 0 4zm.5 5.7c.6-1.1 1.1-2.3 1.4-3.7h2.9a8 8 0 0 1-4.3 3.7zm1.8-5.7a17.6 17.6 0 0 0 0-4h3.3a8 8 0 0 1 0 4z"/></svg>',
}

PLATFORM_JS = json.dumps({"order": list(PLATFORM_ORDER), "label": PLATFORM_LABEL})

LAYOUTS = (("all", "All"), ("status", "Status"), ("platform", "Platform"))


def track_lanes(tracks):
    """Summary hero. Stops only, nothing more specific: sha, baseline, lineage and
    raw counts all belong to track_cards(). Prominence is authored, not computed:
    nothing here can tell an anomaly from a normal month."""
    if not tracks:
        return ""
    # One expanded lane at most, named in tracks.focus. Two of them is 330px of
    # hero restating the title, and both tracks being interesting is this repo's
    # normal state, so a per-track flag chooses "full" nearly every month.
    focus = tracks.get("focus")
    if focus not in (None, "native", "web", "none"):
        warn(f"tracks.focus is {focus!r}, not 'native', 'web' or 'none'. No lane is expanded.")
        focus = None
    out = ['<div class="lanes">']
    for key, label in (("native", "Native app"), ("web", "Web app")):
        t = tracks.get(key)
        if not isinstance(t, dict):
            continue
        g = t.get("glance")
        if not g:
            warn(f"tracks.{key} has no 'glance' block, so the summary is falling back to the "
                 "long fields and reads as detail. See SKILL.md step 1.")
            g = {"live": t.get("current", ""), "waiting": t.get("in_window", ""), "next": t.get("next", "")}

        emph = g.get("emph") or "waiting"
        if emph not in STOP_FIELDS:
            warn(f"tracks.{key}.glance.emph is {emph!r}, not one of {', '.join(STOP_FIELDS)}. "
                 "Falling back to 'waiting'.")
            emph = "waiting"
        if g.get("prominence"):
            warn(f"tracks.{key}.glance.prominence is set but no longer read. Name the one "
                 "track worth expanding in tracks.focus instead.")
        quiet = key != focus

        cells = []
        for field, stop_label in STOPS:
            val = g.get(field) or ""
            if not val:
                continue
            note = g.get(field + "_note") or ""
            budget(val, 34, f"tracks.{key}.glance.{field}")
            budget(note, 42, f"tracks.{key}.glance.{field}_note")
            cells.append((field, stop_label, val, note))
        if not cells:
            continue

        if quiet:
            bits = []
            for field, stop_label, val, note in cells:
                strong = ' class="qe"' if field == emph else ""
                tail = f' <span class="qn">{esc(note)}</span>' if note else ""
                bits.append(f'<span{strong}>{esc(val)}</span>{tail}')
            out.append(f'<div class="lane quiet"><span class="lname">{label}</span>'
                       + '<span class="qsep">&#8594;</span>'.join(bits) + '</div>')
            continue

        stops = []
        for field, stop_label, val, note in cells:
            note_html = f'<div class="sn">{esc(note)}</div>' if note else ""
            cls = "stop emph" if field == emph else "stop"
            stops.append(f'<div class="{cls}"><div class="sl">{esc(stop_label)}</div>'
                         f'<div class="sv">{esc(val)}</div>{note_html}</div>')
        row = '<div class="arrow">&#8594;</div>'.join(stops)
        out.append(f'<div class="lane"><div class="lname">{label}</div>'
                   f'<div class="lrow">{row}</div></div>')

    out.append('</div>')
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


def platform_marks(active):
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
    return f'<span class="pmarks" aria-label="{esc(label)}">{"".join(cells)}</span>'


def summary_cards(items):
    out = []
    for it in items:
        budget(it.get("summary"), 300, f'summary card "{it.get("headline","")}"')
        badge = it.get("badge") or ""
        badge_html = f'<span class="flagbadge">{esc(badge)}</span>' if badge else ""
        kind, status = it.get("kind", ""), it.get("status", "")
        plats = card_platforms(it)
        body = it.get("summary") or ""
        body_html = f'<p class="ssum">{esc(body)}</p>' if body else ""
        out.append(
            f'<article class="scard" data-plat="{" ".join(plats)}" '
            f'data-status="{esc(status)}" data-kind="{esc(kind)}">'
            f'<div class="schips"><span class="chip {KIND_CLS.get(kind,"")}">{esc(kind)}</span>'
            f'<span class="chip {STATUS_CLS.get(status,"")}">{esc(status)}</span>'
            f'{badge_html}{platform_marks(plats)}</div>'
            f'<h3 class="shead">{esc(it.get("headline",""))}</h3>'
            f'{body_html}</article>'
        )
    return "\n".join(out)


def backport_banner(bp):
    """One line only. The full note lists the cherry-picked PRs by number, so it
    renders on the full tab instead."""
    if not bp:
        return ""
    headline = bp.get("headline")
    if not headline:
        if bp.get("in_progress"):
            ver = bp.get("version", "A patch")
            n = len(bp.get("items", []))
            headline = f'{ver} is in progress: {n} fix{"es" if n != 1 else ""} go out before this release.'
        else:
            headline = "No patch is in progress."
        warn("backport has no 'headline', so the summary line is generated. Write one sentence "
             "a non-technical reader gets. See SKILL.md step 8.")
    budget(headline, 180, "backport.headline")
    cls = "bpbanner" if bp.get("in_progress") else "bpbanner none"
    return f'<div class="{cls}">{esc(headline)}</div>'


def planned_section(summary, repo):
    keep = summary.get("planned_keep")
    park = summary.get("planned_park") or []
    if not keep and not park:
        return ""
    out = ['<h2>Previously planned for this release</h2>',
           '<p class="sub">These carried the milestone but have no work done yet. They need to be reconsidered for reprioritization.</p>']
    if keep:
        out.append('<div class="keepcard">')
        out.append('<div class="schips"><span class="chip keep">Keep</span></div>')
        out.append(f'<h3>{esc(keep.get("title",""))}</h3>')
        if keep.get("detail"):
            out.append(f'<p>{esc(keep["detail"])}</p>')
        out.append('</div>')
    if park:
        out.append('<div class="parkbox"><div class="park-label">Park and reprioritize</div><ul>')
        out.extend(f"<li>{esc(p)}</li>" for p in park)
        out.append('</ul></div>')
    return "\n".join(out)


def pending_counts(data):
    """Milestone issues with an open fix vs no code at all. Two different trades, so
    they are never summed."""
    ms = data.get("milestones") or {}
    pend = prog = 0
    for key in ("next_major", "next_web"):
        for i in (ms.get(key) or {}).get("issues") or []:
            if i.get("status") == "pending":
                pend += 1
            elif i.get("status") == "inprogress":
                prog += 1
    return pend, prog


def decision_exit(data):
    """Counts and the trade only. The issue lists and the reasoning live on the
    full tab."""
    pend, prog = pending_counts(data)
    needs = len(data.get("needs_milestone", []))
    if not (pend or prog or needs):
        return ""
    out = ['<div class="exit"><div class="exit-label">What needs a decision</div><ul>']
    if prog or pend:
        line = "Whether to cut now. "
        if prog:
            line += f"{prog} planned item{'s' if prog != 1 else ''} would land if you wait for an open fix to merge. "
        if pend:
            line += (f"{pend} ha{'ve' if pend != 1 else 's'} no code at all, so waiting does nothing for "
                     f"{'them' if pend != 1 else 'it'}: keep {'them' if pend != 1 else 'it'} and the release slips, "
                     "or roll without and move to the next milestone.")
        out.append(f"<li>{line.strip()}</li>")
    if needs:
        out.append(f"<li>Whether to tag {needs} finished issue{'s' if needs != 1 else ''} that carry no milestone. "
                   "They go out either way. Tagging is what keeps them in the release notes.</li>")
    out.append(qa_exit_line(data))
    out.append('</ul></div>')
    return "\n".join(out)


def qa_exit_line(data):
    """Counts only, no board vocabulary: this renders on the summary tab."""
    uniq = release_issues(data)
    if not has_board(uniq):
        return ""
    passed, flagged, untriaged = qa_split(uniq)
    line = f"Whether to cut with {len(passed)} of {len(uniq)} items carrying a tester sign-off. "
    if untriaged:
        line += (f"{len(untriaged)} get their first look during QA on the release build, after the cut. ")
    if flagged:
        line += f"{len(flagged)} came back failed or blocked and need a call before the cut."
    return f"<li>{line.strip()}</li>"


def layout_switch():
    btns = "".join(
        f'<button class="lbtn{" active" if key == "all" else ""}" data-layout="{key}">{esc(lbl)}</button>'
        for key, lbl in LAYOUTS)
    return (f'<div class="lswitch"><span class="lswitch-l">Layout</span>{btns}'
            '<button class="lbtn lall" hidden>Expand all</button></div>')


def render_summary(data):
    repo = data.get("repo", "")
    s = data.get("summary", {})
    budget(s.get("title"), 90, "summary.title")
    budget(s.get("lede"), 240, "summary.lede")
    parts = [f'<h1>{esc(s.get("title","At a glance"))}</h1>']
    if s.get("lede"):
        parts.append(f'<p class="lede">{esc(s["lede"])}</p>')
    parts.append(track_lanes(data.get("tracks")))
    parts.append(backport_banner(data.get("backport")))
    sw = layout_switch() if (s.get("features") or s.get("fixes")) else ""
    parts.append(f'<div class="h2row"><h2>What users will get</h2>{sw}</div>')
    if s.get("features"):
        parts.append('<div class="subhead" data-sub>New features and improvements</div>')
        parts.append(f'<div class="scards" data-grid>{summary_cards(s["features"])}</div>')
    if s.get("fixes"):
        parts.append('<div class="subhead" data-sub>Fixes people will feel</div>')
        parts.append(f'<div class="scards" data-grid>{summary_cards(s["fixes"])}</div>')
    parts.append(planned_section(s, repo))
    parts.append(decision_exit(data))
    parts.append('<p class="sub" style="margin-top:22px">Version numbers, the PR-by-PR breakdown, milestone status and the patch detail are on <b>Full report</b> above.</p>')
    return "\n".join(p for p in parts if p)


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
    inflates the QA numbers."""
    ms = data.get("milestones") or {}
    rows = [i for k in ("next_major", "next_web") for i in (ms.get(k) or {}).get("issues") or []]
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

    if data.get("intro"):
        parts.append(f'<div class="note">{esc(data["intro"])}</div>')

    parts.append(f'<h2>User-facing changes <span class="cnt">{nfeat}</span></h2>')
    parts.append(f'<div class="card">{theme_groups(data.get("user_facing"), repo)}</div>')
    parts.append(f'<h2>Internal / non-user-facing <span class="cnt">{nnon}</span></h2>')
    parts.append('<p class="sub">Tests, build/CI, developer tooling, and refactors. No user-visible change.</p>')
    parts.append(f'<div class="card">{theme_groups(data.get("non_user_facing"), repo)}</div>')

    nm = ms.get("next_major")
    if nm:
        parts.append(f'<h2>Milestone status - {esc(nm.get("name",""))}</h2>')
        pend = sum(1 for g in (nm, ms.get("next_web") or {}) for i in (g.get("issues") or []) if i.get("status") == "pending")
        prog = sum(1 for g in (nm, ms.get("next_web") or {}) for i in (g.get("issues") or []) if i.get("status") == "inprogress")
        if pend or prog:
            parts.append('<div class="note flag"><b>The cut is a judgement call.</b> '
                         f'{prog} issue(s) have a fix open but not merged, so holding the cut would buy those. '
                         f'{pend} have no code at all, and holding does nothing for them: they either stay and delay the release, or roll to the next milestone. '
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
 --k-feat:#845ef7;--k-imp:#22b8cf;--k-fix:#ff922b;
 --s-ship:#37b24d;--s-prog:#4c8ef7;--s-plan:#5f6570;
 --ok-bg:rgba(105,219,124,.14);--ok-bd:rgba(105,219,124,.4);
 --wait-bg:rgba(245,165,36,.14);--wait-bd:rgba(245,165,36,.4);
 --bp-bg:rgba(169,142,255,.14);--bp-bd:rgba(169,142,255,.42);
 --prog-bg:rgba(126,162,245,.14);--prog-bd:rgba(126,162,245,.4);
 --acc-bg:rgba(126,162,245,.1);--acc-bd:rgba(126,162,245,.32);
 --p-ios:#e9ebf2;--p-android:#4fe08a;--p-web:#7cb2ff;--p-off:#4d525f;}
html[data-theme="light"]{color-scheme:light;
 --bg:#f6f7f9;--card:#fff;--card2:#f0f2f5;--line:#e2e5ea;
 --tx:#1a1d23;--tx2:#3f4651;--mut:#5c6470;
 --acc:#1971c2;--ok:#2b8a3e;--wait:#9a6700;--bp:#6741d9;--prog:#1971c2;
 --uf:#2b8a3e;--nf:#868e96;--sug:#1f6feb;
 --tabbg:rgba(246,247,249,.92);--hover:rgba(25,113,194,.05);
 --pre-bg:#f3f4f6;--pre-tx:#1f2937;
 --k-feat:#7048e8;--k-imp:#0c8599;--k-fix:#e8590c;
 --s-ship:#2b8a3e;--s-prog:#1971c2;--s-plan:#5c6370;
 --ok-bg:rgba(43,138,62,.12);--ok-bd:rgba(43,138,62,.35);
 --wait-bg:rgba(154,103,0,.12);--wait-bd:rgba(154,103,0,.35);
 --bp-bg:rgba(103,65,217,.1);--bp-bd:rgba(103,65,217,.35);
 --prog-bg:rgba(25,113,194,.1);--prog-bd:rgba(25,113,194,.35);
 --acc-bg:rgba(25,113,194,.07);--acc-bd:rgba(25,113,194,.3);
 --p-ios:#1b1e25;--p-android:#0b8043;--p-web:#1a73e8;--p-off:#bcc2cc;}
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
.bpbanner{{background:var(--acc-bg);border:1px solid var(--acc-bd);border-radius:10px;padding:11px 16px;margin:0 0 6px;font-size:14px}}
.bpbanner.none{{background:transparent;border:none;padding:0 2px;color:var(--mut);font-size:13.5px}}
.lanes{{display:grid;gap:12px;margin:20px 0 24px}}
.lane{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px 16px}}
.lname{{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--acc);font-weight:700;margin-bottom:10px}}
.lrow{{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap}}
.stop{{flex:1 1 190px;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:10px 13px}}
.stop.emph{{border-color:var(--acc-bd);background:var(--acc-bg)}}
.sl{{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:700}}
.sv{{font-size:17px;font-weight:700;margin-top:3px;line-height:1.25}}
.stop.emph .sv{{color:var(--acc)}}
.sn{{color:var(--mut);font-size:12.5px;margin-top:3px}}
.arrow{{align-self:center;color:var(--mut);font-size:17px;flex:0 0 auto}}
@media (max-width:640px){{.arrow{{display:none}}}}
.lane.quiet{{display:flex;align-items:baseline;flex-wrap:wrap;gap:7px;padding:10px 16px;font-size:14px;color:var(--tx2)}}
.lane.quiet .lname{{margin:0 4px 0 0}}
.lane.quiet .qe{{color:var(--acc);font-weight:700}}
.qn{{color:var(--mut);font-size:13px}}
.qsep{{color:var(--mut)}}
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
.lbtn.active{{color:#fff;background:var(--acc);border-color:var(--acc)}}
.lall{{margin-left:10px;border-style:dashed}}
.lall[hidden]{{display:none}}
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
.trackchip{{color:var(--mut);background:var(--card2);border:1px solid var(--line)}}
.subhead{{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:24px 0 10px;font-weight:700}}
.keepcard{{background:var(--ok-bg);border:1px solid var(--ok-bd);border-left:3px solid var(--ok);border-radius:0 12px 12px 0;padding:14px 18px;margin:10px 0}}
.keepcard .chip.keep{{background:var(--s-ship)}}
.keepcard h3{{margin:8px 0 5px;font-size:16px}} .keepcard p{{margin:0;color:var(--tx2);font-size:14px;line-height:1.5}}
.parkbox{{background:var(--card2);border:1px dashed var(--line);border-radius:12px;padding:12px 18px;margin:10px 0}}
.parkbox .park-label{{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);font-weight:700;margin-bottom:6px}}
.parkbox ul{{margin:0;padding-left:18px;color:var(--tx)}} .parkbox ul li{{margin:3px 0;font-size:14px}}
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
  var STATUS_ORDER = ['In progress','Pending release','Planned'];
  var grids = [].slice.call(document.querySelectorAll('[data-grid]'));
  if (!grids.length) return;
  grids.forEach(function(g){{ g.dataset.orig = g.innerHTML; }});

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
    allBtn.hidden = mode === 'all';
    syncAll();
  }}

  var allBtn = document.querySelector('.lall');
  function panels(){{ return [].slice.call(document.querySelectorAll('#summary details.gwrap')); }}
  function syncAll(){{
    if (!allBtn || allBtn.hidden) return;
    var open = panels().some(function(d){{ return d.open; }});
    allBtn.textContent = open ? 'Collapse all' : 'Expand all';
    allBtn.dataset.next = open ? 'close' : 'open';
  }}
  if (allBtn) {{
    allBtn.addEventListener('click', function(){{
      var open = allBtn.dataset.next === 'open';
      panels().forEach(function(d){{ d.open = open; }});
      syncAll();
    }});
    // toggle does not bubble, so catch it on the way down.
    document.addEventListener('toggle', function(e){{
      if (e.target.classList && e.target.classList.contains('gwrap')) syncAll();
    }}, true);
  }}

  // [data-layout], not .lbtn: the expand-all control shares the button styling
  // and would otherwise repaint the grid and undo itself.
  document.querySelectorAll('.lbtn[data-layout]').forEach(function(b){{
    b.addEventListener('click', function(){{
      document.querySelectorAll('.lbtn[data-layout]').forEach(function(x){{ x.classList.remove('active'); }});
      b.classList.add('active');
      paint(b.dataset.layout);
    }});
  }});
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
    for it in (s.get("features", []) + s.get("fixes", [])):
        meta = " / ".join(x for x in [it.get("kind"), it.get("status"), it.get("track")] if x)
        lines.append(f"- **{it.get('headline','')}** ({meta})")
    lines.append(cut_decision(data))
    lines.append(milestone_ask(data))
    return "\n".join(lines) + "\n"


def cut_decision(data):
    """The roll-or-delay ask. Delay only ever buys the in-progress work, never the
    untouched work, so the two counts have to be separated or the trade looks better
    than it is."""
    ms = (data.get("milestones") or {})
    rows = []
    for key in ("next_major", "next_web"):
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
            out.append(f"- no code yet: [#{i['number']}]({iss_url(repo, i['number'])}) {i.get('title','')}")
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
