import { cleanup, screen } from '@testing-library/react-native'

import { setFeatureFlags, setupStore } from '@fedi/common/redux'
import { ParserDataType, ParsedStabilityAddress } from '@fedi/common/types'
import { FeatureCatalog } from '@fedi/common/types/bindings'

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
    })
})
