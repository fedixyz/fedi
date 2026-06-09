# Tests follow fedi-ui-test-patterns

UI tests must follow the conventions in the `fedi-ui-test-patterns` skill.

- apply that skill's utilities, mock builders, and unit/integration/e2e conventions
- watch for missing branch coverage and for assertions on implementation details instead of behavior
- a high-risk change (shared state, payments, auth, federation lifecycle, the bridge boundary) shipped without coverage is a finding; a copy or styling tweak is not
