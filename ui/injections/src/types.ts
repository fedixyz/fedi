import type {
    GetInfoResponse,
    KeysendArgs,
    RequestInvoiceArgs,
    RequestInvoiceResponse,
    SendPaymentResponse,
    SignMessageResponse,
} from 'webln'

import { EcashRequest, MSats } from '@fedi/common/types'
import { RpcFederation } from '@fedi/common/types/bindings'

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
    fedi_generateEcash = 'fedi_generateEcash',
    fedi_receiveEcash = 'fedi_receiveEcash',
    fedi_getAuthenticatedMember = 'fedi_getAuthenticatedMember',
    fedi_getActiveFederation = 'fedi_getActiveFederation',
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
        response: Pick<RpcFederation, 'id' | 'name' | 'network'>
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
