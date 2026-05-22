import '@testing-library/jest-dom'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FEDI_PREFIX } from '@fedi/common/constants/linking'

import i18n from '../../../src/localization/i18n'
import ResumePage from '../../../src/pages/deeplink-redirect'
import {
    clearPendingDeeplink,
    getPendingDeeplink,
    setPendingDeeplink,
} from '../../../src/utils/localstorage'
import { renderWithProviders } from '../../utils/render'

const PENDING_DEEPLINK = 'https://app.fedi.xyz/link?screen=join&id=test-invite'
const EXPECTED_FEDI_URI = 'fedi://join?id=test-invite'

describe('/pages/deeplink-redirect', () => {
    const originalLocation = window.location
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    let locationHref = ''

    async function advancePastLoadingDelay() {
        await act(async () => {
            jest.advanceTimersByTime(2000)
        })
    }

    beforeEach(() => {
        jest.clearAllTimers()
        jest.useFakeTimers()
        jest.clearAllMocks()
        localStorage.clear()
        locationHref = ''
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                ...window.location,
                get href() {
                    return locationHref
                },
                set href(value: string) {
                    locationHref = value
                },
            },
        })
    })

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        })
        jest.useRealTimers()
        clearPendingDeeplink()
    })

    describe('when the page loads', () => {
        it('should show the activating state before resolving the pending deeplink', () => {
            setPendingDeeplink(PENDING_DEEPLINK)
            renderWithProviders(<ResumePage />)

            expect(
                screen.getByText(
                    i18n.t('feature.onboarding.landing-page-activating'),
                ),
            ).toBeInTheDocument()
            expect(
                screen.queryByText(
                    i18n.t('feature.onboarding.landing-page-activated'),
                ),
            ).not.toBeInTheDocument()
        })

        it('should ignore taps on the hidden loading button', async () => {
            setPendingDeeplink(PENDING_DEEPLINK)
            renderWithProviders(<ResumePage />)

            const hiddenButton = screen.getByRole('button', {
                name: i18n.t('feature.onboarding.landing-page-found-cta'),
                hidden: true,
            })
            await user.click(hiddenButton)

            expect(locationHref).toBe('')
            expect(getPendingDeeplink()).toBe(PENDING_DEEPLINK)
        })
    })

    describe('when a pending deeplink exists', () => {
        beforeEach(() => {
            setPendingDeeplink(PENDING_DEEPLINK)
            renderWithProviders(<ResumePage />)
        })

        it('should show the activated state after loading', async () => {
            await advancePastLoadingDelay()

            await waitFor(() => {
                expect(
                    screen.getByText(
                        i18n.t('feature.onboarding.landing-page-activated'),
                    ),
                ).toBeInTheDocument()
            })
            expect(
                screen.getByRole('button', {
                    name: i18n.t('feature.onboarding.landing-page-found-cta'),
                }),
            ).toBeVisible()
            expect(locationHref).toBe('')
        })

        it('should not navigate until the user taps continue', async () => {
            await advancePastLoadingDelay()

            await waitFor(() => {
                expect(
                    screen.getByText(
                        i18n.t('feature.onboarding.landing-page-activated'),
                    ),
                ).toBeInTheDocument()
            })
            expect(locationHref).toBe('')
            expect(getPendingDeeplink()).toBe(PENDING_DEEPLINK)
        })

        it('should open the pending deeplink and clear storage when continue is tapped', async () => {
            await advancePastLoadingDelay()

            const continueButton = await screen.findByRole('button', {
                name: i18n.t('feature.onboarding.landing-page-found-cta'),
            })
            await user.click(continueButton)

            expect(locationHref).toBe(EXPECTED_FEDI_URI)
            expect(getPendingDeeplink()).toBeNull()
        })
    })

    describe('when no pending deeplink exists', () => {
        beforeEach(() => {
            renderWithProviders(<ResumePage />)
        })

        it('should show the not-found state after loading', async () => {
            await advancePastLoadingDelay()

            await waitFor(() => {
                expect(
                    screen.getByText(
                        i18n.t('feature.onboarding.landing-page-error-title'),
                    ),
                ).toBeInTheDocument()
            })
            expect(
                screen.getByRole('button', {
                    name: i18n.t('feature.onboarding.landing-page-error-cta'),
                }),
            ).toBeVisible()
        })

        it('should open fedi:// when go back is tapped', async () => {
            await advancePastLoadingDelay()

            const goBackButton = await screen.findByRole('button', {
                name: i18n.t('feature.onboarding.landing-page-error-cta'),
            })
            await user.click(goBackButton)

            expect(locationHref).toBe(FEDI_PREFIX)
        })
    })
})
