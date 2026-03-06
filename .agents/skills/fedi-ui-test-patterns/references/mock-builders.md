# Mock Data Builders Reference

All mock data builders available for writing unit and integration tests in the Fedi codebase.

---

## 1. Mock Bridge (`createMockFedimintBridge`)

**File:** `ui/common/tests/utils/fedimint.ts`

Creates a Jest-mocked `FedimintBridge` instance. The mock supports both `rpcResult`-based calls (used by Redux thunks and utility functions) and direct method calls (used by hooks and components).

```ts
import { createMockFedimintBridge, MockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
```

### Signature

```ts
export const createMockFedimintBridge = (
    methods: Partial<Record<keyof RpcMethods, unknown>> = {},
): jest.Mocked<FedimintBridge>

export type MockFedimintBridge = ReturnType<typeof createMockFedimintBridge>
```

### How it works

- Creates a mock object with `rpc`, `rpcTyped`, `rpcResult`, and `addListener` as jest mocks.
- `rpcResult(method)` returns `okAsync(methods[method])` if the method key exists in the `methods` map, otherwise `okAsync(undefined)`.
- Each key in `methods` is also set as a direct property on the bridge: `mockBridge[key] = jest.fn(() => value)`.
- `addListener` returns a no-op unsubscribe function.

### Usage patterns

**Empty bridge (no RPC responses needed):**
```ts
const mockFedimint = createMockFedimintBridge()
```

**Bridge with specific RPC responses:**
```ts
const mockFedimint = createMockFedimintBridge({
    getTransaction: createMockTransaction(),
    calculateMaxGenerateEcash: Promise.resolve(1_999_000 as MSats),
})
```

**Bridge with a failing RPC (for error handling tests):**
```ts
import { BridgeError } from '@fedi/common/utils/errors'

const mockFedimint = createMockFedimintBridge({
    calculateMaxGenerateEcash: Promise.reject(
        new BridgeError({
            error: 'error',
            detail: 'error',
            errorCode: 'badRequest',
        }),
    ),
})
```

**Overriding a method after creation:**
```ts
const mockFedimint = createMockFedimintBridge()
mockFedimint.onAppForeground = jest.fn()
```

### Key RPC method names (commonly mocked)

These are keys of `RpcMethods` from `@fedi/common/types/bindings`:

| Key | Return type | Description |
|-----|-------------|-------------|
| `getTransaction` | `RpcTransaction` | Fetch a single transaction |
| `listTransactions` | `Array<{ Ok: RpcTransactionListEntry } \| { Err: string }>` | List all transactions |
| `calculateMaxGenerateEcash` | `RpcAmount` | Max ecash amount |
| `generateInvoice` | `string` | LN invoice string |
| `payInvoice` | `RpcPayInvoiceResponse` | Pay result with preimage |
| `federationPreview` | `RpcFederationPreview` | Federation preview data |
| `listFederations` | `Array<RpcFederationMaybeLoading>` | All joined federations |
| `signLnurlMessage` | `RpcSignedLnurlMessage` | LNURL auth signature |
| `bridgeStatus` | `RpcBridgeStatus` | Current bridge state |
| `matrixGetAccountSession` | `RpcMatrixAccountSession` | Matrix auth session |

---

## 2. Transaction Builders

### 2a. `createMockTransaction`

**File:** `ui/common/tests/mock-data/transactions.ts`

Creates a basic `TransactionListEntry` (an `lnReceive` transaction with `claimed` state). Accepts any overrides.

```ts
import { createMockTransaction } from '@fedi/common/tests/mock-data/transactions'
```

**Signature:**
```ts
export const createMockTransaction = (
    overrides: any = {},
): TransactionListEntry
```

**Default values:**
```ts
{
    id: 'tx123',
    amount: 1000000 as MSats,
    fediFeeStatus: null,
    txnNotes: 'test',
    txDateFiatInfo: null,
    frontendMetadata: {
        initialNotes: null,
        recipientMatrixId: null,
        senderMatrixId: null,
    },
    outcomeTime: Date.now(),
    kind: 'lnReceive',
    ln_invoice: 'lnbc123',
    state: { type: 'claimed' },
}
```

**Usage:**
```ts
const txn = createMockTransaction()
const customTxn = createMockTransaction({ amount: 5000000 as MSats, txnNotes: 'custom' })
```

### 2b. `createMockTransactionListEntry`

**File:** `ui/common/tests/mock-data/transactions.ts`

Same as `createMockTransaction` but adds a `createdAt` timestamp (seconds). Returns `RpcTransactionListEntry`.

```ts
import { createMockTransactionListEntry } from '@fedi/common/tests/mock-data/transactions'
```

**Signature:**
```ts
export const createMockTransactionListEntry = (
    overrides: any = {},
): RpcTransactionListEntry
```

### 2c. `makeTestTxnEntry` (recommended for detailed transaction tests)

**File:** `ui/common/tests/utils/transaction.ts`

Creates a fully-typed `TransactionListEntry` for any transaction kind. Includes proper `CommonTxnFields` defaults and kind-specific fields. This is the primary builder for transaction-related tests.

```ts
import { makeTestTxnEntry } from '@fedi/common/tests/utils/transaction'
```

**Signature:**
```ts
export function makeTestTxnEntry<T extends TransactionListEntry['kind']>(
    kind: T,
    overrides: Partial<Extract<TransactionListEntry, { kind: T }>> = {},
): TransactionListEntry
```

**Supported kinds:**
`'lnPay'` | `'lnReceive'` | `'lnRecurringdReceive'` | `'onchainWithdraw'` | `'onchainDeposit'` | `'oobSend'` | `'oobReceive'` | `'spDeposit'` | `'spWithdraw'` | `'sPV2Deposit'` | `'sPV2Withdrawal'` | `'sPV2TransferOut'` | `'sPV2TransferIn'` | `'multispendDeposit'` | `'multispendWithdrawal'`

**Base fields (all kinds):**
```ts
{
    createdAt: 0,
    id: 'test-txid',
    amount: 0 as MSats,
    fediFeeStatus: null,
    txnNotes: null,
    txDateFiatInfo: null,
    frontendMetadata: { initialNotes: null, recipientMatrixId: null, senderMatrixId: null },
    outcomeTime: null,
}
```

**Usage:**
```ts
// Simple - uses default state
const lnPay = makeTestTxnEntry('lnPay')

// With specific state
const lnPaySuccess = makeTestTxnEntry('lnPay', {
    state: makeTestLnPayState('success'),
})

// With state and other overrides
const lnReceive = makeTestTxnEntry('lnReceive', {
    state: makeTestLnReceiveState('claimed'),
    amount: 5000 as MSats,
    txnNotes: 'payment for coffee',
})

// Multispend transaction with event data
const deposit = makeTestTxnEntry('multispendDeposit', {
    state: makeTestMultispendDepositEventData(100, 'description'),
    time: 1677721600,
}) as MultispendTransactionListEntry
```

### 2d. Transaction State Builders

**File:** `ui/common/tests/utils/transaction.ts`

Each builder creates a properly-typed state object for a specific transaction kind. They accept a `type` discriminant and return the corresponding state variant.

```ts
import {
    makeTestLnPayState,
    makeTestLnReceiveState,
    makeTestOnchainWithdrawState,
    makeTestOnchainDepositState,
    makeTestOOBSpendState,
    makeTestOOBReissueState,
    makeTestSPDepositState,
    makeTestSPWithdrawalState,
    makeTestSPV2DepositState,
    makeTestSPV2WithdrawalState,
    makeTestSPV2TransferOutState,
    makeTestSPV2TransferInState,
} from '@fedi/common/tests/utils/transaction'
```

**Signatures and type variants:**

```ts
// Lightning pay states
makeTestLnPayState(type: 'created' | 'funded' | 'waitingForRefund' | 'refunded' | 'success'): RpcLnPayState

// Lightning receive states
makeTestLnReceiveState(type: 'created' | 'waitingForPayment' | 'canceled' | 'claimed'): RpcLnReceiveState

// Onchain withdraw states
makeTestOnchainWithdrawState(type: 'created' | 'succeeded' | 'failed'): RpcOnchainWithdrawState

// Onchain deposit states
makeTestOnchainDepositState(type: 'waitingForTransaction' | 'waitingForConfirmation' | 'confirmed' | 'claimed' | 'failed'): RpcOnchainDepositState

// OOB (ecash) spend states
makeTestOOBSpendState(type: 'created' | 'success' | 'userCanceledFailure' | 'userCanceledProcessing' | 'refunded'): RpcOOBSpendState

// OOB (ecash) reissue/receive states
makeTestOOBReissueState(type: 'created' | 'issuing' | 'done' | 'failed'): RpcOOBReissueState

// Stability pool v1 deposit states (accepts overrides)
makeTestSPDepositState(type: 'pendingDeposit' | 'completeDeposit', overrides?): RpcSPDepositState

// Stability pool v1 withdrawal states
makeTestSPWithdrawalState(type: 'pendingWithdrawal' | 'completeWithdrawal'): RpcSPWithdrawState

// Stability pool v2 deposit states (accepts overrides)
makeTestSPV2DepositState(type: 'pendingDeposit' | 'completedDeposit' | 'failedDeposit' | 'dataNotInCache', overrides?): RpcSPV2DepositState

// Stability pool v2 withdrawal states
makeTestSPV2WithdrawalState(type: 'pendingWithdrawal' | 'completedWithdrawal' | 'failedWithdrawal' | 'dataNotInCache'): RpcSPV2WithdrawalState

// Stability pool v2 transfer out states (requires kind)
makeTestSPV2TransferOutState(type: 'completedTransfer' | 'dataNotInCache', kind: SpV2TransferOutKind): RpcSPV2TransferOutState
// SpV2TransferOutKind = 'spTransferUi' | 'multispend'

// Stability pool v2 transfer in states (requires kind)
makeTestSPV2TransferInState(type: 'completedTransfer' | 'dataNotInCache', kind: SpV2TransferInKind): RpcSPV2TransferInState
// SpV2TransferInKind = 'multispend'
```

### 2e. Multispend Event Builders

**File:** `ui/common/tests/utils/transaction.ts`

```ts
import {
    makeTestMultispendDepositEventData,
    makeTestMultispendWithdrawalEventData,
    makeTestDepositEventData,
    makeTestWithdrawRequestWithApprovals,
    makeTestGroupInvitationWithKeys,
    makeTestFediFeeStatus,
} from '@fedi/common/tests/utils/transaction'
```

**Signatures:**
```ts
// Full MultispendDepositEvent (for use as `state` in makeTestTxnEntry('multispendDeposit'))
makeTestMultispendDepositEventData(fiatAmount?: number, description?: string): MultispendDepositEvent

// Full MultispendWithdrawalEvent (for use as `state` in makeTestTxnEntry('multispendWithdrawal'))
makeTestMultispendWithdrawalEventData(status: 'accepted' | 'rejected' | 'unknown'): MultispendWithdrawalEvent

// Raw deposit event data (not the full event)
makeTestDepositEventData(): MultispendDepositEventData

// Withdrawal request with approval status
makeTestWithdrawRequestWithApprovals(status: 'accepted' | 'rejected' | 'unknown'): WithdrawRequestWithApprovals

// Group invitation with keys
makeTestGroupInvitationWithKeys(): GroupInvitationWithKeys

// Fee status builder
makeTestFediFeeStatus(type: 'pendingSend' | 'pendingReceive' | 'success' | 'failedSend' | 'failedReceive', fee?: number): RpcOperationFediFeeStatus
```

### 2f. Transaction Test Constants

**File:** `ui/common/tests/utils/transaction.ts`

```ts
import {
    TEST_LN_INVOICE,        // 'lnbc21000000'
    TEST_PREIMAGE,           // 'test-preimage'
    TEST_TXID,               // 'test-txid'
    TEST_ONCHAIN_ADDRESS,    // 'bc1234567890'
    TEST_REASON,             // 'test-reason'
    TEST_ERROR,              // 'test-error'
    TEST_SPV2_ACCOUNT_ID,    // 'test-spv2-account-id'
    TEST_NPUB,               // '@npub123'
    TEST_EVENT_ID,           // 'test-event-id'
} from '@fedi/common/tests/utils/transaction'
```

---

## 3. Federation Builders

**File:** `ui/common/tests/mock-data/federation.ts`

```ts
import {
    mockFederation1,
    mockFederation2,
    mockCommunity,
    createMockFederationPreview,
    createMockCommunityPreview,
} from '@fedi/common/tests/mock-data/federation'
```

### `mockFederation1` (constant)

Type: `Federation`

```ts
{
    status: 'online',
    init_state: 'ready',
    balance: 2000000 as MSats,   // 2000 sats
    id: '1',
    network: 'bitcoin',
    name: 'test-federation',
    inviteCode: 'test',
    meta: {},
    recovering: false,
    nodes: {},
    clientConfig: null,
    fediFeeSchedule: { modules: {}, remittanceThresholdMsat: 10000 },
    hadReusedEcash: false,
}
```

### `mockFederation2` (constant)

Type: `Federation` -- same as `mockFederation1` but with `id: '2'` and `name: 'test-federation-2'`.

### `mockCommunity` (constant)

Type: `Community`

```ts
{
    id: '1',
    communityInvite: {
        type: 'legacy',
        invite_code_str: 'test',
        community_meta_url: 'https://test.com',
    },
    name: 'name',
    meta: { pinned_message: 'pinned message' },
    status: 'active',
}
```

### `createMockFederationPreview`

```ts
export const createMockFederationPreview = (
    overrides: Partial<RpcFederationPreview> = {},
): RpcFederationPreview
```

Default: `{ id: '1', name: 'test-federation', inviteCode: 'test', meta: {}, returningMemberStatus: { type: 'returningMember' } }`

### `createMockCommunityPreview`

```ts
export const createMockCommunityPreview = (
    overrides: Partial<CommunityPreview> = {},
): CommunityPreview
```

Default: `mockCommunity` + `{ returningMemberStatus: { type: 'unknown' }, version: 1 }`

---

## 4. Matrix / Chat Builders

**File:** `ui/common/tests/mock-data/matrix-event.ts`

```ts
import {
    createMockPaymentEvent,
    createMockNonPaymentEvent,
    createMockFormEvent,
    createMockFederationInviteEvent,
    createMockCommunityInviteEvent,
    MOCK_FORM_EVENT,
    mockMatrixEventImage,
    mockMatrixEventVideo,
    mockMatrixEventFile,
    mockRoomMembers,
} from '@fedi/common/tests/mock-data/matrix-event'
```

All factory functions use `MockOverride<T>` which deeply merges the `content` field:

```ts
type MockOverride<T extends MatrixEventKind> = Partial<
    Omit<MatrixEvent<T>, 'content'> & {
        content: Partial<MatrixEvent<T>['content']>
    }
>
```

This means you can override top-level event fields AND nested `content` fields separately -- they are merged, not replaced.

### Common base fields (shared by all mock events)

```ts
{
    id: '$lZ5PilJSxLL_OBo0_bZuva7Z-Wnw-tMN9Um1DBpw0Yk' as RpcTimelineEventItemId,
    roomId: '!tErPyFRkaElRGYRAyQ:m1.8fa.in',
    timestamp: 1750083034389,
    localEcho: false,
    sender: '@npub1rvlu99xmn62wn5neseg3dayjp857tzu6yeefnwr4ctrqkn5h08wqttl4ja:m1.8fa.in',
    sendState: { kind: 'sent', event_id: 'event123' },
    inReply: null,
    mentions: null,
}
```

### `createMockPaymentEvent`

```ts
createMockPaymentEvent(overrides?: MockOverride<'xyz.fedi.payment'>): MatrixPaymentEvent
```

Default content:
```ts
{
    msgtype: 'xyz.fedi.payment',
    body: 'Payment of 1000 sats',
    paymentId: 'payment123',
    status: 'pushed',
    amount: 1000,
    senderId: 'npub1user123',
    recipientId: 'npub1user456',
    federationId: 'fed123',
    senderOperationId: 'sender-op-123',
}
```

**Usage:**
```ts
const event = createMockPaymentEvent({
    content: { senderId: 'npub123', senderOperationId: undefined },
})

const event2 = createMockPaymentEvent({
    sender: '@someuser:matrix.org',
    content: { status: 'accepted', amount: 5000 },
})
```

### `createMockNonPaymentEvent`

```ts
createMockNonPaymentEvent(overrides?: MockOverride<'m.text'>): MatrixEvent<'m.text'>
```

Default content: `{ msgtype: 'm.text', body: 'Hello world', formatted: null }`

### `createMockFormEvent`

```ts
createMockFormEvent(overrides?: MockOverride<'xyz.fedi.form'>): MatrixFormEvent
```

Default content:
```ts
{
    msgtype: 'xyz.fedi.form',
    body: 'Accept Terms',
    i18nKeyLabel: 'phrases.accept-terms',
    type: 'button',
    value: 'yes',
    options: null,
    formResponse: null,
}
```

**Usage (radio form with options):**
```ts
const formEvent = createMockFormEvent({
    content: {
        body: 'Choose a plan:',
        type: 'radio',
        options: [
            { value: 'plan1', label: 'Plan 1', i18nKeyLabel: null },
            { value: 'plan2', label: 'Plan 2', i18nKeyLabel: null },
        ],
    },
    sender: '@fedichatbot:m1.8fa.in',
})
```

**Usage (button form with response):**
```ts
const responseEvent = createMockFormEvent({
    content: {
        body: 'yes',
        formResponse: {
            respondingToEventId: '$abc123',
            responseBody: 'Accept Terms',
            responseI18nKey: 'phrases.accept-terms',
            responseType: 'button',
            responseValue: 'yes',
        },
    },
    sender: userId,
})
```

### `createMockFederationInviteEvent`

```ts
createMockFederationInviteEvent(overrides?: MockOverride<'xyz.fedi.federationInvite'>): MatrixEvent<'xyz.fedi.federationInvite'>
```

Default content: `{ msgtype: 'xyz.fedi.federationInvite', body: 'fed11qgqrgvnhwden5te0...', formatted: null }`

### `createMockCommunityInviteEvent`

```ts
createMockCommunityInviteEvent(overrides?: MockOverride<'xyz.fedi.communityInvite'>): MatrixCommunityInviteEvent
```

Default content: `{ msgtype: 'xyz.fedi.communityInvite', body: 'fedi:community:test-community-invite-code', formatted: null }`

### Media event constants

These are fixed constants (not factory functions):

```ts
mockMatrixEventImage    // MatrixEvent<'m.image'> - PNG image with mxc:// source
mockMatrixEventVideo    // MatrixEvent<'m.video'> - MP4 video with mxc:// source
mockMatrixEventFile     // MatrixEvent<'m.file'> - PDF file with mxc:// source
```

### `mockRoomMembers`

```ts
mockRoomMembers: MatrixRoomMember[]
```

Array of 4 members: Alice, Bob Smith, Charlie (power level 50), Dave Test. Each has `membership: 'join'`, `ignored: false`, and `roomId: '!room:example.com'`.

### Matrix Room mock

**File:** `ui/common/tests/mock-data/matrix.ts`

```ts
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
```

```ts
export const MOCK_MATRIX_ROOM: MatrixRoom = {
    id: '1',
    name: 'test',
    avatarUrl: null,
    preview: null,
    directUserId: null,
    notificationCount: 0,
    isMarkedUnread: false,
    joinedMemberCount: 1,
    isPreview: false,
    isPublic: null,
    roomState: 'joined',
    isDirect: false,
    recencyStamp: null,
}
```

---

## 5. FediMod Builder

**File:** `ui/common/tests/utils/fedimods.ts`

```ts
import { newTestFediMod } from '@fedi/common/tests/utils/fedimods'
```

```ts
export const newTestFediMod = (overrides?: Partial<FediMod>): FediMod
```

Default: `{ id: <uuid>, title: 'Test Mod', url: 'testurl.com' }`

The `FediMod` interface has optional fields: `imageUrl`, `description`, `color`, `dateAdded`.

---

## 6. Test Utilities (non-mock-data)

### `createMockT` (translation function mock)

**File:** `ui/common/tests/utils/setup.ts`

```ts
import { createMockT } from '@fedi/common/tests/utils/setup'
```

```ts
export const createMockT = (
    translations: Record<string, string> = {},
): TFunction
```

Returns a function that maps keys to provided translations, or returns the key itself if no translation is defined (mimicking i18n behavior).

**Usage:**
```ts
const t = createMockT()                              // returns keys as-is
const t = createMockT({ 'words.deposit': 'Deposit' }) // returns 'Deposit' for that key
```

### `mockSystemLocale`

**File:** `ui/common/tests/utils/setup.ts`

```ts
import { mockSystemLocale } from '@fedi/common/tests/utils/setup'
```

```ts
export const mockSystemLocale = (locale: string) => void
```

Changes the mocked `Intl.NumberFormat` locale. Defaults to `'en-US'`, reset before each test.

### `mockStorageApi`

**File:** `ui/common/tests/utils/render.ts`

```ts
import { mockStorageApi } from '@fedi/common/tests/utils/render'
```

```ts
export const mockStorageApi: StorageApi = {
    getItem: jest.fn(() => Promise.resolve('')),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
}
```

---

## 7. Render Utilities

### Common (for hooks that don't need React Native)

**File:** `ui/common/tests/utils/render.ts`

```ts
import {
    renderHookWithState,
    renderHookWithBridge,
    mockReduxProvider,
    mockInitializeCommonStore,
} from '@fedi/common/tests/utils/render'
```

**`renderHookWithState`** -- renders a hook with Redux store + mock bridge:
```ts
function renderHookWithState<T>(
    hook: () => T,
    store?: ReturnType<typeof setupStore>,
    fedimint?: FedimintBridge,
)
```

**`renderHookWithBridge`** -- same but requires explicit store and bridge:
```ts
function renderHookWithBridge<T>(
    hook: () => T,
    store: ReturnType<typeof setupStore>,
    fedimint: FedimintBridge,
)
```

### React Native (for component and hook tests)

**File:** `ui/native/tests/utils/render.tsx`

```ts
import { renderWithProviders, renderHookWithProviders, renderWithBridge } from '../../tests/utils/render'
```

**`renderWithProviders`** -- renders a React Native component with SafeAreaProvider, ThemeProvider, Redux Provider, FedimintProvider, and I18nProvider:
```ts
function renderWithProviders(
    ui: React.ReactElement,
    options?: {
        preloadedState?: Partial<AppState>,
        store?: ReturnType<typeof setupStore>,
        fedimint?: FedimintBridge,
        ...RenderOptions,
    },
): { store, ...RenderResult }
```

**`renderHookWithProviders`** -- renders a hook with same providers:
```ts
function renderHookWithProviders<T>(
    hook: () => T,
    options?: { preloadedState?, store?, fedimint?, ...RenderOptions },
): { store, ...RenderHookResult }
```

### Web / PWA (for Next.js component tests)

**File:** `ui/web/tests/utils/render.tsx`

```ts
import { renderWithProviders, renderHookWithProviders, renderWithBridge } from '../../../tests/utils/render'
```

Same signatures as native but wraps with `I18nextProvider` instead of native providers.

---

## 8. Common Composition Patterns

### Pattern: Hook test with mock bridge and Redux state

```ts
import { setupStore, setFederations } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge, MockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { renderHookWithState } from '@fedi/common/tests/utils/render'
import { createMockT } from '@fedi/common/tests/utils/setup'

describe('myHook', () => {
    let store: ReturnType<typeof setupStore>
    let mockFedimint: MockFedimintBridge

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        mockFedimint = createMockFedimintBridge()
    })

    it('should do something', () => {
        store.dispatch(setFederations([mockFederation1]))
        const t = createMockT()

        const { result } = renderHookWithState(
            () => useMyHook(t),
            store,
            mockFedimint,
        )

        expect(result.current.someValue).toBe(expected)
    })
})
```

### Pattern: Component test with mock bridge (React Native)

```ts
import { screen, waitFor, userEvent } from '@testing-library/react-native'
import { setupStore, setFederations, setPayFromFederationId } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge, MockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MSats } from '@fedi/common/types'
import { renderWithProviders } from '../../tests/utils/render'

describe('MyScreen', () => {
    let store: ReturnType<typeof setupStore>
    let mockFedimint: MockFedimintBridge

    beforeEach(() => {
        store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))

        mockFedimint = createMockFedimintBridge({
            calculateMaxGenerateEcash: Promise.resolve(1_999_000 as MSats),
        })
    })

    it('should render', () => {
        renderWithProviders(<MyScreen navigation={mockNavigation} route={mockRoute} />, {
            store,
            fedimint: mockFedimint,
        })

        expect(screen.getByText('Expected Text')).toBeOnTheScreen()
    })
})
```

### Pattern: Matrix event test with Redux auth

```ts
import { setupStore, setMatrixAuth } from '@fedi/common/redux'
import { MatrixAuth } from '@fedi/common/types'
import { createMockPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { createMockTransaction } from '@fedi/common/tests/mock-data/transactions'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { renderHookWithState } from '@fedi/common/tests/utils/render'

describe('useMatrixPaymentTransaction', () => {
    let store: ReturnType<typeof setupStore>

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
    })

    it('should fetch transaction', async () => {
        const mockTransaction = createMockTransaction()
        const fedimint = createMockFedimintBridge({
            getTransaction: mockTransaction,
        })
        store.dispatch(setMatrixAuth({ userId: 'npub123' } as MatrixAuth))

        const event = createMockPaymentEvent({
            content: { senderId: 'npub123', senderOperationId: 'op-123' },
        })

        const { result } = renderHookWithState(
            () => useMatrixPaymentTransaction({ event }),
            store,
            fedimint,
        )

        await waitFor(() => {
            expect(result.current.transaction).toEqual(mockTransaction)
        })
    })
})
```

### Pattern: Transaction utility tests with `makeTestTxnEntry`

```ts
import {
    makeTestTxnEntry,
    makeTestLnPayState,
    makeTestLnReceiveState,
    makeTestSPV2DepositState,
    makeTestFediFeeStatus,
} from '@fedi/common/tests/utils/transaction'

describe('makeTxnStatusBadge', () => {
    it('should return "incoming" for completed receives', () => {
        const lnReceive = makeTestTxnEntry('lnReceive', {
            state: makeTestLnReceiveState('claimed'),
        })
        expect(makeTxnStatusBadge(lnReceive)).toBe('incoming')
    })

    it('should return "outgoing" for completed sends', () => {
        const lnPay = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('success'),
        })
        expect(makeTxnStatusBadge(lnPay)).toBe('outgoing')
    })

    it('should handle fee status', () => {
        const txn = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('success'),
            fediFeeStatus: makeTestFediFeeStatus('success', 1000),
        })
        expect(txn.fediFeeStatus?.type).toBe('success')
    })
})
```

### Pattern: Mocking `rpcResult` directly via `jest.mock`

For testing utility functions that call `fedimint.rpcResult` directly (not through hooks/components), mock the remote-bridge module:

```ts
import { RpcMethods } from '@fedi/common/types/bindings'
import { BridgeError } from '@fedi/common/utils/errors'
import { okAsync, errAsync, ResultAsync } from 'neverthrow'

jest.mock('@fedi/common/utils/remote-bridge', () => ({
    fedimint: {
        rpcResult: function <T extends keyof RpcMethods>(
            method: T,
            _params: RpcMethods[T][0],
        ): ResultAsync<RpcMethods[T][1], BridgeError> {
            if (method === 'signLnurlMessage') {
                return okAsync({ signature: 'foo', pubkey: 'bar' })
            }
            if (method === 'payInvoice') {
                return okAsync({ preimage: 'preimage' })
            }
            return errAsync(
                new BridgeError({ errorCode: 'badRequest', error: 'unknown', detail: 'unknown' }),
            )
        },
    },
}))
```

---

## 9. Integration Test Builders (RemoteBridge)

**File:** `ui/common/tests/utils/remote-bridge-setup.ts`

For integration tests that use a real `RemoteBridge` (connecting to a running devimint instance). Not for unit tests.

```ts
import {
    setupRemoteBridgeTests,
    createIntegrationTestBuilder,
    IntegrationTestBuilder,
} from '@fedi/common/tests/utils/remote-bridge-setup'
```

**`setupRemoteBridgeTests()`** -- sets up `beforeEach`/`afterEach` with real bridge initialization. Returns a `RemoteBridgeTestContext` with `{ bridge, store }`.

**`createIntegrationTestBuilder()`** -- creates an `IntegrationTestBuilder` that composes state progressively:

```ts
const builder = createIntegrationTestBuilder()

// In a test:
const { bridge, store } = builder.getContext()
await builder.withOnboardingCompleted()
await builder.withFederationJoined()
await builder.withEcashReceived(100000)
await builder.withChatReady()
const roomId = await builder.withChatGroupCreated('my group', false, false)
```

Builder methods are chainable and idempotent -- calling `withFederationJoined()` automatically calls `withOnboardingCompleted()` if not already done.
