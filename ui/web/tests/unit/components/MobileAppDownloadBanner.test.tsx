import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'

import { MobileAppDownloadBanner } from '../../../src/components/MobileAppDownloadBanner/index'
import AdminPage from '../../../src/pages/settings'
import { renderWithProviders } from '../../utils/render'

describe('/components/MobileAppDownloadBanner', () => {
    const originalUserAgent = navigator.userAgent

    beforeEach(() => {
        jest.spyOn(window, 'open').mockImplementation(() => null)
    })

    afterEach(() => {
        jest.clearAllMocks()
        // Restore original user agent
        Object.defineProperty(navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true,
        })
    })

    describe('when the component is rendered', () => {
        it('should not render when the component is not rendered on a mobile device', () => {
            renderWithProviders(<AdminPage />)

            expect(
                screen.queryByTestId('mobile-app-download-banner'),
            ).not.toBeInTheDocument()
        })
        it('should render when the component is rendered on a mobile device', () => {
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Android',
                configurable: true,
            })
            renderWithProviders(<AdminPage />)

            expect(
                screen.getByTestId('mobile-app-download-banner'),
            ).toBeInTheDocument()
        })
    })

    describe('when rendered on iOS mobile device', () => {
        beforeEach(() => {
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
                configurable: true,
            })
        })

        it('should show only the iOS download button', () => {
            renderWithProviders(<MobileAppDownloadBanner />)

            expect(
                screen.getByTestId('mobile-app-download-ios-button'),
            ).toBeInTheDocument()
            expect(
                screen.queryByTestId('mobile-app-download-android-button'),
            ).not.toBeInTheDocument()
        })

        it('should open iOS App Store when iOS button is clicked', () => {
            renderWithProviders(<MobileAppDownloadBanner />)

            const iosButton = screen.getByTestId(
                'mobile-app-download-ios-button',
            )
            iosButton.click()

            expect(window.open).toHaveBeenCalledWith(
                IOS_APP_STORE_URL,
                '_blank',
            )
        })
    })

    describe('when rendered on Android mobile device', () => {
        beforeEach(() => {
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.104 Mobile Safari/537.36',
                configurable: true,
            })
        })

        it('should show only the Android download button', () => {
            renderWithProviders(<MobileAppDownloadBanner />)

            expect(
                screen.getByTestId('mobile-app-download-android-button'),
            ).toBeInTheDocument()
            expect(
                screen.queryByTestId('mobile-app-download-ios-button'),
            ).not.toBeInTheDocument()
        })

        it('should open Google Play Store when Android button is clicked', () => {
            renderWithProviders(<MobileAppDownloadBanner />)

            const androidButton = screen.getByTestId(
                'mobile-app-download-android-button',
            )
            androidButton.click()

            expect(window.open).toHaveBeenCalledWith(
                ANDROID_PLAY_STORE_URL,
                '_blank',
            )
        })
    })
})
