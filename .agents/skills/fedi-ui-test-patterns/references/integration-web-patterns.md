# Web Integration Test Patterns

Patterns for `ui/web/tests/integration/`.

---

## Environment Summary

- **Config**: `ui/web/tests/configs/jest.integration.config.js`
- **Environment**: `jest-environment-jsdom`
- **Setup file**: `ui/web/jest.setup.js`
- **Render helper**: `ui/web/tests/utils/render.tsx`
- **Testing library**: `@testing-library/react`
- **Matchers**: `@testing-library/jest-dom`

Web integration tests render real pages or components in jsdom against the real bridge-backed store.

---

## Default Web Shape

The current web suite is small and fairly uniform:

- `const builder = createIntegrationTestBuilder()`
- `const context = builder.getContext()`
- use a builder state helper like `withOnboardingCompleted()`
- render with `renderWithBridge(...)`
- assert with DOM queries and `jest-dom` matchers

Canonical examples:

- `ui/web/tests/integration/federations.test.tsx`
- `ui/web/tests/integration/pages/settings/edit-profile.test.tsx`

---

## The Real Web Archetypes

### 1. Router-driven page / component tests

Use this when URL query state changes what the page renders.

Defaults:

- mutable `mockQuery` object
- `jest.mock('next/router', ...)`
- merge `mockUseRouter`
- render with `renderWithBridge(...)`

Closest example:

- `ui/web/tests/integration/federations.test.tsx`

### 2. Simple page render tests

Use this when the page mostly needs real onboarding / bridge state and a straightforward render.

Closest example:

- `ui/web/tests/integration/pages/settings/edit-profile.test.tsx`

---

## Web Defaults

### Rendering

Use:

```typescript
renderWithBridge(<MyPageOrComponent />, { store, fedimint })
```

### Assertions

Common web assertions in the real suite:

- `screen.findByTestId(...)`
- `screen.findByText(...)`
- `screen.queryByText(...)`
- `screen.getByLabelText(...)`
- `expect(element).toBeInTheDocument()`
- `expect(element).toHaveTextContent(...)`

### Router mocking

Only add router query mocking when the page actually depends on URL state.

The current suite has one strong real example of this pattern:

- `ui/web/tests/integration/federations.test.tsx`

Do not cargo-cult the router mock into unrelated web integration tests.

---

## Canonical Files To Copy From

- Router-driven onboarding flow: `ui/web/tests/integration/federations.test.tsx`
- Simple settings page render: `ui/web/tests/integration/pages/settings/edit-profile.test.tsx`

For shared builder details, commands, and cross-environment gotchas, pair this guide with `references/integration-patterns.md`.
