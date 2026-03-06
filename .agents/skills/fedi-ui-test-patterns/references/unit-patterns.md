# Unit Test Patterns Index

Start here before loading any unit-test reference. This file is intentionally small: its job is to route you to the right environment-specific guide.

---

## Load Order

When working on a unit test, load files in this order:

1. This file: `references/unit-patterns.md`
2. The environment-specific guide:
   - `references/unit-native-patterns.md`
   - `references/unit-web-patterns.md`
   - `references/unit-common-patterns.md`
3. `references/mock-builders.md` only if you need concrete mock factories or `createMockFedimintBridge`
4. Existing nearby tests for the exact feature you are changing

Do not load all unit references by default. Most tasks only need one environment guide plus 1-2 nearby tests.

---

## Pick The Right Environment

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

## Decision Tree

### Native Decision

If the subject is a native screen or component:

- Usually use `renderWithProviders`
- Usually import queries from `@testing-library/react-native`
- Usually call `cleanup()` in `afterEach`
- For screens, usually pass `mockNavigation as any` and `mockRoute as any`

If the subject is a native hook that needs Redux, Fedimint, i18n, or RN setup:

- Usually use `renderHookWithProviders`

### Web Decision

Web unit tests split into two real families. This distinction matters.

If the subject needs Redux, Fedimint, app i18n, Next page wiring, or app-level providers:

- Use `renderWithProviders` or `renderHookWithProviders`
- Read the provider-heavy section in `references/unit-web-patterns.md`

If the subject is a providerless component or standalone hook:

- Raw `render` or raw `renderHook` is often preferred
- Read the providerless section in `references/unit-web-patterns.md`

Do not assume all web unit tests use shared render helpers. Many do not.

### Common Decision

If the subject is a pure util or shared hook with no UI shell:

- Often no providers are needed
- Use `renderHookWithState` only when the hook needs store / Fedimint context
- Read `references/unit-common-patterns.md`

---

## Real Canonical Examples

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

Do not turn these into rigid rules when the surrounding tests in the same folder already follow a different stable pattern. Match the local suite first.

---

## Important Exceptions

- `cleanup()` is a strong native convention, but not a universal web convention
- A fresh store in `beforeEach` is a safe default, but some existing tests intentionally build reusable state in `beforeAll`
- In web tests, both `userEvent` and `fireEvent` are used in the real suite
- In web tests, raw `render` / `renderHook` are common for providerless subjects

---

## Related References

- `references/mock-builders.md` for Fedimint, federation, transaction, and Matrix mocks
- `references/integration-patterns.md` for integration tests
- `references/appium-patterns.md` for Appium tests
