---
name: version-bump
description: >-
  Bump the Fedi native app version: the 26.M.0 bump on master before a release cut, the 26.M.P bump on a backport branch, and the sync of a patch bump back to master. Use whenever someone asks to bump the version, start showing a new version in Nightly, or sync a version to master. The rest of a patch release is the backport skill. Web releases bump their own version in the web-release skill.
user-invocable: true
---

# Fedi version bump

A version bump is one commit that changes one line in each version file. It needs no install, lint, format or build, because no source changes. Do it by hand in a worktree. It takes a minute.

## Where the version lives

| file | field |
|---|---|
| `ui/native/package.json` | `"version"` |
| `ui/native/android/app/build.gradle` | `versionName` |
| `ui/native/ios/FediReactNative/Info.plist` | `CFBundleShortVersionString` |
| `ui/native/ios/FediReactNativeTests/Info.plist` | `CFBundleShortVersionString` |
| `ui/native/ios/FediNightly-Info.plist` | `CFBundleShortVersionString` |
| `ui/native/ios/FediNova-Info.plist` | `CFBundleShortVersionString` |
| `ui/web/package.json` | `"version"`, on a `26.M.0` bump only |

These never move in a bump:

- `ui/native/ios/FediEdge-Info.plist`. The edge flavor keeps its own version
- `versionCode` and `CFBundleVersion`. The deploy scripts stamp a timestamp build number at upload time and never commit it
- `ui/web/package.json` on a patch. Web cuts its own `web/X.Y.Z` releases through the web-release skill

## Which bump

| release | branch | base | files | sync to master |
|---|---|---|---|---|
| `26.M.0` | `bump-version-26.M.0` under your usual prefix | `origin/master` | all seven | none |
| `26.M.P` | the last commit on `backport/26.M.P` | `origin/release/26.M` | the six native files | yes, unless master is already past it |

- `26.M.0` lands on master before `release/26.M` is cut. Nightly builds from master, so it reports the new version from the next build. The release branch then starts at the version it ships
- web takes the `26.M.0` number too, because the next `web/26.M.0` tag is cut from master and the production deploy refuses a tag that disagrees with `ui/web/package.json`

## Make the commit

Read the current values first. Native and web usually differ:

```bash
grep -m1 '"version"' ui/native/package.json ui/web/package.json
```

Then substitute each file. Use perl, because `sed -i` takes different flags in BSD and GNU sed:

```bash
OLD=26.9.3 WEB_OLD=26.9.0 NEW=26.10.0
perl -pi -e 's|<string>\Q$ENV{OLD}\E</string>|<string>$ENV{NEW}</string>|' ui/native/ios/FediNightly-Info.plist ui/native/ios/FediNova-Info.plist ui/native/ios/FediReactNative/Info.plist ui/native/ios/FediReactNativeTests/Info.plist
perl -pi -e 's/versionName "\Q$ENV{OLD}\E"/versionName "$ENV{NEW}"/' ui/native/android/app/build.gradle
perl -pi -e 's/"version": "\Q$ENV{OLD}\E",/"version": "$ENV{NEW}",/' ui/native/package.json
perl -pi -e 's/"version": "\Q$ENV{WEB_OLD}\E",/"version": "$ENV{NEW}",/' ui/web/package.json
git diff --stat
```

- skip the web line on a patch
- the stat shows one changed line per file: seven for `26.M.0`, six for `26.M.P`. A missing file means its old value differed from `OLD`, so read it and fix that file alone
- commit as `chore: bump version for 26.M.P`

## Sync a patch to master

- branch `sync-version-26.M.P` under your usual prefix from `origin/master`, holding `git cherry-pick -x` of the bump commit and nothing else
- skip it when master is already on a later version, for example a patch on `release/26.9` after master took `26.10.0`

## PR

- draft, base master, title `chore: bump version for 26.M.P`, label `sync versioning` (one label, with the space)
- `26.M.0` carries milestone `26.M.0`. A sync PR carries none, because the backport PR holds the patch milestone
- `26.M.0` body: what moves and that master takes it before the cut
- sync body: `ref #<backport PR>, syncs the 26.M.P version bump from the backport branch to master`
- a patch bump on the backport branch goes out with the backport PR, so it has no PR of its own
- CI failing on a version-only diff is a flake. Rerun the failed jobs

## The bump workflow

`bump-version-native-ui.yml` makes the same commit on a runner when dispatched on a `release/` or `backport/` branch. Do not use it. Its 26.4.2, 26.6.1 and 26.8.0 runs pushed the commit but failed to open the sync PR, and its iOS step either skipped the plists or moved `FediEdge-Info.plist` with them. It cannot make a `26.M.0` bump on master at all.
