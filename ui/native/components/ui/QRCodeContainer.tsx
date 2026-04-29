import Clipboard from '@react-native-clipboard/clipboard'
import { Button, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import {
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
} from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import { Row, Column } from './Flex'
import QRCode from './QRCode'
import SvgImage from './SvgImage'

const log = makeLog('QRCodeContainer')

interface Props {
    /** Message to show in toast when the copy button is pressed */
    copyMessage: string
    /** Value to copy to clipboard, defaults to qrValue */
    copyValue?: string
    /** Use dark theme styling */
    dark?: boolean
    /** Value to render the QR code with */
    qrValue: string
    /** Value to share, defaults to copyValue */
    shareValue?: string
    /** Optional logo override for QR code */
    logoOverrideUrl?: string
    /** Disable long-press save on QR code (e.g. for animated QR frames) */
    disableSave?: boolean
    /** When true, renders Copy + Share action buttons */
    showActionButtons?: boolean
    /** Renders a text field with an inline action button */
    showTextWithAction?: 'copy' | 'share' | null
}

const QRCodeContainer = ({
    copyMessage,
    qrValue,
    copyValue = qrValue,
    dark,
    shareValue,
    logoOverrideUrl,
    disableSave,
    showActionButtons,
    showTextWithAction,
}: Props) => {
    const { t } = useTranslation()
    const toast = useToast()
    const { theme } = useTheme()
    const { width } = useWindowDimensions()

    const style = styles(theme, width, dark)

    const handleCopy = () => {
        Clipboard.setString(copyValue)
        toast.show({ content: copyMessage, status: 'success' })
    }

    const handleShare = async () => {
        try {
            await Share.share({
                message: shareValue || copyValue,
            })
        } catch (error) {
            log.error('Error sharing:', error)
        }
    }

    return (
        <Column gap="lg" align="center">
            <Row justify="center" style={style.qrCodeContainer}>
                <QRCode
                    value={qrValue}
                    size={width * 0.7}
                    logoOverrideUrl={logoOverrideUrl}
                    disableSave={disableSave}
                />
            </Row>
            {showTextWithAction && (
                <Row align="center" style={style.textWithActionContainer}>
                    <Text
                        style={style.textWithActionText}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.4}>
                        {showTextWithAction === 'share'
                            ? shareValue || copyValue
                            : copyValue}
                    </Text>
                    <TouchableOpacity
                        style={style.inlineActionButton}
                        onPress={
                            showTextWithAction === 'share'
                                ? handleShare
                                : handleCopy
                        }>
                        <SvgImage
                            name={
                                showTextWithAction === 'share'
                                    ? 'Share'
                                    : 'Copy'
                            }
                            color={theme.colors.primary}
                            size="xs"
                        />
                        <Text
                            style={style.inlineActionText}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            maxFontSizeMultiplier={1.4}>
                            {showTextWithAction === 'share'
                                ? t('words.share')
                                : t('words.copy')}
                        </Text>
                    </TouchableOpacity>
                </Row>
            )}
            {showActionButtons && (
                <Row justify="between" gap="md" style={style.buttonContainer}>
                    <Button
                        size="md"
                        buttonStyle={style.actionButton}
                        titleStyle={style.actionButtonTitle}
                        containerStyle={style.actionButtonItem}
                        title={t('words.copy')}
                        icon={<SvgImage name="Copy" size={20} />}
                        onPress={handleCopy}
                    />
                    <Button
                        size="md"
                        buttonStyle={style.actionButton}
                        titleStyle={style.actionButtonTitle}
                        containerStyle={style.actionButtonItem}
                        title={t('words.share')}
                        icon={<SvgImage name="Share" size={20} />}
                        onPress={handleShare}
                    />
                </Row>
            )}
        </Column>
    )
}

const styles = (theme: Theme, width: number, dark?: boolean) =>
    StyleSheet.create({
        qrCodeContainer: {
            backgroundColor: dark ? theme.colors.background : undefined,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.primaryLight,
            borderWidth: dark ? 0 : 1,
            padding: theme.spacing.md,
        },
        textWithActionContainer: {
            width: width * 0.7 + theme.spacing.md * 2,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.primaryLight,
            borderWidth: dark ? 0 : 1,
            backgroundColor: dark ? theme.colors.background : undefined,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.md,
        },
        textWithActionText: {
            flex: 1,
            color: theme.colors.primaryLight,
            fontSize: theme.sizes.xxs,
            textAlign: 'left',
        },
        inlineActionButton: {
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: theme.spacing.sm,
        },
        inlineActionText: {
            color: theme.colors.primary,
            fontSize: theme.sizes.xxs,
            paddingLeft: theme.spacing.xs,
        },
        buttonContainer: {
            width: width * 0.7 + theme.spacing.md * 2,
        },
        actionButton: {
            backgroundColor: theme.colors.offWhite,
        },
        actionButtonTitle: {
            color: theme.colors.night,
            fontSize: 14,
        },
        actionButtonItem: {
            flex: 1,
        },
    })

export default QRCodeContainer
