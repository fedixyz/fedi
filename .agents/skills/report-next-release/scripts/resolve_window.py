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
    "milestone_issues": {"26.7.0": [{number, title, state, board}], ...},
    "milestones": [{number, state, title, open_issues, closed_issues}],
    "warnings": [...]
  }
"""
import argparse
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

REF_RE = re.compile(r"#(\d{3,6})")
# Bots filing tickets about their own runs. Never release content.
NOISE_LABELS = {"agentic-workflows"}

# The repo is on five Zenhub boards. These two carry release-relevant state:
# "Dev Team" says how far the work got, "QA" says whether a tester signed off.
BOARDS = (("dev", "Dev Team"), ("qa", "QA"))
BOARD_RE = re.compile(r"^#(\d+)\s+(.*?)\s+(?:open|closed)\s")


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

    json.dump({"repo": args.repo,
               "baselines": {"native": nat, "web": web},
               "window_since": since,
               "prs": prs,
               "refs": refs,
               "issue_refs_dropped_as_noise": noise,
               "milestone_issues": ms_issues,
               "milestones": json.loads(ms_raw),
               "warnings": warnings},
              sys.stdout, indent=1)
    sys.stdout.write("\n")
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    print(f"resolved {len(prs)} PRs, {len(refs)} refs ({len(noise)} dropped as bot noise), "
          f"{len(boards)} on the board", file=sys.stderr)


if __name__ == "__main__":
    main()
