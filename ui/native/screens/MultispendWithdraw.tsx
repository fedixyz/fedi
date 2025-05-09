import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useWithdrawForm } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectBtcExchangeRate,
    selectBtcUsdExchangeRate,
    selectCurrency,
    selectCurrencyLocale,
    selectFederation,
    selectMatrixRoom,
    selectMatrixRoomMultispendStatus,
    selectMultispendBalanceCents,
    selectMultispendBalanceSats,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { AmountScreen } from '../components/ui/AmountScreen'
import Avatar from '../components/ui/Avatar'
import { useAppSelector } from '../state/hooks'
import { Sats } from '../types'
import { RootStackParamList } from '../types/navigation'
import { styles } from './MultispendDeposit'

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'MultispendWithdraw'
>

const MultispendWithdraw: React.FC<Props> = ({ route }: Props) => {
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
    } = useWithdrawForm()
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [notes, setNotes] = useState<string>('')
    const matchingFederation = useAppSelector(s =>
        selectFederation(
            s,
            multispendStatus?.status === 'finalized'
                ? multispendStatus.finalized_group.federationId
                : '',
        ),
    )
    const matrixRoom = useAppSelector(s => selectMatrixRoom(s, roomId))
    const multispendBalance = useAppSelector(s =>
        selectMultispendBalanceCents(s, roomId),
    )
    const selectedFiatCurrency = useAppSelector(selectCurrency)
    const currencyLocale = useAppSelector(selectCurrencyLocale)
    const btcUsdExchangeRate = useAppSelector(selectBtcUsdExchangeRate)
    const btcExchangeRate = useAppSelector(selectBtcExchangeRate)
    const multispendBalanceSats = useAppSelector(s =>
        selectMultispendBalanceSats(s, roomId),
    )
    const toast = useToast()

    const onChangeAmount = (updatedValue: Sats) => {
        setSubmitAttempts(0)
        setAmount(updatedValue)
    }
    const handleSubmit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (!notes) {
            toast.error(t, 'errors.multispend-notes-required')
            return
        }

        if (amount > multispendBalanceSats || amount <= 0) {
            return
        }

        navigation.navigate('MultispendConfirmWithdraw', {
            roomId: roomId,
            amount: inputAmountCents,
            notes,
        })
    }

    const formattedMultispendBalance = amountUtils.formatFiat(
        amountUtils.convertCentsToOtherFiat(
            multispendBalance,
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

    return (
        <AmountScreen
            amount={amount}
            onChangeAmount={onChangeAmount}
            minimumAmount={0 as Sats}
            maximumAmount={multispendBalanceSats}
            submitAttempts={submitAttempts}
            switcherEnabled={false}
            lockToFiat
            verb={t('words.withdraw')}
            content={
                <View style={style.stabilityBalanceWidget}>
                    {matchingFederation?.init_state === 'ready' && (
                        <View style={{ flexShrink: 0 }}>
                            <Avatar id={roomId} icon="SocialPeople" />
                        </View>
                    )}
                    <View style={style.balanceWidgetInfo}>
                        <Text bold caption>
                            {matrixRoom?.name}
                        </Text>
                        <View style={style.balanceContainer}>
                            <Text medium caption color={theme.colors.darkGrey}>
                                {formattedMultispendBalance}
                            </Text>
                        </View>
                    </View>
                </View>
            }
            notes={notes}
            setNotes={setNotes}
            notesLabel={t('feature.multispend.purpose-of-withdrawal')}
            buttons={[
                {
                    title: `${t('words.withdraw')}`,
                    onPress: handleSubmit,
                    disabled: amount === 0,
                },
            ]}
        />
    )
}

export default MultispendWithdraw
