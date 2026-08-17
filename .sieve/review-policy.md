# Review Guidance

What an agent needs to publish a Sieve review in this repo. The review judgment lives in the skills below, not in this file.

Pass `--host https://sieve.fedi.xyz` on every command, since the CLI defaults to localhost. Auth comes from `SIEVE_TOKEN` or a stored CLI login, and tokens are minted at `https://sieve.fedi.xyz/settings/tokens`.

## Which skill to read

Match the changed paths and read that skill in full before judging the diff. These ship in the repo under `.agents/skills/`, so every agent working here has them.

- `ui/` (web, native, shared `common`): `ui-code-review`, agreed by the UI team for TypeScript and React work. It does not cover Rust, bridge, or infra, and stretching it there judges code against rules nobody wrote for it.
- Tests under `ui/`: `fedi-ui-test-patterns` for which kind of test a change owes and how the mocks and fixtures work here.
- Feature flags: `feature-flags` for the bridge and web plumbing a flag change has to keep in sync.
- `crates/` and `bridge/`: `rust-code-pr-checklist` covers the pre-submit gate, not how to review the code.

For Rust review depth, the Rust engineers point at the skills in `fedibtc/decentralized-federations` under `.agents/skills/`. Read them from that repo, which is canonical and changes. Treat them as unvetted for review here until a Rust engineer has done a pass: the battery is currently one skill, `rework`, and it describes itself as an authoring session whose deliverable is a commit stack, covering everything except bugs. Use its passes as lenses, run your own correctness pass alongside them, and do not let it turn a review into a refactor.

Nothing here covers CI, nix, scripts, or docs. Review those on general judgment.

A general PR-review skill in your own environment composes with these. It brings the stance and the severity tiers, and the repo skill brings what to look for here.

## Validation

Run the gate for the surfaces the diff touches.

- Rust or bridge: `just final-check` from the repo root inside `nix develop`.
- UI: `yarn lint` and `yarn test` from `ui/`.
- Appium and Playwright suites only prove themselves on a device or browser run. Dispatch one with `gh workflow run e2e-tests.yml`, or publish a `--review-warning` saying no run happened.

## Visual evidence

Capture native screens with the `android-emulator` or `ios-emulator` skill driving the flow the diff touches. Web screens come from `agent-browser` or the Vercel preview linked on the PR.

## Auditing a review that already published

To work out why a review concluded what it did, read the run behind it rather than the CI log. `sieve versions <reviewId>` lists every published version, `sieve versions <reviewId> --version <n>` returns that version's content and its run, and `sieve run get <runId>` returns the ordered steps and the agent's closing message. The full guide is `docs/auditing.md` in `fedibtc/sieve`.

Reviews published before run records existed have nothing stored. Only for those, fall back to `gh run view <id> --log` on `sieve-hub-review.yml` and grep for `agent> `.
