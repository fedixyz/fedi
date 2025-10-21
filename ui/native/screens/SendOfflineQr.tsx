import Clipboard from '@react-native-clipboard/clipboard'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { Buffer } from 'buffer'
import { dataToFrames } from 'qrloop'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import Share from 'react-native-share'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { cancelEcash, selectPaymentFederation } from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import Flex from '../components/ui/Flex'
import HoloAlert from '../components/ui/HoloAlert'
import QRCode from '../components/ui/QRCode'
import { SafeScrollArea } from '../components/ui/SafeArea'
import SvgImage from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'

export type Props = NativeStackScreenProps<RootStackParamList, 'SendOfflineQr'>

const log = makeLog('SendOfflineQr')

const SendOfflineQr: React.FC<Props> = ({ navigation, route }: Props) => {
    const { ecash, amount } = route.params
    const { theme } = useTheme()
    const { width } = useWindowDimensions()
    const toast = useToast()
    const [index, setIndex] = useState(0)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId: paymentFederation?.id,
    })
    const dispatch = useAppDispatch()

    const frames = useMemo(() => {
        return dataToFrames(Buffer.from(ecash, 'base64'))
    }, [ecash])

    // show new qr every 100ms
    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((index + 1) % frames.length)
        }, 100)
        return () => clearInterval(interval)
    }, [index, frames])

    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromMSats(amount)
    const { t } = useTranslation()
    const style = styles(theme)

    const handleCopy = () => {
        Clipboard.setString(ecash)
        toast.show({
            status: 'success',
            content: t('phrases.copied-ecash-token'),
        })
    }

    const handleShare = () => {
        Share.open({ message: ecash }).catch(e => {
            log.error('Failed to share ecash token', e)
        })
    }

    const handleCancelEcashNotes = async () => {
        try {
            await dispatch(cancelEcash({ fedimint, ecash })).unwrap()

            toast.show({
                status: 'success',
                content: t('phrases.canceled-ecash-send'),
            })

            navigation.navigate('EcashSendCancelled')
        } catch (e) {
            toast.error(t, e)
        }
    }

    const handleCancelSend = () => {
        Alert.alert(
            t('phrases.please-confirm'),
            t('feature.send.cancel-notes-warning'),
            [
                {
                    text: t('phrases.go-back'),
                },
                {
                    text: t('words.continue'),
                    onPress: handleCancelEcashNotes,
                },
            ],
        )
    }

    return (
        <SafeScrollArea safeAreaContainerStyle={style.container} edges="notop">
            <Flex align="center" gap="xs">
                <Text h1>{formattedPrimaryAmount}</Text>
                <Text style={style.secondaryAmount}>
                    {formattedSecondaryAmount}
                </Text>
            </Flex>
            <QRCode value={frames[index]} size={width * 0.7} disableSave />
            <Flex align="center" gap="lg">
                <Flex
                    row
                    justify="between"
                    gap="md"
                    fullWidth
                    style={style.buttonContainer}>
                    <Button
                        size="md"
                        buttonStyle={style.actionButton}
                        titleStyle={style.actionButtonTitle}
                        containerStyle={style.actionButtonContainerStyle}
                        title={t('words.copy')}
                        icon={<SvgImage name="Copy" size={20} />}
                        onPress={handleCopy}
                    />
                    <Button
                        size="md"
                        buttonStyle={style.actionButton}
                        titleStyle={style.actionButtonTitle}
                        containerStyle={style.actionButtonContainerStyle}
                        title={t('words.share')}
                        icon={<SvgImage name="Share" size={20} />}
                        onPress={handleShare}
                    />
                </Flex>
                <HoloAlert text={t('feature.send.ecash-recipient-notice')} />
            </Flex>
            <Flex
                align="center"
                gap="md"
                fullWidth
                style={style.optionsContainer}>
                <Pressable onPress={handleCancelSend}>
                    <Flex row center gap="sm" style={style.cancelSendContainer}>
                        <SvgImage
                            name="Close"
                            size={20}
                            color={theme.colors.red}
                        />
                        <Text style={style.cancelSendText} caption medium>
                            {t('feature.send.cancel-send')}
                        </Text>
                    </Flex>
                </Pressable>
                <Button
                    fullWidth
                    title={t('feature.send.i-have-sent-payment')}
                    onLongPress={() => {
                        navigation.dispatch(
                            reset('SendSuccess', {
                                amount,
                                unit: 'sats',
                            }),
                        )
                    }}
                    delayLongPress={500}
                />
                <Text small>{t('phrases.hold-to-confirm')}</Text>
            </Flex>
        </SafeScrollArea>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            gap: theme.spacing.xl,
            paddingVertical: theme.spacing.lg,
        },
        secondaryAmount: {
            color: theme.colors.darkGrey,
        },
        buttonContainer: {
            paddingHorizontal: theme.spacing.lg,
        },
        actionButton: {
            backgroundColor: theme.colors.offWhite,
        },
        actionButtonTitle: {
            color: theme.colors.night,
            fontSize: 14,
        },
        actionButtonContainerStyle: { flex: 1 },
        cancelSendContainer: {
            paddingVertical: theme.spacing.md,
        },
        cancelSendText: {
            color: theme.colors.red,
        },
        optionsContainer: {
            marginTop: 'auto',
        },
    })

export default SendOfflineQr
