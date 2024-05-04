import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Linking } from 'react-native'

import { useUpdatingRef } from '@fedi/common/hooks/util'
import { selectActiveFederationId } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'
import { parseUserInput } from '@fedi/common/utils/parser'

import { fedimint } from '../../bridge'
import { AnyParsedData, ParserDataType } from '../../types'
import { useAppSelector } from '../hooks'

const log = makeLog('OmniLinkContext')

/**
 * Function that is given a parsed link, and returns a boolean of whether or
 * not the link should be intercepted. If false, OmniLinkHandler will handle
 * the link. If true, the local component should handle it.
 */
type OmniLinkInterceptFunction = (parsedLink: AnyParsedData) => boolean

interface OmniLinkContextState {
    /** True when parsing a link that prompted the app into the foreground */
    isParsingLink: boolean
    /** The parsed version of the link that prompted the app into the foreground */
    parsedLink: AnyParsedData | null
    /** Set a parsed link to be handled by the OmniLink sheet */
    setParsedLink(parsedLink: AnyParsedData | null): void
    /**
     * Add an interceptor to optionally handle a parsed link in a component
     * rather than the OmniLinkHandler. Returns an unsubscribe function.
     */
    subscribeInterceptor: (interceptor: OmniLinkInterceptFunction) => () => void
}

const OmniLinkContext = createContext<OmniLinkContextState | null>(null)

export const OmniLinkContextProvider: React.FC<{
    children: React.ReactNode
}> = ({ children }) => {
    const { t } = useTranslation()
    const federationId = useAppSelector(selectActiveFederationId)
    const [isParsingLink, setIsParsingLink] = useState(false)
    const [parsedLink, setParsedLink] = useState<AnyParsedData | null>(null)
    const interceptorsRef = useRef<OmniLinkInterceptFunction[]>([])
    const tRef = useUpdatingRef(t)

    // Grab the initial link the app was opened with, if any.
    // Subscribe to future links that bring the app to the foreground.
    useEffect(() => {
        const parseUrl = async (url: string | null) => {
            if (!url) return
            log.info('parsing link', url)
            setIsParsingLink(true)
            try {
                const parsed = await parseUserInput(
                    url,
                    fedimint,
                    tRef.current,
                    federationId,
                )
                const wasIntercepted = interceptorsRef.current.find(
                    interceptor => interceptor(parsed),
                )
                if (wasIntercepted) {
                    log.info('link was intercepted')
                } else {
                    setParsedLink(parsed)
                }
            } catch (err) {
                log.warn('failed to parse url', err)
                setParsedLink({ type: ParserDataType.Unknown, data: {} })
            }
            setIsParsingLink(false)
        }

        Linking.getInitialURL().then(url => parseUrl(url))
        Linking.addEventListener('url', event => parseUrl(event.url))
    }, [tRef, federationId])

    const subscribeInterceptor: OmniLinkContextState['subscribeInterceptor'] =
        useCallback(interceptor => {
            interceptorsRef.current.push(interceptor)
            return () =>
                (interceptorsRef.current = interceptorsRef.current.filter(
                    fn => fn !== interceptor,
                ))
        }, [])

    const value = useMemo(
        () => ({
            parsedLink,
            isParsingLink,
            setParsedLink,
            subscribeInterceptor,
        }),
        [parsedLink, isParsingLink, setParsedLink, subscribeInterceptor],
    )

    return (
        <OmniLinkContext.Provider value={value}>
            {children}
        </OmniLinkContext.Provider>
    )
}

export function useOmniLinkContext() {
    const context = useContext(OmniLinkContext)
    if (!context)
        throw new Error(
            'useOmniLinkContext must be used within a OmniLinkContextProvider',
        )
    return context
}

/**
 * Add an interceptor to the link parser. If the interceptor returns true,
 * your component will handle the parsed link data. If false, OmniLinkHandler will
 * handle the parsed link data.
 */
export function useOmniLinkInterceptor(interceptor: OmniLinkInterceptFunction) {
    const { subscribeInterceptor } = useOmniLinkContext()
    const interceptorRef = useUpdatingRef(interceptor)

    useEffect(() => {
        // Wrap the passed interceptor in a single function with a stable
        // reference to avoid constantly adding and removing on every render.
        const fn: OmniLinkInterceptFunction = data => {
            return interceptorRef.current(data)
        }
        const unsubscribe = subscribeInterceptor(fn)
        return () => unsubscribe()
    }, [interceptorRef, subscribeInterceptor])
}
