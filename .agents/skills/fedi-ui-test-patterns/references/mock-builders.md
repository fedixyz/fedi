# Mock Data Builders Reference

All mock data builders available for writing unit and integration tests in the Fedi codebase.

## Guiding Principles

- Make a clear determination of what state you need to mock in your tests
- You MUST review existing mock utilities that can be used to achieve the desired state for the test
- When mocking state in the redux store, prefer the use of existing dispatchable actions (`store.dispatch(...)` instead of using `setupStore` with a custom initial state where possible
- Consider whether mocking the data in-line directly in the test file helps provide context to the test's assertions or if it just adds code clutter
- Give the mock an appropriate name based on the information it must provide in understanding the test's assertions
- If you decide to create new mock factory/function, you MUST consider whether it would be useful for other test suites or functionality and export it from the appropriate file in `/test/utils/` to be reused in the future
- Hoist the mock to the appropriate scope (description-level, test-level, suite-level) based on how useful it might be to other tests or suites
- When you are finished writing the unit test, you MUST re-read each test and make sure the assumptions and assertions are clear and that important test conditions aren't obfuscated in mock helpers. You must at least use a descriptive variable name to help communicate that context.

---

## Examples

### 1. Mock Bridge (`createMockFedimintBridge`)

**File:** `ui/common/tests/utils/fedimint.ts`

Creates a Jest-mocked `FedimintBridge` instance. The mock supports both `rpcResult`-based calls (used by Redux thunks and utility functions) and direct method calls (used by hooks and components).

Best for basic unit tests that do not benefit from using the remote bridge for real RPC results.

Should NOT be used for integration tests. Instead use Integration Test Builders detailed below.

```ts
import { createMockFedimintBridge, MockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
```

#### Usage patterns

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

---

### 2. Transaction Builders

#### 2a. `createMockTransaction`

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

**Usage:**
```ts
const txn = createMockTransaction()
const customTxn = createMockTransaction({ amount: 5000000 as MSats, txnNotes: 'custom' })
```

#### 2b. `createMockTransactionListEntry`

**File:** `ui/common/tests/mock-data/transactions.ts`

Same as `createMockTransaction` but adds a `createdAt` timestamp (seconds). Returns `RpcTransactionListEntry`.

#### 2c. `makeTestTxnEntry` (recommended for detailed transaction tests)

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

Read the `RpcTransactionListEntry` type in the `/ui/common/types/bindings.ts` if you need to know the supported kinds

**Usage:**
```ts
// Simple - uses default state
const lnPay = makeTestTxnEntry('lnPay')

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

#### 2d. Transaction State Builders

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

#### 2e. Multispend Event Builders

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

**Usage:**
```ts
// Multispend transaction with event data
const deposit = makeTestTxnEntry('multispendDeposit', {
    state: makeTestMultispendDepositEventData(100, 'description'),
    time: 1677721600,
}) as MultispendTransactionListEntry
```

---

### 3. Federation Builders

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

#### `mockFederation1` (constant)

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

#### `mockCommunity` (constant)

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

#### `createMockFederationPreview`

```ts
export const createMockFederationPreview = (
    overrides: Partial<RpcFederationPreview> = {},
): RpcFederationPreview
```

Default: `{ id: '1', name: 'test-federation', inviteCode: 'test', meta: {}, returningMemberStatus: { type: 'returningMember' } }`

#### `createMockCommunityPreview`

```ts
export const createMockCommunityPreview = (
    overrides: Partial<CommunityPreview> = {},
): CommunityPreview
```

Default: `mockCommunity` + `{ returningMemberStatus: { type: 'unknown' }, version: 1 }`

---

### 4. Matrix / Chat Builders

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

#### Common base fields (shared by all mock events)

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

#### `createMockPaymentEvent`

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

#### `createMockNonPaymentEvent`

```ts
createMockNonPaymentEvent(overrides?: MockOverride<'m.text'>): MatrixEvent<'m.text'>
```

Default content: `{ msgtype: 'm.text', body: 'Hello world', formatted: null }`

#### `createMockFormEvent`

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

#### `createMockFederationInviteEvent`

```ts
createMockFederationInviteEvent(overrides?: MockOverride<'xyz.fedi.federationInvite'>): MatrixEvent<'xyz.fedi.federationInvite'>
```

Default content: `{ msgtype: 'xyz.fedi.federationInvite', body: 'fed11qgqrgvnhwden5te0...', formatted: null }`

#### `createMockCommunityInviteEvent`

```ts
createMockCommunityInviteEvent(overrides?: MockOverride<'xyz.fedi.communityInvite'>): MatrixCommunityInviteEvent
```

Default content: `{ msgtype: 'xyz.fedi.communityInvite', body: 'fedi:community:test-community-invite-code', formatted: null }`

#### Media event constants

These are fixed constants (not factory functions):

```ts
mockMatrixEventImage    // MatrixEvent<'m.image'> - PNG image with mxc:// source
mockMatrixEventVideo    // MatrixEvent<'m.video'> - MP4 video with mxc:// source
mockMatrixEventFile     // MatrixEvent<'m.file'> - PDF file with mxc:// source
```

#### `mockRoomMembers`

```ts
mockRoomMembers: MatrixRoomMember[]
```

Array of 4 members: Alice, Bob Smith, Charlie (power level 50), Dave Test. Each has `membership: 'join'`, `ignored: false`, and `roomId: '!room:example.com'`.

#### Matrix Room mock

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

### 5. FediMod Builder

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

### 6. Test Utilities (non-mock-data)

#### `createMockT` (translation function mock)

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

#### `mockSystemLocale`

**File:** `ui/common/tests/utils/setup.ts`

```ts
import { mockSystemLocale } from '@fedi/common/tests/utils/setup'
```

```ts
export const mockSystemLocale = (locale: string) => void
```

Changes the mocked `Intl.NumberFormat` locale. Defaults to `'en-US'`, reset before each test.

#### `mockStorageApi`

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

### 7. Currency Rate Seeding (`fetchCurrencyPrices.fulfilled`)

Many selectors depend on `selectBtcUsdExchangeRate`, which reads `s.currency.btcUsdRate`. This value defaults to `0`, which causes division-by-zero bugs (`NaN`, `Infinity`) in any selector that converts between fiat and sats.

**IMPORTANT:** Any test that touches fiat↔BTC conversion selectors MUST seed the currency rate. Use the `fetchCurrencyPrices.fulfilled` dispatch pattern.

```ts
import { fetchCurrencyPrices } from '../../../redux'

// Dispatch in beforeEach or in the test setup helper
store.dispatch({
    type: fetchCurrencyPrices.fulfilled.type,
    payload: {
        btcUsdRate: 100_000,
        fiatUsdRates: {},
    },
})
```

---

### 8. Integration Test Builders (RemoteBridge)

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
