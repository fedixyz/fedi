---
name: fedi-ui-test-patterns
description: Comprehensive knowledge of Fedi's testing infrastructure for UI code — when to unit test vs integration test vs e2e, all available utilities, mock builders, conventions, and concrete patterns for writing each type of test.
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

When working on unit tests, use progressive disclosure:

1. Read `references/unit-patterns.md` first
2. Then read exactly one environment-specific guide:
   - `references/unit-native-patterns.md`
   - `references/unit-web-patterns.md`
   - `references/unit-common-patterns.md`
3. Read `references/mock-builders.md` only if you need mock factories or bridge helpers
4. Read 1-2 nearby tests in the same folder as the code under test

### Integration Tests — `ui/*/tests/integration/`

Write integration tests when the change involves:

- **Hook logic that calls the real bridge using the useFedimint hook** (federation join, ecash receive, balance calculations against live state)
- **Redux action dispatches that trigger bridge RPCs** and update store state
- **Matrix/chat flows** that involve real message sending, room creation, or auth
- **End-to-end data flows** where you need to verify the full path: user action → Redux dispatch → bridge RPC → state update → UI reflects change

Integration tests use a real bridge process. They're slower, run sequentially (`--runInBand`), and have at least a 60-second timeout per test.

When working on integration tests, use progressive disclosure:

1. Read `references/integration-patterns.md` first
2. Then read exactly one environment-specific guide:
   - `references/integration-common-patterns.md`
   - `references/integration-native-patterns.md`
   - `references/integration-web-patterns.md`
3. Read `references/mock-builders.md` only if you need local mock factories or selective test-only mocks
4. Read 1-2 nearby integration tests in the same folder as the code under test

### E2E Tests (Appium) — `ui/native/tests/appium/`

Write Appium tests when:

- **Navigation flows** need verification (screen-to-screen transitions)
- **User-facing flows** need full-stack validation (onboarding, joining federation, sending payment)
- **Visual state** matters and you need to verify the complete UI renders correctly with real data

Appium tests run against a built app on a simulator. They're the most expensive and slowest. They use a class-based pattern (`extends AppiumTestBase`), not Jest describe/it.

### When NOT to test

The Fedi team follows a **pragmatic** approach. Don't write tests for:

- Pure styling changes that don't affect the positioning of important elements on the page
- Simple prop-passing components with no logic
- One-off configuration changes
- Changes that are adequately covered by existing tests

## Running Tests

ALWAYS use the top-level bash scripts to run tests.

```bash
# Run all unit tests (all UI workspaces)
./scripts/ui/run-unit-tests.sh

# Run unit tests for one workspace
./scripts/ui/run-unit-tests.sh common
./scripts/ui/run-unit-tests.sh native
./scripts/ui/run-unit-tests.sh web

# Run all integration tests (all UI workspaces)
./scripts/ui/run-integration-tests.sh

# Run integration tests for one workspace
./scripts/ui/run-integration-tests.sh common
./scripts/ui/run-integration-tests.sh native
./scripts/ui/run-integration-tests.sh web

# Run integrations for one specific *.test.ts file in one workspace (chat-message.test.ts)
./scripts/ui/run-integration-tests.sh native chat-message
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
- `references/appium-patterns.md` — Read when adding or editing Appium E2E tests, registering tests in the Appium runner, or using class-based assertions (`throw new Error(...)`)
