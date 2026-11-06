import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import {
    selectLastUsedSendMethod,
    setFederations,
    setLastUsedSendMethod,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { LoadedFederation, MSats } from '@fedi/common/types'

import i18n from '../../../localization/i18n'
import Send from '../../../screens/Send'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const ecashFederation: LoadedFederation = mockFederation1
const noEcashFederation: LoadedFederation = {
    ...mockFederation1,
    id: 'no-ecash',
    meta: { offline_wallet_disabled: 'true' },
}

const lightningPlaceholder = i18n.t('feature.send.enter-a-lightning-address')
const onchainPlaceholder = i18n.t('feature.send.enter-a-bitcoin-address')

describe('Send screen', () => {
    let store: ReturnType<typeof setupStore>
    const user = userEvent.setup()

    beforeEach(() => {
        store = setupStore()
        store.dispatch(setFederations([ecashFederation, noEcashFederation]))
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    const renderSend = (federationId: string) =>
        renderWithProviders(
            <Send
                navigation={mockNavigation as any}
                route={{ key: 'Send', name: 'Send', params: { federationId } }}
            />,
            {
                store,
                fedimint: createMockFedimintBridge({
                    calculateMaxGenerateEcash: Promise.resolve(
                        1_000_000 as MSats,
                    ),
                }),
            },
        )

    // The ecash tab is the only one with an amount form instead of an
    // address input
    const expectEcashTab = () => {
        expect(
            screen.queryByPlaceholderText(lightningPlaceholder),
        ).not.toBeOnTheScreen()
        expect(
            screen.queryByPlaceholderText(onchainPlaceholder),
        ).not.toBeOnTheScreen()
        expect(screen.getByText(i18n.t('words.next'))).toBeOnTheScreen()
    }

    it('opens on ecash before any send when the federation offers ecash', () => {
        renderSend(ecashFederation.id)

        expectEcashTab()
    })

    it('opens on lightning before any send when the federation offers no ecash', () => {
        renderSend(noEcashFederation.id)

        expect(
            screen.getByPlaceholderText(lightningPlaceholder),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(i18n.t('phrases.ecash-slash-offline')),
        ).not.toBeOnTheScreen()
    })

    it('opens on the method of the last successful send', () => {
        store.dispatch(setLastUsedSendMethod('onchain'))

        renderSend(ecashFederation.id)

        expect(
            screen.getByPlaceholderText(onchainPlaceholder),
        ).toBeOnTheScreen()
    })

    it('opens on lightning after a lightning send even when the federation offers ecash', () => {
        store.dispatch(setLastUsedSendMethod('lightning'))

        renderSend(ecashFederation.id)

        expect(
            screen.getByPlaceholderText(lightningPlaceholder),
        ).toBeOnTheScreen()
    })

    it('opens on lightning when the remembered ecash is unavailable, and keeps the preference', () => {
        store.dispatch(setLastUsedSendMethod('ecash'))

        renderSend(noEcashFederation.id)

        expect(
            screen.getByPlaceholderText(lightningPlaceholder),
        ).toBeOnTheScreen()
        expect(selectLastUsedSendMethod(store.getState())).toBe('ecash')
    })

    it('opens on the remembered ecash in a federation that offers it', () => {
        store.dispatch(setLastUsedSendMethod('ecash'))

        renderSend(ecashFederation.id)

        expectEcashTab()
    })

    it('does not remember a tab the user only switched to', async () => {
        store.dispatch(setLastUsedSendMethod('lightning'))
        renderSend(ecashFederation.id)

        await user.press(screen.getByText(i18n.t('words.onchain')))

        await waitFor(() =>
            expect(
                screen.getByPlaceholderText(onchainPlaceholder),
            ).toBeOnTheScreen(),
        )
        expect(selectLastUsedSendMethod(store.getState())).toBe('lightning')
    })
})
