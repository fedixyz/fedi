# Native Unit Test Patterns

Patterns for `ui/native/tests/unit/`.

---

## Environment Summary

- **Config**: `ui/native/tests/configs/jest.unit.config.js`
- **Preset**: `react-native`
- **Setup file**: `ui/native/tests/setup/jest.setup.mocks.ts`
- **Render helpers**: `ui/native/tests/utils/render.tsx`
- **Testing library**: `@testing-library/react-native`

The native setup file already provides many mocks. Prefer those defaults before adding new `jest.mock(...)` calls in the test file.

---

## Most Common Native Shapes

### Screen / feature component tests

- Use `renderWithProviders`
- Import queries from `@testing-library/react-native`
- Usually call `cleanup()` in `afterEach`
- Usually pass `mockNavigation as any` and `mockRoute as any`

Real example: `ui/native/tests/unit/screens/ShareLogs.test.tsx`

```typescript
import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import i18n from '@fedi/native/localization/i18n'

import ShareLogs from '../../../screens/ShareLogs'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('ShareLogs screen', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render a text field and submit button on screen', async () => {
        renderWithProviders(
            <ShareLogs
                navigation={mockNavigation as any}
                route={mockRoute as any}
            />,
        )

        expect(
            screen.getByPlaceholderText(
                i18n.t('feature.support.support-ticket-number'),
            ),
        ).toBeOnTheScreen()
    })
})
```

### Native hook tests with providers

Use `renderHookWithProviders` when the hook depends on store, Fedimint, i18n, or RN wiring.

Real example: `ui/native/tests/unit/hooks/media.test.ts`

```typescript
import { act, waitFor } from '@testing-library/react-native'

import { setupStore } from '@fedi/common/redux'

import { useDownloadResource } from '../../../utils/hooks/media'
import { renderHookWithProviders } from '../../utils/render'

describe('useDownloadResource', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
    })

    it('should initialize with correct default values', () => {
        const { result } = renderHookWithProviders(
            () => useDownloadResource(null, { loadResourceInitially: false }),
            { store },
        )

        expect('isLoading' in result.current).toBeTruthy()
    })

    it('should run async actions', async () => {
        const { result } = renderHookWithProviders(
            () => useDownloadResource('https://example.com/test.png'),
            { store },
        )

        await act(async () => {
            await result.current.handleDownload()
        })

        await waitFor(() => {
            expect(result.current.uri).toBeTruthy()
        })
    })
})
```

### Simple native component rendering

For leaf native components that still need the standard wrapper, use `renderWithProviders` and keep the test small.

Real example: `ui/native/tests/unit/components/feature/transaction-history/TransactionsList.test.tsx`

---

## Render Helpers

From `ui/native/tests/utils/render.tsx`:

```typescript
function renderWithProviders(
    ui: React.ReactElement,
    options?: {
        preloadedState?: Partial<AppState>
        store?: ReturnType<typeof setupStore>
        fedimint?: FedimintBridge
    },
): { store, ...RenderResult }

function renderHookWithProviders<T>(
    hook: () => T,
    options?: {
        preloadedState?: Partial<AppState>
        store?: ReturnType<typeof setupStore>
        fedimint?: FedimintBridge
    },
): { result, store, ... }
```

Use these as the default entrypoints for native component and hook tests.

---

## Navigation And Route Mocks

Most screen tests use the setup mocks:

```typescript
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'

renderWithProviders(
    <MyScreen
        navigation={mockNavigation as any}
        route={mockRoute as any}
    />,
)
```

If the screen needs route params, pass a route-shaped object:

```typescript
route={{ params: { federationId: '1' } } as any}
```

Spying on the setup mocks is common:

```typescript
const navigateSpy = jest.spyOn(mockNavigation, 'navigate')
```

That appears in tests like:

- `ui/native/tests/unit/screens/StartRecoveryAssist.test.tsx`
- `ui/native/tests/unit/screens/RecordBackupVideo.test.tsx`
- `ui/native/tests/unit/screens/StartSocialBackup.test.tsx`

---

## Queries And Matchers

Native tests commonly assert with:

- `screen.getByText(...)`
- `screen.findByText(...)`
- `screen.getByTestId(...)`
- `screen.findAllByTestId(...)`
- `expect(element).toBeOnTheScreen()`

Example:

```typescript
const items = await screen.findAllByTestId('transaction-item')
expect(items).toHaveLength(2)
```

Use `i18n.t(...)` for translated strings when practical:

```typescript
expect(screen.getByText(i18n.t('words.continue'))).toBeOnTheScreen()
```

---

## User Interaction

Prefer `userEvent` for presses and typed interaction:

```typescript
import { userEvent } from '@testing-library/react-native'

const user = userEvent.setup()
await user.press(screen.getByText(i18n.t('words.continue')))
```

---

## Store And Fedimint Setup

When the screen or hook needs state or bridge responses:

```typescript
import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

const store = setupStore()
const fedimint = createMockFedimintBridge({
    calculateMaxGenerateEcash: Promise.resolve(5_000_000 as MSats),
})

renderWithProviders(<MyScreen />, {
    store,
    fedimint,
})
```

Typical setup:

- create store in `beforeEach`
- preload state through dispatches or `preloadedState`
- pass a custom bridge only when the default bridge is not enough

For full builder details, read `references/mock-builders.md`.

---

## What The Native Setup Already Mocks

`ui/native/tests/setup/jest.setup.mocks.ts` already gives you:

- `mockNavigation`
- `mockRoute`
- `mockTheme`
- `I18nProvider`
- `global.fetch` override for `price-feed.dev.fedibtc.com`
- many RN module mocks, including navigation, filesystem, permissions, camera roll, image picker, reanimated, safe area, and others

Do not re-mock these unless the test needs behavior different from the default.

---

## Common Native Conventions

These are strong conventions in the current native suite:

- `jest.clearAllMocks()` in `beforeEach`
- `cleanup()` in `afterEach` for rendered component and screen tests
- use `renderWithProviders` instead of raw `render`
- use `renderHookWithProviders` for hooks that need context
- prefer behavioral test names with `should ...`

Exceptions:

- a fresh store in `beforeEach` is preferred, but `ui/native/tests/unit/screens/ShareLogs.test.tsx` and `ui/native/tests/unit/utils/media.test.ts` both use `beforeAll` for some setup

Match the local file style when extending an existing suite.

---

## Canonical Files To Copy From

- Screen with state and interactions: `ui/native/tests/unit/screens/ShareLogs.test.tsx`
- Hook with providers and async actions: `ui/native/tests/unit/hooks/media.test.ts`
- Simple component list assertions: `ui/native/tests/unit/components/feature/transaction-history/TransactionsList.test.tsx`
- Navigation spy usage: `ui/native/tests/unit/screens/StartRecoveryAssist.test.tsx`
- Permission-hook spy usage: `ui/native/tests/unit/screens/StartSocialBackup.test.tsx`

If your feature already has nearby tests in the same folder, prefer those over the generic examples above.
