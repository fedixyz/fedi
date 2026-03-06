# Common Integration Test Patterns

Patterns for `ui/common/tests/integration/`.

---

## Environment Summary

- **Config**: `ui/common/tests/configs/jest.integration.config.js`
- **Environment**: `ui/common/tests/environment.ts`
- **Setup file**: `ui/common/tests/utils/setup.ts`
- **Bridge setup**: `ui/common/tests/utils/remote-bridge-setup.ts`
- **Render helpers**: `ui/common/tests/utils/render.ts`
- **Testing library**: `@testing-library/react`

`ui/common` integration tests use a real `RemoteBridge`, real Redux store wiring, and a custom hybrid environment so hooks can render while bridge code still uses Node APIs.

---

## The Most Important Distinction

`ui/common/tests/integration/` is not one pattern. It splits into several real families.

### 1. Builder-driven single-user flows

Use this when the test exercises a shared hook or shared flow against real bridge state:

- payments
- federation join / receive flows
- room creation
- hooks that need onboarding, federation, ecash, or chat state

Default shape:

- `const builder = createIntegrationTestBuilder()`
- `const context = builder.getContext()`
- use a state builder like `withFederationJoined()` or `withEcashReceived()`
- render with `renderHookWithBridge(...)`
- assert on hook state, selectors, or both

Canonical examples:

- `ui/common/tests/integration/hooks/pay.test.ts`
- `ui/common/tests/integration/hooks/receive.test.ts`
- `ui/common/tests/integration/hooks/useCreateMatrixRoom.test.ts`

### 2. State-seeded hook tests

Use this when the subject is still an integration test, but the setup is mostly store seeding rather than builder-driven state transitions.

This pattern is common for shared amount / formatting hooks:

- use `setupRemoteBridgeTests()`
- dispatch Redux actions directly into the store
- render with `renderHookWithBridge(...)`
- assert synchronously or with short `waitFor(...)`

Canonical examples:

- `ui/common/tests/integration/hooks/amount/useAmountInput.test.ts`
- `ui/common/tests/integration/hooks/amount/useAmountFormatter.test.ts`
- `ui/common/tests/integration/hooks/amount/useBtcFiatPrice.test.ts`

### 3. Multi-user Matrix propagation tests

Use this when correctness depends on multiple users observing shared room state.

Default shape:

- create one builder per user
- call `withChatReady()` on each user
- create / join / invite via one user's store
- use `useObserveMatrixRoom(...)` to make remote timeline updates land in Redux
- assert via selectors on each user's store

Canonical examples:

- `ui/common/tests/integration/chat-messages.test.ts`
- `ui/common/tests/integration/deleting-chat-messages.test.ts`
- `ui/common/tests/integration/media-upload-permissions.test.ts`

### 4. Direct bridge / client functional checks

Use this when the test is really validating bridge-backed behavior with little or no rendered hook/UI shell.

Canonical examples:

- `ui/common/tests/integration/matrix-chat-client.test.ts`
- `ui/common/tests/integration/utils/parser.test.ts`

---

## Common Defaults

### Setup

For builder-driven tests, this is the default entrypoint:

```typescript
const builder = createIntegrationTestBuilder()
const context = builder.getContext()
```

For state-seeded hook tests, this is the real alternative:

```typescript
const context = setupRemoteBridgeTests()
```

Do not assume the builder is mandatory in `ui/common`. The real suite uses both.

### Rendering

The most common helper is:

```typescript
renderHookWithBridge(() => useMyHook(), store, fedimint)
```

`renderWithBridge(...)` exists, but in `ui/common` the dominant pattern is hook-and-store integration, not UI rendering.

### Assertions

Common integration tests usually assert one or more of:

- hook return values
- Redux selectors
- bridge-backed side effects reflected in store state
- room timelines or membership lists after propagation

For chat tests, selector assertions are often the primary source of truth.

---

## Common Archetypes To Copy

### Single-user hook flow

Use when the hook consumes real bridge state and the builder can create the needed world state quickly.

Closest examples:

- `ui/common/tests/integration/hooks/pay.test.ts`
- `ui/common/tests/integration/hooks/receive.test.ts`

### Store-seeded hook flow

Use when the test is mostly about how a hook reacts to already-known state.

Closest examples:

- `ui/common/tests/integration/hooks/amount/useAmountInput.test.ts`
- `ui/common/tests/integration/hooks/amount/useAmountFormatter.test.ts`

### Multi-user propagation

Use when the main challenge is eventual consistency across users rather than single-hook logic.

Closest examples:

- `ui/common/tests/integration/chat-messages.test.ts`
- `ui/common/tests/integration/deleting-chat-messages.test.ts`

### Direct bridge / client

Use when rendering adds little value and the bridge or client API is the real subject.

Closest examples:

- `ui/common/tests/integration/matrix-chat-client.test.ts`
- `ui/common/tests/integration/utils/parser.test.ts`

---

## Common Exceptions

- `act(...)` is a strong preference for state-changing operations, but the existing suite is not perfectly consistent
- selective mocks and spies are sometimes used inside real integration tests
- some suites serialize operations intentionally to reduce flakiness
- some Matrix-related suites are skipped today; treat nearby stable files as higher-signal examples than skipped ones

Examples worth checking for those cases:

- selective `fetch` interception: `ui/common/tests/integration/hooks/survey.test.ts`
- selective spy on Redux helper: `ui/common/tests/integration/hooks/chat/useAcceptForeignEcash.test.ts`
- flake-aware sequencing: `ui/common/tests/integration/deleting-chat-messages.test.ts`

---

## Canonical Files To Copy From

- Payments / ecash: `ui/common/tests/integration/hooks/pay.test.ts`
- Amount / formatting hooks: `ui/common/tests/integration/hooks/amount/useAmountInput.test.ts`
- Matrix room creation: `ui/common/tests/integration/hooks/useCreateMatrixRoom.test.ts`
- Multi-user chat propagation: `ui/common/tests/integration/chat-messages.test.ts`
- Direct bridge/client behavior: `ui/common/tests/integration/matrix-chat-client.test.ts`

For shared builder details, commands, and cross-environment gotchas, pair this guide with `references/integration-patterns.md`.
