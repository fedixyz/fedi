import { getCancellableEcash } from '../../../../utils/transaction'
import {
    makeTestOOBSpendState,
    makeTestTxnEntry,
} from '../../../utils/transaction'

const TEST_ECASH = 'test-ecash-notes'

describe('getCancellableEcash', () => {
    it('should offer cancel while the sender cannot know whether the notes were claimed', () => {
        const created = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: makeTestOOBSpendState('created'),
        })
        const success = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: makeTestOOBSpendState('success'),
        })
        const unknown = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: null,
        })

        expect(getCancellableEcash(created)).toBe(TEST_ECASH)
        expect(getCancellableEcash(success)).toBe(TEST_ECASH)
        expect(getCancellableEcash(unknown)).toBe(TEST_ECASH)
    })

    it('should not offer cancel once a cancel outcome is on record', () => {
        const canceled = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: makeTestOOBSpendState('userCanceledSuccess'),
        })
        const claimed = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: makeTestOOBSpendState('userCanceledFailure'),
        })
        const canceling = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: makeTestOOBSpendState('userCanceledProcessing'),
        })
        const refunded = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: makeTestOOBSpendState('refunded'),
        })

        expect(getCancellableEcash(canceled)).toBeUndefined()
        expect(getCancellableEcash(claimed)).toBeUndefined()
        expect(getCancellableEcash(canceling)).toBeUndefined()
        expect(getCancellableEcash(refunded)).toBeUndefined()
    })

    it('should not offer cancel for a chat payment, which cancels from the chat timeline', () => {
        const chatSend = makeTestTxnEntry('oobSend', {
            oob_notes: TEST_ECASH,
            state: makeTestOOBSpendState('success'),
            frontendMetadata: {
                initialNotes: null,
                recipientMatrixId: '@recipient:m1.8fa.in',
                senderMatrixId: '@sender:m1.8fa.in',
            },
        })

        expect(getCancellableEcash(chatSend)).toBeUndefined()
    })

    it('should not offer cancel without the ecash notes to reclaim', () => {
        const noNotes = makeTestTxnEntry('oobSend', {
            oob_notes: null,
            state: makeTestOOBSpendState('success'),
        })

        expect(getCancellableEcash(noNotes)).toBeUndefined()
    })

    it('should not offer cancel for other transaction kinds', () => {
        expect(getCancellableEcash(makeTestTxnEntry('lnPay'))).toBeUndefined()
        expect(
            getCancellableEcash(makeTestTxnEntry('oobReceive')),
        ).toBeUndefined()
    })
})
