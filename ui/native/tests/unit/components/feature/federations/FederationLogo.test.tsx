import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { View } from 'react-native'

import { theme } from '@fedi/common/constants/theme'
import { renderWithProviders } from '@fedi/native/tests/utils/render'

import { FederationLogo } from '../../../../../components/feature/federations/FederationLogo'

const withIcon = (iconUrl: string) => ({
    id: 'federation-1',
    meta: { 'fedi:federation_icon_url': iconUrl },
})

describe('FederationLogo', () => {
    it('should draw a published svg icon rather than the placeholder', () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/icon.svg')}
                size={40}
            />,
        )

        expect(screen.getByTestId('FederationLogo__Image-svg').props.uri).toBe(
            'https://example.com/icon.svg',
        )
        expect(screen.queryByTestId('FederationLogo__Fallback')).toBeNull()
    })

    it('should draw an svg icon whose url has a query or an uppercase extension', () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/icon.SVG?v=2')}
                size={40}
            />,
        )

        expect(screen.getByTestId('FederationLogo__Image-svg').props.uri).toBe(
            'https://example.com/icon.SVG?v=2',
        )
    })

    it('should draw a url that only ends in the letters svg as a raster icon', () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/getsvg')}
                size={40}
            />,
        )

        expect(screen.getByTestId('FederationLogo__Image')).toBeOnTheScreen()
        expect(screen.queryByTestId('FederationLogo__Image-svg')).toBeNull()
    })

    it('should draw a published raster icon from its url', () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/icon.png')}
                size={40}
            />,
        )

        expect(
            screen.getByTestId('FederationLogo__Image').props.source,
        ).toEqual({ uri: 'https://example.com/icon.png', cache: 'force-cache' })
        expect(screen.queryByTestId('FederationLogo__Image-svg')).toBeNull()
    })

    it('should size an svg icon from a named size', () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/icon.svg')}
                size="md"
            />,
        )

        const icon = screen.getByTestId('FederationLogo__Image-svg')
        expect(icon.props.width).toBe(theme.sizes.md)
        expect(icon.props.height).toBe(theme.sizes.md)
    })

    it('should fall back to the placeholder when an svg icon cannot be loaded', () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/missing.svg')}
                size={40}
            />,
        )

        fireEvent(screen.getByTestId('FederationLogo__Image-svg'), 'error')

        expect(screen.getByTestId('FederationLogo__Fallback')).toBeOnTheScreen()
        expect(screen.queryByTestId('FederationLogo__Image-svg')).toBeNull()
    })

    it('should fall back to the placeholder when a raster icon cannot be loaded', () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/not-an-image')}
                size={40}
            />,
        )

        fireEvent(screen.getByTestId('FederationLogo__Image'), 'error')

        expect(screen.getByTestId('FederationLogo__Fallback')).toBeOnTheScreen()
        expect(screen.queryByTestId('FederationLogo__Image')).toBeNull()
    })

    it('should show the placeholder when the federation publishes no icon', () => {
        renderWithProviders(
            <FederationLogo
                federation={{ id: 'federation-1', meta: {} }}
                size={40}
            />,
        )

        expect(screen.getByTestId('FederationLogo__Fallback')).toBeOnTheScreen()
    })

    it("should draw the caller's fallback when no icon is published", () => {
        renderWithProviders(
            <FederationLogo
                federation={{ id: 'federation-1', meta: {} }}
                size={40}
                fallback={<View testID="caller-fallback" />}
            />,
        )

        expect(screen.getByTestId('caller-fallback')).toBeOnTheScreen()
    })

    it("should draw the caller's fallback when the icon cannot be loaded", () => {
        renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/missing.png')}
                size={40}
                fallback={<View testID="caller-fallback" />}
            />,
        )

        fireEvent(screen.getByTestId('FederationLogo__Image'), 'error')

        expect(screen.getByTestId('caller-fallback')).toBeOnTheScreen()
    })

    it('should try again when the federation publishes a different url', () => {
        const { rerender } = renderWithProviders(
            <FederationLogo
                federation={withIcon('https://example.com/broken.png')}
                size={40}
            />,
        )

        fireEvent(screen.getByTestId('FederationLogo__Image'), 'error')
        expect(screen.getByTestId('FederationLogo__Fallback')).toBeOnTheScreen()

        rerender(
            <FederationLogo
                federation={withIcon('https://example.com/fixed.png')}
                size={40}
            />,
        )

        expect(
            screen.getByTestId('FederationLogo__Image').props.source,
        ).toEqual({
            uri: 'https://example.com/fixed.png',
            cache: 'force-cache',
        })
    })
})
