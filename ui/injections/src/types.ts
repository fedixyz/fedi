import type {
    GetInfoResponse,
    KeysendArgs,
    RequestInvoiceArgs,
    RequestInvoiceResponse,
    SendPaymentResponse,
    SignMessageResponse,
} from 'webln'

import {
    EcashRequest,
    LoadedFederationListItem,
    MSats,
    SupportedCurrency,
} from '@fedi/common/types'

import { SignedNostrEvent, UnsignedNostrEvent } from './injectables/nostr/types'

export enum InjectionMessageType {
    webln_enable = 'webln_enable',
    webln_getInfo = 'webln_getInfo',
    webln_sendPayment = 'webln_sendPayment',
    webln_keysend = 'webln_keysend',
    webln_makeInvoice = 'webln_makeInvoice',
    webln_signMessage = 'webln_signMessage',
    webln_verifyMessage = 'webln_verifyMessage',
    nostr_getPublicKey = 'nostr_getPublicKey',
    nostr_signEvent = 'nostr_signEvent',
    nostr_encrypt = 'nostr_encrypt',
    nostr_decrypt = 'nostr_decrypt',
    nostr_encrypt04 = 'nostr_encrypt04',
    nostr_decrypt04 = 'nostr_decrypt04',
    fedi_generateEcash = 'fedi_generateEcash',
    fedi_receiveEcash = 'fedi_receiveEcash',
    fedi_getAuthenticatedMember = 'fedi_getAuthenticatedMember',
    fedi_getActiveFederation = 'fedi_getActiveFederation',
    fedi_getCurrencyCode = 'fedi_getCurrencyCode',
    fedi_getLanguageCode = 'fedi_getLanguageCode',
}

export type InjectionMessageResponseMap = {
    [InjectionMessageType.webln_enable]: {
        message: void
        response: void
    }
    [InjectionMessageType.webln_getInfo]: {
        message: void
        response: GetInfoResponse
    }
    [InjectionMessageType.webln_sendPayment]: {
        message: string
        response: SendPaymentResponse
    }
    [InjectionMessageType.webln_keysend]: {
        message: KeysendArgs
        response: SendPaymentResponse
    }
    [InjectionMessageType.webln_makeInvoice]: {
        message: RequestInvoiceArgs
        response: RequestInvoiceResponse
    }
    [InjectionMessageType.webln_signMessage]: {
        message: string
        response: SignMessageResponse
    }
    [InjectionMessageType.webln_verifyMessage]: {
        message: {
            signature: string
            message: string
        }
        response: void
    }
    [InjectionMessageType.nostr_getPublicKey]: {
        message: void
        response: string
    }
    [InjectionMessageType.nostr_signEvent]: {
        message: UnsignedNostrEvent
        response: SignedNostrEvent
    }
    [InjectionMessageType.nostr_encrypt]: {
        message: {
            pubkey: string
            plaintext: string
        }
        response: string
    }
    [InjectionMessageType.nostr_decrypt]: {
        message: {
            pubkey: string
            ciphertext: string
        }
        response: string
    }
    [InjectionMessageType.nostr_encrypt04]: {
        message: {
            pubkey: string
            plaintext: string
        }
        response: string
    }
    [InjectionMessageType.nostr_decrypt04]: {
        message: {
            pubkey: string
            ciphertext: string
        }
        response: string
    }
    [InjectionMessageType.fedi_generateEcash]: {
        message: EcashRequest
        response: { notes: string }
    }
    [InjectionMessageType.fedi_receiveEcash]: {
        message: string
        response: { msats: MSats }
    }
    [InjectionMessageType.fedi_getAuthenticatedMember]: {
        message: void
        response: { id: string; username: string }
    }
    [InjectionMessageType.fedi_getActiveFederation]: {
        message: void
        response: Pick<LoadedFederationListItem, 'id' | 'name' | 'network'>
    }
    [InjectionMessageType.fedi_getCurrencyCode]: {
        message: void
        response: SupportedCurrency
    }
    [InjectionMessageType.fedi_getLanguageCode]: {
        message: void
        response: string
    }
}

export type InjectionRequestMessage<T extends InjectionMessageType> = {
    id: number
    type: T
    data: InjectionMessageResponseMap[T]['message']
}

export type AnyInjectionRequestMessage =
    InjectionRequestMessage<InjectionMessageType>

export type InjectionResponseMessage<T extends InjectionMessageType> = {
    id: number
    type: T
    data: InjectionMessageResponseMap[T]['response']
}

export type AnyInjectionResponseMessage =
    InjectionResponseMessage<InjectionMessageType>

export interface InjectionResponseError {
    id: number
    type: InjectionMessageType
    error: { message: string }
}

export type InjectionMessageHandler<T extends InjectionMessageType> = (
    data: InjectionRequestMessage<T>['data'],
) =>
    | InjectionResponseMessage<T>['data']
    | Promise<InjectionResponseMessage<T>['data']>

export type InjectionMessageHandlers = {
    [T in InjectionMessageType]: InjectionMessageHandler<T>
}
