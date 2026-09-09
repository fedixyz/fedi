# Changing the shared test harness

Read this before you edit `tests/setup/jest.setup.mocks.ts`, `tests/utils/render.tsx`, `tests/utils/fedimint.ts`, or a jest config. Every test in that workspace consumes them, so a change here is a change to tests you have not read.

The rest of this skill treats those files as things to read. This one is about editing them.

## First ask whether you need to

A file-local `jest.mock(...)` or a feature-scoped helper almost always does the job. Reach for the shared harness only when the thing you need genuinely belongs to every test in the workspace.

## Never add a default answer to `createMockFedimintBridge`

Only the methods a test names exist on the mock bridge. That is the contract, and it is what makes a missing mock fail loudly instead of returning an empty success.

A default in the shared factory answers for every test in the repo, including the ones that meant to assert on that call. A screen that lists transactions, rendered against a bridge with a `listTransactions` default, sees an empty list and passes, and nobody finds out until production.

If your screens call an RPC on mount that your test is not about, name it in each test with a neutral value, or export a feature-scoped wrapper:

```ts
// ui/common/tests/mock-data/walletservice.ts
export const createMockWalletServiceBridge = (
    overrides: Partial<Record<keyof RpcMethods, unknown>> = {},
) =>
    createMockFedimintBridge({
        fiClientSetupPaymentFederations: () =>
            Promise.resolve({ type: 'federations', federations: [] }),
        ...overrides,
    })
```

The wrapper names which tests get the default and which do not.

## Adding is fine, changing behaviour is not

A new mock or a new driver costs nothing to tests that do not use it. Changing what an existing one returns costs every test that does.

`useSharedValue` returning `{ value }` instead of `undefined` is a behaviour change for every animated component in the suite. Before you make one, run the whole workspace suite, make the change, run it again, and say in the pull request what moved.

## Keep the configs in step

`jest.unit.config.js` and `jest.integration.config.js` in the same workspace must resolve modules the same way. When only one of them maps `@fedi/common` to a sibling directory, unit and integration tests in a git worktree are testing two different checkouts of the shared code and neither of them tells you.

A config change applies to every config in the workspace or to none.

## Update the inventory in the same change

`references/unit-native-patterns.md` has a section listing what the native setup already mocks, and it exists so the next author does not hand-roll something that is already there. When you add to `jest.setup.mocks.ts`, add it to that list in the same change. A stale entry is worse than a missing one, because it tells the reader to skip work they still have to do.

The same applies to the builder method list in `references/mock-builders.md` and the shared builder states in `references/integration-patterns.md`.
