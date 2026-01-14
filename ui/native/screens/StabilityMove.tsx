import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, StyleSheet } from 'react-native'

import { useDepositForm, useWithdrawForm } from '@fedi/common/hooks/amount'
import { selectLoadedFederation } from '@fedi/common/redux'
import { hexToRgba } from '@fedi/common/utils/color'

import StabilityBalanceTile from '../components/feature/stabilitypool/StabilityBalanceTile'
import { AmountScreen } from '../components/ui/AmountScreen'
import { Column } from '../components/ui/Flex'
import { Switcher } from '../components/ui/Switcher'
import { useAppSelector } from '../state/hooks'
import { Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'StabilityMove'>

type Tab = 'deposit' | 'withdraw'

// Deposit/Withdraw screen
const StabilityMove: React.FC<Props> = ({ route }: Props) => {
    const navigation = useNavigation()
    const { federationId } = route.params

    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const { t } = useTranslation()
    const {
        inputAmount: amountDeposit,
        setInputAmount: setAmountDeposit,
        minimumAmount: minimumAmountDeposit,
        maximumAmount: maximumAmountDeposit,
        maximumFiatAmount: maximumFiatAmountDeposit,
    } = useDepositForm(federationId)

    const {
        inputAmount: amountWithdraw,
        setInputAmount: setAmountWithdraw,
        minimumAmount: minimumAmountWithdraw,
        maximumAmount: maximumAmountWithdraw,
        maximumFiatAmount: maximumFiatAmountWithdraw,
        inputAmountCents: inputAmountCentsWithdraw,
    } = useWithdrawForm(federationId)

    const [submitAttempts, setSubmitAttempts] = useState(0)

    const [activeTab, setActiveTab] = useState<Tab>('deposit')

    const switcherOptions: Array<{ label: string; value: Tab }> = [
        { label: t('words.deposit'), value: 'deposit' },
        { label: t('words.withdraw'), value: 'withdraw' },
    ]

    const onChangeAmountDeposit = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmountDeposit(updatedValue)
    }

    const onChangeAmountWithdraw = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmountWithdraw(updatedValue)
    }
    const handleSubmitDeposit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (
            amountDeposit > maximumAmountDeposit ||
            amountDeposit < minimumAmountDeposit
        ) {
            return
        }
        navigation.navigate('StabilityConfirmDeposit', {
            amount: amountDeposit,
            federationId,
        })
        Keyboard.dismiss()
    }
    const handleSubmitWithdraw = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (
            amountWithdraw > maximumAmountWithdraw ||
            amountWithdraw < minimumAmountWithdraw
        ) {
            return
        }
        navigation.navigate('StabilityConfirmWithdraw', {
            amountSats: amountWithdraw,
            amountCents: inputAmountCentsWithdraw,
            federationId,
        })
    }

    useSyncCurrencyRatesOnFocus(federationId)

    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <AmountScreen
            federationId={federationId}
            amount={activeTab === 'deposit' ? amountDeposit : amountWithdraw}
            onChangeAmount={
                activeTab === 'deposit'
                    ? onChangeAmountDeposit
                    : onChangeAmountWithdraw
            }
            minimumAmount={
                activeTab === 'deposit'
                    ? minimumAmountDeposit
                    : minimumAmountWithdraw
            }
            maximumAmount={
                activeTab === 'deposit'
                    ? maximumAmountDeposit
                    : maximumAmountWithdraw
            }
            submitAttempts={submitAttempts}
            switcherEnabled={false}
            lockToFiat={true}
            verb={t('words.deposit')}
            subHeader={
                <Column gap="md" style={style.subHeaderContainer}>
                    <Switcher<Tab>
                        options={switcherOptions}
                        selected={activeTab}
                        onChange={(newTab: Tab) => {
                            setActiveTab(newTab)
                            // setAmount(0 as Sats)
                        }}
                    />
                    {federation ? (
                        <StabilityBalanceTile
                            // badgeLogo="usd"
                            federation={federation}
                            balance={
                                activeTab === 'deposit'
                                    ? maximumFiatAmountDeposit.toString()
                                    : maximumFiatAmountWithdraw.toString()
                            }
                            balanceDescription={
                                activeTab === 'deposit'
                                    ? t(
                                          'feature.stabilitypool.available-to-deposit',
                                      )
                                    : t(
                                          'feature.stabilitypool.available-to-withdraw',
                                      )
                            }
                        />
                    ) : (
                        <ActivityIndicator />
                    )}
                </Column>
            }
            buttons={[
                {
                    title: `${t('words.continue')}`,
                    onPress:
                        activeTab === 'deposit'
                            ? handleSubmitDeposit
                            : handleSubmitWithdraw,
                    disabled:
                        activeTab === 'deposit'
                            ? amountDeposit === 0
                            : amountWithdraw === 0,
                },
            ]}
        />
    )
}

export default StabilityMove

const styles = (theme: Theme) =>
    StyleSheet.create({
        balance: {
            color: hexToRgba(theme.colors.primary, 0.6),
            textAlign: 'center',
        },
        subHeaderContainer: {
            // // 1 px to align with the next screen...
            // // Thinking it's due to the SafeAreaView behavior on the
            // // confirm screen. Not sure. This fixes it for now.
            // paddingHorizontal: theme.spacing.lg - 1,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
        },
    })
