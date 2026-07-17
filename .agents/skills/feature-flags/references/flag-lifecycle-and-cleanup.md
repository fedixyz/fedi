# Feature Flag Lifecycle and Cleanup

A remotely-controlled flag moves through a few states, and the last transition has a cleanup step that is easy to get wrong.

## Lifecycle

1. In development: off everywhere, or on only in `new_dev()` and `new_tests()`
2. Rollout: turned on for stricter runtimes in turn (dev, then staging, then prod), remote and compiled-in
3. Fully on: on in every environment, the flag still present because app binaries in the field still gate on it
4. Graduated: the gate removed from the app code, the feature hardwired on

## Compiled default vs served value

- At startup the bridge builds the compiled-in catalog (`new_prod()` and friends), then applies the last remote payload cached in its DB. The background refresh writes the fetched payload for the next launch, so a remote change takes effect one launch later, never in the current session.
- `apply_remote_layer()` overwrites each remote flag from the cached value in both directions. A cached `false` turns a feature off even when the compiled default is on. Once any fetch is cached, the remote value wins on every later launch, offline included.
- So the compiled default only governs two cases: the first session of a fresh install, and every session of an install that never reaches the network.

Because of that narrow reach, the served value and the compiled default do not have to move together. The served value can lead during a rollout; aligning the compiled default just avoids a new install briefly showing the wrong state on its first session.

## Graduating a flag

Once a feature is on everywhere and stable, remove the gate so the code stops branching on it. The trap: the served value is still read by app binaries in the field, and a removed value deserializes to `false`, which turns the feature off for them. So split the removal by where each piece is read.

Now, in one PR that ships in an app binary, remove the app-side gate:

- `crates/runtime/src/features.rs`: remove the field from `FeatureCatalog`, its branch from `apply_remote_layer()`, its `...FeatureConfig` struct, and the field from all four constructors
- regenerate bindings (`scripts/bridge/ts-bindgen.sh`) so `FeatureCatalog` loses the field
- remove any dedicated per-flag selector wrapper and inline the enabled path at every `selectFeatureFlag(s, '<flag>')` call site, web and native. Do not delete the shared `selectFeatureFlag` itself
- update or delete the unit tests that mocked the flag

These land together on purpose: dropping the `FeatureCatalog` field without removing the UI gate leaves the UI reading a missing flag, which defaults to off.

Keep serving the value. Leave the field in `RemoteFeatures` and keep its `true` in both `features.ts` maps, so old binaries still see the feature.

Later, once the app version floor has the graduated binary and nothing in the field still gates on the flag, drop the leftovers in a separate change: the `RemoteFeatures` field, the served key in both `features.ts` maps, and the flag's assertion in the serde back-compat test. How long to wait depends on how fast your users update.

One case this does not solve: an old binary running a buggy version of the feature while being served `true` shows the bug until it updates.
