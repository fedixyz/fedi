import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, StyleSheet } from 'react-native'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
// import { useSyncCurrencyRatesAndCache } from '@fedi/common/hooks/currency'
import { useSpv2OurPaymentAddress } from '@fedi/common/hooks/stabilitypool'
import { selectFeatureFlag } from '@fedi/common/redux'
import { selectLoadedFederation } from '@fedi/common/redux/federation'

import ReceiveQr from '../components/feature/receive/ReceiveQr'
import RecipientSelector from '../components/feature/stabilitypool/RecipientSelector'
import StabilityBalanceTile from '../components/feature/stabilitypool/StabilityBalanceTile'
import { AmountScreen } from '../components/ui/AmountScreen'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { Switcher } from '../components/ui/Switcher'
import { useAppSelector } from '../state/hooks'
import { MatrixUser, Sats } from '../types'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'StabilityTransfer'
>

export type ReceiverType = MatrixUser & { isSelf?: boolean }

type TransferMode = 'send' | 'receive'

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
    const spTransferFlag = useAppSelector(s =>
        selectFeatureFlag(s, 'sp_transfer_ui'),
    )
    const navigation = useNavigation()
    const { t } = useTranslation()
    const [transferMode, setTransferMode] = useState<TransferMode>('send')
    const ourPaymentAddress = useSpv2OurPaymentAddress(federationId)
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
        if (!receiver && !lockedRecipient) return
        setSubmitAttempts(attempts => attempts + 1)
        if (!isValidAmount) return

        if (lockedRecipient) {
            navigation.navigate('StabilityConfirmTransfer', {
                recipient: lockedRecipient,
                amount: inputAmountCents,
                federationId,
                notes,
            })
        } else if (receiver) {
            // Handle as transfer when sending to other user
            navigation.navigate('StabilityConfirmTransfer', {
                recipient: { matrixUserId: receiver.id },
                amount: inputAmountCents,
                federationId,
                notes,
            })
        }
        Keyboard.dismiss()
    }

    useSyncCurrencyRatesOnFocus(federationId)

    const [notes, setNotes] = useState('')
    const [receiver, setReceiver] = useState<ReceiverType | null>(null)

    const { theme } = useTheme()
    const style = styles(theme)

    const headerContent = federation ? (
        <Column fullWidth gap="md">
            <Switcher
                options={[
                    {
                        label: t('words.send'),
                        value: 'send',
                    },
                    {
                        label: t('words.receive'),
                        value: 'receive',
                    },
                ]}
                selected={transferMode}
                onChange={setTransferMode}
            />
        </Column>
    ) : (
        <ActivityIndicator />
    )

    if (transferMode === 'receive') {
        return (
            <SafeAreaContainer style={style.container} edges="notop">
                <Column fullWidth style={style.subHeader}>
                    {headerContent}
                    <Column center fullWidth style={style.paymentInfoContainer}>
                        <Text caption medium center>
                            ℹ️ {t('phrases.reusable-payment-code')}
                        </Text>
                        <Text caption center color={theme.colors.darkGrey}>
                            {t(
                                'feature.stabilitypool.reusable-payment-code-guidance',
                            )}
                        </Text>
                    </Column>
                </Column>
                {ourPaymentAddress ? (
                    <ReceiveQr
                        uri={{
                            fullString: ourPaymentAddress,
                            body: ourPaymentAddress,
                        }}
                        federationId={federationId}
                    />
                ) : null}
            </SafeAreaContainer>
        )
    }

    return (
        <AmountScreen
            subHeader={
                <Column fullWidth style={style.subHeaderContainer}>
                    {headerContent}
                    <Row align="stretch" fullWidth>
                        {federation ? (
                            <StabilityBalanceTile
                                badgeLogo="usd"
                                federation={federation}
                                onSelectFederation={setFederationId}
                            />
                        ) : null}
                    </Row>
                </Column>
            }
            content={
                // Don't show recipient selector after scanning a spv2 payment address
                // Only show if sp_transfer_ui feature flag is set to Chat mode
                !lockedRecipient && spTransferFlag?.mode === 'Chat' ? (
                    <RecipientSelector
                        receiver={receiver}
                        setReceiver={setReceiver}
                    />
                ) : null
            }
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
                    title: t('words.continue'),
                    onPress: handleSubmit,
                    disabled: amount === 0 || (!receiver && !lockedRecipient),
                },
            ]}
            notes={notes}
            setNotes={setNotes}
        />
    )
}

export default StabilityTransfer

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            gap: theme.spacing.sm,
        },
        subHeader: {
            paddingTop: theme.spacing.lg,
            gap: theme.spacing.md,
        },
        subHeaderContainer: {
            // 1 px to align with the next screen...
            // Thinking it's due to the SafeAreaView behavior on the
            // confirm screen. Not sure. This fixes it for now.
            paddingHorizontal: theme.spacing.lg - 1,
            gap: theme.spacing.md,
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
