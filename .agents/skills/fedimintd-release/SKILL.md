---
name: fedimintd-release
description: Use when cutting a fedimintd deployment release, publishing the fedibtc/fedi-fedimintd or fedi-fedimint-cli Docker images for a new Fedimint pin, choosing a vX.Y.Z-fediN-deploymentM tag name, or checking that a release image is ready to roll out to guardians.
---

# fedimintd Deployment Release

A deployment release is a git tag on this repo. Pushing any `v*` tag runs `.github/workflows/nix.yml`, which builds and publishes the guardian images to Docker Hub under the same name as the tag. There is no GitHub Release object and no manual build.

## Tag name

```
v<fedimint-tag>-deployment<M>
```

- `<fedimint-tag>` is the Fedimint tag this commit pins, read from `[patch.crates-io]` in the root `Cargo.toml` (for example `tag = "v0.12.0-fedi11"`). Always read it from the commit you tag, not from memory.
- `<M>` starts at `1` for each new Fedimint pin. Increment it only when you rebuild the same pin from a different fedi commit (for example `v0.10.0-fedi27-deployment1..3`).

Examples: `v0.11.2-fedi5-deployment1`, `v0.12.0-fedi11-deployment1`, `v0.10.1-rc.1-fedi27-deployment1`.

## Steps

**1. Pick the commit and confirm the pin.** Normally the `master` head, with a green `nix.yml` run.

```bash
git fetch origin --tags
git show origin/master:Cargo.toml | grep -m1 'fedimint-core = '
gh run list -R fedibtc/fedi --workflow nix.yml --branch master -L 3 \
  --json headSha,conclusion,status
```

A hotfix on an older pin is tagged on a `chore/<tag>` branch instead (see `v0.10.0-fedi27-deployment3`).

**2. Check the tag name is free.**

```bash
git ls-remote --tags origin 'v0.12.0-fedi11*'
git tag -l '*deployment*' | sort -V | tail
```

**3. Create an annotated tag and push it.** The message says which Fedimint pin it carries and what operators must know: consensus version changes, DB migrations, P2P compatibility with the previous release.

```bash
git tag -a v0.12.0-fedi11-deployment1 <sha> -m "..."
git push origin v0.12.0-fedi11-deployment1
```

Compare the two Fedimint tags in `fedibtc/fedimint` to write the message (for example `CORE_CONSENSUS_VERSION`, `MODULE_CONSENSUS_VERSION`, `*/db.rs` migrations).

**4. Watch the build.** The tag run takes about as long as a `master` run.

```bash
gh run list -R fedibtc/fedi --workflow nix.yml -L 5 \
  --json databaseId,headBranch,status,conclusion
gh run watch <id> -R fedibtc/fedi
```

## What CI publishes

For each of `fedibtc/fedi-fedimintd` and `fedibtc/fedi-fedimint-cli`:

- `<tag>-amd64` and `<tag>-arm64`: single-platform images.
- `<tag>`: a multi-arch manifest list, written by the `containers-manifest` job only when both arch jobs pass.

Deploy by the `<tag>` name. Do not deploy a digest copied from a Docker Hub page: that page usually links the amd64 half, which does not schedule on arm64 nodes.

## Verify the image is ready

```bash
docker manifest inspect fedibtc/fedi-fedimintd:v0.12.0-fedi11-deployment1 \
  | jq '[.manifests[].platform | "\(.os)/\(.architecture)"]'
```

Expect both `linux/amd64` and `linux/arm64`. If the `<tag>` list is missing, an arch job failed; the run is red. Fix and re-run that run, or cut `deployment<M+1>`.

## Rollout

Rolling the image out to guardians happens in `fedibtc/k8s-devops` (ArgoCD), not here. A Fedimint minor-version step is one-way per guardian, so start with test federations and upgrade all guardians of one federation together.
