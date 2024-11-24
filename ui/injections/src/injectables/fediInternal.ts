import {
    EcashRequest,
    FediInternalVersion,
    LoadedFederationListItem,
    MSats,
    SupportedCurrency,
} from '@fedi/common/types'

import { InjectionMessageResponseMap, InjectionMessageType } from '../types'
import { sendInjectorMessage } from '../utils'

class InjectionFediProvider {
    public version: FediInternalVersion = 0
    private lastMessageId = 0

    async generateEcash(
        ecashRequest: EcashRequest,
    ): Promise<{ notes: string }> {
        return this.sendMessage(
            InjectionMessageType.fedi_generateEcash,
            ecashRequest,
        )
    }

    async receiveEcash(ecash: string): Promise<{ msats: MSats }> {
        return this.sendMessage(InjectionMessageType.fedi_receiveEcash, ecash)
    }

    async getAuthenticatedMember(): Promise<{ id: string; username: string }> {
        return this.sendMessage(
            InjectionMessageType.fedi_getAuthenticatedMember,
            undefined,
        )
    }

    async getActiveFederation(): Promise<
        Pick<LoadedFederationListItem, 'id' | 'name' | 'network'>
    > {
        return this.sendMessage(
            InjectionMessageType.fedi_getActiveFederation,
            undefined,
        )
    }

    async getCurrencyCode(): Promise<SupportedCurrency> {
        return this.sendMessage(
            InjectionMessageType.fedi_getCurrencyCode,
            undefined,
        )
    }

    async getLanguageCode(): Promise<string> {
        return this.sendMessage(
            InjectionMessageType.fedi_getLanguageCode,
            undefined,
        )
    }

    /** Sends a message to the injector via postMessage, returns response */
    private async sendMessage<K extends keyof InjectionMessageResponseMap>(
        type: K,
        message: InjectionMessageResponseMap[K]['message'],
    ): Promise<InjectionMessageResponseMap[K]['response']> {
        const id = this.lastMessageId++
        const response = await sendInjectorMessage({ id, type, data: message })
        return response as InjectionMessageResponseMap[K]['response']
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any)['fediInternal'] = new InjectionFediProvider()

// Removed during compilation
export default ''
