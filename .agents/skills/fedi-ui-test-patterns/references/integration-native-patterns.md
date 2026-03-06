# Native Integration Test Patterns

Patterns for `ui/native/tests/integration/`.

For shared builder details, commands, and cross-environment gotchas, pair this guide with `references/integration-patterns.md`.

---

## Environment Summary

- **Config**: `ui/native/tests/configs/jest.integration.config.js`
- **Preset**: `react-native`
- **Setup file**: `ui/native/tests/setup/jest.setup.mocks.ts`
- **Render helper**: `ui/native/tests/utils/render.tsx`
- **Testing library**: `@testing-library/react-native`

Native integration tests render real native screens or native components against the real bridge-backed store.

---

This is the dominant native pattern:

- import `waitFor` from `@testing-library/react-native`
- create the builder with `createIntegrationTestBuilder(waitFor)`
- call a builder state helper like `withOnboardingCompleted()` or `withChatReady()`
- render with `renderWithBridge(...)`
- assert with native queries and matchers

Code samples:

- `ui/native/tests/integration/federations.test.tsx`
- `ui/native/tests/integration/chat.test.tsx`
- `ui/native/tests/integration/screens/EditProfileSettings.test.tsx`

---

## Builder setup

Use:

```typescript
const builder = createIntegrationTestBuilder(waitFor)
const context = builder.getContext()
```

Passing the native `waitFor` is the real local default, not an optional style preference.

## Rendering

Use:

```typescript
renderWithBridge(<MyScreen />, { store, fedimint })
```

## Navigation And Route Mocks

Many native screen tests pass `mockNavigation` and `mockRoute`, especially for screens in `ui/native/screens/`.

Do not force navigation mocks into a screen test unless the subject actually needs them.

---

## Examples

### 1. Screen rendering tests

This is the most common shape.

Use when the subject is a native screen that should render correctly against real bridge state.

Defaults:

- builder + native `waitFor`
- `renderWithBridge(...)`
- `screen.findByText(...)`, `screen.findByTestId(...)`
- `expect(element).toBeOnTheScreen()`

Closest example:

- `ui/native/tests/integration/federations.test.tsx`

### 2. Native interaction tests

Use when a native component or screen behavior depends on real store / bridge state plus user interaction.

Defaults:

- render with `renderWithBridge(...)`
- use `userEvent` or `fireEvent`
- wrap eventual UI changes in `waitFor(...)`

Closest example:

- `ui/native/tests/integration/chat.test.tsx`

### 3. Simple real-state renders

Some native integration tests are intentionally minimal. They only need real onboarding state plus a render.

Closest example:

- `ui/native/tests/integration/screens/EditProfileSettings.test.tsx`

---
