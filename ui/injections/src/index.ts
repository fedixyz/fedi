import {
    AnyInjectionRequestMessage,
    InjectionMessageHandler,
    InjectionMessageHandlers,
    InjectionMessageType,
} from './types'

export * from './types'

const messageTypes = Object.values(InjectionMessageType)

/**
 * Generates some JavaScript that can be injected into a webview. Allows you
 * to configure which APIs are injected. By default, no APIs are injected
 * unless specified.
 */
export function generateInjectionJs(config: {
    webln?: boolean
    eruda?: boolean
    nostr?: boolean
    fediInternal?: boolean
}) {
    const injections: string[] = []

    if (config.webln) {
        injections.push(process.env.INJECTION_WEBLN as string)
    }

    if (config.eruda) {
        injections.push(process.env.INJECTION_ERUDA as string)
    }

    if (config.nostr) {
        injections.push(process.env.INJECTION_NOSTR as string)
    }

    if (config.fediInternal) {
        injections.push(process.env.INJECTION_FEDI_INTERNAL as string)
    }

    return injections.join('\n')
}

// Types from react and react-native-webview that have been simplified and
// inlined here to avoid unnecessary dependencies just for types.
interface MutableRefObjectLike<T> {
    current: T
}
interface WebViewLike {
    postMessage(message: string): void
    injectJavaScript(message: string): void
}
interface WebViewMessageEventLike {
    nativeEvent: { data: string }
}

/**
 * Generates a callback intended to be passed to a react-native-webview
 * `<WebView />`'s `onMessage` prop. Takes in a `useRef` of the webview,
 * and a map of message handlers keyed by `InjectionMessageType`.
 */
export function makeWebViewMessageHandler(
    webviewRef: MutableRefObjectLike<WebViewLike>,
    handlers: InjectionMessageHandlers,
) {
    return async (event: WebViewMessageEventLike) => {
        const webview = webviewRef.current
        if (!webview) {
            throw new Error(
                '@fedi/injections: webview ref is not set, cannot handle message',
            )
        }

        // Parse the message from the event, ignore messages that aren't for us
        let message: AnyInjectionRequestMessage | undefined
        try {
            message = JSON.parse(event.nativeEvent.data)
        } catch {
            /* no-op */
        }
        if (!message || !messageTypes.includes(message.type)) {
            return
        }

        const { id, type, data } = message
        try {
            // Have to do a little casting since TS can't infer that the
            // handler matches the message.
            const handler = handlers[type] as InjectionMessageHandler<
                typeof type
            >
            const response = await handler(
                data as Parameters<typeof handler>[0],
            )
            const detail = {
                id,
                type,
                data: response,
            }
            webview.injectJavaScript(`window.dispatchEvent(
                new CustomEvent(
                    "fedi:message",
                    {
                        detail: ${JSON.stringify(detail)}
                    }
                )
            )`)
        } catch (err) {
            const errorMessage =
                err && typeof err === 'object'
                    ? 'message' in err
                        ? err.message
                        : String(err)
                    : 'Unexpected error'
            const detail = {
                id,
                type,
                error: {
                    message: errorMessage,
                },
            }
            webview.injectJavaScript(`window.dispatchEvent(
                new CustomEvent(
                    "fedi:message",
                    {
                        detail: ${JSON.stringify(detail)}
                    }
                )
            )`)
        }
    }
}
