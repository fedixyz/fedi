---
name: android-release
description: Prepare a Fedi Android release on Google Play through the publishing API and run the public direct-download APK workflows. Use whenever someone wants to prepare, stage, or promote an Android or Google Play release, edit Play release notes, manage a staged rollout, check what version a Play track is on, or build and publish the public APK. Not for uploading builds to Play (CI's deploy-to-gp-internal-testing workflow does that), not for the App Store (ios-release skill), and not for the web track (web-release skill).
---

# Fedi Android release

Android ships through two channels: the Google Play store release, driven through the publishing API instead of clicking the Play Console, and the public direct-download APK, driven through two GitHub workflows. Both stage freely and gate hard at the end.

## Google Play

### The edit model

All writes happen inside an edit: open one, stage any number of changes, then commit. Until the commit, nothing exists outside the edit, and an abandoned edit expires on its own or dies to a DELETE. An uncommitted edit is also invisible in the Play Console, so a promotion that only lives in an edit is not ready for anyone who works there. The prepared state this skill leaves behind is a committed draft release, which the console shows under Production, Releases, as Draft. The user's submission is the console's Review release and Start rollout on that draft. This inverts the iOS shape only in mechanics: on both stores every preparation step lands for real, and the one gate is sending the release to review.

### Boundary with CI

CI owns the binary. Dispatching `release-production.yml` on the release branch builds every channel at once: the AAB uploaded to the `internal` track of `com.fedi` via fastlane, the TestFlight upload, and the draft GitHub release carrying the APK. `deploy-to-gp-internal-testing.yml` alone covers just the Play leg (the nightly, nova, and edge workflows feed their own packages). This skill picks up from there, promoting an uploaded build to production. The App Store track is the `ios-release` skill, the web app is `web-release`.

### Access

All calls go through `scripts/gp.sh`, a self-contained token-plus-curl client (needs curl, openssl, python3). Script paths are relative to the skill directory, `.agents/skills/android-release/` from the repo root. Prefix `GP_CREDS` on every invocation rather than exporting it, since each agent shell starts fresh:

```bash
GP_CREDS=/path/to/service-account.json .agents/skills/android-release/scripts/gp.sh 'com.fedi/edits' -X POST -H 'Content-Type: application/json' -d '{}'
```

`GP_CREDS` points at a Google service account key json, used verbatim as downloaded. Never print the `private_key` field and never commit the file.

If no key exists on this machine, walk the user through creating one. In the Google Cloud project linked to the Play Console: create a service account and download its json key. In the Play Console under Users and permissions, invite that service account's email and grant it release permission on the app. A 403 from the API means the Play Console grant is missing or too narrow, not that the key is bad.

Fedi package names: `com.fedi` (production, the app users have), `com.fedi.nightly`, `com.fedi.nova`, `com.fedi.edge`. The production app's tracks include the four standard ones (`production`, `beta`, `alpha`, `internal`) plus closed tracks named `Fedi Inc` and `QA`. Production promotes directly from `internal`; the closed tracks are separate audiences, not stops on the way.

### Preparing a release

Preparation ends with a committed draft release on the production track. A draft ships nothing and sends nothing to review, so the whole sequence below needs no ceremony beyond the user's instruction to prepare the release. Committing a `completed` or `inProgress` release is the submission, and that is the hard gate below.

#### 0. Open an edit and read the state

```bash
scripts/gp.sh 'com.fedi/edits' -X POST -H 'Content-Type: application/json' -d '{}'

scripts/gp.sh 'com.fedi/edits/<edit-id>/tracks'
```

The tracks response answers everything preflight needs: the version code CI uploaded to `internal`, what `production` currently runs, and the current production release notes (the reuse source). Releases name builds by `versionCodes`; the human-readable version string is the release `name`. Edits expire (the insert response carries `expiryTimeSeconds`), so open a fresh one rather than reusing yesterday's id.

#### 1. Stage the draft release on production

Where the notes text comes from is the user's call, so ask: a feature release usually wants new copy, a patch often reuses the current production notes. When new copy is needed and none exists anywhere yet, the notes have not been distilled from the release contents: run the `report-next-release` skill, draft the copy from its summary cards, and get the user's sign-off before writing any locale. Non-English texts come from the user or the translation process, never improvised. The Play locale set is its own thing (`es-419` and `sw` exist here and not on the App Store), so port notes store-to-store by locale mapping the user confirms, not by assumption.

```bash
scripts/gp.sh 'com.fedi/edits/<edit-id>/tracks/production' -X PUT -H 'Content-Type: application/json' -d @- <<'EOF'
{ "track": "production",
  "releases": [ {
    "name": "26.X.Y",
    "versionCodes": ["<version-code>"],
    "status": "draft",
    "releaseNotes": [
      { "language": "en-US", "text": "..." },
      { "language": "es-419", "text": "..." }
    ] },
    { ...the current completed release, verbatim from the step 0 read... } ] }
EOF
```

The PUT replaces the track's whole release list, so the live `completed` release goes in as the second element or the track loses it. `status: draft` is the console's own draft: it serves nothing and is not sent to review.

#### 2. Validate, commit the draft, read back

```bash
scripts/gp.sh 'com.fedi/edits/<edit-id>:validate' -X POST
scripts/gp.sh 'com.fedi/edits/<edit-id>:commit' -X POST
```

Committing a draft makes it visible in the console and nothing else. A committed edit is spent, so verify by opening a fresh edit and reading the production track: it must list the draft with the right version code and every locale's notes next to the live release. Report it as "draft 26.X.Y under Production, Releases, waiting for Review release and Start rollout". Stop here. Preparation is where this skill's autonomy ends.

### Rolling out (explicit user approval required)

Committing an edit whose production release has `status: completed` (everyone at once) or `"status": "inProgress", "userFraction": 0.1` (a fraction, so 0.1 is 10% of users, with the current completed release kept as the second element) is the submission. For `com.fedi` there is no API state between a draft and review: Google answers a commit sent with `?changesNotSentForReview=true` with "Changes are sent for review automatically. The query parameter changesNotSentForReview must not be set.", so the commit goes straight to review and, once review passes, live to users with no further gate. The user normally does this themselves in the console from the draft. Through the API it happens only on an explicit, unambiguous instruction from the user to roll out, given separately after they have seen the draft. The go that authorized preparation never covers it, no phrasing is close enough to infer from, and any doubt means stop and ask. There is no situation in which it happens as a side effect of something else.

To abandon a staged edit instead, `DELETE` it or let it expire. The draft flow, the client, the edit lifecycle and the track reads are proven against the live app (26.8.2, 2026-09-08); the rollout commit is written from Google's API reference.

### Live rollouts (prohibited)

A release committed as `inProgress` sits at its `userFraction` until changed. Raising the fraction, completing the rollout, or halting a release are actions on a version already live with users, and those are never agent actions, under any instruction. The user manages a live rollout themselves in the Play Console.

## The public APK

The direct-download APK ships through a draft GitHub release on this repo, and the draft doubles as the release's state record:

- the draft comes from CI: `release-production.yml` creates it as part of the full release build, and `upload-android-apk.yml` (manual dispatch) builds the APK alone. Both tag it with the bare version string (`26.X.Y`), attach the signed APK, and set the body to the build commit line. No draft for the version means no production build has run yet, so dispatch one. A draft publishes nothing and stays invisible outside the repo.
- the draft's body is where the release notes land before publishing. A published release is the strongest in-repo signal that a version actually shipped, and its body is the internal record of what went out, so a body still carrying only the commit line means the release notes have not been produced yet. Distill them (see the notes guidance in the staging step), get the user's sign-off, then stage them with `gh release edit <version> --notes-file <file>`, which finds drafts by tag and changes nothing visible. Never pass `--draft=false`, which is the publish switch. Shipped patches list their changes as short bullets; a feature release links and attaches the rendered release notes report.
- publishing the release fires `deploy-public-apk-to-github.yml`, which deploys the APK to apk.fedi.xyz and refreshes the public repo's download release. The public side gets only a download link pointing at apk.fedi.xyz, never the APK binary or the notes body, because the download site can block sanctioned IPs and public GitHub releases cannot.

Publishing the release is the APK channel's release action and is never an agent action, under any instruction. The user publishes the draft themselves on GitHub.

## Traps

- nothing outside a committed edit is real, so experiment freely inside one and throw it away, and never report an uncommitted edit as a prepared release
- the `:validate` call checks the staged shape for free inside the edit
- `?changesNotSentForReview=true` only exists for apps Google makes send changes explicitly; `com.fedi` rejects it, so a commit of a `completed` or `inProgress` release is a submission, and the draft status is the only pre-review state
- `userFraction` is only valid with `inProgress`; `completed` with a fraction fails validation
- a release note text over 500 characters fails validation
- the API cannot roll back a live release; shipping a fix means a new version code through the whole pipeline
- token assertions are capped at one hour; the script mints one per call, so there is nothing to cache
