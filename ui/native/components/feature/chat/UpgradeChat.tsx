import { useNavigation } from '@react-navigation/native'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { NavigationHook } from '../../../types/navigation'
import FloatingEmoji from '../../ui/FloatingEmoji'
import HoloGradient from '../../ui/HoloGradient'

type UpgradeItem = {
    emoji: string
    title: string
    subtitle: string
}

const UpgradeChat: React.FC = () => {
    const navigation = useNavigation<NavigationHook>()
    const { t } = useTranslation()
    const { theme } = useTheme()
    const upgradeItems: UpgradeItem[] = [
        {
            emoji: '🔆',
            title: t('feature.chat.upgrade-chat-item-title-1'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-1'),
        },
        {
            emoji: '👤',
            title: t('feature.chat.upgrade-chat-item-title-2'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-2'),
        },
        {
            emoji: '🔒',
            title: t('feature.chat.upgrade-chat-item-title-3'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-3'),
        },
        {
            emoji: '💸',
            title: t('feature.chat.upgrade-chat-item-title-4'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-4'),
        },
        {
            emoji: '🎉',
            title: t('feature.chat.upgrade-chat-item-title-5'),
            subtitle: t('feature.chat.upgrade-chat-item-subtitle-5'),
        },
    ]

    const style = styles(theme)

    const renderItem = (item: UpgradeItem, index: number) => (
        <View style={style.contentItem} key={`ui-${index}`}>
            <FloatingEmoji emoji={item.emoji} size={20} />
            <View style={style.itemTextContainer}>
                <Text medium style={style.itemTitle}>
                    {item.title}
                </Text>
                <Text small style={style.itemSubtitle}>
                    {item.subtitle}
                </Text>
            </View>
        </View>
    )

    return (
        <HoloGradient
            style={style.container}
            gradientStyle={style.gradient}
            level="100">
            <View style={style.titleContainer}>
                <FloatingEmoji emoji="🌎" size={32} />
                <Text h2 medium h2Style={style.titleText}>
                    {t('feature.chat.upgrade-chat')}
                </Text>
                <Text medium style={style.titleText}>
                    {t('feature.chat.upgrade-chat-guidance')}
                </Text>
            </View>
            <View style={style.contentContainer}>
                {upgradeItems.map(renderItem)}
            </View>
            <Button
                fullWidth
                title={t('words.continue')}
                onPress={() => navigation.navigate('EnterDisplayName')}
            />
        </HoloGradient>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 20,
        },
        gradient: {
            padding: theme.spacing.xl,
            borderRadius: 20,
            alignItems: 'center',
            gap: 24,
        },
        titleContainer: {
            flex: 1,
            alignItems: 'center',
            gap: 8,
        },
        contentContainer: {
            alignItems: 'flex-start',
            gap: 16,
        },
        titleText: {
            textAlign: 'center',
        },
        contentItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
        },
        itemTextContainer: {
            alignItems: 'flex-start',
            gap: 2,
        },
        itemTitle: {},
        itemSubtitle: {},
    })

export default UpgradeChat
