import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'

const SettingsHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const style = styles(theme)

    return (
        <>
            <Header
                containerStyle={style.container}
                closeButton
                headerLeft={
                    <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
                        {t('words.account')}
                    </Text>
                }
                onClose={() =>
                    navigation.canGoBack()
                        ? navigation.goBack()
                        : navigation.navigate('TabsNavigator')
                }
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingBottom: theme.spacing.lg,
        },
    })

export default SettingsHeader
