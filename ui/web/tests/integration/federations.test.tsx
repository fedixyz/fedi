import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import { mockUseRouter } from '../../jest.setup'
import { JoinFederation } from '../../src/components/Onboarding/JoinFederation'
import { OnboardingHome } from '../../src/components/Onboarding/OnboardingHome'
import { renderWithBridge } from '../utils/render'

let mockQuery: { tab?: string; id?: string } = {}

jest.mock('next/router', () => ({
    useRouter: () => ({
        ...mockUseRouter,
        get query() {
            return mockQuery
        },
        pathname: '/onboarding',
    }),
}))

describe('federations', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    beforeEach(() => {
        mockQuery = {}
    })

    describe('/onboarding paths', () => {
        it('should render tabs and load at least 3 public federations', async () => {
            await builder.withOnboardingCompleted()

            const {
                store,
                bridge: { fedimint },
            } = context

            renderWithBridge(<OnboardingHome />, { store, fedimint })

            const discoverTab = await screen.findByTestId('discoverTab')
            const joinTab = await screen.findByTestId('joinTab')
            const createTab = await screen.findByTestId('createTab')
            expect(discoverTab).toBeInTheDocument()
            expect(joinTab).toBeInTheDocument()
            expect(createTab).toBeInTheDocument()

            await waitFor(async () => {
                const joinButtons = await screen.findAllByText('Join')
                expect(joinButtons.length).toBeGreaterThanOrEqual(3)
            })
        })
        it('should render the Join tab with a Paste button', async () => {
            await builder.withOnboardingCompleted()
            mockQuery = { tab: 'join' }

            const {
                store,
                bridge: { fedimint },
            } = context

            renderWithBridge(<OnboardingHome />, { store, fedimint })

            await waitFor(async () => {
                const pasteButton = screen.queryByText('Paste')
                expect(pasteButton).toBeInTheDocument()
            })
        })
        it('should render the Create tab with an action button', async () => {
            await builder.withOnboardingCompleted()
            mockQuery = { tab: 'create' }

            const {
                store,
                bridge: { fedimint },
            } = context

            renderWithBridge(<OnboardingHome />, { store, fedimint })

            await waitFor(async () => {
                const createButton = await screen.findByText(
                    'Create my Federation',
                )
                expect(createButton).toBeInTheDocument()
            })
        })
    })

    describe('rendering JoinFederation with an invite code', () => {
        it('should fetch and render the federation preview and action buttons', async () => {
            await builder.withOnboardingCompleted()

            const { store, bridge } = context
            const { fedimint } = bridge

            const inviteCode = await bridge.getInviteCode()

            mockQuery = { id: inviteCode }
            renderWithBridge(<JoinFederation />, { store, fedimint })

            await waitFor(async () => {
                const previewContainer =
                    screen.queryByTestId('federation-preview')
                expect(previewContainer).toBeInTheDocument()
            })

            // make a few more assertions after the preview has loaded
            const federationName = screen.queryByTestId(
                'federation-preview-name',
            )
            expect(federationName).toBeInTheDocument()
            expect(federationName).toHaveTextContent('Devimint Federation')
            const joinButton = screen.queryByText('Join Federation')
            expect(joinButton).toBeInTheDocument()
            // Devimint federation does not have a welcome message
            const welcomeMessage = screen.queryByTestId(
                'federation-preview-welcome-message',
            )
            expect(welcomeMessage).not.toBeInTheDocument()
        })
    })
})
