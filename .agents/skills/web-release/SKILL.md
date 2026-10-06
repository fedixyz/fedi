---
name: web-release
description: Use when deploying the Fedi web app to production at app.fedi.xyz, cutting a web/X.Y.Z release, shipping a merged web change or a production feature-flag flip live, or dispatching the Vercel production deployment. Covers the release-tag lineage, the tag-only deploy constraint, and live verification.
---

# Fedi Web Production Release

Use this skill to ship web changes to production at `app.fedi.xyz`. This is what serves the `/api/features` remote feature-flag values that native apps read, so flipping a production feature flag live is a web release. For the flag file mechanics themselves, pair with the `feature-flags` skill.

## Mental Model

Production is deployed by manually dispatching the `vercel-prod.yml` workflow against a `web/X.Y.Z` git **tag**, and the tag comes from publishing a draft GitHub release of the same name. This matches the native release. The draft names the commit it ships and carries the release notes, and publishing it creates the tag. Three hard constraints shape the whole process:

1. Deploys run from a tag, never a branch. The `Production` GitHub environment permits deployment only from refs matching `web/*` of type `tag`. Dispatching against a branch is rejected by the environment protection rule before any build runs.
2. Releases are cut from the previous release tag, not from `master`. `master` accumulates web commits that are not yet released. Deploying `master` would ship all of them. A release tag is the previous release tag plus only the specific commits intended for this deploy. When the previous web tag is the commit a native release branch was cut from, as `web/26.9.0` is for `release/26.9`, cut the web release from that branch at the native build commit. The branch is then the tag plus the backports.
3. A draft has no tag. GitHub creates the tag at the draft's target commit when someone publishes, so the branch holding that commit has to stay until then.

So a release is: take the last `web/X.Y.Z` tag, add only the commits you want, bump the version, stage a draft release on that commit with its notes, then publish the draft and deploy its tag when it should go live.

The deploy runs on a self-hosted linux runner: it builds the wasm bridge in release mode (`WASM_BUILD_PROFILE=release`), then `vercel pull/build/deploy --prod`. `VERCEL_ENV=production` on that deployment is what makes the `/api/features` handler serve `prodRemoteFeatures`.

The version the app reports lives in `ui/web/package.json` on the release lineage, bumped in the release commit the way native bumps its own. It is independent of the native version, and nothing sets it in the Vercel dashboard. The deploy refuses to ship when that version and the tag disagree.

Staging (`vercel-staging.yml`) is separate and auto-deploys from `master`; it is not part of this process.

## Preconditions

- The commits you want to release are already merged to `master`, or exist on a branch you can cherry-pick from.
- The corresponding native build for this cycle is already shipped, if the change is a flag that only takes effect on a specific app version. Check that against the `Built from commit:` line in the newest published GitHub release, not against the `26.X.Y` tag. GitHub cuts that tag at publish time, and it has named a commit that never shipped. The `android-release` skill covers the lifecycle.
- You have push access and permission to publish releases and dispatch the production workflow. Publishing and dispatching touch live production, so get an explicit go before step 6.

## Steps

Pick the next version. Find the latest release tag and increment (patch for a flag flip or hotfix):

```bash
git fetch origin --tags
git ls-remote --tags origin | grep -oE 'web/[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -3
```

Say the latest is `web/26.6.1` and you are cutting `web/26.6.2`.

**1. Cut a branch off the previous release tag and add only the intended commits.**

```bash
git checkout -b web-release/26.6.2 web/26.6.1
git cherry-pick <sha> [<sha> ...]   # only the commits for this release
```

Never name the branch `web/26.6.2`. A branch sharing the tag's name makes later ref lookups ambiguous.

The release lineage usually lags `master`, so cherry-picks may conflict. Resolve each conflict to keep only the intended change, dropping unrelated keys or lines that exist on `master` but not on this lineage.

**2. Bump the version to match the tag you are about to cut.**

```bash
(cd ui/web && yarn version --new-version 26.6.2 --no-git-tag-version)
git commit -am "chore: bump web version for 26.6.2"
```

Use yarn here. `npm version` rewrites `ui/yarn.lock` and drops a stray `ui/package-lock.json` beside it.

**3. Verify the diff is exactly what you intend.**

```bash
git diff web/26.6.1..HEAD
git diff --stat web/26.6.1..HEAD
```

Confirm the delta against the previous tag is the intended change and nothing else. This is the safety net that catches an over-broad cherry-pick.

**4. Push the branch and stage a draft release on its head.**

```bash
git push -u origin web-release/26.6.2
sha=$(git rev-parse HEAD)
gh release create web/26.6.2 --repo fedibtc/fedi --draft --latest=false \
  --target "$sha" --title "Fedi Web 26.6.2" --notes "Built from commit: $sha"
git ls-remote origin refs/tags/web/26.6.2   # expect nothing until publish
```

`--latest=false` keeps the native release as the repository's latest. The draft is invisible outside the repo and ships nothing.

**5. Link the release report from the draft.** The body is the `Built from commit:` line and a link to the release report filtered to web, as the `report-next-release` skill's `references/release-notes-copy.md` sets out. Write it to the draft:

```bash
gh release edit web/26.6.2 --repo fedibtc/fedi --notes-file <file>
```

**6. Publish the draft and deploy its tag.** Live production, so confirm the go first. Publishing creates the tag at the draft's target commit. When the web release goes with a native release, do both when the native one goes out.

```bash
gh release edit web/26.6.2 --repo fedibtc/fedi --draft=false
git ls-remote origin refs/tags/web/26.6.2        # the tag now exists
gh workflow run vercel-prod.yml --repo fedibtc/fedi --ref web/26.6.2
gh run list --repo fedibtc/fedi --workflow vercel-prod.yml --limit 1 \
  --json databaseId,status,url
gh run watch <run-id> --repo fedibtc/fedi --exit-status
git push origin --delete web-release/26.6.2   # the tag holds the commit now
```

A run that fails within seconds with zero steps means the ref was not an allowed tag.

A run that fails in its first minute saying `ui/web/package.json says X, tag says Y` means step 2 was skipped, or bumped to the wrong number.

**7. Verify live.**

```bash
curl -s https://app.fedi.xyz/api/features
```

Confirm the response reflects the change, for example the flipped flag is now `true`. Native apps pick up remote flag changes on their next fetch (app launch or refresh), so no store release is needed.

Then check the deployment reports the version you tagged:

```bash
curl -s https://app.fedi.xyz/api/version
```

## Feature-Flag Flips

To flip a remote flag on in production, the release commit changes two spots together so the served value and the compiled-in default stay in sync (see the `feature-flags` skill):

- `ui/web/src/pages/api/features.ts`: `prodRemoteFeatures.<flag>: true` (the value `app.fedi.xyz` serves)
- `crates/runtime/src/features.rs`: `new_prod()` sets the matching `FeatureCatalog` field to `Some(...)`

Land that as a normal PR to `master`, then release it via the steps above. The flip is binary and global for the target app version; there is no gradual rollout in this system.

## Rollback

- Fastest: Vercel dashboard, the project's Deployments, promote the previous production deployment (instant rollback).
- Or cut a new patch release that reverts the change and ship it the same way.

## Reference

- Deploy workflow: `.github/workflows/vercel-prod.yml` (`workflow_dispatch` only)
- `deploy-public-apk-to-github.yml` fires on every published release and skips `web/*` ones
- Deploy script: `scripts/ci/vercel-prod.sh`
- Version: `ui/web/package.json`, inlined by `ui/web/next.config.ts`, reported by `ui/web/src/pages/api/version.ts`
- Production env policy: `gh api repos/fedibtc/fedi/environments/Production/deployment-branch-policies`
- Live flags endpoint: `https://app.fedi.xyz/api/features`
- app store tracks: separate processes, see the `ios-release` and `android-release` skills
- what the next release carries, and the raw material for release notes: the `report-next-release` skill
