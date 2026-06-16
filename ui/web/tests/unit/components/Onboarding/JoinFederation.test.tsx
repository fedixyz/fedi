import '@testing-library/jest-dom'
import { fireEvent, screen, waitFor } from '@testing-library/react'

import { mockUseRouter } from '../../../../jest.setup'
import { JoinFederation } from '../../../../src/components/Onboarding/JoinFederation'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const mockUseFederationPreview = jest.fn()

jest.mock('@fedi/common/hooks/federation', () => ({
    ...jest.requireActual('@fedi/common/hooks/federation'),
    useFederationPreview: (...args: unknown[]) =>
        mockUseFederationPreview(...args),
}))

// A community preview shown to a non-member, where confirming the join reports
// success immediately so goToNextScreen runs.
const communityPreviewState = (id: string) => ({
    isJoining: false,
    setIsJoining: jest.fn(),
    isFetchingPreview: false,
    federationPreview: undefined,
    setFederationPreview: jest.fn(),
    communityPreview: { id, name: id, meta: {} },
    setCommunityPreview: jest.fn(),
    handleCode: jest.fn(),
    handleJoin: (onSuccess?: (type: string) => void) =>
        onSuccess?.('community'),
})

const setHash = (hash: string) => {
    window.location.hash = hash
}

const clickJoin = () =>
    fireEvent.click(
        screen.getByRole('button', { name: i18n.t('phrases.join-space') }),
    )

describe('/components/Onboarding/JoinFederation', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        setHash('')
    })

    it('chains to the wallet-service join after the community is joined', async () => {
        mockUseFederationPreview.mockReturnValue(
            communityPreviewState('fedi:community10abc'),
        )
        setHash('#id=fedi:community10abc&afterJoinFederation=fed1abc')
        renderWithProviders(<JoinFederation />)

        clickJoin()

        await waitFor(() =>
            expect(mockUseRouter.push).toHaveBeenCalledWith(
                '/onboarding/join?id=fed1abc',
            ),
        )
    })

    it('goes to the community tab when there is no chained invite', async () => {
        mockUseFederationPreview.mockReturnValue(
            communityPreviewState('fedi:community10abc'),
        )
        setHash('#id=fedi:community10abc')
        renderWithProviders(<JoinFederation />)

        clickJoin()

        await waitFor(() =>
            expect(mockUseRouter.push).toHaveBeenCalledWith('/home'),
        )
    })
})
