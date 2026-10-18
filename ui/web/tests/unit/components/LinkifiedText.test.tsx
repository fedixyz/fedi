import '@testing-library/jest-dom'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'

import { mockUseRouter } from '../../../jest.setup'
import { LinkifiedText } from '../../../src/components/LinkifiedText'
import { renderWithProviders } from '../../utils/render'

const renderText = (text: string) =>
    renderWithProviders(
        <RouterContext.Provider
            value={{
                ...mockUseRouter,
                route: '/',
                basePath: '',
                isLocaleDomain: false,
                isFallback: false,
                isPreview: false,
                reload: jest.fn(),
                forward: jest.fn(),
                prefetch: jest.fn().mockResolvedValue(undefined),
                beforePopState: jest.fn(),
                events: { ...mockUseRouter.events, emit: jest.fn() },
            }}>
            <LinkifiedText text={text} />
        </RouterContext.Provider>,
    )

describe('/components/LinkifiedText', () => {
    const user = userEvent.setup()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should render text without links as plain text', () => {
        renderText('Welcome aboard')

        expect(screen.getByText('Welcome aboard')).toBeInTheDocument()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('should open external links in a new tab', () => {
        renderText('Read the FAQ at https://fedi.xyz/faq')

        const link = screen.getByRole('link', { name: 'https://fedi.xyz/faq' })
        expect(link).toHaveAttribute('href', 'https://fedi.xyz/faq')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should navigate within the app when a universal deeplink is clicked', async () => {
        const deeplink = 'https://app.fedi.xyz/link#screen=room&id=123'
        renderText(`Join us: ${deeplink}`)

        const link = screen.getByRole('link', { name: deeplink })
        expect(link).toHaveAttribute('href', '/chat/room/123')
        expect(link).not.toHaveAttribute('target')

        await user.click(link)

        expect(mockUseRouter.push).toHaveBeenCalledWith(
            '/chat/room/123',
            '/chat/room/123',
            expect.any(Object),
        )
    })

    it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])(
        'should preserve browser navigation with %s',
        modifier => {
            const url = 'https://app.fedi.xyz/link?screen=chat'
            renderText(`Open ${url}`)
            expect(
                fireEvent.click(screen.getByRole('link', { name: url }), {
                    [modifier]: true,
                }),
            ).toBe(true)
            expect(mockUseRouter.push).not.toHaveBeenCalled()
        },
    )

    it('should leave fedi:// text unlinked', () => {
        renderText('Open fedi://chat now')
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })

    it('should shorten a long external URL without changing its target', () => {
        const url = `https://example.com/help?topic=${'a'.repeat(150)}`
        renderText(`Read ${url}`)
        const link = screen.getByRole('link')
        expect(link).toHaveTextContent(`${url.slice(0, 75)}...`)
        expect(link).toHaveAttribute('href', url)
    })

    it('should preserve a long universal link destination when its label is shortened', async () => {
        const destination = `https://example.com/app?token=${'a'.repeat(150)}#details!`
        const url = `https://app.fedi.xyz/link#screen=browser&url=${encodeURIComponent(destination)}`
        const path = `/browser#url=${encodeURIComponent(destination)}`
        renderText(url)
        const link = screen.getByRole('link')
        expect(link).toHaveTextContent(`${url.slice(0, 75)}...`)
        expect(link).toHaveAttribute('href', path)
        await user.click(link)
        expect(mockUseRouter.push).toHaveBeenCalledWith(
            path,
            path,
            expect.any(Object),
        )
    })
})
