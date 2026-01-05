import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
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

import { Row, Column } from '../components/ui/Flex'
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
    const { roomId, amount, notes, federationId } = route.params
    const multispendStatus = useAppSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const [loading, setLoading] = useState(false)
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const fedimint = useFedimint()
    const navigation = useNavigation()
    const selectedFiatCurrency = useAppSelector(s =>
        selectCurrency(s, federationId),
    )
    const currencyLocale = useAppSelector(selectCurrencyLocale)
    const matrixRoom = useAppSelector(s => selectMatrixRoom(s, roomId))
    const btcUsdExchangeRate = useAppSelector(s =>
        selectBtcUsdExchangeRate(s, federationId),
    )
    const btcExchangeRate = useAppSelector(s =>
        selectBtcExchangeRate(s, selectedFiatCurrency, federationId),
    )

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
    }, [amount, roomId, t, toast, navigation, notes, fedimint])

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
            <Column grow>
                <Column align="center" gap="md" style={style.header}>
                    <Row align="center" gap="md">
                        <SvgImage
                            name="DollarCircle"
                            size={16}
                            color={theme.colors.green}
                        />
                        <Text>{t('feature.stabilitypool.stable-balance')}</Text>
                    </Row>
                    <Text h1 medium>
                        {formattedFiatAmount}
                    </Text>
                </Column>
                <Column>
                    <View style={style.row}>
                        <Text caption medium>
                            {t('feature.stabilitypool.deposit-to')}
                        </Text>
                        <Column align="end">
                            <Text caption>{matrixRoom?.name}</Text>
                            <Text tiny color={theme.colors.grey}>
                                {t('feature.multispend.multispend-group')}
                            </Text>
                        </Column>
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
                </Column>
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
            </Column>
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
        header: {
            paddingVertical: theme.spacing.lg,
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
