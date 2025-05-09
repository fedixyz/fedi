import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import HoloGradient from '../../ui/HoloGradient'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

const FederationSelectorPlaceholder: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation()
    const style = styles(theme)
    return (
        <HoloGradient
            level="900"
            style={style.gradientContainer}
            gradientStyle={style.gradient}>
            <Pressable
                style={style.container}
                onPress={() => navigation.navigate('PublicFederations')}>
                <SvgImage size={SvgImageSize.sm} name="FederationPlaceholder" />
                <Text
                    bold
                    caption
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={style.federationName}>
                    {t('feature.federation.join-a-federation')}
                </Text>
            </Pressable>
        </HoloGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        gradientContainer: {
            borderRadius: 50,
            ...theme.styles.subtleShadow,
        },
        gradient: {
            padding: theme.spacing.xxs,
            borderRadius: 50,
            alignSelf: 'center',
        },
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.sm,
            borderRadius: 50,
            backgroundColor: theme.colors.white,
        },
        federationName: {
            flexGrow: 1,
            maxWidth: '85%',
            fontWeight: 600,
            fontSize: 14,
        },
    })

export default FederationSelectorPlaceholder
