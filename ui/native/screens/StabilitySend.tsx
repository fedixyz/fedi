import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, ScrollView } from 'react-native'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
import { useMonitorStabilityPool } from '@fedi/common/hooks/stabilitypool'
import {
    selectFeatureFlag,
    selectPaymentFederation,
    selectStabilityPoolVersion,
    setPayFromFederationId,
} from '@fedi/common/redux'
import { MatrixUser } from '@fedi/common/types'

import RecipientSelector from '../components/feature/stabilitypool/RecipientSelector'
import StabilityBalanceTile from '../components/feature/stabilitypool/StabilityBalanceTile'
import AmountInput from '../components/ui/AmountInput'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { Switcher } from '../components/ui/Switcher'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'StabilitySend'>

type Tab = 'user' | 'wallet'
export type ReceiverType = MatrixUser & { isSelf?: boolean }

const StabilitySend: React.FC<Props> = ({ route, navigation }: Props) => {
    const { recipient = null } = route.params

    const [tab, setTab] = useState<Tab>(recipient ? 'user' : 'wallet')
    const [receiver, setReceiver] = useState<ReceiverType | null>(null)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const spTransferFlag = useAppSelector(s =>
        selectFeatureFlag(s, 'sp_transfer_ui'),
    )
    const federation = useAppSelector(selectPaymentFederation)
    const dispatch = useAppDispatch()
    const federationId = federation?.id ?? ''
    const stabilityPoolVersion = useAppSelector(s =>
        selectStabilityPoolVersion(s, federationId),
    )

    const { t } = useTranslation()
    const { theme } = useTheme()

    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        inputAmountCents,
    } = useWithdrawForm(federationId)

    const isValidAmount =
        (minimumAmount === 0
            ? amount > minimumAmount
            : amount >= minimumAmount) && amount <= maximumAmount

    const handleContinueUser = () => {
        if (!receiver && !recipient) return
        setSubmitAttempts(attempts => attempts + 1)
        if (!isValidAmount) return

        if (recipient) {
            navigation.navigate('StabilityConfirmTransfer', {
                recipient,
                amount: inputAmountCents,
                federationId,
            })
        } else if (receiver) {
            // Handle as transfer when sending to other user
            navigation.navigate('StabilityConfirmTransfer', {
                recipient: { matrixUserId: receiver.id },
                amount: inputAmountCents,
                federationId,
            })
        }
        Keyboard.dismiss()
    }

    const handleSendWallet = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (!isValidAmount) return

        navigation.navigate('StabilityConfirmWithdraw', {
            amountSats: amount,
            amountCents: inputAmountCents,
            federationId,
        })
        Keyboard.dismiss()
    }

    useSyncCurrencyRatesOnFocus(federationId)
    useMonitorStabilityPool(federationId)

    const shouldShowRecipientSelector =
        tab === 'user' && !recipient && spTransferFlag?.mode === 'Chat'

    const stabilityTransferEnabled =
        stabilityPoolVersion === 2 && spTransferFlag?.mode === 'Chat'

    return (
        <SafeAreaContainer edges="notop">
            <Column gap="lg" grow style={{ paddingTop: theme.spacing.lg }}>
                {stabilityTransferEnabled && (
                    <Switcher<Tab>
                        selected={tab}
                        options={[
                            {
                                label: t('phrases.to-user'),
                                value: 'user',
                            },
                            {
                                label: t(
                                    'feature.stabilitypool.to-my-btc-wallet',
                                ),
                                value: 'wallet',
                            },
                        ]}
                        onChange={setTab}
                    />
                )}
                {federation && (
                    <StabilityBalanceTile
                        federation={federation}
                        onSelectFederation={id =>
                            dispatch(setPayFromFederationId(id))
                        }
                        showSwitcher
                    />
                )}
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ flexGrow: 1 }}
                    alwaysBounceVertical={false}>
                    <AmountInput
                        amount={amount}
                        onChangeAmount={setAmount}
                        minimumAmount={minimumAmount}
                        maximumAmount={maximumAmount}
                        submitAttempts={submitAttempts}
                        federationId={federationId}
                        lockToFiat
                        switcherEnabled={false}
                        verb={t('words.withdraw')}
                        content={
                            shouldShowRecipientSelector && (
                                <RecipientSelector
                                    receiver={receiver}
                                    setReceiver={setReceiver}
                                />
                            )
                        }
                    />
                    {tab === 'user' ? (
                        <Button
                            title={t('words.continue')}
                            onPress={handleContinueUser}
                            disabled={
                                !isValidAmount || (!receiver && !recipient)
                            }
                        />
                    ) : (
                        <Button
                            title={t('words.send')}
                            onPress={handleSendWallet}
                            disabled={!isValidAmount}
                        />
                    )}
                </ScrollView>
            </Column>
        </SafeAreaContainer>
    )
}

export default StabilitySend
