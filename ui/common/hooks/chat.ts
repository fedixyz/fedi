import { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'

import type { ChatMember, Sats } from '@fedi/common/types'

import { INVALID_NAME_PLACEHOLDER } from '../constants/matrix'
import {
    configureMatrixPushNotifications,
    previewAllDefaultChats,
    selectActiveFederation,
    selectActiveFederationId,
    selectAuthenticatedMember,
    selectChatClientLastOnlineAt,
    selectChatClientStatus,
    selectChatLastSeenMessageTimestamp,
    selectChatMember,
    selectHasSetMatrixDisplayName,
    selectIsMatrixReady,
    selectLatestChatMessageTimestamp,
    selectMatrixAuth,
    selectMatrixPushNotificationToken,
    selectPaymentFederation,
    sendMatrixPaymentPush,
    sendMatrixPaymentRequest,
    setLastSeenMessageTimestamp,
    setMatrixDisplayName,
    startMatrixClient,
} from '../redux'
import { getDisplayNameValidator, parseData } from '../utils/chat'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { useMinMaxRequestAmount, useMinMaxSendAmount } from './amount'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'

const log = makeLog('common/hooks/chat')

/** @deprecated XMPP legacy code */
export function useChatMemberSearch(members: ChatMember[]) {
    const [query, setQuery] = useState('')

    const authenticatedMember = useSelector(selectAuthenticatedMember)
    const searchedMembers = useMemo(() => {
        if (!query) return members.filter(m => m.id !== authenticatedMember?.id)
        const lowerQuery = query.toLowerCase()
        const filteredMembers = members.filter(
            m =>
                m.username.toLowerCase().includes(lowerQuery) &&
                m.id !== authenticatedMember?.id,
        )
        return filteredMembers.sort((m1, m2) => {
            const m1Name = m1.username.toLowerCase()
            const m2Name = m2.username.toLowerCase()
            if (m1Name === lowerQuery) {
                return -1
            }
            if (m2Name === lowerQuery) {
                return 1
            }
            if (m1Name.startsWith(lowerQuery)) {
                return -1
            }
            if (m2Name.startsWith(lowerQuery)) {
                return 1
            }
            return m1Name.localeCompare(m2Name)
        })
    }, [members, query, authenticatedMember])

    const isExactMatch =
        searchedMembers[0]?.username.toLowerCase() === query.toLowerCase() &&
        searchedMembers[0]?.id !== authenticatedMember?.id

    return {
        query,
        setQuery,
        searchedMembers,
        isExactMatch,
    }
}

// TODO: Reimplement unseen logic with matrix
/**
 * Automatically dispatch an update to the last message seen
 * while a component using this hook is mounted.
 *
 * the pauseUpdates param is used by the native app since components remain
 * mounted even when the screen is not in focus. the navigation library
 * returns isFocused = false for any screen using this hook and we can pause it
 *
 * @deprecated XMPP legacy code
 */
export function useUpdateLastMessageSeen(pauseUpdates?: boolean) {
    const dispatch = useCommonDispatch()
    const federationId = useCommonSelector(selectActiveFederation)?.id
    const lastSeenMessageTimestamp = useCommonSelector(
        selectChatLastSeenMessageTimestamp,
    )
    const latestMessageTimestamp = useCommonSelector(
        selectLatestChatMessageTimestamp,
    )

    useEffect(() => {
        if (!latestMessageTimestamp || !federationId || pauseUpdates) return

        // don't dispatch if we already have the latest timestamp
        if (
            lastSeenMessageTimestamp &&
            lastSeenMessageTimestamp >= latestMessageTimestamp
        )
            return

        dispatch(
            setLastSeenMessageTimestamp({
                federationId,
                timestamp: latestMessageTimestamp,
            }),
        )
    }, [
        dispatch,
        federationId,
        lastSeenMessageTimestamp,
        latestMessageTimestamp,
        pauseUpdates,
    ])
}

// This hook sets a given device token to be published to the Matrix Sygnal Push server
// so it can process push notifications for timeline events
export function usePublishNotificationToken(
    getToken: () => Promise<string>,
    needsPermission = false,
    appId: string,
    appName: string,
) {
    const dispatch = useCommonDispatch()
    const pushNotificationToken = useCommonSelector(
        selectMatrixPushNotificationToken,
    )
    const isMatrixReady = useCommonSelector(selectIsMatrixReady)

    useEffect(() => {
        // Can't publish if we don't have permission to get the token.
        if (needsPermission) return

        // Don't publish the token again if we already did it
        if (pushNotificationToken) {
            log.info('Already published and stored notification token')
            return
        }

        // Can't publish if matrix isn't ready
        if (!isMatrixReady) return

        log.info('Publishing push notification token')
        dispatch(configureMatrixPushNotifications({ getToken, appId, appName }))
            .unwrap()
            .then(() => {
                log.info(
                    'Successfully published matrix push notification token',
                )
            })
            .catch(err => {
                log.error(
                    'Failed to publish matrix push notification token',
                    err,
                )
            })
    }, [
        appId,
        appName,
        needsPermission,
        isMatrixReady,
        dispatch,
        getToken,
        pushNotificationToken,
    ])
}

/**
 * Given a member id, return the chat member and whether or not we're actively
 * fetching the chat member. If the chat member is not found in the redux store,
 * attempt to fetch information about them from the chat server.
 * @deprecated
 */
export function useChatMember(memberId: string) {
    const member = useCommonSelector(s => selectChatMember(s, memberId))

    return { member }
}

/** @deprecated */
export const useIsChatConnected = () => {
    const chatStatus = useCommonSelector(selectChatClientStatus)
    const lastOnlineAt = useCommonSelector(selectChatClientLastOnlineAt)

    const isOffline = chatStatus !== 'online'
    const [showOffline, setShowOffline] = useState(isOffline)

    // Show offline badge after initial render if we go offline for more than
    // 3 seconds. Initial render will show immediately if we're offline.
    useEffect(() => {
        if (!isOffline) {
            setShowOffline(false)
            return
        }
        const now = Date.now()
        const delay = lastOnlineAt - now + 3000
        const timeout = setTimeout(() => setShowOffline(true), delay)
        return () => clearTimeout(timeout)
    }, [isOffline, lastOnlineAt])

    return !showOffline
}

export const useChatPaymentPush = (
    t: TFunction,
    fedimint: FedimintBridge,
    roomId: string,
    recipientId: string,
) => {
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const payFromFederation = useCommonSelector(selectPaymentFederation)
    const federationId = payFromFederation?.id || ''
    const [isProcessing, setIsProcessing] = useState<boolean>(false)

    const handleSendPayment = useCallback(
        async (amount: Sats, onSuccess: () => void) => {
            if (!federationId || !roomId || !amount) return
            setIsProcessing(true)
            try {
                await dispatch(
                    sendMatrixPaymentPush({
                        fedimint,
                        federationId,
                        roomId,
                        recipientId,
                        amount,
                    }),
                ).unwrap()
                onSuccess()
            } catch (err) {
                toast.error(t, err, 'errors.unknown-error')
            }
            setIsProcessing(false)
        },
        [dispatch, federationId, fedimint, recipientId, roomId, t, toast],
    )

    return {
        isProcessing,
        handleSendPayment,
    }
}

export const useChatPaymentUtils = (
    t: TFunction,
    fedimint: FedimintBridge,
    roomId: string | undefined,
    recipientId: string,
) => {
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const activeFederationId = useCommonSelector(selectActiveFederationId)
    const [federationId] = useState(activeFederationId)
    const sendMinMax = useMinMaxSendAmount({ selectedPaymentFederation: true })
    const requestMinMax = useMinMaxRequestAmount({ ecashRequest: {} })
    const [amount, setAmount] = useState(0 as Sats)
    const [submitAction, setSubmitAction] = useState<null | 'send' | 'request'>(
        null,
    )
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [submitType, setSubmitType] = useState<'send' | 'request'>()

    const inputMinMax =
        submitType === 'send'
            ? sendMinMax
            : submitType === 'request'
                ? requestMinMax
                : {}

    const canRequestAmount =
        amount >= requestMinMax.minimumAmount &&
        amount <= requestMinMax.maximumAmount
    const canSendAmount =
        amount >= sendMinMax.minimumAmount && amount <= sendMinMax.maximumAmount

    const handleSendPayment = useCallback(
        async (onSuccess: () => void) => {
            if (!federationId)
                return toast.error(t, 'errors.please-join-a-federation')
            // TODO: allow for on-the-fly room creation?
            if (!roomId) return
            try {
                setSubmitAction('send')
                await dispatch(
                    sendMatrixPaymentPush({
                        fedimint,
                        federationId,
                        roomId,
                        recipientId,
                        amount,
                    }),
                ).unwrap()
                onSuccess()
            } catch (err) {
                toast.error(t, err, 'errors.unknown-error')
            }
            setSubmitAction(null)
        },
        [
            amount,
            dispatch,
            federationId,
            fedimint,
            recipientId,
            roomId,
            t,
            toast,
        ],
    )

    const handleRequestPayment = useCallback(
        async (onSuccess: () => void) => {
            if (!federationId)
                return toast.error(t, 'errors.please-join-a-federation')
            // TODO: allow for on-the-fly room creation?
            if (!roomId) return

            setSubmitType('request')
            setSubmitAttempts(attempt => attempt + 1)
            if (!canRequestAmount) return

            setSubmitAction('request')
            try {
                await dispatch(
                    sendMatrixPaymentRequest({
                        fedimint,
                        federationId,
                        roomId,
                        amount,
                    }),
                ).unwrap()
                onSuccess()
            } catch (err) {
                toast.error(t, 'errors.unknown-error')
            }
            setSubmitAction(null)
        },
        [
            amount,
            canRequestAmount,
            dispatch,
            federationId,
            fedimint,
            roomId,
            t,
            toast,
        ],
    )

    return {
        amount,
        setAmount,
        submitType,
        setSubmitType,
        submitAttempts,
        setSubmitAttempts,
        submitAction,
        setSubmitAction,
        sendMinMax,
        requestMinMax,
        inputMinMax,
        canSendAmount,
        handleRequestPayment,
        handleSendPayment,
    }
}

// Pass in fedimint bridge to make sure startMatrixClient is called
export const useDisplayNameForm = (t: TFunction, fedimint?: FedimintBridge) => {
    const [username, setUsername] = useState<string>('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const hasSetDisplayName = useCommonSelector(selectHasSetMatrixDisplayName)
    const validator = useMemo(() => getDisplayNameValidator(), [])

    useEffect(() => {
        if (!matrixAuth) return
        const { displayName } = matrixAuth
        if (hasSetDisplayName && displayName !== INVALID_NAME_PLACEHOLDER) {
            setUsername(displayName)
        }
    }, [hasSetDisplayName, matrixAuth])

    const handleChangeUsername = useCallback(
        (input: string) => {
            const result = parseData(input, validator, t)
            if (!result.success) {
                // Only show first error
                setErrorMessage(result.errorMessage)
            } else {
                setErrorMessage(null)
            }
            setUsername(input)
        },
        [t, validator],
    )

    const handleSubmitDisplayName = useCallback(
        async (onSuccess: () => void) => {
            setIsSubmitting(true)
            try {
                // Double check the submitted username is valid
                const result = parseData(username, validator, t)
                if (!result.success) {
                    // Only show first error
                    throw new Error(result.errorMessage)
                }
                // this is optional because it must be provided during onboarding to start
                // the matrix client for the first time but this same hook is also
                // used after the client has started when editing the display name
                if (fedimint && !matrixAuth) {
                    // this should be the first time we start the
                    // matrix client when registering for the first time
                    await dispatch(startMatrixClient({ fedimint }))
                    // TODO: find a better place for this action
                    dispatch(previewAllDefaultChats())
                }
                await dispatch(
                    setMatrixDisplayName({ displayName: username }),
                ).unwrap()
                onSuccess()
            } catch (err) {
                log.error('handleSubmit', err)
                toast.error(t, err)
            }
            setIsSubmitting(false)
        },
        [dispatch, fedimint, matrixAuth, t, toast, username, validator],
    )

    return {
        username,
        isSubmitting,
        errorMessage,
        handleChangeUsername,
        handleSubmitDisplayName,
    }
}
