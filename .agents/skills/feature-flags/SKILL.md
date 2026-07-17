---
name: feature-flags
description: Use when changing, adding, or consuming Fedi remote feature flags across the bridge runtime and web API. Covers crates/runtime/src/features.rs, ui/web/src/pages/api/features.ts, TypeScript bindings, local testing, and selector usage.
---

# Fedi Feature Flags

Use this skill when the task involves changing a feature flag value, adding a new remotely controlled flag, or showing/hiding UI based on a feature flag.

## Mental Model

Remote flag values are served by the web app and consumed by the bridge.

- Web API source of truth: `ui/web/src/pages/api/features.ts`
- Bridge catalog and remote-layer logic: `crates/runtime/src/features.rs`
- Generated TS bindings: `ui/common/types/bindings.ts`
- UI code reads the bridge `FeatureCatalog` from Redux, not the raw web API response.

Naming matters:

- Rust `RemoteFeatures` fields are snake_case, e.g. `dummy_feature`.
- The web API and generated `RemoteFeatures` TS type use camelCase, e.g. `dummyFeature`.
- UI selectors read `FeatureCatalog`, so keys are snake_case, e.g. `selectFeatureFlag(s, 'dummy_feature')`.

## Existing Flag Value Change

If the remote flag already exists in `RemoteFeatures`, usually only edit:

```text
ui/web/src/pages/api/features.ts
```

Update both maps intentionally:

- `prodRemoteFeatures`: production values for `app.fedi.xyz`.
- `devRemoteFeatures`: values for all other envs, including preview branches and local development.

Use camelCase field names in this file because it imports the generated `RemoteFeatures` TypeScript type.

The matching `new_prod()` compiled default only affects a flag's first launch and permanently-offline installs, so it does not have to move in lockstep with the served value. See `references/flag-lifecycle-and-cleanup.md` for the lifecycle and how to graduate a flag safely.

## Adding A New Remote Flag

Use `dummy_feature` as the guide in `crates/runtime/src/features.rs`.

1. Add the field to `RemoteFeatures`.
2. Add or update the matching `FeatureCatalog` field/config if needed.
3. Update `FeatureCatalog::apply_remote_layer()` so the remote value is translated into the final catalog value.
4. Set compiled-in defaults in `new_dev()`, `new_staging()`, `new_prod()`, and `new_tests()`.
5. Keep compiled-in defaults aligned with web remote defaults where possible so first launch and offline startup behave consistently.
6. Update `ui/web/src/pages/api/features.ts` and return the new camelCase key from both `prodRemoteFeatures` and `devRemoteFeatures`.
7. Regenerate TypeScript bindings so `ui/common/types/bindings.ts` includes the updated `RemoteFeatures` shape.
8. Rebuild the bridge and test locally.

Be careful with compatibility. Existing released bridge versions must be able to deserialize the web endpoint response. Before making a schema change, check whether adding the field can break older clients. Prefer backward-compatible serde defaults when needed.

## Consuming A Flag In UI

Import the selector:

```ts
import { selectFeatureFlag } from '@fedi/common/redux'
```

Read `FeatureCatalog` keys with snake_case:

```ts
const showDummyFeature = useAppSelector(s =>
    Boolean(selectFeatureFlag(s, 'dummy_feature')),
)
```

Do not use the web API camelCase key in the Redux selector.

## Retiring A Flag

Turning a flag on is a rollout step, not the end of its life. Once a flag is on in every environment and the feature has proven stable, remove it so the code stops branching on dead config. The full removal checklist, and how the compiled default and remote layer interact, are in `references/flag-lifecycle-and-cleanup.md`.

## Verification

Useful checks:

```bash
rg -n "dummy_feature|RemoteFeatures|apply_remote_layer|prodRemoteFeatures|devRemoteFeatures" crates/runtime/src/features.rs ui/web/src/pages/api/features.ts ui/common/types/bindings.ts
```

From `ui/`, run the narrowest relevant checks first. If the user asked for code changes but not tests, follow repo instructions and ask whether to run tests after the implementation is complete.

When checking the live endpoint after deployment:

- Production: `https://app.fedi.xyz/api/features`
- Staging/dev URL is configured by `STAGING_REMOTE_FEATURES_URL` in `crates/runtime/src/constants.rs`.
