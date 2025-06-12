import {
    InjectionMessageType,
    InjectionRequestMessage,
    InjectionResponseError,
    InjectionResponseMessage,
} from './types'

export async function sendInjectorMessage<T extends InjectionMessageType>(
    message: InjectionRequestMessage<T>,
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
            // Resolve data, reject errors
            if ('error' in data) {
                reject(new Error(data.error.message))
            } else {
                resolve(data.data)
            }
            window.removeEventListener('fedi:message', messageHandler)
        }
        window.addEventListener('fedi:message', messageHandler)
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
