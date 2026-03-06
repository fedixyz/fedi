# Integration Test Patterns Index

Start here before loading any integration-test reference. This file is intentionally small: its job is to route you to the right environment-specific guide and keep the first context load cheap.

---

## Load Order

When working on an integration test, load files in this order:

1. This file: `references/integration-patterns.md`
2. Exactly one environment guide:
   - `references/integration-common-patterns.md`
   - `references/integration-native-patterns.md`
   - `references/integration-web-patterns.md`
3. `references/mock-builders.md` only if the test needs local mock factories or selective test-only mocks
4. Existing nearby integration tests for the exact feature you are changing

Do not load all integration references by default. Most tasks only need one environment guide plus 1-2 nearby tests.

---

## Pick The Right Environment

### `ui/common/tests/integration/`

Use this when the code under test lives in `ui/common/` or the test is mainly validating shared hook / store / bridge behavior.

This environment splits into several real archetypes:

- builder-driven single-user hook flows
- state-seeded hook tests using `setupRemoteBridgeTests()`
- multi-user Matrix propagation tests
- direct bridge/client functional checks with little or no rendering

Then read `references/integration-common-patterns.md`.

### `ui/native/tests/integration/`

Use this when the subject lives in `ui/native/` and the test renders a native screen or native component against the real bridge.

Then read `references/integration-native-patterns.md`.

### `ui/web/tests/integration/`

Use this when the subject lives in `ui/web/` and the test renders a page or component in jsdom against the real bridge.

Then read `references/integration-web-patterns.md`.

---

## Decision Tree

### Common Environment

If the test is a shared hook or payment / federation flow with one user:

- Usually use `createIntegrationTestBuilder()`
- Usually use `renderHookWithBridge`
- Usually assert on hook state, selectors, or both

If the test mostly seeds store state and checks formatting / selector-like hook behavior:

- `setupRemoteBridgeTests()` may be a better fit than the builder
- Direct Redux dispatch into the store is common here

If the test is a Matrix room propagation or permissions flow:

- Use multiple builders, one per user
- `useObserveMatrixRoom(...)` is often used as a synchronizer, not the main subject under test
- Assert via selectors on each user's store

If the test is really a direct bridge / client functional check:

- Rendering may be minimal or absent
- Prefer the closest nearby example over a generic pattern

### Native Environment

If the subject is a native screen or feature component:

- Usually use `createIntegrationTestBuilder(waitFor)`
- Usually use `renderWithBridge`
- Usually query with `@testing-library/react-native`
- Screens often use `mockNavigation` / `mockRoute`, but not universally

### Web Environment

Web integration tests are currently small and fairly uniform:

- Usually use `createIntegrationTestBuilder()`
- Usually use `renderWithBridge`
- Use `@testing-library/react` plus `@testing-library/jest-dom`
- Mock router query only when the page behavior depends on URL state

---

## Real Canonical Examples

Open one of these after you choose the environment. Prefer the closest example to the task shape.

### Common

- Builder-driven hook flow: `ui/common/tests/integration/hooks/pay.test.ts`
- State-seeded hook flow: `ui/common/tests/integration/hooks/amount/useAmountInput.test.ts`
- Multi-user Matrix propagation: `ui/common/tests/integration/chat-messages.test.ts`
- Flake-aware multi-user flow: `ui/common/tests/integration/deleting-chat-messages.test.ts`
- Direct bridge/client check: `ui/common/tests/integration/matrix-chat-client.test.ts`

### Native

- Screen rendering with tabs / interaction: `ui/native/tests/integration/federations.test.tsx`
- Native component interaction: `ui/native/tests/integration/chat.test.tsx`
- Simple screen render without nav mocks: `ui/native/tests/integration/screens/EditProfileSettings.test.tsx`

### Web

- Router-driven onboarding flow: `ui/web/tests/integration/federations.test.tsx`
- Simple settings page render: `ui/web/tests/integration/pages/settings/edit-profile.test.tsx`

If there is a nearby existing integration test in the same folder as the feature you are changing, that local example beats the generic example list above.

---

## Universal Defaults

These are good defaults across integration environments, unless nearby tests clearly follow a different stable pattern:

- Integration tests use the real remote bridge, not `createMockFedimintBridge()`
- Tests depend on a running `devimint` environment and remote bridge server
- They run sequentially and use longer timeouts than unit tests
- `waitFor(...)` around eventual state is common across all environments
- Nearest local test style wins over generic guidance

---

## Prerequisites

Integration tests require:

- a running `devimint` environment
- the remote bridge server running on `localhost:26722` or `REMOTE_BRIDGE_PORT`
- sequential execution

Run commands:

```bash
# Run all integration tests
./scripts/ui/run-integration-tests.sh

# Run one workspace
./scripts/ui/run-integration-tests.sh common
./scripts/ui/run-integration-tests.sh native
./scripts/ui/run-integration-tests.sh web

# Run one file pattern in one workspace
./scripts/ui/run-integration-tests.sh web federations
```

---

## Core Helpers

### `createIntegrationTestBuilder(...)`

Defined in `ui/common/tests/utils/remote-bridge-setup.ts`.

Use when the test wants automatic remote bridge lifecycle plus builder-style state setup.

```typescript
const builder = createIntegrationTestBuilder()
const context = builder.getContext()
```

This is the shared integration entrypoint across environments. Native tests should use the native `waitFor` override described in `references/integration-native-patterns.md`.

### `renderWithBridge(...)`

Use for rendered page / screen / component integration tests:

```typescript
renderWithBridge(<MyComponent />, { store, fedimint })
```

This is the default rendered pattern in `ui/native` and `ui/web`, and appears occasionally in `ui/common`.

### Shared Builder States

`IntegrationTestBuilder` exposes a few core state builders used across the suites:

- `withOnboardingCompleted()`
- `withChatReady()`
- `withFederationJoined()`
- `withEcashReceived(amountMsats = 100000)`
- `withChatGroupCreated(groupName?, isPublic?, broadcastOnly?)`

Use the environment guide plus nearby tests to decide which state builder is the closest fit.

---

## Shared Builder Notes

### `withOnboardingCompleted()`

- base builder state
- completes onboarding and waits for Matrix auth

### `withChatReady()`

- calls `withOnboardingCompleted()` internally
- waits for usable Matrix auth and display name

### `withFederationJoined()`

- calls `withOnboardingCompleted()` internally
- joins the test federation via invite code

### `withEcashReceived(amountMsats = 100000)`

- calls `withFederationJoined()` internally
- receives ecash generated from the devimint environment

### `withChatGroupCreated(groupName?, isPublic?, broadcastOnly?)`

- calls `withChatReady()` internally
- creates a Matrix room
- returns the room id, not the builder

---

## Key Gotchas

### Mutable Context

`builder.getContext()` returns a mutable object populated in `beforeEach`.

Access `context.store` and `context.bridge` inside test bodies, not at module load time.

### `withChatGroupCreated()` Breaks The Chain

It returns `MatrixRoom['id']`, not the builder.

### Timeouts Are A Baseline, Not A Strict Rule

The configs default to `60000`, but real tests sometimes override per-test or per-`waitFor` timeouts. Match the nearest stable suite when a flow is known to be slower or flakier.

### Real Bridge First, Selective Mocks Only If Needed

Integration tests should stay bridge-backed by default. Selective mocks or spies are acceptable only when the main flow still depends on the real bridge and nearby tests already use that style.

---

## Important Exceptions

- Not every `ui/common` integration test uses `createIntegrationTestBuilder()`
- Not every integration test renders UI; some assert directly on bridge or store behavior
- Native screen tests often pass nav / route mocks, but some screens render without them
- Selective spies or fetch overrides are acceptable inside integration tests when the test still depends on the real bridge flow
- Some common integration suites are explicitly skipped today because of flakiness; do not treat every existing pattern as a universal rule

---

## Environment Differences From Unit Tests

| Aspect | Unit Tests | Integration Tests |
| ------ | ---------- | ----------------- |
| Bridge | mock bridge | real `RemoteBridge` |
| Setup | `preloadedState`, local mocks | running bridge + builder or remote bridge setup |
| Execution | usually parallel | sequential |
| Timeout profile | short | longer baseline |
| Common assertions | render behavior in isolation | eventual store / bridge / UI behavior against real state |

---

## File Naming

Integration test files live under `tests/integration/` and use:

- `.test.ts` for hooks or logic-heavy files
- `.test.tsx` for rendered screens / pages / components

---

## Related References

- `references/integration-common-patterns.md`
- `references/integration-native-patterns.md`
- `references/integration-web-patterns.md`
- `references/mock-builders.md`
- `references/unit-patterns.md`
