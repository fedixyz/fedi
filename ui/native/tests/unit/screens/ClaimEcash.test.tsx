import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'

import * as PayHooks from '@fedi/common/hooks/pay'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { LoadedFederation, MSats } from '@fedi/common/types'

import ClaimEcash from '../../../screens/ClaimEcash'
import { mockNavigation } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

let parseEcashSpy: jest.Mock
let claimEcashSpy: jest.Mock

describe('/screens/ClaimEcash', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        // Create fresh spies for each test
        parseEcashSpy = jest.fn()
        claimEcashSpy = jest.fn()

        jest.spyOn(PayHooks, 'useParseEcash').mockImplementation(() => ({
            parseEcash: parseEcashSpy,
            loading: false,
            parsed: {
                amount: 10000 as MSats,
                federation_id: '1',
                federation_type: 'joined',
            },
            ecashToken: '123',
            isError: false,
            federation: mockFederation1 as LoadedFederation,
        }))

        jest.spyOn(PayHooks, 'useClaimEcash').mockImplementation(() => ({
            claimEcash: claimEcashSpy,
            loading: false,
            claimed: false,
            isError: false,
        }))
    })

    afterEach(() => {
        jest.restoreAllMocks()
        cleanup()
    })

    describe('When the screen loads', () => {
        it('should call the validateEcash function with the token value', async () => {
            renderWithProviders(
                <ClaimEcash
                    navigation={mockNavigation as any}
                    route={{ params: { token: '123' } } as any}
                />,
            )

            await waitFor(() => {
                expect(parseEcashSpy).toHaveBeenCalledWith('123')
            })
        })

        it('should show correct amount in sats', async () => {
            renderWithProviders(
                <ClaimEcash
                    navigation={mockNavigation as any}
                    route={{ params: { token: '123' } } as any}
                />,
            )

            const amount = await screen.findByText('10 SATS')
            expect(amount).toBeOnTheScreen()
        })
    })

    describe('when the user clicks on the claim ecash button', () => {
        it('should call claimEcash function correct params', async () => {
            renderWithProviders(
                <ClaimEcash
                    navigation={mockNavigation as any}
                    route={{ params: { token: '123' } } as any}
                />,
            )

            const button = screen.getByTestId('claim-ecash-button')

            await user.press(button)

            expect(claimEcashSpy).toHaveBeenCalledWith(
                {
                    amount: 10000,
                    federation_id: '1',
                    federation_type: 'joined',
                },
                '123',
            )
        })
    })
})
