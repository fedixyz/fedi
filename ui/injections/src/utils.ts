import {
    InjectionMessageType,
    InjectionRequestMessage,
    InjectionResponseError,
    InjectionResponseMessage,
} from './types'

export async function sendInjectorMessage<T extends InjectionMessageType>(
    message: InjectionRequestMessage<T>,
    signal?: AbortSignal,
): Promise<InjectionResponseMessage<T>['data']> {
    // Send the message
    if ('ReactNativeWebView' in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window.ReactNativeWebView as any).postMessage(JSON.stringify(message))
    } else {
        window.postMessage(JSON.stringify(message))
    }

    // Setup a listener for the response
    return new Promise((resolve, reject) => {
        const messageHandler = (ev: Event) => {
            const data:
                | InjectionResponseMessage<T>
                | InjectionResponseError
                | undefined = (ev as CustomEvent).detail

            // Make sure it matches the type & id of our message
            if (!data || data.id !== message.id || data.type !== message.type) {
                return
            }
            window.removeEventListener('fedi:message', messageHandler)
            signal?.removeEventListener('abort', onAbort)
            // Resolve data, reject errors
            if ('error' in data) {
                reject(new Error(data.error.message))
            } else {
                resolve(data.data)
            }
        }
        // Detach the listener on abort (e.g. timeout) instead of leaking it.
        const onAbort = () => {
            window.removeEventListener('fedi:message', messageHandler)
            reject(
                signal?.reason instanceof Error
                    ? signal.reason
                    : new Error('Injector message request aborted'),
            )
        }
        if (signal?.aborted) {
            onAbort()
            return
        }
        window.addEventListener('fedi:message', messageHandler)
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

export async function encrypt(
    pubkey: string,
    plaintext: string,
): Promise<string> {
    return sendInjectorMessage({
        id: 0,
        type: InjectionMessageType.nostr_encrypt,
        data: {
            pubkey,
            plaintext,
        },
    })
}

export async function decrypt(
    pubkey: string,
    ciphertext: string,
): Promise<string> {
    return sendInjectorMessage({
        id: 0,
        type: InjectionMessageType.nostr_decrypt,
        data: { pubkey, ciphertext },
    })
}

export async function encrypt04(
    pubkey: string,
    plaintext: string,
): Promise<string> {
    return sendInjectorMessage({
        id: 0,
        type: InjectionMessageType.nostr_encrypt04,
        data: { pubkey, plaintext },
    })
}

export async function decrypt04(
    pubkey: string,
    ciphertext: string,
): Promise<string> {
    return sendInjectorMessage({
        id: 0,
        type: InjectionMessageType.nostr_decrypt04,
        data: { pubkey, ciphertext },
    })
}
