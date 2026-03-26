import type { AppProps } from 'next/app'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { configureLogging } from '@fedi/common/utils/log'

import { AppError } from '../components/AppError'
import AppProviders from '../components/AppProviders'
import { PWAMetaTags } from '../components/PWAMetaTags'
import { globalStyles } from '../styles'
import { logFileApi } from '../utils/logfile'

configureLogging(logFileApi)

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
        <ErrorBoundary fallback={({ error }) => <AppError error={error} />}>
            <PWAMetaTags />
            <AppProviders>
                <Component {...pageProps} />
            </AppProviders>
        </ErrorBoundary>
    )
}

export default MyApp
