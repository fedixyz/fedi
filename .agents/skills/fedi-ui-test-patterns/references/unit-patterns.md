# Unit Test Patterns Index

Use this guide only after you have determined that you are working with unit tests.

Do not load all unit references by default. Most tasks only need one environment guide plus 1-2 nearby tests:

- Determine which environment you are writing tests for
- Then read exactly one environment-specific guide:
   - `references/unit-native-patterns.md`
   - `references/unit-web-patterns.md`
   - `references/unit-common-patterns.md`
- Read `references/mock-builders.md` only if you need to use or create test data mocks

---

## Picking The Right Environment

### `ui/native/tests/unit/`

Use this when the code under test lives in `ui/native/` or depends on React Native-only APIs:

- Screens
- Native feature components
- Native hooks
- Native utilities

Then read `references/unit-native-patterns.md`.

### `ui/web/tests/unit/`

Use this when the code under test lives in `ui/web/` and runs in the DOM / jsdom environment:

- Next.js pages
- Web components
- Browser hooks
- DOM-oriented utilities

Then read `references/unit-web-patterns.md`.

### `ui/common/tests/unit/`

Use this when the code under test lives in `ui/common/`:

- Pure utilities
- Shared hooks
- Redux selectors or shared state logic
- Shared logic that does not belong to native or web UI folders

Then read `references/unit-common-patterns.md`.

---

## File Naming

Unit test files live under `tests/unit/` and use:

- `.test.ts` for hooks or logic-heavy files
- `.test.tsx` for rendered screens / pages / components

When creating new test files, the name MUST match the source file they are testing. One test file per source file — never combine tests for multiple source files into a single test file.

- `hooks/amount/useMinMaxDepositAmount.ts` → `tests/unit/hooks/useMinMaxDepositAmount.test.ts`
- `hooks/matrix.ts` → `tests/unit/hooks/matrix.test.ts`
- `utils/AmountUtils.ts` → `tests/unit/utils/AmountUtils.test.ts`

---

## Running Tests

ALWAYS use the top-level bash scripts to run tests.

```bash
# Run all unit tests (all UI workspaces)
./scripts/ui/run-unit-tests.sh

# Run unit tests for one workspace
./scripts/ui/run-unit-tests.sh common
./scripts/ui/run-unit-tests.sh native
./scripts/ui/run-unit-tests.sh web

# Run unit tests for one specific *.test.ts file in one workspace (amount.test.ts)
./scripts/ui/run-unit-tests.sh common amount.test.ts
```

---

## Decision Tree

### Common Environment

If the subject is a pure util or shared hook with no UI shell:

- Often no providers are needed
- Use `renderHookWithState` only when the hook needs store / Fedimint context
- Read `references/unit-common-patterns.md`

### Native Environment

If the subject is a native screen or component:

- Usually use `renderWithProviders`
- Usually import queries from `@testing-library/react-native`
- Usually call `cleanup()` in `afterEach`
- For screens, usually pass `mockNavigation as any` and `mockRoute as any`

If the subject is a native hook that needs Redux, Fedimint, i18n, or RN setup:

- Usually use `renderHookWithProviders`

### Web Environment

Web unit tests split into two real families. This distinction matters.

If the subject needs Redux, Fedimint, app i18n, Next page wiring, or app-level providers:

- Use `renderWithProviders` or `renderHookWithProviders`
- Read the provider-heavy section in `references/unit-web-patterns.md`

If the subject is a providerless component or standalone hook:

- Raw `render` or raw `renderHook` is often preferred
- Read the providerless section in `references/unit-web-patterns.md`

Do not assume all web unit tests use shared render helpers. Many do not.

---

## Examples to model from

Open one of these after you choose the environment. Prefer the closest example to the task shape.

### Native Examples

- Screen with navigation and providers: `ui/native/tests/unit/screens/ShareLogs.test.tsx`
- Hook with providers: `ui/native/tests/unit/hooks/media.test.ts`
- Simple rendered component: `ui/native/tests/unit/components/feature/transaction-history/TransactionsList.test.tsx`

### Web Examples

- Page with providers and preloaded state: `ui/web/tests/unit/pages/home.test.tsx`
- Component with providers, fake timers, and mock bridge: `ui/web/tests/unit/components/SendOffline.test.tsx`
- Providerless component: `ui/web/tests/unit/components/InstallBanner.test.tsx`
- Providerless hook: `ui/web/tests/unit/hooks/media.test.tsx`
- Dialog / `fireEvent` DOM flow: `ui/web/tests/unit/components/Chat/ChatFederationInvite.test.tsx`

### Common Examples

- Pure utility tests: `ui/common/tests/unit/utils/AmountUtils.test.ts`
- Shared hook with state: read a nearby file in `ui/common/tests/unit/hooks/`

If there is a nearby existing test in the same folder as the feature you are changing, that local example beats the generic example list above.

---

## Universal Conventions

These are good defaults across environments, unless nearby tests clearly follow a different local convention:

- Use Jest with `describe` / `it`
- Prefer `it('should ...')` naming
- Call `jest.clearAllMocks()` in `beforeEach`
- Prefer behavior assertions over implementation-detail assertions
- Prefer async queries when the UI updates after async work
- Reuse existing mock builders and setup mocks before inventing new local fixtures
- Whenever possible, test descriptions should use language that adds a layer of abstraction instead of just describing literal code logic / assertions
  - bad: "should return maxAmount: 0 when balance < 0"
  - good: "should guard against negative balances"

Do not turn these into rigid rules when the surrounding tests in the same folder already follow a different stable pattern. Match the local suite first.

---

## Coverage Completeness

When writing tests for a hook or utility, you MUST make your best effort to cover every value in the return type. If a hook returns `{ minimumAmount, maximumAmount }`, both fields need test coverage.

If a return value is hard to test because its dependency chain is difficult to mock, you MUST either:
1. Work through the mock (preferred), OR
2. Explicitly tell the user which return values lack coverage and why, including a comment in the test file with this explanation

Never silently skip coverage for part of a return type.

---

## Important Exceptions

- `cleanup()` is a strong native convention, but not a universal web convention
- A fresh store in `beforeEach` is a safe default, but some existing tests intentionally build reusable state in `beforeAll`
- In web tests, both `userEvent` and `fireEvent` are used in the real suite
- In web tests, raw `render` / `renderHook` are common for providerless subjects

