# Shared code and native/web parity

Logic both platforms need belongs in shared `ui/common`, not duplicated per platform.

- flag logic added in `ui/web` or `ui/native` that already exists, or should exist, in `ui/common` (selectors, hooks, helpers). "Should be a common hook/selector" is a real finding
- prefer hoisting a UI decision into a `ui/common` selector or hook (e.g. `selectShouldShowX`) over an inline per-platform render condition
- a value recomputed in one place but not another (list vs detail view, totals vs line items, a balance or fee shown two ways) is a parity bug

## Build environment gates

- Use the shared helpers in [`ui/common/utils/environment.ts`](../../../../../ui/common/utils/environment.ts) for UI build restrictions on both platforms
- For development and nightly builds only, use `isDev() || isNightly()`. `isExperimental()` and the deprecated `isDevOrNightly` alias also include Nova
- Bridge `appFlavor` describes runtime configuration and is populated during initialization. Native Nova builds report `nightly`, so bridge flavor does not identify a nightly build
- Do not combine bridge flavor with a build gate unless the feature has a separate, named bridge-runtime requirement
- Check the controls and the underlying action or display override against the same availability rule
- When testing a build restriction, use actual build flags before bridge flavor initialization. Release restrictions must hold with developer mode enabled and injected Redux state, including Nova with a `nightly` bridge flavor
