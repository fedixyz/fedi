import notifee from '@notifee/react-native'

import { createMockT } from '@fedi/common/tests/utils/setup'
import {
    makeTestLnReceiveState,
    makeTestOOBReissueState,
    makeTestTxnEntry,
} from '@fedi/common/tests/utils/transaction'

import { TransactionEvent, TransactionListEntry } from '../../../types'
import { displayPaymentReceivedNotification } from '../../../utils/notifications'

const t = createMockT()

const makeEvent = (transaction: TransactionListEntry): TransactionEvent => ({
    federationId: 'test-federation',
    // the builder returns the list-entry union, which is wider than the
    // event's transaction only by the multispend kinds never built here
    transaction: transaction as TransactionEvent['transaction'],
})

describe('displayPaymentReceivedNotification', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should notify for a completed ecash receive', async () => {
        await displayPaymentReceivedNotification(
            makeEvent(
                makeTestTxnEntry('oobReceive', {
                    state: makeTestOOBReissueState('done'),
                }),
            ),
            t,
        )

        expect(notifee.displayNotification).toHaveBeenCalled()
    })

    it('should not notify for the user reclaiming their own ecash', async () => {
        await displayPaymentReceivedNotification(
            makeEvent(
                makeTestTxnEntry('oobCancel', {
                    state: makeTestOOBReissueState('done'),
                }),
            ),
            t,
        )
        await displayPaymentReceivedNotification(
            makeEvent(makeTestTxnEntry('oobCancel', { state: null })),
            t,
        )

        expect(notifee.displayNotification).not.toHaveBeenCalled()
    })

    it('should notify for a claimed lightning receive', async () => {
        await displayPaymentReceivedNotification(
            makeEvent(
                makeTestTxnEntry('lnReceive', {
                    state: makeTestLnReceiveState('claimed'),
                }),
            ),
            t,
        )

        expect(notifee.displayNotification).toHaveBeenCalled()
    })

    it('should not notify for a dead lightning invoice', async () => {
        await displayPaymentReceivedNotification(
            makeEvent(
                makeTestTxnEntry('lnReceive', {
                    state: makeTestLnReceiveState('canceled'),
                }),
            ),
            t,
        )
        await displayPaymentReceivedNotification(
            makeEvent(
                makeTestTxnEntry('lnRecurringdReceive', {
                    state: makeTestLnReceiveState('canceled'),
                }),
            ),
            t,
        )

        expect(notifee.displayNotification).not.toHaveBeenCalled()
    })
})
