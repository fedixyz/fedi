---
name: ios-release
description: Prepare a Fedi iOS release on App Store Connect through its API instead of the console. Use whenever someone wants to prepare, stage, or cut an iOS App Store release, attach a TestFlight build to a store version, set or copy App Store release notes, check the state of an App Store version or build, or submit an iOS release for App Review. Not for uploading builds (CI's deploy-to-testflight workflow does that) and not for the web track (web-release skill).
---

# Fedi iOS App Store release

Prepare an iOS release directly on App Store Connect via its REST API. Everything the console's "prepare for submission" flow does by hand (new version, build selection, release notes in every locale, release type) is a handful of API calls, and each one can be verified with a read-back instead of eyeballing the UI.

## Boundary with CI

CI owns the binary. Dispatching `release-production.yml` on the release branch builds every channel at once: the TestFlight upload, the Play internal upload, and the draft GitHub release carrying the APK. `deploy-to-testflight.yml` alone covers just the TestFlight leg. Either way Apple processes the upload into TestFlight, and this skill picks up after that, on the App Store Connect side. The API cannot upload binaries, so if the build is missing, dispatch the workflow first.

The Google Play side is the `android-release` skill, and the web track is `web-release`; each is a separate process.

## Access

All calls go through `scripts/asc.sh`, a self-contained JWT-plus-curl client (needs curl, openssl, python3, xxd). Script paths in this skill are relative to the skill directory, `.agents/skills/ios-release/` from the repo root. Prefix `ASC_CREDS` on every invocation rather than exporting it, since each agent shell starts fresh:

```bash
ASC_CREDS=/path/to/key.json .agents/skills/ios-release/scripts/asc.sh 'apps?fields[apps]=name,bundleId'
```

`ASC_CREDS` points at a json of the shape `{"key_id": "...", "issuer_id": "...", "key": "-----BEGIN PRIVATE KEY-----\n..."}`. Never print the `key` field and never commit the file.

If no key exists on this machine, walk the user through creating one. In App Store Connect: Users and Access, Integrations, App Store Connect API, Team Keys, Generate API Key. The App Manager role is enough for everything in this skill; Admin also works. The `.p8` private key downloads exactly once, so build the json immediately from the downloaded file, the Key ID shown next to it, and the Issuer ID shown at the top of the page:

```bash
python3 -c 'import json,sys; print(json.dumps({"key_id": sys.argv[1], "issuer_id": sys.argv[2], "key": open(sys.argv[3]).read()}))' \
  <KEY_ID> <ISSUER_ID> ~/Downloads/AuthKey_<KEY_ID>.p8 > ~/.config/asc/key.json
chmod 600 ~/.config/asc/key.json
```

A TestFlight-scoped or Developer-role key gets 403s on version creation.

Sanity-check access by listing apps. Fedi app ids (from `apps?fields[apps]=name,bundleId`):

| app | bundle id | id |
|---|---|---|
| Fedi (production, the one users have) | org.fedi.alpha | 6448916281 |
| Fedi Nightly | org.fedi.nightly | 6469008316 |
| Fedi Edge | org.fedi.edge | 6800447732 |
| Fedi Nova | org.fedi.nova | 6741365875 |

## Preparing a release

Steps 1 to 4 create state that is fully reversible (a `PREPARE_FOR_SUBMISSION` version can be deleted and redone), but they still write to the production App Store Connect account, so get the user's go before starting. An explicit instruction to prepare the release counts as that go. Submission is a separate, harder gate below.

### 0. Preflight: find the build and check existing versions

```bash
# newest builds and the marketing version each belongs to
scripts/asc.sh 'builds?filter[app]=6448916281&limit=3&sort=-uploadedDate&include=preReleaseVersion&fields[preReleaseVersions]=version&fields[builds]=version,uploadedDate,processingState,expired'

# current version records (newest first)
scripts/asc.sh 'apps/6448916281/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appStoreState,releaseType,createdDate'
```

A build's `version` attribute is the build number, not the marketing version; the included `preReleaseVersion` carries the `26.X.Y` string. The build must be `processingState: VALID` and not expired before it can be attached, and a fresh upload sits in `PROCESSING` for a while. When rebuilds leave several valid builds on the same marketing version, take the newest by `uploadedDate`. Note the full build id, and the previous version's id if its notes will be reused; `filter[versionString]=26.X.Y` finds a record that falls outside the recent page. The API rejects a second record for the same `versionString`, so work with an existing one.

### 1. Create the version record

```bash
scripts/asc.sh appStoreVersions -X POST -H 'Content-Type: application/json' -d @- <<'EOF'
{ "data": { "type": "appStoreVersions",
    "attributes": { "platform": "IOS", "versionString": "26.X.Y", "releaseType": "MANUAL" },
    "relationships": { "app": { "data": { "type": "apps", "id": "6448916281" } } } } }
EOF
```

Fedi releases manually, so default `releaseType` to `MANUAL` (the user presses release in the console after approval); `AFTER_APPROVAL` and `SCHEDULED` exist if the user asks. The response returns the new version id in `PREPARE_FOR_SUBMISSION` state. Creating a version auto-copies the previous version's metadata and localization records (description, keywords, screenshots), the same as the console; only the What's New texts need new content.

### 2. Attach the build

```bash
scripts/asc.sh 'appStoreVersions/<version-id>/relationships/build' -X PATCH \
  -H 'Content-Type: application/json' \
  -d '{ "data": { "type": "builds", "id": "<full-build-id>" } }' -w 'HTTP %{http_code}\n'
```

Success is an empty HTTP 204. Use the full build UUID from preflight, not the build number.

### 3. Set the release notes

Every locale the app ships gets a What's New text. Where the text comes from is the user's call, so ask: a feature release usually wants new copy describing the work, a patch release often reuses the previous version's notes.

When new copy is needed and none exists anywhere yet, the release notes have not been distilled from the release contents. That distillation is the `report-next-release` skill's job: it grounds what the release carries and describes each user-facing change in plain product language, independent of any store work. Draft the What's New from its summary cards and get the user's sign-off on the copy before writing any locale. The [release process](https://app.notion.com/p/080eb0892aa083939aaa013ee9b37082) wants public release notes ready before submission, so a missing text here is a blocker to resolve, not a field to improvise.

List the new version's localizations first (the records are auto-created), then patch each one:

```bash
scripts/asc.sh 'appStoreVersions/<version-id>/appStoreVersionLocalizations?limit=50&fields[appStoreVersionLocalizations]=locale,whatsNew'

scripts/asc.sh 'appStoreVersionLocalizations/<loc-id>' -X PATCH -H 'Content-Type: application/json' \
  -d '{ "data": { "type": "appStoreVersionLocalizations", "id": "<loc-id>", "attributes": { "whatsNew": "<text>" } } }'
```

Non-English texts come from the user or the translation process, never improvised. For the reuse case, `scripts/port-whats-new.py <previous-version-id> <new-version-id>` patches every locale from the previous version and fails unless the read-back matches byte for byte. Whichever path, re-read every locale at the end; a release with fresh text in one locale and stale text in another is exactly the mistake the console makes easy.

### 4. Verify the whole record

```bash
scripts/asc.sh 'appStoreVersions/<version-id>?include=build&fields[appStoreVersions]=versionString,appStoreState,releaseType&fields[builds]=version,processingState'
```

Confirm state `PREPARE_FOR_SUBMISSION`, the intended `releaseType`, and the right build number. Stop here. Preparation is where this skill's autonomy ends.

## Submitting for review (explicit user approval required)

Submission starts App Review and is not trivially reversible. It happens only on an explicit, unambiguous instruction from the user to submit, given separately after preparation. The go that authorized preparing the release never covers it, no phrasing is close enough to infer from, and any doubt means stop and ask. There is no situation in which submission happens as a side effect of something else.

With that approval, the flow is three calls: create a review submission for the app (`POST reviewSubmissions` with `platform: IOS` and the app relationship), add the version to it (`POST reviewSubmissionItems` with the submission and the appStoreVersion relationships), then flip it live (`PATCH reviewSubmissions/<id>` with `{"attributes": {"submitted": true}}`). This flow is written from Apple's API reference, not proven like the preparation steps.

## Releasing (prohibited)

Releasing an approved version to users is never an agent action, under any instruction. With `releaseType: MANUAL` the approved version sits in `PENDING_DEVELOPER_RELEASE` until the user releases it themselves in App Store Connect. Do not call the release-request endpoint, do not change `releaseType` to make release automatic, and do not treat any prior approval as covering this.

## Traps

- `asc.sh` already passes `-g` to curl, so write `filter[app]=` bracket syntax as is; do not escape it
- JWTs are minted per call with a ~19 minute expiry, so there is no token to cache or refresh
- a 401 on a fresh machine almost always means the key json was assembled wrong (mangled PEM whitespace or escaping); rebuild it from the `.p8` with the one-liner above
- undo for a botched preparation is `DELETE appStoreVersions/<version-id>`, valid while the version is still in `PREPARE_FOR_SUBMISSION`
