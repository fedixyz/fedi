import Clipboard from '@react-native-clipboard/clipboard'
import { Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    Share,
} from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import { Row, Column } from './Flex'
import QRCode from './QRCode'
import SvgImage, { SvgImageSize } from './SvgImage'

const log = makeLog('QRCodeContainer')

interface Props {
    copyMessage: string
    copyValue?: string
    dark?: boolean
    qrValue: string
    useShare?: boolean
    shareValue?: string
    logoOverrideUrl?: string
}

const QRCodeContainer = ({
    copyMessage,
    qrValue,
    copyValue = qrValue,
    dark,
    useShare = false,
    shareValue,
}: Props) => {
    const toast = useToast()
    const { theme } = useTheme()
    const { width } = useWindowDimensions()

    const style = styles(theme, width, dark)

    const copyToClipboard = () => {
        Clipboard.setString(copyValue)
        toast.show({ content: copyMessage, status: 'success' })
    }

    const shareLink = async () => {
        try {
            await Share.share({
                message: shareValue || copyValue,
            })
        } catch (error) {
            log.error('Error sharing:', error)
        }
    }

    return (
        <Column gap="lg">
            <Row justify="center" style={style.qrCodeContainer}>
                <QRCode value={qrValue} size={width * 0.7} />
            </Row>
            <Row align="center" style={style.copyInviteLinkContainer}>
                <Text
                    style={style.inviteLinkText}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.4}>
                    {useShare ? shareValue || copyValue : copyValue}
                </Text>
                <TouchableOpacity
                    style={style.copyButtonContainer}
                    onPress={useShare ? shareLink : copyToClipboard}>
                    <SvgImage
                        name={useShare ? 'Share' : 'Copy'}
                        color={theme.colors.primary}
                        size={SvgImageSize.xs}
                    />
                    <Text
                        style={style.copyText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={1.4}>
                        {useShare ? t('words.share') : t('words.copy')}
                    </Text>
                </TouchableOpacity>
            </Row>
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
        copyInviteLinkContainer: {
            width: width * 0.7 + theme.spacing.md * 2,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.primaryLight,
            borderWidth: dark ? 0 : 1,
            backgroundColor: dark ? theme.colors.background : undefined,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.md,
        },
        inviteLinkText: {
            flex: 1,
            color: theme.colors.primaryLight,
            fontSize: theme.sizes.xxs,
            textAlign: 'left',
        },
        copyButtonContainer: {
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: theme.spacing.sm,
        },
        copyText: {
            color: theme.colors.primary,
            fontSize: theme.sizes.xxs,
            paddingLeft: theme.spacing.xs,
        },
    })

export default QRCodeContainer
