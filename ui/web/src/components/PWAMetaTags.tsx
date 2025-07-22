import Head from 'next/head'
import React from 'react'

import { theme as fediTheme } from '@fedi/common/constants/theme'

const metaAppName = 'Fedi'
const metaDescription = 'Fedi in your browser'

export const PWAMetaTags: React.FC = () => {
    return (
        <Head>
            <title>{metaAppName}</title>
            <meta name="description" content={metaDescription} />

            {/* PWA configuration */}
            <meta name="application-name" content={metaAppName} />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta
                name="apple-mobile-web-app-status-bar-style"
                content="default"
            />
            <meta name="apple-mobile-web-app-title" content={metaAppName} />
            <meta name="format-detection" content="telephone=no" />
            <meta name="theme-color" content={fediTheme.colors.white} />
            <link rel="manifest" href="/manifest.json" />

            {/* iOS app icons */}
            <link
                rel="apple-touch-icon"
                href="/assets/icons/apple-icon-iphone.png"
            />
            <link
                rel="apple-touch-icon"
                sizes="152x152"
                href="/assets/icons/apple-icon-ipad.png"
            />
            <link
                rel="apple-touch-icon"
                sizes="180x180"
                href="/assets/icons/apple-icon-iphone-retina.png"
            />
            <link
                rel="apple-touch-icon"
                sizes="167x167"
                href="/assets/icons/apple-icon-ipad-retina.png"
            />
            <link
                rel="mask-icon"
                href="/assets/icons/safari-pinned-tab.svg"
                color={fediTheme.colors.primary}
            />

            {/* Favicon */}
            <link
                rel="icon"
                type="image/png"
                sizes="32x32"
                href="/assets/icons/favicon-32x32.png"
            />
            <link
                rel="icon"
                type="image/png"
                sizes="16x16"
                href="/assets/icons/favicon-16x16.png"
            />
            <link rel="shortcut icon" href="/favicon.ico" />

            {/* Mobile viewport */}
            <meta
                name="viewport"
                content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover"
            />
        </Head>
    )
}
