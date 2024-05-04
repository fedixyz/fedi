import { useNavigation } from '@react-navigation/native'
import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import SvgImage from '../../ui/SvgImage'

const FederationInviteHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    return (
        <Header
            dark
            headerCenter={
                <Text
                    bold
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ color: theme.colors.secondary }}>
                    {t('feature.federations.federation-invite')}
                </Text>
            }
            headerRight={
                <Pressable
                    onPress={() =>
                        navigation.canGoBack()
                            ? navigation.goBack()
                            : navigation.navigate('TabsNavigator')
                    }
                    hitSlop={5}
                    style={{
                        padding: theme.spacing.sm,
                    }}>
                    <SvgImage name="Close" color={theme.colors.secondary} />
                </Pressable>
            }
        />
    )
}

export default FederationInviteHeader
