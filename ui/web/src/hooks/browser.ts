import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import {
    joinCommunity,
    refreshCommunities,
    selectCommunities,
    selectNostrNpub,
    selectPaymentFederation,
    setInvoiceToPay,
    setLastSelectedCommunityId,
} from '@fedi/common/redux'
import {
    CreateCommunityRequest,
    EditCommunityRequest,
    FIRST_PARTY_PERMISSIONS,
    MiniAppPermissionType,
} from '@fedi/common/types/'
import { prepareCreateCommunityPayload } from '@fedi/common/utils/fedimods'
import { makeLog } from '@fedi/common/utils/log'
import { UnsignedNostrEvent } from '@fedi/injections/src/injectables/nostr/types'
import { eventHashFromEvent } from '@fedi/injections/src/injectables/nostr/utils'
import {
    InjectionMessageType,
    InjectionMessageResponseMap,
} from '@fedi/injections/src/types'

import { homeRoute } from '../constants/routes'
import { useAppDispatch, useAppSelector } from './store'

type RequestPayload =
    | string
    | UnsignedNostrEvent
    | CreateCommunityRequest
    | EditCommunityRequest // use type from injections if possible
type ResponsePayload =
    InjectionMessageResponseMap[keyof InjectionMessageResponseMap]['response']

type Request = {
    event: InjectionMessageType
    payload: RequestPayload
}

type SuccessResponse = {
    event: InjectionMessageType
    payload: ResponsePayload
}

type ErrorResponse = {
    event: InjectionMessageType
    error: string
}

const log = makeLog('useIFrameListener')

const getOriginPermissions = (origin: string): MiniAppPermissionType[] => {
    return FIRST_PARTY_PERMISSIONS[origin] ?? []
}

// ensures all required permissions are present in the actual permissions
const hasPermission = (
    origin: string,
    requiredPermissions: MiniAppPermissionType[],
) => {
    const actual = new Set(getOriginPermissions(origin))
    log.info('Checking permissions: ', requiredPermissions.join(', '))

    return requiredPermissions.every(requiredPermission =>
        actual.has(requiredPermission),
    )
}

export function useIFrameListener(
    ref: React.RefObject<HTMLIFrameElement | null>,
) {
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const { replace } = useRouter()
    const nostrPublic = useAppSelector(selectNostrNpub)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const communities = useAppSelector(selectCommunities)
    const [overlayId, setOverlayId] = useState<InjectionMessageType | null>(
        null,
    )

    // Handles sending postMessage data back to site in iframe
    const sendData = useCallback(
        (data: SuccessResponse | ErrorResponse) => {
            ref.current?.contentWindow?.postMessage(data, '*')
        },
        [ref],
    )

    const sendSuccess = useCallback(
        (event: InjectionMessageType, payload: ResponsePayload) => {
            sendData({
                event,
                payload,
            })
        },
        [sendData],
    )

    const sendError = useCallback(
        (event: InjectionMessageType, error: string) => {
            sendData({
                event,
                error,
            })
        },
        [sendData],
    )

    const resetOverlay = () => {
        setOverlayId(null)
    }

    useEffect(() => {
        async function handler(ev: MessageEvent) {
            const { event, payload }: Request = ev.data

            switch (event) {
                /* window.nostr */
                case InjectionMessageType.nostr_getPublicKey: {
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

                case InjectionMessageType.nostr_signEvent: {
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

                /* window.webln */
                case InjectionMessageType.webln_sendPayment: {
                    try {
                        const invoice = await fedimint.decodeInvoice(
                            payload as string,
                            paymentFederation?.id || null,
                        )
                        dispatch(setInvoiceToPay(invoice))
                        setOverlayId(InjectionMessageType.webln_sendPayment)
                    } catch {
                        log.error('Failed to decode invoice')
                        sendError(event, 'SendPayment error')
                    }
                    break
                }

                /* window.fediInternal */
                case InjectionMessageType.fedi_createCommunity: {
                    if (!hasPermission(ev.origin, ['manageCommunities'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    try {
                        const communityToCreate = prepareCreateCommunityPayload(
                            payload as CreateCommunityRequest,
                        )
                        const createdCommunity =
                            await fedimint.createCommunity(communityToCreate)
                        const inviteCode =
                            createdCommunity.communityInvite.invite_code_str

                        sendSuccess(event, {
                            success: true,
                            inviteCode,
                        })
                    } catch {
                        log.error('Failed to create community')
                        sendError(event, 'CreateCommunity error')
                    }

                    break
                }

                case InjectionMessageType.fedi_editCommunity: {
                    if (!hasPermission(ev.origin, ['manageCommunities'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    try {
                        const data = payload as EditCommunityRequest
                        const communityToEdit = prepareCreateCommunityPayload(
                            data.editedCommunity,
                        )
                        await fedimint.editCommunity(
                            data.communityId,
                            communityToEdit,
                        )
                    } catch {
                        log.error('Failed to edit community')
                        sendError(event, 'EditCommunity error')
                    }

                    break
                }

                case InjectionMessageType.fedi_joinCommunity: {
                    if (!hasPermission(ev.origin, ['manageCommunities'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    try {
                        const joinedCommunity = await dispatch(
                            joinCommunity({
                                fedimint,
                                code: payload as string,
                            }),
                        ).unwrap()
                        sendSuccess(event, {
                            success: true,
                            community: joinedCommunity,
                        })
                    } catch {
                        log.error('Failed to join community')
                        sendError(event, 'JoinCommunity error')
                    }

                    break
                }

                case InjectionMessageType.fedi_navigateHome: {
                    if (!hasPermission(ev.origin, ['navigation'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    replace(homeRoute)
                    break
                }

                case InjectionMessageType.fedi_selectPublicChats: {
                    if (!hasPermission(ev.origin, ['manageCommunities'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    try {
                        log.info('selectPublicChats not implemented')
                        setOverlayId(
                            InjectionMessageType.fedi_selectPublicChats,
                        )
                    } catch {
                        log.error('Failed to select public chats')
                        sendError(event, 'SelectPublicChats error')
                    }
                    break
                }

                case InjectionMessageType.fedi_setSelectedCommunity: {
                    if (!hasPermission(ev.origin, ['manageCommunities'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    try {
                        // make sure the user is joined before changing the last selected community
                        const joinedCommunity = communities.find(
                            c => c.id === payload,
                        )

                        if (joinedCommunity) {
                            dispatch(
                                setLastSelectedCommunityId(payload as string),
                            )
                        }

                        sendSuccess(event, { success: true })
                    } catch {
                        log.error('Failed to set selected community')
                        sendError(event, 'SetSelectedCommunity error')
                    }
                    break
                }

                case InjectionMessageType.fedi_listCreatedCommunities: {
                    if (!hasPermission(ev.origin, ['manageCommunities'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    try {
                        const createdCommunities =
                            await fedimint.listCreatedCommunities()

                        sendSuccess(event, { communities: createdCommunities })
                    } catch {
                        log.error('Failed to list communities')
                        sendError(event, 'ListCreatedCommunities error')
                    }
                    break
                }

                case InjectionMessageType.fedi_refreshCommunities: {
                    if (!hasPermission(ev.origin, ['manageCommunities'])) {
                        return sendError(event, 'InvalidPermissions')
                    }

                    try {
                        await dispatch(refreshCommunities(fedimint))
                        sendSuccess(event, undefined)
                    } catch {
                        log.error('Failed to refresh communities')
                        sendError(event, 'RefreshCommunities error')
                    }
                    break
                }
            }
        }

        window.addEventListener('message', handler)

        return () => window.removeEventListener('message', handler)
    }, [
        communities,
        dispatch,
        fedimint,
        nostrPublic,
        paymentFederation,
        replace,
        sendSuccess,
        sendError,
    ])

    return { sendSuccess, sendError, overlayId, resetOverlay }
}
