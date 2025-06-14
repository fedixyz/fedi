import { InjectionMessageResponseMap, InjectionMessageType } from '../types'
import {
    sendInjectorMessage,
    encrypt as _encrypt,
    decrypt as _decrypt,
} from '../utils'
import {
    NostrNip07Provider,
    SignedNostrEvent,
    UnsignedNostrEvent,
} from './nostr/types'

class InjectionNostrProvider implements NostrNip07Provider {
    private lastMessageId = 0

    // NIP 07

    async getPublicKey(): Promise<string> {
        const result = await this.sendMessage(
            InjectionMessageType.nostr_getPublicKey,
            undefined,
        )
        return result
    }

    async signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent> {
        return this.sendMessage(InjectionMessageType.nostr_signEvent, event)
    }

    /** Sends a message to the injector via postMessage, returns response */
    private async sendMessage<T extends InjectionMessageType>(
        type: T,
        data: InjectionMessageResponseMap[T]['message'],
    ): Promise<InjectionMessageResponseMap[T]['response']> {
        const id = this.lastMessageId++
        return sendInjectorMessage({ id, type, data })
    }

    // We use the same encryption functions for both NIP 44 and NIP 04
    nip44 = {
        encrypt: _encrypt,
        decrypt: _decrypt,
    }
    nip04 = {
        encrypt: _encrypt,
        decrypt: _decrypt,
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).nostr = new InjectionNostrProvider()

// Removed during compilation
export default ''
