import '@testing-library/jest-dom'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    makeTestOOBSpendState,
    makeTestTxnEntry,
} from '@fedi/common/tests/utils/transaction'
import { MSats } from '@fedi/common/types'

import { HistoryDetailDialog } from '../../../src/components/HistoryList/HistoryDetailDialog'
import i18n from '../../../src/localization/i18n'
import { renderWithProviders } from '../../utils/render'

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

describe('HistoryDetailDialog', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    const renderDetail = (
        txn = cancelableSend,
        fedimint = createMockFedimintBridge(),
        onClose = jest.fn(),
    ) => {
        renderWithProviders(
            <HistoryDetailDialog
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

    const confirmCancel = async () => {
        await user.click(
            screen.getByRole('button', {
                name: i18n.t('feature.send.cancel-send'),
            }),
        )
        await user.click(
            screen.getByRole('button', {
                name: i18n.t('words.continue'),
            }),
        )
    }

    it('should let the sender reclaim an unclaimed ecash send after confirming', async () => {
        const fedimint = makeCancelBridge()
        const onClose = renderDetail(cancelableSend, fedimint)

        await confirmCancel()

        await waitFor(() => {
            expect(fedimint.cancelEcash).toHaveBeenCalledWith(
                ecash,
                federationId,
            )
            expect(onClose).toHaveBeenCalled()
        })
    })

    it('should keep the dialog open when the federation rejects the cancel', async () => {
        const fedimint = makeCancelBridge(() =>
            Promise.reject(new Error('EcashCancelFailed')),
        )
        const onClose = renderDetail(cancelableSend, fedimint)

        await confirmCancel()

        await waitFor(() => {
            expect(fedimint.cancelEcash).toHaveBeenCalled()
        })
        expect(onClose).not.toHaveBeenCalled()
    })

    it('should hide cancel once a cancel outcome is on record', () => {
        renderDetail(
            makeTestTxnEntry('oobSend', {
                oob_notes: ecash,
                state: makeTestOOBSpendState('userCanceledSuccess'),
            }),
        )

        expect(
            screen.queryByRole('button', {
                name: i18n.t('feature.send.cancel-send'),
            }),
        ).not.toBeInTheDocument()
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
            screen.queryByRole('button', {
                name: i18n.t('feature.send.cancel-send'),
            }),
        ).not.toBeInTheDocument()
    })
})
