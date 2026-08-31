import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import { Alert } from 'react-native'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    makeTestOOBSpendState,
    makeTestTxnEntry,
} from '@fedi/common/tests/utils/transaction'
import { MSats } from '@fedi/common/types'
import { HistoryDetail } from '@fedi/native/components/feature/transaction-history/HistoryDetail'
import i18n from '@fedi/native/localization/i18n'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

const federationId = 'test-federation'
const ecash = 'fed1test-ecash'
const cancelableSend = makeTestTxnEntry('oobSend', {
    oob_notes: ecash,
    state: makeTestOOBSpendState('success'),
})

const makeCancelBridge = (
    cancelEcash: unknown = Promise.resolve(),
): ReturnType<typeof createMockFedimintBridge> =>
    createMockFedimintBridge({
        parseEcash: Promise.resolve({
            federation_type: 'joined',
            federation_id: federationId,
            amount: 1_000 as MSats,
        }),
        cancelEcash,
        listTransactions: Promise.resolve([]),
    })

describe('HistoryDetail', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
        jest.restoreAllMocks()
    })

    const renderDetail = (
        txn = cancelableSend,
        fedimint = createMockFedimintBridge(),
        onClose = jest.fn(),
    ) => {
        renderWithProviders(
            <HistoryDetail
                txn={txn}
                icon={null}
                title="Sent ecash"
                amount="1 SAT"
                secondaryAmount="$0.01"
                items={[]}
                onClose={onClose}
                federationId={federationId}
            />,
            { fedimint },
        )
        return onClose
    }

    const confirmCancel = async (alertSpy: jest.SpyInstance) => {
        await user.press(screen.getByText(i18n.t('feature.send.cancel-send')))
        const buttons = alertSpy.mock.calls[0]?.[2]
        await act(async () => {
            buttons?.[1]?.onPress?.()
        })
    }

    it('should let the sender reclaim an unclaimed ecash send after confirming', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert')
        const fedimint = makeCancelBridge()
        const onClose = renderDetail(cancelableSend, fedimint)

        await confirmCancel(alertSpy)

        await waitFor(() => {
            expect(fedimint.cancelEcash).toHaveBeenCalledWith(
                ecash,
                federationId,
            )
            expect(onClose).toHaveBeenCalled()
        })
    })

    it('should keep the detail open when the federation rejects the cancel', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert')
        const fedimint = makeCancelBridge(() =>
            Promise.reject(new Error('EcashCancelFailed')),
        )
        const onClose = renderDetail(cancelableSend, fedimint)

        await confirmCancel(alertSpy)

        await waitFor(() => {
            expect(fedimint.cancelEcash).toHaveBeenCalled()
        })
        expect(onClose).not.toHaveBeenCalled()
    })

    it('should hide cancel after a successful cancel', () => {
        renderDetail(
            makeTestTxnEntry('oobSend', {
                oob_notes: ecash,
                state: makeTestOOBSpendState('userCanceledSuccess'),
            }),
        )

        expect(
            screen.queryByText(i18n.t('feature.send.cancel-send')),
        ).not.toBeOnTheScreen()
    })

    it('should hide cancel after a failed cancel proved the notes were claimed', () => {
        renderDetail(
            makeTestTxnEntry('oobSend', {
                oob_notes: ecash,
                state: makeTestOOBSpendState('userCanceledFailure'),
            }),
        )

        expect(
            screen.queryByText(i18n.t('feature.send.cancel-send')),
        ).not.toBeOnTheScreen()
    })

    it('should hide cancel for a chat payment, which cancels from the chat timeline', () => {
        renderDetail(
            makeTestTxnEntry('oobSend', {
                oob_notes: ecash,
                state: makeTestOOBSpendState('success'),
                frontendMetadata: {
                    initialNotes: null,
                    recipientMatrixId: '@recipient:m1.8fa.in',
                    senderMatrixId: '@sender:m1.8fa.in',
                },
            }),
        )

        expect(
            screen.queryByText(i18n.t('feature.send.cancel-send')),
        ).not.toBeOnTheScreen()
    })
})
