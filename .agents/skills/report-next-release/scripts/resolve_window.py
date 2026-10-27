#!/usr/bin/env python3
"""Resolve a release window into PRs and the issues they reference.

Does the mechanical half of Steps 2, 4 and 5: derive both track baselines, list
every PR merged to master since, scrape the issue references out of each PR body,
resolve every reference against the API, and read each issue's Zenhub board state.

It deliberately does NOT decide whether a PR *resolves* a referenced issue or
merely mentions it. That call needs reading, and getting it wrong tags the wrong
issue, so it stays with the model. Everything here is reproducible and boring.

Usage:
  python3 resolve_window.py --repo fedibtc/fedi --repo-path . > window.json
  python3 resolve_window.py --repo fedibtc/fedi --repo-path . --native-base 26.6.0
  python3 resolve_window.py --milestone 26.7.0 --milestone web-26.7 > window.json

Output:
  {
    "baselines": {"native": {...}, "web": {...}},
    "prs": [{number, title, date, author, body_refs: [...], ...}],
    "refs": {"11474": {kind, state, milestone, labels, title, board: {dev, qa}}, ...},
    "milestone_issues": {"26.7.0": [{number, title, state, board, open_prs}], ...},
    "open_prs": [{number, title, draft, author, updated, body_refs}],
    "milestones": [{number, state, title, open_issues, closed_issues}],
    "flags": {served, next_ref, native_ref, app_ref, items: [{key, field, control, now, next, added, added_pr, platforms, order, doc}]},
    "warnings": [...]
  }
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REF_RE = re.compile(r"#(\d{3,6})")
# Bots filing tickets about their own runs. Never release content.
NOISE_LABELS = {"agentic-workflows"}

# The repo is on five Zenhub boards. These two carry release-relevant state:
# "Dev Team" says how far the work got, "QA" says whether a tester signed off.
BOARDS = (("dev", "Dev Team"), ("qa", "QA"))
BOARD_RE = re.compile(r"^#(\d+)\s+(.*?)\s+(?:open|closed)\s")

FEATURES_TS = "ui/web/src/pages/api/features.ts"
FEATURES_RS = "crates/runtime/src/features.rs"
CONSTANTS_RS = "crates/runtime/src/constants.rs"
LIVE_FEATURES = "https://app.fedi.xyz/api/features"
LIVE_VERSION = "https://app.fedi.xyz/api/version"
IGNORED_FLAGS = {"dummy_feature"}
FLAG_USE_PATHS = ("ui/native", "ui/web", "ui/common", "bridge", "crates")


def run(cmd, check=True):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{p.stderr.strip()}")
    return p.stdout.strip()


def git(repo_path, *args, check=True):
    return run(["git", "-C", repo_path, *args], check=check)


def native_baseline(repo_path, warnings):
    """Should equal the 26.M.0 tag, so a mismatch means the branch moved and the
    window is measured from the wrong place. Warn rather than assume."""
    branches = git(repo_path, "branch", "-r", "--list", "origin/release/*").splitlines()
    vers = []
    for b in branches:
        m = re.search(r"origin/release/(\d+\.\d+)$", b.strip())
        if m:
            vers.append(m.group(1))
    if not vers:
        warnings.append("no origin/release/NN.N branch found; native baseline unknown")
        return None
    latest = sorted(vers, key=lambda v: [int(x) for x in v.split(".")])[-1]
    branch = f"origin/release/{latest}"
    sha = git(repo_path, "merge-base", "origin/master", branch)
    tag = f"{latest}.0"
    tag_sha = git(repo_path, "rev-list", "-1", tag, check=False)
    if tag_sha and tag_sha != sha:
        warnings.append(f"merge-base {sha[:9]} != tag {tag} at {tag_sha[:9]}; branch may have been rebased")
    return {"how": f"merge-base(origin/master, {branch})", "branch": branch, "release": latest,
            "sha": sha, "date": git(repo_path, "log", "-1", "--format=%cs", sha),
            "subject": git(repo_path, "log", "-1", "--format=%s", sha)}


def web_baseline(repo_path, warnings):
    """Ancestry is the test, not recency: a lineage tag is a real deploy but is not on
    master, so it cannot mark where master last shipped."""
    def vkey(t):
        return [int(x) for x in re.findall(r"\d+", t)]
    merged = [t for t in git(repo_path, "tag", "--merged", "origin/master", "--list", "web/*").splitlines() if t]
    allt = [t for t in git(repo_path, "tag", "--list", "web/*").splitlines() if t]
    if not merged:
        warnings.append("no web/* tag is an ancestor of master; web baseline unknown")
        return None
    base = sorted(merged, key=vkey)[-1]
    newest = sorted(allt, key=vkey)[-1] if allt else base
    sha = git(repo_path, "rev-list", "-1", base)
    out = {"how": "newest web/* tag merged into master", "tag": base, "sha": sha,
           "date": git(repo_path, "log", "-1", "--format=%cs", sha),
           "newest_tag": newest, "lineage_carried": []}
    if newest != base:
        # A lineage tag can carry work that merged after the baseline, so the window
        # computed from the baseline is a LOWER bound until this is subtracted.
        carried = git(repo_path, "log", "--format=%h %s", f"{base}..{newest}", check=False)
        out["lineage_carried"] = [l for l in carried.splitlines() if l]
        warnings.append(f"{newest} is a lineage tag carrying {len(out['lineage_carried'])} commit(s) "
                        f"not on master; subtract anything real from the web window")
    return out


def fetch_prs(repo, since):
    raw = run(["gh", "pr", "list", "--repo", repo, "--base", "master", "--state", "merged",
               "--search", f"merged:>={since}", "--limit", "500",
               "--json", "number,title,body,mergedAt,author,milestone"])
    prs = json.loads(raw)
    prs.sort(key=lambda p: p["mergedAt"])
    return prs


def fetch_open_prs(repo):
    """Open PRs against master with their body refs. A milestone issue with one that
    is ready for review is in progress; with only a draft, or none, it is planned."""
    raw = run(["gh", "pr", "list", "--repo", repo, "--base", "master", "--state", "open",
               "--limit", "300", "--json", "number,title,body,isDraft,author,updatedAt"])
    out = []
    for p in json.loads(raw):
        out.append({"number": p["number"], "title": p["title"], "draft": bool(p.get("isDraft")),
                    "author": (p.get("author") or {}).get("login", ""),
                    "updated": (p.get("updatedAt") or "")[:10],
                    "body_refs": sorted({int(m) for m in REF_RE.findall(p.get("body") or "")})})
    out.sort(key=lambda p: p["number"])
    return out


def resolve_ref(repo, n):
    raw = run(["gh", "api", f"repos/{repo}/issues/{n}",
               "--jq", '[(if .pull_request then "PR" else "ISSUE" end), .state, '
                       '(.milestone.title // "-"), ([.labels[].name]|join(",")), .title] | @tsv'],
              check=False)
    if not raw:
        return n, None
    parts = raw.split("\t")
    if len(parts) < 5:
        return n, None
    return n, {"kind": parts[0], "state": parts[1], "milestone": parts[2],
               "labels": [l for l in parts[3].split(",") if l], "title": parts[4]}


def board_state(numbers, warnings):
    """One number that is not an issue 404s the whole batch, so pass only numbers already
    confirmed as issues."""
    out = {}
    if not numbers:
        return out
    nums = sorted(numbers)
    for key, ws in BOARDS:
        for i in range(0, len(nums), 20):
            chunk = [str(n) for n in nums[i:i + 20]]
            raw = run(["zenhub", "status", "--workspace", ws, *chunk], check=False)
            if not raw:
                warnings.append(f"no zenhub data for the {ws} board, so this report cannot say what "
                                "has passed QA. Check `zenhub status 11179` and rerun, or say in the "
                                "report that board state is missing.")
                return out
            for line in raw.splitlines():
                m = BOARD_RE.match(line.strip())
                if m:
                    out.setdefault(m.group(1), {})[key] = m.group(2).strip()
    return out


def milestone_issues(repo, names, warnings):
    out = {}
    for name in names:
        raw = run(["gh", "issue", "list", "--repo", repo, "--milestone", name, "--state", "all",
                   "--limit", "200", "--json", "number,title,state"], check=False)
        if not raw:
            warnings.append(f"milestone {name} returned no issues; check the name against "
                            "`gh api 'repos/{repo}/milestones?state=all'`")
            out[name] = []
            continue
        rows = json.loads(raw)
        for r in rows:
            r["state"] = r["state"].lower()
        out[name] = sorted(rows, key=lambda r: r["number"])
    return out


def snake(key):
    return re.sub(r"[A-Z]", lambda m: "_" + m.group(0).lower(), key)


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "report-next-release"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except (OSError, ValueError):
        return None


def show(repo_path, ref, path):
    return git(repo_path, "show", f"{ref}:{path}", check=False)


def ts_values(src, name):
    m = re.search(rf"const {name}: RemoteFeatures = \{{(.*?)\n\}}", src or "", re.S)
    if not m:
        return None
    out = {}
    for spread, k, v in re.findall(r"^\s*(?:\.\.\.(\w+)|(\w+):\s*(true|false)),?\s*$", m.group(1), re.M):
        if spread:
            out.update(ts_values(src, spread) or {})
        else:
            out[k] = v == "true"
    return out


def remote_states(prod, edge):
    return {snake(k): "on" if on else "edge" if (edge or {}).get(k) else "off" for k, on in prod.items()}


def remote_fields(src):
    """The flags an app build takes from the server. A served key outside this struct is ignored."""
    m = re.search(r"pub struct RemoteFeatures \{(.*?)\n\}", src or "", re.S)
    return set(re.findall(r"^\s*pub (\w+):", m.group(1), re.M)) if m else set()


def ctor_fields(src, fn):
    m = re.search(rf"fn {fn}\(\) -> Self \{{(.*?)\n    \}}", src or "", re.S)
    return dict(re.findall(r"^            (\w+): (None|Some)\b", m.group(1), re.M)) if m else None


def ctor_states(src):
    prod, edge = ctor_fields(src, "new_prod"), ctor_fields(src, "new_edge") or {}
    if prod is None:
        return None
    return {f: "on" if v == "Some" else "edge" if edge.get(f) == "Some" else "off" for f, v in prod.items()}


def catalog_fields(src):
    """Option fields are the switchable features. The rest is per-environment config."""
    m = re.search(r"pub struct FeatureCatalog \{(.*?)\n\}", src or "", re.S)
    out, doc = {}, []
    for line in (m.group(1) if m else "").splitlines():
        s = line.strip()
        if s.startswith("///"):
            doc.append(s[3:].strip())
        elif s.startswith("#["):
            continue
        else:
            fm = re.match(r"pub (\w+): (Option<)?", s)
            if fm:
                out[fm.group(1)] = {"gate": bool(fm.group(2)), "doc": " ".join(d for d in doc if d)}
            doc = []
    return out


def flag_added(repo_path, ref, needle, path, shallow):
    """A flag older than a shallow clone first appears in the boundary commit, which is not
    when it was added."""
    log = git(repo_path, "log", f"-S{needle}", "--reverse", "--format=%H %cs %s", ref, "--", path, check=False)
    first = log.splitlines()[0] if log else ""
    if not first or first.split(" ", 1)[0] in shallow:
        return None, None
    sha, date, subject = first.split(" ", 2)
    pr = re.search(r"\(#(\d+)\)\s*$", subject)
    return date, int(pr.group(1)) if pr else None


def flag_platforms(repo_path, ref, field):
    excludes = [f":!{FEATURES_RS}", ":!ui/common/types/bindings.ts"]
    out = git(repo_path, "grep", "-l", "-w", field, ref, "--", *FLAG_USE_PATHS, *excludes, check=False)
    dirs = {"/".join(p.split(":", 1)[-1].split("/")[:2]) for p in out.splitlines()}
    plats = (["ios", "android"] if "ui/native" in dirs else []) + (["web"] if "ui/web" in dirs else [])
    return plats or ["ios", "android", "web"]


def feature_flags(repo_path, target, nat, web, web_only, warnings):
    common = git(repo_path, "rev-parse", "--git-common-dir", check=False)
    try:
        with open(f"{common}/shallow", encoding="utf-8") as f:
            shallow = set(f.read().split())
    except OSError:
        shallow = set()

    ts_next = show(repo_path, target, FEATURES_TS)
    rs_next = show(repo_path, target, FEATURES_RS)
    prod_next = ts_values(ts_next, "prodRemoteFeatures")
    if prod_next is None:
        warnings.append(f"could not read prodRemoteFeatures from {FEATURES_TS} at {target}; no flags block")
        return None

    edge_url = re.search(r'EDGE_REMOTE_FEATURES_URL: &str = "([^"]+)"', show(repo_path, target, CONSTANTS_RS) or "")
    edge_url = edge_url.group(1) if edge_url else LIVE_FEATURES + "?env=edge"
    # the staging deployment answers edge builds with the dev values
    edge_map = "edgeRemoteFeatures" if edge_url.startswith(LIVE_FEATURES) else "edgeDevRemoteFeatures"
    nxt = remote_states(prod_next, ts_values(ts_next, edge_map) or ts_values(ts_next, "edgeRemoteFeatures"))

    live_prod = fetch_json(LIVE_FEATURES)
    live_edge = fetch_json(edge_url)
    version = (fetch_json(LIVE_VERSION) or {}).get("version")
    if isinstance(live_prod, dict):
        now = remote_states(live_prod, live_edge if isinstance(live_edge, dict) else {})
    else:
        ref = (web or {}).get("sha") or target
        ts_now = show(repo_path, ref, FEATURES_TS)
        now = remote_states(ts_values(ts_now, "prodRemoteFeatures") or {},
                            ts_values(ts_now, edge_map) or ts_values(ts_now, "edgeRemoteFeatures"))
        warnings.append(f"{LIVE_FEATURES} did not answer, so the current flag values come from "
                        f"{FEATURES_TS} at the web baseline, which may not be what is deployed")

    native_ref = (nat or {}).get("branch") or (nat or {}).get("sha") or target
    app_ref = native_ref if web_only else target
    rs_now, rs_app = show(repo_path, native_ref, FEATURES_RS), show(repo_path, app_ref, FEATURES_RS)
    reads_now, reads_after = remote_fields(rs_now), remote_fields(rs_app)
    built_now, built_next = ctor_states(rs_now), ctor_states(rs_app)

    order = {snake(k): i for i, k in enumerate(prod_next)}
    catalog = catalog_fields(rs_next)
    items, listed = [], set()
    for field in sorted(set(now) | set(nxt), key=lambda f: order.get(f, -1)):
        removed = field not in nxt and field not in reads_after and field not in (built_next or {})
        if field in IGNORED_FLAGS or (field not in reads_after and not removed):
            continue
        served_now = now.get(field) if field in now else None
        if field not in reads_now or served_now is None:
            served_now = (built_now or {}).get(field)
        key = re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), field)
        added, pr = flag_added(repo_path, target, key, FEATURES_TS, shallow)
        items.append({"key": key, "field": field, "control": "remote",
                      "now": served_now, "next": nxt.get(field), "added": added, "added_pr": pr,
                      "platforms": flag_platforms(repo_path, target, field), "order": order.get(field, -1),
                      "doc": catalog.get(field, {}).get("doc", "")})
        listed.add(field)

    if built_now is None or built_next is None:
        warnings.append(f"could not read new_prod() from {FEATURES_RS}; built-in switches are left out")
    else:
        nightly = ctor_fields(rs_next, "new_staging") or {}
        for field, meta in catalog.items():
            if not meta["gate"] or field in IGNORED_FLAGS or field in listed:
                continue
            before, after = built_now.get(field), built_next.get(field)
            unreleased = after not in (None, "on") and nightly.get(field) == "Some"
            if before == after and not unreleased:
                continue
            # a built-in switch that arrives off changes nothing until a later update turns it on
            if before is None and after == "off" and not unreleased:
                continue
            added, pr = flag_added(repo_path, target, field, FEATURES_RS, shallow)
            items.append({"key": field, "field": field, "control": "app",
                          "now": before, "next": after,
                          "added": added, "added_pr": pr, "platforms": flag_platforms(repo_path, target, field),
                          "order": len(order), "doc": meta["doc"]})
    return {"served": {"url": LIVE_FEATURES, "version": version, "live": isinstance(live_prod, dict)},
            "next_ref": target, "native_ref": native_ref, "app_ref": app_ref, "items": items}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="fedibtc/fedi")
    ap.add_argument("--repo-path", default=".")
    ap.add_argument("--native-base", help="override: a sha or tag")
    ap.add_argument("--web-base", help="override: a sha or tag")
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--milestone", action="append", default=[],
                    help="pull the issues on this milestone too, repeatable")
    ap.add_argument("--no-zenhub", action="store_true", help="skip board state")
    ap.add_argument("--target", default="origin/master",
                    help="the ref the release is built from; flag values after the release are read here")
    ap.add_argument("--web-only", action="store_true",
                    help="the release ships no app build, so people keep the app on the native baseline")
    args = ap.parse_args()

    warnings = []
    git(args.repo_path, "fetch", "origin", "--tags", "--quiet", check=False)

    nat = native_baseline(args.repo_path, warnings)
    web = web_baseline(args.repo_path, warnings)
    if args.native_base:
        sha = git(args.repo_path, "rev-list", "-1", args.native_base)
        nat = {"how": "override", "sha": sha, "date": git(args.repo_path, "log", "-1", "--format=%cs", sha)}
    if args.web_base:
        sha = git(args.repo_path, "rev-list", "-1", args.web_base)
        web = {"how": "override", "sha": sha, "date": git(args.repo_path, "log", "-1", "--format=%cs", sha)}

    dates = [b["date"] for b in (nat, web) if b and b.get("date")]
    if not dates:
        print("could not derive either baseline", file=sys.stderr)
        sys.exit(1)
    since = min(dates)

    prs = fetch_prs(args.repo, since)
    for p in prs:
        p["date"] = p["mergedAt"][:10]
        p["author"] = (p.get("author") or {}).get("login", "")
        p["milestone"] = (p.get("milestone") or {}).get("title", "-") or "-"
        p["body_refs"] = sorted({int(m) for m in REF_RE.findall(p.get("body") or "")})
        p.pop("body", None)
        p.pop("mergedAt", None)

    want = sorted({r for p in prs for r in p["body_refs"]})
    refs = {}
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        for n, meta in ex.map(lambda n: resolve_ref(args.repo, n), want):
            if meta:
                refs[str(n)] = meta
    missing = [n for n in want if str(n) not in refs]
    if missing:
        warnings.append(f"{len(missing)} reference(s) did not resolve: {missing[:10]}")

    noise = [n for n, m in refs.items() if NOISE_LABELS & set(m["labels"])]
    for n in noise:
        refs[n]["noise"] = True

    ms_raw = run(["gh", "api", f"repos/{args.repo}/milestones?state=all&per_page=100",
                  "--jq", '[.[] | {number, state, title, open_issues, closed_issues}]'])

    ms_issues = milestone_issues(args.repo, args.milestone, warnings) if args.milestone else {}

    open_prs = fetch_open_prs(args.repo)
    open_by_ref = {}
    for p in open_prs:
        for r in p["body_refs"]:
            open_by_ref.setdefault(r, []).append(
                {"number": p["number"], "title": p["title"], "draft": p["draft"], "updated": p["updated"]})
    for rows in ms_issues.values():
        for r in rows:
            r["open_prs"] = open_by_ref.get(r["number"], [])

    boards = {}
    if not args.no_zenhub:
        want_board = {int(n) for n, m in refs.items() if m["kind"] == "ISSUE" and not m.get("noise")}
        want_board |= {r["number"] for rows in ms_issues.values() for r in rows}
        boards = board_state(want_board, warnings)
        for n, meta in refs.items():
            if n in boards:
                meta["board"] = boards[n]
        for rows in ms_issues.values():
            for r in rows:
                if str(r["number"]) in boards:
                    r["board"] = boards[str(r["number"])]

    flags = feature_flags(args.repo_path, args.target, nat, web, args.web_only, warnings)

    json.dump({"repo": args.repo,
               "baselines": {"native": nat, "web": web},
               "window_since": since,
               "prs": prs,
               "refs": refs,
               "issue_refs_dropped_as_noise": noise,
               "milestone_issues": ms_issues,
               "open_prs": open_prs,
               "milestones": json.loads(ms_raw),
               "flags": flags,
               "warnings": warnings},
              sys.stdout, indent=1)
    sys.stdout.write("\n")
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    print(f"resolved {len(prs)} PRs, {len(refs)} refs ({len(noise)} dropped as bot noise), "
          f"{len(boards)} on the board, {len(open_prs)} open PRs against master", file=sys.stderr)


if __name__ == "__main__":
    main()
