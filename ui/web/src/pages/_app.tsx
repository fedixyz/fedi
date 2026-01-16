import type { AppProps } from 'next/app'

import AppProviders from '../components/AppProviders'
import { PWAMetaTags } from '../components/PWAMetaTags'
import { globalStyles } from '../styles'

const MyApp: React.FC<AppProps> = ({ Component, pageProps }) => {
    globalStyles()

    const ComponentWithFlag = Component as typeof Component & {
        noProviders?: boolean
    }

    if (ComponentWithFlag.noProviders) {
        return (
            <>
                <PWAMetaTags />
                <Component {...pageProps} />
            </>
        )
    }

    return (
        <>
            <PWAMetaTags />
            <AppProviders>
                <Component {...pageProps} />
            </AppProviders>
        </>
    )
}

export default MyApp
