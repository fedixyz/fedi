import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import {
    selectBtcExchangeRate,
    selectBtcUsdExchangeRate,
    selectCurrency,
    selectCurrencyLocale,
    selectMatrixRoom,
    selectMatrixRoomMultispendStatus,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { fedimint } from '../bridge'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MultispendConfirmDeposit'
>

const MultispendConfirmDeposit: React.FC<Props> = ({ route }: Props) => {
    const { roomId, amount, notes } = route.params
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const [loading, setLoading] = useState(false)
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const navigation = useNavigation()
    const selectedFiatCurrency = useAppSelector(selectCurrency)
    const currencyLocale = useAppSelector(selectCurrencyLocale)
    const matrixRoom = useAppSelector(s => selectMatrixRoom(s, roomId))
    const btcUsdExchangeRate = useAppSelector(selectBtcUsdExchangeRate)
    const btcExchangeRate = useAppSelector(selectBtcExchangeRate)

    const handleSubmit = useCallback(async () => {
        setLoading(true)

        try {
            await fedimint.matrixMultispendDeposit({
                roomId,
                amount,
                description: notes ?? '',
                frontendMeta: {
                    initialNotes: null,
                    recipientMatrixId: null,
                    senderMatrixId: null,
                },
            })

            navigation.dispatch(reset('GroupMultispend', { roomId }))
        } catch (error) {
            toast.error(t, error)
        } finally {
            setLoading(false)
        }
    }, [amount, roomId, t, toast, navigation, notes])

    const formattedFiatAmount = amountUtils.formatFiat(
        amountUtils.convertCentsToOtherFiat(
            amount,
            btcUsdExchangeRate,
            btcExchangeRate,
        ),
        selectedFiatCurrency,
        {
            symbolPosition: 'end',
            locale: currencyLocale,
        },
    )

    const style = styles(theme)

    if (multispendStatus?.status !== 'finalized') return null

    return (
        <SafeAreaContainer edges="notop" style={style.container}>
            <View style={style.content}>
                <View style={style.header}>
                    <View style={style.stableBalanceIndicator}>
                        <SvgImage
                            name="DollarCircle"
                            size={16}
                            color={theme.colors.green}
                        />
                        <Text>{t('feature.stabilitypool.stable-balance')}</Text>
                    </View>
                    <Text h1 medium>
                        {formattedFiatAmount}
                    </Text>
                </View>
                <View style={style.rows}>
                    <View style={style.row}>
                        <Text caption medium>
                            {t('feature.stabilitypool.deposit-to')}
                        </Text>
                        <View style={style.groupInfo}>
                            <Text caption>{matrixRoom?.name}</Text>
                            <Text tiny color={theme.colors.grey}>
                                {t('feature.multispend.multispend-group')}
                            </Text>
                        </View>
                    </View>
                    <View style={style.separator} />
                    <View style={style.row}>
                        <Text caption medium>
                            {t('words.federation')}
                        </Text>
                        <Text caption>
                            {
                                multispendStatus.finalized_group.invitation
                                    .federationName
                            }
                        </Text>
                    </View>
                    <View style={style.separator} />
                    {/* TODO: Add fees (if any) */}
                    <View style={style.row}>
                        <Text caption medium>
                            {t('words.total')}
                        </Text>
                        <Text caption bold>
                            {formattedFiatAmount}
                        </Text>
                    </View>
                </View>
                {notes && (
                    <View style={style.notesWidget}>
                        <Text medium small>
                            {t('feature.multispend.purpose-of-deposit')}
                        </Text>
                        <Text small color={theme.colors.darkGrey}>
                            {notes}
                        </Text>
                    </View>
                )}
            </View>
            <Button
                title={t('words.confirm')}
                disabled={loading}
                onPress={handleSubmit}
            />
        </SafeAreaContainer>
    )
}

export const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        content: {
            flex: 1,
        },
        header: {
            paddingVertical: theme.spacing.lg,
            flexDirection: 'column',
            alignItems: 'center',
            gap: theme.spacing.md,
        },
        stableBalanceIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
        },
        rows: {
            flexDirection: 'column',
        },
        row: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingVertical: theme.spacing.md,
        },
        separator: {
            width: '100%',
            height: 1,
            backgroundColor: theme.colors.extraLightGrey,
        },
        groupInfo: {
            flexDirection: 'column',
            alignItems: 'flex-end',
        },
        notesWidget: {
            padding: theme.spacing.md,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
        },
    })

export default MultispendConfirmDeposit
