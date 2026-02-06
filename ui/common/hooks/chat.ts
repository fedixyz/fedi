import { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { MatrixPaymentEvent, Sats } from '@fedi/common/types'

import { INVALID_NAME_PLACEHOLDER } from '../constants/matrix'
import {
    CommonDispatch,
    configureMatrixPushNotifications,
    parseEcash,
    selectChatDrafts,
    selectMatrixAuth,
    selectMessageToEdit,
    selectPaymentFederation,
    sendMatrixPaymentPush,
    sendMatrixPaymentRequest,
    setChatDraft,
    setLastUsedFederationId,
    setMatrixDisplayName,
    setMessageToEdit,
} from '../redux'
import { getDisplayNameValidator, parseData } from '../utils/chat'
import { makeLog } from '../utils/log'
import { useMinMaxRequestAmount, useMinMaxSendAmount } from './amount'
import { useFederationPreview } from './federation'
import { useFedimint } from './fedimint'
import { useMatrixPaymentEvent } from './matrix'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'
import { useDebouncedEffect } from './util'

const log = makeLog('common/hooks/chat')

// This hook sets a given device token to be published to the Matrix Sygnal Push server
// so it can process push notifications for timeline events
// We check against the current token to avoid unnecessary updates to Sygnal which might cause issues.
// Any refresh of the token should be done through a seperate messaging.refreshToken() call

export function usePublishNotificationToken(
    getToken: () => Promise<string>,
    appId: string,
    appName: string,
    permissionGranted: boolean,
    secondaryPublish: (token: string, dispatch: CommonDispatch) => void,
    secondaryPermissionGranted: boolean,
    currentToken: string | null,
) {
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()

    useEffect(() => {
        const publishToken = async () => {
            // Check if permission is granted
            if (!permissionGranted) {
                log.info(
                    'Notification permission not granted. Skipping publish token.',
                )
                return
            }

            // Fetch the token
            let newToken = ''
            try {
                newToken = await getToken()
            } catch (err) {
                log.error('Failed to get push notification token', err)
                return
            }

            // Skip publishing if the token hasn't changed or is empty
            if (!newToken || newToken === '') {
                log.error('Token is empty or invalid. Skipping publish.')
                return
            }

            if (newToken === currentToken) {
                log.debug(
                    'Token matches the last published token. No update needed. Token was:',
                    currentToken,
                )
                return
            }

            // Publish the token
            log.debug('Publishing push notification token:', newToken)
            dispatch(
                configureMatrixPushNotifications({
                    fedimint,
                    token: newToken,
                    appId,
                    appName,
                }),
            )
                .unwrap()
                .then(() => {
                    log.debug(
                        'Successfully published matrix push notification token',
                    )
                })
                .catch(err => {
                    log.error(
                        'Failed to publish matrix push notification token',
                        err,
                    )
                })

            // Zendesk
            if (secondaryPermissionGranted) {
                secondaryPublish(newToken, dispatch)
                log.debug(
                    'Successfully updated secondary publish push notification token',
                )
            }
        }

        publishToken()
    }, [
        appId,
        appName,
        dispatch,
        getToken,
        permissionGranted,
        currentToken,
        secondaryPublish,
        secondaryPermissionGranted,
        fedimint,
    ])

    return null
}

export const useChatPaymentPush = (
    t: TFunction,
    roomId: string,
    recipientId: string,
) => {
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()
    const payFromFederation = useCommonSelector(selectPaymentFederation)
    const federationId = payFromFederation?.id || ''
    const [isProcessing, setIsProcessing] = useState<boolean>(false)

    const handleSendPayment = useCallback(
        async (amount: Sats, onSuccess: () => void, notes?: string) => {
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
                        notes,
                    }),
                ).unwrap()
                dispatch(setLastUsedFederationId(federationId))
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
    roomId: string | undefined,
    recipientId: string,
) => {
    const fedimint = useFedimint()
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const paymentFederation = useCommonSelector(selectPaymentFederation)
    const federationId = paymentFederation?.id
    const sendMinMax = useMinMaxSendAmount({
        ecashRequest: {},
        federationId,
    })
    const requestMinMax = useMinMaxRequestAmount({
        ecashRequest: {},
        federationId,
    })
    const [amount, setAmount] = useState(0 as Sats)
    const [submitAction, setSubmitAction] = useState<null | 'send' | 'request'>(
        null,
    )
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [submitType, setSubmitType] = useState<'send' | 'request'>()
    const [notes, setNotes] = useState('')

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
                        notes,
                    }),
                ).unwrap()
                dispatch(setLastUsedFederationId(federationId))
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
            notes,
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
        notes,
        setNotes,
    }
}

// Pass in fedimint bridge to make sure startMatrixClient is called
export const useDisplayNameForm = (t: TFunction) => {
    const [username, setUsername] = useState<string>('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const toast = useToast()
    const fedimint = useFedimint()
    const dispatch = useCommonDispatch()
    const matrixAuth = useCommonSelector(selectMatrixAuth)
    const validator = useMemo(() => getDisplayNameValidator(), [])

    useEffect(() => {
        if (!matrixAuth) return
        const { displayName } = matrixAuth
        if (displayName !== INVALID_NAME_PLACEHOLDER) {
            setUsername(displayName)
        }
    }, [matrixAuth])

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

    const handleSubmitDisplayName = async (onSuccess?: () => void) => {
        setIsSubmitting(true)
        try {
            const trimmedUsername = username.trim()
            await dispatch(
                setMatrixDisplayName({
                    fedimint,
                    displayName: trimmedUsername,
                }),
            ).unwrap()
            onSuccess?.()
        } catch (err) {
            log.error('handleSubmit', err)
            toast.error(t, err)
        } finally {
            setIsSubmitting(false)
        }
    }

    return {
        username,
        isSubmitting,
        errorMessage,
        handleChangeUsername,
        handleSubmitDisplayName,
    }
}

/**
 * Hook for managing message input text state with draft persistence and edit mode support.
 * - Text state with draft initialization from redux
 * - Debounced draft persistence
 * - Edit mode detection and text initialization
 * - Re-sync from draft when roomId changes
 */
export function useMessageInputState(roomId: string) {
    const dispatch = useCommonDispatch()
    const drafts = useCommonSelector(selectChatDrafts)
    const editingMessage = useCommonSelector(selectMessageToEdit)
    const [messageText, setMessageText] = useState<string>(drafts[roomId] ?? '')

    // Re-initialize from draft when room changes (but not when editing)
    useEffect(() => {
        if (!editingMessage) {
            setMessageText(drafts[roomId] ?? '')
        }
    }, [roomId, drafts, editingMessage])

    // Handle edit mode:
    // set message text if editing a message in this room
    // clear edit state if coming from different room
    useEffect(() => {
        if (editingMessage) {
            if (editingMessage.roomId === roomId) {
                setMessageText(editingMessage.content.body)
            } else {
                dispatch(setMessageToEdit(null))
            }
        }
    }, [editingMessage, roomId, dispatch])

    // persist drafts to state
    useDebouncedEffect(
        () => {
            // don't save drafts when editing a message
            if (!editingMessage) {
                dispatch(setChatDraft({ roomId, text: messageText }))
            }
        },
        [messageText, dispatch, editingMessage, roomId],
        500,
    )

    const resetMessageText = useCallback(() => {
        setMessageText('')
    }, [])

    return {
        messageText,
        setMessageText,
        editingMessage,
        isEditingMessage: !!editingMessage,
        resetMessageText,
    }
}

/**
 * Hook for handling joining a federation before receiving a foreign ecash payment
 * Automatically handles parsing the ecash payment and previewing the federation
 */
export function useAcceptForeignEcash(
    t: TFunction,
    paymentEvent: MatrixPaymentEvent,
) {
    const [inviteCode, setInviteCode] = useState<string | null>(null)
    const [showFederationPreview, setShowFederationPreview] =
        useState<boolean>(false)
    const [hideOtherMethods, setHideOtherMethods] = useState<boolean>(true)
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()
    const {
        federationInviteCode,
        // paymentSender
    } = useMatrixPaymentEvent({
        event: paymentEvent,
        t,
        onError: _ => toast.error(t, 'errors.chat-payment-failed'),
    })
    const {
        isJoining,
        isFetchingPreview,
        federationPreview,
        handleCode,
        handleJoin,
    } = useFederationPreview(t, federationInviteCode || '')

    useEffect(() => {
        if (!paymentEvent.content.ecash) return

        dispatch(
            parseEcash({
                fedimint,
                ecash: paymentEvent.content.ecash,
            }),
        )
            .unwrap()
            .then(parsed => {
                if (parsed.federation_type === 'joined') {
                    log.error('federation should not be joined')
                    return
                }

                setInviteCode(
                    parsed.federation_invite || federationInviteCode || '',
                )
            })
    }, [paymentEvent.content.ecash, federationInviteCode, dispatch, fedimint])

    useEffect(() => {
        if (!inviteCode) return
        // skip handling the code if we already have a preview
        if (federationPreview) return
        handleCode(inviteCode)
    }, [federationPreview, inviteCode, handleCode])

    return {
        isJoining,
        isFetchingPreview,
        federationPreview,
        handleJoin,
        showFederationPreview,
        setShowFederationPreview,
        hideOtherMethods,
        setHideOtherMethods,
    }
}
