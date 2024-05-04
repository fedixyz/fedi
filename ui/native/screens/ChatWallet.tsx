import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Text } from '@rneui/themed'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native'

import {
    useMinMaxRequestAmount,
    useMinMaxSendAmount,
} from '@fedi/common/hooks/amount'
import { useChatMember } from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectActiveFederation,
    selectAuthenticatedMember,
    sendDirectMessage,
} from '@fedi/common/redux'
import { ChatPayment, ChatPaymentStatus, MSats, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import { AmountScreen } from '../components/ui/AmountScreen'
import { useAppDispatch, useAppSelector, useBridge } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('ChatWallet')

export type Props = NativeStackScreenProps<RootStackParamList, 'ChatWallet'>

const ChatWallet: React.FC<Props> = ({ navigation, route }: Props) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const activeFederation = useAppSelector(selectActiveFederation)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const [confirmingSend, setConfirmingSend] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [sendingEcash, setSendingEcash] = useState(false)
    const [amount, setAmount] = useState(0 as Sats)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [submitType, setSubmitType] = useState<'send' | 'request'>()
    const { generateEcash } = useBridge()
    const toast = useToast()
    const { recipientId } = route.params
    const { member, isFetchingMember } = useChatMember(recipientId)
    const sendMinMax = useMinMaxSendAmount()
    const requestMinMax = useMinMaxRequestAmount({ ecashRequest: {} })

    // Reset navigation stack on going back to the chat to give better back
    // button behavior if directed here from Omni.
    // TODO: Have TabsNavigator go back to Chat tab instead of Home on back.
    const backToChat = useCallback(() => {
        navigation.reset({
            index: 1,
            routes: [
                { name: 'TabsNavigator' },
                { name: 'DirectChat', params: { memberId: recipientId } },
            ],
        })
    }, [navigation, recipientId])

    useEffect(() => {
        const generateAndSendEcash = async () => {
            try {
                const millis = amountUtils.satToMsat(Number(amount) as Sats)
                const { ecash } = await generateEcash(millis as MSats)
                const payment: ChatPayment = {
                    amount: millis,
                    recipient: recipientId,
                    status: ChatPaymentStatus.accepted,
                    token: ecash,
                }
                await dispatch(
                    sendDirectMessage({
                        fedimint,
                        federationId: activeFederation?.id as string,
                        recipientId: recipientId,
                        payment,
                    }),
                ).unwrap()
                // go back to DirectChat to show sent payment
                backToChat()
            } catch (error) {
                log.error('generateAndSendEcash', error)
                toast.error(t, error)
            }
            setSendingEcash(false)
        }
        if (sendingEcash) {
            generateAndSendEcash()
        }
    }, [
        activeFederation?.id,
        amount,
        dispatch,
        generateEcash,
        backToChat,
        recipientId,
        sendingEcash,
        t,
        toast,
    ])

    const requestEcash = async () => {
        setSubmitType('request')
        setSubmitAttempts(attempts => attempts + 1)
        if (
            amount < requestMinMax.minimumAmount ||
            amount > requestMinMax.maximumAmount
        ) {
            return
        }

        try {
            setIsLoading(true)
            const millis = amountUtils.satToMsat(Number(amount) as Sats)
            const payment: ChatPayment = {
                amount: millis,
                // I am the recipient since this is a pull payment
                recipient: authenticatedMember?.id,
                status: ChatPaymentStatus.requested,
            }
            await dispatch(
                sendDirectMessage({
                    fedimint,
                    federationId: activeFederation?.id as string,
                    recipientId: recipientId,
                    payment,
                }),
            ).unwrap()
            backToChat()
        } catch (error) {
            log.error('requestEcash', error)
            toast.error(t, error)
        }
        setIsLoading(false)
    }

    const handleConfirmSend = async () => {
        log.info('sendEcash', amount, 'sats')
        setSendingEcash(true)
    }

    const handleSend = async () => {
        setSubmitType('send')
        setSubmitAttempts(attempts => attempts + 1)
        if (
            amount < sendMinMax.minimumAmount ||
            amount > sendMinMax.maximumAmount
        ) {
            return
        }

        setConfirmingSend(true)
        Keyboard.dismiss()
    }

    if (isFetchingMember) {
        return (
            <View style={styles().centeredContainer}>
                <ActivityIndicator />
            </View>
        )
    } else if (!member) {
        const username = recipientId.split('@')[0]
        return (
            <View style={styles().centeredContainer}>
                <Text style={styles().centeredText}>
                    {t('feature.chat.member-not-found', { username })}
                </Text>
            </View>
        )
    }

    const inputMinMax =
        submitType === 'send'
            ? sendMinMax
            : submitType === 'request'
            ? requestMinMax
            : {}

    return (
        <AmountScreen
            showBalance
            amount={amount}
            onChangeAmount={setAmount}
            submitAttempts={submitAttempts}
            isSubmitting={isLoading || sendingEcash}
            verb={submitType === 'send' ? t('words.send') : t('words.request')}
            {...inputMinMax}
            buttons={
                confirmingSend
                    ? [
                          {
                              title: t('feature.send.hold-to-confirm-send'),
                              onLongPress: handleConfirmSend,
                              disabled: sendingEcash || isLoading,
                          },
                      ]
                    : [
                          {
                              title: t('words.request'),
                              titleProps: {
                                  maxFontSizeMultiplier: 1.4,
                                  numberOfLines: 1,
                              },
                              onPress: requestEcash,
                              disabled: isLoading,
                              loading: isLoading && submitType === 'request',
                          },
                          {
                              title: t('words.send'),
                              titleProps: {
                                  maxFontSizeMultiplier: 1.4,
                                  numberOfLines: 1,
                              },
                              onPress: handleSend,
                              disabled: isLoading,
                              loading: isLoading && submitType === 'send',
                          },
                      ]
            }
        />
    )
}

const styles = () =>
    StyleSheet.create({
        centeredContainer: {
            flex: 1,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
        },
        centeredText: {
            textAlign: 'center',
        },
    })

export default ChatWallet
