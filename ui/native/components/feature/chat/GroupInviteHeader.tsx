import { useNavigation } from '@react-navigation/native'
import { Text, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import Header from '../../ui/Header'
import SvgImage from '../../ui/SvgImage'

const GroupInviteHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const navigation = useNavigation<NavigationHook>()

    return (
        <Header
            headerLeft={
                <Pressable
                    onPress={() => navigation.goBack()}
                    hitSlop={5}
                    style={{
                        padding: theme.spacing.sm,
                    }}>
                    <SvgImage name="ChevronLeft" />
                </Pressable>
            }
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.chat.group-invite')}
                </Text>
            }
        />
    )
}

export default GroupInviteHeader
