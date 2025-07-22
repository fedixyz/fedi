import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, Theme, Tooltip, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
import {
    selectFederation,
    selectMatrixRoomMultispendStatus,
} from '@fedi/common/redux'

import { FederationLogo } from '../components/feature/federations/FederationLogo'
import { AmountScreen } from '../components/ui/AmountScreen'
import CustomOverlay from '../components/ui/CustomOverlay'
import Flex from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector, useStabilityPool } from '../state/hooks'
import { Sats } from '../types'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MultispendDeposit'
>

const MultispendDeposit: React.FC<Props> = ({ route }: Props) => {
    const { roomId } = route.params
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )

    const navigation = useNavigation()
    const { theme } = useTheme()
    const { t } = useTranslation()
    const {
        inputAmountCents,
        inputAmount: amount,
        setInputAmount: setAmount,
        minimumAmount,
        maximumAmount,
        // withdraw form, since a deposit into multispend is a withdrawal from stable balance
    } = useWithdrawForm()
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [notes, setNotes] = useState<string>('')
    const [infoTooltip, setInfoTooltip] = useState(false)
    const [insufficientBalanceOverlay, setInsufficientBalanceOverlay] =
        useState(false)
    const matchingFederation = useAppSelector(s =>
        selectFederation(
            s,
            multispendStatus?.status === 'finalized'
                ? multispendStatus.finalized_group.federationId
                : '',
        ),
    )
    const { formattedStableBalance } = useStabilityPool()

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }
    const handleSubmit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount) {
            setInsufficientBalanceOverlay(true)
            return
        }

        if (amount < minimumAmount) {
            return
        }

        navigation.navigate('MultispendConfirmDeposit', {
            roomId: roomId,
            amount: inputAmountCents,
            notes,
        })
    }

    const style = styles(theme)

    if (multispendStatus?.status !== 'finalized') return null

    return (
        <>
            <AmountScreen
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                switcherEnabled={false}
                lockToFiat
                verb={t('words.deposit')}
                content={
                    <View style={style.stabilityBalanceWidget}>
                        {matchingFederation?.init_state === 'ready' && (
                            <View style={{ flexShrink: 0 }}>
                                <FederationLogo
                                    federation={matchingFederation}
                                    size={36}
                                />
                            </View>
                        )}
                        <Flex gap="xs">
                            <Text
                                bold
                                caption
                                maxFontSizeMultiplier={1.5}
                                numberOfLines={1}>
                                {
                                    multispendStatus.finalized_group.invitation
                                        .federationName
                                }
                            </Text>
                            <Flex row align="center" gap="sm">
                                <Text
                                    medium
                                    caption
                                    maxFontSizeMultiplier={1.5}
                                    numberOfLines={1}
                                    color={theme.colors.darkGrey}>
                                    {formattedStableBalance}
                                </Text>
                                <Tooltip
                                    visible={infoTooltip}
                                    onOpen={() => setInfoTooltip(true)}
                                    onClose={() => setInfoTooltip(false)}
                                    popover={
                                        <View style={style.tooltipContent}>
                                            <Text
                                                caption
                                                maxFontSizeMultiplier={1}
                                                style={style.tooltipText}>
                                                <Trans
                                                    i18nKey="feature.multispend.stable-balance-info"
                                                    t={t}
                                                    components={{
                                                        boldlink: (
                                                            <StableBalanceLink
                                                                onPress={() => {
                                                                    setInfoTooltip(
                                                                        false,
                                                                    )
                                                                    navigation.navigate(
                                                                        'StabilityHome',
                                                                    )
                                                                }}
                                                            />
                                                        ),
                                                    }}
                                                />
                                            </Text>
                                        </View>
                                    }
                                    closeOnlyOnBackdropPress
                                    withOverlay
                                    overlayColor={theme.colors.overlay}
                                    // This size handles 2-3 lines of text
                                    // which covers all languages, assuming
                                    // scaling is disabled via maxFontSizeMultiplier
                                    width={200}
                                    height={75}
                                    backgroundColor={theme.colors.blue100}>
                                    <SvgImage name="Info" size={12} />
                                </Tooltip>
                            </Flex>
                        </Flex>
                    </View>
                }
                notes={notes}
                setNotes={setNotes}
                notesOptional={false}
                buttons={[
                    {
                        title: `${t('words.deposit')}`,
                        onPress: handleSubmit,
                        disabled: amount === 0,
                    },
                ]}
            />
            <CustomOverlay
                show={insufficientBalanceOverlay}
                contents={{
                    icon: 'Info',
                    title: (
                        <Text bold maxFontSizeMultiplier={1}>
                            {t('phrases.insufficient-balance')}
                        </Text>
                    ),
                    description: t('feature.multispend.topup-stable-balance'),
                    buttons: [
                        {
                            text: t('words.cancel'),
                            onPress: () => setInsufficientBalanceOverlay(false),
                        },
                        {
                            text: t('words.continue'),
                            onPress: () => {
                                setInsufficientBalanceOverlay(false)
                                navigation.navigate('StabilityHome')
                            },
                            primary: true,
                        },
                    ],
                }}
                onBackdropPress={() => setInsufficientBalanceOverlay(false)}
            />
        </>
    )
}

function StableBalanceLink({
    children = null,
    onPress,
}: {
    children?: React.ReactNode
    onPress: () => void
}) {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Text
            bold
            caption
            style={style.stableBalanceLink}
            onPress={onPress}
            maxFontSizeMultiplier={1}>
            {children}
        </Text>
    )
}

export const styles = (theme: Theme) =>
    StyleSheet.create({
        stabilityBalanceWidget: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.offWhite,
            alignSelf: 'center',
            borderRadius: 12,
            minWidth: 200,
            height: '100%',
        },
        stableBalanceLink: {
            color: theme.colors.primary,
            textDecorationLine: 'underline',
        },
        tooltipContent: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            padding: theme.spacing.sm,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
        },
        tooltipText: {
            textAlign: 'center',
        },
    })

export default MultispendDeposit
