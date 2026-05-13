import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setupStore } from '@fedi/common/redux'
import {
    createMockFederationPreview,
    mockFederation1,
} from '@fedi/common/tests/mock-data/federation'

import i18n from '../../../src/localization/i18n'
import EcashPage from '../../../src/pages/ecash'
import * as utils from '../../../src/utils/linking'
import { renderWithProviders } from '../../utils/render'

jest.mock('../../../src/utils/linking')

const parseEcashSpy = jest.fn()
const claimEcashSpy = jest.fn()

const defaultParseEcashReturn = {
    parseEcash: parseEcashSpy,
    loading: false,
    parsed: {
        amount: 10000, // msats (10 sats)
        federation_id: '1',
        federation_type: 'joined',
    },
    ecashToken: '123',
    federation: mockFederation1,
    newMembersDisabled: false,
}
let parseEcashReturn: typeof defaultParseEcashReturn | Record<string, unknown> =
    defaultParseEcashReturn

jest.mock('@fedi/common/hooks/pay', () => ({
    ...jest.requireActual('@fedi/common/hooks/pay'),
    useParseEcash: () => parseEcashReturn,
    useClaimEcash: () => ({
        claimEcash: claimEcashSpy,
        loading: false,
        claimed: false,
        isError: false,
    }),
}))

describe('/pages/ecash', () => {
    const user = userEvent.setup()
    let store: ReturnType<typeof setupStore>

    beforeAll(() => {
        ;(utils.getHashParams as jest.Mock).mockReturnValue({ id: '123' })

        store = setupStore()
    })

    afterAll(() => {
        jest.restoreAllMocks()
    })

    beforeEach(() => {
        parseEcashReturn = defaultParseEcashReturn
    })

    describe('when the page loads', () => {
        it('should call parseEcash function with id from hash params', async () => {
            renderWithProviders(<EcashPage />, {
                store,
            })

            await waitFor(() => {
                expect(parseEcashSpy).toHaveBeenCalledWith('123')
            })
        })

        it('should show correct amount in sats', async () => {
            renderWithProviders(<EcashPage />, {
                store,
            })

            await waitFor(() => {
                expect(screen.getByText('10 SATS')).toBeInTheDocument()
            })
        })

        it('should show name of federation wallet that the ecash will be added to', async () => {
            renderWithProviders(<EcashPage />, {
                store,
            })

            await waitFor(() => {
                expect(screen.getByText(/test-federation/i)).toBeInTheDocument()
            })
        })
    })

    describe('when the user clicks on the claim ecash button', () => {
        it('should call claimEcash function correct params', async () => {
            ;(utils.getHashParams as jest.Mock).mockReturnValue({ id: '123' })

            renderWithProviders(<EcashPage />, {
                store,
            })

            const button = screen.getByLabelText(
                i18n.t('feature.ecash.claim-ecash'),
            )

            user.click(button)
            await waitFor(() => {
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

    describe('when the issuing federation has new members disabled', () => {
        beforeEach(() => {
            parseEcashReturn = {
                ...defaultParseEcashReturn,
                parsed: {
                    amount: 10000,
                    federation_invite: 'invite-code',
                    federation_type: 'notJoined',
                },
                federation: createMockFederationPreview({
                    meta: { new_members_disabled: 'true' },
                }),
                newMembersDisabled: true,
            }
        })

        it('should explain that the ecash cannot be claimed', async () => {
            renderWithProviders(<EcashPage />, { store })

            await waitFor(() => {
                expect(
                    screen.getByText(
                        i18n.t(
                            'feature.ecash.claim-ecash-new-members-disabled',
                        ),
                    ),
                ).toBeInTheDocument()
            })
        })

        it('should hide the claim ecash button', () => {
            renderWithProviders(<EcashPage />, { store })

            expect(
                screen.queryByLabelText(i18n.t('feature.ecash.claim-ecash')),
            ).not.toBeInTheDocument()
            expect(
                screen.getByRole('link', { name: i18n.t('words.cancel') }),
            ).toBeInTheDocument()
        })
    })
})
