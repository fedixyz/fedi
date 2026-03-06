# Web Unit Test Patterns

Patterns for `ui/web/tests/unit/`.

---

## Environment Summary

- **Unit config**: `ui/web/tests/configs/jest.unit.config.js`
- **Setup file**: `ui/web/jest.setup.js`
- **Render helpers**: `ui/web/tests/utils/render.tsx`
- **Testing library**: `@testing-library/react`
- **Matchers**: `@testing-library/jest-dom`

The setup file already provides:

- `@testing-library/jest-dom`
- `configure({ asyncUtilTimeout: 60000 })`
- `global.fetch` override for `price-feed.dev.fedibtc.com`
- browser API mocks like `matchMedia`, `navigator.permissions`, `ResizeObserver`, `HTMLCanvasElement.getContext`
- Next router base mock via `mockUseRouter`
- global URL mocks and common app-level mocks

Do not re-mock these unless the test needs different behavior.

---

## The Most Important Distinction

Web unit tests in this repo split into two real families.

### 1. Provider-heavy tests

Use `renderWithProviders` or `renderHookWithProviders` when the subject needs:

- Redux state
- Fedimint bridge context
- app i18n
- page-level wiring
- app-specific providers

Examples:

- `ui/web/tests/unit/pages/home.test.tsx`
- `ui/web/tests/unit/components/SendOffline.test.tsx`
- `ui/web/tests/unit/hooks/browser.test.tsx`

### 2. Providerless tests

Use raw `render` or raw `renderHook` when the subject is a leaf component or standalone hook and does not need app wiring.

Examples:

- `ui/web/tests/unit/components/InstallBanner.test.tsx`
- `ui/web/tests/unit/components/TotalBalance.test.tsx`
- `ui/web/tests/unit/hooks/media.test.tsx`
- `ui/web/tests/unit/components/Chat/ChatFederationInvite.test.tsx`

Do not force provider helpers into providerless tests. That is not how much of the real suite is written.

---

## Provider-Heavy Patterns

### Pages and stateful components

Real example: `ui/web/tests/unit/pages/home.test.tsx`

```typescript
import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import HomePage from '../../../src/pages/home'
import { renderWithProviders } from '../../utils/render'

describe('/pages/home', () => {
    it('should render the install banner component', () => {
        renderWithProviders(<HomePage />)

        expect(screen.getByLabelText('Install Banner')).toBeInTheDocument()
    })
})
```

Preloaded state is common here:

```typescript
renderWithProviders(<HomePage />, {
    preloadedState: {
        federation: {
            ...state.federation,
            communities: [mockCommunity],
        },
    },
})
```

### Hooks with providers

Real example: `ui/web/tests/unit/hooks/browser.test.tsx`

```typescript
import '@testing-library/jest-dom'
import { waitFor } from '@testing-library/react'

import { useIFrameListener } from '../../../src/hooks/browser'
import { renderHookWithProviders } from '../../utils/render'

describe('/hooks/browser', () => {
    it('should dispatch decoded invoice', async () => {
        renderHookWithProviders(() => useIFrameListener(iframeRef))

        window.dispatchEvent(
            new MessageEvent('message', {
                data: {
                    event: InjectionMessageType.webln_sendPayment,
                    payload: 'lnbc123',
                },
            }),
        )

        await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalled()
        })
    })
})
```

### Components with fake timers and mock bridge

Real example: `ui/web/tests/unit/components/SendOffline.test.tsx`

```typescript
import '@testing-library/jest-dom'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import { SendOffline } from '../../../src/components/Send/SendOffline'
import { renderWithProviders } from '../../utils/render'

describe('SendOffline', () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    beforeEach(() => {
        jest.useFakeTimers()
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render the send button', async () => {
        renderWithProviders(<SendOffline federationId="test-federation-id" />, {
            fedimint: createMockFedimintBridge(),
        })

        await waitFor(() => {
            expect(screen.getByText('Send')).toBeInTheDocument()
        })
    })
})
```

---

## Providerless Patterns

### Providerless component test

Real example: `ui/web/tests/unit/components/InstallBanner.test.tsx`

```typescript
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { InstallBanner } from '../../../src/components/InstallBanner/index'

describe('/components/InstallBanner', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should display text values', () => {
        render(<InstallBanner {...commonProps} />)

        expect(screen.getByText(commonProps.title)).toBeInTheDocument()
        expect(screen.getByText(commonProps.description)).toBeInTheDocument()
    })
})
```

### Providerless hook test

Real example: `ui/web/tests/unit/hooks/media.test.tsx`

```typescript
import '@testing-library/jest-dom'
import { renderHook, waitFor } from '@testing-library/react'

import { useLoadMedia } from '../../../src/hooks/media'

describe('/hooks/media', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should handle string result from readBridgeFile', async () => {
        const { result } = renderHook(() => useLoadMedia(mockEvent))

        await waitFor(() => {
            expect(result.current.src).toBe('/test-url')
        })
    })
})
```

### DOM interaction tests with raw `render`

The invite dialog tests use raw `render` plus local hook mocks instead of providers.

Real examples:

- `ui/web/tests/unit/components/Chat/ChatFederationInvite.test.tsx`
- `ui/web/tests/unit/components/Chat/ChatCommunityInvite.test.tsx`

---

## Render Helpers

From `ui/web/tests/utils/render.tsx`:

```typescript
function renderWithProviders(
    ui: React.ReactElement,
    options?: {
        preloadedState?: Partial<RootState>
        store?: ReturnType<typeof setupStore>
        fedimint?: FedimintBridge
    },
): { store, ...RenderResult }

function renderHookWithProviders<Result, Props>(
    hook: (initialProps: Props) => Result,
    options?: {
        preloadedState?: Partial<RootState>
        store?: ReturnType<typeof setupStore>
        fedimint?: FedimintBridge
    },
): { store, ...RenderHookResult }
```

Use these when the test actually needs the wrapper. They are not mandatory for every web unit test.

---

## Queries And Assertions

Web tests prefer DOM-oriented queries and matchers:

- `screen.getByRole(...)`
- `screen.getByLabelText(...)`
- `screen.getByText(...)`
- `screen.findByRole(...)`
- `expect(...).toBeInTheDocument()`
- `expect(...).toHaveTextContent(...)`

Examples from real tests:

```typescript
expect(
    screen.getByRole('button', {
        name: i18n.t('words.join'),
    }),
).toBeInTheDocument()
```

```typescript
expect(screen.getByLabelText('Install Banner')).toBeInTheDocument()
```

Use accessibility-oriented queries first when they read naturally.

---

## Interaction Style

Both of these are used in the current web suite:

### `userEvent`

Preferred for realistic typing and click flows.

```typescript
import userEvent from '@testing-library/user-event'

const user = userEvent.setup()
await user.click(screen.getByRole('button', { name: 'Send' }))
await user.type(screen.getByLabelText(/display name/i), 'alice')
```

### `fireEvent`

Also common and acceptable for simpler DOM interactions, especially in dialog and local component tests.

```typescript
import { fireEvent } from '@testing-library/react'

fireEvent.click(screen.getByRole('button', { name: i18n.t('words.join') }))
```

Do not “correct” an existing nearby suite from `fireEvent` to `userEvent` unless there is a specific reason.

---

## Store Setup And Lifecycle Notes

Safe default:

- create a fresh store in `beforeEach`
- use `preloadedState` for test-specific state

But some real web tests intentionally reuse a store or state snapshot from `beforeAll`, including:

- `ui/web/tests/unit/pages/home.test.tsx`
- `ui/web/tests/unit/hooks/browser.test.tsx`
- `ui/web/tests/unit/pages/share-logs.test.tsx`

Treat `beforeEach` as a default, not a rule stronger than nearby tests.

---

## Cleanup Notes

Unlike native tests, explicit `cleanup()` is not a universal web convention here.

- Some web tests call `cleanup()` explicitly, for example `ui/web/tests/unit/components/SendOffline.test.tsx`
- Many providerless tests do not, and rely on the standard test environment cleanup behavior

Do not add `cleanup()` everywhere just because native tests do.

---

## Mocking Guidance

Common web styles include:

- local `jest.mock(...)` for hooks and modules
- `jest.spyOn(...)` for browser APIs or exported hooks
- app-level setup mocks from `ui/web/jest.setup.js`

Examples:

- `jest.spyOn(window, 'open')` in `ui/web/tests/unit/components/MobileAppDownloadBanner.test.tsx`
- `jest.spyOn(browserHooks, 'useIFrameListener')` in `ui/web/tests/unit/components/FediBrowser/index.test.tsx`
- local hook mocks in `ui/web/tests/unit/components/Chat/ChatFederationInvite.test.tsx`

For mock factories and Fedimint bridge usage, read `references/mock-builders.md`.

---

## Canonical Files To Copy From

- Provider-heavy page with preloaded state: `ui/web/tests/unit/pages/home.test.tsx`
- Provider-heavy component with fake timers and bridge: `ui/web/tests/unit/components/SendOffline.test.tsx`
- Provider-heavy hook with browser events: `ui/web/tests/unit/hooks/browser.test.tsx`
- Providerless component: `ui/web/tests/unit/components/InstallBanner.test.tsx`
- Providerless hook: `ui/web/tests/unit/hooks/media.test.tsx`
- Dialog and `fireEvent` DOM flow: `ui/web/tests/unit/components/Chat/ChatFederationInvite.test.tsx`

Prefer a nearby file in the same folder when one already exists.
