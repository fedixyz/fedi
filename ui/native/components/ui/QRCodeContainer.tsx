import Clipboard from '@react-native-clipboard/clipboard'
import { Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { useToast } from '@fedi/common/hooks/toast'

import { Images } from '../../assets/images'
import Flex from './Flex'
import SvgImage, { SvgImageSize } from './SvgImage'

interface Props {
    copyMessage: string
    copyValue?: string
    dark?: boolean
    qrValue: string
}

const QRCodeContainer = ({
    copyMessage,
    qrValue,
    copyValue = qrValue,
    dark,
}: Props) => {
    const toast = useToast()
    const { theme } = useTheme()
    const { width } = useWindowDimensions()

    const style = styles(theme, width, dark)

    const copyToClipboard = () => {
        Clipboard.setString(copyValue)
        toast.show({ content: copyMessage, status: 'success' })
    }

    return (
        <Flex gap="lg">
            <Flex row justify="center" style={style.qrCodeContainer}>
                <QRCode
                    value={qrValue}
                    size={width * 0.7}
                    logo={Images.FediQrLogo} //Should not be replaced with svg
                />
            </Flex>
            <Flex row align="center" style={style.copyInviteLinkContainer}>
                <Text
                    style={style.inviteLinkText}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.4}>
                    {copyValue}
                </Text>
                <TouchableOpacity
                    style={style.copyButtonContainer}
                    onPress={copyToClipboard}>
                    <SvgImage
                        name="Copy"
                        color={theme.colors.primary}
                        size={SvgImageSize.xs}
                    />
                    <Text
                        style={style.copyText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={1.4}>
                        {t('words.copy')}
                    </Text>
                </TouchableOpacity>
            </Flex>
        </Flex>
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
