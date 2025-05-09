import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import React from 'react'
import { StyleSheet, View, Pressable } from 'react-native'

import SvgImage, { SvgImageSize } from '../../../components/ui/SvgImage'

const CommunityChatsPlaceholder: React.FC = () => {
    const { theme } = useTheme()
    const stylesPlaceholder = styles(theme)
    const navigation = useNavigation()

    return (
        <View style={stylesPlaceholder.container}>
            <Text style={stylesPlaceholder.sectionTitle}>
                {t('feature.home.federation-news-title')}
            </Text>
            <Pressable
                style={stylesPlaceholder.tile}
                onPress={() => navigation.navigate('PublicFederations')}>
                <View style={stylesPlaceholder.iconContainer}>
                    <View style={stylesPlaceholder.bubbleContainer}>
                        <SvgImage name="Chat" size={SvgImageSize.md} />
                    </View>
                </View>
                <View style={stylesPlaceholder.textContainer}>
                    <Text style={stylesPlaceholder.text}>
                        {t('feature.home.federation-updates')}
                    </Text>
                </View>
                <SvgImage
                    name="ChevronRightSmall"
                    dimensions={{ width: 10, height: 18 }}
                    color={theme.colors.grey}
                    containerStyle={stylesPlaceholder.chevron}
                />
            </Pressable>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flex: 1,
            width: '100%',
        },
        sectionTitle: {
            color: theme.colors.night,
            letterSpacing: -0.16,
            fontSize: 20,
            marginBottom: 10,
        },
        tile: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.offWhite100,
            width: '100%',
            paddingVertical: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: 20,
            marginTop: theme.spacing.sm,
        },
        iconContainer: {
            marginRight: theme.spacing.sm,
        },
        bubbleContainer: {
            width: theme.sizes.lg,
            height: theme.sizes.lg,
            overflow: 'hidden',
            borderRadius: theme.borders.fediModTileRadius,
            backgroundColor: theme.colors.white,
            alignItems: 'center',
            justifyContent: 'center',
        },
        textContainer: {
            flex: 1,
            marginLeft: 4,
        },
        text: {
            color: theme.colors.night,
            fontSize: 16,
            letterSpacing: -0.16,
            lineHeight: 20,
        },
        chevron: {
            marginLeft: 'auto',
            marginRight: 10,
        },
    })

export default CommunityChatsPlaceholder
