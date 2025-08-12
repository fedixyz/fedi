import { useCallback, useEffect } from 'react'
import { SendPaymentResponse } from 'webln'

import {
    selectNostrNpub,
    selectPaymentFederation,
    setInvoiceToPay,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'
import {
    UnsignedNostrEvent,
    SignedNostrEvent,
} from '@fedi/injections/src/injectables/nostr/types'
import { eventHashFromEvent } from '@fedi/injections/src/injectables/nostr/utils'

import { fedimint } from '../lib/bridge'
import { useAppDispatch, useAppSelector } from './store'

type Event = 'nostr.getPublicKey' | 'nostr.signEvent' | 'webln.sendPayment'

type RequestPayload = string | UnsignedNostrEvent
type ResponsePayload = string | SignedNostrEvent | SendPaymentResponse

type Request = {
    event: Event
    payload: RequestPayload
}

type SuccessResponse = {
    event: Event
    payload: ResponsePayload
}

type ErrorResponse = {
    event: Event
    error: string
}

const log = makeLog('useIFrameListener')

export function useIFrameListener(ref: React.RefObject<HTMLIFrameElement>) {
    const dispatch = useAppDispatch()

    const nostrPublic = useAppSelector(selectNostrNpub)
    const paymentFederation = useAppSelector(selectPaymentFederation)

    // Handles sending postMessage data back to site in iframe
    const sendData = useCallback(
        (data: SuccessResponse | ErrorResponse) => {
            ref.current?.contentWindow?.postMessage(data, '*')
        },
        [ref],
    )

    const sendSuccess = useCallback(
        (event: Event, payload: ResponsePayload) => {
            sendData({
                event,
                payload,
            })
        },
        [sendData],
    )

    const sendError = useCallback(
        (event: Event, error: string) => {
            sendData({
                event,
                error,
            })
        },
        [sendData],
    )

    useEffect(() => {
        async function handler(ev: MessageEvent) {
            const { event, payload }: Request = ev.data

            switch (event) {
                case 'nostr.getPublicKey': {
                    try {
                        if (!nostrPublic?.hex) {
                            throw new Error()
                        }

                        sendSuccess(event, nostrPublic.hex)
                    } catch {
                        log.error('Public key could not be retrieved')
                        sendError(event, 'GetPublicKey error')
                    }

                    break
                }

                case 'nostr.signEvent': {
                    try {
                        if (!nostrPublic?.hex) {
                            throw new Error()
                        }

                        const unsignedNostrEvent = payload as UnsignedNostrEvent

                        const id = eventHashFromEvent(
                            nostrPublic.hex,
                            unsignedNostrEvent,
                        )

                        const result = await fedimint.signNostrEvent(id)

                        const signedEvent = {
                            ...unsignedNostrEvent,
                            id,
                            pubkey: nostrPublic.hex,
                            sig: result,
                        }

                        sendSuccess(event, signedEvent)
                    } catch {
                        log.error('Failed to sign event')
                        sendError(event, 'SignEvent error')
                    }
                    break
                }

                case 'webln.sendPayment': {
                    try {
                        const invoice = await fedimint.decodeInvoice(
                            payload as string,
                            paymentFederation?.id || null,
                        )
                        dispatch(setInvoiceToPay(invoice))
                    } catch {
                        log.error('Failed to decode invoice')
                        sendError(event, 'SendPayment error')
                    }
                    break
                }
            }
        }

        window.addEventListener('message', handler)

        return () => window.removeEventListener('message', handler)
    }, [dispatch, nostrPublic, paymentFederation, sendSuccess, sendError])

    return { sendSuccess, sendError }
}
