import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import { mockUseRouter } from '../../../../jest.setup'
import { Onboarding } from '../../../../src/components/Onboarding'
import { walletRoute } from '../../../../src/constants/routes'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const mockUseFederationPreview = jest.fn()

jest.mock('@fedi/common/hooks/federation', () => ({
    ...jest.requireActual('@fedi/common/hooks/federation'),
    useFederationPreview: (...args: unknown[]) =>
        mockUseFederationPreview(...args),
}))

let mockQuery: { id?: string } = {}

jest.mock('next/router', () => ({
    useRouter: () => ({
        ...mockUseRouter,
        get query() {
            return mockQuery
        },
        pathname: '/onboarding/join',
    }),
}))

const previewBase = {
    isJoining: false,
    setIsJoining: jest.fn(),
    isFetchingPreview: false,
    setFederationPreview: jest.fn(),
    setCommunityPreview: jest.fn(),
    handleCode: jest.fn(),
}

// Non-member previews that report a successful join immediately, so
// goToNextScreen fires the moment the user confirms.
const communityPreviewState = (id: string) => ({
    ...previewBase,
    federationPreview: undefined,
    communityPreview: { id, name: id, meta: {} },
    handleJoin: (onSuccess?: (type: string) => void) =>
        onSuccess?.('community'),
})

const federationPreviewState = (id: string) => ({
    ...previewBase,
    communityPreview: undefined,
    federationPreview: {
        id,
        name: id,
        meta: {},
        returningMemberStatus: { type: 'newMember' },
    },
    handleJoin: (onSuccess?: (type: string) => void) =>
        onSuccess?.('federation'),
})

const setHash = (hash: string) => {
    window.location.hash = hash
}

describe('/components/Onboarding join chaining', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockQuery = {}
        setHash('')
        // A community code resolves to a community preview, a fed1 code to a
        // wallet-service preview, so a remount swaps which join is shown.
        mockUseFederationPreview.mockImplementation((_t: unknown, code) =>
            typeof code === 'string' && code.toLowerCase().startsWith('fed1')
                ? federationPreviewState(code)
                : communityPreviewState(code),
        )
    })

    it('joins the community, remounts, and chains into the wallet-service join without looping', async () => {
        // First join: the community code lives in the hash, no query id yet.
        setHash('#id=fedi:community10abc&afterJoinFederation=fed1abc')
        const { rerender } = renderWithProviders(<Onboarding step="join" />)

        fireEvent.click(
            screen.getByRole('button', { name: i18n.t('phrases.join-space') }),
        )

        await waitFor(() =>
            expect(mockUseRouter.push).toHaveBeenCalledWith(
                '/onboarding/join?id=fed1abc',
            ),
        )

        // Stand in for Next navigating to the hashless ?id= url: the fragment is
        // dropped and query.id changes, which flips the key in Onboarding.
        setHash('')
        mockQuery = { id: 'fed1abc' }
        mockUseRouter.push.mockClear()
        rerender(<Onboarding step="join" />)

        // The remount shows the wallet-service preview for the second join.
        expect(
            await screen.findByTestId('federation-preview-name'),
        ).toHaveTextContent('fed1abc')

        fireEvent.click(
            screen.getByRole('button', {
                name: i18n.t('phrases.join-federation'),
            }),
        )

        // It lands on the wallet and never loops back into another join.
        await waitFor(() =>
            expect(mockUseRouter.push).toHaveBeenCalledWith(walletRoute),
        )
        expect(mockUseRouter.push).not.toHaveBeenCalledWith(
            expect.stringContaining('?id='),
        )
    })
})
