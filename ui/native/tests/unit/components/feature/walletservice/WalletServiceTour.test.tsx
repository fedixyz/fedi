import {
    cleanup,
    screen,
    userEvent,
    waitFor,
} from '@testing-library/react-native'
import { StyleSheet, type View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import {
    WalletServiceTour,
    resolveModalTopOffset,
    resolveTourCardPlacement,
    resolveTourHole,
    type WalletServiceTourStep,
} from '../../../../../components/feature/walletservice/WalletServiceTour'
import i18n from '../../../../../localization/i18n'
import { renderWithProviders } from '../../../../utils/render'

/**
 * A ref whose node measures to a fixed window rect. Passing `null` stands for a
 * control that is not on screen, which is how a step gets dropped.
 */
const mockTargetRef = (
    rect: { x: number; y: number; width: number; height: number } | null,
): React.RefObject<View | null> =>
    ({
        current: rect
            ? {
                  measureInWindow: (
                      cb: (
                          x: number,
                          y: number,
                          width: number,
                          height: number,
                      ) => void,
                  ) => cb(rect.x, rect.y, rect.width, rect.height),
              }
            : null,
    }) as unknown as React.RefObject<View | null>

const BALANCE_STEP = {
    titleKey: 'feature.wallet-service.tour-balance-title',
    bodyKey: 'feature.wallet-service.tour-balance-body',
} as const
const WITHDRAW_STEP = {
    titleKey: 'feature.wallet-service.tour-withdraw-title',
    bodyKey: 'feature.wallet-service.tour-withdraw-body',
} as const
const SETTINGS_STEP = {
    titleKey: 'feature.wallet-service.tour-settings-title',
    bodyKey: 'feature.wallet-service.tour-settings-body',
} as const

const threeSteps = (): WalletServiceTourStep[] => [
    {
        ...BALANCE_STEP,
        ref: mockTargetRef({ x: 20, y: 180, width: 280, height: 100 }),
    },
    {
        ...WITHDRAW_STEP,
        ref: mockTargetRef({ x: 20, y: 300, width: 280, height: 55 }),
    },
    {
        ...SETTINGS_STEP,
        ref: mockTargetRef({ x: 268, y: 56, width: 36, height: 36 }),
    },
]

describe('components/feature/walletservice/WalletServiceTour', () => {
    const user = userEvent.setup()

    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    describe('resolveTourHole', () => {
        it('should pad the target on every side', () => {
            expect(
                resolveTourHole({ x: 20, y: 180, width: 280, height: 100 }),
            ).toEqual({ x: 12, y: 172, width: 296, height: 116 })
        })

        it('should round a fractional measurement so the dim bands meet exactly', () => {
            expect(
                resolveTourHole({
                    x: 19.6,
                    y: 179.4,
                    width: 280.2,
                    height: 100.8,
                }),
            ).toEqual({ x: 12, y: 171, width: 296, height: 117 })
        })
    })

    describe('resolveModalTopOffset', () => {
        it('should push the drawing down by the status bar on android', () => {
            expect(resolveModalTopOffset('android', 35)).toBe(35)
        })

        it('should read the height per device rather than assuming one', () => {
            expect(resolveModalTopOffset('android', 24)).toBe(24)
            expect(resolveModalTopOffset('android', 48)).toBe(48)
        })

        it('should not shift ios, where the modal shares the window space', () => {
            expect(resolveModalTopOffset('ios', 47)).toBe(0)
        })

        it('should treat an unreported status bar height as no shift', () => {
            expect(resolveModalTopOffset('android', undefined)).toBe(0)
            expect(resolveModalTopOffset('android', null)).toBe(0)
        })
    })

    describe('resolveTourCardPlacement', () => {
        const base = {
            windowHeight: 874,
            insetTop: 0,
            insetBottom: 0,
        }

        it('should sit below the hole when there is room', () => {
            expect(
                resolveTourCardPlacement({
                    ...base,
                    hole: { x: 12, y: 172, width: 296, height: 116 },
                    cardHeight: 215,
                }),
            ).toEqual({ top: 302, maxHeight: null })
        })

        it('should flip above the hole when the card would overflow the bottom', () => {
            expect(
                resolveTourCardPlacement({
                    ...base,
                    windowHeight: 568,
                    hole: { x: 12, y: 292, width: 296, height: 71 },
                    cardHeight: 215,
                }),
            ).toEqual({ top: 63, maxHeight: null })
        })

        it('should subtract the safe area from the room available below', () => {
            // the same hole and card that fit with no insets no longer fit once
            // a home indicator takes the bottom of the window
            expect(
                resolveTourCardPlacement({
                    ...base,
                    windowHeight: 600,
                    insetBottom: 34,
                    hole: { x: 12, y: 300, width: 296, height: 60 },
                    cardHeight: 215,
                }).top,
            ).not.toBe(374)
        })

        it('should never place the card above the top safe area when it flips', () => {
            const placement = resolveTourCardPlacement({
                ...base,
                windowHeight: 700,
                insetTop: 59,
                hole: { x: 12, y: 400, width: 296, height: 71 },
                cardHeight: 215,
            })
            expect(placement.top).toBeGreaterThanOrEqual(59 + 16)
        })

        it('should cap the card into the gap below when neither side fits', () => {
            // a hole that takes most of a short window: below is the larger gap
            const placement = resolveTourCardPlacement({
                ...base,
                windowHeight: 420,
                hole: { x: 12, y: 40, width: 296, height: 180 },
                cardHeight: 300,
            })
            expect(placement).toEqual({ top: 234, maxHeight: 170 })
        })

        it('should cap the card into the gap above when that is the larger side', () => {
            const placement = resolveTourCardPlacement({
                ...base,
                windowHeight: 420,
                hole: { x: 12, y: 240, width: 296, height: 150 },
                cardHeight: 300,
            })
            expect(placement).toEqual({ top: 16, maxHeight: 210 })
        })

        it('should keep the capped card clear of the hole it describes', () => {
            const hole = { x: 12, y: 40, width: 296, height: 180 }
            const placement = resolveTourCardPlacement({
                ...base,
                windowHeight: 420,
                hole,
                cardHeight: 300,
            })
            const cardBottom = placement.top + (placement.maxHeight ?? 300)
            const cardOverlapsHole =
                placement.top < hole.y + hole.height && cardBottom > hole.y
            expect(cardOverlapsHole).toBe(false)
        })

        it('should never report a negative height cap', () => {
            const placement = resolveTourCardPlacement({
                ...base,
                windowHeight: 200,
                hole: { x: 12, y: 0, width: 296, height: 400 },
                cardHeight: 300,
            })
            expect(placement.maxHeight).toBeGreaterThanOrEqual(0)
        })
    })

    describe('rendering', () => {
        it('should render nothing while it is not shown', async () => {
            renderWithProviders(
                <WalletServiceTour
                    show={false}
                    steps={threeSteps()}
                    onDone={jest.fn()}
                />,
            )
            expect(screen.queryByTestId('wallet-service-tour-card')).toBeNull()
        })

        it('should open on the first step', async () => {
            renderWithProviders(
                <WalletServiceTour
                    show
                    steps={threeSteps()}
                    onDone={jest.fn()}
                />,
            )
            expect(
                await screen.findByText(i18n.t(BALANCE_STEP.titleKey)),
            ).toBeTruthy()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.tour-step', {
                        current: 1,
                        total: 3,
                    }),
                ),
            ).toBeTruthy()
        })

        it('should count only the steps whose target is on screen', async () => {
            const steps: WalletServiceTourStep[] = [
                { ...BALANCE_STEP, ref: mockTargetRef(null) },
                {
                    ...WITHDRAW_STEP,
                    ref: mockTargetRef({
                        x: 20,
                        y: 300,
                        width: 280,
                        height: 55,
                    }),
                },
                {
                    ...SETTINGS_STEP,
                    ref: mockTargetRef({
                        x: 268,
                        y: 56,
                        width: 36,
                        height: 36,
                    }),
                },
            ]
            renderWithProviders(
                <WalletServiceTour show steps={steps} onDone={jest.fn()} />,
            )
            expect(
                await screen.findByText(i18n.t(WITHDRAW_STEP.titleKey)),
            ).toBeTruthy()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.tour-step', {
                        current: 1,
                        total: 2,
                    }),
                ),
            ).toBeTruthy()
        })

        it('should render nothing when no target can be measured', async () => {
            renderWithProviders(
                <WalletServiceTour
                    show
                    steps={[
                        { ...BALANCE_STEP, ref: mockTargetRef(null) },
                        { ...WITHDRAW_STEP, ref: mockTargetRef(null) },
                    ]}
                    onDone={jest.fn()}
                />,
            )
            await waitFor(() =>
                expect(
                    screen.queryByTestId('wallet-service-tour-card'),
                ).toBeNull(),
            )
        })

        it('should drop a target that measures to zero size', async () => {
            renderWithProviders(
                <WalletServiceTour
                    show
                    steps={[
                        {
                            ...BALANCE_STEP,
                            ref: mockTargetRef({
                                x: 0,
                                y: 0,
                                width: 0,
                                height: 0,
                            }),
                        },
                        {
                            ...WITHDRAW_STEP,
                            ref: mockTargetRef({
                                x: 20,
                                y: 300,
                                width: 280,
                                height: 55,
                            }),
                        },
                    ]}
                    onDone={jest.fn()}
                />,
            )
            expect(
                await screen.findByText(i18n.t(WITHDRAW_STEP.titleKey)),
            ).toBeTruthy()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.tour-step', {
                        current: 1,
                        total: 1,
                    }),
                ),
            ).toBeTruthy()
        })
    })

    // `nightLinearGradient` is a translucent white sheen, not a colour. On the
    // shared Button it lands on RNEUI's own ink; on this bare Pressable it
    // landed on the white tour card and the CTA read as a pale grey pill.
    it('should render the next button as ink, not as the bare sheen', async () => {
        renderWithProviders(
            <WalletServiceTour show steps={threeSteps()} onDone={jest.fn()} />,
        )
        await screen.findByText(i18n.t(BALANCE_STEP.titleKey))

        const next = screen.getByTestId('wallet-service-tour-next')
        const style = StyleSheet.flatten(
            typeof next.props.style === 'function'
                ? next.props.style({ pressed: false })
                : next.props.style,
        )

        expect(style.backgroundColor).toBe(fediTheme.colors.primary)
        // the sheen stays on top of the ink rather than replacing it
        expect(style.experimental_backgroundImage).toContain('linear-gradient')
    })

    describe('advancing', () => {
        it('should move to the next step and re-label the counter', async () => {
            renderWithProviders(
                <WalletServiceTour
                    show
                    steps={threeSteps()}
                    onDone={jest.fn()}
                />,
            )
            await screen.findByText(i18n.t(BALANCE_STEP.titleKey))

            await user.press(screen.getByTestId('wallet-service-tour-next'))

            expect(
                screen.getByText(i18n.t(WITHDRAW_STEP.titleKey)),
            ).toBeTruthy()
            expect(
                screen.getByText(
                    i18n.t('feature.wallet-service.tour-step', {
                        current: 2,
                        total: 3,
                    }),
                ),
            ).toBeTruthy()
        })

        it('should label the last step as done rather than next', async () => {
            renderWithProviders(
                <WalletServiceTour
                    show
                    steps={threeSteps()}
                    onDone={jest.fn()}
                />,
            )
            await screen.findByText(i18n.t(BALANCE_STEP.titleKey))

            await user.press(screen.getByTestId('wallet-service-tour-next'))
            await user.press(screen.getByTestId('wallet-service-tour-next'))

            expect(
                screen.getByText(i18n.t(SETTINGS_STEP.titleKey)),
            ).toBeTruthy()
            expect(
                screen.getByText(i18n.t('feature.wallet-service.tour-done')),
            ).toBeTruthy()
            expect(screen.queryByText(i18n.t('words.next'))).toBeNull()
        })

        it('should finish from the last step', async () => {
            const onDone = jest.fn()
            renderWithProviders(
                <WalletServiceTour show steps={threeSteps()} onDone={onDone} />,
            )
            await screen.findByText(i18n.t(BALANCE_STEP.titleKey))

            await user.press(screen.getByTestId('wallet-service-tour-next'))
            await user.press(screen.getByTestId('wallet-service-tour-next'))
            expect(onDone).not.toHaveBeenCalled()

            await user.press(screen.getByTestId('wallet-service-tour-next'))
            expect(onDone).toHaveBeenCalledTimes(1)
        })
    })

    describe('leaving early', () => {
        it('should finish from skip on the first step', async () => {
            const onDone = jest.fn()
            renderWithProviders(
                <WalletServiceTour show steps={threeSteps()} onDone={onDone} />,
            )
            await screen.findByText(i18n.t(BALANCE_STEP.titleKey))

            await user.press(screen.getByTestId('wallet-service-tour-skip'))

            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('should finish from skip part way through', async () => {
            const onDone = jest.fn()
            renderWithProviders(
                <WalletServiceTour show steps={threeSteps()} onDone={onDone} />,
            )
            await screen.findByText(i18n.t(BALANCE_STEP.titleKey))

            await user.press(screen.getByTestId('wallet-service-tour-next'))
            await user.press(screen.getByTestId('wallet-service-tour-skip'))

            expect(onDone).toHaveBeenCalledTimes(1)
        })

        it('should finish when the scrim is tapped', async () => {
            const onDone = jest.fn()
            renderWithProviders(
                <WalletServiceTour show steps={threeSteps()} onDone={onDone} />,
            )
            await screen.findByText(i18n.t(BALANCE_STEP.titleKey))

            await user.press(screen.getByTestId('wallet-service-tour-scrim'))

            expect(onDone).toHaveBeenCalledTimes(1)
        })
    })
})
