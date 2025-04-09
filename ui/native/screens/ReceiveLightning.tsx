import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useTransactionHistory } from '@fedi/common/hooks/transactions'
import {
    generateAddress,
    generateInvoice,
    selectActiveFederation,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { lnurlWithdraw } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import RequestTypeSwitcher from '../components/feature/receive/RequestTypeSwitcher'
import { AmountScreen } from '../components/ui/AmountScreen'
import { SafeScrollArea } from '../components/ui/SafeArea'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { BitcoinOrLightning, BtcLnUri, Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ReceiveLightning')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ReceiveLightning'
>

const ReceiveLightning: React.FC<Props> = ({ navigation, route }: Props) => {
    const lnurlWithdrawal = route.params?.parsedData?.data
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
    } = useRequestForm({
        lnurlWithdrawal,
    })
    const toast = useToast()
    const [invoice, setInvoice] = useState<string>('')
    const [generatingInvoice, setGeneratingInvoice] = useState<boolean>(false)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const isOnchainSupported = useIsOnchainDepositSupported()
    const [onchainAddress, setOnchainAddress] = useState<string>('')
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [notes, setNotes] = useState<string>('')
    const [requestType, setRequestType] = useState<BitcoinOrLightning>(
        BitcoinOrLightning.lightning,
    )
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
                uri: `lightning:${invoice}`,
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

    const handleLnurlWithdraw = async () => {
        setGeneratingInvoice(true)
        try {
            if (!activeFederationId || !lnurlWithdrawal) throw new Error()
            const lnurlInvoice = await lnurlWithdraw(
                fedimint,
                activeFederationId,
                lnurlWithdrawal,
                amountUtils.satToMsat(amount),
                memo,
            )
            navigation.navigate('BitcoinRequest', {
                uri: `lightning:${lnurlInvoice}`,
            })
            // TODO: Better UI for this? We want to show them the QR code in case
            // the payment doesn't go through, but we also want to let them know
            // that LNURL _should_ handle the payment.
            toast.show({
                content: t('feature.receive.awaiting-withdrawal-from', {
                    domain: lnurlWithdrawal.domain,
                }),
            })
        } catch (err) {
            toast.error(t, err)
        }
        setGeneratingInvoice(false)
    }

    const handleSubmit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        if (lnurlWithdrawal) {
            handleLnurlWithdraw()
        } else {
            setGeneratingInvoice(true)
            Keyboard.dismiss()
        }
    }

    return (
        <SafeScrollArea contentContainerStyle={style.container} edges="notop">
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
            {requestType === BitcoinOrLightning.bitcoin && onchainAddress ? (
                <View style={style.qrContainer}>
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
        </SafeScrollArea>
    )
}

const style = StyleSheet.create({
    qrContainer: {},
    container: {},
})

export default ReceiveLightning
