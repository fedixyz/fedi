import { Button } from '@rneui/themed'
import {
    act,
    cleanup,
    screen,
    userEvent,
    waitFor,
    within,
} from '@testing-library/react-native'
import React from 'react'

import {
    setFederations,
    setFiClientStatus,
    setFiStatus,
    setupStore,
} from '@fedi/common/redux'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import type { MSats } from '@fedi/common/types'
import {
    RpcFiFormationSnapshot,
    RpcFiOperationError,
    RpcFiSeatProgress,
} from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import WalletServiceProgress from '../../../screens/WalletServiceProgress'
import { reset } from '../../../state/navigation'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

const makeFormation = (
    overrides: Partial<RpcFiFormationSnapshot> = {},
): RpcFiFormationSnapshot => ({
    formationId: 'formation-1',
    phase: 'acquiringSeats',
    intent: {
        federationName: 'My Wallet Service',
        federationSize: 7,
        guardianFeePpm: 0,
        plan: 'infiniteBestEffort',
        fedimintdVersion: '0.11.1-fedi13',
        maxTotalMsats: null,
    },
    seats: [],
    freshness: 'fresh',
    actionRequired: null,
    paymentOutputsStarted: false,
    milestones: {
        ecashSent: false,
        guardiansConfirmed: false,
        walletServiceCreated: false,
    },
    inviteCode: null,
    lastError: null,
    ...overrides,
})

const renderProgress = ({
    formation = makeFormation(),
    clientError = null,
}: {
    formation?: RpcFiFormationSnapshot
    clientError?: RpcFiOperationError | null
} = {}) => {
    const user = userEvent.setup()
    const fedimint = createMockFedimintBridge({})
    const store = setupStore({
        fi: {
            status: null,
            clientError,
            creationHighWaterMark: null,
            draft: { name: '', size: 7 },
            selectionPreview: null,
            replacementPreview: null,
            eligiblePayers: null,
            operationError: null,
            payerError: null,
            liquidity: {
                operation: null,
                hasRead: true,
                errorCode: null,
                isRequesting: false,
            },
        },
    })
    // through the actions rather than as preloaded state: in the app every
    // snapshot arrives this way, and it is the reducer that records how far
    // the formation has got. A client error arrives on the same stream, after
    // the status, which is why it cannot simply be preloaded either.
    store.dispatch(setFiStatus({ type: 'formation', formation }))
    if (clientError)
        store.dispatch(
            setFiClientStatus({ type: 'failed', error: clientError }),
        )

    renderWithProviders(
        <WalletServiceProgress
            navigation={mockNavigation as any}
            route={mockRoute as any}
        />,
        { store, fedimint },
    )

    return { user, fedimint, store }
}

/**
 * The RNE `Button` styling props (`outline`, `text`, `day`) live on the
 * component, not on the host element `testID` resolves to, so a style
 * assertion has to reach the component.
 */
const buttonPropsFor = (testID: string) =>
    screen
        // rneui exports Button as an FC-or-forwardRef union, which the matcher
        // refuses; the runtime value is one component either way
        .UNSAFE_getAllByType(Button as unknown as React.ComponentType)
        .find(node => node.props.testID === testID)?.props

describe('WalletServiceProgress screen', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render every milestone detail line in every state', async () => {
        renderProgress({
            formation: makeFormation({
                milestones: {
                    ecashSent: true,
                    guardiansConfirmed: false,
                    walletServiceCreated: false,
                },
            }),
        })

        // a completed step keeps its description, and so does one not started:
        // hiding it made each card shrink as it finished and jolted the list
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.stage-ecash-sent-detail'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t(
                    'feature.wallet-service.stage-guardians-confirmed-detail',
                ),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.stage-created-detail'),
            ),
        ).toBeOnTheScreen()
    })

    it('should spin the ring under the active milestone only', async () => {
        renderProgress()

        expect(await screen.findAllByTestId('milestone-spinner')).toHaveLength(
            1,
        )
    })

    it('should show a disabled continue button while formation is under way', async () => {
        renderProgress()

        // the primary slot is filled from the first frame and only ever
        // changes state, so the footer never reshapes as the work proceeds
        const continueButton = await screen.findByTestId('continue-button')
        expect(continueButton).toBeDisabled()
        await screen.findByTestId('return-home-button')
        expect(screen.queryByTestId('ready-mark')).toBeNull()
    })

    it('should not navigate when the disabled continue button is pressed', async () => {
        const { user } = renderProgress()

        await user.press(await screen.findByTestId('continue-button'))

        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
    })

    it('should offer no way to cancel the setup', async () => {
        renderProgress()

        // formation is durable and the driver resumes it on its own, so the
        // only exit offered is leaving the screen
        await screen.findByTestId('return-home-button')
        expect(screen.queryByTestId('abandon-setup-button')).toBeNull()
        expect(screen.queryByTestId('abandon-unavailable-note')).toBeNull()
    })

    it('should show the success state once creation completes', async () => {
        renderProgress({
            formation: makeFormation({
                phase: 'formed',
                milestones: {
                    ecashSent: true,
                    guardiansConfirmed: true,
                    walletServiceCreated: true,
                },
            }),
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.progress-ready-title'),
            ),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('ready-mark')).toBeOnTheScreen()
        // the success state waits for the user; it must not navigate itself
        expect(mockNavigation.dispatch).not.toHaveBeenCalled()
    })

    it('should route to the fee screen in onboarding mode when continue is pressed', async () => {
        const { user } = renderProgress({
            formation: makeFormation({
                phase: 'formed',
                milestones: {
                    ecashSent: true,
                    guardiansConfirmed: true,
                    walletServiceCreated: true,
                },
            }),
        })

        const continueButton = await screen.findByTestId('continue-button')
        expect(continueButton).toBeEnabled()

        await user.press(continueButton)
        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            reset('WalletServiceFee', { mode: 'onboarding' }),
        )
    })

    describe('transient errors', () => {
        // the driver republishes `lastError` as null at the top of every
        // attempt and its first backoffs are a second apart, so a raw render
        // strobes. These lock the thresholds that stop it.
        const temporaryTitle = i18n.t(
            'feature.wallet-service.temporary-problem-title',
        )

        beforeEach(() => {
            jest.useFakeTimers()
        })

        afterEach(() => {
            jest.useRealTimers()
        })

        it('should say it is reconnecting straight away without raising a banner', () => {
            renderProgress({
                formation: makeFormation({ lastError: 'timeout' }),
            })

            expect(screen.getByTestId('reconnecting-note')).toBeOnTheScreen()
            expect(screen.queryByText(temporaryTitle)).toBeNull()
        })

        it('should raise the banner once the error outlasts the delay', () => {
            renderProgress({
                formation: makeFormation({ lastError: 'timeout' }),
            })

            act(() => {
                jest.advanceTimersByTime(3_999)
            })
            expect(screen.queryByText(temporaryTitle)).toBeNull()

            act(() => {
                jest.advanceTimersByTime(1)
            })
            expect(screen.getByText(temporaryTitle)).toBeOnTheScreen()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.retrying-automatically'),
                    { exact: false },
                ),
            ).toBeOnTheScreen()
            // the banner takes over; two amber messages saying the same thing
            // in two places is what the quiet line exists to avoid
            expect(screen.queryByTestId('reconnecting-note')).toBeNull()
        })

        it('should never raise a banner for an error the driver clears in time', () => {
            const { store } = renderProgress({
                formation: makeFormation({ lastError: 'timeout' }),
            })

            act(() => {
                jest.advanceTimersByTime(2_000)
            })
            act(() => {
                store.dispatch(
                    setFiStatus({
                        type: 'formation',
                        formation: makeFormation({ lastError: null }),
                    }),
                )
            })
            act(() => {
                jest.advanceTimersByTime(60_000)
            })

            expect(screen.queryByText(temporaryTitle)).toBeNull()
            expect(screen.queryByTestId('reconnecting-note')).toBeNull()
        })

        it('should hold a raised banner through the next optimistic clear', () => {
            const { store } = renderProgress({
                formation: makeFormation({ lastError: 'fleetManager' }),
            })

            act(() => {
                jest.advanceTimersByTime(4_000)
            })
            expect(screen.getByText(temporaryTitle)).toBeOnTheScreen()

            // the next attempt starts and reports no error yet; that is not
            // evidence of recovery, so the banner stays put
            act(() => {
                store.dispatch(
                    setFiStatus({
                        type: 'formation',
                        formation: makeFormation({ lastError: null }),
                    }),
                )
            })
            // the banner had only just appeared, so the minimum visible time
            // governs here, not the shorter clear delay
            act(() => {
                jest.advanceTimersByTime(2_999)
            })
            expect(screen.getByText(temporaryTitle)).toBeOnTheScreen()

            act(() => {
                jest.advanceTimersByTime(1)
            })
            expect(screen.queryByText(temporaryTitle)).toBeNull()
        })

        it('should report a terminal error at once, undamped', () => {
            renderProgress({
                formation: makeFormation({ lastError: 'invalidOptions' }),
            })

            // nothing retries this away, so delaying it only delays the truth
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.setup-blocked-title'),
                ),
            ).toBeOnTheScreen()
            expect(screen.queryByTestId('reconnecting-note')).toBeNull()
        })
    })

    it('should show a terminal error banner with no retry and no continue button', async () => {
        renderProgress({
            formation: makeFormation({ lastError: 'invalidIntent' }),
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.setup-blocked-title'),
            ),
        ).toBeOnTheScreen()
        expect(screen.queryByTestId('continue-button')).toBeNull()
    })

    it('should navigate once to the replacement review screen when a replacement is parked', async () => {
        renderProgress({
            formation: makeFormation({
                actionRequired: {
                    type: 'replaceGuardians',
                    requirements: {
                        replacementId: 'replacement-1',
                        seats: [
                            {
                                index: 0,
                                previousFmanId: 'fman-old-0',
                                previousFmanName: 'old oak',
                                previousQuoteId: 'quote-0',
                                previousLocator: 'locator-0',
                            },
                        ],
                    },
                },
            }),
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.replace-title'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.getByTestId('review-replacements-button'),
        ).toBeOnTheScreen()
        expect(mockNavigation.navigate).toHaveBeenCalledTimes(1)
        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceReplaceReview',
        )
    })

    it('should navigate to the replacement review screen when the button is pressed', async () => {
        const { user } = renderProgress({
            formation: makeFormation({
                actionRequired: {
                    type: 'replaceGuardians',
                    requirements: {
                        replacementId: 'replacement-1',
                        seats: [
                            {
                                index: 0,
                                previousFmanId: 'fman-old-0',
                                previousFmanName: 'old oak',
                                previousQuoteId: 'quote-0',
                                previousLocator: 'locator-0',
                            },
                        ],
                    },
                },
            }),
        })

        // clear the automatic navigation call so the button press is isolated
        mockNavigation.navigate.mockClear()
        await user.press(
            await screen.findByTestId('review-replacements-button'),
        )

        expect(mockNavigation.navigate).toHaveBeenCalledWith(
            'WalletServiceReplaceReview',
        )
    })

    it('should style the return-home exit as a secondary button, not a text link', async () => {
        renderProgress()

        // the exit is a control the user may press, so it carries the house
        // secondary treatment — transparent fill, grey border — rather than
        // reading as a caption under the primary action
        await screen.findByTestId('return-home-button')
        const exit = buttonPropsFor('return-home-button')
        expect(exit?.outline).toBe(true)
        expect(exit?.text).toBeFalsy()
        expect(exit?.day).toBeFalsy()
    })

    it('should offer the same return-home exit when the client cannot be reached', async () => {
        renderProgress({
            clientError: {
                code: 'timeout',
                message: 'client unreachable',
                detail: null,
            },
        })

        // no primary action exists in this state, so the exit is the only
        // control — and it is the same control, in the same style, as everywhere
        // else in the flow
        await screen.findByTestId('return-home-button')
        expect(buttonPropsFor('return-home-button')?.outline).toBe(true)
        expect(screen.queryByTestId('continue-button')).toBeNull()
    })

    it('should offer a return-home button while incomplete with no client error', async () => {
        renderProgress()

        expect(
            await screen.findByTestId('return-home-button'),
        ).toBeOnTheScreen()
    })

    it('should reset navigation home when return-home is pressed', async () => {
        const { user } = renderProgress()

        await user.press(await screen.findByTestId('return-home-button'))

        expect(mockNavigation.dispatch).toHaveBeenCalledWith(
            reset('TabsNavigator', { initialRouteName: 'Home' }),
        )
    })

    it('should hide return-home once the formation completes', async () => {
        renderProgress({
            formation: makeFormation({
                phase: 'formed',
                milestones: {
                    ecashSent: true,
                    guardiansConfirmed: true,
                    walletServiceCreated: true,
                },
            }),
        })

        await screen.findByText(
            i18n.t('feature.wallet-service.progress-ready-title'),
        )
        expect(screen.queryByTestId('return-home-button')).toBeNull()
    })

    it('should not announce anything for an unsynced snapshot on its own', async () => {
        renderProgress({
            formation: makeFormation({ freshness: 'unsynced' }),
        })

        // every driver run republishes the stored snapshot as unsynced before
        // it does any work, so this is the ordinary case, not news
        await screen.findByText(i18n.t('feature.wallet-service.progress-title'))
        expect(screen.queryByTestId('reconnecting-note')).toBeNull()
        expect(
            screen.getByText(i18n.t('feature.wallet-service.progress-notice')),
        ).toBeOnTheScreen()
    })

    it('should not rewind a milestone the user has already been shown', async () => {
        const seatsAt = (phase: RpcFiSeatProgress['phase']) =>
            Array.from({ length: 3 }, (_, index) => ({
                index,
                fmanId: `fman-${index}`,
                fmanName: `seat ${index}`,
                locator: `{"fman":${index}}`,
                seatId: `seat-${index}`,
                guardianCode: null,
                phase,
                freshness: 'fresh' as const,
            }))

        const { store } = renderProgress({
            formation: makeFormation({
                seats: seatsAt('created'),
                milestones: {
                    ecashSent: true,
                    guardiansConfirmed: false,
                    walletServiceCreated: false,
                },
            }),
        })

        expect(
            within(await screen.findByTestId('milestone-2')).getByTestId(
                'milestone-spinner',
            ),
        ).toBeOnTheScreen()

        // one guardian drops out. `milestones` are all() predicates, so the
        // bridge un-sets ecashSent for the whole set — but the user has
        // already watched that step tick, so it must not be taken back
        act(() => {
            store.dispatch(
                setFiStatus({
                    type: 'formation',
                    formation: makeFormation({
                        seats: [
                            { ...seatsAt('created')[0] },
                            {
                                ...seatsAt('created')[1],
                                phase: 'replacementRequired' as const,
                            },
                            { ...seatsAt('created')[2] },
                        ],
                        milestones: {
                            ecashSent: false,
                            guardiansConfirmed: false,
                            walletServiceCreated: false,
                        },
                    }),
                }),
            )
        })

        await waitFor(() => {
            expect(screen.getAllByTestId('milestone-spinner')).toHaveLength(1)
        })
        expect(
            within(screen.getByTestId('milestone-2')).getByTestId(
                'milestone-spinner',
            ),
        ).toBeOnTheScreen()
    })

    /**
     * Reported from a device: the fee step opened carrying "That Wallet Service
     * change isn't possible right now." over a dead Save button.
     *
     * The bridge will not take a guardian fee until the federation is formed,
     * but this screen called the setup finished on the `walletServiceCreated`
     * milestone alone — so Continue handed the user to a screen that could not
     * do anything yet, and said so as an error.
     */
    it('should hold the last step until the phase reports the federation formed', async () => {
        const { store } = renderProgress({
            formation: makeFormation({
                // the milestone is set, but the phase is still finishing
                phase: 'publishingSeatBindings',
                milestones: {
                    ecashSent: true,
                    guardiansConfirmed: true,
                    walletServiceCreated: true,
                },
            }),
        })

        // no premature celebration, and nothing to press on to a screen that
        // would only refuse
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.progress-ready-title'),
            ),
        ).toBeNull()
        expect(screen.getByTestId('continue-button')).toBeDisabled()
        expect(screen.queryByTestId('ready-mark')).toBeNull()

        act(() => {
            store.dispatch(
                setFiStatus({
                    type: 'formation',
                    formation: makeFormation({
                        phase: 'formed',
                        milestones: {
                            ecashSent: true,
                            guardiansConfirmed: true,
                            walletServiceCreated: true,
                        },
                    }),
                }),
            )
        })

        await screen.findByText(
            i18n.t('feature.wallet-service.progress-ready-title'),
        )
        expect(screen.getByTestId('continue-button')).toBeEnabled()
    })

    it('should keep the ready state when a later snapshot reports it unsynced', async () => {
        const formed = makeFormation({
            phase: 'formed',
            milestones: {
                ecashSent: true,
                guardiansConfirmed: true,
                walletServiceCreated: true,
            },
        })
        const { store } = renderProgress({ formation: formed })

        await screen.findByText(
            i18n.t('feature.wallet-service.progress-ready-title'),
        )

        // a driver re-run reloads the snapshot as unsynced, which un-sets
        // walletServiceCreated. Reverting "ready" to "creating" would read as
        // the finished setup having come undone.
        act(() => {
            store.dispatch(
                setFiStatus({
                    type: 'formation',
                    formation: {
                        ...formed,
                        freshness: 'unsynced',
                        phase: 'publishingSeatBindings',
                        milestones: {
                            ...formed.milestones,
                            walletServiceCreated: false,
                        },
                    },
                }),
            )
        })

        await waitFor(() => {
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.progress-ready-title'),
                ),
            ).toBeOnTheScreen()
        })
        expect(screen.getByTestId('continue-button')).toBeEnabled()
    })

    it('should show the confirmed guardian count as the stage-2 detail once seats exist', async () => {
        renderProgress({
            formation: makeFormation({
                milestones: {
                    ecashSent: true,
                    guardiansConfirmed: false,
                    walletServiceCreated: false,
                },
                seats: [
                    {
                        index: 0,
                        fmanId: 'fman-0',
                        fmanName: 'seat zero',
                        locator: 'locator-0',
                        seatId: 'seat-0',
                        guardianCode: 'code-0',
                        phase: 'guardianCodeReady',
                        freshness: 'fresh',
                    },
                    {
                        index: 1,
                        fmanId: null,
                        fmanName: null,
                        locator: 'locator-1',
                        seatId: null,
                        guardianCode: null,
                        phase: 'acquiring',
                        freshness: 'fresh',
                    },
                ],
            }),
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.guardians-confirmed-count', {
                    confirmed: 1,
                    total: 2,
                }),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t(
                    'feature.wallet-service.stage-guardians-confirmed-detail',
                ),
            ),
        ).toBeNull()
    })

    it('should auto-navigate again when a cleared replacement action re-parks with a new id', async () => {
        const firstFormation = makeFormation({
            actionRequired: {
                type: 'replaceGuardians',
                requirements: {
                    replacementId: 'replacement-1',
                    seats: [
                        {
                            index: 0,
                            previousFmanId: 'fman-old-0',
                            previousFmanName: 'old oak',
                            previousQuoteId: 'quote-0',
                            previousLocator: 'locator-0',
                        },
                    ],
                },
            },
        })
        const { store } = renderProgress({ formation: firstFormation })

        expect(
            await screen.findByTestId('review-replacements-button'),
        ).toBeOnTheScreen()
        expect(mockNavigation.navigate).toHaveBeenCalledTimes(1)

        // the action clears (e.g. resolved elsewhere), so the banner and
        // button disappear
        act(() => {
            store.dispatch(
                setFiStatus({
                    type: 'formation',
                    formation: makeFormation({ actionRequired: null }),
                }),
            )
        })
        await waitFor(() => {
            expect(
                screen.queryByTestId('review-replacements-button'),
            ).toBeNull()
        })

        // a fresh action re-parks with a different id; the ref must not be
        // stuck from the first navigation
        act(() => {
            store.dispatch(
                setFiStatus({
                    type: 'formation',
                    formation: makeFormation({
                        actionRequired: {
                            type: 'replaceGuardians',
                            requirements: {
                                replacementId: 'replacement-2',
                                seats: [
                                    {
                                        index: 1,
                                        previousFmanId: 'fman-old-1',
                                        previousFmanName: 'old oak',
                                        previousQuoteId: 'quote-1',
                                        previousLocator: 'locator-1',
                                    },
                                ],
                            },
                        },
                    }),
                }),
            )
        })

        await waitFor(() => {
            expect(mockNavigation.navigate).toHaveBeenCalledTimes(2)
        })
        expect(mockNavigation.navigate).toHaveBeenLastCalledWith(
            'WalletServiceReplaceReview',
        )
    })

    const makePaymentActionFormation = (amountMsats: string) =>
        makeFormation({
            actionRequired: {
                type: 'authorizePayments',
                requirements: {
                    authorizationId: 'authorization-1',
                    totalMsats: amountMsats,
                    maxTotalMsats: null,
                    seats: [
                        {
                            index: 0,
                            fmanId: 'fman-0',
                            fmanName: 'seat zero',
                            quoteId: 'quote-0',
                            paymentFederationId: mockFederation1.id,
                            amountMsats,
                        },
                    ],
                },
            },
        })

    it('should merge approval and shortfall into one banner and offer top up when the payer is short', async () => {
        const { store } = renderProgress({
            formation: makePaymentActionFormation('1500000'),
        })
        act(() => {
            store.dispatch(
                setFederations([
                    { ...mockFederation1, balance: 500000 as MSats },
                ]),
            )
        })

        // the shortfall variant names the blocker rather than stacking a
        // second amber banner that repeats the same amount
        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.approval-shortfall-title'),
            ),
        ).toBeOnTheScreen()
        // the body names the wallet, what it holds and the exact gap to top
        // up (H3 proposal, approved 23 Aug) — dropping any of the three
        // params must fail here
        expect(
            screen.getByText(
                i18n.t('feature.wallet-service.approval-shortfall-body', {
                    amount: '1,500 SATS',
                    federation: mockFederation1.name,
                    available: '500 SATS',
                    gap: '1,000 SATS',
                }),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.approval-needed-title'),
            ),
        ).toBeNull()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.insufficient-title'),
            ),
        ).toBeNull()
        expect(
            screen.getByText(i18n.t('feature.wallet-service.top-up-button')),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.approve-payment'),
            ),
        ).toBeNull()
    })

    it('should show the approve-payment button with no top up when the payer can cover the total', async () => {
        const { store } = renderProgress({
            formation: makePaymentActionFormation('1500000'),
        })
        act(() => {
            store.dispatch(
                setFederations([
                    { ...mockFederation1, balance: 2000000 as MSats },
                ]),
            )
        })

        expect(
            await screen.findByText(
                i18n.t('feature.wallet-service.approve-payment'),
            ),
        ).toBeOnTheScreen()
        expect(
            screen.queryByText(
                i18n.t('feature.wallet-service.insufficient-title'),
            ),
        ).toBeNull()
        expect(
            screen.queryByText(i18n.t('feature.wallet-service.top-up-button')),
        ).toBeNull()
    })
})
