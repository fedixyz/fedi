import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, ScrollView, StyleSheet } from 'react-native'

import { useDepositForm } from '@fedi/common/hooks/amount'
import {
    useMonitorStabilityPool,
    useSpv2OurPaymentAddress,
} from '@fedi/common/hooks/stabilitypool'
import { selectShouldShowStablePaymentAddress } from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'

import FederationBalance from '../components/feature/federations/FederationBalance'
import ReceiveQr from '../components/feature/receive/ReceiveQr'
import AmountInput from '../components/ui/AmountInput'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { Switcher } from '../components/ui/Switcher'
import { useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityReceive'
>

type Tab = 'qr' | 'wallet'

const StabilityReceive: React.FC<Props> = ({ route, navigation }: Props) => {
    const { federationId } = route.params

    const [tab, setTab] = useState<Tab>('wallet')
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const { t } = useTranslation()
    const { theme } = useTheme()

    const ourPaymentAddress = useSpv2OurPaymentAddress(federationId)
    const shouldShowStablePaymentAddress = useAppSelector(s =>
        selectShouldShowStablePaymentAddress(s, federationId),
    )
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
    } = useDepositForm(federationId)

    const handleDeposit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (!isValidAmount) return

        navigation.navigate('StabilityConfirmDeposit', {
            amount: amount,
            federationId,
        })
        Keyboard.dismiss()
    }

    const onAmountChange = (newAmount: Sats) => {
        setSubmitAttempts(0)
        setAmount(newAmount)
    }

    const isValidAmount =
        (minimumAmount === 0
            ? amount > minimumAmount
            : amount >= minimumAmount) && amount <= maximumAmount

    const style = styles(theme)

    useMonitorStabilityPool(federationId)
    useSyncCurrencyRatesOnFocus(federationId)

    return (
        <SafeAreaContainer edges="notop">
            <Column gap="lg" grow style={style.container}>
                {shouldShowStablePaymentAddress && ourPaymentAddress && (
                    <Switcher<Tab>
                        selected={tab}
                        options={[
                            {
                                label: t('phrases.reusable-qr'),
                                value: 'qr',
                            },
                            {
                                label: t(
                                    'feature.stabilitypool.from-my-btc-wallet',
                                ),
                                value: 'wallet',
                            },
                        ]}
                        onChange={setTab}
                    />
                )}
                {tab === 'wallet' && (
                    <FederationBalance federationId={federationId} />
                )}
                {tab === 'qr' && (
                    <Column grow gap="md">
                        <Column
                            center
                            fullWidth
                            style={style.paymentInfoContainer}>
                            <Text caption medium center>
                                ℹ️ {t('phrases.reusable-payment-code')}
                            </Text>
                            <Text caption center color={theme.colors.darkGrey}>
                                {t(
                                    'feature.stabilitypool.reusable-payment-code-guidance',
                                )}
                            </Text>
                        </Column>
                        {ourPaymentAddress ? (
                            <ReceiveQr
                                uri={{
                                    fullString: ourPaymentAddress,
                                    body: ourPaymentAddress,
                                }}
                            />
                        ) : null}
                    </Column>
                )}
                {tab === 'wallet' && (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ flexGrow: 1 }}
                        alwaysBounceVertical={false}>
                        <AmountInput
                            amount={amount}
                            onChangeAmount={onAmountChange}
                            minimumAmount={minimumAmount}
                            maximumAmount={maximumAmount}
                            submitAttempts={submitAttempts}
                            federationId={federationId}
                            lockToFiat
                            switcherEnabled={false}
                            verb={t('words.deposit')}
                        />
                        <Button
                            title={t('words.continue')}
                            onPress={handleDeposit}
                            disabled={!isValidAmount && submitAttempts > 0}
                        />
                    </ScrollView>
                )}
            </Column>
        </SafeAreaContainer>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.lg,
        },
        paymentInfoContainer: {
            padding: theme.spacing.md,
            paddingHorizontal: theme.spacing.xl,
            backgroundColor: theme.colors.offWhite100,
            borderRadius: theme.borders.tileRadius,
            width: '100%',
            gap: theme.spacing.xs,
        },
    })

export default StabilityReceive
