import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import { PressableIcon } from '../../ui/PressableIcon'
import HeaderAvatar from '../chat/HeaderAvatar'

const ModsHeader: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const navigation = useNavigation<NavigationHook>()

    const style = styles(theme)

    const handleAddPress = () => {
        navigation.navigate('AddFediMod')
    }

    const handleAvatarPress = () => {
        navigation.navigate('Settings')
    }

    return (
        <>
            <Header
                containerStyle={style.container}
                headerLeft={
                    <Text h2 medium numberOfLines={1} adjustsFontSizeToFit>
                        {t('words.mods')}
                    </Text>
                }
                headerRight={
                    <>
                        <PressableIcon
                            onPress={handleAddPress}
                            hitSlop={5}
                            svgName="Plus"
                        />
                        <HeaderAvatar onPress={handleAvatarPress} />
                    </>
                }
                rightContainerStyle={style.rightContainer}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingBottom: theme.spacing.md,
        },
        rightContainer: {
            gap: theme.spacing.lg,
        },
    })

export default ModsHeader
