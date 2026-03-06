# Common Unit Test Patterns

Patterns for `ui/common/tests/unit/`.

---

## Environment Summary

- **Config**: `ui/common/jest.config.js`
- **Environment**: `node`
- **Setup file**: `ui/common/tests/utils/setup.ts`
- **Render helpers**: `ui/common/tests/utils/render.ts`
- **Testing library**: `@testing-library/react`

`ui/common` is where shared hooks, utilities, reducers, selectors, and non-platform UI logic usually belong.

---

## Common Test Shapes

### Pure utility tests

This is the cheapest and most common pattern. No providers needed.

```typescript
import amountUtils from '../../../utils/AmountUtils'

describe('AmountUtils', () => {
    describe('msatToSat', () => {
        it('should convert millisats to sats', () => {
            expect(amountUtils.msatToSat(10000 as MSats)).toEqual(10)
        })
    })
})
```

### Shared hook tests with state

Use `renderHookWithState` when the hook depends on Redux store or Fedimint context.

```typescript
import { waitFor } from '@testing-library/react'

import { setupStore } from '../../../redux'
import { renderHookWithState } from '../../utils/render'

describe('common/hooks/someHook', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        store = setupStore()
        jest.clearAllMocks()
    })

    it('should return expected value', async () => {
        const { result } = renderHookWithState(() => useSomeHook(), store)

        await waitFor(() => {
            expect(result.current.someValue).toBe('expected')
        })
    })
})
```

### Standalone hook tests

If the hook does not need Redux, Fedimint, or i18n context, raw `renderHook` is often enough.

---

## Render Helpers

From `ui/common/tests/utils/render.ts`:

```typescript
function renderHookWithState<T>(
    hook: () => T,
    store?: ReturnType<typeof setupStore>,
    fedimint?: FedimintBridge,
): { result, store, ... }
```

Use it when the hook actually needs shared app context.

---

## Setup Utilities

`ui/common/tests/utils/setup.ts` provides useful shared helpers such as `createMockT()`.

Example:

```typescript
import { createMockT } from '../../utils/setup'

const t = createMockT()
expect(t('words.hello')).toBe('words.hello')
```

The setup file also provides shared test defaults like logging mocks and locale helpers.

---

## Remote Bridge Mocking

For common utility tests that import `fedimint` from `@fedi/common/utils/remote-bridge`, use a file-local module mock.

```typescript
jest.mock('../../../utils/remote-bridge', () => ({
    fedimint: {
        rpcResult: jest.fn(),
    },
}))
```

For higher-level bridge mock factories, read `references/mock-builders.md`.

---

## Common Conventions

- `jest.clearAllMocks()` in `beforeEach`
- prefer simple direct assertions for pure utilities
- use table-driven `forEach` cases when it improves coverage density
- keep utility tests providerless unless context is genuinely required
- use behavioral hook assertions, not internal implementation assertions

---

## Canonical Files To Copy From

- Utility tests: find a nearby file in `ui/common/tests/unit/utils/`
- Hook tests with store: find a nearby file in `ui/common/tests/unit/hooks/`
- Redux logic tests: find a nearby file in `ui/common/tests/unit/redux/`

For shared mock factories, pair this guide with `references/mock-builders.md`.
