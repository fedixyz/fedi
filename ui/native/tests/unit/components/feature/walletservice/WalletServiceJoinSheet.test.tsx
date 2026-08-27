import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { setupStore } from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import i18n from '@fedi/native/localization/i18n'

import {
    JOIN_SHEET_MIN_BODY_HEIGHT,
    WalletServiceJoinSheet,
} from '../../../../../components/feature/walletservice/WalletServiceJoinSheet'
import { renderWithProviders } from '../../../../utils/render'

const reservedHeightOf = (testID: string) =>
    StyleSheet.flatten(screen.getByTestId(testID).props.style)?.minHeight

const JOINABLE_ID = 'joinable-wallet-service'
const JOINABLE_INVITE = 'fed1joinablewalletservice'

// the hook refuses to ask the bridge before onboarding completes, so every
// state below depends on this being set
const onboardedState = () => {
    const state = setupStore().getState()
    return {
        environment: { ...state.environment, onboardingCompleted: true },
    }
}

const admits = (federations: unknown[]) => () =>
    Promise.resolve({ type: 'federations', federations })

const previewsAs = (name: string) => () =>
    Promise.resolve({
        id: JOINABLE_ID,
        name,
        inviteCode: JOINABLE_INVITE,
        meta: {
            federation_name: name,
            welcome_message: `Welcome to ${name}`,
        },
        returningMemberStatus: { type: 'newMember' },
    })

const renderSheet = (
    fedimint: ReturnType<typeof createMockFedimintBridge>,
    { show = true }: { show?: boolean } = {},
) => {
    const onDismiss = jest.fn()
    const onJoin = jest.fn()
    const user = userEvent.setup()
    renderWithProviders(
        <WalletServiceJoinSheet
            show={show}
            onDismiss={onDismiss}
            onJoin={onJoin}
        />,
        { preloadedState: onboardedState(), fedimint },
    )
    return { onDismiss, onJoin, user }
}

describe('WalletServiceJoinSheet', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should show placeholder rows under the same lead the loaded list uses', () => {
        const fedimint = createMockFedimintBridge({
            // never settles
            fiClientSetupPaymentFederations: () => new Promise(() => {}),
        })
        renderSheet(fedimint)

        expect(screen.getByTestId('join-sheet-loading')).toBeOnTheScreen()
        // the shape of the answer, not a ring: the rows land where these are
        expect(screen.queryAllByTestId('join-row-skeleton')).toHaveLength(3)
        // the same lead the list renders, so nothing is rewritten under the
        // user when the rows arrive
        expect(
            screen.getByText(i18n.t('feature.wallet-service.join-sheet-body')),
        ).toBeOnTheScreen()
        // the verdict must not be stated before the lookup has run
        expect(screen.queryByTestId('join-sheet-empty')).toBeNull()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.no-trusted-federation-title'),
            ),
        ).toBeNull()
    })

    // the sheet is one size from the moment it opens: without the reserved
    // height it is spinner-tall, then jumps to the list under a finger already
    // on its way to a row. Asserted per state rather than by rendering each in
    // one test — a second render in a single test unmounts the first renderer.
    it('should reserve the shared body height while checking', () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: () => new Promise(() => {}),
        })
        renderSheet(fedimint)

        expect(reservedHeightOf('join-sheet-loading')).toBe(
            JOIN_SHEET_MIN_BODY_HEIGHT,
        )
    })

    it('should list the admitted services the user has not joined', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: admits([
                {
                    federationId: JOINABLE_ID,
                    inviteCode: JOINABLE_INVITE,
                    joined: false,
                },
            ]),
            federationPreview: previewsAs('Fedi Test Service'),
        })
        renderSheet(fedimint)

        expect(await screen.findByText('Fedi Test Service')).toBeOnTheScreen()
        expect(
            screen.getByTestId(`join-wallet-service-${JOINABLE_ID}`),
        ).toBeOnTheScreen()
        expect(screen.queryByTestId('join-sheet-empty')).toBeNull()
    })

    it('should hand the chosen service back rather than joining it here', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: admits([
                {
                    federationId: JOINABLE_ID,
                    inviteCode: JOINABLE_INVITE,
                    joined: false,
                },
            ]),
            federationPreview: previewsAs('Fedi Test Service'),
        })
        const { onJoin, user } = renderSheet(fedimint)

        await user.press(
            await screen.findByTestId(`join-wallet-service-${JOINABLE_ID}`),
        )

        expect(onJoin).toHaveBeenCalledTimes(1)
        expect(onJoin).toHaveBeenCalledWith(
            expect.objectContaining({
                id: JOINABLE_ID,
                name: 'Fedi Test Service',
                inviteCode: JOINABLE_INVITE,
            }),
        )
    })

    // a member the user is already in is not an offer to join
    it('should offer nothing when every admitted service is already joined', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: admits([
                {
                    federationId: JOINABLE_ID,
                    inviteCode: JOINABLE_INVITE,
                    joined: true,
                },
            ]),
        })
        renderSheet(fedimint)

        expect(await screen.findByTestId('join-sheet-empty')).toBeOnTheScreen()
        expect(
            screen.queryByTestId(`join-wallet-service-${JOINABLE_ID}`),
        ).toBeNull()
    })

    it('should say no wallet can pay when the admitted set is empty', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: admits([]),
        })
        renderSheet(fedimint)

        expect(await screen.findByTestId('join-sheet-empty')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.no-trusted-federation-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.join-sheet-empty-body'),
            ),
        ).toBeOnTheScreen()
        expect(reservedHeightOf('join-sheet-empty')).toBe(
            JOIN_SHEET_MIN_BODY_HEIGHT,
        )
    })

    // A failed check is an unknown, not an empty one. Saying "no wallet can pay
    // for setup" here reads as settled and stops the user looking, on the
    // strength of a relay timeout.
    it('should distinguish a failed check from an empty one', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: () =>
                Promise.resolve({
                    type: 'error',
                    error: {
                        code: 'registry',
                        message: 'registry unreachable',
                        detail: null,
                    },
                }),
        })
        renderSheet(fedimint)

        expect(await screen.findByTestId('join-sheet-error')).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.join-sheet-error-title'),
            ),
        ).toBeOnTheScreen()
        expect(screen.queryByTestId('join-sheet-empty')).toBeNull()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.no-trusted-federation-title'),
            ),
        ).toBeNull()
        expect(reservedHeightOf('join-sheet-error')).toBe(
            JOIN_SHEET_MIN_BODY_HEIGHT,
        )
    })

    it('should report a thrown lookup as a failed check, not an empty one', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: () =>
                Promise.reject(new Error('transport died')),
        })
        renderSheet(fedimint)

        expect(await screen.findByTestId('join-sheet-error')).toBeOnTheScreen()
        expect(screen.queryByTestId('join-sheet-empty')).toBeNull()
    })

    // Reopening the sheet is the retry, so both levers return to the screen
    // rather than refetching in place. The screen keeps its join offer, which
    // is what makes the next open possible.
    it('should return to the screen from the empty state', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: admits([]),
        })
        const { onDismiss, user } = renderSheet(fedimint)

        await user.press(
            await screen.findByTestId('join-sheet-check-again-button'),
        )

        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('should return to the screen from the failed-check state', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: () =>
                Promise.reject(new Error('transport died')),
        })
        const { onDismiss, user } = renderSheet(fedimint)

        await user.press(
            await screen.findByTestId('join-sheet-try-again-button'),
        )

        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    // The lookup belongs to the open, not to the screen. A closed sheet that
    // kept asking would spend a ten-second relay fetch nobody is waiting on,
    // and would leave a stale answer ready to show as the current one.
    it('should not run the lookup while the sheet is closed', () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: admits([]),
        })
        renderSheet(fedimint, { show: false })

        expect(fedimint.fiClientSetupPaymentFederations).not.toHaveBeenCalled()
    })

    it('should run a fresh lookup on each open', async () => {
        const fedimint = createMockFedimintBridge({
            fiClientSetupPaymentFederations: admits([]),
        })
        const onDismiss = jest.fn()
        const onJoin = jest.fn()
        const { rerender } = renderWithProviders(
            <WalletServiceJoinSheet
                show
                onDismiss={onDismiss}
                onJoin={onJoin}
            />,
            { preloadedState: onboardedState(), fedimint },
        )

        await waitFor(() => {
            expect(
                fedimint.fiClientSetupPaymentFederations,
            ).toHaveBeenCalledTimes(1)
        })

        rerender(
            <WalletServiceJoinSheet
                show={false}
                onDismiss={onDismiss}
                onJoin={onJoin}
            />,
        )
        rerender(
            <WalletServiceJoinSheet
                show
                onDismiss={onDismiss}
                onJoin={onJoin}
            />,
        )

        await waitFor(() => {
            expect(
                fedimint.fiClientSetupPaymentFederations,
            ).toHaveBeenCalledTimes(2)
        })
    })
})
