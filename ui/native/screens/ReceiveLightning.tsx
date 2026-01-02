import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, View } from 'react-native'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import {
    useMakeOnchainAddress,
    useMakeLightningRequest,
} from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { selectIsInternetUnreachable } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import InternetUnreachableBanner from '../components/feature/environment/InternetUnreachableBanner'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import RequestTypeSwitcher from '../components/feature/receive/RequestTypeSwitcher'
import { AmountScreen } from '../components/ui/AmountScreen'
import { SafeAreaContainer, SafeScrollArea } from '../components/ui/SafeArea'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import {
    BitcoinOrLightning,
    BtcLnUri,
    Sats,
    TransactionListEntry,
} from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useRecheckInternet } from '../utils/hooks/environment'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ReceiveLightning'
>

const ReceiveLightning: React.FC<Props> = ({ navigation, route }: Props) => {
    const { federationId } = route.params
    const { t } = useTranslation()
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({ federationId })
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [notes, setNotes] = useState<string>('')
    const [requestType, setRequestType] = useState<BitcoinOrLightning>(
        BitcoinOrLightning.lightning,
    )

    const isOnchainSupported = useIsOnchainDepositSupported(federationId)
    const isOffline = useAppSelector(selectIsInternetUnreachable)
    const toast = useToast()

    const recheckConnection = useRecheckInternet()
    const syncCurrencyRatesAndCache = useSyncCurrencyRatesAndCache()

    const handleTransactionPaid = (tx: TransactionListEntry) => {
        navigation.dispatch(
            reset('ReceiveSuccess', {
                tx,
            }),
        )
    }

    const { isInvoiceLoading, makeLightningRequest } = useMakeLightningRequest({
        federationId,
        onInvoicePaid: handleTransactionPaid,
    })
    const { address, isAddressLoading, makeOnchainAddress, onSaveNotes } =
        useMakeOnchainAddress({
            federationId,
            onMempoolTransaction: handleTransactionPaid,
        })

    const handleSaveNotes = useCallback(
        async (note: string) => {
            try {
                await onSaveNotes(note)
            } catch (e) {
                toast.error(t, e)
            }
        },
        [onSaveNotes, t, toast],
    )

    useFocusEffect(
        useCallback(() => {
            syncCurrencyRatesAndCache(federationId)
        }, [syncCurrencyRatesAndCache, federationId]),
    )

    // Generate onchain address if needed
    useEffect(() => {
        if (requestType === BitcoinOrLightning.bitcoin && !address) {
            try {
                makeOnchainAddress()
            } catch (e) {
                toast.error(t, e)
            }
        }
    }, [makeOnchainAddress, requestType, address, t, toast])

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

        Keyboard.dismiss()

        try {
            const invoice = await makeLightningRequest(amount, memo)

            if (invoice) {
                navigation.navigate('BitcoinRequest', {
                    invoice,
                    federationId,
                })
            }
        } catch (e) {
            toast.error(t, e)
        }
    }

    return (
        <SafeScrollArea edges="bottom">
            {isOffline && <InternetUnreachableBanner />}
            <SafeAreaContainer edges="horizontal">
                {isOnchainSupported && (
                    <RequestTypeSwitcher
                        requestType={requestType}
                        onSwitch={() => {
                            requestType === BitcoinOrLightning.lightning
                                ? setRequestType(BitcoinOrLightning.bitcoin)
                                : setRequestType(BitcoinOrLightning.lightning)
                        }}
                    />
                )}
                {requestType === BitcoinOrLightning.bitcoin && address ? (
                    <View>
                        {isAddressLoading ? (
                            <ActivityIndicator />
                        ) : (
                            <ReceiveQr
                                uri={
                                    new BtcLnUri({
                                        type: BitcoinOrLightning.bitcoin,
                                        body: address,
                                    })
                                }
                                type={requestType}
                                federationId={federationId}
                                onSaveNotes={handleSaveNotes}
                            />
                        )}
                    </View>
                ) : (
                    <AmountScreen
                        showBalance={true}
                        federationId={federationId}
                        amount={amount}
                        onChangeAmount={onChangeAmount}
                        minimumAmount={minimumAmount}
                        maximumAmount={maximumAmount}
                        submitAttempts={submitAttempts}
                        isSubmitting={isInvoiceLoading}
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
                                disabled: isInvoiceLoading,
                                loading: isInvoiceLoading,
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
