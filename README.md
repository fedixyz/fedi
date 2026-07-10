# Fedi

Fedi is a Bitcoin, Lightning and Chaumian e-cash wallet with built-in chat and communities, built on
[Fedimint](https://fedimint.org). This monorepo contains the full Fedi tech stack: the Rust core
("the bridge"), Fedi's custom Fedimint modules, and the React Native and React apps that ship to
users.

- Website: <https://fedi.xyz>
- License: [AGPL-3.0](./LICENSE)
- Security disclosures: [SECURITY.md](./SECURITY.md) (`security@fedi.xyz`)

## What's in the box

The stack is split into a **Rust core** that owns all wallet, protocol and chat logic, and a
**TypeScript UI layer** that renders it. Both mobile and web talk to the same Rust code:

```
             ui/native (React Native)          ui/web (Next.js PWA)
                     |                                  |
              uniffi FFI module                   WASM in a Worker
                     |                                  |
              bridge/fedi-ffi                    bridge/fedi-wasm
                     \                                  /
                      \______  crates/bridge  _________/          <- one core, two platforms
                                    |
              runtime, federations, matrix, communities, ...
                                    |
                       Fedimint (fedibtc/fedimint fork)
```

The Rust/TypeScript boundary is deliberately tiny. All of it is declared in
`bridge/fedi-ffi/src/fedi.udl`: two string-in, string-out entry points (`fedimint_initialize` and
`fedimint_rpc`), `fedimint_get_supported_events` to enumerate the event types, and an `EventSink`
callback for pushing async events back up to the UI. Request, response and event types
are defined once in `crates/rpc-types` and exported to TypeScript with `ts-rs`, so the two sides
cannot drift apart.

## Directory structure

| Path | Contents |
| --- | --- |
| `bridge/` | Platform FFI adapters: `fedi-ffi` (mobile), `fedi-wasm` (web), `ffi-bindgen` |
| `crates/` | The Rust core and Fedi's custom Fedimint modules |
| `ui/` | Yarn workspace: `common`, `native`, `web`, `injections` |
| `scripts/` | Build, test, lint and release scripts (most of what `just` calls) |
| `nix/`, `flake.nix` | The Nix dev environment and CI derivations |
| `misc/` | Git hooks and `mprocs` process-runner configs |
| `.github/` | CI workflows, PR/issue templates |

### Rust crates

**Core**

| Crate | Purpose |
| --- | --- |
| `crates/bridge` | The `Bridge` router: owns app state, dispatches RPC to the subsystems below |
| `crates/runtime` | Foundation — storage, database, event sink, feature flags, Fedi API client |
| `crates/federations` | Joining and managing federations, per-federation state machines, fees |
| `crates/rpc-types` | RPC request/response/event types; source of the TypeScript bindings |
| `crates/api-types` | Types for Fedi's backend HTTP API |
| `crates/matrix` | Matrix chat: login, rooms, timelines, media, encryption and recovery |
| `crates/communities` | Communities — a federation without a wallet (chat, mods, nostr identity) |
| `crates/multispend` | Multisig group spending, coordinated over Matrix |
| `crates/sp-transfer` | Peer-to-peer fiat transfers between Stability Pool accounts, over Matrix |
| `crates/nostril` | Nostr client: seed-derived keys, community events, NIP-44 |
| `crates/device-registration` | Renews this device's registration; enforces single-device seeds |
| `crates/bug-report` | Database dump/undump and reused-e-cash proofs for bug reports |
| `crates/redb-storage` | A redb-backed storage implementation |
| `crates/remote-server` | Hosts `Bridge` instances over HTTP/WebSocket (the "remote bridge") |
| `crates/debug-tools` | `fedi-debug` CLI: import an app `db.dump` back into a database |
| `crates/env` | Shared environment-variable name constants |

**Fedimint modules and binaries**

| Crate | Purpose |
| --- | --- |
| `crates/modules/fedi-social` | Social backup and recovery, via guardian-held secrets |
| `crates/modules/stability-pool` | Stability Pool **v2** (`multi_sig_stability_pool`), multisig |
| `crates/modules/stability-pool-old` | Stability Pool **v1** (`stability_pool`), for migration |
| `crates/fedimint/fedimintd` | `fedimintd` guardian daemon bundled with Fedi's modules |
| `crates/fedimint/fedimint-cli` | `fedimint-cli` extended with Fedi's client modules |
| `crates/fedimint/devi` | Dev/test harness: local federation, nostr relay and Matrix server |

> Despite the names, `stability-pool` is the current module and `stability-pool-old` is the legacy
> one. Both are compiled in and enabled independently so federations can migrate.

### UI workspaces

| Workspace | Purpose |
| --- | --- |
| `@fedi/common` | Shared logic: Redux state, hooks, types, i18n, the `FedimintBridge` wrapper |
| `@fedi/native` | The Android and iOS app (bare React Native) |
| `@fedi/web` | The progressive web app (Next.js) |
| `@fedi/injections` | Scripts injected into webviews to provide WebLN, NIP-07 and friends |

## Quick start

The development environment is managed with [Nix](https://nixos.org/download.html), and effectively
every script in this repo re-executes itself inside `nix develop` if you aren't already there. Once
Nix is installed:

```bash
direnv allow          # or: nix develop   (in every shell you work from)
just build-ui-deps    # install the UI's node modules
just run-dev-ui       # build the bridge and run the native app + PWA
```

Entering the dev shell also installs this repo's git hooks. Run `just` on its own to list every
available recipe.

Before opening a pull request:

```bash
just final-check      # lint, clippy, and the Rust test suite
just test-ui          # UI unit and integration tests
```

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org) — a
`commit-msg` hook enforces this with `convco`.

**[HACKING.md](./HACKING.md) is the full contributor guide**: environment setup, the build and test
matrix, the codebase's Rust and UI conventions, CI, and the release process. Read it before your
first change.

## Further reading

| Document | Topic |
| --- | --- |
| [HACKING.md](./HACKING.md) | Contributor guide: setup, building, testing, conventions, CI |
| [bridge/README.md](./bridge/README.md) | Building the mobile bridge, uniffi, troubleshooting |
| [bridge/debugging.md](./bridge/debugging.md) | Debugging the bridge |
| [ui/README.md](./ui/README.md) | The UI workspace in detail |
| [ui/docs/TESTING.md](./ui/docs/TESTING.md) | UI unit, integration and end-to-end tests |
| [ui/docs/LINKING.md](./ui/docs/LINKING.md) | Deep links |
| [ui/docs/meta_fields/](./ui/docs/meta_fields/) | Federation metadata fields |
| [ui/injections/README.md](./ui/injections/README.md) | The webview injection API |
