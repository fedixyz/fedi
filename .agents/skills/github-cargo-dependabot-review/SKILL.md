---
name: github-cargo-dependabot-review
description: Review Dependabot PRs updating Rust/Cargo crates with a security-focused crates.io tarball diff before commenting.
---

# GitHub Cargo Dependabot Review

Use when asked to review Dependabot PRs that update Rust dependencies in `Cargo.toml` or `Cargo.lock`.

Target PRs usually have `cargo` in the branch name or titles like `bump CRATE from OLD to NEW`.

For each target PR:

1. Check whether the current GitHub user or one of the user's explicitly named bot accounts already posted a whole-PR Cargo Dependabot review. It must cover the whole PR, say it downloaded or diffed crates.io tarballs, and give an overall `OK to merge` / `not OK to merge` recommendation. If so, stop for that PR and report that it was already reviewed.
2. If no whole-PR review exists, inspect PR metadata, Dependabot notes, changed manifests, and lockfile diff. Extract every crate whose version changed. Prefer explicit Dependabot notes from the PR body, then confirm against `Cargo.lock` and `Cargo.toml` diffs. Separate direct dependency bumps from transitive lockfile-only changes.
3. Decide whether the PR is small enough for one agent. If it updates multiple dependency units, do not review them all in one context. Treat each direct crate bump, Dependabot group member, or lockfile-only crate update with its attributable transitive changes as a separate dependency review unit.

For multi-dependency PRs, the PR-level subagent is a coordinator:

- First inspect existing PR comments and reviews for dependency-specific reviews by the current user or explicitly named bot accounts. A dependency review comment should be considered complete when it names the crate and old/new versions, says it downloaded or diffed the crates.io tarballs, and has a per-dependency `OK to merge` / `not OK to merge` recommendation.
- Skip dependency units that already have such a self-authored review comment. Do not redo those reviews just to make the wording uniform.
- For every remaining dependency unit, delegate one fresh sub-sub-agent. Give it the PR URL, crate name, old/new versions, relevant `Cargo.toml` / `Cargo.lock` diff snippets, any suspected transitive changes belonging to that unit, and these single-dependency review instructions. Tell it to review only that unit and to post its own dependency-specific PR comment.
- Each sub-sub-agent comment must start with a stable marker like `Cargo dependency review: CRATE OLD_VERSION to NEW_VERSION` so later coordinators can detect it.
- After all dependency units have dependency-specific comments, the PR-level subagent posts one short roll-up comment. Recommend merging the whole PR only if every dependency unit was reviewed and every per-dependency recommendation is `OK to merge`. If any unit is unreviewed or not OK, the roll-up must say `not OK to merge` and list why.

For a single dependency unit:

1. Download both published crate tarballs and their crates.io metadata into a temporary directory outside the working tree.
2. Verify crates.io metadata before trusting the tarballs. Confirm each downloaded tarball's SHA-256 matches the checksum in crates.io metadata. Flag yanked versions, license or repository changes, releases younger than one week, and other maintainer/release anomalies.
3. Diff the published tarballs, starting broad and then reading changed files. `Cargo.toml` is rewritten by `cargo publish`; compare `Cargo.toml.orig` instead when present.
4. Read the full diff for changed Rust, build, generated, shell, and configuration files. If the diff is huge, prioritize security-sensitive files and state exactly what was not reviewed.
5. Compare the tarball diff to changelog and release notes. Use metadata repository URLs, PR body links, and crates.io links. If the upstream repo is available and `.cargo_vcs_info.json` exists, confirm its git SHA exists upstream and corresponds to a plausible version tag.
6. Review with a security-critical mindset. Look for:
   - new or changed `build.rs`, proc-macro code, `links` metadata, FFI, or native library probing;
   - new `unsafe`, `extern`, pointer manipulation, `transmute`, or unchecked indexing in code that handles untrusted input;
   - new process spawning, shell invocation, filesystem writes outside normal build output, environment-variable harvesting, network access, downloads, telemetry, or credential/token handling;
   - new dependencies, default features, optional features enabled by the bump, or feature unification surprises;
   - binary blobs, generated code, minified JavaScript/WebAssembly, vendored C/C++/assembly, or large encoded string constants;
   - serialization, parsing, cryptography, consensus, or money-handling behavior changes relevant to the repository;
   - license changes, repository ownership changes, yanked releases, or maintainer/release anomalies.
7. Inspect dependency consequences in the target repository using an isolated temporary clone or worktree, not the user's working tree. If many transitive crates changed, list them, check crates.io metadata for new/yanked/young versions, and deeply review any new build script, proc macro, FFI crate, crypto crate, networking crate, or obscure crate. If that is infeasible, mark the PR `not OK to merge` until risky unreviewed changes are inspected.
8. Post a concise but evidence-backed dependency-specific comment. Include the PR link, dependency unit reviewed, old/new versions, crates.io checksums or short hashes, release age, yanked status, whether the tarball diff matches release notes, security-relevant findings, attributable transitive dependency changes, anything skipped, and a clear `OK to merge` / `not OK to merge` recommendation.

Use this dependency comment shape:

```markdown
Cargo dependency review: `CRATE` OLD_VERSION to NEW_VERSION

Crate reviewed:
- `CRATE` OLD_VERSION to NEW_VERSION: crates.io checksums matched metadata; NEW_VERSION was published DATE; not yanked.

What I checked:
- Downloaded and diffed the published crates.io tarballs for OLD_VERSION and NEW_VERSION.
- Compared the code diff with the Dependabot/release-note summary.
- Checked `Cargo.toml.orig`, feature/dependency changes, build scripts, proc-macro/FFI/unsafe surfaces, and suspicious network/process/filesystem behavior.
- Checked attributable transitive dependency changes: ...

Findings:
- ...

Recommendation for this dependency: OK to merge / not OK to merge.
```

Use a roll-up comment only after every dependency unit in a multi-dependency PR has a dependency-specific review comment. Include each dependency, recommendation, and comment URL. Recommend merging the whole PR only when every unit was reviewed and is OK to merge.

Summarize PR link, whether it was already reviewed, whether dependency units were delegated or reviewed directly, whether comments were posted, crates reviewed, any risky or skipped areas, and the recommendation.
