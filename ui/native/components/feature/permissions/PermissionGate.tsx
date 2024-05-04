import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

import HoloGradient from '../../ui/HoloGradient'
import SvgImage, { SvgImageName, SvgImageSize } from '../../ui/SvgImage'

interface Props {
    icon: SvgImageName
    title: React.ReactNode
    descriptionIcons: SvgImageName[]
    descriptionText: React.ReactNode
    onContinue: () => void
    alternativeActionButton?: React.ReactNode
}

export const PermissionGate: React.FC<Props> = ({
    icon,
    title,
    descriptionIcons,
    descriptionText,
    onContinue,
    alternativeActionButton,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()

    const style = styles(theme, insets)

    return (
        <View style={style.container}>
            <View style={style.content}>
                <HoloGradient level="400" gradientStyle={style.iconGradient}>
                    <SvgImage name={icon} size={SvgImageSize.md} />
                </HoloGradient>
                <Text h2 medium style={style.title}>
                    {title}:
                </Text>
                <HoloGradient
                    level="100"
                    style={style.descriptionContainer}
                    gradientStyle={style.descriptionGradient}>
                    <View style={style.descriptionIcons}>
                        {descriptionIcons.map(name => (
                            <SvgImage
                                key={name}
                                name={name}
                                size={SvgImageSize.sm}
                            />
                        ))}
                    </View>
                    <Text medium style={style.descriptionText}>
                        {descriptionText}
                    </Text>
                </HoloGradient>
                <Text caption style={style.disclaimer}>
                    {t('feature.permissions.update-later-disclaimer')}
                </Text>
            </View>
            <View style={style.actions}>
                {alternativeActionButton}
                <Button
                    fullWidth
                    title={t('words.continue')}
                    onPress={() => onContinue()}
                />
            </View>
        </View>
    )
}

const styles = (theme: Theme, insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
            paddingLeft: insets.left + theme.spacing.lg,
            paddingRight: insets.right + theme.spacing.lg,
            paddingBottom: Math.max(theme.spacing.lg, insets.bottom),
        },
        content: {
            flex: 1,
            gap: theme.spacing.lg,
            justifyContent: 'center',
            alignItems: 'center',
        },
        iconGradient: {
            width: 72,
            height: 72,
            borderRadius: 72 / 2,
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
        },
        title: {
            textAlign: 'center',
        },
        descriptionContainer: {
            width: '100%',
        },
        descriptionGradient: {
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.borders.defaultRadius,
        },
        descriptionIcons: {
            flexDirection: 'row',
            gap: theme.spacing.sm,
            justifyContent: 'center',
            alignItems: 'center',
        },
        descriptionText: {
            textAlign: 'center',
            maxWidth: 280,
        },
        disclaimer: {
            textAlign: 'center',
            color: theme.colors.darkGrey,
        },
        actions: {
            flexShrink: 0,
            gap: 8,
        },
    })
