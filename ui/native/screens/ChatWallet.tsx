import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text } from '@rneui/themed'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard } from 'react-native'

import { useChatPaymentUtils } from '@fedi/common/hooks/chat'
import {
    selectMatrixDirectMessageRoom,
    selectPaymentFederation,
} from '@fedi/common/redux'

import FederationWalletSelector from '../components/feature/send/FederationWalletSelector'
import { AmountScreen } from '../components/ui/AmountScreen'
import { Column } from '../components/ui/Flex'
import { useAppSelector } from '../state/hooks'
import { resetToDirectChat } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'
import { useSyncCurrencyRatesOnFocus } from '../utils/hooks/currency'

export type Props = NativeStackScreenProps<RootStackParamList, 'ChatWallet'>

const ChatWallet: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const { recipientId } = route.params
    const existingRoom = useAppSelector(s =>
        selectMatrixDirectMessageRoom(s, recipientId),
    )
    const paymentFederation = useAppSelector(selectPaymentFederation)

    useSyncCurrencyRatesOnFocus(paymentFederation?.id)

    const {
        submitType,
        setSubmitType,
        submitAttempts,
        setSubmitAttempts,
        submitAction,
        amount,
        setAmount,
        inputMinMax,
        canSendAmount,
        handleRequestPayment,
    } = useChatPaymentUtils(t, existingRoom?.id, recipientId)

    const [notes, setNotes] = useState('')

    // Reset navigation stack on going back to the chat to give better back
    // button behavior if directed here from Omni.
    const backToChat = useCallback(() => {
        if (!existingRoom) return
        navigation.dispatch(resetToDirectChat(existingRoom.id))
    }, [existingRoom, navigation])

    const handleRequest = useCallback(async () => {
        handleRequestPayment(() => {
            // go back to DirectChat to show sent request
            backToChat()
        })
    }, [handleRequestPayment, backToChat])

    const handleSend = async () => {
        setSubmitType('send')
        setSubmitAttempts(attempts => attempts + 1)
        if (!canSendAmount) return
        if (!existingRoom) return
        Keyboard.dismiss()
        navigation.navigate('ConfirmSendChatPayment', {
            amount,
            roomId: existingRoom?.id,
            notes,
        })
    }

    if (!existingRoom) {
        return (
            <Column grow center fullWidth>
                <Text style={{ textAlign: 'center' }}>
                    {t('errors.chat-member-not-found')}
                </Text>
            </Column>
        )
    }

    return (
        <AmountScreen
            amount={amount}
            onChangeAmount={setAmount}
            submitAttempts={submitAttempts}
            isSubmitting={submitAction !== null}
            verb={submitType === 'send' ? t('words.send') : t('words.request')}
            subHeader={<FederationWalletSelector />}
            {...inputMinMax}
            buttons={[
                {
                    title: t('words.request'),
                    titleProps: { numberOfLines: 1 },
                    onPress: handleRequest,
                    disabled: submitAction === 'send',
                    loading: submitAction === 'request',
                },
                {
                    title: t('words.send'),
                    titleProps: { numberOfLines: 1 },
                    onPress: handleSend,
                    disabled: submitAction === 'request',
                    loading: submitAction === 'send',
                },
            ]}
            notes={notes}
            setNotes={setNotes}
            federationId={paymentFederation?.id}
        />
    )
}

export default ChatWallet
