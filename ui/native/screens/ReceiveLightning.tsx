import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, useTheme } from '@rneui/themed'
import { Theme } from '@rneui/themed/dist/config'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Keyboard,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import {
    useMakeOnchainAddress,
    useMakeLightningRequest,
    useLnurlReceiveCode,
} from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { selectIsInternetUnreachable } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import InternetUnreachableBanner from '../components/feature/environment/InternetUnreachableBanner'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import { AmountScreen } from '../components/ui/AmountScreen'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer, SafeScrollArea } from '../components/ui/SafeArea'
import { Switcher } from '../components/ui/Switcher'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import {
    BitcoinOrLightning,
    BtcLnUri,
    Sats,
    TransactionListEntry,
} from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'
import { useRecheckInternet } from '../utils/hooks/environment'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ReceiveLightning'
>

type Tab = 'lightning' | 'lnurl' | 'onchain'

const ReceiveLightning: React.FC<Props> = ({ navigation, route }: Props) => {
    const [activeTab, setActiveTab] = useState<Tab>('lightning')
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [notes, setNotes] = useState<string>('')

    const { federationId } = route.params
    const { t } = useTranslation()
    const { theme } = useTheme()

    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({ federationId })
    const { supportsLnurl, lnurlReceiveCode, isLoading } = useLnurlReceiveCode(
        federationId || '',
    )

    const isOnchainSupported = useIsOnchainDepositSupported(federationId)
    const isOffline = useAppSelector(selectIsInternetUnreachable)
    const toast = useToast()

    const recheckConnection = useRecheckInternet()

    const style = styles(theme)

    // Setup switcher options
    const switcherOptions: Array<{
        label: string
        value: Tab
    }> = [
        {
            label: t('words.lightning'),
            value: 'lightning',
        },
    ]

    if (supportsLnurl) {
        switcherOptions.push({
            label: t('words.lnurl'),
            value: 'lnurl',
        })
    }

    switcherOptions.push({
        label: t('words.onchain'),
        value: 'onchain',
    })

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

    useSyncCurrencyRatesOnFocus(federationId)

    // Generate onchain address if needed
    useEffect(() => {
        if (activeTab === 'onchain' && !address) {
            try {
                makeOnchainAddress()
            } catch (e) {
                toast.error(t, e)
            }
        }
    }, [makeOnchainAddress, activeTab, address, t, toast])

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
                <View style={{ marginTop: 16 }}>
                    {(isOnchainSupported || supportsLnurl) && (
                        <Switcher<Tab>
                            options={switcherOptions}
                            selected={activeTab}
                            onChange={(newTab: Tab) => setActiveTab(newTab)}
                        />
                    )}
                </View>
                {activeTab === 'onchain' && (
                    <View>
                        {isAddressLoading || !address ? (
                            <ActivityIndicator />
                        ) : (
                            <ReceiveQr
                                uri={
                                    new BtcLnUri({
                                        type: BitcoinOrLightning.bitcoin,
                                        body: address,
                                    })
                                }
                                type={BitcoinOrLightning.bitcoin}
                                federationId={federationId}
                                onSaveNotes={handleSaveNotes}
                            />
                        )}
                    </View>
                )}
                {activeTab === 'lnurl' && (
                    <Column grow style={style.lnurlContainer}>
                        <Column grow>
                            <Column style={style.reusableNotice}>
                                <Text
                                    color={theme.colors.primary}
                                    style={style.noticeTitle}
                                    medium
                                    center
                                    caption>
                                    ℹ️{' '}
                                    {t(
                                        'feature.receive.lnurl-receive-notice-1',
                                    )}
                                </Text>
                                <Text
                                    color={theme.colors.darkGrey}
                                    center
                                    small>
                                    {t(
                                        'feature.receive.lnurl-receive-notice-2',
                                    )}
                                </Text>
                            </Column>
                        </Column>
                        {isLoading ? (
                            <ActivityIndicator />
                        ) : (
                            <ReceiveQr
                                uri={
                                    new BtcLnUri({
                                        type: BitcoinOrLightning.lnurl,
                                        body: lnurlReceiveCode || '',
                                    })
                                }
                                type={BitcoinOrLightning.lnurl}
                                federationId={federationId}
                            />
                        )}
                    </Column>
                )}
                {activeTab === 'lightning' && (
                    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
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
                    </ScrollView>
                )}
            </SafeAreaContainer>
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        reusableNotice: {
            backgroundColor: theme.colors.offWhite100,
            padding: theme.spacing.md,
            gap: theme.spacing.xxs,
            borderRadius: 8,
        },
        noticeTitle: {
            textAlign: 'center',
        },
        lnurlContainer: {
            paddingTop: theme.spacing.sm,
        },
    })

export default ReceiveLightning
