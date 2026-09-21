import { cleanup, fireEvent, screen } from '@testing-library/react-native'

import { setFeatureFlags, setFederations, setupStore } from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import {
    ParserDataType,
    ParsedFederationInvite,
    ParsedStabilityAddress,
} from '@fedi/common/types'
import { FeatureCatalog } from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import { OmniConfirmation } from '../../../../../components/feature/omni/OmniConfirmation'
import { renderWithProviders } from '../../../../utils/render'

describe('components/feature/omni/OmniConfirmation', () => {
    let store: ReturnType<typeof setupStore>
    beforeEach(() => {
        store = setupStore()
        store.dispatch(
            setFeatureFlags({
                sp_transfer_ui: { mode: 'QrCode' },
            } as FeatureCatalog),
        )
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    describe('when rending OmniConfirmation', () => {
        it('should render OmniSendStability when data is a StabilityAddress (foreign federation)', async () => {
            const parsedData: ParsedStabilityAddress = {
                type: ParserDataType.StabilityAddress,
                data: {
                    accountId: 'test-account-id',
                    address: 'sp1testaddress',
                    federation: {
                        type: 'notJoined',
                        federationInvite: 'fake-federation-invite',
                    },
                },
            }

            renderWithProviders(
                <OmniConfirmation
                    parsedData={parsedData}
                    onGoBack={() => {}}
                    onSuccess={() => {}}
                />,
                { store },
            )

            const stabilityText = await screen.findByText(
                'Stable Balance Address',
            )
            expect(stabilityText).toBeOnTheScreen()
        })
        it('should render OmniSendStability when data is a StabilityAddress (joined)', async () => {
            const parsedData: ParsedStabilityAddress = {
                type: ParserDataType.StabilityAddress,
                data: {
                    accountId: 'test-account-id',
                    address: 'sp1testaddress',
                    federation: {
                        type: 'joined',
                        federationId: 'test-federation-id',
                    },
                },
            }

            renderWithProviders(
                <OmniConfirmation
                    parsedData={parsedData}
                    onGoBack={() => {}}
                    onSuccess={() => {}}
                />,
                { store },
            )

            const stabilityText = await screen.findByText(
                'Stable Balance Address',
            )
            expect(stabilityText).toBeOnTheScreen()
        })
        it('should offer to open the wallet when scanning the invite of a joined federation', async () => {
            store.dispatch(setFederations([mockFederation1]))
            const parsedData: ParsedFederationInvite = {
                type: ParserDataType.FedimintInvite,
                data: { invite: mockFederation1.inviteCode },
            }

            renderWithProviders(
                <OmniConfirmation
                    parsedData={parsedData}
                    onGoBack={() => {}}
                    onSuccess={() => {}}
                />,
                { store },
            )

            expect(
                screen.getByText(
                    i18n.t('feature.omni.existing-federation-membership'),
                ),
            ).toBeOnTheScreen()

            fireEvent.press(screen.getByText('Take me there'))

            expect(store.getState().federation.selectedFederationId).toBe(
                mockFederation1.id,
            )
        })
        it('should offer to join when scanning the invite of a federation that is not joined', () => {
            store.dispatch(setFederations([mockFederation1]))
            const parsedData: ParsedFederationInvite = {
                type: ParserDataType.FedimintInvite,
                data: { invite: 'invite-for-a-different-federation' },
            }

            renderWithProviders(
                <OmniConfirmation
                    parsedData={parsedData}
                    onGoBack={() => {}}
                    onSuccess={() => {}}
                />,
                { store },
            )

            expect(
                screen.getByText(
                    'This is a federation invitation, do you want to join?',
                ),
            ).toBeOnTheScreen()
            expect(screen.queryByText('Take me there')).not.toBeOnTheScreen()
        })
    })
})
