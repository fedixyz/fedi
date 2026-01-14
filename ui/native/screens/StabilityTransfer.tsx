import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, StyleSheet } from 'react-native'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
// import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { selectLoadedFederation } from '@fedi/common/redux/federation'

// import RecipientSelector from '../components/feature/stabilitypool/RecipientSelector'
import StabilityBalanceTile from '../components/feature/stabilitypool/StabilityBalanceTile'
import { AmountScreen } from '../components/ui/AmountScreen'
import { Row } from '../components/ui/Flex'
import { useAppSelector } from '../state/hooks'
import { MatrixUser, Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityTransfer'
>

export type ReceiverType = MatrixUser & { isSelf?: boolean }

const getParams = (params: Props['route']['params']) => {
    if ('recipient' in params) {
        // locked recipient from pay to qr
        return {
            recipient: params.recipient,
            federationId: params.federationId,
        }
    } else {
        // still need to select a recipient
        return { federationId: params.federationId, recipient: null }
    }
}

const StabilityTransfer: React.FC<Props> = ({ route }: Props) => {
    const { recipient: lockedRecipient, federationId: initialFederationId } =
        getParams(route.params)

    const [federationId, setFederationId] = useState(initialFederationId)
    const federation = useAppSelector(s =>
        selectLoadedFederation(s, federationId),
    )
    const navigation = useNavigation()
    const { t } = useTranslation()
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        inputAmountCents,
    } = useWithdrawForm(federationId)
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }

    const isValidAmount =
        (minimumAmount === 0
            ? amount > minimumAmount
            : amount >= minimumAmount) && amount <= maximumAmount

    const handleSubmit = () => {
        // if (!receiver && !lockedRecipient) return
        if (!lockedRecipient) return
        setSubmitAttempts(attempts => attempts + 1)
        if (!isValidAmount) return

        if (lockedRecipient) {
            navigation.navigate('StabilityConfirmTransfer', {
                recipient: lockedRecipient,
                amount: inputAmountCents,
                federationId,
                notes,
            })
            // } else if (receiver && receiver.isSelf) {
            //     // Handle as withdraw when sending to self
            //     navigation.navigate('StabilityConfirmWithdraw', {
            //         amountSats: amount,
            //         amountCents: inputAmountCents,
            //         federationId,
            //     })
            // } else if (receiver) {
            //     // Handle as transfer when sending to other user
            //     navigation.navigate('StabilityConfirmTransfer', {
            //         recipient: { matrixUserId: receiver.id },
            //         amount: inputAmountCents,
            //         federationId,
            //         notes,
            //     })
        }
        Keyboard.dismiss()
    }

    useSyncCurrencyRatesOnFocus(federationId)

    const [notes, setNotes] = useState('')
    // const [receiver, setReceiver] = useState<ReceiverType | null>(null)

    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <>
            <AmountScreen
                subHeader={
                    federation ? (
                        <Row
                            align="stretch"
                            fullWidth
                            style={style.subHeaderContainer}>
                            <StabilityBalanceTile
                                badgeLogo="usd"
                                federation={federation}
                                onSelectFederation={setFederationId}
                            />
                        </Row>
                    ) : (
                        <ActivityIndicator />
                    )
                }
                // content={
                //     !lockedRecipient ? (
                //         <RecipientSelector
                //             receiver={receiver}
                //             setReceiver={setReceiver}
                //         />
                //     ) : null
                // }
                federationId={federationId}
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                switcherEnabled={false}
                lockToFiat={true}
                verb={t('words.transfer')}
                buttons={[
                    {
                        title: t('words.transfer'),
                        // title: receiver?.isSelf
                        // ? t('words.confirm')
                        // : t('words.transfer'),
                        onPress: handleSubmit,
                        disabled:
                            // amount === 0 || (!receiver && !lockedRecipient),
                            amount === 0 || !lockedRecipient,
                    },
                ]}
                notes={notes}
                setNotes={setNotes}
            />
        </>
    )
}

export default StabilityTransfer

const styles = (theme: Theme) =>
    StyleSheet.create({
        subHeaderContainer: {
            // 1 px to align with the next screen...
            // Thinking it's due to the SafeAreaView behavior on the
            // confirm screen. Not sure. This fixes it for now.
            paddingHorizontal: theme.spacing.lg - 1,
        },
    })
