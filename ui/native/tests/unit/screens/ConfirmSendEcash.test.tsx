import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import { Alert } from 'react-native'

import {
    selectLastUsedSendMethod,
    setFederations,
    setPayFromFederationId,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MSats, Sats } from '@fedi/common/types'

import i18n from '../../../localization/i18n'
import ConfirmSendEcash from '../../../screens/ConfirmSendEcash'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

describe('ConfirmSendEcash screen', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeEach(() => {
        store = setupStore()
        store.dispatch(setFederations([mockFederation1]))
        store.dispatch(setPayFromFederationId(mockFederation1.id))
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    const fees = {
        fediAppFee: 0 as MSats,
        fediGuardianFee: 0 as MSats,
        networkFee: 0 as MSats,
    }

    // Press send, then continue past the confirmation alert
    const confirmSend = async (generateEcash: unknown) => {
        renderWithProviders(
            <ConfirmSendEcash
                navigation={mockNavigation as any}
                route={
                    {
                        key: 'ConfirmSendEcash',
                        name: 'ConfirmSendEcash',
                        params: { amount: 1000 as Sats },
                    } as any
                }
            />,
            {
                store,
                fedimint: createMockFedimintBridge({
                    estimateEcashFees: Promise.resolve(fees),
                    generateEcash,
                }),
            },
        )

        await user.press(screen.getByTestId('SendConfirmButton'))

        const buttons = (Alert.alert as jest.Mock).mock.calls[0][2]
        const proceed = buttons.find(
            (b: { text: string }) => b.text === i18n.t('words.continue'),
        )
        await proceed.onPress()
    }

    it('remembers ecash once the ecash is created', async () => {
        await confirmSend(() =>
            Promise.resolve({ ecash: 'ecash-notes', operationId: 'op-id' }),
        )

        await waitFor(() => expect(mockNavigation.dispatch).toHaveBeenCalled())
        expect(selectLastUsedSendMethod(store.getState())).toBe('ecash')
    })

    it('does not remember ecash when creating it fails', async () => {
        await confirmSend(() => Promise.reject(new Error('insufficient')))

        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
        expect(selectLastUsedSendMethod(store.getState())).toBeNull()
    })
})
