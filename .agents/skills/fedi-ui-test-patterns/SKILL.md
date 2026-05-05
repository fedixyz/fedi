---
name: fedi-ui-test-patterns
description: Comprehensive knowledge of Fedi's testing infrastructure for UI code (utilities, mock builders, conventions, and patterns) — use this when reading, writing or running unit/integration/e2e tests
user-invocable: false
---

# Fedi Testing Patterns & Infrastructure

## Decision Guide: Which Test Type?

### Unit Tests - `ui/*/tests/unit/`

Write unit tests when the change involves:

- **Custom hooks** (especially amount/formatting, federation, chat logic)
- **Pure utility functions** (parsers, formatters, validators, string manipulation)
- **Redux selectors** with non-trivial logic
- **Component rendering logic** that depends on props/state (conditional rendering, computed display values)

Unit tests mock the bridge entirely. They're fast, isolated, and don't need a running backend.

When working on unit tests:

1. Read `references/unit-patterns.md` first
2. Determine which environment you are writing tests for.
3. Then read exactly one environment-specific guide:
   - `references/unit-native-patterns.md`
   - `references/unit-web-patterns.md`
   - `references/unit-common-patterns.md`
4. Read `references/mock-builders.md` only if you need to use or create test data mocks
5. Read 1-2 nearby tests in the same folder as the code under test

### Integration Tests — `ui/*/tests/integration/`

Write integration tests when the change involves:

- **Hook logic that calls the real bridge using the useFedimint hook** (federation join, ecash receive, balance calculations against live state)
- **Redux action dispatches that trigger bridge RPCs** and update store state
- **Matrix/chat flows** that involve real message sending, room creation, or auth
- **End-to-end data flows** where you need to verify the full path: user action → Redux dispatch → bridge RPC → state update → UI reflects change

When working on integration tests:

1. Read `references/integration-patterns.md` first
2. Determine which environment you are writing tests for.
3. Then read exactly one environment-specific guide:
   - `references/integration-common-patterns.md`
   - `references/integration-native-patterns.md`
   - `references/integration-web-patterns.md`
4. Read `references/mock-builders.md` only if you need to use or create test data mocks
5. Read 1-2 nearby integration tests in the same folder as the code under test

### E2E Tests (Appium) — `ui/native/tests/appium/`

Write e2e tests only when unit & integration tests cannot adequately exercise the flow, for example:

- **Navigation flows** - verification of screen-to-screen transitions
- **Fresh app state** - assertions can be built up from scratch on a fresh app installation (onboarding, wallet setup, sending payment, etc)
- **Visual state** - device-specific UI state matters and you need to verify the complete UI renders correctly with real data

When you've decided an e2e test is required, read `references/appium-writing.md`

After you've written a test or if you need to make sure no existing tests break, read: `references/appium-running-local.md`

If running an e2e test locally seems broken or you want an alternative way to validate before merging changes: read `references/appium-running-ci.md`

### When NOT to test

The Fedi team follows a **pragmatic** approach. Don't write tests for:

- Pure styling changes that don't affect the positioning of important elements on the page
- Simple prop-passing components with no logic
- One-off configuration changes
- Changes that are adequately covered by existing tests

## Running Tests

ALWAYS use the top-level bash scripts to run tests. Further details are in the respective reference guides.

```bash
./scripts/ui/run-unit-tests.sh         # see references/unit-patterns.md
./scripts/ui/run-integration-tests.sh  # see references/integration-patterns.md
./scripts/ui/run-e2e.sh                # see references/appium-running-local.md
```

## File Locations & Naming

If you ever introduce a new test file or directory, you MUST update this directory map.

```text
ui/common/tests/
├── unit/
│   ├── hooks/           # Hook unit tests (amount.test.ts, federation.test.ts)
│   ├── matrix/          # Matrix-specific unit tests
│   ├── redux/           # Redux selector tests
│   └── utils/           # Utility function tests
│       └── transaction/ # Transaction utility tests (one file per function)
├── integration/
│   ├── hooks/           # Integration hook tests
│   │   ├── amount/      # Amount-related hooks
│   │   └── chat/        # Chat-related hooks
│   └── utils/           # Integration utility tests
└── mock-data/           # Shared mock data builders

ui/native/tests/
├── unit/
│   ├── hooks/           # Native-specific hook tests
│   ├── screens/         # Screen rendering tests
│   ├── components/      # Component rendering tests
│   └── utils/           # Native utility tests
├── integration/
│   ├── screens/         # Screen integration tests
│   └── *.test.tsx       # Feature integration tests
└── appium/
    └── common/          # Appium E2E test classes

ui/web/tests/
├── unit/
│   ├── components/      # Web component tests
│   ├── pages/           # Next.js page tests
│   ├── hooks/           # Web hook tests
│   └── utils/           # Web utility tests
├── integration/
│   ├── pages/           # Page-level integration tests
│   └── *.test.tsx       # Feature integration tests
├── utils/
│   └── render.tsx       # Web test render helpers
└── configs/
    ├── jest.unit.config.js
    └── jest.integration.config.js
```

Naming: `<subject>.test.ts` for logic, `<Subject>.test.tsx` for components/screens.

## Reference Map

- `references/unit-patterns.md` — Unit-test entrypoint. Read this first to choose the correct environment and pattern family
- `references/unit-native-patterns.md` — Native unit-test patterns for `ui/native/tests/unit/`
- `references/unit-web-patterns.md` — Web unit-test patterns for `ui/web/tests/unit/`, including the provider-heavy vs providerless split
- `references/unit-common-patterns.md` — Shared-unit-test patterns for `ui/common/tests/unit/`
- `references/integration-patterns.md` — Integration-test entrypoint. Read this first to choose the correct environment and test archetype
- `references/integration-common-patterns.md` — Shared integration-test patterns for `ui/common/tests/integration/`, including builder-driven, state-seeded, multi-user, and direct bridge/client shapes
- `references/integration-native-patterns.md` — Native integration-test patterns for `ui/native/tests/integration/`
- `references/integration-web-patterns.md` — Web integration-test patterns for `ui/web/tests/integration/`
- `references/mock-builders.md` — Read when you need concrete mock factories (transactions, federation, matrix events, fedimint bridge) or helper utilities like translation/locale/storage mocks
- `references/appium-writing.md` — Read when writing or editing an Appium e2e test, including the test class shape, element interaction API, dynamic testID patterns, and registering a new test
- `references/appium-running-local.md` — Read when running an e2e test on your local machine via `scripts/ui/run-e2e.sh` and friends
- `references/appium-running-ci.md` — Read when dispatching an e2e test in CI (canonical pre-merge validation, or a fallback when local is wedged) and when reading failure artifacts
