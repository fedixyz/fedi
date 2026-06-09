# Shared code and native/web parity

Logic both platforms need belongs in shared `ui/common`, not duplicated per platform.

- flag logic added in `ui/web` or `ui/native` that already exists, or should exist, in `ui/common` (selectors, hooks, helpers). "Should be a common hook/selector" is a real finding
- prefer hoisting a UI decision into a `ui/common` selector or hook (e.g. `selectShouldShowX`) over an inline per-platform render condition
- a value recomputed in one place but not another (list vs detail view, totals vs line items, a balance or fee shown two ways) is a parity bug
