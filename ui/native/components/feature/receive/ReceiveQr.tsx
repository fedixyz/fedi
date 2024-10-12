import Clipboard from '@react-native-clipboard/clipboard'
import { useNavigation } from '@react-navigation/native'
import { Button, Card, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dimensions, Share, StyleSheet, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { useToast } from '@fedi/common/hooks/toast'
import stringUtils from '@fedi/common/utils/StringUtils'
import { makeLog } from '@fedi/common/utils/log'

import { Images } from '../../../assets/images'
import { fedimint } from '../../../bridge'
import { BitcoinOrLightning, BtcLnUri, TransactionEvent } from '../../../types'
import OnchainDepositInfo from './OnchainDepositInfo'

const log = makeLog('ReceiveQr')

export type ReceiveQrProps = {
    uri: BtcLnUri
    type?: BitcoinOrLightning
}

const QR_CODE_SIZE = Dimensions.get('window').width * 0.75

const ReceiveQr: React.FC<ReceiveQrProps> = ({ uri, type }: ReceiveQrProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation()
    const toast = useToast()

    const copyToClipboard = () => {
        if (!uri.body) return

        Clipboard.setString(uri.body)
        toast.show({
            content: t('feature.receive.copied-payment-code'),
            status: 'success',
        })
    }

    const openShareDialog = async () => {
        // open share dialog
        try {
            if (!uri.fullString)
                throw new Error(
                    'Share Dialog could not be opened since uri.fullString is undefined',
                )

            const result = await Share.share({
                message: uri.fullString,
            })
            log.info('openShareDialog result', result)
        } catch (error) {
            log.error('openShareDialog', error)
        }
    }

    const transactionEventHandler = useCallback(
        (event: TransactionEvent) => {
            if (
                event.transaction.lightning?.invoice === uri.body ||
                event.transaction.bitcoin?.address === uri.body
            )
                navigation.navigate('ReceiveSuccess', {
                    tx: event.transaction,
                })
        },
        [navigation, uri.body],
    )

    // Registers an event handler listening for the invoice to be paid
    useEffect(() => {
        const unsubscribe = fedimint.addListener(
            'transaction',
            transactionEventHandler,
        )
        return unsubscribe
    }, [transactionEventHandler])

    const style = styles(theme)

    return (
        <View style={style.container}>
            <Card containerStyle={style.roundedCardContainer}>
                {uri.fullString && (
                    <QRCode
                        value={uri.fullString}
                        size={QR_CODE_SIZE}
                        logo={Images.FediQrLogo}
                    />
                )}
                <View style={style.uriInfoContainer}>
                    <Text style={style.uriTypeText}>
                        {type === BitcoinOrLightning.lightning
                            ? t('phrases.lightning-request')
                            : t('phrases.onchain-address')}
                    </Text>
                    <Text style={style.uriBodyString} numberOfLines={1}>
                        {stringUtils.truncateMiddleOfString(uri.body, 6)}
                    </Text>
                </View>
                {type === BitcoinOrLightning.bitcoin && (
                    <View style={style.warningContainer}>
                        <OnchainDepositInfo />
                    </View>
                )}
            </Card>
            <View style={style.buttonsContainer}>
                <Button
                    title={t('words.share')}
                    onPress={openShareDialog}
                    containerStyle={style.button}
                />
                <Button
                    title={t('words.copy')}
                    onPress={copyToClipboard}
                    containerStyle={style.button}
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
        },
        buttonsContainer: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: theme.spacing.xl,
        },
        button: {
            width: '48%',
            marginTop: theme.spacing.md,
        },
        uriInfoContainer: {
            flexDirection: 'row',
            width: '100%',
            marginTop: theme.spacing.lg,
            marginBottom: theme.spacing.sm,
        },
        uriTypeText: {
            flex: 1,
        },
        uriBodyString: {
            flex: 1,
            textAlign: 'right',
        },
        roundedCardContainer: {
            borderRadius: 20,
            width: '100%',
        },
        warningContainer: {
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default ReceiveQr
