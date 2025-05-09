import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, useTheme } from '@rneui/themed'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

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
import { styles } from './MultispendConfirmDeposit'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MultispendConfirmWithdraw'
>

const MultispendConfirmWithdraw: React.FC<Props> = ({ route }: Props) => {
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
        if (!notes) return

        setLoading(true)

        try {
            await fedimint.matrixSendMultispendWithdrawalRequest({
                roomId,
                amount,
                description: notes,
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
                            {t('feature.multispend.withdraw-from')}
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
                            {t('feature.multispend.purpose-of-withdrawal')}
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

export default MultispendConfirmWithdraw
