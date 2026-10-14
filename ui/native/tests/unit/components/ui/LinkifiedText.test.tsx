import { NavigationContainerRef } from '@react-navigation/native'
import { cleanup, screen, userEvent } from '@testing-library/react-native'
import { Linking } from 'react-native'

import { getNavigationLink } from '@fedi/common/utils/linking'
import { makeLog } from '@fedi/common/utils/log'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import LinkifiedText from '../../../../components/ui/LinkifiedText'
import { RootStackParamList } from '../../../../types/navigation'
import {
    getInternalLinkResetAction,
    patchLinkingOpenURL,
} from '../../../../utils/linking'

jest.mock('@fedi/common/utils/log', () => {
    const log = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }
    return { makeLog: () => log }
})
const mockWarn = makeLog('test').warn

describe('components/ui/LinkifiedText', () => {
    const user = userEvent.setup()
    const originalOpenURL = Linking.openURL
    const navigationRef = {
        isReady: jest.fn(() => true),
        dispatch: jest.fn(),
    }

    beforeEach(() => {
        jest.clearAllMocks()
        patchLinkingOpenURL(
            navigationRef as unknown as NavigationContainerRef<RootStackParamList>,
        )
    })

    afterEach(() => {
        Linking.openURL = originalOpenURL
        cleanup()
    })

    it('should render text without links as plain text', () => {
        renderWithProviders(<LinkifiedText>Welcome aboard</LinkifiedText>)

        expect(screen.getByText('Welcome aboard')).toBeOnTheScreen()
        expect(screen.queryByRole('link')).not.toBeOnTheScreen()
    })

    it('should open external links outside the app', async () => {
        renderWithProviders(
            <LinkifiedText>Read the FAQ at https://fedi.xyz/faq</LinkifiedText>,
        )

        await user.press(
            screen.getByRole('link', { name: 'https://fedi.xyz/faq' }),
        )

        expect(originalOpenURL).toHaveBeenCalledWith('https://fedi.xyz/faq')
        expect(navigationRef.dispatch).not.toHaveBeenCalled()
    })

    it.each([
        'https://app.fedi.xyz/link#screen=room&id=123',
        'https://app.fedi.xyz/link?screen=chat',
    ])('should navigate within the app when %s is pressed', async url => {
        renderWithProviders(<LinkifiedText>{`Join us: ${url}`}</LinkifiedText>)

        await user.press(screen.getByRole('link', { name: url }))

        expect(originalOpenURL).not.toHaveBeenCalled()
        expect(navigationRef.dispatch).toHaveBeenCalledWith(
            getInternalLinkResetAction(getNavigationLink(url) ?? ''),
        )
    })

    it('should handle failed links without logging their payload', async () => {
        const url = 'https://example.com/claim?token=private-token'
        jest.mocked(originalOpenURL).mockRejectedValueOnce(new Error(url))
        renderWithProviders(<LinkifiedText>{url}</LinkifiedText>)

        await user.press(screen.getByRole('link', { name: url }))

        expect(mockWarn).toHaveBeenCalledWith('Failed to open link')
        expect(mockWarn).toHaveBeenCalledTimes(1)
    })

    it('should leave fedi:// text unlinked', () => {
        renderWithProviders(<LinkifiedText>Open fedi://chat</LinkifiedText>)
        expect(screen.queryByRole('link')).not.toBeOnTheScreen()
    })

    it('should shorten a long external URL without changing its target', async () => {
        const url = `https://example.com/help?topic=${'a'.repeat(150)}`
        renderWithProviders(<LinkifiedText>{url}</LinkifiedText>)
        await user.press(
            screen.getByRole('link', { name: `${url.slice(0, 75)}...` }),
        )
        expect(originalOpenURL).toHaveBeenCalledWith(url)
    })

    it('should preserve a long universal link destination when its label is shortened', async () => {
        const destination = `https://example.com/app?token=${'a'.repeat(150)}#details!`
        const url = `https://app.fedi.xyz/link#screen=browser&url=${encodeURIComponent(destination)}`
        renderWithProviders(<LinkifiedText>{url}</LinkifiedText>)
        await user.press(
            screen.getByRole('link', { name: `${url.slice(0, 75)}...` }),
        )
        expect(originalOpenURL).not.toHaveBeenCalled()
        expect(navigationRef.dispatch).toHaveBeenCalledWith(
            getInternalLinkResetAction(getNavigationLink(url) ?? ''),
        )
    })
})
