import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, View } from 'react-native'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import {
    generateAddress,
    generateInvoice,
    selectActiveFederation,
    selectIsInternetUnreachable,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import InternetUnreachableBanner from '../components/feature/environment/InternetUnreachableBanner'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import RequestTypeSwitcher from '../components/feature/receive/RequestTypeSwitcher'
import { AmountScreen } from '../components/ui/AmountScreen'
import { SafeAreaContainer, SafeScrollArea } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { BitcoinOrLightning, BtcLnUri, Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useRecheckInternet } from '../utils/hooks/environment'

const log = makeLog('ReceiveLightning')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ReceiveLightning'
>

const ReceiveLightning: React.FC<Props> = ({ navigation }: Props) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const activeFederationId = useAppSelector(selectActiveFederation)?.id
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({})
    const toast = useToast()
    const [invoice, setInvoice] = useState<string>('')
    const [generatingInvoice, setGeneratingInvoice] = useState<boolean>(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const isOnchainSupported = useIsOnchainDepositSupported(fedimint)
    const [onchainAddress, setOnchainAddress] = useState<string>('')
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [notes, setNotes] = useState<string>('')
    const [requestType, setRequestType] = useState<BitcoinOrLightning>(
        BitcoinOrLightning.lightning,
    )
    const isOffline = useAppSelector(selectIsInternetUnreachable)
    const recheckConnection = useRecheckInternet()
    const showOnchainDeposits = isOnchainSupported

    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache(fedimint)

    useFocusEffect(
        useCallback(() => {
            syncCurrencyRatesAndCache()
        }, [syncCurrencyRatesAndCache]),
    )

    const { transactions, fetchTransactions } = useTransactionHistory(fedimint)

    const transactionId = useMemo(() => {
        const id = transactions.find(
            tx =>
                tx.kind === 'onchainDeposit' &&
                tx.onchain_address === onchainAddress,
        )?.id

        return id
    }, [transactions, onchainAddress])

    useEffect(() => {
        const createNewInvoice = async () => {
            if (!activeFederationId) return
            try {
                const newInvoice = await dispatch(
                    generateInvoice({
                        fedimint,
                        federationId: activeFederationId,
                        amount: amountUtils.satToMsat(amount),
                        description: memo,
                        frontendMetadata: {
                            initialNotes: notes || null,
                            recipientMatrixId: null,
                            senderMatrixId: null,
                        },
                    }),
                ).unwrap()
                setInvoice(newInvoice)
            } catch (error) {
                toast.show({
                    content: t('errors.failed-to-generate-invoice'),
                    status: 'error',
                })
            }
        }
        if (generatingInvoice) {
            createNewInvoice()
        }
    }, [
        t,
        toast,
        amount,
        generatingInvoice,
        memo,
        activeFederationId,
        dispatch,
        notes,
    ])

    useEffect(() => {
        if (invoice) {
            setGeneratingInvoice(false)
            navigation.navigate('BitcoinRequest', {
                invoice,
            })
        }
    }, [invoice, navigation])

    // Generate onchain address if needed
    useEffect(() => {
        if (requestType === BitcoinOrLightning.bitcoin && !onchainAddress) {
            const generateOnchainAddress = async () => {
                if (!activeFederationId) return
                try {
                    setIsLoading(true)
                    const newAddress = await dispatch(
                        generateAddress({
                            fedimint,
                            federationId: activeFederationId,
                            frontendMetadata: {
                                initialNotes: notes || null,
                                recipientMatrixId: null,
                                senderMatrixId: null,
                            },
                        }),
                    ).unwrap()

                    setOnchainAddress(newAddress)

                    // Fetches transactionId of new address, in case the user updates notes
                    fetchTransactions()
                } catch (error) {
                    log.error('error generating address', error)
                }
                setIsLoading(false)
            }

            generateOnchainAddress()
        }
    }, [
        onchainAddress,
        requestType,
        activeFederationId,
        dispatch,
        notes,
        fetchTransactions,
    ])

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }

    const handleSubmit = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        const connection = await recheckConnection()

        if (connection.isOffline) {
            toast.error(t, t('errors.actions-require-internet'))
            return
        }

        setGeneratingInvoice(true)
        Keyboard.dismiss()
    }

    return (
        <SafeScrollArea edges="bottom">
            {isOffline && <InternetUnreachableBanner />}
            <SafeAreaContainer edges="horizontal">
                {showOnchainDeposits && (
                    <RequestTypeSwitcher
                        requestType={requestType}
                        onSwitch={() => {
                            requestType === BitcoinOrLightning.lightning
                                ? setRequestType(BitcoinOrLightning.bitcoin)
                                : setRequestType(BitcoinOrLightning.lightning)
                        }}
                    />
                )}
                {requestType === BitcoinOrLightning.bitcoin &&
                onchainAddress ? (
                    <View>
                        {isLoading ? (
                            <ActivityIndicator />
                        ) : (
                            <ReceiveQr
                                uri={
                                    new BtcLnUri({
                                        type: BitcoinOrLightning.bitcoin,
                                        body: onchainAddress,
                                    })
                                }
                                type={requestType}
                                transactionId={transactionId}
                            />
                        )}
                    </View>
                ) : (
                    <AmountScreen
                        amount={amount}
                        onChangeAmount={onChangeAmount}
                        minimumAmount={minimumAmount}
                        maximumAmount={maximumAmount}
                        submitAttempts={submitAttempts}
                        isSubmitting={generatingInvoice}
                        readOnly={Boolean(exactAmount)}
                        verb={t('words.request')}
                        buttons={[
                            {
                                title: `${t('words.request')}${
                                    amount
                                        ? ` ${amountUtils.formatSats(amount)} `
                                        : ' '
                                }${t('words.sats').toUpperCase()}`,
                                onPress: handleSubmit,
                                disabled: generatingInvoice,
                                loading: generatingInvoice,
                                containerStyle: {
                                    width: '100%',
                                },
                            },
                        ]}
                        isIndependent={false}
                        notes={notes}
                        setNotes={setNotes}
                    />
                )}
            </SafeAreaContainer>
        </SafeScrollArea>
    )
}

export default ReceiveLightning
