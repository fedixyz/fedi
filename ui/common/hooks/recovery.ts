import { TFunction } from 'i18next'
import orderBy from 'lodash/orderBy'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
    fetchSocialRecovery as reduxFetchSocialRecovery,
    completeSocialRecovery as reduxCompleteSocialRecovery,
    cancelSocialRecovery as reduxCancelSocialRecovery,
    refreshSocialRecoveryState,
    selectHasCheckedForSocialRecovery,
    selectSocialRecoveryQr,
    selectSocialRecoveryState,
    recoverFromMnemonic,
    selectRegisteredDevices,
    transferExistingWallet,
    createNewWallet,
    startMatrixClient,
    selectHasSetMatrixDisplayName,
} from '../redux'
import { SeedWords } from '../types'
import { RpcRegisteredDevice } from '../types/bindings'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'

const log = makeLog('common/hooks/recovery')

export function useSocialRecovery(fedimint: FedimintBridge) {
    const dispatch = useCommonDispatch()
    const hasCheckedForSocialRecovery = useCommonSelector(
        selectHasCheckedForSocialRecovery,
    )
    const socialRecoveryQr = useCommonSelector(selectSocialRecoveryQr)
    const socialRecoveryState = useCommonSelector(selectSocialRecoveryState)
    const [isCompletingRecovery, setIsCompletingRecovery] = useState(false)
    const [isCancelingRecovery, setIsCancelingRecovery] = useState(false)

    const fetchSocialRecovery = useCallback(() => {
        return dispatch(reduxFetchSocialRecovery(fedimint)).unwrap()
    }, [dispatch, fedimint])

    const completeSocialRecovery = useCallback(async () => {
        setIsCompletingRecovery(true)
        try {
            return await dispatch(
                reduxCompleteSocialRecovery({ fedimint }),
            ).unwrap()
        } finally {
            setIsCompletingRecovery(false)
        }
    }, [dispatch, fedimint])

    const cancelSocialRecovery = useCallback(async () => {
        setIsCancelingRecovery(true)
        try {
            return dispatch(reduxCancelSocialRecovery(fedimint)).unwrap()
        } finally {
            setIsCancelingRecovery(false)
        }
    }, [dispatch, fedimint])

    // Refresh social recovery state every 3 seconds while recovering.
    useEffect(() => {
        if (!socialRecoveryQr) return
        const refresh = async () => {
            await dispatch(refreshSocialRecoveryState(fedimint))
            timeout = setTimeout(refresh, 3000)
        }
        let timeout = setTimeout(refresh, 3000)
        return () => clearTimeout(timeout)
    }, [dispatch, fedimint, socialRecoveryQr])

    return {
        hasCheckedForSocialRecovery,
        socialRecoveryQr,
        socialRecoveryState,
        isCompletingRecovery,
        isCancelingRecovery,
        fetchSocialRecovery,
        completeSocialRecovery,
        cancelSocialRecovery,
    }
}

export function usePersonalRecovery(t: TFunction, fedimint: FedimintBridge) {
    const [recoveryInProgress, setRecoveryInProgress] = useState<boolean>(false)
    const dispatch = useCommonDispatch()
    const toast = useToast()

    const attemptRecovery = useCallback(
        async (seedWords: SeedWords, onSuccess: () => void) => {
            setRecoveryInProgress(true)
            try {
                await dispatch(
                    recoverFromMnemonic({
                        fedimint,
                        mnemonic: seedWords,
                    }),
                ).unwrap()

                // this should be the first time we start the matrix client
                // for an initial registration if this is the 1st time using global chat
                // or an initial login if the user has already set their display name
                await dispatch(startMatrixClient({ fedimint })).unwrap()

                onSuccess()
            } catch (err) {
                toast.error(t, 'errors.recovery-failed')
            } finally {
                setRecoveryInProgress(false)
            }
        },
        [dispatch, fedimint, t, toast],
    )

    return {
        recoveryInProgress,
        attemptRecovery,
    }
}

export function useDeviceRegistration(t: TFunction, fedimint: FedimintBridge) {
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const hasSetDisplayName = useCommonSelector(selectHasSetMatrixDisplayName)
    const registeredDevices = useCommonSelector(selectRegisteredDevices)
    const [isProcessing, setIsProcessing] = useState<boolean>(false)

    const handleNewWallet = useCallback(
        async (onSuccess: (_: boolean) => void) => {
            setIsProcessing(true)
            try {
                const federation = await dispatch(
                    createNewWallet({ fedimint }),
                ).unwrap()

                log.debug('createNewWallet federation:', federation)
                // federation is non-null for social recovery only
                if (federation) {
                    // TODO: go to federation preview? or auto-join
                }
                onSuccess(hasSetDisplayName)
            } catch (error) {
                log.error('handleNewWallet', error)
                toast.error(t, error)
            }
            setIsProcessing(false)
        },
        [dispatch, fedimint, hasSetDisplayName, t, toast],
    )

    const handleTransfer = useCallback(
        async (
            device: RpcRegisteredDevice,
            onSuccess: (_: boolean) => void,
        ) => {
            setIsProcessing(true)
            try {
                const federation = await dispatch(
                    transferExistingWallet({ fedimint, device }),
                ).unwrap()

                log.debug('transferExistingWallet federation:', federation)
                // federation is non-null for social recovery only
                if (federation) {
                    // TODO: go to federation preview? or auto-join
                }

                onSuccess(hasSetDisplayName)
            } catch (error) {
                log.error('transferExistingWallet', error)
                toast.error(t, error)
            }
            setIsProcessing(false)
        },
        [dispatch, fedimint, hasSetDisplayName, t, toast],
    )

    const devicesSortedByTimestamp = useMemo(() => {
        return orderBy(registeredDevices, 'lastRegistrationTimestamp', 'desc')
    }, [registeredDevices])

    return {
        registeredDevices: devicesSortedByTimestamp,
        isProcessing,
        handleTransfer,
        handleNewWallet,
    }
}
