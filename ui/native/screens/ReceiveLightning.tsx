import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Insets,
    Keyboard,
    StyleSheet,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { selectActiveFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { lnurlWithdraw } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import RequestTypeSwitcher from '../components/feature/receive/RequestTypeSwitcher'
import { AmountScreen } from '../components/ui/AmountScreen'
import { useAppSelector, useBridge } from '../state/hooks'
import { BitcoinOrLightning, BtcLnUri, Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ReceiveLightning')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ReceiveLightning'
>

const ReceiveLightning: React.FC<Props> = ({ navigation, route }: Props) => {
    const lnurlWithdrawal = route.params?.parsedData?.data
    const { theme } = useTheme()
    const { t } = useTranslation()
    const insets = useSafeAreaInsets()
    const activeFederationId = useAppSelector(selectActiveFederation)?.id
    const { generateAddress, generateInvoice } = useBridge(activeFederationId)
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
    const [requestType, setRequestType] = useState<BitcoinOrLightning>(
        BitcoinOrLightning.lightning,
    )
    const showOnchainDeposits = isOnchainSupported

    useEffect(() => {
        const createNewInvoice = async () => {
            try {
                const newInvoice = await generateInvoice(
                    amountUtils.satToMsat(amount),
                    memo,
                )
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
    }, [t, toast, amount, generateInvoice, generatingInvoice, memo])

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
                try {
                    setIsLoading(true)
                    const newAddress = await generateAddress()

                    setOnchainAddress(newAddress)
                } catch (error) {
                    log.error('error generating address', error)
                }
                setIsLoading(false)
            }

            generateOnchainAddress()
        }
    }, [generateAddress, onchainAddress, requestType])

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

    const style = styles(theme, insets)

    return (
        <View style={style.container}>
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
                <View style={style.onchainContainer}>
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
                />
            )}
        </View>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            padding: theme.spacing.xl,
        },
        onchainContainer: {
            marginTop: 'auto',
            paddingBottom: Math.max(theme.spacing.xl, insets.bottom || 0),
        },
    })

export default ReceiveLightning
