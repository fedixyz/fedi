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

const log = makeLog('ReceiveQr')

export type ReceiveQrProps = {
    uri: BtcLnUri
    type?: BitcoinOrLightning
}

const QR_CODE_SIZE = Dimensions.get('window').width * 0.8

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

    return (
        <View style={styles(theme).container}>
            <Card containerStyle={styles(theme).roundedCardContainer}>
                {uri.fullString && (
                    <QRCode
                        value={uri.fullString}
                        size={QR_CODE_SIZE}
                        logo={Images.FediQrLogo}
                    />
                )}
                <View style={styles(theme).uriInfoContainer}>
                    <Text style={styles(theme).uriTypeText}>
                        {type === BitcoinOrLightning.lightning
                            ? t('phrases.lightning-request')
                            : t('phrases.onchain-address')}
                    </Text>
                    <Text style={styles(theme).uriBodyString} numberOfLines={1}>
                        {stringUtils.truncateMiddleOfString(uri.body, 6)}
                    </Text>
                </View>
            </Card>
            <View style={styles(theme).buttonsContainer}>
                <Button
                    title={t('words.share')}
                    onPress={openShareDialog}
                    containerStyle={styles(theme).button}
                />
                <Button
                    title={t('words.copy')}
                    onPress={copyToClipboard}
                    containerStyle={styles(theme).button}
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
    })

export default ReceiveQr
