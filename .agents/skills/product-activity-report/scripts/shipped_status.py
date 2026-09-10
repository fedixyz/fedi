#!/usr/bin/env python3
"""Answer "is this in users' hands, on which platform?" for a batch of work.

Native and web are cut and deployed independently, so the verdict is per
platform, and two traps make the obvious implementation confidently wrong.

1. **The newest tag is not what users are running.** Web production is a manual
   `workflow_dispatch` against a `web/*` tag, so a tag can sit unreleased
   forever. The deployed ref is the one the last SUCCESSFUL production run used.
   Native's is the commit its newest published release records having been built
   from, because a native tag is cut by GitHub at publish time and can name a
   commit that never shipped. Newest-tag is the fallback when a repo offers
   neither, and it is labelled as unconfirmed when used.

2. **Containment is not ancestry.** Release lineages are cut from the previous
   release tag plus cherry-picks, never from master, so a shipped change's
   master-side commit is not an ancestor of the tag and `merge-base
   --is-ancestor` answers "no" for work that plainly shipped. Falls back to the
   PR number, then its title, which finds a change listed inside a squashed
   backport commit.

Usage:
  shipped_status.py --repo fedibtc/fedi --repo-path ~/fedibtc/fedi 11596 11722

Fetch tags first. A stale clone silently answers against the wrong baseline.
"""
import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict

# Capture the track prefix separately: grouping tags by it is what separates
# `26.6.1` from `web/26.6.2` without either track being hardcoded.
TAG_RE = re.compile(r"^(?P<track>.*?/)?(?P<version>\d+\.\d+(?:\.\d+)?)$")

# Workflows whose last successful run names the ref currently in production.
DEPLOY_WORKFLOWS = {"web": "vercel-prod.yml"}

# The line every release workflow writes into the release body at build time.
BUILT_FROM_RE = re.compile(r"Built from commit: *([0-9a-f]{7,40})")


def run(cmd, cwd=None):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def newest_tag_per_track(repo_path):
    code, out, _ = run(
        ["git", "tag", "--sort=-creatordate", "--format=%(refname:short)"], cwd=repo_path
    )
    if code != 0:
        return {}
    tracks = defaultdict(list)
    for tag in out.splitlines():
        m = TAG_RE.match(tag.strip())
        if not m:
            continue
        tracks[(m.group("track") or "").rstrip("/") or "native"].append(tag.strip())
    return {track: tags[0] for track, tags in tracks.items() if tags}


def deployed_refs(repo, repo_path):
    """What users are actually running, per track, as {track: (ref, provenance)}.

    Keep the provenance string. A ref from a real deploy is evidence, a ref from
    the newest tag is a guess, and the caller prints the difference so a guess
    never gets reported as fact.
    """
    refs = {}

    for track, workflow in DEPLOY_WORKFLOWS.items():
        code, out, _ = run(
            ["gh", "run", "list", "--repo", repo, "--workflow", workflow,
             "--status", "success", "--limit", "1",
             "--json", "headBranch,createdAt",
             "--jq", '.[] | [.headBranch, .createdAt[0:10]] | @tsv'])
        if code == 0 and out:
            ref, when = (out.split("\t") + [""])[:2]
            refs[track] = (ref, f"last successful {workflow} deploy, {when}")

    native = native_release_ref(repo, repo_path)
    if native:
        refs.setdefault("native", native)

    # setdefault, not assignment: a real deploy already answered for this track.
    if repo_path:
        for track, tag in newest_tag_per_track(repo_path).items():
            refs.setdefault(track, (tag, "newest tag, NOT confirmed deployed"))

    # Dropping an unusable track silently reads as "no such platform" rather
    # than "could not check", so say so and let the caller decide.
    usable, missing = {}, []
    for track, (ref, how) in refs.items():
        (usable.setdefault(track, (ref, how)) if have_ref(repo_path, ref)
         else missing.append((track, ref)))
    for track, ref in missing:
        print(f"WARNING: {track} deployed {ref}, which is not in this clone. "
              f"Fetch it, or treat {track} as unknown rather than unshipped.")
    return usable


def native_release_ref(repo, repo_path):
    """The newest published native release as (ref, provenance), or None.

    Its tag is not the answer. The release workflows create the GitHub release
    as a draft, so no tag exists until a human publishes it, and GitHub then
    cuts the tag wherever the draft points. `26.8.2` shipped from `release/26.8`
    and its tag landed on a master commit made a day later, which reads back as
    every master commit before that point having shipped. The build itself
    writes `Built from commit:` into the body, so that line is the record and
    the tag is usable only once it agrees with it.
    """
    # The REST endpoint, not `gh release list`, which cannot return the body.
    code, out, _ = run(
        ["gh", "api", f"repos/{repo}/releases?per_page=30",
         "--jq", '[.[] | select((.draft or .prerelease) | not)] '
                 '| sort_by(.published_at) | last // empty '
                 '| [.tag_name, .published_at[0:10], .body] | @tsv'])
    if code != 0 or not out:
        return None
    tag, when, body = (out.split("\t") + ["", ""])[:3]

    builds = []
    for written in BUILT_FROM_RE.findall(body):
        sha = rev_parse(repo_path, written)
        if sha and sha not in builds:
            builds.append(sha)

    tag_sha = rev_parse(repo_path, tag)
    if tag_sha and tag_sha in builds:
        return tag, f"published release, tag agrees with its build record, {when}"
    if builds:
        return newest_commit(repo_path, builds)[:12], (
            f"published release {tag} was built here; the {tag} tag points "
            f"somewhere else and was ignored, {when}")
    return tag, (f"published release {tag}, nothing to check the tag against, "
                 f"NOT confirmed, {when}")


def newest_commit(repo_path, shas):
    """The most recent of `shas` by commit date; a rebuild appends a later build line."""
    if len(shas) == 1:
        return shas[0]
    code, out, _ = run(["git", "show", "-s", "--format=%ct %H", *shas], cwd=repo_path)
    dated = [line.split() for line in out.splitlines() if line.strip()] if code == 0 else []
    return max(dated, key=lambda pair: int(pair[0]))[1] if dated else shas[-1]


def rev_parse(repo_path, ref):
    """The full sha `ref` names in this clone, or "" when it names nothing here."""
    if not repo_path or not ref:
        return ""
    code, out, _ = run(["git", "rev-parse", "--verify", f"{ref}^{{commit}}"], cwd=repo_path)
    return out.strip() if code == 0 else ""


def have_ref(repo_path, ref):
    return bool(rev_parse(repo_path, ref))


def grep_ref(repo_path, ref, needle):
    """Any commit reachable from `ref` whose message contains `needle`."""
    code, out, _ = run(
        ["git", "log", ref, "--fixed-strings", f"--grep={needle}", "--format=%h", "-1"],
        cwd=repo_path)
    return out.strip() if code == 0 else ""


_title_owners = {}


def title_is_unique(repo, title):
    """A title identifies work only when one PR owns it.

    A squashed backport lists what it carried by title, the only handle on
    cherry-picked work, and a change and its revert usually share one.
    """
    if title in _title_owners:
        return _title_owners[title]
    code, out, _ = run(
        ["gh", "pr", "list", "--repo", repo, "--state", "all", "--limit", "20",
         "--search", f'"{title}" in:title', "--json", "title",
         "--jq", f'[.[] | select(.title == {json.dumps(title)})] | length'])
    unique = code == 0 and out.strip().isdigit() and int(out.strip()) <= 1
    _title_owners[title] = unique
    return unique


def contains(repo, repo_path, sha, ref, number, title):
    """(verdict, how) where verdict is "in", "maybe", or "" for absent."""
    if sha:
        code, _, _ = run(["git", "merge-base", "--is-ancestor", sha, ref], cwd=repo_path)
        if code == 0:
            return "in", "merged"
    if grep_ref(repo_path, ref, f"(#{number})"):
        return "in", "cherry-picked, cited by number"
    if title and grep_ref(repo_path, ref, title):
        if title_is_unique(repo, title):
            return "in", "cherry-picked, listed by title"
        return "maybe", "title shared with another pr, confirm before claiming"
    return "", "absent"


def describe(repo, number):
    code, out, err = run(
        ["gh", "api", f"repos/{repo}/issues/{number}",
         "--jq", '{is_pr: (.pull_request != null), state: .state, '
                 'title: .title, milestone: (.milestone.title // "-")}'])
    if code != 0:
        return {"error": err.splitlines()[0] if err else "lookup failed"}
    return json.loads(out)


def merge_commit(repo, number):
    code, out, _ = run(
        ["gh", "pr", "view", str(number), "--repo", repo, "--json", "mergeCommit,mergedAt",
         "--jq", '[(.mergeCommit.oid // ""), (.mergedAt // "")] | @tsv'])
    if code != 0:
        return "", ""
    parts = (out.split("\t") + ["", ""])[:2]
    return parts[0], parts[1][:10]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="owner/name")
    ap.add_argument("--repo-path", default=None, help="local clone, for containment checks")
    ap.add_argument("numbers", nargs="+", type=int)
    args = ap.parse_args()

    if args.repo_path:
        run(["git", "fetch", "--tags", "origin", "--quiet"], cwd=args.repo_path)

    refs = deployed_refs(args.repo, args.repo_path) if args.repo_path else {}

    if refs:
        print("What users are running right now:")
        for track, (ref, how) in sorted(refs.items()):
            print(f"  {track:<8} {ref:<14} ({how})")
        guessed = [t for t, (_, how) in refs.items() if "NOT confirmed" in how]
        if guessed:
            print(f"  note: {', '.join(guessed)} is inferred from tags, not from a deploy;")
            print("        do not state it as released without confirming another way")
    else:
        print("No release or deploy found, so nothing here has shipped to users yet.")
        print("Treat every merged item as unreleased and say so in the report.")
    print()

    for number in args.numbers:
        info = describe(args.repo, number)
        if "error" in info:
            print(f"#{number}: lookup failed ({info['error']})")
            continue
        kind = "PR" if info["is_pr"] else "ISSUE"
        line = f"#{number} [{kind}] {info['state']} milestone={info['milestone']}"
        if not info["is_pr"]:
            print(f"{line}\n    {info['title']}\n")
            continue
        sha, merged_at = merge_commit(args.repo, number)
        if not sha:
            print(f"{line} not merged -> In progress\n    {info['title']}\n")
            continue
        print(f"{line} merged={merged_at} {sha[:10]}")
        live_on, unconfirmed, cherry = [], [], False
        for track, (ref, _) in sorted(refs.items()):
            verdict, how = contains(args.repo, args.repo_path, sha, ref, number, info["title"])
            label = {"in": "in", "maybe": "maybe"}.get(verdict, "NOT in")
            print(f"    {label:<6} {ref} ({track}) [{how}]")
            if verdict == "in":
                live_on.append(track)
                cherry = cherry or how.startswith("cherry")
            elif verdict == "maybe":
                unconfirmed.append(track)
        if not refs:
            print("    nothing deployed to check against")
        print(f"    live on: {', '.join(live_on) if live_on else 'no platform'}")
        if unconfirmed:
            print(f"    unconfirmed on {', '.join(unconfirmed)}: a title match alone can")
            print("    hit a revert or a same-titled pr, so do not report it as live")
        if cherry:
            print("    cherry-picked: confirm the feature's own code is at that ref,")
            print("    not just a flag flip, before calling it live on that platform")
        print(f"    {info['title']}\n")

    if refs:
        print("Merged but in no deployed ref is 'Merged, pending release'.")
        print("Containment is necessary but not sufficient: a flagged feature is only")
        print("'Shipped' once its production flag is on AND the code the flag gates is")
        print("in that platform's deployed build. Report per-platform splits, do not")
        print("collapse them into one label.")


if __name__ == "__main__":
    sys.exit(main())
