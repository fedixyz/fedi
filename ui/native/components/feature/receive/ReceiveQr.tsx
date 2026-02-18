import Clipboard from '@react-native-clipboard/clipboard'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    ScrollView,
    Share,
    StyleSheet,
    View,
} from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import stringUtils from '@fedi/common/utils/StringUtils'
import { makeLog } from '@fedi/common/utils/log'

import { BtcLnUri } from '../../../types'
import { Row, Column } from '../../ui/Flex'
import QRCode from '../../ui/QRCode'

const log = makeLog('ReceiveQr')

export type ReceiveQrProps = {
    uri: BtcLnUri | { fullString: string; body: string }
    isLoading?: boolean
    children?: React.ReactNode
}

const ReceiveQr: React.FC<ReceiveQrProps> = ({
    uri,
    children,
    isLoading = false,
}: ReceiveQrProps) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const toast = useToast()
    const [qrAbsoluteSize, setAbsoluteQrSize] = useState<number>(0)

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

    const style = styles(theme)

    return (
        <Column grow gap="lg" fullWidth>
            <ScrollView
                style={style.contentScroll}
                contentContainerStyle={style.contentScrollContainer}>
                <Column fullWidth gap="md" align="center" style={style.qrCard}>
                    <Column fullWidth style={style.qrContainer}>
                        <View
                            style={style.qrWrapper}
                            onLayout={e =>
                                setAbsoluteQrSize(e.nativeEvent.layout.width)
                            }>
                            {isLoading ? (
                                <ActivityIndicator />
                            ) : (
                                <QRCode
                                    value={uri.body}
                                    size={qrAbsoluteSize}
                                />
                            )}
                        </View>
                    </Column>
                    <Text caption>
                        {stringUtils.truncateMiddleOfString(uri.body, 6)}
                    </Text>
                </Column>
                {children}
            </ScrollView>
            <Row
                align="center"
                justify="between"
                gap="lg"
                fullWidth
                style={style.buttons}>
                <Button
                    title={t('words.share')}
                    onPress={openShareDialog}
                    containerStyle={{ flex: 1 }}
                />
                <Button
                    title={t('words.copy')}
                    onPress={copyToClipboard}
                    containerStyle={{ flex: 1 }}
                />
            </Row>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        contentScrollContainer: {
            gap: theme.spacing.lg,
            paddingHorizontal: theme.spacing.xl,
        },
        buttons: {
            paddingHorizontal: theme.spacing.xl,
        },
        contentScroll: {
            flex: 1,
        },
        qrCard: {
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.lightGrey,
        },
        qrContainer: {
            aspectRatio: 1,
            position: 'relative',
        },
        qrWrapper: {
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
        },
    })

export default ReceiveQr
