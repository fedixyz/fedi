---
name: web-release
description: Use when deploying the Fedi web app to production at app.fedi.xyz, cutting a web/X.Y.Z release, shipping a merged web change or a production feature-flag flip live, or dispatching the Vercel production deployment. Covers the release-tag lineage, the tag-only deploy constraint, and live verification.
---

# Fedi Web Production Release

Use this skill to ship web changes to production at `app.fedi.xyz`. This is what serves the `/api/features` remote feature-flag values that native apps read, so flipping a production feature flag live is a web release. For the flag file mechanics themselves, pair with the `feature-flags` skill.

## Mental Model

Production is deployed by manually dispatching the `vercel-prod.yml` workflow against a `web/X.Y.Z` git **tag**. Two hard constraints shape the whole process:

1. Deploys run from a tag, never a branch. The `Production` GitHub environment permits deployment only from refs matching `web/*` of type `tag`. Dispatching against a branch is rejected by the environment protection rule before any build runs.
2. Releases are cut from the previous release tag, not from `master`. `master` accumulates web commits that are not yet released. Deploying `master` would ship all of them. A release tag is the previous release tag plus only the specific commits intended for this deploy.

So a release is: take the last `web/X.Y.Z` tag, add only the commits you want, tag it as the next version, and deploy that tag.

The deploy runs on a self-hosted linux runner: it builds the wasm bridge in release mode (`WASM_BUILD_PROFILE=release`), then `vercel pull/build/deploy --prod`. `VERCEL_ENV=production` on that deployment is what makes the `/api/features` handler serve `prodRemoteFeatures`.

Staging (`vercel-staging.yml`) is separate and auto-deploys from `master`; it is not part of this process.

## Preconditions

- The commits you want to release are already merged to `master`, or exist on a branch you can cherry-pick from.
- The corresponding native build for this cycle is already shipped, if the change is a flag that only takes effect on a specific app version.
- You have push access and permission to dispatch the production workflow. Dispatching touches live production, so get an explicit go before step 4.

## Steps

Pick the next version. Find the latest release tag and increment (patch for a flag flip or hotfix):

```bash
git fetch origin --tags
git ls-remote --tags origin | grep -oE 'web/[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -3
```

Say the latest is `web/26.6.1` and you are cutting `web/26.6.2`.

**1. Cut a branch off the previous release tag and add only the intended commits.**

```bash
git checkout -b web/26.6.2 web/26.6.1
git cherry-pick <sha> [<sha> ...]   # only the commits for this release
```

The release lineage usually lags `master`, so cherry-picks may conflict. Resolve each conflict to keep only the intended change, dropping unrelated keys or lines that exist on `master` but not on this lineage.

**2. Verify the diff is exactly what you intend.**

```bash
git diff web/26.6.1..web/26.6.2
git diff --stat web/26.6.1..web/26.6.2
```

Confirm the delta against the previous tag is the intended change and nothing else. This is the safety net that catches an over-broad cherry-pick.

**3. Tag the release commit, then remove the branch.**

The environment deploys from a tag, and a branch sharing the tag's name makes `--ref` ambiguous. Create the tag and delete the branch so the ref resolves unambiguously to the tag:

```bash
git tag web/26.6.2                              # lightweight, matches existing release tags
git push origin refs/tags/web/26.6.2
git checkout master
git branch -D web/26.6.2
git push origin --delete refs/heads/web/26.6.2  # fully-qualified: tag and branch share the name
git ls-remote origin | grep 'web/26.6.2'        # expect ONLY refs/tags/web/26.6.2
```

**4. Dispatch the production deploy on the tag.** Live production, so confirm the go first.

```bash
gh workflow run vercel-prod.yml --repo fedibtc/fedi --ref web/26.6.2
gh run list --repo fedibtc/fedi --workflow vercel-prod.yml --limit 1 \
  --json databaseId,status,url
gh run watch <run-id> --repo fedibtc/fedi --exit-status
```

A run that fails within seconds with zero steps means the ref was not an allowed tag. Recheck step 3.

**5. Verify live.**

```bash
curl -s https://app.fedi.xyz/api/features
```

Confirm the response reflects the change, for example the flipped flag is now `true`. Native apps pick up remote flag changes on their next fetch (app launch or refresh), so no store release is needed.

## Feature-Flag Flips

To flip a remote flag on in production, the release commit changes two spots together so the served value and the compiled-in default stay in sync (see the `feature-flags` skill):

- `ui/web/src/pages/api/features.ts`: `prodRemoteFeatures.<flag>: true` (the value `app.fedi.xyz` serves)
- `crates/runtime/src/features.rs`: `new_prod()` sets the matching `FeatureCatalog` field to `Some(...)`

Land that as a normal PR to `master`, then release it via the steps above. The flip is binary and global for the target app version; there is no gradual rollout in this system.

## Rollback

- Fastest: Vercel dashboard, the project's Deployments, promote the previous production deployment (instant rollback).
- Or cut a new patch tag that reverts the change and deploy it the same way.

## Reference

- Deploy workflow: `.github/workflows/vercel-prod.yml` (`workflow_dispatch` only)
- Deploy script: `scripts/ci/vercel-prod.sh`
- Production env policy: `gh api repos/fedibtc/fedi/environments/Production/deployment-branch-policies`
- Live flags endpoint: `https://app.fedi.xyz/api/features`
