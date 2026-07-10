# The Fedi bridge

The "bridge" is how the apps in `ui/` reach the Rust core in `crates/`. It is a thin platform
adapter, not where features live: it supplies a platform event sink and storage implementation, then
forwards calls into `crates/bridge`. New functionality belongs in `crates/`.

For repository-wide setup, conventions and CI, see the [root README](../README.md) and
[HACKING.md](../HACKING.md). Everything below assumes you are inside the Nix dev shell
(`nix develop`, or `direnv allow` once).

## Layout

| Path | Contents |
| --- | --- |
| `fedi-ffi/` | The uniffi adapter for Android and iOS. Also owns `src/fedi.udl` |
| `fedi-wasm/` | The wasm-bindgen adapter for the web app, with OPFS-backed storage |
| `ffi-bindgen/` | Small binary that generates the Kotlin and Swift glue code |
| `fedi-android/` | Gradle project that packages the Android `.so` files and Kotlin glue |
| `fedi-swift/` | Swift package wrapping `fediFFI.xcframework` |
| `fixtures/` | Test fixtures (an old database, a verification document) |

## The FFI boundary

The whole Rust/TypeScript surface is three functions plus a callback, declared in
`fedi-ffi/src/fedi.udl`:

```
[Async] string fedimint_initialize(EventSink event_sink, string init_opts_json);
[Async] string fedimint_rpc(string method, string payload);
        sequence<string> fedimint_get_supported_events();
```

The UI sends a method name and a JSON payload and gets JSON back. Asynchronous notifications travel
the other way, through `EventSink.event(event_type, body)`. `fedimint_get_supported_events` returns
the event types the bridge can emit — use it rather than hardcoding that list on the UI side.

Keeping the boundary this narrow is deliberate: `fedi-wasm` reuses `fedi-ffi`'s RPC glue, so both
platforms exercise the same code path.

### Generated bindings

Nothing on either side of the boundary is written by hand twice.

- **Kotlin and Swift** glue is generated from `fedi.udl` by `ffi-bindgen` (see below).
- **TypeScript** types are generated from the `ts-rs` derives on the Rust types in
  `crates/rpc-types`. Run `just generate-bridge-bindings`; it writes `ui/common/types/bindings.ts`.
  Never edit that file by hand.

## Building

| Command | Result |
| --- | --- |
| `just build-bridge` | TypeScript bindings, then the iOS and Android artifacts |
| `just build-bridge-android` | Android only |
| `just build-bridge-ios` | iOS only (runs itself in the `.#xcode` shell) |
| `just build-wasm` | The WASM bridge (`build-wasm-release` for a release profile) |
| `just install-wasm` | Copies the built WASM into `ui/common/wasm` |
| `just check-wasm` | `cargo check` for `wasm32-unknown-unknown` |

To save time, both mobile builds default to just the targets a simulator or emulator needs. Set
`BUILD_ALL_BRIDGE_TARGETS=1` to build every target, which is what you want for a physical device or
a release. `BRIDGE_TARGETS_TO_BUILD` overrides the list outright, and `CARGO_PROFILE` overrides the
profile.

| Platform | Default targets | With `BUILD_ALL_BRIDGE_TARGETS=1` |
| --- | --- | --- |
| Android | `aarch64-linux-android` | adds `x86_64-linux-android`, `armv7-linux-androideabi` |
| iOS | `aarch64-apple-ios-sim`, `x86_64-apple-ios` | adds `aarch64-apple-ios` |

iOS builds both simulator targets by default, and combines them with `lipo`, pending
[#2497](https://github.com/fedibtc/fedi/issues/2497). They also default to the `dev-ios` Cargo
profile, which is `dev` raised to `opt-level = 1` to work around an issue with unoptimized builds.

### What the Android build actually does

`scripts/bridge/build-bridge-android.sh` drives two steps:

1. `build-bridge-android-libs.sh` cross-compiles `fedi-ffi` into `libfediffi.so` for each target
   (throttled, since linking is single-threaded) and generates the Kotlin glue with `ffi-bindgen`.
2. `install-bridge-android.sh` copies those into the `fedi-android` Gradle project and publishes it
   to a local Maven repository at `$ANDROID_BRIDGE_ARTIFACTS`
   (`bridge/fedi-android/artifacts`, exported by the dev shell). `ui/native` consumes it from there.

In CI the first step is replaced by `nix build .#fedi-android-bridge-libs`.

The iOS build is simpler: `build-bridge-ios.sh` generates the Swift glue, builds `libfediffi.a` per
target, and copies the headers and binaries into `fedi-swift/fediFFI.xcframework`.

## Why `ffi-bindgen` exists

Generating uniffi bindings is two separate steps: building the native binaries, and building the
glue code that calls them. uniffi requires that **the version of `uniffi` used to build the binaries
matches the version of `uniffi-bindgen` that generated the glue** — and because the steps are
separate, nothing checks this at build time. A mismatch fails at runtime, confusingly.

`ffi-bindgen` is a one-line binary (`uniffi::uniffi_bindgen_main()`) that lives in this workspace,
so it inherits the workspace's pinned `uniffi`. Using it instead of a separately installed
`uniffi-bindgen` makes the mismatch impossible.

## Binary size

The `release` profile in the root `Cargo.toml` trades compile time for size: fat LTO, one codegen
unit, and `opt-level = "z"`. Debug symbols are kept (`debug = "line-tables-only"`) so panics remain
diagnosable; strip them afterwards if a build target needs to.

## Testing

```bash
just test-bridge            # the whole bridge suite
just test-bridge <testcase> # one test
```

This spins up a real local federation with `devi`, with the stability pool, social recovery and
Lightning v2 modules enabled, and runs the `fedi-ffi` tests against it under `cargo nextest`. It is
slow, and it needs nothing beyond the dev shell.

## The remote bridge

`crates/remote-server` hosts real `Bridge` instances out of process over HTTP and WebSocket, keyed
by device ID. It backs the UI integration tests and lets you point an app at a bridge running
elsewhere.

```bash
./scripts/bridge/run-remote.sh --with-devfed   # build and launch, with a dev federation
just clear-remote-bridge                       # wipe its data directory and the app's state
```

Set `FEDI_DISABLE_REMOTE_BRIDGE=1` to skip starting it.

## Debugging

See [debugging.md](./debugging.md) for reading Android logs and filtering `fedi.log` files.

## Troubleshooting

**Android link errors mentioning macOS SDK paths**, such as `unknown argument
'-search_paths_first'`. A previous host build can leave macOS paths in `aws-lc-sys`'s CMake cache,
which then poisons the Android build. `build-bridge-android-libs.sh` detects and clears the affected
directories automatically for local debug builds; if you hit it another way, delete the
`aws-lc-sys` build directories under `$CARGO_BUILD_TARGET_DIR`.

**Stale artifacts.** The Android build publishes into `$ANDROID_BRIDGE_ARTIFACTS` and the iOS build
writes into `fedi-swift/fediFFI.xcframework`. If the app seems to run code you have already changed,
rebuild the bridge before rebuilding the app — Metro will not do it for you.

**Anything involving Xcode** needs the `.#xcode` shell, which symlinks your host's `Xcode.app`. Run
`just install-xcode` if you do not have one.

Building outside the Nix shell is unsupported: the shell provides the Android SDK and NDK, the
cross-compilation toolchains, and the linker configuration that make any of the above work.
