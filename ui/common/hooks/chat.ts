import { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Sats } from '@fedi/common/types'

import { INVALID_NAME_PLACEHOLDER } from '../constants/matrix'
import {
    CommonDispatch,
    configureMatrixPushNotifications,
    previewAllDefaultChats,
    selectActiveFederationId,
    selectHasSetMatrixDisplayName,
    selectMatrixAuth,
    selectPaymentFederation,
    sendMatrixPaymentPush,
    sendMatrixPaymentRequest,
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
    ])

    return null
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
