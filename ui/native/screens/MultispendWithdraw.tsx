import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text, useTheme } from '@rneui/themed'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useMultispendWithdrawForm } from '@fedi/common/hooks/amount'
import { useMultispendDisplayUtils } from '@fedi/common/hooks/multispend'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectCurrency,
    selectFederation,
    selectMatrixRoom,
    selectMatrixRoomMultispendStatus,
} from '@fedi/common/redux'

import { AmountScreen } from '../components/ui/AmountScreen'
import Avatar from '../components/ui/Avatar'
import { Row, Column } from '../components/ui/Flex'
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
    const {
        inputAmountCents,
        inputAmount: amount,
        minimumAmount,
        maximumAmount,
        setInputAmount: setAmount,
    } = useMultispendWithdrawForm(roomId, matchingFederation?.id || '')
    const matrixRoom = useAppSelector(s => selectMatrixRoom(s, roomId))
    const selectedFiatCurrency = useAppSelector(selectCurrency)
    const { formattedMultispendBalance } = useMultispendDisplayUtils(t, roomId)
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
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        navigation.navigate('MultispendConfirmWithdraw', {
            roomId: roomId,
            amount: inputAmountCents,
            notes,
            federationId: matchingFederation?.id || '',
        })
    }

    const style = styles(theme)

    return (
        <AmountScreen
            amount={amount}
            onChangeAmount={onChangeAmount}
            minimumAmount={minimumAmount}
            maximumAmount={maximumAmount}
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
                    <Column gap="xs">
                        <Text bold caption>
                            {matrixRoom?.name}
                        </Text>
                        <Row align="center" gap="sm">
                            <Text medium caption color={theme.colors.darkGrey}>
                                {`${formattedMultispendBalance} ${selectedFiatCurrency}`}
                            </Text>
                        </Row>
                    </Column>
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
