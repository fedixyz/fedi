import Clipboard from '@react-native-clipboard/clipboard'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import { useToast } from '@fedi/common/hooks/toast'

import { Images } from '../../assets/images'
import SvgImage, { SvgImageSize } from './SvgImage'

interface Props {
    /** Value to render the QR code with */
    qrValue: string
    /** Message to show when the copy button is pressed */
    copyMessage: string
    /** Optional different value when copied, defaults to using qrValue */
    copyValue?: string
    /** H2 title at the top of screen */
    title?: string
    /** Caption text below title */
    subtitle?: string
    /** Content to display at the bottom, typically help text or an action */
    bottom?: React.ReactNode
    /** Use dark theme for screen */
    dark?: boolean
}

const QRScreen: React.FC<Props> = ({
    title,
    subtitle,
    qrValue,
    copyValue = qrValue,
    copyMessage,
    bottom,
    dark,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const { width } = useWindowDimensions()

    const copyToClipboard = () => {
        Clipboard.setString(copyValue)
        toast.show({ content: copyMessage, status: 'success' })
    }

    const style = styles(theme, width, dark)
    return (
        <ScrollView
            style={style.scrollContainer}
            contentContainerStyle={style.contentContainer}>
            <View style={style.topContainer}>
                {title && (
                    <Text
                        h2
                        medium
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={style.title}>
                        {title}
                    </Text>
                )}
                {subtitle && (
                    <Text caption style={style.subtitle}>
                        {subtitle}
                    </Text>
                )}
            </View>
            <View style={style.centerContainer}>
                <View style={style.qrCodeContainer}>
                    <QRCode
                        value={qrValue}
                        size={width * 0.7}
                        logo={Images.FediQrLogo} //Should not be replaced with svg
                    />
                </View>
                <View style={style.copyInviteLinkContainer}>
                    <Text style={style.inviteLinkText} numberOfLines={1}>
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
                        <Text style={style.copyText} numberOfLines={1}>
                            {t('words.copy')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
            <View style={style.bottomContainer}>{bottom}</View>
        </ScrollView>
    )
}

const styles = (theme: Theme, width: number, dark?: boolean) =>
    StyleSheet.create({
        scrollContainer: {
            flex: 1,
        },
        contentContainer: {
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.xl,
            gap: theme.spacing.lg,
            backgroundColor: dark ? theme.colors.primary : undefined,
        },
        topContainer: {
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: theme.spacing.sm,
        },
        title: {
            textAlign: 'center',
        },
        subtitle: {
            textAlign: 'center',
            color: theme.colors.grey,
        },
        centerContainer: {
            gap: theme.spacing.lg,
        },
        qrCodeContainer: {
            backgroundColor: dark ? theme.colors.background : undefined,
            borderRadius: theme.borders.defaultRadius,
            borderColor: theme.colors.primaryLight,
            borderWidth: dark ? 0 : 1,
            padding: theme.spacing.md,
            flexDirection: 'row',
            justifyContent: 'center',
        },
        copyInviteLinkContainer: {
            flexDirection: 'row',
            alignItems: 'center',
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
        bottomContainer: {
            width: '100%',
        },
    })

export default QRScreen
